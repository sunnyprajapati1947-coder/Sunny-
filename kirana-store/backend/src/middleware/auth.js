import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'rishu-kirana-dev-secret-change-me';

export function signToken(user, expiresIn = '10h') {
  return jwt.sign({ id: user._id, role: user.role, name: user.name, storeId: user.storeId }, JWT_SECRET, { expiresIn });
}
export function signPriceToken(user) {
  return jwt.sign({ id: user._id, scope: 'price' }, JWT_SECRET, { expiresIn: '10m' });
}

export async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await db.users.findById(payload.id);
    if (!user || user.isActive === false) return res.status(401).json({ error: 'User disabled' });
    req.user = { id: user._id, name: user.name, role: user.role, storeId: user.storeId, username: user.username };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'Access denied for your role' });

// Price edits are double-locked: admin role + short-lived price token (password re-entry in UI)
export function requirePriceToken(req, res, next) {
  const t = req.headers['x-price-token'];
  if (!t) return res.status(403).json({ error: 'Price lock: owner password confirmation required' });
  try {
    const p = jwt.verify(t, JWT_SECRET);
    if (p.scope !== 'price') throw new Error();
    next();
  } catch {
    return res.status(403).json({ error: 'Price lock expired: confirm password again' });
  }
}

export async function logActivity(req, action, details = '') {
  try {
    await db.activity.create({
      userId: req.user?.id || 'system', userName: req.user?.name || 'System', role: req.user?.role || '-',
      action, details, storeId: req.user?.storeId || '', ip: req.ip,
    });
  } catch { /* never block requests on logging */ }
}

export const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
