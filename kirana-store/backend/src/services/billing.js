// Authoritative pricing / offer / bill-total engine (server side, mall-style)
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function effectivePrice(product, now = new Date()) {
  if (product.offerPrice != null && product.offerPrice > 0) {
    const from = product.offerValidFrom ? new Date(product.offerValidFrom) : null;
    const to = product.offerValidTo ? new Date(product.offerValidTo) : null;
    if ((!from || now >= from) && (!to || now <= to)) return Number(product.offerPrice);
  }
  return Number(product.sellingPrice || 0);
}

function offerActive(o, now) {
  if (!o.isActive) return false;
  if (o.validFrom && now < new Date(o.validFrom)) return false;
  if (o.validTo && now > new Date(o.validTo)) return false;
  if (o.type === 'happyhour') {
    const h = now.getHours() + now.getMinutes() / 60;
    const s = Number(o.startHour ?? 0), e = Number(o.endHour ?? 24);
    if (s <= e ? h < s || h >= e : h < s && h >= e) return false;
  }
  return true;
}

const offerMatchesItem = (o, item) =>
  (o.productIds?.length ? o.productIds.includes(item.productId) : false) ||
  (o.categories?.length ? o.categories.includes(item.category) : false) ||
  (!o.productIds?.length && !o.categories?.length && o.type !== 'coupon' && o.type !== 'combo');

/**
 * lines: [{ productId, qty, discountPct, product (full doc) }]
 * returns enriched lines + totals
 */
export function computeBill({ lines, offers = [], couponCode = null, billDiscountPct = 0, billDiscountFlat = 0, customer = null, settings = {}, now = new Date() }) {
  const active = offers.filter((o) => offerActive(o, now));
  const enriched = lines.map((l) => {
    const p = l.product;
    const price = effectivePrice(p, now);
    const qty = Number(l.qty || 0);
    let discountPct = Number(l.discountPct || 0);
    let freeQty = 0;
    const offerIds = [];
    for (const o of active) {
      if (o.type === 'percent' && offerMatchesItem(o, { ...l, category: p.category })) {
        if (o.percent > discountPct) { discountPct = o.percent; offerIds.push(o._id); }
      } else if (o.type === 'festival' && offerMatchesItem(o, { ...l, category: p.category })) {
        if (o.percent > discountPct) { discountPct = o.percent; offerIds.push(o._id); }
      } else if (o.type === 'bogo' && (o.productIds?.includes(p._id) || (o.categories?.length && o.categories.includes(p.category)))) {
        const buy = Number(o.buyQty || 1), get = Number(o.getQty || 1);
        const f = Math.floor(qty / (buy + get)) * get;
        if (f > freeQty) { freeQty = f; offerIds.push(o._id); }
      }
    }
    if (customer?.discountPct > discountPct) discountPct = customer.discountPct;
    discountPct = Math.min(Math.max(discountPct, 0), 90);
    const gross = round2(price * qty);
    const pctValue = round2((gross * discountPct) / 100);
    const freeValue = round2(price * freeQty);
    const discountValue = round2(pctValue + freeValue);
    const total = round2(gross - discountValue);
    const gst = Number(p.gstRate || 0);
    const taxValue = round2(total - total / (1 + gst / 100));
    return {
      productId: p._id, name: p.name, barcode: p.barcode, qty, unit: p.unit || 'piece',
      price, mrp: Number(p.mrp || 0), purchasePrice: Number(p.purchasePrice || 0), gstRate: gst,
      discountPct, discountValue, freeQty, taxValue, total, offerIds, category: p.category,
    };
  });

  // Combo offers: all combo products present with qty>=1 -> price the combo set at comboPrice
  let comboDiscount = 0;
  for (const o of active.filter((x) => x.type === 'combo')) {
    const ids = o.comboProductIds || [];
    if (ids.length >= 2 && ids.every((id) => enriched.find((l) => l.productId === id && l.qty >= 1))) {
      const setPrice = enriched.filter((l) => ids.includes(l.productId)).reduce((s, l) => s + l.price * Math.min(l.qty, 1), 0);
      comboDiscount = round2(comboDiscount + Math.max(0, setPrice - Number(o.comboPrice || 0)));
      enriched.forEach((l) => { if (ids.includes(l.productId)) l.offerIds = [...(l.offerIds || []), o._id]; });
    }
  }

  const itemSubtotal = round2(enriched.reduce((s, l) => s + l.price * l.qty, 0));
  const itemDiscount = round2(enriched.reduce((s, l) => s + l.discountValue, 0) + comboDiscount);
  const subtotal = round2(itemSubtotal - itemDiscount);

  let couponValue = 0;
  let coupon = null;
  if (couponCode) {
    coupon = active.find((o) => o.type === 'coupon' && (o.couponCode || '').toUpperCase() === String(couponCode).toUpperCase());
    if (coupon && subtotal >= Number(coupon.minSubtotal || 0)) {
      if (coupon.maxUses && (coupon.usedCount || 0) >= coupon.maxUses) coupon = null;
      else couponValue = coupon.percent ? round2((subtotal * coupon.percent) / 100) : round2(Math.min(Number(coupon.flat || 0), subtotal));
    } else coupon = null;
  }

  const bdPct = Number(billDiscountPct || 0);
  const billDiscountValue = round2(Math.min(subtotal * (bdPct / 100) + Number(billDiscountFlat || 0), subtotal));
  const totalDiscount = round2(itemDiscount + couponValue + billDiscountValue);
  const taxable = round2(Math.max(subtotal - couponValue - billDiscountValue, 0));
  const totalTax = round2(enriched.reduce((s, l) => s + l.taxValue * (subtotal ? (l.total / subtotal) : 0), 0));
  const grandRaw = taxable;
  const grandTotal = settings.roundOffEnabled === false ? round2(grandRaw) : Math.round(grandRaw);
  const roundOff = round2(grandTotal - grandRaw);

  return {
    items: enriched.map(({ category, ...rest }) => rest),
    subtotal: itemSubtotal, itemDiscount, billDiscountPct: bdPct, billDiscountValue,
    couponCode: coupon ? coupon.couponCode : null, couponValue, couponId: coupon?._id || null,
    totalDiscount, totalTax, grandTotal, roundOff,
  };
}

export function validatePayments(payments, grandTotal) {
  const list = (payments || []).filter((p) => Number(p.amount) > 0).map((p) => ({ mode: p.mode, amount: round2(Number(p.amount)), ref: p.ref || '' }));
  const cashLike = list.filter((p) => p.mode !== 'credit').reduce((s, p) => s + p.amount, 0);
  let creditAmount = list.filter((p) => p.mode === 'credit').reduce((s, p) => s + p.amount, 0);
  const due = round2(grandTotal - cashLike);
  if (due > 0 && creditAmount === 0) creditAmount = round2(due); // balance becomes udhar only if credit mode chosen or no full payment
  const amountPaid = round2(cashLike + (list.some((p) => p.mode === 'credit') ? creditAmount : 0));
  const changeReturned = round2(Math.max(0, cashLike - grandTotal));
  return { payments: list, creditAmount: due > 0 ? round2(due) : 0, amountPaid: round2(Math.min(cashLike, grandTotal) + (due > 0 ? due : 0)), changeReturned };
}
