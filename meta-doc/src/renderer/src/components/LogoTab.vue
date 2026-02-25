<template>
  <div class="logo-tab-wrapper">
    <Tooltip>
      <TooltipTrigger as-child>
        <div class="logo-tab" @click="handleLogoClick">
          <LogoIcon
            :size="24"
            :bg-color="bgColor"
            :symbol-color="symbolColor"
            class="logo-tab__image"
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>{{ versionTooltip }}</p>
      </TooltipContent>
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
import { mixColors, themeState, generateLogoColors } from '../utils/themes'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import LogoIcon from './LogoIcon.vue'

const logger = createRendererLogger('LogoTab')
const appVersion = ref<string>('')
const aboutDialogVisible = ref(false)

// 与 MainTabs 背景色完全一致
const logoTabBackgroundColor = computed(() => {
  try {
    const baseColor = themeState.currentTheme.background
    return mixColors(baseColor, '#888888', 0.3)
  } catch {
    return '#e8e8e8'
  }
})

const isDark = computed(() => themeState.currentTheme.type === 'dark')
const primaryColor = computed(() => themeState.currentTheme.primaryColor || '#000000')

// 使用HSL生成鲜艳的Logo颜色
const logoColors = computed(() => generateLogoColors(primaryColor.value, isDark.value))
const bgColor = computed(() => logoColors.value.bgColor)
const symbolColor = computed(() => logoColors.value.symbolColor)

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
