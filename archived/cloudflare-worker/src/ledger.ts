import type { Env } from './types'
import { getCredits } from './billing'

export type CreditLedgerKind =
  | 'usage'
  | 'purchase'
  | 'first_purchase'
  | 'promotion'
  | 'refund'
  | 'adjustment'

export async function insertCreditLedger(
  env: Env,
  args: {
    steamId: string
    kind: CreditLedgerKind
    deltaCredits: number
    meta?: Record<string, unknown>
  }
): Promise<void> {
  const id = crypto.randomUUID()
  const balance = await getCredits(env, args.steamId)
  const metaStr = JSON.stringify(args.meta ?? {})
  await env.DB.prepare(
    `INSERT INTO credit_ledger (id, steam_id, created_at, kind, delta_credits, balance_after, meta)
     VALUES (?, ?, unixepoch(), ?, ?, ?, ?)`
  )
    .bind(id, args.steamId, args.kind, args.deltaCredits, balance, metaStr)
    .run()
}

/** Net credits spent (positive number) → stored as negative delta */
export async function insertUsageLedger(
  env: Env,
  steamId: string,
  args: {
    requestId: string
    model?: string
    actualCredits: number
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    scenario?: string
  }
): Promise<void> {
  const delta = -Math.max(0, Math.floor(args.actualCredits))
  await insertCreditLedger(env, {
    steamId,
    kind: 'usage',
    deltaCredits: delta,
    meta: {
      request_id: args.requestId,
      model: args.model ?? null,
      prompt_tokens: args.usage?.prompt_tokens ?? null,
      completion_tokens: args.usage?.completion_tokens ?? null,
      total_tokens: args.usage?.total_tokens ?? null,
      scenario: args.scenario ?? 'chat'
    }
  })
}
