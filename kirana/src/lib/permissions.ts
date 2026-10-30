import type { Role } from '../types'

/**
 * Single source of truth for who can do what. The UI hides what a role cannot
 * do; the database enforces the same rules again with RLS + triggers.
 */
export const PERMISSIONS = {
  'product.create': ['owner', 'manager'],
  'product.edit_price': ['owner'],
  'product.edit': ['owner', 'manager'],
  'product.delete': ['owner'],
  'product.import': ['owner'],
  'billing.create': ['owner', 'manager', 'cashier'],
  'billing.discount': ['owner'],
  'billing.void': ['owner'],
  'billing.hold': ['owner', 'manager', 'cashier'],
  'billing.refund': ['owner'],
  'inventory.purchase': ['owner', 'manager'],
  'inventory.adjust': ['owner', 'manager'],
  'inventory.audit': ['owner'],
  'khata.add': ['owner', 'manager', 'cashier'],
  'khata.collect': ['owner', 'manager', 'cashier'],
  'khata.edit_limit': ['owner', 'manager'],
  'customer.delete': ['owner'],
  'reports.view': ['owner', 'manager'],
  'reports.profit': ['owner'],
  'settings.shop': ['owner'],
  'settings.staff': ['owner'],
  'audit.view': ['owner'],
  'dayclose.view': ['owner', 'manager'],
} as const satisfies Record<string, readonly Role[]>

export type Permission = keyof typeof PERMISSIONS

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false
  return (PERMISSIONS[permission] as readonly Role[]).includes(role)
}

export const ROLE_LABELS: Record<Role, { hi: string; en: string }> = {
  owner: { hi: 'मालिक', en: 'Owner' },
  manager: { hi: 'मैनेजर', en: 'Manager' },
  cashier: { hi: 'कैशियर', en: 'Cashier' },
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Sab kuch — price change, discount, reports, staff',
  manager: 'Products, stock, purchase, khata — price change nahi',
  cashier: 'Sirf billing aur khata vasooli',
}
