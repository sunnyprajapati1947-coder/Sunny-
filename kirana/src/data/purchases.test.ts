import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import {
  buildOrderList,
  closeStockAudit,
  orderListText,
  paySupplier,
  savePurchase,
  saveSupplier,
  startStockAudit,
  upsertAuditCount,
  type PurchaseCartLine,
} from './purchases'
import { makeProduct, owner, resetDb, SHOP_ID, seedBasics } from '../test/fixtures'
import type { Product, Supplier } from '../types'

beforeEach(async () => {
  await resetDb()
})

function line(product: Product, qty: number, costPaise: number): PurchaseCartLine {
  return {
    key: product.id,
    product_id: product.id,
    name_en: product.name_en,
    name_hi: product.name_hi,
    unit: product.unit,
    qty,
    cost_paise: costPaise,
  }
}

function makeSupplier(overrides: Partial<Supplier> = {}): Supplier {
  const now = new Date().toISOString()
  return {
    id: '77777777-7777-4777-8777-777777777777',
    shop_id: SHOP_ID,
    name: 'Agarwal Distributors',
    phone: '9876512345',
    company: 'Agarwal & Sons',
    gstin: null,
    address: null,
    notes: null,
    balance_paise: 0,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

describe('savePurchase', () => {
  it('increases stock, records movements and the landed cost', async () => {
    const { shop, product } = await seedBasics()
    const { purchase } = await savePurchase({
      shop,
      actor: owner,
      supplier: null,
      invoice_no: 'INV-1',
      lines: [line(product, 10, 2100)],
      paid_paise: 21000,
    })

    const after = await db.products.get(product.id)
    expect(after?.stock_qty).toBe(30)
    // latest landed cost drives profit reports
    expect(after?.purchase_price_paise).toBe(2100)
    expect(purchase.total_paise).toBe(21000)
    expect(purchase.status).toBe('paid')
    expect(purchase.purchase_no).toMatch(/^PUR-\d{6}-001$/)

    const movements = await db.stock_movements.where('product_id').equals(product.id).toArray()
    expect(movements).toHaveLength(1)
    expect(movements[0]).toMatchObject({
      movement_type: 'purchase',
      qty_change: 10,
      qty_after: 30,
      reference_type: 'purchase',
      reference_id: purchase.id,
    })
  })

  it('adds the unpaid amount to the supplier balance', async () => {
    const { shop, product } = await seedBasics()
    const supplier = makeSupplier({ balance_paise: 5000 })
    await db.suppliers.put(supplier)

    const { purchase } = await savePurchase({
      shop,
      actor: owner,
      supplier,
      invoice_no: null,
      lines: [line(product, 5, 2000)],
      paid_paise: 3000, // 10,000 total → 7,000 credit
    })

    expect(purchase.status).toBe('partial')
    const after = await db.suppliers.get(supplier.id)
    expect(after?.balance_paise).toBe(5000 + 7000)
  })

  it('marks a fully unpaid purchase as credit and stores items', async () => {
    const { shop, product } = await seedBasics()
    const supplier = makeSupplier()
    await db.suppliers.put(supplier)

    const { purchase, items } = await savePurchase({
      shop,
      actor: owner,
      supplier,
      invoice_no: null,
      lines: [line(product, 2, 1500), line({ ...product, id: 'p2', name_en: 'Sugar' }, 3, 1000)],
      paid_paise: 0,
    })

    expect(purchase.status).toBe('credit')
    expect(purchase.paid_paise).toBe(0)
    expect(items).toHaveLength(2)
    expect(items[0].line_total_paise).toBe(3000)
    const stored = await db.purchase_items.where('purchase_id').equals(purchase.id).toArray()
    expect(stored).toHaveLength(2)
    expect((await db.suppliers.get(supplier.id))?.balance_paise).toBe(6000)
  })

  it('rejects an empty purchase', async () => {
    const { shop } = await seedBasics()
    await expect(
      savePurchase({ shop, actor: owner, supplier: null, invoice_no: null, lines: [], paid_paise: 0 }),
    ).rejects.toThrow(/No items/i)
  })

  it('clamps overpayment to the bill total', async () => {
    const { shop, product } = await seedBasics()
    const { purchase } = await savePurchase({
      shop,
      actor: owner,
      supplier: null,
      invoice_no: null,
      lines: [line(product, 1, 5000)],
      paid_paise: 99999,
    })
    expect(purchase.paid_paise).toBe(5000)
    expect(purchase.status).toBe('paid')
  })

  it('writes an audit entry and queues the rows for sync', async () => {
    const { shop, product } = await seedBasics()
    await savePurchase({
      shop,
      actor: owner,
      supplier: null,
      invoice_no: null,
      lines: [line(product, 1, 5000)],
      paid_paise: 5000,
    })

    const audits = await db.audit_logs.where('shop_id').equals(shop.id).toArray()
    expect(audits.some((row) => row.entity === 'purchase' && row.action === 'create')).toBe(true)

    const pending = await db.outbox.toArray()
    const tables = new Set(pending.map((row) => row.table_name))
    expect(tables.has('purchases')).toBe(true)
    expect(tables.has('purchase_items')).toBe(true)
    expect(tables.has('products')).toBe(true)
  })
})

describe('paySupplier', () => {
  it('reduces the balance and records a ledger entry', async () => {
    const { shop } = await seedBasics()
    const supplier = makeSupplier({ balance_paise: 10000 })
    await db.suppliers.put(supplier)

    await paySupplier(supplier.id, 4000, owner)

    expect((await db.suppliers.get(supplier.id))?.balance_paise).toBe(6000)
    const ledger = await db.ledger_entries.where('shop_id').equals(shop.id).toArray()
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({
      entry_type: 'purchase_payment',
      amount_paise: -4000,
      balance_after_paise: 6000,
      supplier_id: supplier.id,
    })
  })

  it('never lets the balance go negative', async () => {
    await seedBasics()
    const supplier = makeSupplier({ balance_paise: 1000 })
    await db.suppliers.put(supplier)

    await paySupplier(supplier.id, 5000, owner)

    expect((await db.suppliers.get(supplier.id))?.balance_paise).toBe(0)
  })

  it('rejects a zero payment and unknown suppliers', async () => {
    await seedBasics()
    const supplier = makeSupplier()
    await db.suppliers.put(supplier)
    await expect(paySupplier(supplier.id, 0, owner)).rejects.toThrow(/0 se zyada/i)
    await expect(paySupplier('nope', 100, owner)).rejects.toThrow(/not found/i)
  })
})

describe('saveSupplier', () => {
  it('creates and then updates without losing the balance', async () => {
    await seedBasics()
    const created = await saveSupplier(SHOP_ID, {
      name: '  Gupta Traders  ',
      phone: '9000000000',
      company: null,
      gstin: null,
      address: null,
      notes: null,
    })
    expect(created.name).toBe('Gupta Traders')

    await db.suppliers.put({ ...created, balance_paise: 2500 })
    const updated = await saveSupplier(SHOP_ID, {
      id: created.id,
      name: 'Gupta Traders',
      phone: '9111111111',
      company: 'Gupta & Co',
      gstin: null,
      address: null,
      notes: 'Monday delivery',
    })

    expect(updated.id).toBe(created.id)
    expect(updated.balance_paise).toBe(2500)
    expect(updated.phone).toBe('9111111111')
    expect(await db.suppliers.count()).toBe(1)
  })
})

describe('order list', () => {
  it('suggests enough stock to reach twice the low-stock limit', async () => {
    const low = makeProduct({ id: 'low', name_en: 'Parle-G', stock_qty: 1, low_stock_limit: 5, purchase_price_paise: 800 })
    const healthy = makeProduct({ id: 'ok', stock_qty: 50, low_stock_limit: 5 })
    const inactive = makeProduct({ id: 'off', stock_qty: 0, is_active: false })

    const list = buildOrderList([healthy, low, inactive])

    expect(list).toHaveLength(1)
    // target = 2 × 5 = 10 → 10 − 1 = 9
    expect(list[0].suggested_qty).toBe(9)
    expect(list[0].estimated_cost_paise).toBe(9 * 800)
  })

  it('sorts the emptiest products first and builds WhatsApp text', async () => {
    const a = makeProduct({ id: 'a', name_en: 'Atta', stock_qty: 2, low_stock_limit: 5 })
    const b = makeProduct({ id: 'b', name_en: 'Rice', stock_qty: 0, low_stock_limit: 5 })

    const list = buildOrderList([a, b])
    expect(list.map((row) => row.product.id)).toEqual(['b', 'a'])

    const text = orderListText(list, 'Sharma Kirana')
    expect(text).toContain('Sharma Kirana')
    expect(text).toContain('Rice')
    expect(text).toMatch(/Order List/)
  })
})

describe('stock audit', () => {
  it('applies counted quantities on close and logs movements', async () => {
    const { shop, product } = await seedBasics()
    const audit = await startStockAudit(shop.id, 'Diwali audit', owner)
    expect(audit.status).toBe('open')

    await upsertAuditCount(audit.id, product, 18)
    const adjusted = await closeStockAudit(audit.id, owner, true)

    expect(adjusted).toBe(1)
    expect((await db.products.get(product.id))?.stock_qty).toBe(18)

    const movements = await db.stock_movements.where('product_id').equals(product.id).toArray()
    const auditMove = movements.find((row) => row.movement_type === 'audit')
    expect(auditMove?.qty_change).toBe(-2)
    expect(auditMove?.reference_id).toBe(audit.id)

    expect((await db.stock_audits.get(audit.id))?.status).toBe('closed')
    const audits = await db.audit_logs.where('shop_id').equals(shop.id).toArray()
    expect(audits.some((row) => row.action === 'audit_applied')).toBe(true)
  })

  it('leaves stock untouched when closed without applying', async () => {
    const { shop, product } = await seedBasics()
    const audit = await startStockAudit(shop.id, 'Dry run', owner)
    await upsertAuditCount(audit.id, product, 5)

    const adjusted = await closeStockAudit(audit.id, owner, false)

    expect(adjusted).toBe(0)
    expect((await db.products.get(product.id))?.stock_qty).toBe(20)
    expect((await db.stock_audits.get(audit.id))?.status).toBe('closed')
  })

  it('updates a count instead of duplicating it', async () => {
    const { shop, product } = await seedBasics()
    const audit = await startStockAudit(shop.id, 'Recount', owner)

    await upsertAuditCount(audit.id, product, 12)
    await upsertAuditCount(audit.id, product, 16)

    const rows = await db.stock_audit_items.where('audit_id').equals(audit.id).toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].counted_qty).toBe(16)
    expect(rows[0].system_qty).toBe(20)
  })
})
