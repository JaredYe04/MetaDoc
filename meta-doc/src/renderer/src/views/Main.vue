<template>
  <div class="common-layout">
    <!-- 占位：保持布局，实际内容通过 Teleport 渲染到 body 以始终置顶 -->
    <div class="top-header-container top-header-placeholder" :class="{ 'is-mac': isMac }" />
    <!-- 顶部区域：Logo + MainTabs，Teleport 到 body 确保无条件始终在最顶层 -->
    <Teleport to="body">
      <div class="top-header-container top-header-floating" :class="{ 'is-mac': isMac }">
        <LogoTab v-if="!isMac" />
        <el-header class="top-header">
          <MainTabs />
        </el-header>
        <LogoTab v-if="isMac" />
      </div>
    </Teleport>
    <!-- 主内容区域：左边LeftMenu，中间ViewMenuContainer，右边内容 -->
    <el-container class="main-shell">
      <el-aside class="side-menu">
        <LeftMenu />
      </el-aside>
      <!-- ViewMenuContainer：包含工作目录菜单和主内容区 -->
      <ViewMenuContainer>
        <div class="content-area-wrapper">
          <el-container class="content-area">
            <!-- 子视图菜单（仅在文档相关视图显示） -->
            <el-aside
              v-if="showSubViewMenu"
              class="sub-view-menu-aside"
              :class="{ 'is-collapsed': viewMenuCollapsed }"
            >
              <ViewMenu />
            </el-aside>
            <el-container class="content-shell">
              <el-main class="content-main">
                <UserProfileCard
                  v-if="showUserProfileCard"
                  @close="showUserProfileCard = false"
                  class="user-profile-card"
                  :position="menuPosition"
                />
                <!-- Tab内容区域 - 使用TabContentRenderer组件处理所有Tab渲染 -->
                <TabContentRenderer />
              </el-main>
            </el-container>
          </el-container>
        </div>
      </ViewMenuContainer>
    </el-container>
    <!-- BottomMenu放在最下侧，在所有内容之上 -->
    <el-footer class="bottom-footer">
      <BottomMenu />
    </el-footer>
    <!-- 固定底部菜单 -->
    <!-- 固定的底部状态栏 -->

    <!-- 全局进度条：仅在此挂载一次，用于导出 docx/pdf/tex 等进度显示 -->
    <GlobalProgressBar />
    <AITaskQueue />
    <LoggerConsolePanel />
    <TabSwitcherOverlay />

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
// ============================================================================
// 导入组件
// ============================================================================
import LeftMenu from '../components/LeftMenu.vue'
import ViewMenu from '../components/ViewMenu.vue'
import MainTabs from '../components/MainTabs.vue'
import LogoTab from '../components/LogoTab.vue'
import ViewMenuContainer from '../components/ViewMenuContainer.vue'
import UserProfileCard from '../components/UserProfileCard.vue'
import BottomMenu from '../components/BottomMenu.vue'
import AITaskQueue from '../components/AITaskQueue.vue'
import LoggerConsolePanel from '../components/LoggerConsolePanel.vue'
import FileConflictDialog from '../components/FileConflictDialog.vue'
import TabContentRenderer from '../components/TabContentRenderer.vue'
import GlobalProgressBar from '../components/GlobalProgressBar.vue'

// ============================================================================
// 导入工具和库
// ============================================================================
import { onMounted, onBeforeUnmount, ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { messageBox } from '@renderer/utils/messageBox'
import { notifySuccess, notifyError, notifyWarning } from '@renderer/utils/notify'
import { getSetting, updateRecentDocs } from '../utils/settings.js'
import eventBus, { getWindowType } from '../utils/event-bus.js'
import { useWorkspace, hasDocumentContent as checkDocumentContent } from '../stores/workspace'

// 检测是否为 macOS
const isMac = computed(() => {
  // //debug
  // return true
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.platform)
})
import {
  loadDocumentFromJson,
  loadDocumentFromMarkdown,
  loadDocumentFromTex,
  loadDocumentFromPlainText,
  type LoadedDocumentData
} from '../services/document-loader'
import type { WorkspaceDocument, WorkspaceTab, DocumentView } from '../stores/workspace'
import { convertMarkdownBodyToLatex } from '../utils/latex-utils'
import { verifyToken } from '../utils/web-utils.ts'
import { createRendererLogger } from '../utils/logger.ts'
import { extname } from '../utils/path-utils'
import { formatRegistry } from '../utils/format-registry'

import TabSwitcherOverlay from '../components/TabSwitcherOverlay.vue'
import { useTabSwitcher } from '../composables/useTabSwitcher'
import { useCloseTab } from '../composables/useCloseTab'
import messageBridge from '../bridge/message-bridge'

// ============================================================================
// 初始化和基础设置
// ============================================================================
const { t } = useI18n()
const logger = createRendererLogger('Main', {
  windowTypeProvider: () => getWindowType()
})
const workspace = useWorkspace()
const tabSwitcher = useTabSwitcher()
const { checkCanCloseTab, doRemoveTab } = useCloseTab()

// ============================================================================
// 计算属性和状态
// ============================================================================
const {
  tabs: workspaceTabs,
  activeTabId,
  addDocumentTab,
  activateTab,
  ensureDocument,
  markDocumentSaved,
  removeTab,
  getPreviewTab,
  createDocumentSnapshotFromTemplate,
  updateDocumentTex,
  updateDocumentMarkdown,
  refreshActiveTabMetadata,
  updateDocumentLastView
} = workspace

// 判断是否显示子视图菜单（仅在文档相关视图显示）
const showSubViewMenu = computed(() => {
  const activeTab = workspace.tabs.find((t) => t.id === workspace.activeTabId.value)
  if (!activeTab) return false
  return activeTab.kind === 'file' || activeTab.kind === 'new'
})

// 工作区 grep 跳转：若打开文档尚未完成则暂存，待 open-doc-success 后执行
const pendingGrepGoto = ref<{
  path: string
  line: number
  column: number
  matchLength?: number
  matchText?: string
} | null>(null)

// UI状态
const showUserProfileCard = ref(false)
const menuPosition = ref({ top: 100, left: 100 })
const viewMenuCollapsed = ref(false) // 默认展开，除非用户手动折叠
const fileConflictDialogVisible = ref(false)
const fileConflictData = ref<{
  tabId: string
  filePath: string
  externalContent: string
  currentContent: string
  savedContent: string
  format: 'md' | 'tex' | 'txt' | string
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

// ============================================================================
// 工具函数
// ============================================================================
const cloneDeep = <T,>(value: T): T => JSON.parse(JSON.stringify(value))

// 规范化内容（统一换行符）
const normalizeContent = (value: string | null | undefined): string => {
  if (!value) return ''
  return value.replace(/\r\n/g, '\n')
}

// 路径规范化比较（用于 grep 跳转等）
const normalizePathForGrep = (p: string) => (p || '').replace(/\\/g, '/')

// 使用 workspace 导出的统一函数
const hasDocumentContent = (doc: WorkspaceDocument): boolean => {
  return checkDocumentContent(doc)
}

// 提取文件名（不依赖 Node.js path 模块）
const extractFileName = (fullPath: string): string => {
  if (!fullPath) return ''
  const segments = fullPath.split(/[/\\]+/).filter(Boolean)
  return segments[segments.length - 1] ?? ''
}

// ============================================================================
// 文档处理函数
// ============================================================================
const createSnapshotFromLoadedData = (data: LoadedDocumentData): WorkspaceDocument => {
  const normalizedMarkdown = normalizeContent(data.markdown)
  const normalizedTex = normalizeContent(data.tex)

  const tempDoc: WorkspaceDocument = {
    id: '',
    tabId: '',
    path: '',
    format: data.format,
    markdown: normalizedMarkdown,
    tex: normalizedTex,
    outline: cloneDeep(data.outline),
    meta: { ...data.meta },
    aiDialogs: cloneDeep(data.aiDialogs),
    agentSessions: cloneDeep(data.agentSessions),
    lastView: 'editor',
    renderedHtml: '',
    dirty: false,
    savedMarkdown: normalizedMarkdown,
    savedTex: normalizedTex,
    savedOutline: cloneDeep(data.outline),
    savedMeta: { ...data.meta },
    savedAiDialogs: cloneDeep(data.aiDialogs),
    savedAgentSessions: cloneDeep(data.agentSessions)
  }

  const hasContent = hasDocumentContent(tempDoc)
  const initialView: DocumentView = hasContent ? 'home' : 'editor'

  logger.debug('创建文档快照', {
    format: data.format,
    markdownLength: normalizedMarkdown.length,
    texLength: normalizedTex.length,
    hasContent,
    initialView
  })

  return {
    ...tempDoc,
    lastView: initialView
  }
}

// ============================================================================
// 文档打开处理
// ============================================================================
type OpenDocumentPayload = {
  format?: string
  content?: string
  path?: string
  tabId?: string
  /** 预览模式：不列入“已打开文件”，仅一个预览 tab */
  preview?: boolean
}

const handleWorkspaceOpenDocument = async (payload: OpenDocumentPayload) => {
  if (!payload || typeof payload !== 'object') {
    eventBus.emit('show-error', t('main.notification.error.title'))
    return
  }

  let format = (payload.format || '').toLowerCase()
  let content = payload.content ?? ''
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

  const isPreview = payload.preview === true

  const normalizePathForCompare = (p: string) => (p || '').replace(/\\/g, '/')
  const resolvedPathNorm = normalizePathForCompare(resolvedPath)

  // 仅指定 tabId（如工作区搜索点击未命名文档）：激活已有 Tab
  if (payload.tabId && !resolvedPath) {
    const existingByTabId = workspaceTabs.find((t) => t.id === payload.tabId)
    if (existingByTabId && (existingByTabId.kind === 'file' || existingByTabId.kind === 'new')) {
      activateTab(existingByTabId.id)
      const existingDoc = ensureDocument(existingByTabId.id)
      eventBus.emit('open-doc-success', {
        tabId: existingByTabId.id,
        path: '',
        fileName: getDisplayName(existingDoc, ''),
        isPreview: false
      })
      return
    }
  }

  if (resolvedPath) {
    // 先检查当前窗口是否已打开该文件（路径规范化后比较，避免 D:\ 与 D:/ 等导致误判）
    const existing = workspaceTabs.find(
      (tab) => normalizePathForCompare(tab.path || '') === resolvedPathNorm
    )
    if (existing) {
      activateTab(existing.id)
      const existingDoc = ensureDocument(existing.id)
      eventBus.emit('open-doc-success', {
        tabId: existing.id,
        path: resolvedPath,
        fileName: getDisplayName(existingDoc, resolvedPath),
        isPreview: existing.preview === true
      })
      eventBus.emit('is-need-save', false)
      return
    }

    // 预览模式：若已有预览 tab 则先关闭（保证仅一个预览 tab）
    if (isPreview) {
      const previewTab = getPreviewTab()
      if (previewTab) {
        removeTab(previewTab.id)
      }
    }

    // 预占式注册：防止并发重复打开
    if (messageBridge.getIpc()) {
      // 生成 tabId（在预占时就需要）
      const tempTabId = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

      const claim = (await messageBridge.invoke('claim-file-open', {
        filePath: resolvedPath,
        tabId: tempTabId
      })) as {
        success: boolean
        existingWindowId?: number
        existingTabId?: string
        existingState?: string
      }

      if (!claim.success) {
        // 文件已被其他地方打开，尝试激活对应窗口
        if (claim.existingWindowId && claim.existingTabId) {
          // 重试一次（如果是 transferring 状态）
          if (claim.existingState === 'transferring') {
            await new Promise((resolve) => setTimeout(resolve, 600))
            const retryResult = (await messageBridge.invoke(
              'find-window-with-file',
              resolvedPath
            )) as { windowId: number | null; tabId: string | null }
            if (retryResult.windowId && retryResult.tabId) {
              // 主进程会处理窗口切换和Tab激活
              logger.info(`文件 ${resolvedPath} 转移完成，将切换到窗口 ${retryResult.windowId}`)
              return
            }
          }

          // 如果已有窗口打开，让主进程处理窗口切换
          logger.info(
            `文件 ${resolvedPath} 已在窗口 ${claim.existingWindowId} 的Tab ${claim.existingTabId} 中打开`
          )
          // 调用 find-window-with-file 触发主进程的窗口切换逻辑
          await messageBridge.invoke('find-window-with-file', resolvedPath)
        }
        return
      }

      // 预占成功，继续打开流程
      // 在 try-catch 中确保释放预占或确认打开
      try {
        // 继续下面的打开逻辑...
      } catch (error) {
        // 打开失败，释放预占
        await messageBridge.invoke('release-file-claim', resolvedPath)
        throw error
      }
    }
  }

  // 如果格式未指定，只通过扩展名检测格式（不读取文件内容进行检测）
  if (!format && resolvedPath) {
    const ext = extname(resolvedPath)
    format = formatRegistry.getFormatByExtension(ext) || 'txt'
  }

  // 如果仍然没有格式，使用默认格式
  if (!format) {
    format = 'txt'
  }

  // PDF 文件：预览模式仅建 PDF tab 不转换；正式打开则转换为 Markdown 编辑
  const isPdf = format === 'pdf' || (resolvedPath && extname(resolvedPath).toLowerCase() === '.pdf')
  if (isPdf && isPreview) {
    // 预览 PDF：不转换，创建 PDF 预览 tab，Home 中显示 PDF 组件
    const pdfFileName = extractFileName(resolvedPath) || ''
    const snapshot = createDocumentSnapshotFromTemplate('md', '')
    snapshot.path = resolvedPath
    snapshot.format = 'pdf'
    const tab = addDocumentTab(snapshot, {
      kind: 'file',
      path: resolvedPath,
      format: 'pdf',
      preview: true,
      title: pdfFileName.replace(/\.pdf$/i, '') || pdfFileName,
      subtitle: pdfFileName,
      dirty: false
    })
    const doc = ensureDocument(tab.id)
    doc.path = resolvedPath
    doc.format = 'pdf'
    doc.lastView = 'home'
    if (pdfFileName) {
      doc.meta.title = pdfFileName.replace(/\.pdf$/i, '')
    }
    // 不要调用 initializeDocumentFromTemplate：它会用模板覆盖 doc.path/doc.format/tab 导致标题变成「未命名文档」、Home 无法识别 PDF
    refreshActiveTabMetadata()
    activateTab(tab.id)
    eventBus.emit('open-doc-success', {
      tabId: tab.id,
      path: resolvedPath,
      fileName: getDisplayName(doc, resolvedPath),
      isPreview: true
    })
    eventBus.emit('is-need-save', false)
    // 文件打开成功，确认注册
    if (resolvedPath && messageBridge.getIpc()) {
      await messageBridge.invoke('confirm-file-open', resolvedPath)
    }
    return
  }
  if (isPdf && !isPreview) {
    try {
      if (!messageBridge.getIpc()?.invoke) {
        throw new Error('IPC 渲染器不可用')
      }
      const result = (await messageBridge.invoke('convert-pdf-to-markdown', resolvedPath)) as {
        success: boolean
        markdown?: string
        error?: string
      }
      if (!result.success || !result.markdown) {
        throw new Error(result.error || 'PDF转换失败')
      }
      const loaded = await loadDocumentFromMarkdown(result.markdown, undefined)
      const snapshot = createSnapshotFromLoadedData(loaded)
      snapshot.path = ''
      snapshot.dirty = true
      const tab = addDocumentTab(snapshot, {
        kind: 'file',
        dirty: true,
        path: '',
        format: 'md',
        preview: false
      })
      const doc = ensureDocument(tab.id)
      doc.path = ''
      doc.format = 'md'
      const pdfFileName = extractFileName(resolvedPath)
      if (pdfFileName) {
        doc.meta.title = pdfFileName.replace(/\.pdf$/i, '')
      }
      workspace.initializeDocumentFromTemplate(tab.id, 'md', 'blank', 'editor')
      refreshActiveTabMetadata()
      activateTab(tab.id)
      eventBus.emit('open-doc-success', {
        tabId: tab.id,
        path: '',
        fileName: getDisplayName(doc, '')
      })
      eventBus.emit('is-need-save', true)
      // PDF转换为MD后，MD tab是新文档（path为空），不应该占用原PDF文件的打开状态
      // 释放PDF路径的占用，允许用户再次打开原PDF文件
      if (resolvedPath && messageBridge.getIpc()) {
        await messageBridge.invoke('release-file-claim', resolvedPath)
      }
      return
    } catch (error) {
      logger.error('PDF转换失败:', error)
      const message = error instanceof Error ? error.message : String(error)
      eventBus.emit('show-error', `PDF转换失败: ${message}`)
      // PDF转换失败，释放预占
      if (resolvedPath && messageBridge.getIpc()) {
        await messageBridge.invoke('release-file-claim', resolvedPath)
      }
      return
    }
  }

  // 如果内容为空但有路径，读取文件内容（但不用于格式检测）
  if (!content && resolvedPath) {
    try {
      if (messageBridge.getIpc()?.invoke) {
        content = ((await messageBridge.invoke('read-file-content', resolvedPath)) as string) || ''
      }
    } catch (err) {
      logger.error('读取文件内容失败:', err)
      content = ''
    }
  }

  let snapshot = null
  let activated = false

  try {
    let loaded: LoadedDocumentData
    switch (format) {
      case 'json':
        // JSON 文件当作纯文本处理（历史遗留格式会特殊处理）
        loaded = loadDocumentFromJson(content)
        break
      case 'txt':
      case 'text':
        // 纯文本格式
        loaded = loadDocumentFromPlainText(content)
        break
      case 'md':
      case 'markdown':
        loaded = await loadDocumentFromMarkdown(content, resolvedPath)
        break
      case 'tex':
      case 'latex':
        loaded = await loadDocumentFromTex(content, resolvedPath)
        break
      default:
        // 其他格式，默认当作纯文本处理（不再使用内容检测）
        loaded = loadDocumentFromPlainText(content)
    }

    snapshot = createSnapshotFromLoadedData(loaded)
    snapshot.path = resolvedPath
    snapshot.dirty = false

    // 再次检查文件是否已打开（可能在异步操作期间已被打开，路径规范化比较）
    if (resolvedPath) {
      const existingAfterCheck = workspaceTabs.find(
        (tab) => normalizePathForCompare(tab.path || '') === resolvedPathNorm
      )
      if (existingAfterCheck) {
        // 文件已在异步操作期间被打开，激活现有Tab并返回
        // 释放预占，让实际打开的窗口持有
        if (resolvedPath && messageBridge.getIpc()) {
          await messageBridge.invoke('release-file-claim', resolvedPath)
        }
        activateTab(existingAfterCheck.id)
        const existingDoc = ensureDocument(existingAfterCheck.id)
        eventBus.emit('open-doc-success', {
          tabId: existingAfterCheck.id,
          path: resolvedPath,
          fileName: getDisplayName(existingDoc, resolvedPath)
        })
        eventBus.emit('is-need-save', false)
        return
      }
    }

    const tab: WorkspaceTab = addDocumentTab(snapshot, {
      kind: 'file',
      dirty: false,
      path: resolvedPath,
      format: loaded.format,
      preview: payload.preview ?? false
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
      fileName: getDisplayName(ensureDocument(tab.id), resolvedPath)
    })
    eventBus.emit('is-need-save', false)

    // 文件打开成功，确认注册
    if (resolvedPath && messageBridge.getIpc()) {
      await messageBridge.invoke('confirm-file-open', resolvedPath)
    }
  } catch (error) {
    logger.error('Failed to open document:', error)
    const message = error instanceof Error ? error.message : String(error)
    eventBus.emit('show-error', `${t('main.notification.error.title')}: ${message}`)
    // 打开失败，释放预占
    if (resolvedPath && messageBridge.getIpc()) {
      await messageBridge.invoke('release-file-claim', resolvedPath)
    }
  }
}

// ============================================================================
// 自动保存
// ============================================================================
const autoSaveEnabled = ref(false)
const autoSaveInterval = ref(2147483647)
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

// ============================================================================
// 事件监听器管理
// ============================================================================
const cleanupMainListeners: (() => void)[] = []

/**
 * 初始化 Main 组件的事件监听器
 */
function initMainEventListeners() {
  // 刷新事件 - 只在非 GlobalHome 时更新标题
  const handleRefresh = () => {
    // 检查当前活动的 tab 是否是 GlobalHome
    const currentTab = workspace.tabs.find((t) => t.id === workspace.activeTabId.value)
    if (currentTab && currentTab.route === '/global-home') {
      // 如果是 GlobalHome，不更新标题，保持主页标题
      return
    }
    const title = workspace.activeDocument.value?.meta?.title ?? ''
    eventBus.emit('update-window-title', title)
  }
  eventBus.on('refresh', handleRefresh)

  // Tab切换器快捷键
  const handleTabNext = () => {
    tabSwitcher.showSwitcher('next')
  }
  eventBus.on('tab-next', handleTabNext)

  const handleTabPrev = () => {
    tabSwitcher.showSwitcher('prev')
  }
  eventBus.on('tab-prev', handleTabPrev)

  const handleTabClose = async () => {
    const tabId = activeTabId.value
    if (!tabId) return

    // 先检查是否可以关闭
    const canClose = await checkCanCloseTab(tabId)
    if (!canClose) return

    // 🚨 关键修复：立即清除 activeTabId，防止 await 期间重复关闭同一个
    // 让 removeTab 自己处理切换到下一个 tab
    workspace.activeTabId.value = '' // 临时设为无选中

    // 发送事件通知 MainTabs 执行关闭动画
    // MainTabs 会处理动画，动画完成后调用 doRemoveTab
    eventBus.emit('tab-close-with-animation', tabId)
  }
  eventBus.on('tab-close', handleTabClose)

  const handleTabReopen = () => {
    const tab = workspace.reopenLastClosedTab()
    if (tab) {
      tabSwitcher.flashIndicator(tab.id)
    }
  }
  eventBus.on('tab-reopen', handleTabReopen)

  const handleTabNew = () => {
    workspace.openNewDocumentTab()
    // 不再调用 flashIndicator：浮层会覆盖新标签页内容并在 600ms 后自动关闭，导致用户无法在新建标签页界面内操作
  }
  eventBus.on('tab-new', handleTabNew)

  const handleTabSwitchIndicator = (tabId: unknown) => {
    if (typeof tabId === 'string') {
      tabSwitcher.flashIndicator(tabId)
    }
  }
  eventBus.on('tab-switch-indicator', handleTabSwitchIndicator)

  // 工作区打开文档
  const workspaceOpenDocumentHandler = (payload: unknown) => {
    handleWorkspaceOpenDocument(payload as OpenDocumentPayload)
  }
  eventBus.on('workspace-open-document', workspaceOpenDocumentHandler)

  // 工作区 grep 点击匹配项：切换到编辑器视图并定位到行，选中匹配文字
  const handleWorkspaceGrepJump = (payload: unknown) => {
    const p = payload as {
      path?: string
      tabId?: string
      line?: number
      column?: number
      matchLength?: number
      matchText?: string
    }
    const path = typeof p?.path === 'string' ? p.path : ''
    const tabId = typeof p?.tabId === 'string' ? p.tabId : ''
    const line = typeof p?.line === 'number' ? p.line : 1
    const column = typeof p?.column === 'number' ? p.column : 1
    const matchLength = typeof p?.matchLength === 'number' ? p.matchLength : 0
    const matchText = typeof p?.matchText === 'string' ? p.matchText : ''
    const endColumn = column + matchLength
    if (!path && !tabId) return
    nextTick(() => {
      const tab = tabId
        ? workspaceTabs.find((t) => t.id === tabId)
        : workspaceTabs.find(
            (t) =>
              t.kind === 'file' && normalizePathForGrep(t.path || '') === normalizePathForGrep(path)
          )
      if (tab && (tab.kind === 'file' || tab.kind === 'new')) {
        activateTab(tab.id)
        updateDocumentLastView(tab.id, 'editor')
        const gotoPayload = { tabId: tab.id, line, column, endColumn, matchText }
        eventBus.emit('editor-goto-position', gotoPayload)
        setTimeout(() => {
          eventBus.emit('editor-goto-position', gotoPayload)
        }, 150)
      } else if (!tabId) {
        pendingGrepGoto.value = { path, line, column, matchLength, matchText }
      }
    })
  }
  eventBus.on('workspace-grep-jump', handleWorkspaceGrepJump)

  // 切换用户资料卡
  const handleToggleUserProfile = () => {
    showUserProfileCard.value = !showUserProfileCard.value
  }
  eventBus.on('toggle-user-profile', handleToggleUserProfile)

  // 保存成功
  const handleSaveSuccess = (payload: unknown) => {
    const maybeTabId =
      payload &&
      typeof payload === 'object' &&
      'tabId' in payload &&
      typeof payload.tabId === 'string'
        ? payload.tabId
        : activeTabId.value
    if (maybeTabId) {
      workspace.updateDocumentDirty(maybeTabId)
    }
    eventBus.emit('is-need-save', false)
  }
  eventBus.on('save-success', handleSaveSuccess)

  // 打开文档成功
  const handleOpenDocSuccess = async (payload: unknown) => {
    // 检查当前活动的 tab 是否是 GlobalHome，如果是则不更新标题
    const currentTab = workspace.tabs.find((t) => t.id === workspace.activeTabId.value)
    if (!currentTab || currentTab.route === '/global-home') {
      // 如果是 GlobalHome，不更新标题，保持主页标题
      logger.debug('[Main] handleOpenDocSuccess - GlobalHome 不更新标题', {
        currentTabRoute: currentTab?.route
      })
    } else {
      // 只在非 GlobalHome 时更新标题
      const title = workspace.activeDocument.value?.meta?.title ?? ''
      eventBus.emit('update-window-title', title)
    }

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
      const isPreview = !!(payload as any).isPreview

      // 临时 tab 或仅打开 PDF 预览时不更新 recent-docs
      if (!isPreview) {
        await updateRecentDocs(filePath)
      }

      if (messageBridge.getIpc()) {
        // 启动文件监听
        messageBridge.send('watch-file', filePath, tabId)
        logger.debug('启动文件监听', { filePath, tabId })
      }
    }

    // lastView 已经在 createSnapshotFromLoadedData 中根据内容正确设置了
    // 这里不需要再修改，保持逻辑清晰

    // 若有工作区 grep 待跳转（刚打开的文件），切换到编辑器并定位
    const payloadPath =
      payload && typeof payload === 'object' && 'path' in payload
        ? (payload as { path?: string }).path
        : undefined
    if (
      pendingGrepGoto.value &&
      payloadPath &&
      normalizePathForGrep(pendingGrepGoto.value.path) === normalizePathForGrep(payloadPath)
    ) {
      const tabId = activeTabId.value
      if (tabId) {
        updateDocumentLastView(tabId, 'editor')
        const { line, column, matchLength = 0, matchText = '' } = pendingGrepGoto.value
        const payload = {
          tabId,
          line,
          column,
          endColumn: column + matchLength,
          matchText
        }
        eventBus.emit('editor-goto-position', payload)
        setTimeout(() => eventBus.emit('editor-goto-position', payload), 150)
      }
      pendingGrepGoto.value = null
    }
  }
  eventBus.on('open-doc-success', handleOpenDocSuccess)

  // PDF tab（临时或正式）在 ViewMenu 切到非 Home 时：先转 PDF→MD，再关预览 tab，新建带转换内容的正式 MD tab
  const handleConvertPdfPreviewTabToMd = async (payload: unknown) => {
    const tabId =
      payload && typeof payload === 'object' && 'tabId' in payload
        ? (payload as { tabId: string }).tabId
        : ''
    if (!tabId) return
    const tab = workspaceTabs.find((t) => t.id === tabId)
    if (!tab || tab.kind !== 'file') return

    // 检查是否是PDF格式的tab（无论是预览模式还是正式打开）
    const path = tab.path || ensureDocument(tabId).path || ''
    const format = tab.format || ensureDocument(tabId).format || ''
    const isPdfTab = path.toLowerCase().endsWith('.pdf') && format.toLowerCase() === 'pdf'

    if (!isPdfTab) return

    const pdfPath = path

    if (!messageBridge.getIpc()?.invoke) {
      eventBus.emit('show-error', t('main.notification.error.title', '操作失败'))
      return
    }

    try {
      // 先执行 PDF→Markdown 转换，再关闭预览 tab，避免依赖 workspace-open-document 的异步与 claim 导致内容未正确应用
      const result = (await messageBridge.invoke('convert-pdf-to-markdown', pdfPath)) as {
        success: boolean
        markdown?: string
        error?: string
      }
      if (!result.success || !result.markdown) {
        throw new Error(result.error || 'PDF转换失败')
      }

      const loaded = await loadDocumentFromMarkdown(result.markdown, undefined)
      const snapshot = createSnapshotFromLoadedData(loaded)
      snapshot.path = ''
      snapshot.dirty = true
      // 设为 editor 视图，与「点击编辑器」一致
      snapshot.lastView = 'editor'

      // 再释放并移除预览 tab，然后新建正式 tab
      if (tab.preview && pdfPath) {
        try {
          await messageBridge.invoke('release-file-claim', pdfPath)
        } catch (err) {
          logger.warn('释放PDF文件占用失败:', err)
        }
      }
      removeTab(tabId)

      const newTab = addDocumentTab(snapshot, {
        kind: 'file',
        dirty: true,
        path: '',
        format: 'md',
        preview: false
      })
      const doc = ensureDocument(newTab.id)
      doc.path = ''
      doc.format = 'md'
      doc.lastView = 'editor'
      const pdfFileName = extractFileName(pdfPath)
      if (pdfFileName) {
        doc.meta.title = pdfFileName.replace(/\.pdf$/i, '')
      }

      refreshActiveTabMetadata()
      activateTab(newTab.id)
      eventBus.emit('open-doc-success', {
        tabId: newTab.id,
        path: '',
        fileName: doc.meta?.title?.trim() || pdfFileName || t('workspace.untitledDocument')
      })
      eventBus.emit('is-need-save', true)
      if (pdfPath) {
        await messageBridge.invoke('release-file-claim', pdfPath)
      }
    } catch (error) {
      logger.error('PDF 预览转编辑器失败:', error)
      const message = error instanceof Error ? error.message : String(error)
      eventBus.emit('show-error', `PDF转换失败: ${message}`)
      if (tab.preview && pdfPath && messageBridge.getIpc()?.invoke) {
        try {
          await messageBridge.invoke('release-file-claim', pdfPath)
        } catch (_) {
          // ignore
        }
      }
    }
  }
  eventBus.on('convert-pdf-preview-tab-to-md', handleConvertPdfPreviewTabToMd)

  // 新建文档请求 - 在 Main.vue 中监听，因为 Main.vue 总是被挂载
  // 而 Editor.vue 只在 /editor 路由下才挂载，在其他页面（如 Home）时无法响应事件
  // Ctrl+N：创建新窗口（与 Ctrl+T 新建标签页区分开）
  const handleNewDocumentRequest = async () => {
    try {
      await messageBridge.invoke('create-new-window', {})
    } catch (error) {
      logger.error('创建新窗口失败:', error)
      // 如果创建新窗口失败，回退到在当前窗口新建标签页
      workspace.openNewDocumentTab()
    }
  }
  eventBus.on('new-doc', handleNewDocumentRequest)

  // 处理关闭当前活跃 Tab 的请求 - 使用系统对话框
  const handleCloseActiveTabRequest = async () => {
    if (workspace.uiLocked?.value === true) return
    const tabId = activeTabId.value
    if (!tabId) return

    if (!messageBridge.getIpc()) {
      // 如果没有 IPC，回退到原来的逻辑
      const doc = ensureDocument(tabId)
      if (doc?.dirty) {
        try {
          await messageBox.confirm(
            t('main.dialogs.closeTabMessage'),
            t('main.dialogs.closeTabTitle'),
            {
              type: 'warning',
              confirmButtonText: t('main.dialogs.closeTabConfirm'),
              cancelButtonText: t('main.dialogs.closeTabCancel')
            }
          )
        } catch {
          return // 用户取消，不关闭
        }
      }
      removeTab(tabId)
      return
    }

    // 使用系统对话框
    try {
      // 发送请求到主进程
      messageBridge.send('request-close-tab', tabId)

      // 等待响应
      const result = await new Promise<{ tabId: string; action: 'save' | 'discard' | 'cancel' }>(
        (resolve) => {
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
          // 设置超时，避免无限等待
          setTimeout(() => {
            messageBridge.removeListener('close-tab-response', handler)
            resolve({ tabId, action: 'cancel' })
          }, 10000)
        }
      )

      if (result.action === 'save') {
        // 用户选择保存
        const { saveDocument } = workspace
        const saveResult = await saveDocument(tabId, { saveAs: false })
        if (saveResult) {
          removeTab(tabId)
        }
      } else if (result.action === 'discard') {
        // 用户选择放弃，直接关闭tab
        removeTab(tabId)
      }
      // 如果action是'cancel'，不做任何操作
    } catch (error) {
      logger.error('关闭tab失败:', error)
    }
  }
  eventBus.on('close-active-tab', handleCloseActiveTabRequest)

  // 处理文件冲突
  const handleFileConflictDetected = (payload: unknown) => {
    const conflictPayload = payload as {
      tabId: string
      filePath: string
      externalContent: string
      currentContent: string
      savedContent: string
      format: 'md' | 'tex' | 'txt' | string
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

    const { tabId, filePath, externalContent, currentContent, savedContent, format, mergeResult } =
      conflictPayload

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
  }
  eventBus.on('file-conflict-detected', handleFileConflictDetected)

  // 显示错误通知
  const handleShowError = (message: unknown) => {
    notifyError(message as string, { title: t('main.notification.error.title') })
  }
  eventBus.on('show-error', handleShowError)

  // 显示警告通知
  const handleShowWarning = (message: unknown) => {
    notifyWarning(message as string, { title: t('main.notification.warning.title') })
  }
  eventBus.on('show-warning', handleShowWarning)

  // 处理AI Chat插入到当前文档
  const handleAiChatInsertToDocument = async (payload: unknown) => {
    const data = payload as { content: string; tabId?: string }
    if (!data || !data.content) return

    // 确定目标文档tabId
    let targetTabId: string | null = null

    if (data.tabId) {
      // 如果指定了tabId，验证它是否是文档tab
      const specifiedTab = workspaceTabs.find((t) => t.id === data.tabId)
      if (specifiedTab && (specifiedTab.kind === 'file' || specifiedTab.kind === 'new')) {
        targetTabId = data.tabId
      }
    }

    // 如果没有指定或指定的不是文档tab，查找当前活动的文档tab
    if (!targetTabId) {
      const activeTab = workspaceTabs.find((t) => t.id === activeTabId.value)
      if (activeTab && (activeTab.kind === 'file' || activeTab.kind === 'new')) {
        targetTabId = activeTab.id
      }
    }

    // 如果还是没有，查找第一个文档tab（优先选择非新文档）
    if (!targetTabId) {
      const documentTabs = workspaceTabs.filter((t) => t.kind === 'file' || t.kind === 'new')
      if (documentTabs.length > 0) {
        // 优先选择已保存的文档（kind === 'file'），否则选择第一个
        const savedDoc = documentTabs.find((t) => t.kind === 'file')
        targetTabId = savedDoc ? savedDoc.id : documentTabs[0].id
      }
    }

    // 如果仍然没有，创建新文档
    if (!targetTabId) {
      const newTab = workspace.openNewDocumentTab()
      workspace.initializeDocumentFromTemplate(newTab.id, 'md', 'blank')
      workspace.updateDocumentMarkdown(newTab.id, data.content)
      notifySuccess(t('aiChat.insertSuccess', '内容已插入到文档'), {
        title: t('main.notification.success.title')
      })
      return
    }

    const doc = workspace.ensureDocument(targetTabId)
    const tab = workspaceTabs.find((t) => t.id === targetTabId)

    // 如果文档格式未确定，自动设置为md
    if (!doc.format || (tab && tab.kind === 'new' && !tab.format)) {
      doc.format = 'md'
      if (tab) {
        tab.format = 'md'
      }
      // 如果是新文档且未初始化，先初始化
      if (tab && tab.kind === 'new') {
        workspace.initializeDocumentFromTemplate(targetTabId, 'md', 'blank')
      }
    }

    try {
      if (doc.format === 'txt') {
        // 纯文本格式，直接追加
        const currentContent = doc.markdown || ''
        const newContent = currentContent + (currentContent ? '\n\n' : '') + data.content
        workspace.updateDocumentMarkdown(targetTabId, newContent)
      } else if (doc.format === 'md') {
        // Markdown格式，直接追加
        const currentContent = doc.markdown || ''
        const newContent = currentContent + (currentContent ? '\n\n' : '') + data.content
        workspace.updateDocumentMarkdown(targetTabId, newContent)
        // 不显示通知，避免多选时显示多个通知
        // ElNotification({
        //   title: t('main.notification.success.title'),
        //   message: t('aiChat.insertSuccess', '内容已插入到文档'),
        //   type: 'success',
        // })
      } else if (doc.format === 'tex') {
        // LaTeX格式，询问用户选择
        try {
          await messageBox.confirm(
            t('aiChat.insertToLatexMessage', '请选择插入方式：'),
            t('aiChat.insertToLatexTitle', '插入到LaTeX文档'),
            {
              confirmButtonText: t('aiChat.insertAsLatex', '转换为LaTeX插入'),
              cancelButtonText: t('aiChat.insertAsMarkdown', '插入Markdown原文'),
              type: 'info'
            }
          )
          // 用户选择转换为LaTeX
          const latexBody = await convertMarkdownBodyToLatex(data.content)
          const currentTex = doc.tex || ''

          // 找到 \end{document} 的位置，在其之前插入
          const endDocIndex = currentTex.lastIndexOf('\\end{document}')
          if (endDocIndex !== -1) {
            const beforeEnd = currentTex.slice(0, endDocIndex).trim()
            const afterEnd = currentTex.slice(endDocIndex)
            const newTex = beforeEnd + (beforeEnd ? '\n\n' : '') + latexBody + '\n' + afterEnd
            workspace.updateDocumentTex(targetTabId, newTex)
          } else {
            // 如果没有 \end{document}，直接追加
            const newTex = currentTex + (currentTex ? '\n\n' : '') + latexBody
            workspace.updateDocumentTex(targetTabId, newTex)
          }

          // 不显示通知，避免多选时显示多个通知
          // ElNotification({
          //   title: t('main.notification.success.title'),
          //   message: t('aiChat.insertSuccess', '内容已插入到文档'),
          //   type: 'success',
          // })
        } catch (error) {
          // 用户选择插入Markdown原文或取消
          if (error === 'cancel') {
            // 插入Markdown原文
            const currentTex = doc.tex || ''
            const endDocIndex = currentTex.lastIndexOf('\\end{document}')
            if (endDocIndex !== -1) {
              const beforeEnd = currentTex.slice(0, endDocIndex).trim()
              const afterEnd = currentTex.slice(endDocIndex)
              const markdownBlock =
                '% Markdown原文:\n% ' + data.content.replace(/\n/g, '\n% ') + '\n'
              const newTex = beforeEnd + (beforeEnd ? '\n\n' : '') + markdownBlock + afterEnd
              workspace.updateDocumentTex(targetTabId, newTex)
            } else {
              const markdownBlock =
                '% Markdown原文:\n% ' + data.content.replace(/\n/g, '\n% ') + '\n'
              const newTex = currentTex + (currentTex ? '\n\n' : '') + markdownBlock
              workspace.updateDocumentTex(targetTabId, newTex)
            }

            notifySuccess(t('aiChat.insertSuccess', '内容已插入到文档'), {
              title: t('main.notification.success.title')
            })
          }
        }
      }
    } catch (error) {
      logger.error('插入内容到文档失败:', error)
      notifyError(error instanceof Error ? error.message : String(error), {
        title: t('main.notification.error.title')
      })
    }
  }
  eventBus.on('ai-chat-insert-to-document', handleAiChatInsertToDocument)

  // 处理AI Chat导出到新文档
  const handleAiChatExportToDocument = async (payload: unknown) => {
    const data = payload as { content: string }
    if (!data || !data.content) return

    try {
      // 创建新的markdown文档tab
      const newTab = workspace.openNewDocumentTab()
      // 初始化文档为markdown格式，使用空白模板
      workspace.initializeDocumentFromTemplate(newTab.id, 'md', 'blank')
      // 设置内容
      workspace.updateDocumentMarkdown(newTab.id, data.content)

      notifySuccess(t('aiChat.exportSuccess', '已导出到新文档'), {
        title: t('main.notification.success.title')
      })
    } catch (error) {
      logger.error('导出到新文档失败:', error)
      notifyError(error instanceof Error ? error.message : String(error), {
        title: t('main.notification.error.title')
      })
    }
  }
  eventBus.on('ai-chat-export-to-document', handleAiChatExportToDocument)

  // 处理工具窗口打开请求（改为在主窗口Tab中打开）
  const handleOpenToolTab = (payload: unknown) => {
    const data = payload as {
      toolType:
        | 'ocr'
        | 'graph'
        | 'attachment'
        | 'dataAnalysis'
        | 'formulaRecognition'
        | 'aiChat'
        | 'setting'
    }
    if (!data || !data.toolType) return

    workspace.openToolTab(data.toolType)
  }
  eventBus.on('open-tool-tab', handleOpenToolTab)

  // 监听ViewMenu折叠状态变化
  const handleViewMenuCollapseChanged = (payload: unknown) => {
    viewMenuCollapsed.value = payload as boolean
  }
  eventBus.on('view-menu-collapse-changed', handleViewMenuCollapseChanged)

  // 处理ViewMenu的折叠状态请求
  const handleViewMenuCollapseRequest = () => {
    eventBus.emit('view-menu-collapse-sync', viewMenuCollapsed.value)
  }
  eventBus.on('view-menu-collapse-request', handleViewMenuCollapseRequest)

  // 处理系统窗口打开请求（主页、知识库、调试工具等）
  const handleOpenSystemTab = (payload: unknown) => {
    const data = payload as { route: string; title: string }
    if (!data || !data.route || !data.title) return

    workspace.openSystemTab(data.route, data.title)
  }
  eventBus.on('open-system-tab', handleOpenSystemTab)

  // 监听broadcast消息（用于接收主进程发送的工具Tab打开请求）
  const handleReceiveBroadcast = (message: any) => {
    if (message && typeof message === 'object') {
      if (message.eventName === 'open-tool-tab' && message.data) {
        handleOpenToolTab(message.data)
      } else if (message.eventName === 'open-system-tab' && message.data) {
        handleOpenSystemTab(message.data)
      }
    }
  }
  eventBus.on('receive-broadcast', handleReceiveBroadcast)

  // 注册清理函数
  cleanupMainListeners.push(
    () => eventBus.off('refresh', handleRefresh),
    () => eventBus.off('tab-next', handleTabNext),
    () => eventBus.off('tab-prev', handleTabPrev),
    () => eventBus.off('tab-close', handleTabClose),
    () => eventBus.off('tab-reopen', handleTabReopen),
    () => eventBus.off('tab-new', handleTabNew),
    () => eventBus.off('tab-switch-indicator', handleTabSwitchIndicator),
    () => eventBus.off('workspace-open-document', workspaceOpenDocumentHandler),
    () => eventBus.off('workspace-grep-jump', handleWorkspaceGrepJump),
    () => eventBus.off('convert-pdf-preview-tab-to-md', handleConvertPdfPreviewTabToMd),
    () => eventBus.off('toggle-user-profile', handleToggleUserProfile),
    () => eventBus.off('save-success', handleSaveSuccess),
    () => eventBus.off('open-doc-success', handleOpenDocSuccess),
    () => eventBus.off('new-doc', handleNewDocumentRequest),
    () => eventBus.off('close-active-tab', handleCloseActiveTabRequest),
    () => eventBus.off('file-conflict-detected', handleFileConflictDetected),
    () => eventBus.off('show-error', handleShowError),
    () => eventBus.off('show-warning', handleShowWarning),
    () => eventBus.off('ai-chat-insert-to-document', handleAiChatInsertToDocument),
    () => eventBus.off('ai-chat-export-to-document', handleAiChatExportToDocument),
    () => eventBus.off('open-tool-tab', handleOpenToolTab),
    () => eventBus.off('open-system-tab', handleOpenSystemTab),
    () => eventBus.off('receive-broadcast', handleReceiveBroadcast),
    () => eventBus.off('view-menu-collapse-changed', handleViewMenuCollapseChanged),
    () => eventBus.off('view-menu-collapse-request', handleViewMenuCollapseRequest)
  )
}

// ============================================================================
// 生命周期和监听器
// ============================================================================
// 当显示子视图菜单时，同步折叠状态到ViewMenu组件
watch(showSubViewMenu, (show) => {
  if (show) {
    setTimeout(() => {
      eventBus.emit('view-menu-collapse-sync', viewMenuCollapsed.value)
    }, 0)
  }
})

// 切换 Tab 前捕获当前页面缩略图，使切换器预览面板有内容可显示
watch(activeTabId, (_, oldId) => {
  if (oldId) {
    tabSwitcher.captureCurrentThumbnail(oldId)
  }
})

onMounted(async () => {
  initMainEventListeners()
  eventBus.emit('llm-api-updated')
  const token = localStorage.getItem('loginToken')
  if (token) {
    localStorage.setItem('loginToken', token)
    await verifyToken(token)
  }
  // 注意：自动打开主页的逻辑已移至 App.vue 的 autoOpenDoc 函数中处理
  // 这样可以确保在启动流程的早期阶段就处理，避免时序问题
  await autoSave()
})

// ============================================================================
// 文件冲突处理
// ============================================================================
const handleFileConflictUseExternal = () => {
  if (!fileConflictData.value) return

  const { tabId, filePath, externalContent, format } = fileConflictData.value
  const doc = ensureDocument(tabId)

  if (doc) {
    // 纯文本格式（txt, json等）和 markdown 格式都使用 markdown 字段存储
    // 只有 LaTeX 格式使用 tex 字段
    if (format === 'tex') {
      updateDocumentTex(tabId, externalContent)
    } else {
      // md, txt, json 等格式都使用 markdown 字段
      updateDocumentMarkdown(tabId, externalContent)
    }
    markDocumentSaved(tabId, filePath)
    eventBus.emit(
      'show-info',
      t('main.notification.fileSynced', { defaultValue: '已同步外部文件更改' })
    )
  }

  fileConflictDialogVisible.value = false
  fileConflictData.value = null
}

const handleFileConflictKeepCurrent = () => {
  if (!fileConflictData.value) return

  eventBus.emit(
    'show-info',
    t('main.notification.keptCurrentVersion', { defaultValue: '已保留当前版本' })
  )
  fileConflictDialogVisible.value = false
  fileConflictData.value = null
}

const handleFileConflictMerge = (mergedContent: string) => {
  if (!fileConflictData.value) return

  const { tabId, filePath, format } = fileConflictData.value
  const doc = ensureDocument(tabId)

  if (doc) {
    // 应用合并后的内容
    // 纯文本格式（txt, json等）和 markdown 格式都使用 markdown 字段存储
    if (format === 'tex') {
      updateDocumentTex(tabId, mergedContent)
    } else {
      // md, txt, json 等格式都使用 markdown 字段
      updateDocumentMarkdown(tabId, mergedContent)
    }
    // 注意：不调用 markDocumentSaved，因为合并后的内容可能仍然与外部文件不同
    eventBus.emit(
      'show-info',
      t('main.notification.mergedConflicts', { defaultValue: '冲突已合并' })
    )
  }

  fileConflictDialogVisible.value = false
  fileConflictData.value = null
}

const getConflictFileName = () => {
  if (!fileConflictData.value) return ''
  return extractFileName(fileConflictData.value.filePath)
}

onBeforeUnmount(() => {
  // 清理所有 Main 组件的事件监听器
  cleanupMainListeners.forEach((cleanup) => cleanup())
  cleanupMainListeners.length = 0
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

/* 顶部容器：Logo + MainTabs */
.top-header-container {
  display: flex;
  height: 40px;
  background-color: var(--el-bg-color, #ffffff);
  border: none;
  /* border-bottom: 1px solid var(--el-border-color-lighter, #f0f0f0); */
  z-index: 100;
}

/* 占位：保持布局高度 */
.top-header-placeholder {
  flex-shrink: 0;
}

/* 浮动置顶：Teleport 到 body，无条件始终在最顶层，高于 Dialog(10000) 和 GlobalMessageBox(100002) */
.top-header-floating {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  z-index: 100003 !important;
  flex-shrink: 0;
}

/* macOS 平台：调整布局顺序 */
.top-header-container.is-mac {
  flex-direction: row;
}

/* 顶部Header - MainTabs */
.top-header {
  flex: 1;
  min-width: 0; /* 确保 flex item 可以收缩，防止 tab 区域溢出时顶掉 window controls */
  height: 40px;
  padding: 0;
  margin: 0;
  line-height: 40px;
  background-color: var(--el-bg-color, #ffffff);
  border-bottom: none;
  z-index: 100;
}

.sub-view-menu-aside {
  width: 120px;
  min-width: 120px;
  background-color: var(--el-bg-color, #ffffff);
  border-right: 1px solid var(--el-border-color-lighter, #f0f0f0);
  overflow: hidden;
  transition:
    width 0.3s ease,
    min-width 0.3s ease;
}

.sub-view-menu-aside.is-collapsed {
  width: 64px;
  min-width: 64px;
}

.main-shell {
  flex: 1;
  display: flex;
  flex-direction: row; /* 确保水平排列 */
  height: calc(100vh - 40px - 30px); /* 减去顶部Logo和底部BottomMenu的高度 */
  overflow: hidden;
  background-color: var(--el-bg-color, #ffffff);
}

.content-area-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background-color: var(--el-bg-color-page, #f5f7fa);
}

.content-area {
  flex: 1;
  display: flex;
  height: 100%;
  overflow: hidden;
}

.side-menu {
  width: fit-content;
  min-width: 64px;
  width: 64px;
  /* background-color: var(--el-bg-color, #ffffff); */
  /* border-right: 1px solid var(--el-border-color-lighter, #f0f0f0); */
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

/* BottomMenu放在最下侧 */
.bottom-footer {
  height: 30px;
  padding: 0;
  flex: 0 0 30px;
  display: flex;
  align-items: stretch;
  background-color: var(--el-bg-color, #ffffff);
  border-top: 1px solid var(--el-border-color-lighter, #f0f0f0);
  z-index: 10;
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
