import React from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Tags, Truck, ShoppingCart, Store as StoreIcon, Printer, Shield, Bell, Users } from 'lucide-react';

// Everything that is not needed daily lives here — keeps the main menu simple.
export default function More() {
  const role = useSelector((s) => s.auth.user)?.role;
  const items = [
    { to: '/prices', icon: Tags, en: 'Price Editor', hi: 'भाव बदलें', roles: ['admin'] },
    { to: '/suppliers', icon: Truck, en: 'Suppliers', hi: 'सप्लायर', roles: ['admin', 'manager'] },
    { to: '/orders', icon: ShoppingCart, en: 'Online Orders', hi: 'ऑनलाइन ऑर्डर', roles: ['admin', 'manager'] },
    { to: '/stores', icon: StoreIcon, en: 'Branches', hi: 'ब्रांच', roles: ['admin', 'manager'] },
    { to: '/labels', icon: Printer, en: 'Barcode Labels', hi: 'लेबल प्रिंट', roles: ['admin', 'manager'] },
    { to: '/customers', icon: Users, en: 'Customers', hi: 'कस्टमर' },
    { to: '/admin', icon: Shield, en: 'Users & Shifts', hi: 'यूज़र और शिफ्ट', roles: ['admin'] },
    { to: '/notifications', icon: Bell, en: 'Alerts', hi: 'सूचनाएं' },
  ].filter((i) => !i.roles || i.roles.includes(role));

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-xl font-extrabold">More / और विकल्प</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((t) => (
          <Link key={t.to} to={t.to}
            className="card flex flex-col items-center justify-center gap-2 p-5 text-center transition active:scale-95 min-h-[100px]">
            <t.icon size={28} className="text-brand-600" />
            <div className="leading-tight"><div className="text-sm font-extrabold">{t.en}</div><div className="text-[11px] text-slate-400">{t.hi}</div></div>
          </Link>
        ))}
      </div>
    </div>
  );
}
