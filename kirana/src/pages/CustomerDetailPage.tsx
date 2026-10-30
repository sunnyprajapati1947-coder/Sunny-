import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Phone, Settings2, Wallet } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { db } from '../lib/db'
import { useLive } from '../hooks/useLive'
import { formatDate, formatDateTime } from '../lib/date'
import { formatPaise, toPaise } from '../lib/money'
import { addManualUdhaar, customerLedger, recordRepayment, reminderWhatsAppLink, saveCustomer, smsReminderLink } from '../data/khata'
import type { Customer, LedgerEntry } from '../types'
import { PageHeader } from '../components/layout/AppShell'
import { Badge, Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Field, Input, MoneyInput, Select } from '../components/ui/form'
import { Sheet } from '../components/ui/sheet'
import { useConfirm } from '../components/ui/feedback'

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { shop, user, toast } = useApp()
  const t = useT()
  const confirm = useConfirm()

  const customer = useLive<Customer | null>(
    () => (id ? db.customers.get(id).then((row) => row ?? null) : Promise.resolve(null)),
    [id],
    null,
  )
  const ledger = useLive<LedgerEntry[]>(() => (id ? customerLedger(id) : Promise.resolve([])), [id], [])

  const [payOpen, setPayOpen] = useState(false)
  const [udhaarOpen, setUdhaarOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [amount, setAmount] = useState(0)
  const [mode, setMode] = useState<'cash' | 'upi' | 'card'>('cash')
  const [note, setNote] = useState('')
  const [limit, setLimit] = useState('')
  const [busy, setBusy] = useState(false)

  const paidTotal = useMemo(
    () => (ledger ?? []).filter((entry) => entry.entry_type === 'payment').reduce((sum, entry) => sum + Math.abs(entry.amount_paise), 0),
    [ledger],
  )

  if (!customer) {
    return (
      <div>
        <PageHeader title={t('khata')} onBack={() => navigate('/khata')} />
        <p className="py-10 text-center text-sm text-ink-500">{t('loading')}</p>
      </div>
    )
  }

  const collect = async () => {
    if (!user || !shop) return
    if (amount <= 0) {
      toast(t('invalidNumber'), 'error')
      return
    }
    setBusy(true)
    try {
      await recordRepayment(customer.id, amount, mode, user, note || undefined)
      toast(`${formatPaise(amount)} ${t('paymentReceived')}`, 'success')
      setPayOpen(false)
      setAmount(0)
      setNote('')
    } catch (error) {
      toast(error instanceof Error ? error.message : t('somethingWrong'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const addUdhaar = async () => {
    if (!user) return
    if (amount <= 0) {
      toast(t('invalidNumber'), 'error')
      return
    }
    setBusy(true)
    try {
      await addManualUdhaar(customer.id, amount, user, note || 'Manual udhaar')
      toast(`${formatPaise(amount)} udhaar jod diya`, 'success')
      setUdhaarOpen(false)
      setAmount(0)
      setNote('')
    } catch (error) {
      toast(error instanceof Error ? error.message : t('somethingWrong'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const saveLimit = async () => {
    if (!user || !shop) return
    setBusy(true)
    try {
      await saveCustomer(
        shop.id,
        {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
          credit_limit: Number(limit) || 0,
          notes: customer.notes,
        },
        user,
      )
      toast(t('saved'), 'success')
      setEditOpen(false)
    } catch (error) {
      toast(error instanceof Error ? error.message : t('somethingWrong'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title={customer.name}
        subtitle={customer.phone ?? '—'}
        onBack={() => navigate('/khata')}
        action={
          <Button
            size="sm"
            variant="secondary"
            icon={<Settings2 className="h-4 w-4" />}
            onClick={() => {
              setLimit(String(customer.credit_limit_paise / 100 || ''))
              setEditOpen(true)
            }}
          >
            {t('edit')}
          </Button>
        }
      />

      <Card className="bg-brand-700 text-white">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-100">{t('totalDue')}</p>
        <p className="font-display text-4xl font-extrabold leading-tight">{formatPaise(customer.balance_paise)}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-white/15 px-2.5 py-1">
            {t('creditLimit')}: {customer.credit_limit_paise ? formatPaise(customer.credit_limit_paise) : '—'}
          </span>
          <span className="rounded-full bg-white/15 px-2.5 py-1">⭐ {customer.loyalty_points} pts</span>
          <span className="rounded-full bg-white/15 px-2.5 py-1">
            {t('paymentHistory')}: {formatPaise(paidTotal)}
          </span>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Button
          size="lg"
          variant="success"
          icon={<Wallet className="h-5 w-5" />}
          onClick={() => {
            setAmount(customer.balance_paise)
            setPayOpen(true)
          }}
          disabled={customer.balance_paise <= 0}
        >
          {t('recordPayment')}
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={() => {
            setAmount(0)
            setUdhaarOpen(true)
          }}
        >
          {t('addUdhaar')}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <a
          href={reminderWhatsAppLink(customer, shop?.name ?? '', shop?.phone)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#25D366] text-sm font-bold text-white"
        >
          <Phone className="h-4 w-4" /> WhatsApp
        </a>
        <a
          href={smsReminderLink(customer, shop?.name ?? '')}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-ink-200 text-sm font-bold text-ink-800 dark:border-ink-700 dark:text-ink-100"
        >
          SMS {t('sendReminder')}
        </a>
      </div>

      <div>
        <p className="mb-2 font-display text-base font-bold text-ink-900 dark:text-ink-50">{t('ledger')}</p>
        <Card className="divide-y divide-ink-100 p-0 dark:divide-ink-800">
          {(ledger ?? []).map((entry) => {
            const isPayment = entry.entry_type === 'payment'
            return (
              <div key={entry.id} className="flex items-start gap-3 p-3">
                <span
                  className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg text-sm ${
                    isPayment
                      ? 'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200'
                      : 'bg-saffron-100 text-saffron-700 dark:bg-saffron-900/50 dark:text-saffron-200'
                  }`}
                >
                  {isPayment ? '↓' : '↑'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                    {entry.note ?? entry.entry_type}
                  </p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {formatDateTime(entry.created_at)} · {entry.reference_type ?? '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`font-bold tabular-nums ${isPayment ? 'text-brand-700 dark:text-brand-300' : 'text-red-600 dark:text-red-400'}`}>
                    {isPayment ? '−' : '+'} {formatPaise(Math.abs(entry.amount_paise))}
                  </p>
                  <p className="text-[10px] text-ink-400">{formatPaise(entry.balance_after_paise)}</p>
                </div>
              </div>
            )
          })}
          {!ledger?.length && <p className="p-4 text-center text-sm text-ink-500">{t('none')}</p>}
        </Card>
      </div>

      <p className="text-center text-[11px] text-ink-400">Customer since {formatDate(customer.created_at)}</p>

      {/* Collect payment */}
      <Sheet
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={t('recordPayment')}
        subtitle={customer.name}
        footer={
          <Button block size="lg" loading={busy} onClick={collect}>
            {t('save')} · {formatPaise(amount)}
          </Button>
        }
      >
        <div className="space-y-3 pb-2">
          <Field label={t('amount')}>
            <MoneyInput valuePaise={amount} onChangePaise={setAmount} autoFocus />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            {[customer.balance_paise, Math.round(customer.balance_paise / 2), 50000].map((value, index) => (
              <button
                key={`${value}-${index}`}
                type="button"
                onClick={() => setAmount(Math.min(customer.balance_paise, value))}
                className="h-11 rounded-xl bg-ink-100 text-sm font-bold dark:bg-ink-800"
              >
                {index === 0 ? 'Full' : formatPaise(value)}
              </button>
            ))}
          </div>
          <Field label={t('paymentMode')}>
            <Select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
              <option value="cash">{t('cash')}</option>
              <option value="upi">{t('upi')}</option>
              <option value="card">{t('card')}</option>
            </Select>
          </Field>
          <Field label={t('addNote')}>
            <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Cash jama" />
          </Field>
        </div>
      </Sheet>

      {/* Add udhaar */}
      <Sheet
        open={udhaarOpen}
        onClose={() => setUdhaarOpen(false)}
        title={t('addUdhaar')}
        subtitle={`${t('creditLimit')}: ${customer.credit_limit_paise ? formatPaise(customer.credit_limit_paise) : '—'}`}
        footer={
          <Button block size="lg" loading={busy} onClick={addUdhaar}>
            {t('save')}
          </Button>
        }
      >
        <div className="space-y-3 pb-2">
          <Field label={t('amount')}>
            <MoneyInput valuePaise={amount} onChangePaise={setAmount} autoFocus />
          </Field>
          <Field label={t('addNote')}>
            <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Purana hisab" />
          </Field>
          {customer.credit_limit_paise > 0 && customer.balance_paise + amount > customer.credit_limit_paise && (
            <p className="rounded-xl bg-red-50 p-2.5 text-xs font-bold text-red-700 dark:bg-red-950/40 dark:text-red-200">
              {t('creditLimitExceeded')} — {formatPaise(customer.credit_limit_paise)}
            </p>
          )}
        </div>
      </Sheet>

      {/* Edit limit */}
      <Sheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={t('creditLimit')}
        subtitle={customer.name}
        footer={
          <Button block loading={busy} onClick={saveLimit}>
            {t('save')}
          </Button>
        }
      >
        <div className="space-y-3 pb-2">
          <Field label={t('creditLimit')} hint="0 = koi limit nahi">
            <Input value={limit} inputMode="numeric" onChange={(event) => setLimit(event.target.value.replace(/\D/g, ''))} />
          </Field>
          <Button
            block
            variant="ghost"
            onClick={async () => {
              const ok = await confirm({ title: t('confirmDelete'), body: customer.name, tone: 'danger' })
              if (!ok) return
              toast('Customer delete karne ke liye support se sampark karein', 'info')
            }}
          >
            {t('delete')} {t('customer')}
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
