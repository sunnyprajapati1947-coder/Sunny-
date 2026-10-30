import 'fake-indexeddb/auto'

// Node < 19 has no global crypto.subtle; CI runs Node 20+ but keep a guard.
if (typeof globalThis.crypto === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { webcrypto } = require('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}
