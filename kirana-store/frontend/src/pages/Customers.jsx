import React, { useEffect, useState } from 'react';
import { Plus, Search, Pencil, Star, History } from 'lucide-react';
import { api, errMsg } from '../api.js';
import { Modal, Field, Table, Badge, Empty, PageHead } from '../components/ui.jsx';
import { inr, fmtDT } from '../utils.js';
import { useDispatch } from 'react-redux';
import { toast } from '../store.js';

const BLANK = { name: '', phone: '', email: '', address: '', tag: 'regular', discountPct: 0 };

export default function Customers() {
  const dispatch = useDispatch();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [histFor, setHistFor] = useState(null);
  const [hist, setHist] = useState(null);

  const load = () => api.get('/customers', { params: { search: q } }).then((r) => setItems(r.data));
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q]);

  const save = async () => {
    try {
      if (edit._id) await api.put('/customers/' + edit._id, edit); else await api.post('/customers', edit);
      dispatch(toast({ msg: 'Customer saved', kind: 'ok' })); setEdit(null); load();
    } catch (e) { dispatch(toast({ msg: e.response?.data?.error || errMsg(e), kind: 'error' })); }
  };
  const openHist = async (c) => { const { data } = await api.get('/customers/' + c._id); setHist(data); setHistFor(c); };

  return (
    <div>
      <PageHead title="Customers / कस्टमर" sub={`${items.length} registered`}>
        <button className="btn-primary" onClick={() => setEdit({ ...BLANK })}><Plus size={16} /> Add Customer</button>
      </PageHead>
      <div className="card mb-3 p-3"><div className="relative"><Search className="absolute left-3 top-2.5 text-slate-400" size={16} /><input className="inp !pl-9" placeholder="Search by name / phone number…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div></div>
      <div className="card overflow-hidden">
        <Table head={['Name', 'Phone', 'Tag', 'Purchases', 'Loyalty Pts', 'Udhar', 'Disc%', '']}>
          {items.map((c) => (
            <tr key={c._id} className="hover:bg-slate-50 dark:hover:bg-ink-700/40">
              <td className="td font-bold">{c.name}<div className="text-[11px] font-normal text-slate-400">{c.address}</div></td>
              <td className="td font-mono text-xs">{c.phone}</td>
              <td className="td">{c.tag === 'vip' ? <Badge tone="amber"><Star size={10} /> VIP</Badge> : <Badge>Regular</Badge>}</td>
              <td className="td">{inr(c.totalPurchases)} <span className="text-[11px] text-slate-400">({c.billsCount || 0} bills)</span></td>
              <td className="td font-bold text-sky-600">{c.loyaltyPoints || 0}</td>
              <td className="td">{c.creditBalance > 0 ? <Badge tone="rose">{inr(c.creditBalance)}</Badge> : <Badge tone="green">clear</Badge>}</td>
              <td className="td">{c.discountPct || 0}%</td>
              <td className="td"><div className="flex gap-1">
                <button className="btn-ghost !p-1.5" title="History" onClick={() => openHist(c)}><History size={14} /></button>
                <button className="btn-ghost !p-1.5" onClick={() => setEdit(c)}><Pencil size={14} /></button>
              </div></td>
            </tr>
          ))}
        </Table>
        {!items.length && <Empty text="No customers / कोई कस्टमर नहीं" />}
      </div>

      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit._id ? `Edit — ${edit.name}` : 'Add Customer / कस्टमर जोड़ें'}
          footer={<><button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name *"><input className="inp" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Phone (10 digit) *"><input className="inp" maxLength={10} value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="Email"><input className="inp" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label="Tag"><select className="inp" value={edit.tag} onChange={(e) => setEdit({ ...edit, tag: e.target.value })}><option value="regular">Regular</option><option value="vip">VIP</option></select></Field>
            <Field label="Customer-wise discount %"><input className="inp" type="number" value={edit.discountPct} onChange={(e) => setEdit({ ...edit, discountPct: e.target.value })} /></Field>
            <Field label="Address" className="col-span-2"><textarea className="inp" rows={2} value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      <Modal open={!!histFor} onClose={() => setHistFor(null)} title={`History — ${histFor?.name || ''}`} wide>
        {hist && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card p-3 text-center"><div className="text-[11px] font-bold uppercase text-slate-400">Total purchases</div><div className="text-xl font-black">{inr(hist.totalPurchases)}</div></div>
            <div className="card p-3 text-center"><div className="text-[11px] font-bold uppercase text-slate-400">Loyalty points</div><div className="text-xl font-black text-sky-600">{hist.loyaltyPoints}</div></div>
            <div className="card p-3 text-center"><div className="text-[11px] font-bold uppercase text-slate-400">Udhar balance</div><div className="text-xl font-black text-rose-600">{inr(hist.creditBalance)}</div></div>
            <div className="sm:col-span-3">
              <h4 className="mb-2 font-bold">Purchase history / खरीद इतिहास</h4>
              <div className="max-h-64 space-y-1.5 overflow-y-auto">
                {hist.bills?.map((b) => (
                  <div key={b._id} className="flex justify-between rounded-lg bg-slate-50 dark:bg-ink-700/60 px-3 py-2 text-sm">
                    <span className="font-bold">{b.billNumber}</span><span className="text-xs text-slate-400">{fmtDT(b.billDate)}</span><span className="font-extrabold">{inr(b.grandTotal)}</span>
                  </div>
                ))}
                {!hist.bills?.length && <Empty text="No purchases yet" />}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
