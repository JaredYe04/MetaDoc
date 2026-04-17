import type { Env } from './types'
import { signJwt, verifyJwt } from './jwt'
import { jsonError, newRequestId } from './errors'
import {
  commitFreeze,
  estimateFreezeForRequest,
  freezeCredits,
  getCredits,
  releaseFreeze
} from './billing'
import {
  actualCostFromUsageForModel,
  cloudModelsPayload,
  creditsFromUsdGross,
  firstPurchaseCreditsGrant,
  getSteamMtxItemById,
  steamMtxCatalogPayload,
  usdGrossForMtxOrder,
  volumeBonusCreditsForItemId
} from './pricing-helpers'
import { forwardChatCompletion } from './ai-proxy'
import {
  authenticateSteamTicket,
  checkAppOwnership,
  finalizeTxn,
  getReport,
  initTxn,
  mtxInitSteamUrl,
  mtxInitTransId,
  mtxQueryOrderStatus,
  newSteamMtxOrderId,
  queryTxn,
  type MtxCheckoutSession
} from './steam'

function hasUpstreamAiKey(env: Env): boolean {
  return Boolean(env.N1N_API_KEY || env.OPENAI_API_KEY)
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'access-control-allow-origin': origin || '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization, X-Dev-Secret',
    'access-control-max-age': '86400'
  }
}

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

function mtxOk(data: Record<string, unknown>): boolean {
  const r = data as { response?: { result?: string } }
  if (r.response?.result === 'OK' || r.response?.result === 'Success') return true
  const top = data as { result?: string }
  return top.result === 'OK'
}

function mtxInitErrorMessage(data: Record<string, unknown>): string {
  const r = data as { response?: { errordesc?: string; result?: string } }
  const desc = r.response?.errordesc
  if (typeof desc === 'string' && desc.trim().length > 0) {
    return `Steam InitTxn failed: ${desc.trim()}`
  }
  return 'Steam InitTxn failed'
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url)
    const origin = req.headers.get('Origin')
    const c = corsHeaders(origin)

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: c })
    }

    try {
      return await handle(req, env, ctx, url, c)
    } catch (e) {
      const request_id = newRequestId()
      const message = e instanceof Error ? e.message : String(e)
      return jsonError(500, { request_id, error: 'INTERNAL', message }, c)
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runGetReportCron(env))
  }
}

async function runGetReportCron(env: Env): Promise<void> {
  try {
    const data = await getReport(env, 'GAMESALES')
    const str = JSON.stringify(data).slice(0, 8000)
    console.log('[cron GetReport]', str)
    // 生产：解析 status=Refunded 等并 claw-back credits（按 order_id 查 mtx_orders）
  } catch (e) {
    console.error('[cron GetReport] failed', e)
  }
}

async function handle(
  req: Request,
  env: Env,
  _ctx: ExecutionContext,
  url: URL,
  c: Record<string, string>
): Promise<Response> {
  const path = url.pathname.replace(/\/$/, '') || '/'

  if (path === '/health') {
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', ...c } })
  }

  if (path === '/auth/steam' && req.method === 'POST') {
    return handleAuthSteam(req, env, c)
  }

  if (path === '/user/credits' && req.method === 'GET') {
    return handleUserCredits(req, env, c)
  }

  if (path === '/user/first-purchase-claim' && req.method === 'POST') {
    return handleFirstPurchaseClaim(req, env, c)
  }

  if ((path === '/cloud/models' || path === '/v1/models') && req.method === 'GET') {
    return handleCloudModels(req, env, c)
  }

  if ((path === '/ai/chat' || path === '/v1/chat/completions') && req.method === 'POST') {
    return handleAiChat(req, env, c)
  }

  if (path === '/steam/mtx/catalog' && req.method === 'GET') {
    return handleSteamMtxCatalog(req, env, c)
  }

  if (path === '/steam/mtx/init' && req.method === 'POST') {
    return handleMtxInit(req, env, c)
  }

  if (path === '/steam/mtx/finalize' && req.method === 'POST') {
    return handleMtxFinalize(req, env, c)
  }

  if (path === '/steam/mtx/sync-web' && req.method === 'POST') {
    return handleMtxSyncWeb(req, env, c)
  }

  return jsonError(404, { request_id: newRequestId(), error: 'NOT_FOUND', message: 'Not found' }, c)
}

async function handleAuthSteam(req: Request, env: Env, c: Record<string, string>): Promise<Response> {
  const body = (await readJson(req)) as { steam_id?: string; ticket?: string } | null
  const devSecret = req.headers.get('X-Dev-Secret')
  const allowDev = env.ALLOW_DEV_AUTH === 'true' && env.DEV_AUTH_SECRET && devSecret === env.DEV_AUTH_SECRET

  let steamId: string | undefined
  if (allowDev && body?.steam_id) {
    steamId = String(body.steam_id)
  } else if (body?.ticket && body?.steam_id) {
    const auth = await authenticateSteamTicket(env, String(body.ticket).trim())
    if (!auth.ok) {
      const a = auth as { reason: string; diagnostic?: string }
      if (a.diagnostic) {
        return jsonError(
          401,
          {
            request_id: newRequestId(),
            error: 'STEAM_AUTH_FAILED',
            message: a.diagnostic
          },
          c
        )
      }
      const hint =
        a.reason === 'server_misconfigured'
          ? 'Worker missing STEAM_WEB_API_KEY or STEAM_APP_ID'
          : a.reason.startsWith('steam_api_error')
            ? `Steam API: ${a.reason.replace(/^steam_api_error_/, '')}`
            : a.reason.startsWith('steam_ticket_result')
              ? `Steam ticket: ${a.reason.replace(/^steam_ticket_result:/, '')}`
              : `Steam auth failed (${a.reason})`
      return jsonError(
        401,
        {
          request_id: newRequestId(),
          error: 'STEAM_AUTH_FAILED',
          message: hint
        },
        c
      )
    }
    if (auth.steamId !== String(body.steam_id)) {
      return jsonError(
        401,
        {
          request_id: newRequestId(),
          error: 'STEAM_ID_MISMATCH',
          message: 'steam_id does not match ticket'
        },
        c
      )
    }
    steamId = auth.steamId
  } else {
    return jsonError(
      400,
      {
        request_id: newRequestId(),
        error: 'BAD_REQUEST',
        message: 'steam_id and ticket required (or dev auth)'
      },
      c
    )
  }

  if (!env.JWT_SECRET) {
    return jsonError(500, { request_id: newRequestId(), error: 'MISCONFIG', message: 'JWT_SECRET' }, c)
  }

  const token = await signJwt(env.JWT_SECRET, { sub: steamId! }, 3600)
  return new Response(JSON.stringify({ token, expires_in: 3600 }), {
    headers: { 'content-type': 'application/json', ...c }
  })
}

async function requireJwt(
  req: Request,
  env: Env,
  c: Record<string, string>
): Promise<{ steamId: string } | Response> {
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return jsonError(401, { request_id: newRequestId(), error: 'UNAUTHORIZED', message: 'Missing Bearer token' }, c)
  }
  const token = auth.slice(7).trim()
  if (!env.JWT_SECRET) {
    return jsonError(500, { request_id: newRequestId(), error: 'MISCONFIG', message: 'JWT_SECRET' }, c)
  }
  const payload = await verifyJwt(env.JWT_SECRET, token)
  if (!payload) {
    return jsonError(401, { request_id: newRequestId(), error: 'UNAUTHORIZED', message: 'Invalid token' }, c)
  }
  return { steamId: payload.sub }
}

async function handleUserCredits(req: Request, env: Env, c: Record<string, string>): Promise<Response> {
  const u = await requireJwt(req, env, c)
  if (u instanceof Response) return u
  const credits = await getCredits(env, u.steamId)
  return new Response(JSON.stringify({ credits }), { headers: { 'content-type': 'application/json', ...c } })
}

async function handleCloudModels(req: Request, env: Env, c: Record<string, string>): Promise<Response> {
  const auth = await requireJwt(req, env, c)
  if (auth instanceof Response) return auth
  return new Response(JSON.stringify(cloudModelsPayload()), {
    headers: { 'content-type': 'application/json', ...c }
  })
}

async function handleSteamMtxCatalog(req: Request, env: Env, c: Record<string, string>): Promise<Response> {
  const auth = await requireJwt(req, env, c)
  if (auth instanceof Response) return auth
  return new Response(JSON.stringify(steamMtxCatalogPayload()), {
    headers: { 'content-type': 'application/json', ...c }
  })
}

async function handleFirstPurchaseClaim(req: Request, env: Env, c: Record<string, string>): Promise<Response> {
  const request_id = newRequestId()
  const u = await requireJwt(req, env, c)
  if (u instanceof Response) return u

  const own = await checkAppOwnership(env, u.steamId)
  if (!own.ok) {
    return jsonError(502, { request_id, error: 'OWNERSHIP_CHECK_FAILED', message: own.reason }, c)
  }
  if (!own.owns) {
    return new Response(
      JSON.stringify({ ok: true, request_id, owns_app: false, credits_added: 0 }),
      { headers: { 'content-type': 'application/json', ...c } }
    )
  }

  const credits = firstPurchaseCreditsGrant()
  if (credits <= 0) {
    return jsonError(500, { request_id, error: 'MISCONFIG', message: 'first purchase credits' }, c)
  }

  const ins = await env.DB.prepare(
    `INSERT OR IGNORE INTO first_purchase_grants (steam_id, credits, created_at) VALUES (?, ?, unixepoch())`
  )
    .bind(u.steamId, credits)
    .run()

  if (ins.meta.changes === 0) {
    return new Response(
      JSON.stringify({ ok: true, request_id, already_granted: true, credits_added: 0, owns_app: true }),
      { headers: { 'content-type': 'application/json', ...c } }
    )
  }

  await env.DB.prepare(
    `INSERT INTO users (steam_id, credits, updated_at) VALUES (?, ?, unixepoch())
     ON CONFLICT(steam_id) DO UPDATE SET credits = users.credits + excluded.credits, updated_at = unixepoch()`
  )
    .bind(u.steamId, credits)
    .run()

  return new Response(
    JSON.stringify({ ok: true, request_id, credits_added: credits, owns_app: true }),
    { headers: { 'content-type': 'application/json', ...c } }
  )
}

async function handleAiChat(req: Request, env: Env, c: Record<string, string>): Promise<Response> {
  const request_id = newRequestId()
  const u = await requireJwt(req, env, c)
  if (u instanceof Response) return u

  const body = await readJson(req)
  if (!body || typeof body !== 'object') {
    return jsonError(400, { request_id, error: 'BAD_REQUEST', message: 'JSON body required' }, c)
  }

  const payload = body as Record<string, unknown>
  if (payload.stream === true) {
    payload.stream = false
  }

  const est = estimateFreezeForRequest(payload)
  const freezeId = crypto.randomUUID()
  const fr = await freezeCredits(env, u.steamId, freezeId, est)
  if (!fr.ok) {
    return jsonError(
      403,
      {
        request_id,
        error: 'INSUFFICIENT_CREDITS',
        message: 'Not enough credits',
        detail: { required: est, available: await getCredits(env, u.steamId) }
      },
      c
    )
  }

  if (!hasUpstreamAiKey(env)) {
    await releaseFreeze(env, u.steamId, freezeId)
    return jsonError(500, { request_id, error: 'MISCONFIG', message: 'N1N_API_KEY or OPENAI_API_KEY' }, c)
  }

  try {
    const { response: upstream, usage } = await forwardChatCompletion(env, payload)
    const text = await upstream.text()
    if (!upstream.ok) {
      await releaseFreeze(env, u.steamId, freezeId)
      let detail: Record<string, unknown> = { status: upstream.status }
      try {
        detail.raw = JSON.parse(text)
      } catch {
        detail.body = text.slice(0, 500)
      }
      return jsonError(
        upstream.status >= 500 ? 502 : 502,
        {
          request_id,
          error: 'UPSTREAM_ERROR',
          message: 'AI provider error',
          detail
        },
        c
      )
    }

    const modelStr = typeof payload.model === 'string' ? payload.model : undefined
    let actual = est
    if (usage) {
      actual = actualCostFromUsageForModel(usage, modelStr)
    } else {
      try {
        const parsed = JSON.parse(text) as {
          usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number }
        }
        if (parsed.usage) actual = actualCostFromUsageForModel(parsed.usage, modelStr)
      } catch {
        /* stream response — keep est as cost */
      }
    }

    await commitFreeze(env, u.steamId, freezeId, actual)

    return new Response(text, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/json',
        'x-request-id': request_id,
        ...c
      }
    })
  } catch (e) {
    await releaseFreeze(env, u.steamId, freezeId)
    return jsonError(
      502,
      {
        request_id,
        error: 'UPSTREAM_ERROR',
        message: e instanceof Error ? e.message : String(e)
      },
      c
    )
  }
}

async function handleMtxInit(req: Request, env: Env, c: Record<string, string>): Promise<Response> {
  const u = await requireJwt(req, env, c)
  if (u instanceof Response) return u

  const body = (await readJson(req)) as {
    item_id?: string | number
    language?: string
    currency?: string
    amount_cents?: number
    description?: string
    checkout?: 'client' | 'web' | 'auto'
    ip_address?: string
  } | null

  const itemKey = String(body?.item_id ?? '')
  const item = getSteamMtxItemById(itemKey)
  if (!item || !item.listed || !body?.amount_cents) {
    return jsonError(400, { request_id: newRequestId(), error: 'BAD_REQUEST', message: 'Invalid item' }, c)
  }

  /**
   * Web 结账：Steam 要求 InitTxn 的 ipaddress 与**打开 steam_url 的浏览器出口 IP** 一致。
   * 仅用 Cloudflare 的 cf-connecting-ip 常会与浏览器真实 IP 不一致，导致网页提示「交易授权错误」。
   */
  const explicitIp = typeof body?.ip_address === 'string' ? body.ip_address.trim() : ''
  let checkoutMode: MtxCheckoutSession
  if (body?.checkout === 'client') {
    checkoutMode = 'client'
  } else if (body?.checkout === 'web') {
    checkoutMode = 'web'
  } else {
    checkoutMode = explicitIp ? 'web' : 'client'
  }

  if (checkoutMode === 'web' && !explicitIp) {
    return jsonError(
      400,
      {
        request_id: newRequestId(),
        error: 'BAD_REQUEST',
        message:
          'Web checkout requires ip_address from the client (browser egress IP). Do not rely on server-inferred IP alone.'
      },
      c
    )
  }

  const orderId = newSteamMtxOrderId()
  const data = await initTxn(env, {
    orderId,
    steamId: u.steamId,
    itemId: Number(itemKey),
    itemCount: 1,
    amountCents: Number(body.amount_cents),
    language: body.language || 'en',
    currency: body.currency || 'USD',
    description: body.description || item.label,
    userSession: checkoutMode,
    ipAddress: checkoutMode === 'web' ? explicitIp : undefined
  })

  if (!mtxOk(data)) {
    return jsonError(
      502,
      {
        request_id: newRequestId(),
        error: 'MTX_INIT_FAILED',
        message: mtxInitErrorMessage(data),
        detail: data as Record<string, unknown>
      },
      c
    )
  }

  const cur = (body.currency || 'USD').toUpperCase()
  await env.DB.prepare(
    `INSERT INTO mtx_orders (order_id, steam_id, item_id, status, amount_cents, currency, created_at) VALUES (?, ?, ?, 'init', ?, ?, unixepoch())`
  )
    .bind(orderId, u.steamId, itemKey, body.amount_cents, cur)
    .run()

  return new Response(
    JSON.stringify({
      order_id: orderId,
      checkout: checkoutMode,
      steam_url: checkoutMode === 'web' ? mtxInitSteamUrl(data) : null,
      trans_id: mtxInitTransId(data),
      steam_response: data
    }),
    {
      headers: { 'content-type': 'application/json', ...c }
    }
  )
}

async function finalizeMtxOrderAndGrantCredits(
  env: Env,
  steamId: string,
  orderId: string,
  c: Record<string, string>
): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT steam_id, item_id, amount_cents, currency FROM mtx_orders WHERE order_id = ?`
  )
    .bind(orderId)
    .first<{
      steam_id: string
      item_id: string | null
      amount_cents: number | null
      currency: string | null
    }>()
  if (!row || row.steam_id !== steamId) {
    return jsonError(403, { request_id: newRequestId(), error: 'FORBIDDEN', message: 'Order mismatch' }, c)
  }

  const data = await finalizeTxn(env, orderId)
  if (!mtxOk(data)) {
    return jsonError(
      502,
      {
        request_id: newRequestId(),
        error: 'MTX_FINALIZE_FAILED',
        message: 'FinalizeTxn failed',
        detail: data as Record<string, unknown>
      },
      c
    )
  }

  const grossUsd = usdGrossForMtxOrder(row.amount_cents, row.currency, row.item_id)
  const add = creditsFromUsdGross(grossUsd) + volumeBonusCreditsForItemId(row.item_id)
  await env.DB.prepare(`UPDATE mtx_orders SET status = 'completed' WHERE order_id = ?`).bind(orderId).run()
  await env.DB.prepare(
    `INSERT INTO users (steam_id, credits, updated_at) VALUES (?, ?, unixepoch())
     ON CONFLICT(steam_id) DO UPDATE SET credits = users.credits + excluded.credits, updated_at = unixepoch()`
  )
    .bind(steamId, add)
    .run()

  return new Response(
    JSON.stringify({ ok: true, completed: true, credits_added: add, steam_response: data }),
    {
      headers: { 'content-type': 'application/json', ...c }
    }
  )
}

async function handleMtxSyncWeb(req: Request, env: Env, c: Record<string, string>): Promise<Response> {
  const u = await requireJwt(req, env, c)
  if (u instanceof Response) return u

  const body = (await readJson(req)) as { order_id?: string } | null
  const orderId = body?.order_id ? String(body.order_id) : ''
  if (!orderId) {
    return jsonError(400, { request_id: newRequestId(), error: 'BAD_REQUEST', message: 'order_id required' }, c)
  }

  const row = await env.DB.prepare(
    `SELECT steam_id, item_id, amount_cents, currency, status FROM mtx_orders WHERE order_id = ?`
  )
    .bind(orderId)
    .first<{
      steam_id: string
      item_id: string | null
      amount_cents: number | null
      currency: string | null
      status: string | null
    }>()
  if (!row || row.steam_id !== u.steamId) {
    return jsonError(403, { request_id: newRequestId(), error: 'FORBIDDEN', message: 'Order mismatch' }, c)
  }
  if (row.status === 'completed') {
    return new Response(
      JSON.stringify({ ok: true, completed: true, already_completed: true, credits_added: 0 }),
      { headers: { 'content-type': 'application/json', ...c } }
    )
  }

  const q = await queryTxn(env, orderId)
  if (!mtxOk(q)) {
    return jsonError(
      502,
      {
        request_id: newRequestId(),
        error: 'QUERY_TXN_FAILED',
        message: 'QueryTxn failed',
        detail: q as Record<string, unknown>
      },
      c
    )
  }

  const raw = mtxQueryOrderStatus(q)
  const norm = (raw ?? '').toLowerCase()

  if (norm === 'init') {
    return new Response(
      JSON.stringify({ ok: true, completed: false, steam_status: raw, pending: true }),
      { headers: { 'content-type': 'application/json', ...c } }
    )
  }

  if (norm === 'failed' || norm.includes('denied') || norm.includes('fail')) {
    return new Response(
      JSON.stringify({
        ok: true,
        completed: false,
        failed: true,
        steam_status: raw,
        pending: false
      }),
      { headers: { 'content-type': 'application/json', ...c } }
    )
  }

  if (norm === 'approved') {
    return finalizeMtxOrderAndGrantCredits(env, u.steamId, orderId, c)
  }

  if (norm === 'succeeded') {
    const grossUsd = usdGrossForMtxOrder(row.amount_cents, row.currency, row.item_id)
    const add = creditsFromUsdGross(grossUsd) + volumeBonusCreditsForItemId(row.item_id)
    await env.DB.prepare(`UPDATE mtx_orders SET status = 'completed' WHERE order_id = ?`).bind(orderId).run()
    await env.DB.prepare(
      `INSERT INTO users (steam_id, credits, updated_at) VALUES (?, ?, unixepoch())
       ON CONFLICT(steam_id) DO UPDATE SET credits = users.credits + excluded.credits, updated_at = unixepoch()`
    )
      .bind(u.steamId, add)
      .run()
    return new Response(
      JSON.stringify({ ok: true, completed: true, credits_added: add, recovered: true }),
      { headers: { 'content-type': 'application/json', ...c } }
    )
  }

  return new Response(
    JSON.stringify({ ok: true, completed: false, steam_status: raw, pending: true }),
    { headers: { 'content-type': 'application/json', ...c } }
  )
}

async function handleMtxFinalize(req: Request, env: Env, c: Record<string, string>): Promise<Response> {
  const u = await requireJwt(req, env, c)
  if (u instanceof Response) return u

  const body = (await readJson(req)) as { order_id?: string; authorized?: boolean } | null
  const orderId = body?.order_id ? String(body.order_id) : ''
  if (!orderId || body?.authorized !== true) {
    return jsonError(400, { request_id: newRequestId(), error: 'BAD_REQUEST', message: 'order_id and authorized' }, c)
  }

  const row = await env.DB.prepare(
    `SELECT steam_id, item_id, amount_cents, currency FROM mtx_orders WHERE order_id = ?`
  )
    .bind(orderId)
    .first<{
      steam_id: string
      item_id: string | null
      amount_cents: number | null
      currency: string | null
    }>()
  if (!row || row.steam_id !== u.steamId) {
    return jsonError(403, { request_id: newRequestId(), error: 'FORBIDDEN', message: 'Order mismatch' }, c)
  }

  return finalizeMtxOrderAndGrantCredits(env, u.steamId, orderId, c)
}
