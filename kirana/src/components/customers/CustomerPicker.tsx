import { useEffect, useMemo, useState } from 'react'
import { Phone, Plus, Search, UserRound } from 'lucide-react'
import { db } from '../../lib/db'
import { useLive } from '../../hooks/useLive'
import { formatPaise } from '../../lib/money'
import type { Customer } from '../../types'
import { useApp } from '../../context/AppContext'
import { useT } from '../../i18n/useT'
import { Sheet } from '../ui/sheet'
import { Button } from '../ui/button'
import { Field, Input } from '../ui/form'
import { saveCustomer } from '../../data/khata'
import { Badge } from '../ui/card'

interface CustomerPickerProps {
  open: boolean
  onClose: () => void
  onSelect: (customer: Customer | null) => void
  selectedId?: string | null
  /** Hide the "walk-in" option when a customer is required (udhaar). */
  allowWalkIn?: boolean
}

export function CustomerPicker({ open, onClose, onSelect, selectedId, allowWalkIn = true }: CustomerPickerProps) {
  const { shop, user, toast } = useApp()
  const t = useT()
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [limit, setLimit] = useState('')
  const [busy, setBusy] = useState(false)

  const customers = useLive<Customer[]>(
    () => (shop ? db.customers.where('shop_id').equals(shop.id).toArray() : Promise.resolve([])),
    [shop?.id],
    [],
  )

  useEffect(() => {
    if (!open) {
      setQuery('')
      setAdding(false)
      setName('')
      setPhone('')
      setLimit('')
    }
  }, [open])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    const list = [...(customers ?? [])].sort((a, b) => b.balance_paise - a.balance_paise)
    if (!term) return list
    return list.filter(
      (customer) =>
        customer.name.toLowerCase().includes(term) || (customer.phone ?? '').includes(term),
    )
  }, [customers, query])

  const createCustomer = async () => {
    if (!shop || !user) return
    if (!name.trim()) {
      toast(t('requiredField'), 'error')
      return
    }
    if (phone && phone.replace(/\D/g, '').length !== 10) {
      toast(t('invalidPhone'), 'error')
      return
    }
    setBusy(true)
    try {
      const customer = await saveCustomer(
        shop.id,
        {
          name,
          phone: phone || null,
          address: null,
          credit_limit: Number(limit) || 0,
          notes: null,
        },
        user,
      )
      onSelect(customer)
      onClose()
      toast(`${customer.name} add ho gaya`, 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : t('somethingWrong'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('customer')}
      subtitle={adding ? t('addCustomer') : `${filtered.length} customers`}
      footer={
        adding ? (
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setAdding(false)}>
              {t('cancel')}
            </Button>
            <Button className="flex-1" loading={busy} onClick={createCustomer}>
              {t('save')}
            </Button>
          </div>
        ) : (
          <Button block size="lg" icon={<Plus className="h-5 w-5" />} onClick={() => setAdding(true)}>
            {t('addCustomer')}
          </Button>
        )
      }
    >
      {adding ? (
        <div className="space-y-3 pb-2">
          <Field label={t('fullName')} required>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ramesh Kumar" autoFocus />
          </Field>
          <Field label={t('customerPhone')} hint="Udhaar reminder WhatsApp par jayega">
            <Input
              value={phone}
              inputMode="numeric"
              maxLength={10}
              onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))}
              placeholder="98765 43210"
            />
          </Field>
          <Field label={`${t('creditLimit')} (₹)`} hint="0 = koi limit nahi">
            <Input
              value={limit}
              inputMode="numeric"
              onChange={(event) => setLimit(event.target.value.replace(/[^\d]/g, ''))}
              placeholder="2000"
            />
          </Field>
        </div>
      ) : (
        <div className="space-y-2 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`${t('search')} naam / mobile`}
              className="pl-9"
            />
          </div>

          {allowWalkIn && (
            <button
              type="button"
              onClick={() => {
                onSelect(null)
                onClose()
              }}
              className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-ink-200 p-3 text-left dark:border-ink-700"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-100 text-ink-500 dark:bg-ink-800">
                <UserRound className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-ink-800 dark:text-ink-100">{t('walkInCustomer')}</p>
                <p className="text-xs text-ink-500 dark:text-ink-400">Bina naam ka bill</p>
              </div>
            </button>
          )}

          <div className="divide-y divide-ink-100 dark:divide-ink-800">
            {filtered.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => {
                  onSelect(customer)
                  onClose()
                }}
                className={`flex w-full items-center gap-3 py-2.5 text-left ${
                  selectedId === customer.id ? 'opacity-100' : ''
                }`}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800 dark:bg-brand-900 dark:text-brand-100">
                  {customer.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{customer.name}</p>
                  <p className="flex items-center gap-1 text-xs text-ink-500 dark:text-ink-400">
                    <Phone className="h-3 w-3" /> {customer.phone ?? '—'}
                  </p>
                </div>
                <div className="text-right">
                  {customer.balance_paise > 0 ? (
                    <Badge tone="danger">{formatPaise(customer.balance_paise)}</Badge>
                  ) : (
                    <Badge tone="success">{t('settled')}</Badge>
                  )}
                  {customer.loyalty_points > 0 && (
                    <p className="mt-1 text-[10px] font-semibold text-saffron-700 dark:text-saffron-300">
                      {customer.loyalty_points} pts
                    </p>
                  )}
                </div>
              </button>
            ))}
            {!filtered.length && (
              <p className="py-6 text-center text-sm text-ink-500 dark:text-ink-300">{t('noCustomers')}</p>
            )}
          </div>
        </div>
      )}
    </Sheet>
  )
}
