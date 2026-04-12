import fs from 'fs'
import path from 'path'
import { appStore } from '../app-store'
import { getLlmStatisticsPath } from '../utils/path-service'
import { readTextFromCloud, saveTextToCloud } from './steam-cloud'
import type { GreenworksApi } from './greenworks-loader'

/** 与云端同步的设置键（子集，避免整库 electron-store 不兼容） */
export const STEAM_SYNC_SETTING_KEYS = [
  'globalTheme',
  'customThemeColor',
  'autoCheckUpdates',
  'updateChannel',
  'focusMode'
] as const

const META_KEY = 'steamSyncMeta'
const SETTINGS_CLOUD = 'settings.json'
const HISTORY_CLOUD = 'history.json'

type SteamSyncMeta = {
  settingsRemoteUpdatedAt: number
  historyRemoteUpdatedAt: number
}

function getMeta(): SteamSyncMeta {
  const m = appStore.get(META_KEY) as SteamSyncMeta | undefined
  return {
    settingsRemoteUpdatedAt: m?.settingsRemoteUpdatedAt ?? 0,
    historyRemoteUpdatedAt: m?.historyRemoteUpdatedAt ?? 0
  }
}

function setMeta(partial: Partial<SteamSyncMeta>): void {
  const cur = getMeta()
  appStore.set(META_KEY, { ...cur, ...partial })
}

type SettingsBlob = {
  updatedAt: number
  settings: Record<string, unknown>
}

type HistoryBlob = {
  updatedAt: number
  /** LLM 使用统计 JSON 原文（与 userData/llm-statistics.json 对齐） */
  llmStatisticsJson: string | null
}

function pickSettingsSubset(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of STEAM_SYNC_SETTING_KEYS) {
    if (appStore.has(k)) {
      out[k] = appStore.get(k)
    }
  }
  return out
}

function applySettingsSubset(sub: Record<string, unknown>): void {
  for (const k of STEAM_SYNC_SETTING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(sub, k)) {
      appStore.set(k, sub[k])
    }
  }
}

export async function pushSettingsToCloud(
  gw: GreenworksApi
): Promise<{ success: true } | { success: false; error: string }> {
  const blob: SettingsBlob = {
    updatedAt: Date.now(),
    settings: pickSettingsSubset()
  }
  const r = await saveTextToCloud(gw, SETTINGS_CLOUD, JSON.stringify(blob, null, 2))
  if (!r.success) {
    return r
  }
  setMeta({ settingsRemoteUpdatedAt: blob.updatedAt })
  return { success: true }
}

export async function pullSettingsFromCloud(
  gw: GreenworksApi
): Promise<{ success: true; applied: boolean } | { success: false; error: string }> {
  const r = await readTextFromCloud(gw, SETTINGS_CLOUD)
  if (!r.success) {
    return { success: false, error: r.error }
  }
  let blob: SettingsBlob
  try {
    blob = JSON.parse(r.content) as SettingsBlob
  } catch {
    return { success: false, error: 'invalid_settings_json' }
  }
  if (!blob || typeof blob.updatedAt !== 'number' || typeof blob.settings !== 'object') {
    return { success: false, error: 'invalid_settings_shape' }
  }
  const meta = getMeta()
  if (blob.updatedAt <= meta.settingsRemoteUpdatedAt) {
    return { success: true, applied: false }
  }
  applySettingsSubset(blob.settings)
  setMeta({ settingsRemoteUpdatedAt: blob.updatedAt })
  return { success: true, applied: true }
}

export async function pushHistoryToCloud(
  gw: GreenworksApi
): Promise<{ success: true } | { success: false; error: string }> {
  const statsPath = getLlmStatisticsPath()
  let llmStatisticsJson: string | null = null
  try {
    if (fs.existsSync(statsPath)) {
      llmStatisticsJson = fs.readFileSync(statsPath, 'utf8')
    }
  } catch {
    llmStatisticsJson = null
  }
  const blob: HistoryBlob = {
    updatedAt: Date.now(),
    llmStatisticsJson
  }
  const r = await saveTextToCloud(gw, HISTORY_CLOUD, JSON.stringify(blob, null, 2))
  if (!r.success) {
    return r
  }
  setMeta({ historyRemoteUpdatedAt: blob.updatedAt })
  return { success: true }
}

export async function pullHistoryFromCloud(
  gw: GreenworksApi
): Promise<{ success: true; applied: boolean } | { success: false; error: string }> {
  const r = await readTextFromCloud(gw, HISTORY_CLOUD)
  if (!r.success) {
    return { success: false, error: r.error }
  }
  let blob: HistoryBlob
  try {
    blob = JSON.parse(r.content) as HistoryBlob
  } catch {
    return { success: false, error: 'invalid_history_json' }
  }
  if (!blob || typeof blob.updatedAt !== 'number') {
    return { success: false, error: 'invalid_history_shape' }
  }
  const meta = getMeta()
  if (blob.updatedAt <= meta.historyRemoteUpdatedAt) {
    return { success: true, applied: false }
  }
  const statsPath = getLlmStatisticsPath()
  if (blob.llmStatisticsJson != null && blob.llmStatisticsJson !== '') {
    try {
      fs.mkdirSync(path.dirname(statsPath), { recursive: true })
      fs.writeFileSync(statsPath, blob.llmStatisticsJson, 'utf8')
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e)
      }
    }
  }
  setMeta({ historyRemoteUpdatedAt: blob.updatedAt })
  return { success: true, applied: true }
}

export function getSyncCoordinatorStatus(): SteamSyncMeta {
  return getMeta()
}
