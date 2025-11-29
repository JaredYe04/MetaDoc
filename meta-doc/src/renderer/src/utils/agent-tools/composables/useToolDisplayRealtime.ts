/**
 * Display组件实时通信Composable
 * 提供统一的eventBus实时更新机制
 */

import { ref, computed, onBeforeUnmount, watch } from 'vue'
import type { ToolExecutionStatus, ToolProgress } from '../../../types/agent-tool'
import { onToolUpdate, onToolComplete, onToolFailed } from '../tool-display-communication'

/**
 * 使用Tool Display实时通信
 * @param invocationId - Tool执行ID（可选）
 * @param initialData - 初始数据
 * @param initialStatus - 初始状态
 * @param initialProgress - 初始进度
 * @returns 实时数据、状态、进度和计算属性
 */
export function useToolDisplayRealtime(
  invocationId: string | undefined,
  initialData: unknown = null,
  initialStatus: ToolExecutionStatus = 'running',
  initialProgress?: ToolProgress
) {
  // 实时数据
  const realtimeData = ref<any>(initialData)
  const realtimeStatus = ref<ToolExecutionStatus>(initialStatus)
  const realtimeProgress = ref<ToolProgress | undefined>(initialProgress)

  // 取消监听器函数
  let updateUnsub: (() => void) | null = null
  let completeUnsub: (() => void) | null = null
  let failedUnsub: (() => void) | null = null

  const setupListeners = (id: string) => {
    console.log(`[useToolDisplayRealtime] 设置监听器，invocationId: ${id}`)
    
    updateUnsub = onToolUpdate(id, (updateData) => {
      console.log(`[useToolDisplayRealtime] 收到 tool-update 事件，invocationId: ${id}`, updateData)
      realtimeData.value = updateData.data
      realtimeProgress.value = updateData.progress
      realtimeStatus.value = 'running' // 更新状态为运行中
    })

    completeUnsub = onToolComplete(id, (completeData) => {
      console.log(`[useToolDisplayRealtime] 收到 tool-complete 事件，invocationId: ${id}`, completeData)
      realtimeStatus.value = completeData.status
      // 如果completeData有data，使用它；否则保留现有的realtimeData
      if (completeData.data !== undefined) {
        realtimeData.value = completeData.data
      }
      realtimeProgress.value = completeData.progress
      if (completeData.error) {
        realtimeData.value = { ...(realtimeData.value || {}), error: completeData.error }
      }
    })

    failedUnsub = onToolFailed(id, (errorData) => {
      console.log(`[useToolDisplayRealtime] 收到 tool-failed 事件，invocationId: ${id}`, errorData)
      realtimeStatus.value = 'failed'
      realtimeData.value = { ...(realtimeData.value || {}), error: errorData.error }
    })
  }

  // 监听 invocationId 变化，重新设置监听器
  watch(() => invocationId, (newId, oldId) => {
    if (newId !== oldId) {
      // 清理旧的监听器
      if (updateUnsub) updateUnsub()
      if (completeUnsub) completeUnsub()
      if (failedUnsub) failedUnsub()
      
      // 重置数据
      realtimeData.value = initialData
      realtimeStatus.value = initialStatus
      realtimeProgress.value = initialProgress
      
      // 设置新的监听器（如果有新的 invocationId）
      if (newId) {
        setupListeners(newId)
      }
    }
  }, { immediate: false })

  // 如果有invocationId，设置eventBus监听器
  if (invocationId) {
    console.log(`[useToolDisplayRealtime] 初始化，invocationId: ${invocationId}, initialStatus: ${initialStatus}`)
    setupListeners(invocationId)
  } else {
    console.warn(`[useToolDisplayRealtime] 没有 invocationId，无法设置事件监听器。props:`, { invocationId, initialData, initialStatus, initialProgress })
  }

  // 清理监听器
  onBeforeUnmount(() => {
    if (updateUnsub) updateUnsub()
    if (completeUnsub) completeUnsub()
    if (failedUnsub) failedUnsub()
  })

  return {
    realtimeData,
    realtimeStatus,
    realtimeProgress
  }
}

/**
 * 解析ToolCallbackData格式的数据
 * @param data - 原始数据
 * @returns 解析后的数据
 */
export function parseToolData(data: unknown): unknown {
  if (typeof data === 'object' && data !== null) {
    const dataObj = data as any
    
    // 首先检查dataObj本身是否已经是期望的内容结构（有outlineTree、stage等字段）
    // 如果是，直接返回（说明已经提取过了）
    if (dataObj.outlineTree !== undefined || 
        dataObj.stage !== undefined || 
        dataObj.tree !== undefined) {
      return dataObj
    }
    
    // 如果data有content字段，并且content是对象
    if (dataObj.content !== undefined && typeof dataObj.content === 'object') {
      const content = dataObj.content
      // 检查content是否包含我们期望的字段（如outlineTree、stage）
      if (content.outlineTree !== undefined || 
          content.stage !== undefined || 
          content.tree !== undefined) {
        // content是期望的结构，提取它
        return content
      }
      // content不是期望的结构，检查dataObj本身是否可能是期望的结构
      // 如果dataObj有format字段，说明它是ToolCallbackData包装器，应该提取content
      if (dataObj.format !== undefined) {
        return content
      }
    }
    
    // 默认返回dataObj本身
    return dataObj
  }
  return data
}

