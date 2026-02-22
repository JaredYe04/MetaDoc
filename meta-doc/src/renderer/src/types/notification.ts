/**
 * 通知系统类型定义
 * 
 * 统一通知系统架构：
 * - 所有通知同时显示为右上角 Toast (Sonner) + 进入历史队列
 * - 使用 Pinia 进行状态管理
 * - 支持 localStorage 持久化
 * - 保持 EventBus 向后兼容
 */

export type NotificationType = 'success' | 'info' | 'warning' | 'error'

export interface NotificationItem {
  id: string
  title: string
  message: string
  type: NotificationType
  timestamp: number
  read: boolean
  /** 可选的元数据，用于扩展功能 */
  metadata?: {
    action?: string
    actionLabel?: string
    duration?: number
    group?: string
    [key: string]: any
  }
}

export interface NotifyOptions {
  /** 通知标题，不提供则使用默认标题 */
  title?: string
  /** 通知内容 */
  message: string
  /** 通知类型 */
  type?: NotificationType
  /** Toast 显示时长 (ms)，默认 4000ms */
  duration?: number
  /** 是否显示右上角 Toast，默认 true */
  showToast?: boolean
  /** 是否加入历史队列，默认 true */
  addToQueue?: boolean
  /** 可选的操作按钮 */
  action?: {
    label: string
    callback: () => void
  }
  /** 扩展元数据 */
  metadata?: Record<string, any>
}

/** 通知过滤器 */
export interface NotificationFilter {
  type?: NotificationType
  read?: boolean
  startTime?: number
  endTime?: number
  group?: string
}

/** 通知统计信息 */
export interface NotificationStats {
  total: number
  unread: number
  byType: Record<NotificationType, number>
}
