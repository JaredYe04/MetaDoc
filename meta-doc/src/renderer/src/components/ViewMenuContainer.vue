<template>
  <div
    class="view-menu-container-wrapper"
    :class="{
      'view-menu-container-focus': focusLayout,
      'is-sidebar-on-left': effectiveSidebarOnLeft
    }"
  >
    <ResizableContainer
      ref="viewSidebarResizableRef"
      v-if="hasVisibleMenus"
      direction="vertical"
      :storage-key="resizableStorageKey"
      :initial-sidebar-size="sidebarSize"
      :min-size="200"
      :max-size="maxSidebarSize"
      :divider-size="5"
      :show-sidebar="hasVisibleMenus"
      :sidebar-position="'start'"
      :sidebar-on-left="effectiveSidebarOnLeft"
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
            <Tooltip v-if="showAgentInSidebar && !focusLayout">
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
            <Tooltip v-if="showDocumentOutlineTab">
              <TooltipTrigger as-child>
                <div
                  class="sidebar-tab"
                  :class="{ active: activeTab === 'outline' }"
                  @click="activeTab = 'outline'"
                >
                  <ListTree class="menu-lucide-icon" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>{{ $t('viewMenuContainer.documentOutline', '文档大纲') }}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip v-if="showWorkspaceGrep && !focusLayout">
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
            <AgentViewCompact v-if="activeTab === 'agent' && showAgentInSidebar && !focusLayout" />
            <!-- 工作区：用 v-show 保持挂载，避免切到其他 Tab 时 ref 丢失导致菜单/快捷键无法调用 -->
            <div v-show="activeTab === 'workspace'" class="sidebar-workspace-panel" :class="{ 'sidebar-workspace-panel--focus': focusLayout }">
              <WorkspaceExplorer
                v-if="showWorkspaceExplorer"
                ref="workspaceExplorerRef"
                :layout-variant="focusLayout ? 'focus' : undefined"
              />
            </div>
            <div v-show="activeTab === 'grep' && !focusLayout" class="sidebar-grep-panel">
              <WorkspaceGrepPanel v-if="showWorkspaceGrep" ref="workspaceGrepPanelRef" />
            </div>
            <div
              v-show="activeTab === 'outline' && showDocumentOutlineTab"
              class="sidebar-outline-panel"
            >
              <DocumentOutlineSearchPanel />
              <template v-if="focusLayout">
                <div
                  v-show="outlineHostKind === 'md-vditor'"
                  id="metadoc-vditor-outline-host"
                  class="focus-vditor-outline-host"
                />
                <MarkdownOutlinePanel
                  v-if="outlineHostKind === 'md-monaco'"
                  :tab-id="activeDocument?.tabId"
                  class="focus-markdown-outline-host"
                />
                <FocusLatexOutlinePanel
                  v-if="outlineHostKind === 'tex'"
                  class="focus-latex-outline-host"
                />
              </template>
              <FocusLatexOutlinePanel v-else class="focus-latex-outline-host" />
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
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, provide } from 'vue'
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
import { getSetting, setSetting, settings } from '../utils/settings'
import { useWorkspace } from '../stores/workspace'
import { extractOutlineTreeFromMarkdown } from '../utils/md-utils'
import { extractOutlineTreeFromLatex } from '../utils/latex-utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { ListTree } from 'lucide-vue-next'
import DocumentOutlineSearchPanel from './DocumentOutlineSearchPanel.vue'
import FocusLatexOutlinePanel from './FocusLatexOutlinePanel.vue'
import MarkdownOutlinePanel from './MarkdownOutlinePanel.vue'
import { VIEW_MENU_DOCUMENT_TAB_ID } from './view-menu-context'

const props = withDefaults(
  defineProps<{
    /** 分屏工作区：侧栏绑定指定文档 Tab，而非全局 active */
    contextTabId?: string | null
    /** Resizable 持久化键，每窗格实例须唯一 */
    storageKey?: string
    /** 专注模式布局：隐藏 Agent/Grep，侧栏大纲支持 MD/TeX */
    focusLayout?: boolean
    /** 专注模式下侧栏在左 */
    sidebarOnLeft?: boolean
  }>(),
  { contextTabId: null, storageKey: undefined, focusLayout: false, sidebarOnLeft: false }
)

const { t } = useI18n()
const workspace = useWorkspace()

const resizableStorageKey = computed(() => {
  if (props.focusLayout) return 'view-menu-sidebar-focus'
  return props.storageKey ?? 'view-menu-sidebar'
})

const effectiveSidebarOnLeft = computed(() =>
  props.focusLayout ? (props.sidebarOnLeft ?? true) : false
)

const scopedDocumentTabId = computed(() => props.contextTabId ?? null)
provide(VIEW_MENU_DOCUMENT_TAB_ID, scopedDocumentTabId)

const viewSidebarResizableRef = ref<InstanceType<typeof ResizableContainer> | null>(null)
const workspaceExplorerRef = ref<InstanceType<typeof WorkspaceExplorer> | null>(null)
const workspaceGrepPanelRef = ref<InstanceType<typeof WorkspaceGrepPanel> | null>(null)

/** WorkspaceExplorer defineExpose 的方法（模板 ref 类型上需显式写出） */
type WorkspaceExplorerExposed = {
  addWorkspaceFolder: () => Promise<void>
  closeAllWorkspaceFolders: () => Promise<void>
  openWorkspaceReplace: () => Promise<void>
  openWorkspaceFromPath: (folderPath: string) => Promise<void>
}

type WorkspaceGrepPanelExposed = {
  focusPatternInput: () => void
}

const showWorkspaceExplorer = ref(false)
const showWorkspaceGrep = ref(false)
/** 用户是否在右侧边栏显示紧凑 Agent（可与全页 Agent 同时打开） */
const agentSidebarPanelEnabled = ref(true)
const sidebarSize = ref(250)
const activeTab = ref<'agent' | 'workspace' | 'outline' | 'grep' | 'meta'>('workspace')

// 侧边栏最大宽度：窗口宽度的 2/3
const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1200)
const maxSidebarSize = computed(() => Math.max(400, Math.floor((windowWidth.value * 2) / 3)))

// 全局壳：跟随窗口 active；分屏壳：跟随 contextTabId
const activeDocument = computed(() => {
  const tid = props.contextTabId
  if (tid) {
    try {
      return workspace.ensureDocument(tid)
    } catch {
      return null
    }
  }
  return workspace.activeDocument.value
})

/** 右侧紧凑 Agent 与全页 Agent 可同时显示，由用户用「侧栏 Agent」开关控制 */
const showAgentInSidebar = computed(() => agentSidebarPanelEnabled.value)

function isTexLikeFormat(format: string | undefined): boolean {
  const f = (format ?? '').toLowerCase()
  return f === 'tex' || f === 'latex' || f === 'ltx'
}

function isMdLikeFormat(format: string | undefined): boolean {
  const f = (format ?? '').toLowerCase()
  return f === 'md' || f === 'markdown' || f === 'mdx'
}

function pathLooksTex(p: string | undefined): boolean {
  const x = (p ?? '').toLowerCase()
  return x.endsWith('.tex') || x.endsWith('.latex') || x.endsWith('.ltx')
}

function pathLooksMd(p: string | undefined): boolean {
  const x = (p ?? '').toLowerCase()
  return x.endsWith('.md') || x.endsWith('.markdown') || x.endsWith('.mdx')
}

// 判断是否显示 MetaInfo Tab（当前 tab 是 md 或 tex 文档时显示）
const showMetaInfoTab = computed(() => {
  const doc = activeDocument.value
  if (!doc) return false
  return isMdLikeFormat(doc.format) || isTexLikeFormat(doc.format)
})

/** 非专注模式下：LaTeX 无编辑器内原生大纲，在侧栏提供与专注模式一致的文档大纲 Tab */
const showLatexOutlineTab = computed(() => {
  const doc = activeDocument.value
  if (!doc) return false
  if (isTexLikeFormat(doc.format)) return true
  return pathLooksTex(doc.path) && !pathLooksMd(doc.path)
})

/** 专注模式下：Markdown / LaTeX 均显示文档大纲 */
const showFocusOutlineTab = computed(() => {
  const doc = activeDocument.value
  if (!doc) return false
  if (isMdLikeFormat(doc.format) || isTexLikeFormat(doc.format)) return true
  return pathLooksMd(doc.path) || pathLooksTex(doc.path)
})

const showDocumentOutlineTab = computed(() =>
  props.focusLayout ? showFocusOutlineTab.value : showLatexOutlineTab.value
)

const outlineHostKind = computed<'md-vditor' | 'md-monaco' | 'tex'>(() => {
  const doc = activeDocument.value
  if (!doc) return 'md-vditor'
  if (isTexLikeFormat(doc.format) || pathLooksTex(doc.path)) return 'tex'
  const surface = doc.markdownEditorSurface ?? settings.markdownEditorSurface
  if (surface === 'code') return 'md-monaco'
  return 'md-vditor'
})

// 计算是否显示 Tab 切换（只要有内容就显示，不管是一个还是两个）
const hasMultipleTabs = computed(() => {
  return (
    (!props.focusLayout && showAgentInSidebar.value) ||
    showWorkspaceExplorer.value ||
    showDocumentOutlineTab.value ||
    (!props.focusLayout && showWorkspaceGrep.value) ||
    showMetaInfoTab.value
  )
})

// 计算是否有可见的菜单
const hasVisibleMenus = computed(() => {
  return (
    (!props.focusLayout && showAgentInSidebar.value) ||
    showWorkspaceExplorer.value ||
    showDocumentOutlineTab.value ||
    (!props.focusLayout && showWorkspaceGrep.value) ||
    showMetaInfoTab.value
  )
})

// 计算当前大纲 JSON（用于 MetaInfoPanel）
const currentOutlineJson = computed(() => {
  const doc = activeDocument.value
  if (!doc)
    return JSON.stringify({ path: 'dummy', title: '', text: '', title_level: 0, children: [] })

  try {
    const useTex = isTexLikeFormat(doc.format) || (pathLooksTex(doc.path) && !pathLooksMd(doc.path))
    const useMd = isMdLikeFormat(doc.format) || (pathLooksMd(doc.path) && !pathLooksTex(doc.path))
    if (useTex && !useMd) {
      const outline = extractOutlineTreeFromLatex(doc.tex || '', false)
      return JSON.stringify(outline)
    }
    if (useMd || !useTex) {
      const outline = extractOutlineTreeFromMarkdown(doc.markdown || '', false)
      return JSON.stringify(outline)
    }
    return JSON.stringify({ path: 'dummy', title: '', text: '', title_level: 0, children: [] })
  } catch {
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
const iconTextColor = computed(() => themeState.currentTheme.textColor)

// 监听活动文档变化，自动切换到合适的 Tab
watch(
  [
    showMetaInfoTab,
    showWorkspaceExplorer,
    showDocumentOutlineTab,
    showWorkspaceGrep,
    showAgentInSidebar,
    () => props.focusLayout
  ],
  ([showMeta, showWorkspace, showOutline, showGrep, showAgent]) => {
    if (activeTab.value === 'meta' && !showMeta) {
      if (showWorkspace) {
        activeTab.value = 'workspace'
      } else if (showOutline) {
        activeTab.value = 'outline'
      } else if (showAgent) {
        activeTab.value = 'agent'
      } else if (showGrep) {
        activeTab.value = 'grep'
      }
    } else if (activeTab.value === 'workspace' && !showWorkspace) {
      if (showGrep) {
        activeTab.value = 'grep'
      } else if (showOutline) {
        activeTab.value = 'outline'
      } else if (showMeta) {
        activeTab.value = 'meta'
      } else if (showAgent) {
        activeTab.value = 'agent'
      }
    } else if (activeTab.value === 'outline' && !showOutline) {
      if (showWorkspace) {
        activeTab.value = 'workspace'
      } else if (showGrep) {
        activeTab.value = 'grep'
      } else if (showMeta) {
        activeTab.value = 'meta'
      } else if (showAgent) {
        activeTab.value = 'agent'
      }
    } else if (activeTab.value === 'grep' && !showGrep) {
      if (showWorkspace) {
        activeTab.value = 'workspace'
      } else if (showOutline) {
        activeTab.value = 'outline'
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
      } else if (showOutline) {
        activeTab.value = 'outline'
      } else if (showMeta) {
        activeTab.value = 'meta'
      }
    }
  }
)

watch(
  () => props.focusLayout,
  (focus) => {
    if (!focus) return
    if (activeTab.value === 'agent' || activeTab.value === 'grep') {
      if (showWorkspaceExplorer.value) activeTab.value = 'workspace'
      else if (showDocumentOutlineTab.value) activeTab.value = 'outline'
      else if (showMetaInfoTab.value) activeTab.value = 'meta'
    }
  }
)

watch(
  activeTab,
  (tab, prev) => {
    if (prev === 'outline' && tab !== 'outline') {
      eventBus.emit('restore-vditor-outline-sidebar-host')
    }
  },
  { flush: 'pre' }
)

watch(
  activeTab,
  async (tab) => {
    if (tab !== 'outline' || !showDocumentOutlineTab.value || outlineHostKind.value !== 'md-vditor') {
      return
    }
    await nextTick()
    await nextTick()
    eventBus.emit('sync-vditor-outline-sidebar-host')
  },
  { flush: 'post' }
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

/** 侧栏切到紧凑 Agent 并展开（与 ViewMenu「Agent」项一致） */
const handleFocusAgentSidebar = () => {
  if (!showAgentInSidebar.value) {
    agentSidebarPanelEnabled.value = true
    void setSetting('agentSidebarPanelVisible', true)
  }
  activeTab.value = 'agent'
  void (async () => {
    await nextTick()
    await nextTick()
    viewSidebarResizableRef.value?.setCollapsed?.(false)
  })()
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

/** 从工作区树等切换到 LaTeX 文档时，非专注侧栏切到「文档大纲」并展开 */
const handleFocusDocumentOutlineSidebar = () => {
  const run = (): boolean => {
    if (!showDocumentOutlineTab.value) return false
    activeTab.value = 'outline'
    void (async () => {
      await nextTick()
      await nextTick()
      viewSidebarResizableRef.value?.setCollapsed?.(false)
    })()
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

const handleOpenRecentWorkspace = (payload: unknown) => {
  const p =
    typeof payload === 'string'
      ? payload
      : payload && typeof payload === 'object' && 'path' in payload
        ? String((payload as { path: unknown }).path)
        : ''
  if (!p) return
  handleFocusWorkspaceSidebar({ expand: true })
  const run = (): boolean => {
    const ex = workspaceExplorerRef.value as WorkspaceExplorerExposed | null
    if (!ex || typeof ex.openWorkspaceFromPath !== 'function') return false
    void ex.openWorkspaceFromPath(p)
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

onMounted(async () => {
  await loadSavedState()
  eventBus.on('focus-workspace-sidebar', handleFocusWorkspaceSidebar)
  eventBus.on('focus-document-outline-sidebar', handleFocusDocumentOutlineSidebar)
  eventBus.on('focus-agent-sidebar', handleFocusAgentSidebar)
  eventBus.on('focus-workspace-grep-sidebar', handleFocusWorkspaceGrepSidebar)
  eventBus.on('workspace-invoke-add-folder', handleWorkspaceInvokeAddFolder)
  eventBus.on('workspace-invoke-close-all-folders', handleWorkspaceInvokeCloseAllFolders)
  eventBus.on('workspace-invoke-open-workspace', handleWorkspaceInvokeOpenWorkspace)
  eventBus.on('open-recent-workspace', handleOpenRecentWorkspace)
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
  eventBus.emit('restore-vditor-outline-sidebar-host')
  eventBus.off('focus-workspace-sidebar', handleFocusWorkspaceSidebar)
  eventBus.off('focus-document-outline-sidebar', handleFocusDocumentOutlineSidebar)
  eventBus.off('focus-agent-sidebar', handleFocusAgentSidebar)
  eventBus.off('focus-workspace-grep-sidebar', handleFocusWorkspaceGrepSidebar)
  eventBus.off('workspace-invoke-add-folder', handleWorkspaceInvokeAddFolder)
  eventBus.off('workspace-invoke-close-all-folders', handleWorkspaceInvokeCloseAllFolders)
  eventBus.off('workspace-invoke-open-workspace', handleWorkspaceInvokeOpenWorkspace)
  eventBus.off('open-recent-workspace', handleOpenRecentWorkspace)
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
  flex: 1 1 0%;
  display: flex;
  flex-direction: column;
  align-self: stretch;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  min-width: 0; /* 确保 flex 子元素可以收缩 */
}

.view-menu-container-wrapper > :deep(.resizable-container),
.view-menu-container-wrapper > .view-menu-container-main-only {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.view-menu-container-sidebar {
  height: 100%;
  width: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  /* 默认侧栏在右：左缘与主内容区分 */
  border-left: 1px solid v-bind('sidebarLeftBorderColor');
  /* 右缘靠窗口 */
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
.sidebar-grep-panel,
.sidebar-outline-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.sidebar-outline-panel > .doc-outline-search {
  flex-shrink: 0;
  max-height: 55vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.menu-lucide-icon {
  width: 14px;
  height: 14px;
  color: v-bind('iconTextColor');
  flex-shrink: 0;
}

.view-menu-container-wrapper.is-sidebar-on-left .view-menu-container-sidebar {
  border-left: none;
}

.sidebar-workspace-panel--focus {
  flex: 1;
  min-height: 0;
}

.focus-vditor-outline-host,
.focus-markdown-outline-host {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.focus-latex-outline-host {
  flex: 1;
  min-height: 0;
  overflow: hidden;
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
