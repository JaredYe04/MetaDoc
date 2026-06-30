<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useFocusMode } from '../../composables/useFocusMode'
import { useWorkspace, type DocumentView } from '../../stores/workspace'
import { pluginRegistry } from '../../core/host-runtime'
import { isAiRuntimeLoaded } from '../../ai-runtime/loader'
import Editor from '../../views/Editor.vue'
import Home from '../../views/Home.vue'
import Outline from '../../views/Outline.vue'
import Visualize from '../../views/Visualize.vue'

const props = withDefaults(
  defineProps<{
    tabId: string
    useNestedEditor?: boolean
  }>(),
  { useNestedEditor: false }
)

const workspace = useWorkspace()
const { isFocusMode } = useFocusMode()

const tab = computed(() => workspace.tabs.find((t) => t.id === props.tabId))

const pluginDocumentViews = computed(() => {
  if (!isAiRuntimeLoaded()) return []
  return [...pluginRegistry.documentViews.values()]
})

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
    <template v-for="pv in pluginDocumentViews" :key="`${pv.view}-${tabId}`">
      <component
        :is="pv.component"
        v-if="shouldRenderView(pv.view)"
        v-show="isViewVisible(pv.view)"
        :tab-id="tabId"
      />
    </template>
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
