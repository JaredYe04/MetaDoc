import eventBus from '../../utils/event-bus.js'
import { attachLlmHost } from '../../core/host-runtime'
import { activatePluginById, deactivatePlugin } from '../../core/plugin-loader'
import { clearPluginContributions } from '../../core/host-runtime'
import { loadCommunityPlugins } from '../../core/community-plugin-loader'
import messageBridge from '../../bridge/message-bridge'
import type { AiCapabilityId } from './types'
import {
  AI_CAPABILITY_DEPENDENCIES,
  AI_CAPABILITY_UNLOAD_ORDER,
  CAPABILITY_PLUGIN_IDS
} from './types'

const loadedCapabilities = new Set<AiCapabilityId>()
const loadingPromises = new Map<AiCapabilityId, Promise<void>>()
let communityPluginsLoaded = false

async function ensureDependencies(id: AiCapabilityId): Promise<void> {
  for (const dep of AI_CAPABILITY_DEPENDENCIES[id] ?? []) {
    await ensureAiCapability(dep)
  }
}

async function loadLlmCore(): Promise<void> {
  const { createAiTask } = await import('../../utils/ai_tasks')
  const { AIService } = await import('../../services/AIService')
  attachLlmHost({
    isAvailable: () => AIService.isLLMAvailable(),
    createTask: createAiTask
  })
}

async function loadAgentCapability(): Promise<void> {
  const { initializeAgentTools } = await import('../../utils/agent-tools')
  await initializeAgentTools()
  for (const pluginId of CAPABILITY_PLUGIN_IDS.agent) {
    await activatePluginById(pluginId)
  }
}

async function loadRagCapability(): Promise<void> {
  if (messageBridge.getIpc()) {
    try {
      await messageBridge.invoke('rag:ensure-ready')
    } catch {
      // non-fatal if main process handler missing in web build
    }
  }
  for (const pluginId of CAPABILITY_PLUGIN_IDS.rag) {
    await activatePluginById(pluginId)
  }
}

async function activateCapabilityPlugins(id: AiCapabilityId): Promise<void> {
  for (const pluginId of CAPABILITY_PLUGIN_IDS[id]) {
    await activatePluginById(pluginId)
  }
}

async function loadCapabilityBody(id: AiCapabilityId): Promise<void> {
  switch (id) {
    case 'llm-core':
      await loadLlmCore()
      break
    case 'agent':
      await loadAgentCapability()
      break
    case 'rag':
      await loadRagCapability()
      break
    case 'completion':
    case 'editor-ai':
    case 'tool-windows':
      await activateCapabilityPlugins(id)
      break
    default:
      break
  }
}

async function ensureCommunityPluginsOnce(): Promise<void> {
  if (communityPluginsLoaded) return
  await loadCommunityPlugins()
  communityPluginsLoaded = true
}

export function isAiCapabilityLoaded(id: AiCapabilityId): boolean {
  return loadedCapabilities.has(id)
}

export function getLoadedAiCapabilities(): AiCapabilityId[] {
  return [...loadedCapabilities]
}

export async function ensureAiCapability(id: AiCapabilityId): Promise<void> {
  if (loadedCapabilities.has(id)) return
  const pending = loadingPromises.get(id)
  if (pending) return pending

  const task = (async () => {
    await ensureDependencies(id)
    await loadCapabilityBody(id)
    if (id !== 'llm-core') {
      await ensureCommunityPluginsOnce()
    }
    loadedCapabilities.add(id)
    eventBus.emit('ai-capability-loaded', id)
    if (id === 'llm-core') {
      eventBus.emit('ai-runtime-ready')
    }
  })()

  loadingPromises.set(id, task)
  try {
    await task
  } finally {
    loadingPromises.delete(id)
  }
}

export function isAiCapabilityLoading(id: AiCapabilityId): boolean {
  return loadingPromises.has(id)
}

export async function unloadAiCapability(id: AiCapabilityId): Promise<void> {
  if (!loadedCapabilities.has(id)) return

  const pluginIds = [...CAPABILITY_PLUGIN_IDS[id]].reverse()
  for (const pluginId of pluginIds) {
    await deactivatePlugin(pluginId)
  }

  if (id === 'llm-core') {
    attachLlmHost(undefined)
  }

  loadedCapabilities.delete(id)
  eventBus.emit('ai-capability-unloaded', id)
}

export async function unloadAllAiCapabilities(): Promise<void> {
  const { clearAiTasks } = await import('../../utils/ai_tasks')
  clearAiTasks()

  for (const id of AI_CAPABILITY_UNLOAD_ORDER) {
    if (!loadedCapabilities.has(id)) continue
    const pluginIds = [...CAPABILITY_PLUGIN_IDS[id]].reverse()
    for (const pluginId of pluginIds) {
      await deactivatePlugin(pluginId)
    }
    loadedCapabilities.delete(id)
    eventBus.emit('ai-capability-unloaded', id)
  }

  attachLlmHost(undefined)
  clearPluginContributions()
  communityPluginsLoaded = false
  eventBus.emit('ai-runtime-unloaded')
}
