import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, PackagePlus, Plus, ScanBarcode, Search, Upload } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { db } from '../lib/db'
import { useLive } from '../hooks/useLive'
import { formatPaise } from '../lib/money'
import { downloadTemplate, exportProducts, parseProductFile, type ImportResult } from '../lib/spreadsheet'
import { saveCategory, saveProduct } from '../data/products'
import { can } from '../lib/permissions'
import { Badge, Card, EmptyState } from '../components/ui/card'
import { Button, IconButton } from '../components/ui/button'
import { Input } from '../components/ui/form'
import { Sheet } from '../components/ui/sheet'
import { ScanPanel } from '../components/billing/ScanPanel'
import { useConfirm } from '../components/ui/feedback'
import type { Category, Product } from '../types'

export default function ProductsPage() {
  const { shop, user, toast } = useApp()
  const t = useT()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [scanOpen, setScanOpen] = useState(false)
  const [importData, setImportData] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [categoryOpen, setCategoryOpen] = useState(false)

  const products = useLive<Product[]>(
    () => (shop ? db.products.where('shop_id').equals(shop.id).toArray() : Promise.resolve([])),
    [shop?.id],
    [],
  )
  const categories = useLive<Category[]>(
    () => (shop ? db.categories.where('shop_id').equals(shop.id).sortBy('sort_order') : Promise.resolve([])),
    [shop?.id],
    [],
  )

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return (products ?? [])
      .filter((product) => product.is_active)
      .filter((product) => (category ? product.category_id === category : true))
      .filter(
        (product) =>
          !term ||
          product.name_en.toLowerCase().includes(term) ||
          product.name_hi.includes(term) ||
          (product.barcode ?? '').includes(term) ||
          (product.brand ?? '').toLowerCase().includes(term),
      )
      .sort((a, b) => a.name_en.localeCompare(b.name_en))
  }, [products, query, category])

  const categoryName = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c.name_en])), [categories])

  const handleScan = async (code: string) => {
    if (!shop) return
    const existing = await db.products.where('shop_id').equals(shop.id).filter((p) => p.barcode === code).first()
    setScanOpen(false)
    if (existing) {
      toast(t('existingBarcodePrompt'), 'info')
      navigate(`/products/${existing.id}`)
    } else {
      toast(t('newBarcodePrompt'), 'info')
      navigate(`/products/new?barcode=${encodeURIComponent(code)}`)
    }
  }

  const handleFile = async (file: File | null) => {
    if (!file) return
    try {
      const parsed = await parseProductFile(file)
      setImportData(parsed)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'File padhi nahi gayi', 'error')
    }
  }

  const runImport = async () => {
    if (!shop || !user || !importData) return
    const ok = await confirm({
      title: t('importReview'),
      body: `${importData.rows.length} ${t('imported')}, ${importData.errors.length} ${t('skipped')}`,
      confirmLabel: t('importFromExcel'),
    })
    if (!ok) return
    setBusy(true)
    let imported = 0
    try {
      // Categories are created on the fly so the import never blocks on them.
      const existingCategories = await db.categories.where('shop_id').equals(shop.id).toArray()
      const byName = new Map(existingCategories.map((c) => [c.name_en.toLowerCase(), c.id]))
      for (const row of importData.rows) {
        let categoryId: string | null = null
        if (row.category) {
          const key = row.category.toLowerCase()
          if (byName.has(key)) categoryId = byName.get(key) ?? null
          else {
            const created = await saveCategory(shop.id, { name_en: row.category, name_hi: row.category, icon: '🏷️' })
            byName.set(key, created.id)
            categoryId = created.id
          }
        }
        const existing = row.barcode
          ? await db.products.where('shop_id').equals(shop.id).filter((p) => p.barcode === row.barcode).first()
          : undefined
        await saveProduct(
          {
            id: existing?.id,
            shop_id: shop.id,
            barcode: row.barcode,
            name_en: row.name_en,
            name_hi: row.name_hi,
            category_id: categoryId,
            brand: row.brand,
            unit: row.unit,
            purchase_price: row.purchase_price,
            selling_price: row.selling_price,
            mrp: row.mrp,
            gst_rate: row.gst_rate,
            stock_qty: row.stock_qty,
            low_stock_limit: row.low_stock_limit,
            expiry_date: row.expiry_date,
            image_url: existing?.image_url ?? null,
            hsn_code: row.hsn_code,
          },
          user,
          // Bulk import keeps existing prices unless the owner changed them.
          existing ? { at: new Date().toISOString() } : undefined,
        )
        imported++
      }
      toast(`${imported} ${t('imported')}`, 'success')
      setImportData(null)
    } catch (error) {
      toast(error instanceof Error ? error.message : t('somethingWrong'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const exportAll = () => {
    if (!shop) return
    exportProducts(products ?? [], categoryName)
    toast('Excel download ho gaya', 'success')
  }

  const addCategory = async () => {
    if (!shop || !user || !newCategory.trim()) return
    await saveCategory(shop.id, { name_en: newCategory, name_hi: newCategory, icon: '🏷️' })
    setNewCategory('')
    setCategoryOpen(false)
    toast(t('saved'), 'success')
  }

  const canAdd = can(user?.role, 'product.create')

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink-900 dark:text-ink-50">{t('products')}</h1>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            {filtered.length} / {products?.filter((p) => p.is_active).length ?? 0} active
          </p>
        </div>
        <div className="flex gap-1.5">
          <IconButton label={t('scanToAdd')} icon={<ScanBarcode className="h-5 w-5" />} onClick={() => setScanOpen(true)} />
          {canAdd && (
            <Button size="md" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/products/new')}>
              {t('add')}
            </Button>
          )}
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`${t('search')} naam / barcode`}
          className="pl-9"
        />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <button
          type="button"
          onClick={() => setCategory(null)}
          className={clsx(
            'shrink-0 rounded-full px-3 py-1.5 text-xs font-bold',
            !category ? 'bg-brand-700 text-white' : 'bg-white text-ink-600 shadow-sm dark:bg-ink-900 dark:text-ink-200',
          )}
        >
          {t('all')}
        </button>
        {(categories ?? []).map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategory(cat.id)}
            className={clsx(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-bold',
              category === cat.id ? 'bg-brand-700 text-white' : 'bg-white text-ink-600 shadow-sm dark:bg-ink-900 dark:text-ink-200',
            )}
          >
            {cat.icon} {cat.name_en}
          </button>
        ))}
        {can(user?.role, 'product.create') && (
          <button
            type="button"
            onClick={() => setCategoryOpen(true)}
            className="shrink-0 rounded-full border border-dashed border-ink-300 px-3 py-1.5 text-xs font-bold text-ink-500 dark:border-ink-700"
          >
            + {t('category')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2">
        {filtered.map((product) => {
          const low = product.stock_qty <= product.low_stock_limit
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => navigate(`/products/${product.id}`)}
              className="flex items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-card active:scale-[0.995] dark:bg-ink-900"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink-100 text-xl dark:bg-ink-800">
                {product.image_url ? (
                  <img src={product.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : product.is_loose ? (
                  '⚖️'
                ) : (
                  '📦'
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{product.name_hi}</p>
                <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                  {product.name_en}
                  {product.barcode ? ` · ${product.barcode}` : ''}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-extrabold text-brand-800 dark:text-brand-300">
                    {formatPaise(product.selling_price_paise)}
                  </span>
                  <span className="text-[11px] text-ink-400">/ {product.unit}</span>
                  {product.category_id && (
                    <Badge tone="neutral">{categoryName.get(product.category_id) ?? '—'}</Badge>
                  )}
                  {product.gst_rate > 0 && <Badge tone="info">GST {product.gst_rate}%</Badge>}
                </div>
              </div>
              <div className="text-right">
                <Badge tone={low ? (product.stock_qty <= 0 ? 'danger' : 'warning') : 'success'}>
                  {product.stock_qty} {product.unit}
                </Badge>
                <p className="mt-1 text-[10px] font-semibold text-ink-400">MRP {formatPaise(product.mrp_paise)}</p>
              </div>
            </button>
          )
        })}
      </div>

      {!filtered.length && (
        <EmptyState
          icon={<PackagePlus className="h-10 w-10" />}
          title={t('noProducts')}
          body={t('noProductsHint')}
          action={
            canAdd ? (
              <Button onClick={() => navigate('/products/new')} icon={<Plus className="h-4 w-4" />}>
                {t('addProduct')}
              </Button>
            ) : undefined
          }
        />
      )}

      <Card className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-500">{t('importExport')}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => document.getElementById('product-file')?.click()}>
            {t('importFromExcel')}
          </Button>
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportAll}>
            {t('exportToExcel')}
          </Button>
          <Button variant="ghost" onClick={downloadTemplate} className="col-span-2">
            {t('downloadTemplate')} (.xlsx)
          </Button>
        </div>
        <input
          id="product-file"
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
        />
      </Card>

      <Sheet open={scanOpen} onClose={() => setScanOpen(false)} title={t('scanToAdd')} size="md">
        <div className="pb-2">
          <ScanPanel
            onScan={(code) => void handleScan(code)}
            lastResult={null}
            compact
            autoStart
          />
          <p className="mt-2 text-center text-xs text-ink-500 dark:text-ink-400">
            Naya barcode → form khulega · purana barcode → edit khulega
          </p>
        </div>
      </Sheet>

      <Sheet
        open={Boolean(importData)}
        onClose={() => setImportData(null)}
        title={t('importReview')}
        subtitle={`${importData?.rows.length ?? 0} ready · ${importData?.errors.length ?? 0} ${t('skipped')}`}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setImportData(null)}>
              {t('cancel')}
            </Button>
            <Button className="flex-1" loading={busy} onClick={runImport} disabled={!importData?.rows.length}>
              {t('importFromExcel')}
            </Button>
          </div>
        }
      >
        <div className="space-y-2 pb-2">
          {importData?.errors.slice(0, 8).map((error) => (
            <p key={`${error.row}-${error.message}`} className="rounded-xl bg-red-50 p-2 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-200">
              {t('rowError')} {error.row}: {error.message}
            </p>
          ))}
          <div className="overflow-hidden rounded-2xl border border-ink-100 dark:border-ink-800">
            {importData?.rows.slice(0, 20).map((row) => (
              <div key={row.rowNumber} className="flex items-center justify-between border-b border-ink-100 px-3 py-2 text-sm last:border-0 dark:border-ink-800">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink-900 dark:text-ink-50">{row.name_hi}</p>
                  <p className="truncate text-xs text-ink-500">{row.barcode ?? 'no barcode'} · {row.unit}</p>
                </div>
                <div className="text-right text-xs">
                  <p className="font-bold text-brand-700 dark:text-brand-300">₹{row.selling_price}</p>
                  <p className="text-ink-400">stock {row.stock_qty}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Sheet>

      <Sheet
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        title={`${t('add')} ${t('category')}`}
        footer={
          <Button block onClick={addCategory} disabled={!newCategory.trim()}>
            {t('save')}
          </Button>
        }
      >
        <Input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="Snacks / नमकीन" autoFocus />
        <div className="h-4" />
      </Sheet>
    </div>
  )
}
