import { ref, computed, reactive } from 'vue'
import { useWorkspace, type WorkspaceTab } from '../stores/workspace'
import { findGroupContainingTab } from '../stores/workspace-layout'
import { createRendererLogger } from '../utils/logger'
import messageBridge from '../bridge/message-bridge'
import eventBus from '../utils/event-bus'

const logger = createRendererLogger('useTabSwitcher')

const isVisible = ref(false)
const isCapturing = ref(false)
const selectedIndex = ref(0)
const thumbnailCache = reactive<Record<string, string>>({})
let originalTabId: string | null = null
let autoConfirmTimer: ReturnType<typeof setTimeout> | null = null
let ctrlReleaseHandler: ((e: KeyboardEvent) => void) | null = null
let escapeHandler: ((e: KeyboardEvent) => void) | null = null

// 等待一帧渲染完成，确保 DOM 已更新
function waitForFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

async function captureCurrentThumbnail(tabId: string): Promise<void> {
  if (!messageBridge.getIpc()) return

  try {
    // 截图前隐藏 overlay，避免把切换面板截进缩略图
    const wasVisible = isVisible.value
    if (wasVisible) {
      isCapturing.value = true
      await waitForFrame()
    }

    const dataUrl = await messageBridge.invoke('capture-window-thumbnail')
    if (dataUrl) {
      thumbnailCache[tabId] = dataUrl
    }

    // 恢复 overlay 显示
    if (wasVisible) {
      isCapturing.value = false
    }
  } catch (error) {
    isCapturing.value = false
    logger.warn('捕获缩略图失败:', error)
  }
}

function clearAutoConfirmTimer(): void {
  if (autoConfirmTimer) {
    clearTimeout(autoConfirmTimer)
    autoConfirmTimer = null
  }
}

function cleanupWindowListeners(): void {
  if (ctrlReleaseHandler) {
    window.removeEventListener('keyup', ctrlReleaseHandler, true)
    ctrlReleaseHandler = null
  }
  if (escapeHandler) {
    window.removeEventListener('keydown', escapeHandler, true)
    escapeHandler = null
  }
}

export function useTabSwitcher() {
  const workspace = useWorkspace()

  /** 当前为文档 Tab 且所在 pane 内有多页时，Ctrl+Tab 仅在 pane 内循环；否则为全局顺序 */
  const orderedTabs = computed((): WorkspaceTab[] => {
    const list = workspace.tabs as WorkspaceTab[]
    const activeId = workspace.activeTabId.value
    if (!activeId) return list
    const activeTab = list.find((t) => t.id === activeId)
    if (!activeTab || activeTab.kind === 'tool' || activeTab.kind === 'system') {
      return list
    }
    const group = findGroupContainingTab(workspace.workspaceLayoutRoot.value, activeId)
    if (group && group.tabIds.length > 1) {
      const byId = new Map(list.map((t) => [t.id, t]))
      return group.tabIds.map((id) => byId.get(id)).filter(Boolean) as WorkspaceTab[]
    }
    return list
  })

  function setupWindowListeners(): void {
    cleanupWindowListeners()

    ctrlReleaseHandler = (e: KeyboardEvent) => {
      if (!isVisible.value) return
      if (e.key === 'Control' || e.key === 'Meta') {
        e.preventDefault()
        e.stopPropagation()
        confirmSelection()
      }
    }
    window.addEventListener('keyup', ctrlReleaseHandler, true)

    escapeHandler = (e: KeyboardEvent) => {
      if (!isVisible.value) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        cancelSwitcher()
      }
    }
    window.addEventListener('keydown', escapeHandler, true)
  }

  async function showSwitcher(direction: 'next' | 'prev'): Promise<void> {
    const tabsList = orderedTabs.value
    if (tabsList.length <= 1) return

    if (isVisible.value) {
      cycleSwitcher(direction)
      return
    }

    originalTabId = workspace.activeTabId.value

    // 切换前先捕获当前 Tab 缩略图
    if (originalTabId) {
      await captureCurrentThumbnail(originalTabId)
    }

    const currentIndex = tabsList.findIndex((t) => t.id === workspace.activeTabId.value)
    let nextIndex = 0
    if (currentIndex === -1) {
      nextIndex = 0
    } else if (direction === 'next') {
      nextIndex = (currentIndex + 1) % tabsList.length
    } else {
      nextIndex = (currentIndex - 1 + tabsList.length) % tabsList.length
    }

    // 仅预览高亮，真正激活到确认（点击 / 松开 Ctrl）时再切换
    selectedIndex.value = nextIndex

    isVisible.value = true
    setupWindowListeners()
    // 循环模式下不使用自动确认定时器，仅由 Ctrl 释放触发
    clearAutoConfirmTimer()
  }

  function cycleSwitcher(direction: 'next' | 'prev'): void {
    const tabsList = orderedTabs.value
    const len = tabsList.length
    if (len === 0) return

    let newIndex = selectedIndex.value
    if (direction === 'next') {
      newIndex = (newIndex + 1) % len
    } else {
      newIndex = (newIndex - 1 + len) % len
    }

    selectedIndex.value = newIndex
  }

  function confirmSelection(): void {
    if (!isVisible.value) return
    const tabsList = orderedTabs.value
    const idx = selectedIndex.value
    const tab = tabsList[idx]
    if (tab) {
      workspace.activateTab(tab.id)
      eventBus.emit('tab-switcher-confirm-route', tab)
    }
    hideSwitcher()
  }

  /** 仅更新浮层内选中项（预览），不激活工作区 Tab */
  function selectTabOnly(index: number): void {
    if (index >= 0 && index < orderedTabs.value.length) {
      selectedIndex.value = index
    }
  }

  function cancelSwitcher(): void {
    if (originalTabId) {
      const t = (workspace.tabs as WorkspaceTab[]).find((x) => x.id === originalTabId)
      workspace.activateTab(originalTabId)
      if (t) {
        eventBus.emit('tab-switcher-confirm-route', t)
      }
    }
    hideSwitcher()
  }

  function hideSwitcher(): void {
    isVisible.value = false
    originalTabId = null
    clearAutoConfirmTimer()
    cleanupWindowListeners()
  }

  // 一次性动作（新建/恢复 Tab）的短暂指示器
  function flashIndicator(tabId: string): void {
    const tabsList = orderedTabs.value
    const idx = tabsList.findIndex((t) => t.id === tabId)
    if (idx === -1) return

    selectedIndex.value = idx
    isVisible.value = true
    originalTabId = null

    clearAutoConfirmTimer()
    cleanupWindowListeners()
    autoConfirmTimer = setTimeout(() => {
      hideSwitcher()
    }, 600)
  }

  return {
    isVisible,
    isCapturing,
    selectedIndex,
    orderedTabs,
    thumbnailCache,
    captureCurrentThumbnail,
    showSwitcher,
    cycleSwitcher,
    confirmSelection,
    selectTabOnly,
    cancelSwitcher,
    flashIndicator
  }
}
