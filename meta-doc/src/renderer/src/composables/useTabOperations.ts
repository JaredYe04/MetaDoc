import { ref, computed } from 'vue'
import { useWorkspace, type WorkspaceTab } from '../stores/workspace'
import { createRendererLogger } from '../utils/common/logger'
import eventBus from '../utils/event-bus'
import messageBridge from '../bridge/message-bridge'
import { useFocusMode } from './useFocusMode'

const logger = createRendererLogger('useTabOperations')

export interface TabOperationResult {
  success: boolean
  tabId?: string
  error?: string
}

export interface NewTabOptions {
  title?: string
  kind?: 'file' | 'tool' | 'new'
  format?: string
  activate?: boolean
}

export interface OpenTabOptions {
  path: string
  title?: string
  format?: string
  activate?: boolean
}

export const useTabOperations = () => {
  const workspace = useWorkspace()
  const { isFocusMode } = useFocusMode()
  const ipc = messageBridge.getIpc()

  const isOperating = ref(false)

  const createNewTab = async (options: NewTabOptions = {}): Promise<TabOperationResult> => {
    const { title = '未命名文档' } = options

    try {
      isOperating.value = true
      const tab = workspace.openNewDocumentTab()

      if (title !== '未命名文档' && tab) {
        tab.title = title
      }

      logger.info('Created new tab:', tab?.id)
      return { success: true, tabId: tab?.id }
    } catch (error) {
      logger.error('Failed to create new tab:', error)
      return { success: false, error: String(error) }
    } finally {
      isOperating.value = false
    }
  }

  const openFileTab = async (options: OpenTabOptions): Promise<TabOperationResult> => {
    const { path } = options

    if (!path) {
      return { success: false, error: 'Path is required' }
    }

    try {
      isOperating.value = true

      if (ipc) {
        const existingWindow = await messageBridge.invoke('find-window-with-file', path)
        if (existingWindow?.windowId) {
          logger.info('File already open in window:', existingWindow.windowId)
          return { success: false, error: 'File already open in another window' }
        }
      }

      eventBus.emit('open-doc', path)

      logger.info('Opening file:', path)
      return { success: true }
    } catch (error) {
      logger.error('Failed to open file tab:', error)
      return { success: false, error: String(error) }
    } finally {
      isOperating.value = false
    }
  }

  const closeTabById = async (
    tabId: string,
    options: { force?: boolean; skipSave?: boolean } = {}
  ): Promise<TabOperationResult> => {
    const { force = false, skipSave = false } = options

    try {
      isOperating.value = true

      const tab = workspace.tabs.find((t) => t.id === tabId)
      if (!tab) {
        return { success: false, error: 'Tab not found' }
      }

      // 检查是否可以关闭
      if (!workspace.canRemoveTab(tabId)) {
        return { success: false, error: 'Cannot remove this tab' }
      }

      // 处理未保存的内容
      if ((!skipSave && tab.kind === 'file') || tab.kind === 'new') {
        const doc = workspace.documents[tabId]
        if (doc?.dirty && !force) {
          // 需要用户确认保存
          if (ipc) {
            // 使用系统对话框
            messageBridge.send('request-close-tab', tabId)
            return { success: true, tabId } // 异步处理
          } else {
            // 无法显示对话框，返回错误
            return { success: false, error: 'Tab has unsaved changes' }
          }
        }
      }

      // 直接关闭
      workspace.removeTab(tabId)
      logger.info('Closed tab:', tabId)
      return { success: true, tabId }
    } catch (error) {
      logger.error('Failed to close tab:', error)
      return { success: false, error: String(error) }
    } finally {
      isOperating.value = false
    }
  }

  const moveTabToNewWindow = async (tabId: string): Promise<TabOperationResult> => {
    if (!ipc) {
      return { success: false, error: 'IPC not available' }
    }

    try {
      isOperating.value = true

      const tab = workspace.tabs.find((t) => t.id === tabId)
      if (!tab) {
        return { success: false, error: 'Tab not found' }
      }

      // 序列化 Tab 数据
      const tabData = {
        tab: {
          id: tab.id,
          kind: tab.kind,
          title: tab.title,
          subtitle: tab.subtitle,
          path: tab.path,
          format: tab.format,
          dirty: tab.dirty,
          readonly: tab.readonly,
          preview: tab.preview
        },
        document:
          tab.kind === 'file' || tab.kind === 'new' ? workspace.ensureDocument(tab.id) : null
      }

      // 创建新窗口
      const newWindowId = await messageBridge.invoke('create-window-with-tab', {
        tabData,
        focusMode: isFocusMode.value
      })

      // 从当前窗口移除
      workspace.removeTab(tabId)

      logger.info('Moved tab to new window:', { tabId, newWindowId })
      return { success: true, tabId }
    } catch (error) {
      logger.error('Failed to move tab to new window:', error)
      return { success: false, error: String(error) }
    } finally {
      isOperating.value = false
    }
  }

  const moveTabToWindow = async (
    tabId: string,
    targetWindowId: number
  ): Promise<TabOperationResult> => {
    if (!ipc) {
      return { success: false, error: 'IPC not available' }
    }

    try {
      isOperating.value = true

      const tab = workspace.tabs.find((t) => t.id === tabId)
      if (!tab) {
        return { success: false, error: 'Tab not found' }
      }

      // 序列化 Tab 数据
      const tabData = {
        tab: {
          id: tab.id,
          kind: tab.kind,
          title: tab.title,
          subtitle: tab.subtitle,
          path: tab.path,
          format: tab.format,
          dirty: tab.dirty,
          readonly: tab.readonly,
          preview: tab.preview
        },
        document:
          tab.kind === 'file' || tab.kind === 'new' ? workspace.ensureDocument(tab.id) : null,
        sourceWindowId: await messageBridge.invoke('get-window-id')
      }

      // 发送 Tab 到目标窗口
      messageBridge.send('transfer-tab-to-window', {
        targetWindowId,
        tabData,
        insertIndex: -1
      })

      // 从当前窗口移除
      workspace.removeTab(tabId)

      logger.info('Moved tab to window:', { tabId, targetWindowId })
      return { success: true, tabId }
    } catch (error) {
      logger.error('Failed to move tab to window:', error)
      return { success: false, error: String(error) }
    } finally {
      isOperating.value = false
    }
  }

  const reorderTabs = (fromIndex: number, toIndex: number): void => {
    if (fromIndex === toIndex) return
    if (fromIndex < 0 || fromIndex >= workspace.tabs.length) return
    if (toIndex < 0 || toIndex >= workspace.tabs.length) return

    const [tab] = workspace.tabs.splice(fromIndex, 1)
    workspace.tabs.splice(toIndex, 0, tab)
  }

  const saveTab = async (
    tabId: string,
    options: { saveAs?: boolean } = {}
  ): Promise<TabOperationResult> => {
    try {
      isOperating.value = true
      const result = await workspace.saveDocument(tabId, options)
      return { success: result, tabId }
    } catch (error) {
      logger.error('Failed to save tab:', error)
      return { success: false, error: String(error) }
    } finally {
      isOperating.value = false
    }
  }

  return {
    isOperating: computed(() => isOperating.value),
    createNewTab,
    openFileTab,
    closeTabById,
    moveTabToNewWindow,
    moveTabToWindow,
    reorderTabs,
    saveTab
  }
}

export default useTabOperations
