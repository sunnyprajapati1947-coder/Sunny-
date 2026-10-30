import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'

/**
 * Inside the Capacitor APK the assets are already on the device, so a service
 * worker adds nothing and can serve yesterday's bundle after an app update.
 * On the web we keep it: a stale PWA on a shop counter is worse than a reload.
 */
const isNativeShell =
  typeof window !== 'undefined' &&
  (window.location.protocol === 'capacitor:' ||
    window.location.hostname === 'localhost' ||
    Boolean((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()))

if (!isNativeShell) {
  registerSW({ immediate: true })
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
