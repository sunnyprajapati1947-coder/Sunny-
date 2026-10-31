import { Router } from 'express';
import nodemailer from 'nodemailer';
import { db, getSettings, nextCounter, COLLECTIONS } from '../db/index.js';
import { auth, requireRole, logActivity, asyncH } from '../middleware/auth.js';

const router = Router();

// ================= PUBLIC ONLINE SHOP =================
router.get('/shop/products', asyncH(async (req, res) => {
  const products = await db.products.find({ isActive: true, quantity: { $gt: 0 } }, { sort: { category: 1, name: 1 }, limit: 500 });
  res.json(products.map(({ purchasePrice, priceHistory, ...p }) => p));
}));
router.get('/shop/settings', asyncH(async (req, res) => {
  const s = await getSettings();
  res.json({ storeName: s.storeName, address: s.address, phone: s.phone, deliveryFee: s.deliveryFee, logo: s.logo });
}));
router.post('/shop/orders', asyncH(async (req, res) => {
  const b = req.body || {};
  if (!b.customerName || !/^\d{10}$/.test(String(b.phone || '')) || !b.address) return res.status(400).json({ error: 'Name, 10-digit phone and address required' });
  const items = [];
  for (const it of b.items || []) {
    const p = await db.products.findById(it.productId);
    if (!p || Number(p.quantity) < Number(it.qty)) continue;
    items.push({ productId: p._id, name: p.name, qty: Number(it.qty), price: p.sellingPrice, total: Math.round(p.sellingPrice * it.qty * 100) / 100 });
  }
  if (!items.length) return res.status(400).json({ error: 'No valid items' });
  const s = await getSettings();
  const subtotal = Math.round(items.reduce((x, i) => x + i.total, 0) * 100) / 100;
  const seq = await nextCounter('orderCounter');
  const order = await db.orders.create({
    orderNumber: `ORD-${String(seq).padStart(5, '0')}`, storeId: 'main', customerName: b.customerName,
    phone: b.phone, address: b.address, items, subtotal, deliveryFee: Number(s.deliveryFee || 0),
    grandTotal: Math.round((subtotal + Number(s.deliveryFee || 0)) * 100) / 100,
    paymentMode: b.paymentMode === 'online' ? 'online' : 'cod', status: 'placed', note: b.note || '',
  });
  req.app.get('io')?.emit('order:new', { orderNumber: order.orderNumber });
  res.status(201).json(order);
}));
router.get('/shop/orders/track', asyncH(async (req, res) => {
  const o = await db.orders.findOne({ orderNumber: String(req.query.orderNumber || '').toUpperCase(), phone: String(req.query.phone || '') });
  if (!o) return res.status(404).json({ error: 'Order not found' });
  res.json(o);
}));

// ================= ADMIN: ORDERS =================
router.get('/orders', auth, requireRole('admin', 'manager'), asyncH(async (req, res) => {
  res.json(await db.orders.find({}, { sort: { createdAt: -1 }, limit: 200 }));
}));
router.put('/orders/:id', auth, requireRole('admin', 'manager'), asyncH(async (req, res) => {
  const o = await db.orders.findById(req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  const { status } = req.body || {};
  if (status === 'confirmed' && o.status === 'placed') {
    for (const it of o.items) await db.products.updateById(it.productId, { $inc: { quantity: -it.qty } });
  }
  if (status === 'cancelled' && ['placed', 'confirmed'].includes(o.status) && o.status === 'confirmed') {
    for (const it of o.items) await db.products.updateById(it.productId, { $inc: { quantity: it.qty } });
  }
  const patch = { status };
  if (req.body?.paymentStatus) patch.paymentStatus = req.body.paymentStatus;
  const updated = await db.orders.updateById(o._id, patch);
  await logActivity(req, 'ORDER_UPDATE', `${o.orderNumber} -> ${status}`);
  res.json(updated);
}));

// ================= STORES / TRANSFERS =================
router.use(auth);
router.get('/stores', asyncH(async (req, res) => res.json(await db.stores.find({}, { sort: { createdAt: 1 } }))));
router.post('/stores', requireRole('admin'), asyncH(async (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Store name required' });
  res.status(201).json(await db.stores.create({ name: b.name, address: b.address || '', phone: b.phone || '', email: b.email || '', gstNumber: b.gstNumber || '', isActive: true }));
}));
router.put('/stores/:id', requireRole('admin'), asyncH(async (req, res) => res.json(await db.stores.updateById(req.params.id, req.body || {}))));
router.get('/transfers', requireRole('admin', 'manager'), asyncH(async (req, res) => res.json(await db.transfers.find({}, { sort: { createdAt: -1 }, limit: 100 }))));
router.post('/transfers', requireRole('admin', 'manager'), asyncH(async (req, res) => {
  const { fromStore, toStore, items } = req.body || {};
  if (!fromStore || !toStore || fromStore === toStore || !items?.length) return res.status(400).json({ error: 'Valid transfer details required' });
  for (const it of items) {
    const p = await db.products.findById(it.productId);
    if (!p || Number(p.quantity) < Number(it.qty)) return res.status(409).json({ error: `Insufficient stock for ${p?.name || it.productId}` });
  }
  for (const it of items) {
    await db.products.updateById(it.productId, { $inc: { quantity: -Number(it.qty) } });
    await db.stockMoves.create({ productId: it.productId, productName: it.name, type: 'transfer-out', qty: it.qty, reason: `${fromStore} -> ${toStore}`, by: req.user.name, storeId: fromStore });
  }
  const t = await db.transfers.create({ fromStore, toStore, items, by: req.user.name, note: req.body?.note || '' });
  await logActivity(req, 'STOCK_TRANSFER', `${items.length} items ${fromStore} -> ${toStore}`);
  res.status(201).json(t);
}));

// ================= NOTIFICATIONS =================
router.get('/notifications', asyncH(async (req, res) => {
  res.json(await db.notifications.find({}, { sort: { createdAt: -1 }, limit: 100 }));
}));
router.post('/notifications/:id/read', asyncH(async (req, res) => res.json(await db.notifications.updateById(req.params.id, { read: true }))));
router.post('/notifications/read-all', asyncH(async (req, res) => { await db.notifications.updateMany({}, { read: true }); res.json({ ok: true }); }));
router.post('/notifications/generate', requireRole('admin', 'manager'), asyncH(async (req, res) => {
  const created = [];
  const products = await db.products.find({ isActive: true }, { limit: 5000 });
  const today = new Date();
  for (const p of products) {
    if (Number(p.quantity) <= Number(p.minStockLevel || 0)) {
      created.push({ type: 'lowstock', title: 'Low Stock / स्टॉक कम', message: `${p.name} — only ${p.quantity} ${p.unit} left`, severity: 'warn', meta: { productId: p._id } });
    }
    if (p.expiryDate) {
      const days = Math.ceil((new Date(p.expiryDate) - today) / 864e5);
      if (days <= 30) created.push({ type: 'expiry', title: days < 0 ? 'Expired / एक्सपायर्ड' : `Expiry in ${days} days`, message: `${p.name} expires ${p.expiryDate} (${p.quantity} ${p.unit} in stock)`, severity: days < 0 ? 'error' : days <= 7 ? 'error' : 'warn', meta: { productId: p._id } });
    }
  }
  const credit = await db.customers.find({ creditBalance: { $gt: 0 } });
  for (const c of credit) created.push({ type: 'credit', title: 'Udhar pending / उधार बाकी', message: `${c.name} (${c.phone}) — ₹${c.creditBalance}`, severity: 'info', meta: { customerId: c._id } });
  // de-duplicate open ones of same message
  const open = await db.notifications.find({ read: false });
  const openMsgs = new Set(open.map((n) => n.message));
  let added = 0;
  for (const n of created) if (!openMsgs.has(n.message)) { await db.notifications.create({ storeId: req.user.storeId || 'main', read: false, ...n }); added++; }
  res.json({ generated: added });
}));

// ================= SETTINGS / BACKUP =================
router.get('/settings', asyncH(async (req, res) => res.json(await getSettings())));
router.put('/settings', requireRole('admin'), asyncH(async (req, res) => {
  const s = await getSettings();
  const allowed = ['storeName', 'address', 'phone', 'email', 'gstNumber', 'logo', 'receiptFooter', 'printerWidth', 'defaultGstRate', 'roundOffEnabled', 'loyaltyPerRupee', 'deliveryFee', 'whatsappNumber', 'sessionTimeoutMin', 'smtp'];
  const patch = {};
  for (const k of allowed) if (req.body?.[k] !== undefined) patch[k] = req.body[k];
  const updated = await db.settings.updateById(s._id, patch);
  await logActivity(req, 'SETTINGS_UPDATE', Object.keys(patch).join(', '));
  res.json(updated);
}));

router.get('/backup', requireRole('admin'), asyncH(async (req, res) => {
  const dump = {};
  for (const c of COLLECTIONS) dump[c] = await db[c].dump();
  res.setHeader('Content-Disposition', `attachment; filename=kirana-backup-${new Date().toISOString().slice(0, 10)}.json`);
  res.json(dump);
}));
router.post('/restore', requireRole('admin'), asyncH(async (req, res) => {
  const dump = req.body || {};
  for (const c of COLLECTIONS) if (Array.isArray(dump[c])) { await db[c].deleteMany({}); await db[c].load(dump[c]); }
  await logActivity(req, 'RESTORE', 'Database restored from backup');
  res.json({ ok: true });
}));

// Email (SMTP optional). Without SMTP config it returns the preview for wa.me / manual send.
router.post('/email', asyncH(async (req, res) => {
  const s = await getSettings();
  const { to, subject, body } = req.body || {};
  if (s.smtp?.host && s.smtp?.user) {
    const t = nodemailer.createTransport({ host: s.smtp.host, port: Number(s.smtp.port || 587), secure: Number(s.smtp.port) === 465, auth: { user: s.smtp.user, pass: s.smtp.pass } });
    await t.sendMail({ from: s.smtp.user, to, subject, text: body });
    return res.json({ sent: true });
  }
  res.json({ sent: false, preview: { to, subject, body } });
}));

export default router;
