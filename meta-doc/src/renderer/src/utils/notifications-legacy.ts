import eventBus from './event-bus'
import { notifySuccess, notifyError, notifyWarning, notifyInfo } from './notify'

let initialized = false

function extractMessage(payload: unknown): string {
  if (typeof payload === 'string') return payload
  if (payload && typeof payload === 'object') {
    const obj = payload as { message?: string }
    return obj.message || ''
  }
  return ''
}

export function initNotificationLegacyAdapter(): void {
  if (initialized) return
  initialized = true

  eventBus.on('show-success', (payload: unknown) => {
    const message = extractMessage(payload)
    if (message) notifySuccess(message)
  })

  eventBus.on('show-error', (payload: unknown) => {
    const message = extractMessage(payload)
    if (message) notifyError(message)
  })

  eventBus.on('show-warning', (payload: unknown) => {
    const message = extractMessage(payload)
    if (message) notifyWarning(message)
  })

  eventBus.on('show-info', (payload: unknown) => {
    const message = extractMessage(payload)
    if (message) notifyInfo(message)
  })

  console.log('[Notification] Legacy adapter initialized')
}
