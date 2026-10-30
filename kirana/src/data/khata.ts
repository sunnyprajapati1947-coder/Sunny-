import { db, localUpsert } from '../lib/db'
import { uuid } from '../lib/id'
import { sync } from '../lib/sync'
import { toPaise } from '../lib/money'
import type { Customer, LedgerEntry, SessionUser } from '../types'
import { writeAudit } from './audit'

export interface CustomerInput {
  id?: string
  name: string
  phone: string | null
  address: string | null
  credit_limit: number
  notes: string | null
}

export async function saveCustomer(shopId: string, input: CustomerInput, actor: SessionUser): Promise<Customer> {
  const existing = input.id ? await db.customers.get(input.id) : undefined
  if (input.phone) {
    const duplicate = await db.customers
      .where('shop_id')
      .equals(shopId)
      .filter((c) => c.phone === input.phone && c.id !== input.id)
      .first()
    if (duplicate) throw new Error(`Ye number "${duplicate.name}" ke naam par hai`)
  }
  const now = new Date().toISOString()
  const customer: Customer = {
    id: input.id ?? uuid(),
    shop_id: shopId,
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
    credit_limit_paise: toPaise(input.credit_limit),
    balance_paise: existing?.balance_paise ?? 0,
    loyalty_points: existing?.loyalty_points ?? 0,
    notes: input.notes,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  }
  await localUpsert('customers', customer)
  if (existing && existing.credit_limit_paise !== customer.credit_limit_paise) {
    await writeAudit({
      shopId,
      actor,
      entity: 'customer',
      entityId: customer.id,
      action: 'credit_limit_change',
      oldValue: { credit_limit_paise: existing.credit_limit_paise },
      newValue: { credit_limit_paise: customer.credit_limit_paise },
    })
  }
  sync.schedule()
  return customer
}

export async function findCustomerByPhone(shopId: string, phone: string): Promise<Customer | undefined> {
  return db.customers.where('shop_id').equals(shopId).filter((c) => c.phone === phone).first()
}

export async function recordRepayment(
  customerId: string,
  amountPaise: number,
  mode: 'cash' | 'upi' | 'card',
  actor: SessionUser,
  note?: string,
): Promise<Customer> {
  const customer = await db.customers.get(customerId)
  if (!customer) throw new Error('Customer not found')
  const amount = Math.round(amountPaise)
  if (amount <= 0) throw new Error('Amount 0 se zyada hona chahiye')
  if (amount > customer.balance_paise) {
    throw new Error('Itna udhaar baaki hi nahi hai / Amount exceeds pending balance')
  }
  const now = new Date().toISOString()
  const balance = customer.balance_paise - amount
  const updated: Customer = { ...customer, balance_paise: balance, updated_at: now }
  await localUpsert('customers', updated)
  const entry: LedgerEntry = {
    id: uuid(),
    shop_id: customer.shop_id,
    customer_id: customerId,
    supplier_id: null,
    entry_type: 'payment',
    amount_paise: -amount,
    balance_after_paise: balance,
    reference_type: mode,
    reference_id: null,
    note: note ?? `Udhaar vasooli (${mode})`,
    created_by: actor.id,
    created_at: now,
  }
  await localUpsert('ledger_entries', entry)
  await writeAudit({
    shopId: customer.shop_id,
    actor,
    entity: 'customer',
    entityId: customerId,
    action: 'repayment',
    oldValue: { balance_paise: customer.balance_paise },
    newValue: { balance_paise: balance, amount_paise: amount, mode },
  })
  sync.schedule()
  return updated
}

export async function addManualUdhaar(
  customerId: string,
  amountPaise: number,
  actor: SessionUser,
  note: string,
): Promise<Customer> {
  const customer = await db.customers.get(customerId)
  if (!customer) throw new Error('Customer not found')
  const amount = Math.round(amountPaise)
  if (amount <= 0) throw new Error('Amount 0 se zyada hona chahiye')
  const now = new Date().toISOString()
  const balance = customer.balance_paise + amount
  if (customer.credit_limit_paise > 0 && balance > customer.credit_limit_paise) {
    throw new Error('Credit limit se zyada / Credit limit exceeded')
  }
  await localUpsert('customers', { ...customer, balance_paise: balance, updated_at: now })
  await localUpsert('ledger_entries', {
    id: uuid(),
    shop_id: customer.shop_id,
    customer_id: customerId,
    supplier_id: null,
    entry_type: 'udhaar',
    amount_paise: amount,
    balance_after_paise: balance,
    reference_type: 'manual',
    reference_id: null,
    note,
    created_by: actor.id,
    created_at: now,
  })
  await writeAudit({
    shopId: customer.shop_id,
    actor,
    entity: 'customer',
    entityId: customerId,
    action: 'manual_udhaar',
    oldValue: { balance_paise: customer.balance_paise },
    newValue: { balance_paise: balance, amount_paise: amount, note },
  })
  sync.schedule()
  return { ...customer, balance_paise: balance, updated_at: now }
}

export async function customerLedger(customerId: string): Promise<LedgerEntry[]> {
  const rows = await db.ledger_entries.where('customer_id').equals(customerId).toArray()
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export function reminderText(customer: Customer, shopName: string, shopPhone?: string | null): string {
  const amount = (customer.balance_paise / 100).toFixed(0)
  return `Namaste ${customer.name} ji 🙏\n\n*${shopName}* se yaad dilana chahte hain ki aapka ₹${amount} ka udhaar baaki hai.\n\nKripya jaldi payment kar dein.\n${shopPhone ? `Sampark: ${shopPhone}\n` : ''}\nDhanyavaad!`
}

export function reminderWhatsAppLink(customer: Customer, shopName: string, shopPhone?: string | null): string {
  const digits = (customer.phone ?? '').replace(/\D/g, '')
  const withCountry = digits.length === 10 ? `91${digits}` : digits
  const text = encodeURIComponent(reminderText(customer, shopName, shopPhone))
  return digits ? `https://wa.me/${withCountry}?text=${text}` : `https://wa.me/?text=${text}`
}

export function smsReminderLink(customer: Customer, shopName: string): string {
  const digits = (customer.phone ?? '').replace(/\D/g, '')
  const text = encodeURIComponent(`Namaste ${customer.name} ji, ${shopName} me aapka Rs.${(customer.balance_paise / 100).toFixed(0)} udhaar baaki hai. Dhanyavaad.`)
  return `sms:${digits ? `+91${digits.slice(-10)}` : ''}?body=${text}`
}
