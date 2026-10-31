import { Router } from 'express';
import { db } from '../db/index.js';
import { auth, requireRole, logActivity, asyncH } from '../middleware/auth.js';

const router = Router();
router.use(auth);
const esc = (s) => String(s || '').trim();

router.get('/', asyncH(async (req, res) => {
  const { search, credit, storeId } = req.query;
  const filter = {};
  if (storeId) filter.storeId = storeId;
  if (credit === 'true') filter.creditBalance = { $gt: 0 };
  if (search) {
    const rx = { $regex: esc(search), $options: 'i' };
    filter.$or = [{ name: rx }, { phone: rx }, { email: rx }];
  }
  res.json(await db.customers.find(filter, { sort: { name: 1 }, limit: 500 }));
}));

router.get('/:id', asyncH(async (req, res) => {
  const c = await db.customers.findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Customer not found' });
  const bills = await db.bills.find({ customerId: c._id, status: 'completed' }, { sort: { createdAt: -1 }, limit: 100 });
  const payments = await db.creditPayments.find({ customerId: c._id }, { sort: { createdAt: -1 }, limit: 100 });
  res.json({ ...c, bills, payments });
}));

router.post('/', asyncH(async (req, res) => {
  const b = req.body || {};
  if (!esc(b.name)) return res.status(400).json({ error: 'Name required' });
  if (!/^\d{10}$/.test(esc(b.phone))) return res.status(400).json({ error: 'Valid 10-digit phone required / सही 10 अंक मोबाइल नंबर' });
  const dup = await db.customers.findOne({ phone: esc(b.phone) });
  if (dup) return res.status(409).json({ error: 'Customer with this phone already exists', existing: dup });
  const c = await db.customers.create({
    storeId: req.user.storeId || 'main', name: esc(b.name), phone: esc(b.phone), email: esc(b.email),
    address: esc(b.address), tag: b.tag === 'vip' ? 'vip' : 'regular', discountPct: Number(b.discountPct || 0),
    totalPurchases: 0, billsCount: 0, creditBalance: 0, loyaltyPoints: 0, isActive: true,
  });
  await logActivity(req, 'CUSTOMER_ADD', c.name);
  res.status(201).json(c);
}));

router.put('/:id', requireRole('admin', 'manager'), asyncH(async (req, res) => {
  const b = req.body || {};
  const patch = {};
  for (const k of ['name', 'phone', 'email', 'address']) if (b[k] !== undefined) patch[k] = esc(b[k]);
  if (b.tag !== undefined) patch.tag = b.tag === 'vip' ? 'vip' : 'regular';
  if (b.discountPct !== undefined) patch.discountPct = Math.min(Number(b.discountPct || 0), 50);
  if (b.isActive !== undefined) patch.isActive = !!b.isActive;
  const c = await db.customers.updateById(req.params.id, patch);
  if (!c) return res.status(404).json({ error: 'Customer not found' });
  await logActivity(req, 'CUSTOMER_EDIT', c.name);
  res.json(c);
}));

router.delete('/:id', requireRole('admin'), asyncH(async (req, res) => {
  const c = await db.customers.findByIdAndDelete(req.params.id);
  if (!c) return res.status(404).json({ error: 'Customer not found' });
  res.json({ ok: true });
}));

// ---- Credit / Udhar ----
router.get('/:id/credit', asyncH(async (req, res) => {
  const c = await db.customers.findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Customer not found' });
  const creditBills = await db.bills.find({ customerId: c._id, creditAmount: { $gt: 0 } }, { sort: { createdAt: -1 } });
  const payments = await db.creditPayments.find({ customerId: c._id }, { sort: { createdAt: -1 } });
  res.json({ customer: c, creditBills, payments });
}));

router.post('/:id/credit/payment', asyncH(async (req, res) => {
  const c = await db.customers.findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Customer not found' });
  const amount = Math.abs(Number(req.body?.amount || 0));
  if (!amount) return res.status(400).json({ error: 'Amount required' });
  const applied = Math.min(amount, Number(c.creditBalance || 0));
  await db.customers.updateById(c._id, { $inc: { creditBalance: -applied } });
  const rec = await db.creditPayments.create({
    customerId: c._id, customerName: c.name, amount: applied, mode: req.body?.mode || 'cash',
    note: req.body?.note || '', by: req.user.name, storeId: c.storeId,
  });
  await logActivity(req, 'CREDIT_PAYMENT', `${c.name} paid ₹${applied}`);
  req.app.get('io')?.emit('credit:update', { customerId: c._id });
  res.json({ payment: rec, balance: Math.round((Number(c.creditBalance) - applied) * 100) / 100 });
}));

router.get('/report/credit', asyncH(async (req, res) => {
  const list = await db.customers.find({ creditBalance: { $gt: 0 } }, { sort: { creditBalance: -1 } });
  res.json(list);
}));

export default router;
