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
import { insertCreditLedger, insertUsageLedger } from './ledger'
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
import {
  fetchChatCompletionsStreaming,
  forwardChatCompletion,
  parseLastUsageFromOpenAiSse
} from './ai-proxy'
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
import { runDailyReconciliation } from './reconcile'

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

type MtxPurchaseRow = {
  item_id: string | null
  amount_cents: number | null
  currency: string | null
}

/** 将订单标为 completed 并增加用户 credits（FinalizeTxn 成功或 recovered / dev 模拟） */
async function applyMtxPurchaseCreditsCore(
  env: Env,
  steamId: string,
  orderId: string,
  row: MtxPurchaseRow,
  ledgerMeta: Record<string, unknown>
): Promise<number> {
  const grossUsd = usdGrossForMtxOrder(row.amount_cents, row.currency, row.item_id)
  const add = creditsFromUsdGross(grossUsd) + volumeBonusCreditsForItemId(row.item_id)
  await env.DB.prepare(`UPDATE mtx_orders SET status = 'completed' WHERE order_id = ?`)
    .bind(orderId)
    .run()
  await env.DB.prepare(
    `INSERT INTO users (steam_id, credits, updated_at) VALUES (?, ?, unixepoch())
     ON CONFLICT(steam_id) DO UPDATE SET credits = users.credits + excluded.credits, updated_at = unixepoch()`
  )
    .bind(steamId, add)
    .run()
  await insertCreditLedger(env, {
    steamId,
    kind: 'purchase',
    deltaCredits: add,
    meta: ledgerMeta
  })
  return add
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
    const cron = event.cron ?? ''
    if (cron === '15 2 * * *') {
      ctx.waitUntil(runDailyReconciliation(env).catch((e) => console.error('[cron reconcile]', e)))
      return
    }
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
  ctx: ExecutionContext,
  url: URL,
  c: Record<string, string>
): Promise<Response> {
  const path = url.pathname.replace(/\/$/, '') || '/'

  if (path === '/health') {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json', ...c }
    })
  }

  if (path === '/auth/steam' && req.method === 'POST') {
    return handleAuthSteam(req, env, c)
  }

  if (path === '/user/credits' && req.method === 'GET') {
    return handleUserCredits(req, env, c)
  }

  if (path === '/user/credit-ledger' && req.method === 'GET') {
    return handleCreditLedger(req, env, c)
  }

  if (path === '/user/first-purchase-claim' && req.method === 'POST') {
    return handleFirstPurchaseClaim(req, env, c)
  }

  if ((path === '/cloud/models' || path === '/v1/models') && req.method === 'GET') {
    return handleCloudModels(req, env, c)
  }

  if ((path === '/ai/chat' || path === '/v1/chat/completions') && req.method === 'POST') {
    return handleAiChat(req, env, c, ctx)
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

  if (path === '/dev/steam/mtx/simulate-complete' && req.method === 'POST') {
    return handleDevMtxSimulate(req, env, c)
  }

  if (path === '/dev/reconciliation/run' && req.method === 'POST') {
    return handleDevReconciliationRun(req, env, c)
  }

  return jsonError(404, { request_id: newRequestId(), error: 'NOT_FOUND', message: 'Not found' }, c)
}

async function handleAuthSteam(
  req: Request,
  env: Env,
  c: Record<string, string>
): Promise<Response> {
  const body = (await readJson(req)) as { steam_id?: string; ticket?: string } | null
  const devSecret = req.headers.get('X-Dev-Secret')
  const allowDev =
    env.ALLOW_DEV_AUTH === 'true' && env.DEV_AUTH_SECRET && devSecret === env.DEV_AUTH_SECRET

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
    return jsonError(
      500,
      { request_id: newRequestId(), error: 'MISCONFIG', message: 'JWT_SECRET' },
      c
    )
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
    return jsonError(
      401,
      { request_id: newRequestId(), error: 'UNAUTHORIZED', message: 'Missing Bearer token' },
      c
    )
  }
  const token = auth.slice(7).trim()
  if (!env.JWT_SECRET) {
    return jsonError(
      500,
      { request_id: newRequestId(), error: 'MISCONFIG', message: 'JWT_SECRET' },
      c
    )
  }
  const payload = await verifyJwt(env.JWT_SECRET, token)
  if (!payload) {
    return jsonError(
      401,
      { request_id: newRequestId(), error: 'UNAUTHORIZED', message: 'Invalid token' },
      c
    )
  }
  return { steamId: payload.sub }
}

async function handleUserCredits(
  req: Request,
  env: Env,
  c: Record<string, string>
): Promise<Response> {
  const u = await requireJwt(req, env, c)
  if (u instanceof Response) return u
  const credits = await getCredits(env, u.steamId)
  return new Response(JSON.stringify({ credits }), {
    headers: { 'content-type': 'application/json', ...c }
  })
}

async function handleCreditLedger(
  req: Request,
  env: Env,
  c: Record<string, string>
): Promise<Response> {
  const u = await requireJwt(req, env, c)
  if (u instanceof Response) return u

  const url = new URL(req.url)
  let fromTs: number | null = null
  let toTs: number | null = null
  const fromParam = url.searchParams.get('from')
  const toParam = url.searchParams.get('to')
  if (fromParam) {
    const n = Number(fromParam)
    if (Number.isFinite(n)) fromTs = Math.floor(n)
  }
  if (toParam) {
    const n = Number(toParam)
    if (Number.isFinite(n)) toTs = Math.floor(n)
  }

  const limitRaw = Number(url.searchParams.get('limit'))
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50))

  const cursorRaw = url.searchParams.get('cursor')
  let cursorCreated: number | null = null
  let cursorId: string | null = null
  if (cursorRaw) {
    const pipe = cursorRaw.indexOf('|')
    if (pipe > 0) {
      const ca = Number(cursorRaw.slice(0, pipe))
      const id = cursorRaw.slice(pipe + 1)
      if (Number.isFinite(ca) && id.length > 0) {
        cursorCreated = Math.floor(ca)
        cursorId = id
      }
    }
  }

  const includeSummary =
    url.searchParams.get('include_summary') === '1' || url.searchParams.get('summary') === '1'

  const hasCursor = cursorCreated !== null && cursorId !== null ? 1 : 0
  const cCa = cursorCreated ?? 0
  const cId = cursorId ?? ''

  const rows = await env.DB.prepare(
    `SELECT id, created_at, kind, delta_credits, balance_after, meta FROM credit_ledger
     WHERE steam_id = ?
     AND (? IS NULL OR created_at >= ?)
     AND (? IS NULL OR created_at <= ?)
     AND (
       ? = 0
       OR created_at < ?
       OR (created_at = ? AND id < ?)
     )
     ORDER BY created_at DESC, id DESC
     LIMIT ?`
  )
    .bind(u.steamId, fromTs, fromTs, toTs, toTs, hasCursor, cCa, cCa, cId, limit + 1)
    .all<{
      id: string
      created_at: number
      kind: string
      delta_credits: number
      balance_after: number | null
      meta: string
    }>()

  const list = rows.results ?? []
  const hasMore = list.length > limit
  const page = hasMore ? list.slice(0, limit) : list
  let next_cursor: string | undefined
  if (hasMore && page.length > 0) {
    const last = page[page.length - 1]
    next_cursor = `${last.created_at}|${last.id}`
  }

  const items = page.map((r) => {
    let meta: Record<string, unknown> = {}
    try {
      meta = JSON.parse(r.meta || '{}') as Record<string, unknown>
    } catch {
      meta = {}
    }
    return {
      id: r.id,
      created_at: r.created_at,
      kind: r.kind,
      delta_credits: r.delta_credits,
      balance_after: r.balance_after,
      meta
    }
  })

  const payload: Record<string, unknown> = { items, next_cursor }

  if (includeSummary) {
    const sumRow = await env.DB.prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN delta_credits < 0 THEN -delta_credits ELSE 0 END), 0) AS spent,
         COALESCE(SUM(CASE WHEN delta_credits > 0 THEN delta_credits ELSE 0 END), 0) AS added
       FROM credit_ledger
       WHERE steam_id = ?
       AND (? IS NULL OR created_at >= ?)
       AND (? IS NULL OR created_at <= ?)`
    )
      .bind(u.steamId, fromTs, fromTs, toTs, toTs)
      .first<{ spent: number; added: number }>()
    payload.summary = {
      credits_spent: sumRow?.spent ?? 0,
      credits_added: sumRow?.added ?? 0
    }
  }

  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json', ...c }
  })
}

async function handleCloudModels(
  req: Request,
  env: Env,
  c: Record<string, string>
): Promise<Response> {
  const auth = await requireJwt(req, env, c)
  if (auth instanceof Response) return auth
  return new Response(JSON.stringify(cloudModelsPayload()), {
    headers: { 'content-type': 'application/json', ...c }
  })
}

async function handleSteamMtxCatalog(
  req: Request,
  env: Env,
  c: Record<string, string>
): Promise<Response> {
  const auth = await requireJwt(req, env, c)
  if (auth instanceof Response) return auth
  return new Response(JSON.stringify(steamMtxCatalogPayload()), {
    headers: { 'content-type': 'application/json', ...c }
  })
}

async function handleFirstPurchaseClaim(
  req: Request,
  env: Env,
  c: Record<string, string>
): Promise<Response> {
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
      JSON.stringify({
        ok: true,
        request_id,
        already_granted: true,
        credits_added: 0,
        owns_app: true
      }),
      { headers: { 'content-type': 'application/json', ...c } }
    )
  }

  await env.DB.prepare(
    `INSERT INTO users (steam_id, credits, updated_at) VALUES (?, ?, unixepoch())
     ON CONFLICT(steam_id) DO UPDATE SET credits = users.credits + excluded.credits, updated_at = unixepoch()`
  )
    .bind(u.steamId, credits)
    .run()

  await insertCreditLedger(env, {
    steamId: u.steamId,
    kind: 'first_purchase',
    deltaCredits: credits,
    meta: { request_id }
  })

  return new Response(
    JSON.stringify({ ok: true, request_id, credits_added: credits, owns_app: true }),
    { headers: { 'content-type': 'application/json', ...c } }
  )
}

/**
 * 单路 TransformStream 透传 SSE：每个 chunk 立即下发客户端，避免 tee() 双读在 Workers 上引入额外缓冲/背压。
 * 上游结束后在 flush 中解析整段 SSE 做 commit + ledger。
 */
function createChatStreamBillingTransform(
  ctx: ExecutionContext,
  env: Env,
  options: {
    freezeId: string
    steamId: string
    est: number
    request_id: string
    modelStr: string | undefined
  }
): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder()
  let sseBuffer = ''
  const { freezeId, steamId, est, request_id, modelStr } = options
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk)
      sseBuffer += decoder.decode(chunk, { stream: true })
    },
    flush() {
      sseBuffer += decoder.decode()
      ctx.waitUntil(
        (async () => {
          try {
            let actual = est
            const usage = parseLastUsageFromOpenAiSse(sseBuffer)
            if (usage) {
              actual = actualCostFromUsageForModel(usage, modelStr)
            }
            await commitFreeze(env, steamId, freezeId, actual)
            await insertUsageLedger(env, steamId, {
              requestId: request_id,
              model: modelStr,
              actualCredits: actual,
              usage: usage
                ? {
                    prompt_tokens: usage.prompt_tokens,
                    completion_tokens: usage.completion_tokens,
                    total_tokens: usage.total_tokens
                  }
                : undefined,
              scenario: 'chat_stream'
            })
          } catch {
            await releaseFreeze(env, steamId, freezeId)
          }
        })()
      )
    }
  })
}

async function handleAiChat(
  req: Request,
  env: Env,
  c: Record<string, string>,
  ctx: ExecutionContext
): Promise<Response> {
  const request_id = newRequestId()
  const u = await requireJwt(req, env, c)
  if (u instanceof Response) return u

  const body = await readJson(req)
  if (!body || typeof body !== 'object') {
    return jsonError(400, { request_id, error: 'BAD_REQUEST', message: 'JSON body required' }, c)
  }

  const payload = body as Record<string, unknown>
  const wantsStream = payload.stream === true
  const modelStr = typeof payload.model === 'string' ? payload.model : undefined

  const est = estimateFreezeForRequest(payload)
  const freezeId = crypto.randomUUID()
  const fr = await freezeCredits(env, u.steamId, freezeId, est)
  if (!fr.ok) {
    return jsonError(
      402,
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
    return jsonError(
      500,
      { request_id, error: 'MISCONFIG', message: 'N1N_API_KEY or OPENAI_API_KEY' },
      c
    )
  }

  if (wantsStream) {
    try {
      const upstream = await fetchChatCompletionsStreaming(env, payload)
      if (!upstream.ok) {
        await releaseFreeze(env, u.steamId, freezeId)
        const errText = await upstream.text()
        let detail: Record<string, unknown> = { status: upstream.status }
        try {
          detail.raw = JSON.parse(errText)
        } catch {
          detail.body = errText.slice(0, 500)
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
      if (!upstream.body) {
        await releaseFreeze(env, u.steamId, freezeId)
        return jsonError(
          502,
          { request_id, error: 'UPSTREAM_ERROR', message: 'Empty upstream body' },
          c
        )
      }

      const passthrough = createChatStreamBillingTransform(ctx, env, {
        freezeId,
        steamId: u.steamId,
        est,
        request_id,
        modelStr
      })
      const piped = upstream.body.pipeThrough(passthrough)

      return new Response(piped, {
        status: upstream.status,
        headers: {
          'content-type':
            upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-store, no-transform',
          'x-accel-buffering': 'no',
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

  const nonStreamPayload = { ...payload }
  if (nonStreamPayload.stream === true) {
    nonStreamPayload.stream = false
  }

  try {
    const { response: upstream, usage } = await forwardChatCompletion(env, nonStreamPayload)
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
        /* keep est */
      }
    }

    await commitFreeze(env, u.steamId, freezeId, actual)

    const usageForLedger =
      usage ??
      (() => {
        try {
          const parsed = JSON.parse(text) as {
            usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number }
          }
          return parsed.usage
        } catch {
          return undefined
        }
      })()
    await insertUsageLedger(env, u.steamId, {
      requestId: request_id,
      model: modelStr,
      actualCredits: actual,
      usage: usageForLedger
        ? {
            prompt_tokens: usageForLedger.prompt_tokens,
            completion_tokens: usageForLedger.completion_tokens,
            total_tokens: usageForLedger.total_tokens
          }
        : undefined,
      scenario: 'chat'
    })

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
    return jsonError(
      400,
      { request_id: newRequestId(), error: 'BAD_REQUEST', message: 'Invalid item' },
      c
    )
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

  const steamResult = (data as { response?: { result?: string; errordesc?: string } }).response
  if (mtxOk(data)) {
    console.log(
      JSON.stringify({
        tag: 'mtx_init_ok',
        order_id: orderId,
        checkout: checkoutMode,
        steam_result: steamResult?.result ?? 'unknown',
        has_steam_url: Boolean(mtxInitSteamUrl(data))
      })
    )
  } else {
    console.log(
      JSON.stringify({
        tag: 'mtx_init_failed',
        order_id: orderId,
        checkout: checkoutMode,
        steam_result: steamResult?.result ?? 'unknown',
        errordesc:
          typeof steamResult?.errordesc === 'string'
            ? steamResult.errordesc.slice(0, 200)
            : undefined
      })
    )
  }

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
    return jsonError(
      403,
      { request_id: newRequestId(), error: 'FORBIDDEN', message: 'Order mismatch' },
      c
    )
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

  const add = await applyMtxPurchaseCreditsCore(env, steamId, orderId, row, {
    order_id: orderId,
    item_id: row.item_id ?? null,
    finalize: 'txn'
  })

  return new Response(
    JSON.stringify({ ok: true, completed: true, credits_added: add, steam_response: data }),
    {
      headers: { 'content-type': 'application/json', ...c }
    }
  )
}

async function handleMtxSyncWeb(
  req: Request,
  env: Env,
  c: Record<string, string>
): Promise<Response> {
  const u = await requireJwt(req, env, c)
  if (u instanceof Response) return u

  const body = (await readJson(req)) as { order_id?: string } | null
  const orderId = body?.order_id ? String(body.order_id) : ''
  if (!orderId) {
    return jsonError(
      400,
      { request_id: newRequestId(), error: 'BAD_REQUEST', message: 'order_id required' },
      c
    )
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
    return jsonError(
      403,
      { request_id: newRequestId(), error: 'FORBIDDEN', message: 'Order mismatch' },
      c
    )
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
    const add = await applyMtxPurchaseCreditsCore(env, u.steamId, orderId, row, {
      order_id: orderId,
      item_id: row.item_id ?? null,
      recovered: true
    })
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

async function handleMtxFinalize(
  req: Request,
  env: Env,
  c: Record<string, string>
): Promise<Response> {
  const u = await requireJwt(req, env, c)
  if (u instanceof Response) return u

  const body = (await readJson(req)) as { order_id?: string; authorized?: boolean } | null
  const orderId = body?.order_id ? String(body.order_id) : ''
  if (!orderId || body?.authorized !== true) {
    return jsonError(
      400,
      { request_id: newRequestId(), error: 'BAD_REQUEST', message: 'order_id and authorized' },
      c
    )
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
    return jsonError(
      403,
      { request_id: newRequestId(), error: 'FORBIDDEN', message: 'Order mismatch' },
      c
    )
  }

  return finalizeMtxOrderAndGrantCredits(env, u.steamId, orderId, c)
}

/** DEV：跳过 Steam FinalizeTxn，对已 init 订单按定价入账（需 ALLOW_DEV_AUTH + X-Dev-Secret） */
async function handleDevMtxSimulate(
  req: Request,
  env: Env,
  c: Record<string, string>
): Promise<Response> {
  const devSecret = req.headers.get('X-Dev-Secret')
  const allowDev =
    env.ALLOW_DEV_AUTH === 'true' && env.DEV_AUTH_SECRET && devSecret === env.DEV_AUTH_SECRET
  if (!allowDev) {
    return jsonError(
      403,
      {
        request_id: newRequestId(),
        error: 'FORBIDDEN',
        message: 'Dev simulate requires ALLOW_DEV_AUTH'
      },
      c
    )
  }

  const u = await requireJwt(req, env, c)
  if (u instanceof Response) return u

  const body = (await readJson(req)) as { order_id?: string } | null
  const orderId = body?.order_id ? String(body.order_id) : ''
  if (!orderId) {
    return jsonError(
      400,
      { request_id: newRequestId(), error: 'BAD_REQUEST', message: 'order_id required' },
      c
    )
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
    return jsonError(
      403,
      { request_id: newRequestId(), error: 'FORBIDDEN', message: 'Order mismatch' },
      c
    )
  }
  if (row.status === 'completed') {
    return new Response(JSON.stringify({ ok: true, already_completed: true, credits_added: 0 }), {
      headers: { 'content-type': 'application/json', ...c }
    })
  }
  if (row.status !== 'init') {
    return jsonError(
      400,
      {
        request_id: newRequestId(),
        error: 'BAD_REQUEST',
        message: `Order status is ${row.status}, expected init`
      },
      c
    )
  }

  const add = await applyMtxPurchaseCreditsCore(env, u.steamId, orderId, row, {
    order_id: orderId,
    item_id: row.item_id ?? null,
    finalize: 'dev_simulate'
  })

  return new Response(
    JSON.stringify({ ok: true, completed: true, credits_added: add, dev_simulate: true }),
    { headers: { 'content-type': 'application/json', ...c } }
  )
}

/** DEV：手动跑一轮「每日对账」（与定时任务相同逻辑，会发 Brevo 邮件并写 reconciliation_runs） */
async function handleDevReconciliationRun(
  req: Request,
  env: Env,
  c: Record<string, string>
): Promise<Response> {
  const devSecret = req.headers.get('X-Dev-Secret')
  const allowDev =
    env.ALLOW_DEV_AUTH === 'true' && env.DEV_AUTH_SECRET && devSecret === env.DEV_AUTH_SECRET
  if (!allowDev) {
    return jsonError(
      403,
      {
        request_id: newRequestId(),
        error: 'FORBIDDEN',
        message: 'Dev reconciliation requires ALLOW_DEV_AUTH and matching X-Dev-Secret'
      },
      c
    )
  }
  try {
    const outcome = await runDailyReconciliation(env)
    return new Response(JSON.stringify({ ok: true, ...outcome }), {
      headers: { 'content-type': 'application/json', ...c }
    })
  } catch (e) {
    return jsonError(
      500,
      {
        request_id: newRequestId(),
        error: 'INTERNAL',
        message: e instanceof Error ? e.message : String(e)
      },
      c
    )
  }
}
