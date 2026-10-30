import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import clsx from 'clsx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline'
type Size = 'sm' | 'md' | 'lg' | 'xl' | 'icon'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-700 text-white shadow-sm hover:bg-brand-800 active:bg-brand-900 disabled:bg-brand-700/40 dark:bg-brand-600 dark:hover:bg-brand-500',
  success:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-600/40',
  secondary:
    'bg-ink-100 text-ink-900 hover:bg-ink-200 active:bg-ink-300 dark:bg-ink-800 dark:text-ink-50 dark:hover:bg-ink-700',
  outline:
    'border-2 border-ink-200 bg-white text-ink-900 hover:border-brand-500 hover:text-brand-800 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50',
  ghost: 'text-ink-700 hover:bg-ink-100 dark:text-ink-100 dark:hover:bg-ink-800',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800',
}

const SIZES: Record<Size, string> = {
  sm: 'h-10 px-3 text-sm rounded-xl gap-1.5',
  md: 'h-12 px-4 text-base rounded-2xl gap-2',
  lg: 'h-14 px-5 text-lg rounded-2xl gap-2',
  xl: 'h-16 px-6 text-xl rounded-2.5xl gap-2.5',
  icon: 'h-12 w-12 rounded-2xl justify-center',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  block?: boolean
  loading?: boolean
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', block, loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex select-none items-center justify-center font-semibold transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30',
        'disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.985]',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  )
})

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={clsx('h-5 w-5 animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

export function IconButton({
  label,
  className,
  size = 'md',
  ...props
}: ButtonProps & { label: string }) {
  return (
    <Button
      {...props}
      size="icon"
      variant={props.variant ?? 'secondary'}
      aria-label={label}
      title={label}
      className={clsx(size === 'sm' && 'h-10 w-10', 'shrink-0', className)}
    />
  )
}
