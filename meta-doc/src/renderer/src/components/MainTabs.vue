<template>
  <div ref="tabsWrapperRef" class="main-tabs-wrapper" :class="{ 'is-locked': isLocked }" @dblclick="handleDoubleClick">
    <!-- macOS 平台：左边预留空间给原生按钮 -->
    <div v-if="isMac" class="macos-traffic-lights-spacer"></div>
    <div class="tabs-container">
      <el-tabs
        ref="tabsRef"
        v-model="currentActiveId"
        type="card"
        class="main-tabs"
        @tab-remove="handleRemove"
        @tab-click="handleTabClick"
        :before-leave="handleBeforeLeave"
      >
        <el-tab-pane
          v-for="tab in allTabs"
          :key="tab.id"
          :name="tab.id"
          :closable="false"
        >
          <template #label>
            <div
              class="main-tab-label"
              :class="{ 'is-preview': tab.preview }"
              :title="getTabTooltip(tab)"
              @mousedown="handleTabMouseDown($event, tab)"
              @dblclick.stop="handleTabLabelDblclick(tab)"
              @contextmenu.prevent="openTabContextMenu($event, tab)"
              :draggable="canDragTab(tab)"
              @dragstart.stop="handleDragStart(tab.id, $event)"
              @dragover.prevent="handleDragOver(tab.id, $event)"
              @dragleave="handleDragLeave"
              @drop.stop="handleDrop(tab.id, $event)"
              @dragend.stop="handleDragEnd"
            >
              <span class="main-tab-label__text">
                {{ getTabLabel(tab) }}
              </span>
              <span
                v-if="tab.dirty"
                class="main-tab-label__dot"
              />
              <!-- 自定义关闭按钮 - 默认所有Tab都显示，活跃Tab始终显示 -->
              <span
                v-if="canCloseTab(tab)"
                class="main-tab-label__close"
                :class="{ 'main-tab-label__close--active': currentActiveId === tab.id }"
                @click.stop="handleCloseTab(tab.id)"
                @mousedown.stop
                @dragstart.stop
              >
                <el-icon><Close /></el-icon>
              </span>
            </div>
          </template>
        </el-tab-pane>
      </el-tabs>
      <!-- 新建文档按钮 -->
      <div
        class="new-tab-button"
        :class="{ 'is-locked': isLocked }"
        @click="handleNewTabClick"
        title="新建文档"
      >
        <el-icon><Plus /></el-icon>
      </div>
    </div>
    
    <!-- 窗口控制按钮 (最右侧) - 仅在非 macOS 平台显示，使用主题图标 -->
    <div v-if="!isMac" class="window-controls">
      <div class="window-control-btn" @click="handleMinimize">
        <img class="window-control-icon" :src="windowControlIcons.minimize" alt="" aria-hidden="true" />
      </div>
      <div class="window-control-btn" @click="handleMaximize">
        <img
          class="window-control-icon"
          :src="isMaximized ? windowControlIcons.restore : windowControlIcons.maximize"
          alt=""
          aria-hidden="true"
        />
      </div>
      <div class="window-control-btn window-control-btn--close" @click="handleClose">
        <svg class="window-control-icon window-control-icon--close" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" aria-hidden="true">
          <path d="M2 2l8 8M10 2L2 10"/>
        </svg>
      </div>
    </div>

    <!-- Tab 右键菜单 -->
    <transition name="fade">
      <div
        v-if="tabContextMenuVisible && tabContextMenuPosition"
        class="tab-context-menu"
        :style="{ ...tabContextMenuStyle, ...tabContextMenuPositionStyle }"
        @click.stop
      >
        <button type="button" class="tab-context-menu__item" @click="handleContextMenuAction('closeTab')">
          {{ t('mainTabs.contextMenu.closeTab') }}
        </button>
        <button type="button" class="tab-context-menu__item" @click="handleContextMenuAction('closeOtherTabs')">
          {{ t('mainTabs.contextMenu.closeOtherTabs') }}
        </button>
        <button
          v-if="canMoveToOtherWindow(tabContextMenuTab)"
          type="button"
          class="tab-context-menu__item"
          @click="handleContextMenuAction('openInNewWindow')"
        >
          {{ t('mainTabs.contextMenu.openInNewWindow') }}
        </button>
        <div
          v-if="canMoveToOtherWindow(tabContextMenuTab)"
          class="tab-context-menu__item tab-context-menu__submenu-trigger"
          @mouseenter="showMoveToWindowSubmenu = true"
          @mouseleave="handleMoveToWindowMouseLeave"
        >
          <span>{{ t('mainTabs.contextMenu.moveToWindow') }}</span>
          <el-icon class="arrow-icon"><ArrowRight /></el-icon>
          <div
            v-if="showMoveToWindowSubmenu"
            class="tab-context-menu__submenu"
            @mouseenter="handleMoveToWindowSubmenuEnter"
            @mouseleave="showMoveToWindowSubmenu = false"
          >
            <button
              v-for="w in otherWindowsList"
              :key="w.id"
              type="button"
              class="tab-context-menu__item"
              @click="handleMoveToWindow(w.id)"
            >
              {{ w.title }}
            </button>
            <div v-if="otherWindowsList.length === 0" class="tab-context-menu__empty">
              {{ t('common.noOtherWindow', '无其他窗口') }}
            </div>
          </div>
        </div>
        <template v-if="hasFileTabPath(tabContextMenuTab)">
          <div class="tab-context-menu__divider"></div>
          <button type="button" class="tab-context-menu__item" @click="handleContextMenuAction('copyPath')">
            {{ t('mainTabs.contextMenu.copyPath') }}
          </button>
          <button type="button" class="tab-context-menu__item" @click="handleContextMenuAction('copyTitle')">
            {{ t('mainTabs.contextMenu.copyTitle') }}
          </button>
          <button type="button" class="tab-context-menu__item" @click="handleContextMenuAction('copyFilename')">
            {{ t('mainTabs.contextMenu.copyFilename') }}
          </button>
          <button type="button" class="tab-context-menu__item" @click="handleContextMenuAction('showInFolder')">
            {{ t('mainTabs.contextMenu.showInFolder') }}
          </button>
        </template>
        <div class="tab-context-menu__divider"></div>
        <button type="button" class="tab-context-menu__item" @click="handleContextMenuAction('moveLeft')">
          {{ t('mainTabs.contextMenu.moveLeft') }}
        </button>
        <button type="button" class="tab-context-menu__item" @click="handleContextMenuAction('moveRight')">
          {{ t('mainTabs.contextMenu.moveRight') }}
        </button>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter, useRoute } from 'vue-router'
import { useWorkspace, type WorkspaceTab } from '../stores/workspace'
import eventBus from '../utils/event-bus'
import { createRendererLogger } from '../utils/logger'
import { Close, Plus, ArrowRight } from '@element-plus/icons-vue'
import { mixColors, themeState } from '../utils/themes'
import { useCloseTab } from '../composables/useCloseTab'

// 主题中的窗口控制图标（themes.js 中注册，TS 无类型声明故用 Record 访问）
const windowControlIcons = computed(() => {
  const t = themeState.currentTheme as unknown as Record<string, string>
  return { minimize: t.MinimizeIcon, maximize: t.MaximizeIcon, restore: t.RestoreIcon }
})

const logger = createRendererLogger('MainTabs')
const { t } = useI18n()
const router = useRouter()
const route = useRoute()

const workspace = useWorkspace()
const tabsRef = ref<any>(null)
const tabsWrapperRef = ref<HTMLElement | null>(null)

const { closeTab, isLocked } = useCloseTab()

// Tab 右键菜单
const tabContextMenuVisible = ref(false)
const tabContextMenuPosition = ref<{ x: number; y: number } | null>(null)
const tabContextMenuTab = ref<WorkspaceTab | null>(null)
const showMoveToWindowSubmenu = ref(false)
const otherWindowsList = ref<Array<{ id: number; title: string }>>([])
let moveToWindowLeaveTimer: ReturnType<typeof setTimeout> | null = null

// 窗口是否最大化（用于标题栏最大化/还原图标切换）
const isMaximized = ref(false)

const tabContextMenuStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  borderColor: themeState.currentTheme.type === 'dark'
    ? 'rgba(255, 255, 255, 0.1)'
    : 'rgba(0, 0, 0, 0.08)'
}))

const tabContextMenuPositionStyle = computed(() => {
  if (!tabContextMenuPosition.value) return {}
  return {
    position: 'fixed' as const,
    left: tabContextMenuPosition.value.x + 'px',
    top: tabContextMenuPosition.value.y + 'px'
  }
})

const hasFileTabPath = (tab: WorkspaceTab | null): boolean => {
  if (!tab) return false
  return tab.kind === 'file' && !!tab.path?.trim()
}

const canMoveToOtherWindow = (tab: WorkspaceTab | null): boolean => {
  return !!tab
}

const openTabContextMenu = async (e: MouseEvent, tab: WorkspaceTab) => {
  if (isLocked.value) return
  tabContextMenuVisible.value = true
  tabContextMenuPosition.value = { x: e.clientX, y: e.clientY }
  tabContextMenuTab.value = tab
  showMoveToWindowSubmenu.value = false
  try {
    if (ipcRenderer && canMoveToOtherWindow(tab)) {
      otherWindowsList.value = await ipcRenderer.invoke('get-all-windows')
    } else {
      otherWindowsList.value = []
    }
  } catch (err) {
    logger.warn('获取窗口列表失败:', err)
    otherWindowsList.value = []
  }
}

const handleMoveToWindowMouseLeave = () => {
  moveToWindowLeaveTimer = setTimeout(() => {
    moveToWindowLeaveTimer = null
    showMoveToWindowSubmenu.value = false
  }, 150)
}

const handleMoveToWindowSubmenuEnter = () => {
  if (moveToWindowLeaveTimer) {
    clearTimeout(moveToWindowLeaveTimer)
    moveToWindowLeaveTimer = null
  }
  showMoveToWindowSubmenu.value = true
}

const closeTabContextMenu = () => {
  tabContextMenuVisible.value = false
  tabContextMenuPosition.value = null
  tabContextMenuTab.value = null
  showMoveToWindowSubmenu.value = false
  if (moveToWindowLeaveTimer) {
    clearTimeout(moveToWindowLeaveTimer)
    moveToWindowLeaveTimer = null
  }
}

const handleContextMenuAction = async (action: string) => {
  const tab = tabContextMenuTab.value
  if (!tab) return
  closeTabContextMenu()

  switch (action) {
    case 'closeTab':
      await handleCloseTab(tab.id)
      break
    case 'closeOtherTabs':
      const otherIds = allTabs.value.filter(t => t.id !== tab.id).map(t => t.id)
      for (const id of otherIds) {
        await handleCloseTab(id)
      }
      break
    case 'openInNewWindow':
      await handleOpenInNewWindow(tab)
      break
    case 'copyPath':
      if (hasFileTabPath(tab) && tab.path) {
        await navigator.clipboard.writeText(tab.path)
        eventBus.emit('show-success', { message: t('workspaceExplorer.copyPathSuccess') })
      }
      break
    case 'copyTitle':
      if (hasFileTabPath(tab)) {
        const title = tab.subtitle?.trim() || tab.title?.trim() || ''
        await navigator.clipboard.writeText(title)
        eventBus.emit('show-success', { message: t('common.copySuccess') })
      }
      break
    case 'copyFilename':
      if (hasFileTabPath(tab) && tab.path) {
        const filename = tab.path.split(/[/\\]/).filter(Boolean).pop() || ''
        await navigator.clipboard.writeText(filename)
        eventBus.emit('show-success', { message: t('common.copySuccess') })
      }
      break
    case 'showInFolder':
      if (hasFileTabPath(tab) && tab.path && ipcRenderer) {
        await ipcRenderer.invoke('show-item-in-folder', tab.path)
      }
      break
    case 'moveLeft': {
      const fromIdx = workspace.tabs.findIndex(t => t.id === tab.id)
      if (fromIdx > 0) {
        const [tabItem] = workspace.tabs.splice(fromIdx, 1)
        workspace.tabs.splice(fromIdx - 1, 0, tabItem)
        nextTick(() => workspace.activateTab(tab.id))
      }
      break
    }
    case 'moveRight': {
      const fromIdx = workspace.tabs.findIndex(t => t.id === tab.id)
      if (fromIdx >= 0 && fromIdx < workspace.tabs.length - 1) {
        const [tabItem] = workspace.tabs.splice(fromIdx, 1)
        workspace.tabs.splice(fromIdx + 1, 0, tabItem)
        nextTick(() => workspace.activateTab(tab.id))
      }
      break
    }
  }
}

const handleOpenInNewWindow = async (tab: WorkspaceTab) => {
  if (!canMoveToOtherWindow(tab) || !ipcRenderer) return
  const tabData = serializeTabData(tab.id)
  if (!tabData) return

  const myWindowId = await getCurrentWindowId()
  // 新窗口位置：当前窗口中心偏右下方
  const position = {
    x: window.screenX + window.innerWidth / 2 + 40,
    y: window.screenY + window.innerHeight / 2 + 40
  }

  try {
    await ipcRenderer.invoke('create-window-with-tab', { tabData, position })
    await removeTabAfterDrag(tab.id, myWindowId)
    logger.info(`Tab ${tab.id} 已在新窗口中打开`)
  } catch (error) {
    logger.error('在新窗口中打开失败:', error)
  }
}

const handleMoveToWindow = async (targetWindowId: number) => {
  const tab = tabContextMenuTab.value
  if (!tab || !canMoveToOtherWindow(tab)) return
  closeTabContextMenu()

  const tabData = serializeTabData(tab.id)
  if (!tabData || !ipcRenderer) return

  const myWindowId = await getCurrentWindowId()
  if (targetWindowId === myWindowId) return

  try {
    ipcRenderer.send('transfer-tab-to-window', {
      targetWindowId,
      tabData: { ...tabData, sourceWindowId: myWindowId },
      insertIndex: 0
    })
    await removeTabAfterDrag(tab.id, myWindowId)
  } catch (error) {
    logger.error('移至其他窗口失败:', error)
  }
}

const handleTabContextMenuClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  if (tabContextMenuVisible.value && !target.closest('.tab-context-menu')) {
    closeTabContextMenu()
  }
}

// 检测是否为 macOS
const isMac = computed(() => {
  // //debug
  // return true
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.platform)
})

// 使用mixColors生成辅助色 - 使用themeState.currentTheme的主题色
const tabsContainerBackgroundColor = computed(() => {
  try {
    const baseColor = themeState.currentTheme.background
    return mixColors(baseColor, '#888888', 0.3)
  } catch {
    return '#f5f5f5'
  }
})

// Tab项的颜色 - 混合度浅0.2（原来是0.1，现在应该是0.08）
const tabItemBackgroundColor = computed(() => {
  try {
    const baseColor = themeState.currentTheme.background
    return mixColors(baseColor, '#888888', 0.2)
  } catch {
    return '#f7f7f7'
  }
})

const tabItemHoverBackgroundColor = computed(() => {
  try {
    const baseColor = themeState.currentTheme.background
    return mixColors(baseColor, '#888888', 0.15) // 与灰色混合8%
  } catch {
    return '#f0f0f0'
  }
})

const tabItemActiveBackgroundColor = computed(() => {
  try {
    // 使用主题的primaryColor或者background2nd
    const baseColor = themeState.currentTheme.background
    return mixColors(baseColor, '#888888', 0.08) // 与灰色混合8%
  } catch {
    return '#e8f0f8'
  }
})

// Border颜色 - 使用background-color和灰色更深的混合（0.4）
const borderColor = computed(() => {
  try {
    const baseColor = themeState.currentTheme.background
    return mixColors(baseColor, '#888888', 0.4)
  } catch {
    return '#d0d0d0'
  }
})

// 窗口控制函数
const handleMinimize = () => {
  let ipcRenderer: any = null
  if (window && (window as any).electron) {
    ipcRenderer = (window as any).electron.ipcRenderer
  }
  if (ipcRenderer) {
    ipcRenderer.send('window-minimize')
  }
}

const handleMaximize = () => {
  let ipcRenderer: any = null
  if (window && (window as any).electron) {
    ipcRenderer = (window as any).electron.ipcRenderer
  }
  if (ipcRenderer) {
    ipcRenderer.send('window-maximize')
  }
}

// 双击标题栏最大化/还原
let lastClickTime = 0
const handleDoubleClick = (event: MouseEvent) => {
  // 检查是否在空白区域（不是可交互元素）
  const target = event.target as HTMLElement
  if (target.closest('.main-tabs') || 
      target.closest('.window-controls') ||
      target.closest('.main-tab-label')) {
    return
  }
  
  const currentTime = Date.now()
  if (currentTime - lastClickTime < 300) {
    // 双击
    handleMaximize()
    lastClickTime = 0
  } else {
    lastClickTime = currentTime
  }
}

const handleClose = () => {
  // 关闭当前窗口，而非退出整个应用；主进程根据可见窗口数量决定是否退出
  if (ipcRenderer) {
    ipcRenderer.send('close-window')
  } else {
    eventBus.emit('quit')
  }
}

// 点击新建文档按钮
const handleNewTabClick = () => {
  if (isLocked.value) return
  workspace.openNewDocumentTab()
}

// 合并文档Tab和系统Tab、工具Tab，过滤掉空白页Tab
const allTabs = computed(() => {
  return workspace.tabs.filter(tab => !(tab.kind === 'system' && tab.route === '/dummy'))
})

// 计算Tab数量，用于CSS变量
const tabCount = computed(() => allTabs.value.length)

const currentActiveId = computed({
  get: () => workspace.activeTabId.value,
  set: (value: string) => {
    if (isLocked.value) return
    if (value !== workspace.activeTabId.value) {
      workspace.activateTab(value)
      // 如果Tab有route，切换路由（仅对系统Tab和工具Tab）
      const tab = allTabs.value.find(t => t.id === value)
      if (tab && (tab.kind === 'system' || tab.kind === 'tool') && tab.route) {
        // 使用nextTick确保在DOM更新后立即跳转
        nextTick(() => {
          if (tab.route && tab.route !== route.path) {
            router.push(tab.route)
          }
        })
      }
      // 文档Tab不需要路由切换，视图由lastView控制
    }
  },
})

const getTabLabel = (tab: WorkspaceTab): string => {
  return tab.subtitle?.trim() || tab.title?.trim() || '未命名'
}

const getTabTooltip = (tab: WorkspaceTab): string => {
  const primary = getTabLabel(tab)
  const secondary = tab.title?.trim()
  if (!secondary || secondary === primary) {
    return primary
  }
  return secondary ? `${primary} — ${secondary}` : primary
}

const canCloseTab = (tab: WorkspaceTab): boolean => {
  // 所有Tab都可以关闭，包括最后一个Tab
  // 关闭最后一个Tab后会显示Dummy组件
  return workspace.canRemoveTab(tab.id)
}

const canDragTab = (tab: WorkspaceTab): boolean => {
  // 所有Tab都可以拖拽来改变顺序（在本窗口内）
  // 但系统Tab和工具Tab不允许拖拽到其他窗口
  return !isLocked.value
}

// 检查Tab是否可以拖拽到其他窗口（工具、系统 Tab 也可迁移）
const canDragToOtherWindow = (_tab: WorkspaceTab): boolean => {
  return true
}

// 在 mousedown 时立即切换 tab（而非 click）
const handleTabMouseDown = (event: MouseEvent, tab: WorkspaceTab) => {
  if (isLocked.value) return
  // 如果点在关闭按钮上，不切换 tab（让关闭按钮处理）
  const target = event.target as HTMLElement
  if (target.closest('.main-tab-label__close')) return
  event.stopPropagation()
  if (tab.id === workspace.activeTabId.value) return
  workspace.activateTab(tab.id)
  if (tab.kind === 'system' || tab.kind === 'tool') {
    const toRoute = tab.route
    if (toRoute && toRoute !== route.path) {
      nextTick(() => router.push(toRoute))
    }
  }
}

const handleTabClick = (tab: any) => {
  const tabId = tab.paneName
  const workspaceTab = allTabs.value.find(t => t.id === tabId)
  // 仅对系统Tab和工具Tab进行路由切换
  if (workspaceTab && (workspaceTab.kind === 'system' || workspaceTab.kind === 'tool') && workspaceTab.route) {
    nextTick(() => {
      if (workspaceTab.route && workspaceTab.route !== route.path) {
        router.push(workspaceTab.route)
      }
    })
  }
  // 文档Tab不需要路由切换，视图由lastView控制
}

const handleBeforeLeave = (nextName?: string, _currentName?: string) => {
  if (isLocked.value) return false
  return true
}

// 自定义关闭Tab处理函数 - 使用公共的 closeTab composable
const handleCloseTab = async (tabId: string) => {
  await closeTab(tabId)
}

const handleTabLabelDblclick = (tab: WorkspaceTab) => {
  if (tab.preview) {
    workspace.pinTab(tab.id)
  }
}

const handleRemove = async (id: string | number) => {
  // 这个函数保留用于兼容，但实际使用handleCloseTab
  await handleCloseTab(String(id))
}

// 拖拽相关
let draggingId: string | null = null
let draggingTab: WorkspaceTab | null = null
let currentWindowId: number | null = null
let isDraggingToNewWindow = false
let dragStartPosition: { x: number; y: number } | null = null
type DropMode = 'before' | 'after'
const dropPreview = reactive<{ targetId: string | null; mode: DropMode | null }>({
  targetId: null,
  mode: null,
})

// 获取IPC渲染器
let ipcRenderer: any = null
if (window && (window as any).electron) {
  ipcRenderer = (window as any).electron.ipcRenderer
}

// 获取当前窗口ID
const getCurrentWindowId = async (): Promise<number> => {
  if (!ipcRenderer) return -1
  if (currentWindowId !== null) return currentWindowId
  try {
    const id = await ipcRenderer.invoke('get-window-id') as number
    currentWindowId = id
    return id
  } catch (error) {
    logger.error('获取窗口ID失败:', error)
    return -1
  }
}

// 序列化Tab数据（包含文档内容）
const serializeTabData = (tabId: string): any => {
  const tab = allTabs.value.find(t => t.id === tabId)
  if (!tab) return null

  const tabData: any = {
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
    }
  }

  // 如果是文档Tab，包含文档内容
  if (tab.kind === 'file' || tab.kind === 'new') {
    try {
      const doc = workspace.ensureDocument(tab.id)
      tabData.document = {
        id: doc.id,
        tabId: doc.tabId,
        path: doc.path,
        format: doc.format,
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
      }
    } catch (error) {
      logger.warn('序列化文档数据失败:', error)
    }
  }

  // 工具 Tab：包含当前选中的会话/对话索引，迁移后恢复
  if (tab.kind === 'tool') {
    const toolState = workspace.getTabToolState(tab.id)
    if (toolState && (toolState.activeSessionId !== undefined || toolState.activeDialogIndex !== undefined)) {
      tabData.toolState = { ...toolState }
    }
  }

  return tabData
}

const computeDropMode = (e: DragEvent, tabItemEl: HTMLElement): DropMode => {
  const rect = tabItemEl.getBoundingClientRect()
  const x = e.clientX - rect.left
  const w = rect.width
  const midPoint = w / 2
  return x < midPoint ? 'before' : 'after'
}

// 归一化：同一缝隙只显示一条高亮线。当 "插在B前" 时，统一改为 "插在A后"（A为B的前一个tab）
const normalizeDropPreview = (targetId: string, mode: DropMode): { targetId: string; mode: DropMode } => {
  if (mode === 'after') return { targetId, mode }
  const idx = allTabs.value.findIndex(t => t.id === targetId)
  if (idx <= 0) return { targetId, mode }
  const prevTab = allTabs.value[idx - 1]
  return { targetId: prevTab.id, mode: 'after' }
}

const findTabItemElement = (labelElement: HTMLElement): HTMLElement | null => {
  let current: HTMLElement | null = labelElement
  while (current) {
    if (current.classList.contains('el-tabs__item')) {
      return current
    }
    current = current.parentElement
  }
  return null
}

const handleDragStart = async (id: string, event: DragEvent) => {
  if (isLocked.value) {
    event.preventDefault()
    return
  }
  
  const tab = allTabs.value.find(t => t.id === id)
  if (!tab) {
    event.preventDefault()
    return
  }

  draggingId = id
  draggingTab = tab
  dragStartPosition = { x: event.clientX, y: event.clientY }
  isDraggingToNewWindow = false

  // 序列化Tab数据
  const tabData = serializeTabData(id)
  if (tabData && event.dataTransfer) {
    const sourceWindowId = await getCurrentWindowId()
    event.dataTransfer.setData('text/plain', id)
    event.dataTransfer.setData('application/x-metadoc-tab', JSON.stringify({
      ...tabData,
      sourceWindowId,
      sourceTabCount: allTabs.value.length, // 用于判断单Tab窗口合并
      canDragToOtherWindow: canDragToOtherWindow(tab)
    }))
    event.dataTransfer.effectAllowed = 'move'
  }
}

const updateDropPreviewClasses = () => {
  nextTick(() => {
    const tabsEl = tabsRef.value?.$el || tabsRef.value
    if (!tabsEl || !(tabsEl instanceof HTMLElement)) return
    const allItems = tabsEl.querySelectorAll('.el-tabs__item')
    allItems.forEach((item) => {
      if (item instanceof HTMLElement) {
        item.classList.remove('drop-before', 'drop-after')
      }
    })
    
    if (dropPreview.targetId && dropPreview.mode) {
      for (let i = 0; i < allItems.length; i++) {
        const item = allItems[i]
        if (!(item instanceof HTMLElement)) continue
        const ariaControls = item.getAttribute('aria-controls')
        if (ariaControls) {
          const paneId = ariaControls.replace(/^pane-/, '')
          if (paneId === dropPreview.targetId) {
            item.classList.add(`drop-${dropPreview.mode}`)
            break
          }
        }
      }
    }
  })
}

const handleDragOver = (targetId: string, event: DragEvent) => {
  if (isLocked.value) return
  if (!draggingId || draggingId === targetId) {
    dropPreview.targetId = null
    dropPreview.mode = null
    updateDropPreviewClasses()
    return
  }
  event.preventDefault()
  event.stopPropagation()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  const labelEl = event.currentTarget as HTMLElement | null
  if (!labelEl) return
  const tabItemEl = findTabItemElement(labelEl)
  if (!tabItemEl) return
  // 扩大拖拽区域：使用整个 Tab 项来计算，而不仅仅是 label
  const mode = computeDropMode(event, tabItemEl)
  const { targetId: normId, mode: normMode } = normalizeDropPreview(targetId, mode)
  dropPreview.targetId = normId
  dropPreview.mode = normMode
  updateDropPreviewClasses()
}

const handleDragLeave = () => {
  // 不立即清除
}

const handleDrop = (targetId: string, event: DragEvent) => {
  if (isLocked.value) return
  event.preventDefault()
  event.stopPropagation()
  
  const fromId = draggingId
  const previewTargetId = dropPreview.targetId
  const mode = dropPreview.mode
  
  if (!fromId || fromId === targetId || !mode || !previewTargetId) {
    draggingId = null
    dropPreview.targetId = null
    dropPreview.mode = null
    updateDropPreviewClasses()
    return
  }
  
  const fromIndex = allTabs.value.findIndex((tab) => tab.id === fromId)
  // 使用 dropPreview 的 targetId 计算插入位置（已归一化，避免多处高亮）
  const targetIndex = allTabs.value.findIndex((tab) => tab.id === previewTargetId)
  
  if (fromIndex === -1 || targetIndex === -1 || fromIndex === targetIndex) {
    draggingId = null
    dropPreview.targetId = null
    dropPreview.mode = null
    updateDropPreviewClasses()
    return
  }
  
  let insertIndex = targetIndex
  if (mode === 'after') {
    insertIndex = targetIndex + 1
  }
  
  if (fromIndex < insertIndex) {
    insertIndex -= 1
  }
  
  insertIndex = Math.max(0, Math.min(insertIndex, allTabs.value.length))
  
  if (fromIndex !== insertIndex) {
    // 直接操作workspace.tabs数组
    const [tab] = workspace.tabs.splice(fromIndex, 1)
    workspace.tabs.splice(insertIndex, 0, tab)
    
    nextTick(() => {
      const currentActiveId = workspace.activeTabId.value
      if (currentActiveId) {
        workspace.activateTab(currentActiveId)
      }
    })
  }
  
  draggingId = null
  dropPreview.targetId = null
  dropPreview.mode = null
  updateDropPreviewClasses()
}

const handleDragEnd = async () => {
  // 重置单Tab合并标记
  singleTabMergeDone = false
  
  // 清除防抖定时器
  if (dragOverTimer) {
    clearTimeout(dragOverTimer)
    dragOverTimer = null
  }
  if (singleTabMergeTimer) {
    clearTimeout(singleTabMergeTimer)
    singleTabMergeTimer = null
  }

  // 如果正在拖拽到新窗口，不执行清理（新窗口创建逻辑会处理）
  if (isDraggingToNewWindow) {
    // 延迟清理，确保新窗口创建完成
    setTimeout(() => {
      draggingId = null
      draggingTab = null
      dragStartPosition = null
      isDraggingToNewWindow = false
      windowCreationInProgress = false
      dropPreview.targetId = null
      dropPreview.mode = null
      updateDropPreviewClasses()
    }, 500)
    return
  }

  windowCreationInProgress = false
  draggingId = null
  draggingTab = null
  dragStartPosition = null
  dropPreview.targetId = null
  dropPreview.mode = null
  updateDropPreviewClasses()
}

// 全局拖拽事件处理
let dragOverTimer: ReturnType<typeof setTimeout> | null = null
let singleTabMergeTimer: ReturnType<typeof setTimeout> | null = null
let singleTabMergeDone = false
let windowCreationInProgress = false // 防止多次创建窗口
const handleGlobalDragOver = async (event: DragEvent) => {
  if (!ipcRenderer) return

  // 情形1：作为目标窗口，收到来自其他窗口的Tab（单Tab窗口需立即合并，不等drop）
  if (!draggingId && event.dataTransfer?.types?.includes('application/x-metadoc-tab')) {
    const tabsWrapperEl = tabsWrapperRef.value || document.querySelector('.main-tabs-wrapper') as HTMLElement
    if (!tabsWrapperEl) return

    const tabsRect = tabsWrapperEl.getBoundingClientRect()
    const mouseX = event.clientX
    const mouseY = event.clientY
    
    const isOverTabs = mouseX >= tabsRect.left && mouseX <= tabsRect.right &&
                      mouseY >= tabsRect.top && mouseY <= tabsRect.bottom

    if (isOverTabs && !singleTabMergeDone) {
      try {
        const dataStr = event.dataTransfer.getData('application/x-metadoc-tab')
        if (dataStr) {
          const tabTransferData = JSON.parse(dataStr)
          const sourceTabCount = tabTransferData.sourceTabCount ?? 0
          const sourceWindowId = tabTransferData.sourceWindowId
          const currentWindowId = await getCurrentWindowId()

          if (sourceWindowId && sourceWindowId !== currentWindowId && 
              sourceTabCount === 1 && tabTransferData.canDragToOtherWindow) {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            
            if (singleTabMergeTimer) {
              clearTimeout(singleTabMergeTimer)
            }
            singleTabMergeTimer = setTimeout(() => {
              singleTabMergeTimer = null
              singleTabMergeDone = true
              try {
                const insertIndex = allTabs.value.length
                ipcRenderer.send('transfer-tab-to-window', {
                  targetWindowId: currentWindowId,
                  tabData: tabTransferData,
                  insertIndex
                })
                logger.info('单Tab窗口已合并到当前窗口')
              } catch (error) {
                logger.error('单Tab合并失败:', error)
              }
            }, 50)
          }
        }
      } catch (error) {
        logger.warn('解析拖拽数据失败:', error)
      }
      return
    } else if (!isOverTabs) {
      if (singleTabMergeTimer) {
        clearTimeout(singleTabMergeTimer)
        singleTabMergeTimer = null
      }
    }
  }

  // 情形2：作为源窗口，拖拽自己的Tab
  if (!draggingId || !draggingTab || !ipcRenderer) return

  if (!canDragToOtherWindow(draggingTab)) {
    return
  }

  const tabsWrapperEl = tabsWrapperRef.value || 
                        document.querySelector('.main-tabs-wrapper') as HTMLElement
  
  if (!tabsWrapperEl) {
    await nextTick()
    const el = tabsWrapperRef.value || document.querySelector('.main-tabs-wrapper') as HTMLElement
    if (!el) return
    checkAndCreateWindow(el, event)
    return
  }

  checkAndCreateWindow(tabsWrapperEl, event)
}

// 检查是否超出MainTabs并创建新窗口
const checkAndCreateWindow = async (tabsWrapperEl: HTMLElement, event: DragEvent) => {
  const tabsRect = tabsWrapperEl.getBoundingClientRect()
  const mouseX = event.clientX
  const mouseY = event.clientY

  // 检查鼠标是否超出MainTabs区域（包括下方内容区、窗口内任何非MainTabs区域）
  const isOutsideTabs = 
    mouseX < tabsRect.left ||
    mouseX > tabsRect.right ||
    mouseY < tabsRect.top ||
    mouseY > tabsRect.bottom

  const tabCount = allTabs.value.length

  // 重要：当前窗口只有1个Tab时，绝不创建新窗口（应合并到目标窗口）
  if (tabCount <= 1) {
    if (dragOverTimer) {
      clearTimeout(dragOverTimer)
      dragOverTimer = null
    }
    isDraggingToNewWindow = false
    return
  }

  // 如果拖拽超出MainTabs区域（含本窗口内下方内容区），立即创建新窗口
  if (isOutsideTabs && !isDraggingToNewWindow && !windowCreationInProgress) {
    // 不重置定时器：首次进入外部区域时设置，后续 dragover 不重置
    if (!dragOverTimer) {
      dragOverTimer = setTimeout(async () => {
        dragOverTimer = null
        if (isDraggingToNewWindow || windowCreationInProgress) return
        windowCreationInProgress = true
        isDraggingToNewWindow = true
        
        const currentDraggingId = draggingId
      if (!currentDraggingId) {
        isDraggingToNewWindow = false
        windowCreationInProgress = false
        return
      }

      // 再次检查Tab数量（可能已变化）
      if (allTabs.value.length <= 1) {
        isDraggingToNewWindow = false
        windowCreationInProgress = false
        return
      }

      // 序列化Tab数据（包括所有状态：dirty、新文档等）
      const tabData = serializeTabData(currentDraggingId)
      if (!tabData) {
        isDraggingToNewWindow = false
        windowCreationInProgress = false
        return
      }

      try {
        const windowId = await getCurrentWindowId()
        
        // 创建新窗口（仅此一次，windowCreationInProgress 已阻止重复）
        const newWindowId = await ipcRenderer.invoke('create-window-with-tab', {
          tabData,
          position: { x: mouseX, y: mouseY }
        })

        // 从当前窗口移除Tab
        await removeTabAfterDrag(currentDraggingId, windowId)

        logger.info(`Tab ${currentDraggingId} 已移动到新窗口 ${newWindowId}`)
      } catch (error) {
        logger.error('创建新窗口失败:', error)
        isDraggingToNewWindow = false
      } finally {
        windowCreationInProgress = false
      }
      }, 50) // 50ms 后触发，不因后续 dragover 重置
    }
  } else if (!isOutsideTabs) {
    // 如果拖拽回到MainTabs区域内，取消创建并重置
    if (dragOverTimer) {
      clearTimeout(dragOverTimer)
      dragOverTimer = null
    }
    if (isDraggingToNewWindow) {
      isDraggingToNewWindow = false
    }
  }
}

const handleGlobalDrop = async (event: DragEvent) => {
  // 检查是否是来自其他窗口的Tab拖拽
  if (!event.dataTransfer) return

  try {
    const tabDataStr = event.dataTransfer.getData('application/x-metadoc-tab')
    if (!tabDataStr) return

    const tabTransferData = JSON.parse(tabDataStr)
    const sourceWindowId = tabTransferData.sourceWindowId
    const currentWindowId = await getCurrentWindowId()

    // 如果是来自其他窗口的Tab
    if (sourceWindowId && sourceWindowId !== currentWindowId) {
      // 检查是否可以拖拽到其他窗口
      if (!tabTransferData.canDragToOtherWindow) {
        logger.warn('系统Tab或工具Tab不允许拖拽到其他窗口')
        return
      }

      // 计算插入位置
      const tabsEl = tabsRef.value?.$el || tabsRef.value
      let insertIndex = allTabs.value.length
      
      if (tabsEl && tabsEl instanceof HTMLElement) {
        const allItems = tabsEl.querySelectorAll('.el-tabs__item')
        
        for (let i = 0; i < allItems.length; i++) {
          const item = allItems[i]
          if (!(item instanceof HTMLElement)) continue
          const rect = item.getBoundingClientRect()
          if (event.clientX < rect.left + rect.width / 2) {
            const ariaControls = item.getAttribute('aria-controls')
            if (ariaControls) {
              const paneId = ariaControls.replace(/^pane-/, '')
              const targetIndex = allTabs.value.findIndex(t => t.id === paneId)
              if (targetIndex !== -1) {
                insertIndex = targetIndex
                break
              }
            }
          }
        }
      }

      // 通过主进程转发Tab到当前窗口
      if (ipcRenderer) {
        ipcRenderer.send('transfer-tab-to-window', {
          targetWindowId: currentWindowId,
          tabData: tabTransferData,
          insertIndex
        })
      }
    }
  } catch (error) {
    logger.error('处理窗口间Tab拖拽失败:', error)
  }
}

// 从拖拽添加Tab
const addTabFromDrag = async (tabTransferData: any, insertIndex?: number) => {
  try {
    const { tab, document } = tabTransferData

    if (!tab) {
      logger.error('Tab数据无效:', tabTransferData)
      return
    }

    // 检查Tab是否已存在（避免重复添加）
    const existingTab = workspace.tabs.find(t => t.id === tab.id)
    if (existingTab) {
      logger.warn('Tab已存在，直接激活:', tab.id)
      workspace.activateTab(tab.id)
      return
    }

    // 工具/系统 Tab：若目标窗口已有相同 toolType 或 route，激活而非重复添加
    if (tab.kind === 'tool' && tab.toolType) {
      const sameTool = workspace.tabs.find(t => t.kind === 'tool' && t.toolType === tab.toolType)
      if (sameTool) {
        workspace.activateTab(sameTool.id)
        return
      }
    }
    if (tab.kind === 'system' && tab.route) {
      const sameSystem = workspace.tabs.find(t => t.kind === 'system' && t.route === tab.route)
      if (sameSystem) {
        workspace.activateTab(sameSystem.id)
        return
      }
    }

    // 由 Tab 拖出创建的新窗口：移除 ensureInitialTab 创建的空白“新建文档”Tab
    const emptyNewTabs = workspace.tabs.filter(
      t => t.kind === 'new' && (!t.path || t.path === '') && !t.dirty
    )
    emptyNewTabs.forEach(t => workspace.removeTab(t.id))

    // 添加Tab
    if (insertIndex !== undefined && insertIndex >= 0 && insertIndex < allTabs.value.length) {
      workspace.tabs.splice(insertIndex, 0, tab)
    } else {
      workspace.tabs.push(tab)
    }

    // 如果是文档Tab，恢复文档内容（包括新文档和未保存的文档）
    if ((tab.kind === 'file' || tab.kind === 'new') && document) {
      try {
        // 确保文档存在
        const doc = workspace.ensureDocument(tab.id)
        
        // 恢复文档内容（包括所有状态）
        doc.markdown = document.markdown || ''
        doc.tex = document.tex || ''
        doc.outline = document.outline || doc.outline
        doc.meta = document.meta || doc.meta
        doc.aiDialogs = document.aiDialogs || doc.aiDialogs
        doc.agentSessions = document.agentSessions || doc.agentSessions
        doc.lastView = document.lastView || doc.lastView
        if (document.activeAgentSessionId !== undefined) {
          doc.activeAgentSessionId = document.activeAgentSessionId
        }
        doc.renderedHtml = document.renderedHtml || ''
        // 重要：保持dirty状态
        doc.dirty = document.dirty !== undefined ? document.dirty : false
        doc.savedMarkdown = document.savedMarkdown !== undefined ? document.savedMarkdown : doc.markdown
        doc.savedTex = document.savedTex !== undefined ? document.savedTex : doc.tex
        doc.savedOutline = document.savedOutline || doc.outline
        doc.savedMeta = document.savedMeta || doc.meta
        doc.savedAiDialogs = document.savedAiDialogs || doc.aiDialogs
        doc.savedAgentSessions = document.savedAgentSessions || doc.agentSessions
        // 关键：恢复 path 和 format，否则保存会无反应（会当作“新文件”）
        doc.path = document.path ?? doc.path ?? ''
        doc.format = document.format ?? doc.format ?? tab.format
        tab.path = doc.path
        tab.format = doc.format
        if (doc.path) {
          tab.subtitle = doc.path.split(/[/\\]/).filter(Boolean).pop() || tab.subtitle || ''
        }
        
        // 确保Tab的dirty状态也同步
        tab.dirty = doc.dirty
      } catch (error) {
        logger.warn('恢复文档内容失败，可能是新文档:', error)
        // 对于新文档，即使ensureDocument失败也要继续
      }
    }

    // 工具 Tab：恢复当前选中的会话/对话索引
    if (tab.kind === 'tool' && tabTransferData.toolState) {
      workspace.setTabToolState(tab.id, tabTransferData.toolState)
    }

    // 激活Tab
    await nextTick()
    workspace.activateTab(tab.id)
    
    logger.info('成功添加并激活Tab:', tab.id, { kind: tab.kind, dirty: tab.dirty })
  } catch (error) {
    logger.error('添加Tab失败:', error)
  }
}

// 拖拽后移除Tab
const removeTabAfterDrag = async (tabId: string, windowId: number) => {
  try {
    const tabIndex = workspace.tabs.findIndex(t => t.id === tabId)
    const wasActive = workspace.activeTabId.value === tabId
    
    // 移除Tab
    if (tabIndex !== -1) {
      workspace.tabs.splice(tabIndex, 1)
    }
    
    // 若移除的是当前激活Tab，需激活其他Tab，避免黑屏
    if (wasActive && workspace.tabs.length > 0) {
      const nextIndex = Math.min(tabIndex, workspace.tabs.length - 1)
      const nextTab = workspace.tabs[nextIndex >= 0 ? nextIndex : 0]
      if (nextTab) {
        workspace.activateTab(nextTab.id)
      }
    }

    // 检查窗口是否可以关闭
    if (ipcRenderer) {
      const { canClose, tabCount } = await ipcRenderer.invoke('check-window-can-close')
      if (canClose && tabCount === 0) {
        // 窗口可以关闭
        ipcRenderer.send('close-window')
      }
    }
  } catch (error) {
    logger.error('移除Tab失败:', error)
  }
}

// 在 Tab 项上添加拖拽事件监听（扩大拖拽区域）
onMounted(async () => {
  // 获取当前窗口ID
  getCurrentWindowId()

  // 获取当前窗口最大化状态并监听变化（用于标题栏最大化/还原图标）
  if (ipcRenderer) {
    try {
      isMaximized.value = await ipcRenderer.invoke('get-window-maximized')
    } catch {
      isMaximized.value = false
    }
    ipcRenderer.on('window-maximized-changed', (_e: any, maximized: boolean) => {
      isMaximized.value = maximized
    })
  }

  // Tab 右键菜单：点击外部关闭
  document.addEventListener('click', handleTabContextMenuClickOutside)

  // 添加全局拖拽事件监听（使用 capture 确保在内容区也能收到事件）
  document.addEventListener('dragover', handleGlobalDragOver, true)
  document.addEventListener('drop', handleGlobalDrop, true)

  // 监听来自主进程的Tab添加请求
  if (ipcRenderer) {
    ipcRenderer.on('add-tab-from-drag', async (_event: any, data: any) => {
      try {
        // 确保workspace已初始化
        await nextTick()
        
        const tabData = data.tabData || data
        const insertIndex = data.insertIndex
        
        if (!tabData || !tabData.tab) {
          logger.error('接收到的Tab数据无效:', data)
          return
        }
        
        await addTabFromDrag(tabData, insertIndex)
        logger.info('成功添加Tab到新窗口:', tabData.tab.id)
      } catch (error) {
        logger.error('添加Tab失败:', error)
      }
    })

    ipcRenderer.on('remove-tab-from-drag', async (_event: any, tabId: string) => {
      await removeTabAfterDrag(tabId, await getCurrentWindowId())
    })

    ipcRenderer.on('request-tab-count', () => {
      if (ipcRenderer) {
        ipcRenderer.send('window-tab-count-response', { tabCount: allTabs.value.length })
      }
    })
  }

  // 延迟执行，确保 DOM 已渲染
  nextTick(() => {
    const tabsEl = tabsRef.value?.$el || tabsRef.value
    if (!tabsEl || !(tabsEl instanceof HTMLElement)) return
    
    const setupTabItemDragListeners = () => {
      const allItems = tabsEl.querySelectorAll('.el-tabs__item')
      allItems.forEach((item) => {
        if (!(item instanceof HTMLElement)) return
        const ariaControls = item.getAttribute('aria-controls')
        if (!ariaControls) return
        const tabId = ariaControls.replace(/^pane-/, '')
        
        // 移除旧的事件监听器（如果存在）
        const existingHandler = (item as any).__dragOverHandler
        if (existingHandler) {
          item.removeEventListener('dragover', existingHandler)
        }
        
        // 添加新的事件监听器
        const handler = (e: DragEvent) => {
          if (isLocked.value) return
          if (!draggingId || draggingId === tabId) {
            dropPreview.targetId = null
            dropPreview.mode = null
            updateDropPreviewClasses()
            return
          }
          e.preventDefault()
          e.stopPropagation()
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'move'
          }
          // 使用整个 Tab 项来计算拖拽位置
          const mode = computeDropMode(e, item)
          const { targetId: normId, mode: normMode } = normalizeDropPreview(tabId, mode)
          dropPreview.targetId = normId
          dropPreview.mode = normMode
          updateDropPreviewClasses()
        }
        
        item.addEventListener('dragover', handler)
        ;(item as any).__dragOverHandler = handler
        
        // 添加 drop 事件
        const dropHandler = (e: DragEvent) => {
          e.preventDefault()
          e.stopPropagation()
          handleDrop(tabId, e)
        }
        item.addEventListener('drop', dropHandler)
        ;(item as any).__dropHandler = dropHandler
      })
    }
    
    setupTabItemDragListeners()
    
    // 监听 Tab 变化，重新设置事件监听器
    watch(() => allTabs.value.length, () => {
      nextTick(() => {
        setupTabItemDragListeners()
      })
    })
  })
})

// 监听activeTabId变化，确保路由同步（用于首次打开系统Tab时）
watch(() => workspace.activeTabId.value, (newTabId) => {
  const activeTab = allTabs.value.find(t => t.id === newTabId)
  if (activeTab && (activeTab.kind === 'system' || activeTab.kind === 'tool') && activeTab.route) {
    nextTick(() => {
      if (activeTab.route && activeTab.route !== route.path) {
        router.push(activeTab.route)
      }
    })
  }
}, { immediate: true })

// 监听路由变化，确保Tab与路由同步
watch(() => route.path, (newPath) => {
  // 如果当前激活的Tab有route，且与当前路由不匹配，需要更新Tab
  const activeTab = allTabs.value.find(t => t.id === workspace.activeTabId.value)
  if (activeTab && activeTab.route && activeTab.route !== newPath) {
    // 查找是否有匹配该路由的Tab
    const matchingTab = allTabs.value.find(t => t.route === newPath)
    if (matchingTab) {
      workspace.activateTab(matchingTab.id)
    }
  }
})

// 清理事件监听器
onUnmounted(() => {
  document.removeEventListener('click', handleTabContextMenuClickOutside)
  document.removeEventListener('dragover', handleGlobalDragOver, true)
  document.removeEventListener('drop', handleGlobalDrop, true)
  if (moveToWindowLeaveTimer) {
    clearTimeout(moveToWindowLeaveTimer)
    moveToWindowLeaveTimer = null
  }

  if (ipcRenderer) {
    ipcRenderer.removeAllListeners('add-tab-from-drag')
    ipcRenderer.removeAllListeners('remove-tab-from-drag')
    ipcRenderer.removeAllListeners('request-tab-count')
    ipcRenderer.removeAllListeners('window-maximized-changed')
  }
})
</script>

<style scoped>
.main-tabs-wrapper {
  display: flex;
  align-items: stretch;
  height: 40px;
  max-height: 40px;
  background-color: v-bind('tabsContainerBackgroundColor');
  user-select: none;
  -webkit-user-select: none;
  /* -webkit-app-region: drag; */
  position: relative;
  box-sizing: border-box;
}

/* 可交互元素需要禁用拖拽窗口功能 */
.main-tabs-wrapper .window-controls,
.main-tabs-wrapper .window-control-btn,
.main-tabs-wrapper .new-tab-button {
  -webkit-app-region: no-drag !important;
  position: relative;
  z-index: 10 !important;
}

/* Tab 项及其内部元素使用 :deep() 穿透 scoped 作用域设置 no-drag，
   注意：不要给 .el-tabs__header / .el-tabs__nav 等容器设 no-drag，
   否则 tab 间的空白区域也无法拖拽窗口 */
.main-tabs :deep(.el-tabs__item) {
  -webkit-app-region: no-drag !important;
}

.main-tab-label,
.main-tab-label__close {
  -webkit-app-region: no-drag !important;
  position: relative;
  z-index: 10;
}

.main-tabs-wrapper.is-locked {
  cursor: not-allowed;
  opacity: 0.9;
}

.main-tabs-wrapper.is-locked :deep(.el-tabs__item) {
  pointer-events: none;
  cursor: not-allowed !important;
  opacity: 0.6;
}

.tabs-container {
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
  min-height: 0;
  max-height: 40px;
  overflow: hidden;
  margin: 0;
  padding: 0;
  position: relative;
  gap: 0;
  box-sizing: border-box;
}

/* macOS 平台：左边预留空间给原生交通灯按钮 */
.macos-traffic-lights-spacer {
  width: 78px; /* macOS 原生按钮区域宽度 */
  min-width: 78px;
  flex-shrink: 0;
  height: 40px;
  -webkit-app-region: drag;
}

.main-tabs {
  flex: 1;
  height: 100%;
  max-height: 40px;
  border:none;
  height: 40px;
  min-height: 40px;
  overflow: hidden;
  min-width: 0;
  max-width: 100%;
  --tab-count: v-bind('tabCount');
  background-color: v-bind('tabsContainerBackgroundColor');
  position: relative;
  z-index: 1;
  -webkit-app-region: drag;
  margin: 0;
  padding: 0;

}

/* Chrome样式的Tab宽度 */
.main-tabs :deep(.el-tabs__nav) {
  display: flex;
  width: 100%;
  max-width: 100%; /* 确保不会超出容器 */
  flex-wrap: nowrap;
  margin-right: 0; /* 确保没有右侧margin */
  padding-right: 0; /* 确保没有右侧padding */
}

.main-tabs :deep(.el-tabs__nav-wrap) {
  overflow: visible;
}

/* Tab宽度：统一宽度，模仿Chrome样式 - 所有Tab平均分配空间 */
.main-tabs :deep(.el-tabs__item) {
  flex: 1 1 0; /* 平均分配空间，允许缩小，像浏览器一样 */
  min-width: 0 !important; /* 无下限，允许无限缩小，使用 !important 覆盖 Element Plus 默认样式 */
  max-width: none !important; /* 默认无最大宽度限制 */
  width: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* 扩大拖拽区域：整个 Tab 项都可以接收拖拽事件 */
  position: relative;
  -webkit-app-region: no-drag !important;
}

/* 当Tab数量 <= 16时，设置最大宽度为200px */
.main-tabs :deep(.el-tabs__nav:not(:has(.el-tabs__item:nth-child(17)))) .el-tabs__item {
  max-width: 200px !important;
}

/* 确保 Element Plus 的 label 元素也可以缩小 */
.main-tabs :deep(.el-tabs__item .el-tabs__label) {
  min-width: 0 !important;
  width: 100%;
  max-width: 100%;
  overflow: hidden !important;
  flex-shrink: 1;
  /* 确保 label 容器不会阻止子元素缩小 */
  display: flex;
  align-items: center;
}

.main-tab-label {
  display: flex;
  align-items: center;
  gap: 4px;
  line-height: 1.2;
  width: 100%;
  min-width: 0 !important; /* 允许缩小到内容以下，使用 !important 确保生效 */
  max-width: 100%; /* 确保不会超出父容器 */
  height: 100%;
  white-space: nowrap;
  user-select: none;
  cursor: pointer;
  position: relative;
  flex-shrink: 1; /* 允许缩小 */
  box-sizing: border-box;
  overflow: hidden; /* 确保内容不会溢出 */
  /* 确保 flex 容器本身可以缩小 */
  flex: 0 1 auto;
}

.main-tab-label__text {
  font-size: 13px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
  overflow: hidden !important; /* 确保溢出隐藏 */
  text-overflow: ellipsis !important; /* 确保显示省略号 */
  white-space: nowrap !important; /* 确保不换行 */
  flex: 1 1 0; /* 允许缩小 */
  min-width: 0 !important; /* 确保可以缩小到0 */
  max-width: 100%;
  /* 确保文本元素有明确的宽度限制，text-overflow 才能生效 */
  width: 0; /* 设置为 0，让 flex: 1 来控制宽度 */
}

/* 活跃 Tab：斜体、正色 */
/* 活跃 Tab：正色 */
.main-tabs :deep(.el-tabs__item.is-active .main-tab-label__text) {
  font-weight: 400;
  color: var(--el-text-color-primary);
}

/* 预览 Tab：斜体（与是否活跃无关） */
.main-tab-label.is-preview .main-tab-label__text {
  font-style: italic;
}

.main-tab-label__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--el-text-color-primary);
  flex-shrink: 0;
}

.main-tabs :deep(.el-tabs__header.is-top) {
  margin: 0;
  margin-bottom: 0 !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
}

.main-tabs :deep(.el-tabs__item) {
  padding-left: 12px !important;
  padding-right: 2px !important;
  margin-left: 0 !important;
  margin-right: 2px !important;
  height: 40px;
  line-height: 40px;
  transition: background-color 0.15s ease, color 0.15s ease;
  margin-bottom: 0 !important;
  margin-top: 0px !important;
  /* margin-top: 0 !important;确保顶部仍然有可以拖动窗口的区域 */
  /* border-radius: 6px 6px 0 0; */
  /* 确保内容可以缩小 */
  box-sizing: border-box;
  overflow: hidden; /* 确保内容不会溢出 */
}

.main-tabs :deep(.el-tabs__nav-wrap) {
  margin-bottom: 0 !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
  height: 40px;
}

/* 确保Tab下方没有缝隙，且不产生额外 1px（无 border、无溢出） */
.main-tabs :deep(.el-tabs__header) {
  margin: 0 !important;
  padding: 0 !important;
  height: 40px !important;
  max-height: 40px !important;
  border: none !important;
  overflow: hidden;
  box-sizing: border-box;
}

.main-tabs :deep(.el-tabs__nav-scroll) {
  height: 40px;
  padding-left: 0 !important;
  padding-right: 0 !important;
}

.main-tabs :deep(.el-tabs__nav) {
  margin-bottom: 0 !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
  height: 40px;
  /* 移除 Element Plus card tabs 默认的 border-top（1px），
     该 border 会在 tab 顶部形成一个属于 drag 区域的死区，
     导致最大化时点击屏幕最顶部无法选中 tab */
  border: none !important;
  border-radius: 0 !important;
}

.main-tabs :deep(.el-tabs__item) {
  background-color: v-bind('tabItemBackgroundColor');
}

.main-tabs :deep(.el-tabs__item.is-active) {
  background-color: v-bind('tabItemActiveBackgroundColor');
  color: var(--el-text-color-primary);
}

.main-tabs :deep(.el-tabs__item:not(.is-active):hover) {
  background-color: v-bind('tabItemHoverBackgroundColor');
}

/* 隐藏Element Plus原有的关闭按钮 */
.main-tabs :deep(.el-tabs__item .el-icon-close) {
  display: none !important;
}

.main-tab-label__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  /* 使用 relative 定位，让关闭按钮参与父容器 flex 布局实现垂直居中 */
  position: relative;
  margin: 0;
  border-radius: 3px;
  cursor: pointer;
  color: var(--el-text-color-primary);
  transition: all 0.2s ease;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
  z-index: 10;
  padding: 0;
  /* 默认所有Tab的关闭按钮都显示 */
  opacity: 1;
  pointer-events: auto;
}

/* 活跃Tab的关闭按钮：始终显示 */
.main-tab-label__close--active {
  opacity: 1 !important;
  pointer-events: auto !important;
  visibility: visible !important;
}

.main-tab-label__close:hover {
  background-color: var(--el-fill-color-light, rgba(0, 0, 0, 0.1));
  color: var(--el-text-color-primary);
  /* box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1); */
}

.main-tab-label__close .el-icon {
  font-size: 12px;
}

/* 拖拽高亮样式 */
.main-tabs :deep(.el-tabs__item.drop-before) {
  position: relative;
}

.main-tabs :deep(.el-tabs__item.drop-before::before) {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background-color: var(--el-color-primary);
  z-index: 10;
  /* border-radius: 0 2px 2px 0; */
}

.main-tabs :deep(.el-tabs__item.drop-after) {
  position: relative;
}

.main-tabs :deep(.el-tabs__item.drop-after::after) {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background-color: var(--el-color-primary);
  z-index: 10;
  /* border-radius: 2px 0 0 2px; */
}

/* 窗口控制按钮样式 - 与 tabs 区域同高，严禁底部凸出 */
.window-controls {
  display: flex;
  align-items: center;
  align-self: stretch;
  height: 40px;
  min-height: 40px;
  max-height: 40px;
  margin: 0;
  padding: 0 4px;
  border: none;
  border-left: 1px solid color-mix(in srgb, v-bind('borderColor') 12%, transparent);
  gap: 4px;
  flex-shrink: 0;
  overflow: hidden;
  box-sizing: border-box;
  line-height: 0;
}

.window-control-btn {
  width: 32px;
  height: 32px;
  min-height: 32px;
  max-height: 32px;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  color: var(--el-text-color-primary);
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  box-sizing: border-box;
  line-height: 0;
}

.window-control-btn:hover {
  background-color: var(--el-fill-color-light, rgba(0, 0, 0, 0.06));
}

.window-control-btn--close:hover {
  background-color: var(--el-color-danger);
  color: #ffffff;
}

.window-control-btn .el-icon {
  font-size: 16px;
  line-height: 0;
  display: block;
}

/* 标准窗口控制 SVG 图标 */
.window-control-icon {
  width: 16px;
  height: 16px;
  display: block;
  flex-shrink: 0;
  object-fit: contain;
}

.window-control-btn--close .window-control-icon--close {
  width: 14px;
  height: 14px;
}

/* 新建文档按钮样式 - 严禁底部凸出 */
.new-tab-button {
  width: 32px;
  height: 32px;
  min-height: 32px;
  max-height: 32px;
  margin: 0 0 0 20px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  color: var(--el-text-color-primary);
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  flex-shrink: 0;
  background-color: v-bind('tabItemBackgroundColor');
  -webkit-app-region: no-drag;
  position: relative;
  z-index: 10;
  box-sizing: border-box;
  line-height: 0;
  overflow: hidden;
}

.new-tab-button:hover:not(.is-locked) {
  background-color: v-bind('tabItemHoverBackgroundColor');
}

.new-tab-button.is-locked {
  cursor: not-allowed;
  opacity: 0.6;
}

.new-tab-button .el-icon {
  font-size: 16px;
  font-weight: 600;
  line-height: 0;
  display: block;
}

/* Tab 右键菜单 - 参考 SessionList.item-menu 样式 */
.tab-context-menu {
  position: fixed;
  z-index: 1002;
  padding: 4px;
  border-radius: 8px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  min-width: 140px;
  width: max-content;
  max-width: 280px;
  border: 1px solid v-bind('tabContextMenuStyle.borderColor');
  display: flex;
  flex-direction: column;
}

.tab-context-menu__item {
  background: transparent;
  border: none;
  padding: 8px 10px;
  text-align: left;
  color: v-bind('tabContextMenuStyle.color');
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1.2;
  transition: background-color 0.2s ease;
  width: 100%;
}

.tab-context-menu__item:hover {
  background-color: rgba(64, 158, 255, 0.16);
}

.tab-context-menu__divider {
  height: 1px;
  margin: 4px 0;
  background-color: v-bind('tabContextMenuStyle.borderColor');
  opacity: 0.5;
}

.tab-context-menu__submenu-trigger {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: left;
}

.tab-context-menu__submenu-trigger .arrow-icon {
  margin-left: 8px;
  font-size: 12px;
  flex-shrink: 0;
  line-height: 1;
}

.tab-context-menu__submenu {
  position: absolute;
  left: 100%;
  top: 0;
  margin-left: 4px;
  min-width: 160px;
  max-height: 240px;
  overflow-y: auto;
  padding: 4px;
  border-radius: 8px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  border: 1px solid v-bind('tabContextMenuStyle.borderColor');
  background-color: v-bind('tabContextMenuStyle.backgroundColor');
  display: flex;
  flex-direction: column;
}

.tab-context-menu__empty {
  padding: 8px 10px;
  font-size: 13px;
  color: v-bind('tabContextMenuStyle.color');
  opacity: 0.6;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

