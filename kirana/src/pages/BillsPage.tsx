import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ReceiptText, Search } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { db } from '../lib/db'
import { useLive } from '../hooks/useLive'
import { formatDateTime } from '../lib/date'
import { formatPaise } from '../lib/money'
import type { Bill } from '../types'
import { Badge, Card, EmptyState } from '../components/ui/card'
import { Input, Segmented } from '../components/ui/form'

export default function BillsPage() {
  const { shop } = useApp()
  const t = useT()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'paid' | 'void'>('all')

  const bills = useLive<Bill[]>(
    () => (shop ? db.bills.where('shop_id').equals(shop.id).filter((b) => b.status !== 'held').toArray() : Promise.resolve([])),
    [shop?.id],
    [],
  )

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return (bills ?? [])
      .filter((bill) => (filter === 'all' ? true : filter === 'void' ? bill.status === 'void' : bill.status === 'paid'))
      .filter(
        (bill) =>
          !term ||
          bill.bill_no.toLowerCase().includes(term) ||
          (bill.customer_name ?? '').toLowerCase().includes(term) ||
          (bill.customer_phone ?? '').includes(term),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 200)
  }, [bills, query, filter])

  const total = filtered.reduce((sum, bill) => (bill.status === 'paid' ? sum + bill.total_paise : sum), 0)

  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-ink-900 dark:text-ink-50">{t('bills')}</h1>
        <p className="text-xs text-ink-500 dark:text-ink-400">
          {filtered.length} {t('bills')} · {formatPaise(total)}
        </p>
      </div>

      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: t('all') },
          { value: 'paid', label: 'Paid' },
          { value: 'void', label: t('voided') },
        ]}
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Bill no / customer" className="pl-9" />
      </div>

      <div className="space-y-2">
        {filtered.map((bill) => (
          <button
            key={bill.id}
            type="button"
            onClick={() => navigate(`/bills/${bill.id}`)}
            className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-card dark:bg-ink-900"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-200">
              <ReceiptText className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{bill.bill_no}</p>
              <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                {formatDateTime(bill.created_at)} · {bill.customer_name ?? t('walkInCustomer')}
              </p>
            </div>
            <div className="text-right">
              <p className="font-bold tabular-nums text-ink-900 dark:text-ink-50">{formatPaise(bill.total_paise)}</p>
              {bill.status === 'void' ? (
                <Badge tone="danger">{t('voided')}</Badge>
              ) : bill.payment_status === 'pending' ? (
                <Badge tone="warning">{t('udhaar')}</Badge>
              ) : (
                <Badge tone="success">{bill.payment_status.toUpperCase()}</Badge>
              )}
            </div>
          </button>
        ))}
      </div>

      {!filtered.length && (
        <Card>
          <EmptyState icon={<ReceiptText className="h-10 w-10" />} title={t('noProducts')} body={t('bills') + ' —'} />
        </Card>
      )}
    </div>
  )
}
