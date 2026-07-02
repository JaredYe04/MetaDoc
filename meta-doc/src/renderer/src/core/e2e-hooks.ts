import { isAiRuntimeLoaded } from '../ai-runtime/loader'
import { getActivePluginIds } from './plugin-loader'
import { pluginRegistry } from './host-runtime'
import { getLoadedAiCapabilities } from '../ai-runtime/capabilities'
import eventBus from '../utils/event-bus.js'
import { getSetting } from '../utils/settings.js'

export interface MetaDocE2ESnapshot {
  llmEnabled: boolean
  aiRuntimeLoaded: boolean
  loadedCapabilities: string[]
  activePluginIds: string[]
  contributionCounts: {
    leftMenuItems: number
    editorOverlays: number
    editorAccessories: number
    shellOverlays: number
  }
}

export async function getE2ESnapshot(): Promise<MetaDocE2ESnapshot> {
  return {
    llmEnabled: (await getSetting('llmEnabled')) === true,
    aiRuntimeLoaded: isAiRuntimeLoaded(),
    loadedCapabilities: getLoadedAiCapabilities(),
    activePluginIds: getActivePluginIds(),
    contributionCounts: {
      leftMenuItems: pluginRegistry.leftMenuItems.length,
      editorOverlays: pluginRegistry.editorOverlays.length,
      editorAccessories: pluginRegistry.editorAccessories.length,
      shellOverlays: pluginRegistry.shellOverlays.length
    }
  }
}

export async function setLlmEnabledForE2E(enabled: boolean): Promise<void> {
  const { setSetting, settings } = await import('../utils/settings.js')
  settings.llmEnabled = enabled
  await setSetting('llmEnabled', enabled)
  eventBus.emit('ai-runtime-toggle')
  await new Promise((resolve) => setTimeout(resolve, 100))
}

export async function ensureAgentCapabilityForE2E(): Promise<void> {
  const { ensureAiCapability } = await import('../ai-runtime/loader')
  await ensureAiCapability('agent')
  await new Promise((resolve) => setTimeout(resolve, 100))
}

export function installE2EHooks(): void {
  if (typeof window === 'undefined') return
  ;(
    window as Window & {
      __metadocE2E?: {
        getSnapshot: typeof getE2ESnapshot
        setLlmEnabled: typeof setLlmEnabledForE2E
        ensureAgentCapability: typeof ensureAgentCapabilityForE2E
      }
    }
  ).__metadocE2E = {
    getSnapshot: getE2ESnapshot,
    setLlmEnabled: setLlmEnabledForE2E,
    ensureAgentCapability: ensureAgentCapabilityForE2E
  }
}
