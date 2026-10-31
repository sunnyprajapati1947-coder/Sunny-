import { Router } from 'express';
import { db, getSettings } from '../db/index.js';
import { auth, requireRole, logActivity, asyncH } from '../middleware/auth.js';
import { computeBill } from '../services/billing.js';

const router = Router();
router.use(auth);

router.get('/', asyncH(async (req, res) => res.json(await db.offers.find({}, { sort: { createdAt: -1 } }))));

router.post('/', requireRole('admin', 'manager'), asyncH(async (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.type) return res.status(400).json({ error: 'Title and type required' });
  const o = await db.offers.create({
    storeId: req.user.storeId || 'main', title: String(b.title), type: b.type,
    buyQty: Number(b.buyQty || 1), getQty: Number(b.getQty || 1), percent: Number(b.percent || 0), flat: Number(b.flat || 0),
    productIds: b.productIds || [], categories: b.categories || [], comboProductIds: b.comboProductIds || [],
    comboPrice: Number(b.comboPrice || 0), couponCode: (b.couponCode || '').toUpperCase() || null,
    minSubtotal: Number(b.minSubtotal || 0), maxUses: Number(b.maxUses || 0), usedCount: 0,
    startHour: b.startHour ?? null, endHour: b.endHour ?? null,
    validFrom: b.validFrom || null, validTo: b.validTo || null, isActive: b.isActive !== false,
  });
  await logActivity(req, 'OFFER_ADD', `${o.title} (${o.type})`);
  res.status(201).json(o);
}));

router.put('/:id', requireRole('admin', 'manager'), asyncH(async (req, res) => {
  const o = await db.offers.updateById(req.params.id, req.body || {});
  if (!o) return res.status(404).json({ error: 'Offer not found' });
  res.json(o);
}));
router.delete('/:id', requireRole('admin'), asyncH(async (req, res) => {
  await db.offers.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

// Coupon validation + bill preview (used by POS before checkout)
router.post('/preview', asyncH(async (req, res) => {
  const { lines, couponCode, billDiscountPct, billDiscountFlat, customerId } = req.body || {};
  const products = [];
  for (const l of lines || []) {
    const p = await db.products.findById(l.productId);
    if (p) products.push({ ...l, product: p });
  }
  const customer = customerId ? await db.customers.findById(customerId) : null;
  const offers = await db.offers.find({ isActive: true });
  const calc = computeBill({ lines: products, offers, couponCode, billDiscountPct, billDiscountFlat, customer, settings: await getSettings() });
  res.json(calc);
}));

export default router;
