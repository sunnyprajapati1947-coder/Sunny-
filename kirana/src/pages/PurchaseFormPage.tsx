import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ScanBarcode, Trash2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { db } from '../lib/db'
import { useLive } from '../hooks/useLive'
import { formatPaise, toPaise } from '../lib/money'
import { savePurchase, saveSupplier, type PurchaseCartLine } from '../data/purchases'
import { isLooseUnit } from '../data/products'
import type { Product, Supplier } from '../types'
import { PageHeader } from '../components/layout/AppShell'
import { Card, Divider } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Field, Input, MoneyInput, Select } from '../components/ui/form'
import { Sheet } from '../components/ui/sheet'
import { ProductSearch } from '../components/billing/ProductSearch'
import { ScanPanel } from '../components/billing/ScanPanel'

export default function PurchaseFormPage() {
  const { shop, user, toast } = useApp()
  const t = useT()
  const navigate = useNavigate()
  const [supplierId, setSupplierId] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [lines, setLines] = useState<PurchaseCartLine[]>([])
  const [paid, setPaid] = useState(0)
  const [note, setNote] = useState('')
  const [findOpen, setFindOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [newSupplier, setNewSupplier] = useState({ name: '', phone: '', company: '' })
  const [busy, setBusy] = useState(false)

  const suppliers = useLive<Supplier[]>(
    () => (shop ? db.suppliers.where('shop_id').equals(shop.id).toArray() : Promise.resolve([])),
    [shop?.id],
    [],
  )

  const total = useMemo(() => lines.reduce((sum, line) => sum + Math.round(line.qty * line.cost_paise), 0), [lines])

  const addProduct = (product: Product) => {
    setLines((current) => {
      const existing = current.find((line) => line.product_id === product.id)
      if (existing) {
        return current.map((line) =>
          line.product_id === product.id ? { ...line, qty: Math.round((line.qty + 1) * 1000) / 1000 } : line,
        )
      }
      return [
        ...current,
        {
          key: crypto.randomUUID(),
          product_id: product.id,
          name_en: product.name_en,
          name_hi: product.name_hi,
          unit: product.unit,
          qty: 1,
          cost_paise: product.purchase_price_paise,
        },
      ]
    })
    setFindOpen(false)
  }

  const addByBarcode = async (code: string) => {
    if (!shop) return
    const product = await db.products.where('shop_id').equals(shop.id).filter((p) => p.barcode === code).first()
    if (!product) {
      toast(`Barcode ${code} nahi mila — products se add karein`, 'error')
      return
    }
    addProduct(product)
    setScanOpen(false)
  }

  const updateLine = (key: string, patch: Partial<PurchaseCartLine>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  const createSupplier = async () => {
    if (!shop || !user || !newSupplier.name.trim()) return
    const supplier = await saveSupplier(shop.id, {
      name: newSupplier.name,
      phone: newSupplier.phone || null,
      company: newSupplier.company || null,
      gstin: null,
      address: null,
      notes: null,
    })
    setSupplierId(supplier.id)
    setSupplierOpen(false)
    setNewSupplier({ name: '', phone: '', company: '' })
    toast(t('saved'), 'success')
  }

  const submit = async () => {
    if (!shop || !user) return
    if (!lines.length) {
      toast('Koi item add karein', 'error')
      return
    }
    setBusy(true)
    try {
      const supplier = (suppliers ?? []).find((row) => row.id === supplierId) ?? null
      await savePurchase({
        shop,
        actor: user,
        supplier,
        invoice_no: invoiceNo || null,
        lines,
        paid_paise: paid,
        note: note || null,
      })
      toast('Purchase save ho gayi — stock badh gaya', 'success')
      navigate('/purchases')
    } catch (error) {
      toast(error instanceof Error ? error.message : t('somethingWrong'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 pb-4">
      <PageHeader title={t('purchaseEntry')} onBack={() => navigate('/purchases')} />

      <Card className="space-y-2">
        <Field label={t('supplier')}>
          <div className="flex gap-2">
            <Select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="flex-1">
              <option value="">—</option>
              {(suppliers ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </Select>
            <Button variant="secondary" onClick={() => setSupplierOpen(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </Field>
        <Field label={t('invoiceNo')}>
          <Input value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} placeholder="JB/1024" />
        </Field>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setFindOpen(true)}>
          {t('add')} {t('item')}
        </Button>
        <Button variant="secondary" icon={<ScanBarcode className="h-4 w-4" />} onClick={() => setScanOpen(true)}>
          {t('scanItem')}
        </Button>
      </div>

      <Card className="divide-y divide-ink-100 p-0 dark:divide-ink-800">
        {lines.map((line) => (
          <div key={line.key} className="space-y-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{line.name_hi}</p>
                <p className="truncate text-xs text-ink-500">{line.name_en}</p>
              </div>
              <button type="button" aria-label={t('remove')} onClick={() => setLines((rows) => rows.filter((row) => row.key !== line.key))}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label={`${t('qty')} (${line.unit})`}>
                <Input
                  inputMode="decimal"
                  value={line.qty}
                  onChange={(event) =>
                    updateLine(line.key, { qty: Number(event.target.value.replace(/[^\d.]/g, '')) || 0 })
                  }
                  className="h-11"
                />
              </Field>
              <Field label={`${t('costPrice')} / ${line.unit}`}>
                <MoneyInput
                  valuePaise={line.cost_paise}
                  onChangePaise={(paise) => updateLine(line.key, { cost_paise: paise })}
                  className="h-11"
                />
              </Field>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-500">
                {isLooseUnit(line.unit) ? 'Loose item — gram/kg dhyan rakhein' : `${line.qty} ${line.unit}`}
              </span>
              <span className="font-bold text-ink-900 dark:text-ink-50">
                = {formatPaise(Math.round(line.qty * line.cost_paise))}
              </span>
            </div>
          </div>
        ))}
        {!lines.length && <p className="p-4 text-center text-sm text-ink-500">Scan karein ya item add karein</p>}
      </Card>

      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-600 dark:text-ink-300">{t('total')}</span>
          <span className="font-display text-2xl font-extrabold text-ink-950 dark:text-white">{formatPaise(total)}</span>
        </div>
        <Divider />
        <Field label={t('paidAmount')}>
          <MoneyInput valuePaise={paid} onChangePaise={setPaid} />
        </Field>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setPaid(total)}>
            Full paid
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setPaid(0)}>
            {t('udhaar')} (credit)
          </Button>
          <span className="ml-auto self-center text-xs font-semibold text-ink-500">
            Due: {formatPaise(Math.max(0, total - paid))}
          </span>
        </div>
        <Field label={t('addNote')}>
          <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Delivery Monday" />
        </Field>
      </Card>

      <Button block size="xl" loading={busy} onClick={submit} disabled={!lines.length}>
        {t('save')}
      </Button>

      <Sheet open={findOpen} onClose={() => setFindOpen(false)} title={`${t('add')} ${t('item')}`}>
        <div className="pb-2">
          <ProductSearch onPick={addProduct} onScanRequest={() => { setFindOpen(false); setScanOpen(true) }} />
        </div>
      </Sheet>

      <Sheet open={scanOpen} onClose={() => setScanOpen(false)} title={t('scanItem')}>
        <div className="pb-2">
          <ScanPanel autoStart compact lastResult={null} onScan={(code) => void addByBarcode(code)} />
        </div>
      </Sheet>

      <Sheet
        open={supplierOpen}
        onClose={() => setSupplierOpen(false)}
        title={t('addSupplier')}
        footer={<Button block onClick={createSupplier}>{t('save')}</Button>}
      >
        <div className="space-y-3 pb-2">
          <Field label={t('fullName')} required>
            <Input value={newSupplier.name} onChange={(event) => setNewSupplier((c) => ({ ...c, name: event.target.value }))} autoFocus />
          </Field>
          <Field label={t('phone')}>
            <Input
              value={newSupplier.phone}
              inputMode="numeric"
              onChange={(event) => setNewSupplier((c) => ({ ...c, phone: event.target.value.replace(/\D/g, '') }))}
            />
          </Field>
          <Field label="Company">
            <Input value={newSupplier.company} onChange={(event) => setNewSupplier((c) => ({ ...c, company: event.target.value }))} />
          </Field>
        </div>
      </Sheet>
    </div>
  )
}
