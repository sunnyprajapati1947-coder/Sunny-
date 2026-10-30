import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BadgePercent,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  ScanBarcode,
  ShoppingBasket,
  Trash2,
  UserRound,
} from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../context/AppContext'
import { useCart } from '../context/CartContext'
import { useT } from '../i18n/useT'
import { db } from '../lib/db'
import { useLive } from '../hooks/useLive'
import { deleteHeldBill, holdBill, listHeldBills } from '../data/billing'
import { addDays, istDateKey, istDayRange } from '../lib/date'
import { formatPaise } from '../lib/money'
import type { Bill, CartLine, Product } from '../types'
import { ScanPanel } from '../components/billing/ScanPanel'
import { ProductSearch } from '../components/billing/ProductSearch'
import { CartList } from '../components/billing/CartList'
import { CheckoutSheet } from '../components/billing/CheckoutSheet'
import { BillSuccessSheet, type CompletedBill } from '../components/billing/BillSuccessSheet'
import { DiscountSheet } from '../components/billing/DiscountSheet'
import { CustomerPicker } from '../components/customers/CustomerPicker'
import { Sheet } from '../components/ui/sheet'
import { Button, IconButton } from '../components/ui/button'
import { Badge, Card, EmptyState } from '../components/ui/card'
import { useConfirm } from '../components/ui/feedback'

export default function BillingPage() {
  const { shop, user, toast } = useApp()
  const cart = useCart()
  const t = useT()
  const navigate = useNavigate()
  const confirm = useConfirm()

  const [scanResult, setScanResult] = useState<'ok' | 'error' | null>(null)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [discountOpen, setDiscountOpen] = useState(false)
  const [customerOpen, setCustomerOpen] = useState(false)
  const [heldOpen, setHeldOpen] = useState(false)
  const [completed, setCompleted] = useState<CompletedBill | null>(null)
  const [successOpen, setSuccessOpen] = useState(false)

  const heldBills = useLive<{ bill: Bill; lines: CartLine[] }[]>(
    () => (shop ? listHeldBills(shop.id) : Promise.resolve([])),
    [shop?.id],
    [],
  )

  const frequent = useLive<Product[]>(async () => {
    if (!shop) return [] as Product[]
    const since = istDayRange(addDays(istDateKey(), -30)).start
    const bills = await db.bills.where('shop_id').equals(shop.id).filter((b) => b.created_at >= since).toArray()
    if (!bills.length) {
      return db.products.where('shop_id').equals(shop.id).filter((p) => p.is_active).limit(6).toArray()
    }
    const items = await db.bill_items.where('bill_id').anyOf(bills.map((b) => b.id)).toArray()
    const counts = new Map<string, number>()
    for (const item of items) {
      if (item.product_id) counts.set(item.product_id, (counts.get(item.product_id) ?? 0) + 1)
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    const products = await db.products.bulkGet(ranked.map(([id]) => id))
    return products.filter((product): product is Product => Boolean(product?.is_active))
  }, [shop?.id], [] as Product[])


  const handleScan = async (code: string, source: 'camera' | 'manual' | 'device') => {
    if (!code) return
    const result = await cart.addByBarcode(code)
    if (result.status === 'added' || result.status === 'incremented') {
      setScanResult('ok')
      window.setTimeout(() => setScanResult(null), 350)
      return
    }
    setScanResult('error')
    window.setTimeout(() => setScanResult(null), 600)
    if (result.status === 'not_found') {
      const canAdd = user?.role === 'owner' || user?.role === 'manager'
      const go = await confirm({
        title: t('newBarcodePrompt'),
        body: `Barcode ${code} database mein nahi hai.${canAdd ? ' Naya product add karein?' : ''}`,
        confirmLabel: canAdd ? t('addProduct') : t('search'),
      })
      if (go) {
        if (canAdd) navigate(`/products/new?barcode=${encodeURIComponent(code)}`)
        else toast('Product nahi mila — naam se search karein', 'error')
      }
      return
    }
    if (result.status === 'out_of_stock') {
      toast(`${result.product.name_hi} — ${t('outOfStock')}`, 'error')
      return
    }
    if (result.status === 'inactive') {
      toast(`${result.product.name_hi} inactive hai`, 'error')
      return
    }
    if (source === 'device') toast(`Scan: ${code}`, 'info')
  }

  const handleHold = async () => {
    if (!shop || !user || !cart.lines.length) return
    const ok = await confirm({
      title: t('holdBill'),
      body: `${cart.lines.length} items · ${formatPaise(cart.totals.total_paise)}`,
      confirmLabel: t('holdBill'),
    })
    if (!ok) return
    await holdBill({
      shop,
      actor: user,
      lines: cart.lines,
      customer: {
        id: cart.customer?.id ?? null,
        name: cart.customer?.name ?? null,
        phone: cart.customer?.phone ?? null,
      },
      note: cart.note || null,
    })
    cart.clear()
    toast('Bill hold ho gaya — baad mein resume karein', 'success')
  }

  const resumeHeld = (bill: Bill, lines: CartLine[]) => {
    cart.loadLines(lines, null, bill.note ?? '')
    setHeldOpen(false)
    toast(`${bill.bill_no} resume ho gaya`, 'success')
  }

  const removeHeld = async (bill: Bill) => {
    const ok = await confirm({ title: t('confirmDelete'), body: bill.bill_no, tone: 'danger' })
    if (!ok) return
    await deleteHeldBill(bill.id)
    toast(t('deleted'), 'success')
  }

  const frequentItems = useMemo(() => frequent ?? [], [frequent])

  return (
    <div className="space-y-3">
      <ScanPanel onScan={handleScan} lastResult={scanResult} compact />

      <ProductSearch onPick={(product) => cart.addProduct(product)} onScanRequest={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />

      {!cart.lines.length && frequentItems.length > 0 && (
        <Card className="p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">{t('quickAdd')}</p>
          <div className="flex flex-wrap gap-2">
            {frequentItems.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => cart.addProduct(product)}
                className="flex items-center gap-2 rounded-2xl bg-ink-100 px-3 py-2 text-left active:scale-95 dark:bg-ink-800"
              >
                <span className="text-lg">{product.is_loose ? '⚖️' : '📦'}</span>
                <span>
                  <span className="block max-w-[9rem] truncate text-xs font-bold text-ink-900 dark:text-ink-50">
                    {product.name_hi}
                  </span>
                  <span className="block text-[11px] font-semibold text-brand-700 dark:text-brand-300">
                    {formatPaise(product.selling_price_paise)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-3">
        <div className="mb-1 flex items-center justify-between">
          <p className="flex items-center gap-1.5 font-display text-base font-bold text-ink-900 dark:text-ink-50">
            <ShoppingBasket className="h-4 w-4" /> {t('cart')}
            {cart.lines.length > 0 && <Badge tone="brand">{cart.lines.length}</Badge>}
          </p>
          <div className="flex items-center gap-1">
            {cart.canUndo && (
              <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={cart.undo}>
                {t('undo')}
              </Button>
            )}
            {cart.lines.length > 0 && (
              <IconButton
                label={t('clear')}
                size="sm"
                variant="ghost"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={async () => {
                  const ok = await confirm({ title: 'Cart khali karein?', tone: 'danger' })
                  if (ok) cart.clear()
                }}
              />
            )}
          </div>
        </div>

        {cart.lines.length ? (
          <CartList lines={cart.lines} onChangeQty={cart.setQty} onRemove={cart.removeLine} />
        ) : (
          <EmptyState
            icon={<ScanBarcode className="h-10 w-10" />}
            title={t('cartEmpty')}
            body={t('cartEmptyHint')}
          />
        )}

        <button
          type="button"
          onClick={() => setCustomerOpen(true)}
          className="mt-2 flex w-full items-center gap-2 rounded-2xl border border-dashed border-ink-200 p-2.5 text-left dark:border-ink-700"
        >
          <UserRound className="h-4 w-4 text-ink-400" />
          <span className="flex-1 text-sm font-semibold text-ink-700 dark:text-ink-200">
            {cart.customer?.name ?? t('walkInCustomer')}
          </span>
          <span className="text-xs font-bold text-brand-700 dark:text-brand-300">
            {cart.customer ? t('edit') : t('addCustomer')}
          </span>
        </button>
      </Card>

      {heldBills && heldBills.length > 0 && (
        <Button block variant="outline" icon={<PlayCircle className="h-5 w-5" />} onClick={() => setHeldOpen(true)}>
          {t('heldBills')} ({heldBills.length})
        </Button>
      )}

      {/* Sticky checkout bar above the bottom nav */}
      <div className="safe-bottom fixed inset-x-0 bottom-[4.25rem] z-20 border-t border-ink-100 bg-white/95 px-3 pb-2 pt-2 backdrop-blur dark:border-ink-800 dark:bg-ink-950/95">
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-1.5 grid grid-cols-3 gap-2 text-[11px] font-semibold text-ink-500 dark:text-ink-400">
            <span>
              {t('subtotal')}
              <span className="block text-sm font-bold text-ink-800 dark:text-ink-100">
                {formatPaise(cart.totals.subtotal_paise)}
              </span>
            </span>
            <span>
              {t('gst')}
              <span className="block text-sm font-bold text-ink-800 dark:text-ink-100">{formatPaise(cart.totals.tax_paise)}</span>
            </span>
            <span>
              {t('discount')}
              <span
                className={clsx(
                  'block text-sm font-bold',
                  cart.totals.discount_paise > 0 ? 'text-saffron-700 dark:text-saffron-300' : 'text-ink-800 dark:text-ink-100',
                )}
              >
                {formatPaise(cart.totals.discount_paise)}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">{t('grandTotal')}</p>
              <p className="font-display text-3xl font-extrabold leading-none text-ink-950 dark:text-white">
                {formatPaise(cart.totals.total_paise)}
              </p>
            </div>
            <IconButton
              label={t('discount')}
              icon={<BadgePercent className="h-5 w-5" />}
              onClick={() => setDiscountOpen(true)}
              variant={cart.manualDiscountPaise > 0 ? 'primary' : 'secondary'}
            />
            <IconButton
              label={t('holdBill')}
              icon={<PauseCircle className="h-5 w-5" />}
              onClick={handleHold}
              disabled={!cart.lines.length}
            />
            <Button
              size="lg"
              variant="success"
              disabled={!cart.lines.length}
              onClick={() => setCheckoutOpen(true)}
              className="min-w-[7.5rem]"
            >
              {t('checkout')}
            </Button>
          </div>
        </div>
      </div>

      <CheckoutSheet
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onCompleted={(result) => {
          setCompleted(result)
          setSuccessOpen(true)
        }}
      />

      <BillSuccessSheet
        open={successOpen}
        data={completed}
        onClose={() => setSuccessOpen(false)}
        onNewBill={() => {
          setSuccessOpen(false)
          setCompleted(null)
        }}
      />

      <DiscountSheet open={discountOpen} onClose={() => setDiscountOpen(false)} />

      <CustomerPicker
        open={customerOpen}
        onClose={() => setCustomerOpen(false)}
        onSelect={(customer) => cart.setCustomer(customer)}
        selectedId={cart.customer?.id}
      />

      <Sheet
        open={heldOpen}
        onClose={() => setHeldOpen(false)}
        title={t('heldBills')}
        subtitle={`${heldBills?.length ?? 0} bills`}
      >
        <div className="space-y-2 pb-2">
          {heldBills?.map(({ bill, lines }) => (
            <div key={bill.id} className="flex items-center gap-2 rounded-2xl border border-ink-100 p-3 dark:border-ink-800">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">
                  {bill.customer_name ?? bill.bill_no}
                </p>
                <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                  {bill.bill_no} · {lines.length} {t('items')} · {formatPaise(bill.total_paise)}
                </p>
                {bill.note && <p className="truncate text-[11px] text-ink-400">{bill.note}</p>}
              </div>
              <Button size="sm" onClick={() => resumeHeld(bill, lines)}>
                {t('resumeBill')}
              </Button>
              <IconButton
                label={t('delete')}
                size="sm"
                variant="ghost"
                icon={<Trash2 className="h-4 w-4 text-red-500" />}
                onClick={() => removeHeld(bill)}
              />
            </div>
          ))}
          {!heldBills?.length && <p className="py-6 text-center text-sm text-ink-500">{t('noHeldBills')}</p>}
        </div>
      </Sheet>
    </div>
  )
}
