<template>
  <div class="view-menu-container-wrapper">
    <ResizableContainer
      v-if="hasVisibleMenus"
      direction="vertical"
      :initial-sidebar-size="sidebarSize"
      :min-size="200"
      :max-size="600"
      :divider-size="5"
      :show-sidebar="hasVisibleMenus"
      :sidebar-position="'start'"
      :collapsible="true"
      :show-collapse-button="true"
      :auto-collapse-width="0"
      :collapse-button-title="$t('viewMenuContainer.collapse')"
      :expand-button-title="$t('viewMenuContainer.expand')"
      @collapse="handleCollapse"
      @resize="handleResize"
    >
      <template #sidebar>
        <div class="view-menu-container-sidebar">
          <!-- Tab 切换 -->
          <div class="sidebar-tabs" v-if="hasMultipleTabs">
            <el-tooltip
              v-if="showWorkspaceExplorer"
              :content="$t('viewMenuContainer.workspace')"
              placement="top"
            >
              <div 
                class="sidebar-tab" 
                :class="{ 'active': activeTab === 'workspace' }"
                @click="activeTab = 'workspace'"
              >
                <div class="icon-wrapper">
                  <img :src="(themeState.currentTheme as any).FolderIcon" class="menu-icon" alt="workspace" />
                </div>
              </div>
            </el-tooltip>
            <el-tooltip
              v-if="showMetaInfoTab"
              :content="$t('viewMenuContainer.metaInfo')"
              placement="top"
            >
              <div 
                class="sidebar-tab" 
                :class="{ 'active': activeTab === 'meta' }"
                @click="activeTab = 'meta'"
              >
                <div class="icon-wrapper">
                  <img :src="(themeState.currentTheme as any).MetaIcon" class="menu-icon" alt="meta" />
                </div>
              </div>
            </el-tooltip>
          </div>
          
          <!-- Tab 内容 -->
          <div class="sidebar-content">
            <WorkspaceExplorer v-if="activeTab === 'workspace'" />
            <MetaInfoPanel
              v-if="activeTab === 'meta' && activeDocument"
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
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { mixColors, themeState } from '../utils/themes'
import ResizableContainer from './base/ResizableContainer.vue'
import WorkspaceExplorer from './WorkspaceExplorer.vue'
import MetaInfoPanel from './MetaInfoPanel.vue'
import eventBus from '../utils/event-bus'
import { getSetting, setSetting } from '../utils/settings'
import { useWorkspace } from '../stores/workspace'
import { extractOutlineTreeFromMarkdown } from '../utils/md-utils'
import { extractOutlineTreeFromLatex } from '../utils/latex-utils'

const { t } = useI18n()
const workspace = useWorkspace()

const showWorkspaceExplorer = ref(false)
const sidebarSize = ref(250)
const activeTab = ref<'workspace' | 'meta'>('workspace')

// 获取当前活动的文档
const activeDocument = computed(() => workspace.activeDocument.value)

// 判断是否显示 MetaInfo Tab（当前 tab 是 md 或 tex 文档时显示）
const showMetaInfoTab = computed(() => {
  const doc = activeDocument.value
  if (!doc) return false
  const format = doc.format?.toLowerCase()
  return format === 'md' || format === 'tex'
})

// 计算是否显示 Tab 切换（只要有内容就显示，不管是一个还是两个）
const hasMultipleTabs = computed(() => {
  return showWorkspaceExplorer.value || showMetaInfoTab.value
})

// 计算是否有可见的菜单
const hasVisibleMenus = computed(() => {
  return showWorkspaceExplorer.value || showMetaInfoTab.value
})

// 计算当前大纲 JSON（用于 MetaInfoPanel）
const currentOutlineJson = computed(() => {
  const doc = activeDocument.value
  if (!doc) return JSON.stringify({ path: 'dummy', title: '', text: '', title_level: 0, children: [] })
  
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

// 计算选中状态的背景色（参考 ViewMenu.vue 的配色方案）
const activeBackgroundColor = computed(() => mixColors(themeState.currentTheme.background2nd, themeState.currentTheme.textColor, 0.3))
const activeTextColor = computed(() => themeState.currentTheme.textColor)
const hoverBackgroundColor = computed(() => mixColors(themeState.currentTheme.background2nd, themeState.currentTheme.textColor, 0.15))
// Tab 选择栏的背景色：background2nd 和 #777777 进行 0.3 混合
const tabBarBackgroundColor = computed(() => mixColors(themeState.currentTheme.background2nd, '#777777', 0.1))

// 监听活动文档变化，自动切换到合适的 Tab
watch([showMetaInfoTab, showWorkspaceExplorer], ([showMeta, showWorkspace]) => {
  // 如果当前 tab 不可用，切换到可用的 tab
  if (activeTab.value === 'meta' && !showMeta) {
    // 如果 meta tab 被隐藏，切换到 workspace（如果可用）
    if (showWorkspace) {
      activeTab.value = 'workspace'
    }
  } else if (activeTab.value === 'workspace' && !showWorkspace) {
    // 如果 workspace tab 被隐藏，切换到 meta（如果可用）
    if (showMeta) {
      activeTab.value = 'meta'
    }
  }
  
  // 如果两个都不可用，保持当前值（hasVisibleMenus 会处理整体显示）
})

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

// 加载保存的状态
const loadSavedState = async () => {
  try {
    const saved = await getSetting('workspaceExplorerVisible')
    if (typeof saved === 'boolean') {
      showWorkspaceExplorer.value = saved
    }
    const savedSize = await getSetting('workspaceExplorerSize')
    if (typeof savedSize === 'number' && savedSize >= 200 && savedSize <= 600) {
      sidebarSize.value = savedSize
    }
  } catch (error) {
    // 忽略错误
  }
}

onMounted(async () => {
  await loadSavedState()
  eventBus.on('toggle-workspace-explorer', handleToggleWorkspaceExplorer)
})

onBeforeUnmount(() => {
  eventBus.off('toggle-workspace-explorer', handleToggleWorkspaceExplorer)
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
}

.view-menu-container-main-only {
  flex: 1;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>

