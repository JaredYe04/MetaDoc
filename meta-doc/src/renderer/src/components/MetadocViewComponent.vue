<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useWorkspace, type DocumentView } from '../stores/workspace'
import { getTabComponent } from '../config/tab-content-config'
import ViewMenuContainer from './ViewMenuContainer.vue'
import ViewMenu from './ViewMenu.vue'
import eventBus from '../utils/event-bus'

// 导入文档视图组件
import Home from '../views/Home.vue'
import Editor from '../views/Editor.vue'
import Outline from '../views/Outline.vue'
import Visualize from '../views/Visualize.vue'
import AgentView from '../views/AgentView.vue'
import ProofreadView from '../views/ProofreadView.vue'

interface Props {
  tabId: string
}

const props = defineProps<Props>()

const workspace = useWorkspace()

// 获取当前 Tab
const tab = computed(() => workspace.tabs.find((t) => t.id === props.tabId))

// 获取文档视图
const currentView = computed(() => {
  if (!tab.value || (tab.value.kind !== 'file' && tab.value.kind !== 'new')) {
    return 'editor' as DocumentView
  }
  const doc = workspace.ensureDocument(props.tabId)
  // 如果已经有 lastView，使用它
  if (doc.lastView) {
    return doc.lastView
  }
  // 新建文档且未选择格式时，显示 Home 视图（包含格式选择界面）
  if (tab.value.kind === 'new' && !doc.format) {
    return 'home' as DocumentView
  }
  // 默认显示 editor
  return 'editor' as DocumentView
})

// 判断是否应该渲染某个视图
const shouldRenderView = (viewType: DocumentView): boolean => {
  // 如果视图当前可见，或者已经挂载过，都应该渲染
  return isViewVisible(viewType) || mountedViews.value.has(viewType)
}

// 判断视图是否应该可见
const isViewVisible = (viewType: DocumentView): boolean => {
  return currentView.value === viewType
}

// 跟踪已经挂载过的视图
const mountedViews = ref<Set<DocumentView>>(new Set())

watch(currentView, (view) => {
  if (view) {
    mountedViews.value.add(view)
  }
}, { immediate: true })

// 处理视图切换
function handleViewChange(view: string) {
  const doc = workspace.ensureDocument(props.tabId)
  doc.lastView = view as DocumentView
  
  // 同步到 workspace 的活动 Tab
  if (workspace.activeTabId.value === props.tabId) {
    workspace.refreshActiveTabMetadata?.()
  }
}

// 判断是否显示子视图菜单
const showSubViewMenu = computed(() => {
  if (!tab.value) return false
  return tab.value.kind === 'file' || tab.value.kind === 'new'
})
</script>

<template>
  <div v-if="tab" class="document-view">
    <!-- 文档Tab：显示完整容器结构 -->
    <template v-if="tab.kind === 'file' || tab.kind === 'new'">
      <ViewMenuContainer>
        <div class="document-content-wrapper">
          <!-- 子视图菜单 -->
          <div v-if="showSubViewMenu" class="document-view-menu">
            <ViewMenu />
          </div>
          
          <!-- 内容区域 -->
          <div class="document-content-area">
            <Home
              v-if="shouldRenderView('home')"
              v-show="isViewVisible('home')"
              :key="`home-${tabId}`"
            />
            <Editor
              v-if="shouldRenderView('editor')"
              v-show="isViewVisible('editor')"
              :key="`editor-${tabId}`"
              :tab-id="tabId"
            />
            <Outline
              v-if="shouldRenderView('outline')"
              v-show="isViewVisible('outline')"
              :key="`outline-${tabId}`"
            />
            <Visualize
              v-if="shouldRenderView('visualize')"
              v-show="isViewVisible('visualize')"
              :key="`visualize-${tabId}`"
            />
            <AgentView
              v-if="shouldRenderView('agent')"
              v-show="isViewVisible('agent')"
              :key="`agent-${tabId}`"
            />
            <ProofreadView
              v-if="shouldRenderView('proofread')"
              v-show="isViewVisible('proofread')"
              :key="`proofread-${tabId}`"
            />
          </div>
        </div>
      </ViewMenuContainer>
    </template>
    
    <!-- 系统Tab和工具Tab -->
    <template v-else-if="tab.kind === 'system' || tab.kind === 'tool'">
      <component
        v-if="tab.route && getTabComponent(tab.kind, tab.route)"
        :is="getTabComponent(tab.kind, tab.route)"
        :key="`${tab.kind}-${tab.route}-${tabId}`"
      />
      <router-view v-else :key="`router-${tabId}`" />
    </template>
  </div>
</template>

<style scoped>
.document-view {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.document-content-wrapper {
  display: flex;
  flex-direction: row;
  height: 100%;
  overflow: hidden;
}

.document-view-menu {
  width: 120px;
  min-width: 120px;
  flex-shrink: 0;
  background-color: var(--el-bg-color, #ffffff);
  border-right: 1px solid var(--el-border-color-lighter, #f0f0f0);
  overflow: hidden;
}

.document-content-area {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  position: relative;
}

.document-content-area > * {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
</style>
