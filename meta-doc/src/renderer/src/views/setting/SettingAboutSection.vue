<template>
  <div class="about-section">
    <div class="about-header">
      <div class="logo-container">
        <img :src="logo" alt="MetaDoc Logo" class="app-logo" />
      </div>
      <div class="app-info">
        <h2 class="app-name">{{ $t('setting.about.appName') }}</h2>
        <div class="version-info">
          <span class="version-label">{{ $t('setting.about.version') }}:</span>
          <span class="version-value">{{ version }}</span>
        </div>
        <div v-if="releaseDate" class="release-date">
          <span class="date-label">{{ $t('setting.about.releaseDate') }}:</span>
          <span class="date-value">{{ formatDate(releaseDate) }}</span>
        </div>
        <div class="build-environment">
          <span class="env-label">{{ $t('setting.about.buildEnvironment') }}:</span>
          <span class="env-value">{{ buildEnvironment }}</span>
        </div>
      </div>
    </div>

    <el-divider />

    <div class="update-settings">
      <h3 class="section-title">{{ $t('setting.about.updateSettings') }}</h3>
      
      <el-form label-width="200px" class="settings-form">
        <el-form-item :label="$t('setting.about.autoCheckUpdates')">
          <el-switch
            v-model="autoCheckUpdates"
            :active-text="$t('setting.enabled')"
            :inactive-text="$t('setting.disabled')"
            @change="handleAutoCheckChange"
          />
        </el-form-item>

        <el-form-item :label="$t('setting.about.updateChannel')">
          <el-radio-group v-model="updateChannel" @change="handleChannelChange">
            <el-radio label="release">{{ $t('setting.about.channelRelease') }}</el-radio>
            <el-radio label="dev">{{ $t('setting.about.channelDev') }}</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            :loading="checking"
            :disabled="checking"
            @click="handleCheckUpdate"
          >
            {{ checking ? $t('setting.about.checking') : $t('setting.about.checkUpdate') }}
          </el-button>
        </el-form-item>
      </el-form>

      <!-- 更新状态提示 -->
      <div v-if="updateStatus" class="update-status">
        <el-alert
          v-if="updateStatus.updateAvailable"
          type="success"
          :title="$t('setting.about.updateAvailable')"
          :description="updateStatus.updateInfo ? $t('setting.about.updateAvailableDesc', { version: updateStatus.updateInfo.version }) : ''"
          show-icon
          :closable="false"
        />
        <el-alert
          v-else-if="updateStatus.updateNotAvailable"
          type="info"
          :title="$t('setting.about.noUpdate')"
          :description="$t('setting.about.noUpdateDesc')"
          show-icon
          :closable="false"
        />
        <el-alert
          v-else-if="updateStatus.error"
          type="error"
          :title="$t('setting.about.checkUpdateError')"
          :description="updateStatus.error"
          show-icon
          :closable="false"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { getAppVersion } from '../../utils/version';
import { setSetting, getSetting } from '../../utils/settings';
import localIpcRenderer from '../../utils/web-adapter/local-ipc-renderer';
import { isDevEnvironment } from '../../utils/dev-env';
import logo from '../../assets/logo.svg';
const { t } = useI18n();

let ipcRenderer: any = null;
if (window && window.electron) {
  ipcRenderer = window.electron.ipcRenderer;
} else {
  ipcRenderer = localIpcRenderer;
}

const version = ref<string>('');
const releaseDate = ref<string | null>(null);
const buildEnvironment = ref<string>('');
const autoCheckUpdates = ref<boolean>(true);
const updateChannel = ref<'dev' | 'release'>('release');
const checking = ref<boolean>(false);
const updateStatus = ref<{
  checking: boolean;
  updateAvailable: boolean;
  updateNotAvailable: boolean;
  error: string | null;
  updateInfo: any;
} | null>(null);



// 加载版本信息
const loadVersionInfo = async () => {
  try {
    version.value = await getAppVersion();
    
    // 获取构建环境信息
    const isDev = await isDevEnvironment();
    buildEnvironment.value = isDev 
      ? t('setting.about.buildEnvironmentDev')
      : t('setting.about.buildEnvironmentRelease');
    
    // 获取版本文件的详细信息（包含发布日期）
    try {
      const versionInfo = await ipcRenderer.invoke('get-version-info');
      if (versionInfo && versionInfo.updatedAt) {
        releaseDate.value = versionInfo.updatedAt;
      }
    } catch (error) {
      console.warn('获取版本详细信息失败:', error);
    }
  } catch (error) {
    console.error('加载版本信息失败:', error);
    version.value = 'Unknown';
  }
};

// 加载设置
const loadSettings = async () => {
  try {
    const autoCheck = await getSetting('autoCheckUpdates');
    autoCheckUpdates.value = autoCheck !== undefined ? autoCheck : true;

    const channel = await getSetting('updateChannel');
    updateChannel.value = (channel === 'dev' || channel === 'release') ? channel : 'release';
  } catch (error) {
    console.error('加载设置失败:', error);
  }
};

// 格式化日期
const formatDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (error) {
    return dateString;
  }
};

// 处理自动检查更新开关变化
const handleAutoCheckChange = () => {
  setSetting('autoCheckUpdates', autoCheckUpdates.value);
};

// 处理更新渠道变化
const handleChannelChange = () => {
  setSetting('updateChannel', updateChannel.value);
};

// 手动检查更新
const handleCheckUpdate = async () => {
  checking.value = true;
  updateStatus.value = null;

  try {
    const status = await ipcRenderer.invoke('check-for-updates', updateChannel.value);
    updateStatus.value = status;
  } catch (error) {
    console.error('检查更新失败:', error);
    updateStatus.value = {
      checking: false,
      updateAvailable: false,
      updateNotAvailable: false,
      error: error instanceof Error ? error.message : String(error),
      updateInfo: null
    };
  } finally {
    checking.value = false;
  }
};

onMounted(async () => {
  await Promise.all([
    loadVersionInfo(),
    loadSettings(),
  ]);
});
</script>

<style scoped>
.about-section {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  user-select: none;
}

.about-header {
  display: flex;
  align-items: flex-start;
  gap: 32px;
  margin-bottom: 24px;
}

.logo-container {
  flex-shrink: 0;
}

.app-logo {
  width: 128px;
  height: 128px;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.app-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.app-name {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.version-info,
.release-date,
.build-environment {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--el-text-color-regular);
  user-select: none;
}

.version-label,
.date-label,
.env-label {
  font-weight: 500;
}

.version-value,
.date-value,
.env-value {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  color: var(--el-text-color-primary);
}

.update-settings {
  margin-top: 32px;
}

.section-title {
  margin: 0 0 24px 0;
  font-size: 18px;
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

.update-status {
  margin-top: 24px;
}

.update-status :deep(.el-alert) {
  margin-bottom: 16px;
}
</style>
