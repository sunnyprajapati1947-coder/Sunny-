import { db, enqueueOutbox, isSyncTable } from './db'
import { supabase, supabaseConfigured } from './supabase'
import type { OutboxEntry, SyncState, SyncTable } from '../types'

/**
 * Offline-first sync engine.
 *
 * 1. Every local write goes to IndexedDB and to `outbox`.
 * 2. `syncNow()` pushes outbox rows in order (idempotent upserts by id).
 * 3. It then pulls remote rows changed since our cursor (last-write-wins on
 *    `updated_at`), so two phones on the same shop converge.
 *
 * Bills are immutable once finalized — the DB trigger rejects edits, so replay
 * order only matters for the value of `updated_at`, which we always stamp.
 */

const PUSH_BATCH_SIZE = 40
const NUMERIC_FIELDS: Record<string, string[]> = {
  products: ['purchase_price_paise', 'selling_price_paise', 'mrp_paise', 'gst_rate', 'stock_qty', 'low_stock_limit'],
  bills: ['subtotal_paise', 'discount_paise', 'taxable_paise', 'tax_paise', 'round_off_paise', 'total_paise'],
  bill_items: ['qty', 'unit_price_paise', 'mrp_paise', 'gst_rate', 'line_total_paise', 'taxable_paise', 'tax_paise'],
  payments: ['amount_paise'],
  stock_movements: ['qty_change', 'qty_after'],
  customers: ['balance_paise', 'credit_limit_paise', 'loyalty_points'],
  suppliers: ['balance_paise'],
  purchases: ['total_paise', 'paid_paise'],
  purchase_items: ['qty', 'cost_paise', 'line_total_paise'],
  ledger_entries: ['amount_paise', 'balance_after_paise'],
  offers: ['buy_qty', 'get_qty', 'discount_percent', 'discount_paise', 'min_qty'],
  stock_audit_items: ['system_qty', 'counted_qty'],
}

/** PostgREST can hand back numeric columns as strings — normalise them. */
function coerceRow(table: SyncTable, row: Record<string, unknown>): Record<string, unknown> {
  const fields = NUMERIC_FIELDS[table]
  if (!fields) return row
  const next = { ...row }
  for (const field of fields) {
    if (next[field] !== null && next[field] !== undefined) next[field] = Number(next[field])
  }
  return next
}

/** Tables without `updated_at` fall back to their creation timestamp. */
const TIMESTAMP_COLUMN: Record<string, string> = {
  categories: 'created_at',
  bill_items: 'created_at',
  payments: 'created_at',
  stock_movements: 'created_at',
  audit_logs: 'created_at',
  purchase_items: 'created_at',
  stock_audit_items: 'created_at',
  ledger_entries: 'created_at',
}

const stampColumn = (table: string): string => TIMESTAMP_COLUMN[table] ?? 'updated_at'

type Listener = (state: SyncState, detail?: { pending: number; error?: string | null }) => void

class SyncManager {
  private listeners = new Set<Listener>()
  private running = false
  private retryTimer: number | null = null
  private pending = 0
  private state: SyncState = 'idle'
  private shopId: string | null = null
  private lastError: string | null = null

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.state, { pending: this.pending, error: this.lastError })
    return () => this.listeners.delete(listener)
  }

  getState(): SyncState {
    return this.state
  }

  private emit(state: SyncState, error?: string | null) {
    this.state = state
    if (error !== undefined) this.lastError = error
    for (const listener of this.listeners) {
      listener(state, { pending: this.pending, error: this.lastError })
    }
  }

  setShop(shopId: string | null) {
    this.shopId = shopId
    void this.refreshPending()
  }

  async refreshPending(): Promise<number> {
    this.pending = await db.outbox.count()
    const online = typeof navigator === 'undefined' ? true : navigator.onLine
    if (this.state !== 'syncing') this.emit(this.pending > 0 ? (online ? 'local' : 'offline') : 'idle')
    return this.pending
  }

  /** Fire-and-forget sync, safe to call from any write site. */
  schedule(delay = 1200): void {
    if (typeof window === 'undefined') return
    if (this.retryTimer) window.clearTimeout(this.retryTimer)
    this.retryTimer = window.setTimeout(() => {
      void this.syncNow()
    }, delay)
  }

  async syncNow(): Promise<{ pushed: number; pulled: number; error: string | null }> {
    if (!supabaseConfigured || !supabase || !this.shopId) {
      await this.refreshPending()
      return { pushed: 0, pulled: 0, error: null }
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.emit('offline')
      return { pushed: 0, pulled: 0, error: 'offline' }
    }
    if (this.running) return { pushed: 0, pulled: 0, error: null }

    this.running = true
    this.emit('syncing')
    let pushed = 0
    let pulled = 0
    try {
      const pushResult = await this.push()
      pushed = pushResult.pushed
      pulled = await this.pull()
      this.pending = await db.outbox.count()
      const error = pushResult.error
      this.emit(error ? 'error' : this.pending > 0 ? 'local' : 'idle', error)
      return { pushed, pulled, error }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.emit('error', message)
      return { pushed, pulled, error: message }
    } finally {
      this.running = false
    }
  }

  /**
   * Replays the outbox. A permanently rejected row (RLS denial, constraint)
   * must never block a shopkeeper's next sale, so failures are recorded and
   * retried a couple of times, then dropped from the queue with an error state.
   */
  private async push(): Promise<{ pushed: number; error: string | null }> {
    if (!supabase) return { pushed: 0, error: null }
    let pushed = 0
    let firstError: string | null = null

    for (let guard = 0; guard < 25; guard++) {
      const batch = await db.outbox.orderBy('seq').limit(PUSH_BATCH_SIZE).toArray()
      if (!batch.length) break

      const byTable = new Map<SyncTable, OutboxEntry[]>()
      for (const entry of batch) {
        if (!isSyncTable(entry.table_name)) {
          if (entry.seq) await db.outbox.delete(entry.seq)
          continue
        }
        const list = byTable.get(entry.table_name) ?? []
        list.push(entry)
        byTable.set(entry.table_name, list)
      }

      const succeeded: number[] = []
      for (const [table, entries] of byTable) {
        try {
          const inserts = entries.filter((entry) => entry.op !== 'delete')
          const deletes = entries.filter((entry) => entry.op === 'delete')
          if (inserts.length) {
            // Last write per record wins inside the batch.
            const deduped = new Map<string, Record<string, unknown>>()
            for (const entry of inserts) deduped.set(entry.record_id, coerceRow(table, entry.payload))
            const rows = [...deduped.values()]
            const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' })
            if (error) throw new Error(`${table}: ${error.message}`)
            pushed += rows.length
          }
          if (deletes.length) {
            const ids = deletes.map((entry) => entry.record_id)
            const { error } = await supabase.from(table).delete().in('id', ids)
            if (error) throw new Error(`${table}: ${error.message}`)
            pushed += ids.length
          }
          succeeded.push(...entries.map((entry) => entry.seq as number))
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          firstError = firstError ?? message
          const permanent = /row-level security|permission denied|violates|duplicate key|does not exist|invalid input|foreign key|check constraint|not-null/i.test(
            message,
          )
          for (const entry of entries) {
            const attempts = (entry.attempts ?? 0) + 1
            if (permanent && attempts >= 2) {
              // Give up on this row so the rest of the queue can drain.
              if (entry.seq) await db.outbox.delete(entry.seq)
            } else {
              await db.outbox.update(entry.seq as number, { attempts, last_error: message })
            }
          }
        }
      }

      if (succeeded.length) await db.outbox.bulkDelete(succeeded)
      // Nothing moved forward → stop instead of spinning on the same rows.
      if (!succeeded.length && byTable.size) break
    }

    return { pushed, error: firstError }
  }

  private async pull(): Promise<number> {
    if (!supabase || !this.shopId) return 0
    let pulled = 0
    const tables: SyncTable[] = [
      'categories',
      'products',
      'customers',
      'suppliers',
      'offers',
      'bills',
      'bill_items',
      'payments',
      'stock_movements',
      'ledger_entries',
      'purchases',
      'purchase_items',
      'audit_logs',
      'stock_audits',
      'stock_audit_items',
    ]

    for (const table of tables) {
      const cursor = await db.sync_cursors.get(table)
      const stamp = stampColumn(table)
      let query = supabase.from(table).select('*').eq('shop_id', this.shopId).order(stamp, { ascending: true }).limit(500)
      if (cursor?.last_synced_at) query = query.gt(stamp, cursor.last_synced_at)
      const { data, error } = await query
      if (error) {
        // A table might not exist yet in an older deployment — keep syncing others.
        if (/does not exist|schema cache/i.test(error.message)) continue
        throw new Error(`${table}: ${error.message}`)
      }
      if (!data?.length) continue
      const rows = data.map((row) => coerceRow(table, row as Record<string, unknown>))
      const local = await db.table(table).bulkGet(rows.map((row) => String(row.id)))
      const toWrite = rows.filter((row, index) => {
        const existing = local[index] as Record<string, unknown> | undefined
        const incoming = row[stamp]
        const current = existing?.[stamp]
        if (!current || !incoming) return true
        return new Date(String(incoming)) >= new Date(String(current))
      })
      if (toWrite.length) {
        await db.table(table).bulkPut(toWrite)
        pulled += toWrite.length
      }
      const latest = rows.reduce((max, row) => {
        const value = String(row[stamp] ?? '')
        return value > max ? value : max
      }, cursor?.last_synced_at ?? '')
      if (latest) await db.sync_cursors.put({ table_name: table, last_synced_at: latest })
    }
    return pulled
  }

  /** Re-queue everything locally so a fresh device/cloud gets all data. */
  async fullResync(): Promise<void> {
    const tables: SyncTable[] = [
      'categories',
      'products',
      'customers',
      'suppliers',
      'offers',
      'bills',
      'bill_items',
      'payments',
      'stock_movements',
      'ledger_entries',
      'purchases',
      'purchase_items',
      'audit_logs',
      'stock_audits',
      'stock_audit_items',
    ]
    for (const table of tables) {
      const rows = await db.table(table).toArray()
      for (const row of rows as Array<Record<string, unknown>>) {
        await enqueueOutbox(table, 'upsert', String(row.id), row)
      }
    }
    await this.syncNow()
  }
}

export const sync = new SyncManager()

export function startAutoSync(shopId: string, onSynced?: () => void): () => void {
  sync.setShop(shopId)
  void sync.syncNow().then(() => onSynced?.())

  const handleOnline = () => {
    void sync.syncNow().then(() => onSynced?.())
  }
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') void sync.syncNow().then(() => onSynced?.())
  }
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', () => sync.refreshPending())
  document.addEventListener('visibilitychange', handleVisibility)
  const interval = window.setInterval(() => {
    void sync.syncNow().then((result) => {
      if (result.pulled > 0) onSynced?.()
    })
  }, 30_000)

  return () => {
    window.removeEventListener('online', handleOnline)
    document.removeEventListener('visibilitychange', handleVisibility)
    window.clearInterval(interval)
    sync.setShop(null)
  }
}
