import { reactive, ref, computed } from 'vue'
import type { ComputedRef } from 'vue'
import type {
  ArticleMetaData,
  DocumentOutlineNode,
  AIDialog,
  AIDialogMessage
} from '../../../types'
import type { AgentSession } from '../types/agent'
import eventBus from '../utils/event-bus'
import { createRendererLogger } from '../utils/logger'
import { i18n } from '../i18n'
import { extractOutlineTreeFromMarkdown } from '../utils/md-utils.js'
import { convertLatexToMarkdown } from '../utils/latex-utils.js'
import { getSupportedFormats } from '../constants/supported-formats'
import type { DocumentTemplate, SupportedFormat } from '../types/formats'
import { getSupportedFormatsFromTemplates } from '../templates/template-registry'
import type { TranslateFn } from '../templates/template-registry'
import { getUserTemplatesForLocaleFormat } from './user-templates'
import { formatRegistry } from '../utils/format-registry'
import { saveWorkspaceDocument } from '../services/document-save'
import {
  DEFAULT_ARTICLE_META,
  DEFAULT_AI_DIALOGS,
  DEFAULT_OUTLINE_TREE,
  DEFAULT_AGENT_SESSIONS
} from '../constants/document'
import { isElectronEnv } from '../utils/event-bus'
import { extractTitleFromContent, sanitizeTitleForFilename } from '../utils/title-extractor'
import {
  createEmptyGroup,
  collapseLayoutToSingleGroup,
  collectTabIdsInLayout,
  findGroupContainingTab,
  reconcileDocumentLayout,
  setGroupActiveTab,
  splitTabOutFromTarget,
  moveTabBetweenGroups,
  insertTabIntoGroupFromOutside,
  reorderTabInGroup,
  type LayoutNode,
  type LayoutTabGroup,
  type SplitEdge
} from './workspace-layout'
import { getEditorChromeLayoutSync, setEditorChromeLayoutValue } from './editor-chrome-layout-state'
import { setSetting } from '../utils/settings.js'

export type WorkspaceTabKind = 'new' | 'file' | 'tool' | 'system'
// WorkspaceTabFormat 现在支持动态格式，但为了向后兼容，保留 'md' | 'tex' 作为基础类型
// 实际使用时应从 formatRegistry 获取所有支持的格式
export type WorkspaceTabFormat = 'md' | 'tex' | 'txt' | string

export type ToolTabType =
  | 'ocr'
  | 'graph'
  | 'attachment'
  | 'dataAnalysis'
  | 'formulaRecognition'
  | 'aiChat'
  | 'setting'
  | 'aigcDetection'
  | 'agentReview'

export interface WorkspaceTab {
  id: string
  kind: WorkspaceTabKind
  title: string
  subtitle: string
  path: string
  format: WorkspaceTabFormat
  dirty: boolean
  readonly?: boolean
  /** 预览模式（单击打开）：不显示在「已打开文件」，同窗口仅一个预览 tab；双击、切换视图、或产生脏标记（需保存）后变为正式 tab */
  preview?: boolean
  toolType?: ToolTabType // 工具Tab类型
  route?: string // 路由路径（用于工具Tab）
  /** 由 ensureInitialTab 创建的占位 Tab，拖入新 Tab 后可自动移除 */
  _isInitialPlaceholder?: boolean
  /** 固定标签页，始终靠左排列且不可关闭 */
  pinned?: boolean
  /** 标记为新创建的标签页，用于入场动画 */
  _isNewTab?: boolean
  /** 标记为正在关闭的标签页，用于退场动画 */
  _isClosing?: boolean
  /**
   * 工作区模式：顶栏大 Tab（top）不参与分屏树；拖入分屏/合并后为 workbench。
   * 未设置时视为 workbench，与升级前「全部进布局树」行为一致。
   */
  workspacePlacement?: 'top' | 'workbench'
}

export type DocumentView = 'home' | 'outline' | 'editor' | 'visualize' | 'agent' | 'proofread'

/** 工具 Tab 迁移时需保留的 UI 状态（如当前选中的会话/对话索引） */
export interface TabToolState {
  activeSessionId?: string
  activeDialogIndex?: number
}

export interface WorkspaceDocument {
  id: string
  tabId: string
  path: string
  format: WorkspaceTabFormat
  markdown: string
  tex: string
  outline: DocumentOutlineNode
  meta: ArticleMetaData
  aiDialogs: AIDialog[]
  agentSessions: AgentSession[]
  lastView: DocumentView
  /** 文档 Agent 视图中当前选中的会话 ID，用于窗口迁移时恢复 */
  activeAgentSessionId?: string
  renderedHtml: string
  dirty: boolean
  savedMarkdown: string
  savedTex: string
  savedOutline: DocumentOutlineNode
  savedMeta: ArticleMetaData
  savedAiDialogs: AIDialog[]
  savedAgentSessions: AgentSession[]
}

const UNTITLED_TITLE = '未命名文档'

export const tabs = reactive<WorkspaceTab[]>([])
export const activeTabId = ref<string>('')

/** 工作区分屏布局根（与 tabs 对齐；工作区模式下可含文档/工具/系统页等） */
export const workspaceLayoutRoot = ref<LayoutNode>(createEmptyGroup())

function isTabEligibleForWorkspaceLayoutTree(tab: WorkspaceTab): boolean {
  if (tab._isInitialPlaceholder) return false
  // /dummy 可作为分屏空窗格占位（PaneTabBody → DummyView）；仍不可作为 Tab 拖拽源（见 useTabDrag）
  return true
}

/**
 * 参与 workspaceLayoutRoot 的 Tab（供经典单组 / 工作区分屏 reconcile）。
 * 经典模式：file/new 默认 workspacePlacement=top，但必须仍进入折叠单组，否则 TabContentRenderer
 * 走 WorkspaceSplitRoot 时 layout 为空，Editor / Home 等路由内容整块不显示。
 * 工作区模式：placement=top 仅顶栏，不进分屏树。
 */
function tabParticipatesInDocumentLayoutTree(tab: WorkspaceTab): boolean {
  if (!isTabEligibleForWorkspaceLayoutTree(tab)) return false
  if (getEditorChromeLayoutSync() === 'classic') return true
  if (tab.workspacePlacement === 'top') return false
  return true
}

/** 任意分屏路径前调用：经典模式下第二次 refresh 会把 split 压平，必须先进入 workspace */
export function promoteClassicToWorkspaceLayoutIfNeeded(): void {
  if (getEditorChromeLayoutSync() !== 'classic') return
  setEditorChromeLayoutValue('workspace')
  void setSetting('editorChromeLayout', 'workspace')
}

function refreshDocumentLayout(): void {
  const layoutTabs = tabs
    .map((t, orderIndex) => ({ tab: t, orderIndex }))
    .filter(({ tab }) => tabParticipatesInDocumentLayoutTree(tab))
    .map(({ tab, orderIndex }) => ({ id: tab.id, orderIndex }))

  if (getEditorChromeLayoutSync() === 'classic') {
    if (layoutTabs.length === 0) {
      workspaceLayoutRoot.value = createEmptyGroup()
    } else {
      workspaceLayoutRoot.value = collapseLayoutToSingleGroup(layoutTabs, activeTabId.value)
    }
    return
  }

  workspaceLayoutRoot.value = reconcileDocumentLayout(
    workspaceLayoutRoot.value,
    layoutTabs,
    activeTabId.value
  )
  maybeExitWorkspaceWhenAtMostOneWorkbenchTab()
}

/** 工作区内布局树里至多剩 1 个 Tab 时退回经典顶栏（拖出、关闭等导致） */
function maybeExitWorkspaceWhenAtMostOneWorkbenchTab(): void {
  if (getEditorChromeLayoutSync() !== 'workspace') return
  const ids = collectTabIdsInLayout(workspaceLayoutRoot.value)
  if (ids.size > 1) return
  for (const id of ids) {
    const tab = tabs.find((x) => x.id === id)
    if (tab) tab.workspacePlacement = 'top'
  }
  setEditorChromeLayoutValue('classic')
  void setSetting('editorChromeLayout', 'classic')
  refreshDocumentLayout()
}

function markTabsAsWorkbench(...tabIds: string[]): void {
  for (const id of tabIds) {
    const t = tabs.find((x) => x.id === id)
    if (t && isTabEligibleForWorkspaceLayoutTree(t)) {
      t.workspacePlacement = 'workbench'
    }
  }
}

/** 从工作台分屏树提升到顶栏独立 Tab（仅改 placement，由 reconcile 移出布局树） */
function promoteTabFromLayoutToTop(tabId: string): boolean {
  const t = tabs.find((x) => x.id === tabId)
  if (!t || !isTabEligibleForWorkspaceLayoutTree(t)) return false
  t.workspacePlacement = 'top'
  refreshDocumentLayout()
  return true
}

function applyWorkspaceSplitFromDrag(
  draggedTabId: string,
  targetTabId: string,
  edge: SplitEdge
): boolean {
  promoteClassicToWorkspaceLayoutIfNeeded()
  markTabsAsWorkbench(draggedTabId, targetTabId)
  refreshDocumentLayout()

  const next = splitTabOutFromTarget(workspaceLayoutRoot.value, draggedTabId, targetTabId, edge)
  if (!next) return false
  workspaceLayoutRoot.value = next
  refreshDocumentLayout()
  eventBus.emit('view-menu-collapse-changed', true)
  return true
}

/** 自分屏邻格：文档 / 系统 / 工具均可（排除 /dummy），与分屏树资格一致 */
function isNeighborTabCandidateForSelfSplit(tab: WorkspaceTab, primaryTabId: string): boolean {
  if (tab.id === primaryTabId) return false
  if (!isTabEligibleForWorkspaceLayoutTree(tab)) return false
  if (tab.kind === 'system' && tab.route === '/dummy') return false
  return true
}

/** 同组内优先其他 Tab；否则顶栏顺序相邻；再否则任意合格 Tab；无则创建 /dummy */
function pickNeighborDocumentTabForSelfSplit(primaryTabId: string): string | null {
  const g = findGroupContainingTab(workspaceLayoutRoot.value, primaryTabId)
  if (g) {
    const other = g.tabIds.find((id) => id !== primaryTabId)
    if (other) return other
  }
  const idx = tabs.findIndex((t) => t.id === primaryTabId)
  for (const i of [idx - 1, idx + 1]) {
    if (i < 0 || i >= tabs.length) continue
    const t = tabs[i]
    if (isNeighborTabCandidateForSelfSplit(t, primaryTabId)) return t.id
  }
  for (const t of tabs) {
    if (isNeighborTabCandidateForSelfSplit(t, primaryTabId)) return t.id
  }
  return null
}

/** 为分屏占位创建或复用空白 Tab，不切换当前激活项 */
function ensureDummyTabForWorkbenchSplitPane(): string {
  const existing = tabs.find((t) => t.kind === 'system' && t.route === '/dummy')
  if (existing) {
    existing.workspacePlacement = 'workbench'
    return existing.id
  }
  const id = generateTabId()
  const tab = reactive<WorkspaceTab>({
    id,
    kind: 'system',
    title: '空白',
    subtitle: '',
    path: '',
    format: 'md',
    dirty: false,
    readonly: true,
    route: '/dummy',
    workspacePlacement: 'workbench'
  })
  tabs.push(tab)
  return id
}

/**
 * 将当前文档拖到自身视图内分屏：一侧保留该 Tab，另一侧填「同组/相邻」文档或 DummyView
 */
function applySelfDocumentSplitFromDrag(primaryTabId: string, edge: SplitEdge): boolean {
  const primary = tabs.find((t) => t.id === primaryTabId)
  if (!primary || (primary.kind !== 'file' && primary.kind !== 'new')) return false

  promoteClassicToWorkspaceLayoutIfNeeded()
  markTabsAsWorkbench(primaryTabId)
  refreshDocumentLayout()

  let fillId = pickNeighborDocumentTabForSelfSplit(primaryTabId)
  if (fillId) {
    markTabsAsWorkbench(fillId)
  } else {
    fillId = ensureDummyTabForWorkbenchSplitPane()
  }
  refreshDocumentLayout()

  if (!fillId || fillId === primaryTabId) return false

  const next = splitTabOutFromTarget(workspaceLayoutRoot.value, primaryTabId, fillId, edge)
  if (!next) return false
  workspaceLayoutRoot.value = next
  refreshDocumentLayout()
  activateTab(primaryTabId)
  eventBus.emit('view-menu-collapse-changed', true)
  return true
}

function applyMoveTabToLayoutGroup(
  tabId: string,
  targetGroupId: string,
  insertBeforeTabId: string | null
): boolean {
  const ok = moveTabBetweenGroups(
    workspaceLayoutRoot.value,
    tabId,
    targetGroupId,
    insertBeforeTabId
  )
  if (ok) {
    markTabsAsWorkbench(tabId)
    refreshDocumentLayout()
  }
  return ok
}

/** 关闭顶栏「工作台」时：成员全部回到顶栏独立 Tab，并压平布局 */
function dissolveWorkbenchLayout(): void {
  const ids = collectTabIdsInLayout(workspaceLayoutRoot.value)
  for (const id of ids) {
    const t = tabs.find((x) => x.id === id)
    if (t) t.workspacePlacement = 'top'
  }
  refreshDocumentLayout()
}

function applyReorderTabInLayoutGroup(tabId: string, beforeTabId: string | null): boolean {
  const ok = reorderTabInGroup(workspaceLayoutRoot.value, tabId, beforeTabId)
  if (ok) refreshDocumentLayout()
  return ok
}

function computeInsertBeforeTabIdForPaneBar(
  g: LayoutTabGroup,
  toId: string,
  mode: 'before' | 'after'
): string | null {
  const idx = g.tabIds.indexOf(toId)
  if (idx < 0) return null
  if (mode === 'before') return toId
  return g.tabIds[idx + 1] ?? null
}

/** 拖到子 panel 的 tab 条上（before/after）：并入该组，允许多 Tab 叠在同一格 */
function applyWorkspacePaneTabBarDrop(
  fromId: string,
  toId: string,
  mode: 'before' | 'after'
): boolean {
  const root = workspaceLayoutRoot.value
  const targetGroup = findGroupContainingTab(root, toId)
  if (!targetGroup) return false

  const fromGroup = findGroupContainingTab(root, fromId)
  const beforeId = computeInsertBeforeTabIdForPaneBar(targetGroup, toId, mode)

  if (fromGroup === targetGroup) {
    return applyReorderTabInLayoutGroup(fromId, beforeId)
  }

  if (fromGroup) {
    markTabsAsWorkbench(fromId)
    const ok = moveTabBetweenGroups(root, fromId, targetGroup.id, beforeId)
    if (ok) refreshDocumentLayout()
    return ok
  }

  markTabsAsWorkbench(fromId)
  const ok = insertTabIntoGroupFromOutside(root, fromId, targetGroup.id, beforeId)
  if (ok) refreshDocumentLayout()
  return ok
}

// 最近关闭的标签页栈（用于 Ctrl+Shift+T 恢复）
const MAX_RECENTLY_CLOSED = 20
const recentlyClosedTabs = ref<
  Array<{
    tab: WorkspaceTab
    document?: any // 关闭时的文档数据快照
    closedAt: number
  }>
>([])

// 正在删除中的标签页ID集合（防止快速双击Ctrl+W导致的竞态条件）
const removingTabIds = new Set<string>()

const documents = reactive<Record<string, WorkspaceDocument>>({})

// 当前语言的文档模板列表（由模板目录按语言加载），用于新建文档与初始化
const supportedFormatsRef = ref<SupportedFormat[]>(getSupportedFormats())

function findFormatById(id: string): SupportedFormat | undefined {
  return supportedFormatsRef.value.find((format) => format.id === id)
}

function findFormatTemplate(formatId: string, templateId?: string): DocumentTemplate | undefined {
  const format = findFormatById(formatId)
  if (!format) return undefined
  if (!templateId) {
    return (
      format.templates.find((tpl) => tpl.id === format.defaultTemplateId) ?? format.templates[0]
    )
  }
  return format.templates.find((tpl) => tpl.id === templateId)
}

/** 工具 Tab 的 UI 状态（当前选中的会话/对话索引），用于窗口迁移时恢复 */
const tabToolState = reactive<Record<string, TabToolState>>({})

// 懒加载logger，避免初始化顺序问题和循环依赖
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('Workspace')
  }
  return loggerInstance
}

let suppressDirtyBroadcast = false

function withDirtyBroadcastSuppressed<T>(fn: () => T): T {
  const prev = suppressDirtyBroadcast
  suppressDirtyBroadcast = true
  try {
    return fn()
  } finally {
    suppressDirtyBroadcast = prev
  }
}

// ===== 抑制自动大纲同步标志：用于在从大纲生成文本时，避免反向同步导致死循环 =====
let suppressAutoOutlineSync = false

/**
 * 在抑制自动大纲同步的情况下执行函数
 * 用于在从大纲生成文本时，避免触发自动大纲提取导致的死循环
 */
function withAutoOutlineSyncSuppressed<T>(fn: () => T | Promise<T>): T | Promise<T> {
  const prev = suppressAutoOutlineSync
  suppressAutoOutlineSync = true
  try {
    const result = fn()
    if (result instanceof Promise) {
      return result.finally(() => {
        suppressAutoOutlineSync = prev
      }) as Promise<T>
    }
    suppressAutoOutlineSync = prev
    return result
  } catch (error) {
    suppressAutoOutlineSync = prev
    throw error
  }
}

// ===== 全局UI锁：用于在执行关键任务时禁用导航、切换等交互 =====
const uiLockCount = ref(0)
const uiLocked = computed(() => uiLockCount.value > 0)
function lockUI(): void {
  uiLockCount.value += 1
}
function unlockUI(): void {
  uiLockCount.value = Math.max(0, uiLockCount.value - 1)
}

ensureInitialTab()
refreshDocumentLayout()

/**
 * 确保一个标签页的文档存在
 * @param tabId 标签页ID
 * @returns 标签页文档
 * @throws 如果tab是tool或system类型，抛出错误
 */
function ensureDocument(tabId: string): WorkspaceDocument {
  let doc = documents[tabId]
  if (!doc) {
    const tabInfo = tabs.find((tab) => tab.id === tabId)

    // 工具Tab和系统Tab不应该有文档上下文
    if (tabInfo && (tabInfo.kind === 'tool' || tabInfo.kind === 'system')) {
      const logger = createRendererLogger('Workspace')
      //logger.warn(`尝试为工具/系统Tab创建文档: ${tabId} (${tabInfo.kind})`);
      throw new Error(`工具Tab或系统Tab (${tabInfo.kind}) 不应该有文档上下文`)
    }

    const snapshot =
      tabInfo?.kind === 'new'
        ? createDocumentSnapshotFromTemplate('md', '')
        : captureCurrentDocumentSnapshot(tabId)
    doc = reactive(snapshot) as WorkspaceDocument
    doc.dirty = false
    doc.markdown = snapshot.markdown
    doc.tex = snapshot.tex
    doc.meta = structuredCloneFallback(snapshot.meta)
    doc.outline = structuredCloneFallback(snapshot.outline)
    doc.aiDialogs = structuredCloneFallback(snapshot.aiDialogs)
    doc.agentSessions = structuredCloneFallback(snapshot.agentSessions)
    doc.renderedHtml = snapshot.renderedHtml
    doc.lastView = snapshot.lastView
    doc.activeAgentSessionId = snapshot.activeAgentSessionId
    doc.savedMarkdown = snapshot.markdown
    doc.savedTex = snapshot.tex
    doc.savedMeta = structuredCloneFallback(snapshot.meta)
    doc.savedOutline = structuredCloneFallback(snapshot.outline)
    doc.savedAiDialogs = structuredCloneFallback(snapshot.aiDialogs)
    doc.savedAgentSessions = structuredCloneFallback(snapshot.agentSessions)
    documents[tabId] = doc
  }
  return doc
}

const activeTab = computed(() => {
  const currentId = activeTabId.value
  return tabs.find((tab) => tab.id === currentId) ?? null
}) as ComputedRef<WorkspaceTab | null>

const activeDocument = computed<WorkspaceDocument | null>(() => {
  const tab = activeTab.value
  if (!tab) return null
  // 工具Tab和系统Tab不应该有文档上下文
  if (tab.kind === 'tool' || tab.kind === 'system') {
    return null
  }
  try {
    return ensureDocument(tab.id)
  } catch (error) {
    // 如果ensureDocument失败（不应该发生，因为我们已经检查了kind），返回null
    return null
  }
})

/**
 * 提取文件名
 * @param fullPath 文件路径
 * @returns 文件名
 */
function extractFileName(fullPath: string): string {
  if (!fullPath) return ''
  const segments = fullPath.split(/[/\\]+/).filter(Boolean)
  return segments[segments.length - 1] ?? ''
}

/**
 * 结构化克隆一个值
 * @param value 要克隆的值
 * @returns 克隆后的值
 */
function structuredCloneFallback<T>(value: T): T {
  if (typeof value === 'undefined' || value === null) {
    return value
  }
  return JSON.parse(JSON.stringify(value))
}

function normalizeContent(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(/\r\n/g, '\n')
}

/**
 * 检查文档是否有内容（用于决定默认视图）
 * @param doc 文档对象
 * @returns 是否有内容
 */
export function hasDocumentContent(doc: {
  format: WorkspaceTabFormat
  markdown: string
  tex: string
}): boolean {
  if (doc.format === 'md') {
    // Markdown: trim 后不为空
    const content = (doc.markdown || '').trim()
    return content.length > 0
  } else if (doc.format === 'tex') {
    // LaTeX: 检查是否有正文或标题内容
    const tex = doc.tex || ''
    if (!tex.trim()) return false

    // 检查是否有 \begin{document} ... \end{document} 之间的内容
    const beginDocIndex = tex.indexOf('\\begin{document}')
    const endDocIndex = tex.indexOf('\\end{document}')

    if (beginDocIndex !== -1 && endDocIndex !== -1 && endDocIndex > beginDocIndex) {
      // 提取 document 环境中的内容
      const docContent = tex.substring(beginDocIndex + '\\begin{document}'.length, endDocIndex)

      // 移除注释（% 开头的行）
      const withoutComments = docContent.replace(/%[^\n]*/g, '')

      // 移除空白字符
      const trimmed = withoutComments.replace(/\s+/g, ' ').trim()

      if (trimmed.length === 0) return false

      // 检查是否有实际的文字内容（不是只有 LaTeX 命令）
      let meaningfulContent = trimmed
        .replace(/\\begin\{[^}]+\}/g, '')
        .replace(/\\end\{[^}]+\}/g, '')
        .replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1')
        .replace(/\\[a-zA-Z]+/g, '')
        .replace(/[{}]/g, '')
        .trim()

      return meaningfulContent.length > 0
    }

    // 如果没有 document 环境，检查整个文档是否有实际内容
    const withoutComments = tex.replace(/%[^\n]*/g, '')
    const withoutCommands = withoutComments
      .replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1')
      .replace(/\\[a-zA-Z]+/g, '')
      .replace(/[{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    return withoutCommands.length > 0
  }
  return false
}

function ensureInitialTab(isFromDrag: boolean = false): void {
  // 如果是从拖拽创建的窗口，不自动创建占位标签页
  if (isFromDrag) return

  // 检查 URL 参数
  const urlParams = new URLSearchParams(window.location.search)
  if (urlParams.get('skipAutoHome') === '1') return
  if (urlParams.get('windowType') === 'pooled') return

  if (tabs.length === 0) {
    const tab = createNewDocumentTabInternal()
    tab._isInitialPlaceholder = true
    activeTabId.value = tab.id
  } else if (!activeTabId.value) {
    activeTabId.value = tabs[0].id
  }
}

/**
 * 捕获当前活动标签页的文档快照
 * @param tabId 标签页ID
 * @returns 文档快照
 */
function captureCurrentDocumentSnapshot(tabId: string): WorkspaceDocument {
  const existing = documents[tabId]
  if (existing) {
    const cloned = structuredCloneFallback(existing)
    cloned.id = tabId
    cloned.tabId = tabId
    return cloned
  }

  const template = createDocumentSnapshotFromTemplate('md', '')
  template.id = tabId
  template.tabId = tabId
  return template
}

/**
 * 刷新当前活动标签页的元数据
 */
function refreshActiveTabMetadata(): void {
  const tab = activeTab.value
  if (!tab || tab.kind !== 'file') return
  const doc = ensureDocument(tab.id)
  const fileName = extractFileName(doc.path)
  const metaTitle = (doc.meta?.title || '').trim()
  tab.subtitle = fileName
  tab.title = metaTitle || fileName || UNTITLED_TITLE
}

/**
 * 生成一个唯一的标签页ID
 * @returns 唯一的标签页ID
 */
function generateTabId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 添加一个标签页
 * @param snapshot 标签页快照
 * @param overrides 标签页覆盖选项
 * @returns 添加的标签页
 */
function addDocumentTab(
  snapshot: WorkspaceDocument,
  overrides: Partial<WorkspaceTab> = {},
  options: { insertAfterActive?: boolean } = {}
): WorkspaceTab {
  const id = overrides.id ?? generateTabId()
  const clonedSnapshot = structuredCloneFallback(snapshot)
  clonedSnapshot.id = id
  clonedSnapshot.tabId = id
  clonedSnapshot.dirty = Boolean(clonedSnapshot.dirty)
  documents[id] = reactive(clonedSnapshot) as WorkspaceDocument

  const fallbackTitle =
    clonedSnapshot.meta.title || extractFileName(clonedSnapshot.path) || UNTITLED_TITLE
  const fallbackSubtitle = extractFileName(clonedSnapshot.path) || ''

  const tab = reactive<WorkspaceTab>({
    id,
    kind: overrides.kind !== undefined ? overrides.kind : 'file',
    title: overrides.title !== undefined ? overrides.title : fallbackTitle,
    subtitle: overrides.subtitle !== undefined ? overrides.subtitle : fallbackSubtitle,
    path: clonedSnapshot.path,
    format: clonedSnapshot.format,
    dirty: overrides.dirty !== undefined ? overrides.dirty : clonedSnapshot.dirty,
    readonly: overrides.readonly !== undefined ? overrides.readonly : false,
    preview: overrides.preview !== undefined ? overrides.preview : false,
    _isNewTab: true // 标记为新标签页，用于动画
  })

  if (overrides.workspacePlacement !== undefined) {
    tab.workspacePlacement = overrides.workspacePlacement
  } else if (tab.kind === 'file' || tab.kind === 'new') {
    tab.workspacePlacement = 'top'
  }

  // 如果指定了 insertAfterActive，在当前 active tab 后插入
  if (options.insertAfterActive && activeTabId.value) {
    const activeIndex = tabs.findIndex((t) => t.id === activeTabId.value)
    if (activeIndex !== -1) {
      tabs.splice(activeIndex + 1, 0, tab)
    } else {
      tabs.push(tab)
    }
  } else {
    tabs.push(tab)
  }

  refreshDocumentLayout()
  return tab
}

function createNewDocumentTabInternal(): WorkspaceTab {
  const snapshot = createDocumentSnapshotFromTemplate('md', '')
  return addDocumentTab(
    snapshot,
    {
      kind: 'new',
      title: i18n.global.t('home.tabActions.new'),
      subtitle: '',
      dirty: false,
      readonly: false
    },
    { insertAfterActive: true }
  )
}

/**
 * 删除一个标签页
 * @param id 标签页ID
 */
function removeTab(id: string): void {
  // 防止重复删除（快速双击Ctrl+W保护）
  if (removingTabIds.has(id)) {
    return
  }
  removingTabIds.add(id)

  try {
    const index = tabs.findIndex((tab) => tab.id === id)
    if (index === -1) {
      return
    }

    const tab = tabs[index]

    // 检查是否可以删除
    if (!canRemoveTab(id)) {
      return // 不可删除的Tab，直接返回
    }

    const doc = documents[id]

    // 保存到最近关闭的标签页栈（排除系统Tab和dummy Tab）
    if (tab.kind !== 'system' || tab.route !== '/dummy') {
      const closedEntry = {
        tab: { ...tab },
        document: doc
          ? { ...doc, markdown: doc.markdown, path: doc.path, format: doc.format, dirty: doc.dirty }
          : undefined,
        closedAt: Date.now()
      }
      recentlyClosedTabs.value.unshift(closedEntry)
      // 限制栈大小
      if (recentlyClosedTabs.value.length > MAX_RECENTLY_CLOSED) {
        recentlyClosedTabs.value = recentlyClosedTabs.value.slice(0, MAX_RECENTLY_CLOSED)
      }
    }
    const wasActive = activeTabId.value === id

    // 停止文件监听（如果文件路径存在）
    if (doc && doc.path) {
      // 异步停止文件监听（避免阻塞）
      ;(async () => {
        try {
          const messageBridge = (await import('../bridge/message-bridge')).default
          const ipc = messageBridge.getIpc()
          if (ipc) {
            messageBridge.send('unwatch-file', doc.path)
            if (ipc.invoke) {
              await messageBridge.invoke('mark-file-closing', doc.path)
              if (tab.preview) {
                await messageBridge.invoke('release-file-claim', doc.path)
              }
            }
            const logger = createRendererLogger('Workspace')
            logger.debug('停止文件监听', { filePath: doc.path, tabId: id, isPreview: tab.preview })
          }
        } catch (error) {
          const logger = createRendererLogger('Workspace')
          logger.warn('停止文件监听失败', { filePath: doc.path, tabId: id, error })
        }
      })()
    }

    tabs.splice(index, 1)
    delete documents[id]
    delete tabToolState[id]

    // 如果关闭后没有Tab了，创建一个系统Tab显示Dummy组件
    if (!tabs.length) {
      const dummyTab = openSystemTab('/dummy', '空白')
      activeTabId.value = dummyTab.id
      refreshDocumentLayout()
      return
    }

    // 如果关闭的是活跃Tab，或者已经没有活跃Tab，选择下一个
    if (wasActive || !activeTabId.value) {
      const fallback = tabs[index] || tabs[index - 1] || tabs[0]
      if (fallback) {
        activateTab(fallback.id)
      }
    }
    refreshDocumentLayout()
  } finally {
    // 确保清理正在删除的标记
    removingTabIds.delete(id)
  }
}

/**
 * 恢复最近关闭的标签页
 */
function reopenLastClosedTab(): WorkspaceTab | null {
  if (recentlyClosedTabs.value.length === 0) return null

  const entry = recentlyClosedTabs.value.shift()!
  const { tab: closedTab, document: closedDoc } = entry

  // 如果是文件Tab且路径已经打开，直接激活
  if (closedTab.kind === 'file' && closedTab.path) {
    const existingTab = tabs.find((t) => t.path === closedTab.path)
    if (existingTab) {
      activateTab(existingTab.id)
      return existingTab
    }
  }

  // 创建新的Tab ID（避免ID冲突）
  const newId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  const restoredTab: WorkspaceTab = {
    ...closedTab,
    id: newId
  }

  tabs.push(restoredTab)

  // 恢复文档数据
  if (closedDoc) {
    documents[newId] = {
      ...closedDoc
    }
  }

  activateTab(newId)
  refreshDocumentLayout()
  return restoredTab
}

/**
 * 切换到下一个标签页
 */
function switchToNextTab(): void {
  if (tabs.length <= 1) return
  const currentIndex = tabs.findIndex((t) => t.id === activeTabId.value)
  const nextIndex = (currentIndex + 1) % tabs.length
  activateTab(tabs[nextIndex].id)
}

/**
 * 切换到上一个标签页
 */
function switchToPrevTab(): void {
  if (tabs.length <= 1) return
  const currentIndex = tabs.findIndex((t) => t.id === activeTabId.value)
  const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length
  activateTab(tabs[prevIndex].id)
}

/**
 * 激活一个标签页
 * @param id 标签页ID
 */
function activateTab(id: string): void {
  if (activeTabId.value === id) return
  if (!tabs.some((tab) => tab.id === id)) return

  // 如果激活的不是空白页Tab，检查是否有空白页Tab需要关闭
  const targetTab = tabs.find((tab) => tab.id === id)
  if (targetTab && !(targetTab.kind === 'system' && targetTab.route === '/dummy')) {
    // 查找空白页Tab
    const dummyTab = tabs.find((tab) => tab.kind === 'system' && tab.route === '/dummy')
    if (dummyTab && dummyTab.id !== id) {
      // 关闭空白页Tab
      const dummyIndex = tabs.findIndex((tab) => tab.id === dummyTab.id)
      if (dummyIndex !== -1) {
        tabs.splice(dummyIndex, 1)
        delete documents[dummyTab.id]
      }
    }
  }

  activeTabId.value = id
  const activated = tabs.find((tab) => tab.id === id)
  if (activated && (activated.kind === 'file' || activated.kind === 'new')) {
    setGroupActiveTab(workspaceLayoutRoot.value, id)
  }
  refreshActiveTabMetadata()
}

/**
 * 检测内容格式（使用格式注册系统）
 * @param content 文档内容
 * @param filePath 文件路径（可选，用于基于扩展名的检测）
 * @returns 检测到的格式ID，如果无法检测则返回'md'
 */
export function detectDocumentFormat(content: string, filePath?: string): string {
  // 使用格式注册系统的检测功能
  const detected = formatRegistry.detectFormat(content, filePath)
  if (detected) {
    return detected
  }

  // 如果无法检测，默认返回Markdown（向后兼容）
  return 'md'
}

/**
 * 未选择格式/模板的新建 Tab（kind === 'new'）被 Agent 或其它逻辑写入内容后，
 * 将 Tab 提升为已初始化文档（与用户在「新建文档」中确认模板后的状态一致），
 * 避免 Editor 仍挂载在 NewDocumentWorkspace 上、与已有正文不一致。
 * 标题：若元信息无标题，则复用保存前所用的从正文提取逻辑（title-extractor）。
 */
function promoteNewDocumentTabAfterContentWrite(tabId: string): void {
  const tab = tabs.find((t) => t.id === tabId)
  if (!tab || tab.kind !== 'new') return
  const doc = documents[tabId]
  if (!doc) return

  const hasBody =
    (doc.markdown && doc.markdown.trim().length > 0) || (doc.tex && doc.tex.trim().length > 0)
  if (!hasBody) return

  let formatId = doc.format || 'md'
  if (!findFormatById(formatId)) {
    const raw = doc.tex && doc.tex.trim().length > 0 ? doc.tex : (doc.markdown ?? '')
    formatId = detectDocumentFormat(raw, doc.path || undefined)
    if (!findFormatById(formatId)) {
      formatId = 'md'
    }
    doc.format = formatId
    tab.format = formatId
  }

  const metaEmpty = !doc.meta?.title || doc.meta.title.trim().length === 0
  if (metaEmpty && (formatId === 'md' || formatId === 'tex')) {
    const content = formatId === 'tex' ? (doc.tex ?? '') : (doc.markdown ?? '')
    const extracted = extractTitleFromContent(content, formatId === 'tex' ? 'tex' : 'md')
    if (extracted) {
      const sanitized = sanitizeTitleForFilename(extracted)
      if (sanitized) {
        doc.meta = { ...doc.meta, title: sanitized }
      }
    }
  }

  initializeDocumentFromTemplate(tabId, formatId as WorkspaceTabFormat, undefined, 'editor')
  syncTabMetadataFromDocument(tabId)
}

/**
 * 更新一个标签页的Markdown内容
 * @param tabId 标签页ID
 * @param markdown 新的Markdown内容
 */
function updateDocumentMarkdown(tabId: string, markdown: string): void {
  const doc = ensureDocument(tabId)
  const tab = tabs.find((t) => t.id === tabId)
  const normalized = normalizeContent(markdown)
  const currentNormalized = normalizeContent(doc.markdown)

  // 如果规范化后的内容相同，说明只是规范化导致的差异，不触发更新
  if (normalized === currentNormalized) {
    getLogger().debug('忽略规范化导致的内容变化', {
      tabId,
      path: doc.path,
      markdownLength: normalized.length,
      currentMarkdownLength: currentNormalized.length
    })
    return
  }

  if (doc.markdown !== normalized) {
    // 检查是否只是末尾换行符的差异
    const savedNormalized = normalizeContent(doc.savedMarkdown ?? '')
    const normalizedTrimmed = normalized.trimEnd()
    const savedTrimmed = savedNormalized.trimEnd()

    // 如果去除末尾空白后内容相同，说明只是末尾空白字符的差异，不应该触发脏标记
    if (normalizedTrimmed === savedTrimmed && normalized !== savedNormalized) {
      getLogger().debug('检测到末尾空白字符差异，自动同步savedMarkdown', {
        tabId,
        path: doc.path,
        normalizedLength: normalized.length,
        savedLength: savedNormalized.length,
        normalizedEndsWith: JSON.stringify(normalized.slice(-5)),
        savedEndsWith: JSON.stringify(savedNormalized.slice(-5))
      })
      // 自动同步 savedMarkdown，避免触发脏标记
      doc.savedMarkdown = normalized
    }

    getLogger().debug('更新Markdown内容', {
      tabId,
      path: doc.path,
      oldLength: doc.markdown?.length ?? 0,
      newLength: normalized.length,
      diff: normalized.length - (doc.markdown?.length ?? 0)
    })

    doc.markdown = normalized

    // 自动检测并设置格式（如果格式未确定或内容明显是LaTeX）
    if (tab && tab.kind === 'new' && !tab.path) {
      // 新建文档且未保存，可以自动检测格式
      const detectedFormat = detectDocumentFormat(normalized, doc.path || undefined)
      if (detectedFormat && detectedFormat !== doc.format && normalized.trim().length > 0) {
        // 检测到格式且与当前格式不同，更新格式
        doc.format = detectedFormat as WorkspaceTabFormat
        tab.format = detectedFormat as WorkspaceTabFormat
      }
    }

    // 自动同步大纲树（从Markdown内容提取）
    // 注意：双向同步模式下，只要内容变化就重新提取大纲
    // suppressAutoOutlineSync 标志用于防止从大纲生成文本时的循环
    if (!suppressAutoOutlineSync && doc.format === 'md' && normalized.trim().length > 0) {
      try {
        const newOutline = extractOutlineTreeFromMarkdown(normalized)
        if (newOutline && newOutline.children && newOutline.children.length >= 0) {
          // 只有当提取到有效大纲时才更新（允许空大纲）
          updateDocumentOutline(tabId, newOutline)
        }
      } catch (error) {
        // 提取大纲失败时，不更新大纲树，避免破坏现有结构
        const logger = createRendererLogger('Workspace')
        logger.warn('自动同步大纲树失败:', error)
      }
    }

    promoteNewDocumentTabAfterContentWrite(tabId)

    updateDocumentDirty(tabId)
  }
}

/**
 * 将预览 Tab 固定为正式打开（取消预览状态）
 */
function pinTab(tabId: string): void {
  const tab = tabs.find((t) => t.id === tabId)
  if (tab) {
    tab.preview = false
  }
}

/**
 * 获取当前唯一的预览 Tab（若有）
 */
function getPreviewTab(): WorkspaceTab | null {
  return tabs.find((t) => t.preview === true) ?? null
}

function togglePinTab(tabId: string): void {
  const tab = tabs.find((t) => t.id === tabId)
  if (!tab) return
  tab.pinned = !tab.pinned
  // 固定 tab 始终靠左：移动到最后一个 pinned tab 之后
  const idx = tabs.indexOf(tab)
  tabs.splice(idx, 1)
  if (tab.pinned) {
    const lastPinnedIdx = tabs.reduce((last, t, i) => (t.pinned ? i : last), -1)
    tabs.splice(lastPinnedIdx + 1, 0, tab)
  } else {
    // 取消固定：移动到第一个非 pinned tab 的位置
    const firstUnpinnedIdx = tabs.findIndex((t) => !t.pinned)
    if (firstUnpinnedIdx === -1) {
      tabs.push(tab)
    } else {
      tabs.splice(firstUnpinnedIdx, 0, tab)
    }
  }
  refreshDocumentLayout()
}

/**
 * 更新一个标签页的LaTeX内容
 * @param tabId 标签页ID
 * @param tex 新的LaTeX内容
 */
function updateDocumentTex(tabId: string, tex: string): void {
  const doc = ensureDocument(tabId)
  const tab = tabs.find((t) => t.id === tabId)
  const normalized = normalizeContent(tex)
  if (doc.tex !== normalized) {
    // 检查是否只是末尾换行符的差异
    const savedNormalized = normalizeContent(doc.savedTex ?? '')
    const normalizedTrimmed = normalized.trimEnd()
    const savedTrimmed = savedNormalized.trimEnd()

    // 如果去除末尾空白后内容相同，说明只是末尾空白字符的差异，不应该触发脏标记
    if (normalizedTrimmed === savedTrimmed && normalized !== savedNormalized) {
      getLogger().debug('检测到末尾空白字符差异，自动同步savedTex', {
        tabId,
        path: doc.path,
        normalizedLength: normalized.length,
        savedLength: savedNormalized.length,
        normalizedEndsWith: JSON.stringify(normalized.slice(-5)),
        savedEndsWith: JSON.stringify(savedNormalized.slice(-5))
      })
      // 自动同步 savedTex，避免触发脏标记
      doc.savedTex = normalized
    }

    doc.tex = normalized

    // 自动检测并设置格式（如果格式未确定）
    if (tab && tab.kind === 'new' && !tab.path) {
      // 新建文档且未保存，可以自动检测格式
      const detectedFormat = detectDocumentFormat(normalized, doc.path || undefined)
      if (detectedFormat && detectedFormat !== doc.format && normalized.trim().length > 0) {
        // 检测到格式且与当前格式不同，更新格式
        doc.format = detectedFormat as WorkspaceTabFormat
        tab.format = detectedFormat as WorkspaceTabFormat
      }
    }

    // 自动同步大纲树（LaTeX需要先转换为Markdown再提取）
    // 注意：双向同步模式下，只要内容变化就重新提取大纲
    if (!suppressAutoOutlineSync && doc.format === 'tex' && normalized.trim().length > 0) {
      try {
        // 将LaTeX转换为Markdown，然后提取大纲树
        const markdown = convertLatexToMarkdown(normalized)
        const newOutline = extractOutlineTreeFromMarkdown(markdown)
        if (newOutline && newOutline.children && newOutline.children.length >= 0) {
          // 只有当提取到有效大纲时才更新（允许空大纲）
          updateDocumentOutline(tabId, newOutline)
        }
      } catch (error) {
        // 提取大纲失败时，不更新大纲树，避免破坏现有结构
        const logger = createRendererLogger('Workspace')
        logger.warn('自动同步大纲树失败（LaTeX转换）:', error)
      }
    }

    promoteNewDocumentTabAfterContentWrite(tabId)

    updateDocumentDirty(tabId)
  }
}

/**
 * 更新一个标签页的元数据
 * @param tabId 标签页ID
 * @param updater 元数据更新函数
 */
function updateDocumentMeta(tabId: string, updater: (meta: ArticleMetaData) => void): void {
  const doc = ensureDocument(tabId)
  const before = JSON.stringify(doc.meta)
  updater(doc.meta)
  if (JSON.stringify(doc.meta) !== before) {
    syncTabMetadataFromDocument(tabId)
    updateDocumentDirty(tabId)
  }
}

/**
 * 更新一个标签页的大纲树
 * @param tabId 标签页ID
 * @param outline 新的大纲树
 */
function updateDocumentOutline(tabId: string, outline: DocumentOutlineNode): void {
  const doc = ensureDocument(tabId)
  const serialized = JSON.stringify(outline)
  if (JSON.stringify(doc.outline) !== serialized) {
    doc.outline = structuredCloneFallback(outline)
    // 大纲树是程序内部状态，不应该触发脏标记
    // 只有当大纲树被修改并同步到文档内容，导致文档内容改变时，才会通过updateDocumentMarkdown/updateDocumentTex触发脏标记
    // 因此这里不调用 updateDocumentDirty
  }
}

/**
 * 更新一个标签页的AI对话消息
 * @param tabId 标签页ID
 * @param dialogs 新的AI对话消息
 */
function updateDocumentAiDialogs(tabId: string, dialogs: AIDialog[]): void {
  const doc = ensureDocument(tabId)
  const serialized = JSON.stringify(dialogs)
  if (JSON.stringify(doc.aiDialogs) !== serialized) {
    doc.aiDialogs = structuredCloneFallback(dialogs)
    updateDocumentDirty(tabId)
  }
}

function updateDocumentAgentSessions(
  tabId: string,
  sessions: AgentSession[],
  skipDirtyCheck = false
): void {
  const doc = ensureDocument(tabId)
  const serialized = JSON.stringify(sessions)
  if (JSON.stringify(doc.agentSessions) !== serialized) {
    doc.agentSessions = structuredCloneFallback(sessions)
    if (skipDirtyCheck) {
      // 如果跳过dirty检查，同步到savedAgentSessions，这样就不会被认为是dirty
      doc.savedAgentSessions = structuredCloneFallback(sessions)
      // 重新计算dirty状态（现在应该是false了）
      updateDocumentDirty(tabId)
    } else {
      updateDocumentDirty(tabId)
    }
  }
}

/**
 * 找出两个文本的差异详情
 * @param current 当前文本
 * @param saved 保存的文本
 * @param maxContextLength 上下文最大长度
 * @returns 差异详情对象
 */
function findTextDiff(
  current: string,
  saved: string,
  maxContextLength: number = 50
): {
  diffPosition: number
  diffLine: number
  currentContext: string
  savedContext: string
  currentChar: string
  savedChar: string
} | null {
  if (current === saved) {
    return null
  }

  const currentLength = current.length
  const savedLength = saved.length
  const minLength = Math.min(currentLength, savedLength)

  // 找出第一个不同的位置
  let diffPosition = minLength // 默认差异在较短文本的末尾
  for (let i = 0; i < minLength; i++) {
    if (current[i] !== saved[i]) {
      diffPosition = i
      break
    }
  }
  // 如果循环完成都没有找到差异，说明差异在长度上（diffPosition已经是minLength）

  // 计算差异所在的行号（从1开始）
  const diffLine = current.substring(0, diffPosition).split('\n').length

  // 获取差异位置的上下文
  const contextStart = Math.max(0, diffPosition - maxContextLength)
  const contextEnd = Math.min(currentLength, diffPosition + maxContextLength)
  const savedContextEnd = Math.min(savedLength, diffPosition + maxContextLength)

  const currentContext = current.substring(contextStart, contextEnd)
  const savedContext = saved.substring(contextStart, savedContextEnd)

  // 获取差异位置的字符
  const currentChar = diffPosition < currentLength ? JSON.stringify(current[diffPosition]) : '(EOF)'
  const savedChar = diffPosition < savedLength ? JSON.stringify(saved[diffPosition]) : '(EOF)'

  // 如果差异在末尾，尝试从末尾向前查找，找出真正的差异位置
  if (diffPosition === minLength && currentLength !== savedLength) {
    // 差异在长度上，尝试找出末尾的差异
    const maxCheck = Math.min(20, minLength) // 最多检查末尾20个字符
    let endDiffPosition = minLength
    for (let i = 1; i <= maxCheck; i++) {
      const currentEnd = currentLength - i
      const savedEnd = savedLength - i
      if (currentEnd >= 0 && savedEnd >= 0 && current[currentEnd] !== saved[savedEnd]) {
        endDiffPosition = Math.min(currentEnd, savedEnd)
        break
      }
    }
    if (endDiffPosition < minLength) {
      // 找到了末尾的差异位置
      return {
        diffPosition: endDiffPosition,
        diffLine: current.substring(0, endDiffPosition).split('\n').length,
        currentContext: current.substring(
          Math.max(0, endDiffPosition - maxContextLength),
          currentLength
        ),
        savedContext: saved.substring(Math.max(0, endDiffPosition - maxContextLength), savedLength),
        currentChar:
          endDiffPosition < currentLength ? JSON.stringify(current[endDiffPosition]) : '(EOF)',
        savedChar: endDiffPosition < savedLength ? JSON.stringify(saved[endDiffPosition]) : '(EOF)'
      }
    }
  }

  return {
    diffPosition,
    diffLine,
    currentContext,
    savedContext,
    currentChar,
    savedChar
  }
}

/**
 * 更新一个标签页的脏状态，根据文档内容计算脏状态
 * @param tabId 标签页ID
 */
function updateDocumentDirty(tabId: string): void {
  const doc = ensureDocument(tabId)
  function computeDocumentDirty(): boolean {
    // 只检查文档内容和元信息的变化，不检查大纲树
    // 大纲树是程序内部状态，不应该触发脏标记
    // 只有当大纲树被修改并同步到文档内容，导致文档内容改变时，才会通过markdownDiff或texDiff触发脏标记
    //
    // 对于md文件：只检查markdown和元信息，不检查tex（tex是自动转换的内部状态）
    // 对于tex文件：只检查tex和元信息，不检查markdown（markdown是自动转换的内部状态）
    // 对于txt文件：只检查markdown和元信息（txt文件的内容存储在markdown字段中）
    const markdownDiff =
      (doc.format === 'md' || doc.format === 'txt') && doc.markdown !== doc.savedMarkdown
    const texDiff = doc.format === 'tex' && doc.tex !== doc.savedTex
    const metaDiff = JSON.stringify(doc.meta) !== JSON.stringify(doc.savedMeta)
    const aiDialogsDiff = JSON.stringify(doc.aiDialogs) !== JSON.stringify(doc.savedAiDialogs)
    const agentSessionsDiff =
      JSON.stringify(doc.agentSessions) !== JSON.stringify(doc.savedAgentSessions)

    const isDirty = markdownDiff || texDiff || metaDiff || aiDialogsDiff || agentSessionsDiff

    // 添加详细日志用于排查
    if (isDirty) {
      const logData: Record<string, any> = {
        tabId,
        path: doc.path,
        format: doc.format,
        markdownDiff,
        texDiff,
        metaDiff,
        aiDialogsDiff,
        agentSessionsDiff,
        markdownLength: doc.markdown?.length ?? 0,
        savedMarkdownLength: doc.savedMarkdown?.length ?? 0,
        texLength: doc.tex?.length ?? 0,
        savedTexLength: doc.savedTex?.length ?? 0
      }

      // 如果Markdown有差异，记录详细差异信息
      if (markdownDiff) {
        const markdownDiffDetail = findTextDiff(doc.markdown ?? '', doc.savedMarkdown ?? '')
        if (markdownDiffDetail) {
          logData.markdownDiffDetail = {
            diffPosition: markdownDiffDetail.diffPosition,
            diffLine: markdownDiffDetail.diffLine,
            currentContext: markdownDiffDetail.currentContext,
            savedContext: markdownDiffDetail.savedContext,
            currentChar: markdownDiffDetail.currentChar,
            savedChar: markdownDiffDetail.savedChar
          }
        }
      }

      // 如果LaTeX有差异，记录详细差异信息
      if (texDiff) {
        const texDiffDetail = findTextDiff(doc.tex ?? '', doc.savedTex ?? '')
        if (texDiffDetail) {
          logData.texDiffDetail = {
            diffPosition: texDiffDetail.diffPosition,
            diffLine: texDiffDetail.diffLine,
            currentContext: texDiffDetail.currentContext,
            savedContext: texDiffDetail.savedContext,
            currentChar: texDiffDetail.currentChar,
            savedChar: texDiffDetail.savedChar
          }
        }
      }

      getLogger().debug('文档dirty状态检查', logData)
    }

    return isDirty
  }
  const dirty = computeDocumentDirty()
  doc.dirty = dirty

  const tab = tabs.find((item) => item.id === tabId)
  if (tab) {
    tab.dirty = dirty
    // 预览 tab 一旦需要保存（任意维度产生脏标记），即视为正式打开，避免未保存内容被「单预览槽」误替换
    if (dirty && tab.preview) {
      pinTab(tabId)
    }
    if (tab.id === activeTabId.value) {
      eventBus.emit('is-need-save', dirty)
    }
  }
}

/**
 * 更新一个标签页的最后视图
 * @param tabId 标签页ID
 * @param view 新的最后视图
 */
function updateDocumentLastView(tabId: string, view: DocumentView): void {
  const logger = getLogger()
  //logger.info('[Workspace] updateDocumentLastView 被调用', { tabId, view, stack: new Error().stack })
  const doc = ensureDocument(tabId)
  if (doc.lastView !== view) {
    doc.lastView = view
  }
}

/**
 * 更新文档 Agent 视图中当前选中的会话 ID（用于窗口迁移时保留）
 */
function updateDocumentActiveAgentSessionId(
  tabId: string,
  sessionId: string | null | undefined
): void {
  const doc = documents[tabId]
  if (!doc) return
  if (sessionId !== undefined && sessionId !== null) {
    doc.activeAgentSessionId = sessionId
  } else {
    delete doc.activeAgentSessionId
  }
}

/**
 * 获取工具 Tab 的 UI 状态（用于窗口迁移时恢复当前会话/对话）
 */
function getTabToolState(tabId: string): TabToolState {
  return tabToolState[tabId] ?? {}
}

/**
 * 设置工具 Tab 的 UI 状态（由工具视图在切换会话/对话时写入，迁移时序列化）
 */
function setTabToolState(tabId: string, state: TabToolState): void {
  if (!state || (state.activeSessionId === undefined && state.activeDialogIndex === undefined)) {
    delete tabToolState[tabId]
    return
  }
  tabToolState[tabId] = { ...state }
}

/**
 * 更新一个标签页的渲染后的HTML
 * @param tabId 标签页ID
 * @param html 新的渲染后的HTML
 */
function updateDocumentRenderedHtml(tabId: string, html: string): void {
  const doc = ensureDocument(tabId)
  if (doc.renderedHtml !== html) {
    doc.renderedHtml = html
  }
}

function syncTabMetadataFromDocument(tabId: string): void {
  const tab = tabs.find((item) => item.id === tabId)
  const doc = documents[tabId]
  if (!tab || !doc) return

  const fileName = extractFileName(doc.path)
  const title = (doc.meta?.title || '').trim()

  tab.path = doc.path
  tab.format = doc.format
  tab.subtitle = fileName
  tab.title = title || fileName || UNTITLED_TITLE
}

function markDocumentSaved(tabId: string, newPath?: string): void {
  const doc = ensureDocument(tabId)
  const oldPath = doc.path

  // 规范化内容，确保与打开文档时使用的规范化逻辑一致
  const normalizedMarkdown = normalizeContent(doc.markdown)
  const normalizedTex = normalizeContent(doc.tex)

  getLogger().debug('标记文档已保存', {
    tabId,
    oldPath,
    newPath,
    format: doc.format,
    markdownLength: normalizedMarkdown.length,
    savedMarkdownLength: doc.savedMarkdown?.length ?? 0,
    texLength: normalizedTex.length,
    savedTexLength: doc.savedTex?.length ?? 0,
    markdownEqual: normalizedMarkdown === doc.savedMarkdown,
    texEqual: normalizedTex === doc.savedTex
  })

  if (typeof newPath === 'string') {
    doc.path = newPath
  }

  // 确保保存的内容是规范化后的（与编辑器更新时保持一致）
  // 注意：这里使用规范化后的内容，确保与打开文档时的处理逻辑一致
  // 同步规范化内存中的正文，避免 doc.markdown/doc.tex 仍为 \r\n 等形态而 saved* 已为 \n，
  // 导致下方「保存后校验」误判为未保存并再次 updateDocumentDirty（脏点闪烁）。
  if (doc.format === 'tex') {
    doc.tex = normalizedTex
  } else {
    doc.markdown = normalizedMarkdown
  }
  doc.savedMarkdown = normalizedMarkdown
  doc.savedTex = normalizedTex
  doc.savedOutline = structuredCloneFallback(doc.outline)
  doc.savedMeta = structuredCloneFallback(doc.meta)
  doc.savedAiDialogs = structuredCloneFallback(doc.aiDialogs)
  doc.savedAgentSessions = structuredCloneFallback(doc.agentSessions)
  // 关键修复：立即设置 dirty 为 false，不等待 updateDocumentDirty
  // 因为我们已经设置了 savedMarkdown/savedTex 等，内容应该是同步的
  doc.dirty = false

  const tab = tabs.find((item) => item.id === tabId)
  if (tab) {
    if (typeof newPath === 'string') {
      tab.path = newPath
    }
    // 关键修复：立即设置 tab.dirty 为 false，立即消除脏标记
    tab.dirty = false
  }

  syncTabMetadataFromDocument(tabId)

  if (activeTabId.value === tabId) {
    eventBus.emit('is-need-save', false)
  }

  // 关键修复：在 markDocumentSaved 中，我们已经设置了 savedMarkdown/savedTex 等，内容应该是同步的
  // 为了性能和用户体验，不调用 updateDocumentDirty（避免延迟）
  // 如果内容确实同步了，dirty 应该是 false；如果不同，可能是异步更新导致
  // 如果后续有异步更新导致内容不同，会在下次 updateDocumentMarkdown 时重新计算 dirty
  // 这里直接验证内容是否相同，如果相同就不调用 updateDocumentDirty（避免延迟）
  // 如果不同，可能是异步更新导致，但也可能是保存前的状态，我们已经在上面设置为 false 了
  // 为了保险，如果内容确实不同，我们重新计算 dirty 状态（但这种情况应该很少）
  const markdownDiff = doc.format === 'md' && doc.markdown !== doc.savedMarkdown
  const texDiff = doc.format === 'tex' && doc.tex !== doc.savedTex
  const metaDiff = JSON.stringify(doc.meta) !== JSON.stringify(doc.savedMeta)
  const aiDialogsDiff = JSON.stringify(doc.aiDialogs) !== JSON.stringify(doc.savedAiDialogs)
  const agentSessionsDiff =
    JSON.stringify(doc.agentSessions) !== JSON.stringify(doc.savedAgentSessions)

  // 如果内容确实不同（可能是异步更新导致），重新计算 dirty 状态
  // 但这种情况应该很少，因为 sync-active-editor 已经同步了内容
  if (markdownDiff || texDiff || metaDiff || aiDialogsDiff || agentSessionsDiff) {
    getLogger().warn('markDocumentSaved 后内容仍然不同，重新计算 dirty 状态', {
      tabId,
      markdownDiff,
      texDiff,
      metaDiff,
      aiDialogsDiff,
      agentSessionsDiff
    })
    // 如果内容确实不同，可能是异步更新导致，重新计算 dirty 状态
    updateDocumentDirty(tabId)
  }
  // 如果内容已经同步，dirty 已经是 false 了，不需要再次设置或调用 updateDocumentDirty

  // 如果路径发生变化，更新文件监听
  if (typeof newPath === 'string' && newPath !== oldPath && newPath) {
    // 异步更新文件监听（避免阻塞）
    ;(async () => {
      try {
        // 停止旧路径的监听
        if (oldPath) {
          const messageBridge = (await import('../bridge/message-bridge')).default
          messageBridge.send('unwatch-file', oldPath)
        }

        // 启动新路径的监听
        const messageBridge = (await import('../bridge/message-bridge')).default
        messageBridge.send('watch-file', newPath, tabId)
        messageBridge.send('update-file-watcher-tab-id', newPath, tabId)
        const logger = createRendererLogger('Workspace')
        logger.debug('更新文件监听路径', { oldPath, newPath, tabId })
      } catch (error) {
        const logger = createRendererLogger('Workspace')
        logger.warn('更新文件监听失败', { oldPath, newPath, tabId, error })
      }
    })()
  } else if (doc.path && !oldPath) {
    // 如果是从无路径到有路径（首次保存），启动文件监听
    ;(async () => {
      try {
        const messageBridge = (await import('../bridge/message-bridge')).default
        messageBridge.send('watch-file', doc.path, tabId)
        const logger = createRendererLogger('Workspace')
        logger.debug('启动文件监听（首次保存）', { filePath: doc.path, tabId })
      } catch (error) {
        const logger = createRendererLogger('Workspace')
        logger.warn('启动文件监听失败', { filePath: doc.path, tabId, error })
      }
    })()
  }
}

function createDocumentSnapshotFromTemplate(
  formatId: WorkspaceTabFormat,
  templateContent: string
): WorkspaceDocument {
  const normalizedContent = normalizeContent(templateContent ?? '')
  const markdownContent =
    formatId === 'md' ? normalizedContent : convertLatexToMarkdown(normalizedContent)
  const texContent = formatId === 'tex' ? normalizedContent : ''

  const outlineSource = markdownContent || ''
  const outline =
    extractOutlineTreeFromMarkdown(outlineSource) ?? structuredCloneFallback(DEFAULT_OUTLINE_TREE)

  const meta = structuredCloneFallback(DEFAULT_ARTICLE_META)

  // 创建临时文档对象用于检查内容
  const tempDoc = {
    format: formatId,
    markdown: markdownContent,
    tex: texContent
  }

  // 根据模板内容决定初始视图（TeX/纯文本始终进编辑器，避免模板有正文时 lastView 落在 home）
  const hasContent = hasDocumentContent(tempDoc)
  const initialView: DocumentView =
    formatId === 'tex' || formatId === 'txt' || formatId === 'text'
      ? 'editor'
      : hasContent
        ? 'home'
        : 'editor'

  return {
    id: '',
    tabId: '',
    path: '',
    format: formatId,
    markdown: markdownContent,
    tex: texContent,
    outline: structuredCloneFallback(outline),
    meta: structuredCloneFallback(meta),
    aiDialogs: structuredCloneFallback(DEFAULT_AI_DIALOGS),
    agentSessions: structuredCloneFallback(DEFAULT_AGENT_SESSIONS),
    lastView: initialView,
    renderedHtml: '',
    dirty: false,
    savedMarkdown: markdownContent,
    savedTex: texContent,
    savedOutline: structuredCloneFallback(outline),
    savedMeta: structuredCloneFallback(meta),
    savedAiDialogs: structuredCloneFallback(DEFAULT_AI_DIALOGS),
    savedAgentSessions: structuredCloneFallback(DEFAULT_AGENT_SESSIONS)
  }
}

function initializeDocumentFromTemplate(
  tabId: string,
  formatId: WorkspaceTabFormat,
  templateId?: string,
  targetView?: DocumentView
): void {
  const tab = tabs.find((item) => item.id === tabId)
  if (!tab) return
  const format = findFormatById(formatId)
  if (!format) {
    throw new Error(`不支持的文档格式: ${formatId}`)
  }
  const template =
    findFormatTemplate(formatId, templateId) ??
    findFormatTemplate(formatId, format.defaultTemplateId) ??
    format.templates[0]

  const doc = ensureDocument(tabId)

  // 检查文档是否已有内容（避免覆盖已有内容）
  const hasContent =
    (doc.markdown && doc.markdown.trim().length > 0) || (doc.tex && doc.tex.trim().length > 0)

  if (hasContent) {
    // 如果文档已有内容，只更新格式和元信息，不覆盖内容
    doc.format = formatId
    if (targetView) {
      doc.lastView = targetView
    }
    tab.format = formatId
    tab.kind = 'file'
    refreshActiveTabMetadata()
    updateDocumentDirty(tabId)
    return
  }

  // 如果文档没有内容，使用模板初始化
  const snapshot = createDocumentSnapshotFromTemplate(formatId, template?.content ?? '')
  snapshot.id = tabId
  snapshot.tabId = tabId

  // 如果指定了目标视图，则覆盖默认的 lastView
  if (targetView) {
    snapshot.lastView = targetView
  }

  Object.assign(doc, snapshot)

  tab.kind = 'file'
  tab.format = formatId
  tab.path = ''
  tab.dirty = false
  tab.readonly = false
  tab.subtitle = ''
  tab.title = UNTITLED_TITLE

  markDocumentSaved(tabId)
  refreshActiveTabMetadata()
  updateDocumentDirty(tabId)
}

function openNewDocumentTab(): WorkspaceTab {
  const tab = createNewDocumentTabInternal()
  activateTab(tab.id)
  return tab
}

function moveTab(tabId: string, targetId: string): void {
  if (tabId === targetId) return
  const fromIndex = tabs.findIndex((tab) => tab.id === tabId)
  const toIndex = tabs.findIndex((tab) => tab.id === targetId)
  if (fromIndex === -1 || toIndex === -1) return
  const [tab] = tabs.splice(fromIndex, 1)
  tabs.splice(toIndex, 0, tab as WorkspaceTab)
  refreshDocumentLayout()
}

async function saveDocument(tabId: string, options?: { saveAs?: boolean }): Promise<boolean> {
  const logger = createRendererLogger('Workspace')
  logger.debug('保存文档', { tabId, options })
  const tab = tabs.find((item) => item.id === tabId)
  if (!tab || tab.kind !== 'file') {
    return false
  }
  const doc = ensureDocument(tabId)
  try {
    const result = await saveWorkspaceDocument(doc, options)
    if (result?.path) {
      markDocumentSaved(tabId, result.path)
      return true
    }
    return false
  } catch (error) {
    logger.error('保存文档失败', error)
    throw error
  }
}

async function saveAllDocuments(): Promise<{ saved: string[]; failed: string[] }> {
  const saved: string[] = []
  const failed: string[] = []
  const logger = createRendererLogger('Workspace')
  for (const tab of tabs) {
    if (tab.kind !== 'file') continue
    const doc = ensureDocument(tab.id)
    const requiresSave = doc.path === '' || doc.dirty
    if (!requiresSave) {
      continue
    }

    try {
      const result = await saveWorkspaceDocument(doc, { saveAs: doc.path === '' })
      if (result?.path) {
        markDocumentSaved(tab.id, result.path)
        saved.push(tab.id)
      } else {
        failed.push(tab.id)
        break
      }
    } catch (error) {
      logger.error('保存文档失败', error)
      failed.push(tab.id)
    }
  }

  return { saved, failed }
}

// ===== 跨窗口文档信息获取（用于设置窗口的Agent Tool测试） =====
// 单窗口多Tab架构：不再需要sendBroadcast，直接使用eventBus
import { mergeText } from '../utils/text-merge.js'
import { removeMetaInfo } from '../utils/meta-info-remover'

/**
 * 初始化workspace的跨窗口事件监听器
 * 应该在应用启动时调用，而不是在模块加载时
 */
/**
 * 处理外部文件变化
 * 实现类似 VSCode 的文件自动同步功能
 * 使用异步处理和防抖，避免阻塞主线程
 */
function handleExternalFileChange(payload: unknown): void {
  const typedPayload = payload as {
    filePath: string
    tabId?: string
    content: string
    modifiedTime: number
    diff?: Array<{
      type: 'insert' | 'delete' | 'replace'
      start: number
      end: number
      newText: string
    }>
  }

  const logger = createRendererLogger('Workspace')

  // 异步处理，避免阻塞主线程
  Promise.resolve()
    .then(async () => {
      const { filePath, tabId, content, modifiedTime, diff } = typedPayload
      // 查找匹配的标签页
      const matchingTab = tabs.find((tab) => {
        if (tabId && tab.id === tabId) return true
        const doc = documents[tab.id]
        return doc && doc.path === filePath
      })

      if (!matchingTab) {
        logger.debug('文件变化但未找到匹配的标签页', { filePath, tabId })
        return
      }

      const doc = ensureDocument(matchingTab.id)
      if (!doc) {
        logger.warn('无法获取文档', { tabId: matchingTab.id })
        return
      }

      // 获取当前编辑器内容（根据格式）
      const currentContent = doc.format === 'tex' ? (doc.tex ?? '') : (doc.markdown ?? '')
      const savedContent = doc.format === 'tex' ? (doc.savedTex ?? '') : (doc.savedMarkdown ?? '')

      // 规范化内容（统一换行符）
      const normalizeContent = (text: string) => text.replace(/\r\n/g, '\n')

      // 移除 meta-info 以便比较（meta-info 是 MetaDoc 注入的，不应该参与比较）
      const externalContentWithoutMeta = removeMetaInfo(content, doc.format)
      const currentContentWithoutMeta = removeMetaInfo(currentContent, doc.format)
      const savedContentWithoutMeta = removeMetaInfo(savedContent, doc.format)

      const normalizedExternal = normalizeContent(externalContentWithoutMeta)
      const normalizedCurrent = normalizeContent(currentContentWithoutMeta)
      const normalizedSaved = normalizeContent(savedContentWithoutMeta)

      // 情况1：外部文件内容与已保存内容相同（文件被外部恢复或撤销）
      if (normalizedExternal === normalizedSaved) {
        // 如果当前有未保存的改动，保留这些改动
        if (normalizedCurrent !== normalizedSaved) {
          logger.info('外部文件已恢复为已保存版本，保留未保存的改动', { filePath })
          // 不更新内容，保留用户的未保存改动
          return
        }
        // 如果当前内容与已保存内容相同，直接同步外部文件
        logger.info('外部文件已恢复为已保存版本，同步更新', { filePath })
        // 使用移除 meta-info 后的内容
        if (doc.format === 'tex') {
          updateDocumentTex(matchingTab.id, externalContentWithoutMeta)
        } else {
          updateDocumentMarkdown(matchingTab.id, externalContentWithoutMeta)
        }
        markDocumentSaved(matchingTab.id, filePath)
        return
      }

      // 情况2：外部文件内容与当前编辑器内容相同（可能是我们自己的保存操作触发的）
      if (normalizedExternal === normalizedCurrent) {
        logger.debug('外部文件内容与当前编辑器内容相同，忽略', { filePath })
        // 更新已保存内容，但不触发dirty状态
        if (doc.format === 'tex') {
          doc.savedTex = content
        } else {
          doc.savedMarkdown = content
        }
        updateDocumentDirty(matchingTab.id)
        return
      }

      // 情况3：外部文件内容与已保存内容不同，且与当前编辑器内容也不同
      // 检查当前是否有未保存的改动
      const hasUnsavedChanges = normalizedCurrent !== normalizedSaved

      if (hasUnsavedChanges) {
        // 有未保存的改动，尝试智能合并
        logger.info('检测到外部文件修改且当前有未保存改动，尝试智能合并', {
          filePath,
          externalSize: normalizedExternal.length,
          currentSize: normalizedCurrent.length,
          savedSize: normalizedSaved.length
        })

        // 执行三路合并（使用移除 meta-info 后的内容，避免 meta-info 干扰合并）
        const mergeResult = mergeText(
          savedContentWithoutMeta,
          currentContentWithoutMeta,
          externalContentWithoutMeta
        )

        // 只要有冲突，就弹出对话框让用户选择，不自动合并
        if (mergeResult.hasConflict) {
          // 有冲突，需要用户决定
          logger.warn('检测到文件冲突：需要用户选择', {
            filePath,
            conflictCount: mergeResult.conflictRanges?.length || 0
          })

          // 发送冲突事件，让UI组件处理（显示对话框等）
          // 注意：传递移除 meta-info 后的内容，这样 diff 窗口不会显示 meta-info 的差异
          eventBus.emit('file-conflict-detected', {
            tabId: matchingTab.id,
            filePath,
            externalContent: externalContentWithoutMeta, // 移除 meta-info
            currentContent: currentContentWithoutMeta, // 移除 meta-info
            savedContent: savedContentWithoutMeta, // 移除 meta-info
            format: doc.format,
            mergeResult: mergeResult
          })
        } else if (mergeResult.success) {
          // 合并成功，没有冲突，自动应用合并结果
          logger.info('智能合并成功，自动应用合并结果', { filePath })
          // 使用 nextTick 确保在下一个事件循环中更新，避免阻塞
          await new Promise((resolve) => setTimeout(resolve, 0))
          // 注意：mergeResult.mergedContent 已经是移除 meta-info 后的内容，直接使用
          if (doc.format === 'tex') {
            updateDocumentTex(matchingTab.id, mergeResult.mergedContent)
          } else {
            updateDocumentMarkdown(matchingTab.id, mergeResult.mergedContent)
          }
          // 注意：不调用 markDocumentSaved，因为合并后的内容可能仍然与外部文件不同
          // 用户可以选择保存或继续编辑
          eventBus.emit('show-info', '已自动合并外部文件更改，未保存的改动已保留')
        } else {
          // 合并失败，也弹出对话框
          logger.warn('文件合并失败，需要用户选择', { filePath })
          eventBus.emit('file-conflict-detected', {
            tabId: matchingTab.id,
            filePath,
            externalContent: externalContentWithoutMeta, // 移除 meta-info
            currentContent: currentContentWithoutMeta, // 移除 meta-info
            savedContent: savedContentWithoutMeta, // 移除 meta-info
            format: doc.format,
            mergeResult: mergeResult
          })
        }
      } else {
        // 没有未保存的改动，直接同步外部文件
        logger.info('外部文件已修改，自动同步（无未保存改动）', { filePath })
        // 使用 nextTick 确保在下一个事件循环中更新，避免阻塞
        await new Promise((resolve) => setTimeout(resolve, 0))
        // 注意：使用移除 meta-info 后的内容，这样不会把外部文件的 meta-info 带进来
        // MetaDoc 会在保存时自动注入自己的 meta-info
        if (doc.format === 'tex') {
          updateDocumentTex(matchingTab.id, externalContentWithoutMeta)
        } else {
          updateDocumentMarkdown(matchingTab.id, externalContentWithoutMeta)
        }
        markDocumentSaved(matchingTab.id, filePath)
      }
    })
    .catch((error) => {
      logger.error('处理外部文件变化失败', { filePath: typedPayload.filePath, error })
    })
}

/**
 * 处理外部文件删除
 */
function handleExternalFileDeleted(payload: unknown): void {
  const typedPayload = payload as { filePath: string; tabId?: string }
  const { filePath, tabId } = typedPayload
  const logger = createRendererLogger('Workspace')

  // 查找匹配的标签页
  const matchingTab = tabs.find((tab) => {
    if (tabId && tab.id === tabId) return true
    const doc = documents[tab.id]
    return doc && doc.path === filePath
  })

  if (!matchingTab) {
    logger.debug('文件删除但未找到匹配的标签页', { filePath, tabId })
    return
  }

  logger.info('检测到文件被删除', { filePath, tabId: matchingTab.id })

  // 发送文件删除事件，让UI组件处理
  eventBus.emit('external-file-deleted-for-tab', {
    tabId: matchingTab.id,
    filePath: typedPayload.filePath
  })
}

export async function initializeWorkspaceBroadcastListeners(): Promise<void> {
  // 监听外部文件变化事件
  eventBus.on('external-file-changed', handleExternalFileChange)
  eventBus.on('external-file-deleted', handleExternalFileDeleted)

  // 监听来自设置窗口的文档信息请求
  // 单窗口多Tab架构：设置窗口也是Tab，直接使用eventBus响应
  eventBus.on('request-active-document-info', (requestId: unknown) => {
    const typedRequestId = requestId as string
    const doc = activeDocument.value
    if (!doc) {
      // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast
      eventBus.emit('response-active-document-info', {
        requestId,
        document: null,
        error: '没有活动的文档'
      })
      return
    }

    // 根据文档格式获取对应的内容
    // 对于 LaTeX 文档，优先使用 tex 内容；对于 Markdown 文档，使用 markdown 内容
    const content = doc.format === 'tex' ? doc.tex : doc.markdown
    const hasContent = Boolean(content && content.trim().length > 0)

    // 发送文档信息（不包含完整内容，只包含必要信息）
    // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast
    eventBus.emit('response-active-document-info', {
      requestId: typedRequestId,
      document: {
        id: doc.id,
        tabId: doc.tabId,
        path: doc.path,
        format: doc.format,
        meta: structuredCloneFallback(doc.meta),
        outline: structuredCloneFallback(doc.outline),
        markdown: doc.markdown,
        tex: doc.tex,
        hasContent: hasContent
      }
    })
  })

  // 监听来自设置窗口的文档内容请求
  // 单窗口多Tab架构：设置窗口也是Tab，直接使用eventBus响应
  eventBus.on('request-document-content', (requestId: unknown) => {
    const typedRequestId = requestId as string
    const doc = activeDocument.value
    if (!doc) {
      // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast
      eventBus.emit('response-document-content', {
        requestId,
        content: null,
        error: '没有活动的文档'
      })
      return
    }

    // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast
    eventBus.emit('response-document-content', {
      requestId: typedRequestId,
      content: {
        markdown: doc.markdown,
        tex: doc.tex,
        format: doc.format
      }
    })
  })
}

/**
 * 从文件路径中提取目录路径（用于设置 linkBase）
 * @param filePath 文件路径
 * @returns 目录路径（在 Electron 环境中返回 file:// URL 格式，否则返回相对路径）
 */
export function getDirectoryFromPath(filePath: string): string {
  if (!filePath) return ''

  // 在 Electron 环境中，需要将文件路径转换为 file:// URL 格式
  // 以便 Vditor 能够正确解析相对路径
  if (isElectronEnv()) {
    // 移除 file:/// 前缀（如果存在）
    let path = filePath.replace(/^file:\/\/\//, '')

    // Windows 路径处理：将反斜杠转换为正斜杠
    path = path.replace(/\\/g, '/')

    // 分割路径为各个部分，对每个部分进行编码
    const parts = path.split('/')
    const encodedParts = parts.map((part: string, index: number) => {
      if (index === 0 && part.endsWith(':')) {
        // Windows 驱动器号（如 C:）不需要编码
        return part
      }
      // 对路径的每一部分进行编码
      return encodeURIComponent(part).replace(/%2F/g, '/')
    })

    // 获取目录路径（去掉文件名）
    const dirParts = encodedParts.slice(0, -1)
    if (dirParts.length === 0) return ''

    // 返回 file:// URL 格式的目录路径
    return `file:///${dirParts.join('/')}/`
  } else {
    // 在 Web 环境中，使用简单的相对路径
    const normalizedPath = filePath.replace(/\\/g, '/')
    const lastSlashIndex = normalizedPath.lastIndexOf('/')
    if (lastSlashIndex === -1) return ''
    const dirPath = normalizedPath.substring(0, lastSlashIndex + 1)
    return dirPath
  }
}

/**
 * 获取文档的 linkBase（用于 Vditor 等编辑器解析相对路径）
 * @param docPath 文档路径
 * @returns linkBase 字符串
 */
export function getLinkBase(docPath: string): string {
  if (!docPath) return ''
  return getDirectoryFromPath(docPath)
}

// 工具Tab的标题映射（使用i18n动态获取）
function getToolTabTitle(toolType: ToolTabType): string {
  return i18n.global.t(`home.toolTab.${toolType}`)
}

// 工具Tab的路由映射
const TOOL_TAB_ROUTES: Record<ToolTabType, string> = {
  ocr: '/ocr',
  graph: '/graph',
  attachment: '/attachment',
  dataAnalysis: '/data-analysis',
  formulaRecognition: '/fomula-recognition',
  aiChat: '/ai-chat',
  setting: '/setting',
  aigcDetection: '/aigc-detection',
  agentReview: '/agent-review'
}

/**
 * 查找已存在的标签页（统一唯一性检查）
 * @param tab 要查找的标签页
 * @returns 已存在的标签页或 null
 */
function findExistingTab(tab: WorkspaceTab): WorkspaceTab | null {
  if (tab.kind === 'tool' && tab.toolType) {
    return tabs.find((t) => t.kind === 'tool' && t.toolType === tab.toolType) || null
  }
  if (tab.kind === 'system' && tab.route) {
    return tabs.find((t) => t.kind === 'system' && t.route === tab.route) || null
  }
  if (tab.path && (tab.kind === 'file' || tab.kind === 'new')) {
    return tabs.find((t) => t.path === tab.path) || null
  }
  return null
}

/**
 * 打开或激活工具Tab
 * @param toolType 工具类型
 * @returns 工具Tab
 */
function openToolTab(toolType: ToolTabType): WorkspaceTab {
  // 查找是否已存在该工具Tab
  const existingTab = tabs.find((tab) => tab.kind === 'tool' && tab.toolType === toolType)

  if (existingTab) {
    // 如果已存在，激活它
    activateTab(existingTab.id)
    return existingTab
  }

  // 创建新的工具Tab
  const id = generateTabId()
  const tab = reactive<WorkspaceTab>({
    id,
    kind: 'tool',
    title: getToolTabTitle(toolType),
    subtitle: '',
    path: '',
    format: 'md',
    dirty: false,
    readonly: true,
    toolType,
    route: TOOL_TAB_ROUTES[toolType],
    workspacePlacement: 'top'
  })

  tabs.push(tab)
  activateTab(id)
  return tab
}

/**
 * 打开或激活系统Tab（主页、知识库、调试工具等不可删除的Tab）
 * @param route 路由路径
 * @param title 标题
 * @returns 系统Tab
 */
function openSystemTab(route: string, title: string): WorkspaceTab {
  // 查找是否已存在该系统Tab
  const existingTab = tabs.find((tab) => tab.kind === 'system' && tab.route === route)

  if (existingTab) {
    activateTab(existingTab.id)
    return existingTab
  }

  const id = generateTabId()
  const tab = reactive<WorkspaceTab>({
    id,
    kind: 'system',
    title,
    subtitle: '',
    path: '',
    format: 'md',
    dirty: false,
    readonly: true,
    route,
    workspacePlacement: 'top'
  })

  tabs.push(tab)
  activateTab(id)
  return tab
}

/**
 * 检查Tab是否可以删除
 */
function canRemoveTab(tabId: string): boolean {
  const tab = tabs.find((t) => t.id === tabId)
  if (!tab) return false
  if (tab.pinned) return false
  return true
}

export function useWorkspace() {
  return {
    tabs,
    activeTabId,
    activeTab,
    workspaceLayoutRoot,
    refreshDocumentLayout,
    dissolveWorkbenchLayout,
    applyWorkspaceSplitFromDrag,
    applySelfDocumentSplitFromDrag,
    applyMoveTabToLayoutGroup,
    applyReorderTabInLayoutGroup,
    applyWorkspacePaneTabBarDrop,
    promoteTabFromLayoutToTop,
    documents,
    activeDocument,
    uiLocked,
    lockUI,
    unlockUI,
    activateTab,
    captureCurrentDocumentSnapshot,
    addDocumentTab,
    removeTab,
    ensureDocument,
    updateDocumentMarkdown,
    updateDocumentTex,
    updateDocumentMeta,
    updateDocumentOutline,
    updateDocumentAiDialogs,
    updateDocumentAgentSessions,
    updateDocumentDirty,
    updateDocumentLastView,
    updateDocumentActiveAgentSessionId,
    getTabToolState,
    setTabToolState,
    updateDocumentRenderedHtml,
    markDocumentSaved,
    initializeDocumentFromTemplate,
    openNewDocumentTab,
    moveTab,
    saveDocument,
    saveAllDocuments,
    supportedFormats: computed(() => supportedFormatsRef.value),
    setSupportedFormats(formats: SupportedFormat[]) {
      supportedFormatsRef.value = formats
    },
    async initTemplateFormats(locale: string, t: TranslateFn) {
      const formats = await getSupportedFormatsFromTemplates(locale, t)
      const normalizedLocale = locale.replace('-', '_')
      supportedFormatsRef.value = formats.map((f) => {
        const userTemplatesList = getUserTemplatesForLocaleFormat(normalizedLocale, f.id)
        return {
          ...f,
          templates: [...f.templates, ...userTemplatesList]
        }
      })
    },
    withAutoOutlineSyncSuppressed,
    handleExternalFileChange,
    handleExternalFileDeleted,
    getDirectoryFromPath,
    getLinkBase,
    openToolTab,
    openSystemTab,
    canRemoveTab,
    createDocumentSnapshotFromTemplate,
    hasDocumentContent,
    refreshActiveTabMetadata,
    pinTab,
    getPreviewTab,
    togglePinTab,
    recentlyClosedTabs,
    reopenLastClosedTab,
    switchToNextTab,
    switchToPrevTab
  }
}
