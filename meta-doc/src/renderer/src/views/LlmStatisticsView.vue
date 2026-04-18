<template>
  <div class="llm-statistics-view">
    <div class="view-header">
      <h2 class="view-title">{{ $t('llmStatistics.title') }}</h2>
      <div class="view-actions">
        <Button variant="outline" @click="handleExport" :disabled="isDemo">
          {{ $t('llmStatistics.export') }}
        </Button>
        <Button
          v-if="contentRef?.canClearStatistics !== false"
          variant="destructive"
          @click="handleClear"
          :disabled="isDemo"
        >
          {{ $t('llmStatistics.clear') }}
        </Button>
      </div>
    </div>
    <ScrollArea class="view-content">
      <LlmStatisticsContent ref="contentRef" :is-demo="isDemo" />
      <ScrollBar />
    </ScrollArea>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { notifyInfo } from '@renderer/utils/notify'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea, ScrollBar } from '@renderer/components/ui/scroll-area'
import { themeState } from '../utils/themes'
import LlmStatisticsContent from '../components/LlmStatisticsContent.vue'

const props = defineProps<{ mode?: string }>()
const isDemo = computed(() => props.mode === 'demo')

const { t } = useI18n()
const contentRef = ref<InstanceType<typeof LlmStatisticsContent> | null>(null)

// 导出统计
async function handleExport() {
  if (isDemo.value) {
    notifyInfo('Demo mode: Export is simulated')
    return
  }
  if (contentRef.value) {
    await contentRef.value.handleExport()
  }
}

// 清空统计
async function handleClear() {
  if (isDemo.value) {
    notifyInfo('Demo mode: Clear is simulated')
    return
  }
  if (contentRef.value) {
    await contentRef.value.handleClear()
  }
}
</script>

<style scoped>
.llm-statistics-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: v-bind('themeState.currentTheme.background');
  color: v-bind('themeState.currentTheme.textColor');
  padding: 20px;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid v-bind('themeState.currentTheme.textColor + "33"');
}

.view-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  color: v-bind('themeState.currentTheme.textColor');
}

.view-actions {
  display: flex;
  gap: 12px;
}

.view-content {
  flex: 1;
  height: 0; /* 确保 flex 子元素正确计算高度 */
}
</style>
