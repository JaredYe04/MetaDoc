/** Model price sort helpers (used by chat UI; cloud-specific naming retained for compat). */

export type SteamCloudModelRow = { id: string; credits_per_1k_tokens_est?: number }

export const STEAM_CLOUD_MODEL_PRICE_SORT_KEY = 'metadoc_steam_cloud_model_price_sort'

export function readStoredSteamCloudPriceSortOrder(): 'asc' | 'desc' {
  try {
    const v = localStorage.getItem(STEAM_CLOUD_MODEL_PRICE_SORT_KEY)
    if (v === 'desc' || v === 'asc') {
      return v
    }
  } catch {
    /* ignore */
  }
  return 'asc'
}

export function writeStoredSteamCloudPriceSortOrder(order: 'asc' | 'desc'): void {
  try {
    localStorage.setItem(STEAM_CLOUD_MODEL_PRICE_SORT_KEY, order)
  } catch {
    /* ignore */
  }
}

export function sortSteamCloudModelsByPrice(
  models: SteamCloudModelRow[],
  order: 'asc' | 'desc'
): SteamCloudModelRow[] {
  const copy = [...models]
  copy.sort((a, b) => {
    const pa = a.credits_per_1k_tokens_est
    const pb = b.credits_per_1k_tokens_est
    const na = typeof pa === 'number' && Number.isFinite(pa) ? pa : Number.POSITIVE_INFINITY
    const nb = typeof pb === 'number' && Number.isFinite(pb) ? pb : Number.POSITIVE_INFINITY
    if (na !== nb) {
      return order === 'asc' ? na - nb : nb - na
    }
    return a.id.localeCompare(b.id)
  })
  return copy
}
