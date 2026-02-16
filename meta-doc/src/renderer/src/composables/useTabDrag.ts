import { ref, computed, onUnmounted } from 'vue'
import { useWorkspace, type WorkspaceTab, type WorkspaceTabKind } from '../stores/workspace'
import { createRendererLogger } from '../utils/logger'
import { themeState } from '../utils/themes'

const logger = createRendererLogger('useTabDrag')

// 拖拽数据 MIME 类型常量 —— 使用自定义类型避免 OS 级转发导致崩溃
const TAB_DRAG_MIME_TYPE = 'application/x-metadoc-tab'

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
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) return

  try {
    const dataUrl = await ipcRenderer.invoke('capture-window-thumbnail')
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
    logger.warn('预获取缩略图失败:', error)
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
 * 获取 IPC 渲染器
 */
const getIpcRenderer = () => {
  if (typeof window !== 'undefined' && (window as any).electron?.ipcRenderer) {
    return (window as any).electron.ipcRenderer
  }
  return null
}

/**
 * 获取当前窗口 ID
 */
const getCurrentWindowId = async (): Promise<number> => {
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) return -1
  try {
    return await ipcRenderer.invoke('get-window-id')
  } catch (error) {
    logger.error('Failed to get window ID:', error)
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
  }
  document: any | null
  toolState: any | null
  sourceWindowId: number
  sourceTabCount: number
  canDragToOtherWindow: boolean
}

/**
 * 拖拽状态
 */
export interface DragState {
  isDragging: boolean
  draggingId: string | null
  draggingTab: WorkspaceTab | null
  dropPreview: {
    targetId: string | null
    mode: 'before' | 'after' | null
  }
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
let dragCanvasElement: HTMLCanvasElement | null = null
let escapeKeyHandler: ((e: KeyboardEvent) => void) | null = null

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
      route: tab.route
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
      logger.warn('序列化文档数据失败:', error)
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

/**
 * Tab 拖拽核心逻辑
 */
export const useTabDrag = (options: UseTabDragOptions = {}) => {
  const workspace = useWorkspace()
  const ipcRenderer = getIpcRenderer()

  const { onDragStart, onDragEnd, onDrop } = options

  // 响应式状态
  const isDragging = ref(false)
  const draggingId = ref<string | null>(null)
  const draggingTab = ref<WorkspaceTab | null>(null)
  const dropPreview = ref<{
    targetId: string | null
    mode: 'before' | 'after' | null
  }>({ targetId: null, mode: null })

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

    // 异步部分：初始化拖拽会话
    const initSession = async () => {
      if (!ipcRenderer) return

      try {
        // 序列化 Tab 数据
        const tabData = serializeTabData(tab.id)
        if (!tabData) return

        // 获取当前窗口 ID
        const sourceWindowId = await getCurrentWindowId()
        tabData.sourceWindowId = sourceWindowId

        // 调用主进程创建拖拽会话
        const result = await ipcRenderer.invoke('drag:start', {
          tabId: tab.id,
          tabData
        })

        if (result?.sessionId) {
          currentSessionId = result.sessionId
        }

        logger.debug('拖拽会话开始:', currentSessionId)
      } catch (error) {
        logger.error('初始化拖拽会话失败:', error)
      }
    }

    // 启动会话初始化（不阻塞）
    initSession()

    // 添加 ESC 键监听
    escapeKeyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && currentSessionId) {
        ipcRenderer?.send('drag:cancel', { sessionId: currentSessionId })
        resetDragState()
        cleanupDragImage()
      }
    }
    document.addEventListener('keydown', escapeKeyHandler)

    // 调用回调
    onDragStart?.(tab, event)

    logger.debug('拖拽开始:', tab.id)
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
   * 查找 Tab 项元素
   */
  const findTabItemElement = (labelElement: HTMLElement): HTMLElement | null => {
    let current: HTMLElement | null = labelElement
    while (current) {
      if (current.classList.contains('tab-item')) {
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

    if (!isDragging.value || !draggingId.value) return
    if (draggingId.value === targetTab.id) {
      dropPreview.value = { targetId: null, mode: null }
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'

    const labelEl = event.currentTarget as HTMLElement
    const tabItemEl = findTabItemElement(labelEl)
    if (!tabItemEl) return

    const mode = computeDropMode(event, tabItemEl)
    dropPreview.value = { targetId: targetTab.id, mode }
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
  const handleDrop = async (targetTab: WorkspaceTab, event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()

    // 从自定义 MIME 类型读取 Tab ID
    const fromId = event.dataTransfer?.getData(TAB_DRAG_MIME_TYPE) || draggingId.value
    const toId = targetTab.id
    const mode = dropPreview.value.mode

    if (!fromId || fromId === toId || !mode) {
      resetDragState()
      return
    }

    // 同窗口内重排序（无需 IPC）
    const fromIndex = workspace.tabs.findIndex((t) => t.id === fromId)
    const toIndex = workspace.tabs.findIndex((t) => t.id === toId)

    if (fromIndex === -1 || toIndex === -1) {
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

    // 通知主进程此拖拽已被消费（同窗口内）
    if (currentSessionId && ipcRenderer) {
      try {
        const currentWindowId = await getCurrentWindowId()
        await ipcRenderer.invoke('drag:drop', {
          sessionId: currentSessionId,
          targetWindowId: currentWindowId,
          insertIndex
        })
      } catch (error) {
        logger.warn('通知主进程 drop 失败:', error)
      }
    }

    await onDrop?.(fromId, toId, mode)
    resetDragState()

    logger.debug('投放完成:', { fromId, toId, mode })
  }

  /**
   * 处理拖拽结束
   * 通知主进程，由主进程决定是否需要分离到新窗口
   * 包含 Tab 栏边界信息用于内部窗口分离判断
   */
  const handleDragEnd = async (event: DragEvent) => {
    const tab = draggingTab.value

    // 移除 ESC 键监听
    if (escapeKeyHandler) {
      document.removeEventListener('keydown', escapeKeyHandler)
      escapeKeyHandler = null
    }

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

    // 通知主进程拖拽结束（携带 Tab 栏边界）
    if (currentSessionId && ipcRenderer) {
      try {
        const result = await ipcRenderer.invoke('drag:end', {
          sessionId: currentSessionId,
          tabBarBounds
        })

        if (result?.action === 'detach') {
          logger.info('Tab 已分离到新窗口:', result.newWindowId)
        }
      } catch (error) {
        logger.error('通知主进程拖拽结束失败:', error)
      }
    }

    // 调用回调
    if (tab) {
      await onDragEnd?.(tab, event)
    }

    resetDragState()
    cleanupDragImage()
    clearCachedThumbnail()

    logger.debug('拖拽结束')
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
    dropPreview.value = { targetId: null, mode: null }
    currentSessionId = null
  }

  // 组件卸载时清理
  onUnmounted(() => {
    cleanupDragImage()
    if (escapeKeyHandler) {
      document.removeEventListener('keydown', escapeKeyHandler)
      escapeKeyHandler = null
    }
  })

  return {
    // 响应式状态（作为 computed refs）
    isDragging: computed(() => isDragging.value),
    draggingId: computed(() => draggingId.value),
    draggingTab: computed(() => draggingTab.value),
    dropPreview: computed(() => dropPreview.value),

    // 事件处理器
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,

    // 工具函数
    computeDropMode,
    findTabItemElement,
    checkOutsideTabsArea,
    resetDragState,
    cleanupDragImage
  }
}

export default useTabDrag
