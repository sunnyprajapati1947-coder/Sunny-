import { useCallback, useEffect, useRef, useState } from 'react'

export type ScannerStatus = 'idle' | 'starting' | 'scanning' | 'error' | 'denied'

interface ScannerOptions {
  onScan: (code: string) => void
  /** Debounce identical codes within this window (ms). */
  debounceMs?: number
}

/**
 * Camera barcode scanning with graceful fallback:
 *  - BarcodeDetector (Chrome/Android) → fast, no extra JS
 *  - @zxing/browser → iOS Safari / Firefox
 * Both share the same <video> element so the UI never flickers between modes.
 */
export function useBarcodeScanner({ onScan, debounceMs = 1400 }: ScannerOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [status, setStatus] = useState<ScannerStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [engine, setEngine] = useState<'native' | 'zxing' | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const zxingStopRef = useRef<(() => void) | null>(null)
  const lastScanRef = useRef<{ code: string; at: number } | null>(null)
  const onScanRef = useRef(onScan)
  const activeRef = useRef(false)

  onScanRef.current = onScan

  const emit = useCallback(
    (code: string) => {
      const now = Date.now()
      const last = lastScanRef.current
      if (last && last.code === code && now - last.at < debounceMs) return
      lastScanRef.current = { code, at: now }
      onScanRef.current(code)
    },
    [debounceMs],
  )

  const stop = useCallback(() => {
    activeRef.current = false
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    zxingStopRef.current?.()
    zxingStopRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.srcObject = null
      videoRef.current.removeAttribute('src')
    }
    setStatus('idle')
    setEngine(null)
  }, [])

  const start = useCallback(async () => {
    if (activeRef.current) return
    setError(null)
    setStatus('starting')
    activeRef.current = true
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera not supported on this browser')
      }

      // Prefer the native detector: much lower battery/CPU use.
      const detector = await createDetector()
      if (detector && videoRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        streamRef.current = stream
        const video = videoRef.current
        video.srcObject = stream
        video.setAttribute('playsinline', 'true')
        video.muted = true
        await video.play()
        setEngine('native')
        setStatus('scanning')
        const tick = async () => {
          if (!activeRef.current || !videoRef.current) return
          if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
            try {
              const codes = await detector.detect(videoRef.current)
              const value = codes.find((code) => code.rawValue)?.rawValue
              if (value) emit(value.trim())
            } catch {
              /* transient decode errors are normal */
            }
          }
          rafRef.current = requestAnimationFrame(() => void tick())
        }
        void tick()
        return
      }

      // Fallback: ZXing.
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      setEngine('zxing')
      const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 180 })
      setStatus('scanning')
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        videoRef.current ?? undefined,
        (result) => {
          if (result) emit(result.getText().trim())
        },
      )
      zxingStopRef.current = () => controls.stop()
    } catch (err) {
      activeRef.current = false
      const message = err instanceof Error ? err.message : String(err)
      const denied = /permission|denied|NotAllowed/i.test(message)
      setStatus(denied ? 'denied' : 'error')
      setError(denied ? 'Camera ki permission chahiye' : 'Camera start nahi hua')
    }
  }, [emit])

  useEffect(() => () => stop(), [stop])

  // Pause the camera when the tab is hidden (saves battery).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && activeRef.current) stop()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [stop])

  return { videoRef, status, error, engine, start, stop, isRunning: status === 'scanning' }
}

async function createDetector(): Promise<{ detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> } | null> {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null
  try {
    const Ctor = (window as unknown as {
      BarcodeDetector: {
        new (options?: { formats?: string[] }): { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> }
        getSupportedFormats?: () => Promise<string[]>
      }
    }).BarcodeDetector
    if (typeof Ctor.getSupportedFormats === 'function') {
      const supported = await Ctor.getSupportedFormats()
      const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'].filter((f) =>
        supported.includes(f),
      )
      if (!formats.length) return null
      return new Ctor({ formats })
    }
    return new Ctor()
  } catch {
    return null
  }
}
