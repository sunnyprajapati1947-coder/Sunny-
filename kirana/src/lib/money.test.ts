import { describe, expect, it } from 'vitest'
import {
  computeTotals,
  formatPaise,
  formatQty,
  grossMarginPercent,
  percentOf,
  roundToRupee,
  splitTax,
  toPaise,
  toRupees,
} from './money'

describe('toPaise / toRupees', () => {
  it('converts rupee strings and numbers without float drift', () => {
    expect(toPaise('12.50')).toBe(1250)
    expect(toPaise('1,234.05')).toBe(123405)
    expect(toPaise(0.1 + 0.2)).toBe(30)
    expect(toRupees(1999)).toBe(19.99)
  })

  it('treats empty and invalid input as zero', () => {
    expect(toPaise('')).toBe(0)
    expect(toPaise('abc')).toBe(0)
    expect(toPaise(null)).toBe(0)
  })

  it('rounds half paise like the shopkeeper expects', () => {
    expect(toPaise(19.995)).toBe(2000)
    expect(toPaise(19.994)).toBe(1999)
  })
})

describe('splitTax', () => {
  it('extracts tax from MRP-style inclusive prices', () => {
    // 5% GST on ₹100 inclusive → taxable 95.24, tax 4.76
    expect(splitTax(10000, 5, 'inclusive')).toEqual({ taxable_paise: 9524, tax_paise: 476 })
  })

  it('adds tax on top for exclusive pricing', () => {
    expect(splitTax(10000, 5, 'exclusive')).toEqual({ taxable_paise: 10000, tax_paise: 500 })
  })

  it('handles zero-rated goods', () => {
    expect(splitTax(5000, 0, 'inclusive')).toEqual({ taxable_paise: 5000, tax_paise: 0 })
  })
})

describe('computeTotals', () => {
  const lines = [
    { amount_paise: 2800, gst_rate: 5 },
    { amount_paise: 7250, gst_rate: 0 },
  ]

  it('sums inclusive lines and rounds the payable amount to the rupee', () => {
    const totals = computeTotals(lines, { taxMode: 'inclusive' })
    expect(totals.subtotal_paise).toBe(10050)
    expect(totals.total_paise).toBe(10100)
    expect(totals.round_off_paise).toBe(50)
    expect(totals.tax_paise).toBeGreaterThan(0)
  })

  it('adds GST on top for exclusive pricing', () => {
    const totals = computeTotals([{ amount_paise: 10000, gst_rate: 18 }], { taxMode: 'exclusive' })
    expect(totals.tax_paise).toBe(1800)
    expect(totals.total_paise).toBe(11800)
  })

  it('spreads a discount proportionally across tax rates', () => {
    const totals = computeTotals(
      [
        { amount_paise: 10000, gst_rate: 5 },
        { amount_paise: 10000, gst_rate: 18 },
      ],
      { taxMode: 'exclusive', discount_paise: 2000 },
    )
    expect(totals.discount_paise).toBe(2000)
    expect(totals.total_paise).toBe(20100) // ₹180 + ₹20.70 GST → rounded ₹201
    // Tax must be on ₹18,000, not ₹20,000.
    expect(totals.tax_paise).toBe(2070)
  })

  it('never discounts below zero or above the subtotal', () => {
    expect(computeTotals([{ amount_paise: 5000, gst_rate: 0 }], { taxMode: 'inclusive', discount_paise: 9000 }).discount_paise).toBe(5000)
    expect(computeTotals([{ amount_paise: 5000, gst_rate: 0 }], { taxMode: 'inclusive', discount_paise: -500 }).discount_paise).toBe(0)
  })

  it('is exact for a 10-line bill with odd paise', () => {
    const many = Array.from({ length: 10 }, (_, index) => ({ amount_paise: 333 + index * 7, gst_rate: 5 }))
    const totals = computeTotals(many, { taxMode: 'inclusive', discount_paise: 137 })
    const gross = many.reduce((sum, line) => sum + line.amount_paise, 0)
    expect(totals.subtotal_paise).toBe(gross)
    expect(totals.total_paise % 100).toBe(0)
    expect(totals.total_paise).toBeLessThanOrEqual(gross)
  })
})

describe('formatting helpers', () => {
  it('formats paise as Indian rupees', () => {
    expect(formatPaise(125000)).toBe('₹1,250')
    expect(formatPaise(12345, { decimals: true })).toBe('₹123.45')
    expect(formatPaise(-5000)).toBe('-₹50')
  })

  it('formats loose quantities without trailing zeros', () => {
    expect(formatQty(0.5, 'kg')).toBe('0.5 kg')
    expect(formatQty(2, 'kg')).toBe('2 kg')
    expect(formatQty(1.25, 'kg')).toBe('1.25 kg')
  })

  it('computes margin and percentages', () => {
    expect(grossMarginPercent(15000, 12000)).toBe(20)
    expect(percentOf(10000, 12)).toBe(1200)
    expect(roundToRupee(10049)).toBe(10000)
    expect(roundToRupee(10050)).toBe(10100)
  })
})
