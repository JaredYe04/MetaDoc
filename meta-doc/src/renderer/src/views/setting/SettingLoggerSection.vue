<template>
  <div class="logger-settings">
    <h3 class="section-title">{{ t('setting.loggingSettings') }}</h3>
    <Form class="settings-form">
      <FormField :label="t('setting.loggingEnabled')" name="loggingEnabled">
        <div class="flex items-center gap-2">
          <Switch
            :checked="settings.loggingEnabled"
            @update:checked="
              (val: boolean) => {
                settings.loggingEnabled = val
                handleEnabledChange()
              }
            "
          />
          <span class="text-sm text-muted-foreground">{{
            settings.loggingEnabled ? t('setting.enabled') : t('setting.disabled')
          }}</span>
        </div>
      </FormField>

      <FormField :label="t('setting.loggingLevel')" name="loggingLevel">
        <Select
          v-model="settings.loggingLevel"
          :disabled="!settings.loggingEnabled"
          @update:model-value="handleLevelChange"
        >
          <SelectTrigger class="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="option in levelOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      <FormField :label="t('setting.loggingFilter')" name="loggingFilter">
        <div class="relative w-full">
          <Search class="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            v-model="settings.loggingFilter"
            :placeholder="t('setting.loggingFilterPlaceholder')"
            :disabled="!settings.loggingEnabled"
            class="pl-8"
            @change="handleFilterChange"
          />
        </div>
        <div class="filter-hint">{{ t('setting.loggingFilterHint') }}</div>
      </FormField>

      <FormField :label="t('setting.logRetentionPeriod')" name="logRetentionPeriod">
        <Select
          v-model="settings.logRetentionPeriod"
          :disabled="!settings.loggingEnabled"
          @update:model-value="handleRetentionPeriodChange"
        >
          <SelectTrigger class="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="option in retentionPeriodOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </SelectItem>
          </SelectContent>
        </Select>
        <div class="filter-hint">{{ t('setting.logRetentionPeriodHint') }}</div>
      </FormField>

      <FormField :label="t('setting.logFilePath')" name="logFilePath">
        <div class="log-path">
          <Input
            :model-value="logFilePath || t('setting.logFileUnavailable')"
            readonly
            class="flex-1"
          />
          <Button variant="outline" :disabled="!logFilePath" @click="openLogFile">
            {{ t('setting.openLogFile') }}
          </Button>
        </div>
      </FormField>

      <FormField :label="t('setting.logDirectory')" name="logDirectory">
        <div class="log-path">
          <Input
            :model-value="logDirectory || t('setting.logFileUnavailable')"
            readonly
            class="flex-1"
          />
          <Button variant="outline" :disabled="!logDirectory" @click="openLogDirectory">
            {{ t('setting.openLogDirectory') }}
          </Button>
        </div>
      </FormField>

      <Divider />

      <div class="logger-console">
        <LoggerConsoleContent
          ref="loggerContentRef"
          :title="t('setting.loggerConsoleTitle')"
          :filter-text="settings.loggingFilter"
          :filter-placeholder="t('setting.loggingFilterPlaceholder')"
          :filter-level="displayLogLevel"
          :history="normalizedLogHistory"
@update:filter-text="onDisplayFilterChange"
@update:filter-level="displayLogLevel = $event as LogLevel"
@clear="loggerContentRef?.clear?.()"
          @save="handleSaveLogs"
        />
      </div>
    </Form>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import { settings as globalSettings, setSetting } from '../../utils/settings.js'
import eventBus from '../../utils/event-bus.js'
import { fetchLoggerHistory, getRendererLoggerConfig } from '../../utils/common/logger.ts'
import type { LoggerHistoryEntry } from '../../utils/common/logger.ts'
import type { LogLevel } from '../../../../common/logger-constants'
import { LOG_LEVEL_PRIORITY } from '../../../../common/logger-constants'
import messageBridge from '../../bridge/message-bridge'
import ConsoleOutput from '../../components/console/ConsoleOutput.vue'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Form, FormField } from '@renderer/components/ui/form'
import { Switch } from '@renderer/components/ui/switch'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@renderer/components/ui/select'
import { Divider } from '@renderer/components/ui/separator'

// ==================== Demo Mode Support ====================

const props = defineProps<{
  mode?: string
}>()
const isDemo = computed(() => props.mode === 'demo')

const { t } = useI18n()

// Demo mode: use local reactive settings; Normal mode: use global settings
const demoSettings = reactive({
  loggingEnabled: true,
  loggingLevel: 'info',
  loggingFilter: '',
  logRetentionPeriod: '7days'
})
const settings = isDemo.value ? demoSettings : globalSettings

const logFilePath = ref('')
const logDirectory = ref('')
const logHistory = ref<LoggerHistoryEntry[]>([])
const displayLogLevel = ref<LogLevel>('info')
const loggerContentRef = ref<InstanceType<typeof LoggerConsoleContent> | null>(null)

const levelOptions = computed(() => [
  { value: 'debug', label: t('setting.loggingLevels.debug') },
  { value: 'info', label: t('setting.loggingLevels.info') },
  { value: 'warn', label: t('setting.loggingLevels.warn') },
  { value: 'error', label: t('setting.loggingLevels.error') }
])

const entryLevelPriority = (type: LoggerHistoryEntry['type']): number => {
  const map: Record<LoggerHistoryEntry['type'], number> = {
    debug: 0,
    out: 1,
    warn: 2,
    err: 3
  }
  return map[type] ?? 1
}

const matchesScopeFilter = (content: string, filter: string): boolean => {
  if (!filter?.trim()) return true
  const scopeMatch = content.match(/\[([^\]]+)\]/g)
  if (!scopeMatch) return false
  const filterLower = filter.trim().toLowerCase()
  return scopeMatch.some((m) => m.toLowerCase().includes(filterLower))
}

const normalizedLogHistory = computed((): LoggerHistoryEntry[] => {
  const raw = logHistory.value
  const result: LoggerHistoryEntry[] = []
  for (const entry of raw) {
    let content: string
    let type: LoggerHistoryEntry['type'] = 'out'
    if ('content' in entry && typeof entry.content === 'string') {
      content = entry.content
      type = (entry as LoggerHistoryEntry).type ?? 'out'
    } else if ('message' in entry) {
      const e = entry as { timestamp?: number; level?: string; message?: string; source?: string }
      const d = e.timestamp ? new Date(e.timestamp) : new Date()
      const ts = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
      content = `${ts} [${(e.level || 'info').toUpperCase()}] [${e.source || 'main'}] ${e.message || ''}`
      const l = (e.level || 'info').toLowerCase()
      if (l === 'error' || l === 'err') type = 'err'
      else if (l === 'warn' || l === 'warning') type = 'warn'
      else if (l === 'debug') type = 'debug'
    } else continue
    if (!matchesScopeFilter(content, settings.loggingFilter || '')) continue
    const minLevel = LOG_LEVEL_PRIORITY[displayLogLevel.value] ?? 1
    if (entryLevelPriority(type) < minLevel) continue
    result.push({ content, type })
  }
  return result
})

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

const onDisplayFilterChange = (v: string) => {
  settings.loggingFilter = v
  handleFilterChange()
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

const handleSaveLogs = async () => {
  const text = loggerContentRef.value?.getFullBufferText?.() || ''
  if (!text) return
  try {
    const result = (await messageBridge.invoke('save-file-dialog', {
      defaultName: 'logger-output.log',
      filters: [
        { name: 'Log Files', extensions: ['log', 'txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })) as { canceled?: boolean; filePath?: string }
    if (result.canceled || !result.filePath) return
    await messageBridge.invoke('write-file-content', {
      filePath: result.filePath,
      content: text,
      encoding: 'utf8'
    })
    eventBus.emit('show-success', '日志已保存')
  } catch (e) {
    console.error('Save logs failed:', e)
    eventBus.emit('show-error', '保存日志失败')
  }
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

// Demo数据加载
const loadDemoData = () => {
  // 日志配置
  logFilePath.value = '/Users/demo/.metadoc/logs/metadoc-2025-02-20.log'
  logDirectory.value = '/Users/demo/.metadoc/logs'

  // 示例日志历史
  logHistory.value = [
    {
      timestamp: Date.now() - 3600000,
      level: 'info',
      message: t('setting.logMessages.appStartup'),
      source: 'main'
    },
    {
      timestamp: Date.now() - 3500000,
      level: 'info',
      message: t('setting.logMessages.loadConfig'),
      source: 'config'
    },
    {
      timestamp: Date.now() - 3000000,
      level: 'warn',
      message: t('setting.logMessages.noHistorySession'),
      source: 'session'
    },
    {
      timestamp: Date.now() - 2400000,
      level: 'info',
      message: t('setting.logMessages.createDocument'),
      source: 'document'
    },
    {
      timestamp: Date.now() - 1800000,
      level: 'debug',
      message: t('setting.logMessages.initEditor'),
      source: 'editor'
    },
    {
      timestamp: Date.now() - 1200000,
      level: 'info',
      message: t('setting.logMessages.llmReady'),
      source: 'llm'
    },
    {
      timestamp: Date.now() - 600000,
      level: 'error',
      message: t('setting.logMessages.networkTimeout'),
      source: 'network'
    },
    {
      timestamp: Date.now() - 300000,
      level: 'info',
      message: t('setting.logMessages.autoSaveSuccess'),
      source: 'auto-save'
    }
  ]
}

onMounted(() => {
  if (isDemo.value) {
    loadDemoData()
    return
  }

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
  max-width: 720px;
  margin: 0 auto;
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

.logger-console :deep(.logger-console-content) {
  min-height: 240px;
  height: 280px;
  max-height: 50vh;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  flex-shrink: 0;
}
</style>
