import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, TriangleAlert } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { useLive } from '../hooks/useLive'
import { getDayClose, type DayCloseReport } from '../data/reports'
import { formatDate, istDateKey } from '../lib/date'
import { formatPaise } from '../lib/money'
import { writeAudit } from '../data/audit'
import { setMeta, getMeta } from '../lib/db'
import { PageHeader } from '../components/layout/AppShell'
import { Card, Divider, StatCard } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input, MoneyInput } from '../components/ui/form'

export default function DayClosePage() {
  const { shop, user, toast } = useApp()
  const t = useT()
  const navigate = useNavigate()
  const [date, setDate] = useState(istDateKey())
  const [actualCash, setActualCash] = useState(0)
  const [saved, setSaved] = useState<{ actual: number; expected: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const report = useLive<DayCloseReport | null>(
    () => (shop ? getDayClose(shop.id, date) : Promise.resolve(null)),
    [shop?.id, date],
    null,
  )

  useEffect(() => {
    if (!shop) return
    void getMeta<{ actual: number; expected: number } | null>(`dayclose:${shop.id}:${date}`, null).then((value) => {
      setSaved(value)
      setActualCash(value?.actual ?? 0)
    })
  }, [shop, date])

  const expected = report?.expectedCash_paise ?? 0
  const mismatch = actualCash - expected

  const save = async () => {
    if (!shop || !user) return
    setBusy(true)
    try {
      await setMeta(`dayclose:${shop.id}:${date}`, { actual: actualCash, expected, saved_at: new Date().toISOString() })
      await writeAudit({
        shopId: shop.id,
        actor: user,
        entity: 'day_close',
        entityId: `${shop.id}:${date}`,
        action: 'day_close',
        newValue: { date, expected_cash_paise: expected, actual_cash_paise: actualCash, mismatch_paise: mismatch },
      })
      setSaved({ actual: actualCash, expected })
      toast('Din ka hisab save ho gaya', 'success')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader title={t('dayClose')} subtitle={formatDate(date)} onBack={() => navigate('/reports')} />

      <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} max={istDateKey()} />

      <div className="grid grid-cols-2 gap-2">
        <StatCard label={t('sales')} value={formatPaise(report?.totalSales_paise ?? 0)} tone="brand" hint={`${report?.bills ?? 0} ${t('bills')}`} />
        <StatCard label={t('expectedCash')} value={formatPaise(expected)} hint={`${report?.cashSales_paise ? formatPaise(report.cashSales_paise) : '₹0'} cash sales`} />
      </div>

      <Card className="space-y-1.5">
        <Row label={`${t('cash')} ${t('sales')}`} value={formatPaise(report?.cashSales_paise ?? 0)} />
        <Row label={`${t('upi')} + ${t('card')}`} value={formatPaise((report?.upi_paise ?? 0) + (report?.card_paise ?? 0))} />
        <Row label={`${t('udhaar')} ${t('sales')}`} value={formatPaise(report?.udhaar_paise ?? 0)} />
        <Divider className="my-1" />
        <Row label="Cash repayments" value={`+ ${formatPaise(report?.cashRepayments_paise ?? 0)}`} />
        <Row label="Cash purchases" value={`− ${formatPaise(report?.cashPurchases_paise ?? 0)}`} />
        <Divider className="my-1" />
        <Row label={t('expectedCash')} value={formatPaise(expected)} bold />
        {report && report.voidedBills > 0 && <Row label={t('voided')} value={`${report.voidedBills} · ${formatPaise(report.voidedValue_paise)}`} />}
      </Card>

      <Card className="space-y-2">
        <label className="text-sm font-semibold text-ink-700 dark:text-ink-200">{t('actualCash')}</label>
        <MoneyInput valuePaise={actualCash} onChangePaise={setActualCash} className="h-16 text-center font-display text-3xl font-extrabold" />
        <div
          className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm font-bold ${
            mismatch === 0
              ? 'bg-brand-100 text-brand-900 dark:bg-brand-900/50 dark:text-brand-100'
              : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200'
          }`}
        >
          <span className="flex items-center gap-1.5">
            {mismatch === 0 ? <CheckCircle2 className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
            {mismatch === 0 ? t('matched') : t('mismatch')}
          </span>
          <span className="font-display text-xl">{formatPaise(Math.abs(mismatch))}</span>
        </div>
        <Button block size="lg" loading={busy} onClick={save}>
          {t('saveDayClose')}
        </Button>
        {saved && (
          <p className="text-center text-[11px] text-ink-500 dark:text-ink-400">
            Saved: {formatPaise(saved.actual)} vs {formatPaise(saved.expected)}
          </p>
        )}
      </Card>

      <p className="rounded-2xl bg-ink-100 p-3 text-[11px] leading-relaxed text-ink-500 dark:bg-ink-900 dark:text-ink-400">
        Mismatch hone par reason note karein — din ka hisab audit log mein owner ke naam se save hota hai.
      </p>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className={bold ? 'font-bold text-ink-900 dark:text-ink-50' : 'text-ink-600 dark:text-ink-300'}>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-extrabold text-ink-900 dark:text-ink-50' : 'font-semibold text-ink-800 dark:text-ink-100'}`}>{value}</span>
    </div>
  )
}
