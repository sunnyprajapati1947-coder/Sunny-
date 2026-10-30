/**
 * Barcode capture with three input paths:
 *  1. Native `BarcodeDetector` (Chrome/Android — fastest).
 *  2. ZXing (`@zxing/browser`) fallback for iOS Safari/Firefox.
 *  3. USB/Bluetooth keyboard-wedge scanners (fast keystrokes + Enter).
 */

type DetectedBarcode = { rawValue: string; format: string }
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource | ImageBitmapSource) => Promise<DetectedBarcode[]>
  getSupportedFormats?: () => Promise<string[]>
}

export const BARCODE_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'code_93',
  'itf',
  'codabar',
  'qr_code',
  'data_matrix',
]

export function hasNativeDetector(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window
}

export async function createNativeDetector(): Promise<BarcodeDetectorLike | null> {
  if (!hasNativeDetector()) return null
  const Ctor = (window as unknown as { BarcodeDetector: new (options?: { formats?: string[] }) => BarcodeDetectorLike }).BarcodeDetector
  try {
    if (typeof (Ctor as unknown as { getSupportedFormats?: () => Promise<string[]> }).getSupportedFormats === 'function') {
      const supported = await (Ctor as unknown as { getSupportedFormats: () => Promise<string[]> }).getSupportedFormats()
      const formats = BARCODE_FORMATS.filter((format) => supported.includes(format))
      if (!formats.length) return null
      return new Ctor({ formats })
    }
    return new Ctor({ formats: BARCODE_FORMATS })
  } catch {
    return null
  }
}

export function normaliseBarcode(raw: string): string {
  return raw.replace(/\s+/g, '').trim()
}

/** Thermal labels sometimes print a check digit twice — keep as-is, but trim prefixes. */
export function looksLikeBarcode(value: string): boolean {
  return /^[0-9A-Za-z._-]{4,64}$/.test(value)
}

export interface KeyboardScannerOptions {
  onScan: (code: string) => void
  /** Max gap between keystrokes that still counts as scanner input. */
  maxGapMs?: number
  minLength?: number
  /** Set false when an input/textarea has focus (typing a name shouldn't scan). */
  isEnabled?: () => boolean
}

/**
 * Keyboard-wedge scanner listener (USB + most Bluetooth scanners).
 * Works even when the focus is on the page body, which is how these devices
 * behave out of the box.
 */
export function listenKeyboardScanner({
  onScan,
  maxGapMs = 55,
  minLength = 4,
  isEnabled = () => true,
}: KeyboardScannerOptions): () => void {
  let buffer = ''
  let lastTime = 0

  const handler = (event: KeyboardEvent) => {
    if (!isEnabled()) return
    const target = event.target as HTMLElement | null
    const isFormField = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
    const now = Date.now()
    if (now - lastTime > maxGapMs) buffer = ''
    lastTime = now

    if (event.key === 'Enter') {
      if (buffer.length >= minLength) {
        onScan(normaliseBarcode(buffer))
        buffer = ''
        // A scanner ends with Enter — swallow it so it never submits a form.
        if (!isFormField) event.preventDefault()
        else event.preventDefault()
      }
      return
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (isFormField && (target as HTMLInputElement).dataset.scanListener !== 'true') return
      buffer += event.key
    }
  }

  window.addEventListener('keydown', handler, true)
  return () => window.removeEventListener('keydown', handler, true)
}
