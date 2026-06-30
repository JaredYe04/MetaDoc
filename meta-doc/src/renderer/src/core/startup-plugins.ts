import { loadBuiltinPlugins } from './plugin-loader'
import { startupPluginLoaders } from '../plugins/builtin-manifests'

let startupLoaded = false

export async function loadStartupPlugins(): Promise<void> {
  if (startupLoaded) return
  await loadBuiltinPlugins(startupPluginLoaders, { activationTrigger: 'onStartup' })
  startupLoaded = true
}

export function isStartupPluginsLoaded(): boolean {
  return startupLoaded
}
