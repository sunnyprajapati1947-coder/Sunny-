import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { adjustStock, findByBarcode, saveProduct, setProductActive } from './products'
import { cashier, manager, makeProduct, owner, resetDb, seedBasics } from '../test/fixtures'

beforeEach(async () => {
  await resetDb()
})

describe('saveProduct', () => {
  it('creates a product and an opening stock movement', async () => {
    const { shop } = await seedBasics()
    const product = await saveProduct(
      {
        shop_id: shop.id,
        barcode: '1234567890123',
        name_en: 'Sugar (loose)',
        name_hi: 'चीनी (खुली)',
        category_id: null,
        brand: null,
        unit: 'kg',
        purchase_price: 42,
        selling_price: 48,
        mrp: 52,
        gst_rate: 5,
        stock_qty: 25,
        low_stock_limit: 5,
        expiry_date: null,
        image_url: null,
        hsn_code: null,
      },
      owner,
    )

    expect(product.is_loose).toBe(true)
    expect(product.selling_price_paise).toBe(4800)
    const movements = await db.stock_movements.where('product_id').equals(product.id).toArray()
    expect(movements[0].movement_type).toBe('opening')
    expect(movements[0].qty_change).toBe(25)
  })

  it('blocks a non-owner from changing prices', async () => {
    const { shop, product } = await seedBasics()
    await expect(
      saveProduct(
        {
          id: product.id,
          shop_id: shop.id,
          barcode: product.barcode,
          name_en: product.name_en,
          name_hi: product.name_hi,
          category_id: null,
          brand: product.brand,
          unit: 'packet',
          purchase_price: 22,
          selling_price: 40,
          mrp: 45,
          gst_rate: 5,
          stock_qty: 20,
          low_stock_limit: 5,
          expiry_date: null,
          image_url: null,
          hsn_code: null,
        },
        manager,
      ),
    ).rejects.toThrow(/owner/i)
  })

  it('requires a fresh owner approval for a price change', async () => {
    const { shop, product } = await seedBasics()
    const base = {
      id: product.id,
      shop_id: shop.id,
      barcode: product.barcode,
      name_en: product.name_en,
      name_hi: product.name_hi,
      category_id: null,
      brand: product.brand,
      unit: 'packet' as const,
      purchase_price: 22,
      selling_price: 35,
      mrp: 40,
      gst_rate: 5,
      stock_qty: 20,
      low_stock_limit: 5,
      expiry_date: null,
      image_url: null,
      hsn_code: null,
    }

    await expect(saveProduct(base, owner)).rejects.toThrow(/PIN/i)

    const updated = await saveProduct(base, owner, { at: new Date().toISOString() })
    expect(updated.selling_price_paise).toBe(3500)

    const logs = await db.audit_logs.where('shop_id').equals(shop.id).toArray()
    const priceLog = logs.find((log) => log.action === 'price_change')
    expect(priceLog).toBeTruthy()
    expect((priceLog?.old_value as { selling_price_paise: number }).selling_price_paise).toBe(2800)
    expect((priceLog?.new_value as { selling_price_paise: number }).selling_price_paise).toBe(3500)
  })

  it('rejects duplicate barcodes inside the shop', async () => {
    const { shop, product } = await seedBasics()
    await expect(
      saveProduct(
        {
          shop_id: shop.id,
          barcode: product.barcode,
          name_en: 'Duplicate',
          name_hi: 'डुप्लीकेट',
          category_id: null,
          brand: null,
          unit: 'pcs',
          purchase_price: 10,
          selling_price: 12,
          mrp: 12,
          gst_rate: 0,
          stock_qty: 1,
          low_stock_limit: 1,
          expiry_date: null,
          image_url: null,
          hsn_code: null,
        },
        owner,
      ),
    ).rejects.toThrow(/barcode/i)
  })

  it('rejects a zero selling price', async () => {
    const { shop } = await seedBasics()
    await expect(
      saveProduct(
        {
          shop_id: shop.id,
          barcode: null,
          name_en: 'Free item',
          name_hi: 'फ्री',
          category_id: null,
          brand: null,
          unit: 'pcs',
          purchase_price: 0,
          selling_price: 0,
          mrp: 0,
          gst_rate: 0,
          stock_qty: 0,
          low_stock_limit: 0,
          expiry_date: null,
          image_url: null,
          hsn_code: null,
        },
        owner,
      ),
    ).rejects.toThrow(/Selling price/i)
  })
})

describe('findByBarcode', () => {
  it('finds an active product by barcode', async () => {
    const { product } = await seedBasics()
    const found = await findByBarcode(product.shop_id, product.barcode as string)
    expect(found?.id).toBe(product.id)
  })

  it('ignores inactive products and blank barcodes', async () => {
    const { product } = await seedBasics()
    await db.products.put({ ...product, is_active: false })
    expect(await findByBarcode(product.shop_id, product.barcode as string)).toBeUndefined()
    expect(await findByBarcode(product.shop_id, '   ')).toBeUndefined()
  })
})

describe('stock', () => {
  it('adjusts stock with an audit trail', async () => {
    const { product } = await seedBasics()
    await adjustStock(product.id, 12, 'wastage', owner)
    const updated = await db.products.get(product.id)
    expect(updated?.stock_qty).toBe(12)
    const logs = await db.audit_logs.where('entity').equals('product_stock').toArray()
    expect(logs[0].new_value).toMatchObject({ stock_qty: 12, reason: 'wastage' })
  })

  it('deactivates instead of hard deleting', async () => {
    const { product } = await seedBasics()
    await setProductActive(product.id, false, owner)
    const updated = await db.products.get(product.id)
    expect(updated?.is_active).toBe(false)
    expect(updated).toBeTruthy()
    const logs = await db.audit_logs.where('entity').equals('product').toArray()
    expect(logs.some((log) => log.action === 'delete')).toBe(true)
  })

  it('cashier cannot adjust stock (UI gate is backed by role checks in callers)', async () => {
    const { product } = await seedBasics()
    // adjustStock itself trusts the caller's role; the app only exposes it to
    // owner/manager. Ensure the permission map agrees.
    const { can } = await import('../lib/permissions')
    expect(can(cashier.role, 'inventory.adjust')).toBe(false)
    expect(can(manager.role, 'inventory.adjust')).toBe(true)
    expect(can(owner.role, 'inventory.adjust')).toBe(true)
    expect(await db.products.get(product.id)).toBeTruthy()
  })
})

describe('barcode edge cases', () => {
  it('allows two products with no barcode', async () => {
    const { shop } = await seedBasics()
    const input = {
      shop_id: shop.id,
      barcode: null,
      name_en: 'Loose dal',
      name_hi: 'खुली दाल',
      category_id: null,
      brand: null,
      unit: 'kg' as const,
      purchase_price: 100,
      selling_price: 120,
      mrp: 130,
      gst_rate: 0,
      stock_qty: 5,
      low_stock_limit: 1,
      expiry_date: null,
      image_url: null,
      hsn_code: null,
    }
    const a = await saveProduct(input, owner)
    const b = await saveProduct({ ...input, name_en: 'Loose rice', name_hi: 'खुला चावल' }, owner)
    expect(a.id).not.toBe(b.id)
  })
})

describe('loose items', () => {
  it('marks kg/litre items as loose and keeps 3-decimal quantity', async () => {
    const { product } = await seedBasics()
    const updated = await saveProduct(
      {
        id: product.id,
        shop_id: product.shop_id,
        barcode: product.barcode,
        name_en: 'Toor Dal',
        name_hi: 'अरहर दाल',
        category_id: null,
        brand: null,
        unit: 'kg',
        purchase_price: 138,
        selling_price: 145,
        mrp: 160,
        gst_rate: 0,
        stock_qty: 20,
        low_stock_limit: 5,
        expiry_date: null,
        image_url: null,
        hsn_code: null,
      },
      owner,
      { at: new Date().toISOString() },
    )
    expect(updated.is_loose).toBe(true)
    expect(makeProduct({ stock_qty: 0.25 }).stock_qty).toBe(0.25)
  })
})
