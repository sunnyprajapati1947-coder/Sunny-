import React, { useEffect, useRef, useState } from 'react';
import { Search, Printer, Tags } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { useReactToPrint } from 'react-to-print';
import { api } from '../api.js';
import { PageHead, Empty } from '../components/ui.jsx';
import { inr } from '../utils.js';

// Barcode sticker printing for loose/unlabelled items (dal, rice, spices…)
function BarcodeSVG({ value, height = 40 }) {
  const ref = useRef(null);
  useEffect(() => {
    try {
      if (ref.current && value) JsBarcode(ref.current, value, { format: value.length === 8 ? 'EAN8' : value.length === 13 ? 'EAN13' : 'CODE128', displayValue: true, fontSize: 12, height, margin: 2, width: 1.6 });
    } catch { /* invalid code */ }
  }, [value, height]);
  return <svg ref={ref} />;
}

export default function Labels() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [sel, setSel] = useState({});
  const printRef = useRef(null);
  const doPrint = useReactToPrint({ content: () => printRef.current });

  useEffect(() => {
    const t = setTimeout(() => api.get('/products', { params: { search: q, limit: 100 } }).then((r) => setItems(r.data.items)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  const chosen = items.filter((p) => sel[p._id]);
  const copies = (p) => sel[p._id] || 0;

  return (
    <div>
      <PageHead title="Barcode Label Printing / बारकोड लेबल" sub="Print stickers: name + price + barcode + expiry (batch supported)">
        <button className="btn-primary" disabled={!chosen.length} onClick={doPrint}><Printer size={16} /> Print {chosen.reduce((s, p) => s + copies(p), 0)} labels</button>
      </PageHead>

      <div className="card mb-3 p-3"><div className="relative"><Search className="absolute left-3 top-2.5 text-slate-400" size={16} /><input className="inp !pl-9" placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div></div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="card divide-y divide-slate-100 dark:divide-slate-700 max-h-[65vh] overflow-y-auto">
          {items.map((p) => (
            <div key={p._id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{p.name}</div><div className="font-mono text-[11px] text-slate-400">{p.barcode} • {inr(p.sellingPrice)}/{p.unit}</div></div>
              <label className="flex items-center gap-2 text-xs font-bold">Copies
                <input className="inp !w-16 !py-1 text-center" type="number" min="0" max="50" value={sel[p._id] || ''} onChange={(e) => setSel((s) => ({ ...s, [p._id]: Number(e.target.value) || 0 }))} />
              </label>
            </div>
          ))}
          {!items.length && <Empty />}
        </div>

        <div className="card p-3">
          <h3 className="mb-2 flex items-center gap-2 font-bold"><Tags size={16} /> Preview (50×30mm)</h3>
          <div className="label-sheet max-h-[60vh] overflow-y-auto" ref={printRef} id="print-area">
            {chosen.flatMap((p) => Array.from({ length: copies(p) }, (_, i) => (
              <div key={p._id + i} className="label-cell">
                <div className="text-center" style={{ fontWeight: 700, fontSize: 11 }}>{p.name}</div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>{inr(p.sellingPrice)} <span style={{ fontSize: 9, fontWeight: 400 }}>/{p.unit}</span></div>
                <BarcodeSVG value={p.barcode} height={26} />
                {p.expiryDate && <div style={{ fontSize: 8 }}>EXP: {p.expiryDate}</div>}
              </div>
            )))}
            {!chosen.length && <p className="p-4 text-xs text-slate-400">Select copies on the left to preview labels…</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
