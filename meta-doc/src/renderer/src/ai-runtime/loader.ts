import eventBus from '../utils/event-bus.js'
import { getSetting } from '../utils/settings.js'
import { attachLlmHost } from '../core/host-runtime'
import { deactivateAllPlugins, loadBuiltinPlugins } from '../core/plugin-loader'
import { loadCommunityPlugins } from '../core/community-plugin-loader'
import { builtinPluginLoaders } from '../plugins/builtin-manifests'

let loaded = false
let loading: Promise<void> | null = null

export async function loadAiRuntime(): Promise<void> {
  if (loaded) return
  if (loading) return loading

  loading = (async () => {
    const { createAiTask } = await import('../utils/ai_tasks')
    const { AIService } = await import('../services/AIService')

    attachLlmHost({
      isAvailable: () => AIService.isLLMAvailable(),
      createTask: createAiTask
    })

    const { initializeAgentTools } = await import('../utils/agent-tools')
    await initializeAgentTools()

    await loadBuiltinPlugins(builtinPluginLoaders)
    await loadCommunityPlugins()

    eventBus.emit('ai-runtime-ready')
    loaded = true
  })()

  try {
    await loading
  } finally {
    loading = null
  }
}

export async function unloadAiRuntime(): Promise<void> {
  if (!loaded) return
  const { clearAiTasks } = await import('../utils/ai_tasks')
  clearAiTasks()
  await deactivateAllPlugins()
  attachLlmHost(undefined)
  loaded = false
  eventBus.emit('ai-runtime-unloaded')
}

export async function syncAiRuntimeWithSettings(): Promise<void> {
  const enabled = (await getSetting('llmEnabled')) === true
  if (enabled) {
    await loadAiRuntime()
  } else {
    await unloadAiRuntime()
  }
}

export function isAiRuntimeLoaded(): boolean {
  return loaded
}

export function registerAiRuntimeToggleListener(): void {
  eventBus.on('ai-runtime-toggle', () => {
    void syncAiRuntimeWithSettings()
  })
}
