<template>
  <div class="common-layout">
    <!-- HeadMenu 最顶层占据一行 -->
    <el-header class="top-header">
      <HeadMenu />
    </el-header>
    <!-- 主内容区域：左边LeftMenu，右边router view -->
    <el-container class="main-shell">
      <el-aside class="side-menu">
        <LeftMenu />
      </el-aside>
      <el-container class="content-shell">
        <el-main class="content-main">
          <UserProfileCard v-if="showUserProfileCard" @close="showUserProfileCard = false" class="user-profile-card"
            :position="menuPosition" />
          <router-view></router-view>
        </el-main>
        <el-footer class="content-footer">
          <BottomMenu />
        </el-footer>
      </el-container>
    </el-container>
    <!-- 固定底部菜单 -->
    <!-- 固定的底部状态栏 -->

    <NotificationQueue />
    <AITaskQueue />
    <LoggerConsolePanel />
    
    <!-- 文件冲突对话框 -->
    <FileConflictDialog
      v-if="fileConflictData"
      v-model:visible="fileConflictDialogVisible"
      :fileName="getConflictFileName()"
      :current-content="fileConflictData.currentContent"
      :external-content="fileConflictData.externalContent"
      :saved-content="fileConflictData.savedContent"
      :format="fileConflictData.format"
      :merge-result="fileConflictData.mergeResult"
      @use-external="handleFileConflictUseExternal"
      @keep-current="handleFileConflictKeepCurrent"
      @merge="handleFileConflictMerge"
    />
  </div>
</template>

<script setup lang="ts">
// 不使用 Node.js path 模块，在浏览器环境中使用字符串操作
import LeftMenu from '../components/LeftMenu.vue'
import HeadMenu from '../components/HeadMenu.vue'
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { getRecentDocs, getSetting } from '../utils/settings.js'
import eventBus, { getWindowType } from '../utils/event-bus.js'
import { ElNotification, ElMessageBox } from 'element-plus'
import { lightTheme, darkTheme } from '../utils/themes.js'
import { useWorkspace } from '../stores/workspace'
import {
  loadDocumentFromJson,
  loadDocumentFromMarkdown,
  loadDocumentFromTex,
  type LoadedDocumentData,
} from '../services/document-loader'
import type { WorkspaceDocument } from '../stores/workspace'
import UserProfileCard from '../components/UserProfileCard.vue'
import { verifyToken } from '../utils/web-utils.ts'
import { useI18n } from 'vue-i18n'
import BottomMenu from '../components/BottomMenu.vue'
import AITaskQueue from '../components/AITaskQueue.vue'
import NotificationQueue from '../components/NotificationQueue.vue'
import LoggerConsolePanel from '../components/LoggerConsolePanel.vue'
import FileConflictDialog from '../components/FileConflictDialog.vue'
import { useRouter, useRoute } from 'vue-router'
const { t } = useI18n()

import { createRendererLogger } from '../utils/logger.ts'
const logger = createRendererLogger('Main', {
  windowTypeProvider: () => getWindowType()
})

const workspace = useWorkspace()
const {
  tabs: workspaceTabs,
  activeTabId,
  addDocumentTab,
  activateTab,
  ensureDocument,
  markDocumentSaved,
  removeTab,
  updateDocumentTex,
  updateDocumentMarkdown,
} = workspace

const cloneDeep = <T>(value: T): T => JSON.parse(JSON.stringify(value))

const createSnapshotFromLoadedData = (data: LoadedDocumentData): WorkspaceDocument => ({
  id: '',
  tabId: '',
  path: '',
  format: data.format,
  markdown: data.markdown,
  tex: data.tex,
  outline: cloneDeep(data.outline),
  meta: { ...data.meta },
  aiDialogs: cloneDeep(data.aiDialogs),
  agentSessions: cloneDeep(data.agentSessions),
  lastView: data.lastView,
  renderedHtml: '',
  dirty: false,
  savedMarkdown: data.markdown,
  savedTex: data.tex,
  savedOutline: cloneDeep(data.outline),
  savedMeta: { ...data.meta },
  savedAiDialogs: cloneDeep(data.aiDialogs),
  savedAgentSessions: cloneDeep(data.agentSessions),
})

type OpenDocumentPayload = {
  format?: string
  content?: string
  path?: string
  tabId?: string
}

const handleWorkspaceOpenDocument = (payload: OpenDocumentPayload) => {
  if (!payload || typeof payload !== 'object') {
    eventBus.emit('show-error', t('main.notification.error.title'))
    return
  }

  const format = (payload.format || '').toLowerCase()
  const content = payload.content ?? ''
  const resolvedPath = typeof payload.path === 'string' ? payload.path : ''

  const getDisplayName = (doc: WorkspaceDocument | null | undefined, filePath: string): string => {
    const title = doc?.meta?.title?.trim()
    if (title) {
      return title
    }
    if (filePath) {
      return extractFileName(filePath) || filePath
    }
    return t('workspace.untitledDocument')
  }

  if (resolvedPath) {
    const existing = workspaceTabs.find((tab) => tab.path === resolvedPath)
    if (existing) {
      activateTab(existing.id)
      const existingDoc = ensureDocument(existing.id)
      eventBus.emit('open-doc-success', {
        tabId: existing.id,
        path: resolvedPath,
        fileName: getDisplayName(existingDoc, resolvedPath)
      })
      eventBus.emit('is-need-save', false)
      return
    }
  }

  let snapshot = null
  let activated = false

  try {
    let loaded: LoadedDocumentData
    switch (format) {
      case 'json':
        loaded = loadDocumentFromJson(content)
        break
      case 'md':
        loaded = loadDocumentFromMarkdown(content)
        break
      case 'tex':
        loaded = loadDocumentFromTex(content)
        break
      default:
        throw new Error(`Unsupported document format: ${format}`)
    }

    snapshot = createSnapshotFromLoadedData(loaded)
    snapshot.path = resolvedPath
    snapshot.dirty = false

    // 检查当前活跃的tab是否是新建文档（可以替换）
    const currentTab = workspaceTabs.find(tab => tab.id === activeTabId.value)
    const canUseCurrentTab = currentTab && 
      (currentTab.kind === 'new' || !currentTab.path || currentTab.path === '') &&
      !currentTab.dirty

    let tab
    if (canUseCurrentTab && resolvedPath) {
      // 在当前tab中打开文档，替换新建文档
      const currentDoc = ensureDocument(currentTab.id)
      // 更新当前文档的内容
      Object.assign(currentDoc, snapshot)
      currentDoc.id = currentTab.id
      currentDoc.tabId = currentTab.id
      
      // 更新tab信息
      currentTab.kind = 'file'
      currentTab.path = resolvedPath
      currentTab.format = loaded.format
      currentTab.dirty = false
      
      markDocumentSaved(currentTab.id, resolvedPath || undefined)
      tab = currentTab
    } else {
      // 创建新tab
      tab = addDocumentTab(snapshot, {
        kind: 'file',
        dirty: false,
        path: resolvedPath,
        format: loaded.format,
      })
      const doc = ensureDocument(tab.id)
      doc.path = resolvedPath
      doc.format = loaded.format
      markDocumentSaved(tab.id, resolvedPath || undefined)
    }
    
    activateTab(tab.id)
    activated = true

    eventBus.emit('open-doc-success', {
      tabId: tab.id,
      path: resolvedPath,
      fileName: getDisplayName(ensureDocument(tab.id), resolvedPath)
    })
    eventBus.emit('is-need-save', false)
  } catch (error) {
    logger.error('Failed to open document:', error)
    const message = error instanceof Error ? error.message : String(error)
    eventBus.emit('show-error', `${t('main.notification.error.title')}: ${message}`)
  } finally {
  }
}

const showUserProfileCard = ref(false)
const autoSaveEnabled = ref(false)
const autoSaveInterval = ref(2147483647)
const menuPosition = ref({ top: 100, left: 100 });
async function autoSave() {
  do {
    const autoSave = await getSetting('autoSave')
    if (autoSave === 'never') {
      autoSaveEnabled.value = false
      autoSaveInterval.value = 2147483647
    } else {
      autoSaveEnabled.value = true
      autoSaveInterval.value = autoSave * 60 * 1000
    }
    await new Promise((resolve) => setTimeout(resolve, autoSaveInterval.value))
    if (autoSaveEnabled.value) eventBus.emit('save', 'auto-save')
  } while (true)
}

onMounted(async () => {
  eventBus.on('refresh', () => {
      const title = workspace.activeDocument.value?.meta?.title ?? ''
      eventBus.emit('update-window-title', title)
    })

  eventBus.emit('llm-api-updated')
  const token = localStorage.getItem('loginToken')
  if (token) {
    localStorage.setItem('loginToken', token)
    await verifyToken(token)//自动登录
  }
  await autoSave()


})

const workspaceOpenDocumentHandler = (payload: unknown) => {
  handleWorkspaceOpenDocument(payload as OpenDocumentPayload)
}

eventBus.on('workspace-open-document', workspaceOpenDocumentHandler)

eventBus.on('toggle-user-profile', () => {
  showUserProfileCard.value = !showUserProfileCard.value
})
eventBus.on('save-success', (payload) => {
  const maybeTabId =
    payload && typeof payload === 'object' && 'tabId' in payload && typeof payload.tabId === 'string'
      ? payload.tabId
      : activeTabId.value
  if (maybeTabId) {
    workspace.updateDocumentDirty(maybeTabId)
  }
  eventBus.emit('is-need-save', false)
});

eventBus.on('open-doc-success', async (payload) => {
  let tabId
  if (payload && typeof payload === 'object' && 'tabId' in payload) {
    const value = payload.tabId
    if (typeof value === 'string') {
      tabId = value
    }
  }
  
  // 启动文件监听（如果文件路径存在）
  if (payload && typeof payload === 'object' && 'path' in payload && payload.path) {
    const filePath = payload.path as string
    // 获取 ipcRenderer
    let ipcRenderer: any = null
    if (window && (window as any).electron) {
      ipcRenderer = (window as any).electron.ipcRenderer
    } else {
      const { localIpcRenderer } = await import('../utils/web-adapter/local-ipc-renderer')
      ipcRenderer = localIpcRenderer
    }
    
    if (ipcRenderer) {
      // 启动文件监听
      ipcRenderer.send('watch-file', filePath, tabId)
      logger.debug('启动文件监听', { filePath, tabId })
    }
  }
});
// 处理新建文档请求 - 在 Main.vue 中监听，因为 Main.vue 总是被挂载
// 而 Editor.vue 只在 /editor 路由下才挂载，在其他页面（如 Home）时无法响应事件
const handleNewDocumentRequest = () => {
  workspace.openNewDocumentTab()
}

eventBus.on('new-doc', handleNewDocumentRequest)

// 处理关闭当前活跃 Tab 的请求 - 使用系统对话框
const handleCloseActiveTabRequest = async () => {
  if (workspace.uiLocked?.value === true) return;
  const tabId = activeTabId.value;
  if (!tabId) return;
  
  // 获取ipcRenderer
  let ipcRenderer: any = null;
  if (window && (window as any).electron) {
    ipcRenderer = (window as any).electron.ipcRenderer;
  }
  
  if (!ipcRenderer) {
    // 如果没有ipcRenderer，回退到原来的逻辑
    const doc = ensureDocument(tabId);
    if (doc?.dirty) {
      try {
        await ElMessageBox.confirm(
          t('main.dialogs.closeTabMessage'),
          t('main.dialogs.closeTabTitle'),
          {
            type: 'warning',
            confirmButtonText: t('main.dialogs.closeTabConfirm'),
            cancelButtonText: t('main.dialogs.closeTabCancel'),
          },
        );
      } catch {
        return; // 用户取消，不关闭
      }
    }
    removeTab(tabId);
    return;
  }
  
  // 使用系统对话框
  try {
    // 发送请求到主进程
    ipcRenderer.send('request-close-tab', tabId);
    
    // 等待响应
    const result = await new Promise<{ tabId: string; action: 'save' | 'discard' | 'cancel' }>((resolve) => {
      const handler = (_event: any, response: { tabId: string; action: 'save' | 'discard' | 'cancel' }) => {
        if (response.tabId === tabId) {
          ipcRenderer.removeListener('close-tab-response', handler);
          resolve(response);
        }
      };
      ipcRenderer.on('close-tab-response', handler);
      // 设置超时，避免无限等待
      setTimeout(() => {
        ipcRenderer.removeListener('close-tab-response', handler);
        resolve({ tabId, action: 'cancel' });
      }, 10000);
    });
    
    if (result.action === 'save') {
      // 用户选择保存
      const { saveDocument } = workspace;
      const saveResult = await saveDocument(tabId, { saveAs: false });
      if (saveResult) {
        removeTab(tabId);
      }
    } else if (result.action === 'discard') {
      // 用户选择放弃，直接关闭tab
      removeTab(tabId);
    }
    // 如果action是'cancel'，不做任何操作
  } catch (error) {
    logger.error('关闭tab失败:', error);
  }
}

eventBus.on('close-active-tab', handleCloseActiveTabRequest)

// 文件冲突对话框状态
const fileConflictDialogVisible = ref(false)
const fileConflictData = ref<{
  tabId: string
  filePath: string
  externalContent: string
  currentContent: string
  savedContent: string
  format: 'md' | 'tex'
  mergeResult?: {
    hasConflict: boolean
    conflictRanges?: Array<{
      start: number
      end: number
      baseText: string
      currentText: string
      externalText: string
    }>
  }
} | null>(null)

// 处理文件冲突
eventBus.on('file-conflict-detected', (payload: unknown) => {
  const conflictPayload = payload as {
    tabId: string
    filePath: string
    externalContent: string
    currentContent: string
    savedContent: string
    format: 'md' | 'tex'
    mergeResult?: {
      hasConflict: boolean
      conflictRanges?: Array<{
        start: number
        end: number
        baseText: string
        currentText: string
        externalText: string
      }>
    }
  }
  
  const { tabId, filePath, externalContent, currentContent, savedContent, format, mergeResult } = conflictPayload
  
  // 显示冲突对话框
  fileConflictData.value = {
    tabId,
    filePath,
    externalContent,
    currentContent,
    savedContent,
    format,
    mergeResult
  }
  fileConflictDialogVisible.value = true
})

// 处理冲突对话框的选择
const handleFileConflictUseExternal = () => {
  if (!fileConflictData.value) return
  
  const { tabId, filePath, externalContent, format } = fileConflictData.value
  const doc = ensureDocument(tabId)
  
  if (doc) {
    // 注意：externalContent 已经是移除 meta-info 后的内容
    // MetaDoc 会在下次保存时自动注入自己的 meta-info，所以这里不需要额外处理
    if (format === 'tex') {
      updateDocumentTex(tabId, externalContent)
    } else {
      updateDocumentMarkdown(tabId, externalContent)
    }
    markDocumentSaved(tabId, filePath)
    eventBus.emit('show-info', t('main.notification.fileSynced', { defaultValue: '已同步外部文件更改' }))
  }
  
  fileConflictDialogVisible.value = false
  fileConflictData.value = null
}

const handleFileConflictKeepCurrent = () => {
  if (!fileConflictData.value) return
  
  eventBus.emit('show-info', t('main.notification.keptCurrentVersion', { defaultValue: '已保留当前版本' }))
  fileConflictDialogVisible.value = false
  fileConflictData.value = null
}

const handleFileConflictMerge = (mergedContent: string) => {
  if (!fileConflictData.value) return
  
  const { tabId, filePath, format } = fileConflictData.value
  const doc = ensureDocument(tabId)
  
  if (doc) {
    // 应用合并后的内容
    if (format === 'tex') {
      updateDocumentTex(tabId, mergedContent)
    } else {
      updateDocumentMarkdown(tabId, mergedContent)
    }
    // 注意：不调用 markDocumentSaved，因为合并后的内容可能仍然与外部文件不同
    eventBus.emit('show-info', t('main.notification.mergedConflicts', { defaultValue: '冲突已合并' }))
  }
  
  fileConflictDialogVisible.value = false
  fileConflictData.value = null
}

// 提取文件名（不依赖 Node.js path 模块）
const extractFileName = (fullPath: string): string => {
  if (!fullPath) return ''
  const segments = fullPath.split(/[/\\]+/).filter(Boolean)
  return segments[segments.length - 1] ?? ''
}

const getConflictFileName = () => {
  if (!fileConflictData.value) return ''
  return extractFileName(fileConflictData.value.filePath)
}

eventBus.on('show-error', (message) => {
  ElNotification({
    title: t('main.notification.error.title'),
    message: message as string,
    type: 'error',
  });
});
eventBus.on('show-warning', (message) => {
  ElNotification({
    title: t('main.notification.warning.title'),
    message: message as string,
    type: 'warning',
  });
});

onBeforeUnmount(() => {
  eventBus.off('workspace-open-document', workspaceOpenDocumentHandler)
  eventBus.off('new-doc', handleNewDocumentRequest)
  eventBus.off('close-active-tab', handleCloseActiveTabRequest)
})

</script>

<style scoped>
/* 现代桌面应用布局 */
.common-layout {
  height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--el-bg-color, #ffffff);
}

/* 确保整体布局不产生滚动条 */
.common-layout,
.common-layout * {
  box-sizing: border-box;
}

/* 顶部Header - 最顶层占据一行 */
.top-header {
  flex: 0 0 40px;
  height: 40px;
  padding: 0;
  background-color: var(--el-bg-color, #ffffff);
  border-bottom: 1px solid var(--el-border-color-lighter, #f0f0f0);
  z-index: 100;
}

.main-shell {
  flex: 1;
  display: flex;
  height: calc(100vh - 40px);
  overflow: hidden;
  background-color: var(--el-bg-color, #ffffff);
}

.side-menu {
  width: fit-content;
  min-width: 64px;
  background-color: var(--el-bg-color, #ffffff);
  border-right: 1px solid var(--el-border-color-lighter, #f0f0f0);
  overflow: hidden;
}

.content-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  flex: 1;
  background-color: var(--el-bg-color-page, #f5f7fa);
}

.content-main {
  flex: 1 1 auto;
  padding: 0;
  margin: 0;
  position: relative;
  overflow: hidden;
}

.content-main > :deep(.el-scrollbar__wrap),
.content-main > :deep(.el-scrollbar__bar) {
  display: none;
}

.content-footer {
  height: 28px;
  padding: 0;
  flex: 0 0 28px;
  display: flex;
  align-items: stretch;
  background-color: var(--el-bg-color, #ffffff);
  border-top: 1px solid var(--el-border-color-lighter, #f0f0f0);
}

.user-profile-card {
  position: absolute;
  top: 20%;
  left: 20%;
  z-index: 1000;
  min-width: 300px;
  min-height: 300px;
  width: fit-content;
  height: fit-content;

  box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.1);
}
</style>