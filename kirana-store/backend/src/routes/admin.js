import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { auth, requireRole, logActivity, asyncH } from '../middleware/auth.js';

const router = Router();
router.use(auth);

// ---- Users ----
router.get('/users', requireRole('admin'), asyncH(async (req, res) => {
  const users = await db.users.find({}, { sort: { createdAt: 1 } });
  res.json(users.map(({ password, pin, ...u }) => ({ ...u, hasPin: !!pin })));
}));
router.post('/users', requireRole('admin'), asyncH(async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.username || !b.password) return res.status(400).json({ error: 'Name, username, password required' });
  if (await db.users.findOne({ username: String(b.username).toLowerCase() })) return res.status(409).json({ error: 'Username taken' });
  const u = await db.users.create({
    name: b.name, username: String(b.username).toLowerCase().trim(), password: bcrypt.hashSync(String(b.password), 10),
    pin: b.pin ? bcrypt.hashSync(String(b.pin), 10) : null, role: ['admin', 'manager', 'cashier'].includes(b.role) ? b.role : 'cashier',
    phone: b.phone || '', email: b.email || '', storeId: b.storeId || req.user.storeId || 'main', isActive: true,
  });
  await logActivity(req, 'USER_ADD', `${u.username} (${u.role})`);
  res.status(201).json({ id: u._id, username: u.username, role: u.role });
}));
router.put('/users/:id', requireRole('admin'), asyncH(async (req, res) => {
  const b = req.body || {};
  const patch = {};
  for (const k of ['name', 'phone', 'email', 'storeId']) if (b[k] !== undefined) patch[k] = b[k];
  if (b.role && b.role !== 'admin' || (b.role === 'admin' && req.user.id === req.params.id)) patch.role = b.role;
  else if (b.role) patch.role = b.role;
  if (b.isActive !== undefined) patch.isActive = !!b.isActive;
  if (b.password) patch.password = bcrypt.hashSync(String(b.password), 10);
  if (b.pin !== undefined) patch.pin = b.pin ? bcrypt.hashSync(String(b.pin), 10) : null;
  const u = await db.users.updateById(req.params.id, patch);
  if (!u) return res.status(404).json({ error: 'User not found' });
  await logActivity(req, 'USER_EDIT', u.username);
  const { password, pin, ...safe } = u;
  res.json({ ...safe, hasPin: !!pin });
}));
router.delete('/users/:id', requireRole('admin'), asyncH(async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  await db.users.updateById(req.params.id, { isActive: false });
  res.json({ ok: true });
}));

// ---- Shifts ----
router.get('/shifts', asyncH(async (req, res) => {
  res.json(await db.shifts.find(req.user.role === 'admin' ? {} : { userId: req.user.id }, { sort: { openedAt: -1 }, limit: 100 }));
}));
router.get('/shifts/current', asyncH(async (req, res) => {
  const s = await db.shifts.findOne({ userId: req.user.id, status: 'open' }, { sort: { openedAt: -1 } });
  res.json(s);
}));
router.post('/shifts/open', asyncH(async (req, res) => {
  const open = await db.shifts.findOne({ userId: req.user.id, status: 'open' });
  if (open) return res.status(400).json({ error: 'Shift already open', shift: open });
  const s = await db.shifts.create({
    storeId: req.user.storeId || 'main', userId: req.user.id, userName: req.user.name,
    openingCash: Number(req.body?.openingCash || 0), openedAt: new Date().toISOString(), status: 'open', salesTotal: 0, billCount: 0,
  });
  await logActivity(req, 'SHIFT_OPEN', `Opening cash ₹${s.openingCash}`);
  res.status(201).json(s);
}));
router.post('/shifts/close', asyncH(async (req, res) => {
  const s = await db.shifts.findOne({ userId: req.user.id, status: 'open' }, { sort: { openedAt: -1 } });
  if (!s) return res.status(400).json({ error: 'No open shift' });
  const closingCash = Number(req.body?.closingCash || 0);
  const bills = await db.bills.find({ shiftId: s._id, status: 'completed' });
  const cashSales = bills.reduce((sum, b) => sum + (b.payments || []).filter((p) => p.mode === 'cash').reduce((x, p) => x + p.amount, 0), 0);
  const expected = Math.round((Number(s.openingCash) + cashSales) * 100) / 100;
  const closed = await db.shifts.updateById(s._id, {
    status: 'closed', closedAt: new Date().toISOString(), closingCash, expectedCash: expected,
    salesTotal: bills.reduce((x, b) => x + b.grandTotal, 0), billCount: bills.length, note: req.body?.note || '',
  });
  await logActivity(req, 'SHIFT_CLOSE', `Expected ₹${expected}, counted ₹${closingCash}`);
  res.json(closed);
}));

// ---- Activity log ----
router.get('/activity', requireRole('admin', 'manager'), asyncH(async (req, res) => {
  res.json(await db.activity.find({}, { sort: { createdAt: -1 }, limit: Number(req.query.limit || 300) }));
}));

export default router;
