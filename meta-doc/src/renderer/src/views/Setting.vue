<template>
  <div
    class="settings-container"
    :style="{ backgroundColor: themeState.currentTheme.background, color: themeState.currentTheme.textColor }"
  >
    <el-container class="settings-layout">
      <el-aside class="settings-aside" width="200px">
        <el-menu
          :default-active="activeMenu"
          @select="handleMenuSelect"
          :background-color="themeState.currentTheme.sidebarBackground2"
          :text-color="themeState.currentTheme.SideTextColor"
          :active-text-color="themeState.currentTheme.SideActiveTextColor"
          class="settings-menu"
        >
          <el-menu-item
            v-for="item in menuItems"
            :key="item.key"
            :index="item.key"
            :class="{ 'menu-logs-item': item.key === 'logs' }"
          >
            {{ $t(item.label) }}
          </el-menu-item>
        </el-menu>
      </el-aside>

      <el-main class="settings-main" :style="{ color: themeState.currentTheme.textColor }">
        <el-scrollbar class="settings-scroll">
          <keep-alive>
            <component :is="currentComponent" :key="activeMenu" class="setting-section" />
          </keep-alive>
        </el-scrollbar>
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { getSetting, settings } from '../utils/settings.js';
import { themeState } from '../utils/themes.js';
import SettingBasicSection from './setting/SettingBasicSection.vue';
import SettingLlmSection from './setting/SettingLlmSection.vue';
import SettingThemeSection from './setting/SettingThemeSection.vue';
import SettingLoggerSection from './setting/SettingLoggerSection.vue';
import SettingDebugSection from './setting/SettingDebugSection.vue';
import { isDevEnvironment } from '../utils/dev-env';
import '../assets/aero-btn.css';
import '../assets/aero-div.css';

const activeMenu = ref('basic');
const isDev = ref(false);

const componentMap: Record<string, any> = {
  basic: SettingBasicSection,
  llm: SettingLlmSection,
  themes: SettingThemeSection,
  logs: SettingLoggerSection,
  debug: SettingDebugSection
};

const menuItems = computed(() => {
  const items = [
    { key: 'basic', label: 'setting.basic' },
    { key: 'llm', label: 'setting.llm' },
    { key: 'themes', label: 'setting.themes' },
    { key: 'logs', label: 'setting.logs' }
  ];
  
  // 仅在开发环境显示调试菜单
  if (isDev.value) {
    items.push({ key: 'debug', label: 'setting.debug.title' });
  }
  
  return items;
});

const currentComponent = computed(() => componentMap[activeMenu.value] ?? SettingBasicSection);

const handleMenuSelect = (index: string) => {
  activeMenu.value = index;
};

const fetchSettings = async () => {
  const keys = Object.keys(settings) as (keyof typeof settings)[];
  for (const key of keys) {
    if (typeof settings[key] === 'object' && settings[key] !== null && !Array.isArray(settings[key])) {
      continue;
    }
    const value: (typeof settings)[typeof key] | undefined = await getSetting(key as string);
    if (value !== undefined) {
      // @ts-expect-error: value type from storage may not match static type, but is safe here
      settings[key] = value;
    }
  }
};

onMounted(async () => {
  fetchSettings();
  // 检查是否为开发环境
  isDev.value = await isDevEnvironment();
});
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
}

.settings-aside {
  height: 100%;
}

.settings-menu {
  height: 100%;
  display: flex;
  flex-direction: column;
  border-right: none;
}

.settings-main {
  height: 100%;
  padding: 0;
  overflow: hidden;
}

.settings-scroll {
  height: 100%;
  width: 100%;
}

.setting-section {
  display: block;
  padding: 32px 24px 64px;
  box-sizing: border-box;
  height: 100%;
  overflow: hidden;
}

.setting-section.debug-section {
  padding: 0;
}

::deep(.menu-logs-item) {
  margin-top: auto !important;
}
</style>
