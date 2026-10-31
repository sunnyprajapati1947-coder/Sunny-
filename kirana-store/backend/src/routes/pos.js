import { Router } from 'express';
import { db, getSettings, nextCounter } from '../db/index.js';
import { auth, logActivity, asyncH } from '../middleware/auth.js';
import { computeBill, validatePayments } from '../services/billing.js';

const router = Router();
router.use(auth);

// Fast barcode lookup (mall-style instant price on scan)
router.get('/lookup', asyncH(async (req, res) => {
  const code = String(req.query.barcode || '').trim();
  if (!code) return res.status(400).json({ error: 'barcode required' });
  const candidates = [code, '0' + code];
  let product = null;
  for (const c of candidates) { product = await db.products.findOne({ barcode: c, isActive: true }); if (product) break; }
  if (!product) return res.status(404).json({ error: 'NOT_FOUND', barcode: code });
  const offers = await db.offers.find({ isActive: true });
  const priced = computeBill({ lines: [{ productId: product._id, qty: 1, product }], offers, settings: await getSettings() });
  res.json({ product, price: priced.items[0].price, activeOffer: priced.items[0].offerIds?.length ? true : false });
}));

router.get('/bills', asyncH(async (req, res) => {
  const { status, from, to, customerId, storeId, limit = 100 } = req.query;
  const filter = {};
  if (status) filter.status = status; else filter.status = { $ne: 'held' };
  if (customerId) filter.customerId = customerId;
  if (storeId) filter.storeId = storeId;
  if (from || to) filter.billDate = { ...(from && { $gte: new Date(from).toISOString() }), ...(to && { $lte: new Date(to).getTime() ? new Date(Number(to) + 86399000).toISOString() : new Date(to).toISOString() }) };
  const bills = await db.bills.find(filter, { sort: { createdAt: -1 }, limit: Number(limit) });
  res.json(bills);
}));

router.get('/bills/held', asyncH(async (req, res) => {
  res.json(await db.bills.find({ status: 'held' }, { sort: { createdAt: -1 } }));
}));

router.post('/bills/hold', asyncH(async (req, res) => {
  const { items, customerId, customerName, note } = req.body || {};
  if (!items?.length) return res.status(400).json({ error: 'Empty bill' });
  const bill = await db.bills.create({
    status: 'held', storeId: req.user.storeId || 'main', items, customerId: customerId || null,
    customerName: customerName || '', note: note || '', cashier: req.user.id, cashierName: req.user.name,
    billDate: new Date().toISOString(), subtotal: 0, grandTotal: 0,
  });
  res.json(bill);
}));

router.delete('/bills/:id', asyncH(async (req, res) => {
  const b = await db.bills.findById(req.params.id);
  if (!b) return res.status(404).json({ error: 'Bill not found' });
  if (b.status !== 'held' && req.user.role !== 'admin') return res.status(403).json({ error: 'Only held bills can be discarded by staff' });
  await db.bills.findByIdAndDelete(b._id);
  await logActivity(req, 'BILL_DELETE', `${b.billNumber || 'held bill'} discarded`);
  res.json({ ok: true });
}));

router.get('/bills/:id', asyncH(async (req, res) => {
  const b = await db.bills.findById(req.params.id);
  if (!b) return res.status(404).json({ error: 'Bill not found' });
  res.json(b);
}));

// FINALIZE SALE: server recomputes all totals (client can never set prices)
router.post('/bills', asyncH(async (req, res) => {
  const body = req.body || {};
  const lines = Array.isArray(body.items) ? body.items : [];
  if (!lines.length) return res.status(400).json({ error: 'Empty bill / खाली बिल' });
  const settings = await getSettings();
  const products = [];
  for (const l of lines) {
    const p = await db.products.findById(l.productId);
    if (!p) return res.status(400).json({ error: 'Product missing: ' + l.productId });
    if (Number(p.quantity) < Number(l.qty) && !body.allowNegativeStock) {
      return res.status(409).json({ error: `Insufficient stock: ${p.name} (available ${p.quantity} ${p.unit})` });
    }
    products.push({ ...l, product: p });
  }
  let customer = null;
  if (body.customerId) customer = await db.customers.findById(body.customerId);
  const offers = await db.offers.find({ isActive: true });
  const calc = computeBill({ lines: products, offers, couponCode: body.couponCode, billDiscountPct: body.billDiscountPct, billDiscountFlat: body.billDiscountFlat, customer, settings });
  const pay = validatePayments(body.payments, calc.grandTotal);
  if (pay.creditAmount > 0 && !customer) return res.status(400).json({ error: 'Credit/udhar bill needs a customer / उधार के लिए कस्टमर चुनें' });

  const seq = await nextCounter('billCounter');
  const billNumber = `INV-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(seq).padStart(5, '0')}`;
  const shift = await db.shifts.findOne({ userId: req.user.id, status: 'open' }, { sort: { openedAt: -1 } });

  const bill = await db.bills.create({
    billNumber, storeId: req.user.storeId || 'main', billDate: new Date().toISOString(), status: 'completed',
    customerId: customer?._id || null, customerName: customer?.name || body.customerName || '', customerPhone: customer?.phone || '',
    items: calc.items, subtotal: calc.subtotal, itemDiscount: calc.itemDiscount,
    billDiscountPct: calc.billDiscountPct, billDiscountValue: calc.billDiscountValue,
    couponCode: calc.couponCode, couponValue: calc.couponValue, totalDiscount: calc.totalDiscount,
    totalTax: calc.totalTax, grandTotal: calc.grandTotal, roundOff: calc.roundOff,
    payments: pay.payments, amountPaid: pay.amountPaid, changeReturned: pay.changeReturned, creditAmount: pay.creditAmount,
    loyaltyEarned: customer ? Math.floor(calc.grandTotal * Number(settings.loyaltyPerRupee || 0.02)) : 0,
    cashier: req.user.id, cashierName: req.user.name, shiftId: shift?._id || null, note: body.note || '', type: 'sale',
  });
  if (body.heldBillId) await db.bills.findByIdAndDelete(body.heldBillId);

  // stock down + movement log + coupon usage
  for (const item of bill.items) {
    const p = products.find((x) => x.product._id === item.productId)?.product;
    if (!p) continue;
    const newQty = Math.max(0, Math.round((Number(p.quantity) - item.qty) * 1000) / 1000);
    await db.products.updateById(p._id, { quantity: newQty });
    await db.stockMoves.create({ productId: p._id, productName: p.name, type: 'sale', qty: item.qty, reason: billNumber, by: req.user.name, storeId: bill.storeId, balance: newQty, ref: bill._id });
    if (newQty <= Number(p.minStockLevel || 0)) {
      await db.notifications.create({ storeId: bill.storeId, type: 'lowstock', title: 'Low Stock / स्टॉक कम', message: `${p.name} — ${newQty} ${p.unit} left`, severity: 'warn', meta: { productId: p._id } });
    }
  }
  if (calc.couponId) await db.offers.updateById(calc.couponId, { $inc: { usedCount: 1 } });
  if (customer) {
    await db.customers.updateById(customer._id, {
      $inc: { totalPurchases: calc.grandTotal, billsCount: 1, loyaltyPoints: bill.loyaltyEarned, creditBalance: pay.creditAmount },
    });
  }
  if (shift) await db.shifts.updateById(shift._id, { $inc: { salesTotal: calc.grandTotal - pay.creditAmount, billCount: 1 } });

  const io = req.app.get('io');
  io?.emit('sale:new', { billNumber, grandTotal: bill.grandTotal });
  io?.emit('stock:update', { bill: billNumber });

  await logActivity(req, 'SALE', `${billNumber} ₹${bill.grandTotal}`);
  res.status(201).json(bill);
}));

// RETURN / REFUND against a bill reference
router.post('/bills/:id/return', asyncH(async (req, res) => {
  const original = await db.bills.findById(req.params.id);
  if (!original) return res.status(404).json({ error: 'Bill not found' });
  const returns = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!returns.length) return res.status(400).json({ error: 'Select items to return' });
  const settings = await getSettings();
  const items = [];
  let refund = 0;
  for (const r of returns) {
    const line = original.items.find((i) => i.productId === r.productId);
    if (!line) continue;
    const qty = Math.min(Number(r.qty || 0), line.qty - (line.returnedQty || 0));
    if (qty <= 0) continue;
    const lineRate = line.qty ? line.total / line.qty : 0;
    const value = Math.round(lineRate * qty * 100) / 100;
    items.push({ ...line, qty, total: value, freeQty: 0 });
    refund += value;
    await db.products.updateById(line.productId, { $inc: { quantity: qty } });
    await db.stockMoves.create({ productId: line.productId, productName: line.name, type: 'return', qty, reason: 'Return of ' + original.billNumber, by: req.user.name, storeId: original.storeId });
  }
  refund = Math.round(refund * 100) / 100;
  const seq = await nextCounter('billCounter');
  const retBill = await db.bills.create({
    billNumber: `RET-${String(seq).padStart(5, '0')}`, storeId: original.storeId, billDate: new Date().toISOString(),
    status: 'returned', type: 'return', refBillId: original._id, refBillNumber: original.billNumber,
    returnReason: req.body?.reason || '', refundMode: req.body?.refundMode || 'cash',
    customerId: original.customerId, customerName: original.customerName, items,
    subtotal: refund, grandTotal: refund, totalDiscount: 0, totalTax: 0, payments: [{ mode: req.body?.refundMode || 'cash', amount: refund }],
    cashier: req.user.id, cashierName: req.user.name,
  });
  if (original.customerId && original.creditAmount > 0) await db.customers.updateById(original.customerId, { $inc: { creditBalance: -refund } });
  await db.bills.updateById(original._id, { $push: { returnItems: { date: new Date().toISOString(), items: returns, refund } } });
  await logActivity(req, 'RETURN', `${retBill.billNumber} against ${original.billNumber} ₹${refund}`);
  req.app.get('io')?.emit('stock:update', { return: retBill.billNumber });
  res.status(201).json(retBill);
}));

export default router;
