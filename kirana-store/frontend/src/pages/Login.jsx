import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Store, KeyRound, Fingerprint, Globe, ServerCog } from 'lucide-react';
import { api, errMsg, getApiBase, setApiBase } from '../api.js';
import { setAuth, setLang, toast } from '../store.js';
import { Modal, Field } from '../components/ui.jsx';

export default function Login() {
  const dispatch = useDispatch();
  const nav = useNavigate();
  const lang = useSelector((s) => s.ui.lang);
  const [mode, setMode] = useState('password');
  const [username, setUsername] = useState('owner');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(null);
  const [serverOpen, setServerOpen] = useState(false);
  const [serverUrl, setServerUrl] = useState(localStorage.getItem('rk_api_base') || '');
  const hi = lang === 'hi';

  const saveServer = async () => {
    const base = serverUrl.trim().replace(/\/+$/, '');
    try {
      if (base) { const r = await fetch(base.replace(/\/api$/, '') + '/api/health'); if (!r.ok) throw new Error(); }
      setApiBase(base || '/api');
      dispatch(toast({ msg: hi ? 'सर्वर सेव हुआ ✓' : 'Server saved ✓', kind: 'ok' }));
      setServerOpen(false);
      setTimeout(() => window.location.reload(), 400);
    } catch {
      dispatch(toast({ msg: hi ? 'सर्वर नहीं मिला — URL जांचें' : 'Server not reachable — check URL', kind: 'error' }));
    }
  };

  useEffect(() => { api.get('/settings').then((r) => setSettings(r.data)).catch(() => {}); }, []);

  const done = (data) => {
    dispatch(setAuth(data));
    dispatch(toast({ msg: hi ? `स्वागत है, ${data.user.name}` : `Welcome, ${data.user.name}`, kind: 'ok' }));
    nav('/');
  };

  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      if (mode === 'pin') done((await api.post('/auth/pin', { pin })).data);
      else done((await api.post('/auth/login', { username, password })).data);
    } catch (err) {
      dispatch(toast({ msg: errMsg(err), kind: 'error' }));
    } finally { setBusy(false); }
  };

  const padKey = (d) => {
    if (d === 'C') setPin('');
    else if (d === 'OK') submit();
    else setPin((p) => (p.length < 6 ? p + d : p));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-ink-900 via-ink-800 to-brand-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-5 text-center text-white">
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-brand-600 shadow-lg shadow-brand-600/40"><Store size={32} /></div>
          <h1 className="text-2xl font-black">{settings?.storeName || 'Rishu Kirana Store'}</h1>
          <p className="text-sm text-slate-300">{settings?.address || 'Gaya Road, Nawada'} • {settings?.phone || '9608087035'}</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-brand-500 font-bold">Advanced POS & Inventory System</p>
        </div>

        <div className="card p-5">
          <div className="mb-4 flex rounded-xl bg-slate-100 dark:bg-ink-700 p-1">
            <button className={`flex-1 rounded-lg py-2 text-sm font-bold flex items-center justify-center gap-2 ${mode === 'password' ? 'bg-white dark:bg-ink-800 shadow' : 'text-slate-500'}`} onClick={() => setMode('password')}><KeyRound size={15} /> {hi ? 'पासवर्ड' : 'Password'}</button>
            <button className={`flex-1 rounded-lg py-2 text-sm font-bold flex items-center justify-center gap-2 ${mode === 'pin' ? 'bg-white dark:bg-ink-800 shadow' : 'text-slate-500'}`} onClick={() => setMode('pin')}><Fingerprint size={15} /> {hi ? 'PIN (कैशियर)' : 'PIN (Cashier)'}</button>
          </div>

          {mode === 'password' ? (
            <form onSubmit={submit} className="space-y-3">
              <div><label className="lbl">{hi ? 'यूज़रनेम' : 'Username'}</label>
                <input className="inp" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus /></div>
              <div><label className="lbl">{hi ? 'पासवर्ड' : 'Password'}</label>
                <input className="inp" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
              <button className="btn-primary btn-lg w-full" disabled={busy}>{busy ? '…' : hi ? 'लॉगिन करें' : 'Login'}</button>
              <p className="text-center text-[11px] text-slate-400">owner / owner123 • manager / manager123 • cashier / cashier123</p>
            </form>
          ) : (
            <div>
              <div className="mb-3 text-center text-3xl font-black tracking-[0.4em] text-slate-700 dark:text-slate-100">{pin || '····'}</div>
              <div className="grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'].map((k) => (
                  <button key={k} onClick={() => padKey(k)}
                    className={`rounded-xl py-3.5 text-lg font-black transition active:scale-95 ${k === 'OK' ? 'bg-emerald-600 text-white' : k === 'C' ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/50' : 'bg-slate-100 dark:bg-ink-700 text-slate-800 dark:text-white'}`}>
                    {k}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-center text-[11px] text-slate-400">{hi ? 'कैशियर PIN: 4321 • मालिक PIN: 1111' : 'Cashier PIN: 4321 • Owner PIN: 1111'}</p>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-center gap-3 text-xs text-slate-300">
          <button className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 font-bold hover:bg-white/20" onClick={() => dispatch(setLang(hi ? 'en' : 'hi'))}>
            <Globe size={14} /> {hi ? 'English' : 'हिंदी'}
          </button>
          <a href="/shop" className="rounded-lg bg-white/10 px-3 py-1.5 font-bold hover:bg-white/20">{hi ? 'ऑनलाइन ऑर्डर (ग्राहक)' : 'Online Order (Customer)'}</a>
          <button className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 font-bold hover:bg-white/20" onClick={() => setServerOpen(true)}>
            <ServerCog size={14} /> {hi ? 'सर्वर' : 'Server'}
          </button>
        </div>

        <Modal open={serverOpen} onClose={() => setServerOpen(false)} title={hi ? 'सर्वर कनेक्ट करें' : 'Connect server / सर्वर'}>
          <p className="mb-2 text-xs text-slate-500">
            {hi ? 'जहाँ backend चल रहा है उसका URL डालें (APK/मोबाइल से दुकान का डेटा देखने के लिए)। खाली = इसी डिवाइस पर।' : 'Backend server URL (needed when using the APK from your phone). Blank = same device.'}
          </p>
          <Field label="Server URL (e.g. https://my-store.up.railway.app)">
            <input className="inp" placeholder="https://…" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
          </Field>
          <p className="mt-2 text-[11px] text-slate-400">Current / अभी: <code>{getApiBase()}</code></p>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => { setServerUrl(''); setApiBase('/api'); }}>{hi ? 'रीसेट' : 'Reset'}</button>
            <button className="btn-primary" onClick={saveServer}>{hi ? 'सेव करें' : 'Save & Reload'}</button>
          </div>
        </Modal>
      </div>
    </div>
  );
}
