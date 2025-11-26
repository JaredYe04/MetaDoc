<template>
  <div class="section-optimizer" :style="menuStyles" @mousedown.prevent="onMouseDown">
    <div style="width: 100%; height: fit-content; align-items: end; padding-bottom: 10px;">
      <el-button
        circle plain
        size="small"
        type="danger"
        @click="$emit('close')"
        class="aero-btn"
        style="float: inline-start;"
        @mousedown.prevent
      >
      </el-button>
    </div>

    <p style="font-weight: bold;" @mousedown.stop>
      {{ props.title ? props.title : t('sectionOptimizer.defaultTitle') }}
    </p>

    <!-- 内容预览区域 -->
    <div class="content-preview" @mousedown.stop>
      <!-- Markdown预览 -->
      <MarkdownItEditor
        v-if="language === 'markdown' && !generated && !generating"
        :source="articleContent"
        class="preview-container"
      />
      <MarkdownItEditor
        v-if="language === 'markdown' && (generated || generating)"
        :source="generatedText"
        class="preview-container"
      />
      <!-- LaTeX预览（使用Monaco） -->
      <div
        v-if="language === 'latex'"
        ref="previewContainerRef"
        class="preview-container monaco-preview"
      ></div>
    </div>

    <!-- 改进的提示词输入框，参考ChatComposer -->
    <div class="prompt-input-wrapper" @mousedown.stop>
      <div
        class="composer-shell"
        :class="{ 'is-multiline': isMultiline }"
        :style="{
          backgroundColor: themeState.currentTheme.background,
          color: themeState.currentTheme.textColor,
          borderColor: themeState.currentTheme.background2nd ?? 'rgba(0,0,0,0.08)'
        }"
      >
        <div class="composer-leading">
          <el-tooltip v-if="showPresetButton" :content="t('sectionOptimizer.showPresets')" placement="top">
            <el-button
              circle
              class="composer-btn"
              :disabled="disabled"
              @click.prevent="showPresets = !showPresets"
            >
              <Plus />
            </el-button>
          </el-tooltip>
        </div>

        <el-scrollbar
          ref="scrollbarRef"
          class="composer-scroll"
          :wrap-style="scrollbarWrapStyle"
          :view-class="'composer-scroll-view'"
        >
          <textarea
            ref="textareaRef"
            :value="userPrompt"
            class="composer-textarea"
            :placeholder="t('sectionOptimizer.inputPlaceholder')"
            :disabled="disabled"
            rows="1"
            @input="handleInput"
            @keydown="handleKeydown"
          />
        </el-scrollbar>

        <div class="composer-actions">
          <el-tooltip :content="t('sectionOptimizer.clear')" placement="top">
            <el-button
              circle
              class="composer-btn"
              :disabled="disabled || !userPrompt.trim().length"
              @click.prevent="userPrompt = ''"
            >
              <Refresh />
            </el-button>
          </el-tooltip>
        </div>
      </div>

      <!-- 预设提示词下拉列表 -->
      <div v-if="showPresets" class="preset-suggestions">
        <div
          v-for="(preset, index) in presetPrompts"
          :key="index"
          class="preset-item"
          @click="selectPreset(preset.value)"
        >
          {{ preset.label || preset.value }}
        </div>
      </div>
    </div>

    <div @mousedown.stop style="align-items: center; margin-top: 20px;">
      <el-slider
        v-model="context_mode"
        :step="1"
        :min="0"
        :max="2"
        style="width: 60%; display: inline-block; align-self: center; margin-left: 20%; margin-right: 20%;"
        show-stops
        :marks="{
          0: t('sectionOptimizer.contextMarks.none'),
          1: t('sectionOptimizer.contextMarks.chapter'),
          2: t('sectionOptimizer.contextMarks.full')
        }"
        :format-tooltip="formatTooltip"
      />
    </div>

    <div @mousedown.stop class="action-buttons">
      <el-tooltip :content="t('sectionOptimizer.tooltips.generate')" placement="top">
        <el-button
          circle
          type="primary"
          @click.prevent="generate"
          :disabled="generating || generated || userPrompt.length === 0"
        >
          <el-icon><Promotion /></el-icon>
        </el-button>
      </el-tooltip>

      <el-tooltip :content="t('sectionOptimizer.tooltips.reset')" placement="top" v-if="generated">
        <el-button circle type="info" @click.prevent="reset">
          <el-icon><RefreshLeft /></el-icon>
        </el-button>
      </el-tooltip>

      <el-tooltip :content="t('sectionOptimizer.tooltips.chat')" placement="top" v-if="generated">
        <el-button circle type="info" @click.prevent="chat">
          <el-icon><ChatLineRound /></el-icon>
        </el-button>
      </el-tooltip>

      <el-tooltip :content="t('sectionOptimizer.tooltips.acceptReplace')" placement="top" v-if="generated">
        <el-button circle type="success" @click.prevent="accept(false)">
          <el-icon><Check /></el-icon>
        </el-button>
      </el-tooltip>

      <el-tooltip :content="t('sectionOptimizer.tooltips.acceptAppend')" placement="top" v-if="generated">
        <el-button circle type="success" @click.prevent="accept(true)">
          <el-icon><Plus /></el-icon>
        </el-button>
      </el-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick, onBeforeUnmount, computed } from 'vue'
import { Plus, Refresh } from '@element-plus/icons-vue'
import { Promotion, RefreshLeft, ChatLineRound, Check } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { themeState } from '../utils/themes'
import type { ScrollbarInstance } from 'element-plus'
import type { SectionOptimizerAdapter, SectionInfo } from './section-optimizer/types'
import { sectionChangePrompt } from '../utils/prompts'
import eventBus from '../utils/event-bus'
import { generateMarkdownFromOutlineTree } from '../utils/md-utils'
import { ai_types, createAiTask } from '../utils/ai_tasks'
import { getSetting } from '../utils/settings'
import { useWorkspace } from '../stores/workspace'
import { useActiveDocument } from '../composables/useActiveDocument'
import { searchNode } from '../utils/outline-helpers'
import { DEFAULT_AI_CHAT_MESSAGES } from '../constants/document'
// @ts-ignore - vue3-markdown-it 没有类型定义
import MarkdownItEditor from 'vue3-markdown-it'
import * as monaco from 'monaco-editor'

const { t } = useI18n()

const props = defineProps<{
  title: string
  position: { top: number; left: number }
  path: string
  tree: any
  adapter: SectionOptimizerAdapter
  language: 'markdown' | 'latex'
  sectionInfo?: SectionInfo // 可选的初始sectionInfo
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'accept', payload: { append: boolean; content: string; sectionInfo?: SectionInfo }): void
}>()

const workspace = useWorkspace()
const { activeTabId, updateDocumentAiDialogs } = workspace
const { activeDocument } = useActiveDocument()

const currentOutline = computed(() => props.tree ?? activeDocument.value?.outline ?? null)
const currentMarkdown = computed(() => activeDocument.value?.markdown ?? '')
const currentTex = computed(() => activeDocument.value?.tex ?? '')

function formatTooltip(val: number) {
  if (val === 0) {
    return t('sectionOptimizer.contextTooltips.none')
  }
  if (val === 1) {
    return t('sectionOptimizer.contextTooltips.chapter')
  }
  if (val === 2) {
    return t('sectionOptimizer.contextTooltips.full')
  }
}

const context_mode = ref(1)
const presetPrompts = computed(() => {
  const prompts = props.language === 'latex' 
    ? t('sectionOptimizer.presetPrompts.latex', { returnObjects: true })
    : t('sectionOptimizer.presetPrompts.markdown', { returnObjects: true })
  return Array.isArray(prompts) ? prompts.map((p: any) => ({
    value: typeof p === 'string' ? p : p.value,
    label: typeof p === 'string' ? p : p.label || p.value
  })) : []
})

const pushDialogToDocument = (dialog: any) => {
  const doc = activeDocument.value
  const tabId = activeTabId.value
  if (!doc || !tabId) return
  const existing = Array.isArray(doc.aiDialogs) ? doc.aiDialogs : []
  const nextDialogs = [dialog, ...existing]
  updateDocumentAiDialogs(tabId, nextDialogs)
}

const accept = async (append = false) => {
  let content = generatedText.value
  if (content.length > 0 && content[content.length - 1] !== '\n') {
    content += '\n'
  }

  // 如果第一行是标题，去掉标题（仅对Markdown）
  if (props.language === 'markdown' && content.startsWith('#')) {
    content = content.split('\n').slice(1).join('\n')
  }
  
  // 使用保存的sectionInfo，如果没有则尝试获取
  let sectionInfo: SectionInfo | undefined = props.sectionInfo
  if (!sectionInfo && props.adapter && props.path) {
    try {
      const outline = props.adapter.getOutlineTree()
      if (outline) {
        const { searchNode } = await import('../utils/outline-helpers')
        const node = searchNode(props.path, outline)
        if (node) {
          // 尝试获取完整的sectionInfo（包括range）
          try {
            const fullText = props.adapter.getFullText()
            const lines = fullText.split('\n')
            let sectionStart = -1
            let sectionEnd = lines.length
            
            // 查找章节标题在全文中的位置
            const nodeTitle = node.title || props.title
            if (nodeTitle) {
              if (props.language === 'markdown') {
                // Markdown: 查找标题行
                for (let i = 0; i < lines.length; i++) {
                  const mdMatch = lines[i].match(/^(#{1,6})\s+(.+)$/)
                  if (mdMatch && mdMatch[2].trim() === nodeTitle) {
                    sectionStart = i
                    const titleLevel = mdMatch[1].length
                    for (let j = i + 1; j < lines.length; j++) {
                      const nextMatch = lines[j].match(/^(#{1,6})\s+/)
                      if (nextMatch && nextMatch[1].length <= titleLevel) {
                        sectionEnd = j
                        break
                      }
                    }
                    break
                  }
                }
              } else {
                // LaTeX: 查找章节命令
                for (let i = 0; i < lines.length; i++) {
                  const latexMatch = lines[i].match(/\\\w+\*?\{(.*?)\}/)
                  if (latexMatch && latexMatch[1].trim() === nodeTitle) {
                    sectionStart = i
                    for (let j = i + 1; j < lines.length; j++) {
                      if (/\\\w+\*?\{/.test(lines[j])) {
                        sectionEnd = j
                        break
                      }
                    }
                    break
                  }
                }
              }
            }
            
            sectionInfo = {
              title: props.title,
              path: props.path,
              content: node.text || articleContent.value,
              range: sectionStart >= 0 ? {
                start: { line: sectionStart, column: 0 },
                end: { line: sectionEnd, column: lines[sectionEnd]?.length || 0 }
              } : undefined
            }
          } catch (e) {
            console.warn('Failed to get section range:', e)
            sectionInfo = {
              title: props.title,
              path: props.path,
              content: node.text || articleContent.value
            }
          }
        }
      }
    } catch (e) {
      console.warn('Failed to get section info:', e)
    }
  }
  
  // 不在这里直接应用内容，而是通过事件传递给父组件
  articleContent.value = content
  emit('accept', {
    append: append,
    content: content,
    sectionInfo: sectionInfo
  })
  reset()
}

const generate = async () => {
  const outlineNode = currentOutline.value
  if (!outlineNode) return
  generating.value = true
  const outlineMarkdown = generateMarkdownFromOutlineTree(outlineNode)

  // 根据语言类型使用不同的提示词
  const fullText = props.language === 'latex' ? currentTex.value : currentMarkdown.value
  const prompt = sectionChangePrompt(
    outlineMarkdown,
    articleContent.value,
    props.title,
    userPrompt.value,
    context_mode.value,
    fullText,
    props.language
  )
  const { done } = createAiTask(props.title, prompt, generatedText, ai_types.answer, 'section-optimizer')
  generating.value = true
  generated.value = false

  try {
    await done
  } catch (err) {
    //console.warn('任务失败或取消：', err);
  } finally {
    generated.value = true
    generating.value = false
  }
}

const chat = async () => {
  const outlineNode = currentOutline.value
  if (!outlineNode) return
  const outlineMarkdown = generateMarkdownFromOutlineTree(outlineNode)
  const fullText = props.language === 'latex' ? currentTex.value : currentMarkdown.value
  const prompt = sectionChangePrompt(
    outlineMarkdown,
    articleContent.value,
    props.title,
    userPrompt.value,
    context_mode.value,
    fullText,
    props.language
  )
  const messages = JSON.parse(JSON.stringify(DEFAULT_AI_CHAT_MESSAGES))
  messages.push({
    role: 'user',
    content: prompt
  })
  messages.push({
    role: 'assistant',
    content: generatedText.value
  })
  const newDialog = {
    title: props.title,
    messages,
  }
  pushDialogToDocument(newDialog)
  eventBus.emit('ai-chat')
}

const selectPreset = (value: string) => {
  userPrompt.value = value
  showPresets.value = false
}

const reset = () => {
  generated.value = false
  generatedText.value = ''
}

const generating = ref(false)
const userPrompt = ref('')
const generatedText = ref('')
const generated = ref(false)
const articleContent = ref('')
const showPresets = ref(false)
const showPresetButton = computed(() => presetPrompts.value.length > 0)

const language = computed(() => props.language)

// Monaco编辑器相关
const previewContainerRef = ref<HTMLElement | null>(null)
let previewEditor: monaco.editor.IStandaloneCodeEditor | null = null
let previewEditorId: string | null = null

// ChatComposer风格的输入框
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const scrollbarRef = ref<ScrollbarInstance | null>(null)
const maxScrollHeight = ref(0)
const singleLineHeight = ref<number | null>(null)
const isMultiline = ref(false)
const disabled = computed(() => generating.value || generated.value)

const updateMaxScrollHeight = () => {
  maxScrollHeight.value = Math.max(180, Math.floor(window.innerHeight * 0.4))
}

const scrollbarWrapStyle = computed(() => ({
  maxHeight: `${maxScrollHeight.value}px`,
  overflowX: 'hidden'
}))

const multilineThreshold = 6
const autoResize = () => {
  if (!textareaRef.value) return
  const el = textareaRef.value
  el.style.height = 'auto'
  if (!singleLineHeight.value) {
    const style = window.getComputedStyle(el)
    const lineHeight = parseFloat(style.lineHeight || '0')
    const padding = parseFloat(style.paddingTop || '0') + parseFloat(style.paddingBottom || '0')
    const base = Math.ceil(lineHeight + padding)
    singleLineHeight.value = base > 0 ? base : el.scrollHeight
  }
  el.style.height = `${el.scrollHeight}px`
  if (singleLineHeight.value) {
    const lines = Math.round(el.scrollHeight / singleLineHeight.value)
    isMultiline.value = lines > multilineThreshold
  } else {
    isMultiline.value = false
  }
  nextTick(() => {
    scrollbarRef.value?.update()
    const wrap = scrollbarRef.value?.wrapRef
    if (wrap && wrap.scrollHeight > wrap.clientHeight) {
      wrap.scrollTop = wrap.scrollHeight
    }
  })
}

const handleInput = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  userPrompt.value = target.value
  autoResize()
}

const handleKeydown = (event: KeyboardEvent) => {
  if (disabled.value) return
  if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
    // Enter键提交，Shift+Enter换行
    event.preventDefault()
    if (userPrompt.value.trim().length > 0 && !generating.value && !generated.value) {
      generate()
    }
  }
}

const menuStyles = computed(() => ({
  position: 'absolute' as const,
  top: `${menuPosition.value.top}px`,
  left: `${menuPosition.value.left}px`,
  border: '1px solid #ccc',
  padding: '10px',
  boxShadow: '0px 2px 10px rgba(0, 0, 0, 0.2)',
  minWidth: '500px',
  maxWidth: '800px',
  maxHeight: '90vh',
  overflow: 'auto',
  zIndex: 1000,
  color: themeState.currentTheme.textColor2,
  backdropFilter: 'blur(5px)',
  background: themeState.currentTheme.titleMenuBackground,
}))

const refreshContent = async () => {
  // 优先使用传入的 sectionInfo 的内容
  if (props.sectionInfo && props.sectionInfo.content) {
    articleContent.value = props.sectionInfo.content
    return
  }
  
  // 其次使用大纲树中的内容
  const outlineNode = currentOutline.value
  if (!outlineNode) {
    articleContent.value = ''
    return
  }
  
  // 如果有适配器，优先使用适配器获取outline
  let outline = outlineNode
  if (props.adapter) {
    try {
      const adapterOutline = props.adapter.getOutlineTree()
      if (adapterOutline) {
        outline = adapterOutline
      }
    } catch (e) {
      console.warn('Failed to get outline from adapter:', e)
    }
  }
  
  // 从大纲树中查找节点
  if (props.path) {
    const node = searchNode(props.path, outline)
    if (node && node.text) {
      // 如果节点有text，使用它（可能需要去掉标题部分）
      let content = node.text
      // 如果内容以标题开头，去掉标题行
      const lines = content.split('\n')
      if (lines.length > 0 && lines[0].match(/^(#{1,6})\s+/)) {
        content = lines.slice(1).join('\n').trim()
      }
      articleContent.value = content || ''
      return
    }
  }
  
  // 如果都没有，尝试从适配器获取当前光标位置的章节内容
  if (props.adapter) {
    try {
      const sectionInfo = await props.adapter.getSectionAtCursor({ line: 0, column: 0 })
      if (sectionInfo && sectionInfo.content) {
        articleContent.value = sectionInfo.content
        return
      }
    } catch (e) {
      console.warn('Failed to get section at cursor:', e)
    }
  }
  
  articleContent.value = ''
}

const menuPosition = ref({ top: props.position.top, left: props.position.left })
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const onMouseDown = (event: MouseEvent) => {
  isDragging.value = true
  dragStart.value = {
    x: event.clientX - menuPosition.value.left,
    y: event.clientY - menuPosition.value.top,
  }
  document.addEventListener("mousemove", onMouseMove)
  document.addEventListener("mouseup", onMouseUp)
}

const onMouseMove = (event: MouseEvent) => {
  if (!isDragging.value) return
  menuPosition.value = {
    top: event.clientY - dragStart.value.y,
    left: event.clientX - dragStart.value.x,
  }
}

const onMouseUp = () => {
  isDragging.value = false
  document.removeEventListener("mousemove", onMouseMove)
  document.removeEventListener("mouseup", onMouseUp)
}

// 初始化Monaco预览编辑器（用于LaTeX）
const initMonacoPreview = async () => {
  if (props.language !== 'latex') return

  // 等待DOM更新和容器准备好
  await nextTick()
  await nextTick() // 再等一次，确保ref已经绑定
  
  if (!previewContainerRef.value) {
    console.warn('Preview container ref is not available')
    return
  }
  
  // 如果已经存在编辑器，先销毁
  if (previewEditor) {
    try {
      if (typeof previewEditor.dispose === 'function') {
        previewEditor.dispose()
      }
    } catch (e) {
      console.warn('Failed to dispose existing editor:', e)
    }
    previewEditor = null
    previewEditorId = null
  }
  
  try {
    const isDark = themeState.currentTheme.type === 'dark'
    const editor = monaco.editor.create(previewContainerRef.value, {
      value: articleContent.value || '',
      language: 'latex',
      theme: isDark ? 'vs-dark' : 'vs',
      readOnly: true,
      automaticLayout: true,
      fontSize: 14,
      wordWrap: 'on',
      lineNumbers: 'on',
      minimap: { enabled: false },
      contextmenu: false,
      scrollBeyondLastLine: false
    })
    
    previewEditor = editor
    previewEditorId = editor.getId()

    // 监听内容变化
    watch([() => articleContent.value, () => generatedText.value], ([content, generated]) => {
      if (!editor) return
      try {
        const value = generated || content || ''
        const currentValue = editor.getValue()
        if (currentValue !== value) {
          editor.setValue(value)
        }
      } catch (e) {
        // 编辑器可能已经被销毁
        console.warn('Failed to update editor value:', e)
      }
    }, { immediate: true })
  } catch (e) {
    console.error('Failed to create Monaco editor:', e)
  }
}

onMounted(async () => {
  updateMaxScrollHeight()
  window.addEventListener('resize', updateMaxScrollHeight)
  nextTick(autoResize)
  await refreshContent()
  if (props.language === 'latex') {
    await nextTick()
    await initMonacoPreview()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateMaxScrollHeight)
  if (previewEditor) {
    try {
      previewEditor.dispose()
    } catch (e) {
      console.warn('Failed to dispose preview editor:', e)
    } finally {
      previewEditor = null
      previewEditorId = null
    }
  }
})

watch(() => props.path, () => {
  refreshContent()
})

watch(
  currentOutline,
  () => {
    refreshContent()
  },
  { deep: true },
)
</script>

<style scoped>
.section-optimizer {
  border-radius: 8px;
}

.content-preview {
  max-height: 400px;
  overflow: auto;
  padding: 10px;
  border: 1px solid #cccccc36;
  backdrop-filter: blur(20px) brightness(1.05);
  border-radius: 10px;
  margin-bottom: 10px;
}

.preview-container {
  width: 100%;
}

.monaco-preview {
  min-height: 200px;
  height: 100%;
}

/* ChatComposer风格的输入框样式 */
.prompt-input-wrapper {
  position: relative;
  margin-bottom: 10px;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.composer-shell {
  width: 100%;
  max-width: 100%;
  border-radius: 28px;
  border: 1px solid transparent;
  box-shadow: 0 0 12px rgba(0, 0, 0, 0.08);
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  padding: 16px;
  align-items: flex-end;
  transition: background-color 0.2s, color 0.2s, border-color 0.2s;
  overflow: hidden;
  position: relative;
  box-sizing: border-box;
}

.composer-shell.is-multiline {
  grid-template-columns: auto 1fr;
  align-items: stretch;
}

.composer-leading {
  display: flex;
  align-items: center;
}

.composer-shell.is-multiline .composer-leading {
  align-self: flex-start;
}

.composer-scroll {
  width: 100%;
}

.composer-scroll :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
  padding-bottom: 4px;
}

.composer-scroll :deep(.el-scrollbar__view) {
  width: 100%;
}

.composer-scroll :deep(.el-scrollbar__bar.is-horizontal) {
  display: none;
}

.composer-shell.is-multiline .composer-scroll :deep(.el-scrollbar__wrap) {
  padding-bottom: 28px;
}

.composer-textarea {
  width: 100%;
  background: transparent;
  border: none;
  resize: none;
  outline: none;
  font-size: 16px;
  line-height: 1.6;
  color: inherit;
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
}

.composer-textarea::placeholder {
  color: rgba(128, 128, 128, 0.8);
}

.composer-textarea::-webkit-scrollbar,
.composer-textarea::-webkit-scrollbar-thumb,
.composer-textarea::-webkit-scrollbar-track {
  display: none;
}

.composer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.composer-btn {
  background: rgba(0, 0, 0, 0.04);
  border: none;
  color: inherit;
  transition: transform 0.15s ease, background 0.2s ease;
}

.composer-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.composer-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.preset-suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.preset-item {
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.preset-item:hover {
  background-color: var(--el-fill-color-light);
}

.action-buttons {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 10px;
}

.action-buttons .el-button {
  pointer-events: auto;
  z-index: 1;
}
</style>

