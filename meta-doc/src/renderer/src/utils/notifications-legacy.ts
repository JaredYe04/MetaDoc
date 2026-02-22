import eventBus from './event-bus'
import { notifySuccess, notifyError, notifyWarning, notifyInfo } from './notify'
import { i18n } from '../i18n'

let initialized = false

type Translator = (key: string, params?: any) => string

function fallbackTranslator(key: string, params?: any): string {
  if (params && typeof params === 'object') {
    return Object.keys(params).reduce((acc, paramKey) => {
      const value = String((params as Record<string, any>)[paramKey] ?? '')
      return acc.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), value)
    }, key)
  }
  return key
}

function getTranslator(): Translator {
  return i18n?.global?.t || fallbackTranslator
}

function extractMessage(payload: unknown): string {
  if (typeof payload === 'string') return payload
  if (payload && typeof payload === 'object') {
    const obj = payload as { message?: string }
    return obj.message || ''
  }
  return ''
}

function extractNameFromPayload(payload: unknown): string {
  if (!payload) return ''
  if (typeof payload === 'string') return payload
  if (typeof payload === 'object') {
    const p = payload as { fileName?: string; name?: string; tabId?: string; path?: string }
    if (p.fileName) return p.fileName
    if (p.name) return p.name
    if (p.path) {
      const parts = p.path.split(/[\\/]/)
      return parts[parts.length - 1] || p.path
    }
  }
  return ''
}

export function initNotificationLegacyAdapter(): void {
  if (initialized) return
  initialized = true

  // 基础通知事件
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

  // 文档操作通知事件
  eventBus.on('save-success', (payload: unknown) => {
    const t = getTranslator()
    const name = extractNameFromPayload(payload) || t('workspace.untitledDocument')
    notifySuccess(t('main.notification.save.message', { name }), {
      title: t('main.notification.save.title')
    })
  })

  eventBus.on('open-doc-success', (payload: unknown) => {
    const t = getTranslator()
    const name = extractNameFromPayload(payload) || t('workspace.untitledDocument')
    notifySuccess(t('main.notification.open.message', { name }), {
      title: t('main.notification.open.title')
    })
  })

  eventBus.on('export-success', (payload: unknown) => {
    const t = getTranslator()
    const outputPath =
      typeof payload === 'string'
        ? payload
        : typeof payload === 'object' &&
            payload !== null &&
            'path' in payload &&
            typeof (payload as { path?: unknown }).path === 'string'
          ? (payload as { path: string }).path
          : ''

    notifySuccess(t('main.notification.export.message', { path: outputPath }), {
      title: t('main.notification.export.title')
    })
    
    // 同时触发系统级通知
    eventBus.emit('system-notification', {
      title: t('main.notification.export.title'),
      body: t('main.notification.export.message', { path: outputPath }),
      path: outputPath
    })
  })

  console.log('[Notification] Legacy adapter initialized')
}
