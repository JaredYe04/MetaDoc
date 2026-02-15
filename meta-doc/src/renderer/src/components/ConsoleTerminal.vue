<template>
  <div class="console-container" :style="consoleStyle">
    <div
      class="console-header"
      :style="{
        backgroundColor: themeState.currentTheme.editorToolbarBackgroundColor
      }"
    >
      <span class="console-title">{{ $t('console.title') }}</span>
      <div class="console-actions">
        <el-switch
          v-if="showAiAnalysis"
          v-model="enableAiAnalysis"
          :active-text="$t('console.enableAiAnalysis')"
          size="small"
          style="margin-right: 8px"
          @change="handleAiAnalysisToggle"
        />
        <el-select
          v-model="terminalEncoding"
          size="small"
          style="width: 150px; margin-right: 8px"
          @change="handleEncodingChange"
        >
          <el-option-group :label="$t('console.encoding.unicode')">
            <el-option :label="$t('console.encoding.utf8')" value="utf8" />
          </el-option-group>
          <el-option-group :label="$t('console.encoding.chinese')">
            <el-option :label="$t('console.encoding.gbk')" value="gbk" />
            <el-option :label="$t('console.encoding.gb2312')" value="gb2312" />
            <el-option :label="$t('console.encoding.big5')" value="big5" />
          </el-option-group>
          <el-option-group :label="$t('console.encoding.japanese')">
            <el-option :label="$t('console.encoding.shiftJis')" value="shift_jis" />
          </el-option-group>
          <el-option-group :label="$t('console.encoding.korean')">
            <el-option :label="$t('console.encoding.eucKr')" value="euc-kr" />
          </el-option-group>
          <el-option-group :label="$t('console.encoding.western')">
            <el-option :label="$t('console.encoding.iso88591')" value="iso-8859-1" />
            <el-option :label="$t('console.encoding.windows1252')" value="windows-1252" />
            <el-option :label="$t('console.encoding.iso885915')" value="iso-8859-15" />
          </el-option-group>
          <el-option-group :label="$t('console.encoding.centralEastern')">
            <el-option :label="$t('console.encoding.iso88592')" value="iso-8859-2" />
            <el-option :label="$t('console.encoding.windows1250')" value="windows-1250" />
            <el-option :label="$t('console.encoding.koi8r')" value="koi8-r" />
          </el-option-group>
          <el-option-group :label="$t('console.encoding.russian')">
            <el-option :label="$t('console.encoding.windows1251')" value="windows-1251" />
            <el-option :label="$t('console.encoding.iso88595')" value="iso-8859-5" />
          </el-option-group>
          <el-option-group :label="$t('console.encoding.greek')">
            <el-option :label="$t('console.encoding.iso88597')" value="iso-8859-7" />
          </el-option-group>
        </el-select>
        <el-button size="small" @click="clearConsole">{{ $t('console.clear') }}</el-button>
        <el-button size="small" @click="copyConsole">{{ $t('console.copy') }}</el-button>
        <el-button size="small" @click="saveConsole">{{ $t('console.saveLog') }}</el-button>
      </div>
    </div>
    <div class="console-editor" ref="editorContainer"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, PropType, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import * as monaco from 'monaco-editor'
import { setupMonacoWorker } from '../utils/monaco-worker-config'
import localIpcRenderer from '../utils/web-adapter/local-ipc-renderer.ts'
import { webMainCalls } from '../utils/web-adapter/web-main-calls.js'
let ipcRenderer: typeof localIpcRenderer | null = null
if (window && window.electron) {
  ipcRenderer = window.electron.ipcRenderer as typeof localIpcRenderer
} else {
  webMainCalls()
  ipcRenderer = localIpcRenderer
  //todo 说明当前环境不是electron环境，需要另外适配
}
import eventBus from '../utils/event-bus'
import { themeState } from '../utils/themes'
import { dirname, join, normalize, isAbsolute } from '../utils/path-utils'

const { t } = useI18n()

type ConsoleLineType = 'out' | 'err' | 'warn' | 'debug'

interface HistoryLine {
  content: string
  type?: ConsoleLineType | string
}

interface ConsolePayload {
  key?: string
  console_key?: string
  consoleKey?: string
  content?: string
  message?: string
  text?: string
  type?: string
  append?: boolean // 是否追加到当前行（而不是创建新行）
}

interface ConsoleLine {
  id: number
  content: string
  type: ConsoleLineType
}

const props = defineProps({
  consoleKey: {
    type: String,
    default: 'default'
  },
  history: {
    type: Array as PropType<HistoryLine[]>,
    default: () => []
  },
  showAiAnalysis: {
    type: Boolean,
    default: false
  },
  initialDirectory: {
    type: String,
    default: ''
  }
})

const consoleStyle = ref({
  '--console-bg': themeState.currentTheme.editorPanelBackgroundColor,
  '--console-text': themeState.currentTheme.textColor2,
  '--console-err': '#fe8771',
  '--console-warn': '#e6a23c',
  '--console-debug': '#909399'
})

const editorContainer = ref<HTMLDivElement | null>(null)

let lineId = 0
let editorId: string | null = null
let decorationIds: string[] = []
let consoleFontLoaded = false

const normalizeType = (type?: string, fallback: ConsoleLineType = 'out'): ConsoleLineType => {
  if (!type) return fallback
  const lower = type.toLowerCase()
  if (lower === 'error' || lower === 'err') return 'err'
  if (lower === 'warn' || lower === 'warning') return 'warn'
  if (lower === 'debug') return 'debug'
  return fallback
}

// 根据消息内容自动检测类型（检测 "warning" 或 "error" 开头）
// 兜底判断：开头是 warning 的显示黄色，开头是 error 的显示红色，其余白色
const detectTypeFromContent = (content: string): ConsoleLineType | null => {
  if (!content || typeof content !== 'string') return null
  const trimmed = content.trim()
  if (!trimmed) return null
  const lowerContent = trimmed.toLowerCase()

  // 兜底判断：如果消息开头是 "error"（不区分大小写），返回 'err'（红色）
  if (lowerContent.startsWith('error')) {
    return 'err'
  }
  // 兜底判断：如果消息开头是 "warning"（不区分大小写），返回 'warn'（黄色）
  if (lowerContent.startsWith('warning')) {
    return 'warn'
  }
  // 其余情况返回 null，将使用 fallbackType（通常是 'out'，显示白色）
  return null
}

const lines = ref<ConsoleLine[]>([])

// AI分析开关（默认开启）
const enableAiAnalysis = ref(true)

// 处理AI分析开关变化
const handleAiAnalysisToggle = (value: boolean) => {
  // 通过eventBus通知LaTeXEditor组件
  eventBus.emit('console-ai-analysis-toggle', {
    key: props.consoleKey,
    enabled: value
  })
}

const getEditor = (): monaco.editor.IStandaloneCodeEditor | null => {
  if (!editorId) return null
  const editors = (monaco.editor as any).getEditors?.() ?? []
  const found = editors.find((e: monaco.editor.IStandaloneCodeEditor) => e.getId?.() === editorId)
  return found ?? null
}

const ensureConsoleFont = async () => {
  if (consoleFontLoaded || !ipcRenderer?.invoke) return
  try {
    const resourcesPath = await ipcRenderer.invoke('resources-path')
    if (typeof resourcesPath !== 'string' || !resourcesPath) return
    const normalized = resourcesPath.replace(/\\/g, '/').replace(/^\/+/, '')
    const fontUrl = `file:///${normalized}/consola.ttf`
    const fontFace = new FontFace('ConsoleAscii', `url(${fontUrl})`, {
      style: 'normal',
      weight: '400',
      display: 'swap',
      unicodeRange: 'U+0020-007E'
    })
    await fontFace.load()
    document.fonts?.add(fontFace)
    consoleFontLoaded = true
  } catch (error) {
    console.warn('[Console] 加载 consola 字体失败', error)
  }
}

const applyConsoleTheme = () => {
  const editor = getEditor()
  if (!editor) return
  const isDark = themeState.currentTheme.type === 'dark'
  const bg = themeState.currentTheme.editorPanelBackgroundColor || (isDark ? '#1e1e1e' : '#ffffff')
  const fg = themeState.currentTheme.textColor2 || (isDark ? '#d4d4d4' : '#333333')

  // 规范化颜色格式（用于colors对象，带#的6位hex）
  const normalizeColor = (color: string) => {
    if (!color) return '#FFFFFF'
    // 如果已经有#，移除它
    let hex = color.replace('#', '')
    // 如果是3位hex（如 fff），转换为6位（ffffff）
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('')
    }
    // 确保是6位hex，如果不是则返回默认值
    return hex.length === 6 ? '#' + hex.toUpperCase() : '#FFFFFF'
  }

  const normalizedBg = normalizeColor(bg)
  const normalizedFg = normalizeColor(fg)

  monaco.editor.defineTheme('console-viewer', {
    base: isDark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': normalizedBg,
      'editor.foreground': normalizedFg,
      'editorLineNumber.foreground': normalizedFg,
      'editorLineNumber.activeForeground': normalizedFg,
      'scrollbarSlider.background': `${normalizedFg}33`,
      'scrollbarSlider.hoverBackground': `${normalizedFg}55`
    }
  })
  monaco.editor.setTheme('console-viewer')
}

const applyDecorations = (editor: monaco.editor.IStandaloneCodeEditor) => {
  const decorations = lines.value
    .map((line, idx) => {
      let inlineClassName: string | undefined
      if (line.type === 'err') inlineClassName = 'console-inline-err'
      else if (line.type === 'warn') inlineClassName = 'console-inline-warn'
      if (!inlineClassName) return null
      return {
        range: new monaco.Range(idx + 1, 1, idx + 1, line.content.length + 1),
        options: {
          inlineClassName,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
      } as monaco.editor.IModelDeltaDecoration
    })
    .filter((item): item is monaco.editor.IModelDeltaDecoration => !!item)

  decorationIds = editor.deltaDecorations(decorationIds, decorations)
}

// 获取提示符（显示当前目录或仅显示 >）
const getPrompt = (isFirstLine: boolean = true): string => {
  if (isFirstLine && terminalCwd.value) {
    // 第一行显示当前工作目录
    return `${terminalCwd.value}> `
  } else {
    // 多行命令的后续行或没有目录时，只显示 >
    return '> '
  }
}

const renderConsole = () => {
  const editor = getEditor()
  if (!editor) return

  // 构建要显示的文本：所有输出行
  let text = lines.value.map((l) => l.content).join('\n')

  // 在最后添加输入行（带提示符和当前输入）
  // 命令执行期间，输入行仍然显示（但输出会追加到新行，不会追加到输入行）
  const prompt = getPrompt(!isMultiLineInput.value)
  const inputText = currentInput.value || ''
  text += (text ? '\n' : '') + prompt + inputText

  const currentValue = editor.getValue()
  const position = editor.getPosition()
  const wasAtEnd = position && position.lineNumber === editor.getModel()?.getLineCount()

  // 只有当内容真正变化时才更新编辑器，避免不必要的重渲染
  if (currentValue !== text) {
    // 保存光标位置和滚动位置
    const position = editor.getPosition()
    const scrollTop = editor.getScrollTop()
    const scrollLeft = editor.getScrollLeft()

    editor.setValue(text)

    // 将光标移动到输入行的末尾
    const model = editor.getModel()
    if (model) {
      const lineCount = model.getLineCount()
      const lastLine = model.getLineContent(lineCount)
      editor.setPosition(new monaco.Position(lineCount, lastLine.length + 1))
      // 命令执行期间，不自动滚动到底部（让用户看到输出）
      // 否则，滚动到输入行
      if (!isCommandExecuting.value) {
        editor.revealLineInCenter(lineCount)
      } else {
        // 命令执行期间，滚动到底部，显示最新输出
        editor.revealLine(lineCount, monaco.editor.ScrollType.Immediate)
      }
    }
  }

  applyDecorations(editor)
}

// 命令历史
const commandHistory = ref<string[]>([])
const historyIndex = ref(-1) // -1 表示不在历史中，正在输入新命令
const tempInputBeforeHistory = ref('') // 进入历史模式前保存的当前输入

// 当前输入的命令（用于多行命令）
const currentInput = ref('')

// 当前活动的进程 invocationId
const currentInvocationId = ref<string | null>(null)

// 是否在多行命令输入中
const isMultiLineInput = ref(false)

// 维护独立的终端工作目录（使用主进程维护的状态）
const terminalCwd = ref<string>('')

// Tab 自动补全相关状态
const tabCompletionCandidates = ref<Array<{ name: string; isDirectory: boolean }>>([])
const tabCompletionIndex = ref(-1)
const lastTabCompletionInput = ref('')

// 从主进程初始化终端 cwd
const initTerminalCwd = async () => {
  if (ipcRenderer?.invoke) {
    try {
      const cwd = (await ipcRenderer.invoke('terminal-get-cwd', {
        consoleKey: props.consoleKey,
        initialCwd: props.initialDirectory || ''
      })) as string
      terminalCwd.value = normalize(cwd) // 规范化路径
    } catch (error) {
      console.error('获取终端 cwd 失败:', error)
      terminalCwd.value = props.initialDirectory ? normalize(props.initialDirectory) : ''
    }
  } else {
    terminalCwd.value = props.initialDirectory ? normalize(props.initialDirectory) : ''
  }
}

// 初始化终端字符集
const initTerminalEncoding = async () => {
  if (ipcRenderer?.invoke) {
    try {
      // 初始化时设置默认字符集（UTF-8）
      await ipcRenderer.invoke('terminal-set-encoding', {
        consoleKey: props.consoleKey,
        encoding: terminalEncoding.value || 'utf8'
      })
    } catch (error) {
      console.error('初始化终端字符集失败:', error)
    }
  }
}

// 监听 terminalCwd 变化，确保提示符更新
watch(
  () => terminalCwd.value,
  () => {
    // 当工作目录变化时，重新渲染以确保提示符更新
    renderConsole()
  }
)

// Tab 自动补全处理函数
const handleTabCompletion = async (
  editor: monaco.editor.IStandaloneCodeEditor,
  lastWord: string,
  inputText: string,
  commandPrefix: string,
  prompt: string,
  originalUserInput: string
) => {
  if (!ipcRenderer?.invoke) return

  try {
    // 解析路径：获取目录路径和要匹配的前缀
    let normalizedPath = normalize(lastWord.replace(/\\/g, '/'))

    // 如果路径不是以 ./、../ 开头，也不是绝对路径，也没有包含 /，默认添加 ./ 前缀（当前目录）
    if (
      !normalizedPath.startsWith('./') &&
      !normalizedPath.startsWith('../') &&
      !isAbsolute(normalizedPath) &&
      !normalizedPath.includes('/') &&
      !normalizedPath.includes('\\')
    ) {
      normalizedPath = './' + normalizedPath
    }

    let targetPath: string
    const currentCwd = terminalCwd.value || props.initialDirectory || ''

    // 判断是绝对路径还是相对路径
    if (isAbsolute(normalizedPath)) {
      // 绝对路径：直接使用
      targetPath = normalizedPath
    } else {
      // 相对路径：基于当前工作目录
      targetPath = join(currentCwd, normalizedPath)
    }

    // 规范化目标路径
    targetPath = normalize(targetPath.replace(/\\/g, '/'))

    // 检查目标路径是否是目录
    let dirPath: string
    let prefix: string
    let basePath: string // 用于构建补全后的路径（相对于原始输入的路径）

    // 检查是否输入改变：如果输入没有改变且已经有候选，说明用户在切换候选，应该在父目录继续查找
    const inputChanged = lastTabCompletionInput.value !== inputText

    // 先尝试读取目标路径作为目录（如果它是目录，会成功）
    try {
      await ipcRenderer.invoke('read-directory', targetPath)
      // 如果成功，说明目标路径是目录
      // 但如果输入没有改变且有候选，说明用户在切换候选，应该使用父目录
      if (!inputChanged && tabCompletionCandidates.value.length > 0) {
        // 输入没有改变，用户在切换候选，使用父目录
        const lastSlashIndex = Math.max(targetPath.lastIndexOf('/'), targetPath.lastIndexOf('\\'))
        if (lastSlashIndex >= 0) {
          dirPath = targetPath.substring(0, lastSlashIndex + 1)
          prefix = targetPath.substring(lastSlashIndex + 1)
          // 计算相对于原始输入的 basePath
          const normalizedLastSlashIndex = normalizedPath.lastIndexOf('/')
          if (normalizedLastSlashIndex >= 0) {
            basePath = normalizedPath.substring(0, normalizedLastSlashIndex + 1)
          } else {
            basePath = ''
          }
        } else {
          dirPath = currentCwd || '/'
          prefix = normalizedPath.replace(/^\.\//, '')
          basePath = ''
        }
      } else {
        // 输入改变，或者是第一次，进入目录
        dirPath = targetPath
        prefix = ''
        basePath = normalizedPath
        if (!basePath.endsWith('/') && !basePath.endsWith('\\')) {
          basePath += '/'
        }
      }
    } catch {
      // 如果失败，说明目标路径不是目录（或不存在），在父目录下查找匹配的文件
      const lastSlashIndex = Math.max(targetPath.lastIndexOf('/'), targetPath.lastIndexOf('\\'))
      if (lastSlashIndex >= 0) {
        dirPath = targetPath.substring(0, lastSlashIndex + 1)
        prefix = targetPath.substring(lastSlashIndex + 1)
        // 计算相对于原始输入的 basePath
        const normalizedLastSlashIndex = normalizedPath.lastIndexOf('/')
        if (normalizedLastSlashIndex >= 0) {
          basePath = normalizedPath.substring(0, normalizedLastSlashIndex + 1)
        } else {
          basePath = ''
        }
      } else {
        // 没有斜杠，在当前工作目录下查找
        dirPath = currentCwd || '/'
        prefix = normalizedPath.replace(/^\.\//, '')
        basePath = ''
      }
    }

    // 规范化目录路径
    dirPath = normalize(dirPath.replace(/\\/g, '/'))
    if (!dirPath.endsWith('/') && !dirPath.endsWith('\\')) {
      dirPath += '/'
    }

    // 如果输入改变，重置补全状态
    if (lastTabCompletionInput.value !== inputText) {
      tabCompletionCandidates.value = []
      tabCompletionIndex.value = -1
      lastTabCompletionInput.value = inputText
    }

    // 如果还没有候选，获取目录内容
    if (tabCompletionCandidates.value.length === 0) {
      const entries = (await ipcRenderer.invoke('read-directory', dirPath)) as Array<{
        name: string
        path: string
        isDirectory: boolean
      }>

      // 过滤匹配前缀的项（不区分大小写）
      const matches = entries.filter((entry) =>
        entry.name.toLowerCase().startsWith(prefix.toLowerCase())
      )

      // 排序：目录在前，然后按名称排序
      matches.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })

      tabCompletionCandidates.value = matches
      tabCompletionIndex.value = -1
    }

    // 如果有匹配项，进行补全
    if (tabCompletionCandidates.value.length > 0) {
      // 切换到下一个候选（循环）
      tabCompletionIndex.value =
        (tabCompletionIndex.value + 1) % tabCompletionCandidates.value.length
      const candidate = tabCompletionCandidates.value[tabCompletionIndex.value]

      // 构建新的路径
      // 使用 basePath（相对于原始输入的路径）和候选名称构建
      let newPath: string
      if (prefix === '') {
        // 当前路径是目录，直接添加候选名称
        newPath = basePath + candidate.name
        if (candidate.isDirectory) {
          newPath += '/'
        }
      } else {
        // 当前路径不是目录，需要替换最后一个部分
        if (basePath) {
          newPath = basePath + candidate.name
        } else {
          newPath = candidate.name
        }
        if (candidate.isDirectory) {
          newPath += '/'
        }
      }

      // 确保路径以 ./ 开头（如果是相对路径且不是以 ./ 或 ../ 开头）
      if (!newPath.startsWith('./') && !newPath.startsWith('../') && !isAbsolute(newPath)) {
        newPath = './' + newPath
      }

      // 更新输入
      const newInput = commandPrefix ? commandPrefix + ' ' + newPath : newPath

      // 更新编辑器内容
      const model = editor.getModel()
      if (model) {
        const lineCount = model.getLineCount()
        const currentLineContent = model.getLineContent(lineCount)

        // 获取当前行的用户输入部分（移除提示符）
        let currentUserInput = ''
        if (currentLineContent.startsWith(prompt)) {
          currentUserInput = currentLineContent.substring(prompt.length)
        } else if (currentLineContent.startsWith('> ')) {
          currentUserInput = currentLineContent.substring(2)
        } else {
          currentUserInput = currentLineContent
        }

        // 计算替换范围：从提示符后开始，到当前用户输入结束
        const startColumn = prompt.length + 1
        const endColumn = prompt.length + currentUserInput.length + 1
        const range = new monaco.Range(lineCount, startColumn, lineCount, endColumn)

        editor.executeEdits('tab-completion', [
          {
            range,
            text: newInput
          }
        ])

        // 注意：不要设置 currentInput.value，因为：
        // 1. 编辑器内容已经通过 executeEdits 更新
        // 2. userInput 会从编辑器内容中读取（在 Enter 键处理时）
        // 3. currentInput.value 只应该用于多行命令（以 \ 结尾的命令）
        // 如果设置了 currentInput.value，会导致单行命令时 fullCommand 重复

        // 移动光标到末尾
        const newLineContent = model.getLineContent(lineCount)
        editor.setPosition(new monaco.Position(lineCount, newLineContent.length + 1))

        // 更新 lastTabCompletionInput，使用新的输入内容（下次按 Tab 时用于判断是否输入改变）
        lastTabCompletionInput.value = newInput
      }
    }
  } catch (error) {
    // 补全失败，忽略错误（不显示错误信息，避免打断用户体验）
    console.debug('Tab 补全失败:', error)
  }
}

const createEditor = async () => {
  await nextTick()
  if (!editorContainer.value) return
  setupMonacoWorker()
  await ensureConsoleFont()
  await initTerminalCwd() // 初始化终端 cwd
  await initTerminalEncoding() // 初始化终端字符集
  const editor = monaco.editor.create(editorContainer.value, {
    value: '',
    language: 'plaintext',
    theme: themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs',
    readOnly: false, // 终端总是可编辑
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    automaticLayout: true,
    contextmenu: false, // 禁用默认右键菜单，使用自定义右键菜单
    fontSize: 13,
    fontFamily:
      '"JetBrains Mono", "Consolas", "Courier New", "Microsoft YaHei Mono", "SimHei", monospace',
    renderLineHighlight: 'none',
    glyphMargin: false,
    folding: false
  })
  editorId = editor.getId()
  applyConsoleTheme()
  renderConsole()

  // 监听键盘事件
  {
    // Ctrl+C: 中断当前命令
    editor.onKeyDown((e: monaco.IKeyboardEvent) => {
      const isMac = /Mac|iPhone|iPod|iPad/i.test(navigator.platform)
      const modifierKey = isMac ? e.metaKey : e.ctrlKey

      // Ctrl+C: 发送中断信号
      if (modifierKey && e.keyCode === monaco.KeyCode.KeyC && currentInvocationId.value) {
        e.preventDefault()
        e.stopPropagation()

        if (ipcRenderer?.invoke) {
          ipcRenderer
            .invoke('terminal-send-interrupt', {
              invocationId: currentInvocationId.value
            })
            .catch((err) => {
              console.error('发送中断信号失败:', err)
            })
        }

        // 添加一个空行，显示命令已中断
        addLine('^C', 'out')
        currentInvocationId.value = null
        isMultiLineInput.value = false
        currentInput.value = ''
        historyIndex.value = -1
        renderConsole()
        return
      }
    })

    // 监听键盘事件（历史记录、输入处理）
    editor.onKeyDown(async (e: monaco.IKeyboardEvent) => {
      const position = editor.getPosition()
      const model = editor.getModel()
      if (!position || !model) return

      const lineCount = model.getLineCount()
      const isLastLine = position.lineNumber === lineCount
      const lastLineContent = model.getLineContent(lineCount)
      const prompt = getPrompt(!isMultiLineInput.value)

      // 如果不是最后一行，阻止编辑并移动到最后一行
      if (!isLastLine) {
        // 允许方向键和 PageUp/PageDown（用于滚动查看历史输出）
        if (
          e.keyCode === monaco.KeyCode.UpArrow ||
          e.keyCode === monaco.KeyCode.DownArrow ||
          e.keyCode === monaco.KeyCode.LeftArrow ||
          e.keyCode === monaco.KeyCode.RightArrow ||
          e.keyCode === monaco.KeyCode.PageUp ||
          e.keyCode === monaco.KeyCode.PageDown ||
          e.keyCode === monaco.KeyCode.Home ||
          e.keyCode === monaco.KeyCode.End
        ) {
          return // 允许导航
        }
        // 阻止其他编辑操作，移动到最后一行
        e.preventDefault()
        e.stopPropagation()
        const promptLength = prompt.length
        const inputLength = currentInput.value.length
        editor.setPosition(new monaco.Position(lineCount, promptLength + inputLength + 1))
        return
      }

      // 提取用户输入（移除提示符）
      let userInput = ''
      if (lastLineContent.startsWith(prompt)) {
        userInput = lastLineContent.substring(prompt.length)
      } else if (lastLineContent.startsWith('> ')) {
        // 兼容旧的提示符格式
        userInput = lastLineContent.substring(2)
      } else {
        userInput = lastLineContent
      }

      // 防止删除提示符
      if (position.column <= prompt.length) {
        if (
          e.keyCode === monaco.KeyCode.Backspace ||
          e.keyCode === monaco.KeyCode.Delete ||
          (e.keyCode === monaco.KeyCode.LeftArrow && !e.shiftKey)
        ) {
          e.preventDefault()
          e.stopPropagation()
          editor.setPosition(new monaco.Position(lineCount, prompt.length + 1))
          return
        }
      }

      // Tab 键：路径自动补全
      if (
        e.keyCode === monaco.KeyCode.Tab &&
        !e.shiftKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey
      ) {
        e.preventDefault()
        e.stopPropagation()

        // 获取当前输入
        const inputText = userInput.trim()
        if (!inputText) return

        // 解析输入，提取最后一个路径部分（从最后一个空格或命令开始）
        const words = inputText.split(/\s+/)
        const lastWord = words[words.length - 1] || ''
        const commandPrefix = words.slice(0, -1).join(' ')

        // 只有在有参数（lastWord 不为空）时才进行补全
        // 不能只是命令（比如 "cd" 后面没有参数）
        if (lastWord && lastWord.length > 0 && words.length > 1) {
          // 只有在最后一个词看起来像路径时才进行补全
          if (
            lastWord.includes('/') ||
            lastWord.includes('\\') ||
            lastWord.startsWith('.') ||
            isAbsolute(lastWord)
          ) {
            handleTabCompletion(editor, lastWord, inputText, commandPrefix, prompt, userInput)
          } else if (commandPrefix) {
            // 如果有命令前缀（比如 "cd"），即使 lastWord 没有路径特征，也尝试补全（默认在当前目录查找）
            handleTabCompletion(editor, lastWord, inputText, commandPrefix, prompt, userInput)
          }
        }
        return
      }

      // 上箭头：显示命令历史中的上一个命令
      if (e.keyCode === monaco.KeyCode.UpArrow && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()

        if (commandHistory.value.length > 0) {
          if (historyIndex.value === -1) {
            // 第一次按上箭头：保存当前输入（不添加到历史）
            tempInputBeforeHistory.value = currentInput.value || userInput.trim()
            historyIndex.value = commandHistory.value.length - 1
          } else if (historyIndex.value > 0) {
            historyIndex.value--
          }

          if (historyIndex.value >= 0 && historyIndex.value < commandHistory.value.length) {
            currentInput.value = commandHistory.value[historyIndex.value]
            isMultiLineInput.value = false
            renderConsole()
          }
        }
        return
      }

      // 下箭头：显示命令历史中的下一个命令
      if (e.keyCode === monaco.KeyCode.DownArrow && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()

        if (historyIndex.value >= 0) {
          if (historyIndex.value < commandHistory.value.length - 1) {
            historyIndex.value++
            currentInput.value = commandHistory.value[historyIndex.value]
            isMultiLineInput.value = false
          } else {
            // 已经到最新，恢复之前保存的输入
            historyIndex.value = -1
            currentInput.value = tempInputBeforeHistory.value
            tempInputBeforeHistory.value = ''
            isMultiLineInput.value = false
          }
          renderConsole()
        }
        return
      }

      // Enter 键：发送输入或继续多行输入
      if (e.keyCode === monaco.KeyCode.Enter && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()

        // 重置历史索引（执行命令后退出历史模式）
        historyIndex.value = -1
        tempInputBeforeHistory.value = ''

        // 重置 Tab 补全状态
        tabCompletionCandidates.value = []
        tabCompletionIndex.value = -1
        lastTabCompletionInput.value = ''

        if (userInput.trim()) {
          // 检查是否是多行命令（以反斜杠结尾表示继续）
          const isLineContinuation = userInput.trim().endsWith('\\')

          if (isLineContinuation) {
            // 多行命令：继续输入
            currentInput.value +=
              (currentInput.value ? '\n' : '') + userInput.slice(0, -1).trimEnd()
            isMultiLineInput.value = true

            // 显示输入的命令行（作为输出行）
            lines.value.push({ id: lineId++, content: prompt + userInput, type: 'out' })

            // 渲染新的输入行
            renderConsole()
          } else {
            // 单行或多行命令完成：执行命令
            // 注意：只有在多行命令模式下，currentInput.value 才有值；单行命令时，currentInput.value 应该为空
            const fullCommand = currentInput.value
              ? currentInput.value + '\n' + userInput.trim()
              : userInput.trim()

            // 添加到命令历史（只有在历史中不存在时才添加，避免重复）
            if (
              fullCommand.trim() &&
              (commandHistory.value.length === 0 ||
                commandHistory.value[commandHistory.value.length - 1] !== fullCommand)
            ) {
              commandHistory.value.push(fullCommand)
              // 限制历史记录数量
              if (commandHistory.value.length > 100) {
                commandHistory.value.shift()
              }
            }

            // 处理 cd 命令（切换工作目录）
            // 规范化命令：将多行命令合并为单行，多个空格合并为一个空格
            const normalizedCommand = fullCommand.replace(/\s+/g, ' ').trim()
            const lowerCommand = normalizedCommand.toLowerCase()

            // 检查是否是 cd 命令（必须是 "cd" 或 "cd " 开头）
            if (lowerCommand === 'cd' || lowerCommand.startsWith('cd ')) {
              // 显示输入的命令（作为输出行）
              lines.value.push({ id: lineId++, content: prompt + userInput, type: 'out' })

              // 解析 cd 命令参数
              let targetPath: string | null = null

              if (lowerCommand === 'cd') {
                // cd 不带参数：切换到初始目录（文档所在目录）
                targetPath = props.initialDirectory || ''
              } else {
                // cd 带参数：提取路径
                // 使用更严格的匹配：匹配 "cd" 后面跟着一个或多个空格，然后是路径
                const cdMatch = normalizedCommand.match(/^cd\s+(.+)$/)
                if (cdMatch && cdMatch[1]) {
                  targetPath = cdMatch[1].trim()
                  // 去除首尾引号（如果存在）
                  if (
                    (targetPath.startsWith('"') && targetPath.endsWith('"')) ||
                    (targetPath.startsWith("'") && targetPath.endsWith("'"))
                  ) {
                    targetPath = targetPath.slice(1, -1).trim()
                  }
                }
              }

              // 执行 cd 命令
              if (targetPath !== null && targetPath !== '') {
                // 调用主进程更新 cwd（主进程会处理相对路径解析和路径验证）
                if (ipcRenderer?.invoke) {
                  try {
                    const result = (await ipcRenderer.invoke('terminal-set-cwd', {
                      consoleKey: props.consoleKey,
                      cwd: targetPath
                    })) as { success: boolean; error?: string; resolvedPath?: string }

                    if (result && result.success && result.resolvedPath) {
                      // 成功：更新本地状态（使用主进程解析后的路径）
                      terminalCwd.value = normalize(result.resolvedPath)
                    } else {
                      // 失败：显示错误信息（标准格式：cd: 路径: 错误信息）
                      const errorMsg = result?.error || '无法切换目录'
                      lines.value.push({
                        id: lineId++,
                        content: `cd: ${targetPath}: ${errorMsg}`,
                        type: 'err'
                      })
                    }
                  } catch (err) {
                    const errorMsg = err instanceof Error ? err.message : '无法切换目录'
                    lines.value.push({
                      id: lineId++,
                      content: `cd: ${targetPath}: ${errorMsg}`,
                      type: 'err'
                    })
                  }
                } else {
                  // 非 Electron 环境：直接更新本地状态（不验证路径）
                  terminalCwd.value = normalize(targetPath)
                }

                // 重置状态并返回（不发送到终端执行）
                isMultiLineInput.value = false
                currentInput.value = ''
                await nextTick()
                renderConsole()
                return
              } else {
                // cd 命令参数为空或格式错误
                lines.value.push({ id: lineId++, content: `cd: 无效的参数`, type: 'err' })
                // 重置状态并返回（不发送到终端执行）
                isMultiLineInput.value = false
                currentInput.value = ''
                await nextTick()
                renderConsole()
                return
              }
            }

            // 非 cd 命令：正常执行
            // 重置状态（先清空输入）
            isMultiLineInput.value = false
            currentInput.value = ''

            // 标记命令开始执行（输出应该追加到新行，而不是追加到最后一行）
            // 必须在显示命令之前设置，确保后续输出正确追加到新行
            isCommandExecuting.value = true

            // 显示输入的命令（作为输出行）- 此时 isCommandExecuting 为 true，后续输出会追加到新行
            lines.value.push({ id: lineId++, content: prompt + userInput, type: 'out' })

            // 渲染，显示命令和输入行（此时 isCommandExecuting 为 true，但输入行应该显示）
            renderConsole()

            // 发送输入事件（异步执行命令）
            // 注意：isCommandExecuting 已经在上面设置为 true，所以后续输出会追加到新行
            // 不传递 currentDirectory，主进程会使用维护的 cwd
            eventBus.emit('console-input', {
              key: props.consoleKey,
              content: fullCommand
            })
          }
        } else {
          // 空输入，只换行显示提示符
          addLine(prompt, 'out')
          currentInput.value = ''
          isMultiLineInput.value = false
          renderConsole()
        }
        return
      }
    })

    // 监听内容变化，同步当前输入
    editor.onDidChangeModelContent(() => {
      const model = editor.getModel()
      if (!model) return

      const lineCount = model.getLineCount()
      const lastLine = model.getLineContent(lineCount)
      const prompt = getPrompt(!isMultiLineInput.value)

      // 提取用户输入（移除提示符）
      let userInput = ''
      if (lastLine.startsWith(prompt)) {
        userInput = lastLine.substring(prompt.length)
      } else if (lastLine.startsWith('> ')) {
        userInput = lastLine.substring(2)
      } else {
        userInput = lastLine
      }

      // 更新当前输入（只有在最后一行时才更新）
      // 注意：这里不应该在单行命令时设置 currentInput.value，因为单行命令应该使用 userInput
      // currentInput.value 只应该在多行命令（以 \ 结尾）时使用
      const position = editor.getPosition()
      if (position && position.lineNumber === lineCount) {
        // 不要在单行命令时设置 currentInput.value，因为这样会导致 fullCommand 重复
        // currentInput.value 应该只在多行命令模式下使用
        // 单行命令时，currentInput.value 应该保持为空
        // 这里注释掉，因为单行命令不应该设置 currentInput.value
        // currentInput.value = userInput;
      }
    })

    // 自定义右键菜单：复制和粘贴
    editor.onContextMenu(async (e: monaco.editor.IEditorMouseEvent) => {
      e.event.preventDefault()
      e.event.stopPropagation()
      const selection = editor.getSelection()
      const position = editor.getPosition()
      if (!selection || !position) return

      // 如果有选中文本，复制并取消选中
      if (!selection.isEmpty()) {
        const selectedText = editor.getModel()?.getValueInRange(selection) || ''
        if (selectedText) {
          try {
            await navigator.clipboard.writeText(selectedText)
            // 取消选中
            editor.setSelection(
              new monaco.Selection(
                selection.startLineNumber,
                selection.startColumn,
                selection.startLineNumber,
                selection.startColumn
              )
            )
          } catch (err) {
            console.error('复制失败:', err)
          }
        }
      } else {
        // 如果没有选中文本，粘贴剪贴板内容到当前光标位置（如果是在输入行）
        const model = editor.getModel()
        if (!model) return

        const lineCount = model.getLineCount()
        const isLastLine = position.lineNumber === lineCount

        if (isLastLine) {
          try {
            const clipboardText = await navigator.clipboard.readText()
            if (clipboardText) {
              // 获取当前行的提示符
              const lastLine = model.getLineContent(lineCount)
              const prompt = getPrompt(!isMultiLineInput.value)

              // 计算光标位置（减去提示符长度）
              const cursorInInput = Math.max(0, position.column - prompt.length - 1)

              // 更新当前输入（在光标位置插入剪贴板内容）
              const inputText = currentInput.value || ''
              const beforeCursor = inputText.substring(0, cursorInInput)
              const afterCursor = inputText.substring(cursorInInput)
              currentInput.value = beforeCursor + clipboardText + afterCursor

              // 重新渲染并移动光标
              renderConsole()

              // 移动光标到插入位置之后
              const editorModel = editor.getModel()
              if (editorModel) {
                const newLineCount = editorModel.getLineCount()
                const newCursorCol = prompt.length + beforeCursor.length + clipboardText.length + 1
                editor.setPosition(new monaco.Position(newLineCount, newCursorCol))
              }
            }
          } catch (err) {
            console.error('粘贴失败:', err)
          }
        }
      }
    })
  }
}

const applyHistory = (history: HistoryLine[]) => {
  const initialLines = history.map((historyLine) => ({
    id: lineId++,
    content: historyLine.content,
    type: normalizeType(historyLine.type, 'out')
  }))
  lines.value = initialLines
  renderConsole()
}

applyHistory(props.history)

watch(
  () => props.history,
  (newHistory) => {
    lineId = 0
    applyHistory(newHistory)
  }
)

eventBus.on('sync-editor-theme', async () => {
  consoleStyle.value = {
    '--console-bg': themeState.currentTheme.editorPanelBackgroundColor,
    '--console-text': themeState.currentTheme.textColor2,
    '--console-err': '#fe8771',
    '--console-warn': '#e6a23c',
    '--console-debug': '#909399'
  }
  applyConsoleTheme()
})

const addLine = (content: string, type: ConsoleLineType = 'out') => {
  // 如果内容包含换行符，需要分割成多行
  if (content.includes('\n')) {
    const parts = content.split('\n')
    // 添加所有部分，但忽略最后一个空字符串（如果内容以换行符结尾）
    for (let i = 0; i < parts.length; i++) {
      // 如果是最后一部分且为空字符串，忽略它（避免多一个空行）
      if (i === parts.length - 1 && parts[i] === '' && parts.length > 1) {
        continue
      }
      lines.value.push({ id: lineId++, content: parts[i], type })
    }
  } else {
    // 没有换行符，直接添加一行
    lines.value.push({ id: lineId++, content, type })
  }
  renderConsole()
}

// 标记是否有正在执行的命令（用于控制输出是否应该追加到新行）
const isCommandExecuting = ref(false)

// 处理命令执行完成事件，重置执行状态
const handleCommandFinished = (payload: any) => {
  if (payload && payload.key === props.consoleKey) {
    isCommandExecuting.value = false
  }
}

// 追加内容到当前行（如果内容包含换行符，会分割成多行）
// 如果正在执行命令，输出应该追加到新行而不是最后一行（命令行）
const appendToLastLine = (content: string, type: ConsoleLineType = 'out') => {
  if (lines.value.length === 0) {
    // 如果没有行，创建第一行
    addLine(content, type)
    return
  }

  // 关键修复：如果正在执行命令，输出应该添加到新行，而不是追加到最后一行（命令行）
  // 这样可以确保命令输出显示在命令行的下一行，而不是覆盖命令行
  if (isCommandExecuting.value) {
    // 命令执行中的输出，应该添加为新行（追加到 lines.value，而不是追加到最后一行的内容）
    // 如果内容包含换行符，分割成多行
    if (content.includes('\n')) {
      const parts = content.split('\n')
      // 添加所有部分，但忽略最后一个空字符串（如果内容以换行符结尾）
      for (let i = 0; i < parts.length; i++) {
        // 如果是最后一部分且为空字符串，忽略它（避免多一个空行）
        if (i === parts.length - 1 && parts[i] === '' && parts.length > 1) {
          continue
        }
        lines.value.push({ id: lineId++, content: parts[i], type })
      }
    } else {
      // 没有换行符，直接添加为新行
      lines.value.push({ id: lineId++, content, type })
    }
    renderConsole()
    return
  }

  // 非命令执行期间的追加操作（通常不会到达这里，因为启用输入时通常不会追加）
  // 检查内容是否包含换行符
  const hasNewline = content.includes('\n')
  if (!hasNewline) {
    // 没有换行符，直接追加到最后一行
    const lastLine = lines.value[lines.value.length - 1]
    lastLine.content += content
    renderConsole()
  } else {
    // 包含换行符，需要分割处理
    const parts = content.split('\n')
    // 第一部分追加到当前行
    if (parts[0]) {
      const lastLine = lines.value[lines.value.length - 1]
      lastLine.content += parts[0]
    }
    // 中间部分创建新行
    for (let i = 1; i < parts.length - 1; i++) {
      if (parts[i]) {
        lines.value.push({ id: lineId++, content: parts[i], type })
      } else {
        // 空行
        lines.value.push({ id: lineId++, content: '', type })
      }
    }
    // 最后一部分作为新行的开始（如果存在）
    if (parts.length > 1 && parts[parts.length - 1]) {
      lines.value.push({ id: lineId++, content: parts[parts.length - 1], type })
    }
    renderConsole()
  }
}

const clearConsole = () => {
  lines.value = []
  const editor = getEditor()
  if (editor) {
    decorationIds = editor.deltaDecorations(decorationIds, [])
    editor.setValue('')
  }
}

const copyConsole = () => {
  const text = lines.value.map((l) => l.content).join('\n')
  navigator.clipboard.writeText(text).then(() => {
    eventBus.emit('show-success', t('console.copiedToClipboard'))
  })
}

const saveConsole = async () => {
  const text = lines.value.map((l) => l.content).join('\n')

  try {
    if (!ipcRenderer) {
      // 如果没有IPC，使用浏览器下载方式（降级方案）
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

    // 使用IPC调用保存对话框
    const result = (await ipcRenderer.invoke('save-file-dialog', {
      defaultName: `console-${props.consoleKey}.log`,
      filters: [
        { name: 'Log Files', extensions: ['log', 'txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })) as { canceled?: boolean; filePath?: string }

    if (result.canceled || !result.filePath) {
      return // 用户取消了保存
    }

    // 写入文件（使用write-file-content IPC handler）
    await ipcRenderer.invoke('write-file-content', {
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

const resolvePayload = (payload: unknown, fallbackType: ConsoleLineType, requireContent = true) => {
  if (payload === null || payload === undefined) {
    return null
  }

  if (typeof payload === 'string') {
    const keyMatch = props.consoleKey
    if (!requireContent || payload.length > 0) {
      return {
        key: keyMatch,
        content: payload,
        type: fallbackType,
        append: false
      }
    }
    return null
  }

  if (typeof payload === 'object') {
    const obj = payload as ConsolePayload
    const key = obj.key ?? obj.console_key ?? obj.consoleKey ?? props.consoleKey
    if (key !== props.consoleKey) {
      return null
    }

    const content = obj.content ?? obj.message ?? obj.text ?? ''
    if (requireContent && !content) {
      return null
    }

    return {
      key,
      content,
      type: normalizeType(obj.type, fallbackType),
      append: obj.append ?? false
    }
  }

  return null
}

// 终端编码（用于字符集切换）
const terminalEncoding = ref<string>('utf8')

// 处理编码切换
const handleEncodingChange = async (encoding: string) => {
  terminalEncoding.value = encoding

  // 调用主进程设置字符集（影响新的输出）
  if (ipcRenderer?.invoke) {
    try {
      await ipcRenderer.invoke('terminal-set-encoding', {
        consoleKey: props.consoleKey,
        encoding: encoding
      })
    } catch (error) {
      console.error('设置终端字符集失败:', error)
    }
  }

  // 编码切换主要影响新的输出，已显示的输出不会改变
}

// 去除 ANSI 转义码（用于修复中文乱码问题）
const stripAnsiCodes = (text: string): string => {
  if (!text || typeof text !== 'string') return text

  // 匹配所有 ANSI 转义码序列
  // 包括：
  // - CSI (Control Sequence Introducer): ESC [ ... [0-9;]*[A-Za-z] (颜色、样式、光标控制等)
  // - ESC 后跟单个字符的序列
  // - ESC 后跟两个字符的序列
  // - 其他控制字符（但保留换行符 \n 和回车符 \r）
  let cleaned = text
    // 去除所有 CSI 序列（最全面的匹配）
    // 匹配 ESC[ 后跟可选参数（数字、分号）和命令字符
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    // 去除 ESC 后跟单个字符的序列（如 ESC M - 反向换行）
    .replace(/\u001b[\x40-\x5F]/g, '')
    .replace(/\x1b[\x40-\x5F]/g, '')
    // 去除 ESC 后跟两个字符的序列（如 ESC #3 - 双宽字符）
    .replace(/\u001b[\x23-\x2F][\x30-\x7E]/g, '')
    .replace(/\x1b[\x23-\x2F][\x30-\x7E]/g, '')
    // 去除 ESC 后跟其他字符（备用处理）
    .replace(/\u001b[\x20-\x2F]*[\x30-\x7E]/g, '')
    .replace(/\x1b[\x20-\x2F]*[\x30-\x7E]/g, '')
    // 去除其他控制字符（但保留换行符 \n (0x0A) 和回车符 \r (0x0D)）
    .replace(/[\x00-\x09\x0B-\x0C\x0E-\x1F\x7F]/g, '')

  return cleaned
}

const handleOutPayload = (payload: unknown, fallbackType: ConsoleLineType) => {
  const resolved = resolvePayload(payload, fallbackType)
  if (!resolved) return

  // 去除 ANSI 转义码（修复中文乱码）
  const cleanedContent = stripAnsiCodes(resolved.content)

  // 优先根据消息内容检测类型（兜底判断：开头是 error 或 warning）
  const detectedType = detectTypeFromContent(cleanedContent)

  // 如果内容检测到类型，使用检测到的类型；否则使用 payload 中的类型或 fallbackType
  let finalType: ConsoleLineType
  if (detectedType !== null) {
    // 内容检测到类型，优先使用
    finalType = detectedType
  } else {
    // 内容未检测到，使用 payload 中的类型或 fallbackType
    finalType = normalizeType(resolved.type, fallbackType)
  }

  // 根据 append 标志决定是追加还是新建行
  // 关键修复：如果正在执行命令，即使 append 为 true，也应该添加为新行（确保输出不覆盖命令行）
  if (resolved.append && !isCommandExecuting.value) {
    // 非命令执行期间的追加操作
    appendToLastLine(cleanedContent, finalType)
  } else {
    // 命令执行期间的输出或明确要求新建行：添加到新行
    addLine(cleanedContent, finalType)
  }
}

const handleClearPayload = (payload: unknown) => {
  if (payload === undefined || payload === null) {
    clearConsole()
    return
  }
  const resolved = resolvePayload(payload, 'out', false)
  if (!resolved) {
    // 如果 key 不匹配则忽略
    return
  }
  clearConsole()
}

const onConsoleOut = (_event: unknown, data: unknown) => handleOutPayload(data, 'out')
const onConsoleErr = (_event: unknown, data: unknown) => handleOutPayload(data, 'err')
const onEventBusConsoleOut = (data: unknown) => handleOutPayload(data, 'out')
const onEventBusConsoleErr = (data: unknown) => handleOutPayload(data, 'err')
const onEventBusClear = (data: unknown) => handleClearPayload(data)

// 滚动到底部
const scrollToBottom = () => {
  const editor = getEditor()
  if (!editor) return
  const model = editor.getModel()
  if (!model) return
  const lineCount = model.getLineCount()
  if (lineCount > 0) {
    editor.revealLine(lineCount, monaco.editor.ScrollType.Immediate)
  }
}

// 处理滚动到底部事件
const handleScrollToBottom = (payload: unknown) => {
  if (typeof payload === 'object' && payload !== null) {
    const obj = payload as { key?: string; consoleKey?: string }
    const key = obj.key ?? obj.consoleKey ?? props.consoleKey
    if (key === props.consoleKey) {
      scrollToBottom()
    }
  } else if (payload === undefined || payload === null) {
    // 如果没有指定 key，也执行滚动（兼容性）
    scrollToBottom()
  }
}

onMounted(() => {
  createEditor()
  eventBus.on('console-out', onEventBusConsoleOut)
  eventBus.on('console-err', onEventBusConsoleErr)
  eventBus.on('clear-console', onEventBusClear)
  eventBus.on('console-command-finished', handleCommandFinished)
  eventBus.on('console-scroll-to-bottom', handleScrollToBottom)
  if (ipcRenderer) {
    ipcRenderer.on('console-out', onConsoleOut)
    ipcRenderer.on('console-err', onConsoleErr)
  }
})

onBeforeUnmount(() => {
  eventBus.off('console-out', onEventBusConsoleOut)
  eventBus.off('console-err', onEventBusConsoleErr)
  eventBus.off('clear-console', onEventBusClear)
  eventBus.off('console-command-finished', handleCommandFinished)
  eventBus.off('console-scroll-to-bottom', handleScrollToBottom)
  const editor = getEditor()
  if (editor) {
    editor.dispose()
  }
  editorId = null
  decorationIds = []
  if (ipcRenderer) {
    ipcRenderer.removeListener('console-out', onConsoleOut)
    ipcRenderer.removeListener('console-err', onConsoleErr)
  }
})
</script>

<style scoped>
.console-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background-color: var(--console-bg);
  color: var(--console-text);
  font-size: 13px;
  overflow: hidden;
}

.console-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px;
  border-bottom: 1px solid #9a9a9a41;
  flex-shrink: 0;
}

.console-title {
  user-select: none;
}

.console-actions button {
  margin-left: 5px;
}

.console-editor {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

:deep(.monaco-editor),
:deep(.monaco-editor .margin) {
  background-color: var(--console-bg) !important;
}

:deep(.monaco-editor .view-overlays .current-line) {
  background-color: transparent !important;
}

:deep(.console-inline-err) {
  color: var(--console-err) !important;
}

:deep(.console-inline-warn) {
  color: var(--console-warn) !important;
}
</style>
