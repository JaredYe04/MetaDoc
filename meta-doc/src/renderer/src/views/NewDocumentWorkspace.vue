<template>
  <div class="new-document">
    <div class="new-document__header">
      <h1>{{ t('newDocument.title') }}</h1>
      <p>{{ t('newDocument.subtitle') }}</p>
    </div>

    <div class="new-document__formats">
      <el-radio-group v-model="selectedFormatId" class="format-group">
        <el-radio-button
          v-for="format in formats"
          :key="format.id"
          :label="format.id"
        >
          {{ formatLabel(format) }}
        </el-radio-button>
      </el-radio-group>
      <p class="format-description">
        {{ formatDescription(currentFormat) }}
      </p>
    </div>

    <div class="new-document__templates">
      <h2>{{ t('newDocument.templateTitle') }}</h2>
      <div class="template-grid">
        <div
          v-for="template in currentTemplates"
          :key="template.id"
          class="template-card"
          :class="{ active: template.id === selectedTemplateId }"
          @click="selectTemplate(template.id)"
          @dblclick="confirmTemplate(template.id)"
        >
          <div class="template-card__image" :class="{ 'is-placeholder': !template.image }">
            <img v-if="template.image" :src="template.image" :alt="templateLabel(template)" />
            <div v-else class="template-card__placeholder">
              <el-icon><Document /></el-icon>
            </div>
          </div>
          <div class="template-card__body">
            <h3>{{ templateLabel(template) }}</h3>
            <p>{{ templateDescription(template) }}</p>
          </div>
          <div class="template-card__actions">
            <el-button type="primary" round size="small" @click.stop="confirmTemplate(template.id)">
              {{ t('newDocument.useTemplate') }}
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useWorkspace } from '../stores/workspace';
import type { WorkspaceTabFormat } from '../stores/workspace';
import type { SupportedFormat, DocumentTemplate } from '../types/formats';
import { useI18n } from 'vue-i18n';
import { Document } from '@element-plus/icons-vue';

const props = defineProps<{
  tabId: string;
  active: boolean;
}>();

const workspace = useWorkspace();
const { t } = useI18n();

const formats = computed<SupportedFormat[]>(() => workspace.supportedFormats);
const selectedFormatId = ref<string>('');
const selectedTemplateId = ref<string>('');

const currentFormat = computed(() =>
  formats.value.find((format) => format.id === selectedFormatId.value),
);

const currentTemplates = computed<DocumentTemplate[]>(() => currentFormat.value?.templates ?? []);

const translate = (key?: string, fallback = '') => {
  if (!key) return fallback;
  const result = t(key);
  return result !== key ? result : fallback || key;
};

watch(
  () => props.active,
  (active) => {
    if (active && !selectedFormatId.value) {
      selectedFormatId.value = formats.value[0]?.id ?? '';
    }
  },
  { immediate: true },
);

watch(
  selectedFormatId,
  (formatId) => {
    const format = formats.value.find((item) => item.id === formatId);
    if (!format) return;
    const template =
      format.templates.find((tpl) => tpl.id === format.defaultTemplateId) ?? format.templates[0];
    selectedTemplateId.value = template?.id ?? '';
  },
  { immediate: true },
);

const formatLabel = (format?: SupportedFormat) =>
  format ? translate(format.labelKey, format.label ?? '') : '';

const formatDescription = (format?: SupportedFormat) =>
  format ? translate(format.descriptionKey, format.description ?? '') : '';

const templateLabel = (template: DocumentTemplate) =>
  translate(template.labelKey, template.label);

const templateDescription = (template: DocumentTemplate) =>
  translate(template.descriptionKey, template.description ?? '');

function selectTemplate(templateId: string) {
  selectedTemplateId.value = templateId;
}

function confirmTemplate(templateId?: string) {
  const formatId = selectedFormatId.value;
  const template = templateId ?? selectedTemplateId.value;
  if (!props.tabId || !formatId || !template) return;
  workspace.initializeDocumentFromTemplate(
    props.tabId,
    formatId as WorkspaceTabFormat,
    template,
  );
}
</script>

<style scoped>
.new-document {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px;
  height: 100%;
  overflow: auto;
}

.new-document__header h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.new-document__header p {
  margin: 8px 0 0;
  color: var(--el-text-color-secondary);
}

.new-document__formats {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.format-group {
  align-self: flex-start;
}

.format-description {
  margin: 0;
  color: var(--el-text-color-secondary);
}

.new-document__templates h2 {
  margin: 0 0 12px;
  font-size: 18px;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.template-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  background-color: var(--el-fill-color-blank);
}

.template-card:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
}

.template-card.active {
  border-color: var(--el-color-primary);
  box-shadow: 0 8px 24px rgba(64, 158, 255, 0.2);
}

.template-card__image {
  position: relative;
  padding-top: 60%;
  background: linear-gradient(135deg, rgba(64, 158, 255, 0.1), rgba(64, 158, 255, 0.05));
  display: flex;
  align-items: center;
  justify-content: center;
}

.template-card__image img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.template-card__image.is-placeholder {
  background: linear-gradient(135deg, rgba(144, 147, 153, 0.15), rgba(144, 147, 153, 0.05));
}

.template-card__placeholder {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: rgba(144, 147, 153, 0.8);
}

.template-card__body {
  padding: 16px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.template-card__body h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.template-card__body p {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.template-card__actions {
  padding: 0 16px 16px;
}
</style>

