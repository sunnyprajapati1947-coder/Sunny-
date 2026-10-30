import { describe, expect, it } from 'vitest'
import { applyOffers } from './offers'
import type { CartLine, Offer } from '../types'

function cartLine(overrides: Partial<CartLine>): CartLine {
  return {
    key: 'k1',
    product_id: 'p1',
    name_en: 'Lux Soap',
    name_hi: 'लक्स साबुन',
    barcode: null,
    unit: 'pcs',
    is_loose: false,
    qty: 1,
    unit_price_paise: 3800,
    mrp_paise: 4000,
    gst_rate: 18,
    image_url: null,
    stock_qty: 100,
    ...overrides,
  }
}

function offer(overrides: Partial<Offer>): Offer {
  return {
    id: 'o1',
    shop_id: 's1',
    name: 'Offer',
    name_hi: 'ऑफर',
    type: 'bogo',
    is_active: true,
    product_id: 'p1',
    combo_product_id: null,
    buy_qty: 2,
    get_qty: 1,
    discount_percent: 0,
    discount_paise: 0,
    category_id: null,
    min_qty: 0,
    start_date: null,
    end_date: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

describe('applyOffers', () => {
  it('gives one free unit for buy 2 get 1', () => {
    const result = applyOffers([cartLine({ qty: 3 })], [offer({})], '2026-10-30')
    expect(result.discount_paise).toBe(3800)
  })

  it('gives two free units for six soaps', () => {
    const result = applyOffers([cartLine({ qty: 6 })], [offer({})], '2026-10-30')
    expect(result.discount_paise).toBe(7600)
  })

  it('does nothing when the cart has too few units', () => {
    expect(applyOffers([cartLine({ qty: 2 })], [offer({})], '2026-10-30').discount_paise).toBe(0)
  })

  it('applies a flat discount only above the minimum quantity', () => {
    const flat = offer({ type: 'flat', discount_paise: 1000, min_qty: 2, buy_qty: 0, get_qty: 0 })
    expect(applyOffers([cartLine({ qty: 1 })], [flat], '2026-10-30').discount_paise).toBe(0)
    expect(applyOffers([cartLine({ qty: 2 })], [flat], '2026-10-30').discount_paise).toBe(1000)
  })

  it('applies percentage discounts per line', () => {
    const percent = offer({ type: 'percent', discount_percent: 10, min_qty: 1 })
    const result = applyOffers([cartLine({ qty: 2 })], [percent], '2026-10-30')
    expect(result.discount_paise).toBe(760)
  })

  it('ignores expired and future offers', () => {
    const dated = offer({ start_date: '2026-01-01', end_date: '2026-01-31' })
    expect(applyOffers([cartLine({ qty: 3 })], [dated], '2026-10-30').discount_paise).toBe(0)
    expect(applyOffers([cartLine({ qty: 3 })], [dated], '2026-01-15').discount_paise).toBe(3800)
  })

  it('respects is_active', () => {
    expect(applyOffers([cartLine({ qty: 3 })], [offer({ is_active: false })], '2026-10-30').discount_paise).toBe(0)
  })

  it('applies a combo when both products are present', () => {
    const combo = offer({
      type: 'combo',
      product_id: 'p1',
      combo_product_id: 'p2',
      discount_paise: 1500,
    })
    const cart = [cartLine({ qty: 1 }), cartLine({ key: 'k2', product_id: 'p2', qty: 1, unit_price_paise: 3000 })]
    const result = applyOffers(cart, [combo], '2026-10-30')
    expect(result.discount_paise).toBe(1500)
    expect(result.applied[0]?.offer.id).toBe('o1')
  })
})
