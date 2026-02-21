<template>
  <el-dialog
    v-model="visible"
    :title="$t('llmStatistics.title')"
    width="900px"
    :close-on-click-modal="false"
    :close-on-press-escape="true"
    :style="{
      '--el-dialog-bg-color': themeState.currentTheme.background,
      '--el-text-color-primary': themeState.currentTheme.textColor,
      '--el-border-color': themeState.currentTheme.textColor + '33'
    }"
    class="llm-statistics-dialog"
  >
    <LlmStatisticsContent ref="contentRef" />

    <template #footer>
      <Button @click="handleExport" :style="{ color: themeState.currentTheme.textColor }">
        {{ $t('llmStatistics.export') }}
      </Button>
      <Button
        @click="handleClear"
        type="danger"
        :style="{ color: themeState.currentTheme.textColor }"
      >
        {{ $t('llmStatistics.clear') }}
      </Button>
      <Button @click="handleClose" :style="{ color: themeState.currentTheme.textColor }">
        {{ $t('llmStatistics.close') }}
      </Button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { themeState } from '../utils/themes'
import LlmStatisticsContent from './LlmStatisticsContent.vue'
import { Button } from '@renderer/components/ui/button'

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const contentRef = ref<InstanceType<typeof LlmStatisticsContent> | null>(null)

// 导出统计
async function handleExport() {
  if (contentRef.value) {
    await contentRef.value.handleExport()
  }
}

// 清空统计
async function handleClear() {
  if (contentRef.value) {
    await contentRef.value.handleClear()
  }
}

// 关闭对话框
function handleClose() {
  visible.value = false
}
</script>

<style scoped>
.llm-statistics-dialog {
  --el-dialog-border-radius: 8px;
}

:deep(.el-dialog__header) {
  background-color: v-bind(
    'themeState.currentTheme.background2nd || themeState.currentTheme.background'
  );
  border-bottom: 1px solid;
  border-color: v-bind('themeState.currentTheme.textColor + "33"');
  padding: 16px 20px;
}

:deep(.el-dialog__title) {
  color: v-bind('themeState.currentTheme.textColor');
  font-weight: 600;
}

:deep(.el-dialog__body) {
  background-color: v-bind('themeState.currentTheme.background');
  color: v-bind('themeState.currentTheme.textColor');
  padding: 20px;
}

:deep(.el-dialog__footer) {
  background-color: v-bind(
    'themeState.currentTheme.background2nd || themeState.currentTheme.background'
  );
  border-top: 1px solid;
  border-color: v-bind('themeState.currentTheme.textColor + "33"');
  padding: 12px 20px;
}

:deep(.el-dialog__headerbtn) {
  color: v-bind('themeState.currentTheme.textColor');
}

:deep(.el-dialog__headerbtn:hover) {
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.7;
}
</style>
