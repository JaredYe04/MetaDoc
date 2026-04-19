import {
  ECONOMICS,
  FIRST_PURCHASE,
  N1N_MODEL_RATES,
  PRICING_BUNDLE_VERSION,
  STEAM_MTX_ITEMS
} from './pricing-generated'

export function creditsFromUsdGross(grossUsd: number): number {
  const { metadoc_service_fee_pct, steam_mtx_effective_fee_pct, credits_per_usd_pool } = ECONOMICS
  const P = grossUsd * (1 - steam_mtx_effective_fee_pct) * (1 - metadoc_service_fee_pct)
  return Math.max(0, Math.floor(P * credits_per_usd_pool))
}

/** 非 USD 或缺失分币时回退到商品 YAML 中的 usd_price（见 economics.md） */
export function usdGrossForMtxOrder(
  amountCents: number | null | undefined,
  currency: string | null | undefined,
  itemId: string | null | undefined
): number {
  const item = itemId ? getSteamMtxItemById(itemId) : undefined
  const cur = (currency || 'USD').toUpperCase()
  if (cur === 'USD' && amountCents != null && amountCents > 0) {
    return amountCents / 100
  }
  return item?.usd_price ?? 0
}

export function getSteamMtxItemById(id: string): (typeof STEAM_MTX_ITEMS)[number] | undefined {
  return STEAM_MTX_ITEMS.find((i) => String(i.steam_item_id) === id)
}

export function volumeBonusCreditsForItemId(itemId: string | null | undefined): number {
  if (!itemId) {
    return 0
  }
  const item = getSteamMtxItemById(itemId) as
    | ((typeof STEAM_MTX_ITEMS)[number] & { volume_bonus_credits?: number })
    | undefined
  const b = item?.volume_bonus_credits
  if (typeof b !== 'number' || b < 0) {
    return 0
  }
  return Math.floor(b)
}

export function estimateFreezeByModel(
  model: string | undefined,
  maxTokens: number | undefined
): number {
  const m = N1N_MODEL_RATES.models.find((x) => x.id === model)
  const per1k = m?.credits_per_1k_tokens_est ?? 50
  const estTok = maxTokens && maxTokens > 0 ? maxTokens : 2048
  return Math.max(8, Math.ceil((estTok / 1000) * per1k))
}

export function actualCostFromUsageForModel(
  usage: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  },
  model: string | undefined
): number {
  const t = usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0)
  const m = N1N_MODEL_RATES.models.find((x) => x.id === model)
  const per1k = m?.credits_per_1k_tokens_est ?? 50
  return Math.max(1, Math.ceil((t / 1000) * per1k))
}

/**
 * 首购一次性 credits：区域建议价 × (1 - s_eff) × grant_fraction × credits_per_usd_pool（见 economics-first-purchase.md）
 */
export function firstPurchaseCreditsGrant(): number {
  const list = FIRST_PURCHASE.app_list_price_usd
  const frac = FIRST_PURCHASE.grant_fraction_of_list_price_usd
  const P = list * (1 - ECONOMICS.steam_mtx_effective_fee_pct) * frac
  return Math.max(0, Math.floor(P * ECONOMICS.credits_per_usd_pool))
}

export function cloudModelsPayload(): {
  version: string
  models: Array<{ id: string; label: string; credits_per_1k_tokens_est: number }>
} {
  return {
    version: N1N_MODEL_RATES.version,
    models: N1N_MODEL_RATES.models.map((m) => ({
      id: m.id,
      label: m.id,
      credits_per_1k_tokens_est: m.credits_per_1k_tokens_est
    }))
  }
}

type MtxItemRow = (typeof STEAM_MTX_ITEMS)[number] & {
  listed?: boolean
  volume_bonus_credits?: number
}

export function steamMtxCatalogPayload(): {
  version: string
  items: Array<{
    steam_item_id: string
    label: string
    usd_price: number
    amount_cents_usd: number
    volume_bonus_credits?: number
  }>
} {
  const rows = STEAM_MTX_ITEMS.filter((raw) => (raw as MtxItemRow).listed === true)
  const items = rows.map((raw) => {
    const i = raw as MtxItemRow
    const entry: {
      steam_item_id: string
      label: string
      usd_price: number
      amount_cents_usd: number
      volume_bonus_credits?: number
    } = {
      steam_item_id: String(i.steam_item_id),
      label: String(i.label),
      usd_price: i.usd_price,
      amount_cents_usd: i.amount_cents_usd
    }
    if (typeof i.volume_bonus_credits === 'number' && i.volume_bonus_credits > 0) {
      entry.volume_bonus_credits = i.volume_bonus_credits
    }
    return entry
  })
  return { version: PRICING_BUNDLE_VERSION, items }
}
