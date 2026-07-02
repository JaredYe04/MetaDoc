<template>
  <div class="view-menu-container" :class="{ 'is-collapsed': isCollapsed }">
    <div
      :class="[
        'view-side-menu',
        'sub-view-menu',
        { 'is-locked': isLocked, 'is-collapsed': isCollapsed }
      ]"
      :style="menuStyle"
      @contextmenu.prevent="handleBlankContextMenu"
    >
      <ViewMenuItem
        v-for="item in visibleViewMenuItems"
        :key="item.id"
        :index="item.id"
        :label="resolveViewLabel(item.label)"
        :icon-image="item.iconImage"
        :is-active="activeMenuIndex === item.id"
        :is-collapsed="isCollapsed"
        :is-disabled="isLocked"
        @select="handleSelect"
      />
    </div>

    <div class="collapse-button" @click="toggleCollapse">
      <ArrowLeft v-if="!isCollapsed" class="w-4 h-4" />
      <ArrowRight v-else class="w-4 h-4" />
    </div>

    <ContextMenu
      v-if="contextMenuVisible"
      :x="contextMenuPosition.x"
      :y="contextMenuPosition.y"
      :items="blankContextMenuItems"
      @trigger="handleContextMenuCommand"
      @close="contextMenuVisible = false"
    />

    <ViewMenuConfigDialog
      v-model="showViewMenuConfigDialog"
      :items="viewMenuConfigDialogItems"
      @save="onViewMenuConfigSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useEditorChromeLayout } from '../composables/useEditorChromeLayout'
import { getEditorChromeLayoutSync } from '../stores/editor-chrome-layout-state'
import eventBus from '../utils/event-bus'
import { mixColors, themeState } from '../utils/themes'
import { useWorkspace, type DocumentView } from '../stores/workspace'
import { isLayoutSplit } from '../stores/workspace-layout'
import { ArrowLeft, ArrowRight } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import ViewMenuItem from './ViewMenuItem.vue'
import ViewMenuConfigDialog from './ViewMenuConfigDialog.vue'
import ContextMenu from './ContextMenu.vue'
import type { ContextMenuItem } from './contextMenus/types'
import { getSetting, settings } from '../utils/settings'
import {
  buildViewWhenContext,
  getViewMenuConfigDialogItems,
  getViewMenuItems,
  type ViewMenuConfigEntry
} from '../view-api'
import { isAiRuntimeLoaded } from '../ai-runtime/loader'

const props = withDefaults(
  defineProps<{ mode?: 'normal' | 'demo'; contextTabId?: string | null }>(),
  { mode: 'normal', contextTabId: null }
)

const { t } = useI18n()
const workspace = useWorkspace()
const { editorChromeLayout } = useEditorChromeLayout()

const viewMenuConfigState = ref<ViewMenuConfigEntry[] | null>(null)
const viewMenuConfigRevision = ref(0)
const showViewMenuConfigDialog = ref(false)
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })

const scopedDocument = computed(() => {
  if (!props.contextTabId) return null
  try {
    return workspace.ensureDocument(props.contextTabId)
  } catch {
    return null
  }
})

const activeDocument = computed(() =>
  props.contextTabId ? scopedDocument.value : workspace.activeDocument.value
)

const contextTab = computed(() =>
  props.contextTabId
    ? (workspace.tabs.find((tab) => tab.id === props.contextTabId) ?? null)
    : workspace.activeTab.value
)

const isLocked = computed(() => props.mode === 'demo' || workspace.uiLocked?.value === true)

const viewWhenContext = computed(() =>
  buildViewWhenContext({
    tabId: props.contextTabId ?? workspace.activeTabId.value ?? null,
    tab: contextTab.value,
    document: activeDocument.value,
    llmEnabled: settings.llmEnabled === true
  })
)

const isImageTab = computed(() => viewWhenContext.value.isImageTab)

function resolveViewLabel(label: string): string {
  if (label.includes('.')) return t(label)
  return label
}

const visibleViewMenuItems = computed(() => {
  viewMenuConfigRevision.value
  isAiRuntimeLoaded()
  return getViewMenuItems(viewWhenContext.value, viewMenuConfigState.value)
})

const viewMenuConfigDialogItems = computed(() => {
  viewMenuConfigRevision.value
  return getViewMenuConfigDialogItems(viewMenuConfigState.value).map((item) => ({
    id: item.id,
    label: resolveViewLabel(item.label),
    iconImage: item.iconImage,
    visible: item.visible,
    isCore: item.isCore
  }))
})

const blankContextMenuItems = computed<ContextMenuItem[]>(() => [
  {
    label: 'viewMenu.menuConfig.title',
    value: 'open-view-menu-config'
  }
])

async function loadViewMenuConfig(): Promise<void> {
  try {
    const config = await getSetting('viewMenuConfig')
    viewMenuConfigState.value = Array.isArray(config) ? (config as ViewMenuConfigEntry[]) : null
  } catch {
    viewMenuConfigState.value = null
  }
  viewMenuConfigRevision.value++
}

function onViewMenuConfigSaved(items: ViewMenuConfigEntry[]): void {
  viewMenuConfigState.value = items.map(({ id, visible }) => ({ id, visible }))
  viewMenuConfigRevision.value++
}

function handleBlankContextMenu(event: MouseEvent): void {
  if (isLocked.value || props.mode === 'demo') return
  contextMenuPosition.value = { x: event.clientX, y: event.clientY }
  contextMenuVisible.value = true
}

function handleContextMenuCommand(value: string): void {
  contextMenuVisible.value = false
  if (value === 'open-view-menu-config') {
    showViewMenuConfigDialog.value = true
  }
}

const isCollapsed = ref(false)

function shouldAutoCollapseForWorkbench(): boolean {
  if (getEditorChromeLayoutSync() === 'workspace') return true
  if (props.contextTabId && contextTab.value?.workspacePlacement === 'workbench') return true
  return false
}

watch(
  () => ({
    layout: editorChromeLayout.value,
    placement: contextTab.value?.workspacePlacement,
    ctx: props.contextTabId
  }),
  (cur, prev) => {
    if (props.mode === 'demo') return
    const now = shouldAutoCollapseForWorkbench()
    const was = prev
      ? prev.layout === 'workspace' || (!!prev.ctx && prev.placement === 'workbench')
      : false
    if (now && !was) {
      isCollapsed.value = true
      eventBus.emit('view-menu-collapse-changed', true)
    }
  }
)

watch(
  () => isLayoutSplit(workspace.workspaceLayoutRoot.value),
  (hasSplit, hadSplit) => {
    if (props.mode === 'demo') return
    if (!hasSplit || hadSplit) return
    if (!shouldAutoCollapseForWorkbench()) return
    isCollapsed.value = true
    eventBus.emit('view-menu-collapse-changed', true)
  }
)

const toggleCollapse = () => {
  if (isLocked.value) return
  if (props.mode === 'demo') return
  isCollapsed.value = !isCollapsed.value
  eventBus.emit('view-menu-collapse-changed', isCollapsed.value)
}

watch(isCollapsed, (newVal) => {
  if (props.mode === 'demo') return
  eventBus.emit('view-menu-collapse-changed', newVal)
})

const handleViewMenuCollapseSync = (payload: unknown) => {
  const collapsed = payload as boolean
  if (isCollapsed.value !== collapsed) {
    isCollapsed.value = collapsed
  }
}
eventBus.on('view-menu-collapse-sync', handleViewMenuCollapseSync)

const onAiRuntimeReady = () => {
  viewMenuConfigRevision.value++
}
const onAiRuntimeUnloaded = () => {
  viewMenuConfigRevision.value++
}
const onAiCapabilityChange = () => {
  viewMenuConfigRevision.value++
}
eventBus.on('ai-runtime-ready', onAiRuntimeReady)
eventBus.on('ai-runtime-unloaded', onAiRuntimeUnloaded)
eventBus.on('ai-capability-loaded', onAiCapabilityChange)
eventBus.on('ai-capability-unloaded', onAiCapabilityChange)

onMounted(() => {
  void loadViewMenuConfig()
  if (props.mode === 'demo') return
  if (shouldAutoCollapseForWorkbench()) {
    isCollapsed.value = true
  }
  eventBus.emit('view-menu-collapse-request')
})

const activeMenuIndex = computed(() => {
  if (!activeDocument.value) return 'editor'
  if (isImageTab.value) return 'home'
  return activeDocument.value.lastView || 'editor'
})

const activeBackgroundColor = computed(() =>
  mixColors(themeState.currentTheme.background2nd, themeState.currentTheme.textColor, 0.3)
)
const activeTextColor = computed(() => themeState.currentTheme.textColor)

const menuStyle = computed(() => ({
  '--menu-bg': themeState.currentTheme.background,
  '--menu-text': themeState.currentTheme.SideTextColor,
  '--active-bg': activeBackgroundColor.value,
  '--active-text': activeTextColor.value,
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.SideTextColor
}))

const handleSelect = async (key: string): Promise<void> => {
  if (isLocked.value) return
  if (props.mode === 'demo') return

  const { ensureCapabilityForDocumentView } = await import('../ai-runtime/ensure-for-entry')
  await ensureCapabilityForDocumentView(key)

  if (key === 'home') {
    const tab = contextTab.value
    if (tab?.kind === 'new') {
      workspace.openSystemTab('/global-home', t('headMenu.home', '主页'))
      return
    }
  }

  const targetTabId = props.contextTabId || workspace.activeTabId.value
  const tab = contextTab.value
  if (targetTabId && (tab?.kind === 'file' || tab?.kind === 'new')) {
    const path = (tab.path || activeDocument.value?.path || '').toLowerCase()
    const isPdfTab =
      path.endsWith('.pdf') &&
      (tab.format || activeDocument.value?.format || '').toLowerCase() === 'pdf'

    if (isPdfTab && key !== 'home') {
      eventBus.emit('convert-pdf-preview-tab-to-md', { tabId: targetTabId })
      return
    }

    if (tab.preview && key !== 'home') {
      workspace.pinTab(targetTabId)
    }
    workspace.updateDocumentLastView(targetTabId, key as DocumentView)
  }
}

watch(
  () => activeDocument.value?.lastView,
  () => {},
  { immediate: true }
)

onBeforeUnmount((): void => {
  eventBus.off('view-menu-collapse-sync', handleViewMenuCollapseSync)
  eventBus.off('ai-runtime-ready', onAiRuntimeReady)
  eventBus.off('ai-runtime-unloaded', onAiRuntimeUnloaded)
  eventBus.off('ai-capability-loaded', onAiCapabilityChange)
  eventBus.off('ai-capability-unloaded', onAiCapabilityChange)
})
</script>

<style scoped>
.view-menu-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

.view-menu-container.is-collapsed .view-side-menu {
  width: 64px;
}

.view-side-menu.sub-view-menu {
  width: 120px;
  height: 100%;
  padding: 8px 4px;
  padding-bottom: 48px;
  border-right: none;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease;
}

.view-side-menu.sub-view-menu.is-collapsed {
  width: 64px;
  padding-bottom: 48px;
}

.view-side-menu.is-locked {
  cursor: not-allowed;
  opacity: 0.85;
}

.collapse-button {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--el-text-color-primary);
  background-color: transparent;
  z-index: 10;
}

.collapse-button:hover {
  background-color: var(--el-fill-color-light, rgba(0, 0, 0, 0.06));
}

.collapse-button .el-icon {
  font-size: 16px;
}

.is-locked .collapse-button {
  pointer-events: none;
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
