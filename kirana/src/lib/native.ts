/**
 * Bridge detection + the handful of places where the Android shell behaves
 * differently from the browser. Everything here is a no-op on the web, so the
 * same bundle runs in both places.
 */
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/** Blob → base64 without blowing the call stack on large PDFs. */
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/**
 * Writes a PDF to the app cache and opens the Android share sheet, so a
 * shopkeeper can send the bill on WhatsApp or hand it to a printer app.
 * Returns false on the web so the caller keeps its `navigator.share` path.
 */
export async function sharePdfNative(blob: Blob, filename: string, title: string): Promise<boolean> {
  if (!isNativeApp()) return false
  try {
    const data = await blobToBase64(blob)
    const written = await Filesystem.writeFile({
      path: filename,
      data,
      directory: Directory.Cache,
      recursive: true,
    })
    await Share.share({ title, url: written.uri, dialogTitle: title })
    return true
  } catch (error) {
    console.error('Native PDF share failed', error)
    return false
  }
}

/** Saves a PDF into the app's documents folder (no file picker in a WebView). */
export async function savePdfNative(blob: Blob, filename: string): Promise<boolean> {
  if (!isNativeApp()) return false
  try {
    const data = await blobToBase64(blob)
    await Filesystem.writeFile({
      path: `receipts/${filename}`,
      data,
      directory: Directory.Documents,
      recursive: true,
    })
    return true
  } catch (error) {
    console.error('Native PDF save failed', error)
    return false
  }
}

/** Opens any external URI with the right platform mechanism. */
export async function openExternal(url: string): Promise<void> {
  if (isNativeApp()) {
    try {
      const { AppLauncher } = await import('@capacitor/app-launcher')
      await AppLauncher.openUrl({ url })
      return
    } catch (error) {
      console.error('Could not open', url, error)
    }
  }
  window.open(url, '_blank', 'noopener')
}

/**
 * In the APK, `https://wa.me/...`, `sms:`, `tel:` and `upi:` links must go to the
 * Android intent system — a WebView would otherwise navigate the app away and
 * strand the shopkeeper on a web page. One document-level listener covers every
 * link in the UI (receipts, khata reminders, UPI "open app", order list).
 */
export function installExternalLinkBridge(): void {
  if (!isNativeApp()) return
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target as HTMLElement | null
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      const href = anchor.getAttribute('href') ?? ''
      if (!/^(https?:|whatsapp:|sms:|tel:|mailto:|upi:)/i.test(href)) return
      // Never hijack in-app router links.
      if (href.startsWith('/') || anchor.getAttribute('target') === '_self') return
      event.preventDefault()
      void openExternal(href)
    },
    true,
  )
}

/**
 * WebView cannot open `https://wa.me/...` in a new tab; it needs to be handed to
 * the Android intent system.
 */
export async function openWhatsAppNative(text: string, phone?: string | null): Promise<boolean> {
  if (!isNativeApp()) return false
  try {
    const { AppLauncher } = await import('@capacitor/app-launcher')
    const digits = (phone ?? '').replace(/\D/g, '')
    const withCountry = digits.length === 10 ? `91${digits}` : digits
    const url = `whatsapp://send?${withCountry ? `phone=${withCountry}&` : ''}text=${encodeURIComponent(text)}`
    await AppLauncher.openUrl({ url })
    return true
  } catch (error) {
    console.error('WhatsApp launch failed', error)
    return false
  }
}
