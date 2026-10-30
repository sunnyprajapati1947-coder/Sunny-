import { useCallback } from 'react'
import translations, { type TranslationKey } from './translations'
import { useApp } from '../context/AppContext'

export type TFunction = (key: TranslationKey) => string

/** Returns `t('key')` in the active language (default: Hinglish). */
export function useT(): TFunction {
  const { language } = useApp()
  return useCallback(
    (key: TranslationKey) => {
      const entry = translations[key] as { hi: string; en: string; hg?: string } | undefined
      if (!entry) return key
      if (language === 'hi') return entry.hi
      if (language === 'en') return entry.en
      return entry.hg ?? entry.en
    },
    [language],
  )
}
