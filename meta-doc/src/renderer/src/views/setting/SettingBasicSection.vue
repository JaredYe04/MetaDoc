<template>
  <el-form label-width="200px" class="settings-form">
    <el-form-item :label="t('setting.startupOption')">
      <el-select v-model="settings.startupOption" @change="saveSetting('startupOption', settings.startupOption)">
        <el-option :label="t('setting.openNewFile')" value="newFile" />
        <el-option :label="t('setting.openLastFile')" value="lastFile" />
      </el-select>
    </el-form-item>

    <el-form-item :label="t('setting.askBeforeSave')">
      <el-switch v-model="settings.alwaysAskSave" class="mb-2"
        style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
        :active-text="t('setting.enabled')" :inactive-text="t('setting.disabled')"
        @change="saveSetting('alwaysAskSave', settings.alwaysAskSave)" />
    </el-form-item>

    <el-form-item>
      <template #label>
        <span>{{ t('setting.particleEffect') }}</span>
        <el-tooltip :content="t('setting.particleEffectHint')" placement="top">
          <el-icon class="metadata-info-icon"><QuestionFilled /></el-icon>
        </el-tooltip>
      </template>
      <el-switch v-model="settings.particleEffect" class="mb-2"
        style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
        :active-text="t('setting.enabled')" :inactive-text="t('setting.disabled')"
        @change="handleParticleToggle" />
    </el-form-item>

    <el-form-item :label="t('setting.autoSave')">
      <el-select v-model="settings.autoSave" @change="saveSetting('autoSave', settings.autoSave)">
        <el-option :label="t('setting.off')" value="never" />
        <el-option :label="t('setting.minute1')" value="1" />
        <el-option :label="t('setting.minute5')" value="5" />
        <el-option :label="t('setting.minute10')" value="10" />
        <el-option :label="t('setting.minute30')" value="30" />
        <el-option :label="t('setting.minute60')" value="60" />
      </el-select>
    </el-form-item>

    <!-- <el-form-item :label="t('setting.microphoneTest')">
      <el-tooltip :content="t('setting.microphoneHint')" placement="bottom">
        <MicrophoneTest />
      </el-tooltip>
    </el-form-item> -->

    <el-form-item>
      <template #label>
        <span>{{ t('setting.excludeCodeBlocks') }}</span>
        <el-tooltip :content="t('setting.excludeCodeHint')" placement="top">
          <el-icon class="metadata-info-icon"><QuestionFilled /></el-icon>
        </el-tooltip>
      </template>
      <el-switch v-model="settings.bypassCodeBlock" class="mb-2"
        style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
        :active-text="t('setting.enabled')" :inactive-text="t('setting.disabled')"
        @change="saveSetting('bypassCodeBlock', settings.bypassCodeBlock)" />
    </el-form-item>

    <el-form-item>
      <template #label>
        <span>{{ t('setting.autoDownloadImage') }}</span>
        <el-tooltip :content="t('setting.autoDownloadHint')" placement="top">
          <el-icon class="metadata-info-icon"><QuestionFilled /></el-icon>
        </el-tooltip>
      </template>
      <el-switch v-model="settings.autoSaveExternalImage" class="mb-2"
        style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
        :active-text="t('setting.enabled')" :inactive-text="t('setting.disabled')"
        @change="saveSetting('autoSaveExternalImage', settings.autoSaveExternalImage)" />
    </el-form-item>

    <el-form-item>
      <template #label>
        <span>{{ t('setting.parseEmbeddedImages') }}</span>
        <el-tooltip :content="t('setting.parseEmbeddedImagesHint')" placement="top">
          <el-icon class="metadata-info-icon"><QuestionFilled /></el-icon>
        </el-tooltip>
      </template>
      <el-switch v-model="settings.parseEmbeddedImages" class="mb-2"
        style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
        :active-text="t('setting.enabled')" :inactive-text="t('setting.disabled')"
        @change="saveSetting('parseEmbeddedImages', settings.parseEmbeddedImages)" />
    </el-form-item>

    <el-form-item>
      <template #label>
        <span>{{ t('setting.metadataSaveMode') }}</span>
        <el-tooltip :content="t('setting.metadataInfoHint')" placement="top">
          <el-icon class="metadata-info-icon"><QuestionFilled /></el-icon>
        </el-tooltip>
      </template>
      <el-select v-model="settings.metadataSaveMode" @change="saveSetting('metadataSaveMode', settings.metadataSaveMode)">
        <el-option value="sidecar">
          <el-tooltip :content="t('setting.metadataSaveModeSidecarHint')" placement="right" :show-after="300">
            <span>{{ t('setting.metadataSaveModeSidecar') }}</span>
          </el-tooltip>
        </el-option>
        <el-option value="embed">
          <el-tooltip :content="t('setting.metadataSaveModeEmbedHint')" placement="right" :show-after="300">
            <span>{{ t('setting.metadataSaveModeEmbed') }}</span>
          </el-tooltip>
        </el-option>
        <el-option value="none">
          <el-tooltip :content="t('setting.metadataSaveModeNoneHint')" placement="right" :show-after="300">
            <span>{{ t('setting.metadataSaveModeNone') }}</span>
          </el-tooltip>
        </el-option>
      </el-select>
    </el-form-item>

    <el-form-item :label="t('setting.referenceDirManagement', '引用文件目录管理')">
      <div class="reference-dir-management">
        <div class="reference-dir-info">
          <span class="reference-dir-size-label">{{ t('setting.referenceDirSize', '目录大小') }}: </span>
          <span class="reference-dir-size-value">{{ formatFileSize(referenceDirSize) }}</span>
        </div>
        <div class="reference-dir-actions">
          <el-button size="small" @click="refreshReferenceDirSize">
            {{ t('setting.refresh', '刷新') }}
          </el-button>
          <el-button size="small" type="primary" @click="openReferenceDir">
            {{ t('setting.openReferenceDir', '打开目录') }}
          </el-button>
          <el-button size="small" type="danger" @click="clearReferenceDir">
            {{ t('setting.clearReferenceDir', '清空目录') }}
          </el-button>
        </div>
      </div>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { QuestionFilled } from '@element-plus/icons-vue';
import MicrophoneTest from '../../components/MicrophoneTest.vue';
import { settings, setSetting } from '../../utils/settings.js';
import eventBus from '../../utils/event-bus';
// 单窗口多Tab架构：不再需要sendBroadcast，直接使用eventBus

const { t } = useI18n();

const referenceDirSize = ref<number>(0);

const saveSetting = (key: string, value: unknown) => {
  setSetting(key, value);
};

const handleParticleToggle = () => {
  saveSetting('particleEffect', settings.particleEffect);
  // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast
  eventBus.emit('toggle-particle-effect', {});
};

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

// 获取reference目录大小
const refreshReferenceDirSize = async () => {
  try {
    let ipcRenderer: any = null;
    if (typeof window !== 'undefined') {
      if ((window as any).electron?.ipcRenderer) {
        ipcRenderer = (window as any).electron.ipcRenderer;
      } else {
        const { localIpcRenderer } = await import('../../utils/web-adapter/local-ipc-renderer');
        ipcRenderer = localIpcRenderer;
      }
    }
    
    if (!ipcRenderer) {
      throw new Error('IPC渲染器不可用');
    }
    
    const size = await ipcRenderer.invoke('get-reference-dir-size') as number;
    referenceDirSize.value = size;
  } catch (error) {
    ElMessage.error('获取目录大小失败: ' + (error instanceof Error ? error.message : String(error)));
  }
};

// 打开reference目录
const openReferenceDir = async () => {
  try {
    let ipcRenderer: any = null;
    if (typeof window !== 'undefined') {
      if ((window as any).electron?.ipcRenderer) {
        ipcRenderer = (window as any).electron.ipcRenderer;
      } else {
        const { localIpcRenderer } = await import('../../utils/web-adapter/local-ipc-renderer');
        ipcRenderer = localIpcRenderer;
      }
    }
    
    if (!ipcRenderer) {
      throw new Error('IPC渲染器不可用');
    }
    
    await ipcRenderer.invoke('open-reference-dir');
  } catch (error) {
    ElMessage.error('打开目录失败: ' + (error instanceof Error ? error.message : String(error)));
  }
};

// 清空reference目录
const clearReferenceDir = async () => {
  try {
    await ElMessageBox.confirm(
      t('setting.clearReferenceDirConfirm', '确定要清空引用文件目录吗？此操作将删除目录中的所有文件，且无法恢复。'),
      t('setting.clearReferenceDir', '清空目录'),
      {
        type: 'warning',
        confirmButtonText: t('common.confirm', '确认'),
        cancelButtonText: t('common.cancel', '取消')
      }
    );
    
    let ipcRenderer: any = null;
    if (typeof window !== 'undefined') {
      if ((window as any).electron?.ipcRenderer) {
        ipcRenderer = (window as any).electron.ipcRenderer;
      } else {
        const { localIpcRenderer } = await import('../../utils/web-adapter/local-ipc-renderer');
        ipcRenderer = localIpcRenderer;
      }
    }
    
    if (!ipcRenderer) {
      throw new Error('IPC渲染器不可用');
    }
    
    await ipcRenderer.invoke('clear-reference-dir');
    await refreshReferenceDirSize();
    ElMessage.success(t('setting.clearReferenceDirSuccess', '目录已清空'));
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('清空目录失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  }
};

onMounted(() => {
  refreshReferenceDirSize();
});
</script>

<style scoped>
.settings-form {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.settings-form :deep(.el-form-item) {
  margin-bottom: 24px;
}

.settings-form :deep(.el-input),
.settings-form :deep(.el-select) {
  width: 100%;
  max-width: 100%;
}

.reference-dir-management {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.reference-dir-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.reference-dir-size-label {
  font-weight: 500;
}

.reference-dir-size-value {
  color: var(--el-text-color-regular);
}

.reference-dir-actions {
  display: flex;
  gap: 8px;
}

.metadata-info-icon {
  margin-left: 4px;
  color: var(--el-text-color-secondary);
  cursor: help;
  font-size: 14px;
}

.metadata-info-icon:hover {
  color: var(--el-color-primary);
}
</style>

