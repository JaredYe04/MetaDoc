import type { GreenworksApi } from './greenworks-loader'

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
