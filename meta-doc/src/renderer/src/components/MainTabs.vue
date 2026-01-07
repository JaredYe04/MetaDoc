<template>
  <div class="main-tabs-wrapper" :class="{ 'is-locked': isLocked }" @dblclick="handleDoubleClick">
    <!-- Logo Tab (最左侧，不可选中) -->
    <div class="logo-tab-wrapper">
      <el-tooltip :content="versionTooltip" placement="bottom">
        <div class="logo-tab" @click="handleLogoClick">
          <img src="../assets/logo.svg" alt="MetaDoc" class="logo-tab__image" />
        </div>
      </el-tooltip>
    </div>
    
    <!-- 关于对话框 -->
    <el-dialog
      v-model="aboutDialogVisible"
      :title="$t('setting.about.appName')"
      width="600px"
      :close-on-click-modal="true"
      :close-on-press-escape="true"
    >
      <SettingAboutSection />
    </el-dialog>
    
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
              :title="getTabTooltip(tab)"
              @mousedown.stop
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
    
    <!-- 窗口控制按钮 (最右侧) -->
    <div class="window-controls">
      <div class="window-control-btn" @click="handleMinimize">
        <el-icon><Minus /></el-icon>
      </div>
      <div class="window-control-btn" @click="handleMaximize">
        <el-icon><FullScreen /></el-icon>
      </div>
      <div class="window-control-btn window-control-btn--close" @click="handleClose">
        <el-icon><Close /></el-icon>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch, nextTick, onMounted } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useRouter, useRoute } from 'vue-router'
import { useWorkspace, type WorkspaceTab } from '../stores/workspace'
import eventBus from '../utils/event-bus'
import { createRendererLogger } from '../utils/logger'
import { Minus, FullScreen, Close, Plus } from '@element-plus/icons-vue'
import { getAppVersion } from '../utils/version'
import { mixColors, themeState } from '../utils/themes'
import SettingAboutSection from '../views/setting/SettingAboutSection.vue'

const logger = createRendererLogger('MainTabs')
const { t } = useI18n()
const router = useRouter()
const route = useRoute()

const workspace = useWorkspace()
const tabsRef = ref<any>(null)
const appVersion = ref<string>('')
const aboutDialogVisible = ref(false)

const isLocked = computed(() => workspace.uiLocked?.value === true)

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

// 获取应用版本
onMounted(async () => {
  try {
    appVersion.value = await getAppVersion()
  } catch (error) {
    logger.warn('获取应用版本失败:', error)
    appVersion.value = 'Unknown'
  }
})

const versionTooltip = computed(() => {
  if (!appVersion.value) return `版本 ...`
  return `版本 ${appVersion.value}`
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
  if (target.closest('.logo-tab-wrapper') || 
      target.closest('.main-tabs') || 
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
  eventBus.emit('quit')
}

// 点击Logo打开关于对话框
const handleLogoClick = () => {
  aboutDialogVisible.value = true
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
  // 所有Tab都可以拖拽来改变顺序
  return !isLocked.value
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

// 自定义关闭Tab处理函数
const handleCloseTab = async (tabId: string) => {
  if (isLocked.value) return
  
  const tab = allTabs.value.find(t => t.id === tabId)
  if (!tab) return
  
  if (!workspace.canRemoveTab(tabId)) {
    return
  }
  
  // 获取ipcRenderer
  let ipcRenderer: any = null
  if (window && (window as any).electron) {
    ipcRenderer = (window as any).electron.ipcRenderer
  }
  
  // 如果是文档Tab且有未保存内容，需要确认
  if (tab.kind === 'file' || tab.kind === 'new') {
    const doc = workspace.documents[tabId]
    if (doc?.dirty) {
      if (!ipcRenderer) {
        try {
          await ElMessageBox.confirm(
            t('main.dialogs.closeTabMessage'),
            t('main.dialogs.closeTabTitle'),
            {
              type: 'warning',
              confirmButtonText: t('main.dialogs.closeTabConfirm'),
              cancelButtonText: t('main.dialogs.closeTabCancel'),
            },
          )
        } catch {
          return
        }
      } else {
        try {
          ipcRenderer.send('request-close-tab', tabId)
          const result = await new Promise<{ tabId: string; action: 'save' | 'discard' | 'cancel' }>((resolve) => {
            const handler = (_event: any, response: { tabId: string; action: 'save' | 'discard' | 'cancel' }) => {
              if (response.tabId === tabId) {
                ipcRenderer.removeListener('close-tab-response', handler)
                resolve(response)
              }
            }
            ipcRenderer.on('close-tab-response', handler)
            setTimeout(() => {
              ipcRenderer.removeListener('close-tab-response', handler)
              resolve({ tabId, action: 'cancel' })
            }, 10000)
          })
          
          if (result.action === 'save') {
            const { saveDocument } = workspace
            const saveResult = await saveDocument(tabId, { saveAs: false })
            if (!saveResult) {
              return
            }
          } else if (result.action === 'cancel') {
            return
          }
        } catch (error) {
          logger.error('关闭tab失败:', error)
          return
        }
      }
    }
  }
  
  workspace.removeTab(tabId)
}

const handleRemove = async (id: string | number) => {
  // 这个函数保留用于兼容，但实际使用handleCloseTab
  await handleCloseTab(String(id))
}

// 拖拽相关
let draggingId: string | null = null
type DropMode = 'before' | 'after'
const dropPreview = reactive<{ targetId: string | null; mode: DropMode | null }>({
  targetId: null,
  mode: null,
})

const computeDropMode = (e: DragEvent, tabItemEl: HTMLElement): DropMode => {
  const rect = tabItemEl.getBoundingClientRect()
  const x = e.clientX - rect.left
  const w = rect.width
  const midPoint = w / 2
  return x < midPoint ? 'before' : 'after'
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

const handleDragStart = (id: string, event: DragEvent) => {
  if (isLocked.value) {
    event.preventDefault()
    return
  }
  draggingId = id
  event.dataTransfer?.setData('text/plain', id)
  if (event.dataTransfer) {
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
  dropPreview.targetId = targetId
  dropPreview.mode = mode
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
  const mode = dropPreview.mode
  
  if (!fromId || fromId === targetId || !mode) {
    draggingId = null
    dropPreview.targetId = null
    dropPreview.mode = null
    updateDropPreviewClasses()
    return
  }
  
  const fromIndex = allTabs.value.findIndex((tab) => tab.id === fromId)
  const targetIndex = allTabs.value.findIndex((tab) => tab.id === targetId)
  
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

const handleDragEnd = () => {
  draggingId = null
  dropPreview.targetId = null
  dropPreview.mode = null
  updateDropPreviewClasses()
}

// 在 Tab 项上添加拖拽事件监听（扩大拖拽区域）
onMounted(() => {
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
          dropPreview.targetId = tabId
          dropPreview.mode = mode
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
</script>

<style scoped>
.main-tabs-wrapper {
  display: flex;
  align-items: center;
  height: 40px;
  background-color: v-bind('tabsContainerBackgroundColor');
  border-bottom: 1px solid v-bind('borderColor');
  user-select: none;
  -webkit-user-select: none;
  /* 整个容器支持拖拽窗口 */
  -webkit-app-region: drag;
  position: relative;
}

/* 可交互元素需要禁用拖拽窗口功能 */
.main-tabs-wrapper .logo-tab-wrapper,
.main-tabs-wrapper .logo-tab-wrapper *,
.main-tabs-wrapper .window-controls,
.main-tabs-wrapper .window-controls *,
.main-tabs-wrapper .main-tab-label,
.main-tabs-wrapper .main-tab-label *,
.main-tabs-wrapper .main-tab-label__close,
.main-tabs-wrapper .window-control-btn,
.main-tabs-wrapper .el-tooltip,
.main-tabs-wrapper .el-tabs__item,
.main-tabs-wrapper .el-tabs__item *,
.main-tabs-wrapper .el-tabs__nav,
.main-tabs-wrapper .el-tabs__nav *,
.main-tabs-wrapper .el-tabs__header,
.main-tabs-wrapper .el-tabs__header *,
.main-tabs-wrapper .el-tabs__nav-wrap,
.main-tabs-wrapper .el-tabs__nav-wrap *,
.main-tabs-wrapper .el-tabs__active-bar,
.main-tabs-wrapper .new-tab-button {
  -webkit-app-region: no-drag !important;
  position: relative;
  z-index: 10 !important;
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
  position: relative;
  gap: 0; /* 确保没有间隙 */
}

.main-tabs {
  flex: 1;
  border-bottom: none;
  min-width: 0; /* 允许flex收缩 */
  max-width: 100%; /* 确保不会超出容器 */
  --tab-count: v-bind('tabCount'); /* CSS变量：Tab数量 */
  background-color: v-bind('tabsContainerBackgroundColor');
  position: relative;
  z-index: 1;
  /* 确保tabs容器本身可以拖动（空白区域） */
  -webkit-app-region: drag;
  margin-right: 0; /* 确保没有右侧margin */
  padding-right: 0; /* 确保没有右侧padding */
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
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden !important; /* 确保溢出隐藏 */
  text-overflow: ellipsis !important; /* 确保显示省略号 */
  white-space: nowrap !important; /* 确保不换行 */
  flex: 1 1 0; /* 允许缩小 */
  min-width: 0 !important; /* 确保可以缩小到0 */
  max-width: 100%;
  /* 确保文本元素有明确的宽度限制，text-overflow 才能生效 */
  width: 0; /* 设置为 0，让 flex: 1 来控制宽度 */
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
  margin-left: 1px !important;
  margin-right: 1px !important;
  height: 40px;
  line-height: 40px;
  transition: background-color 0.15s ease, color 0.15s ease;
  margin-bottom: 0 !important;
  margin-top: 0 !important;
  border-radius: 6px 6px 0 0;
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

/* 确保Tab下方没有缝隙 */
.main-tabs :deep(.el-tabs__header) {
  margin-bottom: 0 !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  padding-bottom: 0 !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
  height: 40px;
  padding-top: 0 !important;
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
}

.main-tabs :deep(.el-tabs__item) {
  background-color: v-bind('tabItemBackgroundColor');
}

.main-tabs :deep(.el-tabs__item.is-active) {
  background-color: v-bind('tabItemActiveBackgroundColor');
  color: var(--el-color-primary);
  border-radius: 6px 6px 0 0;
  font-weight: 600;
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
  position: absolute;
  right: 2px; 
  top: 0;
  bottom: 0;
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
  background-color: var(--el-fill-color-light, rgba(0, 0, 0, 0.06));
  color: var(--el-text-color-primary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
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
  border-radius: 0 2px 2px 0;
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
  border-radius: 2px 0 0 2px;
}

/* Logo Tab 样式 - 宽度与LeftMenu保持一致 */
.logo-tab-wrapper {
  display: flex;
  align-items: center;
  padding: 0 8px;
  height: 40px;
  width: 64px; /* 与LeftMenu折叠状态宽度一致 */
  min-width: 64px;
  flex-shrink: 0;
  border-right: 1px solid v-bind('borderColor');
  position: relative;
  z-index: 1;
}

.logo-tab {
  width: 100%;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  transition: background-color 0.2s ease;
}

.logo-tab:hover {
  background-color: var(--el-fill-color-light, rgba(0, 0, 0, 0.06));
}

.logo-tab__image {
  width: 24px;
  height: 24px;
  display: block;
}

/* 窗口控制按钮样式 */
.window-controls {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 4px;
  border-left: 1px solid v-bind('borderColor');
  gap: 4px;
}

.window-control-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  color: var(--el-text-color-primary);
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
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
}

/* 新建文档按钮样式 */
.new-tab-button {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  color: var(--el-text-color-primary);
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  flex-shrink: 0;
  margin-left: 4px;
  margin-right: 0; /* 移除右侧margin，紧贴窗口控制按钮 */
  background-color: v-bind('tabItemBackgroundColor');
  -webkit-app-region: no-drag;
  position: relative;
  z-index: 10;
  /* 确保按钮紧贴 Tabs 列表，没有间隙 */
  padding: 0;
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
}
</style>

