import { useNotificationStore } from '@renderer/stores/notification'
import type { NotifyOptions } from '@/types/notification'

let notificationStore: ReturnType<typeof useNotificationStore> | null = null

export function setNotificationStore(store: ReturnType<typeof useNotificationStore>): void {
  notificationStore = store
}

function getStore(): ReturnType<typeof useNotificationStore> {
  if (!notificationStore) {
    notificationStore = useNotificationStore()
  }
  return notificationStore
}

export function notify(options: NotifyOptions): string {
  return getStore().notify(options)
}

export function notifySuccess(
  message: string,
  opts?: Omit<NotifyOptions, 'message' | 'type'>
): string {
  return getStore().success(message, opts)
}

export function notifyError(
  message: string,
  opts?: Omit<NotifyOptions, 'message' | 'type'>
): string {
  return getStore().error(message, opts)
}

export function notifyWarning(
  message: string,
  opts?: Omit<NotifyOptions, 'message' | 'type'>
): string {
  return getStore().warning(message, opts)
}

export function notifyInfo(
  message: string,
  opts?: Omit<NotifyOptions, 'message' | 'type'>
): string {
  return getStore().info(message, opts)
}
