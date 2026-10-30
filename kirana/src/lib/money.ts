/** All money math lives here. Amounts are integer paise. */

export function toPaise(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  const n = typeof value === 'string' ? Number(value.replace(/,/g, '')) : value
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

export function toRupees(paise: number): number {
  return Math.round(paise) / 100
}

export function formatPaise(paise: number, opts: { decimals?: boolean; symbol?: boolean } = {}): string {
  const { decimals = false, symbol = true } = opts
  // Indian convention: the minus sign precedes the currency symbol.
  if (paise < 0) return `-${formatPaise(-paise, opts)}`
  const value = toRupees(paise)
  const hasFraction = Math.round(paise) % 100 !== 0
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals || hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value)
  return symbol ? `₹${formatted}` : formatted
}

/** Compact display for dashboard cards: ₹1.2L, ₹23.4k */
export function formatPaiseCompact(paise: number): string {
  const rupees = toRupees(paise)
  if (Math.abs(rupees) >= 10_000_000) return `₹${(rupees / 10_000_000).toFixed(1)}Cr`
  if (Math.abs(rupees) >= 100_000) return `₹${(rupees / 100_000).toFixed(1)}L`
  if (Math.abs(rupees) >= 10_000) return `₹${(rupees / 1000).toFixed(1)}k`
  return formatPaise(paise)
}

/** 2 → "2", 0.5 → "0.5", 0.125 → "0.125" (max 3 decimals, the DB precision). */
export function formatQtyNumber(qty: number): string {
  const rounded = Math.round((Number(qty) || 0) * 1000) / 1000
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

export function formatQty(qty: number, unit: string): string {
  return `${formatQtyNumber(qty)} ${unit}`
}

export function roundToRupee(paise: number): number {
  return Math.round(paise / 100) * 100
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function lineTotalPaise(qty: number, unitPricePaise: number): number {
  return Math.round(qty * unitPricePaise)
}

export type TaxMode = 'inclusive' | 'exclusive'

export interface TaxSplit {
  taxable_paise: number
  tax_paise: number
}

/**
 * Split a line amount into taxable value + GST.
 * Inclusive: MRP-style pricing, tax is a component of the amount.
 * Exclusive: tax is added on top of the amount.
 */
export function splitTax(amountPaise: number, gstRate: number, mode: TaxMode): TaxSplit {
  const rate = Math.max(0, Number(gstRate) || 0) / 100
  if (rate === 0) return { taxable_paise: amountPaise, tax_paise: 0 }
  if (mode === 'inclusive') {
    const taxable = Math.round(amountPaise / (1 + rate))
    return { taxable_paise: taxable, tax_paise: amountPaise - taxable }
  }
  const tax = Math.round(amountPaise * rate)
  return { taxable_paise: amountPaise, tax_paise: tax }
}

export interface TotalsInputLine {
  amount_paise: number
  gst_rate: number
}

export interface ComputeTotalsOptions {
  taxMode: TaxMode
  discount_paise?: number
  roundOff?: boolean
}

/**
 * Compute bill totals. Discount is spread across lines proportionally so the
 * GST on the discounted bill is correct, then rounding is applied to the rupee.
 */
export function computeTotals(
  lines: TotalsInputLine[],
  { taxMode, discount_paise = 0, roundOff = true }: ComputeTotalsOptions,
): BillTotalsLike {
  const gross = lines.reduce((sum, l) => sum + l.amount_paise, 0)
  const discount = clamp(Math.round(discount_paise), 0, gross)
  const net = gross - discount

  let taxable = 0
  let tax = 0
  if (gross > 0 && net > 0) {
    lines.forEach((line, index) => {
      // Spread discount proportionally; give the remainder to the last line.
      let lineNet: number
      if (index === lines.length - 1) {
        lineNet = net - lines.slice(0, -1).reduce((sum, l, i) => {
          const share = Math.round((l.amount_paise / gross) * net)
          return sum + share
        }, 0)
      } else {
        lineNet = Math.round((line.amount_paise / gross) * net)
      }
      const split = splitTax(lineNet, line.gst_rate, taxMode)
      taxable += split.taxable_paise
      tax += split.tax_paise
    })
  }

  const preRound = taxMode === 'inclusive' ? net : net + tax
  const total = roundOff ? roundToRupee(preRound) : preRound
  return {
    subtotal_paise: gross,
    discount_paise: discount,
    taxable_paise: taxable,
    tax_paise: tax,
    round_off_paise: total - preRound,
    total_paise: total,
  }
}

export interface BillTotalsLike {
  subtotal_paise: number
  discount_paise: number
  taxable_paise: number
  tax_paise: number
  round_off_paise: number
  total_paise: number
}

/** Allocate a payment total across split payment rows without paise drift. */
export function splitAmountEvenly(total: number, parts: number): number[] {
  if (parts <= 0) return []
  const base = Math.floor(total / parts)
  const result = new Array(parts).fill(base)
  result[0] += total - base * parts
  return result
}

export function percentOf(paise: number, percent: number): number {
  return Math.round((paise * percent) / 100)
}

export function grossMarginPercent(sellingPaise: number, purchasePaise: number): number {
  if (sellingPaise <= 0) return 0
  return Math.round(((sellingPaise - purchasePaise) / sellingPaise) * 1000) / 10
}
