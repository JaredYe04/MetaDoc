import type { Env } from './types'
import { getReport, rfc3339UtcFromUnixSeconds } from './steam'
import { newRequestId } from './errors'
import { sendBrevoTransactionalEmail, RECONCILE_EMAIL_TO } from './brevo'

function isoDayUtc(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function isoSecondUtc(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** 从 D1 汇总「昨日」完成的 MTX 订单（UTC 日界） */
export async function summarizeD1MtxCompleted(
  env: Env,
  startUnix: number,
  endUnix: number
): Promise<{ order_count: number; total_amount_cents: number }> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) as c, COALESCE(SUM(amount_cents), 0) as sum_c
     FROM mtx_orders
     WHERE status = 'completed'
       AND created_at >= ?
       AND created_at < ?`
  )
    .bind(startUnix, endUnix)
    .first<{ c: number; sum_c: number }>()
  return {
    order_count: Number(row?.c ?? 0),
    total_amount_cents: Number(row?.sum_c ?? 0)
  }
}

/** 从 D1 汇总同期 purchase 类 credits 入账笔数与增量合计 */
export async function summarizeD1PurchaseLedger(
  env: Env,
  startUnix: number,
  endUnix: number
): Promise<{ row_count: number; total_delta_credits: number }> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) as c, COALESCE(SUM(delta_credits), 0) as sum_d
     FROM credit_ledger
     WHERE kind = 'purchase'
       AND created_at >= ?
       AND created_at < ?`
  )
    .bind(startUnix, endUnix)
    .first<{ c: number; sum_d: number }>()
  return {
    row_count: Number(row?.c ?? 0),
    total_delta_credits: Number(row?.sum_d ?? 0)
  }
}

/** Item Store 购买记录（STEAMSTORESALES ingest 后写入 store_sales_grants） */
export async function summarizeD1StoreSalesPurchases(
  env: Env,
  startUnix: number,
  endUnix: number
): Promise<{ row_count: number; total_amount_cents: number }> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) as c, COALESCE(SUM(amount_cents), 0) as sum_c
     FROM store_sales_grants
     WHERE created_at >= ?
       AND created_at < ?`
  )
    .bind(startUnix, endUnix)
    .first<{ c: number; sum_c: number }>()
  return {
    row_count: Number(row?.c ?? 0),
    total_amount_cents: Number(row?.sum_c ?? 0)
  }
}

/** 额度卡兑换状态汇总（inventory_redeems） */
export async function summarizeD1InventoryRedeems(
  env: Env,
  startUnix: number,
  endUnix: number
): Promise<{
  total_count: number
  granted_count: number
  consumed_count: number
  failed_count: number
  total_credits_added: number
}> {
  const row = await env.DB.prepare(
    `SELECT
        COUNT(*) as total_count,
        COALESCE(SUM(CASE WHEN status = 'granted' THEN 1 ELSE 0 END), 0) as granted_count,
        COALESCE(SUM(CASE WHEN status = 'consumed' OR status = 'granting' THEN 1 ELSE 0 END), 0) as consumed_count,
        COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed_count,
        COALESCE(SUM(credits_added), 0) as credits_sum
     FROM inventory_redeems
     WHERE created_at >= ?
       AND created_at < ?`
  )
    .bind(startUnix, endUnix)
    .first<{
      total_count: number
      granted_count: number
      consumed_count: number
      failed_count: number
      credits_sum: number
    }>()
  return {
    total_count: Number(row?.total_count ?? 0),
    granted_count: Number(row?.granted_count ?? 0),
    consumed_count: Number(row?.consumed_count ?? 0),
    failed_count: Number(row?.failed_count ?? 0),
    total_credits_added: Number(row?.credits_sum ?? 0)
  }
}

/**
 * Steam GetReport：`time` 为 RFC 3339 UTC 起点；对账日与 D1「昨日 UTC」窗口对齐时传入 `reportStartUnix`。
 * 对账邮件中附带原始 JSON 截断，便于人工核对。
 */
export async function fetchSteamMicroTxnReportSnapshot(
  env: Env,
  options?: { reportStartUnix?: number }
): Promise<{ ok: true; raw: Record<string, unknown> } | { ok: false; reason: string }> {
  try {
    const timeRfc3339Utc =
      options?.reportStartUnix != null
        ? rfc3339UtcFromUnixSeconds(options.reportStartUnix)
        : undefined
    const raw = (await getReport(env, 'GAMESALES', { timeRfc3339Utc })) as Record<string, unknown>
    if (
      raw &&
      typeof raw === 'object' &&
      'parse_error' in raw &&
      (raw as { parse_error?: boolean }).parse_error
    ) {
      const snippet = String((raw as { raw?: string }).raw ?? '').slice(0, 400)
      return { ok: false, reason: `steam_response_not_json: ${snippet}` }
    }
    const rsp = raw as {
      response?: { result?: string; error?: { errorcode?: number; errordesc?: string } }
    }
    if (rsp.response?.result !== 'OK') {
      const err = rsp.response?.error
      const code = err?.errorcode
      const desc = (err?.errordesc ?? '').slice(0, 300)
      const tail = [code != null ? `code=${code}` : '', desc ? `desc=${desc}` : '']
        .filter(Boolean)
        .join(' ')
      return {
        ok: false,
        reason: tail ? `steam_getreport_failure: ${tail}` : 'steam_getreport_failure'
      }
    }
    return { ok: true, raw }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

export async function fetchSteamStoreSalesReportSnapshot(
  env: Env,
  options?: { reportStartUnix?: number }
): Promise<{ ok: true; raw: Record<string, unknown> } | { ok: false; reason: string }> {
  try {
    const timeRfc3339Utc =
      options?.reportStartUnix != null
        ? rfc3339UtcFromUnixSeconds(options.reportStartUnix)
        : undefined
    const raw = (await getReport(env, 'STEAMSTORESALES', { timeRfc3339Utc })) as Record<string, unknown>
    if (
      raw &&
      typeof raw === 'object' &&
      'parse_error' in raw &&
      (raw as { parse_error?: boolean }).parse_error
    ) {
      const snippet = String((raw as { raw?: string }).raw ?? '').slice(0, 400)
      return { ok: false, reason: `steamstoresales_response_not_json: ${snippet}` }
    }
    const rsp = raw as {
      response?: { result?: string; error?: { errorcode?: number; errordesc?: string } }
    }
    if (rsp.response?.result !== 'OK') {
      const err = rsp.response?.error
      const code = err?.errorcode
      const desc = (err?.errordesc ?? '').slice(0, 300)
      const tail = [code != null ? `code=${code}` : '', desc ? `desc=${desc}` : '']
        .filter(Boolean)
        .join(' ')
      return {
        ok: false,
        reason: tail ? `steamstoresales_getreport_failure: ${tail}` : 'steamstoresales_getreport_failure'
      }
    }
    return { ok: true, raw }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

export type ReconcileOutcome = {
  status: 'ok' | 'warn'
  d1_mtx: { order_count: number; total_amount_cents: number }
  d1_ledger: { row_count: number; total_delta_credits: number }
  d1_store_sales: { row_count: number; total_amount_cents: number }
  d1_inventory_redeems: {
    total_count: number
    granted_count: number
    consumed_count: number
    failed_count: number
    total_credits_added: number
  }
  steam_report_ok: boolean
  steam_store_report_ok: boolean
  email_requested: boolean
  email_sent: boolean
  email_note?: string
  steam_report_note?: string
  steam_store_report_note?: string
}

export async function runDailyReconciliation(
  env: Env,
  options?: { sendEmail?: boolean }
): Promise<ReconcileOutcome> {
  const now = new Date()
  // Rolling 24h window to avoid skipping recently created transactions.
  const end = now
  const start = new Date(end.getTime() - 86400_000)
  const startUnix = Math.floor(start.getTime() / 1000)
  const endUnix = Math.floor(end.getTime() / 1000)

  const d1_mtx = await summarizeD1MtxCompleted(env, startUnix, endUnix)
  const d1_ledger = await summarizeD1PurchaseLedger(env, startUnix, endUnix)
  const d1_store_sales = await summarizeD1StoreSalesPurchases(env, startUnix, endUnix)
  const d1_inventory_redeems = await summarizeD1InventoryRedeems(env, startUnix, endUnix)

  const steam = await fetchSteamMicroTxnReportSnapshot(env, { reportStartUnix: startUnix })
  const steamStore = await fetchSteamStoreSalesReportSnapshot(env, { reportStartUnix: startUnix })
  const steam_report_ok = steam.ok
  const steam_store_report_ok = steamStore.ok

  let status: 'ok' | 'warn' = 'ok'
  if (!steam.ok || !steamStore.ok) {
    status = 'warn'
  }
  if (d1_mtx.order_count !== d1_ledger.row_count) {
    status = 'warn'
  }

  const periodLabel = `${isoSecondUtc(start)} → ${isoSecondUtc(end)} (UTC, rolling 24h)`

  const html = buildReconcileEmailHtml({
    periodLabel,
    status,
    d1_mtx,
    d1_ledger,
    d1_store_sales,
    d1_inventory_redeems,
    steam,
    steamStore,
    recipient: RECONCILE_EMAIL_TO
  })

  const text = [
    `MetaDoc Cloud daily reconcile ${periodLabel}`,
    `status=${status}`,
    `d1_mtx=${JSON.stringify(d1_mtx)}`,
    `d1_ledger=${JSON.stringify(d1_ledger)}`,
    `d1_store_sales=${JSON.stringify(d1_store_sales)}`,
    `d1_inventory_redeems=${JSON.stringify(d1_inventory_redeems)}`,
    `steam=${steam.ok ? 'ok' : steam.reason}`,
    `steamstoresales=${steamStore.ok ? 'ok' : steamStore.reason}`
  ].join('\n')

  const emailRequested = options?.sendEmail !== false
  let email:
    | { ok: true }
    | {
        ok: false
        reason?: string
      }
  if (emailRequested) {
    email = await sendBrevoTransactionalEmail(env, {
      subject: `[MetaDoc Cloud] 对账 ${isoDayUtc(start)} ${status.toUpperCase()}`,
      htmlBody: html,
      textBody: text
    })
  } else {
    email = { ok: false, reason: 'skipped_by_request' }
  }

  const id = newRequestId()
  await env.DB.prepare(
    `INSERT INTO reconciliation_runs (id, period_start_unix, period_end_unix, status, summary, email_sent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, unixepoch())`
  )
    .bind(
      id,
      startUnix,
      endUnix,
      status,
      JSON.stringify({
        d1_mtx,
        d1_ledger,
        d1_store_sales,
        d1_inventory_redeems,
        steam_report_ok,
        steam_store_report_ok,
        email_requested: emailRequested,
        email_note: emailRequested ? (email.ok ? 'sent' : email.reason ?? 'failed') : 'skipped_by_request',
        brevo: email.ok ? 'sent' : 'failed'
      }),
      emailRequested && email.ok ? 1 : 0
    )
    .run()

  if (emailRequested && !email.ok && 'reason' in email) {
    console.error('[reconcile] brevo failed', email.reason)
  }

  return {
    status,
    d1_mtx,
    d1_ledger,
    d1_store_sales,
    d1_inventory_redeems,
    steam_report_ok,
    steam_store_report_ok,
    email_requested: emailRequested,
    email_sent: emailRequested && email.ok,
    email_note: emailRequested ? (email.ok ? 'sent' : email.reason ?? 'failed') : 'skipped_by_request',
    steam_report_note: steam.ok ? undefined : steam.reason,
    steam_store_report_note: steamStore.ok ? undefined : steamStore.reason
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const EMAIL_TABLE = `border-collapse:collapse;width:100%;max-width:640px;margin:12px 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px`
const EMAIL_TH = `border:1px solid #d0d7de;padding:10px 12px;text-align:left;background:#f6f8fa;font-weight:600;color:#24292f`
const EMAIL_TD = `border:1px solid #d0d7de;padding:10px 12px;color:#24292f`
const EMAIL_TD_MUTE = `border:1px solid #d0d7de;padding:10px 12px;color:#57606a;font-size:13px`

type SteamReportOrder = {
  orderid?: string
  transid?: string
  steamid?: string
  status?: string
  currency?: string
  time?: string
  country?: string
  timecreated?: string
  items?: Array<{
    itemid?: number
    qty?: number
    amount?: number
    vat?: number
    itemstatus?: string
  }>
}

function parseSteamGetReportPayload(raw: Record<string, unknown>): {
  count: number
  orders: SteamReportOrder[]
} {
  const r = raw as { response?: { params?: { count?: number; orders?: SteamReportOrder[] } } }
  const params = r.response?.params
  const orders = Array.isArray(params?.orders) ? params!.orders! : []
  const count =
    typeof params?.count === 'number' && Number.isFinite(params.count)
      ? params.count
      : orders.length
  return { count, orders }
}

function formatAmountCentsLabel(cents: number, currency: string): string {
  const c = (currency || 'USD').toUpperCase()
  const v = (cents / 100).toFixed(2)
  if (c === 'USD') return `$${v}`
  return `${v} ${c}`
}

function orderItemsAmountCents(o: SteamReportOrder): number {
  let sum = 0
  for (const it of o.items ?? []) {
    if (typeof it.amount === 'number' && Number.isFinite(it.amount)) sum += it.amount
  }
  return sum
}

function formatItemsSummary(o: SteamReportOrder): string {
  const parts: string[] = []
  for (const it of o.items ?? []) {
    const q = typeof it.qty === 'number' ? it.qty : 1
    const amt = typeof it.amount === 'number' ? it.amount : 0
    const st = typeof it.itemstatus === 'string' ? it.itemstatus : '—'
    const cur = typeof o.currency === 'string' ? o.currency : 'USD'
    parts.push(`item ${it.itemid ?? '?'} ×${q} ${formatAmountCentsLabel(amt, cur)} · ${st}`)
  }
  return parts.join('；') || '—'
}

/** GetReport 成功：汇总表 + 状态分布条 + 订单明细（邮件客户端友好，无脚本） */
function buildSteamGetReportVisualizationHtml(raw: Record<string, unknown>, reportType: string): string {
  const { count, orders } = parseSteamGetReportPayload(raw)
  const statusCounts = new Map<string, number>()
  for (const o of orders) {
    const s = String(o.status ?? '—').trim() || '—'
    statusCounts.set(s, (statusCounts.get(s) ?? 0) + 1)
  }
  const sortedStatuses = [...statusCounts.entries()].sort((a, b) => b[1] - a[1])
  const maxBar = Math.max(1, ...sortedStatuses.map(([, n]) => n))

  const metaTable = `<table style="${EMAIL_TABLE}" cellpadding="0" cellspacing="0">
<tbody>
<tr><th style="${EMAIL_TH}">说明</th><th style="${EMAIL_TH}">内容</th></tr>
<tr><td style="${EMAIL_TD}">报表类型</td><td style="${EMAIL_TD}">${escapeHtml(reportType)}（GetReport/v5 GET，time = RFC 3339 UTC）</td></tr>
<tr><td style="${EMAIL_TD_MUTE}" colspan="2">以下为接口返回订单的结构化摘要；金额按 Steam 字段理解为「分」。</td></tr>
</tbody></table>`

  const summaryRows = `<tr><th style="${EMAIL_TH}">指标</th><th style="${EMAIL_TH}">数值</th></tr>
<tr><td style="${EMAIL_TD}">本批订单条数（params.count）</td><td style="${EMAIL_TD}">${count}</td></tr>
<tr><td style="${EMAIL_TD}">实际解析到的 orders 行数</td><td style="${EMAIL_TD}">${orders.length}</td></tr>`

  let statusSection = ''
  if (sortedStatuses.length > 0) {
    const barRows = sortedStatuses
      .map(([status, n]) => {
        const pct = Math.round((n / maxBar) * 100)
        return `<tr>
<td style="${EMAIL_TD}">${escapeHtml(status)}</td>
<td style="${EMAIL_TD}">${n}</td>
<td style="${EMAIL_TD};padding:10px 8px;vertical-align:middle;">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:280px;border-collapse:collapse;"><tr>
<td style="padding:0;background:#eaeef2;border-radius:4px;height:12px;width:100%;">
<div style="background:#0969da;height:12px;border-radius:4px;width:${pct}%;min-width:8px;"></div>
</td>
</tr></table>
</td>
</tr>`
      })
      .join('')
    statusSection = `<h4 style="margin:16px 0 8px 0;font-size:14px;color:#24292f;">按订单状态分布</h4>
<table style="${EMAIL_TABLE}" cellpadding="0" cellspacing="0">
<tbody>
<tr><th style="${EMAIL_TH}">状态</th><th style="${EMAIL_TH}">笔数</th><th style="${EMAIL_TH}">占比条（相对本批最大类）</th></tr>
${barRows}
</tbody></table>`
  }

  let detailSection = ''
  if (orders.length === 0) {
    detailSection = `<p style="margin:12px 0;color:#57606a;font-size:13px;">本批无订单行（orders 为空）。</p>`
  } else {
    const orderRows = orders
      .map((o) => {
        const cur = typeof o.currency === 'string' ? o.currency : '—'
        const totalC = orderItemsAmountCents(o)
        const cc = String(o.country ?? '').trim()
        return `<tr>
<td style="${EMAIL_TD};font-size:12px;word-break:break-all;">${escapeHtml(String(o.orderid ?? '—'))}</td>
<td style="${EMAIL_TD};font-size:12px;word-break:break-all;">${escapeHtml(String(o.transid ?? '—'))}</td>
<td style="${EMAIL_TD};font-size:11px;word-break:break-all;">${escapeHtml(String(o.steamid ?? '—'))}</td>
<td style="${EMAIL_TD}">${escapeHtml(String(o.status ?? '—'))}</td>
<td style="${EMAIL_TD}">${escapeHtml(cur)}</td>
<td style="${EMAIL_TD}">${escapeHtml(formatAmountCentsLabel(totalC, cur))}</td>
<td style="${EMAIL_TD};font-size:12px;">${escapeHtml(String(o.time ?? o.timecreated ?? '—'))}</td>
<td style="${EMAIL_TD};font-size:12px;">${escapeHtml(cc || '—')}</td>
<td style="${EMAIL_TD};font-size:12px;line-height:1.4;">${escapeHtml(formatItemsSummary(o))}</td>
</tr>`
      })
      .join('')
    detailSection = `<h4 style="margin:16px 0 8px 0;font-size:14px;color:#24292f;">订单明细</h4>
<table style="${EMAIL_TABLE};font-size:13px;" cellpadding="0" cellspacing="0">
<tbody>
<tr>
<th style="${EMAIL_TH}">orderid</th>
<th style="${EMAIL_TH}">transid</th>
<th style="${EMAIL_TH}">steamid</th>
<th style="${EMAIL_TH}">status</th>
<th style="${EMAIL_TH}">币种</th>
<th style="${EMAIL_TH}">金额（行项合计）</th>
<th style="${EMAIL_TH}">time</th>
<th style="${EMAIL_TH}">国家</th>
<th style="${EMAIL_TH}">行项摘要</th>
</tr>
${orderRows}
</tbody></table>`
  }

  return `${metaTable}
<h4 style="margin:16px 0 8px 0;font-size:14px;color:#24292f;">汇总</h4>
<table style="${EMAIL_TABLE}" cellpadding="0" cellspacing="0">
<tbody>
${summaryRows}
</tbody></table>
${statusSection}
${detailSection}
${buildSteamGetReportRawJsonHtml(raw, reportType)}`
}

function buildSteamGetReportRawJsonHtml(raw: Record<string, unknown>, reportType: string): string {
  let s = ''
  try {
    s = JSON.stringify(raw, null, 2)
  } catch {
    s = String(raw)
  }
  /**
   * 送审/取证：附上原始 JSON（截断）便于 Valve 复核。
   * 避免邮件过大，保留前后片段；对账系统仍以结构化表格为主。
   */
  const max = 120_000
  const trimmed =
    s.length <= max ? s : `${s.slice(0, 80_000)}\n\n…(truncated)…\n\n${s.slice(-35_000)}`
  return `<h4 style="margin:16px 0 8px 0;font-size:14px;color:#24292f;">原始 GetReport JSON（${escapeHtml(
    reportType
  )}，截断）</h4>
<pre style="white-space:pre-wrap;word-break:break-word;border:1px solid #d0d7de;border-radius:8px;padding:12px;background:#0b1020;color:#e6edf3;font-size:12px;line-height:1.35;max-height:520px;overflow:auto;">${escapeHtml(
    trimmed
  )}</pre>`
}

function buildReconcileEmailHtml(args: {
  periodLabel: string
  status: 'ok' | 'warn'
  d1_mtx: { order_count: number; total_amount_cents: number }
  d1_ledger: { row_count: number; total_delta_credits: number }
  d1_store_sales: { row_count: number; total_amount_cents: number }
  d1_inventory_redeems: {
    total_count: number
    granted_count: number
    consumed_count: number
    failed_count: number
    total_credits_added: number
  }
  steam: { ok: true; raw: Record<string, unknown> } | { ok: false; reason: string }
  steamStore: { ok: true; raw: Record<string, unknown> } | { ok: false; reason: string }
  recipient: string
}): string {
  const statusLabel = args.status === 'ok' ? 'OK' : 'WARN（需人工核对）'
  const statusBg = args.status === 'ok' ? '#dafbe1' : '#fff8c5'
  const statusColor = args.status === 'ok' ? '#116329' : '#9a6700'

  const steamBlock = args.steam.ok
    ? `<p style="margin:8px 0 4px 0;color:#57606a;font-size:13px">接口状态：<strong style="color:#116329">成功</strong></p>
${buildSteamGetReportVisualizationHtml(args.steam.raw, 'GAMESALES')}`
    : `<p style="margin:8px 0 4px 0">接口状态：<strong style="color:#cf222e">失败</strong></p>
<table style="${EMAIL_TABLE}" cellpadding="0" cellspacing="0">
<tbody>
<tr><th style="${EMAIL_TH}">错误说明</th></tr>
<tr><td style="${EMAIL_TD}">${escapeHtml(args.steam.reason)}</td></tr>
</tbody></table>`

  const steamStoreBlock = args.steamStore.ok
    ? `<p style="margin:8px 0 4px 0;color:#57606a;font-size:13px">接口状态：<strong style="color:#116329">成功</strong></p>
${buildSteamGetReportVisualizationHtml(args.steamStore.raw, 'STEAMSTORESALES')}`
    : `<p style="margin:8px 0 4px 0">接口状态：<strong style="color:#cf222e">失败</strong></p>
<table style="${EMAIL_TABLE}" cellpadding="0" cellspacing="0">
<tbody>
<tr><th style="${EMAIL_TH}">错误说明</th></tr>
<tr><td style="${EMAIL_TD}">${escapeHtml(args.steamStore.reason)}</td></tr>
</tbody></table>`

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:24px;background:#ffffff;color:#24292f;">
<div style="max-width:640px;margin:0 auto;">
<p style="margin:0 0 8px 0;font-size:18px;font-weight:600;">MetaDoc Cloud — 每日对账</p>
<p style="margin:0 0 16px 0;color:#57606a;font-size:14px;"><strong>周期</strong>：${escapeHtml(args.periodLabel)}</p>
<p style="display:inline-block;margin:0 0 20px 0;padding:6px 12px;border-radius:6px;background:${statusBg};color:${statusColor};font-size:14px;font-weight:600;">状态：${escapeHtml(statusLabel)}</p>

<h3 style="margin:20px 0 8px 0;font-size:15px;color:#24292f;">D1 · mtx_orders（completed，UTC 昨日）</h3>
<table style="${EMAIL_TABLE}" cellpadding="0" cellspacing="0">
<tbody>
<tr><th style="${EMAIL_TH}">指标</th><th style="${EMAIL_TH}">数值</th></tr>
<tr><td style="${EMAIL_TD}">已完成订单数</td><td style="${EMAIL_TD}">${args.d1_mtx.order_count}</td></tr>
<tr><td style="${EMAIL_TD}">金额合计（美分）</td><td style="${EMAIL_TD}">${args.d1_mtx.total_amount_cents}</td></tr>
</tbody></table>

<h3 style="margin:20px 0 8px 0;font-size:15px;color:#24292f;">D1 · credit_ledger（purchase，UTC 昨日）</h3>
<table style="${EMAIL_TABLE}" cellpadding="0" cellspacing="0">
<tbody>
<tr><th style="${EMAIL_TH}">指标</th><th style="${EMAIL_TH}">数值</th></tr>
<tr><td style="${EMAIL_TD}">入账笔数</td><td style="${EMAIL_TD}">${args.d1_ledger.row_count}</td></tr>
<tr><td style="${EMAIL_TD}">Credits 增量合计</td><td style="${EMAIL_TD}">${args.d1_ledger.total_delta_credits}</td></tr>
</tbody></table>

<h3 style="margin:20px 0 8px 0;font-size:15px;color:#24292f;">D1 · store_sales_grants（购买记录，UTC 昨日）</h3>
<table style="${EMAIL_TABLE}" cellpadding="0" cellspacing="0">
<tbody>
<tr><th style="${EMAIL_TH}">指标</th><th style="${EMAIL_TH}">数值</th></tr>
<tr><td style="${EMAIL_TD}">购买记录笔数</td><td style="${EMAIL_TD}">${args.d1_store_sales.row_count}</td></tr>
<tr><td style="${EMAIL_TD}">金额合计（分）</td><td style="${EMAIL_TD}">${args.d1_store_sales.total_amount_cents}</td></tr>
</tbody></table>

<h3 style="margin:20px 0 8px 0;font-size:15px;color:#24292f;">D1 · inventory_redeems（额度卡兑换，UTC 昨日）</h3>
<table style="${EMAIL_TABLE}" cellpadding="0" cellspacing="0">
<tbody>
<tr><th style="${EMAIL_TH}">指标</th><th style="${EMAIL_TH}">数值</th></tr>
<tr><td style="${EMAIL_TD}">兑换请求总数</td><td style="${EMAIL_TD}">${args.d1_inventory_redeems.total_count}</td></tr>
<tr><td style="${EMAIL_TD}">已入账（granted）</td><td style="${EMAIL_TD}">${args.d1_inventory_redeems.granted_count}</td></tr>
<tr><td style="${EMAIL_TD}">已消耗待完成（consumed/granting）</td><td style="${EMAIL_TD}">${args.d1_inventory_redeems.consumed_count}</td></tr>
<tr><td style="${EMAIL_TD}">失败（failed）</td><td style="${EMAIL_TD}">${args.d1_inventory_redeems.failed_count}</td></tr>
<tr><td style="${EMAIL_TD}">兑换入账 Credits 合计</td><td style="${EMAIL_TD}">${args.d1_inventory_redeems.total_credits_added}</td></tr>
</tbody></table>

<h3 style="margin:20px 0 8px 0;font-size:15px;color:#24292f;">Steam · GetReport（GAMESALES）</h3>
${steamBlock}

<h3 style="margin:20px 0 8px 0;font-size:15px;color:#24292f;">Steam · GetReport（STEAMSTORESALES）</h3>
${steamStoreBlock}

<p style="margin:24px 0 0 0;font-size:12px;color:#6e7781;">收件人：${escapeHtml(args.recipient)}</p>
<p style="margin:12px 0 0 0;font-size:11px;color:#aeb8c1;">MetaDoc reconcile · <strong>template-v4-steam-structured-store</strong> · Steam GetReport = <strong>HTTP GET</strong>（已同时包含 GAMESALES 与 STEAMSTORESALES，附结构化摘要 + 原始 JSON 截断）</p>
</div>
</body></html>`
}
