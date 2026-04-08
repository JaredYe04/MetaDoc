<template>
  <div
    class="view-menu-container-wrapper view-menu-container-focus"
    :class="{ 'is-sidebar-on-left': sidebarOnLeft }"
  >
    <ResizableContainer
      ref="viewSidebarResizableRef"
      v-if="hasVisibleMenus"
      direction="vertical"
      storage-key="view-menu-sidebar-focus"
      :initial-sidebar-size="sidebarSize"
      :min-size="200"
      :max-size="maxSidebarSize"
      :divider-size="5"
      :show-sidebar="hasVisibleMenus"
      :sidebar-position="'start'"
      :sidebar-on-left="sidebarOnLeft"
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
          <div v-if="hasMultipleTabs" class="sidebar-tabs">
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
            <Tooltip v-if="showOutlineTab">
              <TooltipTrigger as-child>
                <div
                  class="sidebar-tab"
                  :class="{ active: activeTab === 'outline' }"
                  @click="activeTab = 'outline'"
                >
                  <div class="icon-wrapper">
                    <ListTree class="menu-lucide-icon" />
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>{{ $t('viewMenuContainer.documentOutline', '文档大纲') }}</p>
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

          <div class="sidebar-content">
            <div
              v-show="activeTab === 'workspace'"
              class="sidebar-workspace-panel sidebar-workspace-panel--focus"
            >
              <WorkspaceExplorer v-if="showWorkspaceExplorer" ref="workspaceExplorerRef" layout-variant="focus" />
            </div>
            <div v-show="activeTab === 'outline' && showOutlineTab" class="sidebar-outline-panel">
              <DocumentOutlineSearchPanel />
              <div
                v-show="outlineHostKind === 'md'"
                id="metadoc-vditor-outline-host"
                class="focus-vditor-outline-host"
              />
              <FocusLatexOutlinePanel v-if="outlineHostKind === 'tex'" class="focus-latex-outline-host" />
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
import { ListTree } from 'lucide-vue-next'
import ResizableContainer from './base/ResizableContainer.vue'
import WorkspaceExplorer from './WorkspaceExplorer.vue'
import MetaInfoPanel from './MetaInfoPanel.vue'
import DocumentOutlineSearchPanel from './DocumentOutlineSearchPanel.vue'
import FocusLatexOutlinePanel from './FocusLatexOutlinePanel.vue'
import AgentWorkspaceManageDialogs from './agent/AgentWorkspaceManageDialogs.vue'
import eventBus from '../utils/event-bus'
import messageBridge from '../bridge/message-bridge'
import { getSetting, setSetting } from '../utils/settings'
import { useWorkspace } from '../stores/workspace'
import { extractOutlineTreeFromMarkdown } from '../utils/md-utils'
import { extractOutlineTreeFromLatex } from '../utils/latex-utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'

withDefaults(
  defineProps<{
    sidebarOnLeft?: boolean
  }>(),
  { sidebarOnLeft: true }
)

const { t } = useI18n()
const workspace = useWorkspace()

const viewSidebarResizableRef = ref<InstanceType<typeof ResizableContainer> | null>(null)
const workspaceExplorerRef = ref<InstanceType<typeof WorkspaceExplorer> | null>(null)

type WorkspaceExplorerExposed = {
  addWorkspaceFolder: () => Promise<void>
  closeAllWorkspaceFolders: () => Promise<void>
  openWorkspaceReplace: () => Promise<void>
}

const showWorkspaceExplorer = ref(false)
const sidebarSize = ref(280)
const activeTab = ref<'workspace' | 'outline' | 'meta'>('workspace')

const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1200)
const maxSidebarSize = computed(() => Math.max(400, Math.floor((windowWidth.value * 2) / 3)))

const activeDocument = computed(() => workspace.activeDocument.value)

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

const showMetaInfoTab = computed(() => {
  const doc = activeDocument.value
  if (!doc) return false
  return isMdLikeFormat(doc.format) || isTexLikeFormat(doc.format)
})

/** Markdown / LaTeX 在专注侧栏显示大纲（MD 用 Vditor 大纲，TeX 用 LaTeX 结构树） */
const showOutlineTab = computed(() => {
  const doc = activeDocument.value
  if (!doc) return false
  if (isMdLikeFormat(doc.format) || isTexLikeFormat(doc.format)) return true
  return pathLooksMd(doc.path) || pathLooksTex(doc.path)
})

const outlineHostKind = computed<'md' | 'tex'>(() => {
  const doc = activeDocument.value
  if (!doc) return 'md'
  if (isTexLikeFormat(doc.format) || pathLooksTex(doc.path)) return 'tex'
  return 'md'
})

const hasMultipleTabs = computed(() => {
  let n = 0
  if (showWorkspaceExplorer.value) n++
  if (showOutlineTab.value) n++
  if (showMetaInfoTab.value) n++
  return n > 1
})

const hasVisibleMenus = computed(() => {
  return showWorkspaceExplorer.value || showOutlineTab.value || showMetaInfoTab.value
})

const currentOutlineJson = computed(() => {
  const doc = activeDocument.value
  if (!doc)
    return JSON.stringify({ path: 'dummy', title: '', text: '', title_level: 0, children: [] })
  try {
    const useTex =
      isTexLikeFormat(doc.format) || (pathLooksTex(doc.path) && !pathLooksMd(doc.path))
    const useMd =
      isMdLikeFormat(doc.format) || (pathLooksMd(doc.path) && !pathLooksTex(doc.path))
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

const handleMetaPatch = (patch: any) => {
  const doc = activeDocument.value
  if (!doc) return
  workspace.updateDocumentMeta(doc.tabId, (meta) => Object.assign(meta, patch))
}

const activeBackgroundColor = computed(() =>
  mixColors(sidebarPanelBackground.value, themeState.currentTheme.textColor, 0.3)
)
const hoverBackgroundColor = computed(() =>
  mixColors(sidebarPanelBackground.value, themeState.currentTheme.textColor, 0.15)
)
const sidebarPanelBackground = computed(
  () =>
    (themeState.currentTheme as { sidebarPanelBackground?: string }).sidebarPanelBackground ||
    themeState.currentTheme.background2nd ||
    themeState.currentTheme.sidebarBackground ||
    themeState.currentTheme.background
)
const tabBarBackgroundColor = computed(() =>
  mixColors(sidebarPanelBackground.value, '#777777', 0.1)
)
const sidebarLeftBorderColor = computed(() => 'rgba(128, 128, 128, 0.2)')
const iconTextColor = computed(() => themeState.currentTheme.textColor)

watch(
  [showMetaInfoTab, showWorkspaceExplorer, showOutlineTab],
  ([showMeta, showWorkspace, showOutline]) => {
    if (activeTab.value === 'meta' && !showMeta) {
      if (showWorkspace) activeTab.value = 'workspace'
      else if (showOutline) activeTab.value = 'outline'
    } else if (activeTab.value === 'workspace' && !showWorkspace) {
      if (showOutline) activeTab.value = 'outline'
      else if (showMeta) activeTab.value = 'meta'
    } else if (activeTab.value === 'outline' && !showOutline) {
      if (showWorkspace) activeTab.value = 'workspace'
      else if (showMeta) activeTab.value = 'meta'
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
    if (tab !== 'outline' || !showOutlineTab.value || outlineHostKind.value !== 'md') return
    await nextTick()
    await nextTick()
    eventBus.emit('sync-vditor-outline-sidebar-host')
  },
  { flush: 'post' }
)

const handleCollapse = () => {}
const handleResize = (size: number) => {
  sidebarSize.value = size
  setSetting('workspaceExplorerSize', size)
}

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

/** 从工作区树/已打开文件切换文档后，专注侧栏切到「文档大纲」并展开 */
const handleFocusDocumentOutlineSidebar = () => {
  const run = (): boolean => {
    if (!showOutlineTab.value) return false
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

const handleWorkspaceInvokeAddFolder = () => invokeWorkspaceExplorerAction('addWorkspaceFolder')
const handleWorkspaceInvokeCloseAllFolders = () =>
  invokeWorkspaceExplorerAction('closeAllWorkspaceFolders')
const handleWorkspaceInvokeOpenWorkspace = () =>
  invokeWorkspaceExplorerAction('openWorkspaceReplace')

const handleToggleWorkspaceExplorer = () => {
  showWorkspaceExplorer.value = !showWorkspaceExplorer.value
  void setSetting('workspaceExplorerVisible', showWorkspaceExplorer.value)
}

const loadSavedState = async () => {
  try {
    const savedWorkspace = await getSetting('workspaceExplorerVisible')
    if (typeof savedWorkspace === 'boolean') {
      showWorkspaceExplorer.value = savedWorkspace
    } else {
      showWorkspaceExplorer.value = true
    }
    const savedSize = await getSetting('workspaceExplorerSize')
    if (typeof savedSize === 'number' && savedSize >= 200 && savedSize <= 600) {
      sidebarSize.value = savedSize
    }
  } catch {
    /* ignore */
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

onMounted(async () => {
  await loadSavedState()
  eventBus.on('focus-workspace-sidebar', handleFocusWorkspaceSidebar)
  eventBus.on('focus-document-outline-sidebar', handleFocusDocumentOutlineSidebar)
  eventBus.on('workspace-invoke-add-folder', handleWorkspaceInvokeAddFolder)
  eventBus.on('workspace-invoke-close-all-folders', handleWorkspaceInvokeCloseAllFolders)
  eventBus.on('workspace-invoke-open-workspace', handleWorkspaceInvokeOpenWorkspace)
  eventBus.on('toggle-workspace-explorer', handleToggleWorkspaceExplorer)
  window.addEventListener('resize', updateWindowWidth)
  const ipc = messageBridge.getIpc()
  if (ipc?.on) {
    ipc.on('directory-changed', onDirectoryChanged)
  }
})

onBeforeUnmount(() => {
  eventBus.emit('restore-vditor-outline-sidebar-host')
  eventBus.off('focus-workspace-sidebar', handleFocusWorkspaceSidebar)
  eventBus.off('focus-document-outline-sidebar', handleFocusDocumentOutlineSidebar)
  eventBus.off('workspace-invoke-add-folder', handleWorkspaceInvokeAddFolder)
  eventBus.off('workspace-invoke-close-all-folders', handleWorkspaceInvokeCloseAllFolders)
  eventBus.off('workspace-invoke-open-workspace', handleWorkspaceInvokeOpenWorkspace)
  eventBus.off('toggle-workspace-explorer', handleToggleWorkspaceExplorer)
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
  min-width: 0;
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
  border-left: 1px solid v-bind('sidebarLeftBorderColor');
  border-right: 1px solid rgba(128, 128, 128, 0.2);
  background-color: v-bind('sidebarPanelBackground');
}

.view-menu-container-wrapper.is-sidebar-on-left .view-menu-container-sidebar {
  border-left: none;
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

.icon-wrapper {
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.menu-icon {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
}

.menu-lucide-icon {
  width: 14px;
  height: 14px;
  color: v-bind('iconTextColor');
  opacity: 0.9;
}

.sidebar-content {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.sidebar-content > * {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.sidebar-workspace-panel,
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

.focus-vditor-outline-host {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background-color: v-bind('sidebarPanelBackground');
}

/* Vditor 大纲移入后占满剩余区域 */
.focus-vditor-outline-host :deep(.outline-resize-wrapper) {
  flex: 1;
  min-height: 0;
  display: flex !important;
  flex-direction: row;
  width: 100% !important;
  max-width: 100% !important;
}

.focus-vditor-outline-host :deep(.outline-resize-handle) {
  display: none !important;
}

.focus-vditor-outline-host :deep(.vditor-outline) {
  flex: 1;
  min-width: 0 !important;
  width: auto !important;
  max-width: none !important;
  background-color: v-bind('sidebarPanelBackground') !important;
}

/* 专注侧栏：Vditor 大纲行高与 FocusLatexOutlinePanel .focus-outline-item 对齐 */
.focus-vditor-outline-host :deep(.vditor-outline__title) {
  font-weight: 600;
  font-size: 12px;
  line-height: 1.25;
  padding: 6px 8px !important;
  border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent) !important;
}

.focus-vditor-outline-host :deep(.vditor-outline__content) {
  padding: 4px 4px 8px;
}

/* 专注侧栏：大纲条目 hover / active / 按下（Vditor 为 li > span） */
.focus-vditor-outline-host :deep(.vditor-outline li > span) {
  display: flex;
  align-items: center;
  min-height: 22px;
  padding: 2px 8px !important;
  margin: 0 0 1px 0 !important;
  font-size: 12px !important;
  line-height: 1.25 !important;
  border-radius: 4px;
  transition:
    background-color 0.12s ease,
    color 0.12s ease,
    transform 0.08s ease;
}

.focus-vditor-outline-host :deep(.vditor-outline li > span:hover) {
  background: color-mix(in srgb, currentColor 8%, transparent);
}

.focus-vditor-outline-host :deep(.vditor-outline li > span:active) {
  transform: scale(0.99);
  background: color-mix(in srgb, currentColor 14%, transparent);
}

.focus-latex-outline-host {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.view-menu-container-main-only {
  flex: 1;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
