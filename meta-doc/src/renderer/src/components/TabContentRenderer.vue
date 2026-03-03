<template>
  <div class="tab-content-wrapper">
    <!-- 使用v-show控制显示/隐藏，实现零时间切换，所有组件保持挂载状态 -->
    <div class="tab-content-container">
      <!-- 渲染所有Tab的内容，使用keep-alive缓存组件实例 -->
      <template v-for="tab in workspace.tabs" :key="tab.id">
        <!-- 文档Tab：根据lastView显示不同视图 -->
        <template v-if="tab.kind === 'file' || tab.kind === 'new'">
          <!-- Home视图 - 使用v-show代替v-if，配合keep-alive实现缓存 -->
          <keep-alive>
            <Home
              v-show="
                shouldRenderView(tab.id, 'home') &&
                tab.id === activeTabId &&
                getDocumentView(tab.id) === 'home'
              "
              :key="`home-${tab.id}`"
            />
          </keep-alive>
          <!-- Editor视图 - 使用v-show代替v-if，配合keep-alive实现缓存 -->
          <keep-alive>
            <Editor
              v-show="
                shouldRenderView(tab.id, 'editor') &&
                tab.id === activeTabId &&
                getDocumentView(tab.id) === 'editor'
              "
              :key="`editor-${tab.id}`"
              :tab-id="tab.id"
            />
          </keep-alive>
          <!-- Outline视图 - 使用v-show代替v-if，配合keep-alive实现缓存 -->
          <keep-alive>
            <Outline
              v-show="
                shouldRenderView(tab.id, 'outline') &&
                tab.id === activeTabId &&
                getDocumentView(tab.id) === 'outline'
              "
              :key="`outline-${tab.id}`"
            />
          </keep-alive>
          <!-- Visualize视图 - 使用v-show代替v-if，配合keep-alive实现缓存 -->
          <keep-alive>
            <Visualize
              v-show="
                shouldRenderView(tab.id, 'visualize') &&
                tab.id === activeTabId &&
                getDocumentView(tab.id) === 'visualize'
              "
              :key="`visualize-${tab.id}`"
            />
          </keep-alive>
          <!-- Proofread视图 - 使用v-show代替v-if，配合keep-alive实现缓存 -->
          <keep-alive>
            <ProofreadView
              v-show="
                shouldRenderView(tab.id, 'proofread') &&
                tab.id === activeTabId &&
                getDocumentView(tab.id) === 'proofread'
              "
              :key="`proofread-${tab.id}`"
            />
          </keep-alive>
        </template>
        <!-- 系统Tab和工具Tab：使用配置化的组件映射 - 使用v-show代替v-if，配合keep-alive实现缓存 -->
        <template v-else-if="tab.kind === 'system' || tab.kind === 'tool'">
          <!-- 动态渲染配置的组件 -->
          <keep-alive v-if="tab.route && getTabComponent(tab.kind, tab.route)">
            <component
              :is="getTabComponent(tab.kind, tab.route)"
              v-show="tab.id === activeTabId"
              :key="`${tab.kind}-${tab.route}-${tab.id}`"
            />
          </keep-alive>
          <!-- 其他系统Tab和工具Tab使用router-view作为fallback -->
          <keep-alive v-else>
            <router-view v-show="tab.id === activeTabId" :key="`router-${tab.id}`" />
          </keep-alive>
        </template>
      </template>
      <!-- 如果没有Tab，显示router-view作为fallback -->
      <router-view v-if="!workspace.tabs.length" key="router-fallback"></router-view>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useWorkspace } from '../stores/workspace'
import { getTabComponent } from '../config/tab-content-config'
import type { DocumentView } from '../stores/workspace'

// 导入文档视图组件
import Home from '../views/Home.vue'
import Editor from '../views/Editor.vue'
import Outline from '../views/Outline.vue'
import Visualize from '../views/Visualize.vue'
import ProofreadView from '../views/ProofreadView.vue'

const workspace = useWorkspace()
const { tabs, activeTabId, ensureDocument } = workspace

// 获取指定Tab的文档视图
const getDocumentView = (tabId: string): string => {
  const tab = tabs.find((t) => t.id === tabId)
  if (!tab || (tab.kind !== 'file' && tab.kind !== 'new')) {
    return 'editor'
  }
  const doc = ensureDocument(tabId)
  const view = doc.lastView || 'editor'
  return view
}

// 跟踪已经挂载过的视图，确保组件在可见状态下首次挂载，之后保持挂载
const mountedViews = ref<Set<string>>(new Set())

// 判断是否应该渲染视图（首次显示时挂载，之后保持挂载）
const shouldRenderView = (tabId: string, viewType: string): boolean => {
  const viewKey = `${tabId}-${viewType}`
  const isActive = tabId === activeTabId.value && getDocumentView(tabId) === viewType

  if (isActive) {
    mountedViews.value.add(viewKey)
    return true
  }

  return mountedViews.value.has(viewKey)
}

// 监听 tabs 变化，清理已移除 tab 的挂载记录
watch(
  () => tabs.map((t) => t.id),
  (currentTabIds, previousTabIds) => {
    if (previousTabIds) {
      const removedTabIds = previousTabIds.filter((id) => !currentTabIds.includes(id))
      removedTabIds.forEach((tabId) => {
        const viewTypes: DocumentView[] = [
          'editor',
          'outline',
          'visualize',
          'agent',
          'proofread',
          'home'
        ]
        viewTypes.forEach((viewType) => {
          mountedViews.value.delete(`${tabId}-${viewType}`)
        })
      })
    }
  },
  { immediate: false }
)
</script>

<style scoped>
.tab-content-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.tab-content-container {
  width: 100%;
  height: 100%;
  position: relative;
}

/* 确保所有Tab内容都绝对定位，使用v-show控制显示/隐藏 */
.tab-content-container > * {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
</style>
