<template>
  <el-form label-width="200px" class="settings-form">
    <el-form-item :label="t('setting.globalTheme')">
      <el-radio-group v-model="settings.globalTheme" @change="handleGlobalThemeChange">
        <el-radio label="sync">{{ t('setting.themeSync') }}</el-radio>
        <el-radio label="light">{{ t('setting.themeLight') }}</el-radio>
        <el-radio label="dark">{{ t('setting.themeDark') }}</el-radio>
        <el-radio label="custom">{{ t('setting.themeCustom') }}</el-radio>
        <el-color-picker v-if="settings.globalTheme === 'custom'" v-model="settings.customThemeColor"
          :predefine="predefineColors" @change="changeCustomTheme" @active-change="updateCustomThemeColor" />
      </el-radio-group>
    </el-form-item>

    <el-form-item :label="t('setting.contentTheme')">
      <el-select v-model="settings.contentTheme" placeholder="Select Content Theme"
        @change="handleContentThemeChange">
        <el-option key="auto" :label="t('setting.auto')" :value="'auto'" />
        <el-option v-for="item in contentThemes" :key="item.value" :label="t(item.label)"
          :value="item.value" />
      </el-select>
    </el-form-item>

    <el-form-item :label="t('setting.codeTheme')">
      <el-select v-model="settings.codeTheme" filterable placeholder="Select Code Theme"
        @change="handleCodeThemeChange">
        <el-option key="auto" :label="t('setting.auto')" :value="'auto'" />
        <el-option v-for="item in codeThemes" :key="item" :label="item" :value="item" />
      </el-select>
    </el-form-item>

    <el-form-item :label="t('setting.lineNumber')">
      <el-switch v-model="settings.lineNumber" class="mb-2"
        style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
        :active-text="t('setting.enabled')" :inactive-text="t('setting.disabled')"
        @change="saveSetting('lineNumber', settings.lineNumber)" />
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { settings, setSetting } from '../../utils/settings.js';
import eventBus, { sendBroadcast } from '../../utils/event-bus.js';
import { predefineColors, contentThemes, codeThemes } from '../../utils/themes.js';

const { t } = useI18n();

const saveSetting = (key: string, value: unknown) => {
  setSetting(key, value);
};

const handleGlobalThemeChange = () => {
  saveSetting('globalTheme', settings.globalTheme);
  eventBus.emit('sync-theme');
  eventBus.emit('theme-changed');
};

const changeCustomTheme = (color: string) => {
  saveSetting('customThemeColor', color);
  eventBus.emit('sync-theme');
  eventBus.emit('theme-changed');
};

const updateCustomThemeColor = (color: string) => {
  settings.customThemeColor = color;
  changeCustomTheme(color);
};

const handleContentThemeChange = () => {
  saveSetting('contentTheme', settings.contentTheme);
  sendBroadcast('all', 'sync-editor-theme', {});
};

const handleCodeThemeChange = () => {
  saveSetting('codeTheme', settings.codeTheme);
  sendBroadcast('all', 'sync-editor-theme', {});
};
</script>

<style scoped>
.settings-form {
  max-width: 720px;
}

.settings-form :deep(.el-form-item) {
  margin-bottom: 24px;
}
</style>

