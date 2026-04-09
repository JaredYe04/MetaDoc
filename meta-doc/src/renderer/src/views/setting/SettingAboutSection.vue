<template>
  <div class="about-section">
    <div class="about-header">
      <div class="logo-container">
        <LogoIcon :size="128" :bg-color="bgColor" :symbol-color="symbolColor" class="app-logo" />
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
          <Button variant="outline" @click="openFeedbackTab">
            {{ $t('setting.about.feedback') }}
          </Button>
        </div>
      </div>
    </div>

    <Divider />

    <!-- 使用标签页组织更新设置、开源许可证和第三方资产 -->
    <Tabs v-model="activeTab" class="about-tabs">
      <TabsList class="about-tabs-list">
        <TabsTrigger value="updates">{{ $t('setting.about.updateSettings') }}</TabsTrigger>
        <TabsTrigger value="licenses">{{ $t('setting.about.openSourceLicenses') }}</TabsTrigger>
        <TabsTrigger value="assets">{{ $t('setting.about.thirdPartyAssets') }}</TabsTrigger>
      </TabsList>

      <TabsContent value="updates" class="about-tabs-content">
        <div class="update-settings">
          <div class="settings-form space-y-6">
            <FormField :label="$t('setting.about.autoCheckUpdates')" name="autoCheckUpdates">
              <div class="flex items-center gap-3">
                <Switch
                  v-model:checked="autoCheckUpdates"
                  @update:checked="handleAutoCheckChange"
                />
                <span class="text-sm text-muted-foreground">
                  {{ autoCheckUpdates ? $t('setting.enabled') : $t('setting.disabled') }}
                </span>
              </div>
            </FormField>

            <FormField :label="$t('setting.about.updateChannel')" name="updateChannel">
              <RadioGroup
                v-model="updateChannel"
                @update:modelValue="handleChannelChange"
                class="flex flex-row gap-6"
              >
                <div class="flex items-center space-x-2">
                  <RadioGroupItem value="release" id="update-release" />
                  <Label for="update-release" class="text-sm font-normal cursor-pointer">
                    {{ $t('setting.about.channelRelease') }}
                  </Label>
                </div>
                <div class="flex items-center space-x-2">
                  <RadioGroupItem value="dev" id="update-dev" />
                  <Label for="update-dev" class="text-sm font-normal cursor-pointer">
                    {{ $t('setting.about.channelDev') }}
                  </Label>
                </div>
              </RadioGroup>
            </FormField>

            <div class="pt-2">
              <Button @click="handleCheckUpdate" :disabled="checking">
                {{ checking ? $t('setting.about.checking') : $t('setting.about.checkUpdate') }}
              </Button>
            </div>
          </div>

          <!-- 更新状态提示 -->
          <div v-if="updateStatus" class="update-status">
            <Alert v-if="updateStatus.updateAvailable" variant="default" class="mb-4">
              <CheckCircle2 class="h-4 w-4" />
              <AlertTitle>{{ $t('setting.about.updateAvailable') }}</AlertTitle>
              <AlertDescription v-if="updateStatus.updateInfo">
                {{
                  $t('setting.about.updateAvailableDesc', {
                    version: updateStatus.updateInfo.version
                  })
                }}
              </AlertDescription>
            </Alert>
            <Alert v-else-if="updateStatus.updateNotAvailable" variant="default" class="mb-4">
              <Info class="h-4 w-4" />
              <AlertTitle>{{ $t('setting.about.noUpdate') }}</AlertTitle>
              <AlertDescription>{{ $t('setting.about.noUpdateDesc') }}</AlertDescription>
            </Alert>
            <Alert v-else-if="updateStatus.error" variant="destructive" class="mb-4">
              <XCircle class="h-4 w-4" />
              <AlertTitle>{{ $t('setting.about.checkUpdateError') }}</AlertTitle>
              <AlertDescription>{{ updateStatus.error }}</AlertDescription>
            </Alert>
          </div>

          <!-- 下载和安装按钮 -->
          <div v-if="updateStatus?.updateAvailable" class="update-actions">
            <Button v-if="!downloaded && !downloading" @click="handleDownloadUpdate">
              {{ $t('setting.about.downloadUpdate') }}
            </Button>
            <Button v-if="downloading" :disabled="true">
              {{ $t('setting.about.downloading') }} ({{ downloadProgress }}%)
            </Button>
            <Button
              v-if="downloaded"
              @click="handleInstallUpdate"
              class="bg-green-600 hover:bg-green-700 text-white"
            >
              {{ $t('setting.about.installAndRestart') }}
            </Button>
            <Alert v-if="downloadError" variant="destructive" class="mt-4">
              <XCircle class="h-4 w-4" />
              <AlertTitle>{{ $t('setting.about.downloadError') }}</AlertTitle>
              <AlertDescription>{{ downloadError }}</AlertDescription>
            </Alert>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="licenses" class="about-tabs-content">
        <div class="licenses-section">
          <ScrollArea class="h-[400px]">
            <pre class="license-content">{{ openSourceLicenses }}</pre>
          </ScrollArea>
        </div>
      </TabsContent>

      <TabsContent value="assets" class="about-tabs-content">
        <div class="assets-section">
          <ScrollArea class="h-[400px]">
            <pre class="assets-content">{{ thirdPartyAssets }}</pre>
          </ScrollArea>
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@renderer/components/ui/tabs'
import { Button } from '@renderer/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@renderer/components/ui/radio-group'

import { Alert, AlertTitle, AlertDescription } from '@renderer/components/ui/alert'
import { CheckCircle2, Info, XCircle } from 'lucide-vue-next'
import { getAppVersion } from '../../utils/common/version'
import { useWorkspace } from '../../stores/workspace'
import { setSetting, getSetting } from '../../utils/settings'
import messageBridge from '../../bridge/message-bridge'
import { isDevEnvironment } from '../../utils/common/dev-env'
import { FIXED_LOGO_COLORS } from '../../utils/themes'
import openSourceLicensesText from '../../assets/open-source-licenses.txt?raw'
import thirdPartyAssetsText from '../../assets/third-party-assets.txt?raw'
import { FormField } from '@renderer/components/ui/form'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Divider } from '@renderer/components/ui/separator'
import LogoIcon from '../../components/layout/LogoIcon.vue'

// Logo 固定配色，不随亮/暗主题变化
const bgColor = FIXED_LOGO_COLORS.bgColor
const symbolColor = FIXED_LOGO_COLORS.symbolColor

// ==================== Demo Mode Support ====================

const props = defineProps<{
  mode?: string
}>()
const isDemo = computed(() => props.mode === 'demo')

const { t } = useI18n()
const workspace = useWorkspace()

function openFeedbackTab() {
  workspace.openSystemTab(
    '/user-feedback',
    t('leftMenu.userFeedback') || t('userFeedback.title') || 'User Feedback'
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
    openSourceLicenses.value = t('setting.about.loadFailed')
    thirdPartyAssets.value = t('setting.about.loadFailed')
  }
}

// Demo数据加载
const loadDemoData = () => {
  // 版本信息
  version.value = '0.17.11'
  releaseDate.value = '2025-02-20'
  buildEnvironment.value = t('setting.about.buildEnvironmentRelease')

  // 更新设置
  autoCheckUpdates.value = true
  updateChannel.value = 'release'

  // 许可证和资产信息 (使用文本片段)
  openSourceLicenses.value =
    openSourceLicensesText.substring(0, 800) + '\n\n[... 许可证内容已截断 ...]'
  thirdPartyAssets.value =
    thirdPartyAssetsText.substring(0, 500) + '\n\n[... 第三方资产列表已截断 ...]'
}

onMounted(async () => {
  if (isDemo.value) {
    loadDemoData()
    return
  }

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
  max-width: 720px;
  margin: 0 auto;
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
  color: hsl(var(--foreground));
}

.version-info,
.release-date,
.build-environment,
.qq-group {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: hsl(var(--muted-foreground));
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
  color: hsl(var(--foreground));
}

.feedback-entry {
  margin-top: 16px;
}

.about-tabs {
  margin-top: 32px;
}

.about-tabs-list {
  display: flex;
  gap: 4px;
  padding: 4px;
  background-color: hsl(var(--muted));
  border-radius: 6px;
  margin-bottom: 16px;
}

.about-tabs-content {
  padding-top: 8px;
}

.update-settings {
  margin-top: 0;
}

/* 防止异常大图标 */
.update-settings svg {
  width: 1em;
  height: 1em;
  flex-shrink: 0;
}

.section-title {
  margin: 0 0 24px 0;
  font-size: 18px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.settings-form {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.update-status {
  margin-top: 24px;
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

.license-content,
.assets-content {
  margin: 0;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: hsl(var(--foreground));
  white-space: pre-wrap;
  word-wrap: break-word;
  user-select: text;
  background-color: hsl(var(--muted) / 0.3);
  padding: 16px;
  border-radius: 6px;
}
</style>
