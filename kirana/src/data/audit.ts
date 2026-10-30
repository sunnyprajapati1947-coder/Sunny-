import { db, localUpsert } from '../lib/db'
import { uuid } from '../lib/id'
import { sync } from '../lib/sync'
import type { AuditLog, SessionUser } from '../types'

export interface AuditInput {
  shopId: string
  actor: Pick<SessionUser, 'id' | 'name'> & { role?: string }
  entity: string
  entityId: string
  action: string
  oldValue?: Record<string, unknown> | null
  newValue?: Record<string, unknown> | null
}

/**
 * Append-only audit trail. Every price change, discount, void, stock edit and
 * role change lands here — visible to the owner in Settings → Audit log.
 */
export async function writeAudit({ shopId, actor, entity, entityId, action, oldValue, newValue }: AuditInput): Promise<AuditLog> {
  const row: AuditLog = {
    id: uuid(),
    shop_id: shopId,
    actor_id: actor.id,
    actor_name: `${actor.name}${actor.role ? ` (${actor.role})` : ''}`,
    entity,
    entity_id: entityId,
    action,
    old_value: oldValue ?? null,
    new_value: newValue ?? null,
    created_at: new Date().toISOString(),
  }
  await localUpsert('audit_logs', row)
  sync.schedule(400)
  return row
}

/** Human-readable diff between two records, for the audit UI. */
export function describeChange(log: AuditLog): string {
  const oldValue = log.old_value ?? {}
  const newValue = log.new_value ?? {}
  const keys = Object.keys({ ...oldValue, ...newValue })
  if (!keys.length) return log.action
  const parts: string[] = []
  for (const key of keys) {
    const before = oldValue[key]
    const after = newValue[key]
    if (JSON.stringify(before) === JSON.stringify(after)) continue
    const label = key.replace(/_paise$/, '').replace(/_/g, ' ')
    const format = (value: unknown) =>
      key.endsWith('_paise') && typeof value === 'number'
        ? `₹${(value / 100).toFixed(2)}`
        : value === null || value === undefined || value === ''
          ? '—'
          : String(value)
    parts.push(`${label}: ${format(before)} → ${format(after)}`)
  }
  return parts.join(' · ')
}

export async function recentAudits(shopId: string, limit = 100, entity?: string): Promise<AuditLog[]> {
  const collection = entity
    ? db.audit_logs.where('shop_id').equals(shopId).filter((row) => row.entity === entity)
    : db.audit_logs.where('shop_id').equals(shopId)
  const rows = await collection.toArray()
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)
}
