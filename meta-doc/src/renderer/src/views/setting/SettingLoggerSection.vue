<template>
  <div class="logger-settings">
    <h3 class="section-title">{{ t('setting.loggingSettings') }}</h3>
    <el-form label-width="160px" class="settings-form">
      <el-form-item :label="t('setting.loggingEnabled')">
        <el-switch
          v-model="settings.loggingEnabled"
          class="mb-2"
          :active-text="t('setting.enabled')"
          :inactive-text="t('setting.disabled')"
          @change="handleEnabledChange"
        />
      </el-form-item>

      <el-form-item :label="t('setting.loggingLevel')">
        <el-select
          v-model="settings.loggingLevel"
          :disabled="!settings.loggingEnabled"
          @change="handleLevelChange"
        >
          <el-option
            v-for="option in levelOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </el-form-item>

      <el-form-item :label="t('setting.loggingFilter')">
        <el-input
          v-model="settings.loggingFilter"
          :placeholder="t('setting.loggingFilterPlaceholder')"
          :disabled="!settings.loggingEnabled"
          clearable
          @change="handleFilterChange"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <div class="filter-hint">{{ t('setting.loggingFilterHint') }}</div>
      </el-form-item>

      <el-form-item :label="t('setting.logRetentionPeriod')">
        <el-select
          v-model="settings.logRetentionPeriod"
          :disabled="!settings.loggingEnabled"
          @change="handleRetentionPeriodChange"
        >
          <el-option
            v-for="option in retentionPeriodOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        <div class="filter-hint">{{ t('setting.logRetentionPeriodHint') }}</div>
      </el-form-item>

      <el-form-item :label="t('setting.logFilePath')">
        <div class="log-path">
          <el-input :model-value="logFilePath || t('setting.logFileUnavailable')" readonly />
          <Button type="primary" plain :disabled="!logFilePath" @click="openLogFile">
            {{ t('setting.openLogFile') }}
          </Button>
        </div>
      </el-form-item>

      <el-form-item :label="t('setting.logDirectory')">
        <div class="log-path">
          <el-input :model-value="logDirectory || t('setting.logFileUnavailable')" readonly />
          <Button type="primary" plain :disabled="!logDirectory" @click="openLogDirectory">
            {{ t('setting.openLogDirectory') }}
          </Button>
        </div>
      </el-form-item>

      <el-divider />

      <div class="logger-console">
        <h4>{{ t('setting.loggerConsoleTitle') }}</h4>
        <ConsoleOutput console-key="logger" :history="logHistory" :show-ai-analysis="false" />
      </div>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import { settings, setSetting } from '../../utils/settings.js'
import eventBus from '../../utils/event-bus.js'
import { fetchLoggerHistory, getRendererLoggerConfig } from '../../utils/logger.ts'
import type { LoggerHistoryEntry } from '../../utils/logger.ts'
import messageBridge from '../../bridge/message-bridge'
import ConsoleOutput from '../../components/ConsoleOutput.vue'
import { Button } from '@renderer/components/ui/button'

const { t } = useI18n()

const logFilePath = ref('')
const logDirectory = ref('')
const logHistory = ref<LoggerHistoryEntry[]>([])

const levelOptions = computed(() => [
  { value: 'debug', label: t('setting.loggingLevels.debug') },
  { value: 'info', label: t('setting.loggingLevels.info') },
  { value: 'warn', label: t('setting.loggingLevels.warn') },
  { value: 'error', label: t('setting.loggingLevels.error') }
])

const retentionPeriodOptions = computed(() => [
  { value: 'none', label: t('setting.logRetentionPeriods.none') },
  { value: '1day', label: t('setting.logRetentionPeriods.1day') },
  { value: '3days', label: t('setting.logRetentionPeriods.3days') },
  { value: '7days', label: t('setting.logRetentionPeriods.7days') },
  { value: '1month', label: t('setting.logRetentionPeriods.1month') },
  { value: '3months', label: t('setting.logRetentionPeriods.3months') },
  { value: '6months', label: t('setting.logRetentionPeriods.6months') },
  { value: '1year', label: t('setting.logRetentionPeriods.1year') },
  { value: 'never', label: t('setting.logRetentionPeriods.never') }
])

const saveSetting = (key: string, value: unknown) => {
  setSetting(key, value)
}

const handleEnabledChange = () => {
  saveSetting('loggingEnabled', settings.loggingEnabled)
}

const handleLevelChange = () => {
  saveSetting('loggingLevel', settings.loggingLevel)
}

const handleFilterChange = () => {
  saveSetting('loggingFilter', settings.loggingFilter)
}

const handleRetentionPeriodChange = () => {
  saveSetting('logRetentionPeriod', settings.logRetentionPeriod)
}

const openLogFile = () => {
  eventBus.emit('open-log-file')
}

const openLogDirectory = () => {
  eventBus.emit('open-log-directory')
}

const applyLoggerConfig = (config: { logFilePath?: string; logDirectory?: string }) => {
  if (config.logFilePath !== undefined) {
    logFilePath.value = config.logFilePath
  }
  if (config.logDirectory !== undefined) {
    logDirectory.value = config.logDirectory
  }
}

const refreshLoggerConfig = async () => {
  try {
    const config = await getRendererLoggerConfig()
    applyLoggerConfig(config)
  } catch (error) {
    // 忽略配置获取失败，按钮将不可用
  }
}

const refreshLoggerHistory = async () => {
  const history = await fetchLoggerHistory()
  logHistory.value = history
}

const configListener = (_event: unknown, config: { logFilePath: string; logDirectory: string }) => {
  applyLoggerConfig(config)
}

onMounted(() => {
  refreshLoggerConfig()
  refreshLoggerHistory()
  if (messageBridge.getIpc()?.on) {
    messageBridge.on('logger-config-updated', configListener as any)
  }
})

onBeforeUnmount(() => {
  if (messageBridge.getIpc()?.removeListener) {
    messageBridge.removeListener('logger-config-updated', configListener as any)
  }
})
</script>

<style scoped>
.logger-settings {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.section-title {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.settings-form {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.settings-form :deep(.el-form-item) {
  margin-bottom: 24px;
}

.settings-form :deep(.el-input),
.settings-form :deep(.el-select) {
  width: 100%;
  max-width: 100%;
}

.log-path {
  display: flex;
  gap: 12px;
  width: 100%;
}

.log-path :deep(.el-input) {
  flex: 1;
  min-width: 0;
}

.logger-console {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.logger-console h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.filter-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  line-height: 1.4;
}

.logger-console :deep(.console-container) {
  min-height: 240px;
  height: 240px;
  max-height: 50vh;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  flex-shrink: 0;
}
</style>
