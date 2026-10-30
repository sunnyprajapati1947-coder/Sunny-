import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { db, getMeta, setMeta } from '../lib/db'
import { uuid } from '../lib/id'
import { applyOffers, type AppliedOffer } from '../lib/offers'
import { computeTotals } from '../lib/money'
import type { CartLine, Customer, Offer, Product } from '../types'
import { useApp } from './AppContext'
import { cartLineFromProduct } from '../data/billing'

export type ScanResult =
  | { status: 'added' | 'incremented'; line: CartLine; product: Product }
  | { status: 'not_found'; barcode: string }
  | { status: 'inactive'; product: Product }
  | { status: 'out_of_stock'; product: Product }
  | { status: 'ignored' }

interface CartState {
  lines: CartLine[]
  customer: Customer | null
  note: string
  manualDiscountPaise: number
  /** Owner approval token for the manual discount currently applied. */
  discountApprovalAt: string | null
  redeemPoints: number
}

export interface CartContextValue extends CartState {
  ready: boolean
  offers: AppliedOffer[]
  offerDiscountPaise: number
  totals: {
    subtotal_paise: number
    discount_paise: number
    taxable_paise: number
    tax_paise: number
    round_off_paise: number
    total_paise: number
  }
  lastScan: { line: CartLine; at: number } | null
  canUndo: boolean
  addProduct: (product: Product, qty?: number) => void
  addByBarcode: (barcode: string) => Promise<ScanResult>
  addLoose: (product: Product, gramsOrLitres: number) => void
  setQty: (key: string, qty: number) => void
  increment: (key: string, delta: number) => void
  removeLine: (key: string) => void
  undo: () => void
  clear: () => void
  setCustomer: (customer: Customer | null) => void
  setNote: (note: string) => void
  setManualDiscount: (paise: number, approvalAt: string | null) => void
  setRedeemPoints: (points: number) => void
  loadLines: (lines: CartLine[], customer?: Customer | null, note?: string) => void
  itemCount: number
}

const CartContext = createContext<CartContextValue | null>(null)
const CART_KEY = 'active_cart'

const EMPTY: CartState = {
  lines: [],
  customer: null,
  note: '',
  manualDiscountPaise: 0,
  discountApprovalAt: null,
  redeemPoints: 0,
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { shop, user } = useApp()
  const [state, setState] = useState<CartState>(EMPTY)
  const [ready, setReady] = useState(false)
  const [offers, setOffers] = useState<Offer[]>([])
  const [lastScan, setLastScan] = useState<{ line: CartLine; at: number } | null>(null)
  const history = useRef<CartLine[][]>([])
  const [historyDepth, setHistoryDepth] = useState(0)
  const hydrated = useRef(false)

  // Restore an unfinished cart after a reload (very common on cheap phones).
  useEffect(() => {
    if (!shop || hydrated.current) return
    hydrated.current = true
    void (async () => {
      const saved = await getMeta<CartState | null>(`${CART_KEY}:${shop.id}`, null)
      if (saved) setState({ ...EMPTY, ...saved, customer: saved.customer ?? null })
      setReady(true)
    })()
  }, [shop])

  // Persist cart for crash/reload recovery.
  useEffect(() => {
    if (!shop || !ready) return
    void setMeta(`${CART_KEY}:${shop.id}`, state)
  }, [state, shop, ready])

  useEffect(() => {
    if (!shop) return
    void db.offers
      .where('shop_id')
      .equals(shop.id)
      .filter((offer) => offer.is_active)
      .toArray()
      .then(setOffers)
  }, [shop])

  const pushHistory = useCallback((lines: CartLine[]) => {
    history.current = [...history.current.slice(-19), lines.map((line) => ({ ...line }))]
    setHistoryDepth(history.current.length)
  }, [])

  const taxMode = shop?.prices_include_gst ? 'inclusive' : 'exclusive'

  const offerResult = useMemo(() => applyOffers(state.lines, offers), [state.lines, offers])

  const totals = useMemo(
    () =>
      computeTotals(
        state.lines.map((line) => ({
          amount_paise: Math.round(line.qty * line.unit_price_paise),
          gst_rate: line.gst_rate,
        })),
        {
          taxMode,
          discount_paise: state.manualDiscountPaise + offerResult.discount_paise + state.redeemPoints * 100,
        },
      ),
    [state.lines, state.manualDiscountPaise, state.redeemPoints, offerResult.discount_paise, taxMode],
  )

  const addProduct = useCallback(
    (product: Product, qty = 1) => {
      setState((current) => {
        pushHistory(current.lines)
        const existing = current.lines.find((line) => line.product_id === product.id)
        let lines: CartLine[]
        let line: CartLine
        if (existing) {
          line = { ...existing, qty: round3(existing.qty + qty) }
          lines = current.lines.map((l) => (l.key === existing.key ? line : l))
        } else {
          line = cartLineFromProduct(product, qty)
          lines = [...current.lines, line]
        }
        setLastScan({ line, at: Date.now() })
        return { ...current, lines }
      })
    },
    [pushHistory],
  )

  const addByBarcode = useCallback(
    async (rawBarcode: string): Promise<ScanResult> => {
      const barcode = rawBarcode.trim()
      if (!shop || !barcode) return { status: 'ignored' }
      const product = await db.products
        .where('shop_id')
        .equals(shop.id)
        .filter((p) => p.barcode === barcode)
        .first()
      if (!product) return { status: 'not_found', barcode }
      if (!product.is_active) return { status: 'inactive', product }
      if (product.stock_qty <= 0 && !product.is_loose) return { status: 'out_of_stock', product }

      const wasInCart = state.lines.some((line) => line.product_id === product.id)
      addProduct(product)
      return { status: wasInCart ? 'incremented' : 'added', line: cartLineFromProduct(product), product }
    },
    [shop, addProduct, state.lines],
  )

  const addLoose = useCallback(
    (product: Product, qty: number) => {
      if (qty <= 0) return
      setState((current) => {
        pushHistory(current.lines)
        const existing = current.lines.find((line) => line.product_id === product.id)
        let lines: CartLine[]
        if (existing) {
          const merged = { ...existing, qty: round3(existing.qty + qty) }
          lines = current.lines.map((l) => (l.key === existing.key ? merged : l))
        } else {
          lines = [...current.lines, cartLineFromProduct(product, qty)]
        }
        return { ...current, lines }
      })
    },
    [pushHistory],
  )

  const setQty = useCallback((key: string, qty: number) => {
    setState((current) => {
      const next = Math.max(0, round3(qty))
      return {
        ...current,
        lines: current.lines
          .map((line) => (line.key === key ? { ...line, qty: next } : line))
          .filter((line) => line.qty > 0),
      }
    })
  }, [])

  const increment = useCallback(
    (key: string, delta: number) => {
      setState((current) => {
        pushHistory(current.lines)
        return {
          ...current,
          lines: current.lines
            .map((line) => (line.key === key ? { ...line, qty: Math.max(0, round3(line.qty + delta)) } : line))
            .filter((line) => line.qty > 0),
        }
      })
    },
    [pushHistory],
  )

  const removeLine = useCallback(
    (key: string) => {
      setState((current) => {
        pushHistory(current.lines)
        return { ...current, lines: current.lines.filter((line) => line.key !== key) }
      })
    },
    [pushHistory],
  )

  const undo = useCallback(() => {
    setState((current) => {
      const previous = history.current[history.current.length - 1]
      if (!previous) return current
      history.current = history.current.slice(0, -1)
      setHistoryDepth(history.current.length)
      return { ...current, lines: previous }
    })
    setLastScan(null)
  }, [])

  const clear = useCallback(() => {
    setState(EMPTY)
    setLastScan(null)
    history.current = []
    setHistoryDepth(0)
  }, [])

  const setCustomer = useCallback((customer: Customer | null) => {
    setState((current) => ({ ...current, customer }))
  }, [])

  const setNote = useCallback((note: string) => {
    setState((current) => ({ ...current, note }))
  }, [])

  const setManualDiscount = useCallback((paise: number, approvalAt: string | null) => {
    setState((current) => ({ ...current, manualDiscountPaise: Math.max(0, Math.round(paise)), discountApprovalAt: approvalAt }))
  }, [])

  const setRedeemPoints = useCallback((points: number) => {
    setState((current) => ({ ...current, redeemPoints: Math.max(0, Math.round(points)) }))
  }, [])

  const loadLines = useCallback((lines: CartLine[], customer: Customer | null = null, note = '') => {
    setState({ lines, customer, note, manualDiscountPaise: 0, discountApprovalAt: null, redeemPoints: 0 })
    history.current = []
    setHistoryDepth(0)
    setLastScan(null)
  }, [])

  const itemCount = state.lines.length

  const value = useMemo<CartContextValue>(
    () => ({
      ...state,
      ready,
      offers: offerResult.applied,
      offerDiscountPaise: offerResult.discount_paise,
      totals,
      lastScan,
      canUndo: historyDepth > 0,
      addProduct,
      addByBarcode,
      addLoose,
      setQty,
      increment,
      removeLine,
      undo,
      clear,
      setCustomer,
      setNote,
      setManualDiscount,
      setRedeemPoints,
      loadLines,
      itemCount,
    }),
    [
      state,
      ready,
      offerResult,
      totals,
      lastScan,
      addProduct,
      addByBarcode,
      addLoose,
      setQty,
      increment,
      removeLine,
      undo,
      clear,
      setCustomer,
      setNote,
      setManualDiscount,
      setRedeemPoints,
      loadLines,
      itemCount,
      historyDepth,
    ],
  )


  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}

export function newCartKey(): string {
  return uuid()
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}
