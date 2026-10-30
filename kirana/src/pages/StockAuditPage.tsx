import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, ClipboardCheck, Plus, ScanBarcode } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { db } from '../lib/db'
import { useLive } from '../hooks/useLive'
import { formatDateTime } from '../lib/date'
import { closeStockAudit, startStockAudit, upsertAuditCount } from '../data/purchases'
import { scanFeedback } from '../lib/audio'
import type { Product, StockAudit, StockAuditItem } from '../types'
import { PageHeader } from '../components/layout/AppShell'
import { Badge, Card, EmptyState } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/form'
import { Sheet } from '../components/ui/sheet'
import { ScanPanel } from '../components/billing/ScanPanel'
import { useConfirm } from '../components/ui/feedback'

export default function StockAuditPage() {
  const { shop, user, toast } = useApp()
  const t = useT()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const [scanOpen, setScanOpen] = useState(false)
  const [selected, setSelected] = useState<Product | null>(null)
  const [counted, setCounted] = useState('')
  const [auditName, setAuditName] = useState('')

  const audits = useLive<StockAudit[]>(
    () => (shop ? db.stock_audits.where('shop_id').equals(shop.id).toArray() : Promise.resolve([])),
    [shop?.id],
    [],
  )
  const activeAudit = useMemo(() => (audits ?? []).find((audit) => audit.status === 'open') ?? null, [audits])

  const items = useLive<StockAuditItem[]>(
    () => (activeAudit ? db.stock_audit_items.where('audit_id').equals(activeAudit.id).toArray() : Promise.resolve([])),
    [activeAudit?.id],
    [],
  )
  const products = useLive<Product[]>(
    () => (shop ? db.products.where('shop_id').equals(shop.id).toArray() : Promise.resolve([])),
    [shop?.id],
    [],
  )

  const differences = (items ?? []).filter((item) => item.counted_qty !== item.system_qty)
  const diffValuePaise = differences.reduce((sum, item) => {
    const product = (products ?? []).find((row) => row.id === item.product_id)
    return sum + Math.round((item.counted_qty - item.system_qty) * (product?.purchase_price_paise ?? 0))
  }, 0)

  const begin = async () => {
    if (!user || !shop) return
    const audit = await startStockAudit(shop.id, auditName || `Audit ${new Date().toLocaleDateString('en-IN')}`, user)
    setAuditName('')
    toast(`${audit.name} shuru`, 'success')
    setScanOpen(true)
  }

  const handleScan = async (code: string) => {
    if (!shop) return
    const product = await db.products.where('shop_id').equals(shop.id).filter((p) => p.barcode === code).first()
    if (!product) {
      scanFeedback(false)
      toast(`Barcode ${code} nahi mila`, 'error')
      return
    }
    scanFeedback(true)
    setSelected(product)
    const existing = (items ?? []).find((item) => item.product_id === product.id)
    setCounted(existing ? String(existing.counted_qty) : String(product.stock_qty))
    setScanOpen(false)
  }

  const saveCount = async () => {
    if (!activeAudit || !selected) return
    const qty = Number(counted)
    if (!Number.isFinite(qty) || qty < 0) {
      toast(t('invalidNumber'), 'error')
      return
    }
    await upsertAuditCount(activeAudit.id, selected, qty)
    setSelected(null)
    toast(`${selected.name_hi}: ${qty} ${selected.unit}`, 'success')
    setScanOpen(true)
  }

  const finish = async (apply: boolean) => {
    if (!activeAudit || !user) return
    const ok = await confirm({
      title: t('closeAudit'),
      body: apply
        ? `${differences.length} items ka stock system ke hisaab se set hoga.`
        : 'Audit bina stock badle band hoga.',
      confirmLabel: t('confirm'),
    })
    if (!ok) return
    const adjusted = await closeStockAudit(activeAudit.id, user, apply)
    toast(`${adjusted} items ${t('stockAdjusted')}`, 'success')
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title={t('stockAudit')}
        subtitle={activeAudit?.name ?? t('stockAuditHint')}
        onBack={() => navigate('/inventory')}
        action={
          activeAudit ? (
            <Badge tone="warning">OPEN</Badge>
          ) : (
            <Button size="sm" onClick={begin} icon={<Plus className="h-4 w-4" />}>
              {t('startAudit')}
            </Button>
          )
        }
      />

      {!activeAudit && (
        <Card className="space-y-3">
          <ScanBarcode className="mx-auto h-10 w-10 text-ink-300" />
          <p className="text-center text-sm text-ink-600 dark:text-ink-300">{t('stockAuditHint')}</p>
          <Input value={auditName} onChange={(event) => setAuditName(event.target.value)} placeholder="Audit ka naam (e.g. Sunday ginti)" />
          <Button block size="lg" onClick={begin} icon={<ClipboardCheck className="h-5 w-5" />}>
            {t('startAudit')}
          </Button>
        </Card>
      )}

      {activeAudit && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Card className="p-3 text-center">
              <p className="text-xs font-semibold text-ink-500">{t('counted')}</p>
              <p className="font-display text-2xl font-extrabold">{items?.length ?? 0}</p>
            </Card>
            <Card className="p-3 text-center">
              <p className="text-xs font-semibold text-ink-500">{t('difference')}</p>
              <p className="font-display text-2xl font-extrabold text-saffron-700">{differences.length}</p>
            </Card>
            <Card className="p-3 text-center">
              <p className="text-xs font-semibold text-ink-500">Value</p>
              <p className="font-display text-2xl font-extrabold">₹{Math.abs(diffValuePaise / 100).toFixed(0)}</p>
            </Card>
          </div>

          <Button block size="lg" variant="success" icon={<ScanBarcode className="h-5 w-5" />} onClick={() => setScanOpen(true)}>
            {t('scanItem')}
          </Button>

          <Card className="p-0">
            {(items ?? []).map((item) => {
              const diff = Math.round((item.counted_qty - item.system_qty) * 1000) / 1000
              return (
                <div key={item.id} className="flex items-center gap-2 border-b border-ink-100 p-3 last:border-0 dark:border-ink-800">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{item.product_name}</p>
                    <p className="text-xs text-ink-500 dark:text-ink-400">
                      {t('systemQty')} {item.system_qty} · {t('counted')} {item.counted_qty}
                    </p>
                  </div>
                  <Badge tone={diff === 0 ? 'success' : diff > 0 ? 'info' : 'danger'}>
                    {diff > 0 ? '+' : ''}
                    {diff}
                  </Badge>
                </div>
              )
            })}
            {!items?.length && (
              <EmptyState icon={<ScanBarcode className="h-10 w-10" />} title="Scanner se items ginein" body="Har scan par ginti save hoti hai" />
            )}
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => finish(false)}>
              {t('closeAudit')}
            </Button>
            <Button onClick={() => finish(true)} icon={<CheckCircle2 className="h-4 w-4" />}>
              {t('applyAdjustments')}
            </Button>
          </div>
        </>
      )}

      {(audits ?? []).filter((audit) => audit.status === 'closed').length > 0 && (
        <Card className="space-y-1">
          <p className="text-xs font-bold uppercase text-ink-500">Purane audits</p>
          {(audits ?? [])
            .filter((audit) => audit.status === 'closed')
            .slice(0, 5)
            .map((audit) => (
              <p key={audit.id} className="text-xs text-ink-500 dark:text-ink-400">
                {audit.name} · {audit.closed_at ? formatDateTime(audit.closed_at) : ''}
              </p>
            ))}
        </Card>
      )}

      <Sheet open={scanOpen} onClose={() => setScanOpen(false)} title={t('scanItem')} size="md">
        <div className="pb-2">
          <ScanPanel autoStart compact lastResult={null} onScan={(code) => void handleScan(code)} />
        </div>
      </Sheet>

      <Sheet
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.name_hi}
        subtitle={selected ? `${t('systemQty')}: ${selected.stock_qty} ${selected.unit}` : undefined}
        footer={
          <Button block size="lg" onClick={saveCount}>
            {t('save')}
          </Button>
        }
      >
        <div className="space-y-3 pb-2">
          <Input
            autoFocus
            inputMode="decimal"
            value={counted}
            onChange={(event) => setCounted(event.target.value.replace(/[^\d.]/g, ''))}
            className="h-16 text-center font-display text-3xl font-extrabold"
          />
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 5, 10].map((step) => (
              <button
                key={step}
                type="button"
                onClick={() => setCounted(String(Number(counted || 0) + step))}
                className="h-11 rounded-xl bg-ink-100 text-sm font-bold dark:bg-ink-800"
              >
                +{step}
              </button>
            ))}
          </div>
        </div>
      </Sheet>
    </div>
  )
}
