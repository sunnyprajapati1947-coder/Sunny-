import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useReactToPrint } from 'react-to-print';
import {
  ScanBarcode, Camera, Trash2, Plus, Minus, PauseCircle, PlayCircle, Wallet, UserPlus,
  History, Undo2, Printer, MessageCircle, Scale, Search, TicketPercent,
} from 'lucide-react';
import { api, errMsg } from '../api.js';
import { addScan, setQty, setLineDiscount, removeLine, setCustomer, setCoupon, setBillDiscount, clearCart, loadHeld, setNote, toast } from '../store.js';
import { inr, beep, useHardwareScanner, waLink } from '../utils.js';
import { Modal, Field, Badge, Empty } from '../components/ui.jsx';
import CameraScanner from '../components/Scanner.jsx';
import Receipt from '../components/Receipt.jsx';

export default function POS() {
  const dispatch = useDispatch();
  const cart = useSelector((s) => s.cart);
  const ui = useSelector((s) => s.ui);
  const user = useSelector((s) => s.auth.user);
  const [code, setCode] = useState('');
  const [calc, setCalc] = useState(null);
  const [camOpen, setCamOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [custOpen, setCustOpen] = useState(false);
  const [weightFor, setWeightFor] = useState(null);
  const [weight, setWeight] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [settings, setSettings] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [custSearch, setCustSearch] = useState('');
  const [searchProd, setSearchProd] = useState('');
  const [prodResults, setProdResults] = useState([]);
  const inputRef = useRef(null);
  const receiptRef = useRef(null);

  useEffect(() => { api.get('/settings').then((r) => setSettings(r.data)).catch(() => {}); }, []);
  useEffect(() => { api.get('/customers', { params: { search: custSearch } }).then((r) => setCustomers(r.data)).catch(() => {}); }, [custSearch]);

  // server-side authoritative totals preview
  useEffect(() => {
    if (!cart.items.length) { setCalc(null); return; }
    const t = setTimeout(() => {
      api.post('/offers/preview', { lines: cart.items.map((i) => ({ productId: i.productId, qty: i.qty, discountPct: i.discountPct })), couponCode: cart.coupon, billDiscountPct: cart.billDiscountPct, customerId: cart.customerId })
        .then((r) => setCalc(r.data)).catch(() => {});
    }, 220);
    return () => clearTimeout(t);
  }, [cart.items, cart.coupon, cart.billDiscountPct, cart.customerId]);

  const handleScan = async (raw) => {
    const value = String(raw).trim();
    if (!value) return;
    try {
      const { data } = await api.get('/pos/lookup', { params: { barcode: value } });
      if (data.product.isWeighed) { setWeightFor({ product: data.product, price: data.price }); setWeight(''); }
      else { dispatch(addScan({ product: data.product, price: data.price })); beep('ok', ui.sound); }
    } catch (e) {
      beep('error', ui.sound);
      dispatch(toast({ msg: `Barcode not found: ${value} — add product manually?`, kind: 'error' }));
      setSearchProd(value);
    }
    setCode('');
    inputRef.current?.focus();
  };
  useHardwareScanner(handleScan, !payOpen && !camOpen);

  // product name search (F4)
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchProd.length < 2) { setProdResults([]); return; }
      api.get('/products', { params: { search: searchProd, active: 'true', limit: 8 } }).then((r) => setProdResults(r.data.items)).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [searchProd]);

  // keyboard shortcuts F1-F4
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'F1') { e.preventDefault(); dispatch(clearCart()); }
      if (e.key === 'F2') { e.preventDefault(); hold(); }
      if (e.key === 'F3') { e.preventDefault(); if (cart.items.length) setPayOpen(true); }
      if (e.key === 'F4') { e.preventDefault(); setSearchProd(''); document.getElementById('pos-search')?.focus(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const hold = async () => {
    if (!cart.items.length) return;
    try {
      await api.post('/pos/bills/hold', { items: cart.items, customerId: cart.customerId, customerName: cart.customerName });
      dispatch(clearCart());
      dispatch(toast({ msg: 'Bill held / बिल होल्ड हुआ', kind: 'ok' }));
    } catch (e) { dispatch(toast({ msg: errMsg(e), kind: 'error' })); }
  };

  const doPrint = useReactToPrint({ content: () => receiptRef.current });

  const onPaid = (bill) => {
    setPayOpen(false);
    setReceipt(bill);
    dispatch(clearCart());
    beep('pay', ui.sound);
  };

  const grand = calc?.grandTotal || 0;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
      {/* LEFT: scan + cart */}
      <div className="space-y-3">
        <div className="card p-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <ScanBarcode className="absolute left-3 top-2.5 text-brand-600" size={20} />
              <input ref={inputRef} className="inp !pl-10 !py-2.5 text-base font-semibold" placeholder="Scan barcode / बारकोड स्कैन करें (Enter)"
                value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleScan(code); }} autoFocus />
            </div>
            <button className="btn-primary btn-lg" onClick={() => setCamOpen(true)}><Camera size={20} /> Scan</button>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input id="pos-search" className="inp !pl-9" placeholder="Search product by name / नाम से खोजें (F4)" value={searchProd} onChange={(e) => setSearchProd(e.target.value)} />
            {prodResults.length > 0 && (
              <div className="absolute z-20 mt-1 w-full card divide-y divide-slate-100 dark:divide-slate-700 max-h-64 overflow-y-auto">
                {prodResults.map((p) => (
                  <button key={p._id} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-ink-700"
                    onClick={() => { dispatch(addScan({ product: p, price: p.offerPrice || p.sellingPrice })); beep('ok', ui.sound); setSearchProd(''); setProdResults([]); inputRef.current?.focus(); }}>
                    <span className="truncate font-semibold">{p.name} <span className="text-slate-400 text-xs">({p.barcode})</span></span>
                    <span className="font-bold text-brand-600">{inr(p.sellingPrice)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="bg-slate-50 dark:bg-ink-700/50 border-b border-slate-200 dark:border-slate-700">
                <tr><th className="th">Item / आइटम</th><th className="th">Rate</th><th className="th">Qty</th><th className="th">Disc%</th><th className="th">Total</th><th className="th"></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {cart.items.map((i) => (
                  <tr key={i.productId}>
                    <td className="td"><div className="font-bold">{i.name}</div><div className="text-[11px] text-slate-400">{i.barcode}{i.stock <= 0 ? ' • no stock' : ` • ${i.stock} ${i.unit} in stock`}</div></td>
                    <td className="td font-semibold">{inr(i.price)}</td>
                    <td className="td">
                      <div className="flex items-center gap-1">
                        <button className="btn-ghost !p-1" onClick={() => dispatch(setQty({ productId: i.productId, qty: i.qty - (i.unit === 'kg' ? 0.5 : 1) }))}><Minus size={14} /></button>
                        <input className="inp !w-16 !px-1 !py-1 text-center font-bold" value={i.qty}
                          onChange={(e) => dispatch(setQty({ productId: i.productId, qty: e.target.value }))} />
                        <button className="btn-ghost !p-1" onClick={() => dispatch(setQty({ productId: i.productId, qty: i.qty + (i.unit === 'kg' ? 0.5 : 1) }))}><Plus size={14} /></button>
                      </div>
                    </td>
                    <td className="td"><input className="inp !w-16 !px-1 !py-1 text-center" value={i.discountPct} onChange={(e) => dispatch(setLineDiscount({ productId: i.productId, discountPct: e.target.value }))} /></td>
                    <td className="td font-extrabold">{inr(i.price * i.qty * (1 - i.discountPct / 100))}</td>
                    <td className="td"><button className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/40 rounded p-1" onClick={() => dispatch(removeLine(i.productId))}><Trash2 size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!cart.items.length && <Empty text="Cart empty — scan a product / कार्ट खाली है" />}
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => dispatch(clearCart())}><Trash2 size={16} /> Clear (F1)</button>
          <button className="btn-ghost" onClick={hold} disabled={!cart.items.length}><PauseCircle size={16} /> Hold (F2)</button>
          <button className="btn-ghost" onClick={() => setHeldOpen(true)}><PlayCircle size={16} /> Held bills</button>
          <button className="btn-ghost" onClick={() => setHistOpen(true)}><History size={16} /> Bills / Returns</button>
        </div>
      </div>

      {/* RIGHT: customer + totals + pay */}
      <div className="space-y-3">
        <div className="card p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Badge tone={cart.customerId ? 'green' : 'slate'}>{cart.customerName || 'Walk-in / सामान्य ग्राहक'}</Badge>
            <button className="btn-ghost !py-1 !px-2 text-xs ml-auto" onClick={() => setCustOpen(true)}><UserPlus size={14} /> Attach</button>
            {cart.customerId && <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => dispatch(setCustomer(null))}>✕</button>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <TicketPercent className="absolute left-2.5 top-2.5 text-slate-400" size={15} />
              <input className="inp !pl-8" placeholder="Coupon code" value={cart.coupon} onChange={(e) => dispatch(setCoupon(e.target.value.toUpperCase()))} />
            </div>
            <input className="inp" placeholder="Bill discount %" type="number" min="0" max="90" value={cart.billDiscountPct || ''} onChange={(e) => dispatch(setBillDiscount(e.target.value))} />
          </div>
        </div>

        <div className="card p-4 space-y-1.5 text-sm">
          <Row l="Subtotal / उप-योग" v={inr(calc?.subtotal || 0)} />
          <Row l="Item discounts + offers" v={'-' + inr(calc?.itemDiscount || 0)} tone="text-emerald-600" />
          <Row l={`Bill discount${calc?.billDiscountPct ? ` (${calc.billDiscountPct}%)` : ''}`} v={'-' + inr(calc?.billDiscountValue || 0)} tone="text-emerald-600" />
          {calc?.couponValue > 0 && <Row l={`Coupon ${calc.couponCode}`} v={'-' + inr(calc.couponValue)} tone="text-emerald-600" />}
          <Row l="GST (included) / कर" v={inr(calc?.totalTax || 0)} tone="text-slate-500" />
          <div className="!my-2 border-t border-dashed border-slate-300 dark:border-slate-600" />
          <div className="flex items-center justify-between">
            <span className="text-base font-extrabold">GRAND TOTAL / कुल</span>
            <span className="text-3xl font-black text-brand-600">{inr(grand)}</span>
          </div>
          {calc?.roundOff ? <Row l="Round off" v={(calc.roundOff > 0 ? '+' : '') + calc.roundOff.toFixed(2)} tone="text-slate-500" /> : null}
          <button className="btn-success btn-lg w-full mt-2" disabled={!cart.items.length} onClick={() => setPayOpen(true)}>
            <Wallet size={20} /> Payment / भुगतान (F3)
          </button>
        </div>
      </div>

      <CameraScanner open={camOpen} onClose={() => { setCamOpen(false); inputRef.current?.focus(); }} onScan={handleScan} />

      {/* weight entry for loose items */}
      <Modal open={!!weightFor} onClose={() => setWeightFor(null)} title={`Weighing / वजन — ${weightFor?.product?.name || ''}`}>
        <Field label="Weight in kg / वजन (kg)">
          <input className="inp text-lg font-bold" type="number" step="0.001" autoFocus value={weight} onChange={(e) => setWeight(e.target.value)} />
        </Field>
        {weightFor && Number(weight) > 0 && (
          <p className="mt-3 rounded-lg bg-slate-100 dark:bg-ink-700 p-3 text-sm font-bold">
            {weight} kg × {inr(weightFor.price)}/kg = <span className="text-brand-600 text-lg">{inr(weight * weightFor.price)}</span>
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setWeightFor(null)}>Cancel</button>
          <button className="btn-primary" disabled={!Number(weight)} onClick={() => {
            dispatch(addScan({ product: weightFor.product, price: weightFor.price }));
            dispatch(setQty({ productId: weightFor.product._id, qty: Number(weight) }));
            beep('ok', ui.sound); setWeightFor(null); inputRef.current?.focus();
          }}><Scale size={16} /> Add</button>
        </div>
      </Modal>

      {/* customer picker */}
      <Modal open={custOpen} onClose={() => setCustOpen(false)} title="Attach customer / कस्टमर जोड़ें">
        <input className="inp mb-2" placeholder="Search by name or phone / नाम या मोबाइल" value={custSearch} onChange={(e) => setCustSearch(e.target.value)} autoFocus />
        <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
          {customers.map((c) => (
            <button key={c._id} className="flex w-full justify-between px-2 py-2.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-ink-700"
              onClick={() => { dispatch(setCustomer(c)); setCustOpen(false); }}>
              <span><b>{c.name}</b> <span className="text-slate-400">• {c.phone}</span>{c.creditBalance > 0 && <Badge tone="rose"> udhar {inr(c.creditBalance)}</Badge>}</span>
              <Badge tone={c.tag === 'vip' ? 'amber' : 'slate'}>{c.tag}</Badge>
            </button>
          ))}
          {!customers.length && <Empty text="No customers / कोई कस्टमर नहीं" />}
        </div>
      </Modal>

      <HeldBills open={heldOpen} onClose={() => setHeldOpen(false)} onResume={(b) => { dispatch(loadHeld(b)); setHeldOpen(false); }} />
      <BillHistory open={histOpen} onClose={() => setHistOpen(false)} onReceipt={(b) => { setReceipt(b); setHistOpen(false); }} settings={settings} />

      {payOpen && <PaymentModal calc={calc} cart={cart} onClose={() => setPayOpen(false)} onDone={onPaid} settings={settings} />}

      {/* receipt */}
      <Modal open={!!receipt} onClose={() => setReceipt(null)} title={`Bill ${receipt?.billNumber || ''}`}
        footer={<>
          <button className="btn-ghost" onClick={() => window.open(waLink(receipt?.customerPhone || settings?.phone, receiptText(receipt, settings)), '_blank')}><MessageCircle size={16} /> WhatsApp</button>
          <button className="btn-primary" onClick={doPrint}><Printer size={16} /> Print / प्रिंट</button>
        </>}>
        <div className="flex justify-center overflow-auto max-h-[60vh]"><Receipt bill={receipt} settings={settings} ref={receiptRef} /></div>
      </Modal>
    </div>
  );
}

const Row = ({ l, v, tone = '' }) => (
  <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">{l}</span><span className={`font-bold ${tone}`}>{v}</span></div>
);

export function receiptText(bill, settings) {
  if (!bill) return '';
  const s = settings || {};
  return `*${s.storeName || 'Rishu Kirana Store'}*\n${s.address || 'Gaya Road, Nawada'} • ${s.phone || '9608087035'}\nBill: ${bill.billNumber}\nDate: ${new Date(bill.billDate).toLocaleString('en-IN')}\n----------------\n${bill.items.map((i) => `${i.name} x${i.qty} = ${inr(i.total)}`).join('\n')}\n----------------\nTOTAL: ${inr(bill.grandTotal)}\n${bill.creditAmount ? `UDHAAR BAKI: ${inr(bill.creditAmount)}\n` : ''}${s.receiptFooter || 'धन्यवाद! Thank you, visit again.'}`;
}

function HeldBills({ open, onClose, onResume }) {
  const [held, setHeld] = useState([]);
  useEffect(() => { if (open) api.get('/pos/bills/held').then((r) => setHeld(r.data)).catch(() => {}); }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Held bills / होल्ड बिल">
      <div className="space-y-2">
        {held.map((b) => (
          <div key={b._id} className="card flex items-center justify-between p-3">
            <div><div className="font-bold text-sm">{b.customerName || 'Walk-in'} • {b.items?.length} items</div><div className="text-[11px] text-slate-400">{new Date(b.createdAt).toLocaleString('en-IN')} • {b.cashierName}</div></div>
            <div className="flex gap-2">
              <button className="btn-primary !py-1.5 text-xs" onClick={() => onResume(b)}>Resume</button>
              <button className="btn-danger !py-1.5 text-xs" onClick={async () => { await api.delete('/pos/bills/' + b._id); setHeld((h) => h.filter((x) => x._id !== b._id)); }}>Discard</button>
            </div>
          </div>
        ))}
        {!held.length && <Empty text="No held bills" />}
      </div>
    </Modal>
  );
}

export function BillHistory({ open, onClose, onReceipt, settings }) {
  const [bills, setBills] = useState([]);
  const [retFor, setRetFor] = useState(null);
  const [retQty, setRetQty] = useState({});
  useEffect(() => { if (open) api.get('/pos/bills', { params: { limit: 40 } }).then((r) => setBills(r.data)).catch(() => {}); }, [open]);
  const doReturn = async () => {
    const items = Object.entries(retQty).filter(([, q]) => Number(q) > 0).map(([productId, qty]) => ({ productId, qty: Number(qty) }));
    try {
      const { data } = await api.post(`/pos/bills/${retFor._id}/return`, { items, reason: 'Customer return', refundMode: 'cash' });
      onReceipt(data); setRetFor(null); setRetQty({});
    } catch (e) { alert(errMsg(e)); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Recent bills / returns / ताज़ा बिल" wide>
      {retFor ? (
        <div>
          <p className="mb-2 text-sm font-bold">Return items for {retFor.billNumber} / वापसी:</p>
          <div className="space-y-2">
            {retFor.items.map((i) => (
              <div key={i.productId} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex-1 truncate font-semibold">{i.name} (sold {i.qty})</span>
                <input className="inp !w-20" type="number" min="0" max={i.qty} value={retQty[i.productId] || ''} onChange={(e) => setRetQty((q) => ({ ...q, [i.productId]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setRetFor(null)}>Back</button>
            <button className="btn-danger" onClick={doReturn}><Undo2 size={16} /> Process Return</button>
          </div>
        </div>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
          {bills.map((b) => (
            <div key={b._id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div className="min-w-0"><div className="font-bold">{b.billNumber} <Badge tone={b.type === 'return' ? 'rose' : 'green'}>{b.type}</Badge></div><div className="text-[11px] text-slate-400">{new Date(b.billDate).toLocaleString('en-IN')} • {b.cashierName} • {b.customerName || 'Walk-in'}</div></div>
              <div className="font-extrabold">{inr(b.grandTotal)}</div>
              <div className="flex gap-1">
                <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => onReceipt(b)}><Printer size={13} /></button>
                {b.type === 'sale' && <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => setRetFor(b)}><Undo2 size={13} /></button>}
              </div>
            </div>
          ))}
          {!bills.length && <Empty />}
        </div>
      )}
    </Modal>
  );
}

function PaymentModal({ calc, cart, onClose, onDone, settings }) {
  const dispatch = useDispatch();
  const grand = calc?.grandTotal || 0;
  const [rows, setRows] = useState([{ mode: 'cash', amount: grand, ref: '' }]);
  const [busy, setBusy] = useState(false);
  const paid = rows.reduce((s, r) => s + (r.mode === 'credit' ? 0 : Number(r.amount || 0)), 0);
  const creditRow = rows.find((r) => r.mode === 'credit');
  const due = Math.max(0, Math.round((grand - paid) * 100) / 100);
  const change = Math.max(0, Math.round((paid - grand) * 100) / 100);

  const setRow = (i, patch) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    setBusy(true);
    const payments = rows.map((r) => ({ mode: r.mode, amount: r.mode === 'credit' ? due : Number(r.amount || 0), ref: r.ref }));
    try {
      const { data } = await api.post('/pos/bills', {
        items: cart.items.map((i) => ({ productId: i.productId, qty: i.qty, discountPct: i.discountPct })),
        customerId: cart.customerId, couponCode: cart.coupon, billDiscountPct: cart.billDiscountPct,
        payments, note: cart.note, heldBillId: cart.heldBillId,
      });
      onDone(data);
    } catch (e) {
      dispatch(toast({ msg: errMsg(e), kind: 'error' }));
      beep('error');
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Payment / भुगतान — ${inr(grand)}`}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel (ESC)</button>
        <button className="btn-success btn-lg" disabled={busy || (due > 0 && !creditRow)} onClick={submit}>{busy ? '…' : `Complete Sale ✓`}</button>
      </>}>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <select className="inp !w-36" value={r.mode} onChange={(e) => setRow(i, { mode: e.target.value })}>
              <option value="cash">Cash / नकद</option><option value="upi">UPI</option><option value="card">Card</option><option value="credit">Credit / उधार</option>
            </select>
            <input className="inp" type="number" value={r.mode === 'credit' ? (due || '') : r.amount} disabled={r.mode === 'credit'}
              onChange={(e) => setRow(i, { amount: e.target.value })} placeholder="Amount" />
            {(r.mode === 'upi' || r.mode === 'card') && <input className="inp !w-32" placeholder="Ref/Txn" value={r.ref} onChange={(e) => setRow(i, { ref: e.target.value })} />}
            {rows.length > 1 && <button className="btn-ghost !px-2" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}><Trash2 size={15} /></button>}
          </div>
        ))}
        <div className="flex gap-2">
          <button className="btn-ghost text-xs" onClick={() => setRows((rs) => [...rs, { mode: 'upi', amount: due, ref: '' }])}>+ Split payment / स्प्लिट</button>
          <button className="btn-ghost text-xs" onClick={() => setRow(0, { amount: grand })}>Exact amount</button>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 dark:bg-ink-700 p-3 text-sm font-bold">
          <div className="flex justify-between"><span className="text-slate-500">Paid</span><span>{inr(paid)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Change / वापसी</span><span className="text-emerald-600">{inr(change)}</span></div>
          {due > 0 && <div className="col-span-2 flex justify-between text-rose-600"><span>Balance → Udhar / उधार में</span><span>{inr(due)}</span></div>}
        </div>
        {due > 0 && !creditRow && <p className="text-xs font-bold text-rose-500">Add a Credit/Udhar row or pay full amount. / उधार जोड़ें या पूरा भुगतान करें।</p>}
        {due > 0 && !cart.customerId && <p className="text-xs font-bold text-rose-500">Attach a customer for udhar bill. / उधार बिल के लिए कस्टमर जोड़ें।</p>}
        <details className="rounded-xl bg-slate-100 dark:bg-ink-700 p-3">
          <summary className="cursor-pointer text-sm font-bold">📱 UPI QR — customer scan kare / ग्राहक QR स्कैन करे</summary>
          <div className="mt-2 flex items-center gap-3">
            <img src="/upi-qr.png" alt="UPI QR" className="h-36 w-36 rounded-xl bg-white p-1" />
            <p className="text-xs text-slate-500">Rishu Kirana Store ka UPI QR.<br />GPay / PhonePe / Paytm se scan karwayein,<br />phir UPI row me txn id likhein.</p>
          </div>
        </details>
      </div>
    </Modal>
  );
}
