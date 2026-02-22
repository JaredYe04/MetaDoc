<template>
  <div class="quick-start-panel-wrapper">
    <div class="quick-start-panel-container" :style="containerStyle">
      <!-- 头部 -->
      <div class="panel-header">
        <h2 class="panel-title">{{ $t('home.quickStartTitle') }} · LaTeX</h2>
        <Button @click="emitClose" class="close-button" circle size="sm">
          <el-icon><Close /></el-icon>
        </Button>
      </div>

      <!-- 主内容区域 -->
      <div class="panel-content">
        <!-- 左侧：编辑器区域 -->
        <div class="preview-section">
          <div class="preview-header">
            <span class="section-label">LaTeX 代码</span>
          </div>
          <div class="editor-container">
            <div class="generated-latex-container" ref="editorContainerRef"></div>
          </div>
        </div>

        <!-- 分隔线 -->
        <div class="content-divider"></div>

        <!-- 右侧：控制面板 -->
        <div class="control-section">
          <div class="tab-switch-wrapper">
            <ToggleGroup v-model="tab" type="single" class="tab-switch">
              <ToggleGroupItem v-for="option in segmentOptions" :key="option" :value="option" class="quickstart-tab-item">
                {{ option }}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <!-- 文档信息面板 -->
          <div class="control-panel" v-if="tab === segmentOptions[1]">
            <ScrollArea class="panel-scrollbar h-full">
              <div class="panel-section p-6">
                <h3 class="section-title">{{ $t('home.documentInfoLabel') }}</h3>
                <div class="form-fields">
                  <div class="form-field">
                    <label class="field-label">{{ $t('home.label.title') }}</label>
                    <Input v-model="metaTitle" :placeholder="$t('home.placeholder.title')" />
                  </div>
                  <div class="form-field">
                    <label class="field-label">{{ $t('home.label.author') }}</label>
                    <Input v-model="metaAuthor" :placeholder="$t('home.placeholder.author')" />
                  </div>
                  <div class="form-field">
                    <label class="field-label">{{ $t('home.label.abstract') }}</label>
                    <Textarea
                      v-model="metaDescription"
                      :placeholder="$t('home.placeholder.abstract')"
                      class="min-h-[80px]"
                    />
                  </div>
                  <div class="form-field">
                    <label class="field-label">{{ $t('article.keywords') }}</label>
                    <KeywordInput
                      v-model="metaKeywords"
                      :placeholder="$t('article.keywords_placeholder')"
                    />
                  </div>
                </div>
                <div class="panel-actions">
                  <el-tooltip :content="$t('home.tooltip.ready')" placement="top">
                    <Button type="success" @click="allSet">
                      <el-icon><Check /></el-icon>
                      {{ $t('home.tooltip.ready') }}
                    </Button>
                  </el-tooltip>
                </div>
              </div>
            </ScrollArea>
          </div>

          <!-- AI 助手面板 -->
          <div class="control-panel" v-if="tab === segmentOptions[0]">
            <ScrollArea class="panel-scrollbar h-full">
              <div class="panel-section p-6">
                <h3 class="section-title">{{ $t('home.aiAssistantLabel') }}</h3>
                <!-- 温度滑块 -->
                <div class="control-item">
                  <div class="control-item-header">
                    <span class="control-label">{{ $t('home.tooltip.selectTemperature') }}</span>
                  </div>
                  <Slider
                    v-model="temperature"
                    :min="0"
                    :max="100"
                    :disabled="generating || generated"
                    class="temperature-slider"
                  />
                </div>

                <!-- 风格选择 -->
                <div class="control-item">
                  <div class="control-item-header">
                    <span class="control-label">{{ $t('home.tooltip.selectMood') }}</span>
                  </div>
                  <Select
                    v-model="mood"
                    multiple
                    :disabled="generating || generated"
                    class="mood-select"
                  >
                    <SelectTrigger>
                      <SelectValue :placeholder="$t('home.tooltip.selectMood')" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="option in moodOptions" :key="option.value" :value="option.value">
                        <div class="flex items-center gap-2">
                          <el-icon :size="14">
                            <component :is="option.icon" />
                          </el-icon>
                          <span>{{ option.label }}</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <!-- 提示词输入 -->
                <div class="control-item">
                  <div class="control-item-header">
                    <span class="control-label">{{ $t('home.tooltip.inputPrompt') }}</span>
                  </div>
                  <AutoResizeTextarea
                    v-model="userPrompt"
                    :autosize="{ minRows: 4, maxRows: 8 }"
                    max-height="200px"
                    height="200px"
                    :placeholder="$t('home.tooltip.inputPrompt')"
                    :disabled="generating || generated"
                    class="prompt-input"
                  />
                </div>

                <!-- 建议标签 -->
                <div class="control-item suggestions-item">
                  <SuggestionTags
                    :tags="buttons"
                    :title="$t('home.suggestionLabel')"
                    :disabled="generating || generated"
                    @select="handleAcceptSuggestion"
                    @refresh="refreshButtons"
                  />
                </div>

                <!-- 操作按钮 -->
                <div class="panel-actions" @mousedown.stop>
                  <el-tooltip :content="$t('home.tooltip.generateArticle')" placement="top">
                    <Button
                      type="primary"
                      :disabled="generating || userPrompt.length === 0"
                      @click="generate"
                      :loading="generating"
                    >
                      <el-icon v-if="!generating"><Promotion /></el-icon>
                      {{ $t('home.tooltip.generateArticle') }}
                    </Button>
                  </el-tooltip>
                  <el-tooltip :content="$t('home.tooltip.reset')" placement="top">
                    <Button v-if="generated" @click="reset">
                      <el-icon><RefreshLeft /></el-icon>
                      {{ $t('home.tooltip.reset') }}
                    </Button>
                  </el-tooltip>
                  <el-tooltip :content="$t('home.tooltip.accept')" placement="top">
                    <Button v-if="generated" type="success" @click="accept">
                      <el-icon><Check /></el-icon>
                      {{ $t('home.tooltip.accept') }}
                    </Button>
                  </el-tooltip>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import VoiceInput from '../VoiceInput.vue'
import * as monaco from 'monaco-editor'
import { Check, Promotion, Refresh, RefreshLeft, Close } from '@element-plus/icons-vue'
import { Button } from '@renderer/components/ui/button'
import { Slider } from '@renderer/components/ui/slider'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { ToggleGroup, ToggleGroupItem } from '@renderer/components/ui/toggle-group'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import {
  DataAnalysis,
  Drizzling,
  Lightning,
  MoonNight,
  Mug,
  Sugar,
  SuitcaseLine,
  Warning
} from '@element-plus/icons-vue'
import { useWorkspace } from '../../stores/workspace'
import { extractOutlineTreeFromMarkdown } from '../../utils/md-utils'
import { DEFAULT_OUTLINE_TREE } from '../../constants/document'
import { convertLatexToMarkdown } from '../../utils/latex-utils'
import { themeState, mixColors } from '../../utils/themes'
import eventBus, { getWindowType } from '../../utils/event-bus'
import { generateLatexPrompt, getSuggestionPresets, getPresets } from '../../utils/prompts'
import { getSetting } from '../../utils/settings'
import { ai_types, createAiTask } from '../../utils/ai_tasks'
import { createRendererLogger } from '../../utils/logger'
import { setupMonacoWorker, registerLatexLanguage } from '../../utils/monaco-worker-config'
import type { AIDialogMessage } from '@/types'
import SuggestionTags from './SuggestionTags.vue'
import AutoResizeTextarea from '../base/AutoResizeTextarea.vue'
import KeywordInput from '../KeywordInput.vue'
import { loggedIn, user } from '../../stores/user'
import {
  generateTitlePrompt,
  generateDescriptionPrompt,
  generateKeywordsPrompt
} from '../../utils/prompts'
import { extractOuterJsonString } from '../../utils/regex-utils'
import { ElMessage } from 'element-plus'

const emit = defineEmits(['close'])

const props = withDefaults(
  defineProps<{ mode?: 'normal' | 'demo' }>(),
  { mode: 'normal' }
)

const { t } = useI18n()
const workspace = useWorkspace()
const {
  updateDocumentMarkdown,
  updateDocumentTex,
  updateDocumentMeta,
  updateDocumentOutline,
  updateDocumentLastView,
  initializeDocumentFromTemplate,
  openNewDocumentTab,
  activateTab
} = workspace

const logger = createRendererLogger('QuickStartLatex', {
  windowTypeProvider: () => getWindowType()
})

const metaTitle = ref('')
const metaAuthor = ref('')
const metaDescription = ref('')
const metaKeywords = ref<string[]>([])

const buttons = ref<{ label: string; prompt: string }[]>([])
const tab = ref<string>('')
const temperature = ref(50)
const mood = ref<string[]>([t('home.mood.peaceful')])
const moodOptions = [
  { label: t('home.mood.happy'), value: 'happy', icon: Sugar },
  { label: t('home.mood.lyrical'), value: 'lyrical', icon: MoonNight },
  { label: t('home.mood.peaceful'), value: 'peaceful', icon: Mug },
  { label: t('home.mood.academic'), value: 'academic', icon: DataAnalysis },
  { label: t('home.mood.business'), value: 'business', icon: SuitcaseLine },
  { label: t('home.mood.sad'), value: 'sad', icon: Drizzling },
  { label: t('home.mood.warning'), value: 'warning', icon: Warning },
  { label: t('home.mood.exciting'), value: 'exciting', icon: Lightning },
  { label: t('home.mood.angry'), value: 'angry', icon: Lightning },
  { label: t('home.mood.surprised'), value: 'surprised', icon: Lightning },
  { label: t('home.mood.fearful'), value: 'fearful', icon: Lightning },
  { label: t('home.mood.disgusted'), value: 'disgusted', icon: Lightning }
]
const userPrompt = ref('')
const defaultText = t('home.defaultLatexText')
const generatedText = ref(defaultText)
const generated = ref(false)
const generating = ref(false)
const editorContainerRef = ref<HTMLElement | null>(null)
let editorId: string | null = null

const segmentOptions = computed(() => [t('home.tab.aiAssistant'), t('home.tab.documentInfo')])

function generateRandomButtons(): { label: string; prompt: string }[] {
  const randomCount = 6
  const randomButtons: { label: string; prompt: string }[] = []
  const used = new Set<number>()
  const presets = getSuggestionPresets()
  while (randomButtons.length < randomCount && used.size < presets.length) {
    const index = Math.floor(Math.random() * presets.length)
    if (!used.has(index)) {
      randomButtons.push(presets[index])
      used.add(index)
    }
  }
  return randomButtons
}

const refreshButtons = () => {
  buttons.value = generateRandomButtons()
}

const handleAcceptSuggestion = (prompt: string) => {
  userPrompt.value = prompt
}

const onSpeechRecognized = (text: string) => {
  userPrompt.value = text
}

const querySearch = (queryString: string, cb: (results: { value: string }[]) => void) => {
  const presetList = getPresets()
  const results = queryString
    ? presetList.filter((preset) => preset.value.toLowerCase().includes(queryString.toLowerCase()))
    : presetList
  cb(results)
}

const buildLatexPrompt = () => {
  return generateLatexPrompt(mood.value, userPrompt.value)
}

const generate = async () => {
  workspace.lockUI?.()
  generating.value = true
  generated.value = false

  const prompt = buildLatexPrompt()

  // 清空内容，准备接收流式数据
  generatedText.value = ''
  const editor = getEditor()
  if (editor) {
    editor.setValue('')
  }
  const messages: AIDialogMessage[] = [
    {
      role: 'user',
      content: prompt
    }
  ]
  const { done } = createAiTask(
    userPrompt.value,
    messages,
    generatedText,
    ai_types.chat,
    'quick-start-latex',
    { stream: true, temperature: temperature.value / 100 }
  )

  try {
    await done
    generated.value = true

    // 自动生成标题、摘要、关键词
    await autoGenerateMetaInfo()

    // 设置作者
    if (loggedIn.value && user.value?.username) {
      metaAuthor.value = user.value.username
    } else {
      metaAuthor.value = 'MetaDoc'
    }
  } catch (error) {
    logger.warn('LaTeX 任务失败或取消', error)
  } finally {
    generating.value = false
    workspace.unlockUI?.()
  }
}

// 自动生成元信息（标题、摘要、关键词）
const autoGenerateMetaInfo = async () => {
  if (!generatedText.value) return

  try {
    // 将 LaTeX 转换为 Markdown 以提取大纲
    const markdown = convertLatexToMarkdown(generatedText.value)
    const outline = extractOutlineTreeFromMarkdown(markdown) ?? DEFAULT_OUTLINE_TREE
    const outlineJson = JSON.stringify(outline)

    // 生成标题
    const titleResult = ref('')
    const titleMessages: AIDialogMessage[] = [
      {
        role: 'user',
        content: generateTitlePrompt(outlineJson)
      }
    ]
    const { done: titleDone } = createAiTask(
      t('article.generate_title'),
      titleMessages,
      titleResult,
      ai_types.chat,
      'quick-start-title',
      { stream: true }
    )
    await titleDone
    const titleText = titleResult.value.trim()
    if (titleText) {
      const titleMatch = titleText.match(/^[^\n]+/)
      metaTitle.value = titleMatch ? titleMatch[0].trim() : titleText
    }

    // 生成摘要
    const descResult = ref('')
    const descMessages: AIDialogMessage[] = [
      {
        role: 'user',
        content: generateDescriptionPrompt(outlineJson)
      }
    ]
    const { done: descDone } = createAiTask(
      t('article.generate_description'),
      descMessages,
      descResult,
      ai_types.chat,
      'quick-start-description',
      { stream: true }
    )
    await descDone
    const descText = descResult.value.trim()
    if (descText) {
      metaDescription.value = descText
    }

    // 生成关键词
    const keywordsResult = ref('')
    const keywordsMessages: AIDialogMessage[] = [
      {
        role: 'user',
        content: generateKeywordsPrompt(outlineJson)
      }
    ]
    const { done: keywordsDone } = createAiTask(
      t('article.generate_keywords'),
      keywordsMessages,
      keywordsResult,
      ai_types.chat,
      'quick-start-keywords',
      { stream: true }
    )
    await keywordsDone
    const keywords = parseKeywordsResult(keywordsResult.value)
    if (keywords.length > 0) {
      metaKeywords.value = keywords
    }
  } catch (error) {
    logger.warn('自动生成元信息失败', error)
  }
}

// 解析关键词结果
const parseKeywordsResult = (raw: string): string[] => {
  const jsonString = extractOuterJsonString(raw)
  if (!jsonString) {
    return []
  }
  try {
    const parsed = JSON.parse(jsonString)
    const payload = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { keywords?: unknown[] })?.keywords)
        ? (parsed as { keywords: unknown[] }).keywords
        : []
    return sanitizeKeywords(payload.map((item) => String(item ?? '')))
  } catch {
    return []
  }
}

// 清理关键词
const sanitizeKeywords = (keywords: string[]): string[] => {
  const unique = new Set<string>()
  keywords.forEach((item) => {
    const trimmed = String(item).trim()
    if (trimmed) {
      unique.add(trimmed)
    }
  })
  return Array.from(unique)
}

const reset = () => {
  generated.value = false
  generatedText.value = defaultText
  userPrompt.value = ''
  tab.value = segmentOptions.value[0]
  metaTitle.value = ''
  metaAuthor.value = ''
  metaDescription.value = ''
  metaKeywords.value = []
  const editor = getEditor()
  if (editor) {
    editor.setValue(generatedText.value)
  }
}

// 清理编辑器实例
const cleanupEditor = () => {
  if (editorId) {
    try {
      const editors = (monaco.editor as any).getEditors?.() ?? []
      const editor = editors.find(
        (e: monaco.editor.IStandaloneCodeEditor) => e.getId?.() === editorId
      )
      if (editor) {
        editor.dispose()
      }
    } catch (error) {
      logger.warn('清理快速开始编辑器失败', error)
    }
    editorId = null
  }
}

const accept = async () => {
  logger.info('[QuickStartLatex] accept 开始')

  const latexContent = generatedText.value

  // 创建并激活新文档 tab
  const tabObj = openNewDocumentTab()
  const tabId = tabObj.id
  activateTab(tabId)

  // 初始化文档
  initializeDocumentFromTemplate(tabId, 'tex')

  // 更新内容
  updateDocumentTex(tabId, latexContent)
  updateDocumentMarkdown(tabId, convertLatexToMarkdown(latexContent))
  updateDocumentMeta(tabId, (meta) => {
    meta.title = metaTitle.value
    meta.author = metaAuthor.value
    meta.description = metaDescription.value
    meta.keywords = metaKeywords.value
  })
  const outline =
    extractOutlineTreeFromMarkdown(convertLatexToMarkdown(latexContent)) ?? DEFAULT_OUTLINE_TREE
  updateDocumentOutline(tabId, outline)

  // 切换视图
  updateDocumentLastView(tabId, 'editor')

  // 清理临时编辑器
  cleanupEditor()
  await nextTick()

  eventBus.emit('nav-to', '/editor')
  emitClose()
  logger.info('[QuickStartLatex] accept - 完成', { tabId })
}

const allSet = () => {
  eventBus.emit('nav-to', '/editor')
  emitClose()
}

const highlightM = () => {
  const el = document.querySelector('.main-letter') as HTMLElement | null
  if (el) el.style.color = 'rgb(50, 150, 250)'
}

const resetM = () => {
  const el = document.querySelector('.main-letter') as HTMLElement | null
  if (el) el.style.color = 'rgb(65,105,225)'
}

const emitClose = () => {
  if (props.mode === 'demo') return
  emit('close')
}

const containerStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  background:
    tab.value === segmentOptions.value[1]
      ? themeState.currentTheme.quickStartBackground1
      : themeState.currentTheme.quickStartBackground2
}))

const labelStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const initMonacoEditor = async () => {
  if (!editorContainerRef.value) return

  // 使用统一的 Monaco Worker 配置
  setupMonacoWorker()
  // 注册 LaTeX 语言支持（内部会检查是否已注册）
  registerLatexLanguage()

  // 创建编辑器
  const isDark = themeState.currentTheme.type === 'dark'
  const editor = monaco.editor.create(editorContainerRef.value, {
    value: generatedText.value,
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

  // 保存 editorId，不使用 ref
  editorId = editor.getId()

  // 同步主题
  syncEditorTheme()
}

// 通过 editorId 获取编辑器实例，而不是使用 ref
const getEditor = (): monaco.editor.IStandaloneCodeEditor | null => {
  if (!editorId) return null
  const editors = (monaco.editor as any).getEditors?.() ?? []
  const found = editors.find((e: monaco.editor.IStandaloneCodeEditor) => e.getId?.() === editorId)
  return found ?? null
}

const syncEditorTheme = () => {
  const editor = getEditor()
  if (!editor) return
  const isDark = themeState.currentTheme.type === 'dark'
  const themeName = isDark ? 'vs-dark' : 'vs'

  // 定义自定义主题
  const toMonacoColor = (color: string) => color.replace('#', '') || 'FFFFFF'
  const deeperColor = (color: string) => {
    if (isDark) {
      return mixColors(color, '#000000', 0.3)
    } else {
      return mixColors(color, '#FFFFFF', 0.3)
    }
  }

  monaco.editor.defineTheme('quickStartLatexTheme', {
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
      'editor.background': deeperColor(themeState.currentTheme.background),
      'editor.foreground': themeState.currentTheme.textColor
    }
  })
  monaco.editor.setTheme('quickStartLatexTheme')
}

onMounted(async () => {
  refreshButtons()
  tab.value = segmentOptions.value[0]
  eventBus.emit('theme-changed')

  await nextTick()
  initMonacoEditor()

  // 监听主题变化
  eventBus.on('sync-editor-theme', syncEditorTheme)
})

watch(
  () => generatedText.value,
  (value) => {
    const editor = getEditor()
    if (editor) {
      // 实时更新编辑器内容（流式传输时）
      editor.setValue(value)
      // 滚动到底部以显示最新内容
      const model = editor.getModel()
      if (model) {
        editor.revealLine(model.getLineCount())
      }
    }
  },
  { immediate: true }
)

eventBus.on('reset-quickstart', reset)

onBeforeUnmount(() => {
  eventBus.off('reset-quickstart', reset)
  eventBus.off('sync-editor-theme', syncEditorTheme)

  // 清理编辑器
  cleanupEditor()
})
</script>

<style scoped>
/* 快速开始面板外层容器 */
.quick-start-panel-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  padding: 24px;
  box-sizing: border-box;
}

.quick-start-panel-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 20px;
  backdrop-filter: blur(20px) brightness(1.05);
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0, 0, 0, 0.1)"');
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  position: relative;
  background: v-bind('themeState.currentTheme.background2nd || themeState.currentTheme.background');
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 32px;
  border-bottom: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0, 0, 0, 0.1)"');
  flex-shrink: 0;
  background: v-bind('themeState.currentTheme.background2nd || themeState.currentTheme.background');
}

.panel-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  color: v-bind('themeState.currentTheme.textColor');
  letter-spacing: -0.02em;
}

.close-button {
  color: v-bind('themeState.currentTheme.textColor');
}

.panel-content {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

.preview-section {
  flex: 0 0 60%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: v-bind('themeState.currentTheme.background');
}

.preview-header {
  padding: 16px 24px;
  border-bottom: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0, 0, 0, 0.1)"');
  flex-shrink: 0;
}

.section-label {
  font-size: 13px;
  font-weight: 500;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.7;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.editor-container {
  flex: 1;
  min-height: 0;
  padding: 24px;
  overflow: hidden;
}

.generated-latex-container {
  width: 100%;
  height: 100%;
  min-height: 400px;
}

.content-divider {
  width: 1px;
  background: v-bind('themeState.currentTheme.borderColor || "rgba(0, 0, 0, 0.1)"');
  flex-shrink: 0;
}

.control-section {
  flex: 0 0 40%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: v-bind('themeState.currentTheme.background2nd || themeState.currentTheme.background');
  overflow: hidden;
}

.tab-switch-wrapper {
  padding: 16px 24px;
  border-bottom: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0, 0, 0, 0.1)"');
  flex-shrink: 0;
}

.tab-switch {
  width: 100%;
  display: flex;
  gap: 4px;
  padding: 4px;
  background: v-bind('themeState.currentTheme.background || "#f5f5f5"');
  border-radius: 8px;
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "#dcdcdc"');
}

.quickstart-tab-item {
  flex: 1;
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 14px;
  text-align: center;
  transition: all 0.2s ease;
}

.quickstart-tab-item[data-state='on'] {
  background: v-bind('themeState.currentTheme.primary || "#409eff"');
  color: white;
}

.control-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.panel-scrollbar {
  flex: 1;
  min-height: 0;
}

.panel-section {
  display: flex;
  flex-direction: column;
  padding: 24px;
  gap: 20px;
  min-height: 0;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: v-bind('themeState.currentTheme.textColor');
  letter-spacing: -0.01em;
}

.form-fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  font-size: 13px;
  font-weight: 500;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.8;
}

.control-item {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.control-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.control-label {
  font-size: 13px;
  font-weight: 500;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.8;
}

.temperature-slider {
  width: 100%;
}

.mood-select {
  width: 100%;
}

.prompt-input {
  width: 100%;
}

.suggestions-item {
  margin-top: 8px;
}

.panel-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding-top: 16px;
  border-top: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0, 0, 0, 0.1)"');
  margin-top: auto;
  flex-shrink: 0;
}


</style>
