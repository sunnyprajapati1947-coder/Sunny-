import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Camera, Lock, Package, Scale, Trash2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { db } from '../lib/db'
import { formatPaise, grossMarginPercent, toPaise, toRupees } from '../lib/money'
import { can } from '../lib/permissions'
import { adjustStock, saveProduct, setProductActive, type ProductInput } from '../data/products'
import { uploadProductImage, fileToPreview } from '../lib/storage'
import { supabaseConfigured } from '../lib/supabase'
import type { Product, Unit } from '../types'
import { Badge, Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Field, Input, MoneyInput, Select, Textarea, Toggle } from '../components/ui/form'
import { ScanPanel } from '../components/billing/ScanPanel'
import { Sheet } from '../components/ui/sheet'
import { useConfirm } from '../components/ui/feedback'
import { PageHeader } from '../components/layout/AppShell'

const UNITS: Unit[] = ['pcs', 'kg', 'g', 'litre', 'ml', 'packet', 'dozen', 'box']
const GST_RATES = [0, 5, 12, 18, 28]

interface FormState {
  barcode: string
  name_en: string
  name_hi: string
  category_id: string
  brand: string
  unit: Unit
  purchase_price: string
  selling_price: string
  mrp: string
  gst_rate: string
  stock_qty: string
  low_stock_limit: string
  expiry_date: string
  hsn_code: string
  image_url: string | null
  is_active: boolean
}

const EMPTY: FormState = {
  barcode: '',
  name_en: '',
  name_hi: '',
  category_id: '',
  brand: '',
  unit: 'pcs',
  purchase_price: '',
  selling_price: '',
  mrp: '',
  gst_rate: '0',
  stock_qty: '0',
  low_stock_limit: '5',
  expiry_date: '',
  hsn_code: '',
  image_url: null,
  is_active: true,
}

export default function ProductFormPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { shop, user, toast, requestApproval } = useApp()
  const t = useT()
  const confirm = useConfirm()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [existing, setExisting] = useState<Product | null>(null)
  const [categories, setCategories] = useState<{ id: string; name_en: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [scanOpen, setScanOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustValue, setAdjustValue] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)

  const isNew = !id
  const canEdit = can(user?.role, 'product.edit')
  const canEditPrice = can(user?.role, 'product.edit_price')

  useEffect(() => {
    void (async () => {
      if (!shop) return
      const cats = await db.categories.where('shop_id').equals(shop.id).sortBy('sort_order')
      setCategories(cats.map((c) => ({ id: c.id, name_en: c.name_en })))
      if (id) {
        const product = await db.products.get(id)
        if (product) {
          setExisting(product)
          setForm({
            barcode: product.barcode ?? '',
            name_en: product.name_en,
            name_hi: product.name_hi,
            category_id: product.category_id ?? '',
            brand: product.brand ?? '',
            unit: product.unit,
            purchase_price: product.purchase_price_paise ? String(toRupees(product.purchase_price_paise)) : '',
            selling_price: String(toRupees(product.selling_price_paise)),
            mrp: product.mrp_paise ? String(toRupees(product.mrp_paise)) : '',
            gst_rate: String(product.gst_rate),
            stock_qty: String(product.stock_qty),
            low_stock_limit: String(product.low_stock_limit),
            expiry_date: product.expiry_date ?? '',
            hsn_code: product.hsn_code ?? '',
            image_url: product.image_url,
            is_active: product.is_active,
          })
        }
      } else {
        setForm({ ...EMPTY, barcode: searchParams.get('barcode') ?? '' })
      }
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, shop?.id])

  const margin = useMemo(
    () => grossMarginPercent(toPaise(form.selling_price), toPaise(form.purchase_price)),
    [form.selling_price, form.purchase_price],
  )

  const priceChanged = useMemo(() => {
    if (!existing) return false
    return (
      existing.selling_price_paise !== toPaise(form.selling_price) ||
      existing.purchase_price_paise !== toPaise(form.purchase_price) ||
      existing.mrp_paise !== toPaise(form.mrp)
    )
  }, [existing, form.selling_price, form.purchase_price, form.mrp])

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!form.name_en.trim() && !form.name_hi.trim()) next.name_en = t('requiredField')
    if (!form.selling_price || toPaise(form.selling_price) <= 0) next.selling_price = t('requiredField')
    if (form.mrp && toPaise(form.mrp) < toPaise(form.selling_price)) {
      next.mrp = 'MRP bikri price se kam nahi ho sakta'
    }
    if (!canEditPrice && priceChanged) next.selling_price = t('priceLocked')
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const pickImage = async (file: File | null) => {
    if (!file) return
    try {
      const { dataUrl } = await fileToPreview(file)
      setForm((current) => ({ ...current, image_url: dataUrl }))
    } catch {
      toast('Photo load nahi hui', 'error')
    }
  }

  const submit = async () => {
    if (!shop || !user) return
    if (!canEdit) {
      toast(t('noPermission'), 'error')
      return
    }
    if (!validate()) return

    let approvalAt: string | null = null
    if (priceChanged) {
      if (!canEditPrice) {
        toast(t('priceLocked'), 'error')
        return
      }
      const approval = await requestApproval({
        permission: 'product.edit_price',
        title: 'Price change — owner PIN',
        body: `Bikri price ${formatPaise(existing?.selling_price_paise ?? 0)} → ${formatPaise(toPaise(form.selling_price))}`,
      })
      if (!approval) return
      approvalAt = approval.at
    }

    setBusy(true)
    try {
      const productId = existing?.id ?? crypto.randomUUID()
      let imageUrl = form.image_url
      if (imageUrl?.startsWith('data:') && supabaseConfigured) {
        try {
          const blob = await (await fetch(imageUrl)).blob()
          imageUrl = await uploadProductImage(shop.id, productId, blob)
        } catch {
          /* keep the local data URL — photo is optional */
        }
      }

      const input: ProductInput = {
        id: existing?.id,
        shop_id: shop.id,
        barcode: form.barcode || null,
        name_en: form.name_en || form.name_hi,
        name_hi: form.name_hi || form.name_en,
        category_id: form.category_id || null,
        brand: form.brand || null,
        unit: form.unit,
        purchase_price: Number(form.purchase_price) || 0,
        selling_price: Number(form.selling_price) || 0,
        mrp: Number(form.mrp) || Number(form.selling_price) || 0,
        gst_rate: Number(form.gst_rate) || 0,
        stock_qty: Number(form.stock_qty) || 0,
        low_stock_limit: Number(form.low_stock_limit) || 0,
        expiry_date: form.expiry_date || null,
        image_url: imageUrl,
        hsn_code: form.hsn_code || null,
        is_active: form.is_active,
      }
      await saveProduct(input, user, approvalAt ? { at: approvalAt } : undefined)
      toast(isNew ? 'Product add ho gaya' : t('saved'), 'success')
      navigate('/products')
    } catch (error) {
      toast(error instanceof Error ? error.message : t('somethingWrong'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const deactivate = async () => {
    if (!existing || !user) return
    const ok = await confirm({
      title: t('confirmDelete'),
      body: `${existing.name_hi} — ${t('confirmDeleteBody')}`,
      tone: 'danger',
      confirmLabel: t('delete'),
    })
    if (!ok) return
    await setProductActive(existing.id, false, user)
    toast(t('deleted'), 'success')
    navigate('/products')
  }

  const applyAdjust = async () => {
    if (!existing || !user) return
    const qty = Number(adjustValue)
    if (!Number.isFinite(qty)) {
      toast(t('invalidNumber'), 'error')
      return
    }
    const approval = await requestApproval({
      permission: 'inventory.adjust',
      title: 'Stock adjust',
      body: `${existing.name_hi}: ${existing.stock_qty} → ${qty} ${existing.unit}`,
    })
    if (!approval) return
    await adjustStock(existing.id, qty, adjustReason || 'Manual adjust', user)
    setExisting({ ...existing, stock_qty: qty })
    setForm((current) => ({ ...current, stock_qty: String(qty) }))
    setAdjustOpen(false)
    setAdjustValue('')
    setAdjustReason('')
    toast(t('stockAdjusted'), 'success')
  }

  if (loading) return <p className="py-10 text-center text-sm text-ink-500">{t('loading')}</p>

  if (!canEdit) {
    return (
      <div className="space-y-3">
        <PageHeader title={t('products')} onBack={() => navigate('/products')} />
        <Card className="text-center">
          <Lock className="mx-auto h-8 w-8 text-ink-400" />
          <p className="mt-2 font-bold text-ink-800 dark:text-ink-100">{t('ownerOnly')}</p>
          <p className="text-sm text-ink-500">{t('noPermission')}</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-3 pb-4">
      <PageHeader
        title={isNew ? t('addProduct') : t('editProduct')}
        subtitle={existing?.name_en}
        onBack={() => navigate('/products')}
        action={
          existing?.is_active ? (
            <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4 text-red-500" />} onClick={deactivate} />
          ) : undefined
        }
      />

      <Card className="space-y-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-ink-100 text-3xl dark:bg-ink-800"
          >
            {form.image_url ? (
              <img src={form.image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <Package className="h-8 w-8 text-ink-400" />
            )}
            <span className="absolute bottom-0 right-0 rounded-tl-lg bg-brand-700 p-1 text-white">
              <Camera className="h-3.5 w-3.5" />
            </span>
          </button>
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink-700 dark:text-ink-200">{t('photo')}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                {t('changePhoto')}
              </Button>
              {form.image_url && (
                <Button size="sm" variant="ghost" onClick={() => setForm((c) => ({ ...c, image_url: null }))}>
                  {t('removePhoto')}
                </Button>
              )}
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => void pickImage(event.target.files?.[0] ?? null)}
          />
        </div>

        <Field label={t('barcode')} hint="Scanner se scan karke bhi bhar sakte hain">
          <div className="flex gap-2">
            <Input
              value={form.barcode}
              inputMode="numeric"
              onChange={(event) => setForm((c) => ({ ...c, barcode: event.target.value.replace(/\s/g, '') }))}
              placeholder="8901234567890"
              className="flex-1"
            />
            <Button type="button" variant="secondary" size="md" onClick={() => setScanOpen(true)}>
              Scan
            </Button>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label={t('nameHi')} required>
            <Input
              value={form.name_hi}
              onChange={(event) => setForm((c) => ({ ...c, name_hi: event.target.value }))}
              placeholder="टाटा नमक 1 किलो"
            />
          </Field>
          <Field label={t('nameEn')} error={errors.name_en}>
            <Input
              value={form.name_en}
              onChange={(event) => setForm((c) => ({ ...c, name_en: event.target.value }))}
              placeholder="Tata Salt 1kg"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label={t('category')}>
            <Select value={form.category_id} onChange={(event) => setForm((c) => ({ ...c, category_id: event.target.value }))}>
              <option value="">—</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name_en}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('brand')}>
            <Input value={form.brand} onChange={(event) => setForm((c) => ({ ...c, brand: event.target.value }))} placeholder="Tata" />
          </Field>
        </div>

        <Field label={t('unit')} hint={['kg', 'g', 'litre', 'ml'].includes(form.unit) ? t('looseItemHint') : undefined}>
          <div className="grid grid-cols-4 gap-1.5">
            {UNITS.map((unit) => (
              <button
                key={unit}
                type="button"
                onClick={() => setForm((c) => ({ ...c, unit }))}
                className={`h-10 rounded-xl text-sm font-bold ${
                  form.unit === unit ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200'
                }`}
              >
                {unit}
              </button>
            ))}
          </div>
        </Field>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-display text-base font-bold text-ink-900 dark:text-ink-50">💰 {t('price')}</p>
          {!canEditPrice && <Badge tone="warning">{t('priceLocked')}</Badge>}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label={t('purchasePrice')} hint="Sirf owner dekh sakta hai">
            <MoneyInput
              valuePaise={toPaise(form.purchase_price)}
              onChangePaise={(paise) => setForm((c) => ({ ...c, purchase_price: paise ? String(toRupees(paise)) : '' }))}
            />
          </Field>
          <Field label={t('sellingPrice')} required error={errors.selling_price}>
            <MoneyInput
              valuePaise={toPaise(form.selling_price)}
              onChangePaise={(paise) => setForm((c) => ({ ...c, selling_price: paise ? String(toRupees(paise)) : '' }))}
            />
          </Field>
          <Field label={t('mrp')} error={errors.mrp}>
            <MoneyInput
              valuePaise={toPaise(form.mrp)}
              onChangePaise={(paise) => setForm((c) => ({ ...c, mrp: paise ? String(toRupees(paise)) : '' }))}
            />
          </Field>
          <Field label={t('gstPercent')}>
            <Select value={form.gst_rate} onChange={(event) => setForm((c) => ({ ...c, gst_rate: event.target.value }))}>
              {GST_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}%
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2 dark:bg-brand-950/40">
          <span className="text-xs font-semibold text-brand-800 dark:text-brand-200">{t('margin')}</span>
          <span className="font-display text-lg font-extrabold text-brand-900 dark:text-brand-100">
            {margin}% · {formatPaise(toPaise(form.selling_price) - toPaise(form.purchase_price))}
          </span>
        </div>

        {priceChanged && canEditPrice && (
          <p className="flex items-center gap-1.5 rounded-xl bg-saffron-50 p-2.5 text-xs font-semibold text-saffron-900 dark:bg-saffron-900/25 dark:text-saffron-100">
            <Lock className="h-3.5 w-3.5" /> Price change par owner PIN poocha jayega — audit log mein save hoga.
          </p>
        )}
      </Card>

      <Card className="space-y-3">
        <p className="font-display text-base font-bold text-ink-900 dark:text-ink-50">📦 {t('inventory')}</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('stockQty')}>
            <Input
              inputMode="decimal"
              value={form.stock_qty}
              onChange={(event) => setForm((c) => ({ ...c, stock_qty: event.target.value.replace(/[^\d.]/g, '') }))}
            />
          </Field>
          <Field label={t('lowStockLimit')}>
            <Input
              inputMode="decimal"
              value={form.low_stock_limit}
              onChange={(event) => setForm((c) => ({ ...c, low_stock_limit: event.target.value.replace(/[^\d.]/g, '') }))}
            />
          </Field>
          <Field label={t('expiryDate')}>
            <Input
              type="date"
              value={form.expiry_date}
              onChange={(event) => setForm((c) => ({ ...c, expiry_date: event.target.value }))}
            />
          </Field>
          <Field label={t('hsnCode')}>
            <Input value={form.hsn_code} onChange={(event) => setForm((c) => ({ ...c, hsn_code: event.target.value }))} placeholder="2501" />
          </Field>
        </div>

        {existing && (
          <Button
            block
            variant="outline"
            icon={<Scale className="h-4 w-4" />}
            onClick={() => {
              setAdjustValue(String(existing.stock_qty))
              setAdjustOpen(true)
            }}
          >
            {t('adjustStock')} (current {existing.stock_qty} {existing.unit})
          </Button>
        )}

        <Toggle
          checked={form.is_active}
          onChange={(value) => setForm((c) => ({ ...c, is_active: value }))}
          label="Active"
          description="Inactive products billing mein nahi dikhte"
        />
      </Card>

      <Button block size="xl" loading={busy} onClick={submit}>
        {t('save')}
      </Button>

      <Sheet open={scanOpen} onClose={() => setScanOpen(false)} title={t('scanToAdd')}>
        <div className="pb-2">
          <ScanPanel
            autoStart
            compact
            lastResult={null}
            onScan={(code) => {
              setForm((current) => ({ ...current, barcode: code }))
              setScanOpen(false)
              toast(`Barcode: ${code}`, 'success')
            }}
          />
        </div>
      </Sheet>

      <Sheet
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title={t('adjustStock')}
        subtitle={existing ? `${existing.name_hi} · ${existing.stock_qty} ${existing.unit}` : undefined}
        footer={
          <Button block loading={busy} onClick={applyAdjust}>
            {t('save')}
          </Button>
        }
      >
        <div className="space-y-3 pb-2">
          <Field label={`${t('counted')} (${existing?.unit ?? ''})`}>
            <Input inputMode="decimal" value={adjustValue} onChange={(event) => setAdjustValue(event.target.value.replace(/[^\d.]/g, ''))} autoFocus />
          </Field>
          <Field label={t('reason')}>
            <Textarea value={adjustReason} onChange={(event) => setAdjustReason(event.target.value)} placeholder="Wastage / counting mistake" />
          </Field>
        </div>
      </Sheet>
    </div>
  )
}
