import type { PluginManifest } from '../host-api'

export type ActivationTrigger = 'onStartup' | 'onLlmEnabled'

export function manifestMatchesActivation(
  manifest: PluginManifest,
  trigger: ActivationTrigger
): boolean {
  const events = manifest.activationEvents
  if (!events?.length) {
    return trigger === 'onLlmEnabled'
  }
  return events.includes(trigger)
}
