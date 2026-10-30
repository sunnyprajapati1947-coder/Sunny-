import { useState } from 'react'
import { Lock, Minus, Plus, Scale, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import type { CartLine } from '../../types'
import { formatPaise } from '../../lib/money'
import { Sheet } from '../ui/sheet'
import { Button } from '../ui/button'
import { Input } from '../ui/form'
import { useT } from '../../i18n/useT'

interface CartListProps {
  lines: CartLine[]
  onChangeQty: (key: string, qty: number) => void
  onRemove: (key: string) => void
  /** Cashiers cannot change anything except quantity. */
  canEditPrice?: boolean
}

export function CartList({ lines, onChangeQty, onRemove, canEditPrice = false }: CartListProps) {
  const [looseLine, setLooseLine] = useState<CartLine | null>(null)
  const t = useT()

  if (!lines.length) return null

  return (
    <div className="divide-y divide-ink-100 dark:divide-ink-800">
      {lines.map((line) => {
        const amount = Math.round(line.qty * line.unit_price_paise)
        return (
          <div key={line.key} className="flex items-start gap-2.5 py-2.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink-100 text-lg dark:bg-ink-800">
              {line.image_url ? (
                <img src={line.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : line.is_loose ? (
                <Scale className="h-5 w-5 text-ink-400" />
              ) : (
                '🛒'
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold leading-tight text-ink-900 dark:text-ink-50">{line.name_hi}</p>
              <p className="truncate text-xs text-ink-500 dark:text-ink-400">{line.name_en}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-500 dark:text-ink-400">
                <Lock className="h-3 w-3" />
                {formatPaise(line.unit_price_paise)}/{line.unit}
                {canEditPrice && <span className="ml-1 rounded bg-ink-100 px-1 text-[10px] dark:bg-ink-800">owner</span>}
              </p>
            </div>

            <div className="flex flex-col items-end gap-1.5">
              <p className="text-base font-extrabold tabular-nums text-ink-900 dark:text-ink-50">{formatPaise(amount)}</p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Kam karein"
                  onClick={() => onChangeQty(line.key, Math.round((line.qty - (line.is_loose ? 0.25 : 1)) * 1000) / 1000)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-100 text-ink-700 active:scale-95 dark:bg-ink-800 dark:text-ink-100"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => (line.is_loose ? setLooseLine(line) : onChangeQty(line.key, line.qty + 1))}
                  className={clsx(
                    'min-w-[3.6rem] rounded-xl bg-ink-100 px-1.5 py-1.5 text-sm font-bold tabular-nums text-ink-900 active:scale-95 dark:bg-ink-800 dark:text-ink-50',
                    line.is_loose && 'border border-dashed border-brand-500',
                  )}
                >
                  {line.qty} <span className="text-[10px] font-semibold text-ink-500">{line.unit}</span>
                </button>
                <button
                  type="button"
                  aria-label="Zyada karein"
                  onClick={() => onChangeQty(line.key, Math.round((line.qty + (line.is_loose ? 0.25 : 1)) * 1000) / 1000)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-white active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={t('remove')}
                  onClick={() => onRemove(line.key)}
                  className="ml-0.5 flex h-9 w-9 items-center justify-center rounded-xl text-red-500 active:scale-95"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )
      })}

      <LooseQtySheet
        line={looseLine}
        onClose={() => setLooseLine(null)}
        onConfirm={(qty) => {
          if (looseLine) onChangeQty(looseLine.key, qty)
          setLooseLine(null)
        }}
      />
    </div>
  )
}

function LooseQtySheet({
  line,
  onClose,
  onConfirm,
}: {
  line: CartLine | null
  onClose: () => void
  onConfirm: (qty: number) => void
}) {
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState<'kg' | 'g'>('kg')
  const t = useT()

  const numeric = Number(value || 0)
  const qty = unit === 'g' ? numeric / 1000 : numeric
  const amount = line ? Math.round(qty * line.unit_price_paise) : 0

  return (
    <Sheet
      open={Boolean(line)}
      onClose={onClose}
      title={line?.name_hi}
      subtitle={line ? `${formatPaise(line.unit_price_paise)} / ${line.unit}` : undefined}
      footer={
        <Button block size="lg" disabled={qty <= 0} onClick={() => onConfirm(Math.round(qty * 1000) / 1000)}>
          {t('save')} · {formatPaise(amount)}
        </Button>
      }
    >
      <div className="space-y-3 pb-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setUnit('kg')}
            className={clsx(
              'h-12 flex-1 rounded-2xl font-bold',
              unit === 'kg' ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-100',
            )}
          >
            Kilo (kg)
          </button>
          <button
            type="button"
            onClick={() => setUnit('g')}
            className={clsx(
              'h-12 flex-1 rounded-2xl font-bold',
              unit === 'g' ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-100',
            )}
          >
            Gram (g)
          </button>
        </div>

        <Input
          autoFocus
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value.replace(/[^\d.]/g, ''))}
          placeholder={unit === 'g' ? '500' : '1.5'}
          className="h-16 text-center font-display text-3xl font-extrabold"
        />

        <div className="grid grid-cols-4 gap-2">
          {(unit === 'g' ? ['100', '250', '500', '750'] : ['0.25', '0.5', '1', '2']).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setValue(preset)}
              className="h-12 rounded-2xl bg-ink-100 font-bold text-ink-800 active:scale-95 dark:bg-ink-800 dark:text-ink-50"
            >
              {preset} {unit}
            </button>
          ))}
        </div>

        <div className="rounded-2xl bg-brand-50 p-3 text-center dark:bg-brand-950/50">
          <p className="text-xs font-semibold uppercase text-brand-800 dark:text-brand-200">Amount</p>
          <p className="font-display text-3xl font-extrabold text-brand-900 dark:text-brand-100">{formatPaise(amount)}</p>
        </div>

        {line && line.stock_qty < qty && (
          <p className="rounded-xl bg-saffron-50 p-2 text-center text-xs font-semibold text-saffron-800 dark:bg-saffron-900/30 dark:text-saffron-100">
            Stock sirf {line.stock_qty} {line.unit} hai — phir bhi add karein?
          </p>
        )}
      </div>
    </Sheet>
  )
}
