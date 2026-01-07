<template>
  <div class="head-menu-container" :class="{ 'is-collapsed': isCollapsed }">
    <el-menu
      :class="['modern-side-menu', 'sub-view-menu', { 'is-locked': isLocked, 'is-collapsed': isCollapsed }]"
      mode="vertical"
      :menu-trigger="isLocked ? 'manual' : 'hover'"
      @select="handleSelect"
      :default-active="activeMenuIndex"
      :background-color="themeState.currentTheme.background"
      :text-color="themeState.currentTheme.SideTextColor"
      :active-text-color="themeState.currentTheme.SideTextColor"
    >
      <el-tooltip v-if="isCollapsed" :content="$t('headMenu.editor')" placement="right">
        <el-menu-item index="editor">
          <img :src="themeState.currentTheme.EditorIcon" class="menu-icon" alt="editor" />
        </el-menu-item>
      </el-tooltip>
      <el-menu-item v-if="!isCollapsed" index="editor">
        <span>{{ $t('headMenu.editor') }}</span>
      </el-menu-item>
      
      <el-tooltip v-if="isCollapsed" :content="$t('headMenu.outline')" placement="right">
        <el-menu-item index="outline">
          <img :src="themeState.currentTheme.OutlineIcon" class="menu-icon" alt="outline" />
        </el-menu-item>
      </el-tooltip>
      <el-menu-item v-if="!isCollapsed" index="outline">
        <span>{{ $t('headMenu.outline') }}</span>
      </el-menu-item>
      
      <el-tooltip v-if="isCollapsed" :content="$t('headMenu.visualize')" placement="right">
        <el-menu-item index="visualize">
          <img :src="themeState.currentTheme.VisualIcon" class="menu-icon" alt="visualize" />
        </el-menu-item>
      </el-tooltip>
      <el-menu-item v-if="!isCollapsed" index="visualize">
        <span>{{ $t('headMenu.visualize') }}</span>
      </el-menu-item>
      
      <el-tooltip v-if="isCollapsed" :content="$t('headMenu.agent')" placement="right">
        <el-menu-item index="agent">
          <img :src="themeState.currentTheme.AgentIcon" class="menu-icon" alt="agent" />
        </el-menu-item>
      </el-tooltip>
      <el-menu-item v-if="!isCollapsed" index="agent">
        <span>{{ $t('headMenu.agent') }}</span>
      </el-menu-item>
      
      <el-tooltip v-if="isCollapsed && activeDocument" :content="$t('headMenu.proofread')" placement="right">
        <el-menu-item index="proofread">
          <img :src="themeState.currentTheme.ProofreadIcon" class="menu-icon" alt="proofread" />
        </el-menu-item>
      </el-tooltip>
      <el-menu-item v-if="!isCollapsed && activeDocument" index="proofread">
        <span>{{ $t('headMenu.proofread') }}</span>
      </el-menu-item>
    </el-menu>
    <!-- 折叠按钮 -->
    <div class="collapse-button" @click="toggleCollapse">
      <el-icon>
        <ArrowLeft v-if="!isCollapsed" />
        <ArrowRight v-else />
      </el-icon>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import eventBus from '../utils/event-bus'
import { mixColors, themeState } from '../utils/themes'
import { useActiveDocument } from '../composables/useActiveDocument'
import { useWorkspace, type DocumentView } from '../stores/workspace'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'

const { activeDocument } = useActiveDocument()
const workspace = useWorkspace()
const isLocked = computed(() => workspace.uiLocked?.value === true)

// 折叠状态
const isCollapsed = ref(false)

// 切换折叠状态
const toggleCollapse = () => {
  if (isLocked.value) return
  isCollapsed.value = !isCollapsed.value
  // 通过事件总线通知Main.vue更新宽度
  eventBus.emit('head-menu-collapse-changed', isCollapsed.value)
}

// 监听折叠状态变化，通知父组件
watch(isCollapsed, (newVal) => {
  eventBus.emit('head-menu-collapse-changed', newVal)
})

// 监听来自Main.vue的折叠状态同步
const handleHeadMenuCollapseSync = (payload: unknown) => {
  const collapsed = payload as boolean
  if (isCollapsed.value !== collapsed) {
    isCollapsed.value = collapsed
  }
}
eventBus.on('head-menu-collapse-sync', handleHeadMenuCollapseSync)

// 组件挂载时请求同步状态
onMounted(() => {
  // 请求Main.vue同步当前的折叠状态
  eventBus.emit('head-menu-collapse-request')
})

// 当前活动的文档视图
const activeMenuIndex = computed(() => {
  if (!activeDocument.value) return 'editor'
  return activeDocument.value.lastView || 'editor'
})

// 计算选中状态的背景色（使用辅助背景色）
const activeBackgroundColor = computed(() => mixColors(themeState.currentTheme.background2nd, themeState.currentTheme.textColor, 0.3))
const activeTextColor = computed(() => themeState.currentTheme.textColor)

const handleSelect = (key: string): void => {
  if (isLocked.value) return
  // 切换文档视图，不改变路由
  const activeTabId = workspace.activeTabId.value
  if (activeTabId && (workspace.activeTab.value?.kind === 'file' || workspace.activeTab.value?.kind === 'new')) {
    workspace.updateDocumentLastView(activeTabId, key as DocumentView)
  }
}

// 监听活动文档变化，更新菜单选中状态
watch(
  () => activeDocument.value?.lastView,
  (newView) => {
    if (newView) {
      // 菜单会自动更新，因为activeMenuIndex是computed
    }
  },
  { immediate: true }
)

// 组件卸载前清除事件监听
onBeforeUnmount((): void => {
  eventBus.off('head-menu-collapse-sync', handleHeadMenuCollapseSync)
})
</script>

<style scoped>
.head-menu-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

.head-menu-container.is-collapsed .modern-side-menu {
  width: 64px;
}

/* 现代桌面应用风格的侧边菜单 */
.modern-side-menu.sub-view-menu {
  width: 120px;
  height: 100%;
  border-right: none;
  padding: 8px 4px;
  padding-bottom: 48px; /* 为折叠按钮留出空间 */
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  transition: width 0.3s ease;
  overflow: hidden;
}

.modern-side-menu.is-collapsed {
  width: 64px;
  padding: 8px 4px;
  padding-bottom: 48px;
}

.modern-side-menu :deep(.el-menu-item) {
  height: 40px;
  line-height: 40px;
  margin: 4px 0;
  padding: 0 12px;
  border-radius: 6px;
  transition: all 0.2s ease;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.modern-side-menu.is-collapsed :deep(.el-menu-item) {
  padding: 0 !important;
  justify-content: center !important;
  align-items: center !important;
  width: 100%;
  text-align: center;
}

.modern-side-menu.is-collapsed :deep(.el-menu-item .el-icon) {
  font-size: 18px;
  margin: 0 auto !important;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.modern-side-menu.is-collapsed :deep(.el-menu-item .menu-icon) {
  width: 18px;
  height: 18px;
  margin: 0 auto;
  display: block;
  flex-shrink: 0;
}

.modern-side-menu.is-collapsed :deep(.el-menu-item > *) {
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modern-side-menu :deep(.el-menu-item:hover) {
  background-color: var(--el-menu-hover-bg-color, rgba(0, 0, 0, 0.06)) !important;
  border-radius: 6px;
}

.modern-side-menu :deep(.el-menu-item.is-active) {
  background-color: v-bind('activeBackgroundColor') !important;
  border-radius: 6px;
  border-color: v-bind('activeBackgroundColor') !important;
  color: v-bind('activeTextColor') !important;
}

/* 锁定状态 */
.is-locked {
  cursor: not-allowed;
  opacity: 0.85;
}

.is-locked :deep(.el-menu-item) {
  pointer-events: none;
  cursor: not-allowed !important;
  opacity: 0.6;
}

.is-locked :deep(.el-sub-menu__title) {
  pointer-events: none;
  cursor: not-allowed !important;
  opacity: 0.6;
}

/* 折叠按钮 */
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
