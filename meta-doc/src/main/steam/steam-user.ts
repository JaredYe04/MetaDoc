import type { GreenworksApi } from './greenworks-loader'

export type SteamUserInfo = {
  id: string
  name: string
  level: number
}

export function getSteamUserInfo(gw: GreenworksApi): SteamUserInfo | null {
  try {
    const sid = typeof gw.getSteamId === 'function' ? gw.getSteamId() : null
    if (!sid) {
      return null
    }
    const id =
      typeof sid.getSteamID64 === 'function'
        ? String(sid.getSteamID64())
        : typeof sid.steamId === 'string'
          ? sid.steamId
          : ''
    const name =
      typeof sid.getPersonaName === 'function'
        ? String(sid.getPersonaName())
        : typeof sid.getScreenName === 'function'
          ? String(sid.getScreenName())
          : ''
    let level = 0
    if (typeof sid.getLevel === 'function') {
      const l = sid.getLevel()
      level = typeof l === 'number' ? l : 0
    }
    if (!id) {
      return null
    }
    return { id, name: name || 'Steam User', level }
  } catch {
    return null
  }
}
