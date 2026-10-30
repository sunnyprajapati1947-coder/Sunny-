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
import { db, getMeta, purgeLegacyDemoData, setMeta, wipeLocalData } from '../lib/db'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { sync, startAutoSync } from '../lib/sync'
import { uuid } from '../lib/id'
import { hasPinSet, setPin as persistPin, verifyPin } from '../lib/pin'
import { biometricSupported, registerBiometric, verifyBiometric } from '../lib/biometric'
import { writeAudit } from '../data/audit'
import type { AppLanguage, OwnerApproval, Role, SessionUser, Shop, SyncState } from '../types'
import { OwnerGate, type GateRequest } from '../components/security/OwnerGate'
import { createLocalShop, loadLocalShop, localOwner, type ShopSetupInput } from '../lib/shop'

export interface Prefs {
  language: AppLanguage
  dark: boolean
  largeText: boolean
}

export interface AppContextValue {
  ready: boolean
  bootError: string | null
  shop: Shop | null
  user: SessionUser | null
  role: Role | null
  language: AppLanguage
  dark: boolean
  largeText: boolean
  cloudConfigured: boolean
  /** Nothing set up yet on this device: show the setup screen. */
  needsSetup: boolean
  needsAuth: boolean
  needsShop: boolean
  syncState: SyncState
  pendingSync: number
  syncError: string | null
  toast: (message: string, tone?: 'success' | 'error' | 'info') => void
  toastState: ToastState | null
  setLanguage: (language: AppLanguage) => void
  setDark: (dark: boolean) => void
  setLargeText: (large: boolean) => void
  refreshShop: () => Promise<void>
  updateShop: (patch: Partial<Shop>) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (input: { email: string; password: string; name: string; shopName: string; phone: string }) => Promise<void>
  createShopForUser: (input: { shopName: string; ownerName?: string; phone?: string }) => Promise<void>
  signOut: () => Promise<void>
  /** First-run: writes the real shop row and the owner session. */
  completeSetup: (input: ShopSetupInput) => Promise<void>
  /** Danger: wipes every local row and returns to the setup screen. */
  resetLocalData: () => Promise<void>
  refresh: () => Promise<void>
  pinConfigured: boolean
  saveOwnerPin: (pin: string) => Promise<void>
  requestApproval: (options: ApprovalRequest) => Promise<OwnerApproval | null>
  verifyOwnerPin: (pin: string) => Promise<boolean>
  biometricEnabled: boolean
  enableBiometric: () => Promise<boolean>
}

export interface ApprovalRequest {
  permission: OwnerApproval['permission']
  title: string
  body?: string
  amountPaise?: number
}

export interface ToastState {
  id: number
  message: string
  tone: 'success' | 'error' | 'info'
}

const AppContext = createContext<AppContextValue | null>(null)

const DEFAULT_PREFS: Prefs = { language: 'hinglish', dark: false, largeText: false }

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)
  const [shop, setShop] = useState<Shop | null>(null)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [needsShop, setNeedsShop] = useState(false)
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [pendingSync, setPendingSync] = useState(0)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [toastState, setToastState] = useState<ToastState | null>(null)
  const [pinConfigured, setPinConfigured] = useState(false)
  const [biometricEnabled, setBiometricEnabled] = useState(false)
  const [gate, setGate] = useState<(GateRequest & { resolve: (value: OwnerApproval | null) => void }) | null>(null)
  const toastTimer = useRef<number | null>(null)
  const stageRef = useRef({ shop: null as Shop | null, user: null as SessionUser | null })

  stageRef.current = { shop, user }

  const toast = useCallback((message: string, tone: 'success' | 'error' | 'info' = 'info') => {
    setToastState({ id: Date.now(), message, tone })
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToastState(null), tone === 'error' ? 5200 : 3000)
  }, [])

  const applyPrefs = useCallback((next: Prefs) => {
    setPrefs(next)
    const root = document.documentElement
    root.classList.toggle('dark', next.dark)
    root.classList.toggle('text-lg-mode', next.largeText)
    root.lang = next.language === 'en' ? 'en' : 'hi'
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', next.dark ? '#101410' : '#0d7a4f')
    void setMeta('prefs', next)
  }, [])

  const loadShopAndUser = useCallback(async (shopId: string) => {
    const shopRow = await db.shops.get(shopId)
    setShop(shopRow ?? null)
    return shopRow ?? null
  }, [])

  /** Boot sequence: prefs → (cloud session | device shop) → ready. */
  useEffect(() => {
    let cancelled = false
    async function boot() {
      try {
        const storedPrefs = await getMeta<Prefs>('prefs', DEFAULT_PREFS)
        if (!cancelled) applyPrefs(storedPrefs)

        // Demo rows from an older build must never sit next to the real shop's books.
        await purgeLegacyDemoData()

        if (supabaseConfigured && supabase) {
          const { data } = await supabase.auth.getSession()
          const session = data.session
          if (session?.user) {
            const profile = await fetchProfile(session.user.id)
            if (profile) {
              const shopRow = await db.shops.get(profile.shop_id)
              if (cancelled) return
              setUser({
                id: session.user.id,
                shopId: profile.shop_id,
                name: profile.full_name,
                role: profile.role,
                email: session.user.email,
                isDemo: false,
              })
              if (shopRow) setShop(shopRow)
              else setShop(await pullShop(profile.shop_id))
              setPinConfigured(await hasPinSet())
              setReady(true)
              return
            }
            if (!cancelled) {
              setNeedsShop(true)
              setUser({
                id: session.user.id,
                shopId: '',
                name: session.user.email ?? 'Owner',
                role: 'owner',
                email: session.user.email,
                isDemo: false,
              })
              setReady(true)
              return
            }
          }
          if (!cancelled) {
            setNeedsAuth(true)
            setReady(true)
            return
          }
        }

        // No cloud project: use the real shop already stored on this device,
        // or ask for the shop details once. Nothing is ever pre-filled with
        // sample products, bills or customers.
        const localShop = await loadLocalShop()
        if (cancelled) return
        if (!localShop) {
          setNeedsSetup(true)
          setReady(true)
          return
        }
        setShop(localShop)
        setUser(localOwner(localShop))
        setPinConfigured(await hasPinSet())
        setReady(true)
      } catch (error) {
        if (!cancelled) {
          setBootError(error instanceof Error ? error.message : String(error))
          setReady(true)
        }
      }
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [applyPrefs, loadShopAndUser])

  // Sync lifecycle + realtime status.
  useEffect(() => {
    if (!shop) return
    sync.setShop(shop.id)
    const stopSync = startAutoSync(shop.id, () => {
      void loadShopAndUser(shop.id)
    })
    const unsubscribe = sync.subscribe((state, detail) => {
      setSyncState(state)
      if (detail) {
        setPendingSync(detail.pending)
        setSyncError(detail.error ?? null)
      }
    })
    return () => {
      stopSync()
      unsubscribe()
    }
  }, [shop, loadShopAndUser])

  useEffect(() => {
    void hasPinSet().then(setPinConfigured)
    void biometricSupported().then(setBiometricEnabled)
  }, [user])

  const setLanguage = useCallback(
    (language: AppLanguage) => {
      applyPrefs({ ...prefs, language })
      if (shop) void persistShop({ language })
    },
    // persistShop is stable via useCallback below
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyPrefs, prefs, shop],
  )

  const setDark = useCallback((dark: boolean) => applyPrefs({ ...prefs, dark }), [applyPrefs, prefs])
  const setLargeText = useCallback(
    (largeText: boolean) => applyPrefs({ ...prefs, largeText }),
    [applyPrefs, prefs],
  )

  const persistShop = useCallback(async (patch: Partial<Shop>) => {
    const current = stageRef.current.shop
    if (!current) return
    const next: Shop = { ...current, ...patch, updated_at: new Date().toISOString() }
    await db.shops.put(next)
    await db.outbox.add({
      table_name: 'shops',
      op: 'upsert',
      record_id: next.id,
      payload: next as unknown as Record<string, unknown>,
      created_at: new Date().toISOString(),
      attempts: 0,
      last_error: null,
    })
    setShop(next)
    sync.schedule(500)
  }, [])

  const updateShop = useCallback(
    async (patch: Partial<Shop>) => {
      const current = stageRef.current.shop
      const actor = stageRef.current.user
      if (!current || !actor) return
      await persistShop(patch)
      await writeAudit({
        shopId: current.id,
        actor,
        entity: 'shop',
        entityId: current.id,
        action: 'settings_update',
        oldValue: current as unknown as Record<string, unknown>,
        newValue: { ...current, ...patch } as unknown as Record<string, unknown>,
      })
    },
    [persistShop],
  )

  const refreshShop = useCallback(async () => {
    if (stageRef.current.shop) await loadShopAndUser(stageRef.current.shop.id)
  }, [loadShopAndUser])

  const refresh = useCallback(async () => {
    if (stageRef.current.shop) await loadShopAndUser(stageRef.current.shop.id)
  }, [loadShopAndUser])

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabase) throw new Error('Cloud not configured')
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      const session = data.session
      if (!session) throw new Error('Login failed')
      const profile = await fetchProfile(session.user.id)
      if (!profile) {
        setUser({
          id: session.user.id,
          shopId: '',
          name: session.user.email ?? 'Owner',
          role: 'owner',
          email: session.user.email,
          isDemo: false,
        })
        setNeedsShop(true)
        setNeedsAuth(false)
        return
      }
      await afterAuth(session.user.id, session.user.email ?? null, profile)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const afterAuth = useCallback(
    async (userId: string, email: string | null, profile: { shop_id: string; full_name: string; role: Role }) => {
      setUser({ id: userId, shopId: profile.shop_id, name: profile.full_name, role: profile.role, email, isDemo: false })
      setNeedsSetup(false)
      setNeedsAuth(false)
      setNeedsShop(false)
      const localShop = await db.shops.get(profile.shop_id)
      setShop(localShop ?? (await pullShop(profile.shop_id)))
      setPinConfigured(await hasPinSet())
      setReady(true)
    },
    [],
  )

  const createShopForUser = useCallback(
    async (input: { shopName: string; ownerName?: string; phone?: string }) => {
      if (!supabase) throw new Error('Cloud not configured')
      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData.session
      if (!session?.user) throw new Error('Login required')
      const { data: shopId, error } = await supabase.rpc('create_shop_for_current_user', {
        p_name: input.shopName,
        p_owner_name: input.ownerName ?? (session.user.email ?? 'Owner'),
        p_phone: input.phone ?? null,
      })
      if (error) throw error
      const profile = await fetchProfile(session.user.id)
      await afterAuth(
        session.user.id,
        session.user.email ?? null,
        profile ?? { shop_id: String(shopId), full_name: input.ownerName ?? 'Owner', role: 'owner' },
      )
    },
    [afterAuth],
  )

  const signUp = useCallback(
    async (input: { email: string; password: string; name: string; shopName: string; phone: string }) => {
      if (!supabase) throw new Error('Cloud not configured')
      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: { data: { full_name: input.name } },
      })
      if (error) throw error
      const session = data.session
      const userId = data.user?.id
      if (!userId) throw new Error('Signup failed')
      if (!session) {
        throw new Error('Email confirm karein, phir login karein / Confirm your email, then sign in')
      }
      // The RPC creates shop + profile + owner membership in one transaction.
      const { error: rpcError } = await supabase.rpc('create_shop_for_current_user', {
        p_name: input.shopName,
        p_owner_name: input.name,
        p_phone: input.phone || null,
      })
      if (rpcError) throw rpcError
      const profile = await fetchProfile(userId)
      await afterAuth(
        userId,
        input.email,
        profile ?? { shop_id: '', full_name: input.name, role: 'owner' },
      )
    },
    [afterAuth],
  )

  const completeSetup = useCallback(
    async (input: ShopSetupInput) => {
      const shopRow = await createLocalShop(input)
      setShop(shopRow)
      setUser(localOwner(shopRow))
      setNeedsSetup(false)
      setNeedsAuth(false)
      setNeedsShop(false)
      setPinConfigured(await hasPinSet())
      setReady(true)
    },
    [],
  )

  const resetLocalData = useCallback(async () => {
    await wipeLocalData()
    setShop(null)
    setUser(null)
    setNeedsSetup(!supabaseConfigured)
    setNeedsAuth(supabaseConfigured)
  }, [])

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
    setShop(null)
    setUser(null)
    // Local (no cloud) shops keep their data: there is no account to sign into.
    setNeedsAuth(supabaseConfigured)
    if (!supabaseConfigured) setNeedsSetup(true)
  }, [])

  const saveOwnerPin = useCallback(
    async (pin: string) => {
      await persistPin(pin)
      setPinConfigured(true)
      await setMeta('owner_pin_synced_at', new Date().toISOString())
    },
    [],
  )

  const verifyOwnerPin = useCallback(async (pin: string) => verifyPin(pin), [])

  const enableBiometric = useCallback(async () => {
    const actor = stageRef.current.user
    if (!actor) return false
    const ok = await registerBiometric(actor.name, actor.id)
    setBiometricEnabled(ok)
    return ok
  }, [])

  const requestApproval = useCallback(
    async (options: ApprovalRequest): Promise<OwnerApproval | null> => {
      const actor = stageRef.current.user
      if (!actor) return null
      const configured = await hasPinSet()
      return new Promise<OwnerApproval | null>((resolve) => {
        setGate({
          ...options,
          pinConfigured: configured,
          resolve: async (approval) => {
            setGate(null)
            if (approval) {
              const shopId = stageRef.current.shop?.id
              if (shopId) {
                await writeAudit({
                  shopId,
                  actor,
                  entity: 'approval',
                  entityId: uuid(),
                  action: `owner_approval:${options.permission}`,
                  newValue: {
                    amount_paise: options.amountPaise ?? null,
                    title: options.title,
                    method: 'pin',
                  },
                })
              }
            }
            resolve(approval)
          },
        })
      })
    },
    [],
  )

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      bootError,
      shop,
      user,
      role: user?.role ?? null,
      language: prefs.language,
      dark: prefs.dark,
      largeText: prefs.largeText,
      cloudConfigured: supabaseConfigured,
      needsSetup,
      needsAuth,
      needsShop,
      syncState,
      pendingSync,
      syncError,
      toast,
      toastState,
      setLanguage,
      setDark,
      setLargeText,
      refreshShop,
      updateShop,
      signIn,
      signUp,
      createShopForUser,
      signOut,
      completeSetup,
      resetLocalData,
      refresh,
      pinConfigured,
      saveOwnerPin,
      requestApproval,
      verifyOwnerPin,
      biometricEnabled,
      enableBiometric,
    }),
    [
      ready,
      bootError,
      shop,
      user,
      prefs,
      needsSetup,
      needsAuth,
      needsShop,
      syncState,
      pendingSync,
      syncError,
      toast,
      toastState,
      setLanguage,
      setDark,
      setLargeText,
      refreshShop,
      updateShop,
      signIn,
      signUp,
      createShopForUser,
      signOut,
      completeSetup,
      resetLocalData,
      refresh,
      pinConfigured,
      saveOwnerPin,
      requestApproval,
      verifyOwnerPin,
      biometricEnabled,
      enableBiometric,
    ],
  )

  return (
    <AppContext.Provider value={value}>
      {children}
      {gate && (
        <OwnerGate
          request={gate}
          verifyPin={verifyOwnerPin}
          biometricEnabled={biometricEnabled}
          verifyBiometric={verifyBiometric}
          onSetupPin={saveOwnerPin}
          onResolve={gate.resolve}
          onToast={toast}
        />
      )}
    </AppContext.Provider>
  )
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}

async function fetchProfile(userId: string): Promise<{ shop_id: string; full_name: string; role: Role } | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('shop_id, full_name, role')
    .eq('id', userId)
    .maybeSingle()
  if (error) return null
  return (data as { shop_id: string; full_name: string; role: Role } | null) ?? null
}

async function pullShop(shopId: string): Promise<Shop | null> {
  if (!supabase) return null
  const { data } = await supabase.from('shops').select('*').eq('id', shopId).maybeSingle()
  if (!data) return null
  const shopRow = data as Shop
  await db.shops.put(shopRow)
  return shopRow
}
