import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { toPaise } from '../lib/money'
import { addManualUdhaar, customerLedger, findCustomerByPhone, recordRepayment, reminderText, saveCustomer } from './khata'
import { cashier, makeCustomer, owner, resetDb, seedBasics } from '../test/fixtures'

beforeEach(async () => {
  await resetDb()
})

describe('customers', () => {
  it('creates a customer with a credit limit', async () => {
    const { shop } = await seedBasics()
    const customer = await saveCustomer(
      shop.id,
      { name: 'Sunil', phone: '9998887776', address: null, credit_limit: 2000, notes: null },
      owner,
    )
    expect(customer.credit_limit_paise).toBe(200000)
    expect(customer.balance_paise).toBe(0)
  })

  it('rejects a duplicate phone number in the same shop', async () => {
    const { shop } = await seedBasics()
    await expect(
      saveCustomer(shop.id, { name: 'Duplicate', phone: '9876500011', address: null, credit_limit: 0, notes: null }, owner),
    ).rejects.toThrow(/number/i)
  })

  it('finds a customer by phone', async () => {
    const { customer } = await seedBasics()
    const found = await findCustomerByPhone(customer.shop_id, '9876500011')
    expect(found?.id).toBe(customer.id)
  })
})

describe('repayments', () => {
  it('reduces the balance and appends a ledger entry', async () => {
    const { customer } = await seedBasics()
    await db.customers.put({ ...customer, balance_paise: toPaise(500) })

    const updated = await recordRepayment(customer.id, toPaise(200), 'cash', cashier)
    expect(updated.balance_paise).toBe(toPaise(300))

    const ledger = await customerLedger(customer.id)
    expect(ledger[0].entry_type).toBe('payment')
    expect(ledger[0].amount_paise).toBe(-toPaise(200))
    expect(ledger[0].balance_after_paise).toBe(toPaise(300))
  })

  it('refuses to collect more than the pending balance', async () => {
    const { customer } = await seedBasics()
    await db.customers.put({ ...customer, balance_paise: toPaise(100) })
    await expect(recordRepayment(customer.id, toPaise(500), 'cash', cashier)).rejects.toThrow(/baaki|exceeds/i)
  })

  it('refuses a zero or negative repayment', async () => {
    const { customer } = await seedBasics()
    await db.customers.put({ ...customer, balance_paise: toPaise(100) })
    await expect(recordRepayment(customer.id, 0, 'cash', cashier)).rejects.toThrow(/0 se zyada/i)
  })
})

describe('manual udhaar', () => {
  it('adds to the balance within the credit limit', async () => {
    const { customer } = await seedBasics()
    const updated = await addManualUdhaar(customer.id, toPaise(400), owner, 'purana hisab')
    expect(updated.balance_paise).toBe(toPaise(400))
  })

  it('blocks crossing the credit limit', async () => {
    const { customer } = await seedBasics()
    const tight = makeCustomer({ id: 'c-limit', credit_limit_paise: toPaise(300), balance_paise: toPaise(200) })
    await db.customers.put(tight)
    await expect(addManualUdhaar(tight.id, toPaise(200), owner, 'test')).rejects.toThrow(/limit/i)
  })
})

describe('reminders', () => {
  it('writes a Hindi-friendly WhatsApp reminder with the amount', async () => {
    const { customer } = await seedBasics()
    const text = reminderText({ ...customer, balance_paise: toPaise(1250) }, 'Sharma Kirana', '9876543210')
    expect(text).toContain('Ramesh Kumar')
    expect(text).toContain('₹1250')
    expect(text).toContain('Sharma Kirana')
  })
})

describe('khata sync queue', () => {
  it('queues the balance change and the ledger entry', async () => {
    const { customer } = await seedBasics()
    await db.customers.put({ ...customer, balance_paise: toPaise(200) })

    await recordRepayment(customer.id, toPaise(200), 'cash', owner)

    const tables = [...new Set((await db.outbox.toArray()).map((row) => row.table_name))].sort()
    expect(tables).toEqual(['audit_logs', 'customers', 'ledger_entries'])
    expect((await db.customers.get(customer.id))?.balance_paise).toBe(0)
  })
})
