import { useState } from 'react'
import { ArrowRight, Cloud, Mail, ShieldCheck, Store, WifiOff } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { LanguageToggle } from '../components/LanguageToggle'
import { Button } from '../components/ui/button'
import { Field, Input } from '../components/ui/form'
import { Card } from '../components/ui/card'

/**
 * Onboarding + auth. When Supabase is not configured the app boots straight
 * into the offline demo shop, so this screen is only for cloud deployments.
 */
export default function LoginPage() {
  const { signIn, signUp, createShopForUser, startDemo, cloudConfigured, needsShop, user, toast } = useApp()
  const t = useT()
  const [mode, setMode] = useState<'signin' | 'signup'>(needsShop ? 'signup' : 'signin')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    shopName: '',
    phone: '',
  })

  const submit = async () => {
    setBusy(true)
    try {
      if (needsShop) {
        if (!form.shopName.trim()) throw new Error(t('shopName') + ' ' + t('requiredField'))
        await createShopForUser({ shopName: form.shopName, phone: form.phone || undefined })
      } else if (mode === 'signin') {
        if (!form.email || !form.password) throw new Error(t('requiredField'))
        await signIn(form.email, form.password)
      } else {
        if (!form.name || !form.shopName) throw new Error(t('requiredField'))
        await signUp({
          email: form.email,
          password: form.password,
          name: form.name,
          shopName: form.shopName,
          phone: form.phone,
        })
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : t('loginError'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-full bg-[#f6f4ee] px-5 py-8 dark:bg-ink-950">
      <div className="mx-auto w-full max-w-md space-y-5">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-700 font-display text-2xl font-extrabold text-white shadow-lift">
            दो
          </div>
          <h1 className="font-display text-3xl font-extrabold text-ink-900 dark:text-ink-50">{t('appName')}</h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-300">{t('tagline')}</p>
          <div className="mt-3 flex justify-center">
            <LanguageToggle />
          </div>
        </div>

        {needsShop && user ? (
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-ink-700 dark:text-ink-200">
              Account ban gaya! Ab apni dukaan ka naam daalein.
            </p>
            <Field label={t('shopName')} required>
              <Input value={form.shopName} onChange={(event) => setForm((c) => ({ ...c, shopName: event.target.value }))} placeholder="Sharma Kirana Store" />
            </Field>
            <Button block size="lg" loading={busy} onClick={submit}>
              {t('createShop')}
            </Button>
          </Card>
        ) : (
          <Card className="space-y-3">
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-ink-100 p-1 dark:bg-ink-800">
              <button
                type="button"
                onClick={() => setMode('signin')}
                className={`h-10 rounded-xl text-sm font-bold ${mode === 'signin' ? 'bg-white text-brand-800 dark:bg-ink-950 dark:text-brand-200' : 'text-ink-500'}`}
              >
                {t('signIn')}
              </button>
              <button
                type="button"
                onClick={() => setMode('signup')}
                className={`h-10 rounded-xl text-sm font-bold ${mode === 'signup' ? 'bg-white text-brand-800 dark:bg-ink-950 dark:text-brand-200' : 'text-ink-500'}`}
              >
                {t('signUp')}
              </button>
            </div>

            {mode === 'signup' && (
              <>
                <Field label={t('fullName')} required>
                  <Input value={form.name} onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))} autoComplete="name" />
                </Field>
                <Field label={t('shopName')} required>
                  <Input value={form.shopName} onChange={(event) => setForm((c) => ({ ...c, shopName: event.target.value }))} autoComplete="organization" />
                </Field>
                <Field label={t('phone')}>
                  <Input
                    value={form.phone}
                    inputMode="numeric"
                    onChange={(event) => setForm((c) => ({ ...c, phone: event.target.value.replace(/\D/g, '') }))}
                    autoComplete="tel"
                  />
                </Field>
              </>
            )}

            <Field label={t('email')} required>
              <Input
                value={form.email}
                onChange={(event) => setForm((c) => ({ ...c, email: event.target.value }))}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder={t('emailPlaceholder')}
              />
            </Field>
            <Field label={t('password')} required hint={mode === 'signup' ? 'Kam se kam 6 characters' : undefined}>
              <Input
                value={form.password}
                onChange={(event) => setForm((c) => ({ ...c, password: event.target.value }))}
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            </Field>

            <Button block size="lg" loading={busy} onClick={submit} icon={<Mail className="h-5 w-5" />}>
              {mode === 'signin' ? t('signIn') : t('signUp')}
            </Button>

            {!cloudConfigured && (
              <p className="rounded-xl bg-saffron-50 p-2.5 text-xs font-semibold text-saffron-900 dark:bg-saffron-900/25 dark:text-saffron-100">
                {t('cloudNotConfigured')}
              </p>
            )}
          </Card>
        )}

        <Button block variant="outline" size="lg" onClick={startDemo} icon={<WifiOff className="h-5 w-5" />}>
          {t('useDemo')} <ArrowRight className="h-4 w-4" />
        </Button>

        <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-semibold text-ink-500 dark:text-ink-400">
          <div className="rounded-2xl bg-white p-2.5 shadow-sm dark:bg-ink-900">
            <WifiOff className="mx-auto mb-1 h-4 w-4 text-brand-700" /> Offline first
          </div>
          <div className="rounded-2xl bg-white p-2.5 shadow-sm dark:bg-ink-900">
            <ShieldCheck className="mx-auto mb-1 h-4 w-4 text-brand-700" /> PIN security
          </div>
          <div className="rounded-2xl bg-white p-2.5 shadow-sm dark:bg-ink-900">
            <Cloud className="mx-auto mb-1 h-4 w-4 text-brand-700" /> Auto sync
          </div>
        </div>

        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-400">
          <Store className="h-3 w-3" /> Multi-shop ready · 2 phones par ek hi dukaan
        </p>
      </div>
    </div>
  )
}
