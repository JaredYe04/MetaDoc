<template>
  <el-form label-width="160px" class="settings-form">
    <el-form-item :label="t('setting.startupOption')">
      <el-select v-model="settings.startupOption" @change="saveSetting('startupOption', settings.startupOption)">
        <el-option :label="t('setting.openNewFile')" value="newFile" />
        <el-option :label="t('setting.openLastFile')" value="lastFile" />
      </el-select>
    </el-form-item>

    <el-form-item :label="t('setting.askBeforeSave')">
      <el-switch v-model="settings.alwaysAskSave" class="mb-2"
        style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
        :active-text="t('setting.enabled')" :inactive-text="t('setting.disabled')"
        @change="saveSetting('alwaysAskSave', settings.alwaysAskSave)" />
    </el-form-item>

    <el-tooltip :content="t('setting.particleEffectHint')" placement="bottom">
      <el-form-item :label="t('setting.particleEffect')">
        <el-switch v-model="settings.particleEffect" class="mb-2"
          style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
          :active-text="t('setting.enabled')" :inactive-text="t('setting.disabled')"
          @change="handleParticleToggle" />
      </el-form-item>
    </el-tooltip>

    <el-form-item :label="t('setting.autoSave')">
      <el-select v-model="settings.autoSave" @change="saveSetting('autoSave', settings.autoSave)">
        <el-option :label="t('setting.off')" value="never" />
        <el-option :label="t('setting.minute1')" value="1" />
        <el-option :label="t('setting.minute5')" value="5" />
        <el-option :label="t('setting.minute10')" value="10" />
        <el-option :label="t('setting.minute30')" value="30" />
        <el-option :label="t('setting.minute60')" value="60" />
      </el-select>
    </el-form-item>

    <el-form-item :label="t('setting.microphoneTest')">
      <el-tooltip :content="t('setting.microphoneHint')" placement="bottom">
        <MicrophoneTest />
      </el-tooltip>
    </el-form-item>

    <el-form-item :label="t('setting.excludeCodeBlocks')">
      <el-tooltip :content="t('setting.excludeCodeHint')" placement="bottom">
        <el-switch v-model="settings.bypassCodeBlock" class="mb-2"
          style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
          :active-text="t('setting.enabled')" :inactive-text="t('setting.disabled')"
          @change="saveSetting('bypassCodeBlock', settings.bypassCodeBlock)" />
      </el-tooltip>
    </el-form-item>

    <el-form-item :label="t('setting.autoDownloadImage')">
      <el-tooltip :content="t('setting.autoDownloadHint')" placement="bottom">
        <el-switch v-model="settings.autoSaveExternalImage" class="mb-2"
          style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
          :active-text="t('setting.enabled')" :inactive-text="t('setting.disabled')"
          @change="saveSetting('autoSaveExternalImage', settings.autoSaveExternalImage)" />
      </el-tooltip>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import MicrophoneTest from '../../components/MicrophoneTest.vue';
import { settings, setSetting } from '../../utils/settings.js';
import { sendBroadcast } from '../../utils/event-bus.js';

const { t } = useI18n();

const saveSetting = (key: string, value: unknown) => {
  setSetting(key, value);
};

const handleParticleToggle = () => {
  saveSetting('particleEffect', settings.particleEffect);
  sendBroadcast('home', 'toggle-particle-effect', {});
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

