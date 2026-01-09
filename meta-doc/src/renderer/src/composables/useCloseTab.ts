import { computed } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useWorkspace } from '../stores/workspace'
import { createRendererLogger } from '../utils/logger'

const logger = createRendererLogger('useCloseTab')

/**
 * 关闭 Tab 的 composable
 * 处理 UI 锁定检查、未保存内容确认、保存等逻辑
 */
export const useCloseTab = () => {
  const workspace = useWorkspace()
  const { t } = useI18n()
  const isLocked = computed(() => workspace.uiLocked?.value === true)

  /**
   * 获取 IPC renderer
   */
  const getIpcRenderer = () => {
    if (window && (window as any).electron) {
      return (window as any).electron.ipcRenderer
    }
    return null
  }

  /**
   * 关闭指定的 Tab
   * @param tabId Tab ID
   * @returns Promise<boolean> 是否成功关闭（false 表示用户取消或失败）
   */
  const closeTab = async (tabId: string): Promise<boolean> => {
    if (isLocked.value) return false
    
    const tab = workspace.tabs.find(t => t.id === tabId)
    if (!tab) return false
    
    if (!workspace.canRemoveTab(tabId)) {
      return false
    }
    
    // 获取ipcRenderer
    const ipcRenderer = getIpcRenderer()
    
    // 如果是文档Tab且有未保存内容，需要确认
    if (tab.kind === 'file' || tab.kind === 'new') {
      const doc = workspace.documents[tabId]
      if (doc?.dirty) {
        if (!ipcRenderer) {
          try {
            await ElMessageBox.confirm(
              t('main.dialogs.closeTabMessage'),
              t('main.dialogs.closeTabTitle'),
              {
                type: 'warning',
                confirmButtonText: t('main.dialogs.closeTabConfirm'),
                cancelButtonText: t('main.dialogs.closeTabCancel'),
              },
            )
          } catch {
            return false // 用户取消
          }
        } else {
          try {
            ipcRenderer.send('request-close-tab', tabId)
            const result = await new Promise<{ tabId: string; action: 'save' | 'discard' | 'cancel' }>((resolve) => {
              const handler = (_event: any, response: { tabId: string; action: 'save' | 'discard' | 'cancel' }) => {
                if (response.tabId === tabId) {
                  ipcRenderer.removeListener('close-tab-response', handler)
                  resolve(response)
                }
              }
              ipcRenderer.on('close-tab-response', handler)
              setTimeout(() => {
                ipcRenderer.removeListener('close-tab-response', handler)
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
            logger.error('关闭tab失败:', error)
            return false
          }
        }
      }
    }
    
    workspace.removeTab(tabId)
    return true
  }

  return {
    closeTab,
    isLocked,
  }
}

