import { db, localUpsert } from '../lib/db'
import { uuid } from '../lib/id'
import { sync } from '../lib/sync'
import { toPaise } from '../lib/money'
import type { Category, Product, SessionUser, StockMovement, StockMovementType, Unit } from '../types'
import { writeAudit } from './audit'

export interface ProductInput {
  id?: string
  shop_id: string
  barcode: string | null
  name_en: string
  name_hi: string
  category_id: string | null
  brand: string | null
  unit: Unit
  purchase_price: number
  selling_price: number
  mrp: number
  gst_rate: number
  stock_qty: number
  low_stock_limit: number
  expiry_date: string | null
  image_url: string | null
  hsn_code: string | null
  is_active?: boolean
}

const LOOSE_UNITS: Unit[] = ['kg', 'g', 'litre', 'ml']

export function isLooseUnit(unit: Unit): boolean {
  return LOOSE_UNITS.includes(unit)
}

export async function findByBarcode(shopId: string, barcode: string): Promise<Product | undefined> {
  const code = barcode.trim()
  if (!code) return undefined
  return db.products.where('shop_id').equals(shopId).filter((p) => p.barcode === code && p.is_active).first()
}

export async function getProduct(id: string): Promise<Product | undefined> {
  return db.products.get(id)
}

/**
 * Owner-only validation happens in the UI gate; this function still guards
 * against a cashier calling it by checking the role passed in.
 */
export async function saveProduct(input: ProductInput, actor: SessionUser, approval?: { at: string }): Promise<Product> {
  const existing = input.id ? await db.products.get(input.id) : undefined
  const priceChanged =
    existing &&
    (existing.selling_price_paise !== toPaise(input.selling_price) ||
      existing.purchase_price_paise !== toPaise(input.purchase_price) ||
      existing.mrp_paise !== toPaise(input.mrp))

  if (priceChanged && actor.role !== 'owner') {
    throw new Error('Sirf owner price change kar sakta hai / Only the owner can change prices')
  }
  if (priceChanged && actor.role === 'owner' && !approval) {
    throw new Error('Price change ke liye owner PIN dobara daalein / Re-authenticate to change price')
  }
  if (input.selling_price <= 0) throw new Error('Selling price 0 se zyada honi chahiye')

  const now = new Date().toISOString()
  const id = input.id ?? uuid()
  const product: Product = {
    id,
    shop_id: input.shop_id,
    barcode: input.barcode?.trim() || null,
    name_en: input.name_en.trim(),
    name_hi: (input.name_hi || input.name_en).trim(),
    category_id: input.category_id,
    brand: input.brand?.trim() || null,
    unit: input.unit,
    is_loose: isLooseUnit(input.unit),
    purchase_price_paise: toPaise(input.purchase_price),
    selling_price_paise: toPaise(input.selling_price),
    mrp_paise: toPaise(input.mrp) || toPaise(input.selling_price),
    gst_rate: Number(input.gst_rate) || 0,
    stock_qty: Number(input.stock_qty) || 0,
    low_stock_limit: Number(input.low_stock_limit) || 0,
    expiry_date: input.expiry_date || null,
    image_url: input.image_url,
    hsn_code: input.hsn_code?.trim() || null,
    is_active: input.is_active ?? true,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  }

  // Barcode must be unique inside a shop (otherwise scans are ambiguous).
  if (product.barcode) {
    const duplicate = await db.products
      .where('shop_id')
      .equals(product.shop_id)
      .filter((p) => p.barcode === product.barcode && p.id !== product.id && p.is_active)
      .first()
    if (duplicate) throw new Error(`Ye barcode pehle se "${duplicate.name_en}" par hai`)
  }

  await localUpsert('products', product)

  if (!existing) {
    if (product.stock_qty > 0) {
      await recordStockMovement({
        shop_id: product.shop_id,
        product_id: product.id,
        movement_type: 'opening',
        qty_change: product.stock_qty,
        qty_after: product.stock_qty,
        note: 'Opening stock',
        created_by: actor.id,
      })
    }
    await writeAudit({
      shopId: product.shop_id,
      actor,
      entity: 'product',
      entityId: product.id,
      action: 'create',
      newValue: product as unknown as Record<string, unknown>,
    })
  } else {
    if (existing.stock_qty !== product.stock_qty) {
      await recordStockMovement({
        shop_id: product.shop_id,
        product_id: product.id,
        movement_type: 'adjustment',
        qty_change: product.stock_qty - existing.stock_qty,
        qty_after: product.stock_qty,
        note: 'Manual stock edit',
        created_by: actor.id,
      })
    }
    await writeAudit({
      shopId: product.shop_id,
      actor,
      entity: 'product',
      entityId: product.id,
      action: priceChanged ? 'price_change' : 'update',
      oldValue: existing as unknown as Record<string, unknown>,
      newValue: product as unknown as Record<string, unknown>,
    })
  }

  sync.schedule()
  return product
}

export interface StockMovementInput {
  shop_id: string
  product_id: string
  movement_type: StockMovementType
  qty_change: number
  qty_after: number
  reference_type?: string | null
  reference_id?: string | null
  note?: string | null
  created_by?: string | null
}

export async function recordStockMovement(input: StockMovementInput): Promise<StockMovement> {
  const row: StockMovement = {
    id: uuid(),
    shop_id: input.shop_id,
    product_id: input.product_id,
    movement_type: input.movement_type,
    qty_change: input.qty_change,
    qty_after: input.qty_after,
    reference_type: input.reference_type ?? null,
    reference_id: input.reference_id ?? null,
    note: input.note ?? null,
    created_by: input.created_by ?? null,
    created_at: new Date().toISOString(),
  }
  await localUpsert('stock_movements', row)
  return row
}

/** Manual stock adjust (owner/manager) — always logged with old → new. */
export async function adjustStock(
  productId: string,
  newQty: number,
  reason: string,
  actor: SessionUser,
): Promise<void> {
  const product = await db.products.get(productId)
  if (!product) throw new Error('Product not found')
  const qty = Number(newQty)
  if (!Number.isFinite(qty)) throw new Error('Invalid quantity')
  const updated: Product = { ...product, stock_qty: qty, updated_at: new Date().toISOString() }
  await localUpsert('products', updated)
  await recordStockMovement({
    shop_id: product.shop_id,
    product_id: productId,
    movement_type: 'adjustment',
    qty_change: qty - product.stock_qty,
    qty_after: qty,
    note: reason,
    created_by: actor.id,
  })
  await writeAudit({
    shopId: product.shop_id,
    actor,
    entity: 'product_stock',
    entityId: productId,
    action: 'stock_adjust',
    oldValue: { stock_qty: product.stock_qty, name: product.name_en },
    newValue: { stock_qty: qty, reason },
  })
  sync.schedule()
}

export async function setProductActive(productId: string, isActive: boolean, actor: SessionUser): Promise<void> {
  const product = await db.products.get(productId)
  if (!product) return
  const updated = { ...product, is_active: isActive, updated_at: new Date().toISOString() }
  await localUpsert('products', updated)
  await writeAudit({
    shopId: product.shop_id,
    actor,
    entity: 'product',
    entityId: productId,
    action: isActive ? 'restore' : 'delete',
    oldValue: { is_active: product.is_active, name: product.name_en },
    newValue: { is_active: isActive },
  })
  sync.schedule()
}

export async function saveCategory(
  shopId: string,
  input: { id?: string; name_en: string; name_hi: string; icon: string | null },
): Promise<Category> {
  const now = new Date().toISOString()
  const existing = input.id ? await db.categories.get(input.id) : undefined
  const count = await db.categories.where('shop_id').equals(shopId).count()
  const category: Category = {
    id: input.id ?? uuid(),
    shop_id: shopId,
    name_en: input.name_en.trim(),
    name_hi: input.name_hi.trim() || input.name_en.trim(),
    icon: input.icon,
    color: null,
    sort_order: existing?.sort_order ?? count,
    created_at: existing?.created_at ?? now,
  }
  await localUpsert('categories', category)
  sync.schedule()
  return category
}
