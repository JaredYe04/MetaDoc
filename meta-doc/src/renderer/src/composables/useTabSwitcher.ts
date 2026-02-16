import { ref, computed, reactive } from 'vue'
import { useWorkspace, type WorkspaceTab } from '../stores/workspace'
import { createRendererLogger } from '../utils/logger'

const logger = createRendererLogger('useTabSwitcher')

const getIpcRenderer = () => {
  if (typeof window !== 'undefined' && (window as any).electron?.ipcRenderer) {
    return (window as any).electron.ipcRenderer
  }
  return null
}

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
  const ipcRenderer = getIpcRenderer()
  if (!ipcRenderer) return

  try {
    // 截图前隐藏 overlay，避免把切换面板截进缩略图
    const wasVisible = isVisible.value
    if (wasVisible) {
      isCapturing.value = true
      await waitForFrame()
    }

    const dataUrl = await ipcRenderer.invoke('capture-window-thumbnail')
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

  const orderedTabs = computed(() => workspace.tabs as WorkspaceTab[])

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

    // 立即切换 Tab
    const nextTab = tabsList[nextIndex]
    if (nextTab) {
      workspace.activateTab(nextTab.id)
      selectedIndex.value = nextIndex
    }

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

    // 立即切换 Tab
    const nextTab = tabsList[newIndex]
    if (nextTab) {
      workspace.activateTab(nextTab.id)
      selectedIndex.value = newIndex
    }
  }

  function confirmSelection(): void {
    if (!isVisible.value) return
    // Tab 已经在 cycleSwitcher 中切换了，这里只需要关闭遮罩
    hideSwitcher()
  }

  function selectAndConfirm(index: number): void {
    const tabsList = orderedTabs.value
    if (index >= 0 && index < tabsList.length) {
      const targetTab = tabsList[index]
      workspace.activateTab(targetTab.id)
      selectedIndex.value = index
    }
    confirmSelection()
  }

  function cancelSwitcher(): void {
    if (originalTabId) {
      workspace.activateTab(originalTabId)
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
    selectAndConfirm,
    cancelSwitcher,
    flashIndicator
  }
}
