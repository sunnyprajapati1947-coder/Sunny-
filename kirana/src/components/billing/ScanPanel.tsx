import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Keyboard, ScanLine, Zap, ZapOff } from 'lucide-react'
import clsx from 'clsx'
import { Button, IconButton } from '../ui/button'
import { Input } from '../ui/form'
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner'
import { useKeyboardScanner } from '../../hooks/useKeyboardScanner'
import { useT } from '../../i18n/useT'
import { scanFeedback } from '../../lib/audio'

interface ScanPanelProps {
  onScan: (code: string, source: 'camera' | 'manual' | 'device') => void
  /** Highlights the frame green after a successful add. */
  lastResult?: 'ok' | 'error' | null
  /** Auto-start the camera when the billing screen opens. */
  autoStart?: boolean
  compact?: boolean
}

export function ScanPanel({ onScan, lastResult, autoStart = true, compact = false }: ScanPanelProps) {
  const t = useT()
  const [manualOpen, setManualOpen] = useState(false)
  const [manualValue, setManualValue] = useState('')
  const [flash, setFlash] = useState(false)
  const startedOnce = useRef(false)

  const handleCameraScan = (code: string) => {
    setFlash(true)
    window.setTimeout(() => setFlash(false), 450)
    onScan(code, 'camera')
  }

  const scanner = useBarcodeScanner({ onScan: handleCameraScan })
  const { scannerDetected } = useKeyboardScanner((code) => onScan(code, 'device'), true)

  useEffect(() => {
    if (!autoStart || startedOnce.current) return
    startedOnce.current = true
    // Browsers require a gesture; on Android the PWA allows immediate start.
    const timer = window.setTimeout(() => {
      void scanner.start().catch(() => undefined)
    }, 350)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart])

  useEffect(() => {
    if (lastResult === 'ok') scanFeedback(true)
    if (lastResult === 'error') scanFeedback(false)
  }, [lastResult])

  const submitManual = () => {
    const value = manualValue.trim()
    if (!value) return
    onScan(value, 'manual')
    setManualValue('')
  }

  return (
    <div
      className={clsx(
        'overflow-hidden rounded-2.5xl border-2 bg-white shadow-card transition-colors dark:bg-ink-900',
        flash ? 'border-brand-500' : 'border-ink-100 dark:border-ink-800',
      )}
    >
      <div className="relative aspect-[16/9] w-full bg-ink-950">
        <video
          ref={scanner.videoRef}
          className={clsx('h-full w-full object-cover', !scanner.isRunning && 'opacity-0')}
          playsInline
          muted
          autoPlay
        />

        {scanner.isRunning && (
          <>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-[46%] w-[74%] rounded-2xl border-2 border-brand-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
            <div className="absolute left-1/2 top-1/2 h-0.5 w-[70%] -translate-x-1/2 -translate-y-1/2 animate-pulse bg-red-500/90" />
          </>
        )}

        {!scanner.isRunning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <ScanLine className="h-9 w-9 text-brand-400" />
            <p className="text-sm font-semibold text-white/90">
              {scanner.status === 'denied' ? t('cameraPermission') : scanner.status === 'error' ? t('cameraOff') : t('scanHint')}
            </p>
            <Button
              size="sm"
              variant="success"
              loading={scanner.status === 'starting'}
              icon={<Camera className="h-4 w-4" />}
              onClick={() => void scanner.start()}
            >
              {t('startCamera')}
            </Button>
          </div>
        )}

        <div className="absolute right-2 top-2 flex gap-1.5">
          {scanner.isRunning ? (
            <IconButton
              label={t('stopCamera')}
              size="sm"
              variant="ghost"
              className="bg-black/40 text-white hover:bg-black/60"
              icon={<CameraOff className="h-5 w-5" />}
              onClick={scanner.stop}
            />
          ) : (
            <IconButton
              label={t('startCamera')}
              size="sm"
              variant="ghost"
              className="bg-black/40 text-white hover:bg-black/60"
              icon={<Camera className="h-5 w-5" />}
              onClick={() => void scanner.start()}
            />
          )}
          <IconButton
            label={t('manualBarcode')}
            size="sm"
            variant="ghost"
            className="bg-black/40 text-white hover:bg-black/60"
            icon={<Keyboard className="h-5 w-5" />}
            onClick={() => setManualOpen((value) => !value)}
          />
        </div>
      </div>

      {(manualOpen || !compact) && (
        <div className="flex items-center gap-2 p-2.5">
          <Input
            value={manualValue}
            onChange={(event) => setManualValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitManual()
            }}
            inputMode="numeric"
            placeholder={t('manualBarcode')}
            className="h-11 flex-1"
            data-scan-listener="true"
            autoComplete="off"
          />
          <Button size="md" onClick={submitManual} disabled={!manualValue.trim()}>
            {t('add')}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-2.5 text-[11px] font-medium text-ink-500 dark:text-ink-400">
        {scanner.engine === 'native' && (
          <span className="inline-flex items-center gap-1 text-brand-700 dark:text-brand-300">
            <Zap className="h-3 w-3" /> Fast scanner
          </span>
        )}
        {scanner.engine === 'zxing' && (
          <span className="inline-flex items-center gap-1">
            <ZapOff className="h-3 w-3" /> Compatible scanner
          </span>
        )}
        {scannerDetected && (
          <span className="inline-flex items-center gap-1 text-brand-700 dark:text-brand-300">
            <Keyboard className="h-3 w-3" /> {t('scannerReady')}
          </span>
        )}
        <span>{scanner.isRunning ? 'Camera ON' : 'Camera OFF'}</span>
      </div>
    </div>
  )
}
