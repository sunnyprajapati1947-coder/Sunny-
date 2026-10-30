import { describe, expect, it } from 'vitest'
import {
  addDays,
  billDateStamp,
  daysBetween,
  daysUntil,
  formatDate,
  formatTime,
  istDateKey,
  istDayRange,
  relativeTime,
  startOfMonthIST,
} from './date'
import { buildUpiUri, isValidVpa } from './upi'
import { parseCsv } from './spreadsheet'
import { formatPaise, formatPaiseCompact, formatQty } from './money'
import { printReceipt, receiptText, whatsappReceiptText, type ReceiptData } from './receipt'
import { makeShop } from '../test/fixtures'
import type { Bill, BillItem, Payment } from '../types'

/** A UTC instant that is already "tomorrow" in IST (18:30 UTC = 00:00 IST). */
const UTC_EVENING = new Date('2026-03-14T18:30:00.000Z')
const UTC_MORNING = new Date('2026-03-14T05:00:00.000Z')

describe('IST date helpers', () => {
  it('rolls the day over at 18:30 UTC regardless of the machine timezone', () => {
    expect(istDateKey(UTC_MORNING)).toBe('2026-03-14') // 10:30 IST
    expect(istDateKey(UTC_EVENING)).toBe('2026-03-15') // 00:00 IST next day
    expect(istDateKey(new Date('2026-03-14T18:29:00.000Z'))).toBe('2026-03-14')
  })

  it('handles the New Year boundary', () => {
    expect(istDateKey(new Date('2025-12-31T19:00:00.000Z'))).toBe('2026-01-01')
    expect(startOfMonthIST(new Date('2025-12-31T19:00:00.000Z'))).toBe('2026-01-01')
  })

  it('builds UTC boundaries for an IST calendar day', () => {
    const { start, end } = istDayRange('2026-03-14')
    expect(start).toBe('2026-03-13T18:30:00.000Z')
    expect(end).toBe('2026-03-14T18:30:00.000Z')
    expect(new Date(end).getTime() - new Date(start).getTime()).toBe(86_400_000)
  })

  it('adds and subtracts days across month ends', () => {
    expect(addDays('2026-03-31', 1)).toBe('2026-04-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29') // leap year
    expect(daysBetween('2026-01-01', '2026-03-01')).toBe(59)
    expect(daysBetween('2026-03-01', '2026-01-01')).toBe(-59)
  })

  it('computes expiry countdowns', () => {
    const today = istDateKey()
    expect(daysUntil(today)).toBe(0)
    expect(daysUntil(addDays(today, 7))).toBe(7)
    expect(daysUntil(addDays(today, -3))).toBe(-3)
    expect(daysUntil(null)).toBeNull()
  })

  it('formats dates in shop time, not UTC', () => {
    expect(formatDate('2026-03-15')).toBe('15 Mar 2026')
    // 20:00 UTC on the 14th is 01:30 IST on the 15th
    expect(formatDate('2026-03-14T20:00:00.000Z')).toBe('15 Mar 2026')
    expect(formatTime('2026-03-14T20:00:00.000Z')).toMatch(/1:30/)
    expect(formatDate(null)).toBe('—')
    expect(formatDate('not-a-date')).toBe('—')
  })

  it('uses yymmdd in bill numbers', () => {
    expect(billDateStamp(UTC_MORNING)).toBe('260314')
    expect(billDateStamp(UTC_EVENING)).toBe('260315')
  })

  it('renders friendly relative times', () => {
    expect(relativeTime(new Date().toISOString())).toBe('just now')
    expect(relativeTime(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('5m ago')
    expect(relativeTime(new Date(Date.now() - 3 * 3_600_000).toISOString())).toBe('3h ago')
    expect(relativeTime(null)).toBe('')
  })
})

describe('UPI deep links', () => {
  it('embeds the exact payable amount', () => {
    const uri = buildUpiUri({ vpa: 'sharma@okaxis', payeeName: 'Sharma Kirana', amountPaise: 2850 })
    expect(uri).toBe('upi://pay?pa=sharma%40okaxis&pn=Sharma%20Kirana&am=28.50&cu=INR')
    expect(uri).not.toContain('+')
  })

  it('encodes an ampersand in the shop name instead of breaking the query', () => {
    const uri = buildUpiUri({ vpa: 'a@b', payeeName: 'Gupta & Sons', amountPaise: 100 })
    expect(uri).toContain('pn=Gupta%20%26%20Sons')
    expect(uri.split('&')).toHaveLength(4)
  })

  it('adds a note and transaction reference when given', () => {
    const uri = buildUpiUri({
      vpa: 'shop@ybl',
      payeeName: 'Shop',
      amountPaise: 123456,
      note: 'Bill BILL-260314-004',
      txnRef: 'BILL-260314-004',
    })
    expect(uri).toContain('am=1234.56')
    expect(uri).toContain('tn=Bill%20BILL-260314-004')
    expect(uri).toContain('tr=BILL-260314-004')
  })

  it('validates VPAs', () => {
    expect(isValidVpa('sharma.kirana-1@okaxis')).toBe(true)
    expect(isValidVpa(' shop@ybl ')).toBe(true)
    expect(isValidVpa('no-at-sign')).toBe(false)
    expect(isValidVpa('shop@1')).toBe(false)
    expect(isValidVpa('')).toBe(false)
    expect(isValidVpa(null)).toBe(false)
  })
})

describe('CSV parser', () => {
  it('reads quoted fields, embedded commas and escaped quotes', () => {
    const rows = parseCsv('name,qty\n"Tata Salt, 1kg",2\n"Say ""namaste""",1\r\n')
    expect(rows).toEqual([
      ['name', 'qty'],
      ['Tata Salt, 1kg', '2'],
      ['Say "namaste"', '1'],
    ])
  })

  it('skips blank lines and keeps trailing fields', () => {
    const rows = parseCsv('a,b\n\n1,2\n,\n')
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('parses Hindi product names', () => {
    const rows = parseCsv('name_hi,name_en\nआटा,Atta\n')
    expect(rows[1]).toEqual(['आटा', 'Atta'])
  })
})

describe('quantity formatting', () => {
  it('drops pointless decimals', () => {
    expect(formatQty(2, 'kg')).toBe('2 kg')
    expect(formatQty(0.25, 'kg')).toBe('0.25 kg')
    expect(formatQty(1.5, 'litre')).toBe('1.5 litre')
    expect(formatQty(0.005, 'kg')).toBe('0.005 kg')
  })

  it('compacts large dashboard numbers', () => {
    expect(formatPaiseCompact(28_00)).toBe('₹28')
    expect(formatPaiseCompact(1_23_4500)).toBe('₹12.3k') // ₹12,345
    expect(formatPaiseCompact(2_50_00_000)).toBe('₹2.5L') // ₹2,50,000
    expect(formatPaiseCompact(1_00_00_00_000)).toBe('₹1.0Cr') // ₹1 crore
  })
})

function receiptFixture() {
  const shop = makeShop({ name: 'Sharma Kirana Store', address: 'Main Road, Dhanbad', gstin: '20ABCDE1234F1Z5' })
  const createdAt = '2026-03-14T08:15:00.000Z'
  const bill: Bill = {
    id: 'b1',
    shop_id: shop.id,
    bill_no: 'BILL-260314-001',
    customer_id: null,
    customer_name: 'Ramesh Kumar',
    customer_phone: '9876500011',
    cashier_id: null,
    cashier_name: 'Rakesh',
    subtotal_paise: 5600,
    discount_paise: 600,
    manual_discount_paise: 500,
    offer_discount_paise: 100,
    taxable_paise: 5000,
    tax_paise: 300,
    round_off_paise: 0,
    total_paise: 5000,
    status: 'paid',
    payment_status: 'paid',
    note: null,
    created_at: createdAt,
    finalized_at: createdAt,
    updated_at: createdAt,
  }
  const items: BillItem[] = [
    {
      id: 'i1',
      bill_id: 'b1',
      shop_id: shop.id,
      product_id: null,
      name_en: 'Tata Salt 1kg',
      name_hi: 'टाटा नमक 1 किलो',
      barcode: null,
      qty: 2,
      unit: 'packet',
      unit_price_paise: 2800,
      mrp_paise: 3000,
      gst_rate: 5,
      line_total_paise: 5600,
      taxable_paise: 5333,
      tax_paise: 267,
      cost_paise: 2200,
      created_at: createdAt,
    },
  ]
  const payments: Payment[] = [
    { id: 'p1', bill_id: 'b1', shop_id: shop.id, mode: 'cash', amount_paise: 5000, reference: null, created_at: createdAt },
  ]
  const data: ReceiptData = { shop, bill, items, payments }
  return { shop, bill, items, payments, data }
}

describe('thermal / WhatsApp receipt text', () => {
  const { shop, bill, items, payments, data } = receiptFixture()

  it('keeps every line within the 58 mm width for a thermal printer', () => {
    const text = receiptText(data, { width: 32 })
    for (const line of text.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(32)
    }
  })

  it('includes the shop, bill, totals and payment mode', () => {
    const text = receiptText(data)
    expect(text).toContain('SHARMA KIRANA STORE')
    expect(text).toContain('BILL-260314-001')
    expect(text).toContain('Tata Salt 1kg')
    expect(text).toContain('TOTAL')
    expect(text).toMatch(/TOTAL\s+₹50/)
    expect(text).toContain('Cash')
    expect(text).toContain('Items: 2')
    // one line per item: the quantity/rate row sits underneath the name
    expect(text).toMatch(/\n  2 × 28\s+56\n/)
    expect(text).toContain('GSTIN: 20ABCDE1234F1Z5')
    expect(text).toContain('UPI: test@okaxis')
  })

  it('shows the discount as a negative amount', () => {
    expect(receiptText(data)).toMatch(/Discount\s+-₹6/)
  })

  it('prints Hindi item names for WhatsApp', () => {
    const text = whatsappReceiptText(data)
    expect(text).toContain('टाटा नमक 1 किलो')
    expect(text).toContain('Ramesh Kumar')
    expect(text).toContain('दुकान दोस्त')
  })

  it('uses the wider layout for 80 mm paper', () => {
    const wide = receiptText({ ...data, shop: makeShop({ receipt_width: 80 }) })
    const longest = Math.max(...wide.split('\n').map((line) => line.length))
    expect(longest).toBeLessThanOrEqual(48)
    expect(wide).toContain('-'.repeat(48))
  })

  it('falls back to a thank-you footer and the shop defaults', () => {
    const plain = makeShop({ receipt_footer: null, gstin: null, address: null, phone: null, upi_id: null })
    const text = receiptText({ shop: plain, bill, items, payments })
    expect(text).toMatch(/Thank you/)
    expect(text).not.toContain('GSTIN')
    expect(text).not.toContain('UPI:')
  })
})

describe('print window (58 mm thermal)', () => {
  const { shop, bill, items, payments } = receiptFixture()
  const realWindow = (globalThis as { window?: unknown }).window

  function captureHtml(data: ReceiptData): string {
    const chunks: string[] = []
    const fakeWindow = {
      document: { open() {}, write: (html: string) => chunks.push(html), close() {} },
    }
    ;(globalThis as { window?: unknown }).window = { ...(realWindow as object), open: () => fakeWindow }
    try {
      printReceipt(data)
    } finally {
      ;(globalThis as { window?: unknown }).window = realWindow
    }
    return chunks.join('')
  }

  it('sizes the page to the roll and prints two rows per item', () => {
    const html = captureHtml({ shop, bill, items, payments })
    expect(html).toContain('@page { size: 58mm auto;')
    expect(html).toContain('colspan="2"')
    expect(html).toContain('2 packet × 28')
    expect(html).toContain('window.print()')
  })

  it('switches to the 4-column table on 80 mm paper', () => {
    const html = captureHtml({ shop: makeShop({ receipt_width: 80 }), bill, items, payments })
    expect(html).toContain('@page { size: 80mm auto;')
    expect(html).toContain('<th class="r">Rate</th>')
    expect(html).not.toContain('colspan="2"')
  })

  it('escapes customer and product text so a name cannot inject markup', () => {
    const html = captureHtml({
      shop,
      bill: { ...bill, customer_name: 'Ramesh & <b>Sons</b>', customer_phone: null },
      items: [{ ...items[0], name_en: '<script>alert(1)</script>', name_hi: '' }],
      payments,
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('Ramesh &amp; &lt;b&gt;Sons&lt;/b&gt;')
  })
})
