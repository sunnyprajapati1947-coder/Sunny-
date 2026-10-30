import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlarmClock,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  CalendarCheck,
  ClipboardList,
  PackageSearch,
  PlusCircle,
  ReceiptText,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { getDashboard, type DashboardData } from '../data/reports'
import { useLive } from '../hooks/useLive'
import { formatPaise, formatPaiseCompact } from '../lib/money'
import { formatTime } from '../lib/date'
import { ROLE_LABELS } from '../lib/permissions'
import { Badge, Card, SectionTitle, StatCard } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { useCart } from '../context/CartContext'

export default function HomePage() {
  const { shop, user, demoMode, language } = useApp()
  const t = useT()
  const navigate = useNavigate()
  const cart = useCart()

  const data = useLive<DashboardData | null>(() => (shop ? getDashboard(shop.id) : Promise.resolve(null)), [shop?.id], null)

  const greeting = useMemo(() => {
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()),
    )
    if (hour < 12) return language === 'hi' ? 'सुप्रभात' : 'Suprabhat'
    if (hour < 17) return language === 'hi' ? 'नमस्ते' : 'Namaste'
    return language === 'hi' ? 'शुभ संध्या' : 'Shubh sandhya'
  }, [language])

  const growth = useMemo(() => {
    if (!data || data.yesterday.sales_paise === 0) return null
    return Math.round(((data.today.sales_paise - data.yesterday.sales_paise) / data.yesterday.sales_paise) * 100)
  }, [data])

  if (!data) {
    return <div className="py-10 text-center text-sm text-ink-500">{t('loading')}</div>
  }

  const isOwner = user?.role === 'owner'

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-ink-500 dark:text-ink-400">
          {greeting}, {user?.name?.split(' ')[0] ?? 'ji'} 🙏
        </p>
        <h1 className="font-display text-2xl font-extrabold leading-tight text-ink-900 dark:text-ink-50">
          {t('salesToday')}
        </h1>
        <p className="text-xs font-medium text-ink-500 dark:text-ink-400">
          {user && `${ROLE_LABELS[user.role][language === 'hi' ? 'hi' : 'en']} · `}
          {new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' }).format(
            new Date(),
          )}
        </p>
      </div>

      <StatCard
        label={t('salesToday')}
        value={formatPaise(data.today.sales_paise)}
        hint={
          growth === null
            ? `${data.today.bills} ${t('bills')}`
            : `${growth >= 0 ? '▲' : '▼'} ${Math.abs(growth)}% ${t('vsYesterday')}`
        }
        tone="brand"
        icon={growth !== null && growth < 0 ? <TrendingDown className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
        onClick={() => navigate('/reports')}
      />

      <div className="grid grid-cols-2 gap-2">
        <StatCard label={t('billsToday')} value={String(data.today.bills)} hint={formatPaiseCompact(data.today.sales_paise / Math.max(1, data.today.bills)) + ' avg'} />
        {isOwner ? (
          <StatCard
            label={t('profitToday')}
            value={formatPaise(data.today.profit_paise)}
            hint={`${t('monthSales')}: ${formatPaiseCompact(data.month.sales_paise)}`}
            onClick={() => navigate('/reports/pnl')}
          />
        ) : (
          <StatCard label={t('items')} value={String(data.today.items_sold)} hint={t('today')} />
        )}
        <StatCard
          label={t('cash')}
          value={formatPaise(data.paymentSplit.cash_paise)}
          hint={`${t('upi')}: ${formatPaise(data.paymentSplit.upi_paise)}`}
          onClick={() => navigate('/reports/day-close')}
        />
        <StatCard
          label={t('pendingUdhaar')}
          value={formatPaiseCompact(data.pendingUdhaarPaise)}
          hint={`${data.customersWithDue} customers`}
          tone={data.pendingUdhaarPaise > 0 ? 'warning' : 'default'}
          onClick={() => navigate('/khata')}
        />
      </div>

      <div className="grid grid-cols-4 gap-2">
        <QuickAction icon={<ShoppingCart className="h-5 w-5" />} label={t('newBill')} onClick={() => navigate('/billing')} primary />
        <QuickAction icon={<PlusCircle className="h-5 w-5" />} label={t('addProduct')} onClick={() => navigate('/products/new')} />
        <QuickAction icon={<Truck className="h-5 w-5" />} label={t('purchaseEntry')} onClick={() => navigate('/purchases/new')} />
        <QuickAction icon={<ClipboardList className="h-5 w-5" />} label={t('orderList')} onClick={() => navigate('/order-list')} />
      </div>

      <div className="grid grid-cols-4 gap-2">
        <QuickAction icon={<Users className="h-5 w-5" />} label={t('khata')} onClick={() => navigate('/khata')} />
        <QuickAction icon={<BarChart3 className="h-5 w-5" />} label={t('reports')} onClick={() => navigate('/reports')} />
        <QuickAction icon={<CalendarCheck className="h-5 w-5" />} label={t('dayClose')} onClick={() => navigate('/reports/day-close')} />
        <QuickAction icon={<BookOpenCheck className="h-5 w-5" />} label={t('stockAudit')} onClick={() => navigate('/inventory/audit')} />
      </div>

      {(data.lowStock.length > 0 || data.expiring.length > 0) && (
        <Card className="space-y-2 border-saffron-200 bg-saffron-50/60 dark:border-saffron-900 dark:bg-saffron-950/20">
          <div className="flex items-center justify-between">
            <p className="font-display text-base font-bold text-saffron-900 dark:text-saffron-100">{t('lowStock')}</p>
            <Badge tone="warning">{data.lowStock.length}</Badge>
          </div>
          <div className="space-y-1">
            {data.lowStock.slice(0, 4).map((product) => (
              <div key={product.id} className="flex items-center justify-between text-sm">
                <span className="truncate text-saffron-900 dark:text-saffron-100">{product.name_hi}</span>
                <span className="shrink-0 font-bold text-saffron-800 dark:text-saffron-200">
                  {product.stock_qty} {product.unit}
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" icon={<PackageSearch className="h-4 w-4" />} onClick={() => navigate('/inventory')}>
              {t('inventory')}
            </Button>
            <Button size="sm" onClick={() => navigate('/order-list')} icon={<ClipboardList className="h-4 w-4" />}>
              {t('orderList')}
            </Button>
          </div>
          {data.expiring.length > 0 && (
            <p className="flex items-center gap-1 text-xs font-semibold text-saffron-800 dark:text-saffron-200">
              <AlarmClock className="h-3.5 w-3.5" /> {data.expiring.length} items {t('expiryAlert')} —{' '}
              {data.expiring[0]?.name_hi}
            </p>
          )}
        </Card>
      )}

      <div>
        <SectionTitle
          title={t('topSelling')}
          action={
            <button type="button" onClick={() => navigate('/reports')} className="flex items-center gap-1 text-xs font-bold text-brand-700 dark:text-brand-300">
              {t('seeAll')} <ArrowRight className="h-3 w-3" />
            </button>
          }
        />
        <Card className="divide-y divide-ink-100 p-0 dark:divide-ink-800">
          {data.topItems.slice(0, 5).map((item, index) => (
            <div key={`${item.product_id}-${index}`} className="flex items-center gap-3 p-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-100 text-xs font-extrabold text-brand-800 dark:bg-brand-900 dark:text-brand-100">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{item.name_hi}</p>
                <p className="text-xs text-ink-500 dark:text-ink-400">
                  {item.qty} {item.unit} {t('items')}
                </p>
              </div>
              <p className="font-bold tabular-nums text-ink-900 dark:text-ink-50">{formatPaiseCompact(item.revenue_paise)}</p>
            </div>
          ))}
          {!data.topItems.length && <p className="p-4 text-center text-sm text-ink-500">{t('noProducts')}</p>}
        </Card>
      </div>

      <div>
        <SectionTitle
          title={t('bills')}
          action={
            <button type="button" onClick={() => navigate('/bills')} className="flex items-center gap-1 text-xs font-bold text-brand-700 dark:text-brand-300">
              {t('seeAll')} <ArrowRight className="h-3 w-3" />
            </button>
          }
        />
        <Card className="divide-y divide-ink-100 p-0 dark:divide-ink-800">
          {data.recentBills.slice(0, 6).map((bill) => (
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
                ) : bill.payment_status === 'pending' ? (
                  <Badge tone="warning">{t('udhaar')}</Badge>
                ) : (
                  <Badge tone="success">PAID</Badge>
                )}
              </div>
            </button>
          ))}
          {!data.recentBills.length && <p className="p-4 text-center text-sm text-ink-500">{t('noProductsHint')}</p>}
        </Card>
      </div>

      {demoMode && (
        <p className="rounded-2xl bg-ink-100 p-3 text-center text-xs text-ink-500 dark:bg-ink-900 dark:text-ink-400">
          {t('demoBanner')} · {cart.lines.length > 0 ? `${cart.lines.length} ${t('items')} in cart` : ''}
        </p>
      )}
    </div>
  )
}

function QuickAction({
  icon,
  label,
  onClick,
  primary,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 rounded-2xl p-2.5 text-center transition active:scale-[0.97] ${
        primary
          ? 'bg-brand-700 text-white shadow-sm'
          : 'bg-white text-ink-700 shadow-card dark:bg-ink-900 dark:text-ink-100'
      }`}
    >
      <span className={primary ? 'text-white' : 'text-brand-700 dark:text-brand-300'}>{icon}</span>
      <span className="text-[11px] font-bold leading-tight">{label}</span>
    </button>
  )
}
