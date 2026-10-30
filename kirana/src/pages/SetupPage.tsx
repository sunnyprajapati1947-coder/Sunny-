import { useState } from 'react'
import { ArrowRight, Check, Store } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { LanguageToggle } from '../components/LanguageToggle'
import { Button } from '../components/ui/button'
import { Field, Input } from '../components/ui/form'
import { SHOP_INFO, normalisePhone } from '../lib/shop'

/**
 * First run without a cloud account. The fields are pre-filled with this shop's
 * details; saving writes the real shop row and opens the till. No sample
 * products, bills or customers are ever created.
 */
export default function SetupPage() {
  const { completeSetup, toast } = useApp()
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<{
    name: string
    owner_name: string
    phone: string
    address: string
    upi_id: string
  }>({
    name: SHOP_INFO.name,
    owner_name: SHOP_INFO.owner_name,
    phone: SHOP_INFO.phone,
    address: SHOP_INFO.address,
    upi_id: SHOP_INFO.upi_id,
  })

  const submit = async () => {
    if (!form.name.trim()) {
      toast(`${t('shopName')} — ${t('requiredField')}`, 'error')
      return
    }
    if (form.phone && normalisePhone(form.phone)?.length !== 10) {
      toast(t('invalidPhone'), 'error')
      return
    }
    setBusy(true)
    try {
      await completeSetup({
        name: form.name,
        owner_name: form.owner_name || SHOP_INFO.owner_name,
        phone: form.phone,
        address: form.address,
        upi_id: form.upi_id,
      })
      toast(t('setupSaved'), 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : t('somethingWrong'), 'error')
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
          <h1 className="font-display text-2xl font-extrabold leading-tight text-ink-900 dark:text-ink-50">
            {t('setupTitle')}
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-300">{t('setupBody')}</p>
          <div className="mt-3 flex justify-center">
            <LanguageToggle />
          </div>
        </div>

        <div className="space-y-3 rounded-3xl bg-white p-4 shadow-card dark:bg-ink-900">
          <Field label={t('shopNameLabel')} required>
            <Input
              value={form.name}
              onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))}
              placeholder={SHOP_INFO.name}
              autoComplete="organization"
            />
          </Field>
          <Field label={t('ownerNameLabel')}>
            <Input
              value={form.owner_name}
              onChange={(event) => setForm((c) => ({ ...c, owner_name: event.target.value }))}
              autoComplete="name"
            />
          </Field>
          <Field label={t('phone')}>
            <Input
              value={form.phone}
              inputMode="numeric"
              onChange={(event) => setForm((c) => ({ ...c, phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))}
              autoComplete="tel"
            />
          </Field>
          <Field label={t('addressLabel')}>
            <Input value={form.address} onChange={(event) => setForm((c) => ({ ...c, address: event.target.value }))} />
          </Field>
          <Field label={t('upiIdLabel')} hint="example@okaxis">
            <Input
              value={form.upi_id}
              onChange={(event) => setForm((c) => ({ ...c, upi_id: event.target.value }))}
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </Field>
        </div>

        <Button block size="xl" loading={busy} onClick={submit} icon={<Check className="h-5 w-5" />}>
          {t('startShop')}
        </Button>

        <div className="rounded-2xl bg-white/70 p-3 text-center text-[11px] font-medium leading-relaxed text-ink-500 dark:bg-ink-900/70 dark:text-ink-400">
          <p className="flex items-center justify-center gap-1.5 font-bold text-ink-600 dark:text-ink-300">
            <Store className="h-3.5 w-3.5" /> {form.address || SHOP_INFO.address}
          </p>
          <p className="mt-1">
            Sab kuch is phone mein save hota hai. Backup: More → Download backup. Cloud sync baad mein
            More → Connect cloud se on kar sakte hain.
          </p>
        </div>

        <p className="flex items-center justify-center gap-1 text-[11px] font-semibold text-ink-400">
          {t('appName')} <ArrowRight className="h-3 w-3" /> {t('navHome')}
        </p>
      </div>
    </div>
  )
}
