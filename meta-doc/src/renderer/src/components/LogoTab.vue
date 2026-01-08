<template>
  <div class="logo-tab-wrapper">
    <el-tooltip :content="versionTooltip" placement="bottom">
      <div class="logo-tab" @click="handleLogoClick">
        <img src="../assets/logo.svg" alt="MetaDoc" class="logo-tab__image" />
      </div>
    </el-tooltip>
    <!-- 关于对话框 -->
    <el-dialog
      v-model="aboutDialogVisible"
      :title="$t('setting.about.appName')"
      width="600px"
      :close-on-click-modal="true"
      :close-on-press-escape="true"
    >
      <SettingAboutSection />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getAppVersion } from '../utils/version'
import { createRendererLogger } from '../utils/logger'
import SettingAboutSection from '../views/setting/SettingAboutSection.vue'
import { mixColors, themeState } from '../utils/themes'

const logger = createRendererLogger('LogoTab')
const appVersion = ref<string>('')
const aboutDialogVisible = ref(false)

// 计算背景色：基于 MainTabs 的背景色，但与 #777777 进行 0.5 混色以增加区分度
const logoTabBackgroundColor = computed(() => {
  try {
    const baseColor = themeState.currentTheme.background
    // 先和 #888888 混合 0.3（与 MainTabs 一致）
    const tabsColor = mixColors(baseColor, '#888888', 0.3)
    // 再和 #777777 混合 0.5 以增加区分度
    return mixColors(tabsColor, '#777777', 0.1)
  } catch {
    return '#e8e8e8'
  }
})

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
  width: 64px; /* 与LeftMenu折叠状态宽度一致 */
  min-width: 64px;
  flex-shrink: 0;
  border-right: 1px solid var(--el-border-color-lighter, #f0f0f0);
  position: relative;
  z-index: 1;
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
  background-color: var(--el-fill-color-light, rgba(0, 0, 0, 0.06));
}

.logo-tab__image {
  width: 24px;
  height: 24px;
  display: block;
}
</style>

