import type { JWTPayload } from './types'

function strB64url(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmacSign(secret: string, data: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return crypto.subtle.sign('HMAC', key, enc.encode(data))
}

export async function signJwt(
  secret: string,
  payload: JWTPayload,
  ttlSec: number
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const body = { ...payload, iat: now, exp: now + ttlSec }
  const h = strB64url(JSON.stringify(header))
  const p = strB64url(JSON.stringify(body))
  const data = `${h}.${p}`
  const sig = await hmacSign(secret, data)
  const s = b64url(sig)
  return `${data}.${s}`
}

export async function verifyJwt(secret: string, token: string): Promise<JWTPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [h, p, sig] = parts
  const data = `${h}.${p}`
  const expected = await hmacSign(secret, data)
  const got = fromB64url(sig)
  const exp = new Uint8Array(expected)
  if (got.length !== exp.length) return null
  for (let i = 0; i < got.length; i++) if (got[i] !== exp[i]) return null
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(p))) as JWTPayload
    const now = Math.floor(Date.now() / 1000)
    if (typeof payload.exp === 'number' && payload.exp < now) return null
    if (typeof payload.sub !== 'string' || !payload.sub) return null
    return payload
  } catch {
    return null
  }
}
