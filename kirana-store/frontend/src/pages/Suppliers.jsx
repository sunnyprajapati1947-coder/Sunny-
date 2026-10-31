import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Truck, PackageCheck, Wallet } from 'lucide-react';
import { api, errMsg } from '../api.js';
import { Modal, Field, Table, Badge, Empty, PageHead, Tabs } from '../components/ui.jsx';
import { inr, fmtDate } from '../utils.js';
import { useDispatch } from 'react-redux';
import { toast } from '../store.js';

export default function Suppliers() {
  const dispatch = useDispatch();
  const [tab, setTab] = useState('suppliers');
  const [suppliers, setSuppliers] = useState([]);
  const [pos, setPos] = useState([]);
  const [products, setProducts] = useState([]);
  const [edit, setEdit] = useState(null);
  const [poEdit, setPoEdit] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [payAmt, setPayAmt] = useState('');

  const load = () => {
    api.get('/suppliers').then((r) => setSuppliers(r.data));
    api.get('/suppliers/purchases/list').then((r) => setPos(r.data));
  };
  useEffect(() => { load(); api.get('/products', { params: { limit: 500 } }).then((r) => setProducts(r.data.items)); }, []);

  const saveSupplier = async () => {
    try {
      if (edit._id) await api.put('/suppliers/' + edit._id, edit); else await api.post('/suppliers', edit);
      setEdit(null); load();
    } catch (e) { dispatch(toast({ msg: errMsg(e), kind: 'error' })); }
  };
  const savePO = async () => {
    try {
      await api.post('/suppliers/purchases', poEdit);
      dispatch(toast({ msg: 'Purchase order created', kind: 'ok' })); setPoEdit(null); load();
    } catch (e) { dispatch(toast({ msg: errMsg(e), kind: 'error' })); }
  };
  const receive = async (id) => { await api.put(`/suppliers/purchases/${id}/receive`); dispatch(toast({ msg: 'Stock received & updated', kind: 'ok' })); load(); };
  const pay = async () => { await api.put(`/suppliers/purchases/${payFor._id}/pay`, { amount: payAmt, mode: 'cash' }); setPayFor(null); setPayAmt(''); load(); };

  return (
    <div>
      <PageHead title="Suppliers & Purchases / सप्लायर और खरीद">
        {tab === 'suppliers' ? <button className="btn-primary" onClick={() => setEdit({ name: '', company: '', phone: '', address: '', gstNumber: '' })}><Plus size={16} /> Add Supplier</button>
          : <button className="btn-primary" onClick={() => setPoEdit({ supplierId: '', items: [{ productId: '', name: '', qty: 1, price: 0 }], paid: 0, expectedDate: '' })}><Plus size={16} /> New Purchase Order</button>}
      </PageHead>
      <div className="mb-3"><Tabs tabs={[{ id: 'suppliers', label: `Suppliers (${suppliers.length})` }, { id: 'po', label: `Purchase Orders (${pos.length})` }]} active={tab} onChange={setTab} /></div>

      {tab === 'suppliers' ? (
        <div className="card overflow-hidden">
          <Table head={['Supplier', 'Company', 'Phone', 'GSTIN', 'Balance Due', '']}>
            {suppliers.map((s) => (
              <tr key={s._id}>
                <td className="td font-bold">{s.name}<div className="text-[11px] text-slate-400">{s.address}</div></td>
                <td className="td">{s.company}</td>
                <td className="td font-mono text-xs">{s.phone}</td>
                <td className="td text-xs">{s.gstNumber}</td>
                <td className="td">{s.balanceDue > 0 ? <Badge tone="rose">{inr(s.balanceDue)}</Badge> : <Badge tone="green">clear</Badge>}</td>
                <td className="td"><button className="btn-ghost !p-1.5" onClick={() => setEdit(s)}><Pencil size={14} /></button></td>
              </tr>
            ))}
          </Table>
          {!suppliers.length && <Empty />}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <Table head={['PO #', 'Supplier', 'Items', 'Total', 'Paid', 'Balance', 'Status', 'Actions']}>
            {pos.map((p) => (
              <tr key={p._id}>
                <td className="td font-bold">{p.poNumber}</td>
                <td className="td">{p.supplierName}</td>
                <td className="td">{p.items?.length}</td>
                <td className="td font-bold">{inr(p.total)}</td>
                <td className="td text-emerald-600">{inr(p.paid)}</td>
                <td className="td">{p.balance > 0 ? <Badge tone="rose">{inr(p.balance)}</Badge> : '—'}</td>
                <td className="td"><Badge tone={p.status === 'received' ? 'green' : 'amber'}>{p.status}</Badge></td>
                <td className="td"><div className="flex gap-1">
                  {p.status !== 'received' && <button className="btn-success !py-1 !px-2 text-xs" onClick={() => receive(p._id)}><PackageCheck size={12} /> Receive</button>}
                  {p.balance > 0 && <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => { setPayFor(p); setPayAmt(p.balance); }}><Wallet size={12} /> Pay</button>}
                </div></td>
              </tr>
            ))}
          </Table>
          {!pos.length && <Empty />}
        </div>
      )}

      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit._id ? 'Edit Supplier' : 'Add Supplier / सप्लायर'}
          footer={<><button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" onClick={saveSupplier}>Save</button></>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name *"><input className="inp" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Company"><input className="inp" value={edit.company} onChange={(e) => setEdit({ ...edit, company: e.target.value })} /></Field>
            <Field label="Phone"><input className="inp" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            <Field label="GSTIN"><input className="inp" value={edit.gstNumber} onChange={(e) => setEdit({ ...edit, gstNumber: e.target.value })} /></Field>
            <Field label="Address" className="col-span-2"><textarea className="inp" rows={2} value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {poEdit && (
        <Modal open onClose={() => setPoEdit(null)} title="New Purchase Order / खरीद ऑर्डर" wide
          footer={<><button className="btn-ghost" onClick={() => setPoEdit(null)}>Cancel</button><button className="btn-primary" onClick={savePO}><Truck size={15} /> Create PO</button></>}>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Supplier *"><select className="inp" value={poEdit.supplierId} onChange={(e) => setPoEdit({ ...poEdit, supplierId: e.target.value })}><option value="">Select…</option>{suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></Field>
            <Field label="Expected date"><input className="inp" type="date" value={poEdit.expectedDate} onChange={(e) => setPoEdit({ ...poEdit, expectedDate: e.target.value })} /></Field>
            <Field label="Advance paid ₹"><input className="inp" type="number" value={poEdit.paid} onChange={(e) => setPoEdit({ ...poEdit, paid: e.target.value })} /></Field>
          </div>
          <div className="mt-3 space-y-2">
            {poEdit.items.map((it, i) => (
              <div key={i} className="flex gap-2">
                <select className="inp flex-1" value={it.productId} onChange={(e) => {
                  const p = products.find((x) => x._id === e.target.value);
                  setPoEdit((s) => ({ ...s, items: s.items.map((x, idx) => idx === i ? { ...x, productId: p?._id || '', name: p?.name || x.name, price: p?.purchasePrice || x.price } : x) }));
                }}>
                  <option value="">Select product…</option>{products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
                <input className="inp !w-20" type="number" placeholder="Qty" value={it.qty} onChange={(e) => setPoEdit((s) => ({ ...s, items: s.items.map((x, idx) => idx === i ? { ...x, qty: e.target.value } : x) }))} />
                <input className="inp !w-24" type="number" placeholder="Rate" value={it.price} onChange={(e) => setPoEdit((s) => ({ ...s, items: s.items.map((x, idx) => idx === i ? { ...x, price: e.target.value } : x) }))} />
                <button className="btn-ghost !px-2" onClick={() => setPoEdit((s) => ({ ...s, items: s.items.filter((_, idx) => idx !== i) }))}>✕</button>
              </div>
            ))}
            <button className="btn-ghost text-xs" onClick={() => setPoEdit((s) => ({ ...s, items: [...s.items, { productId: '', name: '', qty: 1, price: 0 }] }))}>+ Add item</button>
            <div className="rounded-xl bg-slate-100 dark:bg-ink-700 p-3 text-right font-black">Total: {inr(poEdit.items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.price || 0), 0))}</div>
          </div>
        </Modal>
      )}

      <Modal open={!!payFor} onClose={() => setPayFor(null)} title={`Pay ${payFor?.supplierName || ''} (due ${inr(payFor?.balance || 0)})`}
        footer={<><button className="btn-ghost" onClick={() => setPayFor(null)}>Cancel</button><button className="btn-success" onClick={pay}>Pay Now</button></>}>
        <Field label="Amount ₹"><input className="inp" type="number" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}
