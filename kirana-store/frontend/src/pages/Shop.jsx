import React, { useEffect, useMemo, useState } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, Store, Bike, Search, Package } from 'lucide-react';
import { api, errMsg } from '../api.js';
import { inr } from '../utils.js';
import { Modal, Field, Badge, Empty } from '../components/ui.jsx';

// PUBLIC online ordering (home delivery) — no login needed
export default function Shop() {
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState({});
  const [checkout, setCheckout] = useState(false);
  const [track, setTrack] = useState(null);
  const [trackQ, setTrackQ] = useState({ orderNumber: '', phone: '' });
  const [form, setForm] = useState({ customerName: '', phone: '', address: '', paymentMode: 'cod', note: '' });
  const [placed, setPlaced] = useState(null);

  useEffect(() => {
    api.get('/shop/products').then((r) => setProducts(r.data));
    api.get('/shop/settings').then((r) => setSettings(r.data));
  }, []);

  const cats = useMemo(() => [...new Set(products.map((p) => p.category))], [products]);
  const view = products.filter((p) => (!cat || p.category === cat) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  const lines = Object.entries(cart).map(([id, qty]) => ({ p: products.find((x) => x._id === id), qty })).filter((l) => l.p && l.qty > 0);
  const subtotal = lines.reduce((s, l) => s + l.p.sellingPrice * l.qty, 0);
  const total = subtotal + (lines.length ? Number(settings?.deliveryFee || 0) : 0);

  const add = (id, d) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) + d) }));

  const place = async () => {
    try {
      const { data } = await api.post('/shop/orders', { ...form, items: lines.map((l) => ({ productId: l.p._id, qty: l.qty })) });
      setPlaced(data); setCheckout(false); setCart({});
    } catch (e) { alert(errMsg(e)); }
  };
  const doTrack = async () => {
    try { const { data } = await api.get('/shop/orders/track', { params: trackQ }); setTrack(data); }
    catch { setTrack('none'); }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ink-900">
      <header className="sticky top-0 z-20 bg-brand-600 text-white shadow-lg">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Store size={26} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-black">{settings?.storeName || 'Rishu Kirana Store'}</div>
            <div className="truncate text-xs opacity-90">{settings?.address || 'Gaya Road, Nawada'} • {settings?.phone || '9608087035'} • Home delivery available</div>
          </div>
          <button className="relative rounded-xl bg-white/15 p-2.5" onClick={() => setCheckout(true)}>
            <ShoppingCart size={20} />
            {lines.length > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-xs font-black text-brand-700">{lines.reduce((s, l) => s + l.qty, 0)}</span>}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-4 pb-24">
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1"><Search className="absolute left-3 top-2.5 text-slate-400" size={16} /><input className="inp !pl-9" placeholder="Search dal, chawal, soap…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <button className="btn-ghost" onClick={() => setTrack(track ? null : 'form')}><Package size={16} /> Track order</button>
        </div>

        {track === 'form' && (
          <div className="card mb-4 flex flex-wrap gap-2 p-3">
            <input className="inp !w-40" placeholder="Order no (ORD-…)" value={trackQ.orderNumber} onChange={(e) => setTrackQ({ ...trackQ, orderNumber: e.target.value })} />
            <input className="inp !w-40" placeholder="Phone" value={trackQ.phone} onChange={(e) => setTrackQ({ ...trackQ, phone: e.target.value })} />
            <button className="btn-primary" onClick={doTrack}>Track</button>
          </div>
        )}
        {track && track !== 'form' && track !== 'none' && (
          <div className="card mb-4 p-4">
            <div className="flex items-center justify-between"><b>{track.orderNumber}</b><Badge tone={track.status === 'delivered' ? 'green' : track.status === 'cancelled' ? 'rose' : 'blue'}>{track.status.replace(/_/g, ' ')}</Badge></div>
            <p className="mt-1 text-sm text-slate-500">{track.items?.length} items • {inr(track.grandTotal)} • {track.paymentMode === 'cod' ? 'Cash on delivery' : 'Paid online'}</p>
          </div>
        )}
        {track === 'none' && <p className="mb-4 rounded-xl bg-rose-100 p-3 text-sm font-bold text-rose-700">Order not found — check number & phone.</p>}

        <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
          <button onClick={() => setCat('')} className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-bold ${!cat ? 'bg-brand-600 text-white' : 'bg-white dark:bg-ink-800 text-slate-600 dark:text-slate-300'}`}>All</button>
          {cats.map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-bold ${cat === c ? 'bg-brand-600 text-white' : 'bg-white dark:bg-ink-800 text-slate-600 dark:text-slate-300'}`}>{c}</button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {view.map((p) => (
            <div key={p._id} className="card flex flex-col p-3">
              <div className="mb-1 line-clamp-1 text-sm font-bold">{p.name}</div>
              <div className="text-[11px] text-slate-400">{p.brand || p.category} • per {p.unit}</div>
              <div className="mt-auto flex items-end justify-between pt-2">
                <div><div className="font-black text-brand-600">{inr(p.sellingPrice)}</div>{p.mrp > p.sellingPrice && <div className="text-[10px] text-slate-400 line-through">{inr(p.mrp)}</div>}</div>
                <div className="flex items-center gap-1">
                  {cart[p._id] ? (<>
                    <button className="btn-ghost !p-1.5" onClick={() => add(p._id, -1)}><Minus size={14} /></button>
                    <span className="w-6 text-center font-black">{cart[p._id]}</span>
                    <button className="btn-primary !p-1.5" onClick={() => add(p._id, 1)}><Plus size={14} /></button>
                  </>) : <button className="btn-primary !px-3 !py-1.5 text-xs" onClick={() => add(p._id, 1)}>ADD</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
        {!view.length && <Empty text="No products in stock" />}
      </main>

      {lines.length > 0 && !checkout && (
        <button className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-2xl bg-brand-600 px-6 py-3.5 font-black text-white shadow-2xl" onClick={() => setCheckout(true)}>
          {lines.reduce((s, l) => s + l.qty, 0)} items • {inr(total)} → Checkout
        </button>
      )}

      <Modal open={checkout} onClose={() => setCheckout(false)} title="Delivery details / डिलीवरी">
        <div className="space-y-3">
          <Field label="Your name *"><input className="inp" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></Field>
          <Field label="Mobile (10 digit) *"><input className="inp" maxLength={10} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="Delivery address *"><textarea className="inp" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="Payment"><select className="inp" value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}><option value="cod">Cash on Delivery</option><option value="online">UPI on delivery / Razorpay (if configured)</option></select></Field>
          <div className="rounded-xl bg-slate-100 dark:bg-ink-700 p-3 text-sm">
            {lines.map((l) => <div key={l.p._id} className="flex justify-between"><span>{l.p.name} × {l.qty}</span><span>{inr(l.p.sellingPrice * l.qty)}</span></div>)}
            <div className="flex justify-between"><span>Delivery</span><span>{inr(settings?.deliveryFee || 0)}</span></div>
            <div className="mt-1 flex justify-between border-t border-dashed pt-1 font-black"><span>TOTAL</span><span>{inr(total)}</span></div>
          </div>
          <button className="btn-success btn-lg w-full" onClick={place} disabled={!form.customerName || form.phone.length !== 10 || !form.address}><Bike size={18} /> Place Order / ऑर्डर करें</button>
        </div>
      </Modal>

      <Modal open={!!placed} onClose={() => setPlaced(null)} title="Order placed! / ऑर्डर हो गया 🎉">
        <div className="text-center">
          <div className="text-3xl">🛵</div>
          <p className="mt-2 font-black text-lg">{placed?.orderNumber}</p>
          <p className="text-sm text-slate-500">Total {inr(placed?.grandTotal)} • {placed?.paymentMode === 'cod' ? 'Cash on delivery' : 'Online'}</p>
          <p className="mt-2 text-sm">Track anytime with order number + phone. Store will call you for confirmation.<br />धन्यवाद! {settings?.storeName || ''}</p>
        </div>
      </Modal>
    </div>
  );
}
