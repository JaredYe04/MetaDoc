<template>
  <Dialog v-model:open="visible">
    <DialogContent class="sm:max-w-[400px] word-count-dialog">
      <DialogHeader>
        <DialogTitle>{{ $t('wordCountDialog.title') }}</DialogTitle>
      </DialogHeader>
      <div class="word-count-content">
        <div class="statistics-section">
          <div class="statistics-title">{{ $t('wordCountDialog.statistics') }}</div>
          <div class="statistics-list">
            <div class="stat-item">
              <span class="stat-label">{{ $t('wordCountDialog.pages') }}</span>
              <span class="stat-value">{{ stats.pages }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{{ $t('wordCountDialog.words') }}</span>
              <span class="stat-value">{{ stats.words }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{{ $t('wordCountDialog.charactersNoSpaces') }}</span>
              <span class="stat-value">{{ stats.charactersNoSpaces }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{{ $t('wordCountDialog.charactersWithSpaces') }}</span>
              <span class="stat-value">{{ stats.charactersWithSpaces }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{{ $t('wordCountDialog.paragraphs') }}</span>
              <span class="stat-value">{{ stats.paragraphs }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{{ $t('wordCountDialog.lines') }}</span>
              <span class="stat-value">{{ stats.lines }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{{ $t('wordCountDialog.nonChineseWords') }}</span>
              <span class="stat-value">{{ stats.nonChineseWords }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{{ $t('wordCountDialog.chineseAndKoreanChars') }}</span>
              <span class="stat-value">{{ stats.chineseAndKoreanChars }}</span>
            </div>
          </div>
        </div>
        <div class="options-section">
          <div class="flex items-center gap-2">
            <Checkbox
              id="includeTextBoxes"
              v-model:checked="includeTextBoxesFootnotesEndnotes"
              @update:checked="handleCheckboxChange"
            />
            <label for="includeTextBoxes" class="checkbox-label">
              {{ $t('wordCountDialog.includeTextBoxesFootnotesEndnotes') }}
            </label>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button @click="handleClose" :style="{ color: themeState.currentTheme.textColor }">
          {{ $t('wordCountDialog.close') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { themeState } from '../utils/themes'
import { getWordCountAdapter, type WordCountStats } from '../utils/word-count-adapter'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@renderer/components/ui/dialog'

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
  content: string
  format: 'md' | 'tex'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const includeTextBoxesFootnotesEndnotes = ref(true)

const adapter = computed(() => getWordCountAdapter(props.format))

const stats = computed<WordCountStats>(() => {
  if (!props.content) {
    return {
      pages: 0,
      words: 0,
      charactersNoSpaces: 0,
      charactersWithSpaces: 0,
      paragraphs: 0,
      lines: 0,
      nonChineseWords: 0,
      chineseAndKoreanChars: 0
    }
  }
  return adapter.value.count(props.content, includeTextBoxesFootnotesEndnotes.value)
})

watch(
  () => props.content,
  () => {
    // 内容变化时重新计算（computed 会自动更新）
  }
)

function handleCheckboxChange() {
  // 复选框变化时，computed 会自动重新计算
}

function handleClose() {
  visible.value = false
}
</script>

<style scoped>
.word-count-dialog {
  --el-dialog-border-radius: 8px;
}

.word-count-content {
  padding: 8px 0;
}

.statistics-section {
  margin-bottom: 16px;
}

.statistics-title {
  font-weight: 600;
  margin-bottom: 12px;
  color: v-bind('themeState.currentTheme.textColor');
}

.statistics-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.stat-label {
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.85;
}

.stat-value {
  font-weight: 500;
  color: v-bind('themeState.currentTheme.textColor');
  min-width: 60px;
  text-align: right;
}

.options-section {
  padding-top: 12px;
  border-top: 1px solid;
  border-color: v-bind('themeState.currentTheme.textColor + "33"');
}

.checkbox-label {
  color: v-bind('themeState.currentTheme.textColor');
  font-size: 14px;
  cursor: pointer;
  user-select: none;
}
</style>
