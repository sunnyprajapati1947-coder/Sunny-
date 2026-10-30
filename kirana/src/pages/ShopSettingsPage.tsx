import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Save } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { isValidVpa } from '../lib/upi'
import { PageHeader } from '../components/layout/AppShell'
import { Card, SectionTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Field, Input, Select, Toggle } from '../components/ui/form'
import type { AppLanguage } from '../types'

export default function ShopSettingsPage() {
  const { shop, updateShop, toast, saveOwnerPin, pinConfigured } = useApp()
  const t = useT()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    owner_name: '',
    phone: '',
    address: '',
    gstin: '',
    upi_id: '',
    bill_prefix: '',
    receipt_footer: '',
    receipt_width: '58' as '58' | '80',
    prices_include_gst: true,
    max_discount_percent: '10',
    loyalty_enabled: true,
    language: 'hinglish' as AppLanguage,
  })
  const [busy, setBusy] = useState(false)
  const [pin, setPin] = useState('')

  useEffect(() => {
    if (!shop) return
    setForm({
      name: shop.name,
      owner_name: shop.owner_name,
      phone: shop.phone ?? '',
      address: shop.address ?? '',
      gstin: shop.gstin ?? '',
      upi_id: shop.upi_id ?? '',
      bill_prefix: shop.bill_prefix,
      receipt_footer: shop.receipt_footer ?? '',
      receipt_width: shop.receipt_width === 80 ? '80' : '58',
      prices_include_gst: shop.prices_include_gst,
      max_discount_percent: String(shop.max_discount_percent ?? 10),
      loyalty_enabled: shop.loyalty_enabled ?? true,
      language: shop.language ?? 'hinglish',
    })
  }, [shop])

  const save = async () => {
    if (!shop) return
    if (form.upi_id && !isValidVpa(form.upi_id)) {
      toast('UPI ID galat lag rahi hai (jaise: shop@okaxis)', 'error')
      return
    }
    setBusy(true)
    try {
      await updateShop({
        name: form.name,
        owner_name: form.owner_name,
        phone: form.phone || null,
        address: form.address || null,
        gstin: form.gstin || null,
        upi_id: form.upi_id || null,
        bill_prefix: form.bill_prefix.toUpperCase().slice(0, 6) || 'BILL',
        receipt_footer: form.receipt_footer || null,
        receipt_width: Number(form.receipt_width) === 80 ? 80 : 58,
        prices_include_gst: form.prices_include_gst,
        max_discount_percent: Math.min(50, Math.max(0, Number(form.max_discount_percent) || 0)),
        loyalty_enabled: form.loyalty_enabled,
        language: form.language,
      })
      toast(t('saved'), 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : t('somethingWrong'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 pb-4">
      <PageHeader title={t('shopSettings')} subtitle={shop?.name} onBack={() => navigate('/more')} />

      <Card className="space-y-3">
        <SectionTitle title={t('shopSettings')} />
        <Field label={t('shopName')} required>
          <Input value={form.name} onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))} />
        </Field>
        <Field label={t('fullName')}>
          <Input value={form.owner_name} onChange={(event) => setForm((c) => ({ ...c, owner_name: event.target.value }))} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('phone')}>
            <Input
              value={form.phone}
              inputMode="numeric"
              onChange={(event) => setForm((c) => ({ ...c, phone: event.target.value.replace(/\D/g, '') }))}
            />
          </Field>
          <Field label={t('gstin')}>
            <Input value={form.gstin} onChange={(event) => setForm((c) => ({ ...c, gstin: event.target.value.toUpperCase() }))} />
          </Field>
        </div>
        <Field label={t('address')}>
          <Input value={form.address} onChange={(event) => setForm((c) => ({ ...c, address: event.target.value }))} />
        </Field>
        <Field label={t('upiId')} hint="UPI QR isi ID par amount generate karega">
          <Input value={form.upi_id} onChange={(event) => setForm((c) => ({ ...c, upi_id: event.target.value.trim() }))} placeholder="shop@okaxis" />
        </Field>
      </Card>

      <Card className="space-y-3">
        <SectionTitle title="Receipt" />
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('billPrefix')}>
            <Input value={form.bill_prefix} onChange={(event) => setForm((c) => ({ ...c, bill_prefix: event.target.value.toUpperCase() }))} />
          </Field>
          <Field label={t('receiptWidth')}>
            <Select value={form.receipt_width} onChange={(event) => setForm((c) => ({ ...c, receipt_width: event.target.value as '58' | '80' }))}>
              <option value="58">58 mm</option>
              <option value="80">80 mm</option>
            </Select>
          </Field>
        </div>
        <Field label={t('receiptFooter')}>
          <Input value={form.receipt_footer} onChange={(event) => setForm((c) => ({ ...c, receipt_footer: event.target.value }))} />
        </Field>
        <Toggle
          checked={form.prices_include_gst}
          onChange={(value) => setForm((c) => ({ ...c, prices_include_gst: value }))}
          label={t('pricesIncludeGst')}
          description="Kirana shops usually MRP-free pricing rakhte hain — GST included"
        />
      </Card>

      <Card className="space-y-2">
        <SectionTitle title={`${t('maxDiscount')} & ${t('loyaltyPoints')}`} />
        <Field label={`${t('maxDiscount')} %`} hint="Owner discount isse zyada nahi de sakta">
          <Input
            inputMode="numeric"
            value={form.max_discount_percent}
            onChange={(event) => setForm((c) => ({ ...c, max_discount_percent: event.target.value.replace(/\D/g, '') }))}
          />
        </Field>
        <Toggle
          checked={form.loyalty_enabled}
          onChange={(value) => setForm((c) => ({ ...c, loyalty_enabled: value }))}
          label={t('loyaltyPoints')}
          description="₹100 par 1 point · 1 point = ₹1"
        />
      </Card>

      <Card className="space-y-2">
        <SectionTitle title={t('ownerPin')} subtitle={t('pinHint')} />
        <p className="text-xs text-ink-500 dark:text-ink-400">
          {pinConfigured ? 'PIN set hai. Badalna ho to naya PIN daalein.' : 'Abhi tak PIN set nahi hai.'}
        </p>
        <div className="flex gap-2">
          <Input
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            placeholder="••••"
            type="password"
            className="flex-1"
          />
          <Button
            variant="secondary"
            icon={<Lock className="h-4 w-4" />}
            disabled={pin.length < 4}
            onClick={async () => {
              try {
                await saveOwnerPin(pin)
                setPin('')
                toast('Owner PIN set ho gaya', 'success')
              } catch (error) {
                toast(error instanceof Error ? error.message : t('somethingWrong'), 'error')
              }
            }}
          >
            {t('setPin')}
          </Button>
        </div>
      </Card>

      <Button block size="xl" loading={busy} onClick={save} icon={<Save className="h-5 w-5" />}>
        {t('save')}
      </Button>
    </div>
  )
}
