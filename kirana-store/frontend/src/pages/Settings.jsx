import React, { useEffect, useState } from 'react';
import { Save, Download, Upload, Store, KeyRound } from 'lucide-react';
import { api, errMsg } from '../api.js';
import { Field, PageHead, Modal } from '../components/ui.jsx';
import { useDispatch } from 'react-redux';
import { toast } from '../store.js';
import { download } from '../utils.js';

export default function Settings() {
  const dispatch = useDispatch();
  const me = JSON.parse(localStorage.getItem('rk_user') || '{}');
  const [f, setF] = useState(null);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [restoreOpen, setRestoreOpen] = useState(false);

  useEffect(() => { api.get('/settings').then((r) => setF(r.data)).catch(() => {}); }, []);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const save = async () => {
    try { await api.put('/settings', f); dispatch(toast({ msg: 'Settings saved / सेटिंग्स सेव', kind: 'ok' })); }
    catch (e) { dispatch(toast({ msg: errMsg(e), kind: 'error' })); }
  };
  const backup = async () => {
    const { data } = await api.get('/backup');
    download(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), `kirana-backup-${new Date().toISOString().slice(0, 10)}.json`);
    dispatch(toast({ msg: 'Backup downloaded', kind: 'ok' }));
  };
  const restore = async (file) => {
    const dump = JSON.parse(await file.text());
    await api.post('/restore', dump);
    dispatch(toast({ msg: 'Database restored / डेटाबेस रिस्टोर', kind: 'ok' }));
    setRestoreOpen(false);
  };
  const changePw = async () => {
    try { await api.post('/auth/change-password', pw); dispatch(toast({ msg: 'Password changed', kind: 'ok' })); setPw({ currentPassword: '', newPassword: '' }); }
    catch (e) { dispatch(toast({ msg: errMsg(e), kind: 'error' })); }
  };

  if (!f) return null;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHead title="Settings / सेटिंग्स">
        <button className="btn-ghost" onClick={backup}><Download size={15} /> Backup JSON</button>
        <button className="btn-ghost" onClick={() => setRestoreOpen(true)}><Upload size={15} /> Restore</button>
        <button className="btn-primary" onClick={save}><Save size={15} /> Save</button>
      </PageHead>

      <div className="card p-4">
        <h3 className="mb-3 flex items-center gap-2 font-bold"><Store size={16} /> Store profile / दुकान जानकारी</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Store name"><input className="inp" value={f.storeName} onChange={(e) => set('storeName', e.target.value)} /></Field>
          <Field label="Phone"><input className="inp" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Address" className="sm:col-span-2"><input className="inp" value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label="Email"><input className="inp" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="GSTIN"><input className="inp" value={f.gstNumber} onChange={(e) => set('gstNumber', e.target.value)} /></Field>
          <Field label="WhatsApp number (with country code)"><input className="inp" value={f.whatsappNumber} onChange={(e) => set('whatsappNumber', e.target.value)} /></Field>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="mb-3 font-bold">Billing & printing / बिलिंग और प्रिंटिंग</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Receipt width"><select className="inp" value={f.printerWidth} onChange={(e) => set('printerWidth', Number(e.target.value))}><option value={80}>80mm thermal</option><option value={58}>58mm thermal</option></select></Field>
          <Field label="Default GST %"><input className="inp" type="number" value={f.defaultGstRate} onChange={(e) => set('defaultGstRate', e.target.value)} /></Field>
          <Field label="Round-off"><input type="checkbox" className="mt-2 h-5 w-5" checked={f.roundOffEnabled !== false} onChange={(e) => set('roundOffEnabled', e.target.checked)} /></Field>
          <Field label="Loyalty points per ₹1"><input className="inp" type="number" step="0.01" value={f.loyaltyPerRupee} onChange={(e) => set('loyaltyPerRupee', e.target.value)} /></Field>
          <Field label="Delivery fee (online orders)"><input className="inp" type="number" value={f.deliveryFee} onChange={(e) => set('deliveryFee', e.target.value)} /></Field>
          <Field label="Session timeout (minutes)"><input className="inp" type="number" value={f.sessionTimeoutMin} onChange={(e) => set('sessionTimeoutMin', e.target.value)} /></Field>
          <Field label="Receipt footer" className="sm:col-span-3"><input className="inp" value={f.receiptFooter} onChange={(e) => set('receiptFooter', e.target.value)} /></Field>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="mb-3 flex items-center gap-2 font-bold"><KeyRound size={16} /> My password / मेरा पासवर्ड</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Current password"><input className="inp" type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
          <Field label="New password"><input className="inp" type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
        </div>
        <button className="btn-primary mt-3" onClick={changePw} disabled={!pw.currentPassword || !pw.newPassword}>Change password</button>
      </div>

      <div className="card flex flex-wrap items-center gap-4 p-4">
        <img src="/upi-qr.png" alt="UPI QR" className="h-28 w-28 rounded-xl bg-white p-1 shadow" />
        <div className="min-w-[200px] flex-1 text-sm">
          <h3 className="font-bold">UPI QR Code / यूपीआई क्यूआर</h3>
          <p className="text-slate-500">Aapka UPI QR (sunny-ff-reedem-code@fam) — "Rishu Kirana Store" naam ke saath. Payment modal aur har printed receipt par auto-chhapta hai. File: <code>frontend/public/upi-qr.png</code> (badalni ho to same naam se replace kar dein).</p>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="mb-2 font-bold">🖥️ Server / सर्वर</h3>
        <p className="text-sm text-slate-500">Current API: <code>{localStorage.getItem('rk_api_base') || import.meta.env.VITE_API_URL || '/api (same device)'}</code> — mobile app se door ka server jodne ke liye login screen par "Server" button use karein.</p>
      </div>

      <div className="card p-4">
        <h3 className="mb-2 font-bold">📱 Mobile App / मोबाइल ऐप</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Yeh app phone par <b>native app ki tarah install</b> hoti hai (PWA): home-screen icon, full-screen mode, offline cache.
          Android Chrome me <b>⋮ → Install app</b>, iPhone Safari me <b>Share → Add to Home Screen</b>. Top bar ka 📲 button bhi yahi karta hai.
        </p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Play-Store style <b>APK file</b> chahiye? Repo me <code>kirana-store/MOBILE_APP.md</code> kholein — Capacitor se 10 minute me APK ban jaata hai.
        </p>
      </div>

      <div className="card p-4 text-xs text-slate-500">
        <b>Integrations (optional env/config):</b> MongoDB Atlas via <code>MONGODB_URI</code> • SMTP email via settings • WhatsApp via wa.me deep-links (no API key needed) • Razorpay keys for online orders can be added in <code>backend/.env</code>. Data auto-persists; take weekly JSON backups from here.
      </div>

      <Modal open={restoreOpen} onClose={() => setRestoreOpen(false)} title="Restore from backup JSON">
        <p className="mb-3 text-sm text-rose-600 font-bold">Warning: this replaces ALL current data.</p>
        <input type="file" accept="application/json" className="inp" onChange={(e) => e.target.files[0] && restore(e.target.files[0])} />
      </Modal>
    </div>
  );
}
