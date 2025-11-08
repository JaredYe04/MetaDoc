<template>
  <div class="settings-container"
    :style="{ backgroundColor: themeState.currentTheme.backgroundColor, color: themeState.currentTheme.textColor }">
    <el-container>
      <el-aside width="200px">
        <el-menu :default-active="activeMenu" @select="handleMenuSelect"
          :background-color="themeState.currentTheme.sidebarBackground2"
          :text-color="themeState.currentTheme.SideTextColor"
          :active-text-color="themeState.currentTheme.SideActiveTextColor" style="height: 100vh;">
          <el-menu-item v-for="item in menuItems" :key="item.key" :index="item.key" :class="{ 'menu-logs-item': item.key === 'logs' }">
            {{ $t(item.label) }}
          </el-menu-item>
        </el-menu>
      </el-aside>

      <el-main :style="{ color: themeState.currentTheme.textColor }">
        <el-scrollbar>
          <component :is="currentComponent" class="setting-section" />
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
import '../assets/aero-btn.css';
import '../assets/aero-div.css';

const activeMenu = ref('basic');

const componentMap: Record<string, any> = {
  basic: SettingBasicSection,
  llm: SettingLlmSection,
  themes: SettingThemeSection,
  logs: SettingLoggerSection
};

const menuItems = [
  { key: 'basic', label: 'setting.basic' },
  { key: 'llm', label: 'setting.llm' },
  { key: 'themes', label: 'setting.themes' },
  { key: 'logs', label: 'setting.logs' }
];

const currentComponent = computed(() => componentMap[activeMenu.value] ?? SettingBasicSection);

const handleMenuSelect = (index: string) => {
  activeMenu.value = index;
};

const fetchSettings = async () => {
  const keys = Object.keys(settings);
  for (const key of keys) {
    if (settings[key] && typeof settings[key] === 'object' && !Array.isArray(settings[key])) {
      continue;
    }
    const value = await getSetting(key);
    if (value !== undefined) {
      settings[key] = value;
    }
  }
};

onMounted(() => {
  fetchSettings();
});
</script>

<style scoped>
.settings-container {
  height: 100%;
  display: flex;
}

.setting-section {
  display: block;
  padding: 32px 24px 64px;
}

:deep(.el-menu) {
  display: flex;
  flex-direction: column;
}

:deep(.menu-logs-item) {
  margin-top: auto !important;
}
</style>
