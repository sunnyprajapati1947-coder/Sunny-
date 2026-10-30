import { db, getMeta, localUpsertMany, setMeta } from './db'
import { uuid } from './id'
import { toPaise } from './money'
import { addDays, istDateKey, istDayRange } from './date'
import type {
  Bill,
  BillItem,
  Category,
  Customer,
  LedgerEntry,
  Offer,
  Payment,
  Product,
  Shop,
  StockMovement,
  Supplier,
  Unit,
} from '../types'

export const DEMO_SHOP_ID = '00000000-0000-4000-8000-000000000001'

const now = () => new Date().toISOString()

const CATEGORY_SEED: Array<[string, string, string, string]> = [
  ['grocery', 'Grocery', 'किराना', '🍚'],
  ['dal', 'Dal & Pulses', 'दालें', '🫘'],
  ['masala', 'Masala & Spices', 'मसाले', '🌶️'],
  ['oil', 'Oil & Ghee', 'तेल और घी', '🫗'],
  ['dairy', 'Dairy', 'डेयरी', '🥛'],
  ['snacks', 'Snacks & Namkeen', 'नमकीन', '🍪'],
  ['drinks', 'Beverages', 'पेय', '🥤'],
  ['care', 'Personal Care', 'पर्सनल केयर', '🧴'],
  ['home', 'Household', 'घर का सामान', '🧹'],
  ['bakery', 'Bakery', 'बेकरी', '🍞'],
]

type SeedProduct = [
  barcode: string | null,
  nameEn: string,
  nameHi: string,
  category: string,
  brand: string,
  unit: Unit,
  purchase: number,
  selling: number,
  mrp: number,
  gst: number,
  stock: number,
  lowLimit: number,
  expiryDays: number | null,
]

const PRODUCT_SEED: SeedProduct[] = [
  ['8901030865278', 'Tata Salt 1kg', 'टाटा नमक 1 किलो', 'grocery', 'Tata', 'packet', 22, 28, 30, 5, 42, 10, 540],
  ['8901719110010', 'Aashirvaad Atta 5kg', 'आशीर्वाद आटा 5 किलो', 'grocery', 'Aashirvaad', 'packet', 235, 275, 295, 5, 18, 6, 240],
  ['8901063012345', 'India Gate Basmati Rice 1kg', 'इंडिया गेट बासमती चावल 1 किलो', 'grocery', 'India Gate', 'packet', 118, 145, 160, 5, 26, 8, 400],
  ['8901030009019', 'Fortune Sunflower Oil 1L', 'फॉर्च्यून सूरजमुखी तेल 1 लीटर', 'oil', 'Fortune', 'packet', 138, 165, 175, 5, 24, 8, 300],
  ['8901396001024', 'Amul Ghee 500ml', 'अमूल घी 500 मिली', 'oil', 'Amul', 'packet', 268, 305, 320, 12, 12, 4, 200],
  ['8901262010016', 'Amul Taaza Milk 500ml', 'अमूल ताज़ा दूध 500 मिली', 'dairy', 'Amul', 'packet', 26, 30, 31, 0, 30, 12, 5],
  ['8901262080019', 'Amul Butter 100g', 'अमूल बटर 100 ग्राम', 'dairy', 'Amul', 'packet', 56, 64, 68, 12, 15, 6, 90],
  ['', 'Toor Dal (loose)', 'अरहर दाल (खुली)', 'dal', 'Local', 'kg', 138, 165, 180, 0, 38, 10, null],
  ['', 'Moong Dal (loose)', 'मूंग दाल (खुली)', 'dal', 'Local', 'kg', 118, 142, 155, 0, 22, 8, null],
  ['', 'Chana Dal (loose)', 'चना दाल (खुली)', 'dal', 'Local', 'kg', 92, 112, 125, 0, 31, 8, null],
  ['', 'Sugar (loose)', 'चीनी (खुली)', 'grocery', 'Local', 'kg', 42, 48, 52, 5, 60, 15, null],
  ['', 'Poha (loose)', 'पोहा (खुला)', 'grocery', 'Local', 'kg', 48, 60, 65, 5, 16, 5, null],
  ['', 'Besan (loose)', 'बेसन (खुला)', 'dal', 'Local', 'kg', 96, 118, 130, 5, 14, 5, null],
  ['8901058000017', 'Maggi Noodles 4 Pack', 'मैगी नूडल्स 4 पैक', 'snacks', 'Nestle', 'packet', 52, 62, 64, 18, 28, 10, 150],
  ['8901491101813', 'Parle-G Biscuit 800g', 'पारले-जी बिस्किट 800 ग्राम', 'snacks', 'Parle', 'packet', 68, 80, 85, 18, 24, 8, 120],
  ['8901491500012', 'Haldiram Bhujia 200g', 'हल्दीराम भुजिया 200 ग्राम', 'snacks', 'Haldiram', 'packet', 42, 52, 55, 12, 20, 8, 100],
  ['8901058864800', 'Tata Tea Premium 500g', 'टाटा टी प्रीमियम 500 ग्राम', 'drinks', 'Tata Tea', 'packet', 232, 265, 285, 5, 9, 4, 330],
  ['8901052000018', 'Nescafe Classic 50g', 'नेस्कैफे क्लासिक 50 ग्राम', 'drinks', 'Nescafe', 'packet', 138, 158, 165, 18, 7, 3, 280],
  ['8904004400019', 'Coca-Cola 750ml', 'कोका-कोला 750 मिली', 'drinks', 'Coca-Cola', 'packet', 32, 40, 45, 28, 36, 12, 120],
  ['8901719120019', 'Bingo Mad Angles 90g', 'बिंगो मैड एंगल्स 90 ग्राम', 'snacks', 'Bingo', 'packet', 18, 25, 30, 18, 44, 15, 90],
  ['8901030705017', 'Surf Excel Easy Wash 1kg', 'सर्फ एक्सेल 1 किलो', 'home', 'Surf Excel', 'packet', 118, 138, 150, 18, 11, 4, 400],
  ['8901396120019', 'Vim Bar 200g', 'विम बार 200 ग्राम', 'home', 'Vim', 'pcs', 18, 25, 30, 18, 26, 10, 500],
  ['8901030865018', 'Colgate Strong Teeth 100g', 'कोलगेट मजबूत दांत 100 ग्राम', 'care', 'Colgate', 'packet', 48, 58, 62, 18, 17, 6, 500],
  ['8901030690016', 'Dove Soap 75g', 'डव साबुन 75 ग्राम', 'care', 'Dove', 'pcs', 38, 46, 48, 18, 19, 8, 700],
  ['8901063090016', 'Lux Soap 100g', 'लक्स साबुन 100 ग्राम', 'care', 'Lux', 'pcs', 30, 38, 40, 18, 21, 8, 700],
  ['8901058000192', 'Cadbury Dairy Milk 40g', 'कैडबरी डेयरी मिल्क 40 ग्राम', 'snacks', 'Cadbury', 'pcs', 32, 38, 40, 18, 33, 12, 150],
  ['8901725180014', 'Britannia Good Day 200g', 'ब्रिटानिया गुड डे 200 ग्राम', 'snacks', 'Britannia', 'packet', 32, 40, 45, 18, 13, 6, 110],
  ['8901052010017', 'Bru Instant Coffee 50g', 'ब्रू इंस्टेंट कॉफी 50 ग्राम', 'drinks', 'Bru', 'packet', 112, 132, 140, 18, 6, 3, 260],
  ['', 'Ginger-Garlic Paste 200g', 'अदरक-लहसुन पेस्ट 200 ग्राम', 'masala', 'Local', 'packet', 42, 55, 60, 12, 8, 4, 60],
  ['8901031000019', 'Everest Turmeric 100g', 'एवरेस्ट हल्दी 100 ग्राम', 'masala', 'Everest', 'packet', 28, 36, 40, 5, 16, 6, 400],
  ['8901031000026', 'MDH Deggi Mirch 100g', 'एमडीएच देगी मिर्च 100 ग्राम', 'masala', 'MDH', 'packet', 52, 65, 70, 5, 10, 4, 420],
  ['8904109410018', 'Whole Wheat Bread 400g', 'गेहूं ब्रेड 400 ग्राम', 'bakery', 'Local Bakery', 'packet', 26, 35, 38, 5, 4, 4, 2],
  ['8901719300015', 'Kurkure Masala Munch 80g', 'कुरकुरे मसाला मंच 80 ग्राम', 'snacks', 'Kurkure', 'packet', 15, 20, 20, 18, 0, 10, 80],
]

const CUSTOMER_SEED: Array<[string, string, number, number]> = [
  ['Ramesh Kumar', '9876500011', 780, 2000],
  ['Sunita Devi', '9876500022', 1450, 3000],
  ['Mohammad Irfan', '9876500033', 320, 1500],
  ['Sanjay Yadav', '9876500044', 0, 1000],
  ['Anita Gupta', '9876500055', 2100, 5000],
  ['Vikash Singh', '9876500066', 0, 2500],
]

export async function isSeeded(shopId: string): Promise<boolean> {
  return getMeta(`seeded:${shopId}`, false)
}

/**
 * Loads a realistic demo shop so the app is usable immediately (offline, no
 * Supabase project needed) and dashboards/reports have data to show.
 */
export async function seedDemoShop(options: { force?: boolean } = {}): Promise<string> {
  const shopId = DEMO_SHOP_ID
  if (!options.force && (await isSeeded(shopId))) return shopId

  const timestamp = now()
  const shop: Shop = {
    id: shopId,
    name: 'Sharma Kirana Store',
    owner_name: 'Rakesh Sharma',
    phone: '9876543210',
    address: 'Shop No. 4, Bank More, Dhanbad, Jharkhand',
    gstin: '20ABCDE1234F1Z5',
    upi_id: 'sharmakirana@okaxis',
    bill_prefix: 'SKS',
    receipt_footer: 'Aapke aane ka shukriya! 🙏',
    prices_include_gst: true,
    receipt_width: 58,
    max_discount_percent: 10,
    loyalty_enabled: true,
    language: 'hinglish',
    created_at: timestamp,
    updated_at: timestamp,
  }

  const categories: Category[] = CATEGORY_SEED.map(([key, nameEn, nameHi, icon], index) => ({
    id: uuid(),
    shop_id: shopId,
    name_en: nameEn,
    name_hi: nameHi,
    icon,
    color: null,
    sort_order: index,
    created_at: timestamp,
    _key: key,
  })) as unknown as Category[]

  const categoryIdByKey = new Map<string, string>()
  categories.forEach((category, index) => {
    categoryIdByKey.set(CATEGORY_SEED[index][0], category.id)
  })

  const productIds: string[] = []
  const products: Product[] = PRODUCT_SEED.map((row, index) => {
    const [barcode, nameEn, nameHi, categoryKey, brand, unit, purchase, selling, mrp, gst, stock, low, expiryDays] = row
    const id = uuid()
    productIds.push(id)
    return {
      id,
      shop_id: shopId,
      barcode: barcode || null,
      name_en: nameEn,
      name_hi: nameHi,
      category_id: categoryIdByKey.get(categoryKey) ?? null,
      brand,
      unit,
      is_loose: ['kg', 'g', 'litre', 'ml'].includes(unit),
      purchase_price_paise: toPaise(purchase),
      selling_price_paise: toPaise(selling),
      mrp_paise: toPaise(mrp),
      gst_rate: gst,
      stock_qty: stock,
      low_stock_limit: low,
      expiry_date: expiryDays === null ? null : addDays(istDateKey(), expiryDays),
      image_url: null,
      hsn_code: null,
      is_active: true,
      created_at: new Date(Date.now() - (200 - index) * 86_400_000).toISOString(),
      updated_at: timestamp,
    }
  })

  const customers: Customer[] = CUSTOMER_SEED.map(([name, phone, due, limit], index) => ({
    id: uuid(),
    shop_id: shopId,
    name,
    phone,
    address: null,
    credit_limit_paise: toPaise(limit),
    balance_paise: toPaise(due),
    loyalty_points: Math.floor((index + 1) * 37),
    notes: null,
    created_at: new Date(Date.now() - (60 - index) * 86_400_000).toISOString(),
    updated_at: timestamp,
  }))

  const supplier: Supplier = {
    id: uuid(),
    shop_id: shopId,
    name: 'Jai Bharat Distributors',
    phone: '9812345678',
    company: 'Jai Bharat Trading Co.',
    gstin: '20AAACJ1234K1Z2',
    address: 'Bank More, Dhanbad',
    notes: 'Atta, oil, masala — weekly delivery Monday',
    balance_paise: toPaise(4850),
    created_at: new Date(Date.now() - 90 * 86_400_000).toISOString(),
    updated_at: timestamp,
  }

  const offers: Offer[] = [
    {
      id: uuid(),
      shop_id: shopId,
      name: 'Buy 2 Get 1 — Lux Soap',
      name_hi: '2 लो खरीदें 1 मुफ्त — लक्स साबुन',
      type: 'bogo',
      is_active: true,
      product_id: products[24].id,
      combo_product_id: null,
      buy_qty: 2,
      get_qty: 1,
      discount_percent: 0,
      discount_paise: 0,
      category_id: null,
      min_qty: 0,
      start_date: null,
      end_date: null,
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      id: uuid(),
      shop_id: shopId,
      name: '₹10 off on Maggi 4-pack',
      name_hi: 'मैगी 4 पैक पर ₹10 छूट',
      type: 'flat',
      is_active: true,
      product_id: products[13].id,
      combo_product_id: null,
      buy_qty: 1,
      get_qty: 0,
      discount_percent: 0,
      discount_paise: toPaise(10),
      category_id: null,
      min_qty: 0,
      start_date: null,
      end_date: null,
      created_at: timestamp,
      updated_at: timestamp,
    },
  ]

  await db.transaction(
    'rw',
    [db.shops, db.categories, db.products, db.customers, db.suppliers, db.offers, db.meta],
    async () => {
      await db.shops.put(shop)
      await db.categories.bulkPut(categories)
      await db.products.bulkPut(products)
      await db.customers.bulkPut(customers)
      await db.suppliers.put(supplier)
      await db.offers.bulkPut(offers)
    },
  )

  await generateSalesHistory({ shopId, shop, products, customers })
  await seedLedger(shopId, customers)
  await setMeta(`seeded:${shopId}`, true)
  return shopId
}

interface HistoryArgs {
  shopId: string
  shop: Shop
  products: Product[]
  customers: Customer[]
}

/** Deterministic pseudo-random so demo reports are stable across reloads. */
function makeRandom(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32
    return state / 2 ** 32
  }
}

async function generateSalesHistory({ shopId, shop, products, customers }: HistoryArgs): Promise<void> {
  const random = makeRandom(20261030)
  const bills: Bill[] = []
  const items: BillItem[] = []
  const payments: Payment[] = []
  const movements: StockMovement[] = []
  let counter = 1

  for (let dayOffset = 13; dayOffset >= 0; dayOffset--) {
    const dateKey = addDays(istDateKey(), -dayOffset)
    const billCount = 4 + Math.floor(random() * 7)
    for (let b = 0; b < billCount; b++) {
      const { start } = istDayRange(dateKey)
      const createdAt = new Date(
        new Date(start).getTime() + (9 * 60 + Math.floor(random() * 620)) * 60_000,
      ).toISOString()
      const lineCount = 1 + Math.floor(random() * 4)
      const chosen = new Set<number>()
      const billId = uuid()
      let subtotal = 0
      const billItems: BillItem[] = []
      for (let l = 0; l < lineCount; l++) {
        let index = Math.floor(random() * products.length)
        let guard = 0
        while (chosen.has(index) && guard++ < 10) index = Math.floor(random() * products.length)
        chosen.add(index)
        const product = products[index]
        const qty = product.is_loose ? [0.25, 0.5, 1, 1.5, 2][Math.floor(random() * 5)] : 1 + Math.floor(random() * 3)
        const amount = Math.round(qty * product.selling_price_paise)
        subtotal += amount
        billItems.push({
          id: uuid(),
          bill_id: billId,
          shop_id: shopId,
          product_id: product.id,
          name_en: product.name_en,
          name_hi: product.name_hi,
          barcode: product.barcode,
          qty,
          unit: product.unit,
          unit_price_paise: product.selling_price_paise,
          mrp_paise: product.mrp_paise,
          gst_rate: product.gst_rate,
          line_total_paise: amount,
          taxable_paise: Math.round(amount / (1 + product.gst_rate / 100)),
          tax_paise: amount - Math.round(amount / (1 + product.gst_rate / 100)),
          cost_paise: product.purchase_price_paise,
          created_at: createdAt,
        })
        movements.push({
          id: uuid(),
          shop_id: shopId,
          product_id: product.id,
          movement_type: 'sale',
          qty_change: -qty,
          qty_after: product.stock_qty,
          reference_type: 'bill',
          reference_id: billId,
          note: null,
          created_by: 'owner',
          created_at: createdAt,
        })
      }
      const total = Math.round(subtotal / 100) * 100
      const useCustomer = random() > 0.62
      const customer = useCustomer ? customers[Math.floor(random() * customers.length)] : null
      const isUdhaar = Boolean(customer) && random() > 0.55
      const roll = random()
      const mode: Payment['mode'] = isUdhaar ? 'udhaar' : roll > 0.62 ? 'upi' : roll > 0.12 ? 'cash' : 'card'
      bills.push({
        id: billId,
        shop_id: shopId,
        bill_no: `${shop.bill_prefix}-${dateKey.slice(2).replace(/-/g, '')}-${String(counter).padStart(4, '0')}`,
        customer_id: customer?.id ?? null,
        customer_name: customer?.name ?? null,
        customer_phone: customer?.phone ?? null,
        cashier_id: null,
        cashier_name: 'Demo Owner',
        subtotal_paise: subtotal,
        discount_paise: 0,
        manual_discount_paise: 0,
        offer_discount_paise: 0,
        taxable_paise: subtotal,
        tax_paise: billItems.reduce((sum, item) => sum + item.tax_paise, 0),
        round_off_paise: total - subtotal,
        total_paise: total,
        status: 'paid',
        payment_status: mode === 'udhaar' ? 'pending' : 'paid',
        note: null,
        created_at: createdAt,
        finalized_at: createdAt,
        updated_at: createdAt,
      })
      payments.push({
        id: uuid(),
        bill_id: billId,
        shop_id: shopId,
        mode,
        amount_paise: total,
        reference: null,
        created_at: createdAt,
      })
      items.push(...billItems)
      counter++
    }
  }

  await db.transaction('rw', [db.bills, db.bill_items, db.payments, db.stock_movements], async () => {
    await db.bills.bulkPut(bills)
    await db.bill_items.bulkPut(items)
    await db.payments.bulkPut(payments)
    await db.stock_movements.bulkPut(movements)
  })
}

async function seedLedger(shopId: string, customers: Customer[]): Promise<void> {
  const entries: LedgerEntry[] = []
  for (const customer of customers) {
    if (customer.balance_paise <= 0) continue
    const past = new Date(Date.now() - 9 * 86_400_000).toISOString()
    entries.push({
      id: uuid(),
      shop_id: shopId,
      customer_id: customer.id,
      supplier_id: null,
      entry_type: 'udhaar',
      amount_paise: customer.balance_paise + toPaise(200),
      balance_after_paise: customer.balance_paise + toPaise(200),
      reference_type: 'bill',
      reference_id: null,
      note: 'Purana udhaar',
      created_by: 'owner',
      created_at: past,
    })
    entries.push({
      id: uuid(),
      shop_id: shopId,
      customer_id: customer.id,
      supplier_id: null,
      entry_type: 'payment',
      amount_paise: toPaise(200),
      balance_after_paise: customer.balance_paise,
      reference_type: 'repayment',
      reference_id: null,
      note: 'Cash jama',
      created_by: 'owner',
      created_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    })
  }
  if (entries.length) await db.ledger_entries.bulkPut(entries)
}

/** Wipes and re-creates the demo shop. Used from Settings → Demo data. */
export async function resetDemoData(): Promise<void> {
  await db.delete()
  await db.open()
  await seedDemoShop({ force: true })
}

export const DEMO_PRODUCT_COUNT = PRODUCT_SEED.length
