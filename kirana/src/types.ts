/**
 * Domain types for Dukaan Dost.
 *
 * Conventions
 * -----------
 * - All money is stored as INTEGER PAISE (1 rupee = 100 paise). Never floats.
 * - `qty` is numeric: integer for pcs/packet/dozen/box, decimal (up to 3 places)
 *   for loose kg/litre items.
 * - Dates are ISO strings. `created_at`/`updated_at` are ISO date-times.
 * - Type names mirror the Supabase tables so sync mapping stays obvious.
 */

export type Role = 'owner' | 'manager' | 'cashier'

export type Unit = 'pcs' | 'kg' | 'g' | 'litre' | 'ml' | 'packet' | 'dozen' | 'box'

export type BillStatus = 'held' | 'paid' | 'void' | 'refunded'

export type PaymentMode = 'cash' | 'upi' | 'card' | 'udhaar'

export type PaymentStatus = 'paid' | 'pending' | 'partial'

export type StockMovementType =
  | 'opening'
  | 'sale'
  | 'purchase'
  | 'return'
  | 'adjustment'
  | 'audit'
  | 'wastage'

export type AppLanguage = 'hinglish' | 'hi' | 'en'

export interface Shop {
  id: string
  name: string
  owner_name: string
  phone: string | null
  address: string | null
  gstin: string | null
  upi_id: string | null
  bill_prefix: string
  receipt_footer: string | null
  prices_include_gst: boolean
  receipt_width: 58 | 80
  max_discount_percent: number
  loyalty_enabled: boolean
  language: AppLanguage
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  shop_id: string
  full_name: string
  phone: string | null
  role: Role
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  shop_id: string
  name_en: string
  name_hi: string
  icon: string | null
  color: string | null
  sort_order: number
  created_at: string
}

export interface Product {
  id: string
  shop_id: string
  barcode: string | null
  name_en: string
  name_hi: string
  category_id: string | null
  brand: string | null
  unit: Unit
  is_loose: boolean
  purchase_price_paise: number
  selling_price_paise: number
  mrp_paise: number
  gst_rate: number
  stock_qty: number
  low_stock_limit: number
  expiry_date: string | null
  image_url: string | null
  hsn_code: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Customer {
  id: string
  shop_id: string
  name: string
  phone: string | null
  address: string | null
  credit_limit_paise: number
  balance_paise: number
  loyalty_points: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Bill {
  id: string
  shop_id: string
  bill_no: string
  customer_id: string | null
  customer_name: string | null
  customer_phone: string | null
  cashier_id: string | null
  cashier_name: string | null
  subtotal_paise: number
  discount_paise: number
  manual_discount_paise: number
  offer_discount_paise: number
  taxable_paise: number
  tax_paise: number
  round_off_paise: number
  total_paise: number
  status: BillStatus
  payment_status: PaymentStatus
  note: string | null
  created_at: string
  finalized_at: string | null
  updated_at: string
}

export interface BillItem {
  id: string
  bill_id: string
  shop_id: string
  product_id: string | null
  name_en: string
  name_hi: string
  barcode: string | null
  qty: number
  unit: Unit
  unit_price_paise: number
  mrp_paise: number
  gst_rate: number
  line_total_paise: number
  taxable_paise: number
  tax_paise: number
  cost_paise: number
  created_at: string
}

export interface Payment {
  id: string
  bill_id: string
  shop_id: string
  mode: PaymentMode
  amount_paise: number
  reference: string | null
  created_at: string
}

export interface StockMovement {
  id: string
  shop_id: string
  product_id: string | null
  movement_type: StockMovementType
  qty_change: number
  qty_after: number
  reference_type: string | null
  reference_id: string | null
  note: string | null
  created_by: string | null
  created_at: string
}

export interface AuditLog {
  id: string
  shop_id: string
  actor_id: string | null
  actor_name: string | null
  entity: string
  entity_id: string
  action: string
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  created_at: string
}

export interface Supplier {
  id: string
  shop_id: string
  name: string
  phone: string | null
  company: string | null
  gstin: string | null
  address: string | null
  notes: string | null
  balance_paise: number
  created_at: string
  updated_at: string
}

export interface Purchase {
  id: string
  shop_id: string
  purchase_no: string
  supplier_id: string | null
  supplier_name: string | null
  invoice_no: string | null
  total_paise: number
  paid_paise: number
  status: 'paid' | 'credit' | 'partial'
  note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PurchaseItem {
  id: string
  purchase_id: string
  shop_id: string
  product_id: string | null
  name_en: string
  name_hi: string
  qty: number
  unit: Unit
  cost_paise: number
  line_total_paise: number
  created_at: string
}

export interface LedgerEntry {
  id: string
  shop_id: string
  customer_id: string | null
  supplier_id: string | null
  entry_type: 'udhaar' | 'payment' | 'purchase' | 'purchase_payment' | 'adjustment' | 'opening'
  amount_paise: number
  balance_after_paise: number
  reference_type: string | null
  reference_id: string | null
  note: string | null
  created_by: string | null
  created_at: string
}

export interface Offer {
  id: string
  shop_id: string
  name: string
  name_hi: string
  type: 'bogo' | 'combo' | 'percent' | 'flat'
  is_active: boolean
  product_id: string | null
  combo_product_id: string | null
  buy_qty: number
  get_qty: number
  discount_percent: number
  discount_paise: number
  category_id: string | null
  min_qty: number
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
}

export interface StockAudit {
  id: string
  shop_id: string
  name: string
  status: 'open' | 'closed'
  counted_by: string | null
  note: string | null
  created_at: string
  closed_at: string | null
}

export interface StockAuditItem {
  id: string
  audit_id: string
  shop_id: string
  product_id: string
  product_name: string
  system_qty: number
  counted_qty: number
  created_at: string
}

export interface SyncCursor {
  table_name: string
  last_synced_at: string
}

/** Tables that participate in Supabase sync. */
export type SyncTable =
  | 'shops'
  | 'categories'
  | 'products'
  | 'customers'
  | 'bills'
  | 'bill_items'
  | 'payments'
  | 'stock_movements'
  | 'audit_logs'
  | 'suppliers'
  | 'purchases'
  | 'purchase_items'
  | 'ledger_entries'
  | 'offers'
  | 'stock_audits'
  | 'stock_audit_items'

export type SyncOp = 'upsert' | 'insert' | 'update' | 'delete'

export interface OutboxEntry {
  seq?: number
  table_name: SyncTable
  op: SyncOp
  record_id: string
  payload: Record<string, unknown>
  created_at: string
  attempts: number
  last_error: string | null
}

export interface MetaRow {
  key: string
  value: unknown
}

/** Cart line used by the POS before a bill is saved. */
export interface CartLine {
  key: string
  product_id: string
  name_en: string
  name_hi: string
  barcode: string | null
  unit: Unit
  is_loose: boolean
  qty: number
  unit_price_paise: number
  mrp_paise: number
  gst_rate: number
  image_url: string | null
  stock_qty: number
}

export interface PaymentInput {
  mode: PaymentMode
  amount_paise: number
  reference: string | null
}

/** A one-off owner approval obtained via PIN, bound to a permission + amount. */
export interface OwnerApproval {
  approvedBy: string
  permission: 'billing.discount' | 'billing.void' | 'billing.refund' | 'product.edit_price' | 'inventory.adjust'
  at: string
  maxDiscountPaise?: number
}

export interface SessionUser {
  id: string
  shopId: string
  name: string
  role: Role
  email?: string | null
  isDemo: boolean
}

export interface BillTotals {
  subtotal_paise: number
  discount_paise: number
  taxable_paise: number
  tax_paise: number
  round_off_paise: number
  total_paise: number
}

export interface HeldBillSummary {
  bill: Bill
  item_count: number
  items: CartLine[]
}

export type SyncState = 'local' | 'idle' | 'syncing' | 'offline' | 'error' | 'signed-out'
