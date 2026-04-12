<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useFocusMode } from '../../composables/useFocusMode'
import { useWorkspace, type DocumentView } from '../../stores/workspace'
import Editor from '../../views/Editor.vue'
import Home from '../../views/Home.vue'
import Outline from '../../views/Outline.vue'
import Visualize from '../../views/Visualize.vue'
import AgentView from '../../views/AgentView.vue'
import ProofreadView from '../../views/ProofreadView.vue'

const props = withDefaults(
  defineProps<{
    tabId: string
    /** true：editor 视图嵌套整窗 Editor.vue（旧 Metadoc 独立壳）；false：使用默认插槽（WorkspaceTabPane 传入 Markdown/LaTeX 等） */
    useNestedEditor?: boolean
  }>(),
  { useNestedEditor: false }
)

const workspace = useWorkspace()
const { isFocusMode } = useFocusMode()

const tab = computed(() => workspace.tabs.find((t) => t.id === props.tabId))

const currentView = computed(() => {
  if (!tab.value || (tab.value.kind !== 'file' && tab.value.kind !== 'new')) {
    return 'editor' as DocumentView
  }
  const doc = workspace.ensureDocument(props.tabId)
  let v = (doc.lastView || 'editor') as DocumentView
  if (!doc.lastView) {
    if (tab.value.kind === 'new' && !doc.format) {
      v = 'home'
    } else {
      v = 'editor'
    }
  }
  // 专注模式：可编辑文件 Tab 的主内容区应直接进编辑器。
  // - MD 等有正文时快照里常为 lastView=home（普通模式先预览主页）；专注侧栏已承担导航，主槽再显示 Home 会误以为是「整页主页」。
  // - TeX/TXT 等若历史快照仍为 home，同样纠正。
  // PDF/图片/SVG/HTML 等在 WorkspaceTabPane 已走独立 Home 预览，不会进入此处多视图壳。
  if (isFocusMode.value && tab.value.kind === 'file' && v === 'home') {
    v = 'editor'
  }
  return v
})

const mountedViews = ref<Set<DocumentView>>(new Set())

const isViewVisible = (viewType: DocumentView): boolean => currentView.value === viewType

const shouldRenderView = (viewType: DocumentView): boolean => {
  return isViewVisible(viewType) || mountedViews.value.has(viewType)
}

watch(
  currentView,
  (view) => {
    if (view) {
      mountedViews.value.add(view)
    }
  },
  { immediate: true }
)
</script>

<template>
  <div
    class="document-content-area"
    :class="{ 'document-content-area--workspace-embedded': !useNestedEditor }"
  >
    <Home
      v-if="shouldRenderView('home')"
      v-show="isViewVisible('home')"
      :key="`home-${tabId}`"
      :tab-id="tabId"
    />
    <template v-if="shouldRenderView('editor')">
      <Editor
        v-if="useNestedEditor"
        v-show="isViewVisible('editor')"
        :key="`editor-nested-${tabId}`"
        :tab-id="tabId"
      />
      <div
        v-else
        v-show="isViewVisible('editor')"
        :key="`editor-slot-wrap-${tabId}`"
        class="document-content-area__editor-slot"
      >
        <slot name="editor" />
      </div>
    </template>
    <Outline
      v-if="shouldRenderView('outline')"
      v-show="isViewVisible('outline')"
      :key="`outline-${tabId}`"
      :tab-id="tabId"
    />
    <Visualize
      v-if="shouldRenderView('visualize')"
      v-show="isViewVisible('visualize')"
      :key="`visualize-${tabId}`"
      :tab-id="tabId"
    />
    <AgentView
      v-if="shouldRenderView('agent')"
      v-show="isViewVisible('agent')"
      :key="`agent-${tabId}`"
      :tab-id="tabId"
    />
    <ProofreadView
      v-if="shouldRenderView('proofread')"
      v-show="isViewVisible('proofread')"
      :key="`proofread-${tabId}`"
      :tab-id="tabId"
    />
  </div>
</template>

<style scoped>
.document-content-area {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  position: relative;
  height: 100%;
}

/* 嵌在 Main 的 ViewMenuContainer 主槽内时，占满 flex 高度 */
.document-content-area--workspace-embedded {
  flex: 1 1 0%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.document-content-area > *:not(.document-content-area__editor-slot) {
  position: absolute;
  inset: 0;
  width: auto;
  height: auto;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
}

.document-content-area__editor-slot {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
</style>
