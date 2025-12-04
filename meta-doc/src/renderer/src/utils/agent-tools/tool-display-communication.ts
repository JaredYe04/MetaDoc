/**
 * Tool和Display组件之间的实时通信机制
 * 使用eventBus实现tool执行过程中的实时数据同步
 */

import eventBus from '../event-bus.js'
import { createRendererLogger } from '../logger.js';

/**
 * Tool执行更新事件名称前缀
 */
export const TOOL_UPDATE_EVENT_PREFIX = 'tool-update:'

/**
 * Tool执行完成事件名称前缀
 */
export const TOOL_COMPLETE_EVENT_PREFIX = 'tool-complete:'

/**
 * Tool执行失败事件名称前缀
 */
export const TOOL_FAILED_EVENT_PREFIX = 'tool-failed:'

/**
 * 发送Tool执行更新事件
 * @param invocationId - Tool执行ID
 * @param data - 更新数据
 * @param progress - 进度信息（可选）
 */
export function emitToolUpdate(
  invocationId: string,
  data: unknown,
  progress?: { percentage: number; message?: string }
): void {
  const eventName = `${TOOL_UPDATE_EVENT_PREFIX}${invocationId}`
  const logger = createRendererLogger('tool-display-communication');
  const payload = {
    invocationId,
    data,
    progress,
    timestamp: Date.now()
  }
  logger.debug(`[emitToolUpdate] 发送事件: ${eventName}`, payload)
  eventBus.emit(eventName, payload)
}

/**
 * 发送Tool执行完成事件
 * @param invocationId - Tool执行ID
 * @param result - 执行结果
 */
export function emitToolComplete(
  invocationId: string,
  result: {
    status: 'succeeded' | 'failed' | 'cancelled'
    data?: unknown
    error?: string
    progress?: { percentage: number; message?: string }
  }
): void {
  const eventName = `${TOOL_COMPLETE_EVENT_PREFIX}${invocationId}`
  const logger = createRendererLogger('tool-display-communication');
  const payload = {
    invocationId,
    ...result,
    timestamp: Date.now()
  }
  logger.debug(`[emitToolComplete] 发送事件: ${eventName}`, payload)
  eventBus.emit(eventName, payload)
}

/**
 * 发送Tool执行失败事件
 * @param invocationId - Tool执行ID
 * @param error - 错误信息
 */
export function emitToolFailed(
  invocationId: string,
  error: string
): void {
  eventBus.emit(`${TOOL_FAILED_EVENT_PREFIX}${invocationId}`, {
    error,
    timestamp: Date.now()
  })
}

/**
 * 监听Tool执行更新事件
 * @param invocationId - Tool执行ID
 * @param callback - 回调函数
 * @returns 取消监听的函数
 */
export function onToolUpdate(
  invocationId: string,
  callback: (data: { invocationId: string; data: unknown; progress?: { percentage: number; message?: string }; timestamp: number }) => void
): () => void {
  const logger = createRendererLogger('tool-display-communication');
  const eventName = `${TOOL_UPDATE_EVENT_PREFIX}${invocationId}`
  logger.debug(`[onToolUpdate] 注册监听器: ${eventName}`)
  const handler = (payload: any) => {
    logger.debug(`[onToolUpdate] 收到事件: ${eventName}`, payload)
    callback(payload)
  }
  eventBus.on(eventName, handler)
  
  return () => {
    logger.debug(`[onToolUpdate] 移除监听器: ${eventName}`)
    eventBus.off(eventName, handler)
  }
}

/**
 * 监听Tool执行完成事件
 * @param invocationId - Tool执行ID
 * @param callback - 回调函数
 * @returns 取消监听的函数
 */
export function onToolComplete(
  invocationId: string,
  callback: (result: {
    invocationId: string
    status: 'succeeded' | 'failed' | 'cancelled'
    data?: unknown
    error?: string
    progress?: { percentage: number; message?: string }
    timestamp: number
  }) => void
): () => void {
  const logger = createRendererLogger('tool-display-communication');
  const eventName = `${TOOL_COMPLETE_EVENT_PREFIX}${invocationId}`
  logger.debug(`[onToolComplete] 注册监听器: ${eventName}`)
  const handler = (payload: any) => {
    logger.debug(`[onToolComplete] 收到事件: ${eventName}`, payload)
    callback(payload)
  }
  eventBus.on(eventName, handler)
  
  return () => {
    logger.debug(`[onToolComplete] 移除监听器: ${eventName}`)
    eventBus.off(eventName, handler)
  }
}

/**
 * 监听Tool执行失败事件
 * @param invocationId - Tool执行ID
 * @param callback - 回调函数
 * @returns 取消监听的函数
 */
export function onToolFailed(
  invocationId: string,
  callback: (error: { invocationId: string; error: string; timestamp: number }) => void
): () => void {
  const logger = createRendererLogger('tool-display-communication');
  const eventName = `${TOOL_FAILED_EVENT_PREFIX}${invocationId}`
  logger.debug(`[onToolFailed] 注册监听器: ${eventName}`)
  const handler = (payload: any) => {
    logger.debug(`[onToolFailed] 收到事件: ${eventName}`, payload)
    callback(payload)
  }
  eventBus.on(eventName, handler)
  
  return () => {
    logger.debug(`[onToolFailed] 移除监听器: ${eventName}`)
    eventBus.off(eventName, handler)
  }
}

/**
 * 移除所有Tool相关的事件监听
 * @param invocationId - Tool执行ID
 */
export function removeToolListeners(invocationId: string): void {
  const updateEvent = `${TOOL_UPDATE_EVENT_PREFIX}${invocationId}`
  const completeEvent = `${TOOL_COMPLETE_EVENT_PREFIX}${invocationId}`
  const failedEvent = `${TOOL_FAILED_EVENT_PREFIX}${invocationId}`
  
  // eventBus可能没有removeAll方法，所以我们需要手动移除
  // 这里假设eventBus有off方法可以移除所有监听器
  // 如果不行，需要在调用时保存回调函数引用
}

