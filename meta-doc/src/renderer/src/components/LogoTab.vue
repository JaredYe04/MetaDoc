<template>
  <div class="logo-tab-wrapper">
    <Tooltip :content="versionTooltip" side="bottom">
      <div class="logo-tab" @click="handleLogoClick">
        <LogoIcon
          :size="24"
          :bg-color="bgColor"
          :symbol-color="symbolColor"
          class="logo-tab__image"
        />
      </div>
    </Tooltip>
    <!-- 关于对话框 -->
    <Dialog v-model:open="aboutDialogVisible" modal>
      <DialogContent class="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{{ $t('setting.about.appName') }}</DialogTitle>
        </DialogHeader>
        <SettingAboutSection />
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { getAppVersion } from '../utils/version'
import { createRendererLogger } from '../utils/logger'
import { getSetting } from '../utils/settings'
import SettingAboutSection from '../views/setting/SettingAboutSection.vue'
import { themeState, FIXED_LOGO_COLORS, mixColors } from '../utils/themes'
import { Tooltip } from '@renderer/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import LogoIcon from './LogoIcon.vue'

const { t } = useI18n()

const logger = createRendererLogger('LogoTab')
const appVersion = ref<string>('')
const updateChannel = ref<'release' | 'dev'>('release')
const aboutDialogVisible = ref(false)

// 与 MainTabs 的 tabs-list 背景一致：tabsContainerBackgroundColor
const logoTabBackgroundColor = computed(() => {
  try {
    const baseColor = themeState.currentTheme.background
    return mixColors(baseColor, '#888888', 0.3)
  } catch {
    return '#f5f5f5'
  }
})

// Logo 固定配色，不随亮/暗主题变化
const bgColor = FIXED_LOGO_COLORS.bgColor
const symbolColor = FIXED_LOGO_COLORS.symbolColor

// 获取应用版本和更新频道
onMounted(async () => {
  try {
    appVersion.value = await getAppVersion()
    const channel = await getSetting('updateChannel')
    updateChannel.value = channel === 'dev' || channel === 'release' ? channel : 'release'
  } catch (error) {
    logger.warn('获取应用版本或频道失败:', error)
    appVersion.value = 'Unknown'
    updateChannel.value = 'release'
  }
})

const versionTooltip = computed(() => {
  const versionLoadingText = t('logoTab.versionLoading')
  if (!appVersion.value)
    return versionLoadingText === 'logoTab.versionLoading' ? '版本 ...' : versionLoadingText
  const channelKey = updateChannel.value === 'dev' ? 'channelDev' : 'channelRelease'
  const channelText = t(`setting.about.${channelKey}`)
  const channel =
    channelText === `setting.about.${channelKey}`
      ? updateChannel.value === 'dev'
        ? '测试频道'
        : '稳定频道'
      : channelText
  return t('logoTab.version', { version: appVersion.value, channel })
})

// 点击Logo打开关于对话框
const handleLogoClick = () => {
  aboutDialogVisible.value = true
}
</script>

<style scoped>
.logo-tab-wrapper {
  display: flex;
  align-items: center;
  padding: 0 8px;
  height: 40px;
  /* 与左侧栏总宽一致：LeftMenu 折叠 64px + .side-menu border-right 1px = 65px */
  width: 64px;
  min-width: 64px;
  flex-shrink: 0;
  position: relative;
  -webkit-app-region: no-drag;
  background-color: v-bind('logoTabBackgroundColor');
}

.logo-tab {
  width: 100%;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  transition: background-color 0.2s ease;
}

.logo-tab:hover {
  background-color: rgba(128, 128, 128, 0.1);
}

.logo-tab__image {
  display: block;
}
</style>
