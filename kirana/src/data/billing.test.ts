import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { toPaise } from '../lib/money'
import { cartLineFromProduct, finalizeBill, holdBill, listHeldBills, returnBillItems, voidBill } from './billing'
import { cashier, makeCustomer, makeProduct, manager, owner, resetDb, seedBasics } from '../test/fixtures'
import type { OwnerApproval } from '../types'

const discountApproval: OwnerApproval = {
  approvedBy: owner.id,
  permission: 'billing.discount',
  at: new Date().toISOString(),
  maxDiscountPaise: 1000,
}

beforeEach(async () => {
  await resetDb()
})

describe('finalizeBill — price & discount security', () => {
  it('prices every line from the database, not from the cart payload', async () => {
    const { shop, product } = await seedBasics()
    const tampered = { ...cartLineFromProduct(product, 2), unit_price_paise: toPaise(1) }

    const result = await finalizeBill({
      shop,
      actor: cashier,
      lines: [tampered],
      taxMode: 'inclusive',
      manualDiscountPaise: 0,
      customer: { id: null, name: null, phone: null },
      payments: [{ mode: 'cash', amount_paise: toPaise(56), reference: null }],
    })

    expect(result.items[0].unit_price_paise).toBe(toPaise(28))
    expect(result.bill.total_paise).toBe(toPaise(56))
  })

  it('rejects a discount given by a cashier even if the UI is bypassed', async () => {
    const { shop, product } = await seedBasics()
    await expect(
      finalizeBill({
        shop,
        actor: cashier,
        lines: [cartLineFromProduct(product, 1)],
        taxMode: 'inclusive',
        manualDiscountPaise: toPaise(5),
        approval: discountApproval,
        customer: { id: null, name: null, phone: null },
        payments: [{ mode: 'cash', amount_paise: toPaise(28), reference: null }],
      }),
    ).rejects.toThrow(/owner/i)
  })

  it('rejects an owner discount without re-authentication', async () => {
    const { shop, product } = await seedBasics()
    await expect(
      finalizeBill({
        shop,
        actor: owner,
        lines: [cartLineFromProduct(product, 1)],
        taxMode: 'inclusive',
        manualDiscountPaise: toPaise(5),
        customer: { id: null, name: null, phone: null },
        payments: [{ mode: 'cash', amount_paise: toPaise(23), reference: null }],
      }),
    ).rejects.toThrow(/PIN|re-auth/i)
  })

  it('enforces the shop maximum discount percentage', async () => {
    const { shop, product } = await seedBasics()
    // 10% of ₹28 = ₹2.80 → asking ₹5 must fail.
    await expect(
      finalizeBill({
        shop,
        actor: owner,
        lines: [cartLineFromProduct(product, 1)],
        taxMode: 'inclusive',
        manualDiscountPaise: toPaise(5),
        approval: discountApproval,
        customer: { id: null, name: null, phone: null },
        payments: [{ mode: 'cash', amount_paise: toPaise(23), reference: null }],
      }),
    ).rejects.toThrow(/Discount/i)
  })

  it('accepts an owner discount inside the cap and records an audit entry', async () => {
    const { shop, product } = await seedBasics()
    const result = await finalizeBill({
      shop,
      actor: owner,
      lines: [cartLineFromProduct(product, 2)],
      taxMode: 'inclusive',
      manualDiscountPaise: toPaise(5),
      approval: discountApproval,
      customer: { id: null, name: null, phone: null },
      payments: [{ mode: 'cash', amount_paise: toPaise(51), reference: null }],
    })

    expect(result.bill.discount_paise).toBe(toPaise(5))
    expect(result.bill.manual_discount_paise).toBe(toPaise(5))

    const logs = await db.audit_logs.where('shop_id').equals(shop.id).toArray()
    expect(logs.some((log) => log.action === 'manual_discount')).toBe(true)
    expect(logs.some((log) => log.action === 'create')).toBe(true)
  })

  it('rejects a cash payment that does not cover the total', async () => {
    const { shop, product } = await seedBasics()
    await expect(
      finalizeBill({
        shop,
        actor: cashier,
        lines: [cartLineFromProduct(product, 2)],
        taxMode: 'inclusive',
        manualDiscountPaise: 0,
        customer: { id: null, name: null, phone: null },
        payments: [{ mode: 'cash', amount_paise: toPaise(10), reference: null }],
      }),
    ).rejects.toThrow(/Payment kam/i)
  })

  it('returns change when the customer pays with a bigger note', async () => {
    const { shop, product } = await seedBasics()
    const result = await finalizeBill({
      shop,
      actor: cashier,
      lines: [cartLineFromProduct(product, 1)],
      taxMode: 'inclusive',
      manualDiscountPaise: 0,
      customer: { id: null, name: null, phone: null },
      payments: [{ mode: 'cash', amount_paise: toPaise(100), reference: null }],
    })
    expect(result.changePaise).toBe(toPaise(100) - toPaise(28))
  })
})

describe('finalizeBill — stock and khata', () => {
  it('reduces stock and writes a stock movement', async () => {
    const { shop, product } = await seedBasics()
    await finalizeBill({
      shop,
      actor: cashier,
      lines: [cartLineFromProduct(product, 3)],
      taxMode: 'inclusive',
      manualDiscountPaise: 0,
      customer: { id: null, name: null, phone: null },
      payments: [{ mode: 'upi', amount_paise: toPaise(84), reference: null }],
    })
    const updated = await db.products.get(product.id)
    expect(updated?.stock_qty).toBe(17)
    const movements = await db.stock_movements.where('product_id').equals(product.id).toArray()
    expect(movements[0].movement_type).toBe('sale')
    expect(movements[0].qty_change).toBe(-3)
  })

  it('adds udhaar to the customer ledger', async () => {
    const { shop, product, customer } = await seedBasics()
    await finalizeBill({
      shop,
      actor: cashier,
      lines: [cartLineFromProduct(product, 2)],
      taxMode: 'inclusive',
      manualDiscountPaise: 0,
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
      payments: [{ mode: 'udhaar', amount_paise: toPaise(56), reference: null }],
    })
    const updated = await db.customers.get(customer.id)
    expect(updated?.balance_paise).toBe(toPaise(56))
    const ledger = await db.ledger_entries.where('customer_id').equals(customer.id).toArray()
    expect(ledger[0].entry_type).toBe('udhaar')
    expect(ledger[0].amount_paise).toBe(toPaise(56))
  })

  it('blocks udhaar beyond the customer credit limit', async () => {
    const { shop, product } = await seedBasics()
    const tight = makeCustomer({ id: 'c2', credit_limit_paise: toPaise(50), balance_paise: toPaise(40) })
    await db.customers.put(tight)
    await expect(
      finalizeBill({
        shop,
        actor: cashier,
        lines: [cartLineFromProduct(product, 2)],
        taxMode: 'inclusive',
        manualDiscountPaise: 0,
        customer: { id: tight.id, name: tight.name, phone: tight.phone },
        payments: [{ mode: 'udhaar', amount_paise: toPaise(56), reference: null }],
      }),
    ).rejects.toThrow(/limit/i)
  })

  it('requires a customer for udhaar', async () => {
    const { shop, product } = await seedBasics()
    await expect(
      finalizeBill({
        shop,
        actor: cashier,
        lines: [cartLineFromProduct(product, 1)],
        taxMode: 'inclusive',
        manualDiscountPaise: 0,
        customer: { id: null, name: null, phone: null },
        payments: [{ mode: 'udhaar', amount_paise: toPaise(28), reference: null }],
      }),
    ).rejects.toThrow(/customer/i)
  })

  it('supports split payments', async () => {
    const { shop, product, customer } = await seedBasics()
    const result = await finalizeBill({
      shop,
      actor: cashier,
      lines: [cartLineFromProduct(product, 2)],
      taxMode: 'inclusive',
      manualDiscountPaise: 0,
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
      payments: [
        { mode: 'cash', amount_paise: toPaise(30), reference: null },
        { mode: 'udhaar', amount_paise: toPaise(26), reference: null },
      ],
    })
    expect(result.payments).toHaveLength(2)
    expect(result.bill.payment_status).toBe('paid')
  })

  it('earns loyalty points for the customer', async () => {
    const { shop, product, customer } = await seedBasics()
    await db.customers.put({ ...customer, loyalty_points: 0 })
    await finalizeBill({
      shop,
      actor: cashier,
      lines: [cartLineFromProduct(product, 4)],
      taxMode: 'inclusive',
      manualDiscountPaise: 0,
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
      payments: [{ mode: 'cash', amount_paise: toPaise(112), reference: null }],
    })
    const updated = await db.customers.get(customer.id)
    // ₹112 → floor(1.12) = 1 point (1 point per ₹100 spent)
    expect(updated?.loyalty_points).toBe(1)
  })
})

describe('held bills', () => {
  it('holds and resumes a cart without touching stock', async () => {
    const { shop, product } = await seedBasics()
    const bill = await holdBill({
      shop,
      actor: cashier,
      lines: [cartLineFromProduct(product, 2)],
      customer: { id: null, name: null, phone: null },
      note: 'Ramesh ke ghar',
    })
    const stock = await db.products.get(product.id)
    expect(stock?.stock_qty).toBe(20)

    const held = await listHeldBills(shop.id)
    expect(held).toHaveLength(1)
    expect(held[0].lines[0].qty).toBe(2)
    expect(bill.status).toBe('held')
  })
})

describe('void & returns', () => {
  it('only the owner can void a bill, and stock comes back', async () => {
    const { shop, product } = await seedBasics()
    const sale = await finalizeBill({
      shop,
      actor: cashier,
      lines: [cartLineFromProduct(product, 2)],
      taxMode: 'inclusive',
      manualDiscountPaise: 0,
      customer: { id: null, name: null, phone: null },
      payments: [{ mode: 'cash', amount_paise: toPaise(56), reference: null }],
    })

    await expect(
      voidBill(sale.bill.id, 'mistake', cashier, {
        approvedBy: cashier.id,
        permission: 'billing.void',
        at: new Date().toISOString(),
      }),
    ).rejects.toThrow(/owner/i)

    await voidBill(sale.bill.id, 'galat bill', owner, {
      approvedBy: owner.id,
      permission: 'billing.void',
      at: new Date().toISOString(),
    })

    const voided = await db.bills.get(sale.bill.id)
    expect(voided?.status).toBe('void')
    const stock = await db.products.get(product.id)
    expect(stock?.stock_qty).toBe(20)
  })

  it('records a partial return and restores stock + audit', async () => {
    const { shop, product } = await seedBasics()
    const sale = await finalizeBill({
      shop,
      actor: cashier,
      lines: [cartLineFromProduct(product, 4)],
      taxMode: 'inclusive',
      manualDiscountPaise: 0,
      customer: { id: null, name: null, phone: null },
      payments: [{ mode: 'cash', amount_paise: toPaise(112), reference: null }],
    })

    const result = await returnBillItems({
      billId: sale.bill.id,
      items: [{ item_id: sale.items[0].id, qty: 1 }],
      reason: 'packet phat gaya',
      refundMode: 'cash',
      actor: owner,
      approval: { approvedBy: owner.id, permission: 'billing.refund', at: new Date().toISOString() },
    })

    expect(result.refundPaise).toBe(toPaise(28))
    const stock = await db.products.get(product.id)
    expect(stock?.stock_qty).toBe(17)
    const logs = await db.audit_logs.where('entity').equals('bill').toArray()
    expect(logs.some((log) => log.action === 'return')).toBe(true)
  })

  it('refuses a return from a manager', async () => {
    const { shop, product } = await seedBasics()
    const sale = await finalizeBill({
      shop,
      actor: cashier,
      lines: [cartLineFromProduct(product, 1)],
      taxMode: 'inclusive',
      manualDiscountPaise: 0,
      customer: { id: null, name: null, phone: null },
      payments: [{ mode: 'cash', amount_paise: toPaise(28), reference: null }],
    })
    await expect(
      returnBillItems({
        billId: sale.bill.id,
        items: [{ item_id: sale.items[0].id, qty: 1 }],
        reason: 'test',
        refundMode: 'cash',
        actor: manager,
        approval: { approvedBy: manager.id, permission: 'billing.refund', at: new Date().toISOString() },
      }),
    ).rejects.toThrow(/owner/i)
  })
})

describe('sync queue — cloud replay', () => {
  it('queues the bill, lines, payments, stock and khata rows for upload', async () => {
    const { shop, product, customer } = await seedBasics()

    await finalizeBill({
      shop,
      actor: owner,
      lines: [cartLineFromProduct(product, 2)],
      taxMode: 'inclusive',
      manualDiscountPaise: 0,
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
      payments: [{ mode: 'udhaar', amount_paise: toPaise(56), reference: null }],
    })

    const pending = await db.outbox.toArray()
    const tables = [...new Set(pending.map((row) => row.table_name))].sort()
    expect(tables).toEqual(
      ['audit_logs', 'bill_items', 'bills', 'customers', 'ledger_entries', 'payments', 'products', 'stock_movements'].sort(),
    )
    // A queued row must carry a full payload, otherwise the server insert fails.
    const billRow = pending.find((row) => row.table_name === 'bills')
    expect(billRow?.payload).toMatchObject({ shop_id: shop.id, status: 'paid' })
    expect(pending.every((row) => row.attempts === 0 && row.last_error === null)).toBe(true)
  })
})
