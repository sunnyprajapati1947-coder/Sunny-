import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Plus, Search, Upload, Pencil, Trash2, Image as ImageIcon, Barcode } from 'lucide-react';
import * as XLSX from 'xlsx';
import { api, errMsg } from '../api.js';
import { toast } from '../store.js';
import { Modal, Field, Table, Badge, Empty, Confirm, PageHead } from '../components/ui.jsx';
import { inr, exportCSV } from '../utils.js';

const BLANK = { name: '', nameHindi: '', category: '', subCategory: '', brand: '', barcode: '', mrp: '', sellingPrice: '', purchasePrice: '', quantity: '', unit: 'piece', minStockLevel: 5, hsnCode: '', gstRate: 5, expiryDate: '', supplierName: '', rackLocation: '', image: '', isWeighed: false };

export default function Products() {
  const dispatch = useDispatch();
  const ui = useSelector((s) => s.ui);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState({ search: '', category: '', lowStock: '', page: 1 });
  const [cats, setCats] = useState({ categories: [], brands: [] });
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const fileRef = useRef(null);

  const load = () => api.get('/products', { params: { ...q, storeId: ui.storeId === 'main' ? '' : ui.storeId } }).then((r) => { setItems(r.data.items); setTotal(r.data.total); });
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q, ui.storeId]);
  useEffect(() => { api.get('/products/categories').then((r) => setCats(r.data)).catch(() => {}); }, []);

  const uploadImage = async (f) => {
    const fd = new FormData(); fd.append('image', f);
    const { data } = await api.post('/products/image', fd);
    setEdit((e) => ({ ...e, image: data.url }));
  };

  const importFile = async (f) => {
    try {
      const wb = XLSX.read(await f.arrayBuffer());
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const norm = rows.map((r) => ({
        name: r.Name || r.name, nameHindi: r.NameHindi || '', category: r.Category || r.category, subCategory: r.SubCategory || '',
        brand: r.Brand || r.brand, barcode: r.Barcode || r.barcode || '', mrp: r.MRP || r.mrp, sellingPrice: r.SellingPrice || r.sellingPrice || r.MRP || r.mrp,
        purchasePrice: r.PurchasePrice || r.purchasePrice || 0, quantity: r.Quantity || r.quantity || 0, unit: r.Unit || r.unit || 'piece',
        gstRate: r.GST ?? r.gstRate ?? 5, minStockLevel: r.MinStock || 5, expiryDate: r.Expiry || r.expiryDate || '', hsnCode: r.HSN || '', rackLocation: r.Rack || '',
      }));
      const { data } = await api.post('/products/bulk', { rows: norm });
      dispatch(toast({ msg: `Imported ${data.created} products${data.errors.length ? `, ${data.errors.length} errors` : ''}`, kind: data.errors.length ? 'warn' : 'ok' }));
      setImportOpen(false); load();
    } catch (e) { dispatch(toast({ msg: errMsg(e), kind: 'error' })); }
  };

  return (
    <div>
      <PageHead title="Products / प्रोडक्ट" sub={`${total} items in catalogue`}>
        <button className="btn-ghost" onClick={() => exportCSV('products', items)}><Upload size={15} className="rotate-180" /> CSV</button>
        <button className="btn-ghost" onClick={() => setImportOpen(true)}><Upload size={15} /> Import Excel/CSV</button>
        <button className="btn-primary" onClick={() => setEdit({ ...BLANK })}><Plus size={16} /> Add Product</button>
      </PageHead>

      <div className="card mb-3 flex flex-wrap gap-2 p-3">
        <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input className="inp !pl-9" placeholder="Search name / barcode / brand…" value={q.search} onChange={(e) => setQ({ ...q, search: e.target.value, page: 1 })} /></div>
        <select className="inp !w-auto" value={q.category} onChange={(e) => setQ({ ...q, category: e.target.value })}>
          <option value="">All categories</option>{cats.categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="inp !w-auto" value={q.lowStock} onChange={(e) => setQ({ ...q, lowStock: e.target.value })}>
          <option value="">All stock</option><option value="true">Low stock only</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <Table head={['Product', 'Barcode', 'Category', 'MRP', 'Price', 'Stock', 'GST', '']}>
          {items.map((p) => (
            <tr key={p._id} className="hover:bg-slate-50 dark:hover:bg-ink-700/40">
              <td className="td"><div className="flex items-center gap-2">
                {p.image ? <img src={p.image} className="h-8 w-8 rounded-lg object-cover" alt="" /> : <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 dark:bg-ink-700"><ImageIcon size={14} className="text-slate-400" /></div>}
                <div><div className="font-bold">{p.name}</div><div className="text-[11px] text-slate-400">{p.nameHindi} {p.brand && `• ${p.brand}`}</div></div>
              </div></td>
              <td className="td font-mono text-xs">{p.barcode}{p.internalBarcode && <Badge tone="blue"> internal</Badge>}</td>
              <td className="td">{p.category}</td>
              <td className="td text-slate-500">{inr(p.mrp)}</td>
              <td className="td font-bold">{inr(p.sellingPrice)}</td>
              <td className="td">{p.quantity <= p.minStockLevel ? <Badge tone="rose">{p.quantity} {p.unit}</Badge> : <Badge tone="green">{p.quantity} {p.unit}</Badge>}</td>
              <td className="td">{p.gstRate}%</td>
              <td className="td"><div className="flex gap-1">
                <button className="btn-ghost !p-1.5" onClick={() => setEdit(p)}><Pencil size={14} /></button>
                <button className="btn-ghost !p-1.5 text-rose-500" onClick={() => setDel(p)}><Trash2 size={14} /></button>
              </div></td>
            </tr>
          ))}
        </Table>
        {!items.length && <Empty text="No products found / कोई प्रोडक्ट नहीं" />}
      </div>

      {edit && <ProductModal data={edit} cats={cats} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} uploadImage={uploadImage} />}
      <Confirm open={!!del} onClose={() => setDel(null)} text={`Delete "${del?.name}" permanently?`} onYes={async () => { await api.delete('/products/' + del._id); load(); }} />

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Bulk import (Excel .xlsx / CSV)">
        <p className="mb-3 text-sm text-slate-500">Columns: Name, NameHindi, Category, SubCategory, Brand, Barcode (optional), MRP, SellingPrice, PurchasePrice, Quantity, Unit, GST, MinStock, Expiry, Rack</p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="inp" onChange={(e) => e.target.files[0] && importFile(e.target.files[0])} />
        <button className="btn-ghost mt-3 text-xs" onClick={() => {
          const ws = XLSX.utils.aoa_to_sheet([[ 'Name', 'Category', 'Brand', 'MRP', 'SellingPrice', 'PurchasePrice', 'Quantity', 'Unit', 'GST' ], ['Sample Dal 1kg', 'Staples', 'Local', 100, 92, 78, 10, 'kg', 5]]);
          const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Template'); XLSX.writeFile(wb, 'product-template.xlsx');
        }}>Download template</button>
      </Modal>
    </div>
  );
}

function ProductModal({ data, cats, onClose, onSaved, uploadImage }) {
  const dispatch = useDispatch();
  const [f, setF] = useState(data);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      if (f._id) await api.put('/products/' + f._id, f);
      else await api.post('/products', f);
      dispatch(toast({ msg: 'Product saved / प्रोडक्ट सेव हुआ', kind: 'ok' }));
      onSaved();
    } catch (e) { dispatch(toast({ msg: errMsg(e), kind: 'error' })); }
    setBusy(false);
  };
  return (
    <Modal open onClose={onClose} title={f._id ? `Edit — ${f.name}` : 'Add Product / प्रोडक्ट जोड़ें'} wide
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}><Barcode size={15} /> Save Product</button></>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name (English) *" className="sm:col-span-2"><input className="inp" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="नाम (हिंदी)"><input className="inp" value={f.nameHindi} onChange={(e) => set('nameHindi', e.target.value)} /></Field>
        <Field label="Category"><input className="inp" list="cats" value={f.category} onChange={(e) => set('category', e.target.value)} /><datalist id="cats">{cats.categories.map((c) => <option key={c} />)}</datalist></Field>
        <Field label="Sub-category"><input className="inp" value={f.subCategory} onChange={(e) => set('subCategory', e.target.value)} /></Field>
        <Field label="Brand"><input className="inp" list="brands" value={f.brand} onChange={(e) => set('brand', e.target.value)} /><datalist id="brands">{cats.brands.map((c) => <option key={c} />)}</datalist></Field>
        <Field label="Barcode (leave blank = auto)"><input className="inp font-mono" value={f.barcode} onChange={(e) => set('barcode', e.target.value)} placeholder="auto-generate EAN-13" /></Field>
        <Field label="MRP ₹"><input className="inp" type="number" value={f.mrp} onChange={(e) => set('mrp', e.target.value)} /></Field>
        <Field label="Selling Price ₹ (≤ MRP)"><input className="inp" type="number" value={f.sellingPrice} onChange={(e) => set('sellingPrice', e.target.value)} /></Field>
        <Field label="Purchase Price ₹"><input className="inp" type="number" value={f.purchasePrice} onChange={(e) => set('purchasePrice', e.target.value)} /></Field>
        <Field label="Quantity"><input className="inp" type="number" value={f.quantity} onChange={(e) => set('quantity', e.target.value)} /></Field>
        <Field label="Unit"><select className="inp" value={f.unit} onChange={(e) => set('unit', e.target.value)}>{['piece', 'kg', 'liter', 'packet', 'dozen'].map((u) => <option key={u}>{u}</option>)}</select></Field>
        <Field label="Min stock alert level"><input className="inp" type="number" value={f.minStockLevel} onChange={(e) => set('minStockLevel', e.target.value)} /></Field>
        <Field label="GST %"><select className="inp" value={f.gstRate} onChange={(e) => set('gstRate', e.target.value)}>{[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}%</option>)}</select></Field>
        <Field label="HSN Code"><input className="inp" value={f.hsnCode} onChange={(e) => set('hsnCode', e.target.value)} /></Field>
        <Field label="Expiry date"><input className="inp" type="date" value={f.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} /></Field>
        <Field label="Supplier"><input className="inp" value={f.supplierName} onChange={(e) => set('supplierName', e.target.value)} /></Field>
        <Field label="Rack / Shelf"><input className="inp" value={f.rackLocation} onChange={(e) => set('rackLocation', e.target.value)} /></Field>
        <Field label="Weighed item (loose)"><input type="checkbox" className="mt-2 h-5 w-5" checked={!!f.isWeighed} onChange={(e) => set('isWeighed', e.target.checked)} /></Field>
        <Field label="Image" className="sm:col-span-2">
          <div className="flex items-center gap-2">
            {f.image && <img src={f.image} className="h-10 w-10 rounded-lg object-cover" alt="" />}
            <input type="file" accept="image/*" className="inp" onChange={(e) => e.target.files[0] && uploadImage(e.target.files[0])} />
          </div>
        </Field>
      </div>
    </Modal>
  );
}
