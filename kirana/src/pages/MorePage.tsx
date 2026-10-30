import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3,
  BookOpenCheck,
  ChevronRight,
  ClipboardList,
  CloudDownload,
  Database,
  Download,
  FileSpreadsheet,
  Languages,
  LogOut,
  Moon,
  Package,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Store,
  Sun,
  Truck,
  Type,
  Wifi,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { sync } from '../lib/sync'
import { exportBackup } from '../lib/db'
import { downloadJson } from '../lib/storage'
import { formatDateTime } from '../lib/date'
import { ROLE_DESCRIPTIONS, ROLE_LABELS, can } from '../lib/permissions'
import { LanguageToggle } from '../components/LanguageToggle'
import { Badge, Card, SectionTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Toggle } from '../components/ui/form'
import { useConfirm } from '../components/ui/feedback'
import { useOnline } from '../hooks/useOnline'

export default function MorePage() {
  const { shop, user, dark, setDark, largeText, setLargeText, syncState, pendingSync, signOut, toast, demoMode, resetDemo } =
    useApp()
  const t = useT()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const online = useOnline()
  const [installPrompt, setInstallPrompt] = useState<{ prompt: () => Promise<void> } | null>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault()
      const promptEvent = event as Event & { prompt: () => Promise<void> }
      setInstallPrompt({ prompt: () => promptEvent.prompt() })
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const isOwner = user?.role === 'owner'
  const isManager = can(user?.role, 'reports.view')

  const items = [
    { title: t('reports'), subtitle: t('salesToday'), icon: BarChart3, to: '/reports', show: isManager },
    { title: t('inventory'), subtitle: t('lowStock') + ' · ' + t('deadStock'), icon: Package, to: '/inventory', show: true },
    { title: t('purchases'), subtitle: t('supplierLedger'), icon: Truck, to: '/purchases', show: can(user?.role, 'inventory.purchase') },
    { title: t('orderList'), subtitle: t('orderListHint'), icon: ClipboardList, to: '/order-list', show: true },
    { title: t('bills'), subtitle: t('bills') + ' · ' + t('pdf'), icon: ReceiptText, to: '/bills', show: true },
    { title: t('stockAudit'), subtitle: t('stockAuditHint'), icon: BookOpenCheck, to: '/inventory/audit', show: isOwner },
    { title: t('shopSettings'), subtitle: t('upiId') + ' · ' + t('gstin'), icon: Store, to: '/settings', show: isOwner },
    { title: t('auditLog'), subtitle: t('auditLogHint'), icon: ShieldCheck, to: '/settings/audit', show: isOwner },
  ].filter((item) => item.show)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-ink-900 dark:text-ink-50">{t('navMore')}</h1>
        <p className="text-xs text-ink-500 dark:text-ink-400">
          {user?.name} · {user ? ROLE_LABELS[user.role].en : '—'} {user?.isDemo ? '· demo' : ''}
        </p>
      </div>

      <Card className="space-y-1">
        <SectionTitle title={t('language')} subtitle={t('tagline')} />
        <LanguageToggle />
      </Card>

      <Card className="space-y-1">
        <Toggle checked={dark} onChange={setDark} label={t('darkMode')} description="Raat mein aankhon ke liye aaram" />
        <Toggle checked={largeText} onChange={setLargeText} label={t('largeText')} description="Bade akshar — dhoop mein padhne ke liye" />
      </Card>

      <div>
        <SectionTitle title={t('quickActions')} />
        <Card className="divide-y divide-ink-100 p-0 dark:divide-ink-800">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.to}
                type="button"
                onClick={() => navigate(item.to)}
                className="flex w-full items-center gap-3 p-3 text-left active:bg-ink-50 dark:active:bg-ink-800"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink-900 dark:text-ink-50">{item.title}</p>
                  <p className="truncate text-xs text-ink-500 dark:text-ink-400">{item.subtitle}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-ink-400" />
              </button>
            )
          })}
        </Card>
      </div>

      <Card className="space-y-2">
        <SectionTitle title={t('backup')} subtitle={`${syncState} · ${pendingSync} ${t('pendingSync')}`} />
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            loading={syncing}
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={async () => {
              setSyncing(true)
              const result = await sync.syncNow()
              setSyncing(false)
              toast(
                result.error ? `Sync error: ${result.error}` : `${result.pushed} pushed · ${result.pulled} pulled`,
                result.error ? 'error' : 'success',
              )
            }}
          >
            {t('syncNow')}
          </Button>
          <Button
            variant="secondary"
            icon={<Download className="h-4 w-4" />}
            onClick={async () => {
              const data = await exportBackup()
              downloadJson(data, `dukaan-backup-${new Date().toISOString().slice(0, 10)}.json`)
              toast('Backup file download ho gayi', 'success')
            }}
          >
            {t('downloadBackup')}
          </Button>
        </div>
        <p className="flex items-center gap-1 text-[11px] text-ink-500 dark:text-ink-400">
          {online ? <Wifi className="h-3 w-3" /> : <CloudDownload className="h-3 w-3" />}
          {online ? 'Online — changes auto sync hote hain' : 'Offline — sab kuch phone mein save ho raha hai'}
        </p>
      </Card>

      {installPrompt && (
        <Button block variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => void installPrompt.prompt()}>
          {t('installApp')}
        </Button>
      )}

      <Card className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase text-ink-500">
          <Languages className="h-3.5 w-3.5" /> {t('role')}: {user ? ROLE_LABELS[user.role].en : '—'}
        </p>
        <p className="text-xs text-ink-500 dark:text-ink-400">{user ? ROLE_DESCRIPTIONS[user.role] : ''}</p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Badge tone="success">
            <ShieldCheck className="h-3 w-3" /> PIN protected
          </Badge>
          <Badge tone="info">
            <Database className="h-3 w-3" /> IndexedDB
          </Badge>
          <Badge tone="neutral">
            <FileSpreadsheet className="h-3 w-3" /> Excel
          </Badge>
          <Badge tone="warning">
            <Moon className="h-3 w-3" /> PWA
          </Badge>
        </div>
      </Card>

      {demoMode && (
        <Card className="space-y-2">
          <p className="text-xs font-bold uppercase text-ink-500">{t('demoData')}</p>
          <Button
            block
            variant="outline"
            onClick={async () => {
              const ok = await confirm({ title: t('resetDemo'), body: t('resetDemoConfirm'), tone: 'danger' })
              if (ok) await resetDemo()
            }}
          >
            {t('resetDemo')}
          </Button>
        </Card>
      )}

      <Button
        block
        variant="ghost"
        icon={<LogOut className="h-4 w-4" />}
        onClick={async () => {
          const ok = await confirm({ title: t('signOut'), body: t('confirmDeleteBody'), tone: 'danger' })
          if (ok) await signOut()
        }}
      >
        {t('signOut')}
      </Button>

      <p className="pb-2 text-center text-[11px] text-ink-400">
        Dukaan Dost v1.0 · {formatDateTime(new Date().toISOString())} · <Sun className="inline h-3 w-3" /> Made for kirana shops
      </p>
    </div>
  )
}
