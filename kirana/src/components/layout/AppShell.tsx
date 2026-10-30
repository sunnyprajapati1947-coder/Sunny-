import { NavLink, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import {
  BarChart3,
  Boxes,
  CloudOff,
  Home,
  Moon,
  MoreHorizontal,
  RefreshCw,
  ScanLine,
  Sun,
  Users,
  Wifi,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useApp } from '../../context/AppContext'
import { useOnline } from '../../hooks/useOnline'
import { useT } from '../../i18n/useT'
import { formatDateTime } from '../../lib/date'

/**
 * Four destinations, nothing else. Products and reports both live behind "More"
 * so the counter screen stays calm; billing is the big centre button.
 */
const NAV = [
  { to: '/', labelKey: 'navHome', icon: Home, end: true },
  { to: '/billing', labelKey: 'navBilling', icon: ScanLine, primary: true },
  { to: '/khata', labelKey: 'navKhata', icon: Users },
  { to: '/more', labelKey: 'navMore', icon: MoreHorizontal },
] as const

export function AppShell({ children }: { children: ReactNode }) {
  const { shop, syncState, pendingSync, dark, setDark } = useApp()
  const online = useOnline()
  const t = useT()
  const location = useLocation()
  const isBilling = location.pathname.startsWith('/billing')

  return (
    <div className="flex min-h-full flex-col bg-[#f6f4ee] dark:bg-ink-950">
      <header className="safe-top sticky top-0 z-30 border-b border-ink-100/80 bg-[#f6f4ee]/95 backdrop-blur dark:border-ink-800 dark:bg-ink-950/95">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-700 font-display text-sm font-extrabold text-white shadow-sm">
            {(shop?.name ?? 'DD')
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((word) => word[0]?.toUpperCase())
              .join('')}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-bold leading-tight text-ink-900 dark:text-ink-50">
              {shop?.name ?? t('appName')}
            </p>
            <p className="flex items-center gap-1.5 truncate text-[11px] font-medium text-ink-500 dark:text-ink-400">
              <span>{online ? t('online') : t('offline')}</span>
              <span className="text-ink-300">·</span>
              <SyncLabel state={syncState} pending={pendingSync} online={online} />
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDark(!dark)}
            aria-label={t('darkMode')}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-ink-600 shadow-sm active:scale-95 dark:bg-ink-900 dark:text-ink-200"
          >
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <main
        className={clsx(
          'mx-auto w-full max-w-3xl flex-1 px-4 pt-3',
          isBilling ? 'pb-40' : 'pb-28',
        )}
      >
        {children}
      </main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-ink-100 bg-white/95 backdrop-blur dark:border-ink-800 dark:bg-ink-950/95">
        <div className="mx-auto grid w-full max-w-3xl grid-cols-4">
          {NAV.map((item) => {
            const Icon = item.icon
            if ('primary' in item && item.primary) {
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className="relative -mt-6 flex flex-col items-center justify-center pb-1"
                  aria-label={t(item.labelKey)}
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={clsx(
                          'flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition',
                          isActive ? 'bg-brand-800 shadow-lift' : 'bg-brand-700',
                        )}
                      >
                        <Icon className="h-7 w-7" />
                      </span>
                      <span className="mt-0.5 text-[11px] font-bold text-brand-800 dark:text-brand-300">
                        {t(item.labelKey)}
                      </span>
                    </>
                  )}
                </NavLink>
              )
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={'end' in item ? item.end : false}
                className={({ isActive }) =>
                  clsx(
                    'flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold transition',
                    isActive ? 'text-brand-700 dark:text-brand-300' : 'text-ink-400 dark:text-ink-500',
                  )
                }
              >
                <Icon className="h-[22px] w-[22px]" />
                <span>{t(item.labelKey)}</span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

function SyncLabel({ state, pending, online }: { state: string; pending: number; online: boolean }) {
  const t = useT()
  if (!online) {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-saffron-700 dark:text-saffron-300">
        <CloudOff className="h-3 w-3" /> {t('offline')}
      </span>
    )
  }
  if (state === 'error') {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-400">
        <RefreshCw className="h-3 w-3" /> {t('syncError')}
      </span>
    )
  }
  if (state === 'syncing') {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-brand-700 dark:text-brand-300">
        <RefreshCw className="h-3 w-3 animate-spin" /> Sync…
      </span>
    )
  }
  if (pending > 0) {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-saffron-700 dark:text-saffron-300">
        <RefreshCw className="h-3 w-3" /> {pending} {t('pendingSync')}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 font-semibold text-brand-700 dark:text-brand-300">
      <Wifi className="h-3 w-3" /> {t('allSynced')}
    </span>
  )
}

/** Small header used on sub-pages with a back button. */
export function PageHeader({
  title,
  subtitle,
  onBack,
  action,
}: {
  title: string
  subtitle?: string
  onBack?: () => void
  action?: ReactNode
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-ink-700 shadow-sm active:scale-95 dark:bg-ink-900 dark:text-ink-100"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-xl font-extrabold text-ink-900 dark:text-ink-50">{title}</h1>
        {subtitle && <p className="truncate text-xs text-ink-500 dark:text-ink-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function SyncFooter() {
  const { syncState, pendingSync, syncError } = useApp()
  const t = useT()
  return (
    <div className="mt-6 rounded-2xl bg-ink-100/70 p-3 text-center text-xs text-ink-500 dark:bg-ink-900 dark:text-ink-400">
      <p className="font-semibold">{t('allSynced')}</p>
      <p className="mt-0.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span>
          {syncState} · {pendingSync} {t('pendingSync')}
        </span>
        {syncError && <span className="text-red-500">{syncError}</span>}
        <span>· {formatDateTime(new Date().toISOString())}</span>
      </p>
      <p className="mt-1 inline-flex items-center gap-1">
        <Boxes className="h-3 w-3" /> Dukaan Dost v1.0 · <BarChart3 className="h-3 w-3" /> PWA
      </p>
    </div>
  )
}
