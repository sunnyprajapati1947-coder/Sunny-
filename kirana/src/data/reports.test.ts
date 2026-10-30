import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { istDateKey } from '../lib/date'
import { toPaise } from '../lib/money'
import { cartLineFromProduct, finalizeBill } from './billing'
import { getDashboard, getDayClose, getDeadStock, getGstReport, getPnl, getRangeSnapshot } from './reports'
import { addUtcDays } from '../test/time'
import { cashier, owner, resetDb, seedBasics } from '../test/fixtures'

beforeEach(async () => {
  await resetDb()
})

async function sell(shopId: string, qty = 2, mode: 'cash' | 'upi' | 'udhaar' = 'cash') {
  const { shop, product, customer } = await seedBasics()
  await finalizeBill({
    shop: shop.id === shopId ? shop : shop,
    actor: cashier,
    lines: [cartLineFromProduct(product, qty)],
    taxMode: 'inclusive',
    manualDiscountPaise: 0,
    customer: mode === 'udhaar' ? { id: customer.id, name: customer.name, phone: customer.phone } : { id: null, name: null, phone: null },
    payments: [{ mode, amount_paise: toPaise(28 * qty), reference: null }],
  })
  return { product, customer }
}

describe('dashboard', () => {
  it('summarises today’s sales, profit and payment split', async () => {
    const { shop } = await seedBasics()
    await sell(shop.id, 2, 'cash')
    const dashboard = await getDashboard(shop.id)

    expect(dashboard.today.bills).toBe(1)
    expect(dashboard.today.sales_paise).toBe(toPaise(56))
    expect(dashboard.today.profit_paise).toBeGreaterThan(0)
    expect(dashboard.paymentSplit.cash_paise).toBe(toPaise(56))
    expect(dashboard.topItems[0].qty).toBe(2)
  })

  it('counts low stock and expiring products', async () => {
    const { shop, product } = await seedBasics()
    await db.products.put({ ...product, stock_qty: 2, expiry_date: istDateKey() })
    const dashboard = await getDashboard(shop.id)
    expect(dashboard.lowStock).toHaveLength(1)
    expect(dashboard.expiring).toHaveLength(1)
    expect(dashboard.pendingUdhaarPaise).toBe(0)
  })
})

describe('range snapshot', () => {
  it('groups sales per day and per category', async () => {
    const { shop } = await seedBasics()
    await sell(shop.id, 3, 'upi')
    const snapshot = await getRangeSnapshot(shop.id, istDateKey(), istDateKey())
    expect(snapshot.billCount).toBe(1)
    expect(snapshot.byDay).toHaveLength(1)
    expect(snapshot.paymentSplit.upi_paise).toBe(toPaise(84))
    expect(snapshot.byDay[0].bills).toBe(1)
  })

  it('returns nothing for a future range', async () => {
    const { shop } = await seedBasics()
    await sell(shop.id)
    const future = addUtcDays(istDateKey(), 5)
    const snapshot = await getRangeSnapshot(shop.id, future, future)
    expect(snapshot.billCount).toBe(0)
  })
})

describe('GST report', () => {
  it('splits tax into CGST/SGST per rate', async () => {
    const { shop } = await seedBasics()
    await sell(shop.id, 4, 'cash')
    const gst = await getGstReport(shop.id, istDateKey(), istDateKey())
    expect(gst.gstr1Summary).toHaveLength(1)
    const row = gst.gstr1Summary[0]
    expect(row.rate).toBe(5)
    expect(row.cgst_paise + row.sgst_paise).toBe(row.total_tax_paise)
    expect(gst.totalTax).toBe(row.total_tax_paise)
    expect(gst.b2cRows.length).toBeGreaterThan(0)
  })
})

describe('profit & loss', () => {
  it('computes COGS from the purchase price stored on the bill item', async () => {
    const { shop } = await seedBasics()
    await sell(shop.id, 2, 'cash')
    const pnl = await getPnl(shop.id, istDateKey(), istDateKey())
    expect(pnl.revenue_paise).toBe(toPaise(56))
    expect(pnl.cogs_paise).toBe(toPaise(44))
    expect(pnl.gross_profit_paise).toBe(toPaise(12))
  })
})

describe('day close', () => {
  it('reconciles expected cash from sales, repayments and purchases', async () => {
    const { shop } = await seedBasics()
    await sell(shop.id, 2, 'cash')
    const report = await getDayClose(shop.id, istDateKey())
    expect(report.cashSales_paise).toBe(toPaise(56))
    expect(report.expectedCash_paise).toBe(toPaise(56))
    expect(report.bills).toBe(1)
  })
})

describe('dead stock', () => {
  it('lists products that never sold', async () => {
    const { shop } = await seedBasics()
    const dead = await getDeadStock(shop.id, 30)
    expect(dead).toHaveLength(1)
    expect(dead[0].stock_value_paise).toBe(20 * toPaise(22))
  })

  it('excludes products sold inside the window', async () => {
    const { shop } = await seedBasics()
    await sell(shop.id, 1, 'cash')
    const dead = await getDeadStock(shop.id, 30)
    expect(dead).toHaveLength(0)
  })
})

describe('multi-shop isolation', () => {
  it('never mixes data between shops', async () => {
    const { shop } = await seedBasics()
    await sell(shop.id, 2, 'cash')
    const other = '99999999-9999-4999-8999-999999999999'
    const dashboard = await getDashboard(other)
    expect(dashboard.today.bills).toBe(0)
  })
})

describe('owner-only views', () => {
  it('keeps profit visible to the owner role in the permission map', async () => {
    const { can } = await import('../lib/permissions')
    expect(can(owner.role, 'reports.profit')).toBe(true)
    expect(can(cashier.role, 'reports.profit')).toBe(false)
  })
})
