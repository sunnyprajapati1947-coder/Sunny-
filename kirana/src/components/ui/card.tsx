import type { HTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'rounded-2.5xl border border-ink-100 bg-white p-4 shadow-card dark:border-ink-800 dark:bg-ink-900',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

export function SectionTitle({
  title,
  subtitle,
  action,
  className,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={clsx('mb-2 flex items-end justify-between gap-3', className)}>
      <div>
        <h2 className="font-display text-lg font-bold leading-tight text-ink-900 dark:text-ink-50">{title}</h2>
        {subtitle && <p className="text-sm text-ink-500 dark:text-ink-300">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'
  className?: string
}) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-100',
    success: 'bg-brand-100 text-brand-800 dark:bg-brand-900/60 dark:text-brand-100',
    warning: 'bg-saffron-100 text-saffron-800 dark:bg-saffron-900/50 dark:text-saffron-100',
    danger: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200',
    info: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200',
    brand: 'bg-brand-700 text-white',
  }
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold leading-none',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  onClick,
}: {
  label: string
  value: string
  hint?: string
  icon?: ReactNode
  tone?: 'default' | 'brand' | 'warning' | 'danger'
  onClick?: () => void
}) {
  const tones = {
    default: 'bg-white border-ink-100 dark:bg-ink-900 dark:border-ink-800',
    brand: 'bg-brand-700 border-brand-700 text-white shadow-lift',
    warning: 'bg-saffron-50 border-saffron-200 dark:bg-saffron-900/20 dark:border-saffron-800',
    danger: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900',
  }
  const isBrand = tone === 'brand'
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (event) => event.key === 'Enter' && onClick() : undefined}
      className={clsx(
        'rounded-2xl border p-3.5 transition',
        tones[tone],
        onClick && 'cursor-pointer active:scale-[0.99]',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={clsx('text-xs font-semibold uppercase tracking-wide', isBrand ? 'text-brand-100' : 'text-ink-500 dark:text-ink-300')}>
          {label}
        </p>
        {icon && <span className={isBrand ? 'text-brand-100' : 'text-ink-400'}>{icon}</span>}
      </div>
      <p className={clsx('mt-1.5 font-display text-2xl font-extrabold leading-none', isBrand ? 'text-white' : 'text-ink-900 dark:text-ink-50')}>
        {value}
      </p>
      {hint && <p className={clsx('mt-1 text-xs', isBrand ? 'text-brand-100' : 'text-ink-500 dark:text-ink-300')}>{hint}</p>}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2.5xl border-2 border-dashed border-ink-200 px-6 py-10 text-center dark:border-ink-700">
      {icon && <div className="mb-3 text-ink-300 dark:text-ink-600">{icon}</div>}
      <p className="font-display text-lg font-bold text-ink-800 dark:text-ink-100">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-ink-500 dark:text-ink-300">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Divider({ className }: { className?: string }) {
  return <div className={clsx('h-px w-full bg-ink-100 dark:bg-ink-800', className)} />
}
