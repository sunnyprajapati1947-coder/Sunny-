import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { X } from 'lucide-react'

export interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'full'
  /** Blocks accidental dismissal while a bill is being finalized. */
  dismissible?: boolean
}

/**
 * Bottom sheet on phones, centred dialog on tablets/desktop.
 * One component for every modal keeps tap targets and safe-area handling
 * identical across the app.
 */
export function Sheet({ open, onClose, title, subtitle, children, footer, size = 'md', dismissible = true }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = original
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, dismissible])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        onClick={() => dismissible && onClose()}
        className="absolute inset-0 animate-fade-in bg-ink-950/55 backdrop-blur-[2px]"
      />
      <div
        className={clsx(
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl animate-slide-up',
          'dark:bg-ink-900 sm:max-h-[88vh] sm:rounded-3xl sm:animate-pop',
          size === 'sm' && 'sm:max-w-sm',
          size === 'md' && 'sm:max-w-md',
          size === 'lg' && 'sm:max-w-2xl',
          size === 'full' && 'h-[100dvh] max-h-none rounded-none sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-3xl',
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-ink-200 dark:bg-ink-700 sm:hidden" />
        {(title || subtitle) && (
          <header className="flex items-start justify-between gap-3 px-4 pb-2 pt-3">
            <div className="min-w-0">
              {title && (
                <h2 className="truncate font-display text-xl font-bold text-ink-900 dark:text-ink-50">{title}</h2>
              )}
              {subtitle && <p className="mt-0.5 text-sm text-ink-500 dark:text-ink-300">{subtitle}</p>}
            </div>
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-full bg-ink-100 p-2 text-ink-600 active:scale-95 dark:bg-ink-800 dark:text-ink-200"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </header>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2">{children}</div>
        {footer && (
          <footer className="safe-bottom border-t border-ink-100 bg-white px-4 py-3 dark:border-ink-800 dark:bg-ink-900">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}
