import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { db } from '../db/index.js';
import { auth, requireRole, signToken, signPriceToken, logActivity, asyncH } from '../middleware/auth.js';

const router = Router();
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false });

const publicUser = (u) => ({ id: u._id, name: u.name, username: u.username, role: u.role, phone: u.phone, storeId: u.storeId, mustChangePassword: !!u.mustChangePassword });

router.post('/login', loginLimit, asyncH(async (req, res) => {
  const { username, password } = req.body || {};
  const user = await db.users.findOne({ username: String(username || '').toLowerCase().trim() });
  if (!user || user.isActive === false || !bcrypt.compareSync(String(password || ''), user.password)) {
    return res.status(401).json({ error: 'Invalid username or password / गलत यूज़रनेम या पासवर्ड' });
  }
  await db.users.updateById(user._id, { lastLogin: new Date().toISOString() });
  await logActivity({ ...req, user: { id: user._id, name: user.name, role: user.role, storeId: user.storeId } }, 'LOGIN', `User ${user.username} logged in`);
  res.json({ token: signToken(user), user: publicUser(user) });
}));

router.post('/pin', loginLimit, asyncH(async (req, res) => {
  const { pin } = req.body || {};
  if (!pin) return res.status(400).json({ error: 'PIN required' });
  const users = await db.users.find({ isActive: true });
  const user = users.find((u) => u.pin && bcrypt.compareSync(String(pin), u.pin));
  if (!user) return res.status(401).json({ error: 'Wrong PIN / गलत PIN' });
  await logActivity({ ...req, user: { id: user._id, name: user.name, role: user.role, storeId: user.storeId } }, 'LOGIN', `PIN quick login (${user.username})`);
  res.json({ token: signToken(user), user: publicUser(user) });
}));

// Owner password re-confirmation -> short-lived price-edit token
router.post('/verify', auth, requireRole('admin'), asyncH(async (req, res) => {
  const user = await db.users.findById(req.user.id);
  if (!bcrypt.compareSync(String(req.body?.password || ''), user.password)) {
    return res.status(403).json({ error: 'Wrong password / गलत पासवर्ड' });
  }
  res.json({ priceToken: signPriceToken(user) });
}));

router.get('/me', auth, asyncH(async (req, res) => {
  const user = await db.users.findById(req.user.id);
  res.json({ user: publicUser(user) });
}));

router.post('/change-password', auth, asyncH(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = await db.users.findById(req.user.id);
  if (!bcrypt.compareSync(String(currentPassword || ''), user.password)) return res.status(400).json({ error: 'Current password wrong' });
  if (String(newPassword || '').length < 4) return res.status(400).json({ error: 'New password min 4 characters' });
  await db.users.updateById(user._id, { password: bcrypt.hashSync(String(newPassword), 10), mustChangePassword: false });
  await logActivity(req, 'PASSWORD_CHANGE', `${user.username} changed password`);
  res.json({ ok: true });
}));

export default router;
