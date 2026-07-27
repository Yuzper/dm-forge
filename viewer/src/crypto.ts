// WebCrypto side of the player-site encryption. Must stay interoperable with
// the Node side in electron/main/ipc/publishCore.ts:
//   PBKDF2-SHA256 (N iterations) → AES-256-GCM, ciphertext||16-byte-tag.
import type { EncryptedBundle } from './types'

// Decode base64 → bytes on a fresh ArrayBuffer (so the result is a proper
// BufferSource for WebCrypto under strict lib.dom typing).
function b64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// Per-player bundle filename — must match publishCore.bundleFileName.
export async function bundleFileName(username: string): Promise<string> {
  return (await sha256Hex(username.toLowerCase().trim())) + '.enc'
}

// Returns the decrypted plaintext, or throws on a wrong password (GCM auth fail).
export async function decryptBundle(enc: EncryptedBundle, password: string, iterations: number): Promise<string> {
  const baseKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'],
  )
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64(enc.salt), iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, key, b64(enc.ct))
  return new TextDecoder().decode(plain)
}
