import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Lock, Search, ShieldCheck, Pencil, History } from 'lucide-react';
import { api, errMsg } from '../api.js';
import { toast } from '../store.js';
import { Modal, Field, Table, Badge, Empty, PageHead, Tabs } from '../components/ui.jsx';
import { inr, fmtDT } from '../utils.js';

// OWNER-ONLY: password-protected price editing + bulk update + price history
export default function PriceEditor() {
  const dispatch = useDispatch();
  const [unlocked, setUnlocked] = useState(!!sessionStorage.getItem('rk_price_token'));
  const [pw, setPw] = useState('');
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState({ percent: '', category: '' });
  const [histFor, setHistFor] = useState(null);
  const [hist, setHist] = useState([]);
  const [tab, setTab] = useState('edit');

  const load = () => api.get('/products', { params: { search: q, limit: 500 } }).then((r) => setItems(r.data.items));
  useEffect(() => { if (unlocked) load(); }, [q, unlocked]);

  const unlock = async () => {
    try {
      const { data } = await api.post('/auth/verify', { password: pw });
      sessionStorage.setItem('rk_price_token', data.priceToken);
      setUnlocked(true);
      dispatch(toast({ msg: 'Price lock unlocked for 10 minutes / प्राइस लॉक खुला', kind: 'ok' }));
    } catch (e) { dispatch(toast({ msg: errMsg(e), kind: 'error' })); }
  };

  const save = async () => {
    try {
      await api.put(`/products/${edit._id}/price`, edit);
      dispatch(toast({ msg: `Price updated: ${edit.name}`, kind: 'ok' }));
      setEdit(null); load();
    } catch (e) { dispatch(toast({ msg: errMsg(e), kind: 'error' })); }
  };

  const bulkApply = async () => {
    const changes = items.filter((p) => !bulk.category || p.category === bulk.category).map((p) => ({ productId: p._id, percent: Number(bulk.percent) }));
    try {
      const { data } = await api.post('/products/price/bulk', { changes, reason: `Bulk ${bulk.percent}% on ${bulk.category || 'all'}` });
      dispatch(toast({ msg: `${data.updated} prices updated`, kind: 'ok' }));
      setBulkOpen(false); load();
    } catch (e) { dispatch(toast({ msg: errMsg(e), kind: 'error' })); }
  };

  const openHist = async (p) => {
    const { data } = await api.get(`/products/${p._id}/price-history`);
    setHist(data); setHistFor(p);
  };

  if (!unlocked) {
    return (
      <div className="mx-auto max-w-sm card p-6 text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-rose-500/15 text-rose-500"><Lock size={26} /></div>
        <h2 className="text-lg font-extrabold">Price Lock / प्राइस लॉक</h2>
        <p className="mb-4 text-sm text-slate-500">Only owner/admin can change prices. Enter your password to unlock.<br />सिर्फ मालिक ही कीमत बदल सकते हैं।</p>
        <input className="inp mb-3" type="password" placeholder="Owner password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && unlock()} autoFocus />
        <button className="btn-primary w-full" onClick={unlock}><ShieldCheck size={16} /> Unlock Price Editor</button>
      </div>
    );
  }

  return (
    <div>
      <PageHead title="Price Editor / प्राइस एडिटर" sub="Owner-only • selling price ≤ MRP enforced • every change logged">
        <button className="btn-ghost" onClick={() => { sessionStorage.removeItem('rk_price_token'); setUnlocked(false); }}><Lock size={15} /> Re-lock</button>
        <button className="btn-primary" onClick={() => setBulkOpen(true)}>Bulk % update</button>
      </PageHead>
      <div className="card mb-3 p-3"><div className="relative"><Search className="absolute left-3 top-2.5 text-slate-400" size={16} /><input className="inp !pl-9" placeholder="Search product…" value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
      <div className="card overflow-hidden">
        <Table head={['Product', 'Category', 'Purchase', 'MRP', 'Selling', 'Margin', 'Offer Price', '']}>
          {items.map((p) => (
            <tr key={p._id} className="hover:bg-slate-50 dark:hover:bg-ink-700/40">
              <td className="td font-bold">{p.name}</td>
              <td className="td">{p.category}</td>
              <td className="td text-slate-500">{inr(p.purchasePrice)}</td>
              <td className="td">{inr(p.mrp)}</td>
              <td className="td font-extrabold text-brand-600">{inr(p.sellingPrice)}</td>
              <td className="td">{p.purchasePrice ? <Badge tone={p.sellingPrice > p.purchasePrice ? 'green' : 'rose'}>{Math.round(((p.sellingPrice - p.purchasePrice) / p.sellingPrice) * 100)}%</Badge> : '—'}</td>
              <td className="td">{p.offerPrice ? <Badge tone="amber">{inr(p.offerPrice)} till {String(p.offerValidTo || '').slice(0, 10)}</Badge> : '—'}</td>
              <td className="td"><div className="flex gap-1">
                <button className="btn-ghost !p-1.5" onClick={() => setEdit({ ...p })}><Pencil size={14} /></button>
                <button className="btn-ghost !p-1.5" onClick={() => openHist(p)}><History size={14} /></button>
              </div></td>
            </tr>
          ))}
        </Table>
        {!items.length && <Empty />}
      </div>

      {edit && (
        <Modal open onClose={() => setEdit(null)} title={`Price — ${edit.name}`}
          footer={<><button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" onClick={save}>Save Prices</button></>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Purchase ₹"><input className="inp" type="number" value={edit.purchasePrice} onChange={(e) => setEdit({ ...edit, purchasePrice: e.target.value })} /></Field>
            <Field label="MRP ₹"><input className="inp" type="number" value={edit.mrp} onChange={(e) => setEdit({ ...edit, mrp: e.target.value })} /></Field>
            <Field label="Selling ₹ (≤ MRP)"><input className="inp" type="number" value={edit.sellingPrice} onChange={(e) => setEdit({ ...edit, sellingPrice: e.target.value })} /></Field>
            <Field label="Offer/Special price ₹"><input className="inp" type="number" value={edit.offerPrice ?? ''} onChange={(e) => setEdit({ ...edit, offerPrice: e.target.value })} /></Field>
            <Field label="Offer from"><input className="inp" type="date" value={String(edit.offerValidFrom || '').slice(0, 10)} onChange={(e) => setEdit({ ...edit, offerValidFrom: e.target.value })} /></Field>
            <Field label="Offer till"><input className="inp" type="date" value={String(edit.offerValidTo || '').slice(0, 10)} onChange={(e) => setEdit({ ...edit, offerValidTo: e.target.value })} /></Field>
            <Field label="Reason (log)" className="col-span-2"><input className="inp" value={edit.reason || ''} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} placeholder="e.g. market rate change" /></Field>
          </div>
        </Modal>
      )}

      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title="Bulk price update / थोक भाव बदलें"
        footer={<><button className="btn-ghost" onClick={() => setBulkOpen(false)}>Cancel</button><button className="btn-danger" onClick={bulkApply}>Apply to {items.filter((p) => !bulk.category || p.category === bulk.category).length} products</button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category (blank = all)"><input className="inp" value={bulk.category} onChange={(e) => setBulk({ ...bulk, category: e.target.value })} /></Field>
          <Field label="Change % (+/-)"><input className="inp" type="number" value={bulk.percent} onChange={(e) => setBulk({ ...bulk, percent: e.target.value })} placeholder="e.g. 5 or -3" /></Field>
        </div>
      </Modal>

      <Modal open={!!histFor} onClose={() => setHistFor(null)} title={`Price history — ${histFor?.name || ''}`}>
        <div className="space-y-1.5">
          {hist.map((h) => (
            <div key={h._id} className="flex justify-between rounded-lg bg-slate-50 dark:bg-ink-700/60 px-3 py-2 text-sm">
              <span><b>{h.field}</b>: {inr(h.oldPrice)} → <span className="text-brand-600 font-bold">{inr(h.newPrice)}</span></span>
              <span className="text-xs text-slate-400">{h.changedBy} • {fmtDT(h.createdAt)}{h.reason && ` • ${h.reason}`}</span>
            </div>
          ))}
          {!hist.length && <Empty text="No changes logged yet" />}
        </div>
      </Modal>
    </div>
  );
}
