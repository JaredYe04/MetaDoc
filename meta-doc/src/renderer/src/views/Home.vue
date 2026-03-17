<template>
  <div class="homepage">
    <!-- 如果文档格式未选择，显示格式选择界面 -->
    <div v-if="needsFormatSelection" class="format-selection-container">
      <NewDocumentWorkspace v-if="activeTabId" :tab-id="activeTabId" :active="true" />
    </div>

    <!-- 如果已选择格式，显示文档预览 -->
    <div v-else-if="showDocumentPreview" class="home-panel" :style="panelStyle">
      <HomePdfAdapter v-if="isPdfTab" :pdf-url="pdfUrlForHome" class="home-panel-adapter" />
      <HomeRenderableAdapter
        v-else-if="isRenderableFormat"
        class="home-panel-adapter"
        :file-name="fileName"
        :file-format="fileFormat"
        :creation-date="creationDate"
        :modification-date="modificationDate"
        :display-type="renderableDisplayType as 'svg' | 'html' | 'image'"
        :is-image="isImageFormat(currentFilePath)"
        :content="renderableContent"
        :svg-data-url="renderableSvgDataUrl"
        :image-url="renderableFileUrl"
      />
      <HomePlainTextAdapter
        v-else-if="isPlainTextFormat"
        ref="plainTextAdapterRef"
        class="home-panel-adapter"
        :file-name="fileName"
        :file-format="fileFormat"
        :creation-date="creationDate"
        :modification-date="modificationDate"
        :content="plainTextContent"
        :file-path="currentFilePath"
      />
      <HomeMarkdownAdapter
        v-else
        class="home-panel-adapter"
        :markdown="previewMarkdown"
        :link-base="currentLinkBase"
        :doc-path="currentFilePath"
        :meta-title="metaTitle"
        :meta-author="metaAuthor"
        :meta-description="metaDescription"
        :open-system-tab="openSystemTab"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import NewDocumentWorkspace from './NewDocumentWorkspace.vue'
import eventBus, { getWindowType } from '../utils/event-bus'
import { themeState } from '../utils/themes'
import { convertLatexToMarkdown } from '../utils/latex-utils'
import { svgContentToDataUrl } from '../utils/file-display-utils'
import {
  HomePdfAdapter,
  HomeRenderableAdapter,
  HomePlainTextAdapter,
  HomeMarkdownAdapter
} from './home/adapters'
import { useHomeDocumentPreview } from './home/useHomeDocumentPreview'

const {
  activeDocument,
  activeTab,
  workspace,
  currentFilePath,
  metaTitle,
  metaAuthor,
  metaDescription,
  fileName,
  fileFormat,
  creationDate,
  modificationDate,
  isRenderableFormat,
  renderableDisplayType,
  isPlainTextFormat,
  isPdfTab,
  showDocumentPreview,
  needsFormatSelection,
  currentLinkBase,
  encodeFilePathToUrl,
  loadFileStats,
  isImageFormat
} = useHomeDocumentPreview({ windowTypeProvider: () => getWindowType() })

const { activeTabId, openSystemTab } = workspace

const pdfUrlForHome = computed(() => {
  if (!currentFilePath.value || !isPdfTab.value) return ''
  return encodeFilePathToUrl(currentFilePath.value)
})

const renderableContent = computed(
  () => (activeDocument.value?.format === 'txt' ? (activeDocument.value?.markdown ?? '') : '')
)

const renderableSvgDataUrl = computed(() => svgContentToDataUrl(renderableContent.value))

const renderableFileUrl = computed(() => {
  if (!isImageFormat(currentFilePath.value)) return ''
  return encodeFilePathToUrl(currentFilePath.value)
})

const plainTextContent = computed(
  () => (activeDocument.value?.format === 'txt' ? (activeDocument.value?.markdown ?? '') : '')
)

const previewMarkdown = computed(() => {
  const doc = activeDocument.value
  if (!doc) return ''
  if (doc.format === 'tex') return convertLatexToMarkdown(doc.tex ?? '')
  return doc.markdown ?? ''
})

const panelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  borderColor: themeState.currentTheme.borderColor || 'rgba(0, 0, 0, 0.1)'
}))

const plainTextAdapterRef = ref<InstanceType<typeof HomePlainTextAdapter> | null>(null)

function preventNavigate() {
  document.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement | null)?.closest('a') as HTMLAnchorElement | null
    if (target && target.href && target.target !== '_blank') {
      event.preventDefault()
      if (target.href.startsWith('http')) {
        eventBus.emit('open-link', target.href)
      }
    }
  })
}

// 监听文件路径变化，加载文件统计信息
watch(
  [currentFilePath, isPlainTextFormat, isRenderableFormat],
  () => {
    if ((isPlainTextFormat.value || isRenderableFormat.value) && currentFilePath.value) {
      loadFileStats()
    }
  },
  { immediate: true }
)

onMounted(() => {
  preventNavigate()
  eventBus.on('sync-editor-theme', () => {
    plainTextAdapterRef.value?.syncTheme?.()
  })
})

onBeforeUnmount(() => {
  eventBus.off('sync-editor-theme')
})
</script>

<style scoped>
.homepage {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: v-bind('themeState.currentTheme.background');
}

.format-selection-container {
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 1;
}

.home-panel {
  position: relative;
  z-index: 1;
  flex: 1;
  width: calc(100% - 48px);
  min-height: 0;
  margin: 24px;
  border-radius: 16px;
  border: 1px solid;
  backdrop-filter: blur(20px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.home-panel-adapter {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

@media (max-width: 768px) {
  .home-panel {
    width: calc(100% - 32px);
    height: calc(100% - 32px);
    margin: 16px;
    border-radius: 12px;
  }
}
</style>
