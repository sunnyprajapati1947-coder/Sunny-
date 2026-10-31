import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Shield, Clock, ScrollText, Wallet } from 'lucide-react';
import { api, errMsg } from '../api.js';
import { Modal, Field, Table, Badge, Empty, PageHead, Tabs } from '../components/ui.jsx';
import { inr, fmtDT } from '../utils.js';
import { useDispatch } from 'react-redux';
import { toast } from '../store.js';

export default function Admin() {
  const dispatch = useDispatch();
  const me = JSON.parse(localStorage.getItem('rk_user') || '{}');
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [current, setCurrent] = useState(null);
  const [activity, setActivity] = useState([]);
  const [edit, setEdit] = useState(null);
  const [shiftModal, setShiftModal] = useState(null);
  const [closeModal, setCloseModal] = useState(null);

  const load = () => {
    api.get('/admin/users').then((r) => setUsers(r.data));
    api.get('/admin/shifts').then((r) => setShifts(r.data));
    api.get('/admin/shifts/current').then((r) => setCurrent(r.data));
    api.get('/admin/activity').then((r) => setActivity(r.data)).catch(() => {});
  };
  useEffect(load, []);

  const save = async () => {
    try {
      if (edit._id) await api.put('/admin/users/' + edit._id, edit); else await api.post('/admin/users', edit);
      dispatch(toast({ msg: 'User saved', kind: 'ok' })); setEdit(null); load();
    } catch (e) { dispatch(toast({ msg: errMsg(e), kind: 'error' })); }
  };

  return (
    <div>
      <PageHead title="Users, Shifts & Audit / यूज़र और शिफ्ट" sub="Role-based access • activity trail • cash shift management">
        {tab === 'users' && <button className="btn-primary" onClick={() => setEdit({ name: '', username: '', password: '', pin: '', role: 'cashier', phone: '' })}><Plus size={16} /> Add User</button>}
        {tab === 'shifts' && !current && <button className="btn-success" onClick={() => setShiftModal('open')}><Wallet size={16} /> Open Shift</button>}
        {tab === 'shifts' && current && <button className="btn-danger" onClick={() => setCloseModal(current)}><Clock size={16} /> Close Shift</button>}
      </PageHead>

      <div className="mb-3"><Tabs tabs={[{ id: 'users', label: 'Users & Roles' }, { id: 'shifts', label: 'Shifts' }, { id: 'activity', label: 'Activity Log' }]} active={tab} onChange={setTab} /></div>

      {tab === 'users' && (
        <div className="card overflow-hidden">
          <Table head={['Name', 'Username', 'Role', 'Phone', 'PIN login', 'Status', 'Last login', '']}>
            {users.map((u) => (
              <tr key={u._id}>
                <td className="td font-bold">{u.name}</td>
                <td className="td font-mono text-xs">{u.username}</td>
                <td className="td"><Badge tone={u.role === 'admin' ? 'amber' : u.role === 'manager' ? 'blue' : 'slate'}><Shield size={10} /> {u.role}</Badge></td>
                <td className="td text-xs">{u.phone}</td>
                <td className="td">{u.hasPin ? <Badge tone="green">enabled</Badge> : '—'}</td>
                <td className="td">{u.isActive ? <Badge tone="green">active</Badge> : <Badge tone="rose">disabled</Badge>}</td>
                <td className="td text-xs">{fmtDT(u.lastLogin)}</td>
                <td className="td"><button className="btn-ghost !p-1.5" onClick={() => setEdit({ ...u, password: '', pin: '' })}><Pencil size={14} /></button></td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      {tab === 'shifts' && (
        <div className="space-y-3">
          {current && (
            <div className="card flex flex-wrap items-center gap-4 border-l-4 border-l-emerald-500 p-4">
              <div><div className="text-[11px] font-bold uppercase text-slate-400">Current open shift</div><div className="font-black">{current.userName}</div></div>
              <div><div className="text-[11px] font-bold uppercase text-slate-400">Opened</div><div className="font-bold">{fmtDT(current.openedAt)}</div></div>
              <div><div className="text-[11px] font-bold uppercase text-slate-400">Opening cash</div><div className="font-bold">{inr(current.openingCash)}</div></div>
              <div><div className="text-[11px] font-bold uppercase text-slate-400">Sales so far</div><div className="font-bold text-emerald-600">{inr(current.salesTotal)}</div></div>
              <div><div className="text-[11px] font-bold uppercase text-slate-400">Bills</div><div className="font-bold">{current.billCount}</div></div>
            </div>
          )}
          <div className="card overflow-hidden">
            <Table head={['User', 'Opened', 'Closed', 'Opening ₹', 'Sales ₹', 'Expected ₹', 'Counted ₹', 'Diff', 'Status']}>
              {shifts.map((s) => (
                <tr key={s._id}>
                  <td className="td font-bold">{s.userName}</td>
                  <td className="td text-xs">{fmtDT(s.openedAt)}</td>
                  <td className="td text-xs">{s.closedAt ? fmtDT(s.closedAt) : '—'}</td>
                  <td className="td">{inr(s.openingCash)}</td>
                  <td className="td font-bold text-emerald-600">{inr(s.salesTotal)}</td>
                  <td className="td">{s.expectedCash != null ? inr(s.expectedCash) : '—'}</td>
                  <td className="td">{s.closingCash != null ? inr(s.closingCash) : '—'}</td>
                  <td className="td">{s.closingCash != null ? <Badge tone={Math.abs(s.closingCash - s.expectedCash) < 1 ? 'green' : 'rose'}>{(s.closingCash - s.expectedCash).toFixed(2)}</Badge> : '—'}</td>
                  <td className="td"><Badge tone={s.status === 'open' ? 'green' : 'slate'}>{s.status}</Badge></td>
                </tr>
              ))}
            </Table>
            {!shifts.length && <Empty />}
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 p-4 pb-2 font-bold"><ScrollText size={16} /> Who did what, when / गतिविधि लॉग</div>
          <Table head={['When', 'User', 'Role', 'Action', 'Details']}>
            {activity.map((a) => (
              <tr key={a._id}>
                <td className="td text-xs">{fmtDT(a.createdAt)}</td>
                <td className="td font-bold">{a.userName}</td>
                <td className="td text-xs">{a.role}</td>
                <td className="td"><Badge tone="blue">{a.action}</Badge></td>
                <td className="td text-xs text-slate-500">{a.details}</td>
              </tr>
            ))}
          </Table>
          {!activity.length && <Empty />}
        </div>
      )}

      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit._id ? `Edit user — ${edit.username}` : 'Add User / यूज़र जोड़ें'}
          footer={<><button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name *"><input className="inp" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Username *"><input className="inp" value={edit.username} disabled={!!edit._id} onChange={(e) => setEdit({ ...edit, username: e.target.value })} /></Field>
            <Field label={edit._id ? 'New password (blank = keep)' : 'Password *'}><input className="inp" type="text" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></Field>
            <Field label="Quick PIN (4-6 digits)"><input className="inp" value={edit.pin} onChange={(e) => setEdit({ ...edit, pin: e.target.value })} placeholder="for cashier pad login" /></Field>
            <Field label="Role"><select className="inp" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}><option value="cashier">Cashier (billing only)</option><option value="manager">Manager (billing+inventory+reports)</option><option value="admin">Admin/Owner (everything)</option></select></Field>
            <Field label="Phone"><input className="inp" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            <Field label="Active"><input type="checkbox" className="mt-2 h-5 w-5" checked={edit.isActive !== false} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} /></Field>
          </div>
          <p className="mt-3 text-[11px] text-slate-400">Cashier: billing + customers only. Manager: + inventory, suppliers, reports. Admin: + prices, users, settings.</p>
        </Modal>
      )}

      <Modal open={!!shiftModal} onClose={() => setShiftModal(null)} title="Open shift / शिफ्ट शुरू"
        footer={<><button className="btn-ghost" onClick={() => setShiftModal(null)}>Cancel</button><button className="btn-success" onClick={async () => { await api.post('/admin/shifts/open', { openingCash: shiftModal.cash || 0 }); setShiftModal(null); load(); }}>Open</button></>}>
        <Field label="Opening cash in drawer ₹"><input className="inp" type="number" autoFocus value={shiftModal?.cash || ''} onChange={(e) => setShiftModal({ cash: e.target.value })} /></Field>
      </Modal>

      <Modal open={!!closeModal} onClose={() => setCloseModal(null)} title="Close shift / शिफ्ट बंद"
        footer={<><button className="btn-ghost" onClick={() => setCloseModal(null)}>Cancel</button><button className="btn-danger" onClick={async () => { await api.post('/admin/shifts/close', { closingCash: closeModal.cash || 0, note: closeModal.note || '' }); setCloseModal(null); load(); }}>Close Shift</button></>}>
        <div className="space-y-3">
          <p className="text-sm">Sales this shift: <b className="text-emerald-600">{inr(closeModal?.salesTotal || 0)}</b> in {closeModal?.billCount || 0} bills.</p>
          <Field label="Counted cash in drawer ₹"><input className="inp" type="number" autoFocus value={closeModal?.cash || ''} onChange={(e) => setCloseModal({ ...closeModal, cash: e.target.value })} /></Field>
          <Field label="Note"><input className="inp" value={closeModal?.note || ''} onChange={(e) => setCloseModal({ ...closeModal, note: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}
