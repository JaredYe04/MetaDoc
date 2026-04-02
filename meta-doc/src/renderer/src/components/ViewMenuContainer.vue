<template>
  <div class="view-menu-container-wrapper">
    <ResizableContainer
      ref="viewSidebarResizableRef"
      v-if="hasVisibleMenus"
      direction="vertical"
      storage-key="view-menu-sidebar"
      :initial-sidebar-size="sidebarSize"
      :min-size="200"
      :max-size="maxSidebarSize"
      :divider-size="5"
      :show-sidebar="hasVisibleMenus"
      :sidebar-position="'start'"
      :collapsible="true"
      :show-collapse-button="true"
      :auto-collapse-width="0"
      :collapse-button-title="$t('viewMenuContainer.collapse')"
      :expand-button-title="$t('viewMenuContainer.expand')"
      :seamless-divider="true"
      @collapse="handleCollapse"
      @resize="handleResize"
    >
      <template #sidebar>
        <div class="view-menu-container-sidebar">
          <!-- Tab 切换 -->
          <div v-if="hasMultipleTabs" class="sidebar-tabs">
            <Tooltip v-if="showAgentInSidebar">
              <TooltipTrigger as-child>
                <div
                  class="sidebar-tab"
                  :class="{ active: activeTab === 'agent' }"
                  @click="activeTab = 'agent'"
                >
                  <div class="icon-wrapper">
                    <img
                      :src="(themeState.currentTheme as any).AgentIcon"
                      class="menu-icon"
                      alt="agent"
                    />
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>{{ $t('headMenu.agent', 'Agent') }}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip v-if="showWorkspaceExplorer">
              <TooltipTrigger as-child>
                <div
                  class="sidebar-tab"
                  :class="{ active: activeTab === 'workspace' }"
                  @click="activeTab = 'workspace'"
                >
                  <div class="icon-wrapper">
                    <img
                      :src="(themeState.currentTheme as any).FolderIcon"
                      class="menu-icon"
                      alt="workspace"
                    />
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>{{ $t('viewMenuContainer.workspace') }}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip v-if="showWorkspaceGrep">
              <TooltipTrigger as-child>
                <div
                  class="sidebar-tab"
                  :class="{ active: activeTab === 'grep' }"
                  @click="activeTab = 'grep'"
                >
                  <div class="icon-wrapper">
                    <img
                      :src="
                        (themeState.currentTheme as any).SearchIcon ||
                        (themeState.currentTheme as any).SearchFileIcon ||
                        (themeState.currentTheme as any).SearchDocIcon
                      "
                      class="menu-icon"
                      alt="grep"
                    />
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>{{ $t('viewMenuContainer.workspaceGrep', '工作区搜索') }}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip v-if="showMetaInfoTab">
              <TooltipTrigger as-child>
                <div
                  class="sidebar-tab"
                  :class="{ active: activeTab === 'meta' }"
                  @click="activeTab = 'meta'"
                >
                  <div class="icon-wrapper">
                    <img
                      :src="(themeState.currentTheme as any).MetaIcon"
                      class="menu-icon"
                      alt="meta"
                    />
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>{{ $t('viewMenuContainer.metaInfo') }}</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <!-- Tab 内容 -->
          <div class="sidebar-content">
            <AgentViewCompact v-if="activeTab === 'agent' && showAgentInSidebar" />
            <!-- 工作区：用 v-show 保持挂载，避免切到其他 Tab 时 ref 丢失导致菜单/快捷键无法调用 -->
            <div
              v-show="activeTab === 'workspace'"
              class="sidebar-workspace-panel"
            >
              <WorkspaceExplorer v-if="showWorkspaceExplorer" ref="workspaceExplorerRef" />
            </div>
            <div v-show="activeTab === 'grep'" class="sidebar-grep-panel">
              <WorkspaceGrepPanel v-if="showWorkspaceGrep" ref="workspaceGrepPanelRef" />
            </div>
            <MetaInfoPanel
              v-if="showMetaInfoTab && activeDocument"
              v-show="activeTab === 'meta'"
              :key="activeDocument.tabId"
              :meta="activeDocument.meta"
              :markdown="activeDocument.markdown"
              :latex="activeDocument.tex"
              :outline-json="currentOutlineJson"
              @update-meta="handleMetaPatch"
            />
          </div>
        </div>
      </template>
      <template #main>
        <slot></slot>
      </template>
    </ResizableContainer>
    <div v-else class="view-menu-container-main-only">
      <slot></slot>
    </div>
  </div>
  <AgentWorkspaceManageDialogs />
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { mixColors, themeState } from '../utils/themes'
import ResizableContainer from './base/ResizableContainer.vue'
import WorkspaceExplorer from './WorkspaceExplorer.vue'
import WorkspaceGrepPanel from './WorkspaceGrepPanel.vue'
import MetaInfoPanel from './MetaInfoPanel.vue'
import AgentViewCompact from './agent/AgentViewCompact.vue'
import AgentWorkspaceManageDialogs from './agent/AgentWorkspaceManageDialogs.vue'
import eventBus from '../utils/event-bus'
import messageBridge from '../bridge/message-bridge'
import { getSetting, setSetting } from '../utils/settings'
import { useWorkspace } from '../stores/workspace'
import { extractOutlineTreeFromMarkdown } from '../utils/md-utils'
import { extractOutlineTreeFromLatex } from '../utils/latex-utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'

const { t } = useI18n()
const workspace = useWorkspace()

const viewSidebarResizableRef = ref<InstanceType<typeof ResizableContainer> | null>(null)
const workspaceExplorerRef = ref<InstanceType<typeof WorkspaceExplorer> | null>(null)
const workspaceGrepPanelRef = ref<InstanceType<typeof WorkspaceGrepPanel> | null>(null)

/** WorkspaceExplorer defineExpose 的方法（模板 ref 类型上需显式写出） */
type WorkspaceExplorerExposed = {
  addWorkspaceFolder: () => Promise<void>
  closeAllWorkspaceFolders: () => Promise<void>
  openWorkspaceReplace: () => Promise<void>
}

type WorkspaceGrepPanelExposed = {
  focusPatternInput: () => void
}

const showWorkspaceExplorer = ref(false)
const showWorkspaceGrep = ref(false)
/** 用户是否在右侧边栏显示紧凑 Agent（可与全页 Agent 同时打开） */
const agentSidebarPanelEnabled = ref(true)
const sidebarSize = ref(250)
const activeTab = ref<'agent' | 'workspace' | 'grep' | 'meta'>('workspace')

// 侧边栏最大宽度：窗口宽度的 2/3
const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1200)
const maxSidebarSize = computed(() => Math.max(400, Math.floor((windowWidth.value * 2) / 3)))

// 获取当前活动的文档
const activeDocument = computed(() => workspace.activeDocument.value)

/** 右侧紧凑 Agent 与全页 Agent 可同时显示，由用户用「侧栏 Agent」开关控制 */
const showAgentInSidebar = computed(() => agentSidebarPanelEnabled.value)

// 判断是否显示 MetaInfo Tab（当前 tab 是 md 或 tex 文档时显示）
const showMetaInfoTab = computed(() => {
  const doc = activeDocument.value
  if (!doc) return false
  const format = doc.format?.toLowerCase()
  return format === 'md' || format === 'tex'
})

// 计算是否显示 Tab 切换（只要有内容就显示，不管是一个还是两个）
const hasMultipleTabs = computed(() => {
  return (
    showAgentInSidebar.value ||
    showWorkspaceExplorer.value ||
    showWorkspaceGrep.value ||
    showMetaInfoTab.value
  )
})

// 计算是否有可见的菜单
const hasVisibleMenus = computed(() => {
  return (
    showAgentInSidebar.value ||
    showWorkspaceExplorer.value ||
    showWorkspaceGrep.value ||
    showMetaInfoTab.value
  )
})

// 计算当前大纲 JSON（用于 MetaInfoPanel）
const currentOutlineJson = computed(() => {
  const doc = activeDocument.value
  if (!doc)
    return JSON.stringify({ path: 'dummy', title: '', text: '', title_level: 0, children: [] })

  try {
    const format = doc.format?.toLowerCase()
    if (format === 'md') {
      const outline = extractOutlineTreeFromMarkdown(doc.markdown || '', false)
      return JSON.stringify(outline)
    } else if (format === 'tex') {
      const outline = extractOutlineTreeFromLatex(doc.tex || '', false)
      return JSON.stringify(outline)
    }
    return JSON.stringify({ path: 'dummy', title: '', text: '', title_level: 0, children: [] })
  } catch (error) {
    return JSON.stringify({ path: 'dummy', title: '', text: '', title_level: 0, children: [] })
  }
})

// 处理元信息更新
const handleMetaPatch = (patch: any) => {
  const doc = activeDocument.value
  if (!doc) return
  workspace.updateDocumentMeta(doc.tabId, (meta) => Object.assign(meta, patch))
}

// 计算选中/悬停状态背景色（基于侧栏面板背景，与整体一致）
const activeBackgroundColor = computed(() =>
  mixColors(sidebarPanelBackground.value, themeState.currentTheme.textColor, 0.3)
)
const activeTextColor = computed(() => themeState.currentTheme.textColor)
const hoverBackgroundColor = computed(() =>
  mixColors(sidebarPanelBackground.value, themeState.currentTheme.textColor, 0.15)
)
// 侧栏与内容区统一背景（与 LeftMenu、LogoTab 一致）
const sidebarPanelBackground = computed(
  () =>
    (themeState.currentTheme as { sidebarPanelBackground?: string }).sidebarPanelBackground ||
    themeState.currentTheme.background2nd ||
    themeState.currentTheme.sidebarBackground ||
    themeState.currentTheme.background
)
// Tab 选择栏的背景色：在 sidebarPanelBackground 基础上略深
const tabBarBackgroundColor = computed(() =>
  mixColors(sidebarPanelBackground.value, '#777777', 0.1)
)

// 与 LeftMenu 右侧边界一致：固定中性灰分界线，不随主题色变化，仅用于划分 panel，存在但不明显
const sidebarLeftBorderColor = computed(() => 'rgba(128, 128, 128, 0.2)')

// 监听活动文档变化，自动切换到合适的 Tab
watch(
  [showMetaInfoTab, showWorkspaceExplorer, showWorkspaceGrep, showAgentInSidebar],
  ([showMeta, showWorkspace, showGrep, showAgent]) => {
    // 如果当前 tab 不可用，切换到可用的 tab
    if (activeTab.value === 'meta' && !showMeta) {
      // 如果 meta tab 被隐藏，切换到 workspace（如果可用）
      if (showWorkspace) {
        activeTab.value = 'workspace'
      } else if (showAgent) {
        activeTab.value = 'agent'
      } else if (showGrep) {
        activeTab.value = 'grep'
      }
    } else if (activeTab.value === 'workspace' && !showWorkspace) {
      // 如果 workspace tab 被隐藏，优先切换到 grep，其次 meta
      if (showGrep) {
        activeTab.value = 'grep'
      } else if (showMeta) {
        activeTab.value = 'meta'
      } else if (showAgent) {
        activeTab.value = 'agent'
      }
    } else if (activeTab.value === 'grep' && !showGrep) {
      if (showWorkspace) {
        activeTab.value = 'workspace'
      } else if (showMeta) {
        activeTab.value = 'meta'
      } else if (showAgent) {
        activeTab.value = 'agent'
      }
    } else if (activeTab.value === 'agent' && !showAgent) {
      if (showWorkspace) {
        activeTab.value = 'workspace'
      } else if (showGrep) {
        activeTab.value = 'grep'
      } else if (showMeta) {
        activeTab.value = 'meta'
      }
    }

    // 如果两个都不可用，保持当前值（hasVisibleMenus 会处理整体显示）
  }
)

// 处理折叠
const handleCollapse = (collapsed: boolean) => {
  // 可以在这里保存折叠状态
}

// 处理尺寸调整
const handleResize = (size: number) => {
  sidebarSize.value = size
  setSetting('workspaceExplorerSize', size)
}

// 切换工作目录菜单
const handleToggleWorkspaceExplorer = () => {
  showWorkspaceExplorer.value = !showWorkspaceExplorer.value
  // 保存状态
  setSetting('workspaceExplorerVisible', showWorkspaceExplorer.value)
}

// 切换工作区 grep 菜单
const handleToggleWorkspaceGrep = () => {
  showWorkspaceGrep.value = !showWorkspaceGrep.value
  setSetting('workspaceGrepVisible', showWorkspaceGrep.value)
}

const handleToggleAgentSidebarPanel = () => {
  agentSidebarPanelEnabled.value = !agentSidebarPanelEnabled.value
  setSetting('agentSidebarPanelVisible', agentSidebarPanelEnabled.value)
}

/** 显示右侧工作区侧栏、选中「工作区」Tab，并尽量展开可折叠面板（供文件菜单与工作区内操作调用） */
const handleFocusWorkspaceSidebar = (event?: unknown) => {
  const payload = event as { expand?: boolean } | undefined
  showWorkspaceExplorer.value = true
  activeTab.value = 'workspace'
  void setSetting('workspaceExplorerVisible', true)
  if (payload?.expand === false) return
  void (async () => {
    await nextTick()
    await nextTick()
    viewSidebarResizableRef.value?.setCollapsed?.(false)
  })()
}

/** 显示工作区 Grep 侧栏、选中对应 Tab、展开面板并聚焦搜索框（快捷键与菜单共用） */
const handleFocusWorkspaceGrepSidebar = (event?: unknown) => {
  const payload = event as { expand?: boolean } | undefined
  showWorkspaceGrep.value = true
  activeTab.value = 'grep'
  void setSetting('workspaceGrepVisible', true)
  if (payload?.expand === false) return
  const tryFocus = (): boolean => {
    const panel = workspaceGrepPanelRef.value as WorkspaceGrepPanelExposed | null
    if (!panel || typeof panel.focusPatternInput !== 'function') return false
    panel.focusPatternInput()
    return true
  }
  void (async () => {
    await nextTick()
    await nextTick()
    viewSidebarResizableRef.value?.setCollapsed?.(false)
    if (tryFocus()) return
    await nextTick()
    if (tryFocus()) return
    await nextTick()
    tryFocus()
  })()
}

/** 先聚焦工作区侧栏，再在已挂载的 Explorer 上执行（Explorer 用 v-show 保持挂载，ref 在任意 Tab 下仍有效） */
function invokeWorkspaceExplorerAction(
  action: 'addWorkspaceFolder' | 'closeAllWorkspaceFolders' | 'openWorkspaceReplace'
) {
  handleFocusWorkspaceSidebar({ expand: true })
  const run = (): boolean => {
    const ex = workspaceExplorerRef.value as WorkspaceExplorerExposed | null
    if (!ex) return false
    if (action === 'addWorkspaceFolder') {
      if (typeof ex.addWorkspaceFolder !== 'function') return false
      void ex.addWorkspaceFolder()
      return true
    }
    if (action === 'closeAllWorkspaceFolders') {
      if (typeof ex.closeAllWorkspaceFolders !== 'function') return false
      void ex.closeAllWorkspaceFolders()
      return true
    }
    if (typeof ex.openWorkspaceReplace !== 'function') return false
    void ex.openWorkspaceReplace()
    return true
  }
  if (run()) return
  void nextTick(() => {
    if (run()) return
    void nextTick(() => {
      run()
    })
  })
}

// 加载保存的状态
const loadSavedState = async () => {
  try {
    const savedAgentPanel = await getSetting('agentSidebarPanelVisible')
    if (typeof savedAgentPanel === 'boolean') {
      agentSidebarPanelEnabled.value = savedAgentPanel
    } else {
      agentSidebarPanelEnabled.value = true
    }
    const savedWorkspace = await getSetting('workspaceExplorerVisible')
    if (typeof savedWorkspace === 'boolean') {
      showWorkspaceExplorer.value = savedWorkspace
    } else {
      // 默认显示工作目录
      showWorkspaceExplorer.value = true
    }
    const savedGrep = await getSetting('workspaceGrepVisible')
    if (typeof savedGrep === 'boolean') {
      showWorkspaceGrep.value = savedGrep
    } else {
      // 默认显示工作区 grep
      showWorkspaceGrep.value = true
    }
    const savedSize = await getSetting('workspaceExplorerSize')
    if (typeof savedSize === 'number' && savedSize >= 200 && savedSize <= 600) {
      sidebarSize.value = savedSize
    }
  } catch (error) {
    // 忽略错误
  }
}

const updateWindowWidth = () => {
  windowWidth.value = window.innerWidth
}

function onDirectoryChanged(first: unknown, second?: unknown) {
  const payload = second !== undefined ? second : first
  if (payload && typeof payload === 'object' && 'directoryPath' in payload) {
    eventBus.emit('directory-changed', payload)
  }
}

/** 文件菜单：由本容器持有 ref，不依赖子组件上的 mitt 监听 */
const handleWorkspaceInvokeAddFolder = () => {
  invokeWorkspaceExplorerAction('addWorkspaceFolder')
}

const handleWorkspaceInvokeCloseAllFolders = () => {
  invokeWorkspaceExplorerAction('closeAllWorkspaceFolders')
}

const handleWorkspaceInvokeOpenWorkspace = () => {
  invokeWorkspaceExplorerAction('openWorkspaceReplace')
}

onMounted(async () => {
  await loadSavedState()
  eventBus.on('focus-workspace-sidebar', handleFocusWorkspaceSidebar)
  eventBus.on('focus-workspace-grep-sidebar', handleFocusWorkspaceGrepSidebar)
  eventBus.on('workspace-invoke-add-folder', handleWorkspaceInvokeAddFolder)
  eventBus.on('workspace-invoke-close-all-folders', handleWorkspaceInvokeCloseAllFolders)
  eventBus.on('workspace-invoke-open-workspace', handleWorkspaceInvokeOpenWorkspace)
  eventBus.on('toggle-workspace-explorer', handleToggleWorkspaceExplorer)
  eventBus.on('toggle-workspace-grep', handleToggleWorkspaceGrep)
  eventBus.on('toggle-agent-sidebar-panel', handleToggleAgentSidebarPanel)
  window.addEventListener('resize', updateWindowWidth)
  // directory-changed 必须在始终挂载的容器里监听，否则切到其他 tab 时 WorkspaceExplorer 未挂载收不到 IPC
  const ipc = messageBridge.getIpc()
  if (ipc?.on) {
    ipc.on('directory-changed', onDirectoryChanged)
  }
})

onBeforeUnmount(() => {
  eventBus.off('focus-workspace-sidebar', handleFocusWorkspaceSidebar)
  eventBus.off('focus-workspace-grep-sidebar', handleFocusWorkspaceGrepSidebar)
  eventBus.off('workspace-invoke-add-folder', handleWorkspaceInvokeAddFolder)
  eventBus.off('workspace-invoke-close-all-folders', handleWorkspaceInvokeCloseAllFolders)
  eventBus.off('workspace-invoke-open-workspace', handleWorkspaceInvokeOpenWorkspace)
  eventBus.off('toggle-workspace-explorer', handleToggleWorkspaceExplorer)
  eventBus.off('toggle-workspace-grep', handleToggleWorkspaceGrep)
  eventBus.off('toggle-agent-sidebar-panel', handleToggleAgentSidebarPanel)
  window.removeEventListener('resize', updateWindowWidth)
  const ipc = messageBridge.getIpc()
  if (ipc?.removeListener) {
    ipc.removeListener('directory-changed', onDirectoryChanged)
  }
})
</script>

<style scoped>
.view-menu-container-wrapper {
  flex: 1;
  display: flex;
  height: 100%;
  overflow: hidden;
  min-width: 0; /* 确保 flex 子元素可以收缩 */
}

.view-menu-container-sidebar {
  height: 100%;
  width: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  /* 左侧：与 LeftMenu 分界，固定中性灰 */
  border-left: 1px solid v-bind('sidebarLeftBorderColor');
  /* 右侧：与主内容区分，固定中性灰 */
  border-right: 1px solid rgba(128, 128, 128, 0.2);
  background-color: v-bind('sidebarPanelBackground');
}

.sidebar-tabs {
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background-color: v-bind('tabBarBackgroundColor');
  flex-shrink: 0;
  padding: 6px;
  gap: 6px;
  height: 30px;
  min-height: 30px;
}

.sidebar-tab {
  width: 25px;
  height: 25px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
  user-select: none;
  background-color: transparent;
}

.sidebar-tab:hover {
  background-color: v-bind('hoverBackgroundColor');
}

.sidebar-tab.active {
  background-color: v-bind('activeBackgroundColor');
}

/* 图标容器 - 固定尺寸的正方形 */
.icon-wrapper {
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* 图标样式 - 在容器内自适应 */
.menu-icon {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
}

.sidebar-content {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 各 Tab 面板等高铺满，与原先单 v-if 面板行为一致 */
.sidebar-content > * {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.sidebar-workspace-panel,
.sidebar-grep-panel {
  display: flex;
  flex-direction: column;
}

.view-menu-container-main-only {
  flex: 1;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
