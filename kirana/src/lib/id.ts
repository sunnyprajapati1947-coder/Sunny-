export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  // RFC4122 v4 fallback for older WebViews.
  const bytes = new Uint8Array(16)
  const webCrypto = typeof crypto !== 'undefined' ? (crypto as Crypto | undefined) : undefined
  if (webCrypto?.getRandomValues) webCrypto.getRandomValues(bytes)
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function shortId(length = 8): string {
  return uuid().replace(/-/g, '').slice(0, length)
}
