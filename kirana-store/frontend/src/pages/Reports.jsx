import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Download, FileText, Table2, Sheet } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend, PieChart, Pie, Cell } from 'recharts';
import { api } from '../api.js';
import { Stat, Table, Badge, Empty, PageHead, Tabs } from '../components/ui.jsx';
import { inr, inr0, fmtDate, exportCSV, exportExcel, exportPDF } from '../utils.js';

const COLORS = ['#f97316', '#0ea5e9', '#10b981', '#f43f5e', '#8b5cf6', '#eab308', '#14b8a6', '#ec4899', '#84cc16', '#64748b'];
const dstr = (d) => new Date(d).toISOString().slice(0, 10);

export default function Reports() {
  const ui = useSelector((s) => s.ui);
  const [tab, setTab] = useState('sales');
  const [from, setFrom] = useState(dstr(Date.now() - 29 * 864e5));
  const [to, setTo] = useState(dstr(Date.now()));
  const [sum, setSum] = useState(null);
  const [stock, setStock] = useState(null);
  const [expiry, setExpiry] = useState(null);
  const [credit, setCredit] = useState(null);
  const [gst, setGst] = useState(null);

  useEffect(() => {
    const storeId = ui.storeId === 'main' ? '' : ui.storeId;
    api.get('/reports/summary', { params: { from, to, storeId } }).then((r) => setSum(r.data));
    api.get('/reports/gst', { params: { from, to, storeId } }).then((r) => setGst(r.data));
    api.get('/reports/stock').then((r) => setStock(r.data));
    api.get('/reports/expiry').then((r) => setExpiry(r.data));
    api.get('/reports/credit').then((r) => setCredit(r.data));
  }, [from, to, ui.storeId]);

  const exportAs = (kind, title, rows) => {
    const head = rows.length ? Object.keys(rows[0]) : [];
    if (kind === 'csv') exportCSV(title.toLowerCase().replace(/\s+/g, '-'), rows);
    if (kind === 'xlsx') exportExcel(title.toLowerCase().replace(/\s+/g, '-'), rows, title);
    if (kind === 'pdf') exportPDF(title.toLowerCase().replace(/\s+/g, '-'), title, head, rows);
  };

  const tabs = [
    { id: 'sales', label: 'Sales & P&L' }, { id: 'products', label: 'Products' }, { id: 'stock', label: 'Stock & Expiry' },
    { id: 'credit', label: 'Udhar' }, { id: 'gst', label: 'GST' }, { id: 'staff', label: 'Staff' },
  ];

  return (
    <div>
      <PageHead title="Reports & Analytics / रिपोर्ट" sub="Day-wise, product-wise, category-wise, GST, P&L — export PDF / Excel / CSV">
        <input type="date" className="inp !w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="inp !w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
      </PageHead>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Sales / बिक्री" value={inr0(sum?.sales || 0)} sub={`${sum?.billsCount || 0} bills`} tone="brand" />
        <Stat label="Profit / मुनाफा" value={inr0(sum?.profit || 0)} tone="green" />
        <Stat label="GST collected" value={inr0(sum?.tax || 0)} tone="blue" />
        <Stat label="Discounts given" value={inr0(sum?.discount || 0)} tone="amber" />
        <Stat label="Avg bill value" value={inr0(sum?.avgBill || 0)} sub={sum?.growthPct != null ? `${sum.growthPct > 0 ? '+' : ''}${sum.growthPct}% vs prev` : ''} tone="rose" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
        <div className="ml-auto flex gap-1">
          <button className="btn-ghost !py-1.5 text-xs" onClick={() => exportAs('pdf', 'Sales Report', (sum?.dailySeries || []).map((d) => ({ Date: d.date, Total: d.total })))}><FileText size={13} /> PDF</button>
          <button className="btn-ghost !py-1.5 text-xs" onClick={() => exportAs('xlsx', 'Sales Report', (sum?.dailySeries || []).map((d) => ({ Date: d.date, Total: d.total })))}><Sheet size={13} /> Excel</button>
          <button className="btn-ghost !py-1.5 text-xs" onClick={() => exportAs('csv', 'Sales Report', (sum?.dailySeries || []).map((d) => ({ Date: d.date, Total: d.total })))}><Download size={13} /> CSV</button>
        </div>
      </div>

      {tab === 'sales' && (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="card p-4">
            <h3 className="mb-3 font-bold">Daily sales trend / दैनिक बिक्री</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={sum?.dailySeries || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" /><XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} /><YAxis tick={{ fontSize: 10 }} width={50} />
                <Tooltip formatter={(v) => inr(v)} /><Line type="monotone" dataKey="total" stroke="#f97316" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="card p-4">
            <h3 className="mb-3 font-bold">Payment mode collection / भुगतान संग्रह</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={Object.entries(sum?.paymentSplit || {}).map(([mode, value]) => ({ mode, value }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" /><XAxis dataKey="mode" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 10 }} width={50} />
                <Tooltip formatter={(v) => inr(v)} /><Bar dataKey="value" radius={[6, 6, 0, 0]}>{Object.entries(sum?.paymentSplit || {}).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card p-4 xl:col-span-2">
            <h3 className="mb-3 font-bold">Category-wise sales / श्रेणी अनुसार</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart><Pie data={sum?.categorySplit || []} dataKey="value" nameKey="name" outerRadius={90} label={(e) => e.name}>{(sum?.categorySplit || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={(v) => inr(v)} /></PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 overflow-y-auto max-h-[240px]">
                {(sum?.categorySplit || []).map((c, i) => (
                  <div key={c.name} className="flex items-center gap-2 text-sm"><span className="h-3 w-3 rounded" style={{ background: COLORS[i % COLORS.length] }} /><span className="flex-1 font-semibold">{c.name}</span><span className="font-bold">{inr0(c.value)}</span></div>
                ))}
              </div>
            </div>
          </div>
          <div className="card p-4 xl:col-span-2 flex flex-wrap gap-4 items-center justify-between">
            <div><div className="text-[11px] font-bold uppercase text-slate-400">This period</div><div className="text-2xl font-black">{inr(sum?.sales || 0)}</div></div>
            <div><div className="text-[11px] font-bold uppercase text-slate-400">Previous period</div><div className="text-2xl font-black text-slate-400">{inr(sum?.prevSales || 0)}</div></div>
            <div><div className="text-[11px] font-bold uppercase text-slate-400">Growth</div><div className={`text-2xl font-black ${sum?.growthPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{sum?.growthPct != null ? `${sum.growthPct > 0 ? '+' : ''}${sum.growthPct}%` : '—'}</div></div>
            <div><div className="text-[11px] font-bold uppercase text-slate-400">Returns</div><div className="text-2xl font-black text-amber-600">{sum?.returnsCount || 0}</div></div>
          </div>
        </div>
      )}

      {tab === 'products' && (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="card overflow-hidden">
            <h3 className="p-4 pb-2 font-bold">Best selling / सबसे बिकने वाले</h3>
            <Table head={['Product', 'Qty', 'Revenue', 'Profit']}>
              {(sum?.topProducts || []).map((p, i) => (
                <tr key={i}><td className="td font-bold">{i + 1}. {p.name}</td><td className="td">{p.qty}</td><td className="td font-bold">{inr(p.revenue)}</td><td className="td text-emerald-600">{inr(p.profit)}</td></tr>
              ))}
            </Table>
            <div className="p-2"><button className="btn-ghost text-xs" onClick={() => exportAs('xlsx', 'Top Products', sum?.topProducts || [])}><Sheet size={13} /> Export</button></div>
          </div>
          <div className="card overflow-hidden">
            <h3 className="p-4 pb-2 font-bold">Slow moving / कम बिकने वाले (no sales in period)</h3>
            <Table head={['Product', 'Category', 'Stock']}>
              {(sum?.slowMoving || []).map((p, i) => (
                <tr key={i}><td className="td font-bold">{p.name}</td><td className="td">{p.category}</td><td className="td"><Badge tone="amber">{p.quantity}</Badge></td></tr>
              ))}
            </Table>
            {!sum?.slowMoving?.length && <Empty />}
          </div>
        </div>
      )}

      {tab === 'stock' && (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="card overflow-hidden">
            <h3 className="p-4 pb-2 font-bold">Stock report — value {inr0(stock?.totalCostValue || 0)} (cost) / {inr0(stock?.totalRetailValue || 0)} (retail)</h3>
            <div className="max-h-[420px] overflow-y-auto">
              <Table head={['Product', 'Stock', 'Cost Value', 'Retail Value']}>
                {(stock?.rows || []).map((r, i) => (
                  <tr key={i}><td className="td font-semibold">{r.name}</td><td className="td">{r.low ? <Badge tone="rose">{r.quantity} {r.unit}</Badge> : `${r.quantity} ${r.unit}`}</td><td className="td">{inr(r.value)}</td><td className="td">{inr(r.retailValue)}</td></tr>
                ))}
              </Table>
            </div>
            <div className="flex gap-2 p-3">
              <button className="btn-ghost text-xs" onClick={() => exportAs('pdf', 'Stock Report', stock?.rows || [])}><FileText size={13} /> PDF</button>
              <button className="btn-ghost text-xs" onClick={() => exportAs('xlsx', 'Stock Report', stock?.rows || [])}><Sheet size={13} /> Excel</button>
              <button className="btn-ghost text-xs" onClick={() => exportAs('csv', 'Stock Report', stock?.rows || [])}><Download size={13} /> CSV</button>
            </div>
          </div>
          <div className="card p-4">
            <h3 className="mb-3 font-bold">Expiry report / एक्सपायरी</h3>
            {[['expired', 'Expired', 'rose'], ['d7', 'Within 7 days', 'rose'], ['d15', 'Within 15 days', 'amber'], ['d30', 'Within 30 days', 'amber']].map(([k, label, tone]) => (
              <div key={k} className="mb-3">
                <div className="mb-1 flex items-center gap-2 text-sm font-bold"><Badge tone={tone}>{label}</Badge> ({expiry?.[k]?.length || 0})</div>
                <div className="space-y-1">
                  {(expiry?.[k] || []).slice(0, 6).map((p, i) => (
                    <div key={i} className="flex justify-between rounded-lg bg-slate-50 dark:bg-ink-700/60 px-3 py-1.5 text-sm"><span className="font-semibold truncate">{p.name}</span><span className="text-xs text-slate-400">{fmtDate(p.expiryDate)} • {p.quantity} left</span></div>
                  ))}
                  {!expiry?.[k]?.length && <p className="text-xs text-slate-400">None ✓</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'credit' && (
        <div className="card overflow-hidden">
          <h3 className="p-4 pb-2 font-bold">Udhar report / उधार रिपोर्ट — total {inr(credit?.total || 0)}</h3>
          <Table head={['Customer', 'Phone', 'Pending', 'Loyalty']}>
            {(credit?.rows || []).map((c) => (
              <tr key={c._id}><td className="td font-bold">{c.name}</td><td className="td font-mono text-xs">{c.phone}</td><td className="td font-black text-rose-600">{inr(c.creditBalance)}</td><td className="td">{c.loyaltyPoints}</td></tr>
            ))}
          </Table>
          {!credit?.rows?.length && <Empty text="No pending udhar 🎉" />}
          <div className="flex gap-2 p-3">
            <button className="btn-ghost text-xs" onClick={() => exportAs('pdf', 'Udhar Report', (credit?.rows || []).map((c) => ({ Name: c.name, Phone: c.phone, Pending: c.creditBalance })))}><FileText size={13} /> PDF</button>
            <button className="btn-ghost text-xs" onClick={() => exportAs('csv', 'Udhar Report', (credit?.rows || []).map((c) => ({ Name: c.name, Phone: c.phone, Pending: c.creditBalance })))}><Download size={13} /> CSV</button>
          </div>
        </div>
      )}

      {tab === 'gst' && (
        <div className="card overflow-hidden">
          <h3 className="p-4 pb-2 font-bold">GST report (tax filing) / जीएसटी रिपोर्ट — {from} to {to}</h3>
          <Table head={['GST Rate', 'Taxable Value', 'Tax Amount']}>
            {(gst || []).map((g, i) => (
              <tr key={i}><td className="td font-bold">{g.rate}%</td><td className="td">{inr(g.taxable)}</td><td className="td font-black text-brand-600">{inr(g.tax)}</td></tr>
            ))}
          </Table>
          {!gst?.length && <Empty />}
          <div className="flex gap-2 p-3">
            <button className="btn-ghost text-xs" onClick={() => exportAs('pdf', 'GST Report', (gst || []).map((g) => ({ Rate: g.rate + '%', Taxable: g.taxable, Tax: g.tax })))}><FileText size={13} /> PDF</button>
            <button className="btn-ghost text-xs" onClick={() => exportAs('xlsx', 'GST Report', (gst || []).map((g) => ({ Rate: g.rate + '%', Taxable: g.taxable, Tax: g.tax })))}><Sheet size={13} /> Excel</button>
          </div>
        </div>
      )}

      {tab === 'staff' && (
        <div className="card overflow-hidden">
          <h3 className="p-4 pb-2 font-bold">Employee sales performance / स्टाफ परफॉरमेंस</h3>
          <Table head={['Cashier', 'Sales']}>
            {Object.entries(sum?.cashierSplit || {}).map(([name, value]) => (
              <tr key={name}><td className="td font-bold">{name}</td><td className="td font-black text-emerald-600">{inr(value)}</td></tr>
            ))}
          </Table>
        </div>
      )}
    </div>
  );
}
