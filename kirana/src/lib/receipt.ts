import type { jsPDF as JsPdfInstance } from 'jspdf'

type JsPdfOptions = { unit?: string; format?: string | number[]; orientation?: string }
type JsPdfCtor = new (options?: JsPdfOptions) => JsPdfInstance

/** jsPDF is ~350 kB, so it is loaded only when someone actually asks for a PDF. */
async function loadPdfCtor(): Promise<JsPdfCtor> {
  const mod = await import('jspdf')
  return mod.jsPDF as unknown as JsPdfCtor
}
import type { Bill, BillItem, Payment, Shop } from '../types'
import { formatDate, formatTime } from './date'
import { formatPaise, formatQty } from './money'

const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  udhaar: 'Udhaar',
}

export interface ReceiptData {
  shop: Shop
  bill: Bill
  items: BillItem[]
  payments: Payment[]
}

function center(text: string, width: number): string {
  if (text.length >= width) return text
  return ' '.repeat(Math.floor((width - text.length) / 2)) + text
}

function twoCols(left: string, right: string, width: number): string {
  const space = Math.max(1, width - left.length - right.length)
  return left + ' '.repeat(space) + right
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if ((current + ' ' + word).trim().length > width) {
      if (current) lines.push(current)
      current = word
    } else {
      current = (current + ' ' + word).trim()
    }
  }
  if (current) lines.push(current)
  return lines
}

/**
 * Plain-text receipt used for WhatsApp, SMS and ESC/POS thermal printers.
 * Thermal printers use a Latin code page, so English names are printed there.
 */
export function receiptText(
  { shop, bill, items, payments }: ReceiptData,
  opts: { width?: number; hindi?: boolean; forWhatsApp?: boolean } = {},
): string {
  const width = opts.width ?? (shop.receipt_width === 58 ? 32 : 48)
  const hindi = opts.hindi ?? false
  const lines: string[] = []
  const add = (s = '') => lines.push(s)

  add(center(shop.name.toUpperCase().slice(0, width), width))
  if (shop.address) wrap(shop.address, width).forEach((l) => add(center(l, width)))
  if (shop.phone) add(center(`Ph: ${shop.phone}`, width))
  if (shop.gstin) add(center(`GSTIN: ${shop.gstin}`, width))
  add('-'.repeat(width))
  add(twoCols(`Bill: ${bill.bill_no}`, formatDate(bill.created_at), width))
  add(formatTime(bill.created_at) + (bill.cashier_name ? `  by ${bill.cashier_name}` : ''))
  if (bill.customer_name || bill.customer_phone) {
    add(`Customer: ${[bill.customer_name, bill.customer_phone].filter(Boolean).join(' / ')}`)
  }
  add('-'.repeat(width))

  const qtyW = 8
  const rateW = 8
  const amtW = 9
  const nameW = width - qtyW - rateW - amtW
  add(twoCols('Item', 'Qty   Rate    Amount', width))
  for (const item of items) {
    const name = hindi ? item.name_hi || item.name_en : item.name_en
    const nameLines = wrap(name.slice(0, nameW * 2), nameW)
    add(
      twoCols(
        nameLines[0] ?? '',
        `${String(item.qty).slice(0, 5).padStart(3)}  ${formatPaise(item.unit_price_paise, { symbol: false }).padStart(6)} ${formatPaise(item.line_total_paise, { symbol: false }).padStart(7)}`,
        width,
      ),
    )
    nameLines.slice(1).forEach((l) => add(l))
    if (item.gst_rate > 0 && !shop.prices_include_gst) {
      add(`  GST ${item.gst_rate}%`)
    }
  }
  add('-'.repeat(width))
  add(twoCols('Subtotal', formatPaise(bill.subtotal_paise), width))
  if (bill.discount_paise > 0) add(twoCols('Discount', `-${formatPaise(bill.discount_paise)}`, width))
  add(twoCols(shop.prices_include_gst ? 'GST (incl.)' : 'GST', formatPaise(bill.tax_paise), width))
  if (bill.round_off_paise !== 0) {
    add(twoCols('Round off', formatPaise(bill.round_off_paise), width))
  }
  add(twoCols('TOTAL', formatPaise(bill.total_paise), width))
  add('-'.repeat(width))
  for (const p of payments) {
    add(twoCols(PAYMENT_LABEL[p.mode] ?? p.mode, formatPaise(p.amount_paise), width))
  }
  add('-'.repeat(width))
  add(`Items: ${items.reduce((n, i) => n + (i.unit === 'pcs' ? i.qty : 1), 0)}`)
  if (shop.upi_id) add(`UPI: ${shop.upi_id}`)
  add('')
  add(center(shop.receipt_footer?.slice(0, width) || 'Thank you! Phir aayein 🙏', width))
  add(center(hindi ? 'दुकान दोस्त' : 'Powered by Dukaan Dost', width))
  const text = lines.join('\n')
  return opts.forWhatsApp ? text : text
}

export function receiptWhatsAppLink(phone: string | null, text: string): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  const withCountry = digits.length === 10 ? `91${digits}` : digits
  const base = withCountry ? `https://wa.me/${withCountry}` : 'https://wa.me/'
  return `${base}?text=${encodeURIComponent(text)}`
}

/** Opens a print-ready window sized for 58mm/80mm roll paper. */
export function printReceipt(data: ReceiptData): void {
  const { shop, bill, items, payments } = data
  const widthMm = shop.receipt_width === 58 ? 58 : 80
  const rows = items
    .map(
      (i) => `<tr>
        <td>${escapeHtml(i.name_hi || i.name_en)}${i.name_hi && i.name_hi !== i.name_en ? `<div class="en">${escapeHtml(i.name_en)}</div>` : ''}</td>
        <td class="r">${formatQty(i.qty, i.unit)}</td>
        <td class="r">${formatPaise(i.unit_price_paise, { symbol: false })}</td>
        <td class="r">${formatPaise(i.line_total_paise, { symbol: false })}</td>
      </tr>`,
    )
    .join('')
  const paymentRows = payments
    .map((p) => `<div class="row"><span>${PAYMENT_LABEL[p.mode]}</span><span>${formatPaise(p.amount_paise)}</span></div>`)
    .join('')

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(bill.bill_no)}</title>
<style>
  @page { size: ${widthMm}mm auto; margin: 3mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Noto Sans Devanagari', 'Mukta', Arial, sans-serif; margin: 0 auto; width: ${widthMm - 8}mm; color: #111; font-size: 11px; }
  h1 { font-size: 15px; text-align: center; margin: 0 0 2px; letter-spacing: .3px; }
  .muted { color: #444; text-align: center; font-size: 10px; }
  .sep { border-top: 1px dashed #666; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  th { text-align: left; font-size: 9.5px; text-transform: uppercase; color: #444; padding-bottom: 2px; }
  td { padding: 3px 0; vertical-align: top; }
  .r { text-align: right; white-space: nowrap; }
  .en { font-size: 9px; color: #555; }
  .row { display: flex; justify-content: space-between; padding: 1px 0; }
  .total { font-size: 14px; font-weight: 700; display: flex; justify-content: space-between; margin: 5px 0; }
  .center { text-align: center; }
  .thanks { margin-top: 8px; text-align: center; font-size: 11px; }
  @media print { body { width: auto; } }
</style></head>
<body>
  <h1>${escapeHtml(shop.name)}</h1>
  ${shop.address ? `<div class="muted">${escapeHtml(shop.address)}</div>` : ''}
  ${shop.phone ? `<div class="muted">Ph: ${escapeHtml(shop.phone)}</div>` : ''}
  ${shop.gstin ? `<div class="muted">GSTIN: ${escapeHtml(shop.gstin)}</div>` : ''}
  <div class="sep"></div>
  <div class="row"><span>Bill: ${escapeHtml(bill.bill_no)}</span><span>${formatDate(bill.created_at)}</span></div>
  <div class="row"><span>${formatTime(bill.created_at)}</span><span>${escapeHtml(bill.cashier_name ?? '')}</span></div>
  ${bill.customer_name || bill.customer_phone ? `<div>Customer: ${escapeHtml([bill.customer_name, bill.customer_phone].filter(Boolean).join(' / '))}</div>` : ''}
  <div class="sep"></div>
  <table>
    <thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amt</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="sep"></div>
  <div class="row"><span>Subtotal</span><span>${formatPaise(bill.subtotal_paise)}</span></div>
  ${bill.discount_paise ? `<div class="row"><span>Discount</span><span>-${formatPaise(bill.discount_paise)}</span></div>` : ''}
  <div class="row"><span>GST ${shop.prices_include_gst ? '(incl.)' : ''}</span><span>${formatPaise(bill.tax_paise)}</span></div>
  ${bill.round_off_paise ? `<div class="row"><span>Round off</span><span>${formatPaise(bill.round_off_paise)}</span></div>` : ''}
  <div class="total"><span>TOTAL</span><span>${formatPaise(bill.total_paise)}</span></div>
  <div class="sep"></div>
  ${paymentRows}
  <div class="sep"></div>
  <div class="center">${shop.upi_id ? `UPI: ${escapeHtml(shop.upi_id)}<br>` : ''}Items: ${items.length}</div>
  <div class="thanks">${escapeHtml(shop.receipt_footer || 'Thank you! Phir aayein 🙏')}</div>
  <div class="center muted" style="margin-top:6px">Dukaan Dost</div>
  <script>window.onload = () => { window.focus(); window.print(); };</script>
</body></html>`

  const win = window.open('', '_blank', 'width=420,height=720')
  if (!win) {
    alert('Print blocked. Please allow pop-ups for this site.')
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
}

/** A4/80mm PDF invoice (English labels — PDF core fonts don't include Devanagari). */
export function receiptPdf(data: ReceiptData, JsPDF: JsPdfCtor): JsPdfInstance {
  const { shop, bill, items, payments } = data
  const width = 100
  const lineHeight = 4.6
  const doc = new JsPDF({ unit: 'mm', format: [width, Math.max(150, 90 + items.length * 6)] })
  let y = 12
  const margin = 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(shop.name, width / 2, y, { align: 'center' })
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  if (shop.address) {
    doc.text(doc.splitTextToSize(shop.address, width - margin * 2), width / 2, y, { align: 'center' })
    y += 4
  }
  if (shop.phone) {
    doc.text(`Ph: ${shop.phone}`, width / 2, y, { align: 'center' })
    y += 4
  }
  if (shop.gstin) {
    doc.text(`GSTIN: ${shop.gstin}`, width / 2, y, { align: 'center' })
    y += 4
  }
  y += 2
  doc.setDrawColor(150)
  doc.setLineDashPattern([1, 1], 0)
  doc.line(margin, y, width - margin, y)
  y += 5
  doc.text(`Bill: ${bill.bill_no}`, margin, y)
  doc.text(`${formatDate(bill.created_at)} ${formatTime(bill.created_at)}`, width - margin, y, { align: 'right' })
  y += 4
  if (bill.customer_name || bill.customer_phone) {
    doc.text(`Customer: ${[bill.customer_name, bill.customer_phone].filter(Boolean).join(' / ')}`, margin, y)
    y += 4
  }
  y += 1
  doc.setFont('helvetica', 'bold')
  doc.text('ITEM', margin, y)
  doc.text('QTY', 63, y, { align: 'right' })
  doc.text('RATE', 78, y, { align: 'right' })
  doc.text('AMT', width - margin, y, { align: 'right' })
  y += 4
  doc.setFont('helvetica', 'normal')
  for (const item of items) {
    const nameLines = doc.splitTextToSize(item.name_en || item.name_hi, 48)
    doc.text(nameLines[0], margin, y)
    doc.text(String(item.qty), 63, y, { align: 'right' })
    doc.text(formatPaise(item.unit_price_paise, { symbol: false }), 78, y, { align: 'right' })
    doc.text(formatPaise(item.line_total_paise, { symbol: false }), width - margin, y, { align: 'right' })
    y += lineHeight
    for (const extra of nameLines.slice(1)) {
      doc.text(extra, margin, y)
      y += lineHeight
    }
  }
  y += 1
  doc.line(margin, y, width - margin, y)
  y += 5
  const moneyRow = (label: string, value: string) => {
    doc.text(label, margin, y)
    doc.text(value, width - margin, y, { align: 'right' })
    y += 4.6
  }
  moneyRow('Subtotal', `Rs. ${formatPaise(bill.subtotal_paise, { symbol: false })}`)
  if (bill.discount_paise) {
    moneyRow('Discount', `-Rs. ${formatPaise(bill.discount_paise, { symbol: false })}`)
  }
  moneyRow(shop.prices_include_gst ? 'GST (included)' : 'GST', `Rs. ${formatPaise(bill.tax_paise, { symbol: false })}`)
  if (bill.round_off_paise) {
    moneyRow('Round off', `Rs. ${formatPaise(bill.round_off_paise, { symbol: false })}`)
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  moneyRow('TOTAL', `Rs. ${formatPaise(bill.total_paise, { symbol: false })}`)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  for (const payment of payments) {
    moneyRow(PAYMENT_LABEL[payment.mode] ?? payment.mode, `Rs. ${formatPaise(payment.amount_paise, { symbol: false })}`)
  }
  y += 2
  doc.setFontSize(7.5)
  doc.text(shop.receipt_footer || 'Thank you! Please visit again.', width / 2, y, { align: 'center' })
  y += 4
  doc.setTextColor(120)
  doc.text('Powered by Dukaan Dost', width / 2, y, { align: 'center' })
  return doc
}

export async function downloadPdf(data: ReceiptData): Promise<void> {
  const JsPDF = await loadPdfCtor()
  receiptPdf(data, JsPDF).save(`${data.bill.bill_no.replace(/[^\w-]/g, '')}.pdf`)
}

export async function sharePdf(data: ReceiptData): Promise<boolean> {
  const JsPDF = await loadPdfCtor()
  const doc = receiptPdf(data, JsPDF)
  const blob = doc.output('blob')
  const file = new File([blob], `${data.bill.bill_no.replace(/[^\w-]/g, '')}.pdf`, {
    type: 'application/pdf',
  })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `Bill ${data.bill.bill_no}`, text: 'Aapka bill 🙏' })
      return true
    } catch {
      return false
    }
  }
  doc.save(file.name)
  return false
}

/** WhatsApp receipt text (Hindi included). */
export function whatsappReceiptText(data: ReceiptData): string {
  return receiptText(data, { hindi: true, width: 40, forWhatsApp: true })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
