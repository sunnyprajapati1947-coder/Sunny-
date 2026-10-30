import { useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  CreditCard,
  Landmark,
  Plus,
  QrCode,
  Smartphone,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../../context/AppContext'
import { useCart } from '../../context/CartContext'
import { useT } from '../../i18n/useT'
import { formatPaise, percentOf, toPaise } from '../../lib/money'
import { buildUpiUri, isValidVpa, makeQrDataUrl, upiAppLinks } from '../../lib/upi'
import { finalizeBill, type FinalizeBillResult } from '../../data/billing'
import type { Customer, OwnerApproval, PaymentInput, PaymentMode } from '../../types'
import { Sheet } from '../ui/sheet'
import { Button } from '../ui/button'
import { Input, Textarea } from '../ui/form'
import { CustomerPicker } from '../customers/CustomerPicker'
import { Badge } from '../ui/card'

interface CheckoutSheetProps {
  open: boolean
  onClose: () => void
  onCompleted: (result: FinalizeBillResult) => void
}

const MODES: { value: PaymentMode; icon: typeof Banknote; labelKey: 'cash' | 'upi' | 'card' | 'udhaar' }[] = [
  { value: 'cash', icon: Banknote, labelKey: 'cash' },
  { value: 'upi', icon: Smartphone, labelKey: 'upi' },
  { value: 'card', icon: CreditCard, labelKey: 'card' },
  { value: 'udhaar', icon: Landmark, labelKey: 'udhaar' },
]

interface SplitRow {
  id: number
  mode: PaymentMode
  amount: string
}

export function CheckoutSheet({ open, onClose, onCompleted }: CheckoutSheetProps) {
  const { shop, user, toast } = useApp()
  const cart = useCart()
  const t = useT()

  const [mode, setMode] = useState<PaymentMode | 'split'>('cash')
  const [cashInput, setCashInput] = useState('')
  const [splitRows, setSplitRows] = useState<SplitRow[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [note, setNote] = useState(cart.note)
  const [busy, setBusy] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const total = cart.totals.total_paise
  const taxMode = shop?.prices_include_gst ? 'inclusive' : 'exclusive'

  useEffect(() => {
    if (open) {
      setCashInput(String(Math.ceil(total / 100)))
      setMode('cash')
      setSplitRows([{ id: 1, mode: 'cash', amount: '' }, { id: 2, mode: 'upi', amount: '' }])
      setNote(cart.note)
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, total])

  const cashEntered = toPaise(cashInput)
  const change = Math.max(0, cashEntered - total)
  const cashShort = cashEntered > 0 && cashEntered < total

  const splitTotal = splitRows.reduce((sum, row) => sum + toPaise(row.amount), 0)
  const splitRemaining = total - splitTotal

  const upiPaise = useMemo(() => {
    if (mode === 'upi') return total
    if (mode === 'split') {
      const row = splitRows.find((r) => r.mode === 'upi')
      return row ? toPaise(row.amount) : 0
    }
    return 0
  }, [mode, splitRows, total])

  useEffect(() => {
    if (!open || !shop?.upi_id || upiPaise <= 0 || !isValidVpa(shop.upi_id)) {
      setQr(null)
      return
    }
    let cancelled = false
    void makeQrDataUrl(
      buildUpiUri({
        vpa: shop.upi_id,
        payeeName: shop.name,
        amountPaise: upiPaise,
        note: `Bill ${new Date().toLocaleDateString('en-IN')}`,
      }),
      420,
    ).then((url) => {
      if (!cancelled) setQr(url)
    })
    return () => {
      cancelled = true
    }
  }, [open, shop?.upi_id, shop?.name, upiPaise])

  const maxRedeemPoints = useMemo(() => {
    if (!cart.customer || !shop?.loyalty_enabled) return 0
    const cap = Math.min(
      percentOf(cart.totals.subtotal_paise, 10),
      Math.max(0, cart.totals.subtotal_paise - cart.manualDiscountPaise - cart.offerDiscountPaise),
    )
    return Math.min(cart.customer.loyalty_points, Math.floor(cap / 100))
  }, [cart.customer, cart.totals.subtotal_paise, cart.manualDiscountPaise, cart.offerDiscountPaise, shop?.loyalty_enabled])

  useEffect(() => {
    if (cart.redeemPoints > maxRedeemPoints) cart.setRedeemPoints(maxRedeemPoints)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxRedeemPoints])

  const buildPayments = (): PaymentInput[] => {
    if (mode === 'split') {
      return splitRows
        .filter((row) => toPaise(row.amount) > 0)
        .map((row) => ({ mode: row.mode, amount_paise: toPaise(row.amount), reference: null }))
    }
    if (mode === 'cash') {
      return [{ mode: 'cash', amount_paise: Math.max(cashEntered, total), reference: null }]
    }
    return [{ mode, amount_paise: total, reference: null }]
  }

  const validate = (payments: PaymentInput[]): string | null => {
    const paid = payments.reduce((sum, payment) => sum + payment.amount_paise, 0)
    if (paid < total) return `${t('remaining')}: ${formatPaise(total - paid)}`
    if (payments.some((p) => p.mode === 'udhaar') && !cart.customer) {
      return 'Udhaar ke liye customer chuniye'
    }
    if (payments.some((p) => p.mode === 'udhaar') && cart.customer) {
      const udhaar = payments.filter((p) => p.mode === 'udhaar').reduce((sum, p) => sum + p.amount_paise, 0)
      const projected = cart.customer.balance_paise + udhaar
      if (cart.customer.credit_limit_paise > 0 && projected > cart.customer.credit_limit_paise) {
        return `${t('creditLimitExceeded')}: ${formatPaise(cart.customer.credit_limit_paise)}`
      }
    }
    return null
  }

  const complete = async () => {
    if (!shop || !user) return
    const payments = buildPayments()
    const problem = validate(payments)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const approval: OwnerApproval | null =
        cart.manualDiscountPaise > 0 && cart.discountApprovalAt
          ? {
              approvedBy: user.id,
              permission: 'billing.discount',
              at: cart.discountApprovalAt,
              maxDiscountPaise: cart.manualDiscountPaise,
            }
          : null

      const result = await finalizeBill({
        shop,
        actor: user,
        lines: cart.lines,
        taxMode,
        manualDiscountPaise: cart.manualDiscountPaise,
        customer: {
          id: cart.customer?.id ?? null,
          name: cart.customer?.name ?? null,
          phone: cart.customer?.phone ?? null,
        },
        payments,
        note: note || null,
        approval,
        redeemPoints: cart.redeemPoints,
        offerDiscountPaise: cart.offerDiscountPaise,
      })
      onCompleted(result)
      cart.clear()
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : t('somethingWrong')
      setError(message)
      toast(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleCustomer = (customer: Customer | null) => {
    cart.setCustomer(customer)
    if (!customer) {
      cart.setRedeemPoints(0)
      if (mode === 'udhaar') setMode('cash')
    }
  }

  const quickCash = [total, 50000, 100000, 200000, 500000, 200000]

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={t('payment')}
        subtitle={`${cart.lines.length} ${t('items')} · ${formatPaise(total)}`}
        size="lg"
        footer={
          <Button
            block
            size="xl"
            variant="success"
            loading={busy}
            onClick={complete}
            disabled={!cart.lines.length}
          >
            {t('payNow')} · {formatPaise(total)}
          </Button>
        }
      >
        <div className="space-y-3 pb-2">
          {/* Customer */}
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex w-full items-center gap-3 rounded-2xl border-2 border-ink-100 p-3 text-left dark:border-ink-800"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-100">
              <UserRound className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink-900 dark:text-ink-50">
                {cart.customer?.name ?? t('walkInCustomer')}
              </p>
              <p className="text-xs text-ink-500 dark:text-ink-400">
                {cart.customer
                  ? `${cart.customer.phone ?? '—'} · ${t('due')} ${formatPaise(cart.customer.balance_paise)}`
                  : 'Customer add karein (optional)'}
              </p>
            </div>
            {cart.customer && cart.customer.loyalty_points > 0 && (
              <Badge tone="warning">⭐ {cart.customer.loyalty_points}</Badge>
            )}
            <span className="text-sm font-bold text-brand-700 dark:text-brand-300">
              {cart.customer ? t('edit') : t('add')}
            </span>
          </button>

          {/* Totals */}
          <div className="rounded-2xl bg-brand-50 p-3 dark:bg-brand-950/40">
            <Row label={t('subtotal')} value={formatPaise(cart.totals.subtotal_paise)} />
            {cart.totals.discount_paise > 0 && (
              <Row label={t('discount')} value={`− ${formatPaise(cart.totals.discount_paise)}`} tone="discount" />
            )}
            <Row label={shop?.prices_include_gst ? `${t('gst')} (incl.)` : t('gst')} value={formatPaise(cart.totals.tax_paise)} />
            {cart.totals.round_off_paise !== 0 && (
              <Row label="Round off" value={formatPaise(cart.totals.round_off_paise)} />
            )}
            <div className="mt-1 flex items-end justify-between border-t border-brand-200 pt-2 dark:border-brand-800">
              <span className="text-sm font-bold text-brand-900 dark:text-brand-100">{t('total')}</span>
              <span className="font-display text-3xl font-extrabold leading-none text-brand-900 dark:text-brand-100">
                {formatPaise(total)}
              </span>
            </div>
          </div>

          {/* Payment modes */}
          <div className="grid grid-cols-4 gap-2">
            {MODES.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    if (item.value === 'udhaar' && !cart.customer) {
                      setPickerOpen(true)
                      return
                    }
                    setMode(item.value)
                    setError(null)
                  }}
                  className={clsx(
                    'flex flex-col items-center gap-1 rounded-2xl border-2 py-2.5 text-xs font-bold transition',
                    mode === item.value
                      ? 'border-brand-700 bg-brand-700 text-white'
                      : 'border-ink-100 bg-white text-ink-700 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-100',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {t(item.labelKey)}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => setMode(mode === 'split' ? 'cash' : 'split')}
            className={clsx(
              'flex w-full items-center justify-center gap-2 rounded-2xl border-2 py-2.5 text-sm font-bold',
              mode === 'split'
                ? 'border-brand-700 bg-brand-50 text-brand-800 dark:bg-brand-950/40 dark:text-brand-100'
                : 'border-dashed border-ink-200 text-ink-600 dark:border-ink-700 dark:text-ink-200',
            )}
          >
            <Plus className="h-4 w-4" /> {t('splitPayment')}
          </button>

          {/* CASH */}
          {mode === 'cash' && (
            <div className="space-y-2 rounded-2xl border-2 border-ink-100 p-3 dark:border-ink-800">
              <label className="text-sm font-semibold text-ink-600 dark:text-ink-200">{t('cashReceived')}</label>
              <Input
                inputMode="decimal"
                value={cashInput}
                onChange={(event) => setCashInput(event.target.value.replace(/[^\d.]/g, ''))}
                className="h-14 text-center font-display text-2xl font-extrabold"
              />
              <div className="grid grid-cols-3 gap-2">
                {quickCash.map((value, index) => (
                  <button
                    key={`${value}-${index}`}
                    type="button"
                    onClick={() => setCashInput(String(value / 100))}
                    className="h-11 rounded-xl bg-ink-100 text-sm font-bold text-ink-800 active:scale-95 dark:bg-ink-800 dark:text-ink-50"
                  >
                    {index === 0 ? t('exactAmount') : `₹${value / 100}`}
                  </button>
                ))}
              </div>
              <div
                className={clsx(
                  'flex items-center justify-between rounded-xl px-3 py-2 text-sm font-bold',
                  cashShort
                    ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200'
                    : 'bg-brand-100 text-brand-900 dark:bg-brand-900/50 dark:text-brand-100',
                )}
              >
                <span>{cashShort ? t('remaining') : t('changeToReturn')}</span>
                <span className="font-display text-xl">{formatPaise(cashShort ? total - cashEntered : change)}</span>
              </div>
            </div>
          )}

          {/* UPI */}
          {mode === 'upi' && (
            <div className="space-y-2 rounded-2xl border-2 border-ink-100 p-3 text-center dark:border-ink-800">
              {!shop?.upi_id || !isValidVpa(shop.upi_id) ? (
                <p className="rounded-xl bg-saffron-50 p-3 text-sm font-semibold text-saffron-900 dark:bg-saffron-900/30 dark:text-saffron-100">
                  {t('upiNotSet')}
                </p>
              ) : (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t('scanToPay')}</p>
                  <div className="mx-auto w-52 rounded-2xl bg-white p-2 shadow-sm">
                    {qr ? <img src={qr} alt="UPI QR" className="h-full w-full" /> : <div className="h-48 animate-pulse rounded-xl bg-ink-100" />}
                  </div>
                  <p className="font-display text-2xl font-extrabold text-ink-900 dark:text-ink-50">{formatPaise(upiPaise)}</p>
                  <p className="flex items-center justify-center gap-1 text-xs text-ink-500">
                    <QrCode className="h-3 w-3" /> {shop.upi_id}
                  </p>
                  <a
                    href={upiAppLinks(buildUpiUri({ vpa: shop.upi_id, payeeName: shop.name, amountPaise: upiPaise })).generic}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 text-sm font-bold text-white"
                  >
                    <Smartphone className="h-4 w-4" /> {t('openUpiApp')}
                  </a>
                </>
              )}
              <p className="text-[11px] text-ink-500 dark:text-ink-400">
                Payment aane ke baad "{t('payNow')}" dabayein — amount fix hai, badla nahi ja sakta.
              </p>
            </div>
          )}

          {/* CARD */}
          {mode === 'card' && (
            <div className="rounded-2xl border-2 border-ink-100 p-3 text-sm text-ink-600 dark:border-ink-800 dark:text-ink-200">
              <p className="font-semibold">{t('card')} — machine par {formatPaise(total)} swipe karein.</p>
              <p className="mt-1 text-xs text-ink-500">Card machine ka reference bill ke saath save hoga.</p>
            </div>
          )}

          {/* UDHAAR */}
          {mode === 'udhaar' && cart.customer && (
            <div className="space-y-1 rounded-2xl border-2 border-saffron-200 bg-saffron-50 p-3 dark:border-saffron-900 dark:bg-saffron-950/30">
              <p className="text-sm font-bold text-saffron-900 dark:text-saffron-100">
                {cart.customer.name} ke khate mein {formatPaise(total)} udhaar
              </p>
              <p className="text-xs text-saffron-800 dark:text-saffron-200">
                {t('creditLimit')}: {cart.customer.credit_limit_paise ? formatPaise(cart.customer.credit_limit_paise) : 'No limit'} ·
                {' '}
                {t('due')}: {formatPaise(cart.customer.balance_paise)} → {formatPaise(cart.customer.balance_paise + total)}
              </p>
            </div>
          )}

          {/* SPLIT */}
          {mode === 'split' && (
            <div className="space-y-2 rounded-2xl border-2 border-ink-100 p-3 dark:border-ink-800">
              {splitRows.map((row) => (
                <div key={row.id} className="flex items-center gap-2">
                  <select
                    value={row.mode}
                    onChange={(event) =>
                      setSplitRows((rows) =>
                        rows.map((item) =>
                          item.id === row.id ? { ...item, mode: event.target.value as PaymentMode } : item,
                        ),
                      )
                    }
                    className="h-11 rounded-xl border-2 border-ink-200 bg-white px-2 text-sm font-semibold dark:border-ink-700 dark:bg-ink-900"
                  >
                    <option value="cash">{t('cash')}</option>
                    <option value="upi">{t('upi')}</option>
                    <option value="card">{t('card')}</option>
                    <option value="udhaar">{t('udhaar')}</option>
                  </select>
                  <Input
                    inputMode="decimal"
                    value={row.amount}
                    onChange={(event) =>
                      setSplitRows((rows) =>
                        rows.map((item) =>
                          item.id === row.id ? { ...item, amount: event.target.value.replace(/[^\d.]/g, '') } : item,
                        ),
                      )
                    }
                    placeholder="0"
                    className="h-11 flex-1 text-right"
                  />
                  <button
                    type="button"
                    aria-label={t('remove')}
                    onClick={() => setSplitRows((rows) => rows.filter((item) => item.id !== row.id))}
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={() =>
                    setSplitRows((rows) => [...rows, { id: Date.now(), mode: 'cash', amount: '' }])
                  }
                >
                  {t('addSplit')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setSplitRows((rows) => [
                      ...rows.map((row, index) =>
                        index === 0
                          ? { ...row, amount: String(Math.floor(Math.max(0, splitRemaining) / 100)) }
                          : row,
                      ),
                    ])
                  }
                >
                  Fill {t('remaining')}
                </Button>
              </div>
              <div
                className={clsx(
                  'flex items-center justify-between rounded-xl px-3 py-2 text-sm font-bold',
                  splitRemaining > 0
                    ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200'
                    : 'bg-brand-100 text-brand-900 dark:bg-brand-900/50 dark:text-brand-100',
                )}
              >
                <span>{splitRemaining > 0 ? t('remaining') : t('changeToReturn')}</span>
                <span className="font-display text-xl">{formatPaise(Math.abs(splitRemaining))}</span>
              </div>
            </div>
          )}

          {/* Offers + loyalty */}
          {cart.offers.length > 0 && (
            <div className="rounded-2xl bg-brand-50 p-3 dark:bg-brand-950/30">
              <p className="flex items-center gap-1 text-xs font-bold uppercase text-brand-800 dark:text-brand-200">
                <Sparkles className="h-3.5 w-3.5" /> {t('offersApplied')}
              </p>
              {cart.offers.map((offer) => (
                <p key={offer.offer.id} className="mt-0.5 flex justify-between text-xs text-brand-900 dark:text-brand-100">
                  <span>{offer.label}</span>
                  <span className="font-bold">− {formatPaise(offer.amount_paise)}</span>
                </p>
              ))}
            </div>
          )}

          {cart.customer && maxRedeemPoints > 0 && (
            <div className="flex items-center justify-between rounded-2xl border-2 border-saffron-200 p-3 dark:border-saffron-900">
              <div>
                <p className="text-sm font-bold text-ink-900 dark:text-ink-50">
                  ⭐ {cart.customer.loyalty_points} {t('loyaltyPoints')}
                </p>
                <p className="text-xs text-ink-500">1 point = ₹1 (max {maxRedeemPoints})</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => cart.setRedeemPoints(Math.max(0, cart.redeemPoints - 10))}
                  className="h-10 w-10 rounded-xl bg-ink-100 font-bold dark:bg-ink-800"
                >
                  −
                </button>
                <span className="w-10 text-center font-bold">{cart.redeemPoints}</span>
                <button
                  type="button"
                  onClick={() => cart.setRedeemPoints(Math.min(maxRedeemPoints, cart.redeemPoints + 10))}
                  className="h-10 w-10 rounded-xl bg-brand-700 font-bold text-white"
                >
                  +
                </button>
              </div>
            </div>
          )}

          <Textarea
            value={note}
            onChange={(event) => {
              setNote(event.target.value)
              cart.setNote(event.target.value)
            }}
            placeholder={t('billNoteHint')}
          />

          {error && (
            <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          )}
        </div>
      </Sheet>

      <CustomerPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleCustomer}
        selectedId={cart.customer?.id}
      />
    </>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'discount' }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-sm">
      <span className="text-brand-800 dark:text-brand-200">{label}</span>
      <span className={clsx('font-semibold tabular-nums', tone === 'discount' ? 'text-saffron-700 dark:text-saffron-300' : 'text-brand-900 dark:text-brand-100')}>
        {value}
      </span>
    </div>
  )
}
