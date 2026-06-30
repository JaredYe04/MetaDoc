/**
 * Credit ledger stub — MetaDoc Cloud archived in open-source build.
 */

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

export async function fetchCreditLedger(_params?: {
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
  return { items: [] }
}

export async function fetchCreditBalance(): Promise<{ balance_credits: number }> {
  return { balance_credits: 0 }
}

export async function fetchUserCreditsCloud(): Promise<number> {
  return 0
}
