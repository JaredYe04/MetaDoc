<template>
  <div class="markdown-editor-preview">
    <el-scrollbar ref="scrollbarRef" class="markdown-editor-preview__scrollbar">
      <div ref="containerRef" class="markdown-editor-preview__container vditor-reset"></div>
    </el-scrollbar>
    <div v-if="isInitialRendering" class="markdown-editor-preview__loading">
      <Skeleton :rows="12" animated />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { debounce } from 'lodash'
import { ElScrollbar } from 'element-plus'
import { themeState } from '../../utils/themes'
import {
  renderMarkdownPreviewIncremental,
  local2fileProtocol,
  normalizeMarkdownLeadingArtifacts
} from '../../utils/md-utils'
import { useWorkspace } from '../../stores/workspace'
import eventBus from '../../utils/event-bus'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { clearPreviewTextSelection } from '../../utils/monaco-preview-sync'

const emit = defineEmits<{
  rendered: []
}>()

const props = withDefaults(
  defineProps<{
    markdown: string
    docPath?: string
  }>(),
  {
    docPath: ''
  }
)

const { t } = useI18n()
const workspace = useWorkspace()

const scrollbarRef = ref<InstanceType<typeof ElScrollbar> | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const isInitialRendering = ref(false)
let linkClickHandler: ((e: MouseEvent) => void) | null = null
let renderSeq = 0

const previewState = {
  hasRendered: false,
  lastThemeKey: '',
  lastMarkdown: ''
}

function getScrollWrapElement(): HTMLElement | null {
  return scrollbarRef.value?.wrapRef ?? null
}

const setupLinkClickHandler = (container: HTMLElement | null) => {
  if (!container) return
  if (linkClickHandler) {
    container.removeEventListener('click', linkClickHandler)
  }
  linkClickHandler = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const link = target.closest('a')
    if (link?.href) {
      const url = link.href
      if (url.startsWith('http://') || url.startsWith('https://')) {
        e.preventDefault()
        e.stopPropagation()
        eventBus.emit('open-link', url)
      }
    }
  }
  container.addEventListener('click', linkClickHandler)
}

const renderPreviewNow = async (forceFullRender = false) => {
  const seq = ++renderSeq
  const markdown = props.markdown ?? ''
  if (!markdown.trim()) {
    if (containerRef.value) containerRef.value.innerHTML = ''
    previewState.hasRendered = false
    previewState.lastThemeKey = ''
    previewState.lastMarkdown = ''
    isInitialRendering.value = false
    return
  }

  let retries = 0
  while (!containerRef.value && retries < 20) {
    await nextTick()
    retries++
  }
  if (!containerRef.value || seq !== renderSeq) return

  const isFirstRender = !previewState.hasRendered || forceFullRender
  if (isFirstRender) {
    isInitialRendering.value = true
  }

  try {
    const linkBase = props.docPath ? workspace.getLinkBase(props.docPath) : ''
    const processedMarkdown = await local2fileProtocol(
      normalizeMarkdownLeadingArtifacts(markdown),
      props.docPath
    )
    if (!containerRef.value || seq !== renderSeq) return
    containerRef.value.style.color = themeState.currentTheme.textColor || '#000000'
    await renderMarkdownPreviewIncremental(
      containerRef.value,
      processedMarkdown,
      {
        linkBase,
        renderCode: true,
        renderMath: true,
        applyMermaidTheme: true,
        syncWithAppTheme: false,
        forceFullRender
      },
      previewState
    )
    if (seq !== renderSeq) return
    setupLinkClickHandler(containerRef.value)
  } catch (error) {
    if (containerRef.value && seq === renderSeq) {
      previewState.hasRendered = false
      previewState.lastMarkdown = ''
      containerRef.value.innerHTML = `<p style="color: red; padding: 20px;">${t('vditorPreview.renderFailed')}: ${error instanceof Error ? error.message : String(error)}</p>`
    }
  } finally {
    if (seq === renderSeq) {
      isInitialRendering.value = false
      emit('rendered')
    }
  }
}

const debouncedRender = debounce(() => renderPreviewNow(false), 300)

watch(
  () => props.markdown,
  () => debouncedRender(),
  { immediate: true }
)

watch(
  () => [props.docPath, themeState.currentTheme?.type, themeState.currentTheme?.codeTheme],
  () => {
    previewState.lastMarkdown = ''
    renderPreviewNow(true)
  }
)

onBeforeUnmount(() => {
  debouncedRender.cancel()
  if (containerRef.value && linkClickHandler) {
    containerRef.value.removeEventListener('click', linkClickHandler)
  }
})

defineExpose({
  getScrollElement: () => getScrollWrapElement(),
  getContentElement: () => containerRef.value,
  clearSyncHighlight: () => {
    if (containerRef.value) clearPreviewTextSelection(containerRef.value)
  },
  clearPreviewTextSelection: () => {
    if (containerRef.value) clearPreviewTextSelection(containerRef.value)
  }
})
</script>

<style scoped>
.markdown-editor-preview {
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: v-bind('themeState.currentTheme.editorPanelBackgroundColor');
}

.markdown-editor-preview__scrollbar {
  height: 100%;
}

.markdown-editor-preview__scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.markdown-editor-preview__container {
  min-height: 100%;
  padding: 16px 24px;
  box-sizing: border-box;
}

.markdown-editor-preview__loading {
  position: absolute;
  inset: 0;
  padding: 16px;
  background: v-bind('themeState.currentTheme.editorPanelBackgroundColor');
  z-index: 2;
}
</style>
