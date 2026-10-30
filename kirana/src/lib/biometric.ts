import { getMeta, setMeta } from './db'

/**
 * Optional fingerprint / face unlock for owner approvals using WebAuthn with a
 * platform authenticator. Falls back to PIN everywhere.
 */
const CREDENTIAL_KEY = 'biometric_credential_id'

function randomChallenge(): Uint8Array {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return bytes
}

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

export async function biometricSupported(): Promise<boolean> {
  try {
    if (!window.PublicKeyCredential) return false
    if (!(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) return false
    return Boolean(await getMeta<string | null>(CREDENTIAL_KEY, null))
  } catch {
    return false
  }
}

export async function registerBiometric(userName: string, userId: string): Promise<boolean> {
  try {
    if (!window.PublicKeyCredential) return false
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    if (!available) return false
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge() as unknown as BufferSource,
        rp: { name: 'Dukaan Dost' },
        user: {
          id: new TextEncoder().encode(userId) as unknown as BufferSource,
          name: userName,
          displayName: userName,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null
    if (!credential) return false
    await setMeta(CREDENTIAL_KEY, toBase64Url(credential.rawId))
    return true
  } catch {
    return false
  }
}

export async function verifyBiometric(): Promise<boolean> {
  try {
    const stored = await getMeta<string | null>(CREDENTIAL_KEY, null)
    if (!stored) return false
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge() as unknown as BufferSource,
        allowCredentials: [{ id: fromBase64Url(stored) as unknown as BufferSource, type: 'public-key' }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })
    return Boolean(assertion)
  } catch {
    return false
  }
}

export async function disableBiometric(): Promise<void> {
  await setMeta(CREDENTIAL_KEY, null)
}
