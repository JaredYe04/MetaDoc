<template>
  <div class="logger-console-content" :style="wrapperStyle">
    <div
      class="xterm-console-header logger-console-header"
      :style="{ backgroundColor: themeState.currentTheme.editorToolbarBackgroundColor }"
    >
      <div class="logger-header-row-1">
        <span class="xterm-console-title">{{ title }}</span>
        <div class="logger-header-actions">
          <DropdownMenu v-model:open="levelDropdownOpen">
            <DropdownMenuTrigger as-child>
              <button type="button" class="level-trigger">
                {{ levelLabel }}
                <ChevronDown class="w-3.5 h-3.5 ml-1" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" class="logger-level-dropdown">
            <DropdownMenuItem
              v-for="opt in levelOptions"
              :key="opt.value"
              @select="selectLevel(opt.value)"
            >
              {{ opt.label }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
          <Button size="sm" variant="ghost" @click="$emit('clear')">{{ t('console.clear') }}</Button>
          <Button size="sm" variant="ghost" @click="$emit('save')">{{ t('console.saveLog') }}</Button>
          <slot name="extra-actions" />
        </div>
      </div>
      <div class="logger-header-row-2">
        <div class="relative logger-filter-inline">
          <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            :model-value="filterText"
            :placeholder="filterPlaceholder"
            class="pl-9 w-full h-8 text-xs"
            @update:model-value="emit('update:filterText', $event)"
          />
        </div>
      </div>
    </div>
    <div class="logger-terminal-wrapper" ref="terminalInnerRef">
      <XtermReadOnlyInstance ref="xtermReadOnlyRef" :is-visible="true" />
      <SyncScrollbar
        ref="syncScrollbarRef"
        :get-scroll-info="getScrollInfo"
        :set-scroll-top="setScrollTop"
        :poll-interval="150"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import { ChevronDown } from 'lucide-vue-next'
import SyncScrollbar from './SyncScrollbar.vue'
import XtermReadOnlyInstance from './XtermReadOnlyInstance.vue'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { themeState } from '../utils/themes'
import type { LoggerHistoryEntry } from '../utils/logger.ts'
import type { LogLevel } from '../../../common/logger-constants'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    title?: string
    filterText?: string
    filterPlaceholder?: string
    filterLevel?: LogLevel
    history?: LoggerHistoryEntry[]
  }>(),
  {
    title: '',
    filterText: '',
    filterPlaceholder: '',
    filterLevel: 'info',
    history: () => []
  }
)

const emit = defineEmits<{
  (e: 'update:filterText', v: string): void
  (e: 'update:filterLevel', v: LogLevel): void
  (e: 'clear'): void
  (e: 'save'): void
}>()

const xtermReadOnlyRef = ref<InstanceType<typeof XtermReadOnlyInstance> | null>(null)
const syncScrollbarRef = ref<InstanceType<typeof SyncScrollbar> | null>(null)
const terminalInnerRef = ref<HTMLDivElement | null>(null)
const levelDropdownOpen = ref(false)

function getScrollInfo() {
  const inst = xtermReadOnlyRef.value
  if (inst?.getScrollInfoFromTerminal) {
    return inst.getScrollInfoFromTerminal()
  }
  return { scrollTop: 0, scrollHeight: 0, clientHeight: 0 }
}

function setScrollTop(lineIndex: number) {
  xtermReadOnlyRef.value?.setScrollTopFromTerminal?.(Math.round(lineIndex))
}

const levelOptions = [
  { value: 'debug' as LogLevel, label: 'Debug' },
  { value: 'info' as LogLevel, label: 'Info' },
  { value: 'warn' as LogLevel, label: 'Warn' },
  { value: 'error' as LogLevel, label: 'Error' }
]

const levelLabel = computed(() => {
  const opt = levelOptions.find((o) => o.value === props.filterLevel)
  return opt?.label ?? 'Info'
})

const wrapperStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  background: themeState.currentTheme.background
}))

function selectLevel(v: LogLevel) {
  emit('update:filterLevel', v)
  levelDropdownOpen.value = false
}

function renderLogs() {
  nextTick(() => {
    const inst = xtermReadOnlyRef.value
    if (!inst) return
    inst.clear()
    for (const entry of props.history) {
      inst.writeln(entry.content)
    }
    nextTick(() => syncScrollbarRef.value?.refresh?.())
  })
}

watch(() => props.history, renderLogs, { deep: true })

defineExpose({
  clear: () => xtermReadOnlyRef.value?.clear(),
  getFullBufferText: () => xtermReadOnlyRef.value?.getFullBufferText?.() || '',
  renderLogs
})
</script>

<style scoped>
.logger-console-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.xterm-console-header.logger-console-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 8px;
  border-bottom: 1px solid #9a9a9a41;
  flex-shrink: 0;
}

.logger-header-row-1 {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.logger-header-row-2 {
  display: flex;
  align-items: center;
  width: 100%;
}

.logger-filter-inline {
  flex: 1;
  min-width: 0;
}

.logger-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
}

.level-trigger {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.level-trigger:hover {
  background: rgba(128, 128, 128, 0.1);
}

.logger-terminal-wrapper {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  padding: 0;
  box-sizing: border-box;
}

.logger-terminal-wrapper :deep(.xterm-instance) {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
}

.logger-terminal-wrapper :deep(.xterm-instance .terminal),
.logger-terminal-wrapper :deep(.xterm-instance .xterm),
.logger-terminal-wrapper :deep(.xterm-instance [class*="xterm-dom-renderer"]) {
  width: 100% !important;
  height: 100% !important;
  min-height: 100% !important;
}

.logger-terminal-wrapper :deep(.xterm-viewport) {
  overflow-y: auto !important;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.logger-terminal-wrapper :deep(.xterm-viewport)::-webkit-scrollbar {
  display: none;
  width: 0;
}
</style>
