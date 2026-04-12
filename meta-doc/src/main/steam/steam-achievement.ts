import { STEAM_ACHIEVEMENT_IDS } from '../../common/steam-achievements'
import { appStore } from '../app-store'
import type { GreenworksApi } from './greenworks-loader'
import { getGreenworksOrNull } from './steam-state'

export { STEAM_ACHIEVEMENT_IDS }

const UNLOCK_PREFIX = 'steamAchUnlocked_'

export function unlockSteamAchievement(
  gw: GreenworksApi,
  apiName: string
): Promise<{ success: true } | { success: false; error: string }> {
  return new Promise((resolve) => {
    gw.activateAchievement(
      apiName,
      () => resolve({ success: true }),
      (err: Error | string) =>
        resolve({
          success: false,
          error: err instanceof Error ? err.message : String(err)
        })
    )
  })
}

/** 首次进入「最近文档」时解锁（主进程调用） */
export function tryUnlockFirstDocAchievement(): void {
  const key = UNLOCK_PREFIX + STEAM_ACHIEVEMENT_IDS.FIRST_DOC
  if (appStore.get(key) === true) {
    return
  }
  const gw = getGreenworksOrNull()
  if (!gw) {
    return
  }
  void unlockSteamAchievement(gw, STEAM_ACHIEVEMENT_IDS.FIRST_DOC).then((r) => {
    if (r.success) {
      appStore.set(key, true)
    }
  })
}
