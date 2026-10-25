/**
 * ============================================================
 *  MEN'S SALOON — cloud database (Supabase, free tier).
 *
 *  Har form-booking yahan save hoti hai, taaki:
 *   • Customer apna mobile number daal ke apni booking
 *     HISTORY kisi bhi phone se dekh sake.
 *   • Shop owner secret PIN daal ke saari bookings ka
 *     record (Shop Panel) dekh/manage kar sake.
 *
 *  Security model (database level, Row Level Security):
 *   • Public (anon key) sirf NAYI booking INSERT kar sakta hai.
 *   • Koi bhi table direct NAHI padh sakta.
 *   • History sirf exact mobile number match par milti hai
 *     (RPC: my_bookings).
 *   • Pura record sirf sahi Admin PIN par milta hai
 *     (RPC: admin_bookings / admin_set_status) — PIN database
 *     me bcrypt hash me rehta hai, is file/code me NAHI.
 *   • Neeche wali ANON key public hoti hai (ye design hi aisa
 *     hai) — service_role/secret key yahan KABHI mat lagana.
 *
 *  Database setup dobara banana ho to: supabase/schema.sql
 * ============================================================
 */

const SUPABASE_URL = 'https://uwgnbryyougnfrzsgcdx.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3Z25icnl5b3VnbmZyenNnY2R4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4OTEwNzMsImV4cCI6MjEwODQ2NzA3M30.S2EZFqD_VQYnS-XqzPuyoN6oSZC2P7xnAVx0KE_iaWM'

export type BookingStatus = 'pending' | 'confirmed' | 'done' | 'cancelled'

export type DbBooking = {
  id: string
  created_at: string
  name: string
  phone: string
  service: string
  price: number | null
  appt_date: string | null
  appt_time: string | null
  notes: string | null
  status: BookingStatus
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const msg = await res.text().catch(() => '')
    throw new Error(msg || `Request failed (${res.status})`)
  }
  return (await res.json()) as T
}

export type BookingInsert = {
  name: string
  phone: string
  service: string
  price: number
  appt_date: string
  appt_time: string
  notes: string
}

/** Nayi booking database me save karo (form submit par).
    keepalive: WhatsApp app khulne par browser background ho jaye
    tab bhi ye request poori hoti hai — booking kabhi nahi khoyegi. */
export async function saveBooking(row: BookingInsert): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(row),
    keepalive: true,
  })
  if (!res.ok) throw new Error(`save failed (${res.status})`)
}

/* Offline-safe save: net na ho to booking phone me queue ho jati hai,
   net aate hi flushPendingBookings() use cloud me bhej deta hai.
   Matlab: app ka pura data hamesha store — online ya offline. */
const PENDING_KEY = 'mens-saloon-pending-bookings'

export async function saveBookingSafe(row: BookingInsert): Promise<'saved' | 'queued'> {
  try {
    await saveBooking(row)
    return 'saved'
  } catch {
    try {
      const q = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]') as BookingInsert[]
      q.push(row)
      localStorage.setItem(PENDING_KEY, JSON.stringify(q.slice(-20)))
    } catch { /* storage band ho to bhi WhatsApp booking chalegi */ }
    return 'queued'
  }
}

export async function flushPendingBookings(): Promise<void> {
  let q: BookingInsert[] = []
  try { q = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]') as BookingInsert[] } catch { return }
  if (!q.length) return
  const left: BookingInsert[] = []
  for (const row of q) {
    try { await saveBooking(row) } catch { left.push(row) }
  }
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(left)) } catch { /* ignore */ }
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(args),
  })
  return parse<T>(res)
}

/** Customer history — exact mobile number par uski bookings. */
export function fetchMyBookings(phone: string): Promise<DbBooking[]> {
  return rpc<DbBooking[]>('my_bookings', { p_phone: phone })
}

/** Shop Panel — sahi Admin PIN par saari bookings (galat PIN = khali list). */
export function fetchAdminBookings(pin: string): Promise<DbBooking[]> {
  return rpc<DbBooking[]>('admin_bookings', { p_pin: pin })
}

/** Booking ka status badlo (sirf sahi PIN par asar hoga). */
export function setBookingStatus(pin: string, id: string, status: BookingStatus): Promise<boolean> {
  return rpc<boolean>('admin_set_status', { p_pin: pin, p_id: id, p_status: status })
}

/** Admin PIN badlo — purana PIN sahi hona chahiye. */
export function changeAdminPin(oldPin: string, newPin: string): Promise<boolean> {
  return rpc<boolean>('admin_change_pin', { p_old: oldPin, p_new: newPin })
}

/* ---------- Live site config (services + settings) ----------
   Owner Shop Panel se jo badlega (price, service, notice),
   wahi website + installed app me turant dikhega — bina
   website dobara banaye. Public sirf padh sakta hai;
   badlav sirf sahi Admin PIN wale RPC se hota hai. */

export type DbService = {
  id: string
  name: string
  desc_en: string
  desc_hi: string
  price: number
  price_note: string | null
  duration: string
  tag: string | null
  sort: number
  active: boolean
}

export type SiteSettings = {
  announcement: string
  closed_today: boolean
  closed_message: string
  season_auto: boolean
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}${path}`, { headers: headers() })
  return parse<T>(res)
}

/** Database wali live price-list (khali/fail ho to site config.ts wali default chalegi). */
export function fetchSiteServices(): Promise<DbService[]> {
  return getJson<DbService[]>('/rest/v1/site_services?select=*&order=sort.asc')
}

/** Owner notice / aaj-band / season setting. */
export async function fetchSiteSettings(): Promise<SiteSettings | null> {
  const rows = await getJson<{ data: SiteSettings }[]>('/rest/v1/site_settings?select=data&id=eq.1')
  return rows[0]?.data ?? null
}

/** Shop Panel: poori price-list save karo (sirf sahi PIN). */
export function adminSaveServices(pin: string, items: DbService[]): Promise<boolean> {
  return rpc<boolean>('admin_save_services', { p_pin: pin, p_items: items })
}

/** Shop Panel: notice / aaj-band / season setting save karo (sirf sahi PIN). */
export function adminSaveSettings(pin: string, data: SiteSettings): Promise<boolean> {
  return rpc<boolean>('admin_save_settings', { p_pin: pin, p_data: data })
}

/** Live bheed-meter — kisi date par har slot me kitni bookings (sirf count, personal data nahi). */
export type SlotRush = { appt_time: string; bookings: number }
export function fetchSlotRush(date: string): Promise<SlotRush[]> {
  return rpc<SlotRush[]>('slot_rush', { p_date: date })
}

/** Shop Panel: saare customers ka online record (visits, last visit, total) — sirf sahi PIN. */
export type DbCustomer = {
  phone: string
  name: string
  visits: number
  last_date: string | null
  total_spent: number
}
export function fetchAdminCustomers(pin: string): Promise<DbCustomer[]> {
  return rpc<DbCustomer[]>('admin_customers', { p_pin: pin })
}
