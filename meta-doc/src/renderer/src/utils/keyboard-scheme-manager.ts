/**
 * 快捷键方案管理：持久化、当前方案解析、自定义方案 CRUD
 */

import { getSetting, setSetting } from './settings.js'
import {
  getDefaultSchemes,
  getDefaultSchemeIdForPlatform,
  BUILTIN_SCHEME_IDS
} from './keyboard-scheme-defaults'
import type { KeyScheme, ShortcutBindings, ShortcutActionId } from './keyboard-scheme-types'
import {
  SHORTCUT_ACTION_IDS,
  normalizeBindings,
  normalizeBindingValue
} from './keyboard-scheme-types'

const STORAGE_KEY_ACTIVE = 'activeKeySchemeId'
const STORAGE_KEY_SCHEMES = 'customKeySchemes'
const STORAGE_KEY_BUILTIN_OVERRIDES = 'builtinKeySchemeOverrides'
const FIRST_RUN_KEY = 'keyboardSchemeFirstRunDone'

let cachedActiveId: string | null = null
let cachedCustomSchemes: KeyScheme[] | null = null
let cachedBuiltinOverrides: Record<string, ShortcutBindings> | null = null

const builtinSchemes = getDefaultSchemes()

function getBuiltinScheme(id: string): KeyScheme | undefined {
  return builtinSchemes.find((s) => s.id === id)
}

/** 获取内置方案的本地覆盖（用户对默认方案的修改） */
async function getBuiltinOverrides(): Promise<Record<string, ShortcutBindings>> {
  if (cachedBuiltinOverrides !== null) return cachedBuiltinOverrides
  const raw = await getSetting(STORAGE_KEY_BUILTIN_OVERRIDES)
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const out: Record<string, ShortcutBindings> = {}
    for (const [id, val] of Object.entries(raw)) {
      if (val && typeof val === 'object') out[id] = normalizeBindings(val as ShortcutBindings)
    }
    cachedBuiltinOverrides = out
    return out
  }
  cachedBuiltinOverrides = {}
  return cachedBuiltinOverrides
}

async function setBuiltinOverrides(overrides: Record<string, ShortcutBindings>): Promise<void> {
  cachedBuiltinOverrides = overrides
  await setSetting(STORAGE_KEY_BUILTIN_OVERRIDES, overrides)
}

/** 合并默认绑定与覆盖（覆盖优先） */
function mergeBindings(
  base: ShortcutBindings,
  overrides: ShortcutBindings | undefined
): ShortcutBindings {
  if (!overrides || !Object.keys(overrides).length) return { ...base }
  const out = { ...base }
  for (const [actionId, arr] of Object.entries(overrides)) {
    const a = normalizeBindingValue(arr as string | string[])
    if (a.length) out[actionId as ShortcutActionId] = a
  }
  return out
}

/** 获取当前选中的方案 ID（持久化）；首次启动按系统设置默认 */
export async function getActiveKeySchemeId(): Promise<string> {
  if (cachedActiveId !== null) return cachedActiveId
  const stored = await getSetting(STORAGE_KEY_ACTIVE)
  if (typeof stored === 'string' && stored) {
    cachedActiveId = stored
    return cachedActiveId
  }
  // 首次启动：按系统选默认方案并写入
  const firstRun = await getSetting(FIRST_RUN_KEY)
  if (firstRun === undefined || firstRun === null) {
    const defaultId = getDefaultSchemeIdForPlatform()
    await setSetting(STORAGE_KEY_ACTIVE, defaultId)
    await setSetting(FIRST_RUN_KEY, true)
    cachedActiveId = defaultId
    return defaultId
  }
  // 之前已跑过但没存过 active（例如旧版本），用系统默认
  const defaultId = getDefaultSchemeIdForPlatform()
  cachedActiveId = defaultId
  return defaultId
}

/** 设置当前选中的方案 ID 并持久化 */
export async function setActiveKeySchemeId(id: string): Promise<void> {
  cachedActiveId = id
  await setSetting(STORAGE_KEY_ACTIVE, id)
}

/** 获取自定义方案列表（持久化） */
export async function getCustomKeySchemes(): Promise<KeyScheme[]> {
  if (cachedCustomSchemes !== null) return cachedCustomSchemes
  const raw = await getSetting(STORAGE_KEY_SCHEMES)
  if (Array.isArray(raw)) {
    cachedCustomSchemes = raw
      .filter(
        (s): s is KeyScheme =>
          s && typeof s === 'object' && typeof s.id === 'string' && typeof s.name === 'string'
      )
      .map((s) => ({ ...s, bindings: normalizeBindings(s.bindings) }))
    return cachedCustomSchemes
  }
  cachedCustomSchemes = []
  return cachedCustomSchemes
}

async function persistCustomSchemes(schemes: KeyScheme[]): Promise<void> {
  cachedCustomSchemes = schemes
  await setSetting(STORAGE_KEY_SCHEMES, schemes)
}

/** 获取所有方案（内置合并覆盖 + 自定义） */
export async function getAllKeySchemes(): Promise<KeyScheme[]> {
  const custom = await getCustomKeySchemes()
  const overrides = await getBuiltinOverrides()
  const builtinWithOverrides = builtinSchemes.map((s) => {
    const ov = overrides[s.id]
    return { ...s, bindings: mergeBindings(s.bindings, ov) }
  })
  return [...builtinWithOverrides, ...custom]
}

/** 根据 ID 取方案（内置会合并覆盖） */
export async function getKeySchemeById(id: string): Promise<KeyScheme | undefined> {
  const builtin = getBuiltinScheme(id)
  if (builtin) {
    const overrides = await getBuiltinOverrides()
    return { ...builtin, bindings: mergeBindings(builtin.bindings, overrides[id]) }
  }
  const custom = await getCustomKeySchemes()
  return custom.find((s) => s.id === id)
}

/**
 * 获取当前生效的绑定表（用于 useGlobalShortcuts）
 * 若当前选中的是自定义方案则用其 bindings，否则用对应内置方案的 bindings
 */
export async function getEffectiveBindings(): Promise<ShortcutBindings> {
  const activeId = await getActiveKeySchemeId()
  const scheme = await getKeySchemeById(activeId)
  if (scheme?.bindings) return normalizeBindings(scheme.bindings)

  const { detectPlatform } = await import('./keyboard-scheme-defaults')
  const platform = detectPlatform()
  const defaultId =
    platform === 'mac'
      ? BUILTIN_SCHEME_IDS.mac
      : platform === 'linux'
        ? BUILTIN_SCHEME_IDS.linux
        : BUILTIN_SCHEME_IDS.win
  const defaultScheme = getBuiltinScheme(defaultId)
  return defaultScheme ? normalizeBindings(defaultScheme.bindings) : {}
}

/** 新增自定义方案（名称可重复） */
export async function addKeyScheme(name: string, bindings?: ShortcutBindings): Promise<KeyScheme> {
  const custom = await getCustomKeySchemes()
  const id = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
  const now = Date.now()
  const defaults = getDefaultSchemes()
  const platformDefault = defaults[0].bindings // win as base for new scheme
  const base = normalizeBindings(platformDefault)
  const scheme: KeyScheme = {
    id,
    name: name.trim() || id,
    isBuiltin: false,
    bindings: bindings ? { ...base, ...normalizeBindings(bindings) } : { ...base },
    createdAt: now,
    updatedAt: now
  }
  custom.push(scheme)
  await persistCustomSchemes(custom)
  return scheme
}

/** 更新方案（名称仅自定义；绑定支持内置，内置写入覆盖存储） */
export async function updateKeyScheme(
  id: string,
  updates: { name?: string; bindings?: ShortcutBindings }
): Promise<boolean> {
  const builtin = getBuiltinScheme(id)
  if (builtin) {
    if (updates.bindings === undefined) return true
    const overrides = await getBuiltinOverrides()
    const next = { ...overrides, [id]: normalizeBindings(updates.bindings) }
    await setBuiltinOverrides(next)
    return true
  }
  const custom = await getCustomKeySchemes()
  const idx = custom.findIndex((s) => s.id === id)
  if (idx < 0) return false
  if (updates.name !== undefined) custom[idx].name = updates.name.trim() || custom[idx].name
  if (updates.bindings !== undefined)
    custom[idx].bindings = { ...custom[idx].bindings, ...normalizeBindings(updates.bindings) }
  custom[idx].updatedAt = Date.now()
  await persistCustomSchemes(custom)
  return true
}

/** 删除自定义方案 */
export async function deleteKeyScheme(id: string): Promise<boolean> {
  if (getBuiltinScheme(id)) return false
  const custom = await getCustomKeySchemes()
  const next = custom.filter((s) => s.id !== id)
  if (next.length === custom.length) return false
  await persistCustomSchemes(next)
  if (cachedActiveId === id) {
    cachedActiveId = null
    await setSetting(STORAGE_KEY_ACTIVE, getDefaultSchemeIdForPlatform())
  }
  return true
}

/** 导出方案为 JSON 字符串 */
export function exportKeyScheme(scheme: KeyScheme): string {
  return JSON.stringify(
    {
      id: scheme.id,
      name: scheme.name,
      isBuiltin: scheme.isBuiltin,
      platform: scheme.platform,
      bindings: scheme.bindings
    },
    null,
    2
  )
}

/** 从 JSON 导入为自定义方案（生成新 id） */
export async function importKeyScheme(
  jsonString: string
): Promise<{ scheme: KeyScheme; errors?: string[] }> {
  try {
    const data = JSON.parse(jsonString)
    if (!data || typeof data.name !== 'string') {
      return { scheme: null as any, errors: ['Invalid format: missing name'] }
    }
    const bindings: ShortcutBindings = {}
    if (data.bindings && typeof data.bindings === 'object') {
      for (const actionId of SHORTCUT_ACTION_IDS) {
        const v = data.bindings[actionId]
        if (typeof v === 'string') bindings[actionId as ShortcutActionId] = [v]
        else if (Array.isArray(v))
          bindings[actionId as ShortcutActionId] = v.filter((s) => typeof s === 'string')
      }
    }
    const scheme = await addKeyScheme(
      data.name,
      Object.keys(bindings).length > 0 ? bindings : undefined
    )
    return { scheme }
  } catch (e) {
    return {
      scheme: null as any,
      errors: [e instanceof Error ? e.message : String(e)]
    }
  }
}

/** 清除某内置方案的本地覆盖，恢复为代码默认 */
export async function clearBuiltinSchemeOverrides(schemeId: string): Promise<boolean> {
  const builtin = getBuiltinScheme(schemeId)
  if (!builtin) return false
  const overrides = await getBuiltinOverrides()
  const next = { ...overrides }
  delete next[schemeId]
  await setBuiltinOverrides(next)
  return true
}

/** 清除内存缓存（例如设置页切换方案后希望立即生效） */
export function clearKeySchemeCache(): void {
  cachedActiveId = null
  cachedCustomSchemes = null
  cachedBuiltinOverrides = null
}
