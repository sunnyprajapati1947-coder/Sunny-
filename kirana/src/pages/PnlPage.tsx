import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { useLive } from '../hooks/useLive'
import { getPnl, type PnlReport } from '../data/reports'
import { addDays, istDateKey, startOfMonthIST } from '../lib/date'
import { formatPaise, toRupees } from '../lib/money'
import { PageHeader } from '../components/layout/AppShell'
import { Card, Divider } from '../components/ui/card'
import { Input, Segmented } from '../components/ui/form'
import { Button } from '../components/ui/button'
import { downloadReportPdf } from '../lib/reportPdf'

export default function PnlPage() {
  const { shop } = useApp()
  const t = useT()
  const navigate = useNavigate()
  const [kind, setKind] = useState<'today' | 'week' | 'month'>('month')
  const [from, setFrom] = useState(startOfMonthIST())
  const [to, setTo] = useState(istDateKey())

  const range = kind === 'today'
    ? { from: istDateKey(), to: istDateKey() }
    : kind === 'week'
      ? { from: addDays(istDateKey(), -6), to: istDateKey() }
      : { from, to }

  const pnl = useLive<PnlReport | null>(
    () => (shop ? getPnl(shop.id, range.from, range.to) : Promise.resolve(null)),
    [shop?.id, range.from, range.to],
    null,
  )

  const exportPdf = () => {
    if (!pnl || !shop) return
    downloadReportPdf({
      shopName: shop.name,
      title: 'Profit & Loss',
      subtitle: `${range.from} to ${range.to}`,
      filename: `pnl-${range.from}-${range.to}`,
      sections: [
        {
          heading: 'Summary',
          columns: ['Metric', 'Amount (Rs)'],
          widths: [2, 1],
          rows: [
            ['Revenue (bills)', toRupees(pnl.revenue_paise).toFixed(2)],
            ['Cost of goods sold', toRupees(pnl.cogs_paise).toFixed(2)],
            ['Gross profit', toRupees(pnl.gross_profit_paise).toFixed(2)],
            ['Discounts given', toRupees(pnl.discounts_paise).toFixed(2)],
            ['GST collected (pass-through)', toRupees(pnl.gst_collected_paise).toFixed(2)],
            ['Credit (udhaar) sales', toRupees(pnl.udhaar_paise).toFixed(2)],
            ['Bills', pnl.bills],
          ],
        },
      ],
      footer: 'Gross margin uses the purchase price recorded at the time of sale.',
    })
  }

  return (
    <div className="space-y-3">
      <PageHeader title={t('pnl')} subtitle={`${range.from} → ${range.to}`} onBack={() => navigate('/reports')} />

      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'today', label: t('today') },
          { value: 'week', label: '7 din' },
          { value: 'month', label: t('thisMonth') },
        ]}
      />

      {kind === 'month' && (
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
      )}

      <Card className="bg-brand-700 text-white">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-100">{t('grossProfit')}</p>
        <p className="font-display text-4xl font-extrabold">{formatPaise(pnl?.gross_profit_paise ?? 0)}</p>
        <p className="mt-1 text-xs text-brand-100">
          {t('revenue')} {formatPaise(pnl?.revenue_paise ?? 0)} · {pnl?.bills ?? 0} {t('bills')}
        </p>
      </Card>

      <Card className="space-y-1">
        <Row label={t('revenue')} value={formatPaise(pnl?.revenue_paise ?? 0)} bold />
        <Row label={t('cogs')} value={`− ${formatPaise(pnl?.cogs_paise ?? 0)}`} />
        <Divider className="my-1" />
        <Row label={t('grossProfit')} value={formatPaise(pnl?.gross_profit_paise ?? 0)} bold />
        <Row label={t('discount')} value={formatPaise(pnl?.discounts_paise ?? 0)} />
        <Row label={`${t('gst')} (pass-through)`} value={formatPaise(pnl?.gst_collected_paise ?? 0)} />
        <Row label={`${t('udhaar')} ${t('sales')}`} value={formatPaise(pnl?.udhaar_paise ?? 0)} />
      </Card>

      <p className="rounded-2xl bg-ink-100 p-3 text-[11px] leading-relaxed text-ink-500 dark:bg-ink-900 dark:text-ink-400">
        Profit = bill ka bikri amount − beche gaye saaman ki lagat (sale ke time ki purchase price). GST sirf collect hokar sarkar ko jaata hai, isliye profit me include nahi.
      </p>

      <Button block variant="secondary" onClick={exportPdf}>
        {t('exportPdf')}
      </Button>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className={bold ? 'font-bold text-ink-900 dark:text-ink-50' : 'text-ink-600 dark:text-ink-300'}>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-extrabold text-ink-900 dark:text-ink-50' : 'font-semibold text-ink-800 dark:text-ink-100'}`}>{value}</span>
    </div>
  )
}
