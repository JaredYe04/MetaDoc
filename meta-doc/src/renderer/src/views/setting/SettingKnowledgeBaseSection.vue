<template>
  <div class="knowledge-base-settings">
    <el-form label-width="200px" class="settings-form">
      <el-form-item :label="t('setting.enableKnowledgeBase')">
        <el-tooltip :content="t('setting.knowledgeBaseTooltip')" placement="bottom">
          <el-switch v-model="settings.enableKnowledgeBase" class="mb-2"
            style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
            :active-text="t('setting.enabled')" :inactive-text="t('setting.disabled')"
            @change="handleKnowledgeBaseToggle" />
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
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { settings, setSetting } from '../../utils/settings.js';
import { sendBroadcast } from '../../utils/event-bus.js';
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

const handleKnowledgeBaseToggle = () => {
  setSetting('enableKnowledgeBase', settings.enableKnowledgeBase);
  sendBroadcast('home', 'knowledge-base-toggle', { enabled: settings.enableKnowledgeBase });
};

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

