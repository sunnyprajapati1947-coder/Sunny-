import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Download, FileSpreadsheet, FileText, TrendingUp } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { useLive } from '../hooks/useLive'
import { getRangeSnapshot, exportReportWorkbook, type RangeSnapshot } from '../data/reports'
import { addDays, istDateKey } from '../lib/date'
import { formatPaise, formatPaiseCompact, toRupees } from '../lib/money'
import { downloadReportPdf } from '../lib/reportPdf'
import { Badge, Card, SectionTitle, StatCard } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input, Segmented } from '../components/ui/form'

type RangeKind = 'today' | 'week' | 'month' | 'custom'

export default function ReportsPage() {
  const { shop, user, toast } = useApp()
  const t = useT()
  const navigate = useNavigate()
  const [kind, setKind] = useState<RangeKind>('today')
  const [from, setFrom] = useState(addDays(istDateKey(), -6))
  const [to, setTo] = useState(istDateKey())

  const { fromKey, toKey } = useMemo(() => {
    const today = istDateKey()
    if (kind === 'today') return { fromKey: today, toKey: today }
    if (kind === 'week') return { fromKey: addDays(today, -6), toKey: today }
    if (kind === 'month') return { fromKey: `${today.slice(0, 7)}-01`, toKey: today }
    return { fromKey: from, toKey: to }
  }, [kind, from, to])

  const snapshot = useLive<RangeSnapshot | null>(
    () => (shop ? getRangeSnapshot(shop.id, fromKey, toKey) : Promise.resolve(null)),
    [shop?.id, fromKey, toKey],
    null,
  )

  const isOwner = user?.role === 'owner'
  const avgBill = snapshot && snapshot.billCount ? snapshot.totals.sales_paise / snapshot.billCount : 0
  const maxDay = Math.max(1, ...(snapshot?.byDay.map((day) => day.sales_paise) ?? [1]))
  const maxCategory = Math.max(1, ...(snapshot?.categorySales.map((row) => row.revenue_paise) ?? [1]))

  const exportExcel = () => {
    if (!snapshot) return
    const sheets = [
      {
        name: 'Summary',
        rows: [
          ['Report', `${fromKey} to ${toKey}`],
          ['Sales', toRupees(snapshot.totals.sales_paise)],
          ['Bills', snapshot.totals.bills],
          ['Profit', toRupees(snapshot.totals.profit_paise)],
          ['Discount', toRupees(snapshot.totals.discount_paise)],
          ['GST', toRupees(snapshot.totals.tax_paise)],
          ['Cash', toRupees(snapshot.paymentSplit.cash_paise)],
          ['UPI', toRupees(snapshot.paymentSplit.upi_paise)],
          ['Card', toRupees(snapshot.paymentSplit.card_paise)],
          ['Udhaar', toRupees(snapshot.paymentSplit.udhaar_paise)],
        ],
      },
      {
        name: 'Daily',
        rows: [['Date', 'Bills', 'Sales', 'Profit'], ...snapshot.byDay.map((day) => [day.date, day.bills, toRupees(day.sales_paise), toRupees(day.profit_paise)])],
      },
      {
        name: 'Items',
        rows: [
          ['Item', 'Qty', 'Unit', 'Revenue', 'Profit'],
          ...snapshot.topItems.map((item) => [item.name_en, item.qty, item.unit, toRupees(item.revenue_paise), toRupees(item.profit_paise)]),
        ],
      },
      {
        name: 'Categories',
        rows: [['Category', 'Revenue'], ...snapshot.categorySales.map((row) => [row.name, toRupees(row.revenue_paise)])],
      },
    ]
    exportReportWorkbook(sheets, `dukaan-report-${fromKey}-${toKey}`)
    toast('Excel download ho gaya', 'success')
  }

  const exportPdf = () => {
    if (!snapshot || !shop) return
    downloadReportPdf({
      shopName: shop.name,
      title: 'Sales Report',
      subtitle: `${fromKey} to ${toKey}`,
      filename: `dukaan-report-${fromKey}-${toKey}`,
      sections: [
        {
          heading: 'Totals',
          columns: ['Metric', 'Value'],
          widths: [2, 1],
          rows: [
            ['Sales', `Rs ${toRupees(snapshot.totals.sales_paise).toFixed(2)}`],
            ['Bills', snapshot.totals.bills],
            ['Profit', `Rs ${toRupees(snapshot.totals.profit_paise).toFixed(2)}`],
            ['GST collected', `Rs ${toRupees(snapshot.totals.tax_paise).toFixed(2)}`],
            ['Discount', `Rs ${toRupees(snapshot.totals.discount_paise).toFixed(2)}`],
          ],
        },
        {
          heading: 'Payment split',
          columns: ['Mode', 'Amount'],
          widths: [2, 1],
          rows: [
            ['Cash', `Rs ${toRupees(snapshot.paymentSplit.cash_paise).toFixed(2)}`],
            ['UPI', `Rs ${toRupees(snapshot.paymentSplit.upi_paise).toFixed(2)}`],
            ['Card', `Rs ${toRupees(snapshot.paymentSplit.card_paise).toFixed(2)}`],
            ['Udhaar', `Rs ${toRupees(snapshot.paymentSplit.udhaar_paise).toFixed(2)}`],
          ],
        },
        {
          heading: 'Top items',
          columns: ['Item', 'Qty', 'Revenue'],
          widths: [3, 1, 1.4],
          rows: snapshot.topItems.slice(0, 20).map((item) => [item.name_en, `${item.qty} ${item.unit}`, `Rs ${toRupees(item.revenue_paise).toFixed(0)}`]),
        },
      ],
      footer: shop.address ?? undefined,
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink-900 dark:text-ink-50">{t('reports')}</h1>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            {fromKey} → {toKey}
          </p>
        </div>
        <Badge tone="brand">{snapshot?.billCount ?? 0} {t('bills')}</Badge>
      </div>

      <Segmented
        value={kind}
        onChange={(value) => setKind(value)}
        options={[
          { value: 'today', label: t('today') },
          { value: 'week', label: '7 din' },
          { value: 'month', label: t('thisMonth') },
          { value: 'custom', label: t('customRange') },
        ]}
      />

      {kind === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <StatCard label={t('sales')} value={formatPaise(snapshot?.totals.sales_paise ?? 0)} tone="brand" icon={<TrendingUp className="h-5 w-5" />} />
        {isOwner ? (
          <StatCard label={t('profit')} value={formatPaise(snapshot?.totals.profit_paise ?? 0)} hint={`${t('gst')} ${formatPaiseCompact(snapshot?.totals.tax_paise ?? 0)}`} />
        ) : (
          <StatCard label={t('bills')} value={String(snapshot?.billCount ?? 0)} />
        )}
        <StatCard label={t('bills')} value={String(snapshot?.totals.bills ?? 0)} hint={`Avg ${formatPaise(avgBill)}`} />
        <StatCard label={t('discount')} value={formatPaise(snapshot?.totals.discount_paise ?? 0)} />
      </div>

      <Card>
        <SectionTitle title={t('paymentSplitTitle')} subtitle={t('today')} />
        <div className="space-y-2">
          {[
            { label: t('cash'), value: snapshot?.paymentSplit.cash_paise ?? 0, color: 'bg-brand-600' },
            { label: t('upi'), value: snapshot?.paymentSplit.upi_paise ?? 0, color: 'bg-blue-500' },
            { label: t('card'), value: snapshot?.paymentSplit.card_paise ?? 0, color: 'bg-purple-500' },
            { label: t('udhaar'), value: snapshot?.paymentSplit.udhaar_paise ?? 0, color: 'bg-saffron-500' },
          ].map((row) => {
            const total = Math.max(1, snapshot?.paymentSplit.total_paise ?? 1)
            const percent = Math.round((row.value / total) * 100)
            return (
              <div key={row.label}>
                <div className="flex justify-between text-xs font-semibold text-ink-600 dark:text-ink-300">
                  <span>{row.label}</span>
                  <span>
                    {formatPaise(row.value)} · {percent}%
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                  <div className={clsx('h-full rounded-full', row.color)} style={{ width: `${percent}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card>
        <SectionTitle title="Daily sales" subtitle={`${snapshot?.byDay.length ?? 0} din`} />
        <div className="flex h-32 items-end gap-1">
          {(snapshot?.byDay ?? []).map((day) => (
            <div key={day.date} className="flex flex-1 flex-col items-center justify-end">
              <div
                className="w-full rounded-t bg-brand-600/90 dark:bg-brand-500/80"
                style={{ height: `${Math.max(3, (day.sales_paise / maxDay) * 100)}%` }}
                title={`${day.date}: ${formatPaise(day.sales_paise)}`}
              />
              <span className="mt-1 rotate-0 text-[9px] text-ink-400">{day.date.slice(8)}</span>
            </div>
          ))}
          {!snapshot?.byDay.length && <p className="w-full text-center text-sm text-ink-500">—</p>}
        </div>
      </Card>

      <Card>
        <SectionTitle title={t('categorySales')} />
        <div className="space-y-2">
          {(snapshot?.categorySales ?? []).slice(0, 6).map((row) => (
            <div key={row.category_id ?? row.name}>
              <div className="flex justify-between text-xs font-semibold text-ink-600 dark:text-ink-300">
                <span>{row.name}</span>
                <span>{formatPaiseCompact(row.revenue_paise)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                <div className="h-full rounded-full bg-saffron-500" style={{ width: `${(row.revenue_paise / maxCategory) * 100}%` }} />
              </div>
            </div>
          ))}
          {!snapshot?.categorySales.length && <p className="text-sm text-ink-500">—</p>}
        </div>
      </Card>

      <div>
        <SectionTitle title={t('topSelling')} />
        <Card className="divide-y divide-ink-100 p-0 dark:divide-ink-800">
          {(snapshot?.topItems ?? []).slice(0, 8).map((item, index) => (
            <div key={`${item.product_id}-${index}`} className="flex items-center gap-3 p-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-100 text-xs font-extrabold text-brand-800 dark:bg-brand-900 dark:text-brand-100">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{item.name_hi}</p>
                <p className="text-xs text-ink-500 dark:text-ink-400">
                  {item.qty} {item.unit} · {t('profit')} {formatPaiseCompact(item.profit_paise)}
                </p>
              </div>
              <p className="font-bold tabular-nums text-ink-900 dark:text-ink-50">{formatPaise(item.revenue_paise)}</p>
            </div>
          ))}
          {!snapshot?.topItems.length && <p className="p-4 text-center text-sm text-ink-500">—</p>}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" icon={<FileSpreadsheet className="h-4 w-4" />} onClick={exportExcel}>
          {t('exportExcel')}
        </Button>
        <Button variant="secondary" icon={<FileText className="h-4 w-4" />} onClick={exportPdf}>
          {t('exportPdf')}
        </Button>
      </div>

      <div className="grid gap-2">
        <ReportLink title={t('gstReport')} subtitle={t('gstReportHint')} onClick={() => navigate('/reports/gst')} />
        {isOwner && <ReportLink title={t('pnl')} subtitle={t('profit')} onClick={() => navigate('/reports/pnl')} />}
        <ReportLink title={t('dayClose')} subtitle={t('dayCloseHint')} onClick={() => navigate('/reports/day-close')} />
        <ReportLink title={t('deadStock')} subtitle={t('deadStockHint')} onClick={() => navigate('/inventory?tab=dead')} />
      </div>

      <p className="flex items-center justify-center gap-1 pb-2 text-[11px] text-ink-400">
        <Download className="h-3 w-3" /> Excel & PDF dono me export hota hai
      </p>
    </div>
  )
}

function ReportLink({ title, subtitle, onClick }: { title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-card active:scale-[0.995] dark:bg-ink-900"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink-900 dark:text-ink-50">{title}</p>
        <p className="truncate text-xs text-ink-500 dark:text-ink-400">{subtitle}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-ink-400" />
    </button>
  )
}
