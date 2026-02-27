<template>
  <div class="main-container">
    <div class="content-container">
      <!-- 搜索替换菜单 -->
      <SearchReplaceMenu
        v-if="searchReplaceDialogVisible"
        :adapter="textEditorAdapter"
        :position="SRMenuPosition"
        @close="handleSearchReplaceClose"
      />

      <!-- 右键菜单组件 -->
      <ContextMenu
        :x="menuX"
        :y="menuY"
        :items="articleContextMenuItems"
        v-if="contextMenuVisible"
        @trigger="handleMenuClick"
        class="context-menu"
        @close="contextMenuVisible = false"
      />
      <AISuggestionGhost
        :key="editorKey"
        :editorId="editorId"
        format="txt"
        @accepted="onAcceptSuggestion"
        @cancelled="onCancelSuggestion"
      />

      <div class="plaintext-layout">
        <div class="plaintext-main" ref="mainContainerRef">
          <div
            class="toolbar"
            :style="{
              backgroundColor: themeState.currentTheme.editorToolbarBackgroundColor
            }"
          >
            <Tooltip>
              <TooltipTrigger as-child>
                <div class="toolbar-icon" @click="undo">
                  <ArrowLeft class="w-4 h-4" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {{ $t('plaintextEditor.toolbar.undo') }}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger as-child>
                <div class="toolbar-icon" @click="redo">
                  <ArrowRight class="w-4 h-4" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {{ $t('plaintextEditor.toolbar.redo') }}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger as-child>
                <div class="toolbar-icon" @click="zoomIn">
                  <ZoomIn class="w-4 h-4" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {{ $t('plaintextEditor.toolbar.zoomIn') }}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger as-child>
                <div class="toolbar-icon" @click="zoomOut">
                  <ZoomOut class="w-4 h-4" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {{ $t('plaintextEditor.toolbar.zoomOut') }}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger as-child>
                <div class="toolbar-icon" @click="toggleRowNumber">
                  <icon name="numbers-1" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {{ $t('plaintextEditor.toolbar.toggleLineNumbers') }}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger as-child>
                <div class="toolbar-icon" @click="toggleMinimap">
                  <FileText class="w-4 h-4" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {{ $t('plaintextEditor.toolbar.toggleMinimap') }}
              </TooltipContent>
            </Tooltip>

            <Divider direction="vertical" />

            <Tooltip>
              <TooltipTrigger as-child>
                <div class="toolbar-icon" @click="toggleConsole">
                  <icon name="terminal-rectangle" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {{ $t('plaintextEditor.toolbar.showConsole') }}
              </TooltipContent>
            </Tooltip>
          </div>
          <div class="editor-console-container" ref="editorConsoleContainerRef">
            <div class="editor-wrapper" :class="{ 'console-visible': showConsole }">
              <div
                class="editor"
                :key="editorKey"
                :id="editorDomId"
                ref="editorEl"
                @contextmenu.prevent="openContextMenu($event)"
              ></div>
            </div>
            <div v-if="showConsole" class="console-resizer" @mousedown="startResizeConsole"></div>
            <div
              v-show="showConsole"
              class="console-wrapper"
              :style="{ height: consoleHeight + 'px' }"
            >
              <div
                class="console-panel"
                :style="{
                  background: themeState.currentTheme.background
                }"
              >
                <ConsoleTerminal
                  console-key="plaintext"
                  :show-ai-analysis="false"
                  :initial-directory="getCurrentDirectory()"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  reactive,
  onMounted,
  onBeforeUnmount,
  nextTick,
  computed,
  watch,
  onUnmounted,
  shallowRef
} from 'vue'
import { ElButton, ElScrollbar } from 'element-plus'
import { Icon } from 'tdesign-icons-vue-next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { Divider } from '@renderer/components/ui/separator'

import '../assets/aero-div.css'
import '../assets/aero-btn.css'
import '../assets/aero-input.css'
import eventBus, { getWindowType } from '../utils/event-bus'
import SearchReplaceMenu from '../components/SearchReplaceMenu.vue'
import { themeState, mixColors } from '../utils/themes'
import { getSetting, setSetting } from '../utils/settings'
import { useI18n } from 'vue-i18n'
import AISuggestionGhost from '../components/AISuggestionGhost.vue'
import { aiCompletionService } from '../utils/ai-completion-service'
import { MonacoEditorAdapter } from '../utils/editor-adapters'
import '../assets/ai-suggestion.css'
import { getArticleContextMenuItems } from '../components/contextMenus/ArticleContextMenu'
import ContextMenu from '../components/ContextMenu.vue'
import ConsoleTerminal from '../components/ConsoleTerminal.vue'
import { ElLoading } from 'element-plus'
import { createRendererLogger } from '../utils/logger.ts'
import { waitForService } from '../utils/service-status.ts'
import * as monaco from 'monaco-editor'
import { useWorkspace } from '../stores/workspace'
import { ArrowLeft, ArrowRight, ZoomIn, ZoomOut, FileText } from 'lucide-vue-next'
import { debounce } from 'lodash'
import { createMonacoAdapter } from '../editor/monaco-adapter'
import { setupMonacoWorker } from '../utils/monaco-worker-config'
import { getMonacoLanguage } from '../utils/format-initializer'
import messageBridge from '../bridge/message-bridge'

const { t } = useI18n()
const logger = createRendererLogger('PlainTextEditor', {
  windowTypeProvider: () => getWindowType()
})

const props = defineProps({
  tabId: {
    type: String,
    default: ''
  },
  active: {
    type: Boolean,
    default: true
  },
  editorDomId: {
    type: String,
    default: 'plaintext-editor'
  }
})

const isActive = computed(() => props.active)

const workspace = useWorkspace()
const documentRef = computed(() => workspace.ensureDocument(props.tabId))

// 纯文本内容存储在 markdown 字段中（作为普通文本处理）
const currentText = computed({
  get: () => documentRef.value.markdown ?? '',
  set: (val) => {
    if (val === documentRef.value.markdown) return
    workspace.updateDocumentMarkdown(props.tabId, val)
  }
})

const currentPath = computed(() => documentRef.value.path || '')

// 获取当前目录（用于 Console 的提示符）
const getCurrentDirectory = (): string => {
  if (!currentPath.value) return ''
  try {
    // 使用简单的路径处理，避免循环依赖
    const pathParts = currentPath.value.replace(/\\/g, '/').split('/')
    if (pathParts.length > 1) {
      pathParts.pop() // 移除文件名
      return pathParts.join('/') || '/'
    }
    return ''
  } catch {
    return ''
  }
}

// 状态变量
const searchReplaceDialogVisible = ref(false)
const editor = ref<monaco.editor.IStandaloneCodeEditor | null>(null)
const articleContextMenuItems = ref<any[]>([])
const textEditorAdapter = shallowRef<any>(null)

const loadingInstance = ElLoading.service({ fullscreen: false })

const getDefaultSearchMenuPosition = () => {
  if (typeof window === 'undefined') {
    return { top: 24, left: 24 }
  }
  const margin = 24
  return {
    top: margin,
    left: margin
  }
}
const SRMenuPosition = ref(getDefaultSearchMenuPosition())
const updateSearchMenuPosition = () => {
  SRMenuPosition.value = getDefaultSearchMenuPosition()
}
const contextMenuVisible = ref(false)
const menuX = ref(0)
const menuY = ref(0)

const handleSearchReplaceClose = () => {
  searchReplaceDialogVisible.value = false
}

const editorEl = ref<HTMLElement | null>(null)
const editorKey = ref(Date.now())
const mainContainerRef = ref<HTMLElement | null>(null)

// 增量同步缓存
let textBuffer = currentText.value

// 标记是否正在从外部更新编辑器（避免循环更新）
let isUpdatingFromExternal = false

// 获取当前激活的 Monaco 编辑器（始终从全局获取）
const getActiveMonacoEditor = () => {
  const editors = monaco.editor.getEditors()
  const byId = editorId.value ? editors.find((e) => e.getId?.() === editorId.value) : undefined
  return byId || editors[0] || editor.value
}

const undo = () => editor.value?.trigger('keyboard', 'undo', null)
const redo = () => editor.value?.trigger('keyboard', 'redo', null)
const zoomIn = () => {
  if (!editor.value) return
  const currentFontSize = editor.value.getOption(monaco.editor.EditorOption.fontSize)
  editor.value.updateOptions({ fontSize: currentFontSize + 1 })
}
const zoomOut = () => {
  if (!editor.value) return
  const currentFontSize = editor.value.getOption(monaco.editor.EditorOption.fontSize)
  editor.value.updateOptions({ fontSize: currentFontSize - 1 })
}
let enableMinimap = true
let enableRowNumber = true

// 从用户设置中读取行号显示偏好
const loadLineNumberSetting = async () => {
  try {
    const lineNumberSetting = await getSetting('lineNumber')
    // lineNumber 设置可能是 true/false 或 'on'/'off'，也可能是 undefined
    if (typeof lineNumberSetting === 'boolean') {
      enableRowNumber = lineNumberSetting
    } else if (typeof lineNumberSetting === 'string') {
      enableRowNumber = lineNumberSetting === 'on' || lineNumberSetting === 'true'
    } else if (lineNumberSetting === undefined || lineNumberSetting === null) {
      // 如果设置不存在，使用默认值 true（显示行号）
      enableRowNumber = true
    }
  } catch (error) {
    logger.warn('读取行号设置失败，使用默认值', error)
    enableRowNumber = true // 默认显示行号
  }
}

const toggleMinimap = () => {
  if (!editor.value) return
  enableMinimap = !enableMinimap
  editor.value.updateOptions({
    minimap: { enabled: enableMinimap }
  })
}
const toggleRowNumber = async () => {
  if (!editor.value) return
  enableRowNumber = !enableRowNumber
  editor.value.updateOptions({
    lineNumbers: enableRowNumber ? 'on' : 'off'
  })
  // 保存用户偏好
  await setSetting('lineNumber', enableRowNumber)
}

const showConsole = ref(false)
const consoleHeight = ref(200)
const editorConsoleContainerRef = ref<HTMLElement | null>(null)
let isResizingConsole = false
let resizeStartY = 0
let resizeStartHeight = 0

function startResizeConsole(e: MouseEvent) {
  if (!showConsole.value || !editorConsoleContainerRef.value) return

  // 检查事件目标，确保是在 console-resizer 上
  const target = e.target as HTMLElement
  if (!target || !target.classList.contains('console-resizer')) {
    return // 如果不是在 console-resizer 上，不处理，让事件继续冒泡
  }

  e.preventDefault()
  e.stopPropagation()
  isResizingConsole = true
  resizeStartY = e.clientY
  resizeStartHeight = consoleHeight.value
  // 确保初始高度有效
  if (resizeStartHeight < 100) {
    resizeStartHeight = 200
    consoleHeight.value = 200
  }
  document.addEventListener('mousemove', onResizingConsole)
  document.addEventListener('mouseup', stopResizeConsole)
  // 防止文本选择
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'row-resize'
}

function onResizingConsole(e: MouseEvent) {
  if (!isResizingConsole || !editorConsoleContainerRef.value) return
  e.preventDefault()
  e.stopPropagation()

  // 计算新的高度：从初始高度减去鼠标移动的距离（向上拖拽增加高度，向下拖拽减少高度）
  const deltaY = resizeStartY - e.clientY // 向上为正，向下为负
  const newHeight = resizeStartHeight + deltaY

  // 获取容器尺寸
  const containerRect = editorConsoleContainerRef.value.getBoundingClientRect()
  const containerHeight = containerRect.height

  // 限制高度范围：最小100px，最大为容器高度的80%
  const minHeight = 100
  const maxHeight = Math.max(containerHeight * 0.8, minHeight)

  // 确保高度在有效范围内
  const clampedHeight = Math.max(minHeight, Math.min(newHeight, maxHeight))

  // 只有当新高度有效时才更新
  if (clampedHeight >= minHeight && clampedHeight <= maxHeight) {
    consoleHeight.value = clampedHeight

    // 在 resize 过程中，确保 Console 滚动到底部
    nextTick(() => {
      scrollConsoleToBottom()
    })
  }
}

function stopResizeConsole() {
  if (!isResizingConsole) return
  isResizingConsole = false
  document.removeEventListener('mousemove', onResizingConsole)
  document.removeEventListener('mouseup', stopResizeConsole)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''

  // 确保最终高度有效
  if (consoleHeight.value < 100) {
    consoleHeight.value = 200
  }

  // resize 结束后，确保 Console 滚动到底部
  nextTick(() => {
    scrollConsoleToBottom()
  })
}

// 滚动 Console 到底部
function scrollConsoleToBottom() {
  // 通过 eventBus 通知 ConsoleTerminal 组件滚动到底部
  eventBus.emit('console-scroll-to-bottom', { key: 'plaintext' })
}

const toggleConsole = async () => {
  showConsole.value = !showConsole.value
}

const editorDomId = computed(() => props.editorDomId || 'plaintext-editor')

/** 从 CSS 变量读取当前编辑器字体（与设置页「编辑器字体」一致） */
function getEditorFontFamily(): string {
  if (typeof document === 'undefined') return "'Fira Code', 'OPPO Sans 4.0', sans-serif"
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue('--font-family-editor')
    .trim()
  return v || "'Fira Code', 'OPPO Sans 4.0', sans-serif"
}

let handleFontSettingsChanged: (() => void) | null = null

// 监听内容变化
watch(
  () => currentText.value,
  (incoming) => {
    const nextValue = incoming ?? ''
    textBuffer = nextValue
    if (!isActive.value) return
    const monacoEditor = getActiveMonacoEditor()
    if (!monacoEditor) return

    const editorContent = monacoEditor.getValue()

    if (editorContent !== nextValue) {
      isUpdatingFromExternal = true

      try {
        const position = monacoEditor.getPosition()
        monacoEditor.setValue(nextValue)
        if (position) {
          monacoEditor.setPosition(position)
          monacoEditor.revealLineInCenter(position.lineNumber)
        }
        logger.debug('PlainTextEditor: 已同步外部文件修改到Monaco编辑器')
      } catch (error) {
        logger.error('PlainTextEditor: 同步外部文件修改失败', error)
      } finally {
        setTimeout(() => {
          isUpdatingFromExternal = false
        }, 0)
      }
    }
  }
)

watch(
  () => props.active,
  (active) => {
    if (!editor.value) return
    if (!active) {
      textBuffer = currentText.value ?? ''
      return
    }
  },
  { immediate: true }
)

watch(currentPath, async (path) => {
  // 路径变化时，可能需要更新语言模式
  if (editor.value && path) {
    const language = getMonacoLanguage('txt', path)
    const model = editor.value.getModel()
    if (model) {
      monaco.editor.setModelLanguage(model, language)
    }
  }
})

// 打开右键菜单
const openContextMenu = (event: MouseEvent) => {
  event.preventDefault()
  menuX.value = event.clientX
  menuY.value = event.clientY
  contextMenuVisible.value = true
}

// 菜单项点击事件处理
const handleMenuClick = async (item: string) => {
  switch (item) {
    case 'cut':
      if (textEditorAdapter.value && typeof textEditorAdapter.value.cut === 'function') {
        await (textEditorAdapter.value as any).cut()
      }
      break
    case 'copy':
      if (textEditorAdapter.value && typeof textEditorAdapter.value.copy === 'function') {
        await (textEditorAdapter.value as any).copy()
      }
      break
    case 'paste':
      if (textEditorAdapter.value && typeof textEditorAdapter.value.paste === 'function') {
        await (textEditorAdapter.value as any).paste()
      }
      break
    case 'selectAll':
      if (textEditorAdapter.value && typeof textEditorAdapter.value.selectAll === 'function') {
        ;(textEditorAdapter.value as any).selectAll()
      }
      break
    case 'openAutoCompletion':
      await setSetting('autoCompletion', true)
      break
    case 'closeAutoCompletion':
      await setSetting('autoCompletion', false)
      break
    case 'trigger-auto-completion':
      if (aiCompletionService.getAdapter()) {
        aiCompletionService.triggerCompletion('manual')
      } else {
        if (editorId.value) {
          const adapter = new MonacoEditorAdapter(editorId.value, () => isActive.value)
          aiCompletionService.setAdapter(adapter)
          aiCompletionService.triggerCompletion('manual')
        }
      }
      break
  }
  await refreshContextMenu()
  contextMenuVisible.value = false
}

const refreshContextMenu = async () => {
  articleContextMenuItems.value = (await getArticleContextMenuItems({
    isPlainTextEditor: true
  })) as any[]
}

let contentChangeListener: monaco.IDisposable | null = null
const editorId = ref<string | null>(null)
const initEditor = async () => {
  // 优化：如果编辑器已存在，先销毁，避免重复创建
  if (editor.value || editorId.value) {
    try {
      if (editor.value) {
        editor.value.dispose()
      } else if (editorId.value) {
        // 如果只有 editorId，从全局获取并销毁
        const editors = monaco.editor.getEditors()
        const existingEditor = editors.find((e) => e.getId() === editorId.value)
        if (existingEditor) {
          existingEditor.dispose()
        }
      }
    } catch (e) {
      logger.warn('销毁已存在的编辑器失败', e)
    }
    editor.value = null
    editorId.value = null
  }

  setupMonacoWorker()

  if (!editorEl.value) return

  // 根据文件路径确定语言模式
  const language = getMonacoLanguage('txt', currentPath.value)

  editor.value = monaco.editor.create(editorEl.value, {
    value: currentText.value,
    language: language,
    theme: themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs',
    mouseWheelZoom: true,
    automaticLayout: true,
    fontSize: 14,
    fontFamily: getEditorFontFamily(),
    wordWrap: 'on',
    wrappingIndent: 'same',
    lineNumbers: enableRowNumber ? 'on' : 'off', // 使用从设置中读取的值
    minimap: { enabled: enableMinimap },
    contextmenu: false
  })
  editorId.value = editor.value.getId()
  textEditorAdapter.value = createMonacoAdapter(editorId.value)

  const adapter = new MonacoEditorAdapter(editorId.value, () => isActive.value)
  aiCompletionService.setAdapter(adapter)

  let isUpdatingGhostText = false

  eventBus.on('ai-ghost-text-updating', (updating: unknown) => {
    isUpdatingGhostText = updating === true
  })

  contentChangeListener = editor.value.onDidChangeModelContent(
    (event: monaco.editor.IModelContentChangedEvent) => {
      const monacoEditor = getActiveMonacoEditor()
      if (!monacoEditor) return

      if (isUpdatingFromExternal) {
        textBuffer = monacoEditor.getValue()
        return
      }

      textBuffer = monacoEditor.getValue()

      if (isUpdatingGhostText) {
        debounceSync()
        return
      }

      debounceSync()

      const isPasteOperation =
        event.changes.length > 1 || event.changes.some((change) => change.text.length > 100)

      if (isPasteOperation) {
        return
      }

      if (!aiCompletionService.getAdapter()) {
        const adapter = new MonacoEditorAdapter(editorId.value ?? '', () => isActive.value)
        aiCompletionService.setAdapter(adapter)
      }

      aiCompletionService.cancelCurrentCompletion()
      aiCompletionService.triggerCompletion('input')
    }
  )

  const debounceSync = debounce(() => {
    if (currentText.value !== textBuffer) {
      currentText.value = textBuffer
    }
  }, 100)

  editor.value.onMouseDown((e: monaco.editor.IEditorMouseEvent) => {
    if (e.event.browserEvent.button === 0) {
      aiCompletionService.handleMouseClick()
    }
  })

  editor.value.onKeyDown((e: monaco.IKeyboardEvent) => {
    // 手动触发（Shift+Tab）
    if (e.shiftKey && e.keyCode === monaco.KeyCode.Tab) {
      e.preventDefault()
      e.stopPropagation()
      aiCompletionService.triggerCompletion('manual')
      return
    }

    if (e.keyCode === monaco.KeyCode.Tab) {
      return
    }

    const key =
      e.keyCode === monaco.KeyCode.Enter
        ? 'Enter'
        : e.keyCode === monaco.KeyCode.Space
          ? 'Space'
          : e.keyCode === monaco.KeyCode.Semicolon
            ? ';'
            : e.keyCode === monaco.KeyCode.Comma
              ? ','
              : null

    if (key) {
      aiCompletionService.cancelCurrentCompletion()
      aiCompletionService.triggerCompletion('key', key)
    } else {
      aiCompletionService.cancelCurrentCompletion()
    }
  })

  eventBus.emit('monaco-ready')
}

eventBus.on('refresh', () => {
  resetEditor()
})

const resetEditor = () => {
  editorKey.value = Date.now()
  nextTick(() => initEditor())
}

eventBus.on('search-replace', (payload?: any) => {
  searchReplaceDialogVisible.value = true
  if (payload && payload.expandReplace) {
    nextTick(() => eventBus.emit('search-replace-expand'))
  }
})

watch(isActive, (active) => {
  if (!active) {
    searchReplaceDialogVisible.value = false
  }
})

// 处理控制台输入
const handleConsoleInput = async (payload: any) => {
  if (!payload || payload.key !== 'plaintext') return

  const command = payload.content?.trim()
  if (!command) return

  try {
    // 生成 invocationId
    const invocationId = `plaintext-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    currentInvocationId.value = invocationId

    // 执行命令（不等待完成，支持交互式输入）
    // 传递consoleKey，主进程会使用维护的 cwd 状态
    const result = (await messageBridge.invoke('execute-terminal-command', {
      command,
      invocationId,
      consoleKey: 'plaintext'
    })) as { success: boolean; invocationId: string; error?: string }

    if (!result.success) {
      eventBus.emit('console-err', {
        key: 'plaintext',
        content: `错误: ${result.error || '执行命令失败'}\n`
      })
      currentInvocationId.value = null
    }
    // 注意：命令已经通过 shell 执行，不需要再发送到 stdin
    // 如果需要交互式输入，可以通过 terminal-send-input 发送
    // 注意：不再在这里显示输出，因为输出会通过流式事件实时显示
    // 退出代码会通过 terminal-close 事件发送
  } catch (error) {
    logger.error('执行命令失败:', error)
    eventBus.emit('console-err', {
      key: 'plaintext',
      content: `错误: ${error instanceof Error ? error.message : String(error)}\n`
    })
    currentInvocationId.value = null
  }
}

// 存储当前执行的命令的 invocationId
const currentInvocationId = ref<string | null>(null)

// 监听终端输出流（实时输出）
const handleTerminalStdoutStream = (_event: any, payload: any) => {
  if (!payload || !payload.invocationId || payload.invocationId !== currentInvocationId.value)
    return

  // 命令执行期间的输出，应该追加（但 Console 会检查 isCommandExecuting，确保追加到新行）
  eventBus.emit('console-out', {
    key: 'plaintext',
    content: payload.data || '',
    append: true // 追加到当前输出行（但 Console 会检查状态，确保追加到新行）
  })
}

const handleTerminalStderrStream = (_event: any, payload: any) => {
  if (!payload || !payload.invocationId || payload.invocationId !== currentInvocationId.value)
    return

  // 命令执行期间的输出，应该追加（但 Console 会检查 isCommandExecuting，确保追加到新行）
  eventBus.emit('console-err', {
    key: 'plaintext',
    content: payload.data || '',
    append: true // 追加到当前输出行（但 Console 会检查状态，确保追加到新行）
  })
}

// 监听终端关闭事件（显示退出代码）
const handleTerminalClose = (_event: any, payload: any) => {
  if (!payload || !payload.invocationId || payload.invocationId !== currentInvocationId.value)
    return

  // 标记命令执行完成
  eventBus.emit('console-command-finished', {
    key: 'plaintext',
    invocationId: payload.invocationId
  })

  // 显示退出代码（如果不是0）
  if (payload.exitCode !== 0) {
    eventBus.emit('console-err', {
      key: 'plaintext',
      content: `\n进程退出，退出代码: ${payload.exitCode}\n`,
      append: false // 退出代码应该在新行显示
    })
  }

  // 清除 invocationId
  currentInvocationId.value = null
}

// 监听终端错误事件
const handleTerminalError = (_event: any, payload: any) => {
  if (!payload || !payload.invocationId || payload.invocationId !== currentInvocationId.value)
    return

  // 标记命令执行完成（错误）
  eventBus.emit('console-command-finished', {
    key: 'plaintext',
    invocationId: payload.invocationId
  })

  eventBus.emit('console-err', {
    key: 'plaintext',
    content: `错误: ${payload.error || '未知错误'}\n`,
    append: false // 错误应该在新行显示
  })

  currentInvocationId.value = null
}

onMounted(async () => {
  try {
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateSearchMenuPosition)
    }
    await waitForService('express')
    await refreshContextMenu()
    await initEditor() // initEditor 现在是 async 函数

    // 监听控制台输入
    eventBus.on('console-input', handleConsoleInput)

    // 监听终端输出流和事件（如果主进程支持）
    messageBridge.on('terminal-stdout-stream', handleTerminalStdoutStream)
    messageBridge.on('terminal-stderr-stream', handleTerminalStderrStream)
    messageBridge.on('terminal-close', handleTerminalClose)
    messageBridge.on('terminal-error', handleTerminalError)

    eventBus.on('sync-editor-theme', () => {
      const isDark = themeState.currentTheme.type === 'dark'
      const themeName = isDark ? 'vs-dark' : 'vs'
      const toMonacoColor = (color: string) => color.replace('#', '') || 'FFFFFF'
      const deeperColor = (color: string) => {
        if (isDark) return mixColors(color, '#000000', 0.3)
        else return mixColors(color, '#FFFFFF', 0.3)
      }
      monaco.editor.defineTheme('myCustomTheme', {
        base: themeName,
        inherit: true,
        rules: [
          {
            token: '',
            background: toMonacoColor(deeperColor(themeState.currentTheme.background)),
            fontStyle: ''
          }
        ],
        colors: {
          'editor.background': deeperColor(themeState.currentTheme.background)
        }
      })
      monaco.editor.setTheme('myCustomTheme')
    })
    eventBus.emit('sync-editor-theme')

    handleFontSettingsChanged = () => {
      const ed = getActiveMonacoEditor()
      if (ed) ed.updateOptions({ fontFamily: getEditorFontFamily() })
    }
    eventBus.on('font-settings-changed', handleFontSettingsChanged)
  } catch (e) {
    logger.error(e)
    eventBus.emit('show-error', t('plaintextEditor.init_failed') + e)
  } finally {
    loadingInstance.close()
  }
})

onUnmounted(() => {
  aiCompletionService.removeAdapter()

  if (handleFontSettingsChanged) {
    eventBus.off('font-settings-changed', handleFontSettingsChanged)
    handleFontSettingsChanged = null
  }

  // 移除控制台输入监听
  eventBus.off('console-input', handleConsoleInput)

  // 移除终端输出流监听
  messageBridge.removeListener('terminal-stdout-stream', handleTerminalStdoutStream)
  messageBridge.removeListener('terminal-stderr-stream', handleTerminalStderrStream)
  messageBridge.removeListener('terminal-close', handleTerminalClose)
  messageBridge.removeListener('terminal-error', handleTerminalError)

  if (contentChangeListener) {
    contentChangeListener.dispose()
    contentChangeListener = null
  }

  eventBus.emit('is-need-save', true)

  if (editorId.value) {
    try {
      const editors = monaco.editor.getEditors()
      editors.forEach((ed) => {
        if (ed.getId() === editorId.value) {
          try {
            ed.dispose()
          } catch (e) {
            // 编辑器可能已经被销毁
          }
        }
      })
    } catch (e) {
      logger.warn('清理 Monaco 编辑器时出错', e)
    }
  }

  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateSearchMenuPosition)
  }
})

function onAcceptSuggestion(text: string) {
  // AISuggestionGhost已经帮忙插入了
}

function onCancelSuggestion() {
  // 补全已取消
}
</script>

<style scoped>
.main-container {
  background-color: v-bind('themeState.currentTheme.background');
}

.content-container {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.plaintext-layout {
  display: flex;
  height: 100%;
  width: 100%;
}

.plaintext-main {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
}

.toolbar {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  border-bottom: 1px solid #bbb;
  gap: 8px;
  flex-shrink: 0;
}

.toolbar-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.toolbar-icon:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.editor-console-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--el-bg-color-page);
}

.editor-wrapper {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
}

.editor-wrapper.console-visible {
  flex: 1 1 auto;
  min-height: 0;
}

.editor {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 0;
}

.console-resizer {
  height: 4px;
  cursor: row-resize;
  background: var(--el-border-color-lighter);
  flex-shrink: 0;
  position: relative;
  z-index: 10;
  transition: background-color 0.2s;
}

.console-resizer:hover {
  background: var(--el-color-primary);
}

.console-wrapper {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--console-background);
  border-top: 1px solid var(--el-border-color-lighter);
  overflow: hidden;
}

.console-panel {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.context-menu {
  position: fixed;
  z-index: 1000;
}
</style>
