import * as XLSX from 'xlsx'
import { db } from '../lib/db'
import { addDays, daysUntil, istDateKey, istDayRange } from '../lib/date'
import { toRupees } from '../lib/money'
import type { Bill, BillItem, Category, Payment, Product } from '../types'

export interface SalesRange {
  from: string // ISO
  to: string // ISO
}

export interface Totals {
  bills: number
  sales_paise: number
  tax_paise: number
  discount_paise: number
  profit_paise: number
  items_sold: number
}

export interface PaymentSplit {
  cash_paise: number
  upi_paise: number
  card_paise: number
  udhaar_paise: number
  total_paise: number
}

export interface TopItem {
  product_id: string | null
  name_en: string
  name_hi: string
  qty: number
  unit: string
  revenue_paise: number
  profit_paise: number
}

export interface CategorySale {
  category_id: string | null
  name: string
  revenue_paise: number
}

export interface DashboardData {
  today: Totals
  yesterday: Totals
  month: Totals
  paymentSplit: PaymentSplit
  topItems: TopItem[]
  categorySales: CategorySale[]
  lowStock: Product[]
  expiring: Product[]
  pendingUdhaarPaise: number
  customersWithDue: number
  recentBills: Bill[]
  hourlySales: { hour: number; paise: number }[]
}

export interface RangeSnapshot {
  range: { from: string; to: string }
  totals: Totals
  paymentSplit: PaymentSplit
  byDay: { date: string; sales_paise: number; bills: number; profit_paise: number }[]
  topItems: TopItem[]
  categorySales: CategorySale[]
  billCount: number
}

async function billsInRange(shopId: string, range: SalesRange): Promise<Bill[]> {
  const rows = await db.bills.where('shop_id').equals(shopId).toArray()
  return rows.filter(
    (bill) => bill.status === 'paid' && bill.created_at >= range.from && bill.created_at < range.to,
  )
}

const rangeOf = (day: { start: string; end: string }): SalesRange => ({ from: day.start, to: day.end })

function sumTotals(bills: Bill[], items: BillItem[]): Totals {
  const costByBill = new Map<string, number>()
  for (const item of items) {
    const cost = (item.cost_paise ?? 0) * item.qty
    costByBill.set(item.bill_id, (costByBill.get(item.bill_id) ?? 0) + cost)
  }
  let sales = 0
  let tax = 0
  let discount = 0
  let profit = 0
  for (const bill of bills) {
    sales += bill.total_paise
    tax += bill.tax_paise
    discount += bill.discount_paise
    const grossMargin = bill.subtotal_paise - bill.discount_paise - (costByBill.get(bill.id) ?? 0)
    profit += Math.round(grossMargin)
  }
  return {
    bills: bills.length,
    sales_paise: sales,
    tax_paise: tax,
    discount_paise: discount,
    profit_paise: profit,
    items_sold: items.length,
  }
}

function paymentSplitOf(payments: Payment[]): PaymentSplit {
  const split: PaymentSplit = { cash_paise: 0, upi_paise: 0, card_paise: 0, udhaar_paise: 0, total_paise: 0 }
  for (const payment of payments) {
    if (payment.mode === 'cash') split.cash_paise += payment.amount_paise
    if (payment.mode === 'upi') split.upi_paise += payment.amount_paise
    if (payment.mode === 'card') split.card_paise += payment.amount_paise
    if (payment.mode === 'udhaar') split.udhaar_paise += payment.amount_paise
    split.total_paise += payment.amount_paise
  }
  return split
}

async function itemsForBills(billIds: string[]): Promise<BillItem[]> {
  if (!billIds.length) return []
  const all = await db.bill_items.where('bill_id').anyOf(billIds).toArray()
  return all
}

async function paymentsForBills(billIds: string[]): Promise<Payment[]> {
  if (!billIds.length) return []
  return db.payments.where('bill_id').anyOf(billIds).toArray()
}

function topItemsOf(items: BillItem[], limit = 8): TopItem[] {
  const map = new Map<string, TopItem>()
  for (const item of items) {
    const key = item.product_id ?? item.name_en
    const existing = map.get(key)
    const profit = Math.round(item.line_total_paise - (item.cost_paise ?? 0) * item.qty)
    if (existing) {
      existing.qty += item.qty
      existing.revenue_paise += item.line_total_paise
      existing.profit_paise += profit
    } else {
      map.set(key, {
        product_id: item.product_id,
        name_en: item.name_en,
        name_hi: item.name_hi,
        qty: item.qty,
        unit: item.unit,
        revenue_paise: item.line_total_paise,
        profit_paise: profit,
      })
    }
  }
  return [...map.values()].sort((a, b) => b.revenue_paise - a.revenue_paise).slice(0, limit)
}

async function categorySalesOf(items: BillItem[], products: Product[], categories: Category[]): Promise<CategorySale[]> {
  const productCategory = new Map(products.map((p) => [p.id, p.category_id]))
  const categoryName = new Map(categories.map((c) => [c.id, c.name_en]))
  const map = new Map<string | null, number>()
  for (const item of items) {
    const categoryId = item.product_id ? productCategory.get(item.product_id) ?? null : null
    map.set(categoryId, (map.get(categoryId) ?? 0) + item.line_total_paise)
  }
  return [...map.entries()]
    .map(([categoryId, revenue]) => ({
      category_id: categoryId,
      name: categoryId ? categoryName.get(categoryId) ?? 'Other' : 'Uncategorised',
      revenue_paise: revenue,
    }))
    .sort((a, b) => b.revenue_paise - a.revenue_paise)
}

export async function getDashboard(shopId: string): Promise<DashboardData> {
  const [products, categories, customers] = await Promise.all([
    db.products.where('shop_id').equals(shopId).toArray(),
    db.categories.where('shop_id').equals(shopId).toArray(),
    db.customers.where('shop_id').equals(shopId).toArray(),
  ])

  const todayKey = istDateKey()
  const todayRange = istDayRange(todayKey)
  const yesterdayRange = istDayRange(addDays(todayKey, -1))
  const monthStart = `${todayKey.slice(0, 7)}-01`
  const monthRange = { from: istDayRange(monthStart).start, to: todayRange.end }

  const [todayBills, yesterdayBills, monthBills] = await Promise.all([
    billsInRange(shopId, rangeOf(todayRange)),
    billsInRange(shopId, rangeOf(yesterdayRange)),
    billsInRange(shopId, monthRange),
  ])

  const todayIds = todayBills.map((b) => b.id)
  const [todayItems, todayPayments, monthItems, yesterdayItems] = await Promise.all([
    itemsForBills(todayIds),
    paymentsForBills(todayIds),
    itemsForBills(monthBills.map((b) => b.id)),
    itemsForBills(yesterdayBills.map((b) => b.id)),
  ])

  const active = products.filter((p) => p.is_active)
  const lowStock = active.filter((p) => p.stock_qty <= p.low_stock_limit)
  const expiring = active
    .filter((p) => {
      const days = daysUntil(p.expiry_date)
      return days !== null && days >= 0 && days <= 30
    })
    .sort((a, b) => (a.expiry_date ?? '').localeCompare(b.expiry_date ?? ''))

  const hourly = new Map<number, number>()
  for (const bill of todayBills) {
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(
        new Date(bill.created_at),
      ),
    )
    hourly.set(hour, (hourly.get(hour) ?? 0) + bill.total_paise)
  }

  const recent = await db.bills.where('shop_id').equals(shopId).toArray()

  return {
    today: sumTotals(todayBills, todayItems),
    yesterday: sumTotals(yesterdayBills, yesterdayItems),
    month: sumTotals(monthBills, monthItems),
    paymentSplit: paymentSplitOf(todayPayments),
    topItems: topItemsOf(todayItems.length ? todayItems : monthItems, 8),
    categorySales: await categorySalesOf(todayItems.length ? todayItems : monthItems, products, categories),
    lowStock,
    expiring,
    pendingUdhaarPaise: customers.reduce((sum, c) => sum + c.balance_paise, 0),
    customersWithDue: customers.filter((c) => c.balance_paise > 0).length,
    recentBills: recent
      .filter((b) => b.status !== 'held')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 8),
    hourlySales: Array.from({ length: 15 }, (_, index) => {
      const hour = index + 8
      return { hour, paise: hourly.get(hour) ?? 0 }
    }),
  }
}

export async function getRangeSnapshot(shopId: string, fromKey: string, toKey: string): Promise<RangeSnapshot> {
  const range = { from: istDayRange(fromKey).start, to: istDayRange(addDays(toKey, 1)).start }
  const [products, categories] = await Promise.all([
    db.products.where('shop_id').equals(shopId).toArray(),
    db.categories.where('shop_id').equals(shopId).toArray(),
  ])
  const bills = await billsInRange(shopId, range)
  const items = await itemsForBills(bills.map((b) => b.id))
  const payments = await paymentsForBills(bills.map((b) => b.id))
  const totals = sumTotals(bills, items)

  const costByBill = new Map<string, number>()
  const itemsByBill = new Map<string, BillItem[]>()
  for (const item of items) {
    costByBill.set(item.bill_id, (costByBill.get(item.bill_id) ?? 0) + (item.cost_paise ?? 0) * item.qty)
    const list = itemsByBill.get(item.bill_id) ?? []
    list.push(item)
    itemsByBill.set(item.bill_id, list)
  }

  const byDayMap = new Map<string, { sales_paise: number; bills: number; profit_paise: number }>()
  for (const bill of bills) {
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(bill.created_at))
    const entry = byDayMap.get(key) ?? { sales_paise: 0, bills: 0, profit_paise: 0 }
    entry.sales_paise += bill.total_paise
    entry.bills += 1
    entry.profit_paise += bill.subtotal_paise - bill.discount_paise - (costByBill.get(bill.id) ?? 0)
    byDayMap.set(key, entry)
  }

  return {
    range,
    totals,
    paymentSplit: paymentSplitOf(payments),
    byDay: [...byDayMap.entries()]
      .map(([date, value]) => ({ date, ...value }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    topItems: topItemsOf(items, 20),
    categorySales: await categorySalesOf(items, products, categories),
    billCount: bills.length,
  }
}

export interface GstRow {
  rate: number
  taxable_paise: number
  cgst_paise: number
  sgst_paise: number
  total_tax_paise: number
  invoices: number
}

export interface GstReport {
  gstr1Summary: GstRow[]
  b2cRows: { bill_no: string; date: string; taxable_paise: number; tax_paise: number; total_paise: number; rate: number }[]
  totalTaxable: number
  totalTax: number
}

/**
 * Rate-wise GST summary — the numbers a GSTR-1 B2C table needs.
 * (Filing itself still needs a CA / GSP; this is the supporting report.)
 */
export async function getGstReport(shopId: string, fromKey: string, toKey: string): Promise<GstReport> {
  const bills = await billsInRange(shopId, {
    from: istDayRange(fromKey).start,
    to: istDayRange(addDays(toKey, 1)).start,
  })
  const items = await itemsForBills(bills.map((b) => b.id))
  const rateMap = new Map<number, GstRow>()
  const billRateMap = new Map<string, Map<number, { taxable: number; tax: number }>>()

  for (const item of items) {
    const rate = item.gst_rate
    const row = rateMap.get(rate) ?? {
      rate,
      taxable_paise: 0,
      cgst_paise: 0,
      sgst_paise: 0,
      total_tax_paise: 0,
      invoices: 0,
    }
    row.taxable_paise += item.taxable_paise
    row.total_tax_paise += item.tax_paise
    row.cgst_paise = Math.round(row.total_tax_paise / 2)
    row.sgst_paise = row.total_tax_paise - row.cgst_paise
    rateMap.set(rate, row)

    const perBill = billRateMap.get(item.bill_id) ?? new Map()
    const current = perBill.get(rate) ?? { taxable: 0, tax: 0 }
    current.taxable += item.taxable_paise
    current.tax += item.tax_paise
    perBill.set(rate, current)
    billRateMap.set(item.bill_id, perBill)
  }

  for (const bill of bills) {
    const perBill = billRateMap.get(bill.id)
    if (!perBill) continue
    for (const rate of perBill.keys()) {
      const row = rateMap.get(rate)
      if (row) row.invoices += 1
    }
  }

  const gstr1Summary = [...rateMap.values()].sort((a, b) => a.rate - b.rate)
  const b2cRows: GstReport['b2cRows'] = []
  for (const bill of bills) {
    const perBill = billRateMap.get(bill.id)
    if (!perBill) continue
    for (const [rate, value] of perBill) {
      b2cRows.push({
        bill_no: bill.bill_no,
        date: bill.created_at,
        taxable_paise: value.taxable,
        tax_paise: value.tax,
        total_paise: value.taxable + value.tax,
        rate,
      })
    }
  }

  return {
    gstr1Summary,
    b2cRows: b2cRows.sort((a, b) => a.date.localeCompare(b.date)),
    totalTaxable: gstr1Summary.reduce((sum, row) => sum + row.taxable_paise, 0),
    totalTax: gstr1Summary.reduce((sum, row) => sum + row.total_tax_paise, 0),
  }
}

export interface PnlReport {
  revenue_paise: number
  cogs_paise: number
  gross_profit_paise: number
  discounts_paise: number
  gst_collected_paise: number
  udhaar_paise: number
  bills: number
}

export async function getPnl(shopId: string, fromKey: string, toKey: string): Promise<PnlReport> {
  const bills = await billsInRange(shopId, {
    from: istDayRange(fromKey).start,
    to: istDayRange(addDays(toKey, 1)).start,
  })
  const items = await itemsForBills(bills.map((b) => b.id))
  const payments = await paymentsForBills(bills.map((b) => b.id))
  const cogs = items.reduce((sum, item) => sum + (item.cost_paise ?? 0) * item.qty, 0)
  const revenue = bills.reduce((sum, bill) => sum + bill.total_paise, 0)
  return {
    revenue_paise: revenue,
    cogs_paise: Math.round(cogs),
    gross_profit_paise: Math.round(revenue - cogs),
    discounts_paise: bills.reduce((sum, bill) => sum + bill.discount_paise, 0),
    gst_collected_paise: bills.reduce((sum, bill) => sum + bill.tax_paise, 0),
    udhaar_paise: payments.filter((p) => p.mode === 'udhaar').reduce((sum, p) => sum + p.amount_paise, 0),
    bills: bills.length,
  }
}

export interface DeadStockRow {
  product: Product
  stock_value_paise: number
  last_sold: string | null
}

export async function getDeadStock(shopId: string, days = 30): Promise<DeadStockRow[]> {
  const products = (await db.products.where('shop_id').equals(shopId).toArray()).filter(
    (p) => p.is_active && p.stock_qty > 0,
  )
  const cutoff = addDays(istDateKey(), -days)
  const bills = (await db.bills.where('shop_id').equals(shopId).toArray()).filter(
    (b) => b.status === 'paid' && b.created_at >= istDayRange(cutoff).start,
  )
  const items = await itemsForBills(bills.map((b) => b.id))
  const soldIds = new Set(items.map((item) => item.product_id))
  const allItems = await db.bill_items.where('shop_id').equals(shopId).toArray()

  return products
    .filter((p) => !soldIds.has(p.id))
    .map((product) => {
      const last = allItems
        .filter((item) => item.product_id === product.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
      return {
        product,
        stock_value_paise: Math.round(product.stock_qty * product.purchase_price_paise),
        last_sold: last?.created_at ?? null,
      }
    })
    .sort((a, b) => b.stock_value_paise - a.stock_value_paise)
}

export interface DayCloseReport {
  date: string
  cashSales_paise: number
  upi_paise: number
  card_paise: number
  udhaar_paise: number
  cashRepayments_paise: number
  cashPurchases_paise: number
  expectedCash_paise: number
  bills: number
  totalSales_paise: number
  voidedBills: number
  voidedValue_paise: number
}

export async function getDayClose(shopId: string, dateKey: string): Promise<DayCloseReport> {
  const range = istDayRange(dateKey)
  const allBills = await db.bills.where('shop_id').equals(shopId).toArray()
  const bills = allBills.filter((b) => b.status === 'paid' && b.created_at >= range.start && b.created_at < range.end)
  const voided = allBills.filter(
    (b) => b.status === 'void' && b.created_at >= range.start && b.created_at < range.end,
  )
  const payments = await paymentsForBills(bills.map((b) => b.id))
  const split = paymentSplitOf(payments)

  const repayments = await db.ledger_entries
    .where('shop_id')
    .equals(shopId)
    .filter((entry) => entry.entry_type === 'payment' && entry.created_at >= range.start && entry.created_at < range.end)
    .toArray()
  const cashRepayments = repayments
    .filter((entry) => entry.reference_type === 'cash')
    .reduce((sum, entry) => sum + Math.abs(entry.amount_paise), 0)

  const purchases = await db.purchases
    .where('shop_id')
    .equals(shopId)
    .filter((p) => p.created_at >= range.start && p.created_at < range.end)
    .toArray()
  const cashPurchases = purchases.reduce((sum, p) => sum + p.paid_paise, 0)

  return {
    date: dateKey,
    cashSales_paise: split.cash_paise,
    upi_paise: split.upi_paise,
    card_paise: split.card_paise,
    udhaar_paise: split.udhaar_paise,
    cashRepayments_paise: cashRepayments,
    cashPurchases_paise: cashPurchases,
    expectedCash_paise: split.cash_paise + cashRepayments - cashPurchases,
    bills: bills.length,
    totalSales_paise: bills.reduce((sum, b) => sum + b.total_paise, 0),
    voidedBills: voided.length,
    voidedValue_paise: voided.reduce((sum, b) => sum + b.total_paise, 0),
  }
}

/** Excel exports used by Reports. */
export function exportReportWorkbook(sheets: { name: string; rows: (string | number)[][] }[], filename: string): void {
  const workbook = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows)
    worksheet['!cols'] = (sheet.rows[0] ?? []).map(() => ({ wch: 18 }))
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31))
  }
  XLSX.writeFile(workbook, `${filename}.xlsx`)
}

export function rupees(paise: number): number {
  return toRupees(paise)
}
