<template>
  <div class="focus-tab-bar-menus-root" :style="toolbarStripStyle">
    <UIMenu
      ref="toolbarMenuRef"
      :collapse="false"
      :background-color="api.toolbarMenuBackground.value"
      :text-color="api.toolbarMenuTextColor.value"
      class="focus-toolbar-ui-menu"
    >
      <!-- 文件 -->
      <UISubMenu
        :title="api.t('leftMenu.file')"
        :tooltip="api.t('leftMenu.file')"
        trigger="click"
        :level="1"
        popup-placement="below"
        popup-class="focus-toolbar-submenu-popup"
      >
        <template #title>
          <span class="focus-toolbar-label">{{ api.t('leftMenu.file') }}</span>
        </template>
        <template #icon><span class="focus-toolbar-icon-placeholder" /></template>

        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <img :src="(themeState.currentTheme as any).FileIcon" class="menu-title-icon" alt="" />
          </template>
          {{ api.t('leftMenu.fileTooltip') }}
        </UISubMenuItem>
        <UISubMenuItem :icon="FilePlus" @click="onItem(api.newDoc)">{{
          api.t('leftMenu.new')
        }}</UISubMenuItem>
        <UISubMenuItem :icon="FolderOpen" @click="onItem(api.openDoc)">{{
          api.t('leftMenu.open')
        }}</UISubMenuItem>
        <UISubMenuItem :icon="Home" @click="onItem(api.openGlobalHome)">
          {{ api.t('leftMenu.home', '主页') }}
        </UISubMenuItem>
        <UISubMenu
          :icon="FolderTree"
          :title="api.t('leftMenu.workspaceSubmenu', '工作区')"
          trigger="hover"
          :level="2"
          popup-class="focus-toolbar-submenu-popup"
        >
          <template #title>
            <span>{{ api.t('leftMenu.workspaceSubmenu', '工作区') }}</span>
          </template>
          <UISubMenuItem :is-title="true" :disabled="true">
            <template #icon>
              <FolderTree class="w-4 h-4" />
            </template>
            {{ api.t('leftMenu.workspaceSubmenuTooltip', '打开或管理工作区文件夹') }}
          </UISubMenuItem>
          <UISubMenuItem :icon="FolderTree" @click="onItem(api.openWorkspaceFromMenu)">
            {{ api.t('leftMenu.openWorkspace') }}
          </UISubMenuItem>
          <UISubMenuItem :icon="FolderPlus" @click="onItem(api.addFolderToWorkspaceFromMenu)">
            {{ api.t('leftMenu.addFolderToWorkspace') }}
          </UISubMenuItem>
          <UISubMenuItem :icon="FolderX" @click="onItem(api.closeWorkspaceFoldersFromMenu)">
            {{ api.t('leftMenu.closeWorkspace') }}
          </UISubMenuItem>
        </UISubMenu>
        <UISubMenuItem :icon="FolderCheck" @click="onItem(api.saveAll)">{{
          api.t('leftMenu.saveAll')
        }}</UISubMenuItem>
        <UISubMenuItem
          :icon="FolderCheck"
          :disabled="!isDocumentTab"
          @click="onItem(() => api.emitMenu('save', { tabId: activeTab?.id }))"
        >
          {{ api.t('leftMenu.save') }}
        </UISubMenuItem>
        <UISubMenuItem
          :icon="FolderPlus"
          :disabled="!isDocumentTab"
          @click="onItem(() => api.emitMenu('save-as'))"
        >
          {{ api.t('leftMenu.saveAs') }}
        </UISubMenuItem>
        <UISubMenu
          :icon="Download"
          :title="api.t('leftMenu.export')"
          trigger="hover"
          :level="2"
          :disabled="!isDocumentTab"
          popup-class="focus-toolbar-submenu-popup"
        >
          <template #title>
            <span>{{ api.t('leftMenu.export') }}</span>
          </template>
          <UISubMenuItem :is-title="true" :disabled="true">
            <template #icon>
              <Download class="w-4 h-4" />
            </template>
            {{ api.t('leftMenu.export') }}
          </UISubMenuItem>
          <UISubMenuItem
            v-for="option in exportOptionsList"
            :key="option.format"
            @click="onItem(() => api.handleExportClick(option.format as ExportFormat))"
          >
            {{ api.exportOptionLabel(option) }}
          </UISubMenuItem>
        </UISubMenu>
        <UISubMenuItem
          :icon="FilePlus"
          :disabled="!canExportAsTemplate"
          @click="onItem(api.openExportAsTemplateDialog)"
        >
          {{ api.t('leftMenu.exportAsTemplate') }}
        </UISubMenuItem>
        <UISubMenu
          :icon="Clock"
          :title="api.t('leftMenu.recent')"
          trigger="hover"
          :level="2"
          popup-class="focus-toolbar-submenu-popup"
          @open="api.refreshRecentOpens()"
        >
          <template #title>
            <span>{{ api.t('leftMenu.recent') }}</span>
          </template>
          <UISubMenuItem :is-title="true" :disabled="true">
            <template #icon>
              <Clock class="w-4 h-4" />
            </template>
            {{ api.t('leftMenu.recentTooltip') }}
          </UISubMenuItem>
          <UISubMenuItem
            v-for="entry in recentOpensList"
            :key="`${entry.kind}:${entry.path}`"
            :icon="Clock"
            :hint="entry.path"
            @click="onItem(() => api.askSave(() => api.openRecentItem(entry)))"
          >
            {{ api.basename(entry.path) }}
          </UISubMenuItem>
        </UISubMenu>
        <UISubMenuItem :icon="Settings" @click="onItem(() => api.emitMenu('setting'))">
          {{ api.t('leftMenu.settings') }}
        </UISubMenuItem>
        <UISubMenuItem
          :icon="XIcon"
          :disabled="!isDocumentTab"
          @click="onItem(() => api.emitMenu('close-active-tab'))"
        >
          {{ api.t('leftMenu.close') }}
        </UISubMenuItem>
      </UISubMenu>

      <!-- AI（含全页 Agent） -->
      <UISubMenu
        v-if="api.isAiEnabled.value"
        :title="api.t('leftMenu.aiAssistant')"
        :tooltip="api.t('leftMenu.aiAssistant')"
        trigger="click"
        :level="1"
        popup-placement="below"
        popup-class="focus-toolbar-submenu-popup"
      >
        <template #title>
          <span class="focus-toolbar-label">{{ api.t('leftMenu.aiAssistant') }}</span>
        </template>
        <template #icon><span class="focus-toolbar-icon-placeholder" /></template>

        <UISubMenuItem :is-title="true" :disabled="true">
          <template #icon>
            <img :src="themeState.currentTheme.AiLogo" class="menu-title-icon" alt="" />
          </template>
          {{ api.t('leftMenu.aiToolTooltip') }}
        </UISubMenuItem>
        <UISubMenuItem
          v-for="item in api.pluginAiAssistantItems.value"
          :key="item.id"
          :icon="api.resolvePluginLeftMenuIcon(item.id)"
          :icon-image="api.resolvePluginLeftMenuIconImage(item.id)"
          @click="onItem(() => api.onPluginLeftMenuClick(item))"
        >
          {{ api.resolvePluginLeftMenuLabel(item) }}
        </UISubMenuItem>
        <UISubMenuItem
          v-if="api.isMenuItemVisible('knowledge-base') && api.pluginAiAssistantItems.value.length === 0"
          :icon-image="(themeState.currentTheme as any).KnowledgeIcon"
          @click="onItem(api.openKnowledgeBase)"
        >
          {{ api.t('leftMenu.knowledgeBase', '知识库') }}
        </UISubMenuItem>
        <UISubMenuItem
          v-if="api.pluginAiAssistantItems.value.length === 0"
          :icon-image="(themeState.currentTheme as any).AgentIcon"
          @click="onItem(api.openAgent)"
        >
          {{ api.t('headMenu.agent', 'Agent') }}
        </UISubMenuItem>
      </UISubMenu>
    </UIMenu>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, provide, ref } from 'vue'
import { themeState } from '../utils/themes'
import { useActiveDocument } from '../composables/useActiveDocument'
import UIMenu from './ui/UIMenu.vue'
import UISubMenu from './ui/UISubMenu.vue'
import UISubMenuItem from './ui/UISubMenuItem.vue'
import type { ExportFormat } from '../../../types'
import {
  Home,
  Settings,
  FilePlus,
  FolderOpen,
  FolderCheck,
  FolderPlus,
  FolderTree,
  FolderX,
  BarChart3,
  Clock,
  Image as ImageIcon,
  Eye,
  Paperclip,
  MessageCircle,
  Pencil,
  Download,
  FileText,
  X as XIcon
} from 'lucide-vue-next'
import { FOCUS_LEFT_MENU_API_KEY } from './focus-mode-left-menu-api'

/** 顶栏始终展开显示文字；boolean 与 LeftMenu 的 Ref 并存时 UISubMenu 内已 toValue 解析 */
provide('menuCollapse', false)

const api = inject(FOCUS_LEFT_MENU_API_KEY)
if (!api) {
  throw new Error('FocusModeTabBarMenus: missing FOCUS_LEFT_MENU_API_KEY provider')
}

const toolbarStripStyle = computed(() => ({
  backgroundColor: api.toolbarMenuBackground.value,
  color: api.toolbarMenuTextColor.value
}))

const { activeTab } = useActiveDocument()

const isDocumentTab = computed(() => api.isDocumentTab.value)
const canExportAsTemplate = computed(() => api.canExportAsTemplate.value)
const exportOptionsList = computed(() => api.exportOptions.value)
const recentOpensList = computed(() => api.recentOpens.value.slice(0, 15))

const toolbarMenuRef = ref<InstanceType<typeof UIMenu> | null>(null)

function onItem(fn: () => void) {
  if (api.demoMode()) return
  fn()
  toolbarMenuRef.value?.closeAllClickSubMenus?.()
}
</script>

<style scoped>
.focus-tab-bar-menus-root {
  display: flex;
  align-items: center;
  height: 34px;
  max-height: 34px;
  -webkit-app-region: no-drag;
  box-sizing: border-box;
}

/* 横向顶栏菜单：在复用 UIMenu 默认竖向样式基础上覆盖 */
.focus-toolbar-ui-menu.ui-menu {
  flex-direction: row !important;
  align-items: stretch;
  width: auto !important;
  min-width: unset !important;
  height: 34px;
  max-height: 34px;
  min-height: 0 !important;
  border: none !important;
  padding: 0 4px;
  gap: 2px;
  overflow: visible;
  box-sizing: border-box;
}

.focus-toolbar-ui-menu.ui-menu:not(.is-collapsed) {
  min-height: 0 !important;
  height: 34px;
  max-height: 34px;
}

.focus-toolbar-ui-menu :deep(.ui-sub-menu) {
  display: flex;
  align-items: center;
  position: relative;
}

.focus-toolbar-ui-menu :deep(.ui-sub-menu__title) {
  height: 28px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 6px;
}

.focus-toolbar-ui-menu :deep(.ui-menu-item) {
  height: 28px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 6px;
}

.focus-toolbar-ui-menu :deep(.ui-menu-item__content) {
  justify-content: center;
}

.focus-toolbar-icon-placeholder {
  display: none;
}

.focus-toolbar-label {
  font-size: 13px;
  white-space: nowrap;
}

/* 顶栏一级：隐藏占位图标列，仅保留文字 + 箭头 */
.focus-toolbar-ui-menu :deep(.ui-sub-menu > .ui-sub-menu__title .ui-sub-menu__icon),
.focus-toolbar-ui-menu :deep(.ui-sub-menu > .ui-sub-menu__title .ui-sub-menu__icon-image) {
  display: none !important;
  width: 0 !important;
  margin: 0 !important;
}

/* 顶栏「文件 / AI」：不要右侧折叠箭头 */
.focus-toolbar-ui-menu :deep(.ui-sub-menu > .ui-sub-menu__title .ui-sub-menu__arrow) {
  display: none !important;
}

.focus-toolbar-ui-menu :deep(.ui-menu-item .ui-menu-item__icon),
.focus-toolbar-ui-menu :deep(.ui-menu-item .ui-menu-item__icon-image) {
  display: none !important;
  width: 0 !important;
  margin: 0 !important;
}
</style>

<!-- Teleport 到 body 的弹出层无 scoped，用全局类去分组标题下划线 -->
<style>
.focus-toolbar-submenu-popup .ui-sub-menu-item.is-title {
  border-bottom: none !important;
  margin-bottom: 2px !important;
}
</style>
