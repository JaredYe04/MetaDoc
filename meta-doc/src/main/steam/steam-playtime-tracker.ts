import { BrowserWindow } from 'electron'
import type { GreenworksApi } from './greenworks-loader'
import { applySteamStatsReport } from './steam-stats-sync'
import { appStore } from '../app-store'

let intervalId: ReturnType<typeof setInterval> | null = null

/**
 * 任意主窗口前台聚焦时每秒累加 1 秒到本地统计并节流同步 Steam；
 * 若当前为专注模式（与渲染进程 setSetting('focusMode') 一致）则同时累加专注秒数。
 */
export function startSteamPlaytimeTracker(getGreenworks: () => GreenworksApi | null): void {
  if (intervalId) return
  intervalId = setInterval(() => {
    const w = BrowserWindow.getFocusedWindow()
    if (!w || w.isDestroyed() || w.isMinimized()) return
    const gw = getGreenworks()
    const focusOn = appStore.get('focusMode') === true
    applySteamStatsReport(gw, {
      sessionSecondsDelta: 1,
      ...(focusOn ? { focusSecondsDelta: 1 } : {})
    })
  }, 1000)
}

export function stopSteamPlaytimeTracker(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}
