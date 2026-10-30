import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../../context/AppContext'
import { useCart } from '../../context/CartContext'
import { useT } from '../../i18n/useT'
import { formatPaise, percentOf } from '../../lib/money'
import { Sheet } from '../ui/sheet'
import { Button } from '../ui/button'
import { Input } from '../ui/form'

interface DiscountSheetProps {
  open: boolean
  onClose: () => void
}

/**
 * Manual discount — the only path to change the payable amount. Requires the
 * owner PIN and is hard-capped by the shop's `max_discount_percent`.
 */
export function DiscountSheet({ open, onClose }: DiscountSheetProps) {
  const { shop, user, requestApproval, toast } = useApp()
  const { totals, manualDiscountPaise, setManualDiscount } = useCart()
  const t = useT()
  const [mode, setMode] = useState<'percent' | 'amount'>('percent')
  const [percent, setPercent] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const maxPercent = shop?.max_discount_percent ?? 10
  const maxPaise = percentOf(totals.subtotal_paise, maxPercent)

  const requested =
    mode === 'percent'
      ? percentOf(totals.subtotal_paise, Number(percent || 0))
      : Math.round(Number(amount || 0) * 100)

  useEffect(() => {
    if (!open) {
      setPercent('')
      setAmount('')
      setMode('percent')
    }
  }, [open])

  const apply = async () => {
    if (requested <= 0) {
      setManualDiscount(0, null)
      onClose()
      return
    }
    if (requested > maxPaise) {
      toast(`${t('maxDiscount')} ${maxPercent}% (${formatPaise(maxPaise)})`, 'error')
      return
    }
    if (user?.role !== 'owner') {
      toast(t('ownerOnly'), 'error')
      return
    }
    setBusy(true)
    try {
      const approval = await requestApproval({
        permission: 'billing.discount',
        title: t('reauthTitle'),
        body: `${t('discount')}: ${formatPaise(requested)} (${maxPercent}% ${t('maxDiscount')})`,
        amountPaise: requested,
      })
      if (!approval) return
      setManualDiscount(requested, approval.at)
      toast(`${t('discount')} ${formatPaise(requested)} ${t('saved')}`, 'success')
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('ownerDiscount')}
      subtitle={`${t('maxDiscount')}: ${maxPercent}% = ${formatPaise(maxPaise)}`}
      footer={
        <Button block size="lg" loading={busy} onClick={apply} icon={<Lock className="h-5 w-5" />}>
          {t('applyDiscount')}
        </Button>
      }
    >
      <div className="space-y-3 pb-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('percent')}
            className={clsx(
              'h-12 flex-1 rounded-2xl font-bold',
              mode === 'percent' ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-100',
            )}
          >
            {t('discountPercent')}
          </button>
          <button
            type="button"
            onClick={() => setMode('amount')}
            className={clsx(
              'h-12 flex-1 rounded-2xl font-bold',
              mode === 'amount' ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-100',
            )}
          >
            {t('discountRupees')}
          </button>
        </div>

        {mode === 'percent' ? (
          <Input
            autoFocus
            inputMode="decimal"
            value={percent}
            onChange={(event) => setPercent(event.target.value.replace(/[^\d.]/g, ''))}
            placeholder={`0 – ${maxPercent}`}
            className="h-16 text-center font-display text-3xl font-extrabold"
          />
        ) : (
          <Input
            autoFocus
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ''))}
            placeholder="0"
            className="h-16 text-center font-display text-3xl font-extrabold"
          />
        )}

        <div className="grid grid-cols-4 gap-2">
          {[2, 5, 8, maxPercent].map((preset, index) => (
            <button
              key={`${preset}-${index}`}
              type="button"
              onClick={() => {
                setMode('percent')
                setPercent(String(preset))
              }}
              className="h-11 rounded-xl bg-ink-100 text-sm font-bold text-ink-800 dark:bg-ink-800 dark:text-ink-50"
            >
              {preset}%
            </button>
          ))}
        </div>

        <div className="rounded-2xl bg-saffron-50 p-3 text-center dark:bg-saffron-900/25">
          <p className="text-xs font-semibold uppercase text-saffron-800 dark:text-saffron-200">{t('discount')}</p>
          <p className="font-display text-2xl font-extrabold text-saffron-900 dark:text-saffron-100">
            {formatPaise(requested)}
          </p>
          {requested > maxPaise && (
            <p className="mt-1 text-xs font-bold text-red-600">{t('maxDiscountExceeded')}</p>
          )}
        </div>

        {manualDiscountPaise > 0 && (
          <Button
            block
            variant="secondary"
            onClick={() => {
              setManualDiscount(0, null)
              onClose()
            }}
          >
            {t('remove')} · {formatPaise(manualDiscountPaise)}
          </Button>
        )}

        <p className="text-center text-[11px] text-ink-500 dark:text-ink-400">
          Har discount audit log mein owner ke naam se save hota hai.
        </p>
      </div>
    </Sheet>
  )
}
