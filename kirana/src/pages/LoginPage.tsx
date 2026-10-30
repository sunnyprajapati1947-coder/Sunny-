import { useState } from 'react'
import { ArrowRight, Mail, Store } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { LanguageToggle } from '../components/LanguageToggle'
import { Button } from '../components/ui/button'
import { Field, Input } from '../components/ui/form'
import { Card } from '../components/ui/card'
import { SHOP_INFO } from '../lib/shop'

/**
 * Cloud sign-in. Only shown when a Supabase project is connected — without one
 * the app goes straight to the shop setup screen and stores data on the phone.
 */
export default function LoginPage() {
  const { signIn, signUp, createShopForUser, needsShop, user, toast } = useApp()
  const t = useT()
  const [mode, setMode] = useState<'signin' | 'signup'>(needsShop ? 'signup' : 'signin')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<{
    email: string
    password: string
    name: string
    shopName: string
    phone: string
  }>({
    email: '',
    password: '',
    name: SHOP_INFO.owner_name,
    shopName: SHOP_INFO.name,
    phone: SHOP_INFO.phone,
  })

  const submit = async () => {
    setBusy(true)
    try {
      if (needsShop) {
        if (!form.shopName.trim()) throw new Error(`${t('shopName')} — ${t('requiredField')}`)
        await createShopForUser({
          shopName: form.shopName,
          ownerName: form.name,
          phone: form.phone || undefined,
        })
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
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-700 font-display text-xl font-extrabold text-white shadow-lift">
            RKS
          </div>
          <h1 className="font-display text-2xl font-extrabold text-ink-900 dark:text-ink-50">{t('appName')}</h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-300">{t('tagline')}</p>
          <div className="mt-3 flex justify-center">
            <LanguageToggle />
          </div>
        </div>

        {needsShop && user ? (
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-ink-700 dark:text-ink-200">{t('setupBody')}</p>
            <Field label={t('shopNameLabel')} required>
              <Input
                value={form.shopName}
                onChange={(event) => setForm((c) => ({ ...c, shopName: event.target.value }))}
                placeholder={SHOP_INFO.name}
              />
            </Field>
            <Button block size="lg" loading={busy} onClick={submit}>
              {t('createShop')}
            </Button>
          </Card>
        ) : (
          <Card className="space-y-3">
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-ink-100 p-1 dark:bg-ink-800">
              {(['signin', 'signup'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={`h-10 rounded-xl text-sm font-bold ${
                    mode === option
                      ? 'bg-white text-brand-800 dark:bg-ink-950 dark:text-brand-200'
                      : 'text-ink-500'
                  }`}
                >
                  {option === 'signin' ? t('signIn') : t('signUp')}
                </button>
              ))}
            </div>

            {mode === 'signup' && (
              <>
                <Field label={t('ownerNameLabel')} required>
                  <Input value={form.name} onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))} />
                </Field>
                <Field label={t('shopNameLabel')} required>
                  <Input
                    value={form.shopName}
                    onChange={(event) => setForm((c) => ({ ...c, shopName: event.target.value }))}
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
                placeholder="shop@email.com"
              />
            </Field>
            <Field label={t('password')} required hint={mode === 'signup' ? '6+ characters' : undefined}>
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
          </Card>
        )}

        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] font-semibold text-ink-400">
          <Store className="h-3 w-3" /> {SHOP_INFO.name} · {SHOP_INFO.address}
          <ArrowRight className="h-3 w-3" />
        </p>
      </div>
    </div>
  )
}
