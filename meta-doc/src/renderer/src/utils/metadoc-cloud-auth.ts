/**
 * Steam 构建：使用 Steam 会话票据向 Worker 换取 JWT，供 MetaDoc 官方云 LLM 使用。
 */
import messageBridge from '../bridge/message-bridge'
import eventBus from './event-bus.js'
import { i18n } from '../i18n.js'
import { createRendererLogger } from './logger.ts'
import { notifySuccess } from './notify'
import { getSteamStatus, getSteamUser } from '../services/steam-client'
import {
  getMetadocCloudApiBase,
  getMetadocSteamMtxCheckoutPref,
  isSteamDistribution
} from '@common/build-env'
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
export const MTX_ERR_NO_PUBLIC_IP = 'MTX_ERR_NO_PUBLIC_IP'
/** 主进程在 loadURL(steam_url) 前发现出口 IP 与 InitTxn 不一致；渲染进程会重试 InitTxn */
export const MTX_ERR_CHECKOUT_IP_MISMATCH = 'mtx_ip_mismatch'

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

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
  const checkoutPref = getMetadocSteamMtxCheckoutPref()

  /** 仅客户端覆盖层：不调网页、不取公网 IP */
  if (checkoutPref === 'client') {
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
    return { order_id: json.order_id, checkout: 'client' }
  }

  let orderIdForPoll = ''
  let openedCheckout = false
  let lastSteamUrl = ''

  for (let attempt = 0; attempt < MTX_WEB_OPEN_MAX_ATTEMPTS; attempt++) {
    const publicIp = await fetchPublicIpForMtx()
    if (!publicIp) {
      throw new Error(MTX_ERR_NO_PUBLIC_IP)
    }

    const { res, json: initJson } = await fetchJsonWithTimeout(`${base}/steam/mtx/init`, {
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
    const json = initJson as {
      order_id?: string
      checkout?: 'client' | 'web'
      steam_url?: string | null
      message?: string
      detail?: { response?: { errordesc?: string } }
    }
    if (!res.ok || !json.order_id) {
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

    /** InitTxn 已成功：Worker / Steam 侧订单已建立；与是否弹出支付窗、是否最终入账无关 */
    notifySuccess(i18n.global.t('setting.llmSteamCloud.mtxInitOk', { order: json.order_id }))

    try {
      const opened = (await messageBridge.invoke('steam:mtx:open-checkout-url', {
        url: json.steam_url,
        expected_ip: publicIp
      })) as { success?: boolean; error?: string }

      if (opened?.success === true) {
        openedCheckout = true
        break
      }

      if (opened?.error === MTX_ERR_CHECKOUT_IP_MISMATCH) {
        devLog?.debug('[MTX] checkout IP mismatch, retry InitTxn', { attempt })
        continue
      }

      eventBus.emit('open-link', json.steam_url)
      openedCheckout = true
      break
    } catch {
      eventBus.emit('open-link', json.steam_url)
      openedCheckout = true
      break
    }
  }

  if (!openedCheckout && lastSteamUrl.length > 0) {
    devLog?.warn('[MTX] opening embedded checkout failed after retries, falling back to system browser')
    eventBus.emit('open-link', lastSteamUrl)
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
      body: JSON.stringify({ order_id: orderIdForPoll })
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
        order_id: orderIdForPoll,
        checkout: 'web',
        used_browser: true,
        credits_added: typeof pj.credits_added === 'number' ? pj.credits_added : 0
      }
    }
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
