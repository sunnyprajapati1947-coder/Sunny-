// Mongoose schemas (used in production when MONGODB_URI is set)
import mongoose from 'mongoose';

const { Schema } = mongoose;
const opts = { timestamps: true };
const money = { type: Number, default: 0 };

export const schemas = {
  users: new Schema({
    name: String, username: { type: String, unique: true, index: true }, password: String,
    pin: String, role: { type: String, enum: ['admin', 'manager', 'cashier'], default: 'cashier' },
    phone: String, email: String, storeId: String, isActive: { type: Boolean, default: true },
    lastLogin: Date, mustChangePassword: Boolean,
  }, opts),
  stores: new Schema({
    name: String, address: String, phone: String, email: String, gstNumber: String,
    isActive: { type: Boolean, default: true }, isMain: Boolean,
  }, opts),
  products: new Schema({
    storeId: { type: String, index: true }, name: { type: String, index: true }, nameHindi: String,
    category: { type: String, index: true }, subCategory: String, brand: String,
    barcode: { type: String, index: true }, barcodeType: String, internalBarcode: Boolean,
    mrp: money, sellingPrice: money, purchasePrice: money, offerPrice: money,
    offerValidFrom: Date, offerValidTo: Date,
    quantity: money, unit: { type: String, default: 'piece' }, minStockLevel: { type: Number, default: 5 },
    hsnCode: String, gstRate: { type: Number, default: 0 },
    expiryDate: String, manufacturingDate: String, supplierId: String, supplierName: String,
    rackLocation: String, image: String, isActive: { type: Boolean, default: true },
    isWeighed: Boolean,
  }, opts),
  priceHistory: new Schema({
    productId: { type: String, index: true }, productName: String, field: String,
    oldPrice: Number, newPrice: Number, changedBy: String, reason: String, storeId: String,
  }, opts),
  stockMoves: new Schema({
    productId: { type: String, index: true }, productName: String, type: String, qty: Number,
    reason: String, by: String, storeId: String, balance: Number, ref: String,
  }, opts),
  bills: new Schema({
    billNumber: { type: String, index: true }, storeId: { type: String, index: true },
    billDate: Date, status: { type: String, enum: ['held', 'completed', 'returned', 'cancelled'], default: 'completed', index: true },
    customerId: String, customerName: String, customerPhone: String,
    items: [{ productId: String, name: String, barcode: String, qty: Number, unit: String, price: Number, mrp: Number, purchasePrice: Number, gstRate: Number, discountPct: Number, discountValue: Number, freeQty: Number, taxValue: Number, total: Number, offerIds: [String] }],
    subtotal: money, itemDiscount: money, billDiscountPct: Number, billDiscountValue: money,
    couponCode: String, couponValue: money, totalDiscount: money, totalTax: money,
    grandTotal: money, roundOff: Number, payments: [{ mode: String, amount: Number, ref: String }],
    amountPaid: money, changeReturned: money, creditAmount: money,
    loyaltyEarned: Number, cashier: String, cashierName: String, shiftId: String,
    note: String, type: { type: String, enum: ['sale', 'return'], default: 'sale' },
    refBillId: String, refBillNumber: String, returnReason: String, refundMode: String,
  }, opts),
  customers: new Schema({
    storeId: String, name: String, phone: { type: String, index: true }, email: String, address: String,
    tag: { type: String, enum: ['regular', 'vip'], default: 'regular' }, discountPct: Number,
    totalPurchases: money, billsCount: Number, creditBalance: money, loyaltyPoints: Number,
    isActive: { type: Boolean, default: true },
  }, opts),
  creditPayments: new Schema({
    customerId: { type: String, index: true }, customerName: String, amount: Number, mode: String,
    note: String, by: String, storeId: String, billId: String,
  }, opts),
  suppliers: new Schema({
    storeId: String, name: String, company: String, phone: String, email: String, address: String,
    gstNumber: String, balanceDue: money,
  }, opts),
  purchases: new Schema({
    storeId: String, poNumber: String, supplierId: String, supplierName: String,
    items: [{ productId: String, name: String, qty: Number, price: Number, total: Number }],
    total: money, paid: money, balance: money, status: { type: String, enum: ['pending', 'received', 'partial'], default: 'pending' },
    expectedDate: String, receivedDate: Date, by: String, payments: [{ amount: Number, mode: String, date: Date, note: String }],
  }, opts),
  offers: new Schema({
    storeId: String, title: String, type: { type: String, enum: ['bogo', 'percent', 'combo', 'happyhour', 'festival', 'coupon'] },
    buyQty: Number, getQty: Number, percent: Number, flat: Number,
    productIds: [String], categories: [String], comboProductIds: [String], comboPrice: Number,
    couponCode: String, minSubtotal: Number, maxUses: Number, usedCount: Number,
    startHour: Number, endHour: Number, validFrom: Date, validTo: Date,
    isActive: { type: Boolean, default: true },
  }, opts),
  shifts: new Schema({
    storeId: String, userId: String, userName: String, openingCash: Number, closingCash: Number,
    expectedCash: Number, openedAt: Date, closedAt: Date, status: { type: String, enum: ['open', 'closed'], default: 'open' },
    salesTotal: money, billCount: Number, note: String,
  }, opts),
  activity: new Schema({
    userId: String, userName: String, role: String, action: String, details: String,
    storeId: String, ip: String,
  }, opts),
  notifications: new Schema({
    storeId: String, type: String, title: String, message: String, severity: String,
    read: { type: Boolean, default: false }, meta: Object,
  }, opts),
  transfers: new Schema({
    fromStore: String, toStore: String, items: [{ productId: String, name: String, qty: Number }],
    status: { type: String, enum: ['pending', 'completed'], default: 'completed' }, by: String, note: String,
  }, opts),
  orders: new Schema({
    orderNumber: String, storeId: String, customerName: String, phone: String, address: String,
    items: [{ productId: String, name: String, qty: Number, price: Number, total: Number }],
    subtotal: money, deliveryFee: money, grandTotal: money,
    paymentMode: String, paymentStatus: { type: String, enum: ['pending', 'paid'], default: 'pending' },
    status: { type: String, enum: ['placed', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled'], default: 'placed' },
    note: String,
  }, opts),
  settings: new Schema({
    key: { type: String, unique: true }, storeName: String, address: String, phone: String, email: String,
    gstNumber: String, logo: String, currency: { type: String, default: '₹' },
    receiptFooter: String, printerWidth: { type: Number, default: 80 },
    defaultGstRate: Number, roundOffEnabled: { type: Boolean, default: true },
    loyaltyPerRupee: { type: Number, default: 0.02 }, deliveryFee: Number,
    whatsappNumber: String, smtp: Object, backupEnabled: { type: Boolean, default: true },
    sessionTimeoutMin: { type: Number, default: 30 }, billCounter: Number, orderCounter: Number, poCounter: Number,
  }, opts),
};

export function buildModels(mongooseInstance = mongoose) {
  const models = {};
  for (const [name, schema] of Object.entries(schemas)) {
    models[name] = mongooseInstance.models[name] || mongooseInstance.model(name, schema);
  }
  return models;
}
