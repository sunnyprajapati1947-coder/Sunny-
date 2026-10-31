// Embedded JSON document store - zero-config fallback when MONGODB_URI is not set.
// Implements the same query/update surface as the Mongoose adapter (see index.js)
// so all routes are driver-agnostic. Data persists to backend/data/*.json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

export const get = (doc, p) => String(p).split('.').reduce((o, k) => (o == null ? o : o[k]), doc);
const setPath = (doc, p, v) => {
  const keys = String(p).split('.');
  let o = doc;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof o[keys[i]] !== 'object' || o[keys[i]] === null) o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = v;
};

const eq = (a, b) => {
  if (a === b) return true;
  if (a == null || b == null) return a == b;
  if (typeof a === 'number' && typeof b === 'string') return String(a) === b;
  if (typeof b === 'number' && typeof a === 'string') return a === String(b);
  return false;
};

function matchCond(val, cond) {
  if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
    return Object.entries(cond).every(([op, arg]) => {
      switch (op) {
        case '$eq': return eq(val, arg);
        case '$ne': return !eq(val, arg);
        case '$gt': return val > arg;
        case '$gte': return val >= arg;
        case '$lt': return val < arg;
        case '$lte': return val <= arg;
        case '$in': return arg.some((x) => eq(val, x));
        case '$nin': return !arg.some((x) => eq(val, x));
        case '$exists': return (val !== undefined && val !== null) === !!arg;
        case '$regex': return new RegExp(arg, cond.$options || '').test(String(val ?? ''));
        case '$options': return true;
        default: throw new Error('Unsupported operator: ' + op);
      }
    });
  }
  if (Array.isArray(val)) return val.some((v) => eq(v, cond));
  return eq(val, cond);
}

export function matchDoc(doc, filter = {}) {
  return Object.entries(filter).every(([k, cond]) => {
    if (k === '$or') return cond.some((f) => matchDoc(doc, f));
    if (k === '$and') return cond.every((f) => matchDoc(doc, f));
    return matchCond(get(doc, k), cond);
  });
}

function applyUpdate(doc, update) {
  const ops = Object.keys(update).filter((k) => k.startsWith('$'));
  if (!ops.length) {
    for (const [k, v] of Object.entries(update)) if (k !== '_id') setPath(doc, k, v);
    return;
  }
  for (const op of ops) {
    const spec = update[op];
    for (const [k, v] of Object.entries(spec)) {
      if (op === '$set') setPath(doc, k, v);
      else if (op === '$unset') delete doc[k];
      else if (op === '$inc') setPath(doc, k, (get(doc, k) || 0) + v);
      else if (op === '$push') {
        const arr = get(doc, k);
        if (Array.isArray(arr)) arr.push(v); else setPath(doc, k, [v]);
      } else if (op === '$pull') {
        const arr = get(doc, k);
        if (Array.isArray(arr)) setPath(doc, k, arr.filter((x) => !matchDoc(x, v)));
      } else throw new Error('Unsupported update op: ' + op);
    }
  }
}

const clone = (d) => JSON.parse(JSON.stringify(d));

export class LocalCollection {
  constructor(name) {
    this.name = name;
    this.file = path.join(DATA_DIR, name + '.json');
    try {
      this.docs = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : [];
    } catch {
      this.docs = [];
    }
    this._t = null;
  }
  persist() {
    clearTimeout(this._t);
    this._t = setTimeout(() => {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.docs));
      fs.renameSync(tmp, this.file);
    }, 80);
  }
  async find(filter = {}, opts = {}) {
    let out = this.docs.filter((d) => matchDoc(d, filter));
    if (opts.sort) {
      const entries = Object.entries(opts.sort);
      out.sort((a, b) => {
        for (const [k, dir] of entries) {
          const av = get(a, k), bv = get(b, k);
          if (av === bv) continue;
          const d = (av > bv ? 1 : -1) * (dir === -1 || dir === 'desc' ? -1 : 1);
          return d;
        }
        return 0;
      });
    }
    if (opts.skip) out = out.slice(opts.skip);
    if (opts.limit) out = out.slice(0, opts.limit);
    return out.map(clone);
  }
  async findOne(filter = {}, opts = {}) {
    const [d] = await this.find(filter, { ...opts, limit: 1 });
    return d || null;
  }
  async findById(id, opts) { return this.findOne({ _id: String(id) }, opts); }
  async create(obj) {
    const many = Array.isArray(obj);
    const docs = (many ? obj : [obj]).map((o) => clone({
      ...o,
      _id: o._id || crypto.randomBytes(12).toString('hex'),
      createdAt: o.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    this.docs.push(...clone(docs));
    this.persist();
    return many ? docs : docs[0];
  }
  async updateById(id, update) {
    const d = this.docs.find((x) => x._id === String(id));
    if (!d) return null;
    applyUpdate(d, update);
    d.updatedAt = new Date().toISOString();
    this.persist();
    return clone(d);
  }
  async updateOne(filter, update) {
    const d = this.docs.find((x) => matchDoc(x, filter));
    if (!d) return null;
    applyUpdate(d, update);
    d.updatedAt = new Date().toISOString();
    this.persist();
    return clone(d);
  }
  async updateMany(filter, update) {
    const hits = this.docs.filter((x) => matchDoc(x, filter));
    hits.forEach((d) => { applyUpdate(d, update); d.updatedAt = new Date().toISOString(); });
    if (hits.length) this.persist();
    return { modifiedCount: hits.length };
  }
  async findByIdAndDelete(id) {
    const i = this.docs.findIndex((x) => x._id === String(id));
    if (i < 0) return null;
    const [d] = this.docs.splice(i, 1);
    this.persist();
    return clone(d);
  }
  async deleteOne(filter) {
    const i = this.docs.findIndex((x) => matchDoc(x, filter));
    if (i < 0) return null;
    const [d] = this.docs.splice(i, 1);
    this.persist();
    return clone(d);
  }
  async deleteMany(filter = {}) {
    const before = this.docs.length;
    this.docs = this.docs.filter((x) => !matchDoc(x, filter));
    this.persist();
    return { deletedCount: before - this.docs.length };
  }
  async count(filter = {}) { return this.docs.filter((d) => matchDoc(d, filter)).length; }
  async distinct(field, filter = {}) {
    return [...new Set(this.docs.filter((d) => matchDoc(d, filter)).map((d) => get(d, field)).filter((v) => v != null && v !== ''))];
  }
  async dump() { return clone(this.docs); }
  async load(docs) { this.docs = clone(docs); this.persist(); }
}
