<template>
  <div class="home-panel-content-renderable">
    <div class="home-panel-content">
      <DocumentMetaSection
        :title="fileName"
        :file-format="fileFormat"
        :creation-date="creationDate"
        :modification-date="modificationDate"
        :show-file-meta="true"
      />
      <div class="document-content-section">
        <!-- 图片/SVG：使用 ImagePreviewViewer（支持拖动、缩放） -->
        <div
          v-if="isImage || displayType === 'svg'"
          class="content-preview content-preview-rendered content-preview-image"
        >
          <ImagePreviewViewer
            :src="isImage ? imageUrl : svgDataUrl"
            :alt="fileName"
            :show-toolbar="true"
            :container-padding="16"
          />
        </div>
        <!-- HTML：沙箱 iframe -->
        <div
          v-else-if="displayType === 'html'"
          class="content-preview content-preview-rendered content-preview-html"
        >
          <iframe
            :srcdoc="content"
            sandbox="allow-same-origin"
            class="rendered-html-iframe"
            title="HTML Preview"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocumentMetaSection from './DocumentMetaSection.vue'
import ImagePreviewViewer from '../../../components/common/ImagePreviewViewer.vue'
import { themeState } from '../../../utils/themes'

defineProps<{
  fileName: string
  fileFormat?: string
  creationDate?: string
  modificationDate?: string
  displayType: 'svg' | 'html' | 'image'
  isImage: boolean
  content: string
  svgDataUrl: string
  imageUrl: string
}>()
</script>

<style scoped>
.home-panel-content-renderable {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
  overflow: hidden;
}

.home-panel-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 24px 20px;
  box-sizing: border-box;
  gap: 20px;
}

.document-content-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.content-preview-rendered {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  box-sizing: border-box;
}

.content-preview-image {
  padding: 0 8px;
  overflow: hidden;
}

.content-preview-html {
  padding: 0 8px;
  overflow: auto;
}

.content-preview-html .rendered-html-iframe {
  width: 100%;
  min-height: 100%;
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0, 0, 0, 0.08)"');
  border-radius: 8px;
}
</style>
