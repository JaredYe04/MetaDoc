<template>
  <!-- modal=false：否则 DismissableLayer 会拦截挂到 body 的 Popover/应用内 ContextMenu 的指针事件 -->
  <Dialog v-if="props.mode !== 'demo'" v-model:open="dialogOpen" :modal="false">
    <DialogContent class="w-[min(92vw,800px)] sm:max-w-[800px]">
      <DialogHeader class="pr-10 shrink-0 pb-0">
        <DialogTitle>{{ titleText }}</DialogTitle>
      </DialogHeader>
      <div class="section-optimizer flex flex-col gap-4 min-h-0 pt-1">
    <!-- 内容预览区域 -->
    <div class="content-preview content-preview-below-title">
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
      <div v-if="language === 'latex'" class="preview-container monaco-preview">
        <!-- 使用独立内层容器创建 Monaco，避免与 Monaco 内部 context 冲突 -->
        <div ref="previewContainerRef" class="monaco-preview-inner"></div>
      </div>
    </div>

    <!-- 改进的提示词输入框，参考ChatComposer -->
    <div class="prompt-input-wrapper" @mousedown.stop>
      <div
        class="composer-shell"
        :class="{
          'is-multiline': isMultiline,
          'has-trailing-presets': showPresetButton
        }"
        :style="{
          backgroundColor: themeState.currentTheme.background,
          color: themeState.currentTheme.textColor,
          borderColor: themeState.currentTheme.background2nd ?? 'rgba(0,0,0,0.08)'
        }"
      >
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
            @contextmenu="onPromptContextMenu"
          />
        </el-scrollbar>

        <div v-if="showPresetButton" class="composer-actions">
          <PopoverRoot v-model:open="presetsOpen">
            <PopoverTrigger as-child>
              <Button
                variant="secondary"
                size="icon"
                type="button"
                class="preset-toggle-btn composer-btn h-9 w-9 shrink-0"
                :disabled="disabled"
                :aria-expanded="presetsOpen"
                :title="t('sectionOptimizer.showPresets')"
                :aria-label="t('sectionOptimizer.showPresets')"
              >
                <ChevronUp v-if="presetsOpen" class="h-4 w-4 shrink-0 opacity-80" />
                <ChevronDown v-else class="h-4 w-4 shrink-0 opacity-80" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="bottom"
              :side-offset="6"
              class="section-optimizer-presets-popover z-[100070] w-[min(92vw,320px)] max-h-[min(280px,40vh)] overflow-hidden p-0 shadow-lg"
            >
              <div class="max-h-[min(272px,38vh)] overflow-y-auto py-1">
                <button
                  v-for="(preset, index) in presetPrompts"
                  :key="index"
                  type="button"
                  class="section-optimizer-preset-row w-full px-3 py-2.5 text-left text-sm hover:bg-muted"
                  @click="selectPreset(preset.value)"
                >
                  {{ preset.label || preset.value }}
                </button>
              </div>
            </PopoverContent>
          </PopoverRoot>
        </div>
      </div>
    </div>

    <div
      class="context-and-actions-row flex flex-wrap items-end gap-4 w-full min-w-0"
    >
      <div class="context-slider-block flex-1 min-w-[200px] flex flex-col gap-2 min-h-0">
        <div class="flex flex-col gap-0.5">
          <span class="text-sm font-medium leading-tight">{{
            t('sectionOptimizer.contextScopeTitle')
          }}</span>
          <span class="text-xs text-muted-foreground leading-snug">{{
            contextScopeHint
          }}</span>
        </div>
        <Slider v-model="context_mode" :step="1" :min="0" :max="2" class="w-full" />
        <div class="flex justify-between w-full gap-1 text-xs text-muted-foreground">
          <span>{{ t('sectionOptimizer.contextMarks.none') }}</span>
          <span>{{ t('sectionOptimizer.contextMarks.chapter') }}</span>
          <span>{{ t('sectionOptimizer.contextMarks.full') }}</span>
        </div>
      </div>
      <div class="action-buttons flex flex-wrap items-center justify-end gap-2 shrink-0">
        <Tooltip v-if="generated">
          <TooltipTrigger as-child>
            <Button
              variant="outline"
              size="icon"
              class="h-9 w-9 border-blue-500 text-blue-500 hover:bg-blue-50"
              @click.prevent="reset"
            >
              <Undo2 class="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {{ t('sectionOptimizer.tooltips.reset') }}
          </TooltipContent>
        </Tooltip>

        <Tooltip v-if="generated">
          <TooltipTrigger as-child>
            <Button
              variant="outline"
              size="icon"
              class="h-9 w-9 border-blue-500 text-blue-500 hover:bg-blue-50"
              @click.prevent="chat"
            >
              <MessageCircle class="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {{ t('sectionOptimizer.tooltips.chat') }}
          </TooltipContent>
        </Tooltip>

        <Tooltip v-if="generated">
          <TooltipTrigger as-child>
            <Button
              variant="outline"
              size="icon"
              class="h-9 w-9 border-green-500 text-green-500 hover:bg-green-50"
              @click.prevent="accept(false)"
            >
              <Check class="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {{ t('sectionOptimizer.tooltips.acceptReplace') }}
          </TooltipContent>
        </Tooltip>

        <Tooltip v-if="generated">
          <TooltipTrigger as-child>
            <Button
              variant="outline"
              size="icon"
              class="h-9 w-9 border-green-500 text-green-500 hover:bg-green-50"
              @click.prevent="accept(true)"
            >
              <Plus class="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {{ t('sectionOptimizer.tooltips.acceptAppend') }}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="default"
              size="icon"
              class="h-9 w-9"
              @click.prevent="generate"
              :disabled="generating || generated || userPrompt.length === 0"
            >
              <Send class="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {{ t('sectionOptimizer.tooltips.generate') }}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
      </div>
    </DialogContent>
  </Dialog>
  <div
    v-else
    class="section-optimizer-container section-optimizer rounded-lg border border-border bg-background p-6 shadow-sm max-w-3xl mx-auto w-full max-h-[min(600px,85vh)] overflow-y-auto flex flex-col gap-4"
  >
    <p class="text-lg font-semibold tracking-tight shrink-0">{{ titleText }}</p>
    <div class="section-optimizer flex flex-col gap-4 min-h-0">
      <!-- 内容预览区域 -->
      <div class="content-preview content-preview-below-title">
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
        <div v-if="language === 'latex'" class="preview-container monaco-preview">
          <!-- 使用独立内层容器创建 Monaco，避免与 Monaco 内部 context 冲突 -->
          <div ref="previewContainerRef" class="monaco-preview-inner"></div>
        </div>
      </div>

      <!-- 改进的提示词输入框，参考ChatComposer -->
      <div class="prompt-input-wrapper" @mousedown.stop>
        <div
          class="composer-shell"
          :class="{
            'is-multiline': isMultiline,
            'has-trailing-presets': showPresetButton
          }"
          :style="{
            backgroundColor: themeState.currentTheme.background,
            color: themeState.currentTheme.textColor,
            borderColor: themeState.currentTheme.background2nd ?? 'rgba(0,0,0,0.08)'
          }"
        >
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
              @contextmenu="onPromptContextMenu"
            />
          </el-scrollbar>

          <div v-if="showPresetButton" class="composer-actions">
            <PopoverRoot v-model:open="presetsOpen">
              <PopoverTrigger as-child>
                <Button
                  variant="secondary"
                  size="icon"
                  type="button"
                  class="preset-toggle-btn composer-btn h-9 w-9 shrink-0"
                  :disabled="disabled"
                  :aria-expanded="presetsOpen"
                  :title="t('sectionOptimizer.showPresets')"
                  :aria-label="t('sectionOptimizer.showPresets')"
                >
                  <ChevronUp v-if="presetsOpen" class="h-4 w-4 shrink-0 opacity-80" />
                  <ChevronDown v-else class="h-4 w-4 shrink-0 opacity-80" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                side="bottom"
                :side-offset="6"
                class="section-optimizer-presets-popover z-[100070] w-[min(92vw,320px)] max-h-[min(280px,40vh)] overflow-hidden p-0 shadow-lg"
              >
                <div class="max-h-[min(272px,38vh)] overflow-y-auto py-1">
                  <button
                    v-for="(preset, index) in presetPrompts"
                    :key="index"
                    type="button"
                    class="section-optimizer-preset-row w-full px-3 py-2.5 text-left text-sm hover:bg-muted"
                    @click="selectPreset(preset.value)"
                  >
                    {{ preset.label || preset.value }}
                  </button>
                </div>
              </PopoverContent>
            </PopoverRoot>
          </div>
        </div>
      </div>

      <div
        class="context-and-actions-row flex flex-wrap items-end gap-4 w-full min-w-0"
      >
        <div class="context-slider-block flex-1 min-w-[200px] flex flex-col gap-2 min-h-0">
          <div class="flex flex-col gap-0.5">
            <span class="text-sm font-medium leading-tight">{{
              t('sectionOptimizer.contextScopeTitle')
            }}</span>
            <span class="text-xs text-muted-foreground leading-snug">{{
              contextScopeHint
            }}</span>
          </div>
          <Slider v-model="context_mode" :step="1" :min="0" :max="2" class="w-full" />
          <div class="flex justify-between w-full gap-1 text-xs text-muted-foreground">
            <span>{{ t('sectionOptimizer.contextMarks.none') }}</span>
            <span>{{ t('sectionOptimizer.contextMarks.chapter') }}</span>
            <span>{{ t('sectionOptimizer.contextMarks.full') }}</span>
          </div>
        </div>
        <div class="action-buttons flex flex-wrap items-center justify-end gap-2 shrink-0">
          <Tooltip v-if="generated">
            <TooltipTrigger as-child>
              <Button
                variant="outline"
                size="icon"
                class="h-9 w-9 border-blue-500 text-blue-500 hover:bg-blue-50"
                @click.prevent="reset"
              >
                <Undo2 class="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {{ t('sectionOptimizer.tooltips.reset') }}
            </TooltipContent>
          </Tooltip>

          <Tooltip v-if="generated">
            <TooltipTrigger as-child>
              <Button
                variant="outline"
                size="icon"
                class="h-9 w-9 border-blue-500 text-blue-500 hover:bg-blue-50"
                @click.prevent="chat"
              >
                <MessageCircle class="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {{ t('sectionOptimizer.tooltips.chat') }}
            </TooltipContent>
          </Tooltip>

          <Tooltip v-if="generated">
            <TooltipTrigger as-child>
              <Button
                variant="outline"
                size="icon"
                class="h-9 w-9 border-green-500 text-green-500 hover:bg-green-50"
                @click.prevent="accept(false)"
              >
                <Check class="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {{ t('sectionOptimizer.tooltips.acceptReplace') }}
            </TooltipContent>
          </Tooltip>

          <Tooltip v-if="generated">
            <TooltipTrigger as-child>
              <Button
                variant="outline"
                size="icon"
                class="h-9 w-9 border-green-500 text-green-500 hover:bg-green-50"
                @click.prevent="accept(true)"
              >
                <Plus class="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {{ t('sectionOptimizer.tooltips.acceptAppend') }}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="default"
                size="icon"
                class="h-9 w-9"
                @click.prevent="generate"
                :disabled="generating || generated || userPrompt.length === 0"
              >
                <Send class="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {{ t('sectionOptimizer.tooltips.generate') }}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick, onBeforeUnmount, computed } from 'vue'
import {
  Plus,
  ChevronDown,
  ChevronUp,
  Send,
  Undo2,
  MessageCircle,
  Check
} from 'lucide-vue-next'
import {
  SECTION_OPTIMIZER_FALLBACK_LATEX,
  SECTION_OPTIMIZER_FALLBACK_MARKDOWN
} from './section-optimizer/fallback-presets'
import { useI18n } from 'vue-i18n'
import { Button } from '@renderer/components/ui/button'
import { Slider } from '@renderer/components/ui/slider'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { themeState } from '../utils/themes'
import type { ScrollbarInstance } from 'element-plus'
import type { SectionOptimizerAdapter, SectionInfo } from './section-optimizer/types'
import { sectionChangePrompt } from '../utils/common/prompts'
import eventBus from '../utils/event-bus'
import { generateMarkdownFromOutlineTree } from '../utils/md-utils'
import { ai_types, createAiTask } from '../utils/ai/ai_tasks'
import { useWorkspace } from '../stores/workspace'
import { useActiveDocument } from '../composables/useActiveDocument'
import { searchNode } from '../utils/outline/outline-helpers'
import { getDefaultAiChatMessages } from '../constants/document'
import type { AIDialogMessage } from '../../../types'
// @ts-ignore - vue3-markdown-it 没有类型定义
import MarkdownItEditor from 'vue3-markdown-it'
import * as monaco from 'monaco-editor'
import { setupMonacoWorker, registerLatexLanguage } from '../utils/editor/monaco-worker-config'
import { PopoverRoot, PopoverTrigger } from 'reka-ui'
import { PopoverContent } from '@renderer/components/ui/popover'

const { t, tm } = useI18n()

function normalizeRawPresets(raw: unknown): { value: string; label: string }[] {
  let prompts: unknown = raw
  if (typeof prompts === 'string') {
    try {
      prompts = JSON.parse(prompts) as unknown
    } catch {
      return []
    }
  }
  if (!Array.isArray(prompts)) return []
  return prompts.map((p: any) => ({
    value: typeof p === 'string' ? p : p.value,
    label: typeof p === 'string' ? p : p.label || p.value
  }))
}

const props = withDefaults(
  defineProps<{
    title: string
    position?: { top: number; left: number }
    path: string
    tree: any
    adapter: SectionOptimizerAdapter
    language: 'markdown' | 'latex'
    sectionInfo?: SectionInfo // 可选的初始sectionInfo
    mode?: 'normal' | 'demo'
  }>(),
  { mode: 'normal', position: () => ({ top: 100, left: 200 }) }
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'accept', payload: { append: boolean; content: string; sectionInfo?: SectionInfo }): void
  /** 交给外层编辑器打开文章右键菜单（与 Vditor/Monaco 一致，且层级正确） */
  (e: 'prompt-contextmenu', ev: MouseEvent): void
}>()

const onPromptContextMenu = (ev: MouseEvent) => {
  if (props.mode === 'demo') return
  ev.preventDefault()
  emit('prompt-contextmenu', ev)
}

const dialogOpen = ref(true)
watch(dialogOpen, (open) => {
  if (!open) emit('close')
})

const titleText = computed(() =>
  props.title ? props.title : t('sectionOptimizer.defaultTitle')
)

const workspace = useWorkspace()
const { activeTabId, updateDocumentAiDialogs } = workspace
const { activeDocument } = useActiveDocument()

const currentOutline = computed(() => props.tree ?? activeDocument.value?.outline ?? null)
const currentMarkdown = computed(() => activeDocument.value?.markdown ?? '')
const currentTex = computed(() => activeDocument.value?.tex ?? '')

const context_mode = ref(1)
const presetPrompts = computed(() => {
  const key =
    props.language === 'latex'
      ? 'sectionOptimizer.presetPrompts.latex'
      : 'sectionOptimizer.presetPrompts.markdown'
  const fromTm = normalizeRawPresets(tm(key))
  if (fromTm.length) return fromTm
  const fromT = normalizeRawPresets(t(key, { returnObjects: true }))
  if (fromT.length) return fromT
  return props.language === 'latex'
    ? SECTION_OPTIMIZER_FALLBACK_LATEX
    : SECTION_OPTIMIZER_FALLBACK_MARKDOWN
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
  if (props.mode === 'demo') return
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
        const { searchNode } = await import('../utils/outline/outline-helpers')
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
              range:
                sectionStart >= 0
                  ? {
                      start: { line: sectionStart, column: 0 },
                      end: { line: sectionEnd, column: lines[sectionEnd]?.length || 0 }
                    }
                  : undefined
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
  if (props.mode === 'demo') return
  const outlineNode = currentOutline.value
  if (!outlineNode) return
  generating.value = true
  generated.value = false
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

  try {
    const messages: AIDialogMessage[] = [
      {
        role: 'user',
        content: prompt
      }
    ]
    const { done } = createAiTask(
      props.title,
      messages,
      generatedText,
      ai_types.chat,
      'section-optimizer',
      { stream: true }
    )
    await done
  } catch (err) {
    console.warn('段落优化任务失败或取消：', err)
    generating.value = false
    generated.value = false
  } finally {
    generated.value = true
    generating.value = false
  }
}

const chat = async () => {
  if (props.mode === 'demo') return
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
  const messages = JSON.parse(JSON.stringify(getDefaultAiChatMessages()))
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
    messages
  }
  pushDialogToDocument(newDialog)
  eventBus.emit('ai-chat')
}

const selectPreset = (value: string) => {
  userPrompt.value = value
  presetsOpen.value = false
  nextTick(() => autoResize())
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
const presetsOpen = ref(false)
const showPresetButton = computed(() => presetPrompts.value.length > 0)

const contextScopeHint = computed(() => {
  const m = context_mode.value
  if (m === 0) return t('sectionOptimizer.contextTooltips.none')
  if (m === 1) return t('sectionOptimizer.contextTooltips.chapter')
  return t('sectionOptimizer.contextTooltips.full')
})

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
  if (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    // Enter键提交，Shift+Enter换行
    event.preventDefault()
    if (userPrompt.value.trim().length > 0 && !generating.value && !generated.value) {
      generate()
    }
  }
}

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

// 初始化Monaco预览编辑器（用于LaTeX）
const initMonacoPreview = async () => {
  if (props.language !== 'latex') return

  // 确保 Monaco Worker 已配置
  setupMonacoWorker()
  // 注册 LaTeX 语言支持
  registerLatexLanguage()

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
    watch(
      [() => articleContent.value, () => generatedText.value],
      ([content, generated]) => {
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
      },
      { immediate: true }
    )
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

watch(
  () => props.path,
  () => {
    refreshContent()
  }
)

watch(
  currentOutline,
  () => {
    refreshContent()
  },
  { deep: true }
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
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  margin-bottom: 10px;
  background: hsl(var(--muted) / 0.35);
}

.content-preview-below-title {
  margin-top: 14px;
}

.preview-container {
  width: 100%;
}

.monaco-preview {
  min-height: 200px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.monaco-preview-inner {
  flex: 1;
  width: 100%;
  min-height: 200px;
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
  grid-template-columns: 1fr;
  gap: 12px;
  padding: 16px;
  align-items: flex-end;
  transition:
    background-color 0.2s,
    color 0.2s,
    border-color 0.2s;
  overflow: hidden;
  position: relative;
  box-sizing: border-box;
}

.composer-shell.has-trailing-presets {
  grid-template-columns: 1fr auto;
}

.composer-shell.is-multiline {
  align-items: stretch;
}

.composer-shell.is-multiline .composer-actions {
  align-self: flex-end;
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
  transition:
    transform 0.15s ease,
    background 0.2s ease;
}

.composer-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.composer-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.section-optimizer-preset-row:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: -2px;
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
