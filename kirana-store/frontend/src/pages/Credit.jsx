import React, { useEffect, useState } from 'react';
import { Wallet, MessageCircle, Plus, Search } from 'lucide-react';
import { api, errMsg } from '../api.js';
import { Modal, Field, Table, Badge, Empty, PageHead } from '../components/ui.jsx';
import { inr, fmtDT, waLink } from '../utils.js';
import { useDispatch } from 'react-redux';
import { toast } from '../store.js';

// Kirana-special: Udhar / credit ledger with partial payments + WhatsApp reminders
export default function Credit() {
  const dispatch = useDispatch();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [pay, setPay] = useState({ amount: '', mode: 'cash', note: '' });

  const load = () => api.get('/customers', { params: { credit: 'true', search: q } }).then((r) => setRows(r.data));
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q]);
  const total = rows.reduce((s, c) => s + c.creditBalance, 0);

  const openDetail = async (c) => { const { data } = await api.get(`/customers/${c._id}/credit`); setDetail(data); };

  const submitPay = async () => {
    try {
      const { data } = await api.post(`/customers/${payFor._id}/credit/payment`, pay);
      dispatch(toast({ msg: `Payment recorded. Balance ${inr(data.balance)}`, kind: 'ok' }));
      setPayFor(null); setPay({ amount: '', mode: 'cash', note: '' }); load();
      if (detail) openDetail(payFor);
    } catch (e) { dispatch(toast({ msg: errMsg(e), kind: 'error' })); }
  };

  const remind = (c) => {
    const text = `Namaste ${c.name} ji 🙏\n${'Rishu Kirana Store'} (Gaya Road, Nawada) se aapke khate mein baaki raashi: *${inr(c.creditBalance)}*\nKripya jald bhugtan karein. Dhanyavad!`;
    window.open(waLink(c.phone, text), '_blank');
  };

  return (
    <div>
      <PageHead title="Udhar / Credit Khata / उधार खाता" sub={`Total pending: ${inr(total)} across ${rows.length} customers`}>
        <div className="relative"><Search className="absolute left-3 top-2.5 text-slate-400" size={15} /><input className="inp !pl-9" placeholder="Search customer…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </PageHead>
      <div className="card overflow-hidden">
        <Table head={['Customer', 'Phone', 'Pending Udhar', 'Loyalty', 'Actions']}>
          {rows.map((c) => (
            <tr key={c._id} className="hover:bg-slate-50 dark:hover:bg-ink-700/40">
              <td className="td font-bold">{c.name}</td>
              <td className="td font-mono text-xs">{c.phone}</td>
              <td className="td text-base font-black text-rose-600">{inr(c.creditBalance)}</td>
              <td className="td">{c.loyaltyPoints}</td>
              <td className="td"><div className="flex gap-1">
                <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => openDetail(c)}>Ledger</button>
                <button className="btn-success !py-1 !px-2 text-xs" onClick={() => setPayFor(c)}><Plus size={12} /> Payment</button>
                <button className="btn-primary !py-1 !px-2 text-xs" onClick={() => remind(c)}><MessageCircle size={12} /> Reminder</button>
              </div></td>
            </tr>
          ))}
        </Table>
        {!rows.length && <Empty text="No pending udhar / कोई उधार बाकी नहीं 🎉" />}
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Khata — ${detail?.customer?.name || ''}`} wide>
        {detail && (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="mb-2 font-bold">Credit bills / उधार बिल</h4>
              <div className="max-h-64 space-y-1.5 overflow-y-auto">
                {detail.creditBills.map((b) => (
                  <div key={b._id} className="flex justify-between rounded-lg bg-rose-50 dark:bg-rose-900/30 px-3 py-2 text-sm">
                    <span className="font-bold">{b.billNumber}</span><span className="text-xs text-slate-400">{fmtDT(b.billDate)}</span><span className="font-extrabold text-rose-600">{inr(b.creditAmount)}</span>
                  </div>
                ))}
                {!detail.creditBills.length && <Empty />}
              </div>
            </div>
            <div>
              <h4 className="mb-2 font-bold">Payments received / जमा</h4>
              <div className="max-h-64 space-y-1.5 overflow-y-auto">
                {detail.payments.map((p) => (
                  <div key={p._id} className="flex justify-between rounded-lg bg-emerald-50 dark:bg-emerald-900/30 px-3 py-2 text-sm">
                    <span className="font-bold">{inr(p.amount)} <Badge tone="green">{p.mode}</Badge></span><span className="text-xs text-slate-400">{fmtDT(p.createdAt)} • {p.by}</span>
                  </div>
                ))}
                {!detail.payments.length && <Empty />}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!payFor} onClose={() => setPayFor(null)} title={`Receive payment — ${payFor?.name || ''} (due ${inr(payFor?.creditBalance || 0)})`}
        footer={<><button className="btn-ghost" onClick={() => setPayFor(null)}>Cancel</button><button className="btn-success" onClick={submitPay}><Wallet size={15} /> Record Payment</button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount ₹ (partial allowed)"><input className="inp" type="number" autoFocus value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
          <Field label="Mode"><select className="inp" value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value })}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select></Field>
          <Field label="Note" className="col-span-2"><input className="inp" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}
