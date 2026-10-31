import React, { useEffect } from 'react';
import { X, AlertTriangle, Inbox } from 'lucide-react';

export const Modal = ({ open, onClose, title, children, wide, footer }) => {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose?.(); };
    if (open) window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`card w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} max-h-[92vh] flex flex-col rounded-b-none sm:rounded-b-xl`}>
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4 py-3">
          <h3 className="font-bold text-slate-800 dark:text-slate-100">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
        {footer && <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
};

export const Field = ({ label, children, className = '' }) => (
  <div className={className}><label className="lbl">{label}</label>{children}</div>
);

export const Stat = ({ icon: Icon, label, value, sub, tone = 'brand' }) => {
  const tones = { brand: 'bg-brand-500/15 text-brand-600 dark:text-brand-500', green: 'bg-emerald-500/15 text-emerald-600', blue: 'bg-sky-500/15 text-sky-600', rose: 'bg-rose-500/15 text-rose-600', amber: 'bg-amber-500/15 text-amber-600' };
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`rounded-xl p-2.5 ${tones[tone]}`}>{Icon && <Icon size={22} />}</div>
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">{label}</div>
        <div className="text-xl font-extrabold text-slate-800 dark:text-white truncate">{value}</div>
        {sub && <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{sub}</div>}
      </div>
    </div>
  );
};

export const Badge = ({ children, tone = 'slate' }) => {
  const tones = { slate: 'bg-slate-200/80 text-slate-700 dark:bg-slate-700 dark:text-slate-200', green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300', rose: 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300', amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300', blue: 'bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300' };
  return <span className={`badge ${tones[tone]}`}>{children}</span>;
};

export const Empty = ({ text = 'No data yet' }) => (
  <div className="flex flex-col items-center justify-center py-10 text-slate-400">
    <Inbox size={36} strokeWidth={1.5} /><p className="mt-2 text-sm">{text}</p>
  </div>
);

export const Table = ({ head, children, empty }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[640px] border-collapse">
      <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-ink-700/50">
        <tr>{head.map((h) => <th key={h} className="th">{h}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">{children}</tbody>
    </table>
    {empty}
  </div>
);

export const Confirm = ({ open, onClose, onYes, text, danger = true }) => (
  <Modal open={open} onClose={onClose} title="Confirm">
    <div className="flex items-start gap-3">
      <AlertTriangle className={danger ? 'text-rose-500' : 'text-amber-500'} size={22} />
      <p className="text-sm text-slate-600 dark:text-slate-300">{text}</p>
    </div>
    <div className="mt-4 flex justify-end gap-2">
      <button className="btn-ghost" onClick={onClose}>Cancel</button>
      <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={() => { onYes(); onClose(); }}>Yes</button>
    </div>
  </Modal>
);

export const Tabs = ({ tabs, active, onChange }) => (
  <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-200/70 dark:bg-ink-700 p-1 w-fit max-w-full">
    {tabs.map((t) => (
      <button key={t.id} onClick={() => onChange(t.id)}
        className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${active === t.id ? 'bg-white dark:bg-ink-800 shadow text-slate-800 dark:text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-white/50'}`}>
        {t.label}
      </button>
    ))}
  </div>
);

export const Toasts = ({ toasts }) => (
  <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
    {toasts.map((t) => (
      <div key={t.id} className={`card px-4 py-3 text-sm font-semibold border-l-4 ${t.kind === 'error' ? 'border-rose-500' : t.kind === 'warn' ? 'border-amber-500' : 'border-emerald-500'}`}>
        {t.msg}
      </div>
    ))}
  </div>
);

export const PageHead = ({ title, sub, children }) => (
  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-xl font-extrabold text-slate-800 dark:text-white">{title}</h1>
      {sub && <p className="text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>
);
