import { Router } from 'express';
import { db } from '../db/index.js';
import { auth, requireRole, asyncH } from '../middleware/auth.js';

const router = Router();
router.use(auth);

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
const inRange = (doc, from, to) => {
  const t = new Date(doc.billDate || doc.createdAt).getTime();
  return t >= from && t <= to;
};

async function saleBills(from, to, storeId) {
  const all = await db.bills.find({ status: 'completed', type: 'sale' }, { limit: 10000 });
  return all.filter((b) => inRange(b, from, to) && (!storeId || b.storeId === storeId));
}

router.get('/summary', asyncH(async (req, res) => {
  const to = req.query.to ? new Date(req.query.to).getTime() + 86399999 : Date.now();
  const from = req.query.from ? new Date(req.query.from).getTime() : new Date(new Date().toDateString()).getTime();
  const storeId = req.query.storeId || '';
  const bills = await saleBills(from, to, storeId);
  const returns = (await db.bills.find({ type: 'return' }, { limit: 5000 })).filter((b) => inRange(b, from, to) && (!storeId || b.storeId === storeId));

  const sales = bills.reduce((s, b) => s + b.grandTotal, 0) - returns.reduce((s, b) => s + b.grandTotal, 0);
  const profit = bills.reduce((s, b) => s + b.items.reduce((x, i) => x + (i.total - i.total * (i.gstRate / (100 + i.gstRate)) - (i.purchasePrice || 0) * i.qty), 0), 0);
  const tax = bills.reduce((s, b) => s + (b.totalTax || 0), 0);
  const discount = bills.reduce((s, b) => s + (b.totalDiscount || 0), 0);

  const daily = {};
  bills.forEach((b) => { const k = dayKey(b.billDate); daily[k] = (daily[k] || 0) + b.grandTotal; });
  const dailySeries = Object.entries(daily).sort().map(([date, total]) => ({ date, total: Math.round(total * 100) / 100 }));

  const paymentSplit = {};
  bills.forEach((b) => (b.payments || []).forEach((p) => { paymentSplit[p.mode] = (paymentSplit[p.mode] || 0) + p.amount; }));

  const categorySplit = {};
  const productSales = {};
  const cashierSplit = {};
  bills.forEach((b) => {
    cashierSplit[b.cashierName || '—'] = (cashierSplit[b.cashierName || '—'] || 0) + b.grandTotal;
    b.items.forEach((i) => {
      productSales[i.productId] = productSales[i.productId] || { name: i.name, qty: 0, revenue: 0, profit: 0 };
      productSales[i.productId].qty += i.qty;
      productSales[i.productId].revenue += i.total;
      productSales[i.productId].profit += i.total - (i.purchasePrice || 0) * i.qty;
      categorySplit[i.name] = categorySplit[i.name]; // noop
    });
  });
  const productsAll = await db.products.find({}, { limit: 5000 });
  const catOf = Object.fromEntries(productsAll.map((p) => [p._id, p.category || 'Other']));
  bills.forEach((b) => b.items.forEach((i) => {
    const c = catOf[i.productId] || 'Other';
    categorySplit[c] = (categorySplit[c] || 0) + i.total;
  }));

  const topProducts = Object.values(productSales).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const soldIds = new Set(Object.keys(productSales));
  const slowMoving = productsAll.filter((p) => p.isActive && !soldIds.has(p._id)).slice(0, 20).map((p) => ({ name: p.name, quantity: p.quantity, category: p.category }));

  // comparisons
  const span = to - from;
  const prevBills = await saleBills(from - span - 86399999, from - 1, storeId);
  const prevSales = prevBills.reduce((s, b) => s + b.grandTotal, 0);

  res.json({
    range: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
    sales: Math.round(sales * 100) / 100, billsCount: bills.length, returnsCount: returns.length,
    profit: Math.round(profit * 100) / 100, tax: Math.round(tax * 100) / 100, discount: Math.round(discount * 100) / 100,
    avgBill: bills.length ? Math.round((sales / bills.length) * 100) / 100 : 0,
    prevSales: Math.round(prevSales * 100) / 100,
    growthPct: prevSales ? Math.round(((sales - prevSales) / prevSales) * 1000) / 10 : null,
    dailySeries, paymentSplit, categorySplit: Object.entries(categorySplit).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value),
    topProducts, slowMoving, cashierSplit,
  });
}));

router.get('/stock', asyncH(async (req, res) => {
  const products = await db.products.find({}, { limit: 10000 });
  const rows = products.map((p) => ({
    name: p.name, category: p.category, quantity: p.quantity, unit: p.unit,
    value: Math.round(p.quantity * (p.purchasePrice || 0) * 100) / 100,
    retailValue: Math.round(p.quantity * (p.sellingPrice || 0) * 100) / 100,
    low: Number(p.quantity) <= Number(p.minStockLevel || 0),
  }));
  res.json({
    rows, totalCostValue: Math.round(rows.reduce((s, r) => s + r.value, 0) * 100) / 100,
    totalRetailValue: Math.round(rows.reduce((s, r) => s + r.retailValue, 0) * 100) / 100,
    lowStock: rows.filter((r) => r.low),
  });
}));

router.get('/expiry', asyncH(async (req, res) => {
  const products = await db.products.find({ expiryDate: { $exists: true } }, { limit: 10000 });
  const today = new Date(); const buckets = { expired: [], d7: [], d15: [], d30: [] };
  for (const p of products) {
    if (!p.expiryDate) continue;
    const days = Math.ceil((new Date(p.expiryDate) - today) / 864e5);
    if (days < 0) buckets.expired.push({ name: p.name, expiryDate: p.expiryDate, days, quantity: p.quantity });
    else if (days <= 7) buckets.d7.push({ name: p.name, expiryDate: p.expiryDate, days, quantity: p.quantity });
    else if (days <= 15) buckets.d15.push({ name: p.name, expiryDate: p.expiryDate, days, quantity: p.quantity });
    else if (days <= 30) buckets.d30.push({ name: p.name, expiryDate: p.expiryDate, days, quantity: p.quantity });
  }
  res.json(buckets);
}));

router.get('/gst', asyncH(async (req, res) => {
  const to = req.query.to ? new Date(req.query.to).getTime() + 86399999 : Date.now();
  const from = req.query.from ? new Date(req.query.from).getTime() : new Date(new Date().toDateString()).getTime();
  const bills = await saleBills(from, to, req.query.storeId || '');
  const byRate = {};
  bills.forEach((b) => b.items.forEach((i) => {
    const r = i.gstRate || 0;
    byRate[r] = byRate[r] || { rate: r, taxable: 0, tax: 0 };
    const net = i.total / (1 + r / 100);
    byRate[r].taxable += net;
    byRate[r].tax += i.total - net;
  }));
  res.json(Object.values(byRate).map((x) => ({ ...x, taxable: Math.round(x.taxable * 100) / 100, tax: Math.round(x.tax * 100) / 100 })));
}));

router.get('/credit', asyncH(async (req, res) => {
  const list = await db.customers.find({ creditBalance: { $gt: 0 } }, { sort: { creditBalance: -1 } });
  res.json({ rows: list, total: Math.round(list.reduce((s, c) => s + c.creditBalance, 0) * 100) / 100 });
}));

router.get('/stock-moves', asyncH(async (req, res) => {
  res.json(await db.stockMoves.find({}, { sort: { createdAt: -1 }, limit: Number(req.query.limit || 200) }));
}));

export default router;
