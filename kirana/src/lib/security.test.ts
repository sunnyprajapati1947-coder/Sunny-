import { beforeEach, describe, expect, it } from 'vitest'
import { db, getMeta, setMeta } from './db'
import { can, PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS } from './permissions'
import { clearPin, hasPinSet, setPin, verifyPin } from './pin'
import type { Role } from '../types'

beforeEach(async () => {
  if (!db.isOpen()) await db.open()
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })
})

describe('role permissions', () => {
  it('gives the owner every permission', () => {
    for (const permission of Object.keys(PERMISSIONS) as Array<keyof typeof PERMISSIONS>) {
      expect(can('owner', permission), permission).toBe(true)
    }
  })

  it('stops a manager from touching money rules', () => {
    expect(can('manager', 'product.edit')).toBe(true)
    expect(can('manager', 'inventory.purchase')).toBe(true)
    expect(can('manager', 'reports.view')).toBe(true)

    expect(can('manager', 'product.edit_price')).toBe(false)
    expect(can('manager', 'billing.discount')).toBe(false)
    expect(can('manager', 'billing.void')).toBe(false)
    expect(can('manager', 'reports.profit')).toBe(false)
    expect(can('manager', 'inventory.audit')).toBe(false)
    expect(can('manager', 'audit.view')).toBe(false)
    expect(can('manager', 'settings.staff')).toBe(false)
  })

  it('keeps the cashier to billing and khata', () => {
    expect(can('cashier', 'billing.create')).toBe(true)
    expect(can('cashier', 'khata.collect')).toBe(true)
    expect(can('cashier', 'product.create')).toBe(false)
    expect(can('cashier', 'reports.view')).toBe(false)
    expect(can('cashier', 'inventory.purchase')).toBe(false)
  })

  it('denies everything without a session', () => {
    expect(can(null, 'billing.create')).toBe(false)
    expect(can(undefined, 'product.edit')).toBe(false)
  })

  it('only lists real roles', () => {
    const roles: Role[] = ['owner', 'manager', 'cashier']
    for (const allowed of Object.values(PERMISSIONS)) {
      for (const role of allowed) expect(roles).toContain(role)
    }
    expect(Object.keys(ROLE_LABELS).sort()).toEqual(['cashier', 'manager', 'owner'])
    expect(ROLE_DESCRIPTIONS.manager).toContain('price change nahi')
  })
})

describe('owner PIN', () => {
  it('stores a derived hash, never the PIN itself', async () => {
    await setPin('4321')
    const stored = await getMeta<string | null>('owner_pin_hash', null)
    expect(stored).toBeTruthy()
    expect(stored).not.toContain('4321')

    const record = JSON.parse(stored as string) as { v: number; salt: string; iterations: number }
    expect(record.v).toBe(2)
    expect(record.salt).toHaveLength(32)
    expect(record.iterations).toBeGreaterThanOrEqual(100_000)
  })

  it('accepts the right PIN and rejects the wrong one', async () => {
    await setPin('123456')
    expect(await verifyPin('123456')).toBe(true)
    expect(await verifyPin('123457')).toBe(false)
    expect(await verifyPin('12345')).toBe(false)
  })

  it('uses a fresh salt for every PIN, so identical PINs differ on disk', async () => {
    await setPin('1111')
    const first = await getMeta<string | null>('owner_pin_hash', null)
    await setPin('1111')
    const second = await getMeta<string | null>('owner_pin_hash', null)
    expect(first).not.toBe(second)
    expect(await verifyPin('1111')).toBe(true)
  })

  it('rejects malformed PINs and unset shops', async () => {
    expect(await hasPinSet()).toBe(false)
    expect(await verifyPin('1234')).toBe(false)
    await expect(setPin('12')).rejects.toThrow(/4 se 6/)
    await expect(setPin('abcd')).rejects.toThrow(/4 se 6/)
  })

  it('upgrades a legacy v1 hash on first successful login', async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('dukaan-dost:9876'))
    const legacy = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    await setMeta('owner_pin_hash', legacy)

    expect(await verifyPin('9876')).toBe(true)

    const upgraded = await getMeta<string | null>('owner_pin_hash', null)
    expect(upgraded).not.toBe(legacy)
    expect(JSON.parse(upgraded as string).v).toBe(2)
    expect(await verifyPin('9876')).toBe(true)
  })

  it('clears the PIN', async () => {
    await setPin('2468')
    await clearPin()
    expect(await hasPinSet()).toBe(false)
    expect(await verifyPin('2468')).toBe(false)
  })
})
