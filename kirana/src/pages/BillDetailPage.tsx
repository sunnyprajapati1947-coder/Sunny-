import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Ban, Download, MessageCircle, Printer, RotateCcw, Share2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { useLive } from '../hooks/useLive'
import { billDetail, returnBillItems, voidBill } from '../data/billing'
import { formatDateTime } from '../lib/date'
import { formatPaise } from '../lib/money'
import { downloadPdf, printReceipt, receiptText, receiptWhatsAppLink, sharePdf } from '../lib/receipt'
import { isNativeApp } from '../lib/native'
import type { Bill, BillItem, Payment } from '../types'
import { PageHeader } from '../components/layout/AppShell'
import { Badge, Card, Divider } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input, Select } from '../components/ui/form'
import { Sheet } from '../components/ui/sheet'
import { useConfirm } from '../components/ui/feedback'

export default function BillDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { shop, user, toast, requestApproval } = useApp()
  const t = useT()
  const confirm = useConfirm()
  const [voidOpen, setVoidOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [refundMode, setRefundMode] = useState<'cash' | 'upi' | 'card' | 'udhaar_adjust'>('cash')
  const [returnQty, setReturnQty] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)

  const detail = useLive<{ bill: Bill; items: BillItem[]; payments: Payment[] } | null>(
    () => (id ? billDetail(id) : Promise.resolve(null)),
    [id],
    null,
  )

  if (!detail || !shop) {
    return (
      <div>
        <PageHeader title={t('bills')} onBack={() => navigate('/bills')} />
        <p className="py-10 text-center text-sm text-ink-500">{t('loading')}</p>
      </div>
    )
  }

  const { bill, items, payments } = detail
  const receipt = { shop, bill, items, payments }
  const isOwner = user?.role === 'owner'

  const doVoid = async () => {
    if (!user) return
    if (!reason.trim()) {
      toast('Reason likhein', 'error')
      return
    }
    const approval = await requestApproval({
      permission: 'billing.void',
      title: 'Bill void — owner PIN',
      body: `${bill.bill_no} · ${formatPaise(bill.total_paise)}`,
    })
    if (!approval) return
    setBusy(true)
    try {
      await voidBill(bill.id, reason, user, approval)
      toast('Bill void ho gaya, stock wapas add hua', 'success')
      setVoidOpen(false)
      setReason('')
    } catch (error) {
      toast(error instanceof Error ? error.message : t('somethingWrong'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const doReturn = async () => {
    if (!user) return
    const chosen = Object.entries(returnQty).filter(([, qty]) => qty > 0)
    if (!chosen.length) {
      toast('Koi item chuniye', 'error')
      return
    }
    if (!reason.trim()) {
      toast('Reason likhein', 'error')
      return
    }
    const approval = await requestApproval({
      permission: 'billing.refund',
      title: 'Return/refund — owner PIN',
      body: `${bill.bill_no} · ${chosen.length} items`,
    })
    if (!approval) return
    setBusy(true)
    try {
      const result = await returnBillItems({
        billId: bill.id,
        items: chosen.map(([item_id, qty]) => ({ item_id, qty })),
        reason,
        refundMode,
        actor: user,
        approval,
      })
      toast(`Refund ${formatPaise(result.refundPaise)} record hua`, 'success')
      setReturnOpen(false)
      setReturnQty({})
      setReason('')
    } catch (error) {
      toast(error instanceof Error ? error.message : t('somethingWrong'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title={bill.bill_no}
        subtitle={formatDateTime(bill.created_at)}
        onBack={() => navigate('/bills')}
        action={
          bill.status === 'void' ? <Badge tone="danger">{t('voided')}</Badge> : <Badge tone="success">{bill.payment_status.toUpperCase()}</Badge>
        }
      />

      <Card className="space-y-1">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t('grandTotal')}</p>
            <p className="font-display text-4xl font-extrabold text-ink-950 dark:text-white">{formatPaise(bill.total_paise)}</p>
          </div>
          <div className="text-right text-xs text-ink-500 dark:text-ink-400">
            <p>{bill.customer_name ?? t('walkInCustomer')}</p>
            <p>{bill.customer_phone ?? '—'}</p>
            <p>by {bill.cashier_name ?? '—'}</p>
          </div>
        </div>
        <Divider className="my-2" />
        <Row label={t('subtotal')} value={formatPaise(bill.subtotal_paise)} />
        {bill.discount_paise > 0 && <Row label={t('discount')} value={`− ${formatPaise(bill.discount_paise)}`} />}
        <Row label={t('gst')} value={formatPaise(bill.tax_paise)} />
        {bill.round_off_paise !== 0 && <Row label="Round off" value={formatPaise(bill.round_off_paise)} />}
        <Divider className="my-2" />
        {payments.map((payment) => (
          <Row key={payment.id} label={payment.mode.toUpperCase()} value={formatPaise(payment.amount_paise)} />
        ))}
      </Card>

      <Card className="p-0">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-2 border-b border-ink-100 p-3 last:border-0 dark:border-ink-800">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{item.name_hi}</p>
              <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                {item.qty} {item.unit} × {formatPaise(item.unit_price_paise)} · GST {item.gst_rate}%
              </p>
            </div>
            <p className="font-bold tabular-nums text-ink-900 dark:text-ink-50">{formatPaise(item.line_total_paise)}</p>
          </div>
        ))}
      </Card>

      <div className="grid grid-cols-2 gap-2">
        {!isNativeApp() && (
          <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => printReceipt(receipt)}>
            {t('print')}
          </Button>
        )}
        <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => downloadPdf(receipt)}>
          {t('pdf')}
        </Button>
        <Button
          variant="secondary"
          icon={<Share2 className="h-4 w-4" />}
          onClick={async () => {
            const shared = await sharePdf(receipt)
            if (!shared) toast('PDF save ho gayi', 'info')
          }}
        >
          {t('share')}
        </Button>
        <a
          href={receiptWhatsAppLink(bill.customer_phone, receiptText(receipt, { hindi: true, width: 40 }))}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#25D366] text-base font-semibold text-white"
        >
          <MessageCircle className="h-4 w-4" /> {t('whatsapp')}
        </a>
      </div>

      {isOwner && bill.status !== 'void' && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            icon={<RotateCcw className="h-4 w-4" />}
            onClick={() => {
              setReturnQty({})
              setReason('')
              setReturnOpen(true)
            }}
          >
            Return
          </Button>
          <Button
            variant="danger"
            icon={<Ban className="h-4 w-4" />}
            onClick={async () => {
              const ok = await confirm({
                title: `${t('delete')} / Void`,
                body: 'Bill void hone par stock wapas add hoga. Owner PIN lagega.',
                tone: 'danger',
                confirmLabel: 'Void',
              })
              if (ok) setVoidOpen(true)
            }}
          >
            Void
          </Button>
        </div>
      )}

      {bill.note && <p className="rounded-2xl bg-ink-100 p-3 text-xs text-ink-600 dark:bg-ink-900 dark:text-ink-300">📝 {bill.note}</p>}

      <Sheet
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        title="Bill void karein"
        subtitle={`${bill.bill_no} · ${formatPaise(bill.total_paise)}`}
        footer={
          <Button block variant="danger" loading={busy} onClick={doVoid}>
            Void {t('confirm')}
          </Button>
        }
      >
        <div className="space-y-3 pb-2">
          <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-200">
            Original bill delete nahi hota — void entry + audit log banta hai, stock wapas judta hai.
          </p>
          <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason (galat bill / customer wapas)" autoFocus />
        </div>
      </Sheet>

      <Sheet
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        title="Return / refund"
        subtitle="Owner approval zaroori hai"
        footer={
          <Button block loading={busy} onClick={doReturn}>
            Return record karein
          </Button>
        }
      >
        <div className="space-y-3 pb-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-900 dark:text-ink-50">{item.name_hi}</p>
                <p className="text-xs text-ink-500">
                  {item.qty} {item.unit} · {formatPaise(item.unit_price_paise)}
                </p>
              </div>
              <Input
                inputMode="decimal"
                value={returnQty[item.id] ?? ''}
                onChange={(event) =>
                  setReturnQty((current) => ({
                    ...current,
                    [item.id]: Math.min(item.qty, Number(event.target.value.replace(/[^\d.]/g, '')) || 0),
                  }))
                }
                placeholder="0"
                className="h-11 w-24 text-right"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setReturnQty((current) => ({ ...current, [item.id]: item.qty }))}
              >
                Full
              </Button>
            </div>
          ))}
          <Select value={refundMode} onChange={(event) => setRefundMode(event.target.value as typeof refundMode)}>
            <option value="cash">Cash refund</option>
            <option value="upi">UPI refund</option>
            <option value="card">Card refund</option>
            <option value="udhaar_adjust">Khate mein adjust (udhaar)</option>
          </Select>
          <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Return reason" />
        </div>
      </Sheet>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-sm">
      <span className="text-ink-600 dark:text-ink-300">{label}</span>
      <span className="font-semibold tabular-nums text-ink-900 dark:text-ink-50">{value}</span>
    </div>
  )
}
