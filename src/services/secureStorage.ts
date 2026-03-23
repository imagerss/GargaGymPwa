import { db } from '@/db/appDb'

const TOKEN_KEY = 'auth_token_encrypted'
const CRYPTO_KEY = 'auth_crypto_key'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes))
const fromBase64 = (base64: string): Uint8Array =>
  Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

const getOrCreateKey = async (): Promise<CryptoKey> => {
  const existing = await db.kv.get(CRYPTO_KEY)

  if (existing?.value) {
    const raw = fromBase64(existing.value)
    return crypto.subtle.importKey('raw', toArrayBuffer(raw), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  }

  const rawKey = crypto.getRandomValues(new Uint8Array(32))
  await db.kv.put({ key: CRYPTO_KEY, value: toBase64(rawKey) })
  return crypto.subtle.importKey('raw', toArrayBuffer(rawKey), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export const secureStorage = {
  async setToken(token: string): Promise<void> {
    const key = await getOrCreateKey()
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(token))

    const payload = `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`
    await db.kv.put({ key: TOKEN_KEY, value: payload })
  },

  async getToken(): Promise<string | null> {
    const stored = await db.kv.get(TOKEN_KEY)
    if (!stored?.value) return null

    const [ivPart, encryptedPart] = stored.value.split('.')
    if (!ivPart || !encryptedPart) return null

    const key = await getOrCreateKey()
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(fromBase64(ivPart)) },
      key,
      toArrayBuffer(fromBase64(encryptedPart)),
    )

    return decoder.decode(decrypted)
  },

  async clearToken(): Promise<void> {
    await db.kv.delete(TOKEN_KEY)
  },
}
