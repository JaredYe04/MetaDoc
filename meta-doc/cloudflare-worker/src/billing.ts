import type { Env } from './types'
import { estimateFreezeByModel } from './pricing-helpers'

/** 预估冻结 credits（可按模型调大）；成功后按实际 token 结算 */
const DEFAULT_FREEZE_ESTIMATE = 64

export async function ensureUserRow(env: Env, steamId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (steam_id, credits, updated_at) VALUES (?, 0, unixepoch())
     ON CONFLICT(steam_id) DO NOTHING`
  )
    .bind(steamId)
    .run()
}

export async function getCredits(env: Env, steamId: string): Promise<number> {
  await ensureUserRow(env, steamId)
  const row = await env.DB.prepare(`SELECT credits FROM users WHERE steam_id = ?`).bind(steamId).first<{
    credits: number
  }>()
  return row?.credits ?? 0
}

export async function freezeCredits(
  env: Env,
  steamId: string,
  freezeId: string,
  amount: number
): Promise<{ ok: true } | { ok: false; reason: 'insufficient' }> {
  await ensureUserRow(env, steamId)
  const res = await env.DB.prepare(
    `UPDATE users SET credits = credits - ?, updated_at = unixepoch()
     WHERE steam_id = ? AND credits >= ?`
  )
    .bind(amount, steamId, amount)
    .run()
  if (!res.success || (res.meta?.changes ?? 0) === 0) {
    return { ok: false, reason: 'insufficient' }
  }
  await env.DB.prepare(
    `INSERT INTO credit_freezes (id, steam_id, amount, created_at) VALUES (?, ?, ?, unixepoch())`
  )
    .bind(freezeId, steamId, amount)
    .run()
  return { ok: true }
}

export async function releaseFreeze(env: Env, steamId: string, freezeId: string): Promise<void> {
  const row = await env.DB.prepare(`SELECT amount FROM credit_freezes WHERE id = ? AND steam_id = ?`)
    .bind(freezeId, steamId)
    .first<{ amount: number }>()
  if (!row) return
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM credit_freezes WHERE id = ?`).bind(freezeId),
    env.DB.prepare(
      `UPDATE users SET credits = credits + ?, updated_at = unixepoch() WHERE steam_id = ?`
    ).bind(row.amount, steamId)
  ])
}

/** 成功：退回冻结与实耗差额（freeze_amount - actual） */
export async function commitFreeze(
  env: Env,
  steamId: string,
  freezeId: string,
  actualCost: number
): Promise<void> {
  const row = await env.DB.prepare(`SELECT amount FROM credit_freezes WHERE id = ? AND steam_id = ?`)
    .bind(freezeId, steamId)
    .first<{ amount: number }>()
  if (!row) return
  const refund = Math.max(0, row.amount - actualCost)
  await env.DB.prepare(`DELETE FROM credit_freezes WHERE id = ?`).bind(freezeId).run()
  if (refund > 0) {
    await env.DB.prepare(
      `UPDATE users SET credits = credits + ?, updated_at = unixepoch() WHERE steam_id = ?`
    )
      .bind(refund, steamId)
      .run()
  }
}

export function estimateFreezeForRequest(body: unknown): number {
  if (!body || typeof body !== 'object') return DEFAULT_FREEZE_ESTIMATE
  const b = body as { model?: string; max_tokens?: number }
  return estimateFreezeByModel(b.model, b.max_tokens)
}
