import type { Env } from './types'

/** `wrangler secret` 粘贴时常带首尾空白或换行，Steam 会 403 + verify your key= */
function steamWebApiKey(env: Env): string {
  return (env.STEAM_WEB_API_KEY ?? '').trim()
}

const AUTH_TICKET_PATH = '/ISteamUserAuth/AuthenticateUserTicket/v1/'

/** Steam 文档：GET；部分环境对无 UA 的请求更敏感 */
const STEAM_FETCH_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'MetaDocCloudWorker/1.0 (+https://partner.steamgames.com/doc/webapi/ISteamUserAuth)'
} as const

function parseSteamAuthJson(text: string):
  | {
      ok: true
      steamId: string
    }
  | {
      ok: false
      reason: string
    } {
  let data: {
    response?: {
      params?: { result?: string; steamid?: string }
      error?: { errorcode?: number; errordesc?: string }
    }
  }
  try {
    data = JSON.parse(text) as typeof data
  } catch {
    return { ok: false, reason: `steam_non_json:${text.slice(0, 160)}` }
  }

  const err = data.response?.error
  if (err && (err.errorcode !== undefined || err.errordesc)) {
    const code = err.errorcode ?? '?'
    const desc = (err.errordesc || '').slice(0, 200)
    return { ok: false, reason: `steam_api_error_${code}${desc ? `:${desc}` : ''}` }
  }
  const params = data.response?.params
  if (params?.result === 'OK' && params.steamid) {
    return { ok: true, steamId: String(params.steamid) }
  }
  const r = params?.result ?? 'no_ok'
  return { ok: false, reason: `steam_ticket_result:${r}` }
}

export async function authenticateSteamTicket(
  env: Env,
  ticketHex: string
): Promise<{ ok: true; steamId: string } | { ok: false; reason: string; diagnostic?: string }> {
  const key = steamWebApiKey(env)
  const appid = env.STEAM_APP_ID
  if (!key || !appid) return { ok: false, reason: 'server_misconfigured' }
  const ticket = String(ticketHex).trim().replace(/\s+/g, '').replace(/-/g, '')
  if (!ticket) {
    return { ok: false, reason: 'empty_ticket_after_normalize' }
  }

  async function getTicket(
    base: 'https://partner.steam-api.com' | 'https://api.steampowered.com'
  ): Promise<Response> {
    const url = new URL(base + AUTH_TICKET_PATH)
    url.searchParams.set('key', key)
    url.searchParams.set('appid', String(appid))
    url.searchParams.set('ticket', ticket)
    if (url.toString().length > 7500) {
      const form = new URLSearchParams()
      form.set('key', key)
      form.set('appid', String(appid))
      form.set('ticket', ticket)
      return fetch(base + AUTH_TICKET_PATH, {
        method: 'POST',
        headers: {
          ...STEAM_FETCH_HEADERS,
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body: form.toString()
      })
    }
    return fetch(url.toString(), { method: 'GET', headers: { ...STEAM_FETCH_HEADERS } })
  }

  /**
   * HTTP 403 on partner.steam-api.com 在 Steam 侧最常见含义是：**key= 不是 Steamworks Partner Web API Key**。
   * 个人在 steamcommunity.com/dev/apikey 申请的密钥不能用于 partner 域名（Steam 返回 403 + “verify your key”）。
   * 文档：同一接口也可在 api.steampowered.com 使用（游戏服场景）；若 Partner 403，再试 Public 主机。
   */
  let res = await getTicket('https://partner.steam-api.com')
  const text = await res.text()

  if (!res.ok && (res.status === 403 || res.status === 401)) {
    const partnerSnippet = text.replace(/\s+/g, ' ').slice(0, 280)
    const res2 = await getTicket('https://api.steampowered.com')
    const text2 = await res2.text()
    if (res2.ok) {
      const parsed = parseSteamAuthJson(text2)
      if (parsed.ok) {
        return { ok: true, steamId: parsed.steamId }
      }
      return {
        ok: false,
        reason: parsed.reason,
        diagnostic: `Steam partner host returned ${res.status}; public host returned JSON error.`
      }
    }
    const publicSnippet = text2.replace(/\s+/g, ' ').slice(0, 280)
    return {
      ok: false,
      reason: `steam_http_${res.status}`,
      diagnostic: `
partner.steam-api.com → HTTP ${res.status}: ${partnerSnippet || '(empty body)'}
api.steampowered.com → HTTP ${res2.status}: ${publicSnippet || '(empty body)'}
Root cause (most common): STEAM_WEB_API_KEY must be the Publisher Web API Key from Steamworks (Users & Permissions → your partner group → Web API Key). The consumer key from steamcommunity.com/dev/apikey is rejected on partner.steam-api.com with HTTP 403.
`.trim()
    }
  }

  if (!res.ok) {
    return {
      ok: false,
      reason: `steam_http_${res.status}`,
      diagnostic: text.replace(/\s+/g, ' ').slice(0, 400)
    }
  }

  const parsed = parseSteamAuthJson(text)
  if (parsed.ok) {
    return { ok: true, steamId: parsed.steamId }
  }
  return { ok: false, reason: parsed.reason }
}

function mtxBase(env: Env): string {
  return env.STEAM_MICROTX_SANDBOX === 'true'
    ? 'https://partner.steam-api.com/ISteamMicroTxnSandbox'
    : 'https://partner.steam-api.com/ISteamMicroTxn'
}

/** form-urlencoded POST */
async function steamMicroTxnPost(
  env: Env,
  path: string,
  body: Record<string, string | number>
): Promise<Record<string, unknown>> {
  const key = steamWebApiKey(env)
  const form = new URLSearchParams()
  form.set('key', key)
  for (const [k, v] of Object.entries(body)) {
    form.set(k, String(v))
  }
  const url = `${mtxBase(env)}${path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: form.toString()
  })
  const text = await res.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { parse_error: true, raw: text }
  }
}

export type MtxCheckoutSession = 'client' | 'web'

export async function initTxn(
  env: Env,
  params: {
    orderId: string
    steamId: string
    itemId: number
    itemCount: number
    amountCents: number
    language: string
    currency: string
    description: string
    userSession: MtxCheckoutSession
    /** Web 结账必填：用户公网 IP（Steam 文档要求） */
    ipAddress?: string
  }
): Promise<Record<string, unknown>> {
  const appid = Number(env.STEAM_APP_ID)
  const body: Record<string, string | number> = {
    orderid: params.orderId,
    steamid: params.steamId,
    appid,
    usersession: params.userSession,
    itemcount: params.itemCount,
    language: params.language,
    currency: params.currency,
    'itemid[0]': params.itemId,
    'qty[0]': 1,
    'amount[0]': params.amountCents,
    'description[0]': params.description
  }
  if (params.userSession === 'web') {
    const ip = params.ipAddress?.trim() ?? ''
    if (!ip) {
      return {
        response: {
          result: 'Failure',
          error: { errordesc: 'ip_address_required_for_web_checkout' }
        }
      }
    }
    body.ipaddress = ip
  }
  return steamMicroTxnPost(env, '/InitTxn/v3/', body)
}

/** Web 结账时 InitTxn 返回，应用应打开此 URL 在浏览器内完成授权 */
export function mtxInitSteamUrl(data: Record<string, unknown>): string | null {
  const r = data as { response?: { params?: { steamurl?: string } } }
  const u = r.response?.params?.steamurl
  return typeof u === 'string' && (u.startsWith('http://') || u.startsWith('https://')) ? u : null
}

export function mtxInitTransId(data: Record<string, unknown>): string | null {
  const r = data as { response?: { params?: { transid?: string | number } } }
  const t = r.response?.params?.transid
  if (t == null) return null
  return String(t)
}

/** QueryTxn 返回的订单/行项状态（Init / Approved / Succeeded / Failed …） */
export function mtxQueryOrderStatus(data: Record<string, unknown>): string | null {
  const rp = data as {
    response?: { params?: { status?: string; items?: { itemstatus?: string }[] } }
  }
  const params = rp.response?.params
  const items = params?.items
  if (Array.isArray(items)) {
    for (const it of items) {
      const st = typeof it?.itemstatus === 'string' ? it.itemstatus : ''
      const low = st.toLowerCase()
      if (low.includes('fail') || low.includes('denied') || low === 'failed') {
        return st
      }
    }
  }
  const top = params?.status
  if (typeof top === 'string' && top.length > 0) return top
  if (Array.isArray(items) && items[0] && typeof items[0].itemstatus === 'string') {
    return items[0].itemstatus
  }
  return null
}

export async function queryTxn(
  env: Env,
  orderId: string,
  transId?: string
): Promise<Record<string, unknown>> {
  const key = steamWebApiKey(env)
  const appid = Number(env.STEAM_APP_ID)
  const base = mtxBase(env)
  const url = new URL(`${base}/QueryTxn/v3/`)
  url.searchParams.set('key', key)
  url.searchParams.set('appid', String(appid))
  url.searchParams.set('orderid', orderId)
  if (transId) {
    url.searchParams.set('transid', transId)
  }
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent':
        'MetaDocCloudWorker/1.0 (+https://partner.steamgames.com/doc/webapi/ISteamMicroTxn)'
    }
  })
  const text = await res.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { parse_error: true, raw: text }
  }
}

/** InitTxn 的 orderid 为 64 位无符号整数；`Date.now()` 再接 9 位随机数可能超过上限导致异常 */
export function newSteamMtxOrderId(): string {
  const t = BigInt(Date.now())
  const r = BigInt(Math.floor(Math.random() * 1_000_000))
  const id = t * 1_000_000n + r
  const max = 18446744073709551615n
  return (id > max ? id % max : id).toString()
}

export async function finalizeTxn(env: Env, orderId: string): Promise<Record<string, unknown>> {
  const appid = Number(env.STEAM_APP_ID)
  return steamMicroTxnPost(env, '/FinalizeTxn/v2/', {
    orderid: orderId,
    appid
  })
}

/** 合作伙伴 Web API：用户是否拥有本应用（首购额度用） */
export async function checkAppOwnership(
  env: Env,
  steamId: string
): Promise<{ ok: true; owns: boolean } | { ok: false; reason: string }> {
  const key = steamWebApiKey(env)
  const appid = env.STEAM_APP_ID
  if (!key || !appid) return { ok: false, reason: 'server_misconfigured' }
  const url = new URL('https://partner.steam-api.com/ISteamUser/CheckAppOwnership/v1/')
  url.searchParams.set('key', key)
  url.searchParams.set('appid', appid)
  url.searchParams.set('steamid', steamId)
  const res = await fetch(url.toString(), { method: 'GET' })
  if (!res.ok) return { ok: false, reason: 'steam_http_error' }
  const data = (await res.json()) as { appownership?: { ownsapp?: boolean } }
  return { ok: true, owns: data.appownership?.ownsapp === true }
}

export async function getReport(
  env: Env,
  type: string = 'GAMESALES'
): Promise<Record<string, unknown>> {
  const appid = Number(env.STEAM_APP_ID)
  return steamMicroTxnPost(env, '/GetReport/v4/', {
    appid,
    type,
    time: Math.floor(Date.now() / 1000)
  })
}
