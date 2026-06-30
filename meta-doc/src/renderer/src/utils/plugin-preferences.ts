import { getSetting, setSetting, settings } from './settings'

export async function getDisabledPluginIds(): Promise<string[]> {
  const value = await getSetting('disabledPluginIds')
  return normalizeDisabledPluginIds(value)
}

export function getDisabledPluginIdsSync(): string[] {
  return normalizeDisabledPluginIds(settings.disabledPluginIds)
}

function normalizeDisabledPluginIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((id): id is string => typeof id === 'string' && id.length > 0)
}

export function isPluginDisabled(id: string, disabledIds?: string[]): boolean {
  const list = disabledIds ?? getDisabledPluginIdsSync()
  return list.includes(id)
}

export async function setPluginDisabled(id: string, disabled: boolean): Promise<void> {
  const current = getDisabledPluginIdsSync()
  const next = disabled
    ? [...new Set([...current, id])]
    : current.filter((pluginId) => pluginId !== id)
  settings.disabledPluginIds = next
  await setSetting('disabledPluginIds', next)
}
