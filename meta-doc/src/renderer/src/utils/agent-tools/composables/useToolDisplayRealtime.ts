/**
 * Display组件实时通信Composable
 * 提供统一的eventBus实时更新机制
 */

import { ref, onBeforeUnmount, watch, isRef } from 'vue'
import type { ToolExecutionStatus, ToolProgress } from '../../../types/agent-tool'
import { onToolUpdate, onToolComplete, onToolFailed } from '../tool-display-communication'
import { createRendererLogger } from '../../logger'

/**
 * 使用Tool Display实时通信
 * 首帧与持久化重开时以 initialData（通常为 props.data）为准；有 invocationId 时再通过事件增量更新。
 * 当 message 完成但未收到 tool-complete 时（如工具执行过快），若传入 ref（如 toRef(props,'data')），会同步最终结果，避免界面一直停在 loading。
 * @param invocationId - Tool执行ID（可选，无则仅用 initialData 渲染快照）
 * @param initialData - 初始/快照数据；传 toRef(props, 'data') 可在 message 完成时自动同步
 * @param initialStatus - 初始状态；传 toRef(props, 'status') 可自动同步
 * @param initialProgress - 初始进度
 * @returns 实时数据、状态、进度
 */
export function useToolDisplayRealtime(
  invocationId: string | undefined,
  initialData: unknown = null,
  initialStatus: ToolExecutionStatus | import('vue').Ref<ToolExecutionStatus> = 'running',
  initialProgress?: ToolProgress
) {
  const dataVal = isRef(initialData) ? initialData.value : initialData
  const statusVal = isRef(initialStatus) ? initialStatus.value : initialStatus
  const progressVal = initialProgress

  const realtimeData = ref<any>(dataVal)
  const realtimeStatus = ref<ToolExecutionStatus>(statusVal)
  const realtimeProgress = ref<ToolProgress | undefined>(progressVal)

  // message 完成后用 props 同步最终数据（解决执行过快未收到 tool-complete 导致一直 loading）
  // 仅当 data 有实质内容（含 stage/result）时才写入，避免 status 先更新、data 未到时把 realtimeData 置空
  if (isRef(initialData) && isRef(initialStatus)) {
    watch(
      [initialData, initialStatus],
      ([data, status]) => {
        if (status !== 'succeeded') return
        if (data == null) return
        const hasContent =
          typeof data === 'object' &&
          (('result' in (data as object) && (data as any).result !== undefined) ||
            ('stage' in (data as object) && (data as any).stage === 'completed'))
        if (hasContent) {
          realtimeData.value = data
          realtimeStatus.value = 'succeeded'
        }
      },
      { immediate: true }
    )
  }

  // 取消监听器函数
  let updateUnsub: (() => void) | null = null
  let completeUnsub: (() => void) | null = null
  let failedUnsub: (() => void) | null = null

  const setupListeners = (id: string) => {
    const logger = createRendererLogger('useToolDisplayRealtime')
    logger.debug(`[useToolDisplayRealtime] 设置监听器，invocationId: ${id}`)

    updateUnsub = onToolUpdate(id, (updateData) => {
      logger.debug(
        `[useToolDisplayRealtime] 收到 tool-update 事件，invocationId: ${id}`,
        updateData
      )
      realtimeData.value = updateData.data
      realtimeProgress.value = updateData.progress
      realtimeStatus.value = 'running' // 更新状态为运行中
    })

    completeUnsub = onToolComplete(id, (completeData) => {
      logger.debug(
        `[useToolDisplayRealtime] 收到 tool-complete 事件，invocationId: ${id}`,
        completeData
      )
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
      logger.debug(`[useToolDisplayRealtime] 收到 tool-failed 事件，invocationId: ${id}`, errorData)
      realtimeStatus.value = 'failed'
      realtimeData.value = { ...(realtimeData.value || {}), error: errorData.error }
    })
  }

  // 监听 invocationId 变化，重新设置监听器
  watch(
    () => invocationId,
    (newId, oldId) => {
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
    },
    { immediate: false }
  )

  // 如果有invocationId，设置eventBus监听器
  const logger = createRendererLogger('useToolDisplayRealtime')
  if (invocationId) {
    logger.debug(
      `[useToolDisplayRealtime] 初始化，invocationId: ${invocationId}, initialStatus: ${initialStatus}`
    )
    setupListeners(invocationId)
  } else {
    //logger.warn(`[useToolDisplayRealtime] 没有 invocationId，无法设置事件监听器。props:`, { invocationId, initialData, initialStatus, initialProgress })
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
 * @param data - 原始数据（可能是对象或 JSON 字符串，如工具 output.data）
 * @returns 解析后的数据
 */
export function parseToolData(data: unknown): unknown {
  // 兼容 output.data 为 JSON 字符串的情况（如 edit 工具保存的 outputs[].data）
  if (typeof data === 'string') {
    const trimmed = data.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        data = JSON.parse(trimmed) as unknown
      } catch {
        return data
      }
    } else {
      return data
    }
  }
  if (typeof data === 'object' && data !== null) {
    const dataObj = data as any

    // Edit 工具完整回调返回值：{ status, data: { content: { stage, result }, format, componentName }, result }
    // 持久化后可能整段被序列化，解析后需提取 content 供 EditDisplay 使用
    if (
      dataObj.data?.content &&
      typeof dataObj.data.content === 'object' &&
      (dataObj.data.content.stage !== undefined || dataObj.data.content.result !== undefined)
    ) {
      return dataObj.data.content
    }

    // Edit 工具：持久化/序列化后 output.data 可能是裸结果对象（无 stage/result 包装）
    // 形如 { appliedEdits, failedEdits, operations, hunks, rawDiff }，需规范为 { stage, result } 供 EditDisplay 使用
    if (dataObj.stage === undefined) {
      const hasEditResult =
        Array.isArray(dataObj.hunks) ||
        Array.isArray(dataObj.operations) ||
        (typeof dataObj.rawDiff === 'string' && dataObj.rawDiff.trim() !== '')
      if (hasEditResult) {
        return { stage: 'completed', result: dataObj }
      }
    }

    // 首先检查dataObj本身是否已经是期望的内容结构（有outlineTree、stage等字段）
    // 如果是，直接返回（说明已经提取过了）
    if (
      dataObj.outlineTree !== undefined ||
      dataObj.stage !== undefined ||
      dataObj.tree !== undefined
    ) {
      return dataObj
    }

    // 如果data有content字段，并且content是对象（持久化后可能是 { content, format } 包装）
    if (dataObj.content !== undefined && typeof dataObj.content === 'object') {
      const content = dataObj.content
      // 检查content是否包含我们期望的字段（outlineTree/stage/tree/result/todoList）
      if (
        content.outlineTree !== undefined ||
        content.stage !== undefined ||
        content.tree !== undefined ||
        content.result !== undefined ||
        content.todoList !== undefined
      ) {
        return content
      }
      // 如果dataObj有format字段，说明是 ToolCallbackData 包装器，应提取 content（如 Timestamp/TodoList 持久化后）
      if (dataObj.format !== undefined) {
        return content
      }
    }

    // 默认返回dataObj本身
    return dataObj
  }
  return data
}
