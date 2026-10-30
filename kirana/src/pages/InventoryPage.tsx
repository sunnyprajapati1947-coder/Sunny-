import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlarmClock, ClipboardList, PackageSearch, Skull, TrendingDown } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { db } from '../lib/db'
import { useLive } from '../hooks/useLive'
import { daysUntil } from '../lib/date'
import { formatPaise } from '../lib/money'
import { getDeadStock, type DeadStockRow } from '../data/reports'
import type { Product } from '../types'
import { PageHeader } from '../components/layout/AppShell'
import { Badge, Card, EmptyState, StatCard } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Segmented } from '../components/ui/form'

type Tab = 'low' | 'expiry' | 'dead'

export default function InventoryPage() {
  const { shop } = useApp()
  const t = useT()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'low')

  const products = useLive<Product[]>(
    () => (shop ? db.products.where('shop_id').equals(shop.id).filter((p) => p.is_active).toArray() : Promise.resolve([])),
    [shop?.id],
    [],
  )

  const deadStock = useLive<DeadStockRow[]>(
    () => (shop ? getDeadStock(shop.id, 30) : Promise.resolve([])),
    [shop?.id],
    [],
  )

  const low = useMemo(() => (products ?? []).filter((p) => p.stock_qty <= p.low_stock_limit).sort((a, b) => a.stock_qty - b.stock_qty), [products])
  const expiring = useMemo(
    () =>
      (products ?? [])
        .filter((p) => {
          const days = daysUntil(p.expiry_date)
          return days !== null && days <= 30
        })
        .sort((a, b) => (a.expiry_date ?? '').localeCompare(b.expiry_date ?? '')),
    [products],
  )

  const stockValue = (products ?? []).reduce((sum, product) => sum + product.stock_qty * product.purchase_price_paise, 0)

  const setTabAndUrl = (value: Tab) => {
    setTab(value)
    setParams({ tab: value })
  }

  const rows: (Product | DeadStockRow)[] = tab === 'low' ? low : tab === 'expiry' ? expiring : (deadStock ?? [])

  return (
    <div className="space-y-3">
      <PageHeader
        title={t('inventory')}
        subtitle={`${products?.length ?? 0} active products`}
        onBack={() => navigate('/more')}
        action={
          <Button size="sm" variant="secondary" icon={<ClipboardList className="h-4 w-4" />} onClick={() => navigate('/order-list')}>
            {t('orderList')}
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2">
        <StatCard label={t('stockQty')} value={formatPaise(stockValue)} hint="Stock value (cost)" tone="brand" icon={<PackageSearch className="h-5 w-5" />} />
        <StatCard label={t('lowStock')} value={String(low.length)} tone={low.length ? 'warning' : 'default'} icon={<TrendingDown className="h-5 w-5" />} />
        <StatCard label={t('expiryAlert')} value={String(expiring.length)} icon={<AlarmClock className="h-5 w-5" />} />
        <StatCard label={t('deadStock')} value={String(deadStock?.length ?? 0)} icon={<Skull className="h-5 w-5" />} />
      </div>

      <Segmented
        value={tab}
        onChange={setTabAndUrl}
        options={[
          { value: 'low', label: t('lowStock') },
          { value: 'expiry', label: 'Expiry' },
          { value: 'dead', label: 'Dead' },
        ]}
      />

      <div className="space-y-2">
        {tab === 'dead'
          ? (rows as DeadStockRow[]).map((row) => (
              <button
                key={row.product.id}
                type="button"
                onClick={() => navigate(`/products/${row.product.id}`)}
                className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-card dark:bg-ink-900"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{row.product.name_hi}</p>
                  <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                    {row.last_sold ? `Last sold ${row.last_sold.slice(0, 10)}` : 'Kabhi nahi bika'} · stock {row.product.stock_qty} {row.product.unit}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-ink-900 dark:text-ink-50">{formatPaise(row.stock_value_paise)}</p>
                  <p className="text-[10px] text-ink-400">pada hua</p>
                </div>
              </button>
            ))
          : (rows as Product[]).map((product) => {
              const days = daysUntil(product.expiry_date)
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => navigate(`/products/${product.id}`)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-card dark:bg-ink-900"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{product.name_hi}</p>
                    <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                      {product.name_en} · {product.brand ?? '—'}
                    </p>
                    {tab === 'expiry' && product.expiry_date && (
                      <p className="mt-0.5 text-xs font-semibold text-ink-500 dark:text-ink-300">
                        Expiry {product.expiry_date}
                        {days !== null && (
                          <span className={days < 0 ? ' text-red-600' : days <= 7 ? ' text-red-600' : days <= 15 ? ' text-saffron-600' : ''}>
                            {' '}· {days < 0 ? `${t('expired')} ${Math.abs(days)}d` : `${days} ${t('daysLeft')}`}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <Badge tone={product.stock_qty <= 0 ? 'danger' : product.stock_qty <= product.low_stock_limit ? 'warning' : 'success'}>
                    {product.stock_qty} {product.unit}
                  </Badge>
                </button>
              )
            })}
      </div>

      {!rows.length && (
        <EmptyState
          icon={<PackageSearch className="h-10 w-10" />}
          title={tab === 'low' ? 'Sab stock theek hai 🎉' : tab === 'expiry' ? 'Koi item expire nahi ho raha' : t('deadStock')}
          body={tab === 'dead' ? t('deadStockHint') : undefined}
        />
      )}

      <Card className="bg-brand-50/60 dark:bg-brand-950/20">
        <p className="text-xs text-ink-600 dark:text-ink-300">
          Stock audit se ginti aur system stock compare karein —{' '}
          <button type="button" onClick={() => navigate('/inventory/audit')} className="font-bold text-brand-700 underline dark:text-brand-300">
            {t('stockAudit')}
          </button>
        </p>
      </Card>
    </div>
  )
}
