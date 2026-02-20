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
        <div class="qq-group">
          <span class="qq-label">{{ $t('setting.about.officialQQGroup') }}:</span>
          <span class="qq-value">1079841705</span>
        </div>
        <div class="feedback-entry">
          <el-button type="primary" plain @click="openFeedbackTab">
            {{ $t('setting.about.feedback') }}
          </el-button>
        </div>
      </div>
    </div>

    <el-divider />

    <!-- 使用标签页组织更新设置、开源许可证和第三方资产 -->
    <el-tabs v-model="activeTab" class="about-tabs">
      <el-tab-pane :label="$t('setting.about.updateSettings')" name="updates">
        <div class="update-settings">
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
                <el-radio value="release">{{ $t('setting.about.channelRelease') }}</el-radio>
                <el-radio value="dev">{{ $t('setting.about.channelDev') }}</el-radio>
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
              :description="
                updateStatus.updateInfo
                  ? $t('setting.about.updateAvailableDesc', {
                      version: updateStatus.updateInfo.version
                    })
                  : ''
              "
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

          <!-- 下载和安装按钮 -->
          <div v-if="updateStatus?.updateAvailable" class="update-actions">
            <el-button
              v-if="!downloaded && !downloading"
              type="primary"
              @click="handleDownloadUpdate"
            >
              {{ $t('setting.about.downloadUpdate') }}
            </el-button>
            <el-button v-if="downloading" type="primary" :loading="true" disabled>
              {{ $t('setting.about.downloading') }} ({{ downloadProgress }}%)
            </el-button>
            <el-button v-if="downloaded" type="success" @click="handleInstallUpdate">
              {{ $t('setting.about.installAndRestart') }}
            </el-button>
            <el-alert
              v-if="downloadError"
              type="error"
              :title="$t('setting.about.downloadError')"
              :description="downloadError"
              show-icon
              :closable="true"
              @close="downloadError = null"
              style="margin-top: 16px"
            />
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="$t('setting.about.openSourceLicenses')" name="licenses">
        <div class="licenses-section">
          <el-scrollbar class="content-scrollbar">
            <div class="content-container">
              <pre class="license-content">{{ openSourceLicenses }}</pre>
            </div>
          </el-scrollbar>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="$t('setting.about.thirdPartyAssets')" name="assets">
        <div class="assets-section">
          <el-scrollbar class="content-scrollbar">
            <div class="content-container">
              <pre class="assets-content">{{ thirdPartyAssets }}</pre>
            </div>
          </el-scrollbar>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { getAppVersion } from '../../utils/version'
import { useWorkspace } from '../../stores/workspace'
import { setSetting, getSetting } from '../../utils/settings'
import messageBridge from '../../bridge/message-bridge'
import { isDevEnvironment } from '../../utils/dev-env'
import logo from '../../assets/logo.svg'
import openSourceLicensesText from '../../assets/open-source-licenses.txt?raw'
import thirdPartyAssetsText from '../../assets/third-party-assets.txt?raw'
const { t } = useI18n()
const workspace = useWorkspace()

function openFeedbackTab() {
  workspace.openSystemTab(
    '/user-feedback',
    t('leftMenu.userFeedback') || t('userFeedback.title') || '用户反馈'
  )
}

const version = ref<string>('')
const releaseDate = ref<string | null>(null)
const buildEnvironment = ref<string>('')
const autoCheckUpdates = ref<boolean>(true)
const updateChannel = ref<'dev' | 'release'>('release')
const checking = ref<boolean>(false)
const updateStatus = ref<{
  checking: boolean
  updateAvailable: boolean
  updateNotAvailable: boolean
  error: string | null
  updateInfo: any
} | null>(null)
const downloading = ref<boolean>(false)
const downloaded = ref<boolean>(false)
const downloadProgress = ref<number>(0)
const downloadError = ref<string | null>(null)
const openSourceLicenses = ref<string>('')
const thirdPartyAssets = ref<string>('')
const activeTab = ref<string>('updates')

// 加载版本信息
const loadVersionInfo = async () => {
  try {
    version.value = await getAppVersion()

    // 获取构建环境信息
    const isDev = await isDevEnvironment()
    buildEnvironment.value = isDev
      ? t('setting.about.buildEnvironmentDev')
      : t('setting.about.buildEnvironmentRelease')

    // 获取版本文件的详细信息（包含发布日期）
    try {
      const versionInfo = await messageBridge.invoke('get-version-info')
      if (versionInfo && versionInfo.updatedAt) {
        releaseDate.value = versionInfo.updatedAt
      }
    } catch (error) {
      console.warn('获取版本详细信息失败:', error)
    }
  } catch (error) {
    console.error('加载版本信息失败:', error)
    version.value = 'Unknown'
  }
}

// 加载设置
const loadSettings = async () => {
  try {
    const autoCheck = await getSetting('autoCheckUpdates')
    autoCheckUpdates.value = autoCheck !== undefined ? autoCheck : true

    const channel = await getSetting('updateChannel')
    updateChannel.value = channel === 'dev' || channel === 'release' ? channel : 'release'
  } catch (error) {
    console.error('加载设置失败:', error)
  }
}

// 格式化日期
const formatDate = (dateString: string): string => {
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  } catch (error) {
    return dateString
  }
}

// 处理自动检查更新开关变化
const handleAutoCheckChange = () => {
  setSetting('autoCheckUpdates', autoCheckUpdates.value)
}

// 处理更新渠道变化
const handleChannelChange = () => {
  setSetting('updateChannel', updateChannel.value)
}

// 手动检查更新
const handleCheckUpdate = async () => {
  checking.value = true
  updateStatus.value = null
  downloaded.value = false
  downloading.value = false
  downloadProgress.value = 0
  downloadError.value = null

  try {
    const status = await messageBridge.invoke('check-for-updates', updateChannel.value)
    updateStatus.value = status
  } catch (error) {
    console.error('检查更新失败:', error)
    updateStatus.value = {
      checking: false,
      updateAvailable: false,
      updateNotAvailable: false,
      error: error instanceof Error ? error.message : String(error),
      updateInfo: null
    }
  } finally {
    checking.value = false
  }
}

// 下载更新
const handleDownloadUpdate = async () => {
  downloading.value = true
  downloadProgress.value = 0
  downloadError.value = null

  try {
    // 监听下载进度
    const progressHandler = (event: any, progress: { percent: number }) => {
      downloadProgress.value = Math.round(progress.percent)
    }

    messageBridge.on('update-download-progress', progressHandler)

    const result = await messageBridge.invoke('download-update')

    messageBridge.removeListener('update-download-progress', progressHandler)

    if (result.success) {
      downloaded.value = true
      downloading.value = false
      downloadProgress.value = 100
    } else {
      downloadError.value = result.error || t('setting.about.downloadError')
      downloading.value = false
    }
  } catch (error) {
    console.error('下载更新失败:', error)
    downloadError.value = error instanceof Error ? error.message : String(error)
    downloading.value = false
  }
}

// 安装更新并重启
const handleInstallUpdate = async () => {
  try {
    await messageBridge.invoke('quit-and-install')
  } catch (error) {
    console.error('安装更新失败:', error)
    downloadError.value = error instanceof Error ? error.message : String(error)
  }
}

// 监听自动下载完成事件
const handleUpdateDownloaded = (event: any, data: { version: string }) => {
  downloaded.value = true
  downloading.value = false
  downloadProgress.value = 100
  // 如果有更新状态，更新它
  if (updateStatus.value) {
    updateStatus.value.updateAvailable = true
    if (data.version) {
      updateStatus.value.updateInfo = { ...updateStatus.value.updateInfo, version: data.version }
    }
  }
}

// 加载许可证和资产信息
const loadLicenseAndAssets = async () => {
  try {
    openSourceLicenses.value = openSourceLicensesText
    thirdPartyAssets.value = thirdPartyAssetsText
  } catch (error) {
    console.error('加载许可证和资产信息失败:', error)
    openSourceLicenses.value = '加载失败，请稍后重试。'
    thirdPartyAssets.value = '加载失败，请稍后重试。'
  }
}

onMounted(async () => {
  await Promise.all([loadVersionInfo(), loadSettings(), loadLicenseAndAssets()])

  // 监听自动下载完成事件
  messageBridge.on('update-downloaded', handleUpdateDownloaded)

  // 检查是否有已下载的更新
  try {
    const status = await messageBridge.invoke('get-update-status')
    if (status && status.updateAvailable) {
      updateStatus.value = status
      // 检查更新是否已下载（通过检查是否有 update-downloaded 事件）
      // 这里我们假设如果状态显示有更新可用，可能已经下载完成
      // 实际应该通过其他方式判断，比如检查下载状态
    }
  } catch (error) {
    console.warn('获取更新状态失败:', error)
  }
})

// 组件卸载时清理监听器
onUnmounted(() => {
  messageBridge.removeListener('update-downloaded', handleUpdateDownloaded)
})
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
.build-environment,
.qq-group {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--el-text-color-regular);
  user-select: none;
}

.version-label,
.date-label,
.env-label,
.qq-label {
  font-weight: 500;
}

.version-value,
.date-value,
.env-value,
.qq-value {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  color: var(--el-text-color-primary);
}

.feedback-entry {
  margin-top: 16px;
}

.about-tabs {
  margin-top: 32px;
  height: calc(100% - 32px);
  display: flex;
  flex-direction: column;
}

.about-tabs :deep(.el-tabs__content) {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.about-tabs :deep(.el-tab-pane) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.update-settings {
  margin-top: 0;
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

.update-actions {
  margin-top: 24px;
}

.licenses-section,
.assets-section {
  margin-top: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.content-scrollbar {
  flex: 1;
  height: 100%;
}

.content-scrollbar :deep(.el-scrollbar__wrap) {
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background-color: var(--el-bg-color-page);
}

.content-container {
  padding: 16px;
}

.license-content,
.assets-content {
  margin: 0;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  white-space: pre-wrap;
  word-wrap: break-word;
  user-select: text;
}
</style>
