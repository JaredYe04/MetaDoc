import eventBus from '../utils/event-bus.js'
import { getSetting } from '../utils/settings.js'
import {
  ensureAiCapability,
  isAiCapabilityLoaded,
  isAiCapabilityLoading,
  unloadAllAiCapabilities,
  unloadAiCapability,
  getLoadedAiCapabilities,
  type AiCapabilityId
} from './capabilities'

export type { AiCapabilityId } from './capabilities'
export {
  ensureAiCapability,
  getLoadedAiCapabilities,
  isAiCapabilityLoaded,
  isAiCapabilityLoading,
  unloadAiCapability,
  unloadAllAiCapabilities
} from './capabilities'

const ALL_CAPABILITIES: AiCapabilityId[] = [
  'llm-core',
  'completion',
  'editor-ai',
  'tool-windows',
  'rag',
  'agent'
]

/** Load every AI capability (debug / migration helper). */
export async function loadAiRuntime(): Promise<void> {
  for (const id of ALL_CAPABILITIES) {
    await ensureAiCapability(id)
  }
}

export async function unloadAiRuntime(): Promise<void> {
  await unloadAllAiCapabilities()
}

export async function syncAiRuntimeWithSettings(): Promise<void> {
  const enabled = (await getSetting('llmEnabled')) === true
  if (enabled) {
    await ensureAiCapability('llm-core')
  } else {
    await unloadAllAiCapabilities()
  }
}

/** True when minimal LLM stack (`llm-core`) is loaded. */
export function isAiRuntimeLoaded(): boolean {
  return isAiCapabilityLoaded('llm-core')
}

export function registerAiRuntimeToggleListener(): void {
  eventBus.on('ai-runtime-toggle', () => {
    void syncAiRuntimeWithSettings()
  })
}
