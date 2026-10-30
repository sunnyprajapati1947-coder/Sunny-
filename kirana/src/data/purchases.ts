import { db, localUpsert, localUpsertMany } from '../lib/db'
import { uuid } from '../lib/id'
import { sync } from '../lib/sync'
import { istDateKey } from '../lib/date'
import type { Product, Purchase, PurchaseItem, SessionUser, StockAudit, StockAuditItem, Supplier, Unit } from '../types'
import { writeAudit } from './audit'
import { recordStockMovement } from './products'

export interface PurchaseCartLine {
  key: string
  product_id: string
  name_en: string
  name_hi: string
  unit: Unit
  qty: number
  cost_paise: number
}

export interface SavePurchaseInput {
  shop: { id: string }
  actor: SessionUser
  supplier: Supplier | null
  invoice_no: string | null
  lines: PurchaseCartLine[]
  paid_paise: number
  note?: string | null
}

export async function savePurchase(input: SavePurchaseInput): Promise<{ purchase: Purchase; items: PurchaseItem[] }> {
  if (!input.lines.length) throw new Error('Koi item nahi hai / No items in purchase')
  const now = new Date().toISOString()
  const purchaseId = uuid()
  const total = input.lines.reduce((sum, line) => sum + Math.round(line.qty * line.cost_paise), 0)
  const paid = Math.min(Math.max(0, Math.round(input.paid_paise)), total)
  const count = await db.purchases.where('shop_id').equals(input.shop.id).count()
  const purchase: Purchase = {
    id: purchaseId,
    shop_id: input.shop.id,
    purchase_no: `PUR-${istDateKey().slice(2).replace(/-/g, '')}-${String(count + 1).padStart(3, '0')}`,
    supplier_id: input.supplier?.id ?? null,
    supplier_name: input.supplier?.name ?? null,
    invoice_no: input.invoice_no || null,
    total_paise: total,
    paid_paise: paid,
    status: paid >= total ? 'paid' : paid > 0 ? 'partial' : 'credit',
    note: input.note ?? null,
    created_by: input.actor.id,
    created_at: now,
    updated_at: now,
  }

  const items: PurchaseItem[] = input.lines.map((line) => ({
    id: uuid(),
    purchase_id: purchaseId,
    shop_id: input.shop.id,
    product_id: line.product_id,
    name_en: line.name_en,
    name_hi: line.name_hi,
    qty: line.qty,
    unit: line.unit,
    cost_paise: line.cost_paise,
    line_total_paise: Math.round(line.qty * line.cost_paise),
    created_at: now,
  }))

  await db.transaction('rw', [db.purchases, db.purchase_items, db.products, db.stock_movements, db.suppliers, db.outbox], async () => {
    await localUpsert('purchases', purchase)
    await localUpsertMany('purchase_items', items)
    for (const item of items) {
      if (!item.product_id) continue
      const product = await db.products.get(item.product_id)
      if (!product) continue
      const newQty = Math.round((product.stock_qty + item.qty) * 1000) / 1000
      const nextProduct: Product = {
        ...product,
        stock_qty: newQty,
        // Latest landed cost updates the purchase price used for profit reports.
        purchase_price_paise: item.cost_paise,
        updated_at: now,
      }
      await localUpsert('products', nextProduct)
      await recordStockMovement({
        shop_id: input.shop.id,
        product_id: product.id,
        movement_type: 'purchase',
        qty_change: item.qty,
        qty_after: newQty,
        reference_type: 'purchase',
        reference_id: purchaseId,
        created_by: input.actor.id,
      })
    }
    if (input.supplier) {
      const balance = input.supplier.balance_paise + (total - paid)
      await localUpsert('suppliers', { ...input.supplier, balance_paise: balance, updated_at: now })
    }
  })

  await writeAudit({
    shopId: input.shop.id,
    actor: input.actor,
    entity: 'purchase',
    entityId: purchaseId,
    action: 'create',
    newValue: {
      purchase_no: purchase.purchase_no,
      supplier: purchase.supplier_name,
      total_paise: total,
      paid_paise: paid,
      items: items.length,
    },
  })
  sync.schedule()
  return { purchase, items }
}

export async function paySupplier(supplierId: string, amountPaise: number, actor: SessionUser): Promise<void> {
  const supplier = await db.suppliers.get(supplierId)
  if (!supplier) throw new Error('Supplier not found')
  const amount = Math.max(0, Math.round(amountPaise))
  if (!amount) throw new Error('Amount 0 se zyada hona chahiye')
  const now = new Date().toISOString()
  await localUpsert('suppliers', {
    ...supplier,
    balance_paise: Math.max(0, supplier.balance_paise - amount),
    updated_at: now,
  })
  await localUpsert('ledger_entries', {
    id: uuid(),
    shop_id: supplier.shop_id,
    customer_id: null,
    supplier_id: supplierId,
    entry_type: 'purchase_payment',
    amount_paise: -amount,
    balance_after_paise: Math.max(0, supplier.balance_paise - amount),
    reference_type: 'supplier_payment',
    reference_id: null,
    note: 'Supplier ko payment',
    created_by: actor.id,
    created_at: now,
  })
  await writeAudit({
    shopId: supplier.shop_id,
    actor,
    entity: 'supplier',
    entityId: supplierId,
    action: 'payment',
    oldValue: { balance_paise: supplier.balance_paise },
    newValue: { balance_paise: Math.max(0, supplier.balance_paise - amount), paid_paise: amount },
  })
  sync.schedule()
}

export async function saveSupplier(
  shopId: string,
  input: { id?: string; name: string; phone: string | null; company: string | null; gstin: string | null; address: string | null; notes: string | null },
): Promise<Supplier> {
  const existing = input.id ? await db.suppliers.get(input.id) : undefined
  const now = new Date().toISOString()
  const supplier: Supplier = {
    id: input.id ?? uuid(),
    shop_id: shopId,
    name: input.name.trim(),
    phone: input.phone,
    company: input.company,
    gstin: input.gstin,
    address: input.address,
    notes: input.notes,
    balance_paise: existing?.balance_paise ?? 0,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  }
  await localUpsert('suppliers', supplier)
  sync.schedule()
  return supplier
}

/** Suggested reorder quantities: enough to get back to 2× the low-stock limit. */
export interface ReorderSuggestion {
  product: Product
  suggested_qty: number
  estimated_cost_paise: number
}

export function buildOrderList(products: Product[]): ReorderSuggestion[] {
  return products
    .filter((p) => p.is_active && p.stock_qty <= p.low_stock_limit)
    .map((product) => {
      const target = Math.max(product.low_stock_limit * 2, product.low_stock_limit + 1)
      const suggested = Math.max(1, Math.ceil(target - product.stock_qty))
      return {
        product,
        suggested_qty: suggested,
        estimated_cost_paise: Math.round(suggested * product.purchase_price_paise),
      }
    })
    .sort((a, b) => a.product.stock_qty - b.product.stock_qty)
}

export function orderListText(items: ReorderSuggestion[], shopName: string): string {
  const lines = items.map(
    (item, index) =>
      `${index + 1}. ${item.product.name_en} (${item.product.brand ?? ''}) — ${item.suggested_qty} ${item.product.unit}`,
  )
  return `*${shopName}* — Order List\n${new Date().toLocaleDateString('en-IN')}\n\n${lines.join('\n')}\n\nPlease bhej dijiye 🙏`
}

export async function startStockAudit(shopId: string, name: string, actor: SessionUser): Promise<StockAudit> {
  const audit: StockAudit = {
    id: uuid(),
    shop_id: shopId,
    name,
    status: 'open',
    counted_by: actor.id,
    note: null,
    created_at: new Date().toISOString(),
    closed_at: null,
  }
  await localUpsert('stock_audits', audit)
  sync.schedule()
  return audit
}

export async function upsertAuditCount(
  auditId: string,
  product: Product,
  countedQty: number,
): Promise<StockAuditItem> {
  const existing = await db.stock_audit_items
    .where('audit_id')
    .equals(auditId)
    .filter((row) => row.product_id === product.id)
    .first()
  const item: StockAuditItem = {
    id: existing?.id ?? uuid(),
    audit_id: auditId,
    shop_id: product.shop_id,
    product_id: product.id,
    product_name: product.name_en,
    system_qty: product.stock_qty,
    counted_qty: countedQty,
    created_at: existing?.created_at ?? new Date().toISOString(),
  }
  await localUpsert('stock_audit_items', item)
  sync.schedule(2000)
  return item
}

export async function closeStockAudit(auditId: string, actor: SessionUser, apply: boolean): Promise<number> {
  const audit = await db.stock_audits.get(auditId)
  if (!audit) throw new Error('Audit not found')
  const items = await db.stock_audit_items.where('audit_id').equals(auditId).toArray()
  let adjusted = 0
  if (apply) {
    for (const item of items) {
      const diff = Math.round((item.counted_qty - item.system_qty) * 1000) / 1000
      if (!diff) continue
      const product = await db.products.get(item.product_id)
      if (!product) continue
      await localUpsert('products', { ...product, stock_qty: item.counted_qty, updated_at: new Date().toISOString() })
      await recordStockMovement({
        shop_id: audit.shop_id,
        product_id: product.id,
        movement_type: 'audit',
        qty_change: diff,
        qty_after: item.counted_qty,
        reference_type: 'stock_audit',
        reference_id: auditId,
        note: 'Stock audit adjustment',
        created_by: actor.id,
      })
      adjusted++
    }
  }
  await localUpsert('stock_audits', { ...audit, status: 'closed', closed_at: new Date().toISOString() })
  await writeAudit({
    shopId: audit.shop_id,
    actor,
    entity: 'stock_audit',
    entityId: auditId,
    action: apply ? 'audit_applied' : 'audit_closed',
    newValue: { items: items.length, adjusted },
  })
  sync.schedule()
  return adjusted
}
