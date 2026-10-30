import type { CartLine, Offer } from '../types'
import { istDateKey } from './date'
import { percentOf } from './money'

export interface AppliedOffer {
  offer: Offer
  amount_paise: number
  label: string
}

export interface OfferResult {
  discount_paise: number
  applied: AppliedOffer[]
}

function isLive(offer: Offer, today: string): boolean {
  if (!offer.is_active) return false
  if (offer.start_date && today < offer.start_date) return false
  if (offer.end_date && today > offer.end_date) return false
  return true
}

/**
 * Auto-applies owner-created offers. These are not "manual discounts" — they
 * are configured in advance by the owner, so a cashier never keys them in.
 */
export function applyOffers(lines: CartLine[], offers: Offer[], today = istDateKey()): OfferResult {
  const applied: AppliedOffer[] = []
  let total = 0
  for (const offer of offers) {
    if (!isLive(offer, today)) continue
    let amount = 0

    if (offer.type === 'bogo' && offer.product_id) {
      const line = lines.find((l) => l.product_id === offer.product_id)
      if (line) {
        const cycle = Math.max(1, offer.buy_qty + offer.get_qty)
        const freeUnits = Math.floor(line.qty / cycle) * Math.max(1, offer.get_qty)
        amount = Math.round(freeUnits * line.unit_price_paise)
      }
    } else if (offer.type === 'flat' && offer.product_id) {
      const line = lines.find((l) => l.product_id === offer.product_id)
      if (line && line.qty >= Math.max(1, offer.min_qty)) amount = offer.discount_paise
    } else if (offer.type === 'percent') {
      const targets = offer.product_id
        ? lines.filter((l) => l.product_id === offer.product_id)
        : offer.category_id
          ? lines.filter((l) => (l as CartLine & { category_id?: string }).category_id === offer.category_id)
          : lines
      for (const line of targets) {
        if (line.qty < Math.max(1, offer.min_qty)) continue
        amount += percentOf(Math.round(line.qty * line.unit_price_paise), offer.discount_percent)
      }
    } else if (offer.type === 'combo' && offer.product_id && offer.combo_product_id) {
      const first = lines.find((l) => l.product_id === offer.product_id)
      const second = lines.find((l) => l.product_id === offer.combo_product_id)
      if (first && second) {
        const pairs = Math.min(first.qty, second.qty)
        const base = first.unit_price_paise + second.unit_price_paise
        amount = Math.round(pairs * (offer.discount_paise || percentOf(base, offer.discount_percent)))
      }
    }

    if (amount > 0) {
      total += amount
      applied.push({ offer, amount_paise: amount, label: offer.name_hi || offer.name })
    }
  }
  return { discount_paise: total, applied }
}

export function describeOffer(offer: Offer): string {
  switch (offer.type) {
    case 'bogo':
      return `Buy ${offer.buy_qty} Get ${offer.get_qty}`
    case 'flat':
      return `₹${(offer.discount_paise / 100).toFixed(0)} off`
    case 'percent':
      return `${offer.discount_percent}% off`
    case 'combo':
      return offer.discount_paise ? `Combo ₹${(offer.discount_paise / 100).toFixed(0)} off` : `Combo ${offer.discount_percent}% off`
    default:
      return offer.type
  }
}
