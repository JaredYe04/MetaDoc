<template>
  <div class="knowledge-base-settings">
    <h3 class="section-title">{{ t('setting.knowledgeBaseSettings') }}</h3>
    <el-form label-width="200px" class="settings-form">
      <el-form-item :label="t('setting.enableKnowledgeBase')">
        <el-tooltip :content="t('setting.knowledgeBaseTooltip')" placement="bottom">
          <el-switch v-model="settings.enableKnowledgeBase" class="mb-2"
            :active-text="t('setting.enabled')" :inactive-text="t('setting.disabled')"
            @change="handleKnowledgeBaseToggleChange" />
        </el-tooltip>
      </el-form-item>

      <el-form-item v-if="settings.enableKnowledgeBase" :label="t('setting.embeddingMode')">
        <el-tooltip :content="t('setting.embeddingModeTooltip')" placement="top">
          <el-select v-model="settings.embeddingMode" :placeholder="t('setting.chooseEmbeddingMode')"
            @change="handleEmbeddingModeChange" style="width: 300px">
            <el-tooltip :content="t('setting.embeddingModeApiHint')" placement="left">
              <el-option :label="t('setting.embeddingModeApi')" value="api" />
            </el-tooltip>
            <el-tooltip :content="t('setting.embeddingModeLocalHint')" placement="left">
              <el-option :label="t('setting.embeddingModeLocal')" value="local" disabled />
            </el-tooltip>
          </el-select>
        </el-tooltip>
      </el-form-item>

      <el-form-item v-if="settings.enableKnowledgeBase" :label="t('setting.knowledgeBaseScoreThreshold')">
        <el-tooltip :content="t('setting.knowledgeBaseScoreThresholdTooltip')" placement="top">
          <el-slider v-model="settings.knowledgeBaseScoreThreshold" show-input :min="0.01" :max="0.99"
            :step="0.01" @change="handleKnowledgeBaseThresholdChange"
            :marks="sliderMarks" style="margin-bottom: 10px; width: 400px;" />
        </el-tooltip>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { settings, setSetting } from '../../utils/settings.js';
// 单窗口多Tab架构：不再需要sendBroadcast，直接使用eventBus
import eventBus from '../../utils/event-bus.js';
import localIpcRenderer from '../../utils/web-adapter/local-ipc-renderer';

const { t } = useI18n();

let ipcRenderer: any = null;
if (window && (window as any).electron) {
  ipcRenderer = (window as any).electron.ipcRenderer;
} else {
  ipcRenderer = localIpcRenderer;
}

const sliderMarks = computed(() => ({
  0.1: '0.1',
  0.5: '0.5',
  0.9: '0.9'
}));

// 监听知识库开关事件（从其他组件同步状态）
const handleKnowledgeBaseToggle = (payload: unknown) => {
  const data = payload as { enabled?: boolean };
  if (typeof data?.enabled === 'boolean' && settings.enableKnowledgeBase !== data.enabled) {
    settings.enableKnowledgeBase = data.enabled;
    setSetting('enableKnowledgeBase', data.enabled);
  }
};

const handleKnowledgeBaseToggleChange = () => {
  setSetting('enableKnowledgeBase', settings.enableKnowledgeBase);
  // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast
  eventBus.emit('knowledge-base-toggle', { enabled: settings.enableKnowledgeBase });
};

onMounted(() => {
  // 监听知识库开关事件，同步状态
  eventBus.on('knowledge-base-toggle', handleKnowledgeBaseToggle);
});

onBeforeUnmount(() => {
  // 清理事件监听器
  eventBus.off('knowledge-base-toggle', handleKnowledgeBaseToggle);
});

const handleKnowledgeBaseThresholdChange = () => {
  setSetting('knowledgeBaseScoreThreshold', settings.knowledgeBaseScoreThreshold);
};

const handleEmbeddingModeChange = async () => {
  setSetting('embeddingMode', settings.embeddingMode);
  // 同步到主进程
  await ipcRenderer.invoke('set-embedding-mode', settings.embeddingMode);
};
</script>

<style scoped>
.knowledge-base-settings {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.section-title {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.settings-form {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.settings-form :deep(.el-form-item) {
  margin-bottom: 24px;
}

.settings-form :deep(.el-input),
.settings-form :deep(.el-select),
.settings-form :deep(.el-slider) {
  width: 100%;
  max-width: 100%;
}

.settings-form :deep(.el-slider) {
  max-width: 100%;
}
</style>

