<template>
  <ResizablePanel
    :visible="visible"
    :initial-width="560"
    :initial-height="320"
    :min-width="360"
    :min-height="220"
    :max-width="maxWidth"
    :max-height="maxHeight"
    :background-color="themeState.currentTheme.background"
    position="fixed"
    :bottom="30"
    :right="16"
    :enable-top-resize="true"
    :enable-left-resize="true"
    :content-padding="10"
  >
    <div class="logger-console-wrapper" :style="wrapperStyle">
      <div class="logger-console-header">
        <h3>{{ t('setting.loggerConsoleTitle') }}</h3>
        <el-button size="small" text type="danger" @click="closePanel">
          {{ t('common.close') }}
        </el-button>
      </div>
      <Console console-key="logger" :history="logHistory" />
    </div>
  </ResizablePanel>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import ResizablePanel from './base/ResizablePanel.vue';
import Console from './Console.vue';
import eventBus from '../utils/event-bus';
import { themeState } from '../utils/themes';
import { fetchLoggerHistory } from '../utils/logger.ts';
import type { LoggerHistoryEntry } from '../utils/logger.ts';

const { t } = useI18n();

const visible = ref(false);
const logHistory = ref<LoggerHistoryEntry[]>([]);

const maxWidth = computed(() => Math.floor(window.innerWidth * 0.6));
const maxHeight = computed(() => Math.floor(window.innerHeight * 0.7));

const wrapperStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  background: themeState.currentTheme.background
}));

function toggleVisibility() {
  visible.value = !visible.value;
  if (visible.value) {
    eventBus.emit('close-notification-queue');
    eventBus.emit('close-ai-task-queue');
  }
}

function closePanel() {
  visible.value = false;
}

onMounted(() => {
  fetchLoggerHistory().then(history => {
    logHistory.value = history;
  });
  eventBus.on('toggle-logger-console', toggleVisibility);
  eventBus.on('close-logger-console', closePanel);
});

onBeforeUnmount(() => {
  eventBus.off('toggle-logger-console', toggleVisibility);
  eventBus.off('close-logger-console', closePanel);
});
</script>

<style scoped>
.logger-console-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 12px;
  overflow: hidden;
}

.logger-console-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--queue-border-color, rgba(0, 0, 0, 0.08));
  padding-bottom: 6px;
  flex-shrink: 0;
}

.logger-console-header h3 {
  margin: 0;
  font-size: 16px;
}

/* 确保 Console 组件不会超出容器 */
.logger-console-wrapper :deep(.console-container) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.logger-console-wrapper :deep(.console-body) {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
</style>

