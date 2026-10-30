import { getMeta, setMeta } from './db'

/**
 * The owner PIN protects price edits, discounts, voids and refunds.
 *
 * A 4–6 digit PIN is short, so a plain salted hash is not enough: anyone who
 * copies the device storage could brute-force it in seconds. We therefore derive
 * the stored value with PBKDF2-SHA256 (120k iterations + a random 128-bit salt),
 * which turns that offline attack into hours per PIN. The PIN is still only one
 * layer — the database (RLS + triggers) is what actually stops a tampered client.
 */
const PIN_KEY = 'owner_pin_hash'
const ITERATIONS = 120_000
const VERSION = 2

interface PinRecord {
  v: number
  salt: string
  iterations: number
  hash: string
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomSalt(): string {
  const bytes = new Uint8Array(16)
  const webCrypto = crypto as Crypto | undefined
  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  return toHex(bytes)
}

/** Deterministic last-resort hash for WebViews without WebCrypto. */
function fallbackHash(text: string): string {
  const data = new TextEncoder().encode(text)
  let hash = 0
  for (const byte of data) hash = (hash * 31 + byte) >>> 0
  return `fallback-${hash.toString(16)}`
}

async function derive(pin: string, salt: string, iterations: number): Promise<string> {
  const subtle = (crypto as Crypto | undefined)?.subtle
  if (!subtle) return fallbackHash(`dukaan-dost:${salt}:${pin}`)
  const encoder = new TextEncoder()
  const key = await subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations, hash: 'SHA-256' },
    key,
    256,
  )
  return toHex(new Uint8Array(bits))
}

/** v1 stored a single SHA-256 hex digest with a fixed salt. */
async function legacyHash(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`dukaan-dost:${pin}`)
  const subtle = (crypto as Crypto | undefined)?.subtle
  if (!subtle) return fallbackHash(`dukaan-dost:${pin}`)
  const digest = await subtle.digest('SHA-256', data)
  return toHex(new Uint8Array(digest))
}

function parseRecord(raw: string | null): PinRecord | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as PinRecord
    if (parsed && parsed.v === VERSION && parsed.salt && parsed.hash) return parsed
  } catch {
    // v1 value — handled by the legacy path
  }
  return null
}

export async function hasPinSet(): Promise<boolean> {
  const value = await getMeta<string | null>(PIN_KEY, null)
  return Boolean(value)
}

export async function setPin(pin: string): Promise<void> {
  if (!/^\d{4,6}$/.test(pin)) throw new Error('PIN 4 se 6 ank ka hona chahiye')
  const salt = randomSalt()
  const record: PinRecord = {
    v: VERSION,
    salt,
    iterations: ITERATIONS,
    hash: await derive(pin, salt, ITERATIONS),
  }
  await setMeta(PIN_KEY, JSON.stringify(record))
}

export async function verifyPin(pin: string): Promise<boolean> {
  if (!/^\d{4,6}$/.test(pin)) return false
  const stored = await getMeta<string | null>(PIN_KEY, null)
  if (!stored) return false

  const record = parseRecord(stored)
  if (record) {
    const hash = await derive(pin, record.salt, record.iterations)
    return hash === record.hash
  }

  // Legacy v1 hash: verify with the old scheme, then transparently upgrade.
  const legacy = await legacyHash(pin)
  if (legacy !== stored) return false
  await setPin(pin)
  return true
}

export async function clearPin(): Promise<void> {
  await setMeta(PIN_KEY, null)
}
