import { isElectronEnv } from '../utils/event-bus'
import messageBridge from '../bridge/message-bridge'
import type { MetaDocPlugin } from '../host-api'
import { activatePlugin } from './plugin-loader'

export interface CommunityPluginManifest {
  id: string
  name: string
  version: string
  entry: string
  permissions?: string[]
}

export interface CommunityPluginEntryResolution {
  entryUrl: string
  manifest: CommunityPluginManifest
}

/**
 * Loads community plugins from userData/plugins/<id>/metadoc-plugin.json.
 * Entry modules are dynamically imported in the renderer (sandboxed Host API).
 */
export async function loadCommunityPlugins(): Promise<void> {
  if (!isElectronEnv()) return

  let manifests: CommunityPluginManifest[] = []
  try {
    const result = await messageBridge.invoke('community-plugins:list')
    manifests = Array.isArray(result) ? (result as CommunityPluginManifest[]) : []
  } catch {
    return
  }

  for (const manifest of manifests) {
    try {
      const resolved = (await messageBridge.invoke(
        'community-plugins:resolve-entry',
        manifest.id
      )) as CommunityPluginEntryResolution | null

      if (!resolved?.entryUrl) {
        console.warn(`[community-plugins] skipped ${manifest.id}: entry not resolved`)
        continue
      }

      const mod = await import(/* @vite-ignore */ resolved.entryUrl)
      if (!mod || typeof mod !== 'object' || !('default' in mod)) {
        console.warn(`[community-plugins] skipped ${manifest.id}: invalid entry export`)
        continue
      }

      const plugin = (mod as { default: MetaDocPlugin }).default
      if (plugin.manifest?.id && plugin.manifest.id !== manifest.id) {
        console.warn(
          `[community-plugins] skipped ${manifest.id}: manifest id mismatch (${plugin.manifest.id})`
        )
        continue
      }

      await activatePlugin(plugin, { sandbox: true })
    } catch (error) {
      console.warn(`[community-plugins] failed to load ${manifest.id}`, error)
    }
  }
}
