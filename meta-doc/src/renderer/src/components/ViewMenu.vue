<template>
  <div class="view-menu-container" :class="{ 'is-collapsed': isCollapsed }">
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
      <el-tooltip v-if="isCollapsed" :content="$t('headMenu.home')" placement="right">
        <el-menu-item index="home">
          <div class="icon-wrapper">
            <img :src="themeState.currentTheme.HomeIcon" class="menu-icon" alt="home" />
          </div>
        </el-menu-item>
      </el-tooltip>
      <el-menu-item v-if="!isCollapsed" index="home">
        <div class="icon-wrapper">
          <img :src="themeState.currentTheme.HomeIcon" class="menu-icon" alt="home" />
        </div>
        <span>{{ $t('headMenu.home') }}</span>
      </el-menu-item>
      
      <el-tooltip v-if="isCollapsed" :content="$t('headMenu.editor')" placement="right">
        <el-menu-item index="editor">
          <div class="icon-wrapper">
            <img :src="themeState.currentTheme.EditorIcon" class="menu-icon" alt="editor" />
          </div>
        </el-menu-item>
      </el-tooltip>
      <el-menu-item v-if="!isCollapsed" index="editor">
        <div class="icon-wrapper">
          <img :src="themeState.currentTheme.EditorIcon" class="menu-icon" alt="editor" />
        </div>
        <span>{{ $t('headMenu.editor') }}</span>
      </el-menu-item>
      
      <el-tooltip v-if="isCollapsed" :content="$t('headMenu.outline')" placement="right">
        <el-menu-item index="outline">
          <div class="icon-wrapper">
            <img :src="themeState.currentTheme.OutlineIcon" class="menu-icon" alt="outline" />
          </div>
        </el-menu-item>
      </el-tooltip>
      <el-menu-item v-if="!isCollapsed" index="outline">
        <div class="icon-wrapper">
          <img :src="themeState.currentTheme.OutlineIcon" class="menu-icon" alt="outline" />
        </div>
        <span>{{ $t('headMenu.outline') }}</span>
      </el-menu-item>
      
      <el-tooltip v-if="isCollapsed" :content="$t('headMenu.visualize')" placement="right">
        <el-menu-item index="visualize">
          <div class="icon-wrapper">
            <img :src="themeState.currentTheme.VisualIcon" class="menu-icon" alt="visualize" />
          </div>
        </el-menu-item>
      </el-tooltip>
      <el-menu-item v-if="!isCollapsed" index="visualize">
        <div class="icon-wrapper">
          <img :src="themeState.currentTheme.VisualIcon" class="menu-icon" alt="visualize" />
        </div>
        <span>{{ $t('headMenu.visualize') }}</span>
      </el-menu-item>
      
      <el-tooltip v-if="isCollapsed" :content="$t('headMenu.agent')" placement="right">
        <el-menu-item index="agent">
          <div class="icon-wrapper">
            <img :src="themeState.currentTheme.AgentIcon" class="menu-icon" alt="agent" />
          </div>
        </el-menu-item>
      </el-tooltip>
      <el-menu-item v-if="!isCollapsed" index="agent">
        <div class="icon-wrapper">
          <img :src="themeState.currentTheme.AgentIcon" class="menu-icon" alt="agent" />
        </div>
        <span>{{ $t('headMenu.agent') }}</span>
      </el-menu-item>
      
      <el-tooltip v-if="isCollapsed && activeDocument" :content="$t('headMenu.proofread')" placement="right">
        <el-menu-item index="proofread">
          <div class="icon-wrapper">
            <img :src="themeState.currentTheme.ProofreadIcon" class="menu-icon" alt="proofread" />
          </div>
        </el-menu-item>
      </el-tooltip>
      <el-menu-item v-if="!isCollapsed && activeDocument" index="proofread">
        <div class="icon-wrapper">
          <img :src="themeState.currentTheme.ProofreadIcon" class="menu-icon" alt="proofread" />
        </div>
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
import '../assets/modern-side-menu.css'

const { activeDocument } = useActiveDocument()
const workspace = useWorkspace()
const isLocked = computed(() => workspace.uiLocked?.value === true)

// 折叠状态 - 默认折叠
const isCollapsed = ref(false)

// 切换折叠状态
const toggleCollapse = () => {
  if (isLocked.value) return
  isCollapsed.value = !isCollapsed.value
  // 通过事件总线通知Main.vue更新宽度
  eventBus.emit('view-menu-collapse-changed', isCollapsed.value)
}

// 监听折叠状态变化，通知父组件
watch(isCollapsed, (newVal) => {
  eventBus.emit('view-menu-collapse-changed', newVal)
})

// 监听来自Main.vue的折叠状态同步
const handleViewMenuCollapseSync = (payload: unknown) => {
  const collapsed = payload as boolean
  if (isCollapsed.value !== collapsed) {
    isCollapsed.value = collapsed
  }
}
eventBus.on('view-menu-collapse-sync', handleViewMenuCollapseSync)

// 组件挂载时请求同步状态
onMounted(() => {
  // 请求Main.vue同步当前的折叠状态
  eventBus.emit('view-menu-collapse-request')
})

// 当前活动的文档视图
// 直接使用 doc.lastView，这个值已经在创建/打开文档时根据内容正确设置了
const activeMenuIndex = computed(() => {
  if (!activeDocument.value) return 'editor'
  // lastView 已经在创建文档时根据内容正确设置：空文档 -> 'editor'，有内容 -> 'home'
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
  eventBus.off('view-menu-collapse-sync', handleViewMenuCollapseSync)
})
</script>

<style scoped>
.view-menu-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

.view-menu-container.is-collapsed .modern-side-menu {
  width: 64px;
}

/* 组件特定的菜单样式 */
.modern-side-menu.sub-view-menu {
  width: 120px;
  height: 100%;
  padding-bottom: 48px; /* 为折叠按钮留出空间 */
}

.modern-side-menu.sub-view-menu.is-collapsed {
  width: 64px;
  padding-bottom: 48px;
}

/* 激活状态的颜色绑定（ViewMenu 特定） */
.modern-side-menu :deep(.el-menu-item.is-active) {
  background-color: v-bind('activeBackgroundColor') !important;
  color: v-bind('activeTextColor') !important;
  border-radius: 6px !important;
}

/* 确保 hover 状态也有圆角 */
.modern-side-menu :deep(.el-menu-item:hover) {
  border-radius: 6px !important;
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

/* 图标容器 - 固定尺寸的正方形 */
.icon-wrapper {
  width: 18px;
  height: 18px;
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

/* 展开状态下，图标容器和文字之间的间距 */
.modern-side-menu.sub-view-menu:not(.is-collapsed) .el-menu-item .icon-wrapper {
  margin-right: 8px;
}
</style>

