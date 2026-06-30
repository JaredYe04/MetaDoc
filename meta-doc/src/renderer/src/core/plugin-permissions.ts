import type { PluginPermission } from '../host-api'

export const KNOWN_PLUGIN_PERMISSIONS: readonly PluginPermission[] = [
  'documents.read',
  'documents.write',
  'outline.read',
  'outline.write',
  'llm.completion',
  'llm.chat',
  'settings.read',
  'settings.write',
  'main.rag',
  'main.terminal'
] as const

const KNOWN_SET = new Set<string>(KNOWN_PLUGIN_PERMISSIONS)

export class PluginPermissionError extends Error {
  constructor(permission: string) {
    super(`[plugin-sandbox] missing permission: ${permission}`)
    this.name = 'PluginPermissionError'
  }
}

export function isKnownPluginPermission(value: string): value is PluginPermission {
  return KNOWN_SET.has(value)
}

export function normalizePluginPermissions(
  permissions: string[] | undefined,
  options?: { strict?: boolean }
): PluginPermission[] {
  const strict = options?.strict ?? false
  const result: PluginPermission[] = []
  for (const raw of permissions ?? []) {
    if (isKnownPluginPermission(raw)) {
      result.push(raw)
      continue
    }
    if (strict) {
      throw new Error(`[plugin-sandbox] unknown permission "${raw}"`)
    }
    console.warn(`[plugin-loader] unknown permission "${raw}"`)
  }
  return result
}

export function hasPluginPermission(
  granted: ReadonlySet<PluginPermission>,
  permission: PluginPermission
): boolean {
  return granted.has(permission)
}

export function assertPluginPermission(
  granted: ReadonlySet<PluginPermission>,
  permission: PluginPermission
): void {
  if (!hasPluginPermission(granted, permission)) {
    throw new PluginPermissionError(permission)
  }
}

export function hasAnyLlmPermission(granted: ReadonlySet<PluginPermission>): boolean {
  return granted.has('llm.completion') || granted.has('llm.chat')
}
