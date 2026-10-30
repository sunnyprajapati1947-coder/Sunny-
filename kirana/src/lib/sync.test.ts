import { beforeEach, describe, expect, it } from 'vitest'
import { db, enqueueOutbox, localDelete, localUpsert, localUpsertMany, pendingOutboxCount } from './db'
import { makeProduct, resetDb, SHOP_ID } from '../test/fixtures'
import { sync } from './sync'

beforeEach(async () => {
  await resetDb()
})

describe('offline outbox', () => {
  it('queues a local write for the cloud', async () => {
    const product = makeProduct()
    await localUpsert('products', product)
    expect(await pendingOutboxCount()).toBe(1)
    const queued = await db.outbox.orderBy('seq').first()
    expect(queued?.table_name).toBe('products')
    expect(queued?.record_id).toBe(product.id)
    expect((queued?.payload as { name_en: string }).name_en).toBe('Tata Salt 1kg')
  })

  it('bulk upserts enqueue one outbox row per record', async () => {
    const rows = [
      makeProduct({ id: 'p1' }),
      makeProduct({ id: 'p2', barcode: '8901030865279' }),
      makeProduct({ id: 'p3', barcode: null }),
    ]
    await localUpsertMany('products', rows)
    expect(await pendingOutboxCount()).toBe(3)
    expect(await db.products.count()).toBe(3)
  })

  it('deletes remove locally and queue a delete op', async () => {
    const product = makeProduct()
    await localUpsert('products', product)
    await localDelete('products', product.id)
    expect(await db.products.count()).toBe(0)
    const ops = (await db.outbox.toArray()).map((entry) => entry.op)
    expect(ops).toContain('delete')
  })

  it('keeps insertion order for replay', async () => {
    await localUpsert('products', makeProduct({ id: 'a', barcode: null }))
    await localUpsert('products', makeProduct({ id: 'b', barcode: null }))
    await enqueueOutbox('audit_logs', 'insert', 'log-1', { id: 'log-1' })
    const ids = (await db.outbox.orderBy('seq').toArray()).map((entry) => entry.record_id)
    expect(ids).toEqual(['a', 'b', 'log-1'])
  })

  it('reports pending work without network access', async () => {
    sync.setShop(null)
    const pending = await sync.refreshPending()
    expect(pending).toBeGreaterThanOrEqual(0)
  })

  it('syncNow is a no-op without a Supabase project', async () => {
    const result = await sync.syncNow()
    expect(result).toEqual({ pushed: 0, pulled: 0, error: null })
  })
})

describe('local database shape', () => {
  it('exposes all sync tables', async () => {
    const tables = db.tables.map((table) => table.name)
    for (const name of [
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
      'outbox',
      'meta',
      'sync_cursors',
    ]) {
      expect(tables).toContain(name)
    }
  })

  it('indexes products by shop and barcode for fast scans', async () => {
    const product = makeProduct()
    await db.products.put(product)
    const byShop = await db.products.where('shop_id').equals(SHOP_ID).count()
    const byBarcode = await db.products.where('barcode').equals(product.barcode as string).first()
    expect(byShop).toBe(1)
    expect(byBarcode?.id).toBe(product.id)
  })
})
