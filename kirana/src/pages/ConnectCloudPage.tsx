import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cloud, CloudOff, ExternalLink, Plug } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { PageHeader } from '../components/layout/AppShell'
import { Card, SectionTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Field, Input } from '../components/ui/form'
import { clearCloudConfig, cloudSource, saveCloudConfig, supabaseConfigured } from '../lib/supabase'

/**
 * Connects the installed app (APK included) to a Supabase project without a
 * rebuild. The anon key is public by design; RLS protects the rows.
 */
export default function ConnectCloudPage() {
  const { toast, cloudConfigured } = useApp()
  const t = useT()
  const navigate = useNavigate()
  const [form, setForm] = useState({ url: '', key: '' })
  const [busy, setBusy] = useState(false)

  const connect = () => {
    setBusy(true)
    const result = saveCloudConfig(form.url, form.key)
    if (!result.ok) {
      setBusy(false)
      toast(result.error, 'error')
      return
    }
    toast('Cloud jud gaya — app reload ho rahi hai', 'success')
    window.setTimeout(() => window.location.reload(), 600)
  }

  const disconnect = () => {
    clearCloudConfig()
    toast('Cloud hata diya — data phone par hai', 'success')
    window.setTimeout(() => window.location.reload(), 600)
  }

  return (
    <div className="space-y-3 pb-4">
      <PageHeader title={t('connectCloud')} subtitle={t('cloudConnected')} onBack={() => navigate('/more')} />

      <Card className="flex items-center gap-3">
        {cloudConfigured ? (
          <Cloud className="h-8 w-8 shrink-0 text-brand-700 dark:text-brand-300" />
        ) : (
          <CloudOff className="h-8 w-8 shrink-0 text-saffron-600" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink-900 dark:text-ink-50">
            {cloudConfigured ? t('cloudConnected') : t('cloudNotConnected')}
          </p>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            {cloudConfigured
              ? cloudSource === 'env'
                ? 'Build se set hai (.env)'
                : 'App se connect kiya gaya hai'
              : 'Bills, products aur khata is phone mein safe hain. Cloud se multi-device sync on ho jayega.'}
          </p>
        </div>
      </Card>

      {!cloudConfigured && (
        <>
          <Card className="space-y-3">
            <SectionTitle
              title="Supabase project"
              subtitle="Dashboard → Project Settings → API se URL aur anon key copy karein"
            />
            <Field label="Project URL" required>
              <Input
                value={form.url}
                onChange={(event) => setForm((c) => ({ ...c, url: event.target.value.trim() }))}
                placeholder="https://abcdefghijkl.supabase.co"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </Field>
            <Field label="Anon public key" required>
              <Input
                value={form.key}
                onChange={(event) => setForm((c) => ({ ...c, key: event.target.value.trim() }))}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </Field>
            <Button block size="lg" loading={busy} icon={<Plug className="h-5 w-5" />} onClick={connect}>
              {t('connectCloud')}
            </Button>
          </Card>

          <Card className="space-y-2 text-xs text-ink-600 dark:text-ink-300">
            <p className="font-bold text-ink-800 dark:text-ink-100">Pehli baar?</p>
            <p>
              Supabase project banayein, `supabase/migrations` ke teen SQL files chalayein, phir yahan URL + anon key
              daalein. Poora steps: <span className="font-mono">docs/SETUP.md</span>.
            </p>
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-bold text-brand-700 dark:text-brand-300"
            >
              Supabase dashboard <ExternalLink className="h-3 w-3" />
            </a>
          </Card>
        </>
      )}

      {cloudConfigured && cloudSource === 'runtime' && (
        <Button block variant="outline" onClick={disconnect}>
          Cloud disconnect karein
        </Button>
      )}
    </div>
  )
}
