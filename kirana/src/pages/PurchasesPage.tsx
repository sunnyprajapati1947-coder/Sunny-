import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Truck } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { db } from '../lib/db'
import { useLive } from '../hooks/useLive'
import { formatDateTime } from '../lib/date'
import { formatPaise, toPaise } from '../lib/money'
import { paySupplier } from '../data/purchases'
import type { Purchase, Supplier } from '../types'
import { PageHeader } from '../components/layout/AppShell'
import { Badge, Card, EmptyState } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Field, MoneyInput } from '../components/ui/form'
import { Sheet } from '../components/ui/sheet'

export default function PurchasesPage() {
  const { shop, user, toast } = useApp()
  const t = useT()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'purchases' | 'suppliers'>('suppliers')
  const [payFor, setPayFor] = useState<Supplier | null>(null)
  const [amount, setAmount] = useState(0)
  const [busy, setBusy] = useState(false)

  const purchases = useLive<Purchase[]>(
    () => (shop ? db.purchases.where('shop_id').equals(shop.id).toArray() : Promise.resolve([])),
    [shop?.id],
    [],
  )
  const suppliers = useLive<Supplier[]>(
    () => (shop ? db.suppliers.where('shop_id').equals(shop.id).toArray() : Promise.resolve([])),
    [shop?.id],
    [],
  )

  const totalDue = (suppliers ?? []).reduce((sum, row) => sum + row.balance_paise, 0)

  const pay = async () => {
    if (!user || !payFor) return
    setBusy(true)
    try {
      await paySupplier(payFor.id, amount, user)
      toast(`${formatPaise(amount)} paid`, 'success')
      setPayFor(null)
      setAmount(0)
    } catch (error) {
      toast(error instanceof Error ? error.message : t('somethingWrong'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title={t('purchases')}
        subtitle={`Supplier due: ${formatPaise(totalDue)}`}
        onBack={() => navigate('/more')}
        action={
          <Button size="sm" onClick={() => navigate('/purchases/new')}>
            {t('purchaseEntry')}
          </Button>
        }
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('suppliers')}
          className={`h-11 flex-1 rounded-2xl text-sm font-bold ${
            tab === 'suppliers' ? 'bg-brand-700 text-white' : 'bg-white text-ink-600 shadow-sm dark:bg-ink-900 dark:text-ink-200'
          }`}
        >
          {t('suppliers')} ({(suppliers ?? []).length})
        </button>
        <button
          type="button"
          onClick={() => setTab('purchases')}
          className={`h-11 flex-1 rounded-2xl text-sm font-bold ${
            tab === 'purchases' ? 'bg-brand-700 text-white' : 'bg-white text-ink-600 shadow-sm dark:bg-ink-900 dark:text-ink-200'
          }`}
        >
          {t('purchases')} ({(purchases ?? []).length})
        </button>
      </div>

      {tab === 'suppliers' ? (
        <div className="space-y-2">
          {(suppliers ?? []).map((supplier) => (
            <Card key={supplier.id} className="flex items-center gap-3 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-100 dark:bg-ink-800">
                <Truck className="h-5 w-5 text-ink-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{supplier.name}</p>
                <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                  {supplier.phone ?? '—'} {supplier.company ? `· ${supplier.company}` : ''}
                </p>
              </div>
              <div className="text-right">
                <Badge tone={supplier.balance_paise > 0 ? 'danger' : 'success'}>{formatPaise(supplier.balance_paise)}</Badge>
                {supplier.balance_paise > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setPayFor(supplier)
                      setAmount(supplier.balance_paise)
                    }}
                    className="mt-1 block text-[11px] font-bold text-brand-700 dark:text-brand-300"
                  >
                    {t('paySupplier')}
                  </button>
                )}
              </div>
            </Card>
          ))}
          {!suppliers?.length && (
            <EmptyState
              icon={<Truck className="h-10 w-10" />}
              title={t('noCustomers')}
              body={t('addSupplier')}
              action={<Button onClick={() => navigate('/purchases/new')}>{t('addSupplier')}</Button>}
            />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {(purchases ?? [])
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map((purchase) => (
              <Card key={purchase.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{purchase.purchase_no}</p>
                  <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                    {purchase.supplier_name ?? '—'} · {formatDateTime(purchase.created_at)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold tabular-nums text-ink-900 dark:text-ink-50">{formatPaise(purchase.total_paise)}</p>
                  <Badge tone={purchase.status === 'paid' ? 'success' : purchase.status === 'partial' ? 'warning' : 'danger'}>
                    {purchase.status.toUpperCase()}
                  </Badge>
                </div>
              </Card>
            ))}
          {!purchases?.length && <EmptyState icon={<Truck className="h-10 w-10" />} title={t('purchases')} body={t('purchaseEntry')} />}
        </div>
      )}

      <Sheet
        open={Boolean(payFor)}
        onClose={() => setPayFor(null)}
        title={t('paySupplier')}
        subtitle={payFor?.name}
        footer={
          <Button block loading={busy} onClick={pay}>
            {t('save')} · {formatPaise(amount)}
          </Button>
        }
      >
        <div className="space-y-3 pb-2">
          <Field label={t('amount')}>
            <MoneyInput valuePaise={amount} onChangePaise={setAmount} autoFocus />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setAmount(payFor?.balance_paise ?? 0)}>
              Full
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setAmount(toPaise(500))}>
              ₹500
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
