// @vitest-environment jsdom
import { db } from '../lib/db'
import { toPaise } from '../lib/money'
import { finalizeBill, cartLineFromProduct } from '../data/billing'
import { makeCustomer, makeProduct, makeShop, owner, resetDb } from './fixtures'
import type { Customer, Product, Shop } from '../types'

/**
 * Test-only fixture builder for the screen smoke tests. It writes a tiny shop
 * (one product, one customer, one bill) so a screen has something real to paint.
 * This is NOT shipped code and is never imported by the app — the product itself
 * starts empty and only ever holds the shopkeeper's own data.
 */
export interface StagedShop {
  shop: Shop
  product: Product
  customer: Customer
}

export async function stageShop(): Promise<StagedShop> {
  await resetDb()

  const shop = makeShop({ name: 'Test Kirana', bill_prefix: 'TST' })
  const product = makeProduct({ id: '22222222-2222-4222-8222-222222222222', name_en: 'Test Salt 1kg' })
  const product2 = makeProduct({
    id: '22222222-2222-4222-8222-222222222223',
    barcode: '8901030865279',
    name_en: 'Test Atta 5kg',
    name_hi: 'टेस्ट आटा 5 किलो',
    selling_price_paise: toPaise(240),
    stock_qty: 8,
  })
  const customer = makeCustomer({ name: 'Test Customer', balance_paise: toPaise(150) })

  await db.shops.put(shop)
  await db.products.bulkPut([product, product2])
  await db.customers.put(customer)

  await finalizeBill({
    shop,
    actor: owner,
    lines: [cartLineFromProduct(product, 1)],
    taxMode: 'inclusive',
    manualDiscountPaise: 0,
    customer: { id: null, name: null, phone: null },
    payments: [{ mode: 'cash', amount_paise: toPaise(28), reference: null }],
  })

  return { shop, product, customer }
}
