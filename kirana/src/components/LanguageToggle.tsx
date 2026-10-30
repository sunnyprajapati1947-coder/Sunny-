import { Languages } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../context/AppContext'
import type { AppLanguage } from '../types'

const OPTIONS: { value: AppLanguage; label: string; short: string }[] = [
  { value: 'hinglish', label: 'Hinglish', short: 'Hi+' },
  { value: 'hi', label: 'हिंदी', short: 'हि' },
  { value: 'en', label: 'English', short: 'En' },
]

/** Segmented language control used on the More screen and during onboarding. */
export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useApp()
  return (
    <div className={clsx('inline-flex items-center gap-1 rounded-2xl bg-ink-100 p-1 dark:bg-ink-800', compact ? 'text-xs' : 'text-sm')}>
      {!compact && <Languages className="ml-2 h-4 w-4 text-ink-500" />}
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setLanguage(option.value)}
          className={clsx(
            'rounded-xl px-3 py-1.5 font-semibold transition',
            language === option.value
              ? 'bg-white text-brand-800 shadow-sm dark:bg-ink-950 dark:text-brand-200'
              : 'text-ink-500 dark:text-ink-300',
          )}
        >
          {compact ? option.short : option.label}
        </button>
      ))}
    </div>
  )
}
