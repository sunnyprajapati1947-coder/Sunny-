import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const inr = (n) => '₹' + (Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const inr0 = (n) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtDT = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

// ---- beep / buzz sounds via WebAudio (no assets) ----
let ctx;
export function beep(kind = 'ok', enabled = true) {
  if (!enabled) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const play = (freq, t0, dur) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t0);
      g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t0 + dur);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t0); o.stop(ctx.currentTime + t0 + dur + 0.02);
    };
    if (kind === 'ok') play(1250, 0, 0.09);
    else if (kind === 'error') { play(220, 0, 0.16); play(180, 0.14, 0.2); }
    else if (kind === 'pay') { play(880, 0, 0.1); play(1320, 0.11, 0.12); play(1760, 0.23, 0.18); }
  } catch { /* ignore */ }
}

export function waLink(phone, text) {
  const p = String(phone || '').replace(/\D/g, '');
  const full = p.length === 10 ? '91' + p : p;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

export function exportCSV(filename, rows) {
  if (!rows?.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  download(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), filename + '.csv');
}
export function exportExcel(filename, rows, sheet = 'Report') {
  const ws = XLSX.utils.json_to_sheet(rows || []);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  XLSX.writeFile(wb, filename + '.xlsx');
}
export function exportPDF(filename, title, head, rows) {
  const doc = new jsPDF();
  doc.setFontSize(14); doc.text('Rishu Kirana Store', 14, 14);
  doc.setFontSize(10); doc.text('Gaya Road, Nawada • 9608087035', 14, 20);
  doc.setFontSize(12); doc.text(title, 14, 28);
  doc.setFontSize(9); doc.text('Generated: ' + new Date().toLocaleString('en-IN'), 14, 34);
  autoTable(doc, { head: [head], body: (rows || []).map((r) => head.map((_, i) => r[Object.keys(r)[i]] ?? '')), startY: 39, styles: { fontSize: 8 } });
  doc.save(filename + '.pdf');
}
export function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// Hardware USB barcode scanners behave as keyboards: fast keystrokes ending in Enter
export function useHardwareScanner(onScan, enabled = true) {
  useEffectScanner(onScan, enabled);
}
import { useEffect, useRef } from 'react';
function useEffectScanner(onScan, enabled) {
  const cb = useRef(onScan); cb.current = onScan;
  useEffect(() => {
    if (!enabled) return;
    let buf = ''; let last = 0;
    const h = (e) => {
      const tag = document.activeElement?.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      const now = Date.now();
      if (now - last > 120) buf = '';
      last = now;
      if (e.key === 'Enter') {
        if (buf.length >= 6 && !inField) { cb.current(buf); }
        buf = '';
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!inField) { buf += e.key; e.preventDefault(); }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [enabled]);
}
