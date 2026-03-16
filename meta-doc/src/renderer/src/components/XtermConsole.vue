<template>
  <div
    class="xterm-console-container"
    :class="{ 'demo-mode': props.mode === 'demo' }"
    :style="consoleStyle"
  >
    <div
      class="xterm-console-header"
      :style="{
        backgroundColor: themeState.currentTheme.editorToolbarBackgroundColor
      }"
    >
      <span class="xterm-console-title">{{ $t('console.title') }}</span>
      <div class="xterm-console-actions">
        <!-- 新建会话：Monaco 风格组合按钮（+ 主按钮 + 附属下拉） -->
        <div class="action-combo action-combo-add" v-if="props.mode !== 'demo'">
          <div class="action-combo-inner">
            <Tooltip :content="$t('console.newSession', '新建会话')">
              <button type="button" class="action-btn action-btn-primary" @click="createSession()">
                <Plus class="w-4 h-4" />
              </button>
            </Tooltip>
            <DropdownMenu v-model:open="shellDropdownOpen">
              <DropdownMenuTrigger as-child>
                <button type="button" class="action-btn action-btn-dropdown">
                  <ChevronDown class="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" class="terminal-shell-dropdown">
                <DropdownMenuItem
                  v-for="s in availableShells"
                  :key="s.id"
                  @select="createSession(s.id)"
                >
                  {{ s.label }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Tooltip
            v-if="sessions.length === 1"
            :content="$t('console.closeSession', '关闭会话')"
          >
            <button
              type="button"
              class="action-btn action-btn-icon"
              @click="closeCurrentSession"
            >
              <img :src="(themeState.currentTheme as any).DeleteIcon" class="action-icon-img" alt="" />
            </button>
          </Tooltip>
        </div>
        <!-- 更多操作：... 下拉 -->
        <DropdownMenu v-model:open="moreDropdownOpen" v-if="props.mode !== 'demo'">
          <DropdownMenuTrigger as-child>
            <button type="button" class="action-btn action-btn-icon">
              <MoreHorizontal class="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="terminal-more-dropdown">
            <DropdownMenuItem @select="clearTerminal">
              {{ $t('console.clear') }}
            </DropdownMenuItem>
            <DropdownMenuItem @select="saveTerminal">
              {{ $t('console.saveLog') }}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @select="scrollToNextCommand">
              {{ $t('console.scrollToNextCommand') }}
            </DropdownMenuItem>
            <DropdownMenuItem @select="scrollToPreviousCommand">
              {{ $t('console.scrollToPreviousCommand') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
    <div class="xterm-console-body">
      <div class="xterm-console-editor" :class="{ 'has-session-list': sessions.length > 1 }" ref="editorContainerRef">
        <SyncScrollbar
          :get-scroll-info="getXtermScrollInfo"
          :set-scroll-top="setXtermScrollTop"
          :poll-interval="150"
        />
        <XtermConsoleInstance
          v-for="s in sessions"
          :key="s.id"
          :ref="(el) => setInstanceRef(s.id, el)"
          :console-key="s.consoleKey"
          :shell-id="s.shellId"
          :initial-directory="props.initialDirectory"
          :is-visible="s.id === activeSessionId"
        />
        <div v-if="props.mode === 'demo'" ref="demoTerminalContainer" class="xterm-instance"></div>
      </div>
      <div
        v-if="sessions.length > 1"
        class="session-list-resize-bar"
        :title="$t('article.drag_to_resize', '拖动以改变宽度')"
        @mousedown.prevent="startSessionListResize"
      />
      <el-scrollbar
        v-if="sessions.length > 1"
        class="session-list-panel"
        :style="[sessionListStyle, { width: sessionListWidth + 'px' }]"
      >
        <div
          v-for="s in sessions"
          :key="s.id"
          class="session-list-item"
          :class="{ 'is-active': s.id === activeSessionId }"
          @click="activeSessionId = s.id"
        >
          <span class="session-label">{{ s.shellLabel }}</span>
          <button
            type="button"
            class="session-delete-btn"
            @click.stop="closeSession(s.id)"
          >
            <img :src="(themeState.currentTheme as any).DeleteIcon" class="session-delete-icon" alt="" />
          </button>
        </div>
      </el-scrollbar>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Tooltip } from '@renderer/components/ui/tooltip'
import { Plus, ChevronDown, MoreHorizontal } from 'lucide-vue-next'
import messageBridge from '../bridge/message-bridge'
import { webMainCalls } from '../utils/web-adapter/web-main-calls.js'
import eventBus from '../utils/event-bus'
import { themeState, mixColors } from '../utils/themes'
import SyncScrollbar from './SyncScrollbar.vue'
import XtermConsoleInstance from './XtermConsoleInstance.vue'

if (typeof window !== 'undefined' && !(window as any).electron?.ipcRenderer) {
  webMainCalls()
}

const { t } = useI18n()

interface ShellOption {
  id: string
  path: string
  label: string
}

interface Session {
  id: string
  consoleKey: string
  shellId: string
  shellLabel: string
}

const props = withDefaults(
  defineProps<{
    consoleKey?: string
    initialDirectory?: string
    mode?: 'normal' | 'demo'
    history?: Array<{ content: string }>
    visible?: boolean
  }>(),
  {
    consoleKey: 'plaintext',
    initialDirectory: '',
    mode: 'normal',
    visible: true
  }
)

const emit = defineEmits<{
  allSessionsClosed: []
}>()

const getXtermBg = () => {
  const base = themeState.currentTheme.editorPanelBackgroundColor
  const isDark = themeState.currentTheme.type === 'dark'
  if (!base) return isDark ? '#0d0d0d' : '#f5f5f5'
  return isDark ? mixColors(base, '#000000', 0.4) : mixColors(base, '#ffffff', 0.5)
}

const consoleStyle = ref({
  '--xterm-bg': getXtermBg(),
  '--xterm-fg': themeState.currentTheme.textColor2
})

const availableShells = ref<ShellOption[]>([])
const sessions = ref<Session[]>([])
const activeSessionId = ref<string | null>(null)
const shellDropdownOpen = ref(false)
const moreDropdownOpen = ref(false)
const instanceRefs = new Map<string, any>()

const setInstanceRef = (id: string, el: any) => {
  if (el) instanceRefs.set(id, el)
}

const SESSION_LIST_DEFAULT_WIDTH = 140
const SESSION_LIST_MIN_WIDTH = 80
const SESSION_LIST_MAX_WIDTH = 320
const SESSION_LIST_STORAGE_KEY = 'metadoc-xterm-session-list-width'

const sessionListWidth = ref(SESSION_LIST_DEFAULT_WIDTH)

const sessionListStyle = computed(() => ({
  backgroundColor: mixColors(themeState.currentTheme.background2nd || themeState.currentTheme.background, '#000000', 0.02),
  borderColor: themeState.currentTheme.type === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
  color: themeState.currentTheme.textColor
}))

let sessionListResizeStartX = 0
let sessionListResizeStartWidth = 0

const startSessionListResize = (e: MouseEvent) => {
  sessionListResizeStartX = e.clientX
  sessionListResizeStartWidth = sessionListWidth.value
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onSessionListResizeMove)
  document.addEventListener('mouseup', onSessionListResizeEnd)
}

const onSessionListResizeMove = (e: MouseEvent) => {
  const delta = e.clientX - sessionListResizeStartX
  const newWidth = Math.max(SESSION_LIST_MIN_WIDTH, Math.min(SESSION_LIST_MAX_WIDTH, sessionListResizeStartWidth - delta))
  sessionListWidth.value = newWidth
}

const onSessionListResizeEnd = () => {
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onSessionListResizeMove)
  document.removeEventListener('mouseup', onSessionListResizeEnd)
  try {
    localStorage.setItem(SESSION_LIST_STORAGE_KEY, String(sessionListWidth.value))
  } catch (_) {}
}

const getDefaultShellId = (): string => {
  if (availableShells.value.length === 0) return ''
  return availableShells.value[0].id
}

const createSession = (shellId?: string) => {
  shellDropdownOpen.value = false
  const sid = shellId || getDefaultShellId()
  const shell = availableShells.value.find((s) => s.id === sid)
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const consoleKey = `${props.consoleKey}-${sessionId}`
  sessions.value.push({
    id: sessionId,
    consoleKey,
    shellId: sid,
    shellLabel: shell?.label || sid
  })
  activeSessionId.value = sessionId
}

const closeSession = (sessionId: string) => {
  const idx = sessions.value.findIndex((s) => s.id === sessionId)
  if (idx < 0) return
  sessions.value.splice(idx, 1)
  if (sessions.value.length === 0) {
    activeSessionId.value = null
    emit('allSessionsClosed')
  } else if (activeSessionId.value === sessionId) {
    activeSessionId.value = sessions.value[Math.max(0, idx - 1)].id
  }
}

const closeCurrentSession = () => {
  if (activeSessionId.value) closeSession(activeSessionId.value)
}

const getActiveInstance = () => {
  if (!activeSessionId.value) return null
  const ref = instanceRefs.get(activeSessionId.value)
  return Array.isArray(ref) ? ref[0] : ref
}

const clearTerminal = () => {
  if (props.mode === 'demo') return
  moreDropdownOpen.value = false
  const inst = getActiveInstance()
  if (inst?.clear) inst.clear()
}

const scrollToNextCommand = () => {
  if (props.mode === 'demo') return
  moreDropdownOpen.value = false
  const inst = getActiveInstance()
  if (inst?.scrollToNextCommand) inst.scrollToNextCommand()
}

const scrollToPreviousCommand = () => {
  if (props.mode === 'demo') return
  moreDropdownOpen.value = false
  const inst = getActiveInstance()
  if (inst?.scrollToPreviousCommand) inst.scrollToPreviousCommand()
}

const saveTerminal = async () => {
  if (props.mode === 'demo') return
  moreDropdownOpen.value = false
  const inst = getActiveInstance()
  const text = inst?.getFullBufferText?.() || ''

  try {
    if (!messageBridge.getIpc()) {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `console-${props.consoleKey}.log`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      eventBus.emit('show-success', t('console.logSaved'))
      return
    }

    const result = (await messageBridge.invoke('save-file-dialog', {
      defaultName: `console-${props.consoleKey}.log`,
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
    eventBus.emit('show-success', t('console.logSaved'))
  } catch (error) {
    console.error('保存日志失败:', error)
    eventBus.emit('show-error', t('console.logSaveFailed') || '保存日志失败')
  }
}

// Demo 模式：单实例静态展示
const demoTerminalContainer = ref<HTMLDivElement | null>(null)
const editorContainerRef = ref<HTMLDivElement | null>(null)

function getActiveTerminalInstance() {
  if (!activeSessionId.value) return null
  const ref = instanceRefs.get(activeSessionId.value)
  return Array.isArray(ref) ? ref[0] : ref
}

function getXtermScrollInfo() {
  if (props.mode === 'demo') {
    const vp = demoTerminalContainer.value?.querySelector('.xterm-viewport') as HTMLElement
    if (vp) {
      return { scrollTop: vp.scrollTop, scrollHeight: vp.scrollHeight, clientHeight: vp.clientHeight }
    }
  }
  const inst = getActiveTerminalInstance()
  if (inst?.getScrollInfoFromTerminal) {
    return inst.getScrollInfoFromTerminal()
  }
  return { scrollTop: 0, scrollHeight: 0, clientHeight: 0 }
}

function setXtermScrollTop(value: number) {
  if (props.mode === 'demo') {
    const vp = demoTerminalContainer.value?.querySelector('.xterm-viewport') as HTMLElement
    vp?.scrollTo?.({ top: value })
    return
  }
  const inst = getActiveTerminalInstance()
  if (inst?.setScrollTopFromTerminal) {
    inst.setScrollTopFromTerminal(Math.round(value))
  }
}
let demoTerm: any = null

const initDemoMode = () => {
  if (props.mode !== 'demo' || !demoTerminalContainer.value) return
  if (demoTerm) {
    demoTerm.dispose()
    demoTerm = null
  }
  const { Terminal } = require('xterm')
  const isDark = themeState.currentTheme.type === 'dark'
  const bg = getXtermBg()
  const fg = themeState.currentTheme.textColor2 || (isDark ? '#d4d4d4' : '#333333')
  demoTerm = new Terminal({
    cursorBlink: false,
    fontSize: 13,
    fontFamily: '"JetBrains Mono", "Consolas", monospace',
    theme: { background: bg, foreground: fg, cursor: fg, cursorAccent: bg }
  })
  demoTerm.open(demoTerminalContainer.value)
  if (props.history && props.history.length > 0) {
    for (const line of props.history) {
      demoTerm.writeln(line.content)
    }
    demoTerm.writeln('$ ')
  } else {
    demoTerm.writeln('$ echo "Demo 模式 - 终端展示"')
    demoTerm.writeln('Demo 模式 - 终端展示')
    demoTerm.writeln('$ ')
  }
}

const onSyncTheme = () => {
  consoleStyle.value = {
    '--xterm-bg': getXtermBg(),
    '--xterm-fg': themeState.currentTheme.textColor2
  }
}

eventBus.on('sync-editor-theme', onSyncTheme)

const ensureSessionWhenVisible = () => {
  if (props.mode !== 'demo' && props.visible && sessions.value.length === 0) {
    createSession()
  }
}

onMounted(async () => {
  try {
    const saved = localStorage.getItem(SESSION_LIST_STORAGE_KEY)
    if (saved) {
      const w = parseInt(saved, 10)
      if (!isNaN(w) && w >= SESSION_LIST_MIN_WIDTH && w <= SESSION_LIST_MAX_WIDTH) {
        sessionListWidth.value = w
      }
    }
  } catch (_) {}
  if (props.mode === 'demo') {
    initDemoMode()
    return
  }

  try {
    const shells = (await messageBridge.invoke('terminal-get-shells')) as ShellOption[]
    availableShells.value = shells
    ensureSessionWhenVisible()
  } catch (e) {
    console.error('获取 Shell 列表失败:', e)
  }
})

watch(() => props.visible, (v) => {
  if (v) ensureSessionWhenVisible()
})

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onSessionListResizeMove)
  document.removeEventListener('mouseup', onSessionListResizeEnd)
  eventBus.off('sync-editor-theme', onSyncTheme)
  if (demoTerm) {
    demoTerm.dispose()
    demoTerm = null
  }
})

watch(
  () => [props.mode, props.history],
  () => {
    if (props.mode === 'demo') initDemoMode()
  },
  { deep: true }
)
</script>

<style scoped>
.xterm-console-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background-color: var(--xterm-bg);
  color: var(--xterm-fg);
  font-size: 13px;
  overflow: hidden;
}

.xterm-console-container.demo-mode {
  min-height: 300px;
  height: 300px;
}

.xterm-console-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
  border-bottom: 1px solid #9a9a9a41;
  flex-shrink: 0;
}

.xterm-console-title {
  user-select: none;
  font-size: 13px;
}

.xterm-console-actions {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  flex-shrink: 0;
  gap: 2px;
}

/* Monaco 风格：主按钮 + 附属下拉组合 */
.action-combo {
  display: flex;
  align-items: center;
  gap: 2px;
}

.action-combo-inner {
  display: flex;
  align-items: stretch;
  border-radius: 4px;
  overflow: hidden;
}

.action-combo-inner:hover .action-btn {
  background-color: rgba(128, 128, 128, 0.12);
}

.action-combo-inner .action-btn:hover {
  background-color: rgba(128, 128, 128, 0.2);
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition: background-color 0.15s;
}

.action-btn-primary {
  width: 26px;
  height: 24px;
}

.action-btn-dropdown {
  width: 18px;
  height: 24px;
  border-left: 1px solid rgba(128, 128, 128, 0.25);
}

.action-btn-icon {
  width: 26px;
  height: 24px;
}

.action-icon-img {
  width: 14px;
  height: 14px;
  display: block;
}

.session-delete-btn {
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.session-list-item:hover .session-delete-btn {
  opacity: 1;
}

.session-delete-icon {
  width: 12px;
  height: 12px;
  display: block;
}

.xterm-console-body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.xterm-console-editor {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  position: relative;
  background-color: var(--xterm-bg);
}

.xterm-console-editor.has-session-list {
  flex: 1;
  min-width: 0;
}

.session-list-panel :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
  overflow-y: auto;
}

.session-list-panel :deep(.el-scrollbar__view) {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.session-list-resize-bar {
  width: 4px;
  min-width: 4px;
  flex-shrink: 0;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
}
.session-list-resize-bar:hover {
  background: rgba(128, 128, 128, 0.2);
}

.session-list-panel {
  min-width: 80px;
  flex-shrink: 0;
  flex-grow: 0;
  border-left: 1px solid;
  padding: 4px 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow-y: auto;
}

.session-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 8px;
  min-height: 20px;
  border-radius: 0;
  cursor: pointer;
  font-size: 12px;
  transition: background-color 0.2s;
}

.session-list-item:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.session-list-item.is-active {
  background-color: rgba(64, 158, 255, 0.16);
}

.session-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.terminal-shell-dropdown,
.terminal-more-dropdown {
  min-width: 180px;
}

.xterm-instance {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 8px;
  box-sizing: border-box;
}

.xterm-instance :deep(.terminal),
.xterm-instance :deep(.xterm) {
  width: 100% !important;
  height: 100% !important;
  min-height: 100% !important;
}

.xterm-instance :deep(.xterm-viewport) {
  overflow-y: auto !important;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.xterm-instance :deep(.xterm-viewport)::-webkit-scrollbar {
  display: none;
  width: 0;
}
</style>
