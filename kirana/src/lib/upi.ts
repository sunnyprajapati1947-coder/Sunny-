import QRCode from 'qrcode'
import { toRupees } from './money'

export interface UpiPaymentRequest {
  vpa: string
  payeeName: string
  amountPaise: number
  note?: string
  txnRef?: string
}

/** Basic VPA validation — `name@bank` style handles. */
export function isValidVpa(vpa: string | null | undefined): boolean {
  if (!vpa) return false
  return /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/.test(vpa.trim())
}

/**
 * Builds a UPI deep link (NPCI spec). The exact bill amount is embedded, so the
 * customer cannot key in a different amount when paying.
 */
export function buildUpiUri({ vpa, payeeName, amountPaise, note, txnRef }: UpiPaymentRequest): string {
  // NPCI expects application/x-www-form-urlencoded values where spaces are %20
  // (URLSearchParams would emit '+' and some apps reject the payee name).
  const parts = [
    `pa=${encodeURIComponent(vpa.trim())}`,
    `pn=${encodeURIComponent((payeeName || 'Shop').trim())}`,
    `am=${toRupees(amountPaise).toFixed(2)}`,
    'cu=INR',
  ]
  if (note) parts.push(`tn=${encodeURIComponent(note.slice(0, 50)).replace(/%20/g, '%20')}`)
  if (txnRef) parts.push(`tr=${encodeURIComponent(txnRef.slice(0, 35))}`)
  return `upi://pay?${parts.join('&')}`
}

export async function makeQrDataUrl(text: string, size = 512): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#111813', light: '#ffffff' },
  })
}

/** UPI intent links for the "open app" buttons on the payment screen. */
export function upiAppLinks(uri: string) {
  const encoded = encodeURIComponent(uri)
  return {
    generic: uri,
    gpay: `tez://upi/pay?${uri.split('?')[1] ?? ''}`,
    phonepe: `phonepe://pay?${uri.split('?')[1] ?? ''}`,
    paytm: `paytmmp://pay?${uri.split('?')[1] ?? ''}`,
    bhIm: `upi://pay?${uri.split('?')[1] ?? ''}`,
    qrPayload: encoded,
  }
}
