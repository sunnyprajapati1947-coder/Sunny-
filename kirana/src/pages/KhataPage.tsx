import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { MessageCircle, Phone, Plus, Search, Users } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { db } from '../lib/db'
import { useLive } from '../hooks/useLive'
import { formatPaise, formatPaiseCompact } from '../lib/money'
import { reminderWhatsAppLink } from '../data/khata'
import type { Customer } from '../types'
import { Badge, Card, EmptyState, StatCard } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/form'
import { CustomerPicker } from '../components/customers/CustomerPicker'

export default function KhataPage() {
  const { shop } = useApp()
  const t = useT()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [sort, setSort] = useState<'due' | 'name'>('due')

  const customers = useLive<Customer[]>(
    () => (shop ? db.customers.where('shop_id').equals(shop.id).toArray() : Promise.resolve([])),
    [shop?.id],
    [],
  )

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    const list = (customers ?? []).filter(
      (customer) => !term || customer.name.toLowerCase().includes(term) || (customer.phone ?? '').includes(term),
    )
    return list.sort((a, b) =>
      sort === 'due' ? b.balance_paise - a.balance_paise : a.name.localeCompare(b.name),
    )
  }, [customers, query, sort])

  const totalDue = (customers ?? []).reduce((sum, customer) => sum + customer.balance_paise, 0)
  const withDue = (customers ?? []).filter((customer) => customer.balance_paise > 0)

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink-900 dark:text-ink-50">{t('khata')}</h1>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            {withDue.length} customers · {t('pendingUdhaar')}
          </p>
        </div>
        <Button size="md" icon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
          {t('addCustomer')}
        </Button>
      </div>

      <StatCard label={t('totalDue')} value={formatPaise(totalDue)} tone="warning" icon={<Users className="h-5 w-5" />} />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`${t('search')} naam / mobile`}
          className="pl-9"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setSort('due')}
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${
            sort === 'due' ? 'bg-brand-700 text-white' : 'bg-white text-ink-600 shadow-sm dark:bg-ink-900 dark:text-ink-200'
          }`}
        >
          {t('due')} ↓
        </button>
        <button
          type="button"
          onClick={() => setSort('name')}
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${
            sort === 'name' ? 'bg-brand-700 text-white' : 'bg-white text-ink-600 shadow-sm dark:bg-ink-900 dark:text-ink-200'
          }`}
        >
          {t('fullName')} A–Z
        </button>
      </div>

      <div className="space-y-2">
        {filtered.map((customer) => {
          const overLimit = customer.credit_limit_paise > 0 && customer.balance_paise > customer.credit_limit_paise
          return (
            <div
              key={customer.id}
              className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-card dark:bg-ink-900"
            >
              <button
                type="button"
                onClick={() => navigate(`/khata/${customer.id}`)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 font-display text-lg font-extrabold text-brand-800 dark:bg-brand-900 dark:text-brand-100">
                  {customer.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{customer.name}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-ink-500 dark:text-ink-400">
                    <Phone className="h-3 w-3" /> {customer.phone ?? '—'}
                    {customer.loyalty_points > 0 && <span className="ml-1">⭐ {customer.loyalty_points}</span>}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`font-display text-lg font-extrabold tabular-nums ${
                      customer.balance_paise > 0 ? 'text-red-600 dark:text-red-400' : 'text-brand-700 dark:text-brand-300'
                    }`}
                  >
                    {customer.balance_paise > 0 ? formatPaiseCompact(customer.balance_paise) : '₹0'}
                  </p>
                  {overLimit ? (
                    <Badge tone="danger">{t('overdue')}</Badge>
                  ) : customer.balance_paise > 0 ? (
                    <p className="text-[10px] font-semibold text-ink-400">
                      {t('creditLimit')} {formatPaiseCompact(customer.credit_limit_paise)}
                    </p>
                  ) : (
                    <Badge tone="success">{t('settled')}</Badge>
                  )}
                </div>
              </button>
              {customer.balance_paise > 0 && (
                <a
                  href={reminderWhatsAppLink(customer, shop?.name ?? '', shop?.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('sendReminder')}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#25D366] text-white"
                >
                  <MessageCircle className="h-5 w-5" />
                </a>
              )}
            </div>
          )
        })}
      </div>

      {!filtered.length && (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title={t('noCustomers')}
          body={t('noCustomersHint')}
          action={<Button onClick={() => setAddOpen(true)}>{t('addCustomer')}</Button>}
        />
      )}

      <Card className="bg-brand-50/60 dark:bg-brand-950/20">
        <p className="text-xs font-semibold text-brand-900 dark:text-brand-100">
          💡 Udhaar dene par credit limit check hoti hai. Limit badhane ke liye customer kholein.
        </p>
      </Card>

      <CustomerPicker
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSelect={(customer) => {
          if (customer) navigate(`/khata/${customer.id}`)
        }}
        allowWalkIn={false}
      />
    </div>
  )
}
