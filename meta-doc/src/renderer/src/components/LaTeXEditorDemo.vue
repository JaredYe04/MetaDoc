<template>
  <div class="latex-editor-demo" :class="{ 'demo-mode': mode === 'demo' }">
    <div
      class="editor-toolbar"
      :style="{ backgroundColor: themeState.currentTheme.editorToolbarBackgroundColor }"
    >
      <div class="toolbar-group">
        <Tooltip>
          <TooltipTrigger as-child>
            <div class="toolbar-icon" @click="handleUndo">
              <ArrowLeft class="w-4 h-4" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">{{
            $t('latexEditor.toolbar.undo') || '撤销'
          }}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger as-child>
            <div class="toolbar-icon" @click="handleRedo">
              <ArrowRight class="w-4 h-4" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">{{
            $t('latexEditor.toolbar.redo') || '重做'
          }}</TooltipContent>
        </Tooltip>

        <Divider direction="vertical" />

        <Tooltip>
          <TooltipTrigger as-child>
            <div class="toolbar-icon" @click="handleZoomIn">
              <ZoomIn class="w-4 h-4" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">{{
            $t('latexEditor.toolbar.zoomIn') || '放大'
          }}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger as-child>
            <div class="toolbar-icon" @click="handleZoomOut">
              <ZoomOut class="w-4 h-4" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">{{
            $t('latexEditor.toolbar.zoomOut') || '缩小'
          }}</TooltipContent>
        </Tooltip>

        <Divider direction="vertical" />

        <Tooltip>
          <TooltipTrigger as-child>
            <div class="toolbar-icon" @click="toggleLineNumbers">
              <ListOrdered class="w-4 h-4" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">{{
            $t('latexEditor.toolbar.toggleLineNumbers') || '切换行号'
          }}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger as-child>
            <div class="toolbar-icon" @click="toggleMinimap">
              <MapIcon class="w-4 h-4" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">{{
            $t('latexEditor.toolbar.togglePreview') || '切换预览'
          }}</TooltipContent>
        </Tooltip>
      </div>

      <div class="toolbar-group">
        <Tooltip>
          <TooltipTrigger as-child>
            <div class="toolbar-icon" @click="togglePdfPreview">
              <FileText class="w-4 h-4" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">{{
            $t('latexEditor.toolbar.showPdf') || '显示 PDF'
          }}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger as-child>
            <div class="toolbar-icon" @click="toggleConsole">
              <Terminal class="w-4 h-4" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">{{
            $t('latexEditor.toolbar.showConsole') || '显示终端'
          }}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger as-child>
            <div class="toolbar-icon compile-btn" @click="handleCompile">
              <Play class="w-4 h-4" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">{{
            $t('latexEditor.toolbar.compile') || '编译'
          }}</TooltipContent>
        </Tooltip>
      </div>
    </div>

    <div class="editor-container">
      <div ref="editorRef" class="monaco-editor-wrapper"></div>
    </div>

    <!-- Demo Notice -->
    <div v-if="mode === 'demo'" class="demo-notice">
      <Info class="w-4 h-4" />
      <span>{{
        $t('latexEditor.demoNotice') || '演示模式：这是一个简化版的 LaTeX 编辑器演示'
      }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ArrowLeft,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  ListOrdered,
  Map as MapIcon,
  FileText,
  Terminal,
  Play,
  Info
} from 'lucide-vue-next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { Divider } from '@renderer/components/ui/separator'
import * as monaco from 'monaco-editor'
import { setupMonacoWorker } from '../utils/monaco-worker-config'
import { themeState } from '../utils/themes'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    mode?: 'normal' | 'demo'
    initialContent?: string
  }>(),
  {
    mode: 'normal',
    initialContent: ''
  }
)

const emit = defineEmits<{
  (e: 'compile'): void
  (e: 'toggle-pdf'): void
  (e: 'toggle-console'): void
}>()

// Default LaTeX content for demo
const defaultLatexContent = `\\documentclass[12pt,a4paper]{article}

% 中文支持
\\usepackage{xeCJK}
\\setCJKmainfont{SimSun}

% 页面设置
\\usepackage{geometry}
\\geometry{left=2.5cm,right=2.5cm,top=2.5cm,bottom=2.5cm}

% 数学支持
\\usepackage{amsmath}
\\usepackage{amssymb}

% 图表支持
\\usepackage{graphicx}
\\usepackage{booktabs}

% 标题信息
\\title{\\textbf{示例文档}}
\\author{MetaDoc 用户}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
这是一个使用 MetaDoc 编辑器创建的示例 LaTeX 文档。本文档展示了基本的 LaTeX 排版功能。
\\end{abstract}

\\section{引言}

LaTeX 是一种基于 TeX 的文档排版系统，特别适合于包含复杂数学公式的科技文档。

\\subsection{文档特点}

\\begin{itemize}
    \\item 专业的数学公式排版
    \\item 自动处理参考文献
    \\item 自动生成目录和交叉引用
    \\item 稳定的分页和换行
\\end{itemize}

\\section{数学公式}

行内公式示例：$E = mc^2$ 是著名的质能方程。

独立编号的公式：
\\begin{equation}
    \\int_{a}^{b} f(x) \\, dx = F(b) - F(a)
\\end{equation}

\\section{总结}

本文档展示了 LaTeX 的基本功能。使用 MetaDoc，您可以：

\\begin{enumerate}
    \\item 实时预览 PDF 输出
    \\item 使用智能补全编写代码
    \\item 一键编译生成文档
    \\item 使用 AI 辅助校对内容
\\end{enumerate}

\\end{document}
`

const editorRef = ref<HTMLDivElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let editorId: string | null = null

const fontSize = ref(14)
const showLineNumbers = ref(true)
const showMinimap = ref(true)

// Initialize Monaco editor
const initEditor = async () => {
  if (!editorRef.value) return

  setupMonacoWorker()

  const isDark = themeState.currentTheme.type === 'dark'
  const content = props.initialContent || defaultLatexContent

  editor = monaco.editor.create(editorRef.value, {
    value: content,
    language: 'latex',
    theme: isDark ? 'vs-dark' : 'vs',
    readOnly: props.mode === 'demo',
    fontSize: fontSize.value,
    lineNumbers: showLineNumbers.value ? 'on' : 'off',
    minimap: { enabled: showMinimap.value },
    automaticLayout: true,
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    renderLineHighlight: 'all',
    padding: { top: 16, bottom: 16 }
  })

  editorId = editor.getId()

  // Apply theme colors
  applyEditorTheme()
}

const applyEditorTheme = () => {
  if (!editor) return

  const isDark = themeState.currentTheme.type === 'dark'
  const bg = themeState.currentTheme.editorBackgroundColor || (isDark ? '#1e1e1e' : '#ffffff')
  const fg = themeState.currentTheme.textColor || (isDark ? '#d4d4d4' : '#333333')

  monaco.editor.defineTheme('latex-demo-theme', {
    base: isDark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': bg,
      'editor.foreground': fg
    }
  })

  monaco.editor.setTheme('latex-demo-theme')
}

// Toolbar handlers
const handleUndo = () => {
  editor?.trigger('keyboard', 'undo', null)
}

const handleRedo = () => {
  editor?.trigger('keyboard', 'redo', null)
}

const handleZoomIn = () => {
  if (!editor) return
  fontSize.value = Math.min(fontSize.value + 1, 24)
  editor.updateOptions({ fontSize: fontSize.value })
}

const handleZoomOut = () => {
  if (!editor) return
  fontSize.value = Math.max(fontSize.value - 1, 10)
  editor.updateOptions({ fontSize: fontSize.value })
}

const toggleLineNumbers = () => {
  if (!editor) return
  showLineNumbers.value = !showLineNumbers.value
  editor.updateOptions({ lineNumbers: showLineNumbers.value ? 'on' : 'off' })
}

const toggleMinimap = () => {
  if (!editor) return
  showMinimap.value = !showMinimap.value
  editor.updateOptions({ minimap: { enabled: showMinimap.value } })
}

const togglePdfPreview = () => {
  emit('toggle-pdf')
}

const toggleConsole = () => {
  emit('toggle-console')
}

const handleCompile = () => {
  if (props.mode === 'demo') {
    // In demo mode, just show a visual feedback
    return
  }
  emit('compile')
}

// Get current content
const getContent = () => {
  return editor?.getValue() || ''
}

// Watch for theme changes
watch(
  () => themeState.currentTheme,
  () => {
    applyEditorTheme()
  },
  { deep: true }
)

onMounted(() => {
  initEditor()
})

onBeforeUnmount(() => {
  if (editor) {
    editor.dispose()
    editor = null
    editorId = null
  }
})

defineExpose({
  getContent,
  editor
})
</script>

<style scoped>
.latex-editor-demo {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background-color: var(--editor-bg, v-bind('themeState.currentTheme.editorBackgroundColor'));
  border: 1px solid var(--editor-border, v-bind('themeState.currentTheme.borderColor'));
  border-radius: 8px;
  overflow: hidden;
}

.latex-editor-demo.demo-mode {
  min-height: 400px;
  height: 400px;
}

.editor-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--editor-border, v-bind('themeState.currentTheme.borderColor'));
  flex-shrink: 0;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  cursor: pointer;
  border-radius: 4px;
  color: var(--toolbar-icon-color, v-bind('themeState.currentTheme.textColor2'));
  transition: all 0.2s ease;
}

.toolbar-icon:hover {
  background-color: var(--toolbar-hover-bg, v-bind('themeState.currentTheme.background2nd'));
  color: var(--toolbar-icon-hover-color, v-bind('themeState.currentTheme.textColor'));
}

.compile-btn {
  color: var(--primary-color, v-bind('themeState.currentTheme.primary'));
}

.compile-btn:hover {
  background-color: var(--primary-hover-bg, v-bind('themeState.currentTheme.primary'));
  color: white;
  opacity: 0.9;
}

.editor-container {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.monaco-editor-wrapper {
  width: 100%;
  height: 100%;
}

.demo-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--notice-bg, v-bind('themeState.currentTheme.background2nd'));
  border-top: 1px solid var(--notice-border, v-bind('themeState.currentTheme.borderColor'));
  font-size: 12px;
  color: var(--notice-text, v-bind('themeState.currentTheme.textColor2'));
  flex-shrink: 0;
}

.demo-notice :deep(svg) {
  flex-shrink: 0;
}
</style>
