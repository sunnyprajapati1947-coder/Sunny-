import React, { useEffect, useState } from 'react';
import { Smartphone, Download, X } from 'lucide-react';
import { Modal } from './ui.jsx';

// Captures Chrome/Android "beforeinstallprompt" and guides iOS Safari users.
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true);
  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => { setDeferred(null); setInstalled(true); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);
  return { deferred, installed, prompt: async () => { if (!deferred) return false; deferred.prompt(); const r = await deferred.userChoice; setDeferred(null); return r.outcome === 'accepted'; } };
}

export default function InstallAppButton({ compact = false }) {
  const { deferred, installed, prompt } = useInstallPrompt();
  const [help, setHelp] = useState(false);
  if (installed) return null;
  return (
    <>
      <button
        title="Install mobile app / मोबाइल ऐप इंस्टॉल करें"
        className="btn-ghost !p-2"
        onClick={async () => { const ok = await prompt(); if (!ok) setHelp(true); }}
      >
        {deferred ? <Download size={17} /> : <Smartphone size={17} />}
        {!compact && deferred && <span className="hidden sm:inline text-xs font-bold">Install App</span>}
      </button>
      <Modal open={help} onClose={() => setHelp(false)} title="Phone par app install karein / मोबाइल में इंस्टॉल करें">
        <div className="space-y-3 text-sm">
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/30 p-3">
            <b>Android (Chrome):</b>
            <ol className="mt-1 list-decimal pl-5 space-y-1">
              <li>Chrome me yeh page kholein (yahi URL).</li>
              <li>Right-top <b>⋮ menu</b> → <b>"Install app"</b> ya <b>"Add to Home screen"</b>.</li>
              <li>Home screen par <b>Rishu Kirana</b> icon aa jayega — full-screen app jaisa, offline bhi khulega.</li>
            </ol>
          </div>
          <div className="rounded-xl bg-sky-50 dark:bg-sky-900/30 p-3">
            <b>iPhone (Safari):</b>
            <ol className="mt-1 list-decimal pl-5 space-y-1">
              <li>Safari me yeh page kholein.</li>
              <li>Neeche <b>Share (⬆)</b> button → <b>"Add to Home Screen"</b>.</li>
              <li><b>Add</b> dabaiye — home screen par app icon ban jayega.</li>
            </ol>
          </div>
          <p className="text-xs text-slate-500">
            Note: install sirf HTTPS par hota hai (yeh preview/hosted URL HTTPS hai ✓). Asli APK (Play-Store jaisa file) banane ka tarika repo me <b>MOBILE_APP.md</b> me hai (Capacitor se 10-min me).
          </p>
        </div>
        <div className="mt-4 flex justify-end"><button className="btn-primary" onClick={() => setHelp(false)}>Samajh gaya ✓</button></div>
      </Modal>
    </>
  );
}
