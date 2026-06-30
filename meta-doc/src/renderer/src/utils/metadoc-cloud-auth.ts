/**
 * 开源构建：MetaDoc Cloud / Steam JWT 已归档，提供 no-op stub。
 */

export function getStoredMetadocCloudJwt(): string | null {
  return null
}

export function clearMetadocCloudJwtStorage(): void {
  /* no-op */
}

export async function ensureMetadocSteamCloudJwt(): Promise<string> {
  throw new Error('MetaDoc Cloud is not available in the open-source build')
}

export const MTX_ERR_STEAM_DECLINED = 'mtx_steam_declined'
export const MTX_ERR_POLL_TIMEOUT = 'mtx_steam_poll_timeout'
export const MTX_ERR_STEAM_PENDING_AUTH = 'mtx_steam_pending_authorization'
export const MTX_ERR_NO_PUBLIC_IP = 'MTX_ERR_NO_PUBLIC_IP'
export const MTX_ERR_CHECKOUT_IP_MISMATCH = 'mtx_ip_mismatch'
export const MTX_ERR_CHECKOUT_LOGGED_OUT = 'steam_checkout_logged_out'

export async function startSteamStorePurchaseAndSync(): Promise<never> {
  throw new Error('Steam store is not available in the open-source build')
}

export async function syncSteamStorePurchases(): Promise<{ synced: number }> {
  return { synced: 0 }
}

export async function fetchSteamInventoryCards(): Promise<never[]> {
  return []
}

export async function redeemSteamInventoryCard(): Promise<never> {
  throw new Error('Steam inventory is not available in the open-source build')
}

export async function startSteamMtxInit(): Promise<never> {
  throw new Error('Steam MTX is not available in the open-source build')
}

export async function canInitSteamMtx(): Promise<boolean> {
  return false
}
