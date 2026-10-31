import React, { useEffect, useState } from 'react';
import { Bike, Phone, MapPin, Globe } from 'lucide-react';
import { api, errMsg } from '../api.js';
import { Table, Badge, Empty, PageHead } from '../components/ui.jsx';
import { inr, fmtDT, waLink } from '../utils.js';
import { useDispatch } from 'react-redux';
import { toast } from '../store.js';

const FLOW = ['placed', 'confirmed', 'out_for_delivery', 'delivered'];

export default function Orders() {
  const dispatch = useDispatch();
  const [items, setItems] = useState([]);
  const load = () => api.get('/orders').then((r) => setItems(r.data));
  useEffect(load, []);

  const setStatus = async (o, status) => {
    try {
      await api.put('/orders/' + o._id, { status, ...(status === 'delivered' && o.paymentMode !== 'cod' ? { paymentStatus: 'paid' } : {}) });
      dispatch(toast({ msg: `${o.orderNumber} → ${status}`, kind: 'ok' }));
      load();
    } catch (e) { dispatch(toast({ msg: errMsg(e), kind: 'error' })); }
  };

  return (
    <div>
      <PageHead title="Online Orders / ऑनलाइन ऑर्डर" sub="Home-delivery orders from the public /shop page">
        <a className="btn-ghost" href="/shop" target="_blank" rel="noreferrer"><Globe size={15} /> Open customer shop page</a>
      </PageHead>
      <div className="card overflow-hidden">
        <Table head={['Order', 'Customer', 'Items', 'Total', 'Payment', 'Status', 'Actions']}>
          {items.map((o) => (
            <tr key={o._id}>
              <td className="td font-bold">{o.orderNumber}<div className="text-[11px] font-normal text-slate-400">{fmtDT(o.createdAt)}</div></td>
              <td className="td"><div className="font-semibold flex items-center gap-1"><Phone size={11} /> {o.phone}</div><div className="text-[11px] text-slate-400">{o.customerName}</div><div className="text-[11px] text-slate-400 flex items-center gap-1"><MapPin size={10} /> {o.address}</div></td>
              <td className="td text-xs">{o.items?.map((i) => `${i.name} ×${i.qty}`).join(', ')}</td>
              <td className="td font-black">{inr(o.grandTotal)}</td>
              <td className="td">{o.paymentMode === 'cod' ? <Badge tone="amber">COD {o.paymentStatus === 'paid' ? '• paid' : ''}</Badge> : <Badge tone={o.paymentStatus === 'paid' ? 'green' : 'blue'}>{o.paymentStatus}</Badge>}</td>
              <td className="td"><Badge tone={o.status === 'delivered' ? 'green' : o.status === 'cancelled' ? 'rose' : 'blue'}>{o.status.replace(/_/g, ' ')}</Badge></td>
              <td className="td">
                <div className="flex flex-wrap gap-1">
                  {FLOW.indexOf(o.status) >= 0 && o.status !== 'delivered' && (
                    <button className="btn-success !py-1 !px-2 text-xs" onClick={() => setStatus(o, FLOW[FLOW.indexOf(o.status) + 1])}>
                      <Bike size={12} /> {FLOW[FLOW.indexOf(o.status) + 1].replace(/_/g, ' ')}
                    </button>
                  )}
                  {['placed', 'confirmed'].includes(o.status) && <button className="btn-danger !py-1 !px-2 text-xs" onClick={() => setStatus(o, 'cancelled')}>Cancel</button>}
                  <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => window.open(waLink(o.phone, `Namaste ${o.customerName} ji! Aapka order ${o.orderNumber} (${inr(o.grandTotal)}) ${o.status.replace(/_/g, ' ')} hai. — Rishu Kirana Store`), '_blank')}>WhatsApp</button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
        {!items.length && <Empty text="No online orders yet — share the /shop link with customers" />}
      </div>
    </div>
  );
}
