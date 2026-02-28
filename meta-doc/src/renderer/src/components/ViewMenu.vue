<template>
  <div class="view-menu-container" :class="{ 'is-collapsed': isCollapsed }">
    <div
      :class="[
        'view-side-menu',
        'sub-view-menu',
        { 'is-locked': isLocked, 'is-collapsed': isCollapsed }
      ]"
      :style="menuStyle"
    >
      <!-- Home -->
      <ViewMenuItem
        index="home"
        :label="$t('headMenu.home')"
        :icon-image="themeState.currentTheme.HomeIcon"
        :is-active="activeMenuIndex === 'home'"
        :is-collapsed="isCollapsed"
        :is-disabled="isLocked"
        @select="handleSelect"
      />

      <!-- Editor -->
      <ViewMenuItem
        index="editor"
        :label="$t('headMenu.editor')"
        :icon-image="themeState.currentTheme.EditorIcon"
        :is-active="activeMenuIndex === 'editor'"
        :is-collapsed="isCollapsed"
        :is-disabled="isLocked"
        @select="handleSelect"
      />

      <!-- 大纲树：纯文本格式不显示；PDF 预览 tab 只显示主页和编辑器 -->
      <ViewMenuItem
        v-if="!isPlainTextFormat && !isPdfPreviewTab"
        index="outline"
        :label="$t('headMenu.outline')"
        :icon-image="themeState.currentTheme.OutlineIcon"
        :is-active="activeMenuIndex === 'outline'"
        :is-collapsed="isCollapsed"
        :is-disabled="isLocked"
        @select="handleSelect"
      />

      <!-- 可视化：纯文本格式不显示；PDF 预览 tab 只显示主页和编辑器 -->
      <ViewMenuItem
        v-if="!isPlainTextFormat && !isPdfPreviewTab"
        index="visualize"
        :label="$t('headMenu.visualize')"
        :icon-image="themeState.currentTheme.VisualIcon"
        :is-active="activeMenuIndex === 'visualize'"
        :is-collapsed="isCollapsed"
        :is-disabled="isLocked"
        @select="handleSelect"
      />

      <!-- 文章校对：纯文本格式不显示，需要活动文档；PDF 预览 tab 只显示主页和编辑器 -->
      <ViewMenuItem
        v-if="activeDocument && !isPlainTextFormat && !isPdfPreviewTab"
        index="proofread"
        :label="$t('headMenu.proofread')"
        :icon-image="themeState.currentTheme.ProofreadIcon"
        :is-active="activeMenuIndex === 'proofread'"
        :is-collapsed="isCollapsed"
        :is-disabled="isLocked"
        @select="handleSelect"
      />
    </div>

    <!-- 折叠按钮 -->
    <div class="collapse-button" @click="toggleCollapse">
      <ArrowLeft v-if="!isCollapsed" class="w-4 h-4" />
      <ArrowRight v-else class="w-4 h-4" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import eventBus from '../utils/event-bus'
import { mixColors, themeState } from '../utils/themes'
import { useActiveDocument } from '../composables/useActiveDocument'
import { useWorkspace, type DocumentView } from '../stores/workspace'
import { ArrowLeft, ArrowRight } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import ViewMenuItem from './ViewMenuItem.vue'

const props = withDefaults(defineProps<{ mode?: 'normal' | 'demo' }>(), { mode: 'normal' })

const { t } = useI18n()
const { activeDocument } = useActiveDocument()
const workspace = useWorkspace()
const isLocked = computed(() => props.mode === 'demo' || workspace.uiLocked?.value === true)

// 判断是否为纯文本格式
const isPlainTextFormat = computed(() => {
  return activeDocument.value?.format === 'txt'
})

// 判断是否为 PDF 预览 tab（仅此类 tab 只显示主页和编辑器）
const isPdfPreviewTab = computed(() => {
  const tab = workspace.activeTab.value
  if (!tab || tab.kind !== 'file') return false
  const path = (tab.path || activeDocument.value?.path || '').toLowerCase()
  const format = (tab.format || activeDocument.value?.format || '').toLowerCase()
  return tab.preview === true && path.endsWith('.pdf') && format === 'pdf'
})

// 折叠状态 - 默认折叠
const isCollapsed = ref(false)

// 切换折叠状态
const toggleCollapse = () => {
  if (isLocked.value) return
  if (props.mode === 'demo') return
  isCollapsed.value = !isCollapsed.value
  eventBus.emit('view-menu-collapse-changed', isCollapsed.value)
}

// 监听折叠状态变化，通知父组件
watch(isCollapsed, (newVal) => {
  if (props.mode === 'demo') return
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
  if (props.mode === 'demo') return
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
const activeBackgroundColor = computed(() =>
  mixColors(themeState.currentTheme.background2nd, themeState.currentTheme.textColor, 0.3)
)
const activeTextColor = computed(() => themeState.currentTheme.textColor)

// 菜单样式
const menuStyle = computed(() => ({
  '--menu-bg': themeState.currentTheme.background,
  '--menu-text': themeState.currentTheme.SideTextColor,
  '--active-bg': activeBackgroundColor.value,
  '--active-text': activeTextColor.value,
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.SideTextColor
}))

const handleSelect = (key: string): void => {
  if (isLocked.value) return
  if (props.mode === 'demo') return

  // 如果点击的是"主页"，且当前文档是新文档且尚未选择格式，切换到 GlobalHome 标签页
  if (key === 'home') {
    const activeTab = workspace.activeTab.value
    const doc = activeDocument.value

    // 检查是否是新文档且尚未选择格式
    if (activeTab?.kind === 'new') {
      // 切换到 GlobalHome 标签页（如果不存在则创建）
      workspace.openSystemTab('/global-home', t('headMenu.home', '主页'))
      return
    }
  }

  // 切换文档视图，不改变路由
  const activeTabId = workspace.activeTabId.value
  const activeTab = workspace.activeTab.value
  if (activeTabId && (activeTab?.kind === 'file' || activeTab?.kind === 'new')) {
    // 检查是否是PDF格式的tab（无论是预览模式还是正式打开）
    const path = (activeTab.path || activeDocument.value?.path || '').toLowerCase()
    const isPdfTab =
      path.endsWith('.pdf') &&
      (activeTab.format || activeDocument.value?.format || '').toLowerCase() === 'pdf'

    // 如果是PDF tab且切换到非Home视图，需要转换为MD
    if (isPdfTab && key !== 'home') {
      // PDF tab（临时或正式）：转为 PDF→MD 的正式新文件 tab
      eventBus.emit('convert-pdf-preview-tab-to-md', { tabId: activeTabId })
      return
    }

    // 其他预览tab的处理
    if (activeTab.preview && key !== 'home') {
      workspace.pinTab(activeTabId)
    }
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

.view-menu-container.is-collapsed .view-side-menu {
  width: 64px;
}

/* 组件特定的菜单样式 */
.view-side-menu.sub-view-menu {
  width: 120px;
  height: 100%;
  padding: 8px 4px;
  padding-bottom: 48px; /* 为折叠按钮留出空间 */
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

/* 锁定状态样式 */
.view-side-menu.is-locked {
  cursor: not-allowed;
  opacity: 0.85;
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
