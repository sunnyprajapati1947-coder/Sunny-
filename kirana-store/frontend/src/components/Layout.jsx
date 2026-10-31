import React, { useEffect, useState, useCallback } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
  LayoutDashboard, ScanBarcode, Package, Boxes, Wallet, BarChart3,
  Settings as SettingsIcon, Globe, Store as StoreIcon,
  LogOut, Moon, Sun, Bell, Menu, X, Languages, Volume2, VolumeX, Grid3x3,
} from 'lucide-react';
import { api, socket } from '../api.js';
import { logout, toggleTheme, setLang, setStore as setStoreId, toggleSound, toast } from '../store.js';
import { makeT } from '../i18n.js';
import { Toasts } from './ui.jsx';
import { beep } from '../utils.js';
import InstallAppButton from './InstallApp.jsx';

const NAV = [
  { to: '/', icon: LayoutDashboard, key: 'dashboard', end: true },
  { to: '/pos', icon: ScanBarcode, key: 'pos' },
  { to: '/products', icon: Package, key: 'products', roles: ['admin', 'manager'] },
  { to: '/inventory', icon: Boxes, key: 'inventory', roles: ['admin', 'manager'] },
  { to: '/credit', icon: Wallet, key: 'credit' },
  { to: '/reports', icon: BarChart3, key: 'reports', roles: ['admin', 'manager'] },
  { to: '/more', icon: Grid3x3, key: 'more' },
  { to: '/settings', icon: SettingsIcon, key: 'settings' },
];

export default function Layout() {
  const { user } = useSelector((s) => s.auth);
  const ui = useSelector((s) => s.ui);
  const dispatch = useDispatch();
  const nav = useNavigate();
  const t = makeT(ui.lang);
  const [open, setOpen] = useState(false);
  const [stores, setStores] = useState([]);
  const [settings, setSettings] = useState(null);
  const [notiCount, setNotiCount] = useState(0);

  useEffect(() => {
    api.get('/stores').then((r) => setStores(r.data)).catch(() => {});
    api.get('/settings').then((r) => setSettings(r.data)).catch(() => {});
    const refreshNoti = () => api.get('/notifications').then((r) => setNotiCount(r.data.filter((n) => !n.read).length)).catch(() => {});
    refreshNoti();
    const iv = setInterval(refreshNoti, 45000);
    api.post('/notifications/generate').catch(() => {});
    return () => clearInterval(iv);
  }, []);

  // real-time stock & sale pushes
  useEffect(() => {
    const onStock = () => dispatch(toast({ msg: ui.lang === hi ? 'स्टॉक अपडेट हुआ' : 'Stock updated in real-time', kind: 'ok' }));
    const hi = 'hi';
    socket.on('stock:update', onStock);
    socket.on('order:new', (o) => dispatch(toast({ msg: `New online order ${o.orderNumber}`, kind: 'ok' })));
    return () => { socket.off('stock:update', onStock); socket.off('order:new'); };
  }, [dispatch, ui.lang]);

  // session idle timeout (security)
  useEffect(() => {
    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { dispatch(logout()); nav('/login'); }, (settings?.sessionTimeoutMin || 30) * 60000);
    };
    ['click', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, reset));
    reset();
    return () => { clearTimeout(timer); ['click', 'keydown', 'touchstart'].forEach((e) => window.removeEventListener(e, reset)); };
  }, [settings, dispatch, nav]);

  const navItems = NAV.filter((n) => !n.roles || n.roles.includes(user?.role));

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className={`fixed z-40 inset-y-0 left-0 w-60 transform bg-ink-900 text-slate-200 transition-transform lg:static lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-white/10">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white font-black">R</div>
          <div className="min-w-0">
            <div className="font-extrabold text-white truncate text-sm">{settings?.storeName || 'Rishu Kirana Store'}</div>
            <div className="text-[10px] text-slate-400 truncate">{settings?.address || 'Gaya Road, Nawada'}</div>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setOpen(false)}><X size={18} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {navItems.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-brand-600 text-white shadow' : 'text-slate-300 hover:bg-white/10'}`}>
              <n.icon size={18} /> {t(n.key)}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3 text-[11px] text-slate-400">
          <div className="font-bold text-slate-200">{user?.name}</div>
          <div className="uppercase tracking-wider">{user?.role} • {settings?.phone || '9608087035'}</div>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-ink-800/90 backdrop-blur px-3 py-2">
          <button className="lg:hidden btn-ghost !p-2" onClick={() => setOpen(true)}><Menu size={20} /></button>
          {stores.length > 1 && (
            <select className="inp !w-auto !py-1.5 text-xs font-bold" value={ui.storeId} onChange={(e) => dispatch(setStoreId(e.target.value))}>
              {stores.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          )}
          <div className="ml-auto flex items-center gap-1">
            <InstallAppButton />
            <button title="Sound" className="btn-ghost !p-2" onClick={() => dispatch(toggleSound())}>{ui.sound ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
            <button title="Language / भाषा" className="btn-ghost !p-2" onClick={() => dispatch(setLang(ui.lang === 'en' ? 'hi' : 'en'))}><Languages size={17} /></button>
            <button title="Dark mode (F9)" className="btn-ghost !p-2" onClick={() => dispatch(toggleTheme())}>{ui.theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
            <button title="Notifications" className="btn-ghost !p-2 relative" onClick={() => nav('/notifications')}>
              <Bell size={17} />{notiCount > 0 && <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">{notiCount}</span>}
            </button>
            <a className="btn-ghost !p-2" title="Online Shop" href="/shop" target="_blank" rel="noreferrer"><Globe size={17} /></a>
            <button className="btn-ghost !p-2" title={t('logout')} onClick={() => { dispatch(logout()); nav('/login'); }}><LogOut size={17} /></button>
          </div>
        </header>
        <main className="flex-1 p-3 sm:p-5"><Outlet /></main>
      </div>
      <Toasts toasts={ui.toasts} />
    </div>
  );
}
