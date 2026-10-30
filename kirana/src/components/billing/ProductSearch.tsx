import { useEffect, useMemo, useRef, useState } from 'react'
import { Mic, MicOff, Plus, ScanBarcode, Search } from 'lucide-react'
import { db } from '../../lib/db'
import { useLive } from '../../hooks/useLive'
import { useApp } from '../../context/AppContext'
import { useT } from '../../i18n/useT'
import { formatPaise } from '../../lib/money'
import { startVoiceSearch, voiceSupported, type VoiceSearchController } from '../../lib/voice'
import type { Product } from '../../types'
import { Input } from '../ui/form'
import { Badge } from '../ui/card'
import { vibrate } from '../../lib/audio'
import clsx from 'clsx'

interface ProductSearchProps {
  onPick: (product: Product) => void
  onScanRequest: () => void
}

/** Name search in Hindi/English + Hindi voice search. */
export function ProductSearch({ onPick, onScanRequest }: ProductSearchProps) {
  const { shop, toast } = useApp()
  const t = useT()
  const [query, setQuery] = useState('')
  const [listening, setListening] = useState(false)
  const controller = useRef<VoiceSearchController | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const products = useLive<Product[]>(
    () => (shop ? db.products.where('shop_id').equals(shop.id).filter((p) => p.is_active).toArray() : Promise.resolve([])),
    [shop?.id],
    [],
  )

  const results = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return []
    return (products ?? [])
      .filter(
        (product) =>
          product.name_en.toLowerCase().includes(term) ||
          product.name_hi.includes(term) ||
          (product.barcode ?? '').includes(term) ||
          (product.brand ?? '').toLowerCase().includes(term),
      )
      .slice(0, 14)
  }, [products, query])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '/' && document.activeElement !== inputRef.current) {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const toggleVoice = () => {
    if (listening) {
      controller.current?.stop()
      setListening(false)
      return
    }
    if (!voiceSupported()) {
      toast('Is browser mein voice search nahi chalta', 'error')
      return
    }
    vibrate('tap')
    setListening(true)
    controller.current = startVoiceSearch(
      (text, isFinal) => {
        setQuery(text)
        if (isFinal) {
          const term = text.toLowerCase().trim()
          const match = (products ?? []).find(
            (product) => product.name_hi.includes(term) || product.name_en.toLowerCase().includes(term),
          )
          if (match) onPick(match)
        }
      },
      {
        onError: (message) => {
          toast(message, 'error')
          setListening(false)
        },
        onEnd: () => setListening(false),
      },
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`${t('searchProduct')} — dal, चावल, milk`}
            className="pl-9 pr-10"
            role="searchbox"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-ink-100 px-2 py-1 text-xs font-bold text-ink-500 dark:bg-ink-800"
            >
              ✕
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onScanRequest}
          aria-label={t('scanItem')}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-700 text-white active:scale-95"
        >
          <ScanBarcode className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={toggleVoice}
          aria-label={t('voiceSearch')}
          className={clsx(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl active:scale-95',
            listening ? 'animate-pulse-ring bg-red-600 text-white' : 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-100',
          )}
        >
          {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>
      </div>

      {listening && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-center text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-200">
          🎙️ {t('listening')} — "do kilo chawal"
        </p>
      )}

      {query.trim() && (
        <div className="max-h-64 divide-y divide-ink-100 overflow-y-auto rounded-2xl border border-ink-100 bg-white dark:divide-ink-800 dark:border-ink-800 dark:bg-ink-900">
          {results.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => {
                onPick(product)
                setQuery('')
                vibrate('tap')
              }}
              className="flex w-full items-center gap-3 p-2.5 text-left active:bg-ink-50 dark:active:bg-ink-800"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-100 text-sm dark:bg-ink-800">
                {product.is_loose ? '⚖️' : '📦'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{product.name_hi}</p>
                <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                  {product.name_en} · {formatPaise(product.selling_price_paise)}/{product.unit}
                </p>
              </div>
              {product.stock_qty <= product.low_stock_limit && (
                <Badge tone={product.stock_qty <= 0 ? 'danger' : 'warning'}>
                  {product.stock_qty <= 0 ? t('outOfStock') : `${product.stock_qty} left`}
                </Badge>
              )}
              <Plus className="h-4 w-4 text-brand-700" />
            </button>
          ))}
          {!results.length && (
            <p className="p-4 text-center text-sm text-ink-500 dark:text-ink-400">{t('noProducts')}</p>
          )}
        </div>
      )}
    </div>
  )
}
