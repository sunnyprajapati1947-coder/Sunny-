import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Gift } from 'lucide-react';
import { api, errMsg } from '../api.js';
import { Modal, Field, Table, Badge, Empty, PageHead } from '../components/ui.jsx';
import { useDispatch } from 'react-redux';
import { toast } from '../store.js';
import { fmtDate } from '../utils.js';

const TYPES = { bogo: 'Buy X Get Y Free', percent: '% off products/category', combo: 'Combo special price', happyhour: 'Happy hour (time-based)', festival: 'Festival/seasonal', coupon: 'Coupon code' };
const BLANK = { title: '', type: 'percent', buyQty: 1, getQty: 1, percent: '', flat: '', productIds: [], categories: [], comboProductIds: [], comboPrice: '', couponCode: '', minSubtotal: '', maxUses: '', startHour: '', endHour: '', validFrom: '', validTo: '', isActive: true };

export default function Offers() {
  const dispatch = useDispatch();
  const [items, setItems] = useState([]);
  const [edit, setEdit] = useState(null);
  const [cats, setCats] = useState([]);
  const load = () => api.get('/offers').then((r) => setItems(r.data));
  useEffect(() => { load(); api.get('/products/categories').then((r) => setCats(r.data.categories)); }, []);

  const save = async () => {
    try {
      if (edit._id) await api.put('/offers/' + edit._id, edit); else await api.post('/offers', edit);
      dispatch(toast({ msg: 'Offer saved', kind: 'ok' })); setEdit(null); load();
    } catch (e) { dispatch(toast({ msg: errMsg(e), kind: 'error' })); }
  };
  const toggle = async (o) => { await api.put('/offers/' + o._id, { isActive: !o.isActive }); load(); };

  return (
    <div>
      <PageHead title="Offers & Promotions / ऑफर" sub="BOGO • % off • combo • happy hour • festival • coupons">
        <button className="btn-primary" onClick={() => setEdit({ ...BLANK })}><Plus size={16} /> New Offer</button>
      </PageHead>
      <div className="card overflow-hidden">
        <Table head={['Offer', 'Type', 'Details', 'Validity', 'Usage', 'Status', '']}>
          {items.map((o) => (
            <tr key={o._id}>
              <td className="td font-bold">{o.title}</td>
              <td className="td"><Badge tone="blue">{o.type}</Badge></td>
              <td className="td text-xs">
                {o.type === 'bogo' && `Buy ${o.buyQty} Get ${o.getQty} free`}
                {o.type === 'percent' || o.type === 'festival' ? `${o.percent}% off ${o.categories?.length ? o.categories.join('/') : o.productIds?.length ? o.productIds.length + ' products' : 'everything'}` : ''}
                {o.type === 'happyhour' && `${o.percent}% off ${o.startHour}:00–${o.endHour}:00`}
                {o.type === 'combo' && `${o.comboProductIds?.length} items for ₹${o.comboPrice}`}
                {o.type === 'coupon' && `Code ${o.couponCode}: ${o.percent ? o.percent + '%' : '₹' + o.flat} off above ₹${o.minSubtotal || 0}`}
              </td>
              <td className="td text-xs">{o.validFrom || o.validTo ? `${fmtDate(o.validFrom)} → ${fmtDate(o.validTo)}` : 'Always'}</td>
              <td className="td text-xs">{o.usedCount || 0}{o.maxUses ? `/${o.maxUses}` : ''}</td>
              <td className="td"><button onClick={() => toggle(o)}>{o.isActive ? <Badge tone="green">ACTIVE</Badge> : <Badge tone="rose">OFF</Badge>}</button></td>
              <td className="td"><div className="flex gap-1">
                <button className="btn-ghost !p-1.5" onClick={() => setEdit(o)}><Pencil size={14} /></button>
                <button className="btn-ghost !p-1.5 text-rose-500" onClick={async () => { await api.delete('/offers/' + o._id); load(); }}><Trash2 size={14} /></button>
              </div></td>
            </tr>
          ))}
        </Table>
        {!items.length && <Empty />}
      </div>

      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit._id ? 'Edit Offer' : 'New Offer / नया ऑफर'} wide
          footer={<><button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" onClick={save}><Gift size={15} /> Save Offer</button></>}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Title *" className="sm:col-span-2"><input className="inp" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="Type"><select className="inp" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>

            {edit.type === 'bogo' && <>
              <Field label="Buy qty"><input className="inp" type="number" value={edit.buyQty} onChange={(e) => setEdit({ ...edit, buyQty: e.target.value })} /></Field>
              <Field label="Get free qty"><input className="inp" type="number" value={edit.getQty} onChange={(e) => setEdit({ ...edit, getQty: e.target.value })} /></Field>
            </>}
            {['percent', 'festival', 'happyhour'].includes(edit.type) && <>
              <Field label="Percent off"><input className="inp" type="number" value={edit.percent} onChange={(e) => setEdit({ ...edit, percent: e.target.value })} /></Field>
              {edit.type === 'happyhour' && <>
                <Field label="Start hour (0-23)"><input className="inp" type="number" value={edit.startHour} onChange={(e) => setEdit({ ...edit, startHour: e.target.value })} /></Field>
                <Field label="End hour"><input className="inp" type="number" value={edit.endHour} onChange={(e) => setEdit({ ...edit, endHour: e.target.value })} /></Field>
              </>}
            </>}
            {['percent', 'bogo', 'festival'].includes(edit.type) && (
              <Field label="Categories (comma separated)" className="sm:col-span-2"><input className="inp" value={(edit.categories || []).join(',')} onChange={(e) => setEdit({ ...edit, categories: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder={cats.join(', ').slice(0, 40)} /></Field>
            )}
            {edit.type === 'combo' && <>
              <Field label="Combo price ₹"><input className="inp" type="number" value={edit.comboPrice} onChange={(e) => setEdit({ ...edit, comboPrice: e.target.value })} /></Field>
              <Field label="Product IDs (comma)" className="sm:col-span-2"><input className="inp" value={(edit.comboProductIds || []).join(',')} onChange={(e) => setEdit({ ...edit, comboProductIds: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} /></Field>
            </>}
            {edit.type === 'coupon' && <>
              <Field label="Coupon code *"><input className="inp uppercase" value={edit.couponCode} onChange={(e) => setEdit({ ...edit, couponCode: e.target.value.toUpperCase() })} /></Field>
              <Field label="% off (or flat ₹)"><input className="inp" type="number" value={edit.percent} onChange={(e) => setEdit({ ...edit, percent: e.target.value })} /></Field>
              <Field label="Flat ₹ off"><input className="inp" type="number" value={edit.flat} onChange={(e) => setEdit({ ...edit, flat: e.target.value })} /></Field>
              <Field label="Min subtotal ₹"><input className="inp" type="number" value={edit.minSubtotal} onChange={(e) => setEdit({ ...edit, minSubtotal: e.target.value })} /></Field>
              <Field label="Max uses"><input className="inp" type="number" value={edit.maxUses} onChange={(e) => setEdit({ ...edit, maxUses: e.target.value })} /></Field>
            </>}
            <Field label="Valid from"><input className="inp" type="date" value={String(edit.validFrom || '').slice(0, 10)} onChange={(e) => setEdit({ ...edit, validFrom: e.target.value })} /></Field>
            <Field label="Valid to"><input className="inp" type="date" value={String(edit.validTo || '').slice(0, 10)} onChange={(e) => setEdit({ ...edit, validTo: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
