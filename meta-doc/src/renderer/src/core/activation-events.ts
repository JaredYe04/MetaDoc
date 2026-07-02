import type { PluginManifest } from '../host-api'
import type { AiCapabilityId } from '../ai-runtime/capabilities'

export type ActivationTrigger = 'onStartup' | 'onLlmEnabled' | `onCapability:${AiCapabilityId}`

export function manifestMatchesActivation(
  manifest: PluginManifest,
  trigger: ActivationTrigger
): boolean {
  const events = manifest.activationEvents
  if (!events?.length) {
    return trigger === 'onLlmEnabled'
  }
  if (events.includes(trigger)) return true
  if (trigger.startsWith('onCapability:')) {
    const capability = trigger.slice('onCapability:'.length)
    if (events.includes('onLlmEnabled') && capability !== 'llm-core') {
      return true
    }
  }
  return false
}
