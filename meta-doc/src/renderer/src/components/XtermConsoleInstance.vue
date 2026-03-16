<template>
  <div
    v-show="isVisible"
    class="xterm-instance"
    ref="terminalContainer"
  ></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { useI18n } from 'vue-i18n'
import messageBridge from '../bridge/message-bridge'
import eventBus from '../utils/event-bus'
import { themeState, mixColors } from '../utils/themes'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    consoleKey: string
    shellId?: string
    initialDirectory?: string
    isVisible?: boolean
  }>(),
  {
    shellId: '',
    initialDirectory: '',
    isVisible: true
  }
)

const scrollToNextCommand = () => {
  if (term && typeof term.scrollLines === 'function') {
    term.scrollLines(1)
  }
}

const scrollToPreviousCommand = () => {
  if (term && typeof term.scrollLines === 'function') {
    term.scrollLines(-1)
  }
}

function getScrollInfoFromTerminal() {
  if (!term) return { scrollTop: 0, scrollHeight: 0, clientHeight: 0 }
  const buf = term.buffer.active
  const viewportY = buf.viewportY
  const totalLines = buf.length
  const rows = term.rows
  const scrollable = Math.max(0, totalLines - rows)
  return {
    scrollTop: scrollable > 0 ? viewportY : 0,
    scrollHeight: totalLines,
    clientHeight: rows
  }
}

function setScrollTopFromTerminal(lineIndex: number) {
  if (!term) return
  term.scrollToLine(lineIndex)
}

defineExpose({
  clear: () => clearTerminal(),
  getFullBufferText: () => getFullBufferText(),
  fit: () => resizeTerminal(),
  scrollToNextCommand,
  scrollToPreviousCommand,
  getScrollInfoFromTerminal,
  setScrollTopFromTerminal
})

const terminalContainer = ref<HTMLDivElement | null>(null)
let term: Terminal | null = null
let fitAddon: FitAddon | null = null
const terminalBuffer = ref<string>('')

const getXtermBg = () => {
  const base = themeState.currentTheme.editorPanelBackgroundColor
  const isDark = themeState.currentTheme.type === 'dark'
  if (!base) return isDark ? '#0d0d0d' : '#f5f5f5'
  return isDark ? mixColors(base, '#000000', 0.4) : mixColors(base, '#ffffff', 0.5)
}

const applyTheme = () => {
  if (!term) return
  const isDark = themeState.currentTheme.type === 'dark'
  const bg = getXtermBg()
  const fg = themeState.currentTheme.textColor2 || (isDark ? '#d4d4d4' : '#333333')
  term.options.theme = {
    background: bg,
    foreground: fg,
    cursor: fg,
    cursorAccent: bg
  }
}

const initTerminal = async () => {
  if (!terminalContainer.value || !messageBridge.getIpc()?.invoke) return

  try {
    term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace',
      theme: {}
    })

    fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    term.onData((data: string) => {
      messageBridge.invoke('terminal-write', {
        consoleKey: props.consoleKey,
        data
      }).catch((err) => console.error('terminal-write 失败:', err))
    })

    // Ctrl+V / Cmd+V：拦截并粘贴剪贴板内容，而非发送 ^V
    // 注意：attachCustomKeyEventHandler 会在 keydown/keypress/keyup 时都被调用，只在 keydown 时执行粘贴
    term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
      const isMac = /Mac|iPhone|iPod|iPad/i.test(navigator.platform)
      const mod = isMac ? ev.metaKey : ev.ctrlKey
      if (mod && ev.key === 'v') {
        if (ev.type === 'keydown') {
          ev.preventDefault()
          doPaste()
        }
        return false // 阻止 xterm 默认处理
      }
      return true
    })

    term.open(terminalContainer.value)
    applyTheme()
    fitAddon.fit()

    // 阻止 xterm 内置 paste 处理，避免与我们的 Ctrl+V 重复粘贴（我们已在 key 和 contextmenu 中处理）
    const pasteHandler = (e: ClipboardEvent) => {
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    terminalContainer.value.addEventListener('paste', pasteHandler, { capture: true })
    ;(window as any)[`__xtermPasteHandler_${props.consoleKey}`] = () => {
      terminalContainer.value?.removeEventListener('paste', pasteHandler, true)
    }

    // 右键：有选中则复制，无选中则粘贴（使用 capture 确保优先于其他 handler）
    const ctxHandler = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      handleContextMenu()
    }
    terminalContainer.value.addEventListener('contextmenu', ctxHandler, { capture: true })
    ;(window as any)[`__xtermCtxHandler_${props.consoleKey}`] = () => {
      terminalContainer.value?.removeEventListener('contextmenu', ctxHandler, true)
    }

    const result = (await messageBridge.invoke('terminal-create', {
      consoleKey: props.consoleKey,
      cwd: props.initialDirectory || undefined,
      shell: props.shellId || undefined,
      cols: term.cols,
      rows: term.rows
    })) as { success: boolean; error?: string }

    if (!result.success) {
      term.writeln(`\r\n错误: 无法创建终端 - ${result.error || '未知错误'}`)
      return
    }

    if (typeof navigator !== 'undefined' && /Win/i.test(navigator.platform)) {
      messageBridge.invoke('terminal-write', {
        consoleKey: props.consoleKey,
        data: 'chcp 65001\r'
      }).catch(() => {})
    }
  } catch (error) {
    console.error('初始化 xterm 终端失败:', error)
    if (term && terminalContainer.value) {
      term.writeln(`\r\n错误: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

const onTerminalData = (_event: unknown, payload: { consoleKey?: string; data?: string }) => {
  if (payload?.consoleKey !== props.consoleKey || !payload?.data) return
  if (term) {
    term.write(payload.data)
    terminalBuffer.value += payload.data
  }
}

const onTerminalExit = (_event: unknown, payload: { consoleKey?: string; exitCode?: number }) => {
  if (payload?.consoleKey !== props.consoleKey) return
  if (term) {
    term.writeln(`\r\n[进程已退出, exitCode=${payload.exitCode ?? 0}]`)
  }
}

const resizeTerminal = () => {
  if (fitAddon && term && messageBridge.getIpc()?.invoke && props.isVisible) {
    fitAddon.fit()
    messageBridge.invoke('terminal-resize', {
      consoleKey: props.consoleKey,
      cols: term.cols,
      rows: term.rows
    }).catch(() => {})
  }
}

const clearTerminal = () => {
  if (term) {
    term.clear()
    terminalBuffer.value = ''
  }
}

// 粘贴剪贴板内容到终端
const doPaste = () => {
  navigator.clipboard.readText().then((text) => {
    if (text) {
      messageBridge.invoke('terminal-write', {
        consoleKey: props.consoleKey,
        data: text
      }).catch((err) => console.error('terminal-write 失败:', err))
    }
  }).catch(() => {})
}

// 右键菜单：有选中则复制，无选中则粘贴
const handleContextMenu = async () => {
  if (!term) return
  const selection = term.getSelection()
  if (selection) {
    try {
      await navigator.clipboard.writeText(selection)
      eventBus.emit('show-success', { message: t('common.copySuccess', '已复制到剪贴板') })
    } catch (err) {
      console.error('复制失败:', err)
    }
    } else {
    doPaste()
  }
}

const getFullBufferText = (): string => {
  if (!term) return terminalBuffer.value
  try {
    const buf = term.buffer.active
    const lines: string[] = []
    for (let i = 0; i < buf.length; i++) {
      const line = buf.getLine(i)
      if (line) lines.push(line.translateToString(true))
    }
    return lines.join('\r\n')
  } catch {
    return terminalBuffer.value
  }
}

watch(() => props.isVisible, (visible) => {
  if (visible) nextTick(resizeTerminal)
})

const onSyncTheme = () => {
  applyTheme()
}

eventBus.on('sync-editor-theme', onSyncTheme)

onMounted(async () => {
  messageBridge.on('terminal-data', onTerminalData)
  messageBridge.on('terminal-exit', onTerminalExit)
  await initTerminal()
  const ro = new ResizeObserver(() => nextTick(resizeTerminal))
  if (terminalContainer.value) {
    ro.observe(terminalContainer.value)
  }
  ;(window as any)[`__xtermResizeObserver_${props.consoleKey}`] = ro
})

onBeforeUnmount(() => {
  eventBus.off('sync-editor-theme', onSyncTheme)
  messageBridge.removeListener('terminal-data', onTerminalData)
  messageBridge.removeListener('terminal-exit', onTerminalExit)

  const ro = (window as any)[`__xtermResizeObserver_${props.consoleKey}`] as ResizeObserver | undefined
  if (ro && terminalContainer.value) {
    ro.unobserve(terminalContainer.value)
  }

  if (messageBridge.getIpc()?.invoke) {
    messageBridge.invoke('terminal-kill', { consoleKey: props.consoleKey }).catch(() => {})
  }

  const cleanupCtx = (window as any)[`__xtermCtxHandler_${props.consoleKey}`] as (() => void) | undefined
  if (typeof cleanupCtx === 'function') {
    cleanupCtx()
    delete (window as any)[`__xtermCtxHandler_${props.consoleKey}`]
  }
  const cleanupPaste = (window as any)[`__xtermPasteHandler_${props.consoleKey}`] as (() => void) | undefined
  if (typeof cleanupPaste === 'function') {
    cleanupPaste()
    delete (window as any)[`__xtermPasteHandler_${props.consoleKey}`]
  }

  if (term) {
    term.dispose()
    term = null
  }
  fitAddon = null
})
</script>

<style scoped>
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
}
</style>
