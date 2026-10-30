import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, MessageCircle, Share2, Truck } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useT } from '../i18n/useT'
import { db } from '../lib/db'
import { useLive } from '../hooks/useLive'
import { buildOrderList, orderListText, type ReorderSuggestion } from '../data/purchases'
import { formatPaise } from '../lib/money'
import type { Product, Supplier } from '../types'
import { PageHeader } from '../components/layout/AppShell'
import { Badge, Card, EmptyState, StatCard } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Select } from '../components/ui/form'

export default function OrderListPage() {
  const { shop, toast } = useApp()
  const t = useT()
  const navigate = useNavigate()
  const [supplierId, setSupplierId] = useState('')

  const products = useLive<Product[]>(
    () => (shop ? db.products.where('shop_id').equals(shop.id).filter((p) => p.is_active).toArray() : Promise.resolve([])),
    [shop?.id],
    [],
  )
  const suppliers = useLive<Supplier[]>(
    () => (shop ? db.suppliers.where('shop_id').equals(shop.id).toArray() : Promise.resolve([])),
    [shop?.id],
    [],
  )

  const suggestions = useMemo(() => buildOrderList(products ?? []), [products])
  const supplier = (suppliers ?? []).find((row) => row.id === supplierId) ?? null
  const estimated = suggestions.reduce((sum, item) => sum + item.estimated_cost_paise, 0)
  const text = orderListText(suggestions, shop?.name ?? 'Shop')

  const shareWhatsApp = () => {
    const digits = (supplier?.phone ?? '').replace(/\D/g, '')
    const phone = digits.length === 10 ? `91${digits}` : digits
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast(t('copied'), 'success')
    } catch {
      toast('Copy nahi hua', 'error')
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title={t('orderList')}
        subtitle={t('orderListHint')}
        onBack={() => navigate('/more')}
        action={
          <Button size="sm" variant="secondary" icon={<Truck className="h-4 w-4" />} onClick={() => navigate('/purchases/new')}>
            {t('purchaseEntry')}
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2">
        <StatCard label={t('items')} value={String(suggestions.length)} tone="warning" />
        <StatCard label="Est. cost" value={formatPaise(estimated)} />
      </div>

      <Select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
        <option value="">— {t('supplier')} chuniye —</option>
        {(suppliers ?? []).map((row) => (
          <option key={row.id} value={row.id}>
            {row.name} {row.balance_paise ? `(due ${(row.balance_paise / 100).toFixed(0)})` : ''}
          </option>
        ))}
      </Select>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" icon={<MessageCircle className="h-4 w-4" />} onClick={shareWhatsApp} disabled={!suggestions.length}>
          WhatsApp
        </Button>
        <Button variant="secondary" icon={<Share2 className="h-4 w-4" />} onClick={copy} disabled={!suggestions.length}>
          Copy
        </Button>
      </div>

      <Card className="p-0">
        {suggestions.map((item: ReorderSuggestion) => (
          <div key={item.product.id} className="flex items-center gap-2 border-b border-ink-100 p-3 last:border-0 dark:border-ink-800">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{item.product.name_hi}</p>
              <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                Stock {item.product.stock_qty} {item.product.unit} · limit {item.product.low_stock_limit}
              </p>
            </div>
            <div className="text-right">
              <Badge tone="warning">
                Order {item.suggested_qty} {item.product.unit}
              </Badge>
              <p className="mt-1 text-[10px] font-semibold text-ink-400">{formatPaise(item.estimated_cost_paise)}</p>
            </div>
          </div>
        ))}
        {!suggestions.length && (
          <div className="p-4">
            <EmptyState icon={<ClipboardList className="h-10 w-10" />} title="Sab stock theek hai 🎉" body="Jab stock kam hoga, order list yahan ban jayegi" />
          </div>
        )}
      </Card>

      <Card className="bg-ink-100/60 dark:bg-ink-900">
        <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-ink-600 dark:text-ink-300">{text}</pre>
      </Card>
    </div>
  )
}
