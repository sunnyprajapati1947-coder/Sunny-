import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { ArrowDownToLine, ArrowUpFromLine, Search, History } from 'lucide-react';
import { api, errMsg } from '../api.js';
import { Modal, Field, Table, Badge, Empty, PageHead, Tabs } from '../components/ui.jsx';
import { inr, fmtDT, exportCSV } from '../utils.js';

export default function Inventory() {
  const ui = useSelector((s) => s.ui);
  const [tab, setTab] = useState('stock');
  const [stock, setStock] = useState(null);
  const [moves, setMoves] = useState([]);
  const [q, setQ] = useState('');
  const [adj, setAdj] = useState(null);
  const [form, setForm] = useState({ type: 'in', qty: '', reason: '' });

  const load = () => {
    api.get('/reports/stock').then((r) => setStock(r.data));
    api.get('/reports/stock-moves', { params: { limit: 120 } }).then((r) => setMoves(r.data));
  };
  useEffect(load, []);

  const rows = (stock?.rows || []).filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || r.category?.toLowerCase().includes(q.toLowerCase()));
  const view = tab === 'low' ? rows.filter((r) => r.low) : rows;

  const saveAdj = async () => {
    try {
      await api.post(`/products/${adj.productId}/stock`, form);
      setAdj(null); setForm({ type: 'in', qty: '', reason: '' }); load();
    } catch (e) { alert(errMsg(e)); }
  };

  return (
    <div>
      <PageHead title="Inventory / स्टॉक" sub={`Cost value ${inr(stock?.totalCostValue || 0)} • Retail value ${inr(stock?.totalRetailValue || 0)}`}>
        <button className="btn-ghost" onClick={() => exportCSV('stock-report', view)}><ArrowUpFromLine size={15} /> Export</button>
      </PageHead>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs tabs={[{ id: 'stock', label: 'All Stock' }, { id: 'low', label: `Low Stock (${stock?.lowStock?.length || 0})` }, { id: 'moves', label: 'Stock In/Out Log' }]} active={tab} onChange={setTab} />
        <div className="relative ml-auto min-w-[200px]"><Search className="absolute left-3 top-2.5 text-slate-400" size={15} /><input className="inp !pl-9" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>

      {tab !== 'moves' ? (
        <div className="card overflow-hidden">
          <Table head={['Product', 'Category', 'Stock', 'Status', 'Cost Value', 'Retail Value', '']}>
            {view.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-ink-700/40">
                <td className="td font-bold">{r.name}</td>
                <td className="td">{r.category}</td>
                <td className="td font-semibold">{r.quantity} {r.unit}</td>
                <td className="td">{r.low ? <Badge tone="rose">LOW</Badge> : <Badge tone="green">OK</Badge>}</td>
                <td className="td">{inr(r.value)}</td>
                <td className="td">{inr(r.retailValue)}</td>
                <td className="td"><div className="flex gap-1">
                  <button title="Stock IN" className="btn-ghost !p-1.5 text-emerald-600" onClick={() => setAdj({ ...r, productId: r.productId || r._id })}><ArrowDownToLine size={14} /></button>
                </div></td>
              </tr>
            ))}
          </Table>
          {!view.length && <Empty />}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <Table head={['When', 'Product', 'Type', 'Qty', 'Balance', 'Reason', 'By']}>
            {moves.map((m) => (
              <tr key={m._id}>
                <td className="td text-xs">{fmtDT(m.createdAt)}</td>
                <td className="td font-semibold">{m.productName}</td>
                <td className="td"><Badge tone={m.type === 'out' || m.type === 'sale' ? 'rose' : m.type === 'return' ? 'amber' : 'green'}>{m.type}</Badge></td>
                <td className="td font-bold">{m.qty}</td>
                <td className="td">{m.balance}</td>
                <td className="td text-xs text-slate-500">{m.reason}</td>
                <td className="td text-xs">{m.by}</td>
              </tr>
            ))}
          </Table>
          {!moves.length && <Empty />}
        </div>
      )}

      <Modal open={!!adj} onClose={() => setAdj(null)} title={`Stock adjust — ${adj?.name || ''}`}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type"><select className="inp" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="in">Stock IN / जमा</option><option value="out">Stock OUT / निकाला</option></select></Field>
          <Field label="Quantity"><input className="inp" type="number" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} /></Field>
          <Field label="Reason" className="col-span-2"><input className="inp" placeholder="Damage / personal use / correction…" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
        </div>
        <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setAdj(null)}>Cancel</button><button className="btn-primary" onClick={saveAdj}>Save</button></div>
      </Modal>
    </div>
  );
}
