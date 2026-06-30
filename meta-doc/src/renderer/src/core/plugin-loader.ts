import type { MetaDocPlugin, PluginManifest } from '../host-api'
import { clearPluginContributions, getHost, isAiRuntimeActive } from './host-runtime'
import { isPluginDisabled } from '../utils/plugin-preferences'
import { manifestMatchesActivation, type ActivationTrigger } from './activation-events'
import { normalizePluginPermissions } from './plugin-permissions'
import { createSandboxedHost } from './sandboxed-host'

export { manifestMatchesActivation, type ActivationTrigger } from './activation-events'

export interface ActivatePluginOptions {
  /** Community plugins from userData/plugins — Host API is permission-gated */
  sandbox?: boolean
}

const activePlugins = new Map<string, MetaDocPlugin>()
const disposers = new Map<string, Array<() => void>>()
const communityPluginIds = new Set<string>()

function validateManifestPermissions(manifest: PluginManifest, strict: boolean): void {
  normalizePluginPermissions(manifest.permissions, { strict })
}

export function registerPluginDisposer(pluginId: string, dispose: () => void): void {
  const list = disposers.get(pluginId) ?? []
  list.push(dispose)
  disposers.set(pluginId, list)
}

export async function activatePlugin(
  plugin: MetaDocPlugin,
  options?: ActivatePluginOptions
): Promise<void> {
  if (activePlugins.has(plugin.manifest.id)) {
    return
  }
  if (isPluginDisabled(plugin.manifest.id)) {
    return
  }
  if (plugin.manifest.id.startsWith('metadoc.builtin.') && options?.sandbox) {
    console.warn(`[plugin-loader] refused sandbox activation for builtin id ${plugin.manifest.id}`)
    return
  }

  const sandbox = options?.sandbox === true
  validateManifestPermissions(plugin.manifest, sandbox)

  const permissions = normalizePluginPermissions(plugin.manifest.permissions)
  const host = sandbox ? createSandboxedHost(getHost(), permissions) : getHost()
  const ctx = { host, manifest: plugin.manifest }

  await plugin.activate(ctx)
  activePlugins.set(plugin.manifest.id, plugin)
  if (sandbox) {
    communityPluginIds.add(plugin.manifest.id)
  }
}

export async function deactivatePlugin(pluginId: string): Promise<void> {
  const plugin = activePlugins.get(pluginId)
  if (!plugin) return
  await plugin.deactivate?.()
  const ds = disposers.get(pluginId) ?? []
  ds.forEach((d) => d())
  disposers.delete(pluginId)
  activePlugins.delete(pluginId)
  communityPluginIds.delete(pluginId)
}

export async function deactivateAllPlugins(): Promise<void> {
  const ids = [...activePlugins.keys()]
  for (const id of ids) {
    await deactivatePlugin(id)
  }
  clearPluginContributions()
  communityPluginIds.clear()
}

export async function loadBuiltinPlugins(
  loaders: Array<() => Promise<{ default: MetaDocPlugin }>>,
  options?: { activationTrigger?: ActivationTrigger }
): Promise<void> {
  const trigger = options?.activationTrigger ?? 'onLlmEnabled'
  for (const load of loaders) {
    const mod = await load()
    if (manifestMatchesActivation(mod.default.manifest, trigger)) {
      await activatePlugin(mod.default)
    }
  }
}

export function getActivePluginIds(): string[] {
  return [...activePlugins.keys()]
}

export function isCommunityPluginActive(pluginId: string): boolean {
  return communityPluginIds.has(pluginId)
}

export async function activatePluginById(pluginId: string): Promise<boolean> {
  const loader = builtinPluginLoaderById[pluginId]
  if (!loader) return false
  const mod = await loader()
  await activatePlugin(mod.default)
  return activePlugins.has(pluginId)
}

export async function setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
  const { setPluginDisabled } = await import('../utils/plugin-preferences')
  await setPluginDisabled(pluginId, !enabled)
  if (!enabled) {
    await deactivatePlugin(pluginId)
    return
  }
  if (!activePlugins.has(pluginId)) {
    await activatePluginById(pluginId)
  }
}

const builtinPluginLoaderById: Record<string, () => Promise<{ default: MetaDocPlugin }>> = {}

export function registerBuiltinPluginLoader(
  id: string,
  loader: () => Promise<{ default: MetaDocPlugin }>
): void {
  builtinPluginLoaderById[id] = loader
}

export { isAiRuntimeActive }
