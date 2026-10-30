import { db, localUpsert } from './db'
import { uuid } from './id'
import type { AppLanguage, SessionUser, Shop } from '../types'

/**
 * The shop this app is built for. These values pre-fill the setup screen once
 * (they are not demo data — nothing is written until the shopkeeper taps Save,
 * and afterwards the shop row in the database is the only source of truth).
 */
export const SHOP_INFO = {
  name: 'Rishu Kirana Store',
  owner_name: 'Rishu',
  phone: '9608087035',
  address: 'Gaya Road, Nawada',
  upi_id: 'sunny-ff-reedem-code@fam',
  bill_prefix: 'RKS',
} as const

/** Owner id used when the app runs without a cloud account. */
export const LOCAL_OWNER_ID = 'local-owner'

export interface ShopSetupInput {
  name: string
  owner_name: string
  phone?: string | null
  address?: string | null
  upi_id?: string | null
  /** Set when a cloud account already created the row (signup RPC). */
  id?: string
  language?: AppLanguage
}

export function normalisePhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (!digits) return null
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.slice(-10)
}

/** Builds the shop row; nothing is persisted here. */
export function buildShop(input: ShopSetupInput): Shop {
  const now = new Date().toISOString()
  return {
    id: input.id ?? uuid(),
    name: input.name.trim(),
    owner_name: input.owner_name.trim(),
    phone: normalisePhone(input.phone),
    address: input.address?.trim() || null,
    gstin: null,
    upi_id: input.upi_id?.trim() || null,
    bill_prefix: SHOP_INFO.bill_prefix,
    receipt_footer: null,
    prices_include_gst: true,
    receipt_width: 58,
    max_discount_percent: 10,
    loyalty_enabled: false,
    language: input.language ?? 'hinglish',
    created_at: now,
    updated_at: now,
  }
}

/**
 * First run without a cloud account: the shop lives in the device database and
 * every entry written afterwards is real (no sample products, bills or khata).
 */
export async function createLocalShop(input: ShopSetupInput): Promise<Shop> {
  const shop = buildShop(input)
  await localUpsert('shops', shop)
  return shop
}

/** The single shop stored on this device, if the shopkeeper already set it up. */
export async function loadLocalShop(): Promise<Shop | null> {
  const rows = await db.shops.toCollection().toArray()
  if (!rows.length) return null
  return rows.sort((a, b) => a.created_at.localeCompare(b.created_at))[rows.length - 1]
}

export function localOwner(shop: Shop): SessionUser {
  return {
    id: LOCAL_OWNER_ID,
    shopId: shop.id,
    name: shop.owner_name || SHOP_INFO.owner_name,
    role: 'owner',
    isDemo: false,
  }
}
