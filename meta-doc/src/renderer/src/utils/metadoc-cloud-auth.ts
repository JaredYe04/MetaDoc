/**
 * Steam 构建：使用 Steam 会话票据向 Worker 换取 JWT，供 MetaDoc 官方云 LLM 使用。
 */
import messageBridge from '../bridge/message-bridge'
import eventBus from './event-bus.js'
import { getSteamStatus, getSteamUser } from '../services/steam-client'
import { getMetadocCloudApiBase, isSteamDistribution } from '@common/build-env'
import { useMetadocCloudOpenAiRoute } from './dev-ai-pipeline'

const JWT_KEY = 'metadocCloudJwt'
const JWT_EXP_KEY = 'metadocCloudJwtExpMs'

export function getStoredMetadocCloudJwt(): string | null {
  try {
    return localStorage.getItem(JWT_KEY)
  } catch {
    return null
  }
}

function setStoredJwt(token: string, expiresInSec: number): void {
  const expMs = Date.now() + expiresInSec * 1000
  localStorage.setItem(JWT_KEY, token)
  localStorage.setItem(JWT_EXP_KEY, String(expMs))
}

/** 确保存在未过期的 JWT，必要时用 Steam 票据刷新 */
export async function ensureMetadocSteamCloudJwt(): Promise<string> {
  const base = getMetadocCloudApiBase()
  if (!base) {
    throw new Error('VITE_METADOC_CLOUD_API_URL 未配置')
  }

  const existing = getStoredMetadocCloudJwt()
  const expStr = localStorage.getItem(JWT_EXP_KEY)
  const expMs = expStr ? Number(expStr) : 0
  if (existing && expMs > Date.now() + 30_000) {
    return existing
  }

  if (import.meta.env.DEV && !isSteamDistribution() && useMetadocCloudOpenAiRoute()) {
    const secret = import.meta.env.VITE_METADOC_CLOUD_DEV_AUTH_SECRET as string | undefined
    const sid = import.meta.env.VITE_METADOC_CLOUD_DEV_STEAM_ID as string | undefined
    if (!secret || !sid) {
      throw new Error(
        'DEV：请配置 VITE_METADOC_CLOUD_DEV_AUTH_SECRET 与 VITE_METADOC_CLOUD_DEV_STEAM_ID（与 Worker ALLOW_DEV_AUTH / DEV_AUTH_SECRET 一致）'
      )
    }
    const res = await fetch(`${base}/auth/steam`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Dev-Secret': secret
      },
      body: JSON.stringify({ steam_id: sid })
    })
    const json = (await res.json()) as { token?: string; expires_in?: number; message?: string }
    if (!res.ok || !json.token) {
      throw new Error(json.message || `MetaDoc 云 DEV 登录失败 (${res.status})`)
    }
    const ttl = typeof json.expires_in === 'number' ? json.expires_in : 3600
    setStoredJwt(json.token, ttl)
    return json.token
  }

  const user = await getSteamUser()
  if (!user.success || !user.data?.id) {
    throw new Error(user.success === false ? user.error : 'Steam 用户不可用')
  }

  const ticketRes = await messageBridge.invoke('steam:auth:get-session-ticket')
  const tr = ticketRes as { success?: boolean; data?: { ticket?: string }; error?: string }
  if (!tr?.success || !tr.data?.ticket) {
    const code = tr?.error
    if (code === 'empty_ticket') {
      throw new Error(
        '无法获取 Steam 会话票据。请从 Steam 客户端启动本应用并确保已登录 Steam；勿直接双击未通过 Steam 启动的安装包。'
      )
    }
    if (code === 'getAuthSessionTicket_unavailable') {
      throw new Error('当前构建未包含 Steam 会话票据接口，请使用 Steam 渠道构建。')
    }
    throw new Error(tr?.error || '无法获取 Steam 会话票据')
  }

  const res = await fetch(`${base}/auth/steam`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      steam_id: user.data.id,
      ticket: tr.data.ticket
    })
  })

  const json = (await res.json()) as { token?: string; expires_in?: number; message?: string }
  if (!res.ok || !json.token) {
    throw new Error(json.message || `MetaDoc 云登录失败 (${res.status})`)
  }

  const ttl = typeof json.expires_in === 'number' ? json.expires_in : 3600
  setStoredJwt(json.token, ttl)
  return json.token
}

export type SteamMtxInitResult = {
  order_id: string
  checkout: 'client' | 'web'
  /** 使用浏览器 Steam 页面完成支付并轮询入账 */
  used_browser?: boolean
  credits_added?: number
}

/** 与 i18n 配合：Steam 网页拒绝 / 轮询超时 */
export const MTX_ERR_STEAM_DECLINED = 'mtx_steam_declined'
export const MTX_ERR_POLL_TIMEOUT = 'mtx_steam_poll_timeout'

const FETCH_TIMEOUT_MS = 20000

async function fetchJsonWithTimeout(
  input: string,
  init: RequestInit
): Promise<{ res: Response; json: unknown }> {
  const signal =
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(FETCH_TIMEOUT_MS)
      : undefined
  const res = await fetch(input, { ...init, signal })
  const json = await res.json()
  return { res, json }
}

async function fetchPublicIpForMtx(): Promise<string | null> {
  const tryOnce = async (url: string, parse: (r: Response) => Promise<string | null>) => {
    try {
      const signal =
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(FETCH_TIMEOUT_MS)
          : undefined
      const r = await fetch(url, { signal })
      return await parse(r)
    } catch {
      return null
    }
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const a = await tryOnce('https://api.ipify.org?format=json', async (r) => {
      const j = (await r.json()) as { ip?: string }
      return typeof j.ip === 'string' ? j.ip : null
    })
    if (a) return a
    const b = await tryOnce('https://ipv4.icanhazip.com', async (r) => {
      const t = (await r.text()).trim()
      return /^\d{1,3}(\.\d{1,3}){3}$/.test(t) ? t : null
    })
    if (b) return b
    await new Promise((r) => setTimeout(r, 400))
  }
  return null
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 发起 Steam MTX：
 * - 能使用 Steam 客户端覆盖层时（Steam 分发或 Greenworks 已就绪）：**usersession=client**，在 Steam 内授权，
 *   由 `metadoc-steam-mtx-bridge` 调 Finalize；**不**走系统浏览器，避免 InitTxn 的 ip 与默认浏览器出口不一致导致「交易授权错误」。
 * - 否则：usersession=web + 本机上报公网 IP，打开 Steam URL 并轮询 /steam/mtx/sync-web。
 */
export async function startSteamMtxInit(body: {
  item_id: string | number
  amount_cents: number
  language?: string
  currency?: string
  description?: string
}): Promise<SteamMtxInitResult> {
  const base = getMetadocCloudApiBase()
  if (!base) {
    throw new Error('VITE_METADOC_CLOUD_API_URL 未配置')
  }
  const jwt = await ensureMetadocSteamCloudJwt()
  const useSteamOverlay = await canInitSteamMtx()
  const publicIp = useSteamOverlay ? null : await fetchPublicIpForMtx()
  const { res, json: initJson } = await fetchJsonWithTimeout(`${base}/steam/mtx/init`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${jwt}`
    },
    body: JSON.stringify({
      ...body,
      checkout: useSteamOverlay ? 'client' : 'auto',
      ip_address: useSteamOverlay ? undefined : publicIp ?? undefined
    })
  })
  const json = initJson as {
    order_id?: string
    checkout?: 'client' | 'web'
    steam_url?: string | null
    message?: string
    detail?: { response?: { errordesc?: string } }
  }
  if (!res.ok || !json.order_id) {
    const msg =
      json.message ||
      (typeof json.detail?.response?.errordesc === 'string'
        ? json.detail.response.errordesc
        : undefined) ||
      `MTX init failed (${res.status})`
    throw new Error(msg)
  }
  try {
    await messageBridge.invoke('steam:mtx:after-init', { order_id: json.order_id })
  } catch {
    /* 主进程泵 Steam 回调失败不阻断 */
  }

  const checkout: 'client' | 'web' = json.checkout === 'client' ? 'client' : 'web'

  if (checkout === 'web') {
    if (typeof json.steam_url === 'string' && json.steam_url.length > 0) {
      eventBus.emit('open-link', json.steam_url)
    }
    const maxAttempts = 45
    for (let i = 0; i < maxAttempts; i++) {
      await sleepMs(2000)
      const jwtPoll = await ensureMetadocSteamCloudJwt()
      const { res: poll, json: pollJson } = await fetchJsonWithTimeout(`${base}/steam/mtx/sync-web`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${jwtPoll}`
        },
        body: JSON.stringify({ order_id: json.order_id })
      })
      const pj = pollJson as {
        ok?: boolean
        completed?: boolean
        failed?: boolean
        credits_added?: number
        already_completed?: boolean
        message?: string
      }
      if (!poll.ok) {
        throw new Error(pj.message || `sync-web failed (${poll.status})`)
      }
      if (pj.failed === true) {
        throw new Error(MTX_ERR_STEAM_DECLINED)
      }
      if (pj.completed === true) {
        return {
          order_id: json.order_id,
          checkout: 'web',
          used_browser: true,
          credits_added: typeof pj.credits_added === 'number' ? pj.credits_added : 0
        }
      }
    }
    throw new Error(MTX_ERR_POLL_TIMEOUT)
  }

  return { order_id: json.order_id, checkout: 'client' }
}

/** 是否可在本机发起 Steam 内购：Steam 分发包，或运行时 Greenworks 已初始化且可用（无需仅依赖构建变量） */
export async function canInitSteamMtx(): Promise<boolean> {
  if (isSteamDistribution()) {
    return true
  }
  const st = await getSteamStatus()
  return st.success === true && st.data?.initialized === true && st.data?.available === true
}
