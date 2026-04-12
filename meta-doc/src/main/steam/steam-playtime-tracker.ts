import { BrowserWindow } from 'electron'
import type { GreenworksApi } from './greenworks-loader'
import { applySteamStatsReport } from './steam-stats-sync'

let intervalId: ReturnType<typeof setInterval> | null = null

/**
 * 任意主窗口前台聚焦时每秒累加 1 秒到本地统计并节流同步 Steam。
 */
export function startSteamPlaytimeTracker(getGreenworks: () => GreenworksApi | null): void {
  if (intervalId) return
  intervalId = setInterval(() => {
    const w = BrowserWindow.getFocusedWindow()
    if (!w || w.isDestroyed() || w.isMinimized()) return
    const gw = getGreenworks()
    applySteamStatsReport(gw, { sessionSecondsDelta: 1 })
  }, 1000)
}

export function stopSteamPlaytimeTracker(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}
