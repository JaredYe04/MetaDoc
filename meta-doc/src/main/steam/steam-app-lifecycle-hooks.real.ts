import { getGreenworksOrNull } from './steam-state'

/** 启动后：游玩时长、欢迎成就（仅 Steam 构建编入） */
export function startSteamWhenReadyHooks(): void {
  void import('./steam-playtime-tracker').then(({ startSteamPlaytimeTracker }) => {
    startSteamPlaytimeTracker(() => getGreenworksOrNull())
  })
  void import('./steam-achievement-manager').then(({ tryUnlockSteamAchievement }) => {
    const gw = getGreenworksOrNull()
    if (gw) {
      tryUnlockSteamAchievement(gw, 'ACH_META_WELCOME')
    }
  })
}

type Gw = NonNullable<ReturnType<typeof getGreenworksOrNull>>

export function runSteamBeforeQuitHooks(gwQuit: Gw | null): void {
  void import('./steam-playtime-tracker').then(({ stopSteamPlaytimeTracker }) => {
    stopSteamPlaytimeTracker()
  })
  if (gwQuit) {
    void import('./steam-stats-sync').then(({ flushSteamStatsToSteam }) =>
      flushSteamStatsToSteam(gwQuit)
    )
  }
}
