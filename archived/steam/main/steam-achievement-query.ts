import type { GreenworksApi } from './greenworks-loader'

/** greenworks.getAchievement 成功回调参数为是否已解锁 */
export function getAchievementUnlocked(
  gw: GreenworksApi,
  apiName: string
): Promise<{ ok: true; achieved: boolean } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    if (!apiName || typeof gw.getAchievement !== 'function') {
      resolve({ ok: false, error: 'getAchievement_unavailable' })
      return
    }
    try {
      gw.getAchievement(
        apiName,
        (achieved: boolean) => resolve({ ok: true, achieved: Boolean(achieved) }),
        (err: Error | string) =>
          resolve({
            ok: false,
            error: err instanceof Error ? err.message : String(err)
          })
      )
    } catch (e) {
      resolve({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  })
}
