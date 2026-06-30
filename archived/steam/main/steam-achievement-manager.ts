import { appStore } from '../app-store'
import { STEAM_ACHIEVEMENT_API_NAMES } from '../../common/steam-achievement-registry'
import { unlockSteamAchievement } from './steam-achievement'
import type { GreenworksApi } from './greenworks-loader'

const UNLOCK_PREFIX = 'steamAchUnlocked_'

export function isSteamAchievementUnlockedInStore(apiName: string): boolean {
  return appStore.get(UNLOCK_PREFIX + apiName) === true
}

/**
 * 与 app-store 去重后解锁；失败仅打日志。
 */
export function tryUnlockSteamAchievement(gw: GreenworksApi, apiName: string): void {
  if (!STEAM_ACHIEVEMENT_API_NAMES.includes(apiName)) {
    return
  }
  const key = UNLOCK_PREFIX + apiName
  if (appStore.get(key) === true) {
    return
  }
  void unlockSteamAchievement(gw, apiName).then((r) => {
    if (r.success) {
      appStore.set(key, true)
    }
  })
}
