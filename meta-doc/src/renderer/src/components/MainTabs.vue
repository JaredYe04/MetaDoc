<template>
  <div
    ref="tabsWrapperRef"
    class="main-tabs-wrapper"
    :class="{ 'is-locked': isLockedEffective }"
    @dblclick="handleDoubleClick"
    @dragover.prevent="handleWrapperDragOver"
    @wheel.prevent="handleTabWheel"
    @auxclick="handleWrapperAuxClick"
  >
    <!-- macOS 平台：左边预留空间给原生按钮 -->
    <div v-if="isMac" class="macos-traffic-lights-spacer"></div>

    <!-- Tab 区域：包含可滚动的 tab 列表 + 固定的新建按钮 -->
    <div class="tab-region">
      <div ref="tabsViewportRef" class="tabs-viewport">
        <div ref="tabsListRef" class="tabs-list">
          <div
            v-for="tab in allTabs"
            :key="tab.id"
            class="tab-item"
            :class="{
              'is-active': currentActiveId === tab.id,
              'is-pinned': tab.pinned,
              'drop-before': dropPreview.targetId === tab.id && dropPreview.mode === 'before',
              'drop-after': dropPreview.targetId === tab.id && dropPreview.mode === 'after'
            }"
            :data-tab-id="tab.id"
            @click.stop="handleTabClickActivate(tab)"
            @mousedown="handleTabMouseDown($event, tab)"
            @dblclick.stop="handleTabLabelDblclick(tab)"
            @contextmenu.prevent="openTabContextMenu($event, tab)"
            @auxclick.stop.prevent="handleTabItemAuxClick($event, tab)"
            :draggable="canDragTab(tab)"
            @dragstart.stop="handleDragStart(tab.id, $event)"
            @dragover.prevent="handleDragOver(tab.id, $event)"
            @dragleave="handleDragLeave"
            @drop.stop="handleDrop(tab.id, $event)"
            @dragend.stop="handleDragEnd($event)"
          >
            <div
              class="main-tab-label"
              :class="{ 'is-preview': tab.preview, 'is-pinned': tab.pinned }"
              :title="getTabTooltip(tab)"
            >
              <span v-if="tab.pinned" class="main-tab-label__pinned-icon">
                {{ getTabLabel(tab).charAt(0).toUpperCase() }}
              </span>
              <span v-else class="main-tab-label__text">{{ getTabLabel(tab) }}</span>
              <span v-if="tab.dirty && !tab.pinned" class="main-tab-label__dot" />
              <span
                v-if="canCloseTab(tab) && !tab.pinned"
                class="main-tab-label__close"
                :class="{ 'main-tab-label__close--active': currentActiveId === tab.id }"
                @click.stop="handleCloseTab(tab.id)"
                @mousedown.stop
                @dragstart.stop
              >
                <el-icon><Close /></el-icon>
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 新建文档按钮 - 在 scroll 外面，永远可见 -->
      <div
        class="new-tab-button"
        :class="{ 'is-locked': isLockedEffective }"
        @click="handleNewTabClick"
        title="新建文档"
      >
        <el-icon><Plus /></el-icon>
      </div>
    </div>

    <!-- 窗口控制按钮 (最右侧) - 仅在非 macOS 平台显示，使用主题图标 -->
    <div v-if="!isMac" class="window-controls">
      <div class="window-control-btn" @click="handleMinimize">
        <img
          class="window-control-icon"
          :src="windowControlIcons.minimize"
          alt=""
          aria-hidden="true"
        />
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
        <svg
          class="window-control-icon window-control-icon--close"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M2 2l8 8M10 2L2 10" />
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
        <!-- 固定/取消固定标签页 -->
        <button
          type="button"
          class="tab-context-menu__item"
          @click="handleContextMenuAction('togglePin')"
        >
          {{
            tabContextMenuTab?.pinned
              ? t('mainTabs.contextMenu.unpinTab')
              : t('mainTabs.contextMenu.pinTab')
          }}
        </button>
        <button
          type="button"
          class="tab-context-menu__item"
          @click="handleContextMenuAction('closeTab')"
        >
          {{ t('mainTabs.contextMenu.closeTab') }}
        </button>
        <button
          type="button"
          class="tab-context-menu__item"
          @click="handleContextMenuAction('closeOtherTabs')"
        >
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
          <button
            type="button"
            class="tab-context-menu__item"
            @click="handleContextMenuAction('copyPath')"
          >
            {{ t('mainTabs.contextMenu.copyPath') }}
          </button>
          <button
            type="button"
            class="tab-context-menu__item"
            @click="handleContextMenuAction('copyTitle')"
          >
            {{ t('mainTabs.contextMenu.copyTitle') }}
          </button>
          <button
            type="button"
            class="tab-context-menu__item"
            @click="handleContextMenuAction('copyFilename')"
          >
            {{ t('mainTabs.contextMenu.copyFilename') }}
          </button>
          <button
            type="button"
            class="tab-context-menu__item"
            @click="handleContextMenuAction('showInFolder')"
          >
            {{ t('mainTabs.contextMenu.showInFolder') }}
          </button>
        </template>
        <div class="tab-context-menu__divider"></div>
        <button
          type="button"
          class="tab-context-menu__item"
          @click="handleContextMenuAction('moveLeft')"
        >
          {{ t('mainTabs.contextMenu.moveLeft') }}
        </button>
        <button
          type="button"
          class="tab-context-menu__item"
          @click="handleContextMenuAction('moveRight')"
        >
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
import messageBridge from '../bridge/message-bridge'
import { createRendererLogger } from '../utils/logger'
import { Close, Plus, ArrowRight } from '@element-plus/icons-vue'
import { mixColors, themeState } from '../utils/themes'
import { useCloseTab } from '../composables/useCloseTab'
import {
  useTabDrag,
  cleanupDragImage,
  serializeTabData,
  checkCanDragToOtherWindow,
  setTabBarElement,
  prefetchDragThumbnail
} from '../composables/useTabDrag'

// 主题中的窗口控制图标（themes.js 中注册，TS 无类型声明故用 Record 访问）
const windowControlIcons = computed(() => {
  const t = themeState.currentTheme as unknown as Record<string, string>
  return { minimize: t.MinimizeIcon, maximize: t.MaximizeIcon, restore: t.RestoreIcon }
})

const logger = createRendererLogger('MainTabs')
const { t } = useI18n()
const router = useRouter()
const route = useRoute()

const props = withDefaults(
  defineProps<{ mode?: 'normal' | 'demo' }>(),
  { mode: 'normal' }
)

const workspace = useWorkspace()
const tabsWrapperRef = ref<HTMLElement | null>(null)
const tabsViewportRef = ref<HTMLElement | null>(null)
const tabsListRef = ref<HTMLElement | null>(null)

const { closeTab, isLocked } = useCloseTab()
const isLockedEffective = computed<boolean>(() => props.mode === 'demo' || isLocked.value)

const DEMO_TABS: WorkspaceTab[] = [
  { id: 'demo-1', kind: 'file', title: '未命名', subtitle: '', path: '', format: 'md', dirty: false },
  { id: 'demo-2', kind: 'system', title: '用户手册', subtitle: '', path: '', format: 'md', dirty: false, route: '/user-manual' }
]

// 使用新的拖拽 composable
const {
  isDragging,
  draggingId,
  draggingTab,
  dropPreview,
  handleDragStart: handleTabDragStart,
  handleDragOver: handleTabDragOver,
  handleDragLeave: handleTabDragLeave,
  handleDrop: handleTabDrop,
  handleDragEnd: handleTabDragEnd,
  computeDropMode,
  findTabItemElement,
  resetDragState
} = useTabDrag({
  onDragStart: async (tab, event) => {
    await nextTick()
  },
  onDragEnd: async (tab, event) => {
    await nextTick()
  }
})

// Tab 右键菜单
const tabContextMenuVisible = ref(false)
const tabContextMenuPosition = ref<{ x: number; y: number } | null>(null)
const tabContextMenuTab = ref<WorkspaceTab | null>(null)
const showMoveToWindowSubmenu = ref(false)
const otherWindowsList = ref<Array<{ id: number; title: string }>>([])
let moveToWindowLeaveTimer: ReturnType<typeof setTimeout> | null = null

// 窗口是否最大化（用于标题栏最大化/还原图标切换）
const isMaximized = ref(false)

// 标签页滚动相关（只读 UI 状态，不影响布局 CSS）
const isOverflowing = ref(false)

// 检测标签页是否溢出：用真实几何尺寸判断，仅用于 UI 反馈（如滚动按钮），不切换布局
const checkTabOverflow = () => {
  const viewport = tabsViewportRef.value
  if (!viewport) return
  isOverflowing.value = viewport.scrollWidth > viewport.clientWidth + 1
}

const scrollActiveTabIntoView = () => {
  const viewport = tabsViewportRef.value
  if (!viewport) return
  const activeItem = viewport.querySelector('.tab-item.is-active') as HTMLElement | null
  if (!activeItem) return
  const itemLeft = activeItem.offsetLeft
  const itemRight = itemLeft + activeItem.offsetWidth
  const scrollLeft = viewport.scrollLeft
  const visibleRight = scrollLeft + viewport.clientWidth
  if (itemLeft < scrollLeft) {
    viewport.scrollTo({ left: itemLeft, behavior: 'smooth' })
  } else if (itemRight > visibleRight) {
    viewport.scrollTo({ left: itemRight - viewport.clientWidth, behavior: 'smooth' })
  }
}

const tabContextMenuStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  borderColor:
    themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
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
  if (isLockedEffective.value) return
  tabContextMenuVisible.value = true
  tabContextMenuPosition.value = { x: e.clientX, y: e.clientY }
  tabContextMenuTab.value = tab
  showMoveToWindowSubmenu.value = false
  try {
    if (messageBridge.getIpc() && canMoveToOtherWindow(tab)) {
      otherWindowsList.value = await messageBridge.invoke('get-all-windows')
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
    case 'togglePin':
      workspace.togglePinTab(tab.id)
      break
    case 'closeTab':
      await handleCloseTab(tab.id)
      break
    case 'closeOtherTabs':
      const otherIds = allTabs.value.filter((t) => t.id !== tab.id).map((t) => t.id)
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
      if (hasFileTabPath(tab) && tab.path && messageBridge.getIpc()) {
        await messageBridge.invoke('show-item-in-folder', tab.path)
      }
      break
    case 'moveLeft': {
      const fromIdx = workspace.tabs.findIndex((t) => t.id === tab.id)
      if (fromIdx > 0) {
        const [tabItem] = workspace.tabs.splice(fromIdx, 1)
        workspace.tabs.splice(fromIdx - 1, 0, tabItem)
        nextTick(() => workspace.activateTab(tab.id))
      }
      break
    }
    case 'moveRight': {
      const fromIdx = workspace.tabs.findIndex((t) => t.id === tab.id)
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
  if (!canMoveToOtherWindow(tab) || !messageBridge.getIpc()) return
  const tabData = serializeTabData(tab.id)
  if (!tabData) return

  const myWindowId = await getCurrentWindowId()
  // 新窗口位置：当前窗口中心偏右下方
  const position = {
    x: window.screenX + window.innerWidth / 2 + 40,
    y: window.screenY + window.innerHeight / 2 + 40
  }

  try {
    await messageBridge.invoke('create-window-with-tab', { tabData, position })
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
  if (!tabData || !messageBridge.getIpc()) return

  const myWindowId = await getCurrentWindowId()
  if (targetWindowId === myWindowId) return

  try {
    messageBridge.send('transfer-tab-to-window', {
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

// 不活跃Tab的文本颜色 - 根据主题类型设置更深的灰色
const inactiveTabTextColor = computed(() => {
  try {
    const isDark = themeState.currentTheme.type === 'dark'
    // 浅色模式：使用更深的灰色（接近黑色但仍是灰色）
    // 深色模式：使用更浅的灰色（接近白色但仍是灰色）
    // 不混合纯黑/白色，而是使用固定的灰色值，让对比更明显
    if (isDark) {
      // 深色模式：使用较浅的灰色，但比默认的 secondary 更深
      return '#bbbbbb' // 比 #cccccc 更深，但仍是灰色
    } else {
      // 浅色模式：使用较深的灰色，但比纯黑色浅
      return '#555555' // 比 #666666 更深，但仍是灰色
    }
  } catch {
    return themeState.currentTheme.type === 'dark' ? '#bbbbbb' : '#555555'
  }
})

// 窗口控制函数
const handleMinimize = () => {
  if (messageBridge.getIpc()) {
    messageBridge.send('window-minimize')
  }
}

const handleMaximize = () => {
  if (messageBridge.getIpc()) {
    messageBridge.send('window-maximize')
  }
}

// 双击标题栏最大化/还原
let lastClickTime = 0
const handleDoubleClick = (event: MouseEvent) => {
  // 检查是否在空白区域（不是可交互元素）
  const target = event.target as HTMLElement
  if (
    target.closest('.tab-item') ||
    target.closest('.window-controls') ||
    target.closest('.main-tab-label')
  ) {
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
  if (messageBridge.getIpc()) {
    messageBridge.send('close-window')
  } else {
    eventBus.emit('quit')
  }
}

// 点击新建文档按钮
const handleNewTabClick = () => {
  if (isLockedEffective.value) return
  workspace.openNewDocumentTab()
}

// 合并文档Tab和系统Tab、工具Tab，过滤掉空白页Tab；demo 模式用静态示例
const allTabs = computed(() => {
  if (props.mode === 'demo') return DEMO_TABS
  return workspace.tabs.filter((tab) => !(tab.kind === 'system' && tab.route === '/dummy'))
})

// 计算Tab数量，用于CSS变量
const tabCount = computed(() => allTabs.value.length)

const currentActiveId = computed({
  get: () => (props.mode === 'demo' ? 'demo-1' : workspace.activeTabId.value),
  set: (value: string) => {
    if (isLockedEffective.value) return
    if (props.mode === 'demo') return
    if (value !== workspace.activeTabId.value) {
      workspace.activateTab(value)
      // 如果Tab有route，切换路由（仅对系统Tab和工具Tab）
      const tab = allTabs.value.find((t) => t.id === value)
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
  }
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
  return !isLockedEffective.value
}

// 检查Tab是否可以拖拽到其他窗口（工具、系统 Tab 也可迁移）
const canDragToOtherWindow = (_tab: WorkspaceTab): boolean => {
  return true
}

// 处理 Tab 点击激活 - 通过 click 事件而非 mousedown
const handleTabClickActivate = (tab: WorkspaceTab) => {
  if (isLockedEffective.value) return
  if (tab.id === workspace.activeTabId.value) return

  workspace.activateTab(tab.id)
  if (tab.kind === 'system' || tab.kind === 'tool') {
    const toRoute = tab.route
    if (toRoute && toRoute !== route.path) {
      nextTick(() => router.push(toRoute))
    }
  }
}

// 在 mousedown 时预加载拖拽缩略图，但不切换 tab（避免拖拽时切换）
const handleTabMouseDown = async (event: MouseEvent, tab: WorkspaceTab) => {
  if (isLockedEffective.value) return
  // 如果点在关闭按钮上，不处理（让关闭按钮处理）
  const target = event.target as HTMLElement
  if (target.closest('.main-tab-label__close')) return
  event.stopPropagation()

  // Issue 7: 中键点击关闭 Tab
  if (event.button === 1) {
    event.preventDefault()
    handleCloseTab(tab.id)
    return
  }

  // 预加载拖拽缩略图（为 dragstart 做准备）
  prefetchDragThumbnail()

  // Issue 3: 不在 mousedown 时切换 tab，而是在 click 时切换
  // 拖拽操作会在 dragstart 时触发，不会影响这里的逻辑
}

// 处理 Tab 项的中键点击（关闭）
const handleTabItemAuxClick = (event: MouseEvent, tab: WorkspaceTab) => {
  if (event.button !== 1) return
  event.preventDefault()
  if (isLockedEffective.value) return
  handleCloseTab(tab.id)
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

// IPC 监听器引用（用于 onUnmounted 时移除）
let handlerMaximizedChanged: ((...args: any[]) => void) | null = null
let handlerAddTabFromDrag: ((...args: any[]) => void) | null = null
let handlerRemoveTabFromDrag: ((...args: any[]) => void) | null = null
let handlerRequestTabCount: (() => void) | null = null
let handlerDragCreateDetached: ((...args: any[]) => void) | null = null

const getCurrentWindowId = async (): Promise<number> => {
  if (!messageBridge.getIpc()) return -1
  try {
    return await messageBridge.invoke('get-window-id')
  } catch (error) {
    logger.error('获取窗口ID失败:', error)
    return -1
  }
}

type DropMode = 'before' | 'after'

// 检查拖拽位置是否合法（固定标签页约束）
const isDropPositionValid = (dragTabId: string, targetTabId: string, mode: DropMode): boolean => {
  const dragTab = allTabs.value.find((t) => t.id === dragTabId)
  const targetTab = allTabs.value.find((t) => t.id === targetTabId)
  if (!dragTab || !targetTab) return true

  // 固定标签页只能在固定区域内移动
  if (dragTab.pinned && !targetTab.pinned) return false
  // 非固定标签页不能进入固定区域
  if (!dragTab.pinned && targetTab.pinned) return false

  return true
}

// 归一化：同一缝隙只显示一条高亮线
const normalizeDropPreview = (
  targetId: string,
  mode: DropMode
): { targetId: string; mode: DropMode } => {
  if (mode === 'after') return { targetId, mode }
  const idx = allTabs.value.findIndex((t) => t.id === targetId)
  if (idx <= 0) return { targetId, mode }
  const prevTab = allTabs.value[idx - 1]
  return { targetId: prevTab.id, mode: 'after' }
}

const handleDragStart = async (id: string, event: DragEvent) => {
  if (isLockedEffective.value) {
    event.preventDefault()
    return
  }

  const tab = allTabs.value.find((t) => t.id === id)
  if (!tab) {
    event.preventDefault()
    return
  }

  handleTabDragStart(tab, event)
}

const handleDragOver = (targetId: string, event: DragEvent) => {
  if (isLockedEffective.value) return

  // 获取当前拖拽的 Tab
  const tab = allTabs.value.find((t) => t.id === targetId)
  if (!tab) return

  // 使用 useTabDrag 处理拖拽经过
  handleTabDragOver(tab, event)

  // 验证拖拽位置是否合法（固定标签页约束）
  if (dropPreview.value.targetId && dropPreview.value.mode && draggingId.value) {
    if (
      !isDropPositionValid(draggingId.value, dropPreview.value.targetId, dropPreview.value.mode)
    ) {
      // 位置不合法，清除预览
      dropPreview.value = { targetId: null, mode: null }
      return
    }
  }

  // 更新 dropPreview 样式
  if (dropPreview.value.targetId && dropPreview.value.mode) {
    const { targetId: normId, mode: normMode } = normalizeDropPreview(
      dropPreview.value.targetId,
      dropPreview.value.mode
    )
    // 更新 preview 为归一化后的值
    if (normId !== dropPreview.value.targetId || normMode !== dropPreview.value.mode) {
      // 这里不需要手动更新，因为 composable 会处理
    }
  }
}

const handleDragLeave = () => {
  handleTabDragLeave()
}

const handleDrop = async (targetId: string, event: DragEvent) => {
  if (isLockedEffective.value) return

  const tab = allTabs.value.find((t) => t.id === targetId)
  if (!tab) return

  // 验证拖拽位置是否合法（固定标签页约束）
  if (draggingId.value && dropPreview.value.targetId && dropPreview.value.mode) {
    if (
      !isDropPositionValid(draggingId.value, dropPreview.value.targetId, dropPreview.value.mode)
    ) {
      // 位置不合法，取消投放
      return
    }
  }

  // 使用 useTabDrag 处理投放
  await handleTabDrop(tab, event)

  // 重新激活当前 Tab
  nextTick(() => {
    const currentActiveId = workspace.activeTabId.value
    if (currentActiveId) {
      workspace.activateTab(currentActiveId)
    }
  })
}

const handleDragEnd = async (event: DragEvent) => {
  // Issue 2: 安全区 - 如果有有效的 dropPreview，先执行移动
  const preview = dropPreview.value
  if (preview.targetId && preview.mode && draggingId.value) {
    const fromId = draggingId.value
    const toId = preview.targetId
    const mode = preview.mode

    const fromIndex = workspace.tabs.findIndex((t) => t.id === fromId)
    const toIndex = workspace.tabs.findIndex((t) => t.id === toId)

    if (fromIndex !== -1 && toIndex !== -1 && fromId !== toId) {
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
    }
  }

  await handleTabDragEnd(event)
  cleanupDragImage()
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
    const existingTab = workspace.tabs.find((t) => t.id === tab.id)
    if (existingTab) {
      logger.warn('Tab已存在，直接激活:', tab.id)
      workspace.activateTab(tab.id)
      return
    }

    // 检查文件是否已在当前窗口打开（通过路径）
    if (tab.path && (tab.kind === 'file' || tab.kind === 'new')) {
      const existingFileTab = workspace.tabs.find((t) => t.path === tab.path)
      if (existingFileTab) {
        workspace.activateTab(existingFileTab.id)
        // 纠正注册表：所有权应属于当前窗口的现有 tab
        if (messageBridge.getIpc()?.invoke) {
          await messageBridge.invoke('transfer-file-ownership', {
            filePath: tab.path,
            newTabId: existingFileTab.id
          })
        }
        return
      }
    }

    // 工具/系统 Tab：若目标窗口已有相同 toolType 或 route，激活而非重复添加
    if (tab.kind === 'tool' && tab.toolType) {
      const sameTool = workspace.tabs.find((t) => t.kind === 'tool' && t.toolType === tab.toolType)
      if (sameTool) {
        workspace.activateTab(sameTool.id)
        return
      }
    }
    if (tab.kind === 'system' && tab.route) {
      const sameSystem = workspace.tabs.find((t) => t.kind === 'system' && t.route === tab.route)
      if (sameSystem) {
        workspace.activateTab(sameSystem.id)
        return
      }
    }

    // 由 Tab 拖出创建的新窗口：仅移除 ensureInitialTab 创建的占位 Tab
    const placeholders = workspace.tabs.filter((t) => t._isInitialPlaceholder)
    placeholders.forEach((t) => workspace.removeTab(t.id))

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
        doc.savedMarkdown =
          document.savedMarkdown !== undefined ? document.savedMarkdown : doc.markdown
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

    // 转移文件所有权到新窗口的 tab
    if (tab.path && (tab.kind === 'file' || tab.kind === 'new')) {
      if (messageBridge.getIpc()?.invoke) {
        await messageBridge.invoke('transfer-file-ownership', { filePath: tab.path, newTabId: tab.id })
      }
    }

    logger.info('成功添加并激活Tab:', tab.id, { kind: tab.kind, dirty: tab.dirty })
  } catch (error) {
    logger.error('添加Tab失败:', error)
  }
}

// 拖拽后移除Tab
const removeTabAfterDrag = async (tabId: string, windowId: number) => {
  try {
    const tab = workspace.tabs.find((t) => t.id === tabId)
    const tabIndex = workspace.tabs.findIndex((t) => t.id === tabId)
    const wasActive = workspace.activeTabId.value === tabId

    // 标记文件正在关闭
    if (tab?.path && messageBridge.getIpc()) {
      await messageBridge.invoke('mark-file-closing', tab.path)
    }

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
    if (messageBridge.getIpc()) {
      const { canClose, tabCount } = await messageBridge.invoke('check-window-can-close')
      if (canClose && tabCount === 0) {
        // 窗口可以关闭
        messageBridge.send('close-window')
      }
    }
  } catch (error) {
    logger.error('移除Tab失败:', error)
  }
}

// Issue 5 & 6: 处理 wrapper 的 dragover - 在 LogoTab 左侧和窗口控制按钮右侧显示指示器
const handleWrapperDragOver = (event: DragEvent) => {
  if (isLockedEffective.value) return
  if (!isDragging.value || !draggingId.value) return
  if (allTabs.value.length === 0) return

  // 获取 wrapper 的边界
  const wrapperRect = tabsWrapperRef.value?.getBoundingClientRect()
  if (!wrapperRect) return

  // 获取第一个和最后一个 tab 的位置
  const tabItems = tabsListRef.value?.querySelectorAll('.tab-item')
  if (!tabItems || tabItems.length === 0) return

  const firstTabRect = tabItems[0].getBoundingClientRect()
  const lastTabRect = tabItems[tabItems.length - 1].getBoundingClientRect()

  // 获取 LogoTab 和窗口控制按钮的宽度（估算）
  const logoWidth = isMac.value ? 78 : 0
  const controlsWidth = !isMac.value ? 140 : 0 // 窗口控制按钮约 140px

  // 计算 tab 区域的有效范围
  const tabAreaLeft = wrapperRect.left + logoWidth
  const tabAreaRight = wrapperRect.right - controlsWidth

  // Issue 5: 如果光标在第一个 tab 的左侧（LogoTab 区域），显示在第一个 tab 之前
  if (event.clientX < firstTabRect.left && event.clientX >= tabAreaLeft - 20) {
    const firstTabId = allTabs.value[0]?.id
    if (firstTabId && firstTabId !== draggingId.value) {
      dropPreview.value = { targetId: firstTabId, mode: 'before' }
    }
    return
  }

  // Issue 6: 如果光标在最后一个 tab 的右侧（窗口控制按钮区域），显示在最后一个 tab 之后
  if (event.clientX > lastTabRect.right && event.clientX <= tabAreaRight + 20) {
    const lastTabId = allTabs.value[allTabs.value.length - 1]?.id
    if (lastTabId && lastTabId !== draggingId.value) {
      dropPreview.value = { targetId: lastTabId, mode: 'after' }
    }
    return
  }
}

// Issue 8: 鼠标滚轮切换 tab
const handleTabWheel = (event: WheelEvent) => {
  if (isLockedEffective.value) return
  if (allTabs.value.length <= 1) return

  const currentIndex = allTabs.value.findIndex((t) => t.id === workspace.activeTabId.value)
  if (currentIndex === -1) return

  let newIndex: number
  if (event.deltaY > 0) {
    // 向下/右滚动 -> 下一个 tab
    newIndex = (currentIndex + 1) % allTabs.value.length
  } else {
    // 向上/左滚动 -> 上一个 tab
    newIndex = (currentIndex - 1 + allTabs.value.length) % allTabs.value.length
  }

  const newTab = allTabs.value[newIndex]
  if (newTab) {
    workspace.activateTab(newTab.id)
    nextTick(() => {
      scrollActiveTabIntoView()
      if ((newTab.kind === 'system' || newTab.kind === 'tool') && newTab.route) {
        if (newTab.route && newTab.route !== route.path) {
          router.push(newTab.route)
        }
      }
    })
    eventBus.emit('tab-switch-indicator', newTab.id)
  }
}

// 中键点击关闭 Tab（事件委托，覆盖 .tab-item 的完整区域）
const handleWrapperAuxClick = (event: MouseEvent) => {
  if (event.button !== 1) return
  event.preventDefault()
  event.stopPropagation()
  if (isLockedEffective.value) return
  const target = event.target as HTMLElement
  const tabItem = target.closest('.tab-item') as HTMLElement | null
  if (!tabItem) return
  const tabId = tabItem.dataset.tabId
  if (tabId) handleCloseTab(tabId)
}

// 在 Tab 项上添加拖拽事件监听（扩大拖拽区域）
onMounted(async () => {
  // 设置 Tab 栏元素引用（用于拖拽结束时的边界计算）
  setTabBarElement(tabsWrapperRef.value)

  // 获取当前窗口ID
  getCurrentWindowId()

  // 获取当前窗口最大化状态并监听变化（用于标题栏最大化/还原图标）
  if (messageBridge.getIpc()) {
    try {
      isMaximized.value = await messageBridge.invoke('get-window-maximized')
    } catch {
      isMaximized.value = false
    }
    handlerMaximizedChanged = (_e: any, maximized: boolean) => {
      isMaximized.value = maximized
    }
    messageBridge.on('window-maximized-changed', handlerMaximizedChanged)
  }

  // Tab 右键菜单：点击外部关闭
  document.addEventListener('click', handleTabContextMenuClickOutside)

  // 初始化标签页溢出检测
  nextTick(() => {
    checkTabOverflow()
    const viewport = tabsViewportRef.value
    if (viewport) {
      const resizeObserver = new ResizeObserver(() => checkTabOverflow())
      resizeObserver.observe(viewport)
    }
  })

  // 监听标签页数量变化，重新检查溢出
  watch(
    () => allTabs.value.length,
    () => {
      nextTick(() => checkTabOverflow())
    }
  )

  // 监听来自主进程的Tab添加请求
  if (messageBridge.getIpc()) {
    handlerAddTabFromDrag = async (_event: any, data: any) => {
      try {
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
    }
    messageBridge.on('add-tab-from-drag', handlerAddTabFromDrag)

    handlerRemoveTabFromDrag = async (_event: any, tabId: string) => {
      await removeTabAfterDrag(tabId, await getCurrentWindowId())
    }
    messageBridge.on('remove-tab-from-drag', handlerRemoveTabFromDrag)

    handlerRequestTabCount = () => {
      if (messageBridge.getIpc()) {
        messageBridge.send('window-tab-count-response', { tabCount: allTabs.value.length })
      }
    }
    messageBridge.on('request-tab-count', handlerRequestTabCount)

    handlerDragCreateDetached = async (_event: any, data: any) => {
      try {
        const { tabData, position, width, height } = data
        const newWindowId = await messageBridge.invoke('create-window-with-tab', {
          tabData,
          position,
          width,
          height
        })
        logger.info('通过拖拽分离创建新窗口:', newWindowId)
      } catch (error) {
        logger.error('创建分离窗口失败:', error)
      }
    }
    messageBridge.on('drag:create-detached-window', handlerDragCreateDetached)
  }
})

// 监听activeTabId变化，确保路由同步（用于首次打开系统Tab时）
watch(
  () => workspace.activeTabId.value,
  (newTabId) => {
    const activeTab = allTabs.value.find((t) => t.id === newTabId)
    if (
      activeTab &&
      (activeTab.kind === 'system' || activeTab.kind === 'tool') &&
      activeTab.route
    ) {
      nextTick(() => {
        if (activeTab.route && activeTab.route !== route.path) {
          router.push(activeTab.route)
        }
      })
    }
    nextTick(() => scrollActiveTabIntoView())
  },
  { immediate: true }
)

// 监听路由变化，确保Tab与路由同步
watch(
  () => route.path,
  (newPath) => {
    // 如果当前激活的Tab有route，且与当前路由不匹配，需要更新Tab
    const activeTab = allTabs.value.find((t) => t.id === workspace.activeTabId.value)
    if (activeTab && activeTab.route && activeTab.route !== newPath) {
      // 查找是否有匹配该路由的Tab
      const matchingTab = allTabs.value.find((t) => t.route === newPath)
      if (matchingTab) {
        workspace.activateTab(matchingTab.id)
      }
    }
  }
)

// 清理事件监听器
onUnmounted(() => {
  document.removeEventListener('click', handleTabContextMenuClickOutside)

  if (moveToWindowLeaveTimer) {
    clearTimeout(moveToWindowLeaveTimer)
    moveToWindowLeaveTimer = null
  }

  resetDragState()
  cleanupDragImage()

  if (handlerMaximizedChanged) {
    messageBridge.removeListener('window-maximized-changed', handlerMaximizedChanged)
  }
  if (handlerAddTabFromDrag) {
    messageBridge.removeListener('add-tab-from-drag', handlerAddTabFromDrag)
  }
  if (handlerRemoveTabFromDrag) {
    messageBridge.removeListener('remove-tab-from-drag', handlerRemoveTabFromDrag)
  }
  if (handlerRequestTabCount) {
    messageBridge.removeListener('request-tab-count', handlerRequestTabCount)
  }
  if (handlerDragCreateDetached) {
    messageBridge.removeListener('drag:create-detached-window', handlerDragCreateDetached)
  }
})
</script>

<style scoped>
.main-tabs-wrapper {
  display: flex;
  align-items: stretch;
  height: 40px;
  max-height: 40px;
  min-width: 0; /* 确保作为 flex item 时可以收缩 */
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
.main-tabs-wrapper .new-tab-button,
.main-tabs-wrapper .tab-item {
  -webkit-app-region: no-drag !important;
  position: relative;
  z-index: 10 !important;
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

.main-tabs-wrapper.is-locked .tab-item {
  pointer-events: none;
  cursor: not-allowed !important;
  opacity: 0.6;
}

/* macOS 平台：左边预留空间给原生交通灯按钮 */
.macos-traffic-lights-spacer {
  width: 78px; /* macOS 原生按钮区域宽度 */
  min-width: 78px;
  flex-shrink: 0;
  height: 40px;
  -webkit-app-region: drag;
}

/* Tab 区域：占满 spacer/window-controls 之间的空间 */
.tab-region {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  height: 40px;
  max-height: 40px;
  overflow: hidden;
}

/* 可滚动的 Tab 视口 —— 始终允许水平滚动，不再切换 overflow 模式 */
.tabs-viewport {
  flex: 1;
  min-width: 0;
  height: 40px;
  max-height: 40px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--el-border-color-darker, rgba(0, 0, 0, 0.2)) transparent;
}

.tabs-viewport::-webkit-scrollbar {
  height: 4px;
}

.tabs-viewport::-webkit-scrollbar-track {
  background: transparent;
}

.tabs-viewport::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color-darker, rgba(0, 0, 0, 0.2));
  border-radius: 2px;
}

/* Tab 列表容器 —— 统一模式，让 flex + min-width 自然产生溢出 */
.tabs-list {
  display: flex;
  flex-wrap: nowrap;
  height: 40px;
  margin: 0;
  padding: 0;
  background-color: v-bind('tabsContainerBackgroundColor');
  -webkit-app-region: drag;
}

/* 单个 Tab 项 —— 统一 flex 规则：未溢出时等分，溢出时自然滚动 */
.tab-item {
  display: flex;
  align-items: center;
  height: 40px;
  padding-left: 12px;
  padding-right: 2px;
  margin-right: 2px;
  box-sizing: border-box;
  cursor: pointer;
  user-select: none;
  -webkit-app-region: no-drag;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  position: relative;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
  background-color: v-bind('tabItemBackgroundColor');
  flex: 1 1 100px;
  min-width: 100px;
  max-width: 200px;
}

/* 活跃 Tab */
.tab-item.is-active {
  background-color: v-bind('tabItemActiveBackgroundColor');
  color: var(--el-text-color-primary);
}

/* 非活跃悬浮 */
.tab-item:not(.is-active):hover {
  background-color: v-bind('tabItemHoverBackgroundColor');
}

/* 固定标签页 */
.tab-item.is-pinned {
  flex: 0 0 auto;
  min-width: 36px;
  max-width: 36px;
  width: 36px;
  justify-content: center;
  padding: 0;
  overflow: hidden;
}

/* 固定与非固定分隔线 */
.tab-item.is-pinned + .tab-item:not(.is-pinned) {
  border-left: 2px solid var(--el-border-color, rgba(0, 0, 0, 0.1));
  margin-left: 4px;
}

/* 拖拽高亮 */
.tab-item.drop-before::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background-color: var(--el-color-primary);
  z-index: 10;
}

.tab-item.drop-after::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background-color: var(--el-color-primary);
  z-index: 10;
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
  color: v-bind('inactiveTabTextColor');
  overflow: hidden !important; /* 确保溢出隐藏 */
  text-overflow: ellipsis !important; /* 确保显示省略号 */
  white-space: nowrap !important; /* 确保不换行 */
  flex: 1 1 0; /* 允许缩小 */
  min-width: 0 !important; /* 确保可以缩小到0 */
  max-width: 100%;
  /* 确保文本元素有明确的宽度限制，text-overflow 才能生效 */
  width: 0; /* 设置为 0，让 flex: 1 来控制宽度 */
}

/* 活跃 Tab：正色 */
.tab-item.is-active .main-tab-label__text {
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

/* 固定标签页图标样式 */
.main-tab-label__pinned-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  user-select: none;
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
