import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import clsx from 'clsx'
import { toPaise, toRupees } from '../../lib/money'

const BASE_FIELD =
  'w-full rounded-2xl border-2 border-ink-200 bg-white px-3.5 text-base text-ink-900 placeholder:text-ink-400 ' +
  'focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 ' +
  'dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50 dark:placeholder:text-ink-500'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={clsx(BASE_FIELD, 'h-12', invalid && 'border-red-400 focus:border-red-500 focus:ring-red-500/20', className)}
        {...props}
      />
    )
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={clsx(BASE_FIELD, 'min-h-[84px] py-3', className)} {...props} />
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={clsx(BASE_FIELD, 'h-12 appearance-none pr-9', className)} {...props}>
        {children}
      </select>
    )
  },
)

export function Field({
  label,
  hint,
  error,
  children,
  required,
  className,
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
  required?: boolean
  className?: string
}) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1 flex items-center gap-1 text-sm font-semibold text-ink-600 dark:text-ink-200">
        {label}
        {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-400 dark:text-ink-400">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-semibold text-red-600 dark:text-red-400">{error}</span>}
    </label>
  )
}

/** Rupee input that stores paise. Accepts "12.50", "12,50", "₹12". */
export function MoneyInput({
  valuePaise,
  onChangePaise,
  className,
  placeholder = '0.00',
  disabled,
  autoFocus,
  id,
}: {
  valuePaise: number
  onChangePaise: (paise: number) => void
  className?: string
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  id?: string
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-semibold text-ink-400">₹</span>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        value={valuePaise ? String(toRupees(valuePaise)) : ''}
        onChange={(event) => onChangePaise(toPaise(event.target.value.replace(/[^\d.]/g, '')))}
        placeholder={placeholder}
        className={clsx(BASE_FIELD, 'h-12 pl-8 text-right font-semibold tabular-nums', className)}
      />
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink-800 dark:text-ink-100">{label}</p>
        {description && <p className="text-xs text-ink-500 dark:text-ink-400">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative h-8 w-14 shrink-0 rounded-full transition-colors',
          checked ? 'bg-brand-600' : 'bg-ink-300 dark:bg-ink-700',
          disabled && 'opacity-50',
        )}
      >
        <span
          className={clsx(
            'absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all',
            checked ? 'left-7' : 'left-1',
          )}
        />
      </button>
    </div>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string; icon?: ReactNode }[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={clsx('flex gap-1 rounded-2xl bg-ink-100 p-1 dark:bg-ink-800', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={clsx(
            'flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold transition',
            value === option.value
              ? 'bg-white text-brand-800 shadow-sm dark:bg-ink-950 dark:text-brand-200'
              : 'text-ink-500 dark:text-ink-300',
          )}
        >
          {option.icon}
          <span className="truncate">{option.label}</span>
        </button>
      ))}
    </div>
  )
}

export function QtyStepper({
  value,
  onChange,
  step = 1,
  min = 0,
  unit,
  size = 'md',
}: {
  value: number
  onChange: (value: number) => void
  step?: number
  min?: number
  unit?: string
  size?: 'sm' | 'md'
}) {
  const btn = size === 'sm' ? 'h-9 w-9 text-lg' : 'h-11 w-11 text-xl'
  return (
    <div className="inline-flex items-center gap-1 rounded-2xl bg-ink-100 p-1 dark:bg-ink-800">
      <button
        type="button"
        aria-label="Decrease"
        onClick={() => onChange(Math.max(min, Math.round((value - step) * 1000) / 1000))}
        className={clsx('rounded-xl bg-white font-bold text-ink-700 shadow-sm active:scale-95 dark:bg-ink-950 dark:text-ink-100', btn)}
      >
        −
      </button>
      <span className={clsx('min-w-[3.5rem] text-center font-bold tabular-nums', size === 'sm' ? 'text-sm' : 'text-base')}>
        {formatQtyShort(value)}
        {unit ? <span className="ml-0.5 text-xs font-medium text-ink-500">{unit}</span> : null}
      </span>
      <button
        type="button"
        aria-label="Increase"
        onClick={() => onChange(Math.round((value + step) * 1000) / 1000)}
        className={clsx('rounded-xl bg-white font-bold text-ink-700 shadow-sm active:scale-95 dark:bg-ink-950 dark:text-ink-100', btn)}
      >
        +
      </button>
    </div>
  )
}

export function formatQtyShort(qty: number): string {
  const rounded = Math.round(qty * 1000) / 1000
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}
