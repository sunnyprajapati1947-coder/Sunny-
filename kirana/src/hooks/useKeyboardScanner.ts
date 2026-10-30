import { useEffect, useRef, useState } from 'react'
import { listenKeyboardScanner } from '../lib/barcode'

/**
 * Detects a USB/Bluetooth (keyboard-wedge) barcode scanner.
 * Shows a small "Scanner connected" badge once a scan is seen.
 */
export function useKeyboardScanner(onScan: (code: string) => void, enabled = true) {
  const [detected, setDetected] = useState(false)
  const callback = useRef(onScan)
  callback.current = onScan

  useEffect(() => {
    if (!enabled) return
    const stop = listenKeyboardScanner({
      onScan: (code) => {
        setDetected(true)
        callback.current(code)
      },
      isEnabled: () => document.visibilityState === 'visible',
    })
    return stop
  }, [enabled])

  return { scannerDetected: detected }
}
