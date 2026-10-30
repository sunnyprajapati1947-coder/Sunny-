import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { Button } from './button'
import { Sheet } from './sheet'

export function ToastHost() {
  const { toastState } = useApp()
  if (!toastState) return null
  const icon = {
    success: <CheckCircle2 className="h-5 w-5" />,
    error: <XCircle className="h-5 w-5" />,
    info: <Info className="h-5 w-5" />,
  }[toastState.tone]
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[60] flex justify-center px-3">
      <div
        role="status"
        className={clsx(
          'pointer-events-auto flex max-w-md items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg animate-pop',
          toastState.tone === 'success' && 'bg-brand-700 text-white',
          toastState.tone === 'error' && 'bg-red-600 text-white',
          toastState.tone === 'info' && 'bg-ink-900 text-white dark:bg-ink-100 dark:text-ink-900',
        )}
      >
        {icon}
        <span>{toastState.message}</span>
      </div>
    </div>,
    document.body,
  )
}

interface ConfirmOptions {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'default'
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

/** Promise-based confirmation dialog: `if (await confirm({...})) { ... }` */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((next: ConfirmOptions) => {
    setOptions(next)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const finish = (value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setOptions(null)
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Sheet
        open={Boolean(options)}
        onClose={() => finish(false)}
        title={options?.title}
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => finish(false)}>
              {options?.cancelLabel ?? 'Cancel'}
            </Button>
            <Button
              variant={options?.tone === 'danger' ? 'danger' : 'primary'}
              className="flex-1"
              onClick={() => finish(true)}
            >
              {options?.confirmLabel ?? 'Haan'}
            </Button>
          </div>
        }
      >
        <div className="flex items-start gap-3 pb-2">
          <div
            className={clsx(
              'rounded-2xl p-2.5',
              options?.tone === 'danger' ? 'bg-red-100 text-red-600 dark:bg-red-950' : 'bg-brand-50 text-brand-700 dark:bg-brand-950',
            )}
          >
            <AlertTriangle className="h-6 w-6" />
          </div>
          <p className="pt-1 text-sm text-ink-600 dark:text-ink-200">{options?.body}</p>
        </div>
      </Sheet>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider')
  return ctx.confirm
}
