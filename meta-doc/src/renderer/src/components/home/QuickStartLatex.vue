<template>
  <div class="center-content">
    <h2 class="main-letter" @mouseover="highlightM" @mouseleave="resetM">
      {{ $t('home.quickStartTitle') }} · LaTeX
    </h2>

    <div
      class="aero-div quick-start-container"
      :style="containerStyle"
    >
      <div class="quick-start__header">
        <el-button @click="emitClose" class="aero-btn" plain round type="danger" size="small"/>
      </div>

      <div class="quick-start__content">
        <div class="quick-start__editor">
          <div class="generated-latex-container" ref="editorContainerRef"></div>
        </div>

        <div class="quick-start__divider"></div>

        <div class="quick-start__form">
          <div class="tab-switch">
            <el-segmented v-model="tab" :options="segmentOptions" />
          </div>

          <div class="aero-div quick-start__panel" v-if="tab === segmentOptions[1]">
            <label class="interactive-text quick-start__label" :style="labelStyle">
              {{ $t('home.documentInfoLabel') }}
            </label>
            <div class="quick-start__field">
              <label class="quick-start__field-label">{{ $t('home.label.title') }}</label>
              <el-input v-model="metaTitle" :placeholder="$t('home.placeholder.title')" />
            </div>
            <div class="quick-start__field">
              <label class="quick-start__field-label">{{ $t('home.label.author') }}</label>
              <el-input v-model="metaAuthor" :placeholder="$t('home.placeholder.author')" />
            </div>
            <div class="quick-start__field">
              <label class="quick-start__field-label">{{ $t('home.label.abstract') }}</label>
              <el-input
                v-model="metaDescription"
                type="textarea"
                :placeholder="$t('home.placeholder.abstract')"
                :autosize="{ minRows: 2, maxRows: 3 }"
              />
            </div>
            <div class="quick-start__actions">
              <el-tooltip :content="$t('home.tooltip.ready')" placement="top">
                <el-button circle type="success" @click="allSet">
                  <el-icon><Check /></el-icon>
                </el-button>
              </el-tooltip>
            </div>
          </div>

          <div class="aero-div quick-start__panel" v-if="tab === segmentOptions[0]">
            <label class="interactive-text quick-start__label" :style="labelStyle">
              {{ $t('home.aiAssistantLabel') }}
            </label>
            <el-tooltip :content="$t('home.tooltip.selectTemperature')" placement="left" >
              <el-slider
                v-model="temperature"
                :marks="marks"
                :min="0"
                :max="100"
                :disabled="generating || generated"
                class="temperature-slider-wrapper"
              />
            </el-tooltip>

            <el-tooltip :content="$t('home.tooltip.selectMood')" placement="left">
              <el-select
                v-model="mood"
                multiple
                filterable
                allow-create
                :placeholder="$t('home.tooltip.selectMood')"
                :disabled="generating || generated"
                size="small"
              >
                <el-option
                  v-for="option in moodOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                >
                  <template #prefix>
                    <el-icon :size="12">
                      <component :is="option.icon" />
                    </el-icon>
                  </template>
                </el-option>
              </el-select>
            </el-tooltip>

            <el-tooltip :content="$t('home.tooltip.inputPrompt')" placement="left">
              <el-autocomplete
                v-model="userPrompt"
                :fetch-suggestions="querySearch"
                clearable
                class="inline-input aero-input"
                :placeholder="$t('home.tooltip.inputPrompt')"
                @mousedown.stop
                type="textarea"
                :autosize="{ minRows: 3, maxRows: 3 }"
                resize="none"
                :disabled="generating || generated"
              />
            </el-tooltip>


            <div class="aero-div quick-start__suggestions">
              <label class="interactive-text quick-start__suggestion-label" :style="labelStyle">
                {{ $t('home.suggestionLabel') }}
              </label>
              <div class="quick-start__suggestion-grid" id="latex-suggestion-buttons">
                <el-button
                  v-for="(button, index) in buttons"
                  :key="index"
                  size="small"
                  class="aero-btn"
                  :disabled="generating || generated"
                  @click="handleAcceptSuggestion(button.prompt)"
                >
                  {{ button.label }}
                </el-button>
              </div>
              <el-button
                size="small"
                type="primary"
                class="aero-btn quick-start__refresh"
                :disabled="generating || generated"
                @click="refreshButtons"
              >
                <el-icon><Refresh /></el-icon>
                {{ $t('home.button.refresh') }}
              </el-button>
            </div>

            <div class="quick-start__footer" @mousedown.stop>
              <el-tooltip :content="$t('home.tooltip.generateArticle')" placement="top">
                <el-button
                  circle
                  type="primary"
                  :disabled="generating || userPrompt.length === 0"
                  @click="generate"
                >
                  <el-icon><Promotion /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip :content="$t('home.tooltip.reset')" placement="top">
                <el-button circle type="info" v-if="generated" @click="reset">
                  <el-icon><RefreshLeft /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip :content="$t('home.tooltip.accept')" placement="top">
                <el-button circle type="success" v-if="generated" @click="accept">
                  <el-icon><Check /></el-icon>
                </el-button>
              </el-tooltip>
            </div>
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
import { Check, Promotion, Refresh, RefreshLeft } from '@element-plus/icons-vue'
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
import { useActiveDocument } from '../../composables/useActiveDocument'
import { extractOutlineTreeFromMarkdown } from '../../utils/md-utils'
import { DEFAULT_OUTLINE_TREE } from '../../constants/document'
import { convertLatexToMarkdown } from '../../utils/latex-utils'
import { themeState, mixColors } from '../../utils/themes'
import eventBus, { getWindowType } from '../../utils/event-bus'
import { generateLatexPrompt, getSuggestionPresets, getPresets } from '../../utils/prompts'
import { getSetting } from '../../utils/settings'
import { ai_types, createAiTask } from '../../utils/ai_tasks'
import { createRendererLogger } from '../../utils/logger'

const emit = defineEmits(['close'])

const { t } = useI18n()
const workspace = useWorkspace()
const {
  activeTabId,
  updateDocumentMarkdown,
  updateDocumentTex,
  updateDocumentMeta,
  updateDocumentOutline,
  updateDocumentLastView
} = workspace
const { activeDocument } = useActiveDocument()

const logger = createRendererLogger('QuickStartLatex', {
  windowTypeProvider: () => getWindowType()
})

const currentTex = computed({
  get: () => activeDocument.value?.tex ?? '',
  set: (val: string) => {
    const tabId = activeTabId.value
    if (!tabId) return
    updateDocumentTex(tabId, val)
    const markdown = convertLatexToMarkdown(val)
    updateDocumentMarkdown(tabId, markdown)
    const outline = extractOutlineTreeFromMarkdown(markdown) ?? DEFAULT_OUTLINE_TREE
    updateDocumentOutline(tabId, outline)
  }
})

const currentMeta = computed(() => activeDocument.value?.meta ?? { title: '', author: '', description: '' })

const updateMetaField = (field: 'title' | 'author' | 'description', value: string) => {
  const tabId = activeTabId.value
  if (!tabId) return
  updateDocumentMeta(tabId, (meta) => {
    meta[field] = value
  })
}

const metaTitle = computed({
  get: () => currentMeta.value?.title ?? '',
  set: (val: string) => updateMetaField('title', val)
})
const metaAuthor = computed({
  get: () => currentMeta.value?.author ?? '',
  set: (val: string) => updateMetaField('author', val)
})
const metaDescription = computed({
  get: () => currentMeta.value?.description ?? '',
  set: (val: string) => updateMetaField('description', val)
})

const buttons = ref<{ label: string; prompt: string }[]>([])
const tab = ref<string>('')
const temperature = ref(50)
const marks = ref({
  0: t('home.temperatureMarks.rigorous'),
  100: t('home.temperatureMarks.creative'),
  50: {
    style: {
      color: '#1989FA'
    },
    label: t('home.temperatureMarks.balanced')
  }
})
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
const generatedText = ref(currentTex.value || defaultText)
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
  const enableKnowledgeBase = await getSetting('enableKnowledgeBase')
  // 清空内容，准备接收流式数据
  generatedText.value = ''
  const editor = getEditor()
  if (editor) {
    editor.setValue('')
  }
  const { done } = createAiTask(
    userPrompt.value,
    prompt,
    generatedText,
    ai_types.answer,
    'quick-start-latex',
    enableKnowledgeBase,
    { stream: true, temperature: temperature.value / 100 }
  )

  try {
    await done
    generated.value = true
  } catch (error) {
    logger.warn('LaTeX 任务失败或取消', error)
  } finally {
    generating.value = false
    workspace.unlockUI?.()
  }
}

const reset = () => {
  generated.value = false
  generatedText.value = currentTex.value || defaultText
  userPrompt.value = ''
  tab.value = segmentOptions.value[0]
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
      const editor = editors.find((e: monaco.editor.IStandaloneCodeEditor) => e.getId?.() === editorId)
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
  const tabId = activeTabId.value
  if (tabId) {
    const latexContent = generatedText.value
    // 先更新文档内容
    currentTex.value = latexContent
    updateDocumentLastView(tabId, 'article')
  }
  
  // 在导航前清理快速开始的编辑器，避免引用问题
  // 快速开始的编辑器是临时的，应该被销毁
  cleanupEditor()
  
  // 使用 nextTick 确保清理完成后再导航
  await nextTick()
  eventBus.emit('nav-to', '/editor')
  emitClose()
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

  // 设置 Monaco 环境
  ;(window as any).MonacoEnvironment = {
    getWorker: function (moduleId: string, label: string) {
      let workerPath = ''
      switch (label) {
        case 'json':
          workerPath = 'http://localhost:52521/monaco/language/json/json.worker.js'
          break
        case 'css':
        case 'scss':
        case 'less':
          workerPath = 'http://localhost:52521/monaco/language/css/css.worker.js'
          break
        case 'html':
        case 'handlebars':
        case 'razor':
          workerPath = 'http://localhost:52521/monaco/language/html/html.worker.js'
          break
        case 'typescript':
        case 'javascript':
          workerPath = 'http://localhost:52521/monaco/language/typescript/ts.worker.js'
          break
        default:
          workerPath = 'http://localhost:52521/monaco/editor/editor.worker.js'
      }
      const blob = new Blob([`import("${workerPath}");`], { type: 'application/javascript' })
      return new Worker(URL.createObjectURL(blob), { type: 'module' })
    }
  }

  // 注册 LaTeX 语言
  if (!monaco.languages.getLanguages().find(l => l.id === 'latex')) {
    monaco.languages.register({ id: 'latex' })
    monaco.languages.setMonarchTokensProvider('latex', {
      defaultToken: '',
      tokenPostfix: '.tex',
      tokenizer: {
        root: [
          [/\\[a-zA-Z]+/, 'keyword'],
          [/%.*$/, 'comment'],
          [/\$[^$]*\$/, 'string'],
          [/{|}/, 'delimiter'],
          [/\[|\]/, 'delimiter'],
          [/[^\s]+/, '']
        ]
      }
    })
  }

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

watch(
  () => currentTex.value,
  (value) => {
    if (!generated.value) {
      const editor = getEditor()
      if (editor) {
        const newValue = value || defaultText
        generatedText.value = newValue
        editor.setValue(newValue)
      }
    }
  }
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
.center-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100vh;
  overflow: auto;
  padding: 16px;
  box-sizing: border-box;
}

.main-letter {
  font-size: 36px;
  font-weight: bold;
  color: rgb(65, 105, 225);
  transition: color 0.3s ease;
  background-color: transparent;
  cursor: pointer;
  margin: 0;
  padding: 8px 0;
}

.quick-start-container {
  width: 70vw;
  height: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  backdrop-filter: blur(20px) brightness(1.05);
}

.quick-start__header {
  width: 100%;
  display: flex;
  justify-content: flex-start;
  margin-bottom: 10px;
}

.quick-start__content {
  display: flex;
  flex: 1;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  padding-top: 10px;
}

.quick-start__editor {
  flex-grow: 1;
  padding-right: 10px;
}

.generated-latex-container {
  width: 100%;
  height: 55vh;
  min-height: 400px;
}

.quick-start__divider {
  width: 1px;
  margin: 0 10px;
  align-self: stretch;
  background-color: rgba(0, 0, 0, 0.1);
}

.quick-start__form {
  width: 30%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tab-switch {
  --el-segmented-item-selected-color: var(--el-text-color-primary);
  --el-segmented-item-selected-bg-color: var(--el-color-primary);
  --el-border-radius-base: 4px;
  opacity: 0.9;
}

.quick-start__panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 10px;
  height: 47vh;
  width: 18vw;
  border-radius: 4px;
}

.temperature-slider-wrapper {
  margin-bottom: 20px;
  width: 80%;
  align-self: center;
}


.quick-start__label {
  width: 100%;
  text-align: center;
  font-weight: bold;
  margin-bottom: 10px;
}

.quick-start__field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.quick-start__field-label {
  width: 60px;
  text-align: left;
}

.quick-start__actions {
  display: flex;
  align-items: center;
  justify-content: center;
}

.quick-start__suggestions {
  position: relative;
  height: 150px;
  width: 80%;
  margin: 10px auto;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  background-color: rgba(255, 255, 255, 0.05);
  box-shadow: none;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.quick-start__suggestion-label {
  text-align: center;
  font-weight: bold;
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
}

.quick-start__suggestion-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  justify-items: center;
  align-items: center;
  height: 100%;
  width: 100%;
  padding-top: 24px;
}

.quick-start__refresh {
  position: absolute;
  bottom: 3px;
  left: 50%;
  transform: translateX(-50%);
  opacity: 0.8;
}

.quick-start__footer {
  display: flex;
  gap: 12px;
  justify-content: center;
  align-items: center;
}

/* 修复输入框border颜色，使其不固定 */
.aero-input :deep(.el-input__wrapper) {
  border-color: rgba(0, 0, 0, 0.1) !important;
}

.aero-input :deep(.el-input__wrapper:hover) {
  border-color: rgba(0, 0, 0, 0.2) !important;
}

.aero-input :deep(.el-input__wrapper.is-focus) {
  border-color: var(--el-color-primary) !important;
}

/* 修复textarea的border */
.aero-input :deep(.el-textarea__inner) {
  border-color: rgba(0, 0, 0, 0.1) !important;
}

.aero-input :deep(.el-textarea__inner:hover) {
  border-color: rgba(0, 0, 0, 0.2) !important;
}

.aero-input :deep(.el-textarea__inner:focus) {
  border-color: var(--el-color-primary) !important;
}
</style>
