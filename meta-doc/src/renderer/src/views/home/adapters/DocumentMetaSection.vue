<template>
  <div class="document-meta-section">
    <div class="meta-header">
      <h1 class="document-title" :style="{ color: themeState.currentTheme.textColor }">
        {{ title }}
      </h1>
      <div v-if="showFileMeta" class="meta-info-row">
        <div class="meta-item" v-if="fileFormat">
          <span class="meta-label">{{ $t('home.fileFormatLabel') }}</span>
          <span class="meta-value" :style="{ color: themeState.currentTheme.textColor }">
            {{ fileFormat }}
          </span>
        </div>
        <div class="meta-item" v-if="creationDate">
          <span class="meta-label">{{ $t('home.creationDateLabel') }}</span>
          <span class="meta-value" :style="{ color: themeState.currentTheme.textColor }">
            {{ creationDate }}
          </span>
        </div>
        <div class="meta-item" v-if="modificationDate">
          <span class="meta-label">{{ $t('home.modificationDateLabel') }}</span>
          <span class="meta-value" :style="{ color: themeState.currentTheme.textColor }">
            {{ modificationDate }}
          </span>
        </div>
      </div>
      <div v-if="showAuthorMeta" class="meta-info-row">
        <div class="meta-item" v-if="metaAuthor">
          <span class="meta-label">{{ $t('home.authorLabel') }}</span>
          <span class="meta-value" :style="{ color: themeState.currentTheme.textColor }">
            {{ metaAuthor }}
          </span>
        </div>
      </div>
      <div v-if="metaDescription" class="meta-description">
        <span class="description-label">{{ $t('home.abstractLabel') }}</span>
        <p class="description-text" :style="{ color: themeState.currentTheme.textColor }">
          {{ metaDescription }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { themeState } from '../../../utils/themes'

defineProps<{
  title: string
  fileFormat?: string
  creationDate?: string
  modificationDate?: string
  metaAuthor?: string
  metaDescription?: string
  /** 显示文件格式、创建/修改日期（纯文本、可渲染格式） */
  showFileMeta?: boolean
  /** 显示作者、摘要（Markdown/LaTeX） */
  showAuthorMeta?: boolean
}>()
</script>

<style scoped>
.document-meta-section {
  flex-shrink: 0;
  padding-bottom: 24px;
  border-bottom: 1px solid;
  border-bottom-color: v-bind('themeState.currentTheme.borderColor || "rgba(0, 0, 0, 0.08)"');
}

.meta-header {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.document-title {
  font-size: 24px;
  font-weight: 600;
  line-height: 1.4;
  margin: 0;
  padding: 0;
  color: v-bind('themeState.currentTheme.textColor');
  letter-spacing: -0.02em;
}

.meta-info-row {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: center;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.meta-label {
  font-weight: 500;
  opacity: 0.7;
  color: v-bind('themeState.currentTheme.textColor');
}

.meta-value {
  font-weight: 400;
  color: v-bind('themeState.currentTheme.textColor');
}

.meta-description {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.description-label {
  font-size: 13px;
  font-weight: 500;
  opacity: 0.7;
  color: v-bind('themeState.currentTheme.textColor');
}

.description-text {
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
  padding: 0;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.85;
  max-width: 100%;
  word-wrap: break-word;
  overflow-wrap: break-word;
}
</style>
