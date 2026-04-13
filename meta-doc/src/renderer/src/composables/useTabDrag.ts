import { ref, computed, onUnmounted } from 'vue'
import {
  useWorkspace,
  promoteClassicToWorkspaceLayoutIfNeeded,
  type WorkspaceTab,
  type WorkspaceTabKind
} from '../stores/workspace'
import {
  collectTabIdsInLayout,
  findGroupByLayoutId,
  findGroupContainingTab,
  isLayoutSplit,
  type SplitEdge
} from '../stores/workspace-layout'
import { useFocusMode } from './useFocusMode'
import { getEditorChromeLayoutSync } from '../stores/editor-chrome-layout-state'
import { createRendererLogger } from '../utils/logger'
import { themeState } from '../utils/themes'
import messageBridge from '../bridge/message-bridge'
import eventBus from '../utils/event-bus'

// Lazy logger to avoid circular dependency: logger → web-main-calls → router → … → useTabDrag → logger
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null
function getLogger() {
  if (!loggerInstance) loggerInstance = createRendererLogger('useTabDrag')
  return loggerInstance
}

/** 统一拖拽排查日志（渲染进程控制台搜索 `[DnD]`） */
export function dndLog(phase: string, source: string, detail: Record<string, unknown> = {}) {
  getLogger().info(`[DnD] ${phase} | ${source}`, detail)
}

/** 拖拽数据 MIME 类型 —— 自定义类型避免 OS 级转发导致崩溃；供顶栏 / 分屏条 / 编辑区 drop 共用 */
export const TAB_DRAG_MIME_TYPE = 'application/x-metadoc-tab'

/** 资源树文件节点拖向顶栏/编辑区时使用，与 Tab 拖拽区分 */
export const WORKSPACE_FILE_PATH_DRAG_MIME = 'application/x-metadoc-workspace-path'

/**
 * dragover.types 阶段：资源树路径（含仅 text/plain 的目录）且非顶栏 Tab 拖拽
 */
export function isWorkspacePathLikeDragTypes(types: readonly string[] | undefined): boolean {
  if (!types?.length) return false
  const list = types as string[]
  if (list.includes(TAB_DRAG_MIME_TYPE)) return false
  return list.includes(WORKSPACE_FILE_PATH_DRAG_MIME) || list.includes('text/plain')
}

/** dragover 用：types 异常时仍可能为资源树路径拖（见 tree 会话桥接） */
export function shouldTreatAsExternalWorkspacePathDrag(
  dt: DataTransfer | null | undefined
): boolean {
  return isWorkspacePathLikeDragTypes(dt?.types) || treePathDragSessionActive
}

/** 资源树路径拖：Electron 下 drop 时 getData 常为空，用 dragstart→dragend 会话桥接 */
let treePathDragSessionPath = ''
let treePathDragSessionActive = false

export function beginWorkspaceTreePathDragSession(path: string): void {
  treePathDragSessionPath = (path || '').trim()
  treePathDragSessionActive = true
  eventBus.emit('main-tabs-path-bar-insert-hint', null)
}

export function endWorkspaceTreePathDragSession(): void {
  const had = treePathDragSessionActive
  treePathDragSessionPath = ''
  treePathDragSessionActive = false
  if (had) {
    eventBus.emit('main-tabs-path-bar-insert-hint', null)
    eventBus.emit('main-tabs-external-drop-ui-reset')
  }
}

/** drop 阶段读取资源树/工作区路径（自定义 MIME 与 text/plain 都尝试，兼容 Electron） */
export function readWorkspacePathFromDataTransfer(dt: DataTransfer | null | undefined): string {
  if (dt) {
    const m = dt.getData(WORKSPACE_FILE_PATH_DRAG_MIME)?.trim() ?? ''
    const p = dt.getData('text/plain')?.trim() ?? ''
    if (m || p) return m || p
  }
  if (treePathDragSessionActive && treePathDragSessionPath) {
    return treePathDragSessionPath
  }
  return ''
}

/** 顶栏「工作台」占位 id（非 workspace.tabs 成员），与 MainTabs 共用 */
export const WORKBENCH_SYNTHETIC_ID = '__meta_workbench_active__' as const

/**
 * 窗格小 Tab 拖入顶栏任意区域：整栏高亮，松手插入顶栏末尾（pinned 区 / 非 pinned 区各插到对应末尾）
 */
export const MAIN_TABS_PANE_APPEND_SENTINEL = '__meta_main_tabs_pane_append__' as const

/** 主栏插入提示：资源树 path 与窗格 Tab→主栏共用几何；dragend 消费窗格投放时用副本 */
export type MainTabsStripInsertHint = {
  tabBarAnchorTabId: string
  tabBarInsertMode: 'before' | 'after'
}

let lastPaneToMainStripInsertHint: MainTabsStripInsertHint | null = null

/** 本次 Tab 拖拽起始表面：窗格条 → 顶栏间隙投放时可提升为顶栏独立 Tab */
export const tabDragSourceSurface = ref<'main' | 'pane' | null>(null)

export function setTabDragSourceSurface(surface: 'main' | 'pane' | null): void {
  tabDragSourceSurface.value = surface
}

// Tab 栏元素引用（用于计算边界）
let tabBarElement: HTMLElement | null = null

// 缓存的缩略图数据
let cachedThumbnailDataUrl: string | null = null
let cachedThumbnailImg: HTMLImageElement | null = null

/**
 * 设置 Tab 栏元素引用（用于计算屏幕坐标边界）
 */
export const setTabBarElement = (el: HTMLElement | null) => {
  tabBarElement = el
}

/**
 * 预获取拖拽缩略图（在 mousedown 时调用，提前加载图片）
 */
export const prefetchDragThumbnail = async (): Promise<void> => {
  if (!messageBridge.getIpc()) return

  try {
    const dataUrl = await messageBridge.invoke('capture-window-thumbnail')
    if (!dataUrl) return

    cachedThumbnailDataUrl = dataUrl

    // 预加载图片
    const img = new Image()
    img.src = dataUrl
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('缩略图加载失败'))
    })
    cachedThumbnailImg = img
  } catch (error) {
    getLogger().warn('预获取缩略图失败:', error)
    cachedThumbnailDataUrl = null
    cachedThumbnailImg = null
  }
}

/**
 * 清理缓存的缩略图
 */
const clearCachedThumbnail = () => {
  cachedThumbnailDataUrl = null
  cachedThumbnailImg = null
}

/**
 * 获取当前窗口 ID
 */
const getCurrentWindowId = async (): Promise<number> => {
  if (!messageBridge.getIpc()) return -1
  try {
    return await messageBridge.invoke('get-window-id')
  } catch (error) {
    getLogger().error('Failed to get window ID:', error)
    return -1
  }
}

/**
 * 序列化后的 Tab 数据类型
 * 用于跨窗口拖拽时传递完整的 Tab + 文档数据
 */
export interface SerializedTabData {
  tab: {
    id: string
    kind: WorkspaceTabKind
    title: string
    subtitle: string
    path: string
    format: string
    dirty: boolean
    readonly?: boolean
    preview?: boolean
    toolType?: string
    route?: string
    workspacePlacement?: 'top' | 'workbench'
  }
  document: any | null
  toolState: any | null
  sourceWindowId: number
  sourceTabCount: number
  canDragToOtherWindow: boolean
  /** 拖出时由当前窗口写入，供新窗口继承专注模式 */
  sourceFocusMode?: boolean
}

/**
 * 拖拽状态
 */
export interface TabDropPreview {
  targetId: string | null
  mode: 'before' | 'after' | null
  splitEdge: SplitEdge | null
}

export interface DragState {
  isDragging: boolean
  draggingId: string | null
  draggingTab: WorkspaceTab | null
  dropPreview: TabDropPreview
}

/**
 * 拖拽选项
 */
export interface UseTabDragOptions {
  onDragStart?: (tab: WorkspaceTab, event: DragEvent) => void | Promise<void>
  onDragEnd?: (tab: WorkspaceTab, event: DragEvent) => void | Promise<void>
  onDrop?: (fromId: string, toId: string, mode: 'before' | 'after') => void | Promise<void>
}

// 拖拽会话状态（模块级，跨 composable 调用共享）
let currentSessionId: string | null = null

/** dragend 时供 drag:end：在 consume 前由 MainTabs / WorkspacePaneGroup 根据 dropPreview 快照写入 */
let pendingHadValidDropHighlight: boolean | undefined

/**
 * 仅当确实存在顶栏 append / 分屏或 before-after 高亮时为 true。
 * 不要用 false：主进程 drag:end 里 hadValidDropHighlight===false 会在窗口内触发「分离新窗口」；
 * Electron 顶栏 drag 区吞 dragover 时 preview 常为空，误传 false 会导致 pane→顶栏被当成拖出。
 */
export function snapshotDragEndDropHighlightFromPreview(preview: TabDropPreview): void {
  const had =
    preview.targetId === MAIN_TABS_PANE_APPEND_SENTINEL ||
    !!(preview.targetId && (preview.mode || preview.splitEdge))
  pendingHadValidDropHighlight = had ? true : undefined
}

/** 每次 dragstart / dragend(drop) / ESC 递增，防止异步 initSession 乱序覆盖 currentSessionId（专注模式下拉拖拽尤易触发） */
let dragGeneration = 0
let dragCanvasElement: HTMLCanvasElement | null = null
let escapeKeyHandler: ((e: KeyboardEvent) => void) | null = null
/** 全局 dragover 监听：拖到 MainTabs 外时也允许 drop，需配合 preventDefault */
let globalDragOverHandler: ((e: DragEvent) => void) | null = null
/** document capture：子元素（Monaco 等）拦截 drop 时仍能在编辑区完成分屏 */
let globalEditorSplitDropHandler: ((e: DragEvent) => void) | null = null
let globalPathDragOverHandler: ((e: DragEvent) => void) | null = null
let globalPathDropHandler: ((e: DragEvent) => void) | null = null
let globalPathDragEnterHandler: ((e: DragEvent) => void) | null = null
let dragEndClearEditorZoneInstalled = false
let globalPathDragListenersInstalled = false

/** 编辑区投放：按命中的子窗格分区；full = 并入该组 Tab 列表（同格多 Tab） */
export type EditorPaneContentZone = 'left' | 'right' | 'top' | 'bottom' | 'full'

export type EditorPaneDropContext = {
  paneKey: string
  zone: EditorPaneContentZone
  targetTabId: string
  layoutGroupId: string | null
}

const sharedEditorPaneDropContext = ref<EditorPaneDropContext | null>(null)

export const editorPaneDropUi = computed(() => {
  const c = sharedEditorPaneDropContext.value
  return c ? { paneKey: c.paneKey, zone: c.zone } : null
})

/** dragend 在 consume 之前调用：指针停在编辑区窗格分栏高亮上时 dropPreview 常为空，仍需避免主进程误判分离窗口 */
export function snapshotEditorPaneDropHighlightBeforeConsume(): void {
  if (sharedEditorPaneDropContext.value) {
    pendingHadValidDropHighlight = true
  }
}

/** 指针下若为分屏内标签条，则交给条上 drop，不用编辑区整片分屏 */
function isPointOverEditorChromeTabSurface(clientX: number, clientY: number): boolean {
  const stack = document.elementsFromPoint(clientX, clientY)
  for (const node of stack) {
    if (!(node instanceof HTMLElement)) continue
    if (node.closest('.pane-tab-strip, .pane-tab-item')) {
      return true
    }
  }
  return false
}

function queryPrimaryContentMain(): HTMLElement | null {
  return (
    (document.querySelector('#app-content-main-drop-root') as HTMLElement | null) ??
    (document.querySelector('.content-main') as HTMLElement | null)
  )
}

export function computeEditorPaneContentZone(
  clientX: number,
  clientY: number,
  rect: DOMRect
): EditorPaneContentZone | null {
  if (rect.width <= 0 || rect.height <= 0) return null
  const x = (clientX - rect.left) / rect.width
  const y = (clientY - rect.top) / rect.height
  if (x < 0 || x > 1 || y < 0 || y > 1) return null
  /* 与 EditorPaneDropOverlay 一致：中央约 50%×50% 为「整 pane」投放，四边各为半宽/半高条 */
  const margin = 0.25
  if (x >= margin && x <= 1 - margin && y >= margin && y <= 1 - margin) return 'full'
  const dt = y
  const db = 1 - y
  const dl = x
  const dr = 1 - x
  if (dt <= db && dt <= dl && dt <= dr) return 'top'
  if (db <= dl && db <= dr) return 'bottom'
  if (dl <= dr) return 'left'
  return 'right'
}

function queryEditorPaneDropRootAtPoint(clientX: number, clientY: number): HTMLElement | null {
  const stack = document.elementsFromPoint(clientX, clientY)
  for (const node of stack) {
    if (!(node instanceof HTMLElement)) continue
    const root = node.closest('[data-editor-pane-drop-root]')
    if (root instanceof HTMLElement) return root
  }
  return null
}

function resolveTargetTabIdForPaneRoot(
  workspace: ReturnType<typeof useWorkspace>,
  el: HTMLElement
): string {
  const gid = el.dataset.layoutGroupId?.trim()
  if (gid) {
    const g = findGroupByLayoutId(workspace.workspaceLayoutRoot.value, gid)
    if (g?.activeTabId && g.tabIds.includes(g.activeTabId)) return g.activeTabId
    return g?.tabIds[0] ?? ''
  }
  const tid = workspace.activeTabId.value
  return tid || ''
}

function resolveLayoutGroupIdForPaneRoot(
  workspace: ReturnType<typeof useWorkspace>,
  el: HTMLElement
): string | null {
  const raw = el.dataset.layoutGroupId?.trim()
  if (raw) return raw
  const tid = workspace.activeTabId.value
  if (!tid) return null
  return findGroupContainingTab(workspace.workspaceLayoutRoot.value, tid)?.id ?? null
}

function updateEditorPaneDropFromPointer(
  workspace: ReturnType<typeof useWorkspace>,
  clientX: number,
  clientY: number
): void {
  if (isPointOverEditorChromeTabSurface(clientX, clientY)) {
    sharedEditorPaneDropContext.value = null
    return
  }
  const rootEl = queryEditorPaneDropRootAtPoint(clientX, clientY)
  if (!rootEl) {
    sharedEditorPaneDropContext.value = null
    return
  }
  const rect = rootEl.getBoundingClientRect()
  const zone = computeEditorPaneContentZone(clientX, clientY, rect)
  if (!zone) {
    sharedEditorPaneDropContext.value = null
    return
  }
  const paneKey = rootEl.dataset.layoutGroupId?.trim() || '__single_pane__'
  const layoutGroupId = resolveLayoutGroupIdForPaneRoot(workspace, rootEl)
  const targetTabId = resolveTargetTabIdForPaneRoot(workspace, rootEl)
  if (!targetTabId) {
    sharedEditorPaneDropContext.value = null
    return
  }
  sharedEditorPaneDropContext.value = { paneKey, zone, targetTabId, layoutGroupId }
}

export function tryEmitWorkspaceOpenDocumentForPathHit(
  workspace: ReturnType<typeof useWorkspace>,
  clientX: number,
  clientY: number,
  path: string
): boolean {
  if (isPointOverEditorChromeTabSurface(clientX, clientY)) return false
  const rootEl = queryEditorPaneDropRootAtPoint(clientX, clientY)
  if (!rootEl) return false
  const r = rootEl.getBoundingClientRect()
  if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return false

  const zone = computeEditorPaneContentZone(clientX, clientY, r)
  if (!zone) return false

  promoteClassicToWorkspaceLayoutIfNeeded()

  const layoutGroupId = resolveLayoutGroupIdForPaneRoot(workspace, rootEl)
  const targetTabId = resolveTargetTabIdForPaneRoot(workspace, rootEl)

  if (zone === 'full') {
    const gid = layoutGroupId
    if (gid) {
      eventBus.emit('workspace-open-document', {
        path,
        workspacePlacement: 'workbench' as const,
        layoutTargetGroupId: gid,
        layoutInsertBeforeTabId: null
      })
    } else {
      eventBus.emit('workspace-open-document', { path, workspacePlacement: 'top' as const })
    }
  } else {
    if (!targetTabId) return false
    eventBus.emit('workspace-open-document', {
      path,
      workspacePlacement: 'workbench' as const,
      splitRelativeToTabId: targetTabId,
      editorContentSplitEdge: zone
    })
  }
  return true
}

function isPointOverMainTabsStrip(clientX: number, clientY: number): boolean {
  if (typeof document === 'undefined') return false
  const bar = document.querySelector('.main-tabs-wrapper .tabs-list') as HTMLElement | null
  if (!bar) return false
  const br = bar.getBoundingClientRect()
  return clientX >= br.left && clientX <= br.right && clientY >= br.top && clientY <= br.bottom
}

/** 主栏：按指针 X 算靠哪枚 tab 的 before/after（含 tab 缝间隙）；path / 窗格 Tab 共用 */
export function computeMainBarPathInsertFromClientXY(
  clientX: number,
  clientY: number
): MainTabsStripInsertHint | null {
  const list = document.querySelector('.main-tabs-wrapper .tabs-list') as HTMLElement | null
  if (!list) return null
  const br = list.getBoundingClientRect()
  if (clientY < br.top || clientY > br.bottom) return null

  const items = [...list.querySelectorAll(':scope > .tab-item[data-tab-id]')] as HTMLElement[]
  if (!items.length) return null

  const rects = items
    .map((el) => {
      const id = el.getAttribute('data-tab-id')?.trim() ?? ''
      return id ? { id, r: el.getBoundingClientRect() } : null
    })
    .filter((x): x is { id: string; r: DOMRect } => x !== null)

  if (!rects.length) return null

  const { id: firstId, r: fr } = rects[0]
  if (clientX < fr.left + fr.width / 2) {
    return { tabBarAnchorTabId: firstId, tabBarInsertMode: 'before' }
  }

  for (let i = 0; i < rects.length; i++) {
    const { id, r } = rects[i]
    const mid = r.left + r.width / 2
    if (clientX >= r.left && clientX <= r.right) {
      return {
        tabBarAnchorTabId: id,
        tabBarInsertMode: clientX < mid ? 'before' : 'after'
      }
    }
    if (i < rects.length - 1) {
      const nr = rects[i + 1].r
      if (clientX > r.right && clientX < nr.left) {
        return { tabBarAnchorTabId: id, tabBarInsertMode: 'after' }
      }
    }
  }

  const { id: lastId } = rects[rects.length - 1]
  return { tabBarAnchorTabId: lastId, tabBarInsertMode: 'after' }
}

function paintPathDragEditorZone(e: DragEvent): void {
  const types = e.dataTransfer?.types
  if (!isWorkspacePathLikeDragTypes(types) && !treePathDragSessionActive) return
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'copy'
  const workspace = useWorkspace()
  updateEditorPaneDropFromPointer(workspace, e.clientX, e.clientY)
  const overStrip = isPointOverMainTabsStrip(e.clientX, e.clientY)
  eventBus.emit('main-tabs-external-drop-ui-highlight', overStrip)
  eventBus.emit(
    'main-tabs-path-bar-insert-hint',
    overStrip ? computeMainBarPathInsertFromClientXY(e.clientX, e.clientY) : null
  )
}

function onGlobalPathDragEnter(e: DragEvent): void {
  if (!isWorkspacePathLikeDragTypes(e.dataTransfer?.types) && !treePathDragSessionActive) return
  e.preventDefault()
}

function onGlobalPathDropCapture(e: DragEvent): void {
  const types = e.dataTransfer?.types
  const typesArr = types ? Array.from(types) : []
  if (!isWorkspacePathLikeDragTypes(types) && !treePathDragSessionActive) return
  if (isPointOverEditorChromeTabSurface(e.clientX, e.clientY)) {
    dndLog('drop', 'path-global', {
      action: 'skip',
      reason: 'over-pane-tab-chrome',
      x: e.clientX,
      y: e.clientY
    })
    return
  }

  const path = readWorkspacePathFromDataTransfer(e.dataTransfer)
  if (!path) {
    dndLog('drop', 'path-global', {
      action: 'skip',
      reason: 'empty-path',
      types: typesArr,
      treeSessionActive: treePathDragSessionActive
    })
    return
  }

  // 仅标签条区域：避免与整段 main-tabs-wrapper（含窗口按钮、已打开文档等）重叠误触发
  const bar =
    (typeof document !== 'undefined' &&
      (document.querySelector('.main-tabs-wrapper .tabs-list') as HTMLElement | null)) ||
    tabBarElement
  if (bar) {
    const br = bar.getBoundingClientRect()
    if (
      e.clientX >= br.left &&
      e.clientX <= br.right &&
      e.clientY >= br.top &&
      e.clientY <= br.bottom
    ) {
      e.preventDefault()
      e.stopImmediatePropagation()
      sharedEditorPaneDropContext.value = null
      const insert = computeMainBarPathInsertFromClientXY(e.clientX, e.clientY)
      dndLog('drop', 'path-global', { action: 'open-on-main-tabs-strip', path })
      eventBus.emit('workspace-open-document', {
        path,
        workspacePlacement: 'top' as const,
        ...(insert || {})
      })
      eventBus.emit('main-tabs-path-bar-insert-hint', null)
      eventBus.emit('main-tabs-external-drop-ui-reset')
      return
    }
  }

  const workspace = useWorkspace()
  sharedEditorPaneDropContext.value = null
  if (tryEmitWorkspaceOpenDocumentForPathHit(workspace, e.clientX, e.clientY, path)) {
    e.preventDefault()
    e.stopImmediatePropagation()
    dndLog('drop', 'path-global', { action: 'emit-workspace-open-document-editor-pane', path })
    eventBus.emit('main-tabs-path-bar-insert-hint', null)
    eventBus.emit('main-tabs-external-drop-ui-reset')
    return
  }

  const contentMain = queryPrimaryContentMain()
  if (!contentMain) {
    dndLog('drop', 'path-global', { action: 'skip', reason: 'no-content-main-root' })
    return
  }
  const rect = contentMain.getBoundingClientRect()
  if (
    e.clientX < rect.left ||
    e.clientX > rect.right ||
    e.clientY < rect.top ||
    e.clientY > rect.bottom
  ) {
    dndLog('drop', 'path-global', {
      action: 'skip',
      reason: 'outside-content-main',
      x: e.clientX,
      y: e.clientY,
      rect: { l: rect.left, t: rect.top, r: rect.right, b: rect.bottom }
    })
    return
  }

  e.preventDefault()
  e.stopImmediatePropagation()

  const zone = computeEditorContentDropZone(e.clientX, e.clientY, rect)
  const splitRelativeToTabId = workspace.activeTabId.value

  promoteClassicToWorkspaceLayoutIfNeeded()

  const placement: 'top' | 'workbench' = zone ? 'workbench' : 'top'
  const payload: {
    path: string
    workspacePlacement: 'top' | 'workbench'
    splitRelativeToTabId?: string
    editorContentSplitEdge?: SplitEdge
  } = { path, workspacePlacement: placement }
  if (zone && splitRelativeToTabId) {
    payload.splitRelativeToTabId = splitRelativeToTabId
    payload.editorContentSplitEdge = zone
  }
  dndLog('drop', 'path-global', {
    action: 'emit-workspace-open-document-fallback',
    path,
    placement,
    zone,
    splitRelativeToTabId: splitRelativeToTabId || null
  })
  eventBus.emit('main-tabs-path-bar-insert-hint', null)
  eventBus.emit('workspace-open-document', payload)
}

function ensureEditorDropZoneDragEndCleanup(): void {
  if (dragEndClearEditorZoneInstalled || typeof document === 'undefined') return
  dragEndClearEditorZoneInstalled = true
  document.addEventListener(
    'dragend',
    () => {
      // 放到微任务，确保同帧内各 capture drop 已读完 tree 路径桥接
      queueMicrotask(() => endWorkspaceTreePathDragSession())
      if (!sharedIsDragging.value) {
        sharedEditorPaneDropContext.value = null
      }
    },
    true
  )

  if (!globalPathDragListenersInstalled) {
    globalPathDragListenersInstalled = true
    globalPathDragOverHandler = (ev) => paintPathDragEditorZone(ev)
    globalPathDropHandler = (ev) => void onGlobalPathDropCapture(ev)
    globalPathDragEnterHandler = (ev) => onGlobalPathDragEnter(ev)
    document.addEventListener('dragenter', globalPathDragEnterHandler, true)
    document.addEventListener('dragover', globalPathDragOverHandler, true)
    document.addEventListener('drop', globalPathDropHandler, true)
  }
}

/** 拖拽时全屏透明层：从第一帧就强制 cursor: move，从根本上不出现禁止光标 */
let dragCursorOverlay: HTMLDivElement | null = null

/** 跨 MainTabs / WorkspacePaneGroup 共享的拖拽状态 */
const sharedIsDragging = ref(false)
const sharedDraggingId = ref<string | null>(null)
const sharedDraggingTab = ref<WorkspaceTab | null>(null)
const sharedDropPreview = ref<TabDropPreview>({
  targetId: null,
  mode: null,
  splitEdge: null
})

async function notifyTabDragSessionConsumed(
  workspace: ReturnType<typeof useWorkspace>
): Promise<void> {
  if (!currentSessionId || !messageBridge.getIpc()) return
  try {
    const currentWindowId = await getCurrentWindowId()
    const fromId = sharedDraggingId.value
    const insertIndex = fromId ? workspace.tabs.findIndex((t) => t.id === fromId) : -1
    await messageBridge.invoke('drag:drop', {
      sessionId: currentSessionId,
      targetWindowId: currentWindowId,
      insertIndex: Math.max(0, insertIndex)
    })
  } catch (error) {
    getLogger().warn('consume 后 drag:drop 失败:', error)
  }
}

function resolveWorkbenchSyntheticAnchorTabId(
  workspace: ReturnType<typeof useWorkspace>,
  anchorTabId: string
): string {
  if (anchorTabId !== WORKBENCH_SYNTHETIC_ID) return anchorTabId
  const set = collectTabIdsInLayout(workspace.workspaceLayoutRoot.value)
  const first = workspace.tabs.find((x) => set.has(x.id))
  return first?.id ?? anchorTabId
}

/** 窗格条 Tab → 顶栏：提升后插到某锚点 before/after（pinned 段内约束与末尾逻辑一致） */
export async function promotePaneTabToMainBarNear(
  workspace: ReturnType<typeof useWorkspace>,
  fromId: string,
  anchorTabId: string,
  mode: 'before' | 'after'
): Promise<void> {
  dndLog('promote', 'pane-to-main-bar-near', { fromId, anchorTabId, mode })
  if (getEditorChromeLayoutSync() === 'workspace') {
    const root = workspace.workspaceLayoutRoot.value
    if (collectTabIdsInLayout(root).has(fromId)) {
      workspace.promoteTabFromLayoutToTop(fromId)
    }
  }
  const tabs = workspace.tabs
  const fromIndex = tabs.findIndex((t) => t.id === fromId)
  if (fromIndex === -1) return
  const [tab] = tabs.splice(fromIndex, 1)

  const resolvedAnchor = resolveWorkbenchSyntheticAnchorTabId(workspace, anchorTabId)
  let insertAt = tabs.findIndex((t) => t.id === resolvedAnchor)
  if (insertAt < 0) {
    if (tab.pinned) {
      let lastPinned = -1
      for (let i = 0; i < tabs.length; i++) {
        if (tabs[i].pinned) lastPinned = i
      }
      tabs.splice(lastPinned + 1, 0, tab)
    } else {
      tabs.push(tab)
    }
    workspace.refreshDocumentLayout()
    workspace.activateTab(fromId)
    await notifyTabDragSessionConsumed(workspace)
    return
  }
  if (mode === 'after') insertAt += 1
  insertAt = Math.max(0, Math.min(insertAt, tabs.length))

  if (tab.pinned) {
    let firstNonPinned = tabs.length
    for (let i = 0; i < tabs.length; i++) {
      if (!tabs[i].pinned) {
        firstNonPinned = i
        break
      }
    }
    insertAt = Math.min(insertAt, firstNonPinned)
    let lastPinned = -1
    for (let i = 0; i < tabs.length; i++) {
      if (tabs[i].pinned) lastPinned = i
    }
    insertAt = Math.max(0, Math.min(insertAt, lastPinned + 1))
  } else {
    let firstNonPinned = 0
    for (let i = 0; i < tabs.length; i++) {
      if (!tabs[i].pinned) {
        firstNonPinned = i
        break
      }
    }
    insertAt = Math.max(firstNonPinned, insertAt)
  }

  tabs.splice(insertAt, 0, tab)
  workspace.refreshDocumentLayout()
  workspace.activateTab(fromId)
  await notifyTabDragSessionConsumed(workspace)
}

/** 窗格 Tab→主栏：有 hint 按位插入，否则末尾（pinned / 非 pinned 段尾） */
export async function promotePaneTabToMainBarWithInsertHint(
  workspace: ReturnType<typeof useWorkspace>,
  fromId: string,
  hint: MainTabsStripInsertHint | null
): Promise<void> {
  if (!hint) {
    await promotePaneTabToMainBarEnd(workspace, fromId)
    return
  }
  const resolved = resolveWorkbenchSyntheticAnchorTabId(workspace, hint.tabBarAnchorTabId)
  if (!workspace.tabs.some((t) => t.id === resolved)) {
    await promotePaneTabToMainBarEnd(workspace, fromId)
    return
  }
  await promotePaneTabToMainBarNear(
    workspace,
    fromId,
    hint.tabBarAnchorTabId,
    hint.tabBarInsertMode
  )
}

/** 窗格条 Tab → 顶栏末尾：提升出分屏树后插到 pinned 段尾或非 pinned 段尾 */
export async function promotePaneTabToMainBarEnd(
  workspace: ReturnType<typeof useWorkspace>,
  fromId: string
): Promise<void> {
  dndLog('promote', 'pane-to-main-bar-end', { fromId })
  if (getEditorChromeLayoutSync() === 'workspace') {
    const root = workspace.workspaceLayoutRoot.value
    if (collectTabIdsInLayout(root).has(fromId)) {
      workspace.promoteTabFromLayoutToTop(fromId)
    }
  }
  const tabs = workspace.tabs
  const fromIndex = tabs.findIndex((t) => t.id === fromId)
  if (fromIndex === -1) return
  const [tab] = tabs.splice(fromIndex, 1)
  if (tab.pinned) {
    let lastPinned = -1
    for (let i = 0; i < tabs.length; i++) {
      if (tabs[i].pinned) lastPinned = i
    }
    tabs.splice(lastPinned + 1, 0, tab)
  } else {
    tabs.push(tab)
  }
  workspace.refreshDocumentLayout()
  workspace.activateTab(fromId)
  await notifyTabDragSessionConsumed(workspace)
}

/** 工作区布局：回退用整 content-main 四向分屏（无 pane drop 根时） */
export type EditorContentDropZone = 'left' | 'right' | 'top' | 'bottom' | null

export function computeEditorContentDropZone(
  clientX: number,
  clientY: number,
  rect: DOMRect
): EditorContentDropZone {
  if (rect.width <= 0 || rect.height <= 0) return null
  const x = (clientX - rect.left) / rect.width
  const y = (clientY - rect.top) / rect.height
  if (x < 0 || x > 1 || y < 0 || y > 1) return null
  const dt = y
  const db = 1 - y
  const dl = x
  const dr = 1 - x
  if (dt <= db && dt <= dl && dt <= dr) return 'top'
  if (db <= dl && db <= dr) return 'bottom'
  if (dl <= dr) return 'left'
  return 'right'
}

/** @deprecated 使用 computeEditorContentDropZone */
export const computeEditorContentDropZoneHalf = computeEditorContentDropZone

/** 可进入工作区分屏树的 Tab（与 workspace.refreshDocumentLayout 过滤一致） */
function isEligibleForWorkspaceLayoutTreeTab(tab: WorkspaceTab | undefined): boolean {
  if (!tab || tab._isInitialPlaceholder) return false
  if (tab.kind === 'system' && tab.route === '/dummy') return false
  return true
}

function removeDragCursorOverlay() {
  if (dragCursorOverlay?.parentNode) {
    dragCursorOverlay.parentNode.removeChild(dragCursorOverlay)
  }
}

/**
 * 创建拖拽预览 Canvas
 * 同步创建，用于 setDragImage
 * 如果提供了缩略图，则显示缩略图 + 标题叠加层
 */
export function createDragPreviewCanvas(
  title: string,
  thumbnailImg?: HTMLImageElement | null
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')

  // 如果有缩略图，创建更大的预览画布
  const hasThumbnail = thumbnailImg && thumbnailImg.width > 0 && thumbnailImg.height > 0
  const width = hasThumbnail ? 240 : 200
  const height = hasThumbnail
    ? Math.round((thumbnailImg!.height / thumbnailImg!.width) * 240) + 30
    : 40

  canvas.width = width * window.devicePixelRatio
  canvas.height = height * window.devicePixelRatio
  canvas.style.cssText = `
    position: fixed;
    top: -9999px;
    left: -9999px;
    pointer-events: none;
  `

  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

    // 获取主题颜色
    const theme = themeState.currentTheme
    const isDark = theme.type === 'dark'
    const bgColor = theme.background || (isDark ? '#2a2a2a' : '#ffffff')
    const textColor = theme.textColor || (isDark ? '#ffffff' : '#333333')
    const borderColor = theme.borderColor || (isDark ? '#404040' : '#e0e0e0')

    if (hasThumbnail && thumbnailImg) {
      // 绘制缩略图作为主内容
      ctx.drawImage(thumbnailImg, 0, 0, width, height - 30)

      // 绘制顶部半透明标题栏
      const titleBarHeight = 30
      ctx.fillStyle = isDark ? 'rgba(42, 42, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)'
      ctx.fillRect(0, 0, width, titleBarHeight)

      // 绘制标题栏底部边框
      ctx.strokeStyle = borderColor
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, titleBarHeight - 0.5)
      ctx.lineTo(width, titleBarHeight - 0.5)
      ctx.stroke()

      // 绘制标题文字
      ctx.fillStyle = textColor
      ctx.font = '13px system-ui, -apple-system, sans-serif'
      ctx.textBaseline = 'middle'

      const maxTextWidth = width - 20
      let displayTitle = title || '未命名'
      const ellipsis = '...'
      let textWidth = ctx.measureText(displayTitle).width

      if (textWidth > maxTextWidth) {
        while (textWidth > maxTextWidth && displayTitle.length > 0) {
          displayTitle = displayTitle.slice(0, -1)
          textWidth = ctx.measureText(displayTitle + ellipsis).width
        }
        displayTitle += ellipsis
      }

      ctx.fillText(displayTitle, 10, titleBarHeight / 2)

      // 绘制外边框
      ctx.strokeStyle = borderColor
      ctx.lineWidth = 1
      ctx.strokeRect(0, 0, width, height)
    } else {
      // 原有逻辑：仅显示标题的简洁预览
      ctx.shadowColor = 'rgba(0, 0, 0, 0.2)'
      ctx.shadowBlur = 8
      ctx.shadowOffsetY = 2
      ctx.fillStyle = bgColor
      ctx.strokeStyle = borderColor
      ctx.lineWidth = 1

      const radius = 6
      ctx.beginPath()
      ctx.moveTo(radius, 0)
      ctx.lineTo(width - radius, 0)
      ctx.quadraticCurveTo(width, 0, width, radius)
      ctx.lineTo(width, height - radius)
      ctx.quadraticCurveTo(width, height, width - radius, height)
      ctx.lineTo(radius, height)
      ctx.quadraticCurveTo(0, height, 0, height - radius)
      ctx.lineTo(0, radius)
      ctx.quadraticCurveTo(0, 0, radius, 0)
      ctx.closePath()

      ctx.fill()
      ctx.stroke()

      // 关闭阴影，绘制文字
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0
      ctx.fillStyle = textColor
      ctx.font = '13px system-ui, -apple-system, sans-serif'
      ctx.textBaseline = 'middle'

      // 截断文字
      const maxWidth = width - 24
      let displayTitle = title || '未命名'
      const ellipsis = '...'
      let textWidth = ctx.measureText(displayTitle).width

      if (textWidth > maxWidth) {
        while (textWidth > maxWidth && displayTitle.length > 0) {
          displayTitle = displayTitle.slice(0, -1)
          textWidth = ctx.measureText(displayTitle + ellipsis).width
        }
        displayTitle += ellipsis
      }

      ctx.fillText(displayTitle, 12, height / 2)
    }
  }

  document.body.appendChild(canvas)
  return canvas
}

/**
 * 清理拖拽图像元素
 */
export const cleanupDragImage = () => {
  if (dragCanvasElement && dragCanvasElement.parentNode) {
    dragCanvasElement.parentNode.removeChild(dragCanvasElement)
    dragCanvasElement = null
  }
}

/**
 * 序列化 Tab 数据用于传输
 * 注意：此函数接收 tabId 而非 tab 对象，因为 MainTabs.vue 调用时传入的是 tab.id
 */
export const serializeTabData = (tabId: string): SerializedTabData | null => {
  const workspace = useWorkspace()
  const tab = workspace.tabs.find((t) => t.id === tabId)
  if (!tab) return null

  const baseData: SerializedTabData = {
    tab: {
      id: tab.id,
      kind: tab.kind,
      title: tab.title,
      subtitle: tab.subtitle,
      path: tab.path,
      format: tab.format,
      dirty: tab.dirty,
      readonly: tab.readonly,
      preview: tab.preview,
      toolType: tab.toolType,
      route: tab.route,
      workspacePlacement: tab.workspacePlacement
    },
    document: null,
    toolState: null,
    sourceWindowId: -1,
    sourceTabCount: workspace.tabs.length,
    canDragToOtherWindow: checkCanDragToOtherWindow(tab)
  }

  // 文件类型 Tab：序列化完整文档数据
  if (tab.kind === 'file' || tab.kind === 'new') {
    try {
      const doc = workspace.ensureDocument(tab.id)
      if (doc) {
        baseData.document = {
          markdown: doc.markdown,
          tex: doc.tex,
          outline: JSON.parse(JSON.stringify(doc.outline)),
          meta: JSON.parse(JSON.stringify(doc.meta)),
          aiDialogs: JSON.parse(JSON.stringify(doc.aiDialogs)),
          agentSessions: JSON.parse(JSON.stringify(doc.agentSessions)),
          lastView: doc.lastView,
          activeAgentSessionId: doc.activeAgentSessionId,
          renderedHtml: doc.renderedHtml,
          dirty: doc.dirty,
          savedMarkdown: doc.savedMarkdown,
          savedTex: doc.savedTex,
          savedOutline: JSON.parse(JSON.stringify(doc.savedOutline)),
          savedMeta: JSON.parse(JSON.stringify(doc.savedMeta)),
          savedAiDialogs: JSON.parse(JSON.stringify(doc.savedAiDialogs)),
          savedAgentSessions: JSON.parse(JSON.stringify(doc.savedAgentSessions)),
          path: doc.path,
          format: doc.format
        }
      }
    } catch (error) {
      getLogger().warn('序列化文档数据失败:', error)
    }
  }

  // 工具类型 Tab：保存当前选中的会话/对话索引
  if (tab.kind === 'tool') {
    const toolState = workspace.getTabToolState?.(tab.id)
    if (toolState) {
      baseData.toolState = { ...toolState }
    }
  }

  return baseData
}

/**
 * 检查 Tab 是否可以拖拽到其他窗口
 * 在此项目中，所有 Tab 类型都可以拖拽到其他窗口
 */
export const checkCanDragToOtherWindow = (_tab: WorkspaceTab): boolean => {
  // 所有 Tab 类型都可以拖拽到其他窗口（包括工具 Tab 和系统 Tab）
  return true
}

function samePinnedGroup(
  dragTab: WorkspaceTab | undefined,
  targetTab: WorkspaceTab | undefined
): boolean {
  if (!dragTab || !targetTab) return false
  return dragTab.pinned === targetTab.pinned
}

/**
 * dragend 时若 drop 未触发，根据 dropPreview 补一次重排/分屏（MainTabs 与分屏条共用）
 * 成功变更布局后会通知主进程 drag:drop 以消费会话，避免 drag:end 误判。
 */
export async function consumeTabDropPreviewIfNeeded(
  workspace: ReturnType<typeof useWorkspace>,
  preview: TabDropPreview,
  fromId: string | null
): Promise<void> {
  if (!fromId || !preview.targetId || fromId === preview.targetId) return

  if (
    preview.targetId === MAIN_TABS_PANE_APPEND_SENTINEL &&
    tabDragSourceSurface.value === 'pane' &&
    preview.mode &&
    !preview.splitEdge
  ) {
    const hint = lastPaneToMainStripInsertHint
    lastPaneToMainStripInsertHint = null
    await promotePaneTabToMainBarWithInsertHint(workspace, fromId, hint)
    return
  }

  // 工作区：从窗格条拖到顶栏「独立大 Tab」一侧 → 提升为 top，从分屏树移除
  if (
    getEditorChromeLayoutSync() === 'workspace' &&
    tabDragSourceSurface.value === 'pane' &&
    !preview.splitEdge &&
    preview.mode &&
    preview.targetId === WORKBENCH_SYNTHETIC_ID
  ) {
    const root = workspace.workspaceLayoutRoot.value
    const inLayout = collectTabIdsInLayout(root)
    if (inLayout.has(fromId)) {
      workspace.promoteTabFromLayoutToTop(fromId)
      workspace.activateTab(fromId)
      await notifyTabDragSessionConsumed(workspace)
      return
    }
  }

  if (
    getEditorChromeLayoutSync() === 'workspace' &&
    tabDragSourceSurface.value === 'pane' &&
    !preview.splitEdge &&
    preview.mode
  ) {
    const root = workspace.workspaceLayoutRoot.value
    const inLayout = collectTabIdsInLayout(root)
    if (inLayout.has(fromId) && !inLayout.has(preview.targetId)) {
      const fromTab = workspace.tabs.find((x) => x.id === fromId)
      const toTab = workspace.tabs.find((x) => x.id === preview.targetId)
      if (
        fromTab &&
        toTab &&
        isEligibleForWorkspaceLayoutTreeTab(fromTab) &&
        samePinnedGroup(fromTab, toTab)
      ) {
        workspace.promoteTabFromLayoutToTop(fromId)
        const mode = preview.mode
        const toId = preview.targetId
        const fromIndex = workspace.tabs.findIndex((t) => t.id === fromId)
        const toIndex = workspace.tabs.findIndex((t) => t.id === toId)
        if (fromIndex !== -1 && toIndex !== -1) {
          let insertIndex = toIndex
          if (mode === 'after') {
            insertIndex = toIndex + 1
          }
          if (fromIndex < insertIndex) {
            insertIndex -= 1
          }
          insertIndex = Math.max(0, Math.min(insertIndex, workspace.tabs.length))
          if (fromIndex !== insertIndex) {
            const [tab] = workspace.tabs.splice(fromIndex, 1)
            workspace.tabs.splice(insertIndex, 0, tab)
          }
          workspace.refreshDocumentLayout()
        }
        workspace.activateTab(fromId)
        await notifyTabDragSessionConsumed(workspace)
        return
      }
    }
  }

  if (preview.splitEdge) {
    const fromTab = workspace.tabs.find((t) => t.id === fromId)
    const toTab = workspace.tabs.find((t) => t.id === preview.targetId)
    const fromOk = isEligibleForWorkspaceLayoutTreeTab(fromTab)
    const toOk = isEligibleForWorkspaceLayoutTreeTab(toTab)
    if (fromOk && toOk && samePinnedGroup(fromTab, toTab)) {
      workspace.applyWorkspaceSplitFromDrag(fromId, preview.targetId, preview.splitEdge)
      workspace.activateTab(fromId)
      await notifyTabDragSessionConsumed(workspace)
    }
    return
  }
  if (!preview.mode) return

  const mode = preview.mode
  const toId = preview.targetId

  if (getEditorChromeLayoutSync() === 'workspace') {
    const root = workspace.workspaceLayoutRoot.value
    if (collectTabIdsInLayout(root).has(toId)) {
      const fromTab = workspace.tabs.find((t) => t.id === fromId)
      const toTab = workspace.tabs.find((t) => t.id === toId)
      if (
        isEligibleForWorkspaceLayoutTreeTab(fromTab) &&
        isEligibleForWorkspaceLayoutTreeTab(toTab) &&
        samePinnedGroup(fromTab, toTab) &&
        workspace.applyWorkspacePaneTabBarDrop(fromId, toId, mode)
      ) {
        workspace.activateTab(fromId)
        await notifyTabDragSessionConsumed(workspace)
      }
      return
    }
  }

  const fromIndex = workspace.tabs.findIndex((t) => t.id === fromId)
  const toIndex = workspace.tabs.findIndex((t) => t.id === toId)
  if (fromIndex === -1 || toIndex === -1) return

  let insertIndex = toIndex
  if (mode === 'after') {
    insertIndex = toIndex + 1
  }
  if (fromIndex < insertIndex) {
    insertIndex -= 1
  }
  insertIndex = Math.max(0, Math.min(insertIndex, workspace.tabs.length))
  if (fromIndex === insertIndex) return

  const dragTab = workspace.tabs[fromIndex]
  const targetTab = workspace.tabs[toIndex]
  if (!samePinnedGroup(dragTab, targetTab)) return

  const [tab] = workspace.tabs.splice(fromIndex, 1)
  workspace.tabs.splice(insertIndex, 0, tab)
  workspace.refreshDocumentLayout()
  await notifyTabDragSessionConsumed(workspace)
}

async function runEditorContentSplitDropFromContext(
  workspace: ReturnType<typeof useWorkspace>,
  fromId: string,
  ctx: EditorPaneDropContext
): Promise<boolean> {
  const fromTab = workspace.tabs.find((t) => t.id === fromId)
  if (!isEligibleForWorkspaceLayoutTreeTab(fromTab)) return false

  promoteClassicToWorkspaceLayoutIfNeeded()

  if (ctx.zone === 'full') {
    let gid = ctx.layoutGroupId
    if (!gid && ctx.targetTabId) {
      gid = findGroupContainingTab(workspace.workspaceLayoutRoot.value, ctx.targetTabId)?.id ?? null
    }
    if (!gid) return false
    const ok = workspace.applyMoveTabToLayoutGroup(fromId, gid, null)
    if (ok) workspace.activateTab(fromId)
    if (currentSessionId && messageBridge.getIpc()) {
      try {
        const currentWindowId = await getCurrentWindowId()
        const insertIndex = workspace.tabs.findIndex((t) => t.id === fromId)
        await messageBridge.invoke('drag:drop', {
          sessionId: currentSessionId,
          targetWindowId: currentWindowId,
          insertIndex: Math.max(0, insertIndex)
        })
      } catch (error) {
        getLogger().warn('编辑区并入组 drag:drop 失败:', error)
      }
    }
    return ok
  }

  const targetId = ctx.targetTabId
  if (!targetId) return false

  const toTab = workspace.tabs.find((t) => t.id === targetId)
  if (!isEligibleForWorkspaceLayoutTreeTab(toTab) || !samePinnedGroup(fromTab, toTab)) {
    return false
  }

  const edge = ctx.zone as SplitEdge

  if (fromId === targetId) {
    const okSelf = workspace.applySelfDocumentSplitFromDrag(fromId, edge)
    if (okSelf && currentSessionId && messageBridge.getIpc()) {
      try {
        const currentWindowId = await getCurrentWindowId()
        const insertIndex = workspace.tabs.findIndex((t) => t.id === fromId)
        await messageBridge.invoke('drag:drop', {
          sessionId: currentSessionId,
          targetWindowId: currentWindowId,
          insertIndex: Math.max(0, insertIndex)
        })
      } catch (error) {
        getLogger().warn('编辑区分屏 drag:drop 失败:', error)
      }
    }
    return okSelf
  }

  const ok = workspace.applyWorkspaceSplitFromDrag(fromId, targetId, edge)
  if (ok) {
    workspace.activateTab(fromId)
  }

  if (currentSessionId && messageBridge.getIpc()) {
    try {
      const currentWindowId = await getCurrentWindowId()
      const insertIndex = workspace.tabs.findIndex((t) => t.id === fromId)
      await messageBridge.invoke('drag:drop', {
        sessionId: currentSessionId,
        targetWindowId: currentWindowId,
        insertIndex: Math.max(0, insertIndex)
      })
    } catch (error) {
      getLogger().warn('编辑区分屏 drag:drop 失败:', error)
    }
  }

  return ok
}

/**
 * dragend 时补全：指针停在编辑区且已显示分屏区、但未触发原生 drop 时仍应用分屏
 */
export async function consumeEditorContentDropIfNeeded(
  workspace: ReturnType<typeof useWorkspace>
): Promise<void> {
  const ctx = sharedEditorPaneDropContext.value
  const fromId = sharedDraggingId.value
  if (!ctx || !fromId) {
    sharedEditorPaneDropContext.value = null
    return
  }

  sharedEditorPaneDropContext.value = null
  await runEditorContentSplitDropFromContext(workspace, fromId, ctx)
}

/**
 * Tab 拖拽核心逻辑
 */
export const useTabDrag = (options: UseTabDragOptions = {}) => {
  ensureEditorDropZoneDragEndCleanup()
  const workspace = useWorkspace()
  const { isFocusMode } = useFocusMode()

  const { onDragStart, onDragEnd, onDrop } = options

  const isDragging = sharedIsDragging
  const draggingId = sharedDraggingId
  const draggingTab = sharedDraggingTab
  const dropPreview = sharedDropPreview

  /**
   * 处理拖拽开始
   * 注意：此函数的前半部分必须是同步的，以确保 setDragImage 能正确工作
   */
  const handleDragStart = (tab: WorkspaceTab, event: DragEvent) => {
    if (!tab || !event.dataTransfer) {
      event.preventDefault()
      return
    }

    // 立即设置拖拽状态（同步）
    isDragging.value = true
    draggingId.value = tab.id
    draggingTab.value = tab
    pendingHadValidDropHighlight = undefined
    sharedEditorPaneDropContext.value = null
    if (tabDragSourceSurface.value === null) {
      tabDragSourceSurface.value = 'main'
    }

    dragGeneration++
    const dragInitGeneration = dragGeneration

    // 同步创建 Canvas 拖拽预览（使用预缓存的缩略图）
    cleanupDragImage()
    dragCanvasElement = createDragPreviewCanvas(
      tab.title || tab.subtitle || '未命名',
      cachedThumbnailImg
    )
    event.dataTransfer.setDragImage(dragCanvasElement, 100, 20)

    // 设置 DataTransfer 数据（同步）— 使用自定义 MIME 类型避免 OS 级转发
    event.dataTransfer.setData(TAB_DRAG_MIME_TYPE, tab.id)
    event.dataTransfer.effectAllowed = 'move'

    // 全屏透明层：从拖拽第一帧就强制 cursor: move，避免先出现禁止再被 dragover 改回
    removeDragCursorOverlay()
    dragCursorOverlay = document.createElement('div')
    dragCursorOverlay.setAttribute('aria-hidden', 'true')
    dragCursorOverlay.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;cursor:move;pointer-events:none;'
    document.body.appendChild(dragCursorOverlay)

    // 异步部分：初始化拖拽会话
    const initSession = async () => {
      if (!messageBridge.getIpc()) return

      try {
        if (dragInitGeneration !== dragGeneration) return

        // 序列化 Tab 数据
        const tabData = serializeTabData(tab.id)
        if (!tabData) return

        if (dragInitGeneration !== dragGeneration) return

        // 获取当前窗口 ID
        const sourceWindowId = await getCurrentWindowId()
        tabData.sourceWindowId = sourceWindowId
        tabData.sourceFocusMode = isFocusMode.value

        if (dragInitGeneration !== dragGeneration) return

        // 调用主进程创建拖拽会话
        const result = await messageBridge.invoke('drag:start', {
          tabId: tab.id,
          tabData
        })

        if (dragInitGeneration !== dragGeneration) return

        if (result?.sessionId) {
          currentSessionId = result.sessionId
        }

        getLogger().debug('拖拽会话开始:', currentSessionId)
      } catch (error) {
        getLogger().error('初始化拖拽会话失败:', error)
      }
    }

    // 启动会话初始化（不阻塞）
    initSession()

    // 添加 ESC 键监听
    escapeKeyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && currentSessionId) {
        messageBridge.send('drag:cancel', { sessionId: currentSessionId })
        if (globalDragOverHandler) {
          document.removeEventListener('dragover', globalDragOverHandler, true)
          globalDragOverHandler = null
        }
        if (globalEditorSplitDropHandler) {
          document.removeEventListener('drop', globalEditorSplitDropHandler, true)
          globalEditorSplitDropHandler = null
        }
        removeDragCursorOverlay()
        dragCursorOverlay = null
        dragGeneration++
        resetDragState()
        cleanupDragImage()
      }
    }
    document.addEventListener('keydown', escapeKeyHandler)

    // 全局 dragover：Tab 拖入分屏区高亮；资源树文件拖入时同样高亮（capture，穿透 Monaco）
    globalDragOverHandler = (e: DragEvent) => {
      const types = e.dataTransfer?.types
      const isPathDrag = isWorkspacePathLikeDragTypes(types) || treePathDragSessionActive
      const isTabDrag = types?.includes(TAB_DRAG_MIME_TYPE) ?? false
      if (!isPathDrag && !isTabDrag) return

      if (isPathDrag) {
        paintPathDragEditorZone(e)
        return
      }

      e.preventDefault()
      e.dataTransfer!.dropEffect = 'move'

      if (!isDragging.value || !draggingTab.value) return

      const { clientX, clientY } = e

      // Pane 小 Tab → 顶栏末尾：子项间/尾部 sash(drag) 上 dragover 可能不稳定，用 .tabs-list 矩形兜底；
      // dropPreview 在离开编辑区后被清空 → drag:end 误传 hadValidDropHighlight:false → 主进程分离新窗口。
      if (tabDragSourceSurface.value === 'pane' && types?.includes(TAB_DRAG_MIME_TYPE)) {
        if (isPointOverMainTabsStrip(clientX, clientY)) {
          dropPreview.value = {
            targetId: MAIN_TABS_PANE_APPEND_SENTINEL,
            mode: 'after',
            splitEdge: null
          }
          sharedEditorPaneDropContext.value = null
          const ins = computeMainBarPathInsertFromClientXY(clientX, clientY)
          lastPaneToMainStripInsertHint = ins
          eventBus.emit('main-tabs-external-drop-ui-highlight', true)
          eventBus.emit('main-tabs-path-bar-insert-hint', ins)
          return
        }
        lastPaneToMainStripInsertHint = null
        eventBus.emit('main-tabs-path-bar-insert-hint', null)
        eventBus.emit('main-tabs-external-drop-ui-highlight', false)
      }

      const t = draggingTab.value
      /** 与 WorkspacePaneGroup.showPaneTabStrip 一致：专注模式仅「无分屏」时隐藏窗格条，也不做编辑区分栏高亮；有分屏时 Tab 拖入应同资源树 path 一样可投到子 view */
      const focusModeBlocksEditorPaneTabOverlay =
        isFocusMode.value && !isLayoutSplit(workspace.workspaceLayoutRoot.value)
      if (!isEligibleForWorkspaceLayoutTreeTab(t) || focusModeBlocksEditorPaneTabOverlay) {
        sharedEditorPaneDropContext.value = null
        return
      }
      if (isPointOverEditorChromeTabSurface(clientX, clientY)) {
        sharedEditorPaneDropContext.value = null
        return
      }
      const contentMain = queryPrimaryContentMain()
      if (!contentMain) {
        sharedEditorPaneDropContext.value = null
        return
      }
      const rect = contentMain.getBoundingClientRect()
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        sharedEditorPaneDropContext.value = null
        if (
          tabDragSourceSurface.value === 'pane' &&
          dropPreview.value.targetId === MAIN_TABS_PANE_APPEND_SENTINEL
        ) {
          const stillOverMainTabs = isPointOverMainTabsStrip(clientX, clientY)
          if (!stillOverMainTabs) {
            dropPreview.value = { targetId: null, mode: null, splitEdge: null }
            lastPaneToMainStripInsertHint = null
            eventBus.emit('main-tabs-external-drop-ui-highlight', false)
            eventBus.emit('main-tabs-path-bar-insert-hint', null)
          }
        }
        return
      }
      dropPreview.value = { targetId: null, mode: null, splitEdge: null }
      lastPaneToMainStripInsertHint = null
      eventBus.emit('main-tabs-external-drop-ui-highlight', false)
      eventBus.emit('main-tabs-path-bar-insert-hint', null)
      updateEditorPaneDropFromPointer(workspace, clientX, clientY)
    }
    document.addEventListener('dragover', globalDragOverHandler, true)

    globalEditorSplitDropHandler = async (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes(TAB_DRAG_MIME_TYPE)) return
      if (!isDragging.value) return
      if (isFocusMode.value && !isLayoutSplit(workspace.workspaceLayoutRoot.value)) return
      const dragTab = draggingTab.value
      if (!isEligibleForWorkspaceLayoutTreeTab(dragTab ?? undefined)) return
      if (isPointOverEditorChromeTabSurface(e.clientX, e.clientY)) return

      const ctx = sharedEditorPaneDropContext.value
      if (!ctx) return

      e.preventDefault()
      e.stopImmediatePropagation()

      const fromId = e.dataTransfer?.getData(TAB_DRAG_MIME_TYPE) || draggingId.value
      if (!fromId) return

      const ok = await runEditorContentSplitDropFromContext(workspace, fromId, ctx)
      if (ok) {
        dragGeneration++
        resetDragState()
        dndLog('drop', 'editor-capture', { fromId, zone: ctx.zone })
      } else {
        sharedEditorPaneDropContext.value = null
      }
    }
    document.addEventListener('drop', globalEditorSplitDropHandler, true)

    // 调用回调
    onDragStart?.(tab, event)

    dndLog('dragstart', 'tab', {
      tabId: tab.id,
      surface: tabDragSourceSurface.value,
      title: tab.title || tab.subtitle || ''
    })
    getLogger().debug('拖拽开始:', tab.id)
  }

  /**
   * 计算投放模式（before/after）
   */
  const computeDropMode = (event: DragEvent, element: HTMLElement): 'before' | 'after' => {
    const rect = element.getBoundingClientRect()
    const x = event.clientX - rect.left
    const midPoint = rect.width / 2
    return x < midPoint ? 'before' : 'after'
  }

  /**
   * 文档 Tab 互相拖拽：边沿分屏，中间区域为顺序 before/after
   */
  const computeDocumentTabDropZone = (
    event: DragEvent,
    element: HTMLElement
  ): { splitEdge: SplitEdge } | { reorder: 'before' | 'after' } => {
    const rect = element.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const w = rect.width
    const h = rect.height
    const px = x / Math.max(w, 1)
    const py = y / Math.max(h, 1)
    const margin = 0.22
    if (px < margin) return { splitEdge: 'left' }
    if (px > 1 - margin) return { splitEdge: 'right' }
    if (py < 0.35) return { splitEdge: 'top' }
    if (py > 0.65) return { splitEdge: 'bottom' }
    return { reorder: x < w / 2 ? 'before' : 'after' }
  }

  /**
   * 查找 Tab 项元素
   */
  const findTabItemElement = (labelElement: HTMLElement): HTMLElement | null => {
    let current: HTMLElement | null = labelElement
    while (current) {
      if (current.classList.contains('tab-item') || current.classList.contains('pane-tab-item')) {
        return current
      }
      current = current.parentElement
    }
    return null
  }

  /**
   * 处理拖拽经过
   * 检查是否包含 Tab 拖拽数据（使用自定义 MIME 类型）
   */
  const handleDragOver = (targetTab: WorkspaceTab, event: DragEvent) => {
    // 检查是否是我们的 Tab 拖拽（使用自定义 MIME 类型）
    if (!event.dataTransfer?.types.includes(TAB_DRAG_MIME_TYPE)) return

    sharedEditorPaneDropContext.value = null

    if (!isDragging.value || !draggingId.value) return
    if (draggingId.value === targetTab.id) {
      dropPreview.value = { targetId: null, mode: null, splitEdge: null }
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'

    const labelEl = event.currentTarget as HTMLElement
    const tabItemEl = findTabItemElement(labelEl)
    if (!tabItemEl) return

    const fromTab = workspace.tabs.find((t) => t.id === draggingId.value)
    const fromOk = isEligibleForWorkspaceLayoutTreeTab(fromTab)
    const toOk = isEligibleForWorkspaceLayoutTreeTab(targetTab)

    const onPaneStrip = !!tabItemEl.closest('.pane-tab-strip')
    /** 顶栏 / 专注模式文档列表：只调顺序，勿用「边沿分屏」几何（否则会误进工作台分屏树） */
    const onMainBarReorderSurface =
      !!tabItemEl.closest('.main-tabs-wrapper .tabs-list') ||
      !!tabItemEl.closest('.focus-doc-picker-panel')

    if (fromOk && toOk) {
      if (onPaneStrip || onMainBarReorderSurface) {
        const mode = computeDropMode(event, tabItemEl)
        dropPreview.value = { targetId: targetTab.id, mode, splitEdge: null }
      } else {
        const zone = computeDocumentTabDropZone(event, tabItemEl)
        if ('splitEdge' in zone) {
          dropPreview.value = {
            targetId: targetTab.id,
            mode: null,
            splitEdge: zone.splitEdge
          }
        } else {
          dropPreview.value = {
            targetId: targetTab.id,
            mode: zone.reorder,
            splitEdge: null
          }
        }
      }
    } else {
      const mode = computeDropMode(event, tabItemEl)
      dropPreview.value = { targetId: targetTab.id, mode, splitEdge: null }
    }
  }

  /**
   * 处理拖拽离开
   */
  const handleDragLeave = () => {
    // 不立即清除，避免快速移动时闪烁
  }

  /**
   * 处理投放
   * 同窗口内：直接重排序，无需 IPC
   * 跨窗口：通知主进程处理
   * 使用自定义 MIME 类型读取 Tab ID
   */
  const handleDrop = async (
    targetTab: WorkspaceTab,
    event: DragEvent,
    logicalTargetId?: string | null
  ) => {
    event.preventDefault()
    event.stopPropagation()

    // 从自定义 MIME 类型读取 Tab ID
    const fromId = event.dataTransfer?.getData(TAB_DRAG_MIME_TYPE) || draggingId.value
    if (
      fromId &&
      dropPreview.value.targetId === MAIN_TABS_PANE_APPEND_SENTINEL &&
      tabDragSourceSurface.value === 'pane'
    ) {
      const labelEl = event.currentTarget as HTMLElement
      const tabItemEl = findTabItemElement(labelEl)
      const onMainTabsList = !!tabItemEl?.closest('.main-tabs-wrapper .tabs-list')
      if (onMainTabsList && tabItemEl) {
        const mode = computeDropMode(event, tabItemEl)
        lastPaneToMainStripInsertHint = null
        await promotePaneTabToMainBarNear(workspace, fromId, targetTab.id, mode)
      } else {
        const hint = lastPaneToMainStripInsertHint
        lastPaneToMainStripInsertHint = null
        await promotePaneTabToMainBarWithInsertHint(workspace, fromId, hint)
      }
      await onDrop?.(fromId, targetTab.id, 'after')
      dragGeneration++
      resetDragState()
      getLogger().debug('投放完成 pane→顶栏:', { fromId })
      return
    }

    const toId = targetTab.id
    const labelEl = event.currentTarget as HTMLElement
    const tabItemEl = findTabItemElement(labelEl)
    const onPaneStrip = !!tabItemEl?.closest('.pane-tab-strip')

    let mode = dropPreview.value.mode
    let splitEdge = dropPreview.value.splitEdge
    if (onPaneStrip && splitEdge && tabItemEl) {
      splitEdge = null
      mode = computeDropMode(event, tabItemEl)
    }

    const logicalId = logicalTargetId ?? targetTab.id

    if (
      fromId &&
      logicalId === WORKBENCH_SYNTHETIC_ID &&
      tabDragSourceSurface.value === 'pane' &&
      getEditorChromeLayoutSync() === 'workspace'
    ) {
      const root = workspace.workspaceLayoutRoot.value
      if (collectTabIdsInLayout(root).has(fromId)) {
        workspace.promoteTabFromLayoutToTop(fromId)
        workspace.activateTab(fromId)
        if (currentSessionId && messageBridge.getIpc()) {
          try {
            const currentWindowId = await getCurrentWindowId()
            const insertIndex = workspace.tabs.findIndex((t) => t.id === fromId)
            await messageBridge.invoke('drag:drop', {
              sessionId: currentSessionId,
              targetWindowId: currentWindowId,
              insertIndex: Math.max(0, insertIndex)
            })
          } catch (error) {
            getLogger().warn('通知主进程 drop 失败:', error)
          }
        }
        await onDrop?.(fromId, toId, mode ?? 'after')
        dragGeneration++
        resetDragState()
        getLogger().debug('投放完成 workbench→top:', { fromId })
        return
      }
    }

    if (!fromId || fromId === toId) {
      dragGeneration++
      resetDragState()
      return
    }

    const fromTab = workspace.tabs.find((t) => t.id === fromId)
    const toTab = workspace.tabs.find((t) => t.id === toId)
    const fromOk = isEligibleForWorkspaceLayoutTreeTab(fromTab)
    const toOk = isEligibleForWorkspaceLayoutTreeTab(toTab)

    if (splitEdge && fromOk && toOk) {
      const ok = workspace.applyWorkspaceSplitFromDrag(fromId, toId, splitEdge)
      if (ok) {
        workspace.activateTab(fromId)
      }
      if (currentSessionId && messageBridge.getIpc()) {
        try {
          const currentWindowId = await getCurrentWindowId()
          const insertIndex = workspace.tabs.findIndex((t) => t.id === fromId)
          await messageBridge.invoke('drag:drop', {
            sessionId: currentSessionId,
            targetWindowId: currentWindowId,
            insertIndex: Math.max(0, insertIndex)
          })
        } catch (error) {
          getLogger().warn('通知主进程 drop 失败:', error)
        }
      }
      await onDrop?.(fromId, toId, 'after')
      dragGeneration++
      resetDragState()
      getLogger().debug('投放完成 split:', { fromId, toId, splitEdge })
      return
    }

    if (!mode) {
      dragGeneration++
      resetDragState()
      return
    }

    if (getEditorChromeLayoutSync() === 'workspace') {
      const root = workspace.workspaceLayoutRoot.value
      if (collectTabIdsInLayout(root).has(toId)) {
        if (
          samePinnedGroup(fromTab, toTab) &&
          workspace.applyWorkspacePaneTabBarDrop(fromId, toId, mode)
        ) {
          workspace.activateTab(fromId)
        }
        if (currentSessionId && messageBridge.getIpc()) {
          try {
            const currentWindowId = await getCurrentWindowId()
            const insertIndex = workspace.tabs.findIndex((t) => t.id === fromId)
            await messageBridge.invoke('drag:drop', {
              sessionId: currentSessionId,
              targetWindowId: currentWindowId,
              insertIndex: Math.max(0, insertIndex)
            })
          } catch (error) {
            getLogger().warn('通知主进程 drop 失败:', error)
          }
        }
        await onDrop?.(fromId, toId, mode)
        dragGeneration++
        resetDragState()
        getLogger().debug('投放完成 pane bar:', { fromId, toId, mode })
        return
      }
    }

    // 工作区：分屏树内 Tab 拖到顶栏「独立」Tab → 先提升 placement 再参与顶栏顺序
    if (getEditorChromeLayoutSync() === 'workspace' && mode && samePinnedGroup(fromTab, toTab)) {
      const root = workspace.workspaceLayoutRoot.value
      const inL = collectTabIdsInLayout(root)
      if (inL.has(fromId) && !inL.has(toId)) {
        workspace.promoteTabFromLayoutToTop(fromId)
      }
    }

    // 同窗口内重排序（无需 IPC）：顶栏 Tab 顺序
    const fromIndex = workspace.tabs.findIndex((t) => t.id === fromId)
    const toIndex = workspace.tabs.findIndex((t) => t.id === toId)

    if (fromIndex === -1 || toIndex === -1) {
      dragGeneration++
      resetDragState()
      return
    }

    let insertIndex = toIndex
    if (mode === 'after') {
      insertIndex = toIndex + 1
    }
    if (fromIndex < insertIndex) {
      insertIndex -= 1
    }
    insertIndex = Math.max(0, Math.min(insertIndex, workspace.tabs.length))

    if (fromIndex !== insertIndex) {
      const [tab] = workspace.tabs.splice(fromIndex, 1)
      workspace.tabs.splice(insertIndex, 0, tab)
    }

    workspace.refreshDocumentLayout()

    // 通知主进程此拖拽已被消费（同窗口内）
    if (currentSessionId && messageBridge.getIpc()) {
      try {
        const currentWindowId = await getCurrentWindowId()
        await messageBridge.invoke('drag:drop', {
          sessionId: currentSessionId,
          targetWindowId: currentWindowId,
          insertIndex
        })
      } catch (error) {
        getLogger().warn('通知主进程 drop 失败:', error)
      }
    }

    await onDrop?.(fromId, toId, mode)
    dragGeneration++
    resetDragState()

    getLogger().debug('投放完成:', { fromId, toId, mode })
  }

  /**
   * 处理拖拽结束
   * 通知主进程，由主进程决定是否需要分离到新窗口
   * 包含 Tab 栏边界信息用于内部窗口分离判断
   */
  const handleDragEnd = async (event: DragEvent) => {
    const tab = draggingTab.value

    // 在清理前固定本次拖拽的会话与 Tab（须先于 dragGeneration++，避免异步 initSession 与本次混淆）
    const sessionIdForEnd = currentSessionId
    const draggedTabIdForEnd = tab?.id ?? draggingId.value

    // 使尚未完成的 initSession 无法再写入 currentSessionId
    dragGeneration++

    // 移除 ESC 键监听
    if (escapeKeyHandler) {
      document.removeEventListener('keydown', escapeKeyHandler)
      escapeKeyHandler = null
    }
    // 移除全局 dragover / 编辑区 drop 监听
    if (globalDragOverHandler) {
      document.removeEventListener('dragover', globalDragOverHandler, true)
      globalDragOverHandler = null
    }
    if (globalEditorSplitDropHandler) {
      document.removeEventListener('drop', globalEditorSplitDropHandler, true)
      globalEditorSplitDropHandler = null
    }
    removeDragCursorOverlay()
    dragCursorOverlay = null

    // 计算 Tab 栏边界（屏幕坐标）
    let tabBarBounds: { x: number; y: number; width: number; height: number } | undefined
    if (tabBarElement) {
      const rect = tabBarElement.getBoundingClientRect()
      tabBarBounds = {
        x: rect.left + window.screenX,
        y: rect.top + window.screenY,
        width: rect.width,
        height: rect.height
      }
    }

    const highlightForDragEnd = pendingHadValidDropHighlight
    pendingHadValidDropHighlight = undefined

    dndLog('dragend', 'tab', {
      tabId: draggedTabIdForEnd,
      sessionId: sessionIdForEnd ?? '',
      hadValidDropHighlightSent: highlightForDragEnd,
      surface: tabDragSourceSurface.value
    })

    // 通知主进程拖拽结束（携带真实拖拽的 tabId，主进程可纠正错误的 sessionId）
    if (messageBridge.getIpc() && (sessionIdForEnd || draggedTabIdForEnd)) {
      try {
        const result = await messageBridge.invoke('drag:end', {
          sessionId: sessionIdForEnd ?? '',
          draggedTabId: draggedTabIdForEnd,
          tabBarBounds,
          /** 按住 Shift 释放：仍在当前窗口内也可分离到新窗口（多 Tab 时） */
          forceDetach: event.shiftKey === true,
          ...(highlightForDragEnd !== undefined
            ? { hadValidDropHighlight: highlightForDragEnd }
            : {})
        })

        dndLog('dragend-ipc', 'tab', {
          tabId: draggedTabIdForEnd,
          action: result?.action,
          reason: result?.reason
        })

        if (result?.action === 'detach') {
          getLogger().info('Tab 已分离到新窗口:', result.newWindowId)
        }
      } catch (error) {
        getLogger().error('通知主进程拖拽结束失败:', error)
      }
    }

    // 调用回调
    if (tab) {
      await onDragEnd?.(tab, event)
    }

    resetDragState()
    cleanupDragImage()
    clearCachedThumbnail()

    // 窗格 Tab 的 dragend 在 WorkspacePaneGroup，不会走 MainTabs.handleDragEnd → clearMainTabsExternalDropUi；
    // 专注模式下顶栏整片高亮依赖 mainTabsExternalDropHighlight / pathBarInsertHint，须在会话结束时统一清掉。
    eventBus.emit('main-tabs-external-drop-ui-reset')

    getLogger().debug('拖拽结束')
  }

  /**
   * 检查是否在 Tab 栏区域外
   */
  const checkOutsideTabsArea = (event: DragEvent, tabsWrapperEl: HTMLElement): boolean => {
    const rect = tabsWrapperEl.getBoundingClientRect()
    return (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
  }

  /**
   * 重置拖拽状态
   */
  const resetDragState = () => {
    isDragging.value = false
    draggingId.value = null
    draggingTab.value = null
    dropPreview.value = { targetId: null, mode: null, splitEdge: null }
    sharedEditorPaneDropContext.value = null
    currentSessionId = null
    tabDragSourceSurface.value = null
    lastPaneToMainStripInsertHint = null
  }

  /** 高亮与投放由 document capture 全局处理（穿透 Monaco 等子元素），此处保留空实现以兼容旧绑定 */
  const handleEditorContentDragOver = (_event: DragEvent) => {}

  const handleEditorContentDragLeave = (_event: DragEvent) => {}

  /** 同上，优先走 globalEditorSplitDropHandler */
  const handleEditorContentDrop = async (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const ctx = sharedEditorPaneDropContext.value
    sharedEditorPaneDropContext.value = null
    const fromId = event.dataTransfer?.getData(TAB_DRAG_MIME_TYPE) || draggingId.value
    if (!fromId || !ctx) {
      dragGeneration++
      resetDragState()
      return
    }
    const ok = await runEditorContentSplitDropFromContext(workspace, fromId, ctx)
    if (ok) {
      dragGeneration++
      resetDragState()
    }
  }

  // 组件卸载时清理
  onUnmounted(() => {
    cleanupDragImage()
    if (escapeKeyHandler) {
      document.removeEventListener('keydown', escapeKeyHandler)
      escapeKeyHandler = null
    }
    if (globalDragOverHandler) {
      document.removeEventListener('dragover', globalDragOverHandler, true)
      globalDragOverHandler = null
    }
    if (globalEditorSplitDropHandler) {
      document.removeEventListener('drop', globalEditorSplitDropHandler, true)
      globalEditorSplitDropHandler = null
    }
    removeDragCursorOverlay()
    dragCursorOverlay = null
  })

  return {
    isDragging,
    draggingId,
    draggingTab,
    dropPreview,
    editorPaneDropUi,

    // 事件处理器
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
    handleEditorContentDragOver,
    handleEditorContentDragLeave,
    handleEditorContentDrop,

    // 工具函数
    computeDropMode,
    computeDocumentTabDropZone,
    findTabItemElement,
    checkOutsideTabsArea,
    resetDragState,
    cleanupDragImage
  }
}

export default useTabDrag
