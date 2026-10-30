import Dexie, { type Table } from 'dexie'
import type {
  AuditLog,
  Bill,
  BillItem,
  Category,
  Customer,
  LedgerEntry,
  MetaRow,
  Offer,
  OutboxEntry,
  Payment,
  Product,
  Purchase,
  PurchaseItem,
  Shop,
  StockAudit,
  StockAuditItem,
  StockMovement,
  Supplier,
  SyncCursor,
  SyncTable,
} from '../types'

/**
 * IndexedDB is the source of truth on the device. Every write goes here first
 * (works offline), then to the outbox for Supabase sync.
 */
export class DukaanDB extends Dexie {
  shops!: Table<Shop, string>
  categories!: Table<Category, string>
  products!: Table<Product, string>
  customers!: Table<Customer, string>
  bills!: Table<Bill, string>
  bill_items!: Table<BillItem, string>
  payments!: Table<Payment, string>
  stock_movements!: Table<StockMovement, string>
  audit_logs!: Table<AuditLog, string>
  suppliers!: Table<Supplier, string>
  purchases!: Table<Purchase, string>
  purchase_items!: Table<PurchaseItem, string>
  ledger_entries!: Table<LedgerEntry, string>
  offers!: Table<Offer, string>
  stock_audits!: Table<StockAudit, string>
  stock_audit_items!: Table<StockAuditItem, string>
  outbox!: Table<OutboxEntry, number>
  meta!: Table<MetaRow, string>
  sync_cursors!: Table<SyncCursor, string>

  constructor() {
    super('dukaan-dost')
    this.version(1).stores({
      shops: '&id, name',
      categories: '&id, shop_id, sort_order',
      products: '&id, shop_id, barcode, name_en, name_hi, category_id, is_active, stock_qty, expiry_date, updated_at',
      customers: '&id, shop_id, phone, name, balance_paise, updated_at',
      bills: '&id, shop_id, bill_no, status, created_at, customer_id, cashier_id, payment_status',
      bill_items: '&id, bill_id, shop_id, product_id',
      payments: '&id, bill_id, shop_id, mode, created_at',
      stock_movements: '&id, shop_id, product_id, movement_type, created_at',
      audit_logs: '&id, shop_id, entity, entity_id, created_at',
      suppliers: '&id, shop_id, name',
      purchases: '&id, shop_id, supplier_id, created_at, purchase_no',
      purchase_items: '&id, purchase_id, shop_id, product_id',
      ledger_entries: '&id, shop_id, customer_id, supplier_id, created_at',
      offers: '&id, shop_id, is_active, type',
      stock_audits: '&id, shop_id, status, created_at',
      stock_audit_items: '&id, audit_id, shop_id, product_id',
      outbox: '++seq, table_name, record_id, created_at',
      meta: '&key',
      sync_cursors: '&table_name',
    })
  }
}

export const db = new DukaanDB()

const SYNC_TABLE_NAMES: SyncTable[] = [
  'shops',
  'categories',
  'products',
  'customers',
  'bills',
  'bill_items',
  'payments',
  'stock_movements',
  'audit_logs',
  'suppliers',
  'purchases',
  'purchase_items',
  'ledger_entries',
  'offers',
  'stock_audits',
  'stock_audit_items',
]

export function isSyncTable(name: string): name is SyncTable {
  return (SYNC_TABLE_NAMES as string[]).includes(name)
}

/** Queue a change for Supabase. Outbox rows are replayed in order by seq. */
export async function enqueueOutbox(
  table: SyncTable,
  op: 'upsert' | 'insert' | 'update' | 'delete',
  recordId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.outbox.add({
    table_name: table,
    op,
    record_id: recordId,
    payload,
    created_at: new Date().toISOString(),
    attempts: 0,
    last_error: null,
  })
}

/**
 * Generic local-first write. Validation, role checks and audit entries happen
 * in the repository layer (`src/data/*`), not here.
 */
export async function localUpsert<T extends { id: string }>(
  table: SyncTable,
  row: T,
  op: 'upsert' | 'insert' | 'update' = 'upsert',
): Promise<T> {
  const store = db.table(table) as Table<T, string>
  await store.put(row)
  await enqueueOutbox(table, op, row.id, row as unknown as Record<string, unknown>)
  return row
}

export async function localUpsertMany<T extends { id: string }>(table: SyncTable, rows: T[]): Promise<void> {
  if (!rows.length) return
  const store = db.table(table) as Table<T, string>
  await db.transaction('rw', [store, db.outbox], async () => {
    await store.bulkPut(rows)
    await db.outbox.bulkAdd(
      rows.map((row) => ({
        table_name: table,
        op: 'upsert' as const,
        record_id: row.id,
        payload: row as unknown as Record<string, unknown>,
        created_at: new Date().toISOString(),
        attempts: 0,
        last_error: null,
      })),
    )
  })
}

export async function localDelete(table: SyncTable, id: string): Promise<void> {
  const store = db.table(table) as Table<{ id: string }, string>
  await store.delete(id)
  // Most business tables are never hard-deleted in Supabase; we still queue the
  // op so the server can soft-delete when the RLS policy allows it.
  await enqueueOutbox(table, 'delete', id, { id })
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key)
  return row ? (row.value as T) : fallback
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

export async function pendingOutboxCount(): Promise<number> {
  return db.outbox.count()
}

/** Called after a successful sign-in: keep only this shop's local data. */
export async function pruneOtherShops(shopId: string, shopIdsToKeep: string[]): Promise<void> {
  const keep = new Set(shopIdsToKeep)
  keep.add(shopId)
  for (const name of SYNC_TABLE_NAMES) {
    if (name === 'shops' || name === 'stock_audit_items' || name === 'purchase_items' || name === 'bill_items' || name === 'payments') {
      continue
    }
    const store = db.table(name) as Table<{ id: string; shop_id?: string }, string>
    const rows = await store.toArray()
    const obsolete = rows.filter((row) => row.shop_id && !keep.has(row.shop_id))
    if (obsolete.length) await store.bulkDelete(obsolete.map((row) => row.id))
  }
}

export async function wipeLocalData(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.shops,
      db.categories,
      db.products,
      db.customers,
      db.bills,
      db.bill_items,
      db.payments,
      db.stock_movements,
      db.audit_logs,
      db.suppliers,
      db.purchases,
      db.purchase_items,
      db.ledger_entries,
      db.offers,
      db.stock_audits,
      db.stock_audit_items,
      db.outbox,
      db.meta,
      db.sync_cursors,
    ],
    async () => {
      await Promise.all(
        [
          db.shops,
          db.categories,
          db.products,
          db.customers,
          db.bills,
          db.bill_items,
          db.payments,
          db.stock_movements,
          db.audit_logs,
          db.suppliers,
          db.purchases,
          db.purchase_items,
          db.ledger_entries,
          db.offers,
          db.stock_audits,
          db.stock_audit_items,
          db.outbox,
          db.meta,
          db.sync_cursors,
        ].map((store) => store.clear()),
      )
    },
  )
}

export async function exportBackup(): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = { exported_at: new Date().toISOString(), version: 1 }
  for (const name of [...SYNC_TABLE_NAMES, 'meta'] as const) {
    data[name] = await db.table(name).toArray()
  }
  return data
}
