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
      :collapsible="false"
      :show-collapse-button="false"
      :auto-collapse-width="0"
      :collapse-button-title="$t('viewMenuContainer.collapse')"
      :expand-button-title="$t('viewMenuContainer.expand')"
      @collapse="handleCollapse"
      @resize="handleResize"
    >
      <template #sidebar>
        <div class="view-menu-container-sidebar">
          <WorkspaceExplorer v-if="showWorkspaceExplorer" />
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
import ResizableContainer from './base/ResizableContainer.vue'
import WorkspaceExplorer from './WorkspaceExplorer.vue'
import eventBus from '../utils/event-bus'
import { getSetting, setSetting } from '../utils/settings'

const { t } = useI18n()

const showWorkspaceExplorer = ref(false)
const sidebarSize = ref(250)

// 计算是否有可见的菜单
const hasVisibleMenus = computed(() => {
  return showWorkspaceExplorer.value
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
}

.view-menu-container-main-only {
  flex: 1;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>

