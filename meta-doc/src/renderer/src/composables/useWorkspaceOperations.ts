/**
 * 工作区操作 Composable
 * 封装文件系统操作（复制、粘贴、删除、重命名等）
 */

import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { URI, Selection, ClipboardPayload } from '../utils/workspace/fs-models'
import { URIUtils } from '../utils/workspace/fs-models'
import { FSPlanner } from '../utils/workspace/fs-planner'
import { FSExecutor, type ExecutionProgress } from '../utils/workspace/fs-executor'
import { ClipboardService } from '../utils/workspace/clipboard-service'
import { createRendererLogger } from '../utils/common/logger'
import eventBus from '../utils/event-bus'

const logger = createRendererLogger('WorkspaceOperations')

export function useWorkspaceOperations(ipcRenderer: any) {
  const { t } = useI18n()
  const planner = new FSPlanner(ipcRenderer)
  const executor = new FSExecutor(ipcRenderer)
  const clipboard = ClipboardService.getInstance()

  // 选择状态
  const selection = ref<Selection>({ uris: [] })
  const lastSelectedIndex = ref<number>(-1)

  /**
   * 更新选择
   */
  const updateSelection = (uris: URI[]) => {
    selection.value = { uris }
  }

  /**
   * 添加选择
   */
  const addSelection = (uri: URI) => {
    if (!selection.value.uris.includes(uri)) {
      selection.value.uris.push(uri)
    }
  }

  /**
   * 移除选择
   */
  const removeSelection = (uri: URI) => {
    const index = selection.value.uris.indexOf(uri)
    if (index >= 0) {
      selection.value.uris.splice(index, 1)
    }
  }

  /**
   * 清空选择
   */
  const clearSelection = () => {
    selection.value = { uris: [] }
    lastSelectedIndex.value = -1
  }

  /**
   * 全选
   */
  const selectAll = (allNodes: Array<{ uri: URI; isWorkspaceRoot?: boolean }>) => {
    const uris = allNodes.filter((node) => !node.isWorkspaceRoot).map((node) => node.uri)
    updateSelection(uris)
    if (uris.length > 0) {
      lastSelectedIndex.value = allNodes.length - 1
    }
  }

  /**
   * 复制
   */
  const copy = (uris?: URI[]) => {
    const sources = uris || selection.value.uris
    if (sources.length === 0) {
      return
    }
    clipboard.setCopy(sources)
    eventBus.emit('show-success', {
      message: t('workspaceExplorer.copySuccess', { count: sources.length })
    })
  }

  /**
   * 剪切
   */
  const cut = (uris?: URI[]) => {
    const sources = uris || selection.value.uris
    if (sources.length === 0) {
      return
    }
    clipboard.setCut(sources)
    eventBus.emit('show-success', {
      message: t('workspaceExplorer.cutSuccess', { count: sources.length })
    })
  }

  /**
   * 粘贴
   */
  const paste = async (
    targetDirURI: URI,
    onProgress?: (progress: ExecutionProgress) => void
  ): Promise<URI[]> => {
    const payload = clipboard.getPayload()
    if (!payload || payload.sources.length === 0) {
      return []
    }

    try {
      // 生成操作计划
      const plan = await planner.createPastePlan(payload, targetDirURI, {
        conflictResolution: 'rename'
      })

      // 执行计划
      const result = await executor.execute(plan, onProgress)

      if (!result.success) {
        const errorMsg = result.errors?.[0]?.error.message || '粘贴失败'
        eventBus.emit('show-error', { message: errorMsg })
        return []
      }

      // 如果是剪切操作，清空剪贴板
      clipboard.onPasteComplete(payload.type === 'cut')

      // 选中新创建的文件
      if (result.createdURIs && result.createdURIs.length > 0) {
        updateSelection(result.createdURIs)
        eventBus.emit('show-success', {
          message: t('workspaceExplorer.pasteSuccess', { count: result.createdURIs.length })
        })
        return result.createdURIs
      }

      return []
    } catch (error) {
      logger.error('粘贴失败:', error)
      eventBus.emit('show-error', {
        message: error instanceof Error ? error.message : String(error)
      })
      return []
    }
  }

  /**
   * 删除
   */
  const deleteItems = async (uris?: URI[], onConfirm?: () => void): Promise<boolean> => {
    const targets = uris || selection.value.uris
    if (targets.length === 0) {
      return false
    }

    try {
      // 生成删除计划
      const plan = await planner.createDeletePlan(targets)

      // 直接执行删除，不显示确认对话框
      if (onConfirm) {
        onConfirm()
      }

      // 执行删除
      const result = await executor.execute(plan)

      if (!result.success) {
        const errorMsg = result.errors?.[0]?.error.message || '删除失败'
        eventBus.emit('show-error', { message: errorMsg })
        return false
      }

      // 清空选择
      clearSelection()

      eventBus.emit('show-success', { message: t('workspaceExplorer.deleteSuccess') })
      return true
    } catch (error) {
      logger.error('删除失败:', error)
      eventBus.emit('show-error', {
        message: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  /**
   * 重命名
   */
  const rename = async (uri: URI, newName: string): Promise<URI | null> => {
    try {
      const plan = await planner.createRenamePlan(uri, newName)
      const result = await executor.execute(plan)

      if (!result.success) {
        const errorMsg = result.errors?.[0]?.error.message || '重命名失败'
        eventBus.emit('show-error', { message: errorMsg })
        return null
      }

      // 更新选择
      if (result.createdURIs && result.createdURIs.length > 0) {
        const newURI = result.createdURIs[0]
        updateSelection([newURI])
        eventBus.emit('show-success', { message: t('workspaceExplorer.renameSuccess') })
        return newURI
      }

      return null
    } catch (error) {
      logger.error('重命名失败:', error)
      eventBus.emit('show-error', {
        message: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  /**
   * 检查剪贴板是否有内容
   */
  const hasClipboardContent = () => {
    return clipboard.hasContent()
  }

  /**
   * 获取剪贴板操作类型
   */
  const getClipboardOperationType = () => {
    return clipboard.getOperationType()
  }

  /**
   * 获取剪贴板 payload
   */
  const getClipboardPayload = () => {
    return clipboard.getPayload()
  }

  return {
    // 选择
    selection,
    lastSelectedIndex,
    updateSelection,
    addSelection,
    removeSelection,
    clearSelection,
    selectAll,

    // 操作
    copy,
    cut,
    paste,
    deleteItems,
    rename,

    // 剪贴板
    hasClipboardContent,
    getClipboardOperationType,
    getClipboardPayload
  }
}
