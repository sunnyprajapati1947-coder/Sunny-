import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { useLive } from '../hooks/useLive'
import { describeChange, recentAudits } from '../data/audit'
import { formatDateTime } from '../lib/date'
import type { AuditLog } from '../types'
import { PageHeader } from '../components/layout/AppShell'
import { Badge, Card, EmptyState } from '../components/ui/card'

const FILTERS = [
  { value: 'all', label: 'Sab' },
  { value: 'product', label: 'Price' },
  { value: 'bill', label: 'Bills' },
  { value: 'discount', label: 'Discount' },
  { value: 'approval', label: 'Approvals' },
]

export default function AuditLogPage() {
  const { shop } = useApp()
  const t = useT()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')

  const logs = useLive<AuditLog[]>(
    () => (shop ? recentAudits(shop.id, 200) : Promise.resolve([])),
    [shop?.id],
    [],
  )

  const filtered = (logs ?? []).filter((log) => filter === 'all' || log.entity === filter)

  return (
    <div className="space-y-3">
      <PageHeader title={t('auditLog')} subtitle={t('auditLogHint')} onBack={() => navigate('/more')} />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            className={clsx(
              'rounded-full px-3 py-1.5 text-xs font-bold',
              filter === item.value ? 'bg-brand-700 text-white' : 'bg-white text-ink-600 shadow-sm dark:bg-ink-900 dark:text-ink-200',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map((log) => {
          const change = describeChange(log)
          return (
            <Card key={log.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-500">
                    <ShieldCheck className="h-3.5 w-3.5" /> {log.entity} · {log.action}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-ink-900 dark:text-ink-50">{log.actor_name ?? '—'}</p>
                  <p className="text-[11px] text-ink-400">{formatDateTime(log.created_at)}</p>
                </div>
                <Badge tone={log.action.includes('delete') || log.action.includes('void') ? 'danger' : log.action.includes('price') || log.action === 'manual_discount' ? 'warning' : 'neutral'}>
                  {log.action.split(':').pop()}
                </Badge>
              </div>
              {change && (
                <p className="mt-2 rounded-xl bg-ink-50 p-2 text-[11px] leading-relaxed text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                  {change}
                </p>
              )}
            </Card>
          )
        })}
        {!filtered.length && <EmptyState icon={<ShieldCheck className="h-10 w-10" />} title={t('auditLog')} body={t('auditLogHint')} />}
      </div>

      <p className="pb-2 text-center text-[11px] text-ink-400">
        Audit log append-only hai — purani entry kabhi badalti nahi.
      </p>
    </div>
  )
}
