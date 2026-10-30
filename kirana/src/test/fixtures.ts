import { db } from '../lib/db'
import { toPaise } from '../lib/money'
import type { Customer, Product, SessionUser, Shop } from '../types'

export const SHOP_ID = '11111111-1111-4111-8111-111111111111'

export function makeShop(overrides: Partial<Shop> = {}): Shop {
  return {
    id: SHOP_ID,
    name: 'Test Kirana',
    owner_name: 'Test Owner',
    phone: '9876543210',
    address: null,
    gstin: null,
    upi_id: 'test@okaxis',
    bill_prefix: 'TST',
    receipt_footer: null,
    prices_include_gst: true,
    receipt_width: 58,
    max_discount_percent: 10,
    loyalty_enabled: true,
    language: 'hinglish',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

export function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    shop_id: SHOP_ID,
    barcode: '8901030865278',
    name_en: 'Tata Salt 1kg',
    name_hi: 'टाटा नमक 1 किलो',
    category_id: null,
    brand: 'Tata',
    unit: 'packet',
    is_loose: false,
    purchase_price_paise: toPaise(22),
    selling_price_paise: toPaise(28),
    mrp_paise: toPaise(30),
    gst_rate: 5,
    stock_qty: 20,
    low_stock_limit: 5,
    expiry_date: null,
    image_url: null,
    hsn_code: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

export function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    shop_id: SHOP_ID,
    name: 'Ramesh Kumar',
    phone: '9876500011',
    address: null,
    credit_limit_paise: toPaise(1000),
    balance_paise: 0,
    loyalty_points: 0,
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

export const owner: SessionUser = {
  id: '44444444-4444-4444-8444-444444444444',
  shopId: SHOP_ID,
  name: 'Rakesh Sharma',
  role: 'owner',
  isDemo: false,
}

export const manager: SessionUser = { ...owner, id: '55555555-5555-4555-8555-555555555555', name: 'Manager', role: 'manager' }

export const cashier: SessionUser = { ...owner, id: '66666666-6666-4666-8666-666666666666', name: 'Cashier', role: 'cashier' }

export async function resetDb(): Promise<void> {
  if (!db.isOpen()) await db.open()
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })
}

export async function seedBasics(): Promise<{ shop: Shop; product: Product; customer: Customer }> {
  const shop = makeShop()
  const product = makeProduct()
  const customer = makeCustomer()
  await db.shops.put(shop)
  await db.products.put(product)
  await db.customers.put(customer)
  return { shop, product, customer }
}
