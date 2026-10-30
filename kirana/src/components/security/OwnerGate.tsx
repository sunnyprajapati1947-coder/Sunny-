import { useEffect, useMemo, useState } from 'react'
import { Delete, Fingerprint, Lock, ShieldCheck } from 'lucide-react'
import { Button } from '../ui/button'
import { Sheet } from '../ui/sheet'
import { formatPaise } from '../../lib/money'
import type { OwnerApproval } from '../../types'
import type { ApprovalRequest } from '../../context/AppContext'

export interface GateRequest extends ApprovalRequest {
  pinConfigured: boolean
  resolve: (approval: OwnerApproval | null) => Promise<void> | void
}

interface OwnerGateProps {
  request: GateRequest
  verifyPin: (pin: string) => Promise<boolean>
  biometricEnabled: boolean
  verifyBiometric: () => Promise<boolean>
  onSetupPin: (pin: string) => Promise<void>
  onResolve: (approval: OwnerApproval | null) => Promise<void> | void
  onToast: (message: string, tone?: 'success' | 'error' | 'info') => void
}

/**
 * Re-authentication gate for money-sensitive actions. Always renders on top of
 * whatever the cashier was doing, so the price/discount flow cannot be skipped.
 */
export function OwnerGate({
  request,
  verifyPin,
  biometricEnabled,
  verifyBiometric,
  onSetupPin,
  onResolve,
  onToast,
}: OwnerGateProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [setupMode, setSetupMode] = useState(!request.pinConfigured)
  const [setupPin, setSetupPin] = useState('')
  const [setupConfirm, setSetupConfirm] = useState('')

  const title = setupMode ? 'Owner PIN set karein' : request.title
  const body = setupMode
    ? 'Pehli baar 4 ank ka secret PIN banayein. Price change aur discount ke liye lagega.'
    : request.body

  useEffect(() => {
    setPin('')
    setError(null)
  }, [request.permission, request.title])

  const submitPin = useMemo(
    () => async (value: string) => {
      if (value.length < 4) return
      setBusy(true)
      try {
        const ok = await verifyPin(value)
        if (!ok) {
          setError('Galat PIN — phir try karein')
          setPin('')
          return
        }
        await onResolve({
          approvedBy: 'owner',
          permission: request.permission,
          at: new Date().toISOString(),
          maxDiscountPaise: request.amountPaise,
        })
      } finally {
        setBusy(false)
      }
    },
    [verifyPin, onResolve, request.permission, request.amountPaise],
  )

  useEffect(() => {
    if (pin.length === 4 && !setupMode) void submitPin(pin)
  }, [pin, setupMode, submitPin])

  const handleDigit = (digit: string) => {
    setError(null)
    if (setupMode) {
      if (setupPin.length < 4) setSetupPin(setupPin + digit)
      else if (setupConfirm.length < 4) setSetupConfirm(setupConfirm + digit)
      return
    }
    if (pin.length < 4) setPin(pin + digit)
  }

  const handleBackspace = () => {
    setError(null)
    if (setupMode) {
      if (setupConfirm) setSetupConfirm(setupConfirm.slice(0, -1))
      else setSetupPin(setupPin.slice(0, -1))
      return
    }
    setPin(pin.slice(0, -1))
  }

  const savePin = async () => {
    if (setupPin.length !== 4) {
      setError('4 ank ka PIN daalein')
      return
    }
    if (setupPin !== setupConfirm) {
      setError('Dono PIN match nahi kar rahe')
      setSetupConfirm('')
      return
    }
    setBusy(true)
    try {
      await onSetupPin(setupPin)
      onToast('Owner PIN set ho gaya', 'success')
      await onResolve({
        approvedBy: 'owner',
        permission: request.permission,
        at: new Date().toISOString(),
        maxDiscountPaise: request.amountPaise,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PIN set nahi hua')
    } finally {
      setBusy(false)
    }
  }

  const tryBiometric = async () => {
    setBusy(true)
    try {
      const ok = await verifyBiometric()
      if (ok) {
        await onResolve({
          approvedBy: 'owner',
          permission: request.permission,
          at: new Date().toISOString(),
          maxDiscountPaise: request.amountPaise,
        })
      } else {
        setError('Fingerprint verify nahi hua — PIN daalein')
      }
    } finally {
      setBusy(false)
    }
  }

  const shown = setupMode ? setupPin.length < 4 ? setupPin : setupConfirm : pin
  const activeLength = setupMode ? (setupPin.length < 4 ? setupPin.length : setupConfirm.length) : pin.length

  return (
    <Sheet
      open
      onClose={() => onResolve(null)}
      title={title}
      subtitle={request.amountPaise ? formatPaise(request.amountPaise) : undefined}
      size="sm"
      dismissible={false}
      footer={
        <div className="space-y-2">
          {setupMode ? (
            <Button block size="lg" loading={busy} onClick={savePin} disabled={setupConfirm.length !== 4}>
              PIN save karein
            </Button>
          ) : (
            <Button
              block
              size="lg"
              loading={busy}
              disabled={pin.length < 4}
              onClick={() => void submitPin(pin)}
            >
              Unlock karein
            </Button>
          )}
          {!setupMode && biometricEnabled && (
            <Button block variant="outline" icon={<Fingerprint className="h-5 w-5" />} onClick={tryBiometric}>
              Fingerprint se kholein
            </Button>
          )}
          <Button block variant="ghost" onClick={() => onResolve(null)}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        <div className="flex items-start gap-3 rounded-2xl bg-saffron-50 p-3 text-saffron-900 dark:bg-saffron-900/25 dark:text-saffron-100">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">
            {body ?? 'Ye action sirf owner kar sakta hai.'}
          </p>
        </div>

        <div className="flex justify-center gap-3 py-1">
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              className={`h-4 w-4 rounded-full ${
                index < activeLength ? 'bg-brand-700 dark:bg-brand-400' : 'bg-ink-200 dark:bg-ink-700'
              }`}
            />
          ))}
        </div>
        <p className="text-center text-xs text-ink-500 dark:text-ink-300">
          {setupMode
            ? setupPin.length < 4
              ? 'Naya PIN daalein'
              : 'Wahi PIN dobara daalein'
            : shown.replace(/./g, '•')}
        </p>
        {error && <p className="text-center text-sm font-semibold text-red-600">{error}</p>}

        <div className="mx-auto grid max-w-xs grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-14 rounded-2xl bg-ink-100 font-display text-2xl font-bold text-ink-800 active:scale-95 dark:bg-ink-800 dark:text-ink-50"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={tryBiometric}
            disabled={!biometricEnabled || setupMode}
            className="flex h-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-500 disabled:opacity-40 dark:bg-ink-800"
            aria-label="Fingerprint"
          >
            <Fingerprint className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-14 rounded-2xl bg-ink-100 font-display text-2xl font-bold text-ink-800 active:scale-95 dark:bg-ink-800 dark:text-ink-50"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className="flex h-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-600 active:scale-95 dark:bg-ink-800 dark:text-ink-200"
            aria-label="Backspace"
          >
            <Delete className="h-6 w-6" />
          </button>
        </div>

        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-400">
          <Lock className="h-3 w-3" /> PIN sirf is device par hash hokar save hota hai
        </p>
      </div>
    </Sheet>
  )
}
