<template>
  <div
    class="xterm-console-container xterm-console-latex"
    :style="consoleStyle"
  >
    <div
      class="xterm-console-header"
      :style="{
        backgroundColor: themeState.currentTheme.editorToolbarBackgroundColor
      }"
    >
      <span class="xterm-console-title">{{ $t('console.title') }}</span>
      <div class="compile-session-limit-wrap">
        <DropdownMenu v-model:open="compileLimitDropdownOpen">
          <DropdownMenuTrigger as-child>
            <button type="button" class="limit-trigger">
              <span class="limit-label">{{ $t('console.compileSessionLimit', '保留编译信息') }}</span>
              <span class="limit-value">{{ compileLimitLabel }}</span>
              <ChevronDown class="w-3.5 h-3.5 ml-1" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="compile-limit-dropdown">
            <DropdownMenuItem
              v-for="opt in compileLimitOptions"
              :key="opt.value"
              @select="maxCompileSessions = opt.value"
            >
              {{ opt.label }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div class="xterm-console-actions">
        <div class="action-combo action-combo-add">
          <div class="action-combo-inner">
            <Tooltip :content="$t('console.newSession', '新建会话')">
              <button type="button" class="action-btn action-btn-primary" @click="createUserSession()">
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
                  @select="createUserSession(s.id)"
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
        <Tooltip v-if="enableAiAnalysis !== undefined">
          <TooltipTrigger as-child>
            <div class="console-ai-switch-wrap">
              <span class="console-ai-label">{{ $t('console.enableAiAnalysis') }}</span>
              <Switch
                :checked="enableAiAnalysis ?? false"
                @update:checked="(v: boolean) => emit('update:enableAiAnalysis', v)"
              />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {{ $t('console.enableAiAnalysisHint') }}
          </TooltipContent>
        </Tooltip>
        <DropdownMenu v-model:open="moreDropdownOpen">
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
        <!-- 编译会话：只读 -->
        <XtermReadOnlyInstance
          v-for="s in compileSessions"
          :key="s.id"
          :ref="(el) => setCompileRef(s.id, el)"
          :is-visible="s.id === activeSessionId && activeSessionType === 'compile'"
        />
        <!-- 用户会话：可交互 -->
        <XtermConsoleInstance
          v-for="s in userSessions"
          :key="s.id"
          :ref="(el) => setInstanceRef(s.id, el)"
          :console-key="s.consoleKey"
          :shell-id="s.shellId"
          :initial-directory="initialDirectory"
          :is-visible="s.id === activeSessionId && activeSessionType === 'user'"
        />
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
          :class="{ 'is-active': s.id === activeSessionId && s.type === activeSessionType, 'is-readonly': s.type === 'compile' }"
          @click="activeSessionId = s.id; activeSessionType = s.type"
        >
          <span class="session-label">{{ s.label }}</span>
          <button
            type="button"
            class="session-delete-btn"
            @click.stop="closeSession(s.id, s.type)"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { Switch } from '@renderer/components/ui/switch'
import { Plus, ChevronDown, MoreHorizontal } from 'lucide-vue-next'
import messageBridge from '../bridge/message-bridge'
import eventBus from '../utils/event-bus'
import { themeState, mixColors } from '../utils/themes'
import { ElScrollbar } from 'element-plus'
import SyncScrollbar from './SyncScrollbar.vue'
import XtermReadOnlyInstance from './XtermReadOnlyInstance.vue'
import XtermConsoleInstance from './XtermConsoleInstance.vue'

const { t } = useI18n()

const compileLimitOptions = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5' },
  { value: 6, label: '6' },
  { value: 7, label: '7' },
  { value: 8, label: '8' },
  { value: 9, label: '9' },
  { value: 10, label: '10' },
  { value: 15, label: '15' },
  { value: 20, label: '20' },
  { value: -1, label: '不限制' }
]

const maxCompileSessions = ref(5)
const COMPILE_LIMIT_STORAGE_KEY = 'metadoc-xterm-latex-compile-limit'

watch(maxCompileSessions, (v) => {
  try {
    localStorage.setItem(COMPILE_LIMIT_STORAGE_KEY, String(v))
  } catch (_) {}
})

interface ShellOption {
  id: string
  path: string
  label: string
}

type SessionType = 'compile' | 'user'

interface Session {
  id: string
  type: SessionType
  label: string
  consoleKey?: string
  shellId?: string
}

const props = withDefaults(
  defineProps<{
    initialDirectory?: string
    enableAiAnalysis?: boolean
  }>(),
  {
    initialDirectory: '',
    enableAiAnalysis: undefined
  }
)

const emit = defineEmits<{
  (e: 'update:enableAiAnalysis', value: boolean): void
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

const compileSessions = ref<Session[]>([])
const userSessions = ref<Session[]>([])
const activeSessionId = ref<string | null>(null)
const activeSessionType = ref<SessionType>('compile')
const shellDropdownOpen = ref(false)
const moreDropdownOpen = ref(false)
const compileLimitDropdownOpen = ref(false)

const compileLimitLabel = computed(() => {
  const opt = compileLimitOptions.find((o) => o.value === maxCompileSessions.value)
  return opt?.label ?? '5'
})
const compileRefs = new Map<string, any>()
const instanceRefs = new Map<string, any>()
const editorContainerRef = ref<HTMLDivElement | null>(null)
const availableShells = ref<ShellOption[]>([])

function getActiveTerminalInstance() {
  const inst = getActiveInstance()
  return inst
}

function getXtermScrollInfo() {
  const inst = getActiveTerminalInstance()
  if (inst?.getScrollInfoFromTerminal) {
    return inst.getScrollInfoFromTerminal()
  }
  return { scrollTop: 0, scrollHeight: 0, clientHeight: 0 }
}

function setXtermScrollTop(lineIndex: number) {
  const inst = getActiveTerminalInstance()
  if (inst?.setScrollTopFromTerminal) {
    inst.setScrollTopFromTerminal(Math.round(lineIndex))
  }
}

const SESSION_LIST_DEFAULT_WIDTH = 140
const SESSION_LIST_MIN_WIDTH = 80
const SESSION_LIST_MAX_WIDTH = 320
const SESSION_LIST_STORAGE_KEY = 'metadoc-xterm-latex-session-list-width'

const sessionListWidth = ref(SESSION_LIST_DEFAULT_WIDTH)

const sessionListStyle = computed(() => ({
  backgroundColor: mixColors(themeState.currentTheme.background2nd || themeState.currentTheme.background, '#000000', 0.02),
  borderColor: themeState.currentTheme.type === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
  color: themeState.currentTheme.textColor
}))

const sessions = computed(() => {
  const list: Session[] = []
  compileSessions.value.forEach((s) => list.push(s))
  userSessions.value.forEach((s) => list.push(s))
  return list
})

const setCompileRef = (id: string, el: any) => {
  if (el) compileRefs.set(id, el)
}

const setInstanceRef = (id: string, el: any) => {
  if (el) instanceRefs.set(id, el)
}

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

/** 创建新的编译会话（只读），每次编译时调用 */
const createCompileSession = (): string => {
  const sessionId = `compile-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const label = `编译 ${compileSessions.value.length + 1}`
  const limit = maxCompileSessions.value < 0 ? Infinity : maxCompileSessions.value

  while (compileSessions.value.length >= limit) {
    const oldest = compileSessions.value[0]
    compileSessions.value.splice(0, 1)
    if (activeSessionId.value === oldest.id && activeSessionType.value === 'compile') {
      activeSessionId.value = compileSessions.value[0]?.id ?? null
    }
  }

  compileSessions.value.push({
    id: sessionId,
    type: 'compile',
    label
  })
  activeSessionId.value = sessionId
  activeSessionType.value = 'compile'
  activeCompileSessionId = sessionId

  eventBus.on('console-out', onConsoleOut)
  eventBus.on('console-err', onConsoleErr)
  eventBus.on('clear-console', onClearConsole)
  messageBridge.on('console-out', onConsoleOut as any)
  messageBridge.on('console-err', onConsoleErr as any)

  return sessionId
}

const createUserSession = (shellId?: string) => {
  shellDropdownOpen.value = false
  const sid = shellId || getDefaultShellId()
  const shell = availableShells.value.find((s) => s.id === sid)
  const sessionId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const consoleKey = `latex-${sessionId}`
  userSessions.value.push({
    id: sessionId,
    type: 'user',
    label: shell?.label || sid,
    consoleKey,
    shellId: sid
  })
  activeSessionId.value = sessionId
  activeSessionType.value = 'user'
}

const closeSession = (sessionId: string, type: SessionType) => {
  if (type === 'compile') {
    const idx = compileSessions.value.findIndex((s) => s.id === sessionId)
    if (idx >= 0) {
      compileSessions.value.splice(idx, 1)
      if (activeSessionId.value === sessionId && activeSessionType.value === 'compile') {
        finishCompileSession()
        activeSessionId.value = compileSessions.value[Math.max(0, idx - 1)]?.id ?? userSessions.value[0]?.id ?? null
        activeSessionType.value = activeSessionId.value ? (compileSessions.value.some((s) => s.id === activeSessionId.value) ? 'compile' : 'user') : 'compile'
        if (activeSessionType.value === 'compile' && activeSessionId.value) {
          activeCompileSessionId = activeSessionId.value
          eventBus.on('console-out', onConsoleOut)
          eventBus.on('console-err', onConsoleErr)
          eventBus.on('clear-console', onClearConsole)
          messageBridge.on('console-out', onConsoleOut as any)
          messageBridge.on('console-err', onConsoleErr as any)
        }
      }
    }
  } else {
    const idx = userSessions.value.findIndex((s) => s.id === sessionId)
    if (idx >= 0) {
      userSessions.value.splice(idx, 1)
      if (activeSessionId.value === sessionId && activeSessionType.value === 'user') {
        activeSessionId.value = userSessions.value[Math.max(0, idx - 1)]?.id ?? compileSessions.value[0]?.id ?? null
        activeSessionType.value = activeSessionId.value ? (userSessions.value.some((s) => s.id === activeSessionId.value) ? 'user' : 'compile') : 'compile'
      }
    }
  }
}

const closeCurrentSession = () => {
  if (activeSessionId.value && activeSessionType.value) {
    closeSession(activeSessionId.value, activeSessionType.value)
  }
}

const getActiveInstance = () => {
  if (!activeSessionId.value) return null
  if (activeSessionType.value === 'compile') {
    const ref = compileRefs.get(activeSessionId.value)
    return Array.isArray(ref) ? ref[0] : ref
  }
  const ref = instanceRefs.get(activeSessionId.value)
  return Array.isArray(ref) ? ref[0] : ref
}

const clearTerminal = () => {
  moreDropdownOpen.value = false
  const inst = getActiveInstance()
  if (inst?.clear) inst.clear()
}

const scrollToNextCommand = () => {
  moreDropdownOpen.value = false
  const inst = getActiveInstance()
  if (inst?.scrollToNextCommand) inst.scrollToNextCommand()
}

const scrollToPreviousCommand = () => {
  moreDropdownOpen.value = false
  const inst = getActiveInstance()
  if (inst?.scrollToPreviousCommand) inst.scrollToPreviousCommand()
}

const saveTerminal = async () => {
  moreDropdownOpen.value = false
  const inst = getActiveInstance()
  const text = inst?.getFullBufferText?.() || ''

  try {
    if (!messageBridge.getIpc()) {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'console-latex.log'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      eventBus.emit('show-success', t('console.logSaved'))
      return
    }

    const result = (await messageBridge.invoke('save-file-dialog', {
      defaultName: 'console-latex.log',
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

// 将 console-out/console-err 路由到当前活动的编译会话
let activeCompileSessionId: string | null = null

const onConsoleOut = (_event: unknown, data?: unknown) => {
  const payload = (data ?? _event) as { key?: string; content?: string }
  if (payload?.key !== 'latex' || !payload?.content || !activeCompileSessionId) return
  const ref = compileRefs.get(activeCompileSessionId)
  const inst = Array.isArray(ref) ? ref[0] : ref
  if (inst?.write) inst.write(payload.content)
  nextTick(() => inst?.fit?.())
}

const onConsoleErr = (_event: unknown, data?: unknown) => {
  const payload = (data ?? _event) as { key?: string; content?: string }
  if (payload?.key !== 'latex' || !payload?.content || !activeCompileSessionId) return
  const ref = compileRefs.get(activeCompileSessionId)
  const inst = Array.isArray(ref) ? ref[0] : ref
  if (inst?.write) inst.write(payload.content)
  nextTick(() => inst?.fit?.())
}

const onClearConsole = (data: unknown) => {
  const payload = data as { key?: string }
  if (payload?.key !== 'latex' || !activeCompileSessionId) return
  const ref = compileRefs.get(activeCompileSessionId)
  const inst = Array.isArray(ref) ? ref[0] : ref
  if (inst?.clear) inst.clear()
}

const finishCompileSession = () => {
  activeCompileSessionId = null
  eventBus.off('console-out', onConsoleOut)
  eventBus.off('console-err', onConsoleErr)
  eventBus.off('clear-console', onClearConsole)
  messageBridge.removeListener('console-out', onConsoleOut as any)
  messageBridge.removeListener('console-err', onConsoleErr as any)
}

const onGetConsoleContent = (data: unknown) => {
  const payload = data as { key?: string; consoleKey?: string }
  const key = payload?.key ?? payload?.consoleKey
  if (key !== 'latex') return
  const sessionId = activeSessionType.value === 'compile' ? activeSessionId.value : null
  const inst = sessionId ? (() => {
    const ref = compileRefs.get(sessionId)
    return Array.isArray(ref) ? ref[0] : ref
  })() : null
  const fullText = inst?.getFullBufferText?.() || ''
  eventBus.emit('console-content-response', {
    key: 'latex',
    content: { stdout: fullText, stderr: '' }
  })
}

const onAddCompileSession = (sessionId: string) => {
  activeCompileSessionId = sessionId
}

const onActiveCompileSession = (sessionId: string | null) => {
  activeCompileSessionId = sessionId
}

const onSyncTheme = () => {
  consoleStyle.value = {
    '--xterm-bg': getXtermBg(),
    '--xterm-fg': themeState.currentTheme.textColor2
  }
}

eventBus.on('sync-editor-theme', onSyncTheme)

watch([activeSessionId, activeSessionType], () => {
  nextTick(() => {
    const inst = getActiveInstance()
    if (inst?.fit) inst.fit()
  })
})

onMounted(async () => {
  eventBus.on('get-console-content', onGetConsoleContent)
  try {
    const limitSaved = localStorage.getItem(COMPILE_LIMIT_STORAGE_KEY)
    if (limitSaved) {
      const v = parseInt(limitSaved, 10)
      if (!isNaN(v) && (v >= 1 || v === -1)) maxCompileSessions.value = v
    }
  } catch (_) {}
  try {
    const saved = localStorage.getItem(SESSION_LIST_STORAGE_KEY)
    if (saved) {
      const w = parseInt(saved, 10)
      if (!isNaN(w) && w >= SESSION_LIST_MIN_WIDTH && w <= SESSION_LIST_MAX_WIDTH) {
        sessionListWidth.value = w
      }
    }
  } catch (_) {}

  try {
    const shells = (await messageBridge.invoke('terminal-get-shells')) as ShellOption[]
    availableShells.value = shells
  } catch (e) {
    console.error('获取 Shell 列表失败:', e)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onSessionListResizeMove)
  document.removeEventListener('mouseup', onSessionListResizeEnd)
  eventBus.off('sync-editor-theme', onSyncTheme)
  eventBus.off('get-console-content', onGetConsoleContent)
  finishCompileSession()
})

defineExpose({
  createCompileSession,
  finishCompileSession,
  getActiveCompileInstance: () => {
    if (!activeCompileSessionId) return null
    const ref = compileRefs.get(activeCompileSessionId)
    return Array.isArray(ref) ? ref[0] : ref
  }
})
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

.console-ai-switch-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: 6px;
}

.console-ai-label {
  font-size: 12px;
  color: var(--xterm-fg);
  white-space: nowrap;
}

.compile-session-limit-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: 8px;
}

.limit-trigger {
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

.limit-trigger:hover {
  background: rgba(128, 128, 128, 0.1);
}

.limit-label {
  color: var(--xterm-fg);
  margin-right: 4px;
}

.limit-value {
  font-weight: 500;
  margin-right: 2px;
}

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

.session-list-item.is-readonly {
  opacity: 0.9;
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
