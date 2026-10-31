import { Router } from 'express';
import { db, nextCounter } from '../db/index.js';
import { auth, requireRole, logActivity, asyncH } from '../middleware/auth.js';

const router = Router();
router.use(auth);
const esc = (s) => String(s || '').trim();

// ---- Suppliers ----
router.get('/', asyncH(async (req, res) => {
  res.json(await db.suppliers.find({}, { sort: { name: 1 } }));
}));
router.post('/', requireRole('admin', 'manager'), asyncH(async (req, res) => {
  const b = req.body || {};
  if (!esc(b.name)) return res.status(400).json({ error: 'Supplier name required' });
  const s = await db.suppliers.create({
    storeId: req.user.storeId || 'main', name: esc(b.name), company: esc(b.company), phone: esc(b.phone),
    email: esc(b.email), address: esc(b.address), gstNumber: esc(b.gstNumber), balanceDue: 0,
  });
  await logActivity(req, 'SUPPLIER_ADD', s.name);
  res.status(201).json(s);
}));
router.put('/:id', requireRole('admin', 'manager'), asyncH(async (req, res) => {
  const b = req.body || {};
  const patch = {};
  for (const k of ['name', 'company', 'phone', 'email', 'address', 'gstNumber']) if (b[k] !== undefined) patch[k] = esc(b[k]);
  const s = await db.suppliers.updateById(req.params.id, patch);
  if (!s) return res.status(404).json({ error: 'Supplier not found' });
  res.json(s);
}));
router.delete('/:id', requireRole('admin'), asyncH(async (req, res) => {
  await db.suppliers.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

// ---- Purchase orders ----
router.get('/purchases/list', asyncH(async (req, res) => {
  res.json(await db.purchases.find(req.query.supplierId ? { supplierId: req.query.supplierId } : {}, { sort: { createdAt: -1 }, limit: 200 }));
}));
router.post('/purchases', requireRole('admin', 'manager'), asyncH(async (req, res) => {
  const b = req.body || {};
  const supplier = await db.suppliers.findById(b.supplierId);
  if (!supplier) return res.status(400).json({ error: 'Supplier required' });
  const items = (b.items || []).map((i) => ({ productId: i.productId || null, name: i.name, qty: Number(i.qty || 0), price: Number(i.price || 0), total: Math.round(Number(i.qty || 0) * Number(i.price || 0) * 100) / 100 }));
  const total = Math.round(items.reduce((s, i) => s + i.total, 0) * 100) / 100;
  const paid = Math.round(Number(b.paid || 0) * 100) / 100;
  const seq = await nextCounter('poCounter');
  const po = await db.purchases.create({
    storeId: req.user.storeId || 'main', poNumber: `PO-${String(seq).padStart(5, '0')}`, supplierId: supplier._id,
    supplierName: supplier.name, items, total, paid, balance: Math.round((total - paid) * 100) / 100,
    status: 'pending', expectedDate: b.expectedDate || '', by: req.user.name,
    payments: paid ? [{ amount: paid, mode: b.paymentMode || 'cash', date: new Date().toISOString(), note: 'Advance' }] : [],
  });
  if (po.balance > 0) await db.suppliers.updateById(supplier._id, { $inc: { balanceDue: po.balance } });
  await logActivity(req, 'PO_CREATE', `${po.poNumber} ${supplier.name} ₹${total}`);
  res.status(201).json(po);
}));
router.put('/purchases/:id/receive', requireRole('admin', 'manager'), asyncH(async (req, res) => {
  const po = await db.purchases.findById(req.params.id);
  if (!po) return res.status(404).json({ error: 'PO not found' });
  if (po.status === 'received') return res.status(400).json({ error: 'Already received' });
  for (const item of po.items) {
    if (item.productId) {
      const p = await db.products.findById(item.productId);
      if (p) {
        const qty = Math.round((Number(p.quantity || 0) + Number(item.qty || 0)) * 1000) / 1000;
        await db.products.updateById(p._id, { quantity: qty, ...(item.price ? { purchasePrice: item.price } : {}) });
        await db.stockMoves.create({ productId: p._id, productName: p.name, type: 'purchase', qty: item.qty, reason: po.poNumber, by: req.user.name, storeId: po.storeId, balance: qty });
      }
    }
  }
  const updated = await db.purchases.updateById(po._id, { status: 'received', receivedDate: new Date().toISOString() });
  req.app.get('io')?.emit('stock:update', { po: po.poNumber });
  await logActivity(req, 'PO_RECEIVE', po.poNumber);
  res.json(updated);
}));
router.put('/purchases/:id/pay', requireRole('admin', 'manager'), asyncH(async (req, res) => {
  const po = await db.purchases.findById(req.params.id);
  if (!po) return res.status(404).json({ error: 'PO not found' });
  const amount = Math.abs(Number(req.body?.amount || 0));
  if (!amount) return res.status(400).json({ error: 'Amount required' });
  const applied = Math.min(amount, po.balance);
  const updated = await db.purchases.updateById(po._id, {
    $inc: { paid: applied, balance: -applied },
    $push: { payments: { amount: applied, mode: req.body?.mode || 'cash', date: new Date().toISOString(), note: req.body?.note || '' } },
  });
  await db.suppliers.updateById(po.supplierId, { $inc: { balanceDue: -applied } });
  await logActivity(req, 'SUPPLIER_PAYMENT', `${po.supplierName} ₹${applied}`);
  res.json(updated);
}));

export default router;
