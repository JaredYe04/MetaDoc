#!/usr/bin/env node
/**
 * MetaDoc MTX 自动验证
 *
 * 重要：checkout.steampowered.com/.../approvetxn/<数字>/ 里的数字多为 Steam **transid**，
 * 与 Worker 生成的 **order_id**（D1 里那串更长的）不是同一个字段。
 * 若只用 URL 里的数字去 QueryTxn(orderid=这个数字)，Steam 会报「订单不存在」——这是 ID 用错，不代表没下单。
 *
 * 用法（在 cloudflare-worker 目录下）：
 *   node scripts/mtx-verify.mjs query-txn <order_id> [--trans-id=xxx]
 *   node scripts/mtx-verify.mjs match-checkout-url <完整 URL 或 transid 数字>
 *   node scripts/mtx-verify.mjs d1-recent [行数] [--local] [--json]
 *
 * 密钥：`.env.vars` / `.dev.vars`（KEY=value）
 */
import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WORKER_ROOT = path.join(__dirname, '..')

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const text = fs.readFileSync(filePath, 'utf8')
  for (const line of text.split(/\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

function loadLocalEnvFiles() {
  loadEnvFile(path.join(WORKER_ROOT, '.env.vars'))
  loadEnvFile(path.join(WORKER_ROOT, '.dev.vars'))
}

loadLocalEnvFiles()

function mtxBase() {
  return process.env.STEAM_MICROTX_SANDBOX === 'true'
    ? 'https://partner.steam-api.com/ISteamMicroTxnSandbox'
    : 'https://partner.steam-api.com/ISteamMicroTxn'
}

function requireEnv(name) {
  const v = process.env[name]
  if (!v || !String(v).trim()) {
    console.error(
      `缺少环境变量 ${name}。请 export，或在 cloudflare-worker/.env.vars / .dev.vars 中设置（KEY=value 每行一条）。`
    )
    process.exit(2)
  }
  return String(v).trim()
}

function mtxOk(data) {
  if (!data || typeof data !== 'object') return false
  const r = data.response
  if (r?.result === 'OK' || r?.result === 'Success') return true
  return data.result === 'OK'
}

async function fetchSteamQueryTxn(orderId, transId) {
  const key = requireEnv('STEAM_WEB_API_KEY')
  const appid = requireEnv('STEAM_APP_ID')
  const base = mtxBase()
  const url = new URL(`${base}/QueryTxn/v3/`)
  url.searchParams.set('key', key)
  url.searchParams.set('appid', appid)
  url.searchParams.set('orderid', orderId)
  if (transId) url.searchParams.set('transid', transId)

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'MetaDocCloudWorker/mtx-verify (+QueryTxn)'
    }
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* HTML 等 */
  }
  return { httpStatus: res.status, text, json, urlRedacted: url.toString().replace(/key=[^&]+/, 'key=(redacted)') }
}

async function queryTxnCli(orderId, transId) {
  const r = await fetchSteamQueryTxn(orderId, transId)
  console.error('QueryTxn GET', r.urlRedacted)
  if (r.json) {
    console.log(JSON.stringify(r.json, null, 2))
    if (!mtxOk(r.json)) process.exit(1)
    return
  }
  console.error('非 JSON 响应 HTTP', r.httpStatus, r.text.slice(0, 600))
  if (r.text.includes('No microtransaction with the specified orderid')) {
    console.error(
      '\n说明：若你用的是 **checkout 页 URL 里的短数字**，它多半是 **transid**，不是 Worker 的 order_id。\n' +
        '请运行： node scripts/mtx-verify.mjs match-checkout-url "<粘贴完整 approvetxn URL>"\n' +
        '或先从 D1 取 order_id： node scripts/mtx-verify.mjs d1-recent 10 --json'
    )
  }
  process.exit(1)
}

function d1ExecJson(sql, useLocal) {
  const dbName = 'metadoc-billing'
  const flag = useLocal ? '--local' : '--remote'
  const safe = sql.replace(/"/g, "'")
  const out = execSync(
    `npx wrangler d1 execute ${dbName} ${flag} --json --yes --command "${safe}"`,
    {
      cwd: WORKER_ROOT,
      encoding: 'utf8',
      shell: true,
      env: { ...process.env, CI: '1' }
    }
  )
  const trimmed = out.trim()
  const jsonStart = trimmed.indexOf('[')
  const jsonSlice = jsonStart >= 0 ? trimmed.slice(jsonStart) : trimmed
  return JSON.parse(jsonSlice)
}

function d1RecentOrderIds(limit, useLocal) {
  const lim = Math.min(500, Math.max(1, Number(limit) || 20))
  const sql = `SELECT order_id FROM mtx_orders ORDER BY created_at DESC LIMIT ${lim};`
  const raw = d1ExecJson(sql, useLocal)
  const first = Array.isArray(raw) ? raw[0] : raw
  const rows = first?.results ?? []
  return rows.map((row) => String(row.order_id))
}

function d1RecentTable(limit, useLocal, asJson) {
  const lim = Math.min(500, Math.max(1, Number(limit) || 20))
  const sql = `SELECT order_id, steam_id, item_id, status, amount_cents, currency, datetime(created_at, 'unixepoch') AS created_utc FROM mtx_orders ORDER BY created_at DESC LIMIT ${lim};`
  if (asJson) {
    const raw = d1ExecJson(sql, useLocal)
    console.log(JSON.stringify(raw, null, 2))
    return
  }
  const tmp = path.join(os.tmpdir(), `mtx-verify-d1-${Date.now()}.sql`)
  fs.writeFileSync(tmp, sql, 'utf8')
  try {
    const flag = useLocal ? '--local' : '--remote'
    const q = tmp.includes(' ') ? `"${tmp}"` : tmp
    execSync(`npx wrangler d1 execute metadoc-billing --file ${q} ${flag}`, {
      cwd: WORKER_ROOT,
      stdio: 'inherit',
      shell: true,
      env: process.env
    })
  } catch (e) {
    const code = e && typeof e === 'object' && 'status' in e ? e.status : 1
    console.error(
      '\n提示：远程 D1 需已登录 Cloudflare（`wrangler login`）。本地库加 --local；若 no such table 则先 migrations apply --local。'
    )
    process.exit(typeof code === 'number' ? code : 1)
  } finally {
    try {
      fs.unlinkSync(tmp)
    } catch {
      /* ignore */
    }
  }
}

async function matchCheckoutUrl(input, useLocal) {
  const m = String(input).match(/approvetxn\/(\d+)/i)
  const segment = m ? m[1] : /^\d+$/.test(String(input).trim()) ? String(input).trim() : null
  if (!segment) {
    console.error('请传入 checkout URL 或纯数字 transid，例如 match-checkout-url "https://checkout.steampowered.com/.../approvetxn/8965.../"')
    process.exit(2)
  }
  requireEnv('STEAM_WEB_API_KEY')
  requireEnv('STEAM_APP_ID')

  console.error(
    '路径数字（通常即 transid）:',
    segment,
    '\n正在拉取 D1 最近 order_id 并与 Steam QueryTxn(order_id, transid) 配对…'
  )

  const ids = d1RecentOrderIds(100, useLocal)
  if (ids.length === 0) {
    console.error('D1 无订单行。若用远程库，确认 Worker 已写入 mtx_orders。')
    process.exit(1)
  }

  const tryOid = await fetchSteamQueryTxn(segment, undefined)
  if (tryOid.json && mtxOk(tryOid.json)) {
    console.error('该数字作为 **order_id** 单查即成功（少见）：')
    console.log(JSON.stringify(tryOid.json, null, 2))
    return
  }

  for (const oid of ids) {
    const r = await fetchSteamQueryTxn(oid, segment)
    if (r.json && mtxOk(r.json)) {
      console.error('匹配成功：**order_id** =', oid, ' **transid**(URL 中) =', segment)
      console.log(JSON.stringify(r.json, null, 2))
      return
    }
  }

  console.error(
    '未在 D1 最近',
    ids.length,
    '笔中找到与 transid=',
    segment,
    ' 对应的 QueryTxn 成功结果。\n' +
      '可能原因：① 该笔不在当前 D1；② STEAM_APP_ID / STEAM_MICROTX_SANDBOX 与下单时不一致；③ 订单过旧超出拉取条数。'
  )
  process.exit(1)
}

function printHelp() {
  console.log(`
用法:
  node scripts/mtx-verify.mjs query-txn <order_id> [--trans-id=数字]
  node scripts/mtx-verify.mjs match-checkout-url <approvetxn 完整 URL 或 transid>
  node scripts/mtx-verify.mjs d1-recent [行数] [--local] [--json]

「站点错误」排查要点：
  checkout 页 URL 里的数字多为 **transid**；验证订单请用 D1 的 **order_id**，或运行 match-checkout-url 自动配对。

npm：勿用 --limit=（会被 npm 吃掉），请用  npm run mtx:d1-recent -- 15 --json

环境变量: STEAM_WEB_API_KEY, STEAM_APP_ID, STEAM_MICROTX_SANDBOX
写入 .env.vars 或 .dev.vars
`)
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
    printHelp()
    process.exit(0)
  }
  const cmd = argv[0]
  if (cmd === 'query-txn') {
    const orderId = argv[1]
    if (!orderId) {
      console.error('请提供 order_id')
      process.exit(2)
    }
    let transId
    for (const a of argv.slice(2)) {
      if (a.startsWith('--trans-id=')) transId = a.slice('--trans-id='.length)
    }
    queryTxnCli(orderId, transId).catch((e) => {
      console.error(e)
      process.exit(1)
    })
    return
  }
  if (cmd === 'match-checkout-url') {
    const useLocal = argv.includes('--local')
    const input = argv
      .slice(1)
      .filter((a) => a !== '--local')
      .join(' ')
      .trim()
    if (!input) {
      console.error('请提供 URL 或数字')
      process.exit(2)
    }
    matchCheckoutUrl(input, useLocal).catch((e) => {
      console.error(e)
      process.exit(1)
    })
    return
  }
  if (cmd === 'd1-recent') {
    let limit = parseInt(process.env.MTX_D1_LIMIT ?? '', 10)
    if (!Number.isFinite(limit) || limit < 1) limit = 20
    let local = false
    let asJson = false
    for (const a of argv.slice(1)) {
      if (a === '--local') local = true
      else if (a === '--json') asJson = true
      else if (/^\d+$/.test(a)) limit = Math.min(500, Math.max(1, parseInt(a, 10)))
      else if (a.startsWith('--rows=') || a.startsWith('--limit=')) {
        const raw = a.startsWith('--rows=') ? a.slice('--rows='.length) : a.slice('--limit='.length)
        const n = parseInt(raw, 10)
        if (Number.isFinite(n) && n >= 1) limit = Math.min(500, n)
      }
    }
    d1RecentTable(limit, local, asJson)
    return
  }
  console.error('未知子命令:', cmd)
  printHelp()
  process.exit(2)
}

main()
