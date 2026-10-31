import React, { useEffect, useState } from 'react';
import { Plus, ArrowLeftRight, Store as StoreIcon } from 'lucide-react';
import { api, errMsg } from '../api.js';
import { Modal, Field, Table, Badge, Empty, PageHead, Tabs } from '../components/ui.jsx';
import { fmtDT } from '../utils.js';
import { useDispatch } from 'react-redux';
import { toast } from '../store.js';

export default function Stores() {
  const dispatch = useDispatch();
  const [tab, setTab] = useState('stores');
  const [stores, setStores] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [products, setProducts] = useState([]);
  const [edit, setEdit] = useState(null);
  const [tr, setTr] = useState(null);

  const load = () => {
    api.get('/stores').then((r) => setStores(r.data));
    api.get('/transfers').then((r) => setTransfers(r.data)).catch(() => {});
    api.get('/products', { params: { limit: 400 } }).then((r) => setProducts(r.data.items));
  };
  useEffect(load, []);

  const saveStore = async () => {
    try { if (edit._id) await api.put('/stores/' + edit._id, edit); else await api.post('/stores', edit); setEdit(null); load(); }
    catch (e) { dispatch(toast({ msg: errMsg(e), kind: 'error' })); }
  };
  const saveTransfer = async () => {
    try { await api.post('/transfers', tr); dispatch(toast({ msg: 'Stock transferred', kind: 'ok' })); setTr(null); load(); }
    catch (e) { dispatch(toast({ msg: errMsg(e), kind: 'error' })); }
  };

  return (
    <div>
      <PageHead title="Multi-Store / मल्टी-स्टोर" sub="Branches, stock transfer between stores, branch-wise reports (use store switcher in top bar)">
        {tab === 'stores' ? <button className="btn-primary" onClick={() => setEdit({ name: '', address: '', phone: '' })}><Plus size={16} /> Add Branch</button>
          : <button className="btn-primary" disabled={stores.length < 2} onClick={() => setTr({ fromStore: stores[0]?._id, toStore: stores[1]?._id, items: [{ productId: '', name: '', qty: 1 }] })}><ArrowLeftRight size={16} /> New Transfer</button>}
      </PageHead>
      <div className="mb-3"><Tabs tabs={[{ id: 'stores', label: 'Branches' }, { id: 'transfers', label: 'Stock Transfers' }]} active={tab} onChange={setTab} /></div>

      {tab === 'stores' ? (
        <div className="card overflow-hidden">
          <Table head={['Store', 'Address', 'Phone', 'Status']}>
            {stores.map((s) => (
              <tr key={s._id}>
                <td className="td font-bold"><StoreIcon size={14} className="mr-1 inline text-brand-600" />{s.name}{s.isMain && <Badge tone="amber"> main</Badge>}</td>
                <td className="td text-xs">{s.address}</td>
                <td className="td text-xs">{s.phone}</td>
                <td className="td">{s.isActive ? <Badge tone="green">active</Badge> : <Badge tone="rose">closed</Badge>}</td>
              </tr>
            ))}
          </Table>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <Table head={['When', 'From → To', 'Items', 'By']}>
            {transfers.map((t) => (
              <tr key={t._id}>
                <td className="td text-xs">{fmtDT(t.createdAt)}</td>
                <td className="td font-bold">{stores.find((s) => s._id === t.fromStore)?.name || t.fromStore} → {stores.find((s) => s._id === t.toStore)?.name || t.toStore}</td>
                <td className="td text-xs">{t.items?.map((i) => `${i.name} x${i.qty}`).join(', ')}</td>
                <td className="td text-xs">{t.by}</td>
              </tr>
            ))}
          </Table>
          {!transfers.length && <Empty />}
        </div>
      )}

      {edit && (
        <Modal open onClose={() => setEdit(null)} title="Add branch / नई ब्रांच"
          footer={<><button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" onClick={saveStore}>Save</button></>}>
          <div className="space-y-3">
            <Field label="Branch name *"><input className="inp" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Address"><input className="inp" value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
            <Field label="Phone"><input className="inp" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {tr && (
        <Modal open onClose={() => setTr(null)} title="Stock transfer / स्टॉक ट्रांसफर"
          footer={<><button className="btn-ghost" onClick={() => setTr(null)}>Cancel</button><button className="btn-primary" onClick={saveTransfer}>Transfer</button></>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From"><select className="inp" value={tr.fromStore} onChange={(e) => setTr({ ...tr, fromStore: e.target.value })}>{stores.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></Field>
            <Field label="To"><select className="inp" value={tr.toStore} onChange={(e) => setTr({ ...tr, toStore: e.target.value })}>{stores.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></Field>
          </div>
          <div className="mt-3 space-y-2">
            {tr.items.map((it, i) => (
              <div key={i} className="flex gap-2">
                <select className="inp flex-1" value={it.productId} onChange={(e) => {
                  const p = products.find((x) => x._id === e.target.value);
                  setTr((s) => ({ ...s, items: s.items.map((x, idx) => idx === i ? { ...x, productId: p?._id || '', name: p?.name || '' } : x) }));
                }}><option value="">Product…</option>{products.map((p) => <option key={p._id} value={p._id}>{p.name} ({p.quantity})</option>)}</select>
                <input className="inp !w-20" type="number" value={it.qty} onChange={(e) => setTr((s) => ({ ...s, items: s.items.map((x, idx) => idx === i ? { ...x, qty: e.target.value } : x) }))} />
              </div>
            ))}
            <button className="btn-ghost text-xs" onClick={() => setTr((s) => ({ ...s, items: [...s.items, { productId: '', name: '', qty: 1 }] }))}>+ Add item</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
