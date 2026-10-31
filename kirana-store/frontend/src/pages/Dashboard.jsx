import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  ScanBarcode, Package, Boxes, Wallet, BarChart3, Gift, Globe, Settings as SettingsIcon,
  IndianRupee, ReceiptText, AlertTriangle,
} from 'lucide-react';
import { api } from '../api.js';
import { inr0 } from '../utils.js';

// SIMPLE home screen: 4 numbers + big touch tiles (mobile-first)
const TILES = [
  { to: '/pos', icon: ScanBarcode, en: 'New Bill', hi: 'नया बिल', cls: 'bg-brand-600 text-white' },
  { to: '/products', icon: Package, en: 'Products', hi: 'प्रोडक्ट', cls: 'bg-sky-600 text-white' },
  { to: '/inventory', icon: Boxes, en: 'Stock', hi: 'स्टॉक', cls: 'bg-emerald-600 text-white' },
  { to: '/credit', icon: Wallet, en: 'Udhar', hi: 'उधार', cls: 'bg-rose-600 text-white' },
  { to: '/reports', icon: BarChart3, en: 'Reports', hi: 'रिपोर्ट', cls: 'bg-violet-600 text-white' },
  { to: '/offers', icon: Gift, en: 'Offers', hi: 'ऑफर', cls: 'bg-amber-500 text-white' },
  { to: '/shop', icon: Globe, en: 'Online Shop', hi: 'ऑनलाइन दुकान', cls: 'bg-teal-600 text-white', ext: true },
  { to: '/settings', icon: SettingsIcon, en: 'Settings', hi: 'सेटिंग्स', cls: 'bg-slate-600 text-white' },
];

export default function Dashboard() {
  const ui = useSelector((s) => s.ui);
  const [sum, setSum] = useState(null);
  const [stock, setStock] = useState(null);
  const [credit, setCredit] = useState(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    api.get('/reports/summary', { params: { from: today, to: today } }).then((r) => setSum(r.data)).catch(() => {});
    api.get('/reports/stock').then((r) => setStock(r.data)).catch(() => {});
    api.get('/reports/credit').then((r) => setCredit(r.data)).catch(() => {});
  }, [ui.storeId]);

  const chips = [
    { icon: IndianRupee, label: "Today's sale / आज की बिक्री", value: inr0(sum?.sales || 0) },
    { icon: ReceiptText, label: 'Bills / बिल', value: sum?.billsCount || 0 },
    { icon: AlertTriangle, label: 'Low stock / कम स्टॉक', value: stock?.lowStock?.length || 0 },
    { icon: Wallet, label: 'Udhar / उधार', value: inr0(credit?.total || 0) },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {chips.map((c, i) => (
          <div key={i} className="card p-3 text-center">
            <c.icon size={18} className="mx-auto mb-1 text-brand-600" />
            <div className="text-lg font-black leading-tight">{c.value}</div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TILES.map((t) => (
          <Link key={t.to} to={t.to} target={t.ext ? '_blank' : undefined} rel={t.ext ? 'noreferrer' : undefined}
            className={`${t.cls} flex flex-col items-center justify-center gap-2 rounded-2xl p-5 shadow-card transition active:scale-95 min-h-[110px]`}>
            <t.icon size={34} strokeWidth={2.2} />
            <div className="text-center leading-tight">
              <div className="font-extrabold">{t.en}</div>
              <div className="text-[11px] opacity-90">{t.hi}</div>
            </div>
          </Link>
        ))}
      </div>

      <Link to="/more" className="card block p-3 text-center text-sm font-bold text-slate-500 dark:text-slate-300">
        More options / और विकल्प — suppliers, labels, users, orders…
      </Link>
    </div>
  );
}
