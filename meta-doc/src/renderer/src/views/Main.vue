<template>
  <div class="common-layout">
    <el-container class="main-shell">
      <el-aside class="side-menu">
        <LeftMenu />
      </el-aside>
      <el-container class="content-shell">
        <el-header class="content-header">
          <HeadMenu />
        </el-header>
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
  </div>
</template>

<script setup lang="ts">
import path from 'path'
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
      try {
        return path.basename(filePath)
      } catch (error) {
        logger.warn('解析文件名失败', error)
        const segments = filePath.split(/[\\/]/)
        return segments[segments.length - 1] || filePath
      }
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

    const tab = addDocumentTab(snapshot, {
      kind: 'file',
      dirty: false,
      path: resolvedPath,
      format: loaded.format,
    })
    const doc = ensureDocument(tab.id)
    doc.path = resolvedPath
    doc.format = loaded.format
    markDocumentSaved(tab.id, resolvedPath || undefined)
    activateTab(tab.id)
    activated = true

    eventBus.emit('open-doc-success', {
      tabId: tab.id,
      path: resolvedPath,
      fileName: getDisplayName(doc, resolvedPath)
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

eventBus.on('open-doc-success', (payload) => {
  let tabId
  if (payload && typeof payload === 'object' && 'tabId' in payload) {
    const value = payload.tabId
    if (typeof value === 'string') {
      tabId = value
    }
  }
});
// 处理新建文档请求 - 在 Main.vue 中监听，因为 Main.vue 总是被挂载
// 而 Editor.vue 只在 /editor 路由下才挂载，在其他页面（如 Home）时无法响应事件
const handleNewDocumentRequest = () => {
  workspace.openNewDocumentTab()
}

eventBus.on('new-doc', handleNewDocumentRequest)

// 处理关闭当前活跃 Tab 的请求 - 在 Main.vue 中统一处理，逻辑与 WorkspaceTabs.vue 的 handleRemove 相同
// 包括检查文档是否 dirty 和显示确认对话框
const handleCloseActiveTabRequest = async () => {
  if (workspace.uiLocked?.value === true) return;
  const tabId = activeTabId.value;
  if (!tabId) return;
  
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
}

eventBus.on('close-active-tab', handleCloseActiveTabRequest)

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
.common-layout {
  height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-shell {
  flex: 1;
  display: flex;
  height: 100%;
  overflow: hidden;
}

.side-menu {
  width: fit-content;
}

.content-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.content-header {
  flex: 0 0 auto;
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
  height: 30px;
  padding: 0;
  flex: 0 0 auto;
  display: flex;
  align-items: stretch;
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