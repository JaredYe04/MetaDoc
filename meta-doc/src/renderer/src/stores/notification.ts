import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { toast } from 'vue-sonner'
import type { NotificationItem, NotificationType, NotifyOptions } from '@renderer/types/notification'

const STORAGE_KEY = 'metadoc-notifications-v1'
const MAX_HISTORY = 100
const DEFAULT_DURATION = 4000

function generateId(): string {
  return `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function getDefaultTitle(type: NotificationType, t?: (key: string) => string): string {
  if (t) {
    const keys: Record<NotificationType, string> = {
      success: 'notification.type.success',
      error: 'notification.type.error',
      warning: 'notification.type.warning',
      info: 'notification.type.info'
    }
    return t(keys[type])
  }
  const titles: Record<NotificationType, string> = {
    success: '成功',
    error: '错误',
    warning: '警告',
    info: '提示'
  }
  return titles[type]
}

export const useNotificationStore = defineStore('notification', () => {
  const notifications = ref<NotificationItem[]>([])
  const unreadCount = computed(() => notifications.value.filter(n => !n.read).length)
  const latestNotification = computed(() => notifications.value[0] ?? null)
  const readCount = computed(() => notifications.value.filter(n => n.read).length)

  function loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
        notifications.value = parsed
          .filter((n: NotificationItem) => n.timestamp > sevenDaysAgo)
          .slice(0, MAX_HISTORY)
      }
    } catch (e) {
      console.error('[NotificationStore] Failed to load from storage:', e)
    }
  }

  function saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.value))
    } catch (e) {
      console.error('[NotificationStore] Failed to save to storage:', e)
    }
  }

  function showSonnerToast(
    item: NotificationItem,
    duration: number,
    action?: { label: string; callback: () => void }
  ): void {
    console.log('[Notification] Showing Sonner toast:', item.type, item.title)
    const options: any = {
      description: item.message,
      duration,
      onClick: () => {
        markAsRead(item.id)
      }
    }

    if (action) {
      options.action = {
        label: action.label,
        onClick: action.callback
      }
    }

    switch (item.type) {
      case 'success':
        toast.success(item.title, options)
        break
      case 'error':
        toast.error(item.title, options)
        break
      case 'warning':
        toast.warning(item.title, options)
        break
      default:
        toast.info(item.title, options)
    }
  }

  function notify(options: NotifyOptions): string {
    const {
      title,
      message,
      type = 'info',
      duration = DEFAULT_DURATION,
      showToast = true,
      addToQueue = true,
      action,
      metadata
    } = options

    const notification: NotificationItem = {
      id: generateId(),
      title: title || getDefaultTitle(type),
      message,
      type,
      timestamp: Date.now(),
      read: false,
      metadata
    }

    if (showToast) {
      showSonnerToast(notification, duration, action)
    }

    if (addToQueue) {
      notifications.value.unshift(notification)
      if (notifications.value.length > MAX_HISTORY) {
        notifications.value = notifications.value.slice(0, MAX_HISTORY)
      }
      saveToStorage()
    }

    return notification.id
  }

  const success = (message: string, opts?: Omit<NotifyOptions, 'message' | 'type'>) =>
    notify({ message, type: 'success', ...opts })

  const error = (message: string, opts?: Omit<NotifyOptions, 'message' | 'type'>) =>
    notify({ message, type: 'error', ...opts })

  const warning = (message: string, opts?: Omit<NotifyOptions, 'message' | 'type'>) =>
    notify({ message, type: 'warning', ...opts })

  const info = (message: string, opts?: Omit<NotifyOptions, 'message' | 'type'>) =>
    notify({ message, type: 'info', ...opts })

  function markAsRead(id: string): void {
    const notification = notifications.value.find(n => n.id === id)
    if (notification && !notification.read) {
      notification.read = true
      saveToStorage()
    }
  }

  function markAllAsRead(): void {
    let hasUnread = false
    notifications.value.forEach(n => {
      if (!n.read) {
        n.read = true
        hasUnread = true
      }
    })
    if (hasUnread) {
      saveToStorage()
    }
  }

  function remove(id: string): void {
    const index = notifications.value.findIndex(n => n.id === id)
    if (index > -1) {
      notifications.value.splice(index, 1)
      saveToStorage()
    }
  }

  function removeAll(): void {
    if (notifications.value.length > 0) {
      notifications.value = []
      saveToStorage()
    }
  }

  function removeRead(): void {
    const unreadItems = notifications.value.filter(n => !n.read)
    if (unreadItems.length !== notifications.value.length) {
      notifications.value = unreadItems
      saveToStorage()
    }
  }

  function getById(id: string): NotificationItem | undefined {
    return notifications.value.find(n => n.id === id)
  }

  function getUnread(): NotificationItem[] {
    return notifications.value.filter(n => !n.read)
  }

  return {
    notifications,
    unreadCount,
    readCount,
    latestNotification,
    notify,
    success,
    error,
    warning,
    info,
    markAsRead,
    markAllAsRead,
    remove,
    removeAll,
    removeRead,
    getById,
    getUnread,
    loadFromStorage
  }
})
