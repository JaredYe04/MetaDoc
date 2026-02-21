import { computed } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useWorkspace } from '../stores/workspace'
import { createRendererLogger } from '../utils/logger'
import messageBridge from '../bridge/message-bridge'

// Lazy logger to avoid circular dependency: logger → web-main-calls → router → … → useCloseTab → logger
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null
function getLogger() {
  if (!loggerInstance) loggerInstance = createRendererLogger('useCloseTab')
  return loggerInstance
}

// 模块级别的集合，跟踪正在关闭中的 Tab ID（防止快速双击 Ctrl+W 导致的竞态条件）
const closingTabIds = new Set<string>()

/**
 * 关闭 Tab 的 composable
 * 处理 UI 锁定检查、未保存内容确认、保存等逻辑
 */
export const useCloseTab = () => {
  const workspace = useWorkspace()
  const { t } = useI18n()
  const isLocked = computed(() => workspace.uiLocked?.value === true)

  /**
   * 关闭指定的 Tab
   * @param tabId Tab ID
   * @returns Promise<boolean> 是否成功关闭（false 表示用户取消或失败）
   */
  const closeTab = async (tabId: string): Promise<boolean> => {
    if (isLocked.value) return false

    // 防止重复关闭同一个 Tab（快速双击 Ctrl+W 保护）
    if (closingTabIds.has(tabId)) {
      getLogger().debug('Tab已在关闭中，忽略重复请求', tabId)
      return false
    }
    closingTabIds.add(tabId)

    try {
      // 再次检查，因为在 await 之前可能有其他操作
      const tab = workspace.tabs.find((t) => t.id === tabId)
      if (!tab) {
        getLogger().debug('Tab已不存在，跳过关闭', tabId)
        return false
      }

      if (!workspace.canRemoveTab(tabId)) {
        return false
      }

    // 如果是文档Tab且有未保存内容，需要确认
    if (tab.kind === 'file' || tab.kind === 'new') {
      const doc = workspace.documents[tabId]
      if (doc?.dirty) {
        if (!messageBridge.getIpc()) {
          try {
            await ElMessageBox.confirm(
              t('main.dialogs.closeTabMessage'),
              t('main.dialogs.closeTabTitle'),
              {
                type: 'warning',
                confirmButtonText: t('main.dialogs.closeTabConfirm'),
                cancelButtonText: t('main.dialogs.closeTabCancel')
              }
            )
          } catch {
            return false // 用户取消
          }
        } else {
          try {
            messageBridge.send('request-close-tab', tabId)
            const result = await new Promise<{
              tabId: string
              action: 'save' | 'discard' | 'cancel'
            }>((resolve) => {
              const handler = (
                _event: any,
                response: { tabId: string; action: 'save' | 'discard' | 'cancel' }
              ) => {
                if (response.tabId === tabId) {
                  messageBridge.removeListener('close-tab-response', handler)
                  resolve(response)
                }
              }
              messageBridge.on('close-tab-response', handler)
              setTimeout(() => {
                messageBridge.removeListener('close-tab-response', handler)
                resolve({ tabId, action: 'cancel' })
              }, 10000)
            })

            if (result.action === 'save') {
              const { saveDocument } = workspace
              const saveResult = await saveDocument(tabId, { saveAs: false })
              if (!saveResult) {
                return false
              }
            } else if (result.action === 'cancel') {
              return false
            }
          } catch (error) {
            getLogger().error('关闭tab失败:', error)
            return false
          }
        }
      }
    }

      workspace.removeTab(tabId)
      return true
    } finally {
      // 确保清理正在关闭的标记
      closingTabIds.delete(tabId)
    }
  }

  return {
    closeTab,
    isLocked
  }
}
