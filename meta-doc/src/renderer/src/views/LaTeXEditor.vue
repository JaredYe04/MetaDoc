<template>
  <div class="main-container">
    <div class="content-container">
      <!-- 菜单组件 -->
      <SectionOptimizer
        v-if="showSectionOptimizer"
        :title="currentSectionTitle"
        :position="sectionOptimizerPosition"
        :path="currentTitlePath"
        :tree="extractOutlineTreeFromLatex(currentTex, true)"
        :adapter="sectionOptimizerAdapter"
        :sectionInfo="currentSectionInfo"
        language="latex"
        @close="handleSectionOptimizerClose"
        @accept="
          async (payload) => {
            await acceptGeneratedText(payload)
          }
        "
        style="max-width: 500px"
      />
      <!-- 保留TitleMenu以兼容旧代码 -->
      <TitleMenu
        v-if="showTitleMenu"
        :title="currentTitle.replaceAll('#', '').trim()"
        :position="menuPosition"
        @close="handleTitleMenuClose"
        :path="currentTitlePath"
        :tree="extractOutlineTreeFromLatex(currentTex, true)"
        @accept="
          async (payload: any) => {
            await acceptGeneratedText(payload)
          }
        "
        style="max-width: 500px"
      />
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
        format="tex"
        @accepted="onAcceptSuggestion"
        @cancelled="onCancelSuggestion"
      />

      <div class="latex-layout">
        <div class="latex-main" ref="mainContainerRef">
          <ResizableContainer
            ref="pdfResizableRef"
            direction="vertical"
            storage-key="latex-pdf-panel"
            :initial-sidebar-size="LATEX_LAYOUT.pdf.minWidth"
            :min-size="LATEX_LAYOUT.pdf.minWidth"
            :max-size="
              mainWidth > 0
                ? Math.max(LATEX_LAYOUT.pdf.minWidth, mainWidth - LATEX_LAYOUT.left.minWidth)
                : LATEX_LAYOUT.pdf.minWidth
            "
            :divider-size="8"
            sidebar-position="end"
            :show-sidebar="showPdfPanel"
            @resize="handlePdfResize"
          >
            <template #main>
              <div class="latex-column left-column">
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
                      {{ $t('latexEditor.toolbar.undo') }}
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger as-child>
                      <div class="toolbar-icon" @click="redo">
                        <ArrowRight class="w-4 h-4" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {{ $t('latexEditor.toolbar.redo') }}
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger as-child>
                      <div class="toolbar-icon" @click="zoomIn">
                        <ZoomIn class="w-4 h-4" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {{ $t('latexEditor.toolbar.zoomIn') }}
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger as-child>
                      <div class="toolbar-icon" @click="zoomOut">
                        <ZoomOut class="w-4 h-4" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {{ $t('latexEditor.toolbar.zoomOut') }}
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger as-child>
                      <div class="toolbar-icon" @click="toggleRowNumber">
                        <icon name="numbers-1" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {{ $t('latexEditor.toolbar.toggleLineNumbers') }}
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger as-child>
                      <div class="toolbar-icon" @click="toggleMinimap">
                        <el-icon>
                          <Memo />
                        </el-icon>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {{ $t('latexEditor.toolbar.togglePreview') }}
                    </TooltipContent>
                  </Tooltip>

                  <Divider direction="vertical" />

                  <Tooltip>
                    <TooltipTrigger as-child>
                      <div class="toolbar-icon" @click="togglePdf">
                        <icon name="terminal" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {{ $t('latexEditor.toolbar.showPdf') }}
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger as-child>
                      <div class="toolbar-icon" @click="toggleConsole">
                        <icon name="terminal-rectangle" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {{ $t('latexEditor.toolbar.showConsole') }}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <div
                        class="toolbar-icon"
                        :class="{ 'is-compiling': isCompiling }"
                        :aria-disabled="isCompiling"
                        @click="!isCompiling && compile()"
                      >
                        <RefreshCw v-if="isCompiling" class="w-4 h-4 animate-spin" />
                        <icon v-else name="code" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {{ $t('latexEditor.toolbar.compile') }}
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
                  <div
                    v-if="showConsole"
                    class="console-resizer"
                    @mousedown="startResizeConsole"
                  ></div>
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
                      <ConsoleOutput
                        console-key="latex"
                        :enable-ai-analysis="enableAiAnalysis"
                        @update:enable-ai-analysis="enableAiAnalysis = $event"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <template #sidebar>
              <keep-alive>
                <div
                  class="latex-column pdf-column"
                  v-show="showPdfPanel"
                  @contextmenu.prevent="openPdfContextMenu($event)"
                >
                  <PdfPreviewPanel ref="pdfPreviewPanelRef" :pdf-url="pdfUrl" />
                  <ContextMenu
                    :x="pdfMenuX"
                    :y="pdfMenuY"
                    :items="pdfContextMenuItems"
                    v-if="pdfContextMenuVisible"
                    @trigger="handlePdfMenuClick"
                    class="context-menu"
                    @close="pdfContextMenuVisible = false"
                  />
                </div>
              </keep-alive>
            </template>
          </ResizableContainer>
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
import { ElButton, ElLoading, ElScrollbar } from 'element-plus'
import { notifySuccess, notifyError, notifyWarning, notifyInfo } from '@renderer/utils/notify'
import { Icon } from 'tdesign-icons-vue-next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { Divider } from '@renderer/components/ui/separator'

import '../assets/aero-div.css'
import '../assets/aero-btn.css'
import '../assets/aero-input.css'
import '../assets/title-menu.css'
import eventBus, { getWindowType } from '../utils/event-bus'
import { searchNode } from '../utils/outline-helpers'
import { extractOutlineTreeFromMarkdown } from '../utils/md-utils'
import { extractOutlineTreeFromLatex } from '../utils/latex-utils'
import { getOutlineAdapter } from '../utils/outline-adapters'
import TitleMenu from '../components/TitleMenu.vue'
import SectionOptimizer from '../components/SectionOptimizer.vue'
import { LaTeXSectionAdapter } from '../components/section-optimizer/adapters/latex-adapter'
import SearchReplaceMenu from '../components/SearchReplaceMenu.vue'
import AiLogo from '../assets/ai-logo.svg'
import AiLogoWhite from '../assets/ai-logo-white.svg'
import { mixColors, themeState } from '../utils/themes'
import { getSetting, setSetting } from '../utils/settings'
import { useI18n } from 'vue-i18n'
import AISuggestionGhost from '../components/AISuggestionGhost.vue'
import { aiCompletionService } from '../utils/ai-completion-service'
import { MonacoEditorAdapter } from '../utils/editor-adapters'
import '../assets/ai-suggestion.css'
import ResizableContainer from '../components/base/ResizableContainer.vue'
import { getArticleContextMenuItems } from '../components/contextMenus/ArticleContextMenu'
import ContextMenu from '../components/ContextMenu.vue'
import PdfPreviewPanel from '../components/PdfPreviewPanel.vue'
import ConsoleOutput from '../components/ConsoleOutput.vue'

import { createRendererLogger } from '../utils/logger.ts'
import { waitForService } from '../utils/service-status.ts'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { useWorkspace } from '../stores/workspace'

import 'monaco-latex'
import { ArrowLeft, ArrowRight, RefreshCw, ZoomIn, ZoomOut } from 'lucide-vue-next'
import { Loading } from '@element-plus/icons-vue'
import { debounce } from 'lodash'
import messageBridge from '../bridge/message-bridge'
import { createMonacoAdapter } from '../editor/monaco-adapter'
import { prependAiChatDialog } from '../utils/ai-chat-storage'
import { setupMonacoWorker, registerLatexLanguage } from '../utils/monaco-worker-config'
import { createAiTask, ai_types, cancelAiTask } from '../utils/ai_tasks'
import { getCurrentLocalePrompts } from '../utils/prompts'

const { t } = useI18n()
const logger = createRendererLogger('LaTeXEditor', {
  windowTypeProvider: () => getWindowType()
})

const LATEX_LAYOUT = {
  meta: {
    minWidth: 260,
    maxWidth: 520,
    initialWidth: 320
  },
  left: {
    minWidth: 360,
    maxRatio: 0.7
  },
  pdf: {
    minWidth: 400, // 降低最小宽度，允许更灵活的调整
    maxRatio: 0.55
  }
}
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
    default: 'latex-editor'
  },
  mode: {
    type: String,
    default: ''
  }
})

// Demo mode support
const isDemo = computed(() => props.mode === 'demo')
const isActive = computed(() => props.active)

const workspace = useWorkspace()
const documentRef = computed(() => workspace.ensureDocument(props.tabId))

const currentTex = computed({
  get: () => documentRef.value.tex ?? '',
  set: (val) => {
    if (val === documentRef.value.tex) return
    //logger.debug("LaTeXEditor currentTex set")//bugfix
    workspace.updateDocumentTex(props.tabId, val)
  }
})

const currentOutline = computed({
  get: () => documentRef.value.outline,
  set: (val) => workspace.updateDocumentOutline(props.tabId, val)
})

const currentOutlineJson = computed(() => {
  try {
    // 直接从 LaTeX 文本提取大纲树，而不是依赖可能为空的 markdown
    //logger.debug('currentOutlineJson: ' + currentTex.value);
    const outline = extractOutlineTreeFromLatex(currentTex.value, false)
    //logger.debug('currentOutlineJson: ' + JSON.stringify(outline));
    return JSON.stringify(outline)
  } catch (error) {
    logger.warn('构建 LaTeX 大纲 JSON 失败', error)
    return JSON.stringify({ path: 'dummy', title: '', text: '', title_level: 0, children: [] })
  }
})

const currentDialogs = computed(() => documentRef.value.aiDialogs ?? [])

const currentMarkdown = computed({
  get: () => documentRef.value.markdown ?? '',
  set: (val) => workspace.updateDocumentMarkdown(props.tabId, val)
})

const latestView = computed({
  get: () => documentRef.value.lastView ?? 'article',
  set: (val) => workspace.updateDocumentLastView(props.tabId, val)
})

const currentPath = computed(() => documentRef.value.path || '')

// 状态变量
const modifyContentDialogVisible = ref(false)
const continueContentDialogVisible = ref(false)
const searchReplaceDialogVisible = ref(false)
const editor = ref<monaco.editor.IStandaloneCodeEditor | null>(null)
const articleContextMenuItems = ref<any[]>([]) //右键菜单项
const textEditorAdapter = shallowRef<any>(null)

const loadingInstance = ElLoading.service({ fullscreen: false })
const showTitleMenu = ref(false)
const showSectionOptimizer = ref(false)
const currentTitle = ref('')
const currentSectionTitle = ref('')
const menuPosition = ref({ top: 0, left: 0 })
const sectionOptimizerPosition = ref({ top: 0, left: 0 })
const sectionOptimizerAdapter = shallowRef<any>(null)
const currentSectionInfo = ref<any>(null)
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
const currentTitlePath = ref('')
const contextMenuVisible = ref(false) // 右键菜单可见性
const menuX = ref(0) // 菜单 X 坐标
const menuY = ref(0) // 菜单 Y 坐标

// PDF右键菜单
const pdfContextMenuVisible = ref(false)
const pdfMenuX = ref(0)
const pdfMenuY = ref(0)
const pdfContextMenuItems = ref<any[]>([
  { label: 'latexEditor.pdfMenu.refresh', value: 'refresh' },
  { label: 'latexEditor.pdfMenu.locateToCode', value: 'locate-to-code' },
  { type: 'divider' },
  { label: 'latexEditor.pdfMenu.zoomIn', value: 'zoom-in' },
  { label: 'latexEditor.pdfMenu.zoomOut', value: 'zoom-out' },
  { label: 'latexEditor.pdfMenu.zoomReset', value: 'zoom-reset' },
  { type: 'divider' },
  { label: 'latexEditor.pdfMenu.openDirectory', value: 'open-directory' },
  { label: 'latexEditor.pdfMenu.save', value: 'save' }
])

const handleTitleMenuClose = () => {
  showTitleMenu.value = false
}

// 从右键菜单打开段落优化工具
const openSectionOptimizerFromContext = async () => {
  if (!editor.value || !props.tabId || !editorId.value) return

  // 从Monaco全局获取编辑器实例
  const editors = monaco.editor.getEditors()
  const monacoEditor = editors.find((e) => e.getId?.() === editorId.value) || editor.value
  if (!monacoEditor) return

  // 获取当前光标位置
  const position = monacoEditor.getPosition()
  if (!position) return

  // 创建适配器
  const adapter = new LaTeXSectionAdapter(props.tabId, editorId.value)
  adapter.setEditorId(editorId.value)
  sectionOptimizerAdapter.value = adapter

  // 获取当前章节信息
  const sectionInfo = await adapter.getSectionAtCursor({
    lineNumber: position.lineNumber,
    column: position.column
  })
  if (!sectionInfo) {
    // 如果没有找到章节，使用默认值
    currentSectionTitle.value = '段落优化'
    currentTitlePath.value = ''
    currentSectionInfo.value = null
  } else {
    currentSectionTitle.value = sectionInfo.title
    currentTitlePath.value = sectionInfo.path
    currentSectionInfo.value = sectionInfo
  }

  // 设置菜单位置
  sectionOptimizerPosition.value = {
    top: menuY.value,
    left: menuX.value
  }

  showSectionOptimizer.value = true
}

const handleSectionOptimizerClose = () => {
  showSectionOptimizer.value = false
  sectionOptimizerAdapter.value = null
}
const handleSearchReplaceClose = () => {
  searchReplaceDialogVisible.value = false
}

const replaceDialogs = (builder: (dialogs: any[]) => any[]) => {
  const base = [...currentDialogs.value]
  const next = builder(base)
  workspace.updateDocumentAiDialogs(props.tabId, next)
}

const addDialogEntry = (dialog: any, addToFront = false) => {
  replaceDialogs((dialogs) => {
    if (addToFront) {
      dialogs.unshift(dialog)
    } else {
      dialogs.push(dialog)
    }
    return dialogs
  })
}

const acceptGeneratedText = async (payload: any) => {
  if (!payload) return
  const { append, content, sectionInfo } = payload

  // 如果有sectionInfo，使用它来应用内容
  if (sectionInfo && sectionOptimizerAdapter.value) {
    try {
      await sectionOptimizerAdapter.value.applyContent(sectionInfo, content, append)
      showSectionOptimizer.value = false
      sectionOptimizerAdapter.value = null
      return
    } catch (e) {
      console.warn('Failed to apply content via adapter:', e)
    }
  }

  // 回退到旧的方式（用于TitleMenu兼容）
  if (!currentTitlePath.value) return
  const clonedOutline = JSON.parse(JSON.stringify(currentOutline.value))
  const node = searchNode(currentTitlePath.value, clonedOutline)
  if (node) {
    node.text = append ? `${node.text || ''}${content}` : content
    currentOutline.value = clonedOutline
    latestView.value = 'outline'
  }
  showTitleMenu.value = false
  showSectionOptimizer.value = false
}

const editorEl = ref<HTMLElement | null>(null)
const editorKey = ref(Date.now())
const mainContainerRef = ref<HTMLElement | null>(null)
const pdfResizableRef = ref<any>(null)
const mainWidth = ref(0)
let mainObserver: ResizeObserver | null = null
let pdfContainerObserver: ResizeObserver | null = null

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const clampPdfWidth = (size: number) => {
  if (!showPdfPanel.value) return LATEX_LAYOUT.pdf.minWidth
  const width = mainWidth.value || size + LATEX_LAYOUT.left.minWidth
  const minAllowed = LATEX_LAYOUT.pdf.minWidth
  // 允许 PDF 面板占据更多空间，但至少保留 left 的最小宽度
  const maxByEditor = width - LATEX_LAYOUT.left.minWidth
  // 可选：仍然应用 maxRatio 作为软限制，但不强制
  const maxByRatio = width * LATEX_LAYOUT.pdf.maxRatio
  // 使用更大的值作为上限，允许更灵活的调整
  const maxAllowed = Math.max(maxByEditor, maxByRatio)
  return clamp(size, minAllowed, maxAllowed)
}

const ensurePdfWithinBounds = () => {
  if (!pdfResizableRef.value || !showPdfPanel.value) return
  const current = pdfResizableRef.value.getSidebarSize
    ? pdfResizableRef.value.getSidebarSize()
    : undefined
  if (typeof current === 'number') {
    const clamped = clampPdfWidth(current)
    if (clamped !== current) {
      pdfResizableRef.value.setSidebarSize(clamped)
    }
  } else {
    const fallback = clampPdfWidth(LATEX_LAYOUT.pdf.minWidth)
    pdfResizableRef.value.setSidebarSize(fallback)
  }
}

const handlePdfResize = (size: number) => {
  // 只在超出边界时才进行限制，允许在正常范围内自由拖动
  const clamped = clampPdfWidth(size)
  // 只有当被限制的值与输入值不同时才更新（说明超出了边界）
  // 这样可以避免在正常拖动时频繁调用 setSidebarSize，影响拖动流畅性
  if (Math.abs(clamped - size) > 1 && pdfResizableRef.value?.setSidebarSize) {
    pdfResizableRef.value.setSidebarSize(clamped)
  }
  // 在 PDF 面板大小变化时，暂时禁用 minimap 避免闪烁
  temporarilyDisableMinimap()
}

const editorDomId = computed(() => props.editorDomId || 'latex-editor')

// 增量同步缓存
let textBuffer = currentTex.value

// 标记是否正在从外部更新编辑器（避免循环更新）
let isUpdatingFromExternal = false

// 获取当前激活的 Monaco 编辑器（始终从全局获取，避免引用过期实例）
const getActiveMonacoEditor = () => {
  const editors = monaco.editor.getEditors()
  const byId = editorId.value ? editors.find((e) => e.getId?.() === editorId.value) : undefined
  return byId || editors[0] || editor.value
}

// 文本到大纲的同步（类似 MarkdownEditor）
let suppressOutlineSync = false
const syncOutlineFromTex = debounce(() => {
  if (suppressOutlineSync) return
  if (!isActive.value) return

  // 只在编辑器视图时才同步大纲，避免在outline视图时触发不必要的同步
  const currentView = documentRef.value.lastView ?? 'editor'
  // 兼容旧的'article'值（已被'editor'替代）
  if (currentView !== 'editor' && (currentView as string) !== 'article') {
    return
  }

  try {
    const adapter = getOutlineAdapter('tex')
    const extractedOutline = adapter.fromText(currentTex.value)
    currentOutline.value = extractedOutline
  } catch (error) {
    logger.warn('从 LaTeX 同步大纲树失败', error)
  }
}, 200)

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
const toggleMinimap = () => {
  if (!editor.value) return
  enableMinimap = !enableMinimap
  editor.value.updateOptions({
    minimap: { enabled: enableMinimap }
  })
}

// Minimap 防抖处理：在窗口或组件大小变化时暂时禁用 minimap，避免闪烁
let isMinimapTemporarilyDisabled = false

// 重新启用 minimap 的防抖函数
const reenableMinimap = debounce(() => {
  if (!editor.value || !enableMinimap) return

  // 如果 minimap 原本是启用的，重新启用它
  if (isMinimapTemporarilyDisabled) {
    editor.value.updateOptions({
      minimap: { enabled: true }
    })
    isMinimapTemporarilyDisabled = false
  }
}, 300) // 300ms 防抖延迟

// 暂时禁用 minimap（在 resize 开始时调用）
const temporarilyDisableMinimap = () => {
  if (!editor.value || !enableMinimap) return

  // 如果 minimap 当前是启用的，暂时禁用它
  if (!isMinimapTemporarilyDisabled) {
    editor.value.updateOptions({
      minimap: { enabled: false }
    })
    isMinimapTemporarilyDisabled = true
  }

  // 触发防抖重新启用
  reenableMinimap()
}
const toggleRowNumber = () => {
  if (!editor.value) return
  enableRowNumber = !enableRowNumber
  editor.value.updateOptions({
    lineNumbers: enableRowNumber ? 'on' : 'off'
  })
}

const showPdfPanel = ref(false) // 默认不显示，只有在存在 PDF 文件时才显示
const showConsole = ref(false) // 默认隐藏终端
const pdfUrl = ref('')
const pdfPreviewPanelRef = ref<InstanceType<typeof PdfPreviewPanel> | null>(null)
const pagesPerRow = ref(1) // 保留供 LaTeXEditor 内仍引用的 watch/updateWrapperSize 使用（实际 UI 在 PdfPreviewPanel）
const pdfViewMode = ref<'pointer' | 'hand'>('pointer') // 保留供 setPdfViewMode / 手型拖拽等逻辑使用

// AI 错误分析相关
const aiErrorAnalysisOutput = ref('')
let lastOutputLength = 0 // 用于增量输出
let errorAnalysisWatchStop: (() => void) | null = null
let currentAiTaskHandle: string | null = null // 当前AI任务的handle
const enableAiAnalysis = ref(false) // AI分析开关（默认关闭）
const isCompiling = ref(false) // 编译中状态，防止重复点击

// 收集编译过程中的 console 输出
let compileConsoleOutput: { stdout: string; stderr: string } = { stdout: '', stderr: '' }
let compileConsoleListeners: {
  onStdout?: (data: unknown) => void
  onStderr?: (data: unknown) => void
} = {}

// 检查 PDF URL 是否有效
const isValidPdfUrl = computed(() => {
  return (
    pdfUrl.value && pdfUrl.value !== '' && pdfUrl.value !== 'file:///' && pdfUrl.value.trim() !== ''
  )
})
const pdfScrollbarRef = ref<InstanceType<typeof ElScrollbar> | null>(null)
const pdfPagesContainer = ref<HTMLElement | null>(null)
const pdfPagesWrapper = ref<HTMLElement | null>(null)
// 存储每个页面的DOM引用，用于跳转定位
const pageRefs = new Map<number, HTMLElement>()

import { VuePdf, createLoadingTask } from 'vue3-pdfjs'
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api'
import { wholeArticleContextPrompt } from '../utils/prompts.ts'
let pdfInitialized = false

// 计算最优缩放比例（使用整数倍或接近整数倍，避免模糊）
function calculateOptimalScale(baseScale: number): number {
  // 将缩放比例调整为接近整数倍，提高清晰度
  // 使用0.1的倍数以确保缩放能产生明显变化
  // 例如：1.0 + 0.1 = 1.1, 1.0 - 0.1 = 0.9
  const rounded = Math.round(baseScale * 10) / 10 // 四舍五入到0.1的倍数
  const result = Math.max(0.2, Math.min(5, rounded))
  return result
}

// PDF缩放比例（用于VuePdf组件的scale属性，动态调整以优化渲染质量）
const zoomScale = ref(1.0) // 默认缩放比例（用户可见的缩放比例）

// PDF 渲染分辨率倍数（提高初始 DPI，确保放大时清晰）
// 设置为 2.5，这样即使放大到最大 5 倍，实际分辨率也是 2.5，足够清晰
const PDF_RENDER_SCALE = 2.5

// 标志：组件是否已卸载（用于防止在卸载后触发渲染）
let isComponentUnmounted = false

// 容器样式（使用 CSS transform 实现缩放，保持原始 DPI）
// 使用grid布局，根据用户选择的每行页数设置列数
const pdfContainerStyle = computed(() => {
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${pagesPerRow.value}, 1fr)`,
    gap: '20px',
    gridAutoRows: 'min-content',
    justifyItems: 'start'
  }
})

// 处理每行页数变化
const handlePagesPerRowChange = () => {
  // 重新计算包装器大小
  nextTick(() => {
    updateWrapperSize()
  })
}

// 包装器大小：直接等于 pdf-pages-container 的布局大小（scrollHeight/scrollWidth）
// 因为 transform: scale() 不改变布局大小，所以 scrollHeight 就是正确的包装器高度
const pdfWrapperHeight = ref<number | string>('auto')
const pdfWrapperWidth = ref<number | string>('auto')

// 更新包装器大小：通过子元素的实际大小计算，更可靠
// 注意：由于 pdf-pages-container 使用了 transform: scale()，其布局大小不会改变
// 但视觉大小会改变，所以 wrapper 应该使用布局大小（不需要乘以缩放因子）
// 因为 wrapper 只是作为一个滚动容器，它的内容区域大小应该匹配 container 的布局大小
const updateWrapperSize = () => {
  if (!pdfPagesContainer.value || !pdfPagesWrapper.value) return

  nextTick(() => {
    if (!pdfPagesContainer.value || !pdfPagesWrapper.value) return

    // 使用双重 requestAnimationFrame 确保浏览器完成所有渲染
    requestAnimationFrame(() => {
      if (!pdfPagesContainer.value || !pdfPagesWrapper.value) return

      requestAnimationFrame(() => {
        if (!pdfPagesContainer.value || !pdfPagesWrapper.value) return

        let containerHeight = 0
        let containerWidth = 0

        // 方法1：优先使用页面引用计算（最准确，只计算实际内容）
        if (pageRefs.size > 0 && totalPdfPages.value > 0) {
          // Grid布局：计算总行数和总列数
          const columns = pagesPerRow.value
          const rows = Math.ceil(totalPdfPages.value / columns)

          // 获取第一页的宽度和高度（所有页面尺寸相同）
          // 注意：pageRefs 中的元素是页面 DOM，它们的大小已经考虑了 PDF_RENDER_SCALE
          // 但由于 transform scale 不改变布局大小，我们需要使用布局大小
          const firstPageEl = pageRefs.get(1)
          if (firstPageEl) {
            // 使用 offsetWidth/offsetHeight 获取布局大小（未缩放）
            // 因为 transform scale 只影响视觉大小，不影响布局大小
            const pageWidth = firstPageEl.offsetWidth
            const pageHeight = firstPageEl.offsetHeight
            const gap = 20
            const padding = 40

            // 计算总宽度：列数 * 页面宽度 + (列数 - 1) * gap + padding
            containerWidth = columns * pageWidth + (columns - 1) * gap + padding

            // 计算总高度：行数 * 页面高度 + (行数 - 1) * gap + padding
            containerHeight = rows * pageHeight + (rows - 1) * gap + padding
          }
        }

        // 方法2：如果页面引用方法失败，使用容器的 scrollHeight（作为后备）
        // scrollHeight/scrollWidth 返回的是布局大小，不受 transform scale 影响
        if (containerHeight === 0 || containerWidth === 0) {
          containerHeight = pdfPagesContainer.value.scrollHeight
          containerWidth = pdfPagesContainer.value.scrollWidth
        }

        // 方法3：如果 scrollHeight 也为 0，使用 offsetHeight（最后的后备）
        if (containerHeight === 0 || containerWidth === 0) {
          containerHeight = pdfPagesContainer.value.offsetHeight
          containerWidth = pdfPagesContainer.value.offsetWidth
        }

        if (containerHeight > 0 && containerWidth > 0) {
          // 关键修复：wrapper 的大小应该等于 container 的视觉大小（缩放后）
          // 因为 container 使用 transform scale，其布局大小不变，但视觉大小会改变
          // wrapper 作为滚动容器，应该匹配 container 的视觉大小，避免多余的滚动空间
          const scaleFactor = zoomScale.value / PDF_RENDER_SCALE
          pdfWrapperHeight.value = containerHeight * scaleFactor
          pdfWrapperWidth.value = containerWidth * scaleFactor

          if (process.env.NODE_ENV === 'development') {
            logger.debug('updateWrapperSize', {
              method:
                pageRefs.size > 0
                  ? 'pageRefs'
                  : pdfPagesContainer.value.scrollHeight > 0
                    ? 'scrollHeight'
                    : 'offsetHeight',
              containerHeight,
              containerWidth,
              wrapperHeight: pdfWrapperHeight.value,
              wrapperWidth: pdfWrapperWidth.value,
              zoomScale: zoomScale.value,
              scaleFactor: zoomScale.value / PDF_RENDER_SCALE,
              totalPdfPages: totalPdfPages.value,
              pageRefsSize: pageRefs.size,
              scrollHeight: pdfPagesContainer.value.scrollHeight,
              scrollWidth: pdfPagesContainer.value.scrollWidth,
              offsetHeight: pdfPagesContainer.value.offsetHeight,
              offsetWidth: pdfPagesContainer.value.offsetWidth
            })
          }
        } else {
          // 如果所有方法都失败，使用 auto 让浏览器自动计算
          pdfWrapperHeight.value = 'auto'
          pdfWrapperWidth.value = 'auto'

          if (process.env.NODE_ENV === 'development') {
            logger.warn('updateWrapperSize: 所有方法都失败，使用 auto', {
              scrollHeight: pdfPagesContainer.value.scrollHeight,
              scrollWidth: pdfPagesContainer.value.scrollWidth,
              offsetHeight: pdfPagesContainer.value.offsetHeight,
              offsetWidth: pdfPagesContainer.value.offsetWidth,
              pageRefsSize: pageRefs.size
            })
          }
        }
      })
    })
  })
}

// 包装器样式
const pdfWrapperStyle = computed(() => {
  return {
    position: 'relative' as const,
    height:
      typeof pdfWrapperHeight.value === 'number'
        ? `${pdfWrapperHeight.value}px`
        : pdfWrapperHeight.value,
    width:
      typeof pdfWrapperWidth.value === 'number'
        ? `${pdfWrapperWidth.value}px`
        : pdfWrapperWidth.value,
    display: 'block'
  }
})

// 用于强制重新渲染的 key（文件重新加载时更新）
const pdfRenderKey = ref(0)
// Monaco编辑器高亮装饰ID
let highlightDecorationIds: string[] = []

// watch 监听器将在 currentPdfPage 定义后添加

// 将文件路径编码为 file:// URL
// 注意：file:// URL 需要正确编码路径中的特殊字符（如 #、空格、中文字符等）
function encodeFilePathToUrl(filePath: string): string {
  if (!filePath) return ''

  // 移除 file:/// 前缀（如果存在）
  let path = filePath.replace(/^file:\/\/\//, '')

  // Windows 路径处理：将反斜杠转换为正斜杠
  path = path.replace(/\\/g, '/')

  // 分割路径为各个部分，对每个部分进行编码
  // 但保留路径分隔符和驱动器号（如 C:）
  const parts = path.split('/')
  const encodedParts = parts.map((part: string, index: number) => {
    if (index === 0 && part.endsWith(':')) {
      // Windows 驱动器号（如 C:）不需要编码
      return part
    }
    // 对路径的每一部分进行编码
    // 使用 encodeURIComponent 编码，但需要处理一些特殊情况
    return encodeURIComponent(part).replace(/%2F/g, '/')
  })

  return `file:///${encodedParts.join('/')}`
}

// 设置页面DOM引用
function setPageRef(el: any, pageNum: number) {
  if (el && el instanceof HTMLElement) {
    pageRefs.set(pageNum, el)
  } else if (el === null) {
    pageRefs.delete(pageNum)
  }
}

// 设置PDF查看模式
const setPdfViewMode = (mode: 'pointer' | 'hand') => {
  pdfViewMode.value = mode
  // 更新滚动条显示状态和光标样式
  nextTick(() => {
    if (pdfPagesWrapper.value) {
      if (mode === 'hand') {
        pdfPagesWrapper.value.style.cursor = 'grab'
        pdfPagesWrapper.value.style.userSelect = 'none'
      } else {
        pdfPagesWrapper.value.style.cursor = 'default'
        pdfPagesWrapper.value.style.userSelect = 'text'
      }
    }
  })
}

// 手型模式拖拽状态
let isDragging = false
let dragStartX = 0
let dragStartY = 0
let scrollStartX = 0
let scrollStartY = 0

// 手型模式鼠标按下
const handleHandModeMouseDown = (e: MouseEvent) => {
  if (pdfViewMode.value !== 'hand') return
  if (!pdfScrollbarRef.value) return

  const scrollbarEl = (pdfScrollbarRef.value as any).$el as HTMLElement | null
  const scrollbarWrap = scrollbarEl?.querySelector('.el-scrollbar__wrap') as HTMLElement | null
  if (!scrollbarWrap) return

  // 只处理左键
  if (e.button !== 0) return

  isDragging = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  scrollStartX = scrollbarWrap.scrollLeft
  scrollStartY = scrollbarWrap.scrollTop

  // 设置光标样式
  if (pdfPagesWrapper.value) {
    pdfPagesWrapper.value.style.cursor = 'grabbing'
  }

  // 添加全局事件监听器
  document.addEventListener('mousemove', handleHandModeMouseMoveGlobal)
  document.addEventListener('mouseup', handleHandModeMouseUpGlobal)
  document.body.style.userSelect = 'none' // 防止拖拽时选中文本

  e.preventDefault()
  e.stopPropagation()
}

// 手型模式鼠标移动（全局处理，确保鼠标移出元素时也能继续拖拽）
const handleHandModeMouseMoveGlobal = (e: MouseEvent) => {
  if (pdfViewMode.value !== 'hand' || !isDragging) return
  if (!pdfScrollbarRef.value) return

  const scrollbarEl = (pdfScrollbarRef.value as any).$el as HTMLElement | null
  const scrollbarWrap = scrollbarEl?.querySelector('.el-scrollbar__wrap') as HTMLElement | null
  if (!scrollbarWrap) return

  const deltaX = dragStartX - e.clientX
  const deltaY = dragStartY - e.clientY

  scrollbarWrap.scrollLeft = scrollStartX + deltaX
  scrollbarWrap.scrollTop = scrollStartY + deltaY

  e.preventDefault()
  e.stopPropagation()
}

// 手型模式鼠标移动（元素内）
const handleHandModeMouseMove = (e: MouseEvent) => {
  handleHandModeMouseMoveGlobal(e)
}

// 手型模式鼠标释放（全局）
const handleHandModeMouseUpGlobal = () => {
  if (pdfViewMode.value !== 'hand') return

  isDragging = false

  // 移除全局事件监听器
  document.removeEventListener('mousemove', handleHandModeMouseMoveGlobal)
  document.removeEventListener('mouseup', handleHandModeMouseUpGlobal)
  document.body.style.userSelect = '' // 恢复文本选择

  // 恢复光标样式
  if (pdfPagesWrapper.value) {
    pdfPagesWrapper.value.style.cursor = pdfViewMode.value === 'hand' ? 'grab' : 'default'
  }
}

// 手型模式鼠标释放（元素内）
const handleHandModeMouseUp = () => {
  handleHandModeMouseUpGlobal()
}

// 触摸事件状态
let touchStartDistance = 0
let touchStartScale = 1
let touchStartScrollX = 0
let touchStartScrollY = 0
let touchStartX = 0
let touchStartY = 0
let isPinching = false

// 计算两点间距离
const getTouchDistance = (touch1: Touch, touch2: Touch): number => {
  const dx = touch1.clientX - touch2.clientX
  const dy = touch1.clientY - touch2.clientY
  return Math.sqrt(dx * dx + dy * dy)
}

// 触摸开始
const handleTouchStart = (e: TouchEvent) => {
  if (pdfViewMode.value !== 'hand') return
  if (!pdfScrollbarRef.value) return

  const touches = e.touches
  if (touches.length === 2) {
    // 二指缩放
    isPinching = true
    touchStartDistance = getTouchDistance(touches[0], touches[1])
    touchStartScale = zoomScale.value
    e.preventDefault()
  } else if (touches.length === 1) {
    // 单指拖拽
    const scrollbarEl = (pdfScrollbarRef.value as any).$el as HTMLElement | null
    const scrollbarWrap = scrollbarEl?.querySelector('.el-scrollbar__wrap') as HTMLElement | null
    if (scrollbarWrap) {
      isDragging = true
      touchStartX = touches[0].clientX
      touchStartY = touches[0].clientY
      touchStartScrollX = scrollbarWrap.scrollLeft
      touchStartScrollY = scrollbarWrap.scrollTop
    }
  }
}

// 触摸移动
const handleTouchMove = (e: TouchEvent) => {
  if (pdfViewMode.value !== 'hand') return
  if (!pdfScrollbarRef.value) return

  const touches = e.touches
  const scrollbarEl = (pdfScrollbarRef.value as any).$el as HTMLElement | null
  const scrollbarWrap = scrollbarEl?.querySelector('.el-scrollbar__wrap') as HTMLElement | null

  if (touches.length === 2 && isPinching && scrollbarWrap) {
    // 二指缩放
    const currentDistance = getTouchDistance(touches[0], touches[1])
    const scaleRatio = currentDistance / touchStartDistance
    const newScale = Math.min(Math.max(touchStartScale * scaleRatio, 0.2), 5)
    const optimalScale = calculateOptimalScale(newScale)
    safeUpdateZoomScale(optimalScale)
    e.preventDefault()
  } else if (touches.length === 1 && isDragging && scrollbarWrap) {
    // 单指拖拽
    const deltaX = touchStartX - touches[0].clientX
    const deltaY = touchStartY - touches[0].clientY
    scrollbarWrap.scrollLeft = touchStartScrollX + deltaX
    scrollbarWrap.scrollTop = touchStartScrollY + deltaY
    e.preventDefault()
  }
}

// 触摸结束
const handleTouchEnd = () => {
  if (pdfViewMode.value !== 'hand') return

  isPinching = false
  isDragging = false
}

// 处理PDF滚轮事件（指针模式：Ctrl+滚轮缩放；手型模式：直接缩放）
function handlePdfWheel(event: WheelEvent) {
  if (!isPdfContainerReady()) return

  if (pdfViewMode.value === 'hand') {
    // 手型模式：直接使用滚轮缩放（不需要Ctrl）
    event.preventDefault()
    event.stopPropagation()
    const currentValue = zoomScale.value
    const delta = event.deltaY > 0 ? -0.1 : 0.1 // 上滚放大，下滚缩小
    const newScale = Math.min(Math.max(currentValue + delta, 0.2), 5)
    const optimalScale = calculateOptimalScale(newScale)

    if (Math.abs(optimalScale - currentValue) > 0.05) {
      safeUpdateZoomScale(optimalScale)
    }
  } else {
    // 指针模式：Ctrl+滚轮缩放
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      event.stopPropagation()
      const currentValue = zoomScale.value
      const delta = event.deltaY > 0 ? -0.1 : 0.1
      const newScale = Math.min(Math.max(currentValue + delta, 0.2), 5)
      const optimalScale = calculateOptimalScale(newScale)

      if (Math.abs(optimalScale - currentValue) > 0.05) {
        safeUpdateZoomScale(optimalScale)
      }
    }
  }
}

async function initPdfJs() {
  if (currentPath.value && currentPath.value.toLowerCase().endsWith('.tex')) {
    const normalized = (currentPath.value || '').replace(/\\/g, '/')
    const pdfPath = normalized.toLowerCase().replace(/\.tex$/i, '.pdf')
    pdfUrl.value = encodeFilePathToUrl(pdfPath)
  } else {
    pdfUrl.value = ''
  }

  pdfInitialized = true

  await nextTick()
  if (pdfUrl.value && pdfUrl.value !== 'file:///' && pdfUrl.value.trim() !== '') {
    // 有有效 URL 就显示面板，PdfPreviewPanel 会自行加载；再尝试 loadPdf 做映射等
    showPdfPanel.value = true
    try {
      await loadPdf(pdfUrl.value)
    } catch (_) {
      // 忽略，面板已显示
    }
  } else {
    showPdfPanel.value = false
  }

  // 绑定wheel事件到容器（用于Ctrl+滚轮缩放）
  await nextTick()
  if (pdfPagesContainer.value) {
    pdfPagesContainer.value.addEventListener('wheel', handlePdfWheel as any, { passive: false })
  }

  // 设置滚动监听器（用于自动检测当前页面）
  await nextTick()
  setupScrollListener()
}
// 检查 PDF 容器是否准备好
const isPdfContainerReady = () => {
  if (isComponentUnmounted) return false
  if (!showPdfPanel.value || !isValidPdfUrl.value) return false
  if (!pdfPagesContainer.value) return false
  // 检查是否有至少一个页面元素存在
  const firstPage = pageRefs.get(1)
  return firstPage !== undefined && firstPage !== null
}

// 安全更新缩放比例（带检查）
const safeUpdateZoomScale = (newScale: number) => {
  if (isComponentUnmounted || !isPdfContainerReady()) return
  const oldScale = zoomScale.value
  zoomScale.value = newScale
  // 调试：检查 scale 是否真的更新了
  if (process.env.NODE_ENV === 'development') {
    //logger.debug('缩放比例更新', { oldScale, newScale });
  }
}

const pdfZoomIn = () => {
  if (!isPdfContainerReady()) return
  const currentValue = zoomScale.value
  const newScale = Math.min(Math.max(currentValue + 0.1, 0.2), 5)
  const optimalScale = calculateOptimalScale(newScale)
  safeUpdateZoomScale(optimalScale)
}
const pdfZoomOut = () => {
  if (!isPdfContainerReady()) return
  const currentValue = zoomScale.value
  const newScale = Math.min(Math.max(currentValue - 0.1, 0.2), 5)
  const optimalScale = calculateOptimalScale(newScale)
  safeUpdateZoomScale(optimalScale)
}
const pdfZoomReset = () => {
  if (!isPdfContainerReady()) return
  safeUpdateZoomScale(calculateOptimalScale(1.0))
}
let pdfDoc: any = null // pdfjs document
const currentPdfPage = ref(1)
const totalPdfPages = ref(0)
const inputPdfPage = ref(1)
// 跟踪当前已加载的PDF URL，避免重复加载
let loadedPdfUrl: string | null = null

// 滚动到指定页面（横向和纵向都居中）
async function scrollToPage(pageNumber: number) {
  await nextTick()
  const pageElement = pageRefs.get(pageNumber)
  if (pageElement && pdfScrollbarRef.value) {
    const scrollbarEl = (pdfScrollbarRef.value as any).$el as HTMLElement | null
    const scrollbarWrap = scrollbarEl?.querySelector('.el-scrollbar__wrap') as HTMLElement | null
    if (scrollbarWrap && pageElement) {
      const containerRect = scrollbarWrap.getBoundingClientRect()
      const pageRect = pageElement.getBoundingClientRect()

      // 计算纵向居中位置
      const scrollTop = scrollbarWrap.scrollTop
      const pageTopInScrollContent = scrollTop + pageRect.top - containerRect.top
      const viewportHeight = containerRect.height
      const pageHeight = pageRect.height
      const targetScrollTop = pageTopInScrollContent - (viewportHeight - pageHeight) / 2

      // 计算横向居中位置
      const scrollLeft = scrollbarWrap.scrollLeft
      const pageLeftInScrollContent = scrollLeft + pageRect.left - containerRect.left
      const viewportWidth = containerRect.width
      const pageWidth = pageRect.width
      const targetScrollLeft = pageLeftInScrollContent - (viewportWidth - pageWidth) / 2

      scrollbarWrap.scrollTo({
        top: Math.max(0, targetScrollTop),
        left: Math.max(0, targetScrollLeft),
        behavior: 'smooth'
      })
    }
  }
}

// 标志：是否正在自动更新页码（避免触发跳转）
let isAutoUpdatingPage = false

// 监听页码变化，自动滚动到对应页面（仅在非自动更新时）
watch(
  () => currentPdfPage.value,
  (newPage) => {
    if (!isAutoUpdatingPage) {
      scrollToPage(newPage)
    }
  }
)

// 检测当前视口显示的页面（横向和纵向都在中心）
function detectCurrentPage() {
  if (!pdfScrollbarRef.value || !pdfPagesContainer.value || totalPdfPages.value === 0) {
    return
  }

  const scrollbarEl = (pdfScrollbarRef.value as any).$el as HTMLElement | null
  const scrollbarWrap = scrollbarEl?.querySelector('.el-scrollbar__wrap') as HTMLElement | null
  if (!scrollbarWrap) return

  const containerRect = scrollbarWrap.getBoundingClientRect()
  const viewportCenterX = containerRect.left + containerRect.width / 2
  const viewportCenterY = containerRect.top + containerRect.height / 2

  // 查找视口中心（横向和纵向）对应的页面
  let currentPage = 1
  let minDistance = Infinity

  for (let pageNum = 1; pageNum <= totalPdfPages.value; pageNum++) {
    const pageElement = pageRefs.get(pageNum)
    if (!pageElement) continue

    const pageRect = pageElement.getBoundingClientRect()
    const pageCenterX = pageRect.left + pageRect.width / 2
    const pageCenterY = pageRect.top + pageRect.height / 2

    // 计算到视口中心的距离（欧几里得距离）
    const distanceX = Math.abs(viewportCenterX - pageCenterX)
    const distanceY = Math.abs(viewportCenterY - pageCenterY)
    const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY)

    // 如果页面中心在视口中心附近（容差范围内），优先选择
    const toleranceX = pageRect.width / 2
    const toleranceY = pageRect.height / 2
    const isInCenter = distanceX <= toleranceX && distanceY <= toleranceY

    if (isInCenter) {
      // 在中心范围内的页面，选择距离最近的
      if (distance < minDistance) {
        minDistance = distance
        currentPage = pageNum
      }
    } else if (minDistance === Infinity) {
      // 如果还没有找到在中心范围内的页面，记录最近的页面
      if (distance < minDistance) {
        minDistance = distance
        currentPage = pageNum
      }
    }
  }

  // 如果检测到的页面与当前页面不同，更新页码（不触发跳转）
  if (currentPage !== currentPdfPage.value) {
    isAutoUpdatingPage = true
    currentPdfPage.value = currentPage
    inputPdfPage.value = currentPage
    // 使用nextTick确保watch已经处理完
    nextTick(() => {
      isAutoUpdatingPage = false
    })
  }
}

// 滚动事件处理（防抖）
const handleScrollDebounced = debounce(() => {
  detectCurrentPage()
}, 100)

// 监听滚动事件
function setupScrollListener() {
  if (!pdfScrollbarRef.value) return

  const scrollbarEl = (pdfScrollbarRef.value as any).$el as HTMLElement | null
  const scrollbarWrap = scrollbarEl?.querySelector('.el-scrollbar__wrap') as HTMLElement | null
  if (scrollbarWrap) {
    scrollbarWrap.addEventListener('scroll', handleScrollDebounced, { passive: true })
  }
}

// 移除滚动监听器
function removeScrollListener() {
  if (!pdfScrollbarRef.value) return

  const scrollbarEl = (pdfScrollbarRef.value as any).$el as HTMLElement | null
  const scrollbarWrap = scrollbarEl?.querySelector('.el-scrollbar__wrap') as HTMLElement | null
  if (scrollbarWrap) {
    scrollbarWrap.removeEventListener('scroll', handleScrollDebounced)
  }
}

// 始终启用文本选择监听
onMounted(() => {
  nextTick(() => {
    setupTextSelectionListener()
  })
})

// 文本选择监听器
let textSelectionHandler: ((e: Event) => void) | null = null

function setupTextSelectionListener() {
  if (textSelectionHandler) return

  textSelectionHandler = () => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const selectedText = selection.toString().trim()
    if (!selectedText || selectedText.length < 2) return

    // 使用选中的文本定位到Monaco编辑器
    locateTextInMonaco(selectedText)
  }

  // 监听文本选择变化
  document.addEventListener('selectionchange', textSelectionHandler)
}

function removeTextSelectionListener() {
  if (textSelectionHandler) {
    document.removeEventListener('selectionchange', textSelectionHandler)
    textSelectionHandler = null
  }
}

// 高亮代码行
function highlightCodeLine(
  monacoEditor: monaco.editor.IStandaloneCodeEditor | monaco.editor.ICodeEditor,
  lineNumber: number
) {
  // 清除之前的高亮
  if (highlightDecorationIds.length > 0) {
    monacoEditor.deltaDecorations(highlightDecorationIds, [])
    highlightDecorationIds = []
  }

  // 获取该行的内容，计算列范围
  const model = monacoEditor.getModel()
  if (!model) return

  const lineContent = model.getLineContent(lineNumber)
  const lineLength = lineContent.length

  // 创建整行高亮装饰
  const decoration: monaco.editor.IModelDeltaDecoration = {
    range: new monaco.Range(lineNumber, 1, lineNumber, lineLength + 1),
    options: {
      isWholeLine: true,
      className: 'pdf-locate-highlight-line',
      minimap: {
        color: 'rgba(64, 158, 255, 0.3)',
        position: monaco.editor.MinimapPosition.Inline
      },
      overviewRuler: {
        color: 'rgba(64, 158, 255, 0.8)',
        position: monaco.editor.OverviewRulerLane.Full
      },
      hoverMessage: { value: '从PDF定位到此位置' }
    }
  }

  highlightDecorationIds = monacoEditor.deltaDecorations([], [decoration])

  // 3秒后自动清除高亮
  setTimeout(() => {
    if (highlightDecorationIds.length > 0) {
      monacoEditor.deltaDecorations(highlightDecorationIds, [])
      highlightDecorationIds = []
    }
  }, 3000)
}

// 高亮代码范围
function highlightCodeRange(
  monacoEditor: monaco.editor.IStandaloneCodeEditor | monaco.editor.ICodeEditor,
  range: any
) {
  // 清除之前的高亮
  if (highlightDecorationIds.length > 0) {
    monacoEditor.deltaDecorations(highlightDecorationIds, [])
    highlightDecorationIds = []
  }

  // 处理不同的range格式：可能是 {start: {line, column}, end: {line, column}} 或 monaco.IRange
  let startLine: number, startColumn: number, endLine: number, endColumn: number

  if (range.start && range.end) {
    // TextRange 格式：{start: {line, column}, end: {line, column}}
    startLine = range.start.line || range.start.lineNumber
    startColumn = range.start.column || range.start.column
    endLine = range.end.line || range.end.lineNumber
    endColumn = range.end.column || range.end.column
  } else {
    // monaco.IRange 格式：{startLineNumber, startColumn, endLineNumber, endColumn}
    startLine = range.startLineNumber
    startColumn = range.startColumn
    endLine = range.endLineNumber
    endColumn = range.endColumn
  }

  // 创建范围高亮装饰
  const monacoRange = new monaco.Range(startLine, startColumn, endLine, endColumn)

  const decoration: monaco.editor.IModelDeltaDecoration = {
    range: monacoRange,
    options: {
      isWholeLine: false,
      className: 'pdf-locate-highlight-range',
      minimap: {
        color: 'rgba(64, 158, 255, 0.3)',
        position: monaco.editor.MinimapPosition.Inline
      },
      overviewRuler: {
        color: 'rgba(64, 158, 255, 0.8)',
        position: monaco.editor.OverviewRulerLane.Full
      },
      hoverMessage: { value: '从PDF定位到此位置' }
    }
  }

  highlightDecorationIds = monacoEditor.deltaDecorations([], [decoration])

  // 同时选中文本
  monacoEditor.setSelection(monacoRange)

  // 3秒后自动清除高亮
  setTimeout(() => {
    if (highlightDecorationIds.length > 0) {
      monacoEditor.deltaDecorations(highlightDecorationIds, [])
      highlightDecorationIds = []
    }
  }, 3000)
}

// 使用选中的文本定位到Monaco编辑器
function locateTextInMonaco(selectedText: string) {
  if (!textEditorAdapter.value || !editorId.value) return

  const editors = monaco.editor.getEditors()
  const monacoEditor = editors.find((e) => e.getId?.() === editorId.value) || editors[0]
  if (!monacoEditor) return

  try {
    if (typeof textEditorAdapter.value.locateText === 'function') {
      const range = (textEditorAdapter.value as any).locateText(selectedText, {
        matchCase: false,
        wholeWord: false,
        useRegex: false
      })

      if (range) {
        const monacoPosition = new monaco.Position(range.start.line, range.start.column)
        monacoEditor.setPosition(monacoPosition)
        monacoEditor.revealLineInCenter(range.start.line)
        // 高亮找到的文本范围
        highlightCodeRange(monacoEditor, range)
      }
    }
  } catch (error) {
    logger.error('定位文本到Monaco失败', error)
  }
}

// PDF文本到Monaco源码的映射系统
// 结构：Map<pageNumber, Array<{pdfRange: {x, y, width, height}, monacoPosition: {line, column}}>>
const pdfToSourceMap = new Map()
// 反向映射：Monaco位置到PDF位置
// 结构：Map<`${line}-${column}`, {pageNumber, pdfRange}>
const sourceToPdfMap = new Map()
let isMappingInProgress = false

// 文字更新时自动重新建立映射（debounce 3秒）
const rebuildMappingDebounced = debounce(() => {
  if (!isActive.value) return
  if (!pdfDoc) return
  logger.debug('文字更新，准备重新建立PDF映射')
  buildPdfToSourceMapping()
}, 3000)

watch(
  () => currentTex.value,
  (incoming) => {
    //logger.debug("LaTeXEditor currentTex changed", { incoming })
    const nextValue = incoming ?? ''
    textBuffer = nextValue
    if (!isActive.value) return
    const monacoEditor = getActiveMonacoEditor()
    if (!monacoEditor) return

    // 检查Monaco编辑器中的内容是否与currentTex不同
    const editorContent = monacoEditor.getValue()

    // 如果内容不同，说明是外部更新，需要同步到Monaco
    if (editorContent !== nextValue) {
      // 设置标志，避免触发onDidChangeModelContent中的同步逻辑
      isUpdatingFromExternal = true

      try {
        // 保存当前光标位置
        const position = monacoEditor.getPosition()

        // 更新Monaco编辑器内容
        monacoEditor.setValue(nextValue)

        // 恢复光标位置（如果可能）
        if (position) {
          monacoEditor.setPosition(position)
          monacoEditor.revealLineInCenter(position.lineNumber)
        }

        logger.debug('LaTeXEditor: 已同步外部文件修改到Monaco编辑器', {
          contentLength: nextValue.length,
          editorLength: editorContent.length
        })
      } catch (error) {
        logger.error('LaTeXEditor: 同步外部文件修改失败', error)
      } finally {
        // 使用setTimeout确保在Monaco的onDidChangeModelContent事件处理完成后重置标志
        // Monaco的setValue可能会异步触发内容变化事件
        setTimeout(() => {
          isUpdatingFromExternal = false
        }, 0)
      }
    }

    // 触发重新建立映射
    rebuildMappingDebounced()
  }
)

watch(
  () => props.active,
  (active) => {
    //logger.debug("LaTeXEditor props.active changed", { active })
    if (!editor.value) return
    if (!active) {
      textBuffer = currentTex.value ?? ''
      return
    }
    // 如果PDF已经加载过且URL相同，不需要重新加载，只需要显示面板
    if (pdfUrl.value && pdfInitialized) {
      if (pdfDoc && loadedPdfUrl === pdfUrl.value) {
        // PDF已经加载过，只需要显示面板
        showPdfPanel.value = true
        // 更新包装器大小
        nextTick(() => {
          updateWrapperSize()
        })
      } else {
        // PDF未加载或URL变化，需要加载
        nextTick(async () => {
          const loaded = await loadPdf(pdfUrl.value)
          showPdfPanel.value = loaded
        })
      }
    }
  },
  { immediate: true }
)

watch(currentPath, async (path) => {
  if (!path || !path.toLowerCase().endsWith('.tex')) {
    pdfUrl.value = ''
    loadedPdfUrl = null
    showPdfPanel.value = false
    return
  }
  const normalized = (path || '').replace(/\\/g, '/')
  const pdfPath = normalized.toLowerCase().replace(/\.tex$/i, '.pdf')
  const nextUrl = encodeFilePathToUrl(pdfPath)

  if (pdfUrl.value === nextUrl && pdfDoc && loadedPdfUrl === nextUrl) {
    return
  }

  pdfUrl.value = nextUrl
  const urlValid = nextUrl && nextUrl !== 'file:///' && nextUrl.trim() !== ''
  if (urlValid) {
    showPdfPanel.value = true
  }
  if (!isActive.value) return
  if (pdfInitialized && urlValid) {
    try {
      await loadPdf(nextUrl)
    } catch (_) {
      // 面板已显示，PdfPreviewPanel 会自行加载
    }
  }
})

watch(
  () => showPdfPanel.value,
  (visible) => {
    //logger.debug("LaTeXEditor showPdfPanel changed", { visible })
    nextTick(() => {
      if (visible) {
        ensurePdfWithinBounds()
        // 如果PDF URL存在且已初始化
        if (pdfUrl.value && pdfInitialized) {
          // 如果PDF已经加载过且URL相同，不需要重新加载
          if (pdfDoc && loadedPdfUrl === pdfUrl.value) {
            // PDF文档已存在，VuePdf 组件会自动响应 page 和 scale 变化
            // 更新包装器大小
            updateWrapperSize()
          } else {
            // PDF文档不存在或URL变化，需要重新加载
            loadPdf(pdfUrl.value, true) // 保留当前页码
          }
        }
      } else {
        // 当PDF面板隐藏时，调整面板大小
        if (pdfResizableRef.value?.setSidebarSize) {
          pdfResizableRef.value.setSidebarSize(LATEX_LAYOUT.pdf.minWidth)
        }
      }
    })
  }
)

// 监听 zoomScale 变化，更新包装器大小
// 因为 transform: scale() 不改变布局大小，但会改变视觉大小
// wrapper 需要匹配 container 的视觉大小（布局大小 * 缩放因子）

// 监听 PDF 页面数量变化，更新包装器大小
watch(
  () => totalPdfPages.value,
  () => {
    nextTick(() => {
      updateWrapperSize()
    })
  }
)

// 监听 zoomScale 变化，更新布局
watch(
  () => zoomScale.value,
  (newScale, oldScale) => {
    if (process.env.NODE_ENV === 'development') {
      //logger.debug('zoomScale 变化', { oldScale, newScale });
    }
    // 缩放变化时，重新计算包装器大小
    nextTick(() => {
      updateWrapperSize()
    })
  }
)

// 监听 pagesPerRow 变化，更新布局
watch(
  () => pagesPerRow.value,
  () => {
    nextTick(() => {
      updateWrapperSize()
    })
  }
)

function goPrevPage() {
  if (currentPdfPage.value > 1) {
    currentPdfPage.value--
    inputPdfPage.value = currentPdfPage.value
    // watch会自动触发滚动
  }
}

function goNextPage() {
  if (currentPdfPage.value < totalPdfPages.value) {
    currentPdfPage.value++
    inputPdfPage.value = currentPdfPage.value
    // watch会自动触发滚动
  }
}

function jumpToPage() {
  let page = Math.min(Math.max(inputPdfPage.value, 1), totalPdfPages.value)
  currentPdfPage.value = page
  inputPdfPage.value = page
  // watch会自动触发滚动
}

// 获取PDF页面对象（用于映射功能）
async function getPdfPage(pageNumber: number) {
  if (!pdfDoc) return null
  return await pdfDoc.getPage(pageNumber)
}

// 处理PDF文本双击定位
async function handlePdfTextClick(event: MouseEvent) {
  // 从Monaco全局获取编辑器实例
  if (!editorId.value) return
  const editors = monaco.editor.getEditors()
  const monacoEditor = editors.find((e) => e.getId?.() === editorId.value) || editors[0]

  if (!pdfDoc || !monacoEditor) {
    logger.warn('PDF双击定位失败: pdfDoc或editor不存在')
    return
  }

  try {
    const page = await pdfDoc.getPage(currentPdfPage.value)
    const viewport = page.getViewport({ scale: 1 }) // 使用标准viewport（scale=1）用于坐标转换

    // 获取当前页面的DOM元素
    const currentPageElement = pageRefs.get(currentPdfPage.value)
    if (!currentPageElement) {
      logger.warn('PDF双击定位失败: 当前页面元素不存在')
      return
    }

    // VuePdf 组件会在容器内渲染 canvas，查找当前页面的 canvas 元素
    const canvas = currentPageElement.querySelector('canvas') as HTMLCanvasElement | null
    if (!canvas) {
      logger.warn('PDF双击定位失败: canvas不存在')
      return
    }

    const pageRect = currentPageElement.getBoundingClientRect()
    const canvasRect = canvas.getBoundingClientRect()

    // 获取canvas的样式尺寸（逻辑像素）
    const canvasStyleWidth = canvasRect.width || viewport.width
    const canvasStyleHeight = canvasRect.height || viewport.height

    // 计算点击位置相对于canvas的坐标
    const canvasX = event.clientX - canvasRect.left
    const canvasY = event.clientY - canvasRect.top

    // 转换为PDF相对坐标（相对于页面尺寸的比例，0-1之间）
    // 这样不受缩放影响
    // PDF坐标系统：左下角为原点，Y轴向上
    // Canvas坐标系统：左上角为原点，Y轴向下
    const relativeX = canvasX / canvasStyleWidth
    const relativeY = 1 - canvasY / canvasStyleHeight // 转换为从下往上的相对坐标

    // 优先使用映射系统定位
    const pageMappings = pdfToSourceMap.get(currentPdfPage.value)

    if (pageMappings && pageMappings.length > 0) {
      // 找到点击位置最近的映射项
      let closestMapping = null
      let minDistance = Infinity

      for (const mapping of pageMappings) {
        const range = mapping.pdfRange // range是相对坐标 {x, y, width, height} 都是0-1之间的比例
        // 检查点击是否在范围内（使用相对坐标，容差也是相对的）
        const tolerance = 0.01 // 1%的容差
        const inXRange =
          relativeX >= range.x - tolerance && relativeX <= range.x + range.width + tolerance
        const inYRange =
          relativeY >= range.y - tolerance && relativeY <= range.y + range.height + tolerance

        if (inXRange && inYRange) {
          // 计算到文本中心的距离（使用相对坐标）
          const centerX = range.x + range.width / 2
          const centerY = range.y + range.height / 2
          const distance = Math.sqrt(
            Math.pow(relativeX - centerX, 2) + Math.pow(relativeY - centerY, 2)
          )

          if (distance < minDistance) {
            minDistance = distance
            closestMapping = mapping
          }
        }
      }

      if (closestMapping) {
        // 使用映射直接定位
        const position = closestMapping.monacoPosition

        try {
          const monacoPosition = new monaco.Position(position.line, position.column)
          monacoEditor.setPosition(monacoPosition)
          monacoEditor.revealLineInCenter(position.line)

          // 高亮整行代码
          highlightCodeLine(monacoEditor, position.line)
          return
        } catch (error) {
          logger.error('设置Monaco位置失败', error)
          throw error
        }
      }
    }

    // 如果映射系统不可用，使用文本搜索方式
    // 获取点击位置附近的文本项，查找上下文本
    const textContent = await page.getTextContent()
    const textItems = textContent.items

    // 获取标准viewport（scale=1）用于坐标转换
    const standardViewport = page.getViewport({ scale: 1 })

    // 转换为PDF坐标（左下角为原点）
    const pdfX = relativeX * standardViewport.width
    const pdfY = relativeY * standardViewport.height

    // 查找点击位置附近的文本项，按Y坐标排序
    const nearbyItems = []
    for (const item of textItems) {
      if (!item.transform || !item.str || !item.str.trim()) continue

      const itemX = item.transform[4]
      const itemY = item.transform[5]
      const itemHeight = item.height || 12
      const itemWidth = item.width || 0

      // 计算到点击位置的距离（考虑Y坐标的优先级）
      const deltaX = Math.abs(itemX + itemWidth / 2 - pdfX)
      const deltaY = Math.abs(itemY + itemHeight / 2 - pdfY)

      // 如果文本项在点击位置的合理范围内
      if (deltaX < standardViewport.width * 0.3 && deltaY < standardViewport.height * 0.1) {
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
        nearbyItems.push({
          item,
          distance,
          y: itemY,
          text: item.str.trim()
        })
      }
    }

    // 按距离和Y坐标排序，优先选择距离近且Y坐标接近的
    nearbyItems.sort((a, b) => {
      if (Math.abs(a.y - pdfY) < Math.abs(b.y - pdfY)) return -1
      if (Math.abs(a.y - pdfY) > Math.abs(b.y - pdfY)) return 1
      return a.distance - b.distance
    })

    // 尝试定位文本：优先使用最近的文本，如果失败则尝试上下文本
    let found = false
    for (let i = 0; i < Math.min(nearbyItems.length, 5); i++) {
      const nearbyItem = nearbyItems[i]
      const searchText = nearbyItem.text

      if (!textEditorAdapter.value || typeof textEditorAdapter.value.locateText !== 'function')
        continue

      try {
        const range = (textEditorAdapter.value as any).locateText(searchText, {
          matchCase: false,
          wholeWord: false,
          useRegex: false
        })

        if (range) {
          const monacoPosition = new monaco.Position(range.start.line, range.start.column)
          monacoEditor.setPosition(monacoPosition)
          monacoEditor.revealLineInCenter(range.start.line)
          // 高亮找到的文本范围
          highlightCodeRange(monacoEditor, range)
          found = true
          break
        }
      } catch (error) {
        logger.error('locateText调用失败', error)
        continue
      }
    }

    if (!found) {
      eventBus.emit('show-info', t('latexEditor.notification.clickToLocate'))
    }
  } catch (error) {
    logger.error('PDF文本定位失败', error)
  }
}

// 建立PDF文本到源码的映射（异步）
async function buildPdfToSourceMapping() {
  logger.debug('=== 开始建立PDF到源码映射 ===')

  if (!editorId) return
  // 从Monaco全局获取编辑器实例
  const editors = monaco.editor.getEditors()
  const id =
    editorId && typeof editorId === 'object' && 'value' in editorId ? editorId.value : editorId
  const monacoEditor = editors.find((e) => e.getId?.() === id) || editors[0]

  if (!pdfDoc) {
    logger.warn('建立映射失败: pdfDoc不存在')
    return
  }
  if (!monacoEditor) {
    logger.warn('建立映射失败: editor不存在', {
      editorId: editorId.value,
      totalEditors: editors.length
    })
    return
  }
  if (!textEditorAdapter.value) {
    logger.warn('建立映射失败: textEditorAdapter不存在')
    return
  }
  if (isMappingInProgress) {
    logger.debug('映射正在进行中，跳过')
    return
  }

  isMappingInProgress = true
  pdfToSourceMap.clear()
  sourceToPdfMap.clear()
  logger.debug('清空旧映射')

  try {
    const totalPages = pdfDoc.numPages
    logger.debug('开始建立PDF到源码映射', { totalPages })

    let totalMapped = 0
    let totalFailed = 0

    // 异步处理每一页，避免阻塞
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      try {
        //logger.debug(`处理页面 ${pageNum}/${totalPages}`);
        const page = await pdfDoc.getPage(pageNum)
        const textContent = await page.getTextContent()
        const textItems = textContent.items
        //logger.debug(`页面 ${pageNum} 文本项数量`, { textItemsCount: textItems.length });

        // 获取标准viewport（scale=1）用于坐标转换
        const standardViewport = page.getViewport({ scale: 1 })

        const pageMappings = []
        let pageMapped = 0
        let pageFailed = 0

        // 批量处理文本项，避免一次性处理太多
        const BATCH_SIZE = 50
        for (let i = 0; i < textItems.length; i += BATCH_SIZE) {
          const batch = textItems.slice(i, i + BATCH_SIZE)

          for (const item of batch) {
            if (!item.transform || !item.str || !item.str.trim()) continue

            // 获取文本项的绝对坐标
            const itemX = item.transform[4]
            const itemY = item.transform[5]
            const itemHeight = item.height || 12
            const itemWidth = item.width || 0

            // 转换为相对坐标（相对于标准页面尺寸，0-1之间）
            // 这样不受缩放影响
            const relativeX = itemX / standardViewport.width
            const relativeY = itemY / standardViewport.height
            const relativeWidth = itemWidth / standardViewport.width
            const relativeHeight = itemHeight / standardViewport.height

            // 清理文本，用于查找
            const cleanText = item.str.trim()
            if (cleanText.length < 2) continue

            // 使用textEditorAdapter的locateText方法查找位置
            try {
              if (
                !textEditorAdapter.value ||
                typeof textEditorAdapter.value.locateText !== 'function'
              )
                continue
              const range = (textEditorAdapter.value as any).locateText(cleanText, {
                matchCase: false,
                wholeWord: false,
                useRegex: false
              })

              if (range) {
                const mapping = {
                  pdfRange: {
                    x: relativeX,
                    y: relativeY,
                    width: relativeWidth,
                    height: relativeHeight
                  },
                  monacoPosition: {
                    line: range.start.line,
                    column: range.start.column
                  },
                  text: cleanText
                }
                pageMappings.push(mapping)

                // 建立反向映射
                const key = `${range.start.line}-${range.start.column}`
                sourceToPdfMap.set(key, {
                  pageNumber: pageNum,
                  pdfRange: mapping.pdfRange
                })

                pageMapped++
                totalMapped++
              } else {
                pageFailed++
                totalFailed++
              }
            } catch (error) {
              // 单个文本项映射失败，跳过继续
              pageFailed++
              totalFailed++
              continue
            }
          }

          // 每处理一批后，让出控制权
          await new Promise((resolve) => setTimeout(resolve, 0))
        }

        pdfToSourceMap.set(pageNum, pageMappings)
      } catch (error) {
        logger.warn(`页面 ${pageNum} 映射失败`, error)
        // 继续处理下一页
        continue
      }
    }

    logger.debug('PDF到源码映射建立完成', {
      totalPages: pdfToSourceMap.size,
      totalMapped,
      totalFailed
    })
  } catch (error) {
    logger.error('建立PDF到源码映射失败', error)
  } finally {
    isMappingInProgress = false
  }
}

// 处理 PDF 渲染错误
function handlePdfError(error: any, pageNum: number) {
  // 如果组件已卸载，忽略所有错误
  if (isComponentUnmounted) return

  // 忽略常见的 DOM 相关错误（通常是因为组件卸载或 DOM 未准备好）
  const errorMessage = error?.message || String(error)
  const errorStack = error?.stack || String(error)

  // 检查是否是 getComputedStyle 相关的错误
  const isGetComputedStyleError =
    errorMessage.includes('getComputedStyle') ||
    errorMessage.includes('not of type') ||
    errorMessage.includes('Element') ||
    errorStack.includes('getComputedStyle') ||
    errorStack.includes('scaleCanvas2') ||
    errorStack.includes('renderPage2')

  if (isGetComputedStyleError) {
    // 这是预期的错误，当组件卸载或 DOM 未准备好时会发生
    // 完全忽略，不记录日志，避免日志污染
    return
  }

  // 其他错误正常记录
  logger.warn('PDF 渲染错误', { pageNum, error: errorMessage, stack: errorStack })
}

// 处理 PDF 总页数事件
function handleNumPages(numPages: number) {
  totalPdfPages.value = numPages
  //logger.debug('PDF 总页数:', numPages);
}

// 处理 PDF 加载完成事件
function handlePdfLoaded(pdf: any) {
  logger.debug('PDF 加载完成:', pdf)
  // 可以在这里处理 PDF 加载后的逻辑
  if (pdf && pdf.numPages) {
    totalPdfPages.value = pdf.numPages
  }
  // PDF 加载完成后，更新包装器大小
  nextTick(() => {
    updateWrapperSize()
  })
}

// 在加载 PDF 后初始化
// 返回 true 表示加载成功，false 表示加载失败（文件不存在等）
async function loadPdf(url: string, preservePage = false, forceReload = false): Promise<boolean> {
  if (!url || url.trim() === '') {
    // 如果 URL 为空，不加载 PDF
    loadedPdfUrl = null
    return false
  }

  // 如果PDF已经加载过且URL相同，且不强制重新加载，则跳过重新加载
  if (!forceReload && pdfDoc && loadedPdfUrl === url) {
    // PDF已经加载过，只需要恢复显示状态
    logger.debug('PDF已加载，跳过重新加载', { url })

    // 恢复页码（如果要求保留）
    if (preservePage) {
      const savedPage = currentPdfPage.value
      const targetPage = Math.min(Math.max(savedPage, 1), totalPdfPages.value)
      currentPdfPage.value = targetPage
      inputPdfPage.value = targetPage
      await nextTick()
      scrollToPage(targetPage)
    }

    // 确保滚动监听器已设置
    await nextTick()
    setupScrollListener()

    // 更新包装器大小
    await nextTick()
    updateWrapperSize()

    return true // 已加载，返回成功
  }

  // 保存当前页码（如果要求保留）
  const savedPage = preservePage ? currentPdfPage.value : 1

  try {
    // 使用 createLoadingTask 获取 PDF 文档对象（用于映射功能）
    const loadingTask = createLoadingTask(url)
    pdfDoc = await loadingTask.promise
    totalPdfPages.value = pdfDoc.numPages

    // 记录已加载的URL
    loadedPdfUrl = url

    // 恢复或设置页码
    const targetPage = preservePage ? Math.min(Math.max(savedPage, 1), pdfDoc.numPages) : 1
    currentPdfPage.value = targetPage
    inputPdfPage.value = targetPage

    // 更新渲染key，强制重新渲染所有页面组件
    pdfRenderKey.value++

    // 清空页面引用
    pageRefs.clear()

    // 等待DOM更新后滚动到目标页面
    await nextTick()
    scrollToPage(targetPage)

    // 设置滚动监听器（用于自动检测当前页面）
    await nextTick()
    setupScrollListener()

    // 异步建立映射关系
    buildPdfToSourceMapping()

    // PDF 加载完成后，更新包装器大小
    await nextTick()
    updateWrapperSize()

    return true // 加载成功
  } catch (error: any) {
    // 捕获 PDF 加载错误，避免未处理的 rejection
    const errorMessage = error?.message || String(error)
    logger.warn('加载 PDF 失败', {
      url,
      error: errorMessage,
      errorName: error?.name,
      status: error?.status
    })

    // 如果是文件不存在或无法访问的错误（包括未编译的情况），不显示错误提示
    const isFileNotFound =
      error?.name === 'ResponseException' ||
      error?.status === 0 ||
      (typeof errorMessage === 'string' && errorMessage.toLowerCase().includes('missing pdf'))

    if (isFileNotFound) {
      // 文件不存在是正常情况（可能还未编译），只记录警告，不显示错误提示
      logger.warn(t('latexEditor.notification.pdfFileNotFoundOrInaccessible'))
    } else {
      eventBus.emit(
        'show-error',
        t('latexEditor.notification.pdfLoadFailed', {
          reason: errorMessage
        })
      )
    }

    // 清空 PDF URL，避免重复尝试加载
    pdfUrl.value = ''
    loadedPdfUrl = null

    return false // 加载失败
  }
}
// 切换 PDF 显示
function togglePdf() {
  showPdfPanel.value = !showPdfPanel.value
}

const compile = async () => {
  if (!editor.value || isCompiling.value) return

  // Demo mode: simulate compilation
  if (isDemo.value) {
    isCompiling.value = true
    showConsole.value = true
    eventBus.emit('clear-console', { key: 'latex' })
    // Simulate compilation output
    eventBus.emit('console-out', {
      key: 'latex',
      content: 'Demo mode: Compiling LaTeX document...\n',
      type: 'out'
    })
    await new Promise((resolve) => setTimeout(resolve, 1500))
    eventBus.emit('console-out', {
      key: 'latex',
      content: 'This is a demo compilation. PDF generation is simulated.\n',
      type: 'out'
    })
    eventBus.emit('show-success', 'Demo mode: Compilation simulated successfully')
    showPdfPanel.value = true
    isCompiling.value = false
    return
  }

  if (!messageBridge.getIpc()) return
  isCompiling.value = true
  // 自动打开终端输出界面
  showConsole.value = true
  eventBus.emit('clear-console', { key: 'latex' })
  eventBus.emit('cancel-suggestion')

  // 取消之前的AI分析任务（如果存在）
  if (currentAiTaskHandle) {
    cancelAiTask(currentAiTaskHandle, false)
    currentAiTaskHandle = null
  }

  if (!currentPath.value || !currentPath.value.toLowerCase().endsWith('.tex')) {
    isCompiling.value = false
    eventBus.emit('show-warning', t('latexEditor.notification.pleaseSaveFirst'))
    eventBus.emit('save')
    return
  }

  // 重置收集的 console 输出
  compileConsoleOutput = { stdout: '', stderr: '' }

  // 设置 console 输出监听器来收集输出
  compileConsoleListeners.onStdout = (data: unknown) => {
    const payload =
      typeof data === 'object' && data !== null && 'key' in data && (data as any).key === 'latex'
        ? (data as any)
        : null
    if (payload?.content) {
      compileConsoleOutput.stdout += payload.content
    }
  }
  compileConsoleListeners.onStderr = (data: unknown) => {
    const payload =
      typeof data === 'object' && data !== null && 'key' in data && (data as any).key === 'latex'
        ? (data as any)
        : null
    if (payload?.content) {
      compileConsoleOutput.stderr += payload.content
    }
  }

  // 注册监听器
  eventBus.on('console-out', compileConsoleListeners.onStdout)
  eventBus.on('console-err', compileConsoleListeners.onStderr)

  editor.value.updateOptions({
    readOnly: true
  })

  try {
    const compileResult: any = await messageBridge.invoke('compile-tex', {
      tex: currentTex.value,
      texPath: currentPath.value ?? '',
      outputDir: '', //todo:用户后续可以设置保存在哪
      customPdfFileName: '' //todo
    })

    editor.value.updateOptions({
      readOnly: false
    })

    //logger.log(compileResult)
    if (compileResult?.status === 'success') {
      // 移除监听器
      if (compileConsoleListeners.onStdout) {
        eventBus.off('console-out', compileConsoleListeners.onStdout)
      }
      if (compileConsoleListeners.onStderr) {
        eventBus.off('console-err', compileConsoleListeners.onStderr)
      }
      compileConsoleListeners = {}

      eventBus.emit('show-success', t('latexEditor.notification.compileSuccess'))
      const newPdfUrl = encodeFilePathToUrl((compileResult.pdfPath || '').replace(/\\/g, '/'))

      // 编译成功后，无论URL是否变化，都应该强制重新加载PDF
      pdfUrl.value = newPdfUrl
      // 有有效 PDF URL 就显示面板，让 PdfPreviewPanel 自己加载；不依赖 loadPdf 返回值（loadPdf 可能因 ref 在子组件而失败）
      if (newPdfUrl && newPdfUrl !== 'file:///' && newPdfUrl.trim() !== '') {
        showPdfPanel.value = true
      }

      try {
        const loaded = await loadPdf(pdfUrl.value, false, true)
        if (loaded) {
          showPdfPanel.value = true
        }
      } catch (_) {
        // 忽略 loadPdf 错误，面板已显示，PdfPreviewPanel 会自行加载
      }
    } else {
      eventBus.emit(
        'show-error',
        t('latexEditor.notification.compileFailed', {
          code: compileResult?.exitCode || compileResult?.code
        })
      )

      // 如果编译失败，使用AI分析错误（在移除监听器之前调用，确保能收集到所有输出）
      await analyzeCompileError(compileResult)

      // 移除监听器（在AI分析开始后移除）
      if (compileConsoleListeners.onStdout) {
        eventBus.off('console-out', compileConsoleListeners.onStdout)
      }
      if (compileConsoleListeners.onStderr) {
        eventBus.off('console-err', compileConsoleListeners.onStderr)
      }
      compileConsoleListeners = {}
    }
  } catch (error) {
    // 确保移除监听器
    if (compileConsoleListeners.onStdout) {
      eventBus.off('console-out', compileConsoleListeners.onStdout)
    }
    if (compileConsoleListeners.onStderr) {
      eventBus.off('console-err', compileConsoleListeners.onStderr)
    }
    compileConsoleListeners = {}

    editor.value.updateOptions({
      readOnly: false
    })

    logger.error('编译过程出错', error)
  } finally {
    isCompiling.value = false
  }
  //logger.log("编译 LaTeX");
}

// 分析编译错误
const analyzeCompileError = async (compileResult: any) => {
  // 检查AI分析开关
  if (!enableAiAnalysis.value) {
    logger.debug('AI分析已关闭，跳过错误分析')
    return
  }

  try {
    // 停止之前的监听
    if (errorAnalysisWatchStop) {
      errorAnalysisWatchStop()
      errorAnalysisWatchStop = null
    }

    // 重置状态
    aiErrorAnalysisOutput.value = ''
    lastOutputLength = 0

    // 收集完整的控制台输出（stdout + stderr）
    // 这是最重要的信息，包含了完整的编译输出，包括行号等关键信息

    // 如果 compileConsoleOutput 为空，尝试从 ConsoleOutput 组件获取所有已显示的内容
    let actualConsoleOutput = { ...compileConsoleOutput }
    if (
      (!actualConsoleOutput.stderr || actualConsoleOutput.stderr.trim().length === 0) &&
      (!actualConsoleOutput.stdout || actualConsoleOutput.stdout.trim().length === 0)
    ) {
      // 等待一小段时间，确保控制台内容已更新
      await new Promise((resolve) => setTimeout(resolve, 300))

      // 通过 eventBus 请求获取控制台内容
      const consoleContentPromise = new Promise<{ stdout: string; stderr: string }>((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ stdout: '', stderr: '' })
        }, 1000)

        const handler = (data: unknown) => {
          if (typeof data === 'object' && data !== null) {
            const obj = data as { key?: string; content?: { stdout?: string; stderr?: string } }
            if (obj.key === 'latex' && obj.content) {
              clearTimeout(timeout)
              eventBus.off('console-content-response', handler)
              resolve({
                stdout: obj.content.stdout || '',
                stderr: obj.content.stderr || ''
              })
            }
          }
        }

        eventBus.on('console-content-response', handler)

        // 发送请求
        eventBus.emit('get-console-content', {
          key: 'latex',
          consoleKey: 'latex'
        })
      })

      const consoleContent = await consoleContentPromise
      if (consoleContent.stdout || consoleContent.stderr) {
        actualConsoleOutput = {
          stdout: consoleContent.stdout || actualConsoleOutput.stdout || '',
          stderr: consoleContent.stderr || actualConsoleOutput.stderr || ''
        }
        logger.info('从 ConsoleOutput 组件获取到控制台内容', {
          stdoutLength: actualConsoleOutput.stdout.length,
          stderrLength: actualConsoleOutput.stderr.length
        })
      }
    }

    const fullConsoleOutput: string[] = []

    // 添加 stderr（错误输出）
    if (actualConsoleOutput.stderr && actualConsoleOutput.stderr.trim().length > 0) {
      fullConsoleOutput.push('=== 标准错误输出 (stderr) ===')
      fullConsoleOutput.push(actualConsoleOutput.stderr)
    }

    // 添加 stdout（标准输出，可能也包含错误信息）
    if (actualConsoleOutput.stdout && actualConsoleOutput.stdout.trim().length > 0) {
      fullConsoleOutput.push('=== 标准输出 (stdout) ===')
      fullConsoleOutput.push(actualConsoleOutput.stdout)
    }

    // 组合完整的控制台输出
    const completeConsoleOutput = fullConsoleOutput.join('\n\n')

    // 提取错误输出（用于简要显示，但完整输出更重要）
    let errorOutput = actualConsoleOutput.stderr || ''

    // 如果 stderr 为空，尝试从 stdout 中提取错误行
    if (!errorOutput || errorOutput.trim().length === 0) {
      if (actualConsoleOutput.stdout) {
        // 从 stdout 中提取包含 "error" 或 "Error" 的行（不区分大小写）
        const stdoutLines = actualConsoleOutput.stdout.split('\n')
        const errorLines = stdoutLines.filter((line: string) => {
          const lowerLine = line.toLowerCase().trim()
          return (
            lowerLine.includes('error') ||
            lowerLine.startsWith('!') || // LaTeX 错误通常以 ! 开头
            /error:\s/i.test(line)
          ) // 匹配 "error: " 模式
        })
        if (errorLines.length > 0) {
          errorOutput = errorLines.join('\n')
        }
      }
    }

    // 如果还是没有错误输出，使用完整的控制台输出
    if (!errorOutput || errorOutput.trim().length === 0) {
      errorOutput = completeConsoleOutput || '编译失败，但未收集到错误信息'
    }

    // 获取退出代码
    const exitCode = compileResult?.exitCode || compileResult?.code

    logger.info('AI错误分析 - 收集到的错误信息', {
      hasStderr: !!actualConsoleOutput.stderr,
      hasStdout: !!actualConsoleOutput.stdout,
      stderrLength: actualConsoleOutput.stderr?.length || 0,
      stdoutLength: actualConsoleOutput.stdout?.length || 0,
      completeConsoleOutputLength: completeConsoleOutput.length,
      compileResultStatus: compileResult?.status,
      compileResultExitCode: exitCode,
      errorOutputLength: errorOutput.length,
      source:
        actualConsoleOutput.stderr || actualConsoleOutput.stdout
          ? compileConsoleOutput.stderr || compileConsoleOutput.stdout
            ? 'event-listener'
            : 'console-component'
          : 'none'
    })

    // 如果完全没有控制台输出，使用备用信息
    if (!completeConsoleOutput || completeConsoleOutput.trim().length === 0) {
      if (exitCode !== undefined && exitCode !== null) {
        logger.info('使用备用错误信息进行AI分析', { exitCode })
      } else {
        logger.warn('没有控制台输出信息，跳过AI分析', {
          compileResult: compileResult,
          compileConsoleOutput: compileConsoleOutput
        })
        return
      }
    }

    // 获取 LaTeX 原文
    const rawLatexSource = currentTex.value || ''
    const latexLines = rawLatexSource.split('\n')
    const totalLines = latexLines.length

    // 从控制台输出中智能提取行号
    // LaTeX 错误信息中行号的常见格式：
    // 1. "error: filename.tex:123: message" 或 "warning: filename.tex:123: message"
    // 2. "l.123 ..." (LaTeX 错误标记)
    // 3. "filename.tex:123" (文件名:行号)
    // 4. "line 123" 或 "Line 123"
    const allNumbers = new Set<number>()
    const matchedByPattern: Record<string, number[]> = {
      pattern1: [],
      pattern2: [],
      pattern3: [],
      pattern4: [],
      fallback: []
    }

    // 模式1: error/warning: filename.tex:行号: 或 filename.tex:行号:
    const pattern1 = /(?:error|warning|Error|Warning):\s*[^:]+:(\d+):/gi
    let match
    while ((match = pattern1.exec(completeConsoleOutput)) !== null) {
      const num = parseInt(match[1], 10)
      if (num >= 1 && num <= totalLines) {
        allNumbers.add(num)
        matchedByPattern.pattern1.push(num)
      }
    }

    // 模式2: l.行号 (LaTeX 标准错误格式)
    const pattern2 = /^l\.(\d+)\s/gm
    while ((match = pattern2.exec(completeConsoleOutput)) !== null) {
      const num = parseInt(match[1], 10)
      if (num >= 1 && num <= totalLines) {
        allNumbers.add(num)
        matchedByPattern.pattern2.push(num)
      }
    }

    // 模式3: 文件名.tex:行号 (不含 error/warning 前缀)
    const pattern3 = /\.tex:(\d+)(?::|$)/g
    while ((match = pattern3.exec(completeConsoleOutput)) !== null) {
      const num = parseInt(match[1], 10)
      if (num >= 1 && num <= totalLines) {
        allNumbers.add(num)
        matchedByPattern.pattern3.push(num)
      }
    }

    // 模式4: "line 123" 或 "Line 123" (大小写不敏感)
    const pattern4 = /\b(?:line|Line)\s+(\d+)\b/gi
    while ((match = pattern4.exec(completeConsoleOutput)) !== null) {
      const num = parseInt(match[1], 10)
      if (num >= 1 && num <= totalLines) {
        allNumbers.add(num)
        matchedByPattern.pattern4.push(num)
      }
    }

    // 如果以上模式都没找到，尝试提取所有在合理范围内的数字
    // 但只考虑在错误相关上下文中的数字
    if (allNumbers.size === 0) {
      const errorContextPattern = /(?:error|Error|warning|Warning|!|l\.)[\s\S]{0,200}?\b(\d+)\b/g
      while ((match = errorContextPattern.exec(completeConsoleOutput)) !== null) {
        const num = parseInt(match[1], 10)
        // 更严格的过滤：只保留在合理范围内的数字
        if (num >= 1 && num <= totalLines && num <= 100000) {
          allNumbers.add(num)
          matchedByPattern.fallback.push(num)
        }
      }
    }

    // 转换为排序后的数组
    const relevantLineNumbers = Array.from(allNumbers).sort((a, b) => a - b)

    // 详细日志：记录提取到的行号
    logger.info('=== 行号提取调试信息 ===', {
      totalLines,
      completeConsoleOutputLength: completeConsoleOutput.length,
      completeConsoleOutputPreview: completeConsoleOutput.substring(0, 1000), // 前1000个字符
      matchedByPattern: {
        pattern1_error_warning: matchedByPattern.pattern1,
        pattern2_l_dot: matchedByPattern.pattern2,
        pattern3_tex_colon: matchedByPattern.pattern3,
        pattern4_line_keyword: matchedByPattern.pattern4,
        fallback: matchedByPattern.fallback
      },
      extractedLineNumbers: relevantLineNumbers,
      extractedLineNumbersCount: relevantLineNumbers.length
    })

    // 智能提取：只提取相关行号的内容（包括上下文）
    // 上下文范围：前后各 5 行
    const contextLines = 5
    let latexSourceWithLineNumbers: string

    if (relevantLineNumbers.length > 0 && totalLines > 100) {
      // 如果文档很长且找到了相关行号，只提取相关部分
      const extractedRanges: Array<{ start: number; end: number }> = []
      let currentRange: { start: number; end: number } | null = null

      for (const lineNum of relevantLineNumbers) {
        const start = Math.max(1, lineNum - contextLines)
        const end = Math.min(totalLines, lineNum + contextLines)

        if (!currentRange) {
          currentRange = { start, end }
        } else if (start <= currentRange.end + contextLines) {
          // 如果范围重叠或接近，合并范围
          currentRange.end = Math.max(currentRange.end, end)
        } else {
          // 保存当前范围，开始新范围
          extractedRanges.push(currentRange)
          currentRange = { start, end }
        }
      }

      if (currentRange) {
        extractedRanges.push(currentRange)
      }

      // 构建提取后的源码（用省略号连接不同范围）
      const extractedParts: string[] = []
      let lastEnd = 0

      for (const range of extractedRanges) {
        // 如果当前范围之前有内容被跳过，添加省略号
        if (range.start > lastEnd + 1 && lastEnd > 0) {
          extractedParts.push(`... (省略 ${range.start - lastEnd - 1} 行) ...`)
        }

        // 添加当前范围的内容
        for (let i = range.start; i <= range.end; i++) {
          const lineIndex = i - 1 // 转换为 0-based 索引
          extractedParts.push(`${i}: ${latexLines[lineIndex] || ''}`)
        }

        lastEnd = range.end
      }

      // 如果最后还有内容被跳过，添加省略号
      if (lastEnd < totalLines) {
        extractedParts.push(`... (省略 ${totalLines - lastEnd} 行) ...`)
      }

      latexSourceWithLineNumbers = extractedParts.join('\n')

      logger.info('=== 智能提取 LaTeX 源码 ===', {
        totalLines,
        relevantLineNumbers: relevantLineNumbers,
        relevantLineNumbersCount: relevantLineNumbers.length,
        extractedRanges: extractedRanges.map((r) => `${r.start}-${r.end}`),
        extractedRangesCount: extractedRanges.length,
        originalLength: rawLatexSource.length,
        extractedLength: latexSourceWithLineNumbers.length,
        compressionRatio:
          ((latexSourceWithLineNumbers.length / rawLatexSource.length) * 100).toFixed(2) + '%',
        extractedPreview: latexSourceWithLineNumbers.substring(0, 500) // 前500个字符预览
      })
    } else {
      // 如果文档不长或没找到相关行号，使用完整源码
      latexSourceWithLineNumbers = rawLatexSource
        .split('\n')
        .map((line, index) => `${index + 1}: ${line}`)
        .join('\n')

      if (relevantLineNumbers.length === 0) {
        logger.info('未从控制台输出中找到行号，使用完整源码', {
          totalLines,
          completeConsoleOutputPreview: completeConsoleOutput.substring(0, 1000)
        })
      } else {
        logger.info('文档较短，使用完整源码', {
          totalLines,
          relevantLineNumbers: relevantLineNumbers
        })
      }
    }

    // 获取提示词模板
    const prompts = getCurrentLocalePrompts()
    const template = prompts.prompts?.latexCompileErrorAnalysisPrompt

    let prompt = ''
    if (template) {
      // 替换模板中的占位符
      prompt = template
        .replace(/{errorOutput}/g, errorOutput)
        .replace(/{completeConsoleOutput}/g, completeConsoleOutput || errorOutput)
        .replace(/{texPath}/g, currentPath.value || '未知路径')
        .replace(/{latexSource}/g, latexSourceWithLineNumbers)
        .replace(
          /{exitCode}/g,
          exitCode !== undefined && exitCode !== null ? String(exitCode) : '未知'
        )
    } else {
      // 回退提示词
      const isExtracted = relevantLineNumbers.length > 0 && totalLines > 100
      const extractionNote = isExtracted
        ? `\n**注意：** 由于 LaTeX 文档较长，这里只显示了控制台输出中提到的相关行号及其上下文（前后各 5 行）。省略的部分用 "... (省略 X 行) ..." 标记。请重点关注显示的行号。`
        : ''

      prompt = `你是一个专业的LaTeX编译错误分析助手。请仔细分析以下编译错误：

**重要提示：请务必参考完整的控制台输出，特别是其中的行号信息！控制台输出中已经明确指出了错误所在的行号，请严格按照控制台输出中的行号信息进行分析。**${extractionNote}

**完整控制台输出（包含所有编译信息，这是最重要的参考信息）：**
\`\`\`
${completeConsoleOutput || errorOutput}
\`\`\`

**编译错误摘要：**
\`\`\`
${errorOutput}
\`\`\`

**退出代码：** ${exitCode !== undefined && exitCode !== null ? exitCode : '未知'}

**LaTeX 原文（已标注行号${isExtracted ? '，仅显示相关行号及其上下文' : ''}）：**
\`\`\`latex
${latexSourceWithLineNumbers}
\`\`\`

**请分析并输出：**
1. **错误原因**：一句话说明错误原因
2. **错误位置**：**必须参考控制台输出中的行号信息**，指出具体行号或命令
3. **解决方法**：提供简洁的修复方案（如需要添加的包、修改的代码等）

**输出要求：**
- **必须参考完整控制台输出中的行号信息**，不要猜测或忽略控制台已经指出的错误位置
- 语言精炼，直击要害，不要过于详细
- 直接输出分析结果，从第一行开始就是分析内容
- 避免冗长的解释和前缀，只输出必要的分析和建议`
    }

    // 输出分析开始提示
    eventBus.emit('console-out', {
      key: 'latex',
      content: '\n' + t('latexEditor.notification.analyzingError'),
      type: 'out'
    })

    // 设置增量输出监听
    errorAnalysisWatchStop = watch(
      () => aiErrorAnalysisOutput.value,
      (newValue) => {
        // 计算新增的内容（增量部分）
        if (newValue.length > lastOutputLength) {
          const newContent = newValue.substring(lastOutputLength)

          // 如果 lastOutputLength === 0，说明是第一次输出，创建新行
          // 否则，说明是增量输出，追加到当前行
          const shouldAppend = lastOutputLength > 0

          // 输出增量内容到Console
          eventBus.emit('console-out', {
            key: 'latex',
            content: newContent,
            type: 'out',
            append: shouldAppend
          })

          lastOutputLength = newValue.length
        }
      },
      { immediate: false }
    )

    // 创建AI任务
    const messages = [
      {
        role: 'user' as const,
        content: prompt
      }
    ]

    const { done, handle } = createAiTask(
      t('latexEditor.notification.analyzingError'),
      messages,
      aiErrorAnalysisOutput,
      ai_types.chat,
      'latex-error-analysis',
      { stream: true }
    )

    // 保存当前AI任务的handle，以便后续取消
    currentAiTaskHandle = handle

    // 等待任务完成
    try {
      await done
    } catch (err) {
      logger.error('AI错误分析失败', err)
      eventBus.emit('console-err', {
        key: 'latex',
        content: '\n' + t('latexEditor.notification.errorAnalysisFailed'),
        type: 'err'
      })
    }
  } catch (error) {
    logger.error('启动AI错误分析失败', error)
    eventBus.emit('console-err', {
      key: 'latex',
      content: '\n' + t('latexEditor.notification.errorAnalysisFailed'),
      type: 'err'
    })
  }
}

const toggleConsole = async () => {
  showConsole.value = !showConsole.value
}

// 打开右键菜单
const openContextMenu = (event: MouseEvent) => {
  event.preventDefault()
  menuX.value = event.clientX
  menuY.value = event.clientY
  contextMenuVisible.value = true
}

// 存储右键菜单时的鼠标位置
let contextMenuMouseEvent: MouseEvent | null = null

// 打开PDF右键菜单
const openPdfContextMenu = (event: MouseEvent) => {
  event.preventDefault()
  pdfMenuX.value = event.clientX
  pdfMenuY.value = event.clientY
  contextMenuMouseEvent = event // 保存鼠标事件，用于定位
  pdfContextMenuVisible.value = true
}

// PDF右键菜单点击处理
const handlePdfMenuClick = async (item: string) => {
  switch (item) {
    case 'refresh':
      if (pdfUrl.value) {
        // 刷新时保留当前页码，强制重新加载
        await loadPdf(pdfUrl.value, true, true)
        eventBus.emit('show-success', t('latexEditor.notification.refreshSuccess'))
      }
      break
    case 'locate-to-code':
      await locateToCodeFromPdf()
      break
    case 'zoom-in':
      pdfPreviewPanelRef.value?.pdfZoomIn()
      break
    case 'zoom-out':
      pdfPreviewPanelRef.value?.pdfZoomOut()
      break
    case 'zoom-reset':
      pdfPreviewPanelRef.value?.pdfZoomReset()
      break
    case 'open-directory':
      await openPdfDirectory()
      break
    case 'save':
      await savePdf()
      break
  }
  pdfContextMenuVisible.value = false
}

// 从PDF定位到代码（右键菜单或双击）
async function locateToCodeFromPdf(event?: MouseEvent) {
  if (!editorId) return
  // 从Monaco全局获取编辑器实例
  const editors = monaco.editor.getEditors()
  // editorId 可能是 Ref<string|null>，取其 value
  const currentEditorId =
    typeof editorId === 'object' && editorId !== null && 'value' in editorId
      ? editorId.value
      : editorId
  const monacoEditor = editors.find((e) => e.getId?.() === currentEditorId) || editors[0]

  if (!pdfDoc || !monacoEditor) {
    eventBus.emit('show-info', t('latexEditor.notification.editorNotAvailable'))
    return
  }

  // 使用传入的事件或保存的右键菜单事件
  const targetEvent = event || contextMenuMouseEvent
  if (!targetEvent) {
    // 如果没有事件，使用中心位置
    return await locateToCodeFromPdfCenter()
  }

  // 使用右键位置进行定位
  await handlePdfTextClick(targetEvent)
}

// 从PDF中心位置定位到代码（备用方法）
async function locateToCodeFromPdfCenter() {
  if (!editorId) return
  const editors = monaco.editor.getEditors()
  const currentEditorId =
    typeof editorId === 'object' && editorId !== null && 'value' in editorId
      ? editorId.value
      : editorId
  const monacoEditor = editors.find((e) => e.getId?.() === currentEditorId) || editors[0]

  if (!pdfDoc || !monacoEditor) {
    eventBus.emit('show-info', t('latexEditor.notification.editorNotAvailable'))
    return
  }

  try {
    const currentPage = pdfPreviewPanelRef.value?.getCurrentPage() ?? 1
    const panelPageRefs = pdfPreviewPanelRef.value?.getPageRefs()
    const currentPageElement = panelPageRefs?.get(currentPage)
    if (!currentPageElement) {
      eventBus.emit('show-info', t('latexEditor.notification.noCodeMapping'))
      return
    }

    const page = await pdfDoc.getPage(currentPage)
    const viewport = page.getViewport({ scale: 1 }) // 使用标准viewport（scale=1）用于坐标转换

    // 获取当前页面的canvas元素
    const canvas = currentPageElement.querySelector('canvas') as HTMLCanvasElement | null
    if (!canvas) {
      eventBus.emit('show-info', t('latexEditor.notification.noCodeMapping'))
      return
    }

    const pageRect = currentPageElement.getBoundingClientRect()
    const canvasRect = canvas.getBoundingClientRect()

    // 使用页面中心位置
    const centerX = pageRect.width / 2
    const centerY = pageRect.height / 2

    const canvasStyleWidth = canvasRect.width || viewport.width
    const canvasStyleHeight = canvasRect.height || viewport.height

    const canvasX = centerX
    const canvasY = centerY

    const relativeX = canvasX / canvasStyleWidth
    const relativeY = 1 - canvasY / canvasStyleHeight

    // 查找映射
    const pageMappings = pdfToSourceMap.get(currentPage)
    if (pageMappings && pageMappings.length > 0) {
      // 使用页面中心的映射（选择最接近中心的映射）
      let closestMapping = null
      let minDistance = Infinity

      for (const mapping of pageMappings) {
        const range = mapping.pdfRange
        const rangeCenterX = range.x + range.width / 2
        const rangeCenterY = range.y + range.height / 2
        const distance = Math.sqrt(
          Math.pow(relativeX - rangeCenterX, 2) + Math.pow(relativeY - rangeCenterY, 2)
        )

        if (distance < minDistance) {
          minDistance = distance
          closestMapping = mapping
        }
      }

      if (closestMapping) {
        const position = closestMapping.monacoPosition
        const monacoPosition = new monaco.Position(position.line, position.column)
        monacoEditor.setPosition(monacoPosition)
        monacoEditor.revealLineInCenter(position.line)
        // 高亮整行代码
        highlightCodeLine(monacoEditor, position.line)
      } else {
        eventBus.emit('show-info', t('latexEditor.notification.noCodeMapping'))
      }
    } else {
      eventBus.emit('show-info', t('latexEditor.notification.noCodeMapping'))
    }
  } catch (error) {
    logger.error('从PDF定位到代码失败', error)
    eventBus.emit('show-error', t('latexEditor.notification.locateToCodeFailed'))
  }
}

// 打开PDF所在目录
async function openPdfDirectory() {
  if (isDemo.value) {
    eventBus.emit('show-info', 'Demo mode: Directory opening is simulated')
    return
  }

  if (!pdfUrl.value || pdfUrl.value === 'file:///') {
    eventBus.emit('show-warning', t('latexEditor.notification.pdfNotAvailable'))
    return
  }

  try {
    // 从file:///路径提取实际路径
    const pdfPath = pdfUrl.value.replace('file:///', '')

    if (!messageBridge.getIpc()) return
    // 使用IPC调用主进程获取目录路径
    const dirPath = await messageBridge.invoke('get-directory-path', pdfPath)

    if (dirPath) {
      // 使用shell-open事件打开目录
      messageBridge.send('shell-open', dirPath)
      eventBus.emit('show-success', t('latexEditor.notification.directoryOpened'))
    } else {
      eventBus.emit('show-error', t('latexEditor.notification.openDirectoryFailed'))
    }
  } catch (error) {
    logger.error('打开PDF目录失败', error)
    eventBus.emit('show-error', t('latexEditor.notification.openDirectoryFailed'))
  }
}

// 保存PDF（复制并保存对话框）
async function savePdf() {
  if (!pdfUrl.value || pdfUrl.value === 'file:///') {
    eventBus.emit('show-warning', t('latexEditor.notification.pdfNotAvailable'))
    return
  }

  try {
    // 从file:///路径提取实际路径
    const pdfPath = pdfUrl.value.replace('file:///', '')

    if (!messageBridge.getIpc()) return
    // 使用IPC调用主进程保存PDF
    const result = await messageBridge.invoke('save-pdf-dialog', {
      sourcePath: pdfPath,
      defaultName: pdfPath.split(/[\\/]/).pop() || 'document.pdf'
    })

    if (result && result.success && result.filePath) {
      eventBus.emit(
        'show-success',
        t('latexEditor.notification.pdfSaved', { path: result.filePath })
      )
    } else if (result && result.canceled) {
      // 用户取消了保存对话框，不需要提示
    } else {
      eventBus.emit('show-error', t('latexEditor.notification.savePdfFailed'))
    }
  } catch (error) {
    logger.error('保存PDF失败', error)
    eventBus.emit('show-error', t('latexEditor.notification.savePdfFailed'))
  }
}

// 插入文本到当前光标位置（支持多行）
const insertText = (text: string) => {
  if (textEditorAdapter.value && typeof textEditorAdapter.value.insertText === 'function') {
    ;(textEditorAdapter.value as any).insertText(text)
  }
}

// 处理粘贴图片（用于LaTeX编辑器）
const handlePasteImage = async () => {
  try {
    if (!messageBridge.getIpc()) {
      logger.warn('IPC渲染器不可用，无法读取剪切板图片')
      return false
    }

    // 读取剪切板图片
    const clipboardImage = (await messageBridge.invoke('read-clipboard-image')) as string | null
    if (!clipboardImage) {
      return false // 没有图片，返回false让后续处理文本粘贴
    }

    // 将base64图片转换为Blob
    const base64Data = clipboardImage.includes(',') ? clipboardImage.split(',')[1] : clipboardImage
    const byteCharacters = atob(base64Data)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: 'image/png' })

    // 使用图片上传服务上传图片
    const { uploadImage } = await import('../utils/image-upload-service')
    const fileName = `clipboard-${Date.now()}.png`
    const file = new File([blob], fileName, { type: 'image/png' })

    // 获取文档路径（用于相对路径计算）
    const documentPath = workspace.ensureDocument(props.tabId).path

    const uploadResult = await uploadImage({
      file: file,
      fileName: fileName,
      documentPath: documentPath
    })

    if (!uploadResult.success || !uploadResult.imagePath) {
      throw new Error(uploadResult.error || '上传失败')
    }

    // 生成LaTeX图片嵌入代码
    // 使用处理后的路径，统一转换为正斜杠（LaTeX使用正斜杠）
    let normalizedPath = uploadResult.imagePath.replace(/\\/g, '/')

    // 转义LaTeX特殊字符（#、%、&、{}、_等）
    // 注意：转义顺序很重要，先转义反斜杠，再转义其他字符
    // 注意：如果配置中已经启用了URL转义，这里可能需要调整
    const imageUploadConfig = await getSetting('imageUpload')
    let escapedPath: string
    if (imageUploadConfig?.autoEscapeImageUrl) {
      // 如果已经转义过，只需要转义LaTeX特殊字符（但需要先解码）
      // 这里简化处理：直接转义LaTeX特殊字符
      escapedPath = normalizedPath.replace(/([#%&{}_])/g, '\\$1')
    } else {
      // 如果未转义，先转义LaTeX特殊字符
      escapedPath = normalizedPath.replace(/([#%&{}_])/g, '\\$1')
    }

    // 使用标准的 includegraphics 格式，带宽度选项
    const latexCode = `\\includegraphics[width=0.8\\textwidth]{${escapedPath}}`

    // 插入到编辑器
    insertText(latexCode)

    logger.debug('图片已上传并插入LaTeX代码', {
      imagePath: uploadResult.imagePath,
      normalizedPath,
      latexCode
    })
    return true // 成功处理图片
  } catch (error) {
    logger.error('粘贴图片失败', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    eventBus.emit(
      'show-error',
      t('latexEditor.notification.pasteImageFailed') || `粘贴图片失败: ${errorMessage}`
    )
    return false
  }
}

// 使用textEditorAdapter来触发复制粘贴剪切操作（更可靠）
const executeMonacoCommand = async (command: string) => {
  if (!editor.value || !textEditorAdapter.value) return

  // 确保编辑器获得焦点
  editor.value.focus()

  // 对于粘贴操作，先检查是否有图片
  if (command === 'editor.action.clipboardPasteAction') {
    const imageHandled = await handlePasteImage()
    if (imageHandled) {
      // 图片已处理，不需要执行文本粘贴
      return
    }
    // 没有图片，使用 textEditorAdapter 的 paste 方法
    if (textEditorAdapter.value && typeof textEditorAdapter.value.paste === 'function') {
      await textEditorAdapter.value.paste()
      return
    }
  }

  // 对于复制和剪切，使用 textEditorAdapter 的方法
  try {
    if (command === 'editor.action.clipboardCutAction') {
      if (textEditorAdapter.value && typeof textEditorAdapter.value.cut === 'function') {
        await textEditorAdapter.value.cut()
      }
    } else if (command === 'editor.action.clipboardCopyAction') {
      if (textEditorAdapter.value && typeof textEditorAdapter.value.copy === 'function') {
        await textEditorAdapter.value.copy()
      }
    }
  } catch (error) {
    logger.warn('执行编辑器命令失败', { command, error })
  }
}

// 菜单项点击事件处理
const handleMenuClick = async (item: string) => {
  switch (item) {
    case 'ai-assistant':
      let text = currentTex.value
      // LaTeX 文档不需要移除代码块，因为 LaTeX 本身就是代码格式
      // 获取文章标题：优先使用 meta.title，如果没有则从内容中提取
      let articleTitle = documentRef.value.meta?.title?.trim() || ''
      if (!articleTitle) {
        const { extractTitleFromContent } = await import('../utils/title-extractor')
        const extractedTitle = extractTitleFromContent(currentTex.value, 'tex')
        articleTitle = extractedTitle || ''
      }
      // 如果没有标题，使用默认文本
      const titleDisplay = articleTitle || t('article.untitled_document', '未命名文档')

      let messages: any[] = []
      messages.push({
        role: 'system' as const,
        content: wholeArticleContextPrompt(text)
      })
      messages.push({
        role: 'assistant' as const,
        content: t('article.ai_understood', { title: titleDisplay })
      })
      const newDialog = {
        title: t('article.ai_analyze_title', { title: titleDisplay }),
        messages: messages
      }
      addDialogEntry(newDialog, true)
      prependAiChatDialog(newDialog)
      // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast
      eventBus.emit('ai-chat-dialogs-updated', null)
      eventBus.emit('ai-chat')
      break
    case 'cut':
      // 使用命令API处理剪切操作
      await executeMonacoCommand('editor.action.clipboardCutAction')
      break
    case 'copy':
      // 使用命令API处理复制操作
      await executeMonacoCommand('editor.action.clipboardCopyAction')
      break
    case 'paste':
      // executeMonacoCommand 内部会先检查图片，然后处理文本粘贴
      await executeMonacoCommand('editor.action.clipboardPasteAction')
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
    case 'openKnowledgeBase':
      await setSetting('enableKnowledgeBase', true)
      break
    case 'closeKnowledgeBase':
      await setSetting('enableKnowledgeBase', false)
      break
    case 'locate-to-pdf':
      await locateToPdf()
      break
    case 'section-optimizer':
      await openSectionOptimizerFromContext()
      break
    case 'trigger-auto-completion':
      // 手动触发AI补全
      if (aiCompletionService.getAdapter()) {
        aiCompletionService.triggerCompletion('manual')
      } else {
        // 如果适配器不存在，先创建
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

// 定位到PDF位置（从代码行定位到PDF）
async function locateToPdf() {
  if (!editorId) return
  // 从Monaco全局获取编辑器实例
  const editors = monaco.editor.getEditors()
  const resolvedEditorId =
    typeof editorId === 'object' && 'value' in editorId ? editorId.value : editorId
  const monacoEditor = editors.find((e) => e.getId?.() === resolvedEditorId) || editors[0]

  if (!pdfDoc || !monacoEditor) {
    eventBus.emit('show-info', t('latexEditor.notification.pdfNotAvailable'))
    return
  }

  try {
    // 获取当前光标位置
    const position = monacoEditor.getPosition()
    if (!position) {
      eventBus.emit('show-info', t('latexEditor.notification.noCursorPosition'))
      return
    }

    const key = `${position.lineNumber}-${position.column}`
    let pdfLocation = sourceToPdfMap.get(key)

    // 如果精确匹配不存在，尝试查找同一行的映射
    if (!pdfLocation) {
      // 查找同一行的第一个映射
      for (const [mapKey, mapValue] of sourceToPdfMap.entries()) {
        const [line] = mapKey.split('-').map(Number)
        if (line === position.lineNumber) {
          pdfLocation = mapValue
          break
        }
      }
    }

    if (pdfLocation) {
      pdfPreviewPanelRef.value?.scrollToPage(pdfLocation.pageNumber)
      await nextTick()
      await scrollToPdfLocation(pdfLocation)
    } else {
      eventBus.emit('show-info', t('latexEditor.notification.noPdfMapping'))
    }
  } catch (error) {
    logger.error('定位到PDF位置失败', error)
    eventBus.emit('show-error', t('latexEditor.notification.locateToPdfFailed'))
  }
}

// 滚动到PDF页面内的具体位置
async function scrollToPdfLocation(pdfLocation: {
  pageNumber: number
  pdfRange: { x: number; y: number; width: number; height: number }
}) {
  if (!pdfScrollbarRef.value || !pdfDoc) return

  try {
    // 等待页面元素准备好
    await nextTick()
    const pageElement = pageRefs.get(pdfLocation.pageNumber)
    if (!pageElement) {
      // 如果页面元素还没有准备好，先滚动到页面顶部
      await scrollToPage(pdfLocation.pageNumber)
      // 等待一下再重试
      await new Promise((resolve) => setTimeout(resolve, 300))
      const retryPageElement = pageRefs.get(pdfLocation.pageNumber)
      if (!retryPageElement) {
        logger.warn('页面元素仍未准备好，无法精确定位')
        return
      }
    }

    const finalPageElement = pageRefs.get(pdfLocation.pageNumber)
    if (!finalPageElement) return

    const scrollbarEl = (pdfScrollbarRef.value as any).$el as HTMLElement | null
    const scrollbarWrap = scrollbarEl?.querySelector('.el-scrollbar__wrap') as HTMLElement | null
    if (!scrollbarWrap) return

    // 获取页面元素的位置（相对于视口）
    const pageRect = finalPageElement.getBoundingClientRect()
    const containerRect = scrollbarWrap.getBoundingClientRect()

    // pdfRange是相对坐标（0-1之间），y坐标是从下往上的（PDF坐标系）
    // 需要转换为从上往下的坐标（DOM坐标系）
    const pdfRelativeY = pdfLocation.pdfRange.y // PDF坐标系：0=底部，1=顶部
    const domRelativeY = 1 - pdfRelativeY // DOM坐标系：0=顶部，1=底部

    // 获取页面的实际渲染高度
    const pageHeight = pageRect.height

    // 计算目标位置在页面元素内的像素位置（从顶部开始）
    const targetPageY = domRelativeY * pageHeight

    // 计算页面在滚动容器中的位置
    const scrollTop = scrollbarWrap.scrollTop
    // 页面顶部相对于滚动容器内容的位置
    const pageTopInScrollContent = pageRect.top - containerRect.top + scrollTop

    // 计算目标位置在滚动容器中的位置
    const targetInScrollContent = pageTopInScrollContent + targetPageY

    // 计算需要滚动的距离，使目标位置显示在视口的上1/3处（更易见）
    const viewportHeight = containerRect.height
    const targetScrollTop = targetInScrollContent - viewportHeight / 3

    // 执行滚动
    scrollbarWrap.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: 'smooth'
    })

    // 等待滚动完成后再选中文字
    await new Promise((resolve) => setTimeout(resolve, 400))

    // 选中对应的文字
    await selectPdfText(finalPageElement, pdfLocation.pdfRange)

    logger.debug('定位到PDF位置', {
      pageNumber: pdfLocation.pageNumber,
      pdfRange: pdfLocation.pdfRange,
      targetPageY,
      targetScrollTop
    })
  } catch (error) {
    logger.error('滚动到PDF位置失败', error)
    // 如果精确定位失败，至少滚动到页面顶部
    await scrollToPage(pdfLocation.pageNumber)
  }
}

// 选中PDF中的文字
async function selectPdfText(
  pageElement: HTMLElement,
  pdfRange: { x: number; y: number; width: number; height: number }
) {
  try {
    // 查找textLayer容器（尝试多种选择器）
    let textLayer = pageElement.querySelector(
      '.textLayer.vue-pdf__wrapper-text-layer'
    ) as HTMLElement | null
    if (!textLayer) {
      textLayer = pageElement.querySelector('.textLayer') as HTMLElement | null
    }
    if (!textLayer) {
      textLayer = pageElement.querySelector('.vue-pdf__wrapper-text-layer') as HTMLElement | null
    }

    if (!textLayer) {
      logger.warn('找不到textLayer容器，无法选中文字')
      return
    }

    // 获取textLayer的实际尺寸
    const textLayerRect = textLayer.getBoundingClientRect()
    const textLayerWidth = textLayerRect.width
    const textLayerHeight = textLayerRect.height

    if (textLayerWidth === 0 || textLayerHeight === 0) {
      logger.warn('textLayer尺寸为0，无法选中文字')
      return
    }

    // pdfRange是相对坐标（0-1之间），y坐标是从下往上的（PDF坐标系）
    const pdfRelativeY = pdfRange.y
    const domRelativeY = 1 - pdfRelativeY // 转换为DOM坐标系（从上往下）

    // 计算目标区域在textLayer中的像素坐标
    const targetX = pdfRange.x * textLayerWidth
    const targetY = domRelativeY * textLayerHeight
    const targetWidth = pdfRange.width * textLayerWidth
    const targetHeight = pdfRange.height * textLayerHeight

    // 获取所有span元素
    const spans = textLayer.querySelectorAll('span') as NodeListOf<HTMLElement>
    if (spans.length === 0) {
      logger.warn('textLayer中没有找到span元素')
      return
    }

    // 找到与目标区域重叠的span元素
    const targetSpans: HTMLElement[] = []
    const tolerance = 5 // 容差（像素），稍微增大以提高匹配率

    for (const span of spans) {
      const spanRect = span.getBoundingClientRect()
      // 计算span相对于textLayer的位置
      const spanX = spanRect.left - textLayerRect.left
      const spanY = spanRect.top - textLayerRect.top
      const spanRight = spanX + spanRect.width
      const spanBottom = spanY + spanRect.height

      // 检查span是否与目标区域重叠（使用更宽松的条件）
      const overlaps = !(
        spanRight < targetX - tolerance ||
        spanX > targetX + targetWidth + tolerance ||
        spanBottom < targetY - tolerance ||
        spanY > targetY + targetHeight + tolerance
      )

      if (overlaps) {
        targetSpans.push(span)
      }
    }

    if (targetSpans.length === 0) {
      logger.warn('没有找到匹配的span元素', {
        targetX,
        targetY,
        targetWidth,
        targetHeight,
        textLayerWidth,
        textLayerHeight,
        spansCount: spans.length
      })
      return
    }

    // 按位置排序span（从上到下，从左到右）
    targetSpans.sort((a, b) => {
      const rectA = a.getBoundingClientRect()
      const rectB = b.getBoundingClientRect()
      const topDiff = rectA.top - rectB.top
      if (Math.abs(topDiff) > 5) {
        return topDiff // 按Y坐标排序
      }
      return rectA.left - rectB.left // Y坐标相近时按X坐标排序
    })

    // 使用Selection API选中文字
    const selection = window.getSelection()
    if (!selection) return

    // 清除当前选择
    selection.removeAllRanges()

    // 创建新的Range
    const range = document.createRange()

    // 设置起始位置为第一个span的开始
    const firstSpan = targetSpans[0]
    // 尝试找到文本节点
    let startNode: Node | null = null
    let startOffset = 0

    if (firstSpan.firstChild) {
      startNode = firstSpan.firstChild
      if (startNode.nodeType === Node.TEXT_NODE) {
        startOffset = 0
      }
    } else {
      startNode = firstSpan
    }

    if (startNode) {
      range.setStart(startNode, startOffset)
    } else {
      range.setStartBefore(firstSpan)
    }

    // 设置结束位置为最后一个span的结束
    const lastSpan = targetSpans[targetSpans.length - 1]
    let endNode: Node | null = null
    let endOffset = 0

    if (lastSpan.lastChild) {
      endNode = lastSpan.lastChild
      if (endNode.nodeType === Node.TEXT_NODE) {
        endOffset = endNode.textContent?.length || 0
      } else {
        endNode = lastSpan
      }
    } else {
      endNode = lastSpan
    }

    if (endNode) {
      if (endNode.nodeType === Node.TEXT_NODE) {
        range.setEnd(endNode, endOffset)
      } else {
        range.setEndAfter(endNode)
      }
    } else {
      range.setEndAfter(lastSpan)
    }

    // 应用选择
    selection.addRange(range)

    const selectedText = selection.toString()
    logger.debug('已选中PDF文字', {
      spansCount: targetSpans.length,
      selectedText: selectedText.substring(0, 100) + (selectedText.length > 100 ? '...' : ''),
      textLength: selectedText.length
    })

    // 3秒后自动清除选择（可选）
    setTimeout(() => {
      const currentSelection = window.getSelection()
      if (currentSelection && currentSelection.toString() === selectedText) {
        currentSelection.removeAllRanges()
      }
    }, 3000)
  } catch (error) {
    logger.error('选中PDF文字失败', error)
  }
}

// 更新编辑器内容

// 刷新文章内容
eventBus.on('refresh', () => {
  // 1. 先清理旧的
  // if (editor.value) {           // editor.value 是 Monaco 实例
  //     try {
  //         const oldModel = editor.value.getModel(); // 获取模型
  //         editor.value.dispose();                  // 销毁 Monaco 实例
  //         if (oldModel) oldModel.dispose();       // 销毁模型
  //     } catch (e) {
  //         logger.warn("释放 Monaco 实例失败：", e);
  //     }
  //     editor.value = null;
  // }
  resetEditor()
})
const resetEditor = () => {
  // disposeEditor 函数已移除，直接重置
  editorKey.value = Date.now() // Vue 会销毁原 DOM，创建新 DOM
  nextTick(() => initEditor())
}

eventBus.on('search-replace', (payload?: any) => {
  //logger.log('search-replace');
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

  // 阻止默认行为和事件冒泡，因为这是我们的 resize bar
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
  // 阻止默认行为和事件冒泡
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
  // 通过 eventBus 通知 ConsoleOutput 组件滚动到底部
  eventBus.emit('console-scroll-to-bottom', { key: 'latex' })
}

const refreshContextMenu = async () => {
  articleContextMenuItems.value = (await getArticleContextMenuItems({
    isLatexEditor: true
  })) as any[]
}

// LaTeX 语言注册已由 registerLatexLanguage() 处理

let contentChangeListener: monaco.IDisposable | null = null
const editorId = ref<string | null>(null)
// Demo LaTeX content
const demoLatexContent = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{graphicx}

\\title{Demo LaTeX Document}
\\author{MetaDoc Demo}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introduction}

This is a demo LaTeX document for demonstration purposes. It shows the basic structure of a LaTeX document and how the editor works.

\\section{Mathematical Expressions}

Here is a sample equation:
\\begin{equation}
    E = mc^2
\\end{equation}

And here is an inline math expression: $a^2 + b^2 = c^2$

\\section{Lists}

\\begin{itemize}
    \\item First item
    \\item Second item
    \\item Third item
\\end{itemize}

\\section{Conclusion}

This demo document demonstrates the LaTeX editing capabilities of MetaDoc.

\\end{document}`

const initEditor = () => {
  // 使用统一的 Monaco Worker 配置
  setupMonacoWorker()
  // 注册 LaTeX 语言支持
  registerLatexLanguage()

  //logger.debug("LaTeXEditor initEditor")
  if (!editorEl.value) return

  // Demo mode: use demo content if editor is empty
  const editorValue = isDemo.value ? currentTex.value || demoLatexContent : currentTex.value

  editor.value = monaco.editor.create(editorEl.value, {
    value: editorValue,
    language: 'latex', // 语言模式
    theme: themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs', // 主题 (vs, vs-dark, hc-black)
    mouseWheelZoom: true,
    automaticLayout: true, // 自动适应容器大小
    fontSize: 14,
    wordWrap: 'on', // 自动换行
    wrappingIndent: 'same', // 缩进方式，"none" | "same" | "indent" | "deepIndent"
    lineNumbers: enableRowNumber ? 'on' : 'off',
    minimap: { enabled: enableMinimap },
    contextmenu: false,
    quickSuggestions: {
      other: true, // 在其他字符后自动显示补全建议
      comments: false, // 在注释中不显示
      strings: false // 在字符串中不显示
    },
    suggestOnTriggerCharacters: true, // 在触发字符（如 \）后自动显示补全
    acceptSuggestionOnCommitCharacter: true, // 在输入提交字符时接受补全
    acceptSuggestionOnEnter: 'on' // 按 Enter 时接受补全
  })
  editorId.value = editor.value.getId()
  textEditorAdapter.value = createMonacoAdapter(editorId.value)

  // 设置编辑器适配器（必须在内容变化监听之前设置）
  const adapter = new MonacoEditorAdapter(editorId.value, () => isActive.value)
  aiCompletionService.setAdapter(adapter)

  //editor.value.onKeyDown((e)=>logger.log(e));
  // 增量监听
  // 标志：是否正在更新ghost text（防止递归触发）
  let isUpdatingGhostText = false

  // 监听ghost text更新事件
  eventBus.on('ai-ghost-text-updating', (updating: unknown) => {
    isUpdatingGhostText = updating === true
  })

  contentChangeListener = editor.value.onDidChangeModelContent(
    (event: monaco.editor.IModelContentChangedEvent) => {
      const monacoEditor = getActiveMonacoEditor()
      if (!monacoEditor) return

      // 如果正在从外部更新，跳过同步逻辑（避免循环更新）
      if (isUpdatingFromExternal) {
        // 更新textBuffer以保持一致性
        textBuffer = monacoEditor.getValue()
        return
      }

      // 直接从编辑器获取完整文本，避免手动对 model 进行操作
      textBuffer = monacoEditor.getValue()

      // 如果正在更新ghost text，只同步文本，不触发新的补全
      if (isUpdatingGhostText) {
        // 重要：即使正在更新ghost text，也要同步文本到文件，否则文本会丢失
        debounceSync()
        return
      }

      // 按需同步到 Vue 响应式变量，比如防抖或定时同步
      debounceSync()

      // 检测是否是粘贴操作（粘贴通常涉及大量文本变化或多个changes）
      // 如果是粘贴，跳过AI补全触发，避免卡死
      const isPasteOperation =
        event.changes.length > 1 || event.changes.some((change) => change.text.length > 100)

      if (isPasteOperation) {
        // 粘贴操作，不触发AI补全
        return
      }

      // 确保适配器已设置（双重保险）
      if (!aiCompletionService.getAdapter()) {
        const adapter = new MonacoEditorAdapter(editorId.value ?? '', () => isActive.value)
        aiCompletionService.setAdapter(adapter)
      }

      // 用户继续打字时，立即取消当前补全
      aiCompletionService.cancelCurrentCompletion()

      // 触发AI补全（使用双层防抖，自动检测关键字符）
      aiCompletionService.triggerCompletion('input')
    }
  )
  const debounceSync = debounce(() => {
    if (currentTex.value !== textBuffer) {
      currentTex.value = textBuffer
      // 同步大纲树
      syncOutlineFromTex()
    }
  }, 100)

  // 监听光标位置变化（光标切换时不触发补全，只在用户停止输入后触发）
  // 注意：光标变化本身不触发补全，只有输入停止后才会触发
  // editor.value.onDidChangeCursorPosition(() => {
  //     // 光标变化时不触发补全（避免频繁触发）
  // });

  // 监听鼠标点击事件，切换光标位置时取消补全并切换到被动状态
  // 注意：只处理左键点击，右键点击用于打开上下文菜单，不应该拦截
  editor.value.onMouseDown((e: monaco.editor.IEditorMouseEvent) => {
    // 只处理左键点击（button === 0），右键点击（button === 2）不处理
    if (e.event.browserEvent.button === 0) {
      aiCompletionService.handleMouseClick()
    }
  })

  // 拦截 Monaco 的粘贴命令（处理 Ctrl+V 粘贴图片）
  // 使用 addCommand 来拦截粘贴命令，这样可以在 Monaco 处理之前检查图片
  // 注意：必须在编辑器完全初始化后注册，使用 nextTick 确保 DOM 和 Monaco 都准备好
  // 这样可以避免快捷键失效的问题（DOM 事件监听器可能会干扰 Monaco 的内部处理）
  nextTick(() => {
    if (editor.value) {
      editor.value.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, async () => {
        // 确保编辑器有焦点（快捷键需要焦点才能工作）
        if (editor.value && !editor.value.hasTextFocus()) {
          editor.value.focus()
        }

        // 先尝试 IPC 读取图片（更可靠）
        // 使用 Promise.race 确保不会阻塞太久，减少超时时间以提高响应速度
        const imageHandled = await Promise.race([
          handlePasteImage(),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 50)) // 50ms 超时，更快响应
        ])

        if (imageHandled) {
          // 图片已处理，阻止默认粘贴行为（不执行任何操作）
          return
        }

        // 如果没有图片，使用 textEditorAdapter 的 paste 方法执行文本粘贴
        // 这和使用右键菜单的方式一致，确保行为统一
        if (textEditorAdapter.value && typeof textEditorAdapter.value.paste === 'function') {
          try {
            await textEditorAdapter.value.paste()
          } catch (error) {
            logger.warn('粘贴文本失败', error)
            // 如果 textEditorAdapter 失败，尝试使用 Monaco 的原生命令
            if (editor.value) {
              try {
                editor.value.trigger('keyboard', 'editor.action.clipboardPasteAction', null)
              } catch (triggerError) {
                logger.warn('Monaco Editor 粘贴命令失败', triggerError)
              }
            }
          }
        } else {
          // 如果 textEditorAdapter 不可用，使用 Monaco 的原生命令
          if (editor.value) {
            try {
              editor.value.trigger('keyboard', 'editor.action.clipboardPasteAction', null)
            } catch (error) {
              logger.warn('Monaco Editor 粘贴命令失败', error)
            }
          }
        }
      })
    }
  })

  // 注意：不再使用 DOM paste 事件监听器，完全依赖 Monaco 的 addCommand
  // 这样可以避免事件冲突和时序问题，确保快捷键正常工作
  // DOM 事件监听器可能会在 Monaco 内部处理之前拦截事件，导致快捷键失效

  // 监听键盘事件，检测Enter、Space等触发按键
  editor.value.onKeyDown((e: monaco.IKeyboardEvent) => {
    // 注意：Ctrl+F 和 Ctrl+H 现在由 App.vue 全局监听，这里不再处理
    // 手动触发（Shift+Tab）
    if (e.shiftKey && e.keyCode === monaco.KeyCode.Tab) {
      e.preventDefault()
      e.stopPropagation()
      aiCompletionService.triggerCompletion('manual')
      return
    }

    // 重要：Tab键用于接受补全，不应该触发取消
    // Tab键的处理由AISuggestionGhost组件的命令处理
    if (e.keyCode === monaco.KeyCode.Tab) {
      return
    }

    // 检测触发按键（Enter、Space、;、,）
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
      // 用户继续打字时，立即取消当前补全
      aiCompletionService.cancelCurrentCompletion()
      // 触发补全（按键触发）
      aiCompletionService.triggerCompletion('key', key)
    } else {
      // 其他按键：用户继续打字，立即取消补全
      aiCompletionService.cancelCurrentCompletion()
    }
  })

  eventBus.emit('monaco-ready')
}

onMounted(async () => {
  try {
    // 重置卸载标志
    isComponentUnmounted = false

    // 添加全局错误处理，捕获未处理的 Promise rejection（特别是 vue3-pdfjs 的错误）
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason
      const errorMessage = error?.message || String(error)
      const errorStack = error?.stack || String(error)

      // 检查是否是 getComputedStyle 相关的错误（vue3-pdfjs 的常见错误）
      const isGetComputedStyleError =
        errorMessage.includes('getComputedStyle') ||
        errorMessage.includes('not of type') ||
        errorMessage.includes('Element') ||
        errorStack?.includes('getComputedStyle') ||
        errorStack?.includes('scaleCanvas2') ||
        errorStack?.includes('renderPage2') ||
        errorStack?.includes('vue3-pdfjs')

      if (isGetComputedStyleError) {
        // 这是预期的错误，当组件卸载或 DOM 未准备好时会发生
        // 阻止错误传播，避免在控制台显示
        event.preventDefault()
        return
      }

      // 其他错误正常处理（不阻止，让默认处理程序处理）
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateSearchMenuPosition)
      window.addEventListener('unhandledrejection', handleUnhandledRejection)
      // 保存清理函数
      ;(window as any)._latexEditorUnhandledRejectionHandler = handleUnhandledRejection
    }
    //logger.debug("LaTeXEditor onMounted")
    await waitForService('express')
    await refreshContextMenu()
    initEditor()

    // 监听AI分析开关变化
    eventBus.on('console-ai-analysis-toggle', (payload: any) => {
      if (payload && payload.key === 'latex') {
        enableAiAnalysis.value = payload.enabled
      }
    })

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
    initPdfJs()
    await nextTick()

    if (mainContainerRef.value) {
      const initialWidth = (mainContainerRef.value as HTMLElement).clientWidth
      if (initialWidth) {
        mainWidth.value = initialWidth
        ensurePdfWithinBounds()
      }
      mainObserver = new ResizeObserver((entries) => {
        if (!entries.length) return
        const width = entries[0].contentRect.width
        if (width !== mainWidth.value) {
          mainWidth.value = width
          ensurePdfWithinBounds()
          // 在组件大小变化时，暂时禁用 minimap 避免闪烁
          temporarilyDisableMinimap()
        }
      })
      mainObserver.observe(mainContainerRef.value)
    }

    // 监听窗口大小变化，暂时禁用 minimap 避免闪烁
    const handleWindowResize = () => {
      temporarilyDisableMinimap()
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleWindowResize)
      // 保存清理函数
      ;(window as any)._latexEditorResizeHandler = handleWindowResize
    }

    // 监听 PDF 容器大小变化，更新包装器大小
    await nextTick()
    if (pdfPagesContainer.value) {
      pdfContainerObserver = new ResizeObserver(() => {
        updateWrapperSize()
      })
      pdfContainerObserver.observe(pdfPagesContainer.value)
    }
  } catch (e) {
    logger.error(e)
    eventBus.emit('show-error', t('article.latex_init_failed') + e)
  } finally {
    loadingInstance.close()
  }
})

// 清理资源
onUnmounted(() => {
  //logger.debug("LaTeXEditor onUnmounted")
  // 设置卸载标志，防止后续操作
  isComponentUnmounted = true

  if (mainObserver) {
    mainObserver.disconnect()
    mainObserver = null
  }

  // 清理 PDF 容器观察器
  if (pdfContainerObserver) {
    pdfContainerObserver.disconnect()
    pdfContainerObserver = null
  }

  // 停止错误分析监听
  if (errorAnalysisWatchStop) {
    errorAnalysisWatchStop()
    errorAnalysisWatchStop = null
  }

  // 移除 console 输出监听器
  if (compileConsoleListeners.onStdout) {
    eventBus.off('console-out', compileConsoleListeners.onStdout)
  }
  if (compileConsoleListeners.onStderr) {
    eventBus.off('console-err', compileConsoleListeners.onStderr)
  }
  compileConsoleListeners = {}

  // 移除文本选择监听器
  removeTextSelectionListener()

  // 移除wheel事件监听器
  if (pdfPagesContainer.value) {
    pdfPagesContainer.value.removeEventListener('wheel', handlePdfWheel as any)
  }

  // 清理手型模式全局事件监听器
  document.removeEventListener('mousemove', handleHandModeMouseMoveGlobal)
  document.removeEventListener('mouseup', handleHandModeMouseUpGlobal)
  document.body.style.userSelect = ''

  // 移除滚动监听器
  removeScrollListener()

  // 移除编辑器适配器
  aiCompletionService.removeAdapter()

  // 清理内容变化监听器
  if (contentChangeListener) {
    contentChangeListener.dispose()
    contentChangeListener = null
  }

  eventBus.emit('is-need-save', true)

  // 注意：不再需要清理 paste 事件监听器，因为我们已经移除了 DOM 事件监听器
  // 现在完全依赖 Monaco 的 addCommand，它会自动清理

  if (editorId.value) {
    try {
      const editors = monaco.editor.getEditors()
      editors.forEach((ed) => {
        if (ed.getId() === editorId.value) {
          try {
            ed.dispose() // 释放 editor 的所有资源，包括模型、事件监听等
          } catch (e) {
            // 编辑器可能已经被销毁，忽略错误
          }
        }
      })
    } catch (e) {
      logger.warn('清理 Monaco 编辑器时出错', e)
    }
  }

  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateSearchMenuPosition)
    // 移除窗口 resize 监听器
    if ((window as any)._latexEditorResizeHandler) {
      window.removeEventListener('resize', (window as any)._latexEditorResizeHandler)
      delete (window as any)._latexEditorResizeHandler
    }
    // 移除未处理的 Promise rejection 监听器
    if ((window as any)._latexEditorUnhandledRejectionHandler) {
      window.removeEventListener(
        'unhandledrejection',
        (window as any)._latexEditorUnhandledRejectionHandler
      )
      delete (window as any)._latexEditorUnhandledRejectionHandler
    }
  }

  // 如果 minimap 被暂时禁用，恢复它
  if (isMinimapTemporarilyDisabled && editor.value && enableMinimap) {
    editor.value.updateOptions({
      minimap: { enabled: true }
    })
    isMinimapTemporarilyDisabled = false
  }

  // 移除AI分析开关监听器
  eventBus.off('console-ai-analysis-toggle')

  // 清理PDF加载状态
  loadedPdfUrl = null
  pdfDoc = null
})

function onAcceptSuggestion(text: string) {
  //logger.log("补全已接受:", text);
  // AISuggestionGhost已经帮忙插入了
}

function onCancelSuggestion() {
  //logger.log("补全已取消");
}
</script>

<style scoped>
.main-container {
  /* 设置主题背景色 */
  background-color: v-bind('themeState.currentTheme.background');
}

.content-container {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.latex-layout {
  display: flex;
  height: 100%;
  width: 100%;
}

.latex-main {
  display: flex;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
}

.latex-column {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.left-column {
  min-width: 360px;
  flex: 1 1 auto;
  overflow: hidden;
  position: relative;
}

.pdf-column {
  min-width: 360px;
  background-color: var(--el-bg-color-page);
  position: relative;
  flex: 0 0 auto;
}

.meta-column {
  min-width: 260px;
  max-width: 520px;
  overflow-y: auto;
  padding: 12px;
  box-sizing: border-box;
  color: var(--el-text-color-primary);
  flex: 0 0 auto;
}

.resize-handle {
  width: 6px;
  cursor: col-resize;
  display: flex;
  align-items: center;
  justify-content: center;
}

.resize-handle::after {
  content: '';
  width: 2px;
  height: 60%;
  background-color: var(--el-border-color);
  border-radius: 1px;
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

.toolbar-icon.is-compiling {
  cursor: not-allowed;
  pointer-events: none;
  opacity: 0.8;
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
  z-index: 1;
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

.pdf-toolbar {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  overflow: hidden; /* 防止内容溢出 */
  flex-wrap: nowrap; /* 禁止换行 */
}

.pdf-toolbar__page {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap; /* 防止换行 */
  flex-shrink: 0; /* 防止收缩 */
  min-width: 0; /* 允许内容溢出时使用省略号 */
}

.pdf-toolbar__page input {
  width: 50px;
  text-align: center;
  flex-shrink: 0;
}

.pdf-toolbar__page-label {
  white-space: nowrap; /* 防止标签换行 */
  flex-shrink: 1; /* 允许在空间不足时收缩 */
  overflow: hidden;
  text-overflow: ellipsis;
}

.pdf-toolbar__pages-per-row {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  flex-shrink: 0;
  margin-left: 4px;
}

.pdf-toolbar__pages-per-row-label {
  white-space: nowrap;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.pdf-toolbar-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 5px;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.pdf-toolbar-icon:hover {
  background-color: rgba(66, 66, 66, 0.35);
}

.pdf-toolbar-icon.active {
  background-color: rgba(99, 99, 99, 0.45);
  color: var(--el-color-primary);
}

.pdf-toolbar-icon.active .el-icon {
  color: var(--el-color-primary);
}

.pdf-preview-container {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--el-border-color-lighter);
}

/* el-scrollbar 作为 pdf-preview-container 时的样式 */
.pdf-preview-container :deep(.el-scrollbar__wrap) {
  overflow-x: auto;
  overflow-y: auto;
}

/* 手型模式：隐藏滚动条 */
.pdf-preview-container.hand-mode :deep(.el-scrollbar__wrap) {
  overflow: hidden;
}

.pdf-preview-container.hand-mode :deep(.el-scrollbar__bar) {
  display: none;
}

/* 手型模式：设置光标 */
.pdf-preview-container.hand-mode .pdf-pages-wrapper {
  cursor: grab;
  user-select: none;
}

.pdf-preview-container.hand-mode .pdf-pages-wrapper:active {
  cursor: grabbing;
}

/* 指针模式：允许文本选择 */
.pdf-preview-container.pointer-mode .pdf-pages-wrapper {
  cursor: default;
  user-select: text;
}

/* 包装器：根据缩放比例动态调整大小，避免滚动条过长和底部空白 */
.pdf-pages-wrapper {
  position: relative;
  display: block;
  /* 高度和宽度通过内联样式动态设置，直接等于 pdf-pages-container 的布局大小 */
  /* 确保左对齐 */
  text-align: left;
}

.pdf-pages-container {
  /* grid布局通过内联样式动态设置 */
  padding: 20px;
  /* gap 使用固定值，因为整个容器会通过 transform scale 一起缩放 */
  /* gap 会随着容器的缩放自动按比例调整 */
  /* transform scale 通过内联样式动态设置在容器上 */
  /* 移除 min-height 和 min-width，让容器根据实际内容大小自适应 */
  /* 包装器会根据缩放比例动态调整大小 */
  box-sizing: border-box;
  overflow: visible; /* 内层直接 visible，让内容自然溢出 */
  /* 优化渲染质量 */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.pdf-page-wrapper {
  display: flex;
  justify-content: flex-start; /* 左对齐，不要居中 */
  align-items: flex-start;
  background-color: var(--pdf-page-bg, #ffffff);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  /* 容器大小自动匹配内容，不设置固定宽度 */
  width: fit-content;
  /* 移除 max-width 限制，允许页面在缩放后超出容器宽度，触发横向滚动 */
  margin: 0; /* 移除 auto，确保左对齐 */
  flex-shrink: 0; /* 防止页面被压缩 */
  /* transform scale 现在应用到父容器 .pdf-pages-container 上 */
  /* 这样整个容器（包括 gap）会一起缩放，保持布局一致性 */
}

.vue-pdf-wrapper {
  /* VuePdf组件会自动根据scale调整大小，容器跟随内容 */
  display: inline-block;
}

/* 确保PDF页面本身有白色背景，避免暗色模式下的闪烁 */
.pdf-page-wrapper .vue-pdf-main {
  background-color: var(--pdf-page-bg, #ffffff);
}

.pdf-page-wrapper .vue-pdf {
  background-color: var(--pdf-page-bg, #ffffff);
}

.pdf-page-wrapper .vue-pdf__wrapper {
  background-color: var(--pdf-page-bg, #ffffff);
}

/* PDF页面canvas应该有白色背景，并优化渲染质量 */
.pdf-page-wrapper canvas {
  background-color: var(--pdf-page-bg, #ffffff);
  /* 优化缩放时的渲染质量 */
  /* 注意：不要在这里设置 transform，因为缩放是在 .pdf-page-wrapper 上应用的 */
  image-rendering: auto; /* 使用默认渲染，避免crisp-edges导致的锯齿 */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  /* 保持原始分辨率，不损失 DPI */
}

/* 优化文本层渲染 */
.pdf-page-wrapper .textLayer {
  opacity: 1;
}

/* PDF定位高亮样式 */
:global(.pdf-locate-highlight-line) {
  background-color: rgba(64, 158, 255, 0.15) !important;
  border-left: 3px solid rgba(64, 158, 255, 0.8) !important;
}

:global(.pdf-locate-highlight-range) {
  background-color: rgba(64, 158, 255, 0.25) !important;
  border: 1px solid rgba(64, 158, 255, 0.6) !important;
  border-radius: 2px;
}

.pdf-empty-text {
  color: #999;
  font-weight: normal;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  user-select: none;
  pointer-events: none;
  margin: 0;
  font-size: 1.1rem;
  color: var(--text-color, #999);
  text-align: center;
}

.context-menu {
  position: fixed;
  z-index: 1000;
}
</style>
