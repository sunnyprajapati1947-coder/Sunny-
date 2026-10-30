import { db, getMeta, localUpsert, localUpsertMany, setMeta } from '../lib/db'
import { uuid } from '../lib/id'
import { sync } from '../lib/sync'
import { billDateStamp, istDateKey } from '../lib/date'
import { clamp, computeTotals, percentOf, type TaxMode } from '../lib/money'
import type {
  Bill,
  BillItem,
  BillTotals,
  CartLine,
  Customer,
  LedgerEntry,
  OwnerApproval,
  Payment,
  PaymentInput,
  Product,
  SessionUser,
  Shop,
} from '../types'
import { writeAudit } from './audit'
import { recordStockMovement } from './products'

export const LOYALTY_EARN_PER_RUPEES = 100 // 1 point per ₹100
export const LOYALTY_POINT_VALUE_PAISE = 100 // 1 point = ₹1
export const MAX_LOYALTY_REDEEM_PERCENT = 10

export interface FinalizeBillInput {
  shop: Shop
  actor: SessionUser
  lines: CartLine[]
  taxMode: TaxMode
  manualDiscountPaise: number
  customer: { id: string | null; name: string | null; phone: string | null }
  payments: PaymentInput[]
  note?: string | null
  approval?: OwnerApproval | null
  redeemPoints?: number
  /** Auto-applied owner offers (already validated by applyOffers). */
  offerDiscountPaise?: number
}

export interface FinalizeBillResult {
  bill: Bill
  items: BillItem[]
  payments: Payment[]
  changePaise: number
}

async function nextBillNo(shop: Shop): Promise<string> {
  const dateKey = istDateKey()
  const key = `bill_counter:${shop.id}:${dateKey}`
  const current = await getMeta<number>(key, 0)
  const next = current + 1
  await setMeta(key, next)
  return `${shop.bill_prefix || 'BILL'}-${billDateStamp()}-${String(next).padStart(3, '0')}`
}

/**
 * Finalizes a bill. Prices are re-read from IndexedDB (never trusted from the
 * cart) so a cashier devtools edit cannot change what the customer pays.
 */
export async function finalizeBill(input: FinalizeBillInput): Promise<FinalizeBillResult> {
  const { shop, actor, taxMode } = input
  if (!input.lines.length) throw new Error('Cart khali hai / Cart is empty')

  const products = await db.products.bulkGet(input.lines.map((line) => line.product_id))
  const pricedLines = input.lines.map((line) => {
    const product = products.find((p) => p?.id === line.product_id)
    if (!product) throw new Error(`${line.name_en} ab available nahi hai / product missing`)
    return { line, product }
  })

  const taxLines = pricedLines.map(({ line, product }) => ({
    amount_paise: Math.round(line.qty * product.selling_price_paise),
    gst_rate: product.gst_rate,
    line,
    product,
  }))

  const gross = taxLines.reduce((sum, l) => sum + l.amount_paise, 0)

  // Discount rules: manual discount needs owner + approval + shop cap.
  const manual = clamp(Math.round(input.manualDiscountPaise || 0), 0, gross)
  if (manual > 0) {
    if (actor.role !== 'owner') {
      throw new Error('Discount sirf owner de sakta hai / Only the owner can give a discount')
    }
    if (!input.approval || input.approval.permission !== 'billing.discount') {
      throw new Error('Owner PIN zaroori hai / Owner re-authentication required')
    }
    const cap = percentOf(gross, shop.max_discount_percent ?? 10)
    if (manual > cap) {
      throw new Error(`Discount ₹${(cap / 100).toFixed(0)} se zyada nahi ho sakta (${shop.max_discount_percent}% max)`)
    }
  }

  const offerDiscount = clamp(Math.round(input.offerDiscountPaise || 0), 0, gross)
  const loyaltyRedeem = Math.max(0, Math.round(input.redeemPoints || 0))
  let loyaltyDiscount = 0
  if (loyaltyRedeem > 0) {
    loyaltyDiscount = Math.min(
      loyaltyRedeem * LOYALTY_POINT_VALUE_PAISE,
      percentOf(gross, MAX_LOYALTY_REDEEM_PERCENT),
      gross - manual - offerDiscount,
    )
  }

  const totals = computeTotals(taxLines, {
    taxMode,
    discount_paise: offerDiscount + manual + Math.max(0, loyaltyDiscount),
    roundOff: true,
  })

  // Payments must cover the bill; cash may exceed (change is returned).
  const payments = input.payments.filter((p) => p.amount_paise > 0)
  const nonCashTotal = payments
    .filter((p) => p.mode !== 'cash')
    .reduce((sum, p) => sum + Math.round(p.amount_paise), 0)
  const cashTotal = payments
    .filter((p) => p.mode === 'cash')
    .reduce((sum, p) => sum + Math.round(p.amount_paise), 0)
  const paidTotal = nonCashTotal + cashTotal
  if (paidTotal < totals.total_paise) {
    throw new Error(`Payment kam hai: ₹${(totals.total_paise - paidTotal) / 100} baaki hai`)
  }
  const udhaarTotal = payments.filter((p) => p.mode === 'udhaar').reduce((sum, p) => sum + p.amount_paise, 0)
  if (udhaarTotal > 0 && !input.customer.id) {
    throw new Error('Udhaar ke liye customer chuniye / Select a customer for credit')
  }
  const changePaise = cashTotal > 0 ? Math.max(0, paidTotal - totals.total_paise) : 0

  const customer = input.customer.id ? await db.customers.get(input.customer.id) : null
  if (customer && udhaarTotal > 0) {
    const projected = customer.balance_paise + udhaarTotal
    if (customer.credit_limit_paise > 0 && projected > customer.credit_limit_paise) {
      const over = (projected - customer.credit_limit_paise) / 100
      throw new Error(`Credit limit se ₹${over.toFixed(0)} zyada ho raha hai / Credit limit exceeded`)
    }
  }

  const now = new Date().toISOString()
  const billId = uuid()
  const billNo = await nextBillNo(shop)
  const bill: Bill = {
    id: billId,
    shop_id: shop.id,
    bill_no: billNo,
    customer_id: input.customer.id,
    customer_name: input.customer.name,
    customer_phone: input.customer.phone,
    cashier_id: actor.id,
    cashier_name: actor.name,
    subtotal_paise: totals.subtotal_paise,
    discount_paise: totals.discount_paise,
    manual_discount_paise: manual,
    offer_discount_paise: offerDiscount + Math.max(0, loyaltyDiscount),
    taxable_paise: totals.taxable_paise,
    tax_paise: totals.tax_paise,
    round_off_paise: totals.round_off_paise,
    total_paise: totals.total_paise,
    status: 'paid',
    payment_status: paidTotal >= totals.total_paise ? 'paid' : 'partial',
    note: input.note ?? null,
    created_at: now,
    finalized_at: now,
    updated_at: now,
  }

  const items: BillItem[] = taxLines.map(({ line, product }) => {
    const lineTotal = Math.round(line.qty * product.selling_price_paise)
    const tax = Math.round(lineTotal - lineTotal / (1 + product.gst_rate / 100))
    return {
      id: uuid(),
      bill_id: billId,
      shop_id: shop.id,
      product_id: product.id,
      name_en: product.name_en,
      name_hi: product.name_hi,
      barcode: product.barcode,
      qty: line.qty,
      unit: product.unit,
      unit_price_paise: product.selling_price_paise,
      mrp_paise: product.mrp_paise,
      gst_rate: product.gst_rate,
      line_total_paise: lineTotal,
      taxable_paise: lineTotal - tax,
      tax_paise: tax,
      cost_paise: product.purchase_price_paise,
      created_at: now,
    }
  })

  const paymentRows: Payment[] = payments.map((payment) => ({
    id: uuid(),
    bill_id: billId,
    shop_id: shop.id,
    mode: payment.mode,
    amount_paise: Math.round(payment.amount_paise),
    reference: payment.reference ?? null,
    created_at: now,
  }))

  await db.transaction(
    'rw',
    // Every table touched inside the transaction must be declared, including
    // the outbox (stock movements enqueue themselves for sync).
    [db.bills, db.bill_items, db.payments, db.products, db.stock_movements, db.customers, db.ledger_entries, db.outbox],
    async () => {
      await localUpsert('bills', bill)
      await localUpsertMany('bill_items', items)
      await localUpsertMany('payments', paymentRows)

      for (const item of items) {
        const product = pricedLines.find((p) => p.product.id === item.product_id)?.product
        if (!product) continue
        const newQty = Math.round((product.stock_qty - item.qty) * 1000) / 1000
        await localUpsert('products', {
          ...product,
          stock_qty: newQty,
          updated_at: now,
        })
        await recordStockMovement({
          shop_id: shop.id,
          product_id: product.id,
          movement_type: 'sale',
          qty_change: -item.qty,
          qty_after: newQty,
          reference_type: 'bill',
          reference_id: billId,
          created_by: actor.id,
        })
      }

      if (customer) {
        const earnPoints = Math.floor(totals.total_paise / 100 / LOYALTY_EARN_PER_RUPEES)
        const newBalance = customer.balance_paise + udhaarTotal
        const updatedCustomer: Customer = {
          ...customer,
          balance_paise: newBalance,
          loyalty_points: Math.max(0, customer.loyalty_points + earnPoints - loyaltyRedeem),
          updated_at: now,
        }
        await localUpsert('customers', updatedCustomer)
        if (udhaarTotal > 0) {
          const entry: LedgerEntry = {
            id: uuid(),
            shop_id: shop.id,
            customer_id: customer.id,
            supplier_id: null,
            entry_type: 'udhaar',
            amount_paise: udhaarTotal,
            balance_after_paise: newBalance,
            reference_type: 'bill',
            reference_id: billId,
            note: `Bill ${billNo}`,
            created_by: actor.id,
            created_at: now,
          }
          await localUpsert('ledger_entries', entry)
        }
      }
    },
  )

  await writeAudit({
    shopId: shop.id,
    actor,
    entity: 'bill',
    entityId: billId,
    action: 'create',
    newValue: {
      bill_no: billNo,
      total_paise: totals.total_paise,
      discount_paise: totals.discount_paise,
      manual_discount_paise: manual,
      offer_discount_paise: offerDiscount,
      loyalty_discount_paise: loyaltyDiscount,
      payments: paymentRows.map((p) => `${p.mode}:${p.amount_paise}`).join(','),
    },
  })
  if (manual > 0) {
    await writeAudit({
      shopId: shop.id,
      actor,
      entity: 'discount',
      entityId: billId,
      action: 'manual_discount',
      newValue: { amount_paise: manual, bill_no: billNo, approval_at: input.approval?.at ?? null },
    })
  }

  sync.schedule(300)
  return { bill, items, payments: paymentRows, changePaise }
}

export interface HeldBill {
  bill: Bill
  lines: CartLine[]
}

/** Holds a cart (multiple customers at once) without touching stock. */
export async function holdBill(input: {
  shop: Shop
  actor: SessionUser
  lines: CartLine[]
  customer: { id: string | null; name: string | null; phone: string | null }
  note?: string | null
}): Promise<Bill> {
  const now = new Date().toISOString()
  const billId = uuid()
  const bill: Bill = {
    id: billId,
    shop_id: input.shop.id,
    bill_no: `HOLD-${await nextBillNo(input.shop)}`,
    customer_id: input.customer.id,
    customer_name: input.customer.name,
    customer_phone: input.customer.phone,
    cashier_id: input.actor.id,
    cashier_name: input.actor.name,
    subtotal_paise: input.lines.reduce((sum, line) => sum + Math.round(line.qty * line.unit_price_paise), 0),
    discount_paise: 0,
    manual_discount_paise: 0,
    offer_discount_paise: 0,
    taxable_paise: 0,
    tax_paise: 0,
    round_off_paise: 0,
    total_paise: input.lines.reduce((sum, line) => sum + Math.round(line.qty * line.unit_price_paise), 0),
    status: 'held',
    payment_status: 'pending',
    note: input.note ?? null,
    created_at: now,
    finalized_at: null,
    updated_at: now,
  }
  // Held bills are device-local scratch data: they are never pushed to the
  // cloud (a half-finished cart is meaningless on another phone, and the
  // server forbids deleting bill rows).
  await db.bills.put(bill)
  await holdLinesCache(billId, input.lines)
  return bill
}

/**
 * Held cart contents live in meta (not bill_items) so a held bill can never be
 * mistaken for a finalized sale by any report or stock calculation.
 */
async function holdLinesCache(billId: string, lines: CartLine[]): Promise<void> {
  await setMeta(`hold:${billId}`, lines)
}

export async function getHeldLines(billId: string): Promise<CartLine[]> {
  return getMeta<CartLine[]>(`hold:${billId}`, [])
}

export async function listHeldBills(shopId: string): Promise<Array<{ bill: Bill; lines: CartLine[] }>> {
  const bills = await db.bills.where('shop_id').equals(shopId).filter((b) => b.status === 'held').toArray()
  const result: Array<{ bill: Bill; lines: CartLine[] }> = []
  for (const bill of bills) {
    result.push({ bill, lines: await getHeldLines(bill.id) })
  }
  return result.sort((a, b) => b.bill.created_at.localeCompare(a.bill.created_at))
}

export async function deleteHeldBill(billId: string): Promise<void> {
  // Local-only, like holdBill itself.
  await db.bills.delete(billId)
  await db.meta.delete(`hold:${billId}`)
}

/** Owner-only void. The original bill row is preserved (never overwritten). */
export async function voidBill(billId: string, reason: string, actor: SessionUser, approval: OwnerApproval): Promise<void> {
  const bill = await db.bills.get(billId)
  if (!bill) throw new Error('Bill not found')
  if (bill.status === 'void') throw new Error('Bill already void')
  if (actor.role !== 'owner' || approval.permission !== 'billing.void') {
    throw new Error('Bill delete/void sirf owner kar sakta hai (PIN required)')
  }
  const now = new Date().toISOString()
  const voided: Bill = { ...bill, status: 'void', updated_at: now, note: `${bill.note ?? ''} | VOID: ${reason}`.trim() }
  await localUpsert('bills', voided)

  const items = await db.bill_items.where('bill_id').equals(billId).toArray()
  for (const item of items) {
    if (!item.product_id) continue
    const product = await db.products.get(item.product_id)
    if (!product) continue
    const newQty = Math.round((product.stock_qty + item.qty) * 1000) / 1000
    await localUpsert('products', { ...product, stock_qty: newQty, updated_at: now })
    await recordStockMovement({
      shop_id: bill.shop_id,
      product_id: product.id,
      movement_type: 'return',
      qty_change: item.qty,
      qty_after: newQty,
      reference_type: 'void',
      reference_id: billId,
      note: reason,
      created_by: actor.id,
    })
  }

  const udhaar = await db.payments.where('bill_id').equals(billId).filter((p) => p.mode === 'udhaar').toArray()
  const udhaarTotal = udhaar.reduce((sum, p) => sum + p.amount_paise, 0)
  if (bill.customer_id && udhaarTotal > 0) {
    const customer = await db.customers.get(bill.customer_id)
    if (customer) {
      const balance = Math.max(0, customer.balance_paise - udhaarTotal)
      await localUpsert('customers', { ...customer, balance_paise: balance, updated_at: now })
      await localUpsert('ledger_entries', {
        id: uuid(),
        shop_id: bill.shop_id,
        customer_id: customer.id,
        supplier_id: null,
        entry_type: 'adjustment',
        amount_paise: -udhaarTotal,
        balance_after_paise: balance,
        reference_type: 'void',
        reference_id: billId,
        note: `Bill void: ${reason}`,
        created_by: actor.id,
        created_at: now,
      })
    }
  }

  await writeAudit({
    shopId: bill.shop_id,
    actor,
    entity: 'bill',
    entityId: billId,
    action: 'void',
    oldValue: { status: bill.status, total_paise: bill.total_paise, bill_no: bill.bill_no },
    newValue: { status: 'void', reason },
  })
  sync.schedule()
}

export async function billDetail(billId: string): Promise<{ bill: Bill; items: BillItem[]; payments: Payment[] } | null> {
  const bill = await db.bills.get(billId)
  if (!bill) return null
  const items = await db.bill_items.where('bill_id').equals(billId).toArray()
  const payments = await db.payments.where('bill_id').equals(billId).toArray()
  return { bill, items, payments }
}

export async function recentBills(shopId: string, limit = 30): Promise<Bill[]> {
  const rows = await db.bills.where('shop_id').equals(shopId).filter((b) => b.status !== 'held').toArray()
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)
}

export function cartLineFromProduct(product: Product, qty = 1): CartLine {
  return {
    key: uuid(),
    product_id: product.id,
    name_en: product.name_en,
    name_hi: product.name_hi,
    barcode: product.barcode,
    unit: product.unit,
    is_loose: product.is_loose,
    qty,
    unit_price_paise: product.selling_price_paise,
    mrp_paise: product.mrp_paise,
    gst_rate: product.gst_rate,
    image_url: product.image_url,
    stock_qty: product.stock_qty,
  }
}

export function cartTotals(lines: CartLine[], taxMode: TaxMode, discountPaise = 0): BillTotals {
  return computeTotals(
    lines.map((line) => ({ amount_paise: Math.round(line.qty * line.unit_price_paise), gst_rate: line.gst_rate })),
    { taxMode, discount_paise: discountPaise },
  )
}

export { computeTotals }

export interface ReturnInput {
  billId: string
  items: { item_id: string; qty: number }[]
  reason: string
  refundMode: 'cash' | 'upi' | 'card' | 'udhaar_adjust'
  actor: SessionUser
  approval: OwnerApproval
}

/**
 * Partial or full return. The original bill is never modified — a return entry
 * + stock movement + ledger adjustment are written instead, all owner-approved.
 */
export async function returnBillItems(input: ReturnInput): Promise<{ refundPaise: number }> {
  const bill = await db.bills.get(input.billId)
  if (!bill) throw new Error('Bill not found')
  if (bill.status === 'void') throw new Error('Bill already void')
  if (input.actor.role !== 'owner' || input.approval.permission !== 'billing.refund') {
    throw new Error('Return/refund sirf owner kar sakta hai (PIN required)')
  }
  const items = await db.bill_items.where('bill_id').equals(input.billId).toArray()
  const now = new Date().toISOString()
  let refund = 0

  for (const request of input.items) {
    const item = items.find((row) => row.id === request.item_id)
    if (!item || request.qty <= 0) continue
    const qty = Math.min(request.qty, item.qty)
    refund += Math.round((item.line_total_paise / item.qty) * qty)
    if (!item.product_id) continue
    const product = await db.products.get(item.product_id)
    if (!product) continue
    const newQty = Math.round((product.stock_qty + qty) * 1000) / 1000
    await localUpsert('products', { ...product, stock_qty: newQty, updated_at: now })
    await recordStockMovement({
      shop_id: bill.shop_id,
      product_id: product.id,
      movement_type: 'return',
      qty_change: qty,
      qty_after: newQty,
      reference_type: 'return',
      reference_id: bill.id,
      note: input.reason,
      created_by: input.actor.id,
    })
  }

  if (bill.customer_id && input.refundMode === 'udhaar_adjust') {
    const customer = await db.customers.get(bill.customer_id)
    if (customer) {
      const balance = Math.max(0, customer.balance_paise - refund)
      await localUpsert('customers', { ...customer, balance_paise: balance, updated_at: now })
      await localUpsert('ledger_entries', {
        id: uuid(),
        shop_id: bill.shop_id,
        customer_id: customer.id,
        supplier_id: null,
        entry_type: 'adjustment',
        amount_paise: -refund,
        balance_after_paise: balance,
        reference_type: 'return',
        reference_id: bill.id,
        note: `Return: ${input.reason}`,
        created_by: input.actor.id,
        created_at: now,
      })
    }
  }

  await writeAudit({
    shopId: bill.shop_id,
    actor: input.actor,
    entity: 'bill',
    entityId: bill.id,
    action: 'return',
    oldValue: { total_paise: bill.total_paise, bill_no: bill.bill_no },
    newValue: { refund_paise: refund, reason: input.reason, mode: input.refundMode, items: input.items },
  })
  sync.schedule()
  return { refundPaise: refund }
}
