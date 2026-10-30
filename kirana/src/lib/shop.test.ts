import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { SHOP_INFO, buildShop, createLocalShop, loadLocalShop, localOwner, normalisePhone } from './shop'
import { resetDb } from '../test/fixtures'

beforeEach(async () => {
  await resetDb()
})

describe('shop setup', () => {
  it('pre-fills the real shop, with no sample rows attached', async () => {
    expect(SHOP_INFO).toMatchObject({
      name: 'Rishu Kirana Store',
      owner_name: 'Rishu',
      phone: '9608087035',
      address: 'Gaya Road, Nawada',
      upi_id: 'sunny-ff-reedem-code@fam',
      bill_prefix: 'RKS',
    })
    const shop = buildShop({ name: 'X', owner_name: 'Y' })
    expect(shop.gstin).toBeNull()
    expect(shop.max_discount_percent).toBe(10)
    expect(shop.prices_include_gst).toBe(true)
  })

  it('normalises Indian phone numbers', () => {
    expect(normalisePhone('9608087035')).toBe('9608087035')
    expect(normalisePhone('+91 96080 87035')).toBe('9608087035')
    expect(normalisePhone('')).toBeNull()
    expect(normalisePhone(null)).toBeNull()
  })

  it('creates the shop row and nothing else', async () => {
    const shop = await createLocalShop({
      name: SHOP_INFO.name,
      owner_name: SHOP_INFO.owner_name,
      phone: SHOP_INFO.phone,
      address: SHOP_INFO.address,
      upi_id: SHOP_INFO.upi_id,
    })

    expect(await db.shops.count()).toBe(1)
    expect(await db.products.count()).toBe(0)
    expect(await db.bills.count()).toBe(0)
    expect(await db.customers.count()).toBe(0)

    const loaded = await loadLocalShop()
    expect(loaded?.id).toBe(shop.id)
    expect(loaded?.name).toBe('Rishu Kirana Store')
    expect(loaded?.upi_id).toBe('sunny-ff-reedem-code@fam')
  })

  it('returns null before the first setup, so the app shows the setup screen', async () => {
    expect(await loadLocalShop()).toBeNull()
  })

  it('builds the owner session from the saved shop', async () => {
    const shop = await createLocalShop({ name: SHOP_INFO.name, owner_name: SHOP_INFO.owner_name })
    const owner = localOwner(shop)
    expect(owner.role).toBe('owner')
    expect(owner.shopId).toBe(shop.id)
    expect(owner.name).toBe('Rishu')
    expect(owner.isDemo).toBe(false)
  })
})
