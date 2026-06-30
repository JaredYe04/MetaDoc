import type { GreenworksApi } from './greenworks-loader'

/** @see greenworks docs friends.md — pchDialog: steamid | achievements | … */
export function activateGameOverlayToLocalUser(
  gw: GreenworksApi,
  dialog: 'steamid' | 'achievements',
  steamId64: string
): { ok: true } | { ok: false; error: string } {
  if (!steamId64 || typeof gw.activateGameOverlayToUser !== 'function') {
    return { ok: false, error: 'overlay_unavailable' }
  }
  try {
    gw.activateGameOverlayToUser(dialog, steamId64)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
