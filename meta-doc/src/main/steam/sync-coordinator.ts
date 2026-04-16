import fs from 'fs'
import path from 'path'
import { appStore } from '../app-store'
import { getLlmStatisticsPath } from '../utils/path-service'
import { readTextFromCloud, saveTextToCloud } from './steam-cloud'
import type { GreenworksApi } from './greenworks-loader'
import {
  mergeSettingsFromCloudPull,
  pickSettingsForCloudPush,
  STEAM_CLOUD_EXCLUDED_TOP_LEVEL_KEYS
} from './steam-settings-sanitize'
import {
  exportUserTemplatesForCloud,
  importUserTemplatesFromCloudPayload
} from '../user-templates/user-templates-store'
import {
  applyAgentPackPayload,
  pushAgentPackToCloud,
  readAgentPackFromCloud
} from './steam-agent-pack-sync'
import { createMainLogger } from '../logger'
import { initSteam, getGreenworksOrNull } from './steam-state'

const userTemplatesAutoSyncLog = createMainLogger('SteamUserTemplatesAutoSync')

const META_KEY = 'steamSyncMeta'
const SETTINGS_CLOUD = 'settings.json'
const HISTORY_CLOUD = 'history.json'
const USER_TEMPLATES_CLOUD = 'cloud/user-templates.json'

type SteamSyncMeta = {
  settingsRemoteUpdatedAt: number
  historyRemoteUpdatedAt: number
  userTemplatesRemoteUpdatedAt: number
  agentPackRemoteUpdatedAt: number
}

function getMeta(): SteamSyncMeta {
  const m = appStore.get(META_KEY) as SteamSyncMeta | undefined
  return {
    settingsRemoteUpdatedAt: m?.settingsRemoteUpdatedAt ?? 0,
    historyRemoteUpdatedAt: m?.historyRemoteUpdatedAt ?? 0,
    userTemplatesRemoteUpdatedAt: m?.userTemplatesRemoteUpdatedAt ?? 0,
    agentPackRemoteUpdatedAt: m?.agentPackRemoteUpdatedAt ?? 0
  }
}

function setMeta(partial: Partial<SteamSyncMeta>): void {
  const cur = getMeta()
  appStore.set(META_KEY, { ...cur, ...partial })
}

type SettingsBlob = {
  updatedAt: number
  /** 与 electron-store 对齐的扁平键值（已剔除敏感字段与 steamSyncMeta） */
  settings: Record<string, unknown>
}

type HistoryBlob = {
  updatedAt: number
  /** LLM 使用统计 JSON 原文（与 userData/llm-statistics.json 对齐） */
  llmStatisticsJson: string | null
}

function listAppStoreKeys(): string[] {
  try {
    return Object.keys(appStore.store as Record<string, unknown>)
  } catch {
    return []
  }
}

function pickAllSettingsForCloud(): Record<string, unknown> {
  return pickSettingsForCloudPush(
    (key) => appStore.get(key),
    (key) => appStore.has(key),
    listAppStoreKeys
  )
}

function applySettingsFromCloud(sub: Record<string, unknown>): void {
  for (const key of Object.keys(sub)) {
    if (STEAM_CLOUD_EXCLUDED_TOP_LEVEL_KEYS.has(key)) continue
    const cur = appStore.get(key)
    const merged = mergeSettingsFromCloudPull(cur, sub[key])
    appStore.set(key, merged as never)
  }
}

export async function pushSettingsToCloud(
  gw: GreenworksApi
): Promise<{ success: true } | { success: false; error: string }> {
  const blob: SettingsBlob = {
    updatedAt: Date.now(),
    settings: pickAllSettingsForCloud()
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
  applySettingsFromCloud(blob.settings)
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

type UserTemplatesBlob = {
  updatedAt: number
  templates: ReturnType<typeof exportUserTemplatesForCloud>
}

export async function pushUserTemplatesToCloud(
  gw: GreenworksApi
): Promise<{ success: true } | { success: false; error: string }> {
  const blob: UserTemplatesBlob = {
    updatedAt: Date.now(),
    templates: exportUserTemplatesForCloud()
  }
  const r = await saveTextToCloud(gw, USER_TEMPLATES_CLOUD, JSON.stringify(blob, null, 2))
  if (!r.success) {
    return r
  }
  setMeta({ userTemplatesRemoteUpdatedAt: blob.updatedAt })
  return { success: true }
}

export async function pullUserTemplatesFromCloud(
  gw: GreenworksApi
): Promise<{ success: true; applied: boolean } | { success: false; error: string }> {
  const r = await readTextFromCloud(gw, USER_TEMPLATES_CLOUD)
  if (!r.success) {
    return { success: false, error: r.error }
  }
  let blob: UserTemplatesBlob
  try {
    blob = JSON.parse(r.content) as UserTemplatesBlob
  } catch {
    return { success: false, error: 'invalid_user_templates_json' }
  }
  if (!blob || typeof blob.updatedAt !== 'number' || !Array.isArray(blob.templates)) {
    return { success: false, error: 'invalid_user_templates_shape' }
  }
  const meta = getMeta()
  if (blob.updatedAt <= meta.userTemplatesRemoteUpdatedAt) {
    return { success: true, applied: false }
  }
  try {
    importUserTemplatesFromCloudPayload(blob.templates)
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e)
    }
  }
  setMeta({ userTemplatesRemoteUpdatedAt: blob.updatedAt })
  return { success: true, applied: true }
}

export async function pushAgentPackBundleToCloud(
  gw: GreenworksApi
): Promise<{ success: true } | { success: false; error: string }> {
  const pr = await pushAgentPackToCloud(gw)
  if (!pr.success) {
    return pr
  }
  setMeta({ agentPackRemoteUpdatedAt: pr.updatedAt })
  return { success: true }
}

export async function pullAgentPackBundleFromCloud(
  gw: GreenworksApi
): Promise<{ success: true; applied: boolean } | { success: false; error: string }> {
  const rr = await readAgentPackFromCloud(gw)
  if (!rr.success) {
    return { success: false, error: rr.error }
  }
  const blob = rr.payload
  if (!blob || typeof blob.updatedAt !== 'number') {
    return { success: false, error: 'invalid_agent_pack_shape' }
  }
  const meta = getMeta()
  if (blob.updatedAt <= meta.agentPackRemoteUpdatedAt) {
    return { success: true, applied: false }
  }
  try {
    await applyAgentPackPayload(blob)
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e)
    }
  }
  setMeta({ agentPackRemoteUpdatedAt: blob.updatedAt })
  return { success: true, applied: true }
}

/** 用户模板本地变更后的 fire-and-forget 上传（Steam 未就绪时静默跳过） */
export function schedulePushUserTemplatesToCloudIfSteamReady(): void {
  try {
    initSteam()
    const gw = getGreenworksOrNull()
    if (!gw) return
    void pushUserTemplatesToCloud(gw).catch((e) => {
      userTemplatesAutoSyncLog.warn('auto push user templates failed', e)
    })
  } catch (e) {
    userTemplatesAutoSyncLog.warn('schedulePushUserTemplatesToCloudIfSteamReady', e)
  }
}
