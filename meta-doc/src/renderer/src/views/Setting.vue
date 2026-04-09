<template>
  <div
    class="settings-container"
    :style="{
      backgroundColor: themeState.currentTheme.background,
      color: themeState.currentTheme.textColor
    }"
  >
    <div class="settings-layout">
      <aside class="settings-aside">
        <UIMenu
          :collapse="false"
          :background-color="themeState.currentTheme.background"
          :text-color="themeState.currentTheme.SideTextColor"
          class="settings-menu modern-side-menu"
        >
          <UIMenuItem
            v-for="item in menuItems"
            :key="item.key"
            :label="$t(item.label)"
            :class="[
              'menu-item',
              { 'is-active': activeMenu === item.key, 'menu-logs-item': item.key === 'logs' }
            ]"
            @click="handleMenuSelect(item.key)"
          />
        </UIMenu>
      </aside>

      <main class="settings-main" :style="{ color: themeState.currentTheme.textColor }">
        <ScrollArea class="settings-scroll">
          <keep-alive>
            <component :is="currentComponent" :key="activeMenu" class="setting-section" />
          </keep-alive>
          <ScrollBar />
        </ScrollArea>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getSetting, settings } from '../utils/settings.js'
import { themeState, mixColors } from '../utils/themes.js'
import SettingBasicSection from './setting/SettingBasicSection.vue'
import SettingLlmSection from './setting/SettingLlmSection.vue'
import SettingKnowledgeBaseSection from './setting/SettingKnowledgeBaseSection.vue'
import SettingThemeSection from './setting/SettingThemeSection.vue'
import SettingShortcutsSection from './setting/SettingShortcutsSection.vue'
import SettingLoggerSection from './setting/SettingLoggerSection.vue'
import SettingImageSection from './setting/SettingImageSection.vue'
// import SettingDebugSection from './setting/SettingDebugSection.vue';
import SettingAboutSection from './setting/SettingAboutSection.vue'
import { ScrollArea, ScrollBar } from '@renderer/components/ui/scroll-area'
import UIMenu from '@renderer/components/ui/UIMenu.vue'
import UIMenuItem from '@renderer/components/ui/UIMenuItem.vue'
import { isDevEnvironment } from '../utils/common/dev-env'
import '../assets/aero-btn.css'
import '../assets/aero-div.css'
import '../assets/modern-side-menu.css'

const activeMenu = ref('basic')
const isDev = ref(false)

const componentMap: Record<string, any> = {
  basic: SettingBasicSection,
  llm: SettingLlmSection,
  knowledgeBase: SettingKnowledgeBaseSection,
  themes: SettingThemeSection,
  shortcuts: SettingShortcutsSection,
  images: SettingImageSection,
  logs: SettingLoggerSection,
  // debug: SettingDebugSection,
  about: SettingAboutSection
}

const menuItems = computed(() => {
  const items = [
    { key: 'basic', label: 'setting.basic' },
    { key: 'llm', label: 'setting.llm' },
    { key: 'knowledgeBase', label: 'setting.knowledgeBase' },
    { key: 'themes', label: 'setting.themes' },
    { key: 'shortcuts', label: 'setting.shortcuts.title' },
    { key: 'images', label: 'setting.image.title' },
    { key: 'logs', label: 'setting.logs' },
    { key: 'about', label: 'setting.about.title' }
  ]

  // // 仅在开发环境显示调试菜单
  // if (isDev.value) {
  //   items.push({ key: 'debug', label: 'setting.debug.title' });
  // }

  return items
})

const currentComponent = computed(() => componentMap[activeMenu.value] ?? SettingBasicSection)

// 计算选中状态的背景色和文字色（与 HeadMenu 保持一致）
const activeBackgroundColor = computed(() =>
  mixColors(themeState.currentTheme.background2nd, themeState.currentTheme.textColor, 0.3)
)
const activeTextColor = computed(() => themeState.currentTheme.textColor)

const handleMenuSelect = (index: string) => {
  activeMenu.value = index
}

const fetchSettings = async () => {
  const keys = Object.keys(settings) as (keyof typeof settings)[]
  for (const key of keys) {
    if (
      typeof settings[key] === 'object' &&
      settings[key] !== null &&
      !Array.isArray(settings[key])
    ) {
      continue
    }
    const value: (typeof settings)[typeof key] | undefined = await getSetting(key as string)
    if (value !== undefined) {
      // @ts-expect-error: value type from storage may not match static type, but is safe here
      settings[key] = value
    }
  }
}

onMounted(async () => {
  fetchSettings()
  // 检查是否为开发环境
  isDev.value = await isDevEnvironment()
})
</script>

<style scoped>
.settings-container {
  height: 100vh;
  display: flex;
  overflow: hidden;
}

.settings-layout {
  height: 100%;
  width: 100%;
  display: flex;
}

.settings-aside {
  height: 100%;
  width: auto;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

.settings-menu {
  height: 100%;
  display: flex;
  flex-direction: column;
  width: 180px;
}

/* 菜单项基础样式 */
.menu-item {
  margin: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s ease;
}

/* 设置菜单激活状态的颜色绑定 */
.menu-item.is-active {
  background-color: v-bind('activeBackgroundColor') !important;
  color: v-bind('activeTextColor') !important;
}

/* 确保 hover 状态也有圆角 */
.menu-item:hover {
  border-radius: 6px !important;
}

/* 确保所有菜单项都有圆角 */
.menu-item {
  border-radius: 6px !important;
}

.settings-main {
  height: 100%;
  padding: 0;
  overflow: hidden;
  flex: 1;
}

.settings-scroll {
  height: 100%;
  width: 100%;
}

.setting-section {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 32px 24px 64px;
  box-sizing: border-box;
  height: 100%;
  width: 100%;
  overflow: hidden;
  min-height: 0;
}

/* .setting-section.debug-section {
  padding: 0;
} */

.menu-logs-item {
  margin-top: auto !important;
}
</style>
