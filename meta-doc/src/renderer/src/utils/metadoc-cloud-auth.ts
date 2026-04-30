/**
 * Steam 构建：使用 Steam 会话票据向 Worker 换取 JWT，供 MetaDoc 官方云 LLM 使用。
 */
import messageBridge from '../bridge/message-bridge'
import eventBus from './event-bus.js'
import { i18n } from '../i18n.js'
import { createRendererLogger } from './logger.ts'
import { notifyInfo, notifySuccess } from './notify'
import { getSteamStatus, getSteamUser } from '../services/steam-client'
import { isSteamOverlayEnabled } from '../services/steam-client'
import {
  getMetadocCloudApiBase,
  getMetadocSteamMtxCheckoutPref,
  getMetadocSteamMtxWebOpenMode,
  isSteamDistribution
} from '@common/build-env'
import { useMetadocCloudOpenAiRoute } from './dev-ai-pipeline'

const JWT_KEY = 'metadocCloudJwt'
const JWT_EXP_KEY = 'metadocCloudJwtExpMs'

// #region agent log (debug-68ece7)
function agentDebugLog(location: string, message: string, data: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return
  try {
    fetch('http://127.0.0.1:7420/ingest/f298dd8f-3d1a-44fd-852c-9a2266805594', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '68ece7'
      },
      body: JSON.stringify({
        sessionId: '68ece7',
        runId: 'overlay-debug',
        hypothesisId: 'H-renderer',
        location,
        message,
        data,
        timestamp: Date.now()
      })
    }).catch(() => {})
  } catch {
    /* ignore */
  }
}
// #endregion agent log (debug-68ece7)

export function getStoredMetadocCloudJwt(): string | null {
  try {
    return localStorage.getItem(JWT_KEY)
  } catch {
    return null
  }
}

/** 清除本地缓存的 MetaDoc 云 JWT（调试用） */
export function clearMetadocCloudJwtStorage(): void {
  try {
    localStorage.removeItem(JWT_KEY)
    localStorage.removeItem(JWT_EXP_KEY)
  } catch {
    /* ignore */
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
  agentDebugLog('metadoc-cloud-auth.ts:ensureJwt', 'ensureJwt:enter', {
    hasBase: true,
    steamDistribution: isSteamDistribution()
  })

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
    agentDebugLog('metadoc-cloud-auth.ts:ensureJwt', 'ensureJwt:steam_user_unavailable', {
      success: user.success,
      error: user.success ? '' : (user as { error?: string }).error || ''
    })
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
  checkout: 'client' | 'web' | 'store'
  /** 使用浏览器 Steam 页面完成支付并轮询入账 */
  used_browser?: boolean
  credits_added?: number
}

/** 与 i18n 配合：Steam 网页拒绝 / 轮询超时 */
export const MTX_ERR_STEAM_DECLINED = 'mtx_steam_declined'
export const MTX_ERR_POLL_TIMEOUT = 'mtx_steam_poll_timeout'
export const MTX_ERR_STEAM_PENDING_AUTH = 'mtx_steam_pending_authorization'
export const MTX_ERR_NO_PUBLIC_IP = 'MTX_ERR_NO_PUBLIC_IP'
/** 主进程在 loadURL(steam_url) 前发现出口 IP 与 InitTxn 不一致；渲染进程会重试 InitTxn */
export const MTX_ERR_CHECKOUT_IP_MISMATCH = 'mtx_ip_mismatch'
/** 内嵌 Steam checkout 窗口未登录（或登录态异常），需先登录再重试 */
export const MTX_ERR_CHECKOUT_LOGGED_OUT = 'steam_checkout_logged_out'

const MTX_WEB_OPEN_MAX_ATTEMPTS = 3

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

async function fetchPublicIpViaMainProcess(): Promise<string | null> {
  try {
    const r = (await messageBridge.invoke('steam:mtx:get-public-ip')) as {
      success?: boolean
      data?: { ip?: string }
      error?: string
    }
    if (r?.success && typeof r.data?.ip === 'string' && r.data.ip.length > 0) {
      return r.data.ip
    }
  } catch {
    /* 非 Electron 或无 handler */
  }
  return null
}

/**
 * 仅使用主进程内嵌 Chromium 探测的 IP（与支付页同一网络栈）。
 * 不再在渲染进程用 fetch 兜底，避免与内嵌窗口出口不一致导致 Steam「交易授权错误」。
 */
async function fetchPublicIpForMtx(): Promise<string | null> {
  return fetchPublicIpViaMainProcess()
}

/** external 浏览器模式：用渲染进程网络栈取 IPv4（避免上报 IPv6 导致 Steam web 拒绝） */
async function fetchPublicIpv4ViaRenderer(): Promise<string | null> {
  const probes: Array<() => Promise<string>> = [
    async () => {
      const r = await fetch('https://ipv4.icanhazip.com', { signal: AbortSignal.timeout(12000) })
      return (await r.text()).trim()
    },
    async () => {
      const r = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(12000) })
      return (await r.text()).trim()
    },
    async () => {
      const r = await fetch('https://api.ipify.org?format=json', {
        signal: AbortSignal.timeout(12000)
      })
      const j = (await r.json()) as { ip?: unknown }
      return typeof j.ip === 'string' ? j.ip.trim() : ''
    }
  ]
  for (const p of probes) {
    try {
      const ip = await p()
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip
    } catch {
      /* try next */
    }
  }
  return null
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 主进程写入 lastMtxCheckoutDiagnostic；渲染进程 toast 展示（排障用） */
async function notifyMtxCheckoutDiagnosticToast(initIpUsed: string): Promise<void> {
  try {
    await sleepMs(120)
    const r = (await messageBridge.invoke('steam:mtx:get-last-checkout-diagnostic')) as {
      success?: boolean
      data?: Record<string, unknown> | null
    }
    if (!r?.success || r.data == null) return
    const d = r.data
    const parts: string[] = []
    parts.push(`InitTxn.ip=${initIpUsed}`)
    if (typeof d.expected_ip === 'string' && d.expected_ip) parts.push(`expected=${d.expected_ip}`)
    if (d.ip_before_load_url === null) parts.push('beforeLoad=null')
    else if (typeof d.ip_before_load_url === 'string' && d.ip_before_load_url)
      parts.push(`beforeLoad=${d.ip_before_load_url}`)
    if (d.ip_match === true || d.ip_match === false) parts.push(`match=${String(d.ip_match)}`)
    if (d.mode === 'external') parts.push('mode=external')
    if (typeof d.page_url === 'string' && d.page_url) parts.push(`page=${d.page_url.slice(0, 140)}`)
    if (typeof d.page_snippet === 'string' && d.page_snippet.trim()) {
      parts.push(`text=${d.page_snippet.replace(/\s+/g, ' ').slice(0, 220)}`)
    }
    if (d.fail_load && typeof d.fail_load === 'object' && d.fail_load !== null) {
      const fl = d.fail_load as { errorCode?: unknown; errorDescription?: unknown; url?: unknown }
      parts.push(
        `failLoad=${String(fl.errorCode ?? '')} ${String(fl.errorDescription ?? '').slice(0, 100)}`
      )
    }
    if (typeof d.open_error === 'string' && d.open_error) {
      parts.push(`openErr=${d.open_error.slice(0, 140)}`)
    }
    notifyInfo(parts.join(' | '), { duration: 22000, title: 'Steam MTX 支付窗诊断' })
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[MTX] checkout diagnostic', d)
    }
  } catch {
    /* ignore */
  }
}

const STEAM_APP_ID = 4359310

async function getCloudCredits(jwt: string): Promise<number> {
  const base = getMetadocCloudApiBase()
  const res = await fetch(`${base}/user/credits`, { method: 'GET', headers: { authorization: `Bearer ${jwt}` } })
  const j = (await res.json()) as { credits?: number }
  return res.ok && typeof j.credits === 'number' ? j.credits : 0
}

/**
 * Steam Inventory Item Store：打开 buyitem 页面 → Worker `/steam/store/sync` 入账。
 * 用于替代 MicroTxn web 授权（当前在你们应用下持续报“交易授权错误”）。
 */
export async function startSteamStorePurchaseAndSync(args: {
  item_id: string | number
  onPurchaseDetected?: (ctx: { item_id: string; recorded_purchases: number }) => void
}): Promise<SteamMtxInitResult> {
  const base = getMetadocCloudApiBase()
  if (!base) {
    throw new Error('VITE_METADOC_CLOUD_API_URL 未配置')
  }
  const jwt = await ensureMetadocSteamCloudJwt()
  const before = await getCloudCredits(jwt)
  let beforeRecorded = 0
  try {
    const b = await syncSteamStorePurchases()
    beforeRecorded = b.recorded_purchases
  } catch {
    beforeRecorded = 0
  }

  const url = `https://store.steampowered.com/buyitem/${STEAM_APP_ID}/${encodeURIComponent(
    String(args.item_id)
  )}/1`

  const opened = (await messageBridge.invoke('steam:mtx:open-checkout-url-external', { url })) as {
    success?: boolean
    error?: string
  }
  if (!opened?.success) {
    throw new Error(opened?.error || 'failed_to_open_store')
  }

  // Non-blocking background sync: do not keep UI disabled for long time.
  void (async () => {
    const maxAttempts = 40
    for (let i = 0; i < maxAttempts; i++) {
      await sleepMs(3000)
      try {
        const r = await syncSteamStorePurchases()
        if (r.recorded_purchases > beforeRecorded || r.credits > before) {
          args.onPurchaseDetected?.({
            item_id: String(args.item_id),
            recorded_purchases: r.recorded_purchases
          })
          const delta = Math.max(0, r.credits - before)
          if (delta > 0) {
            notifySuccess(
              i18n.global.t('setting.llmSteamCloud.mtxWebCredited', {
                n: delta,
                order: `store:${String(args.item_id)}`
              })
            )
          } else {
            notifySuccess(i18n.global.t('setting.llmSteamCloud.purchaseRecordedUseInventory'))
          }
          break
        }
      } catch {
        /* continue polling */
      }
    }
  })()

  return {
    order_id: `store:${String(args.item_id)}`,
    checkout: 'store',
    used_browser: true,
    credits_added: 0
  }
}

export async function syncSteamStorePurchases(timeRfc3339Utc?: string): Promise<{
  credits: number
  recorded_purchases: number
}> {
  const base = getMetadocCloudApiBase()
  if (!base) throw new Error('VITE_METADOC_CLOUD_API_URL 未配置')
  const jwt = await ensureMetadocSteamCloudJwt()
  const { res, json } = await fetchJsonWithTimeout(`${base}/steam/store/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt}` },
    body: JSON.stringify(timeRfc3339Utc ? { time: timeRfc3339Utc } : {})
  })
  const j = json as { ok?: boolean; credits?: number; recorded_purchases?: number; message?: string }
  if (!res.ok || j.ok !== true) throw new Error(j.message || `store sync failed (${res.status})`)
  return {
    credits: typeof j.credits === 'number' ? j.credits : 0,
    recorded_purchases: typeof j.recorded_purchases === 'number' ? j.recorded_purchases : 0
  }
}

export type SteamInventoryCard = {
  item_instance_id: string
  itemdefid: string
  quantity: number
  acquired: number | null
  label: string
  credits_on_redeem: number
}

export async function fetchSteamInventoryCards(): Promise<SteamInventoryCard[]> {
  const base = getMetadocCloudApiBase()
  if (!base) throw new Error('VITE_METADOC_CLOUD_API_URL 未配置')
  const jwt = await ensureMetadocSteamCloudJwt()
  const res = await fetch(`${base}/steam/store/inventory`, {
    method: 'GET',
    headers: { authorization: `Bearer ${jwt}` }
  })
  const j = (await res.json()) as { ok?: boolean; items?: SteamInventoryCard[]; message?: string }
  if (!res.ok || j.ok !== true) throw new Error(j.message || `inventory failed (${res.status})`)
  return Array.isArray(j.items) ? j.items : []
}

export async function redeemSteamInventoryCard(itemInstanceId: string): Promise<{
  credits_added: number
  credits: number
}> {
  const base = getMetadocCloudApiBase()
  if (!base) throw new Error('VITE_METADOC_CLOUD_API_URL 未配置')
  const jwt = await ensureMetadocSteamCloudJwt()
  const { res, json } = await fetchJsonWithTimeout(`${base}/steam/store/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ item_instance_id: itemInstanceId, quantity: 1 })
  })
  const j = json as { ok?: boolean; credits_added?: number; credits?: number; message?: string }
  if (!res.ok || j.ok !== true) throw new Error(j.message || `redeem failed (${res.status})`)
  return {
    credits_added: typeof j.credits_added === 'number' ? j.credits_added : 0,
    credits: typeof j.credits === 'number' ? j.credits : 0
  }
}

/**
 * 发起 Steam MTX：
 * 默认 **Web 结账**（`usersession=web`）：InitTxn 的 `ipaddress` 必须与打开 `steam_url` 的 Chromium 出口一致。
 * 若设置 `VITE_METADOC_STEAM_MTX_CHECKOUT=client`，则走 **客户端覆盖层**结账，不加载 Steam 网页（可绕过 checkout 页 Site Error）。
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
  const devLog = import.meta.env.DEV ? createRendererLogger('MetaDocCloudAuth') : null
  const checkoutPrefRaw = getMetadocSteamMtxCheckoutPref()
  const webOpenMode = getMetadocSteamMtxWebOpenMode()
  /**
   * Steam Review 环境下，网页结账（usersession=web）更容易触发地区网络/代理/双栈导致的授权异常。
   * 我们优先保证“可用性与可验证性”：Steam 分发包在未显式指定时默认走 client 覆盖层结账。
   */
  let checkoutPref: 'auto' | 'web' | 'client' =
    isSteamDistribution() && checkoutPrefRaw === 'auto' ? ('client' as const) : checkoutPrefRaw
  agentDebugLog('metadoc-cloud-auth.ts:startSteamMtxInit', 'mtx:start', {
    checkoutPrefRaw,
    checkoutPref,
    steamDistribution: isSteamDistribution(),
    item_id: String(body.item_id),
    amount_cents: Number(body.amount_cents),
    currency: String(body.currency || ''),
    language: String(body.language || '')
  })

  async function doClientCheckout(): Promise<SteamMtxInitResult> {
    const oe = await isSteamOverlayEnabled()
    const overlayEnabled = oe.success === true && oe.data?.enabled === true
    agentDebugLog('metadoc-cloud-auth.ts:doClientCheckout', 'overlay:enabled', {
      success: oe.success,
      enabled: overlayEnabled
    })
    if (!overlayEnabled) {
      throw new Error('steam_overlay_disabled')
    }
    const { res, json: initJson } = await fetchJsonWithTimeout(`${base}/steam/mtx/init`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${jwt}`
      },
      body: JSON.stringify({
        ...body,
        checkout: 'client'
      })
    })
    const json = initJson as {
      order_id?: string
      checkout?: 'client' | 'web'
      message?: string
      detail?: { response?: { errordesc?: string } }
    }
    if (!res.ok || !json.order_id) {
      agentDebugLog('metadoc-cloud-auth.ts:doClientCheckout', 'mtx:init_client_failed', {
        httpStatus: res.status,
        message: json.message || '',
        steamErrordesc: json.detail?.response?.errordesc || ''
      })
      if (import.meta.env.DEV) {
        devLog?.debug('[MTX init client] failed', {
          httpStatus: res.status,
          message: json.message,
          steamErrordesc: json.detail?.response?.errordesc
        })
      }
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
      /* ignore */
    }
    agentDebugLog('metadoc-cloud-auth.ts:doClientCheckout', 'mtx:init_client_ok', {
      order_id: json.order_id
    })
    return { order_id: json.order_id, checkout: 'client' }
  }

  /** 仅客户端覆盖层：不调网页、不取公网 IP */
  if (checkoutPref === 'client') {
    try {
      return await doClientCheckout()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      agentDebugLog('metadoc-cloud-auth.ts:startSteamMtxInit', 'mtx:client_checkout_failed', {
        message: msg
      })
      // Overlay 不可用：回退到 web 结账（仍可完成购买并满足 Steam 审核 GetReport 取证）。
      if (msg === 'steam_overlay_disabled') {
        agentDebugLog('metadoc-cloud-auth.ts:startSteamMtxInit', 'mtx:fallback_to_web', {})
        checkoutPref = 'web'
      } else {
        throw e
      }
    }
  }

  /**
   * 若用户明确选择 web，则不做回退；否则在 web 授权失败时回退到 client 覆盖层，
   * 以避免 Steam checkout 网页“unexpected error while authorizing”阻断审核与充值。
   */
  const allowClientFallback = checkoutPrefRaw === 'auto'

  let orderIdForPoll = ''
  let openedCheckout = false
  let lastSteamUrl = ''

  for (let attempt = 0; attempt < MTX_WEB_OPEN_MAX_ATTEMPTS; attempt++) {
    const publicIp =
      webOpenMode === 'external' ? await fetchPublicIpv4ViaRenderer() : await fetchPublicIpForMtx()
    agentDebugLog('metadoc-cloud-auth.ts:startSteamMtxInit', 'mtx:web_public_ip', {
      ok: Boolean(publicIp),
      ipKind: publicIp ? (publicIp.includes(':') ? 'v6' : 'v4') : 'none'
    })
    if (!publicIp) {
      throw new Error(MTX_ERR_NO_PUBLIC_IP)
    }

    agentDebugLog('metadoc-cloud-auth.ts:startSteamMtxInit', 'mtx:init_web_request', {
      attempt,
      checkout: checkoutPref === 'web' ? 'web' : 'auto'
    })
    let res: Response
    let initJson: unknown
    try {
      const r = await fetchJsonWithTimeout(`${base}/steam/mtx/init`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${jwt}`
        },
        body: JSON.stringify({
          ...body,
          checkout: checkoutPref === 'web' ? 'web' : 'auto',
          ip_address: publicIp
        })
      })
      res = r.res
      initJson = r.json
      agentDebugLog('metadoc-cloud-auth.ts:startSteamMtxInit', 'mtx:init_web_response', {
        httpStatus: res.status,
        ok: res.ok
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      agentDebugLog('metadoc-cloud-auth.ts:startSteamMtxInit', 'mtx:init_web_throw', {
        message: msg
      })
      throw e
    }
    const json = initJson as {
      order_id?: string
      checkout?: 'client' | 'web'
      steam_url?: string | null
      trans_id?: string | null
      message?: string
      detail?: { response?: { errordesc?: string } }
    }
    if (!res.ok || !json.order_id) {
      agentDebugLog('metadoc-cloud-auth.ts:startSteamMtxInit', 'mtx:init_web_failed', {
        httpStatus: res.status,
        message: json.message || '',
        steamErrordesc: json.detail?.response?.errordesc || ''
      })
      if (import.meta.env.DEV) {
        devLog?.debug('[MTX init] failed', {
          httpStatus: res.status,
          message: json.message,
          steamErrordesc: json.detail?.response?.errordesc
        })
      }
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

    if (checkout === 'client') {
      return { order_id: json.order_id, checkout: 'client' }
    }

    if (typeof json.steam_url !== 'string' || json.steam_url.length === 0) {
      throw new Error('MTX init ok but missing steam_url')
    }

    orderIdForPoll = json.order_id
    lastSteamUrl = json.steam_url
    agentDebugLog('metadoc-cloud-auth.ts:startSteamMtxInit', 'mtx:init_web_ok', {
      order_id: json.order_id,
      hasSteamUrl: true,
      trans_id: typeof json.trans_id === 'string' ? json.trans_id : ''
    })

    /** InitTxn 已成功：Worker / Steam 侧订单已建立；与是否弹出支付窗、是否最终入账无关 */
    notifySuccess(i18n.global.t('setting.llmSteamCloud.mtxInitOk', { order: json.order_id }))

    try {
      const opened =
        webOpenMode === 'external'
          ? ((await messageBridge.invoke('steam:mtx:open-checkout-url-external', {
              url: json.steam_url
            })) as { success?: boolean; error?: string })
          : ((await messageBridge.invoke('steam:mtx:open-checkout-url', {
              url: json.steam_url,
              expected_ip: publicIp
            })) as { success?: boolean; error?: string })

      agentDebugLog('metadoc-cloud-auth.ts:startSteamMtxInit', 'mtx:open_checkout_result', {
        success: opened?.success === true,
        error: opened?.success === true ? '' : String(opened?.error || '')
      })

      await notifyMtxCheckoutDiagnosticToast(publicIp)

      if (opened?.success === true) {
        openedCheckout = true
        break
      }

      if (opened?.error === MTX_ERR_CHECKOUT_IP_MISMATCH) {
        devLog?.debug('[MTX] checkout IP mismatch, retry InitTxn', { attempt })
        continue
      }

      if (opened?.error === MTX_ERR_CHECKOUT_LOGGED_OUT) {
        throw new Error(MTX_ERR_CHECKOUT_LOGGED_OUT)
      }

      // 这里不再自动回退到系统浏览器；由内嵌窗口承载支付页，便于排查授权错误。
      openedCheckout = true
      break
    } catch {
      // 同上：不自动打开系统浏览器
      openedCheckout = true
      break
    }
  }

  // 不再自动回退到系统浏览器（Steam 授权错误需要内嵌窗口诊断）

  const maxAttempts = 45
  let lastSteamStatus = ''
  for (let i = 0; i < maxAttempts; i++) {
    await sleepMs(2000)
    const jwtPoll = await ensureMetadocSteamCloudJwt()
    const { res: poll, json: pollJson } = await fetchJsonWithTimeout(`${base}/steam/mtx/sync-web`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${jwtPoll}`
      },
      body: JSON.stringify({ order_id: orderIdForPoll })
    })
    const pj = pollJson as {
      ok?: boolean
      completed?: boolean
      failed?: boolean
      pending?: boolean
      steam_status?: string
      credits_added?: number
      already_completed?: boolean
      message?: string
    }
    if (!poll.ok) {
      throw new Error(pj.message || `sync-web failed (${poll.status})`)
    }
    lastSteamStatus = typeof pj.steam_status === 'string' ? pj.steam_status : lastSteamStatus
    if (pj.failed === true) {
      if (allowClientFallback) {
        devLog?.warn('[MTX] web checkout declined; falling back to client checkout')
        return await doClientCheckout()
      }
      throw new Error(MTX_ERR_STEAM_DECLINED)
    }
    if (pj.pending === true && typeof pj.steam_status === 'string' && pj.steam_status.toLowerCase() === 'init') {
      // 继续轮询；最终超时时抛更明确错误
    }
    if (pj.completed === true) {
      return {
        order_id: orderIdForPoll,
        checkout: 'web',
        used_browser: true,
        credits_added: typeof pj.credits_added === 'number' ? pj.credits_added : 0
      }
    }
  }
  if (allowClientFallback) {
    devLog?.warn('[MTX] web checkout poll timeout; falling back to client checkout')
    return await doClientCheckout()
  }
  if (lastSteamStatus.toLowerCase() === 'init') {
    throw new Error(MTX_ERR_STEAM_PENDING_AUTH)
  }
  throw new Error(MTX_ERR_POLL_TIMEOUT)
}

/** 是否可在本机发起 Steam 内购：Steam 分发包，或运行时 Greenworks 已初始化且可用（无需仅依赖构建变量） */
export async function canInitSteamMtx(): Promise<boolean> {
  if (isSteamDistribution()) {
    return true
  }
  const st = await getSteamStatus()
  return st.success === true && st.data?.initialized === true && st.data?.available === true
}
