import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cloud config comes from either of two places, in this order:
 *
 *  1. the build-time `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
 *  2. a runtime connection saved from **More → Connect cloud** (localStorage)
 *
 * The runtime option matters on Android: the APK is already installed, so the shop
 * can paste its project URL + anon key into the app instead of waiting for a rebuild.
 * The anon key is public by design — RLS, not the key, protects the data.
 */
const STORAGE_KEY = 'dukaan-cloud-config'

interface CloudConfig {
  url: string
  anonKey: string
}

function readRuntimeConfig(): CloudConfig | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CloudConfig>
    if (!parsed.url || !parsed.anonKey) return null
    return { url: parsed.url.trim(), anonKey: parsed.anonKey.trim() }
  } catch {
    return null
  }
}

const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

const runtime = readRuntimeConfig()
const config: CloudConfig | null =
  runtime ?? (envUrl && envKey ? { url: envUrl, anonKey: envKey } : null)

/**
 * The app is fully usable with no Supabase project: the shop then lives in the
 * device database only and a JSON backup keeps it safe.
 */
export const supabaseConfigured = Boolean(config)
export const cloudSource: 'runtime' | 'env' | 'none' = runtime ? 'runtime' : envUrl && envKey ? 'env' : 'none'

export const supabase: SupabaseClient | null = config
  ? createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'dukaan-dost-auth',
      },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null

/** Validates and saves a project URL + anon key. The caller reloads the app after. */
export function saveCloudConfig(url: string, anonKey: string): { ok: true; url: string } | { ok: false; error: string } {
  const cleanUrl = url.trim().replace(/\/+$/, '')
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(cleanUrl)) {
    return { ok: false, error: 'URL should look like https://abcdefgh.supabase.co' }
  }
  if (anonKey.trim().length < 40) {
    return { ok: false, error: 'Anon key bahut chhoti hai — Project Settings → API se copy karein' }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ url: cleanUrl, anonKey: anonKey.trim() }))
  return { ok: true, url: cleanUrl }
}

export function clearCloudConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem('dukaan-dost-auth')
}

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase is not configured. Connect the cloud from More → Connect cloud.')
  }
  return supabase
}

export const SUPABASE_BUCKET = 'product-images'
