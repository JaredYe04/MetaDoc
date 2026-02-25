<template>
  <ResizablePanel
    ref="panelRef"
    :visible="visible"
    :initial-width="360"
    :initial-height="280"
    :min-width="260"
    :min-height="220"
    :max-width="maxWidth"
    :max-height="maxHeight"
    :background-color="themeState.currentTheme.background"
    position="fixed"
    :bottom="30"
    :left="16"
    :enable-top-resize="true"
    :enable-right-resize="true"
    :content-padding="16"
    @resize="onResize"
  >
    <div class="version-info-wrapper" :style="wrapperStyle">
      <div class="version-header">
        <h3>{{ $t('versionInfoPanel.title') }}</h3>
      </div>

      <ScrollArea class="flex-1 w-full overflow-auto">
        <div class="version-content">
          <div class="version-info-item">
            <span class="info-label">{{ $t('versionInfoPanel.version') }}:</span>
            <span class="info-value">{{ version }}</span>
          </div>
          <div v-if="releaseDate" class="version-info-item">
            <span class="info-label">{{ $t('versionInfoPanel.releaseDate') }}:</span>
            <span class="info-value">{{ formatDate(releaseDate) }}</span>
          </div>
          <div class="version-info-item">
            <span class="info-label">{{ $t('versionInfoPanel.buildEnvironment') }}:</span>
            <span class="info-value">{{ buildEnvironment }}</span>
          </div>

          <!-- 更新状态提示 -->
          <div v-if="updateStatus" class="update-status">
            <Alert v-if="updateStatus.updateAvailable" variant="default">
              <CheckCircle2 class="h-4 w-4" />
              <AlertTitle>{{ $t('versionInfoPanel.updateAvailable') }}</AlertTitle>
              <AlertDescription v-if="updateStatus.updateInfo">
                {{
                  $t('versionInfoPanel.updateAvailableDesc', {
                    version: updateStatus.updateInfo.version
                  })
                }}
              </AlertDescription>
            </Alert>
            <Alert v-else-if="updateStatus.updateNotAvailable" variant="default">
              <Info class="h-4 w-4" />
              <AlertTitle>{{ $t('versionInfoPanel.noUpdate') }}</AlertTitle>
              <AlertDescription>{{ $t('versionInfoPanel.noUpdateDesc') }}</AlertDescription>
            </Alert>
            <Alert v-else-if="updateStatus.error" variant="destructive">
              <XCircle class="h-4 w-4" />
              <AlertTitle>{{ $t('versionInfoPanel.checkUpdateError') }}</AlertTitle>
              <AlertDescription>{{ updateStatus.error }}</AlertDescription>
            </Alert>
          </div>
        </div>
      </ScrollArea>

      <!-- 操作按钮 -->
      <div class="version-actions">
        <Button
          v-if="!updateStatus?.updateAvailable && !downloaded && !downloading"
          type="primary"
          :loading="checking"
          :disabled="checking"
          @click="handleCheckUpdate"
          style="width: 100%"
        >
          {{ checking ? $t('versionInfoPanel.checking') : $t('versionInfoPanel.checkUpdate') }}
        </Button>
        <Button
          v-if="updateStatus?.updateAvailable && !downloaded && !downloading"
          type="primary"
          @click="handleDownloadUpdate"
          style="width: 100%"
        >
          {{ $t('versionInfoPanel.downloadAndInstall') }}
        </Button>
        <Button v-if="downloading" type="primary" :loading="true" disabled style="width: 100%">
          {{ $t('versionInfoPanel.downloadProgress', { progress: downloadProgress }) }}
        </Button>
        <Button v-if="downloaded" type="success" @click="handleInstallUpdate" style="width: 100%">
          {{ $t('versionInfoPanel.installAndRestart') }}
        </Button>
        <Alert v-if="downloadError" variant="destructive" class="mt-3">
          <XCircle class="h-4 w-4" />
          <AlertTitle>{{ $t('versionInfoPanel.downloadError') }}</AlertTitle>
          <AlertDescription>{{ downloadError }}</AlertDescription>
        </Alert>
      </div>
    </div>
  </ResizablePanel>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Alert, AlertTitle, AlertDescription } from '@renderer/components/ui/alert'
import { CheckCircle2, Info, XCircle } from 'lucide-vue-next'
import ResizablePanel from './base/ResizablePanel.vue'
import eventBus from '../utils/event-bus'
import { themeState } from '../utils/themes'
import { getAppVersion } from '../utils/version'
import { getSetting } from '../utils/settings'
import { isDevEnvironment } from '../utils/dev-env'
import messageBridge from '../bridge/message-bridge'

const { t } = useI18n()

const visible = ref(false)
const panelRef = ref<InstanceType<typeof ResizablePanel> | null>(null)

const version = ref<string>('')
const releaseDate = ref<string | null>(null)
const buildEnvironment = ref<string>('')
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

const maxWidth = computed(() => Math.floor(window.innerWidth * 0.3))
const maxHeight = computed(() => Math.floor(window.innerHeight * 0.7))

const wrapperStyle = computed(() => {
  const isDark = themeState.currentTheme?.type === 'dark'
  return {
    color: themeState.currentTheme.textColor,
    '--version-border-color': isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.1)'
  }
})

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

// 手动检查更新
const handleCheckUpdate = async () => {
  checking.value = true
  updateStatus.value = null
  downloaded.value = false
  downloading.value = false
  downloadProgress.value = 0
  downloadError.value = null

  try {
    // 获取更新渠道设置
    const channel = await getSetting('updateChannel')
    const updateChannel = channel === 'dev' || channel === 'release' ? channel : 'release'

    const status = await messageBridge.invoke('check-for-updates', updateChannel)
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
      downloadError.value = result.error || t('versionInfoPanel.downloadError')
      downloading.value = false
    }
  } catch (error) {
    console.error('下载更新失败:', error)
    downloadError.value = error instanceof Error ? error.message : String(error)
    downloading.value = false
    messageBridge.removeListener('update-download-progress', () => {})
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

function onResize(width: number, height: number) {
  // 可以在这里处理尺寸变化的逻辑
}

function toggleVisibility() {
  visible.value = !visible.value
  if (visible.value) {
    eventBus.emit('close-notification-queue')
    eventBus.emit('close-ai-task-queue')
    eventBus.emit('close-logger-console')
    // 加载版本信息
    loadVersionInfo()
    // 加载更新状态
    loadUpdateStatus()
  }
}

function closePanel() {
  visible.value = false
}

// 处理点击外部区域关闭面板
function handleClickOutside(event: MouseEvent) {
  if (!visible.value) return

  const target = event.target as HTMLElement

  // 获取面板DOM元素
  const panelElement = panelRef.value?.$el as HTMLElement | undefined

  // 如果点击的是面板内部，不关闭
  if (panelElement && panelElement.contains(target)) {
    return
  }

  // 如果点击的是BottomMenu中的按钮，不关闭（让toggle处理）
  const bottomMenu = target.closest('.bottom-menu')
  if (bottomMenu) {
    const isToggleButton = target.closest('.status-version')
    if (isToggleButton) {
      return // 让toggle事件处理
    }
  }

  // 点击外部区域，关闭面板
  closePanel()
}

// 加载更新状态
const loadUpdateStatus = async () => {
  try {
    const status = await messageBridge.invoke('get-update-status')
    if (status && (status.updateAvailable || status.updateNotAvailable || status.error)) {
      updateStatus.value = status
      // 检查是否有已下载的更新（通过检查下载状态）
      // 这里我们假设如果状态显示有更新可用，可能已经下载完成
    }
  } catch (error) {
    console.warn('获取更新状态失败:', error)
  }
}

// 监听visible变化，添加/移除点击外部区域监听器
watch(visible, (isVisible) => {
  if (isVisible) {
    // 使用nextTick确保DOM已更新
    nextTick(() => {
      document.addEventListener('click', handleClickOutside, true)
    })
  } else {
    document.removeEventListener('click', handleClickOutside, true)
  }
})

function setupEventListeners() {
  eventBus.on('toggle-version-info-panel', toggleVisibility)
  eventBus.on('close-version-info-panel', closePanel)

  // 监听更新下载完成事件
  messageBridge.on('update-downloaded', handleUpdateDownloaded)
}

function removeEventListeners() {
  eventBus.off('toggle-version-info-panel', toggleVisibility)
  eventBus.off('close-version-info-panel', closePanel)

  messageBridge.removeListener('update-downloaded', handleUpdateDownloaded)
}

onMounted(() => {
  setupEventListeners()
  loadVersionInfo()
  loadUpdateStatus()
})

onBeforeUnmount(() => {
  removeEventListeners()
  document.removeEventListener('click', handleClickOutside, true)
})
</script>

<style scoped>
.version-info-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: inherit;
}

.version-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  user-select: none;
  border-bottom: 1px solid var(--version-border-color);
  padding-bottom: 8px;
}

.version-header h3 {
  margin: 0;
  font-size: 16px;
}

.version-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 8px;
}

.version-info-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.info-label {
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.info-value {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  color: var(--el-text-color-primary);
}

.update-status {
  margin-top: 8px;
}

.update-status :deep(.el-alert) {
  margin-bottom: 0;
}

.version-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--version-border-color);
  padding-top: 12px;
}
</style>
