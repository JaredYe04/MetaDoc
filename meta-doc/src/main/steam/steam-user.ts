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
    // greenworks GetSteamId 在返回对象上挂 level（数字）；部分路径上为 getSteamLevel()
    const sidAny = sid as {
      level?: number
      getLevel?: () => number
      getSteamLevel?: () => number
    }
    let level = 0
    if (typeof sidAny.level === 'number' && Number.isFinite(sidAny.level)) {
      level = sidAny.level
    } else if (typeof sidAny.getSteamLevel === 'function') {
      const l = sidAny.getSteamLevel()
      level = typeof l === 'number' ? l : 0
    } else if (typeof sidAny.getLevel === 'function') {
      const l = sidAny.getLevel()
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
