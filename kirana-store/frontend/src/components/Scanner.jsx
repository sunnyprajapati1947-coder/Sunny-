import React, { useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Modal } from './ui.jsx';
import { ScanBarcode } from 'lucide-react';

// Camera-based scanning: EAN-13, EAN-8, UPC-A, CODE-128, QR (mobile + desktop)
export default function CameraScanner({ open, onClose, onScan }) {
  const ref = useRef(null);
  const scanner = useRef(null);
  const cb = useRef(onScan); cb.current = onScan;

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    const start = async () => {
      try {
        scanner.current = new Html5Qrcode('rk-cam', {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          verbose: false,
        });
        await scanner.current.start(
          { facingMode: 'environment' },
          { fps: 12, qrbox: { width: 240, height: 140 } },
          (text) => cb.current(text),
          () => {}
        );
      } catch (e) {
        if (!stopped) alert('Camera error: ' + (e?.message || e) + '\nUse a USB barcode scanner or type the code instead.');
      }
    };
    start();
    return () => {
      stopped = true;
      try { scanner.current?.stop()?.then(() => scanner.current?.clear()).catch(() => {}); } catch { /* */ }
    };
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Camera Barcode Scanner / कैमरा स्कैनर">
      <div id="rk-cam" ref={ref} className="overflow-hidden rounded-xl bg-black min-h-[240px]" />
      <p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><ScanBarcode size={16} /> Point camera at barcode — EAN-13 / EAN-8 / UPC / Code-128 / QR</p>
    </Modal>
  );
}
