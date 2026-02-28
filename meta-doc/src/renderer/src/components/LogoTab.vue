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
import { getAppVersion } from '../utils/version'
import { createRendererLogger } from '../utils/logger'
import SettingAboutSection from '../views/setting/SettingAboutSection.vue'
import { themeState, FIXED_LOGO_COLORS } from '../utils/themes'
import { Tooltip } from '@renderer/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import LogoIcon from './LogoIcon.vue'

const logger = createRendererLogger('LogoTab')
const appVersion = ref<string>('')
const aboutDialogVisible = ref(false)

// 与 workspace-explorer-main / LeftMenu 背景一致
const logoTabBackgroundColor = computed(
  () =>
    themeState.currentTheme.background2nd ||
    themeState.currentTheme.sidebarBackground ||
    themeState.currentTheme.background
)

// Logo 固定配色，不随亮/暗主题变化
const bgColor = FIXED_LOGO_COLORS.bgColor
const symbolColor = FIXED_LOGO_COLORS.symbolColor

// 获取应用版本
onMounted(async () => {
  try {
    appVersion.value = await getAppVersion()
  } catch (error) {
    logger.warn('获取应用版本失败:', error)
    appVersion.value = 'Unknown'
  }
})

const versionTooltip = computed(() => {
  if (!appVersion.value) return `版本 ...`
  return `版本 ${appVersion.value}`
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
  /* 与 LeftMenu 右边缘一致：明显分界线 */
  border-right: 1px solid var(--sidebar-border, rgba(128, 128, 128, 0.28));
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
