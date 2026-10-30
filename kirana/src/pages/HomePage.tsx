import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  Boxes,
  PackagePlus,
  Plus,
  QrCode,
  ReceiptText,
  ShoppingCart,
  Users,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { getDashboard, type DashboardData } from '../data/reports'
import { useLive } from '../hooks/useLive'
import { formatPaise, formatPaiseCompact } from '../lib/money'
import { formatTime } from '../lib/date'
import { Badge, Card, SectionTitle } from '../components/ui/card'

/**
 * Home screen: one clear action (new bill), three shortcuts, today's money and
 * the last few bills. Everything else lives behind "More" so the counter screen
 * never looks like a control panel.
 */
export default function HomePage() {
  const { shop, user, language } = useApp()
  const t = useT()
  const navigate = useNavigate()

  const data = useLive<DashboardData | null>(
    () => (shop ? getDashboard(shop.id) : Promise.resolve(null)),
    [shop?.id],
    null,
  )

  const greeting = useMemo(() => {
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()),
    )
    if (hour < 12) return language === 'hi' ? 'सुप्रभात' : 'Suprabhat'
    if (hour < 17) return language === 'hi' ? 'नमस्ते' : 'Namaste'
    return language === 'hi' ? 'शुभ संध्या' : 'Shubh sandhya'
  }, [language])

  if (!data) {
    return <div className="py-10 text-center text-sm text-ink-500">{t('loading')}</div>
  }

  const isOwner = user?.role === 'owner'
  const firstRun = data.today.bills === 0 && data.recentBills.length === 0
  const lowStock = data.lowStock

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-ink-500 dark:text-ink-400">
          {greeting}, {(user?.name || shop?.owner_name || 'ji').split(' ')[0]} 🙏
        </p>
        <h1 className="font-display text-2xl font-extrabold leading-tight text-ink-900 dark:text-ink-50">
          {shop?.name ?? t('appName')}
        </h1>
      </div>

      {/* Today's money — the number a shopkeeper checks first. */}
      <Card className="bg-brand-700 p-4 text-white dark:bg-brand-800">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-100">{t('salesToday')}</p>
            <p className="font-display text-4xl font-extrabold leading-tight">{formatPaise(data.today.sales_paise)}</p>
            <p className="mt-0.5 text-xs font-semibold text-brand-100">
              {data.today.bills} {t('bills')} · {t('cash')} {formatPaiseCompact(data.paymentSplit.cash_paise)} ·{' '}
              {t('upi')} {formatPaiseCompact(data.paymentSplit.upi_paise)}
            </p>
          </div>
          {isOwner && (
            <div className="shrink-0 text-right">
              <p className="text-[10px] font-bold uppercase text-brand-200">{t('profitToday')}</p>
              <p className="font-display text-lg font-extrabold">{formatPaise(data.today.profit_paise)}</p>
            </div>
          )}
        </div>
      </Card>

      {/* One big action. */}
      <button
        type="button"
        onClick={() => navigate('/billing')}
        className="flex w-full items-center justify-between rounded-3xl bg-brand-700 px-5 py-5 text-left text-white shadow-lift transition active:scale-[0.99] dark:bg-brand-600"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
            <ShoppingCart className="h-6 w-6" />
          </span>
          <span>
            <span className="block font-display text-xl font-extrabold leading-tight">{t('newBill')}</span>
            <span className="block text-xs font-semibold text-brand-100">{t('newBillHint')}</span>
          </span>
        </span>
        <ArrowRight className="h-6 w-6" />
      </button>

      <div className="grid grid-cols-3 gap-2">
        <BigTile
          icon={<PackagePlus className="h-5 w-5" />}
          label={t('addProduct')}
          onClick={() => navigate('/products/new')}
        />
        <BigTile
          icon={<Users className="h-5 w-5" />}
          label={t('khata')}
          hint={data.pendingUdhaarPaise > 0 ? formatPaiseCompact(data.pendingUdhaarPaise) : undefined}
          onClick={() => navigate('/khata')}
        />
        <BigTile icon={<BarChart3 className="h-5 w-5" />} label={t('reports')} onClick={() => navigate('/reports')} />
      </div>

      {firstRun && (
        <Card className="space-y-2 border-brand-200 bg-brand-50/70 dark:border-brand-900 dark:bg-brand-950/30">
          <p className="font-display text-base font-bold text-brand-900 dark:text-brand-100">{t('startHereTitle')}</p>
          <p className="text-sm text-brand-800/80 dark:text-brand-200/80">{t('startHereBody')}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => navigate('/products/new')}
              className="inline-flex h-11 items-center gap-1.5 rounded-2xl bg-brand-700 px-4 text-sm font-bold text-white"
            >
              <Plus className="h-4 w-4" /> {t('firstProduct')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="inline-flex h-11 items-center gap-1.5 rounded-2xl bg-white px-4 text-sm font-bold text-brand-800 shadow-sm dark:bg-ink-900 dark:text-brand-200"
            >
              <QrCode className="h-4 w-4" /> {t('shopQr')}
            </button>
          </div>
        </Card>
      )}

      {lowStock.length > 0 && (
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 font-display text-base font-bold text-ink-900 dark:text-ink-50">
              <Boxes className="h-4 w-4 text-saffron-600" /> {t('lowStock')}
            </p>
            <Badge tone="warning">{lowStock.length}</Badge>
          </div>
          <div className="space-y-1">
            {lowStock.slice(0, 3).map((product) => (
              <div key={product.id} className="flex items-center justify-between text-sm">
                <span className="truncate text-ink-700 dark:text-ink-200">{product.name_hi || product.name_en}</span>
                <span className="shrink-0 font-bold tabular-nums text-saffron-700 dark:text-saffron-300">
                  {product.stock_qty} {product.unit}
                </span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => navigate('/inventory')}
            className="flex h-10 w-full items-center justify-center gap-1 rounded-xl bg-ink-100 text-sm font-bold text-ink-700 dark:bg-ink-800 dark:text-ink-100"
          >
            {t('inventory')} <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </Card>
      )}

      <div>
        <SectionTitle
          title={t('recentBills')}
          action={
            <button
              type="button"
              onClick={() => navigate('/bills')}
              className="flex items-center gap-1 text-xs font-bold text-brand-700 dark:text-brand-300"
            >
              {t('seeAll')} <ArrowRight className="h-3 w-3" />
            </button>
          }
        />
        <Card className="divide-y divide-ink-100 p-0 dark:divide-ink-800">
          {data.recentBills.slice(0, 5).map((bill) => (
            <button
              key={bill.id}
              type="button"
              onClick={() => navigate(`/bills/${bill.id}`)}
              className="flex w-full items-center gap-3 p-3 text-left active:bg-ink-50 dark:active:bg-ink-800"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-200">
                <ReceiptText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{bill.bill_no}</p>
                <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                  {formatTime(bill.created_at)} · {bill.customer_name ?? t('walkInCustomer')}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold tabular-nums text-ink-900 dark:text-ink-50">{formatPaise(bill.total_paise)}</p>
                {bill.status === 'void' ? (
                  <Badge tone="danger">{t('voided')}</Badge>
                ) : bill.payment_status === 'pending' || bill.payment_status === 'partial' ? (
                  <Badge tone="warning">{t('udhaar')}</Badge>
                ) : (
                  <Badge tone="success">PAID</Badge>
                )}
              </div>
            </button>
          ))}
          {!data.recentBills.length && (
            <p className="p-5 text-center text-sm text-ink-500 dark:text-ink-400">{t('noBillsYet')}</p>
          )}
        </Card>
      </div>
    </div>
  )
}

function BigTile({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[86px] flex-col items-start justify-between rounded-2xl bg-white p-3 text-left shadow-card transition active:scale-[0.97] dark:bg-ink-900"
    >
      <span className="text-brand-700 dark:text-brand-300">{icon}</span>
      <span>
        <span className="block text-sm font-bold leading-tight text-ink-900 dark:text-ink-50">{label}</span>
        {hint && <span className="block text-[11px] font-semibold text-saffron-700 dark:text-saffron-300">{hint}</span>}
      </span>
    </button>
  )
}
