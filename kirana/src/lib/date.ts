const IST_OFFSET_MINUTES = 330

/** Returns YYYY-MM-DD for a date in Asia/Kolkata (shop timezone). */
export function istDateKey(date: Date = new Date()): string {
  const utc = date.getTime() + date.getTimezoneOffset() * 60_000
  const ist = new Date(utc + IST_OFFSET_MINUTES * 60_000)
  return `${ist.getFullYear()}-${pad(ist.getMonth() + 1)}-${pad(ist.getDate())}`
}

/** UTC ISO boundaries of an IST calendar day. */
export function istDayRange(dateKey: string = istDateKey()): { start: string; end: string } {
  const [y, m, d] = dateKey.split('-').map(Number)
  const startUtc = Date.UTC(y, m - 1, d, 0, 0, 0) - IST_OFFSET_MINUTES * 60_000
  const endUtc = startUtc + 24 * 60 * 60_000
  return { start: new Date(startUtc).toISOString(), end: new Date(endUtc).toISOString() }
}

export function startOfMonthIST(date: Date = new Date()): string {
  const key = istDateKey(date)
  return `${key.slice(0, 7)}-01`
}

export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

export function daysBetween(fromKey: string, toKey: string): number {
  const [y1, m1, d1] = fromKey.split('-').map(Number)
  const [y2, m2, d2] = toKey.split('-').map(Number)
  return Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / (24 * 60 * 60 * 1000),
  )
}

export function daysUntil(dateKey: string | null | undefined): number | null {
  if (!dateKey) return null
  return daysBetween(istDateKey(), dateKey)
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = iso.length === 10 ? new Date(`${iso}T00:00:00+05:30`) : new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(date)
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(date)
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return `${formatDate(iso)}, ${formatTime(iso)}`
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

/** yymmdd in IST — used in bill numbers. */
export function billDateStamp(date: Date = new Date()): string {
  return istDateKey(date).slice(2).replace(/-/g, '')
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
