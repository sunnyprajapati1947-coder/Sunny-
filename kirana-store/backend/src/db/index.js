// Data-access layer. Uses MongoDB/Mongoose when MONGODB_URI is configured,
// otherwise falls back to the embedded JSON store so the app runs with zero setup.
import mongoose from 'mongoose';
import { LocalCollection } from './local.js';
import { buildModels } from './models.js';

export const COLLECTIONS = ['users', 'stores', 'products', 'priceHistory', 'stockMoves', 'bills', 'customers', 'creditPayments', 'suppliers', 'purchases', 'offers', 'shifts', 'activity', 'notifications', 'transfers', 'orders', 'settings'];

export const DB_MODE = process.env.MONGODB_URI ? 'mongodb' : 'local';

function mongoAdapter(Model) {
  return {
    find: (f = {}, o = {}) => Model.find(f).sort(o.sort || { createdAt: -1 }).skip(o.skip || 0).limit(o.limit || 0).lean(),
    findOne: (f = {}, o = {}) => Model.findOne(f).sort(o.sort || { createdAt: -1 }).lean(),
    findById: (id) => Model.findById(id).lean(),
    create: (o) => Model.create(o).then((d) => (Array.isArray(d) ? d.map((x) => x.toObject()) : d.toObject())),
    updateById: (id, u) => Model.findByIdAndUpdate(id, u, { new: true }).lean(),
    updateOne: (f, u) => Model.findOneAndUpdate(f, u, { new: true }).lean(),
    updateMany: (f, u) => Model.updateMany(f, u),
    findByIdAndDelete: (id) => Model.findByIdAndDelete(id).lean(),
    deleteOne: (f) => Model.findOneAndDelete(f).lean(),
    deleteMany: (f = {}) => Model.deleteMany(f),
    count: (f = {}) => Model.countDocuments(f),
    distinct: (field, f = {}) => Model.distinct(field, f),
    dump: () => Model.find().lean(),
    load: (docs) => Model.insertMany(docs, { ordered: false }).catch(() => {}),
  };
}

export const db = {};

export async function connectDB() {
  if (DB_MODE === 'mongodb') {
    await mongoose.connect(process.env.MONGODB_URI);
    const models = buildModels(mongoose);
    for (const name of COLLECTIONS) db[name] = mongoAdapter(models[name]);
    console.log('[db] Connected to MongoDB');
  } else {
    for (const name of COLLECTIONS) db[name] = new LocalCollection(name);
    console.log('[db] Using embedded local database (set MONGODB_URI for MongoDB/Atlas)');
  }
  return db;
}

export async function getSettings() {
  let s = await db.settings.findOne({ key: 'main' });
  if (!s) {
    s = await db.settings.create({
      key: 'main', storeName: 'Rishu Kirana Store', address: 'Gaya Road, Nawada', phone: '9608087035',
      email: '', gstNumber: '', receiptFooter: 'धन्यवाद! Thank you, visit again.', printerWidth: 80,
      currency: '₹', defaultGstRate: 5, roundOffEnabled: true, loyaltyPerRupee: 0.02, deliveryFee: 20,
      whatsappNumber: '919608087035', backupEnabled: true, sessionTimeoutMin: 30,
      billCounter: 0, orderCounter: 0, poCounter: 0,
    });
  }
  return s;
}

export async function nextCounter(field) {
  const s = await db.settings.updateOne({ key: 'main' }, { $inc: { [field]: 1 } });
  return (s?.[field] || 1);
}
