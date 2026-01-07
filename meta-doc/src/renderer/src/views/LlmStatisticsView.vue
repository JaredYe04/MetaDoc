<template>
  <div class="llm-statistics-view">
    <div class="view-header">
      <h2 class="view-title">{{ $t('llmStatistics.title') }}</h2>
      <div class="view-actions">
        <el-button @click="handleExport" :style="{ color: themeState.currentTheme.textColor }">
          {{ $t('llmStatistics.export') }}
        </el-button>
        <el-button @click="handleClear" type="danger" :style="{ color: themeState.currentTheme.textColor }">
          {{ $t('llmStatistics.clear') }}
        </el-button>
      </div>
    </div>
    <el-scrollbar class="view-content">
      <LlmStatisticsContent ref="contentRef" />
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { themeState } from '../utils/themes'
import LlmStatisticsContent from '../components/LlmStatisticsContent.vue'

const { t } = useI18n()
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
