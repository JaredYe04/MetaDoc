<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useFocusMode } from '../../composables/useFocusMode'
import { useWorkspace, type DocumentView } from '../../stores/workspace'
import { getRegisteredViewsForRender } from '../../view-api'
import { settings } from '../../utils/settings'
import { IMAGE_EXTENSIONS } from '../../utils/file-display-utils'
import { extname } from '../../utils/path-utils'
import type { ViewWhenContext } from '../../view-api'

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

const activeDocument = computed(() => {
  try {
    return workspace.ensureDocument(props.tabId)
  } catch {
    return null
  }
})

const viewWhenContext = computed((): ViewWhenContext => {
  const t = tab.value
  const doc = activeDocument.value
  const format = doc?.format ?? t?.format ?? null
  const path = (t?.path || doc?.path || '').toLowerCase()
  const tabFormat = (t?.format || doc?.format || '').toLowerCase()
  const isPdfPreviewTab =
    !!t &&
    t.kind === 'file' &&
    t.preview === true &&
    path.endsWith('.pdf') &&
    tabFormat === 'pdf'
  const rawPath = t?.path || doc?.path || ''
  const ext = extname(rawPath).toLowerCase()
  const isImageTab =
    !!t && t.kind === 'file' && !!rawPath && IMAGE_EXTENSIONS.has(ext)

  return {
    tabId: props.tabId,
    format,
    hasActiveDocument: !!doc,
    isPlainTextFormat: format === 'txt',
    isPdfPreviewTab,
    isImageTab,
    llmEnabled: settings.llmEnabled === true
  }
})

const registeredViews = computed(() => getRegisteredViewsForRender(viewWhenContext.value))

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

const mountedViews = ref<Set<string>>(new Set())

const isViewVisible = (viewType: string): boolean => currentView.value === viewType

const shouldRenderView = (viewType: string): boolean => {
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
    <template v-for="reg in registeredViews" :key="`${reg.id}-${tabId}`">
      <template v-if="reg.renderMode === 'editor-slot' && shouldRenderView(reg.id)">
        <template v-if="useNestedEditor">
          <component
            :is="reg.component"
            v-show="isViewVisible(reg.id)"
            :key="`editor-nested-${tabId}`"
            :tab-id="tabId"
          />
        </template>
        <div
          v-else
          v-show="isViewVisible(reg.id)"
          :key="`editor-slot-wrap-${tabId}`"
          class="document-content-area__editor-slot"
        >
          <slot name="editor" />
        </div>
      </template>
      <component
        :is="reg.component"
        v-else-if="shouldRenderView(reg.id)"
        v-show="isViewVisible(reg.id)"
        :key="`${reg.id}-${tabId}`"
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
