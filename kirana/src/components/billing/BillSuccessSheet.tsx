import { CheckCircle2, Download, MessageCircle, Printer, Share2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useT } from '../../i18n/useT'
import { formatPaise } from '../../lib/money'
import { downloadPdf, printReceipt, receiptText, receiptWhatsAppLink, sharePdf, whatsappReceiptText } from '../../lib/receipt'
import type { Bill, BillItem, Payment } from '../../types'
import { Sheet } from '../ui/sheet'
import { Button } from '../ui/button'
import { Badge } from '../ui/card'

export interface CompletedBill {
  bill: Bill
  items: BillItem[]
  payments: Payment[]
  changePaise: number
}

interface BillSuccessSheetProps {
  open: boolean
  data: CompletedBill | null
  onClose: () => void
  onNewBill: () => void
}

export function BillSuccessSheet({ open, data, onClose, onNewBill }: BillSuccessSheetProps) {
  const { shop, toast } = useApp()
  const t = useT()
  if (!data || !shop) return null

  const receipt = { shop, bill: data.bill, items: data.items, payments: data.payments }
  const phone = data.bill.customer_phone

  const shareText = async () => {
    const text = receiptText(receipt, { hindi: true, width: 40 })
    if (navigator.share) {
      try {
        await navigator.share({ text, title: `Bill ${data.bill.bill_no}` })
        return
      } catch {
        /* fall through to WhatsApp */
      }
    }
    window.open(receiptWhatsAppLink(phone, text), '_blank', 'noopener')
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="md"
      footer={
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => printReceipt(receipt)}>
              {t('print')}
            </Button>
            <Button
              variant="secondary"
              icon={<Download className="h-4 w-4" />}
              onClick={() => downloadPdf(receipt)}
            >
              {t('pdf')}
            </Button>
            <Button
              variant="secondary"
              icon={<Share2 className="h-4 w-4" />}
              onClick={async () => {
                const shared = await sharePdf(receipt)
                if (!shared) toast('PDF download ho gayi', 'info')
              }}
            >
              {t('share')}
            </Button>
            <a
              href={receiptWhatsAppLink(phone, whatsappReceiptText(receipt))}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 text-base font-semibold text-white active:scale-[0.985]"
            >
              <MessageCircle className="h-4 w-4" /> {t('whatsapp')}
            </a>
          </div>
          <Button block size="lg" onClick={onNewBill}>
            {t('newBill')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pb-2 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200">
          <CheckCircle2 className="h-9 w-9" />
        </div>
        <div>
          <p className="font-display text-xl font-extrabold text-ink-900 dark:text-ink-50">{t('billDone')}</p>
          <p className="text-sm text-ink-500 dark:text-ink-300">
            {data.bill.bill_no} · {data.items.length} {t('items')}
          </p>
        </div>

        <div className="rounded-2xl bg-brand-50 p-4 dark:bg-brand-950/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-800 dark:text-brand-200">{t('grandTotal')}</p>
          <p className="font-display text-4xl font-extrabold leading-tight text-brand-900 dark:text-brand-100">
            {formatPaise(data.bill.total_paise)}
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {data.payments.map((payment) => (
              <Badge key={payment.id} tone="success">
                {payment.mode.toUpperCase()} {formatPaise(payment.amount_paise)}
              </Badge>
            ))}
          </div>
          {data.changePaise > 0 && (
            <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-sm font-bold text-brand-900 dark:bg-ink-950/40 dark:text-brand-100">
              {t('changeToReturn')}: {formatPaise(data.changePaise)}
            </p>
          )}
        </div>

        {data.bill.customer_name && (
          <p className="text-sm text-ink-600 dark:text-ink-200">
            {data.bill.customer_name} · {data.bill.customer_phone ?? '—'}
          </p>
        )}

        <div className="space-y-1 rounded-2xl border border-ink-100 p-3 text-left dark:border-ink-800">
          {data.items.map((item) => (
            <div key={item.id} className="flex justify-between gap-2 text-sm">
              <span className="truncate text-ink-700 dark:text-ink-200">
                {item.name_hi} <span className="text-ink-400">× {item.qty}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-ink-900 dark:text-ink-50">
                {formatPaise(item.line_total_paise)}
              </span>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-ink-400">
          Bluetooth printer: phone ki setting se 58mm/80mm printer pair karein, phir Print dabayein.
        </p>
      </div>
    </Sheet>
  )
}
