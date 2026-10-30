import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { useLive } from '../hooks/useLive'
import { exportReportWorkbook, getGstReport, type GstReport } from '../data/reports'
import { addDays, istDateKey } from '../lib/date'
import { formatPaise, toRupees } from '../lib/money'
import { downloadReportPdf } from '../lib/reportPdf'
import { PageHeader } from '../components/layout/AppShell'
import { Card, Divider, StatCard } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/form'

export default function GstReportPage() {
  const { shop, toast } = useApp()
  const t = useT()
  const navigate = useNavigate()
  const [from, setFrom] = useState(`${istDateKey().slice(0, 7)}-01`)
  const [to, setTo] = useState(istDateKey())

  const report = useLive<GstReport | null>(
    () => (shop ? getGstReport(shop.id, from, to) : Promise.resolve(null)),
    [shop?.id, from, to],
    null,
  )

  const rows = report?.gstr1Summary ?? []
  const totals = useMemo(
    () => ({
      taxable: rows.reduce((sum, row) => sum + row.taxable_paise, 0),
      cgst: rows.reduce((sum, row) => sum + row.cgst_paise, 0),
      sgst: rows.reduce((sum, row) => sum + row.sgst_paise, 0),
      tax: rows.reduce((sum, row) => sum + row.total_tax_paise, 0),
    }),
    [rows],
  )

  const exportExcel = () => {
    if (!report) return
    exportReportWorkbook(
      [
        {
          name: 'GSTR-1 Summary',
          rows: [
            ['Rate %', 'Taxable value', 'CGST', 'SGST', 'Total tax', 'Invoices'],
            ...rows.map((row) => [row.rate, toRupees(row.taxable_paise), toRupees(row.cgst_paise), toRupees(row.sgst_paise), toRupees(row.total_tax_paise), row.invoices]),
            ['Total', toRupees(totals.taxable), toRupees(totals.cgst), toRupees(totals.sgst), toRupees(totals.tax), ''],
          ],
        },
        {
          name: 'B2C Invoices',
          rows: [
            ['Bill no', 'Date', 'Rate %', 'Taxable', 'Tax', 'Invoice value'],
            ...report.b2cRows.map((row) => [row.bill_no, row.date.slice(0, 10), row.rate, toRupees(row.taxable_paise), toRupees(row.tax_paise), toRupees(row.total_paise)]),
          ],
        },
      ],
      `gst-report-${from}-${to}`,
    )
    toast('GST Excel download ho gaya', 'success')
  }

  const exportPdf = () => {
    if (!report || !shop) return
    downloadReportPdf({
      shopName: shop.name,
      title: 'GST Summary (GSTR-1 ready)',
      subtitle: `${from} to ${to}${shop.gstin ? ` · GSTIN ${shop.gstin}` : ''}`,
      filename: `gst-${from}-${to}`,
      sections: [
        {
          heading: 'Rate-wise summary',
          columns: ['Rate %', 'Taxable', 'CGST', 'SGST', 'Total tax', 'Invoices'],
          widths: [0.7, 1.4, 1, 1, 1.2, 0.8],
          rows: rows.map((row) => [
            `${row.rate}%`,
            toRupees(row.taxable_paise).toFixed(2),
            toRupees(row.cgst_paise).toFixed(2),
            toRupees(row.sgst_paise).toFixed(2),
            toRupees(row.total_tax_paise).toFixed(2),
            row.invoices,
          ]),
        },
      ],
      footer: 'B2C supply summary. Verify with your CA before GSTR-1 filing.',
    })
  }

  return (
    <div className="space-y-3">
      <PageHeader title={t('gstReport')} subtitle={t('gstReportHint')} onBack={() => navigate('/reports')} />

      <div className="grid grid-cols-2 gap-2">
        <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => { setFrom(istDateKey()); setTo(istDateKey()) }}>
          {t('today')}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => { setFrom(`${istDateKey().slice(0, 7)}-01`); setTo(istDateKey()) }}>
          {t('thisMonth')}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => { setFrom(addDays(istDateKey(), -29)); setTo(istDateKey()) }}>
          30 din
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatCard label={t('taxableValue')} value={formatPaise(totals.taxable)} tone="brand" />
        <StatCard label={`CGST + SGST`} value={formatPaise(totals.tax)} hint={`${formatPaise(totals.cgst)} + ${formatPaise(totals.sgst)}`} />
      </div>

      <Card className="p-0">
        <div className="grid grid-cols-6 gap-1 bg-ink-100 px-3 py-2 text-[10px] font-bold uppercase text-ink-500 dark:bg-ink-800 dark:text-ink-300">
          <span>Rate</span>
          <span className="col-span-2 text-right">{t('taxableValue')}</span>
          <span className="text-right">CGST</span>
          <span className="text-right">SGST</span>
          <span className="text-right">{t('bills')}</span>
        </div>
        {rows.map((row) => (
          <div key={row.rate} className="grid grid-cols-6 gap-1 border-b border-ink-100 px-3 py-2 text-xs last:border-0 dark:border-ink-800">
            <span className="font-bold text-ink-900 dark:text-ink-50">{row.rate}%</span>
            <span className="col-span-2 text-right tabular-nums text-ink-700 dark:text-ink-200">{formatPaise(row.taxable_paise)}</span>
            <span className="text-right tabular-nums text-ink-700 dark:text-ink-200">{formatPaise(row.cgst_paise)}</span>
            <span className="text-right tabular-nums text-ink-700 dark:text-ink-200">{formatPaise(row.sgst_paise)}</span>
            <span className="text-right tabular-nums text-ink-500">{row.invoices}</span>
          </div>
        ))}
        {!rows.length && <p className="p-4 text-center text-sm text-ink-500">Is period mein koi bill nahi</p>}
        <Divider />
        <div className="grid grid-cols-6 gap-1 px-3 py-2 text-xs font-extrabold">
          <span>{t('total')}</span>
          <span className="col-span-2 text-right tabular-nums">{formatPaise(totals.taxable)}</span>
          <span className="text-right tabular-nums">{formatPaise(totals.cgst)}</span>
          <span className="text-right tabular-nums">{formatPaise(totals.sgst)}</span>
          <span />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" icon={<FileSpreadsheet className="h-4 w-4" />} onClick={exportExcel}>
          {t('exportExcel')}
        </Button>
        <Button variant="secondary" icon={<FileText className="h-4 w-4" />} onClick={exportPdf}>
          {t('exportPdf')}
        </Button>
      </div>

      <p className="rounded-2xl bg-ink-100 p-3 text-[11px] leading-relaxed text-ink-500 dark:bg-ink-900 dark:text-ink-400">
        ℹ️ Ye B2C summary hai. GST portal par filing ke liye apne CA se verify karein. GSTIN: {shop?.gstin ?? 'set nahi hai'}.
      </p>
    </div>
  )
}
