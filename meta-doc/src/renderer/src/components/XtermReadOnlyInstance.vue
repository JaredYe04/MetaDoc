<template>
  <div
    v-show="isVisible"
    class="xterm-instance xterm-readonly"
    ref="terminalContainer"
  ></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import eventBus from '../utils/event-bus'
import { themeState, mixColors } from '../utils/themes'

const props = withDefaults(
  defineProps<{
    isVisible?: boolean
  }>(),
  {
    isVisible: true
  }
)

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
  term.scrollToLine(Math.round(lineIndex))
}

defineExpose({
  clear: () => clearTerminal(),
  getFullBufferText: () => getFullBufferText(),
  fit: () => resizeTerminal(),
  write: (text: string) => writeText(text),
  writeln: (text: string) => writelnText(text),
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

const writeText = (text: string) => {
  if (term && text) {
    term.write(text)
    terminalBuffer.value += text
  }
}

const writelnText = (text: string) => {
  if (term) {
    term.writeln(text)
    terminalBuffer.value += text + '\r\n'
  }
}

const clearTerminal = () => {
  if (term) {
    term.clear()
    terminalBuffer.value = ''
  }
}

const resizeTerminal = () => {
  if (fitAddon && term && props.isVisible) {
    fitAddon.fit()
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

const initTerminal = () => {
  if (!terminalContainer.value) return

  term = new Terminal({
    cursorBlink: false,
    fontSize: 13,
    fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace',
    theme: {},
    convertEol: true
  })

  // 只读：禁用输入
  term.options.disableStdin = true

  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)

  // Ctrl+C / Cmd+C：只读终端里用于复制选中内容（xterm 默认通常是 Ctrl+Shift+C）
  term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
    const isMac = /Mac|iPhone|iPod|iPad/i.test(navigator.platform)
    const mod = isMac ? ev.metaKey : ev.ctrlKey
    if (mod && (ev.key === 'c' || ev.key === 'C')) {
      const selection = term?.getSelection?.() || ''
      if (selection && selection.trim().length > 0) {
        if (ev.type === 'keydown') {
          ev.preventDefault()
          void navigator.clipboard.writeText(selection).catch((err) => {
            console.error('复制失败:', err)
          })
        }
        return false
      }
    }
    return true
  })

  term.open(terminalContainer.value)
  applyTheme()
  fitAddon.fit()

  // 右键：有选中则复制，无选中则不处理（只读区不做“右键粘贴”）
  const ctxHandler = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const selection = term?.getSelection?.() || ''
    if (selection && selection.trim().length > 0) {
      void navigator.clipboard.writeText(selection).catch((err) => {
        console.error('复制失败:', err)
      })
    }
  }
  terminalContainer.value.addEventListener('contextmenu', ctxHandler, { capture: true })
  ;(terminalContainer.value as any).__xtermReadonlyCtxHandler = ctxHandler
}

onMounted(() => {
  initTerminal()
  if (terminalContainer.value) {
    const ro = new ResizeObserver(() => {
      nextTick(resizeTerminal)
    })
    ro.observe(terminalContainer.value)
    ;(terminalContainer.value as any).__resizeObserver = ro
  }
})

eventBus.on('sync-editor-theme', applyTheme)

onBeforeUnmount(() => {
  eventBus.off('sync-editor-theme', applyTheme)
  const el = terminalContainer.value as any
  if (el?.__resizeObserver) {
    el.__resizeObserver.disconnect()
    el.__resizeObserver = null
  }
  if (terminalContainer.value && (terminalContainer.value as any).__xtermReadonlyCtxHandler) {
    terminalContainer.value.removeEventListener(
      'contextmenu',
      (terminalContainer.value as any).__xtermReadonlyCtxHandler,
      true
    )
    ;(terminalContainer.value as any).__xtermReadonlyCtxHandler = null
  }
  if (term) {
    term.dispose()
    term = null
  }
  fitAddon = null
})

watch(() => props.isVisible, (visible) => {
  if (visible) nextTick(resizeTerminal)
})
</script>

<style scoped>
.xterm-readonly :deep(.xterm-cursor) {
  display: none;
}
</style>
