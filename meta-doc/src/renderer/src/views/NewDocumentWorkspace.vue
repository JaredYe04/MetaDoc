<template>
  <ScrollArea class="new-document-scroll">
    <div class="new-document">
      <div class="new-document__header">
        <h1>{{ t('newDocument.title') }}</h1>
        <p>{{ t('newDocument.subtitle') }}</p>
      </div>

      <div class="new-document__formats">
        <RadioGroup v-model="selectedFormatId" class="flex format-group">
          <div class="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
            <div v-for="format in formats" :key="format.id" class="flex items-center">
              <RadioGroupItem :value="format.id" :id="'format-' + format.id" class="sr-only peer" />
              <label
                :for="'format-' + format.id"
                class="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all cursor-pointer peer-data-[state=checked]:bg-background peer-data-[state=checked]:text-foreground peer-data-[state=checked]:shadow"
              >
                {{ formatLabel(format) }}
              </label>
            </div>
          </div>
        </RadioGroup>
        <p class="format-description">
          {{ formatDescription(currentFormat) }}
        </p>
      </div>

      <div class="new-document__templates">
        <h2>{{ t('newDocument.templateTitle') }}</h2>
        <ScrollArea class="template-grid-scroll">
          <div class="template-grid-wrapper" ref="templateGridWrapperRef">
            <div class="template-grid" :style="{ gridTemplateColumns: gridTemplateColumns }">
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
                <Button
                  variant="default"
                  size="sm"
                  class="rounded-full"
                  @click.stop="confirmTemplate(template.id)"
                >
                  {{ t('newDocument.useTemplate') }}
                </Button>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  </ScrollArea>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useWorkspace } from '../stores/workspace'
import type { WorkspaceTabFormat } from '../stores/workspace'
import type { SupportedFormat, DocumentTemplate } from '../types/formats'
import { useI18n } from 'vue-i18n'
import { Document } from '@element-plus/icons-vue'
import { Button } from '@renderer/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@renderer/components/ui/radio-group'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { themeState } from '../utils/themes'

const props = defineProps<{
  tabId: string
  active: boolean
}>()

const workspace = useWorkspace()
const { t } = useI18n()

const formats = computed<SupportedFormat[]>(() => workspace.supportedFormats)
const selectedFormatId = ref<string>('')
const selectedTemplateId = ref<string>('')

const currentFormat = computed(() =>
  formats.value.find((format) => format.id === selectedFormatId.value)
)

const currentTemplates = computed<DocumentTemplate[]>(() => currentFormat.value?.templates ?? [])

// 监听模板网格容器宽度，动态计算列数，尽量占满一行并减少换行
const templateGridWrapperRef = ref<HTMLElement | null>(null)
const gridContainerWidth = ref<number>(0)
let templateGridResizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (templateGridWrapperRef.value) {
    gridContainerWidth.value = templateGridWrapperRef.value.clientWidth
    templateGridResizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        gridContainerWidth.value = entry.contentRect.width
      }
    })
    templateGridResizeObserver.observe(templateGridWrapperRef.value)
  }
})

onBeforeUnmount(() => {
  if (templateGridResizeObserver && templateGridWrapperRef.value) {
    templateGridResizeObserver.unobserve(templateGridWrapperRef.value)
    templateGridResizeObserver.disconnect()
    templateGridResizeObserver = null
  }
})

const gridTemplateColumns = computed<string>(() => {
  const width = gridContainerWidth.value
  const itemCount = currentTemplates.value.length || 1
  const cardMin = 220 // 卡片最小理想宽度
  const cardMax = 360 // 卡片最大理想宽度
  if (!width) {
    return `repeat(auto-fit, minmax(${cardMin}px, 1fr))`
  }
  // 在 [ceil(width/cardMax), floor(width/cardMin)] 范围内取值，
  // 同时不超过 itemCount，优先更多列（减少换行），并让每个单元宽度处在 [cardMin, cardMax]。
  const minColsByMax = Math.max(1, Math.ceil(width / cardMax))
  const maxColsByMin = Math.max(1, Math.floor(width / cardMin))
  const cols = Math.max(minColsByMax, Math.min(itemCount, maxColsByMin))
  return `repeat(${cols}, 1fr)`
})

const translate = (key?: string, fallback = '') => {
  if (!key) return fallback
  const result = t(key)
  return result !== key ? result : fallback || key
}

watch(
  () => props.active,
  (active) => {
    if (active && !selectedFormatId.value) {
      selectedFormatId.value = formats.value[0]?.id ?? ''
    }
  },
  { immediate: true }
)

watch(
  selectedFormatId,
  (formatId) => {
    const format = formats.value.find((item) => item.id === formatId)
    if (!format) return
    const template =
      format.templates.find((tpl) => tpl.id === format.defaultTemplateId) ?? format.templates[0]
    selectedTemplateId.value = template?.id ?? ''
  },
  { immediate: true }
)

const formatLabel = (format?: SupportedFormat) =>
  format ? translate(format.labelKey, format.label ?? '') : ''

const formatDescription = (format?: SupportedFormat) =>
  format ? translate(format.descriptionKey, format.description ?? '') : ''

const templateLabel = (template: DocumentTemplate) => translate(template.labelKey, template.label)

const templateDescription = (template: DocumentTemplate) =>
  translate(template.descriptionKey, template.description ?? '')

function selectTemplate(templateId: string) {
  selectedTemplateId.value = templateId
}

function confirmTemplate(templateId?: string) {
  const formatId = selectedFormatId.value
  const template = templateId ?? selectedTemplateId.value
  if (!props.tabId || !formatId || !template) return
  workspace.initializeDocumentFromTemplate(
    props.tabId,
    formatId as WorkspaceTabFormat,
    template,
    'editor' // 指定跳转到 Editor 视图
  )
}
</script>

<style scoped>
.new-document {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px;
  height: 100%;
  overflow: hidden;
  /* 设置主题背景色 */
  background-color: v-bind('themeState.currentTheme.background');
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.new-document-scroll {
  height: 100%;
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

.new-document__templates {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.template-grid-scroll {
  flex: 1;
  min-height: 0;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.template-card {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(77, 77, 77, 0.5);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
  background-color: var(--el-fill-color-blank);
}

.template-card:hover {
  border-color: rgba(128, 128, 128, 0.5);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
}

.template-card.active {
  border-color: rgba(128, 128, 128, 0.5);
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

.template-grid-wrapper {
  width: 100%;
}
</style>
