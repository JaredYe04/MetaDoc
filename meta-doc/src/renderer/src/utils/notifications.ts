import { ref, computed } from 'vue'
import eventBus from './event-bus'
type Translator = (key: string, params?: any) => string

let activeTranslator: Translator | null = null

export type NotificationType = 'success' | 'info' | 'warning' | 'error'

export interface NotificationItem {
  id: string
  title: string
  message: string
  type: NotificationType
  timestamp: number
  read: boolean
}

const notifications = ref<NotificationItem[]>([])

const latestNotification = computed(() => notifications.value[0] ?? null)

const unreadCount = computed(() => notifications.value.filter((item) => !item.read).length)

function generateId(): string {
  return 'notice-' + Math.random().toString(36).slice(2, 10)
}

function pushNotification(title: string, message: string, type: NotificationType): void {
  const normalizedTitle = title.trim().length > 0 ? title : deriveTitleByType(type)
  notifications.value = [
    {
      id: generateId(),
      title: normalizedTitle,
      message,
      type,
      timestamp: Date.now(),
      read: false
    },
    ...notifications.value
  ]
}

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
  return activeTranslator ?? fallbackTranslator
}

function deriveTitleByType(type: NotificationType): string {
  const t = getTranslator()
  switch (type) {
    case 'success':
      return t('notificationQueue.type.success')
    case 'info':
      return t('notificationQueue.type.info')
    case 'warning':
      return t('notificationQueue.type.warning')
    case 'error':
      return t('notificationQueue.type.error')
    default:
      return ''
  }
}

export function markAllNotificationsRead(): void {
  notifications.value = notifications.value.map((item) => ({
    ...item,
    read: true
  }))
}

export function markNotificationRead(id: string): void {
  notifications.value = notifications.value.map((item) =>
    item.id === id
      ? {
          ...item,
          read: true
        }
      : item
  )
}

export function removeNotification(id: string): void {
  notifications.value = notifications.value.filter((item) => item.id !== id)
}

export function clearNotifications(): void {
  notifications.value = []
}

export function useNotificationStack() {
  return {
    notifications,
    latestNotification,
    unreadCount,
    markAllNotificationsRead,
    markNotificationRead,
    removeNotification,
    clearNotifications
  }
}

let listenersRegistered = false

const extractNameFromPayload = (payload: unknown): string => {
  if (!payload) return ''
  if (typeof payload === 'string') return payload
  if (typeof payload === 'object') {
    const maybe = payload as { fileName?: unknown; path?: unknown }
    if (typeof maybe.fileName === 'string' && maybe.fileName.trim().length > 0) {
      return maybe.fileName.trim()
    }
    if (typeof maybe.path === 'string' && maybe.path.length > 0) {
      const parts = maybe.path.split(/[\\/]/)
      return parts[parts.length - 1] || maybe.path
    }
  }
  return ''
}

function registerEventListeners(): void {
  if (listenersRegistered) return
  listenersRegistered = true

  eventBus.on('save-success', (payload) => {
    const t = getTranslator()
    const name = extractNameFromPayload(payload) || t('workspace.untitledDocument')
    pushNotification(
      t('main.notification.save.title'),
      t('main.notification.save.message', { name }),
      'success'
    )
  })

  eventBus.on('open-doc-success', (payload) => {
    const t = getTranslator()
    const name = extractNameFromPayload(payload) || t('workspace.untitledDocument')
    pushNotification(
      t('main.notification.open.title'),
      t('main.notification.open.message', { name }),
      'success'
    )
  })

  eventBus.on('export-success', (payload) => {
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

    pushNotification(
      t('main.notification.export.title'),
      t('main.notification.export.message', { path: outputPath }),
      'success'
    )
    eventBus.emit('system-notification', {
      title: t('main.notification.export.title'),
      body: t('main.notification.export.message', { path: outputPath }),
      path: outputPath
    })
  })

  eventBus.on('show-success', (payload) => {
    const t = getTranslator()
    const message =
      typeof payload === 'string'
        ? payload
        : typeof payload === 'object' &&
            payload !== null &&
            'message' in payload &&
            typeof (payload as { message?: unknown }).message === 'string'
          ? (payload as { message: string }).message
          : ''
    pushNotification(t('main.notification.success.title'), message, 'success')
  })

  eventBus.on('show-info', (payload) => {
    const t = getTranslator()
    const message =
      typeof payload === 'string'
        ? payload
        : typeof payload === 'object' &&
            payload !== null &&
            'message' in payload &&
            typeof (payload as { message?: unknown }).message === 'string'
          ? (payload as { message: string }).message
          : ''
    pushNotification(t('main.notification.info.title'), message, 'info')
  })

  eventBus.on('show-warning', (payload) => {
    const t = getTranslator()
    const message =
      typeof payload === 'string'
        ? payload
        : typeof payload === 'object' &&
            payload !== null &&
            'message' in payload &&
            typeof (payload as { message?: unknown }).message === 'string'
          ? (payload as { message: string }).message
          : ''
    pushNotification(t('main.notification.warning.title'), message, 'warning')
  })

  eventBus.on('show-error', (payload) => {
    const t = getTranslator()
    const message =
      typeof payload === 'string'
        ? payload
        : typeof payload === 'object' &&
            payload !== null &&
            'message' in payload &&
            typeof (payload as { message?: unknown }).message === 'string'
          ? (payload as { message: string }).message
          : ''
    pushNotification(t('main.notification.error.title'), message, 'error')
  })
}

export function initializeNotificationListeners(translator: Translator): void {
  activeTranslator = translator
  registerEventListeners()
}
