/**
 * Steam 官方云：额度流水（Worker GET /user/credit-ledger）
 */
import { getMetadocCloudApiBase } from '@common/build-env'
import { ensureMetadocSteamCloudJwt } from './metadoc-cloud-auth'

export type CreditLedgerKind =
  | 'usage'
  | 'purchase'
  | 'first_purchase'
  | 'promotion'
  | 'refund'
  | 'adjustment'
  | string

export type CreditLedgerItem = {
  id: string
  created_at: number
  kind: CreditLedgerKind
  delta_credits: number
  balance_after: number | null
  meta: Record<string, unknown>
}

export type CreditLedgerSummary = {
  credits_spent: number
  credits_added: number
}

export async function fetchCreditLedger(params: {
  fromSec?: number | null
  toSec?: number | null
  limit?: number
  cursor?: string | null
  includeSummary?: boolean
}): Promise<{
  items: CreditLedgerItem[]
  next_cursor?: string
  summary?: CreditLedgerSummary
}> {
  const base = getMetadocCloudApiBase()
  if (!base) {
    throw new Error('VITE_METADOC_CLOUD_API_URL 未配置')
  }
  const jwt = await ensureMetadocSteamCloudJwt()
  const u = new URL(`${base}/user/credit-ledger`)
  if (params.fromSec != null && Number.isFinite(params.fromSec)) {
    u.searchParams.set('from', String(Math.floor(params.fromSec)))
  }
  if (params.toSec != null && Number.isFinite(params.toSec)) {
    u.searchParams.set('to', String(Math.floor(params.toSec)))
  }
  if (params.limit != null) {
    u.searchParams.set('limit', String(params.limit))
  }
  if (params.cursor) {
    u.searchParams.set('cursor', params.cursor)
  }
  if (params.includeSummary) {
    u.searchParams.set('include_summary', '1')
  }

  const res = await fetch(u.toString(), {
    headers: { authorization: `Bearer ${jwt}` }
  })
  const j = (await res.json()) as {
    items?: CreditLedgerItem[]
    next_cursor?: string
    summary?: CreditLedgerSummary
    message?: string
  }
  if (!res.ok) {
    throw new Error(j.message || `credit-ledger failed (${res.status})`)
  }
  return {
    items: Array.isArray(j.items) ? j.items : [],
    next_cursor: j.next_cursor,
    summary: j.summary
  }
}

export async function fetchUserCreditsCloud(): Promise<number> {
  const base = getMetadocCloudApiBase()
  if (!base) {
    throw new Error('VITE_METADOC_CLOUD_API_URL 未配置')
  }
  const jwt = await ensureMetadocSteamCloudJwt()
  const res = await fetch(`${base}/user/credits`, {
    headers: { authorization: `Bearer ${jwt}` }
  })
  const j = (await res.json()) as { credits?: number; message?: string }
  if (!res.ok) {
    throw new Error(j.message || `user/credits failed (${res.status})`)
  }
  return typeof j.credits === 'number' ? j.credits : 0
}
