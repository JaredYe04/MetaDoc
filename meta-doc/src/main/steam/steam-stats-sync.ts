import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { createMainLogger } from '../logger'
import {
  STAT_SECONDS_PLAYED,
  STAT_AI_REQUESTS,
  STAT_CHARS_TYPED,
  STEAM_LOCAL_STATS_FILENAME,
  type SteamLocalStatsFile
} from '../../common/steam-stats'
import type { GreenworksApi } from './greenworks-loader'
import { getLlmStatisticsPath } from '../utils/path-service'

const log = createMainLogger('SteamStats')

function statsFilePath(): string {
  return join(app.getPath('userData'), STEAM_LOCAL_STATS_FILENAME)
}

function defaultLocal(): SteamLocalStatsFile {
  return { secondsPlayed: 0, charsTyped: 0 }
}

export function loadLocalSteamStatsFile(): SteamLocalStatsFile {
  const p = statsFilePath()
  try {
    if (!existsSync(p)) {
      return defaultLocal()
    }
    const raw = readFileSync(p, 'utf8')
    const j = JSON.parse(raw) as Partial<SteamLocalStatsFile>
    const secondsPlayed =
      typeof j.secondsPlayed === 'number' && Number.isFinite(j.secondsPlayed)
        ? Math.max(0, Math.floor(j.secondsPlayed))
        : 0
    const charsTyped =
      typeof j.charsTyped === 'number' && Number.isFinite(j.charsTyped)
        ? Math.max(0, Math.floor(j.charsTyped))
        : 0
    return { secondsPlayed, charsTyped }
  } catch (e) {
    log.warn('loadLocalSteamStatsFile failed', e)
    return defaultLocal()
  }
}

function saveLocalSteamStatsFile(data: SteamLocalStatsFile): void {
  try {
    writeFileSync(statsFilePath(), JSON.stringify(data, null, 2), 'utf8')
  } catch (e) {
    log.warn('saveLocalSteamStatsFile failed', e)
  }
}

function readLlmTotalRequests(): number {
  try {
    const p = getLlmStatisticsPath()
    if (!existsSync(p)) return 0
    const raw = readFileSync(p, 'utf8')
    const j = JSON.parse(raw) as { totalRequests?: number }
    const n = j.totalRequests
    return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
  } catch {
    return 0
  }
}

/** greenworks：getStatInt 为同步，失败返回 undefined */
function readStatIntFromGw(gw: GreenworksApi, name: string): number {
  try {
    if (typeof gw.getStatInt !== 'function') return 0
    const v = gw.getStatInt(name)
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0
  } catch {
    return 0
  }
}

function setStatIfAvailable(gw: GreenworksApi, name: string, value: number): void {
  try {
    if (typeof gw.setStat !== 'function') return
    gw.setStat(name, value)
  } catch (e) {
    log.warn(`setStat ${name} failed`, e)
  }
}

function storeStatsIfAvailable(gw: GreenworksApi): Promise<void> {
  return new Promise((resolve) => {
    if (typeof gw.storeStats !== 'function') {
      resolve()
      return
    }
    try {
      gw.storeStats(
        () => resolve(),
        (err: Error | string) => {
          log.warn('storeStats error', err)
          resolve()
        }
      )
    } catch (e) {
      log.warn('storeStats threw', e)
      resolve()
    }
  })
}

/**
 * 展示值：本地与 Steam 取较大者（避免云统计未就绪或回退时显示变小）。
 * 写入 Steam：同样对三路取 max 后再 setStat + storeStats。
 */
export type SteamProfileStats = {
  secondsPlayed: number
  aiRequests: number
  charsTyped: number
}

export function getMergedSteamProfileStats(gw: GreenworksApi | null): SteamProfileStats {
  const local = loadLocalSteamStatsFile()
  const aiFile = readLlmTotalRequests()
  const steamSec = gw ? readStatIntFromGw(gw, STAT_SECONDS_PLAYED) : 0
  const steamAi = gw ? readStatIntFromGw(gw, STAT_AI_REQUESTS) : 0
  const steamChars = gw ? readStatIntFromGw(gw, STAT_CHARS_TYPED) : 0
  return {
    secondsPlayed: Math.max(local.secondsPlayed, steamSec),
    aiRequests: Math.max(aiFile, steamAi),
    charsTyped: Math.max(local.charsTyped, steamChars)
  }
}

let storeStatsTimer: ReturnType<typeof setTimeout> | null = null
const STORE_STATS_DEBOUNCE_MS = 60_000

export function scheduleSteamStatsStore(gw: GreenworksApi): void {
  if (storeStatsTimer) {
    clearTimeout(storeStatsTimer)
  }
  storeStatsTimer = setTimeout(() => {
    storeStatsTimer = null
    void flushSteamStatsToSteam(gw)
  }, STORE_STATS_DEBOUNCE_MS)
}

export async function flushSteamStatsToSteam(gw: GreenworksApi): Promise<void> {
  const merged = getMergedSteamProfileStats(gw)
  setStatIfAvailable(gw, STAT_SECONDS_PLAYED, merged.secondsPlayed)
  setStatIfAvailable(gw, STAT_AI_REQUESTS, merged.aiRequests)
  setStatIfAvailable(gw, STAT_CHARS_TYPED, merged.charsTyped)
  await storeStatsIfAvailable(gw)
}

export type SteamStatsReportPayload = {
  /** 本次会话新增前台秒数（由主进程计时器传入） */
  sessionSecondsDelta?: number
  /** 渲染进程累计的输入字符增量 */
  charsDelta?: number
  /** LLM 保存后的 totalRequests（与 llm-statistics.json 一致） */
  aiRequestsTotal?: number
}

/**
 * 应用渲染进程/计时器上报；更新本地 JSON 并节流 storeStats。
 */
export function applySteamStatsReport(gw: GreenworksApi | null, payload: SteamStatsReportPayload): void {
  const local = loadLocalSteamStatsFile()
  let changed = false
  if (typeof payload.sessionSecondsDelta === 'number' && payload.sessionSecondsDelta > 0) {
    local.secondsPlayed += Math.floor(payload.sessionSecondsDelta)
    changed = true
  }
  if (typeof payload.charsDelta === 'number' && payload.charsDelta > 0) {
    local.charsTyped += Math.floor(payload.charsDelta)
    changed = true
  }
  if (changed) {
    saveLocalSteamStatsFile(local)
  }
  if (gw && (changed || typeof payload.aiRequestsTotal === 'number')) {
    scheduleSteamStatsStore(gw)
  }
}
