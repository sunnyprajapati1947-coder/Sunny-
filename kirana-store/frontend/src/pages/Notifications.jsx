import React, { useEffect, useState } from 'react';
import { Bell, CheckCheck, RefreshCw, AlertTriangle, CalendarX2, Wallet } from 'lucide-react';
import { api } from '../api.js';
import { Badge, Empty, PageHead } from '../components/ui.jsx';
import { fmtDT } from '../utils.js';

const ICONS = { lowstock: AlertTriangle, expiry: CalendarX2, credit: Wallet };

export default function Notifications() {
  const [items, setItems] = useState([]);
  const load = () => api.get('/notifications').then((r) => setItems(r.data));
  useEffect(() => { load(); api.post('/notifications/generate').catch(() => {}); }, []);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHead title="Notifications / सूचनाएं" sub="Low stock • expiry alerts • udhar reminders">
        <button className="btn-ghost" onClick={() => { api.post('/notifications/generate').then(load); }}><RefreshCw size={15} /> Refresh</button>
        <button className="btn-primary" onClick={async () => { await api.post('/notifications/read-all'); load(); }}><CheckCheck size={15} /> Mark all read</button>
      </PageHead>
      <div className="space-y-2">
        {items.map((n) => {
          const Icon = ICONS[n.type] || Bell;
          return (
            <div key={n._id} className={`card flex items-start gap-3 p-3 ${n.read ? 'opacity-60' : 'border-l-4 ' + (n.severity === 'error' ? 'border-l-rose-500' : n.severity === 'warn' ? 'border-l-amber-500' : 'border-l-sky-500')}`}>
              <Icon size={18} className={n.severity === 'error' ? 'text-rose-500' : n.severity === 'warn' ? 'text-amber-500' : 'text-sky-500'} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-bold">{n.title} {!n.read && <Badge tone="blue">new</Badge>}</div>
                <div className="text-sm text-slate-600 dark:text-slate-300">{n.message}</div>
                <div className="text-[11px] text-slate-400">{fmtDT(n.createdAt)}</div>
              </div>
              {!n.read && <button className="btn-ghost !py-1 !px-2 text-xs" onClick={async () => { await api.post(`/notifications/${n._id}/read`); load(); }}>Read</button>}
            </div>
          );
        })}
        {!items.length && <Empty text="No notifications / कोई सूचना नहीं" />}
      </div>
    </div>
  );
}
