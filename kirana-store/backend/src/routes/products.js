import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { db } from '../db/index.js';
import { auth, requireRole, requirePriceToken, logActivity, asyncH } from '../middleware/auth.js';
import { generateInternalBarcode, detectBarcodeType, isValidEAN13 } from '../services/barcode.js';

const router = Router();
router.use(auth);

const UPLOAD_DIR = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'uploads') : path.join(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ storage: multer.diskStorage({ destination: UPLOAD_DIR, filename: (req, f, cb) => cb(null, Date.now() + '-' + f.originalname.replace(/[^a-z0-9.]/gi, '_')) }), limits: { fileSize: 3 * 1024 * 1024 } });

const esc = (s) => String(s || '').trim();

async function uniqueBarcode(wanted, excludeId) {
  let code = esc(wanted);
  if (!code) {
    const count = await db.products.count({});
    code = generateInternalBarcode(count + 1 + Math.floor(Math.random() * 500));
    while (await db.products.findOne({ barcode: code })) code = generateInternalBarcode(Math.floor(Math.random() * 1e9));
    return { code, internal: true };
  }
  if (/^\d{12}$/.test(code)) code = '0' + code;
  const dup = await db.products.findOne({ barcode: code, _id: { $ne: excludeId || '' } });
  if (dup) throw Object.assign(new Error('Barcode already exists on: ' + dup.name), { status: 409 });
  return { code, internal: /^20\d{11}$/.test(code) };
}

router.get('/', asyncH(async (req, res) => {
  const { search, category, brand, lowStock, expiring, active, storeId, page = 1, limit = 200 } = req.query;
  const filter = {};
  if (storeId) filter.storeId = storeId;
  if (category) filter.category = category;
  if (brand) filter.brand = brand;
  if (active === 'true') filter.isActive = true;
  if (search) {
    const rx = { $regex: esc(search), $options: 'i' };
    filter.$or = [{ name: rx }, { nameHindi: rx }, { barcode: esc(search) }, { brand: rx }, { category: rx }];
  }
  if (lowStock === 'true') filter.quantity = { $lte: 0 }; // replaced below
  let items = await db.products.find(filter, { sort: { name: 1 }, limit: 2000 });
  if (lowStock === 'true') items = items.filter((p) => Number(p.quantity) <= Number(p.minStockLevel || 0));
  if (expiring === 'true') {
    const soon = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);
    items = items.filter((p) => p.expiryDate && p.expiryDate <= soon);
  }
  const total = items.length;
  const p = Math.max(1, Number(page));
  res.json({ items: items.slice((p - 1) * Number(limit), p * Number(limit)), total, page: p });
}));

router.get('/categories', asyncH(async (req, res) => {
  const cats = await db.products.distinct('category', req.query.storeId ? { storeId: req.query.storeId } : {});
  const brands = await db.products.distinct('brand', req.query.storeId ? { storeId: req.query.storeId } : {});
  res.json({ categories: cats.sort(), brands: brands.sort() });
}));

router.get('/export', asyncH(async (req, res) => {
  res.json(await db.products.find({}, { sort: { name: 1 } }));
}));

router.get('/:id', asyncH(async (req, res) => {
  const p = await db.products.findById(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  const history = await db.priceHistory.find({ productId: p._id }, { sort: { createdAt: -1 }, limit: 50 });
  res.json({ ...p, priceHistory: history });
}));

router.post('/', requireRole('admin', 'manager'), asyncH(async (req, res) => {
  const b = req.body || {};
  if (!esc(b.name)) return res.status(400).json({ error: 'Product name required' });
  if (Number(b.sellingPrice) > Number(b.mrp || Infinity)) return res.status(400).json({ error: 'Selling price must be ≤ MRP' });
  const { code, internal } = await uniqueBarcode(b.barcode);
  const product = await db.products.create({
    storeId: b.storeId || req.user.storeId || 'main', name: esc(b.name), nameHindi: esc(b.nameHindi),
    category: esc(b.category) || 'General', subCategory: esc(b.subCategory), brand: esc(b.brand),
    barcode: code, barcodeType: detectBarcodeType(code), internalBarcode: internal,
    mrp: Number(b.mrp || 0), sellingPrice: Number(b.sellingPrice || 0), purchasePrice: Number(b.purchasePrice || 0),
    offerPrice: b.offerPrice ? Number(b.offerPrice) : null, offerValidFrom: b.offerValidFrom || null, offerValidTo: b.offerValidTo || null,
    quantity: Number(b.quantity || 0), unit: b.unit || 'piece', minStockLevel: Number(b.minStockLevel || 5),
    hsnCode: esc(b.hsnCode), gstRate: Number(b.gstRate ?? 0), expiryDate: esc(b.expiryDate) || null,
    manufacturingDate: esc(b.manufacturingDate) || null, supplierId: b.supplierId || null, supplierName: esc(b.supplierName),
    rackLocation: esc(b.rackLocation), image: esc(b.image), isActive: b.isActive !== false, isWeighed: !!b.isWeighed,
  });
  await logActivity(req, 'PRODUCT_ADD', `${product.name} (${product.barcode})`);
  res.status(201).json(product);
}));

router.post('/bulk', requireRole('admin', 'manager'), asyncH(async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const created = []; const errors = [];
  for (let i = 0; i < rows.length; i++) {
    try {
      const b = rows[i];
      if (!esc(b.name)) { errors.push(`Row ${i + 1}: missing name`); continue; }
      const { code, internal } = await uniqueBarcode(b.barcode);
      created.push(await db.products.create({
        storeId: req.user.storeId || 'main', name: esc(b.name), nameHindi: esc(b.nameHindi),
        category: esc(b.category) || 'General', subCategory: esc(b.subCategory), brand: esc(b.brand),
        barcode: code, barcodeType: detectBarcodeType(code), internalBarcode: internal,
        mrp: Number(b.mrp || 0), sellingPrice: Number(b.sellingPrice || b.mrp || 0), purchasePrice: Number(b.purchasePrice || 0),
        quantity: Number(b.quantity || 0), unit: b.unit || 'piece', minStockLevel: Number(b.minStockLevel || 5),
        hsnCode: esc(b.hsnCode), gstRate: Number(b.gstRate ?? 0), expiryDate: esc(b.expiryDate) || null,
        supplierName: esc(b.supplierName), rackLocation: esc(b.rackLocation), isActive: true,
      }));
    } catch (e) { errors.push(`Row ${i + 1}: ${e.message}`); }
  }
  await logActivity(req, 'PRODUCT_BULK_IMPORT', `${created.length} products imported`);
  res.json({ created: created.length, errors });
}));

router.post('/image', requireRole('admin', 'manager'), upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

router.put('/:id', requireRole('admin', 'manager'), asyncH(async (req, res) => {
  const existing = await db.products.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  const b = req.body || {};
  const patch = {};
  for (const k of ['name', 'nameHindi', 'category', 'subCategory', 'brand', 'unit', 'hsnCode', 'rackLocation', 'supplierName', 'image', 'expiryDate', 'manufacturingDate'])
    if (b[k] !== undefined) patch[k] = esc(b[k]);
  for (const k of ['mrp', 'sellingPrice', 'purchasePrice', 'quantity', 'minStockLevel', 'gstRate'])
    if (b[k] !== undefined) patch[k] = Number(b[k]);
  if (b.isActive !== undefined) patch.isActive = !!b.isActive;
  if (b.isWeighed !== undefined) patch.isWeighed = !!b.isWeighed;
  if (b.supplierId !== undefined) patch.supplierId = b.supplierId;
  if (b.barcode && b.barcode !== existing.barcode) {
    const { code, internal } = await uniqueBarcode(b.barcode, existing._id);
    patch.barcode = code; patch.barcodeType = detectBarcodeType(code); patch.internalBarcode = internal;
  }
  if (patch.sellingPrice > (patch.mrp ?? existing.mrp)) return res.status(400).json({ error: 'Selling price must be ≤ MRP' });
  const updated = await db.products.updateById(existing._id, patch);
  await logActivity(req, 'PRODUCT_EDIT', `${updated.name}`);
  res.json(updated);
}));

// OWNER-ONLY price editing (role + price token from password re-entry)
router.put('/:id/price', requireRole('admin'), requirePriceToken, asyncH(async (req, res) => {
  const p = await db.products.findById(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  const { mrp, sellingPrice, purchasePrice, offerPrice, offerValidFrom, offerValidTo, reason } = req.body || {};
  const next = { ...p, ...(mrp !== undefined && { mrp: Number(mrp) }), ...(sellingPrice !== undefined && { sellingPrice: Number(sellingPrice) }), ...(purchasePrice !== undefined && { purchasePrice: Number(purchasePrice) }) };
  if (next.sellingPrice > next.mrp) return res.status(400).json({ error: 'Selling price must be ≤ MRP' });
  const patch = {};
  if (mrp !== undefined) patch.mrp = Number(mrp);
  if (sellingPrice !== undefined) patch.sellingPrice = Number(sellingPrice);
  if (purchasePrice !== undefined) patch.purchasePrice = Number(purchasePrice);
  if (offerPrice !== undefined) { patch.offerPrice = offerPrice === null || offerPrice === '' ? null : Number(offerPrice); patch.offerValidFrom = offerValidFrom || null; patch.offerValidTo = offerValidTo || null; }
  const updated = await db.products.updateById(p._id, patch);
  for (const [field, oldV, newV] of [['mrp', p.mrp, updated.mrp], ['sellingPrice', p.sellingPrice, updated.sellingPrice], ['purchasePrice', p.purchasePrice, updated.purchasePrice], ['offerPrice', p.offerPrice, updated.offerPrice]]) {
    if (Number(oldV) !== Number(newV)) {
      await db.priceHistory.create({ productId: p._id, productName: p.name, field, oldPrice: Number(oldV || 0), newPrice: Number(newV || 0), changedBy: req.user.name, reason: reason || '', storeId: p.storeId });
    }
  }
  await logActivity(req, 'PRICE_CHANGE', `${p.name}: MRP ${p.mrp}->${updated.mrp}, SP ${p.sellingPrice}->${updated.sellingPrice}`);
  req.app.get('io')?.emit('price:update', { productId: p._id });
  res.json(updated);
}));

router.post('/price/bulk', requireRole('admin'), requirePriceToken, asyncH(async (req, res) => {
  const changes = Array.isArray(req.body?.changes) ? req.body.changes : [];
  let n = 0;
  for (const c of changes) {
    const p = await db.products.findById(c.productId);
    if (!p) continue;
    const patch = {};
    if (c.sellingPrice !== undefined && c.sellingPrice !== null) patch.sellingPrice = Number(c.sellingPrice);
    if (c.mrp !== undefined && c.mrp !== null) patch.mrp = Number(c.mrp);
    if (c.percent) { patch.sellingPrice = Math.round(p.sellingPrice * (1 + Number(c.percent) / 100) * 100) / 100; }
    if (!Object.keys(patch).length) continue;
    if ((patch.sellingPrice ?? p.sellingPrice) > (patch.mrp ?? p.mrp)) continue;
    await db.products.updateById(p._id, patch);
    await db.priceHistory.create({ productId: p._id, productName: p.name, field: 'bulk', oldPrice: p.sellingPrice, newPrice: patch.sellingPrice ?? p.sellingPrice, changedBy: req.user.name, reason: req.body?.reason || 'Bulk update', storeId: p.storeId });
    n++;
  }
  await logActivity(req, 'PRICE_BULK', `${n} products updated`);
  res.json({ updated: n });
}));

router.get('/:id/price-history', asyncH(async (req, res) => {
  res.json(await db.priceHistory.find({ productId: req.params.id }, { sort: { createdAt: -1 } }));
}));

// Stock in/out with movement log + real-time push
router.post('/:id/stock', requireRole('admin', 'manager'), asyncH(async (req, res) => {
  const p = await db.products.findById(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  const { type, qty, reason } = req.body || {};
  const q = Math.abs(Number(qty || 0));
  if (!q) return res.status(400).json({ error: 'Quantity required' });
  const delta = type === 'out' ? -q : q;
  const balance = Math.max(0, Number(p.quantity || 0) + delta);
  const updated = await db.products.updateById(p._id, { quantity: balance });
  await db.stockMoves.create({ productId: p._id, productName: p.name, type: type === 'out' ? 'out' : 'in', qty: q, reason: reason || '', by: req.user.name, storeId: p.storeId, balance });
  req.app.get('io')?.emit('stock:update', { productId: p._id, quantity: balance });
  await logActivity(req, 'STOCK_' + String(type).toUpperCase(), `${p.name} ${delta}`);
  res.json(updated);
}));

router.get('/:id/stock-moves', asyncH(async (req, res) => {
  res.json(await db.stockMoves.find({ productId: req.params.id }, { sort: { createdAt: -1 }, limit: 100 }));
}));

router.delete('/:id', requireRole('admin'), asyncH(async (req, res) => {
  const p = await db.products.findByIdAndDelete(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  await logActivity(req, 'PRODUCT_DELETE', p.name);
  res.json({ ok: true });
}));

export default router;
