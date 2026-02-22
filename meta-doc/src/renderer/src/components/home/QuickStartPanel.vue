<template>
  <div v-if="stage === 'format'" class="quick-start-panel-wrapper">
    <div class="quick-start-panel-container" :style="formatContainerStyle">
      <div class="panel-header">
        <h2 class="panel-title">{{ $t('home.quickStartFormatTitle') }}</h2>
        <Button
          class="close-button"
          @click="closeQuickStart"
          circle
          size="small"
          variant="ghost"
        >
          <X class="w-4 h-4" />
        </Button>
      </div>
      <div class="format-options-container">
        <div
          class="format-option-card"
          :style="formatOptionStyle"
          @click="selectQuickStartFormat('md')"
        >
          <div class="format-option-icon">📝</div>
          <h3 class="format-option-title">Markdown</h3>
          <p class="format-option-description">
            {{ $t('home.quickStartFormatDescriptionMarkdown') }}
          </p>
        </div>
        <div
          class="format-option-card"
          :style="formatOptionStyle"
          @click="selectQuickStartFormat('tex')"
        >
          <div class="format-option-icon">📄</div>
          <h3 class="format-option-title">LaTeX</h3>
          <p class="format-option-description">{{ $t('home.quickStartFormatDescriptionLatex') }}</p>
        </div>
      </div>
    </div>
  </div>

  <QuickStartMarkdown v-else-if="stage === 'markdown'" @close="handleQuickStartClose" />
  <QuickStartLatex v-else-if="stage === 'latex'" @close="handleQuickStartClose" />

  <!-- 原有的 QuickStartPanel 编辑器界面（保留作为备用） -->
  <div v-else class="quick-start-overlay" :style="overlayStyle">
    <div class="quick-start-panel aero-div">
      <div class="panel-header">
        <Button @click="handleClose" class="aero-btn" plain round type="danger" size="small" />
      </div>

      <div v-if="stage === 'select'" class="format-selector">
        <h2 class="selector-title">{{ $t('home.quickStartFormatTitle') }}</h2>
        <div class="format-grid">
          <Card
            v-for="option in formatOptions"
            :key="option.id"
            class="format-card cursor-pointer transition-transform hover:-translate-y-1"
            @click="selectQuickStartFormat(option.id as 'md' | 'tex')"
          >
            <CardContent class="text-center">
              <h3>{{ option.title }}</h3>
              <p>{{ option.description }}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div v-else class="panel-body">
        <div class="panel-body__left">
          <ScrollArea class="w-full h-full">
            <MarkdownItEditor :source="generatedText" @mousedown.stop class="markdown-editor" />
          </ScrollArea>
        </div>
        <div class="panel-divider" />
        <div class="panel-body__right">
          <div class="tab-switch">
            <ToggleGroup v-model="activeTab" type="single" class="quickstart-tab-toggle">
              <ToggleGroupItem v-for="option in tabOptions" :key="option" :value="option" class="quickstart-tab-item">
                {{ option }}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div v-if="activeTab === documentTabLabel" class="document-info aero-div">
            <label class="section-title interactive-text">{{ $t('home.documentInfoLabel') }}</label>
            <div class="form-row">
              <label>{{ $t('home.label.title') }}</label>
              <Input v-model="metaTitle" :placeholder="$t('home.placeholder.title')" />
            </div>
            <div class="form-row">
              <label>{{ $t('home.label.author') }}</label>
              <Input v-model="metaAuthor" :placeholder="$t('home.placeholder.author')" />
            </div>
            <div class="form-row">
              <label>{{ $t('home.label.abstract') }}</label>
              <Textarea
                v-model="metaDescription"
                :placeholder="$t('home.placeholder.abstract')"
                class="min-h-[60px]"
              />
            </div>
            <div class="form-actions">
              <el-tooltip :content="$t('home.tooltip.ready')" placement="top">
                <Button circle type="success" @click="confirmDocument"
                  >
                  <Check class="w-4 h-4" />
                ></Button>
              </el-tooltip>
            </div>
          </div>

          <div v-else class="ai-assistant aero-div">
            <label class="section-title interactive-text">{{ $t('home.aiAssistantLabel') }}</label>
            <el-tooltip :content="$t('home.tooltip.selectTemperature')" placement="left">
              <Slider
                v-model="temperature"
                :min="0"
                :max="100"
                :disabled="generated || generating"
                class="temperature-slider-wrapper"
              />
            </el-tooltip>
            <el-tooltip :content="$t('home.tooltip.selectMood')" placement="left">
              <Select v-model="mood" multiple :disabled="generated || generating">
                <SelectTrigger class="h-8 text-sm">
                  <SelectValue :placeholder="$t('home.tooltip.selectMood')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="option in moodOptions" :key="option.value" :value="option.value">
                    <div class="flex items-center gap-2">
                      <component :is="option.icon" class="w-3 h-3" />
                      <span>{{ option.label }}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </el-tooltip>
            <el-tooltip :content="$t('home.tooltip.inputPrompt')" placement="left">
              <Autocomplete
                v-model="userPrompt"
                :fetch-suggestions="querySearch"
                clearable
                input-class="inline-input aero-input"
                :placeholder="$t('home.tooltip.inputPrompt')"
                :disabled="generated || generating"
              />
            </el-tooltip>
            <div class="suggestion-container aero-div">
              <label class="section-title interactive-text">{{ $t('home.suggestionLabel') }}</label>
              <div class="suggestion-grid">
                <Button
                  v-for="(button, index) in buttons"
                  :key="index"
                  size="small"
                  @click="handleAcceptSuggestion(button.prompt)"
                  class="aero-btn"
                  :disabled="generating || generated"
                >
                  {{ button.label }}
                </Button>
              </div>
              <Button
                size="small"
                type="primary"
                :disabled="generating || generated"
                class="aero-btn refresh-btn"
                @click="refreshButtons"
              >
                <RefreshCw class="w-4 h-4" />
                {{ $t('home.button.refresh') }}
              </Button>
            </div>
            <div class="action-buttons" @mousedown.stop>
              <el-tooltip :content="$t('home.tooltip.generateArticle')" placement="top">
                <Button circle type="primary" @click="generate" :disabled="disableGenerate"
                  >
                  <Send class="w-4 h-4" />
                ></Button>
              </el-tooltip>
              <el-tooltip :content="$t('home.tooltip.reset')" placement="top">
                <Button circle type="info" @click="reset" v-if="generated"
                  >
                  <Undo2 class="w-4 h-4" />
                ></Button>
              </el-tooltip>
              <el-tooltip :content="$t('home.tooltip.accept')" placement="top">
                <Button circle type="success" @click="accept" v-if="generated"
                  >
                  <Check class="w-4 h-4" />
                ></Button>
              </el-tooltip>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import QuickStartMarkdown from './QuickStartMarkdown.vue'
import QuickStartLatex from './QuickStartLatex.vue'
import VoiceInput from '../VoiceInput.vue'
// @ts-expect-error: Missing types for vue3-markdown-it
import MarkdownItEditor from 'vue3-markdown-it'
import {
  BarChart3,
  CloudRain,
  Zap,
  Moon,
  Coffee,
  Candy,
  Briefcase,
  AlertTriangle,
  Check,
  Send,
  RefreshCw,
  Undo2,
  X
} from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import { Slider } from '@renderer/components/ui/slider'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { ToggleGroup, ToggleGroupItem } from '@renderer/components/ui/toggle-group'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Textarea } from '@renderer/components/ui/textarea'
import {
  Card,
  CardContent,
} from '@renderer/components/ui/card'
import { Autocomplete } from '@renderer/components/ui/autocomplete'
import { generateArticlePrompt, getPresets, getSuggestionPresets } from '../../utils/prompts'
import { useWorkspace } from '../../stores/workspace'
import { useActiveDocument } from '../../composables/useActiveDocument'
import { extractOutlineTreeFromMarkdown } from '../../utils/md-utils'
import { DEFAULT_OUTLINE_TREE } from '../../constants/document'
import { ai_types, createAiTask } from '../../utils/ai_tasks'
import { createRendererLogger } from '../../utils/logger'
import eventBus, { getWindowType } from '../../utils/event-bus'
import { getSetting } from '../../utils/settings'
import { themeState } from '../../utils/themes'
import { convertMarkdownToLatex, convertLatexToMarkdown } from '../../utils/latex-utils'
import type { AIDialogMessage } from '@/types'

const emit = defineEmits<{ (e: 'close'): void }>()

const stage = ref<'format' | 'select' | 'editor' | 'markdown' | 'latex'>('format')
const selectedFormat = ref<'md' | 'tex' | null>(null)

const { t } = useI18n()
const workspace = useWorkspace()
const {
  activeTabId,
  activeDocument,
  updateDocumentMarkdown,
  updateDocumentTex,
  updateDocumentMeta,
  updateDocumentOutline,
  updateDocumentLastView,
  initializeDocumentFromTemplate,
  supportedFormats,
  openNewDocumentTab,
  activateTab,
  addDocumentTab,
  createDocumentSnapshotFromTemplate
} = workspace

const formatOptions = computed(() =>
  supportedFormats.map((format) => ({
    id: format.id,
    title: t(format.labelKey ?? ''),
    description: t(format.descriptionKey ?? '')
  }))
)

const overlayStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  background:
    stage.value === 'editor'
      ? themeState.currentTheme.quickStartBackground1
      : themeState.currentTheme.quickStartBackground2
}))

const formatContainerStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  background: themeState.currentTheme.quickStartBackground1
}))

const formatOptionStyle = computed(() => ({
  background: themeState.currentTheme.quickStartBackground2
}))

const buttons = ref<{ label: string; prompt: string }[]>([])
const temperature = ref(50)
const tabOptions = computed(() => [t('home.tab.aiAssistant'), t('home.tab.documentInfo')])
const aiTabLabel = computed(() => tabOptions.value[0] ?? '')
const documentTabLabel = computed(() => tabOptions.value[1] ?? '')
const activeTab = ref(aiTabLabel.value)
const mood = ref<string[]>([t('home.mood.peaceful')])
const userPrompt = ref('')
const generated = ref(false)
const generating = ref(false)
const defaultText = ref('')
const generatedText = ref('')

const moodOptions = computed(() => [
  { label: t('home.mood.happy'), value: 'happy', icon: Candy },
  { label: t('home.mood.lyrical'), value: 'lyrical', icon: Moon },
  { label: t('home.mood.peaceful'), value: 'peaceful', icon: Coffee },
  { label: t('home.mood.academic'), value: 'academic', icon: BarChart3 },
  { label: t('home.mood.business'), value: 'business', icon: Briefcase },
  { label: t('home.mood.sad'), value: 'sad', icon: CloudRain },
  { label: t('home.mood.warning'), value: 'warning', icon: AlertTriangle },
  { label: t('home.mood.exciting'), value: 'exciting', icon: Zap },
  { label: t('home.mood.angry'), value: 'angry', icon: Zap },
  { label: t('home.mood.surprised'), value: 'surprised', icon: Zap },
  { label: t('home.mood.fearful'), value: 'fearful', icon: Zap },
  { label: t('home.mood.disgusted'), value: 'disgusted', icon: Zap }
])

const logger = createRendererLogger('QuickStartPanel', {
  windowTypeProvider: () => getWindowType()
})

const currentMeta = computed(
  () => activeDocument.value?.meta ?? { title: '', author: '', description: '' }
)

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

const disableGenerate = computed(
  () => generating.value || generated.value || userPrompt.value.trim().length === 0
)

function updateMetaField(field: 'title' | 'author' | 'description', value: string) {
  const tabId = activeTabId.value
  if (!tabId) return
  updateDocumentMeta(tabId, (meta) => {
    meta[field] = value
  })
}

function generateRandomButtons() {
  const randomCount = 6
  const randomButtons: { label: string; prompt: string }[] = []
  const used = new Set<number>()

  const presets = getSuggestionPresets()
  while (randomButtons.length < randomCount && used.size < presets.length) {
    const index = Math.floor(Math.random() * presets.length)
    if (used.has(index)) continue
    used.add(index)
    randomButtons.push({
      label: presets[index].label,
      prompt: presets[index].prompt
    })
  }
  return randomButtons
}

function refreshButtons() {
  buttons.value = generateRandomButtons()
}

function handleAcceptSuggestion(prompt: string) {
  userPrompt.value = prompt
}

function onSpeechRecognized(text: string) {
  userPrompt.value = text
}

function querySearch(queryString: string, cb: (results: Array<{ value: string }>) => void) {
  const presetList = getPresets()
  const results = queryString
    ? presetList.filter((preset) => preset.value.toLowerCase().includes(queryString.toLowerCase()))
    : presetList
  cb(results)
}

function reset() {
  generated.value = false
  if (selectedFormat.value === 'tex') {
    const tex = activeDocument.value?.tex ?? ''
    generatedText.value = tex ? convertLatexToMarkdown(tex) : ''
  } else {
    generatedText.value = activeDocument.value?.markdown || defaultText.value
  }
}

async function generate() {
  workspace.lockUI?.()
  generating.value = true
  generated.value = false

  try {
    const prompt = generateArticlePrompt(mood.value, userPrompt.value)
    // 清空内容，准备接收流式数据
    generatedText.value = ''
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
      'quick-start',
      { stream: true, temperature: temperature.value / 100 }
    )
    await done
  } catch (error) {
    logger.warn('AI 生成失败或已取消', error)
  } finally {
    generated.value = true
    generating.value = false
    workspace.unlockUI?.()
  }
}

async function accept() {
  const tabId = activeTabId.value
  if (!tabId) return

  if (selectedFormat.value === 'tex') {
    const texContent = await convertMarkdownToLatex(generatedText.value || '')
    updateDocumentTex(tabId, texContent)
  } else {
    const markdownContent = generatedText.value || ''
    updateDocumentMarkdown(tabId, markdownContent)
    const outline = extractOutlineTreeFromMarkdown(markdownContent) ?? DEFAULT_OUTLINE_TREE
    updateDocumentOutline(tabId, outline)
  }
  updateDocumentLastView(tabId, 'editor')
  activeTab.value = tabOptions.value[1]
}

function confirmDocument() {
  eventBus.emit('nav-to', '/editor')
}

function prepareDocument(format: 'md' | 'tex') {
  if (!activeTabId.value) {
    const tab = openNewDocumentTab()
    activateTab(tab.id)
  }

  const tabId = activeTabId.value
  if (!tabId) return

  let doc = activeDocument.value
  if (!doc || doc.format !== format || doc.path !== '') {
    initializeDocumentFromTemplate(tabId, format)
    doc = activeDocument.value
  }

  if (format === 'tex') {
    const tex = doc?.tex ?? ''
    defaultText.value = tex ? convertLatexToMarkdown(tex) : ''
  } else {
    defaultText.value = doc?.markdown ?? t('home.defaultText')
  }
  generatedText.value = defaultText.value
  generated.value = false
  generating.value = false
  userPrompt.value = ''
  refreshButtons()
}

function selectFormat(format: 'md' | 'tex') {
  selectedFormat.value = format
  stage.value = 'editor'
  activeTab.value = aiTabLabel.value
  prepareDocument(format)
}

function handleClose() {
  stage.value = 'select'
  selectedFormat.value = null
  activeTab.value = aiTabLabel.value
  emit('close')
}

const closeQuickStart = () => {
  stage.value = 'format'
  eventBus.emit('reset-quickstart')
  eventBus.emit('quickstart-stage-changed', 'inactive')
  emit('close')
}

const handleQuickStartClose = () => {
  closeQuickStart()
}

const selectQuickStartFormat = (format: 'md' | 'tex') => {
  logger.info('[QuickStartPanel] selectQuickStartFormat 开始', { format })

  // 仅切换界面状态，不创建或激活任何文档 tab
  eventBus.emit('reset-quickstart')
  const newStage = format === 'md' ? 'markdown' : 'latex'
  logger.info('[QuickStartPanel] 设置 stage', { newStage, currentStage: stage.value })
  stage.value = newStage
  logger.info('[QuickStartPanel] stage 已更新', { stage: stage.value })

  // 通知 GlobalHome.vue 更新快速开始面板状态
  eventBus.emit('quickstart-stage-changed', newStage)
  logger.info('[QuickStartPanel] 已发送 quickstart-stage-changed 事件', { newStage })
}

onMounted(() => {
  refreshButtons()
  defaultText.value = t('home.defaultText')
  eventBus.on('reset-quickstart', reset)
  // 监听 openQuickStart 事件
  eventBus.on('open-quickstart', () => {
    stage.value = 'format'
    eventBus.emit('quickstart-stage-changed', 'format')
  })
})

watch(tabOptions, (options) => {
  if (!options.includes(activeTab.value)) {
    activeTab.value = options[0]
  }
})

onBeforeUnmount(() => {
  eventBus.off('reset-quickstart', reset)
  eventBus.off('open-quickstart')
})

watch(
  () => t('home.defaultText'),
  (val) => {
    if (selectedFormat.value !== 'tex') {
      defaultText.value = val
      if (!generated.value) {
        generatedText.value = val
      }
    }
  }
)
</script>

<style scoped>
.center-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
  height: 100%;
  padding: 16px 24px;
  box-sizing: border-box;
  position: relative;
  z-index: 1;
  overflow: auto;
}

.main-letter {
  font-size: 48px;
  font-weight: 700;
  color: rgb(65, 105, 225);
  margin: 0;
  padding: 8px 0;
  transition: color 0.3s ease;
}

.main-letter:hover {
  color: rgb(50, 150, 250);
}

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
  max-width: 900px;
  max-height: 600px;
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
  padding: 24px 32px;
  border-bottom: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0, 0, 0, 0.1)"');
  flex-shrink: 0;
  position: relative;
}

.panel-title {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  color: v-bind('themeState.currentTheme.textColor');
  letter-spacing: -0.02em;
}

.close-button {
  position: absolute;
  top: 16px;
  right: 16px;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.6;
  transition: opacity 0.2s ease;
}

.close-button:hover {
  opacity: 1;
}

.format-options-container {
  flex: 1;
  display: flex;
  gap: 24px;
  padding: 40px 32px;
  align-items: center;
  justify-content: center;
  overflow: auto;
}

.format-option-card {
  flex: 1;
  max-width: 350px;
  min-width: 280px;
  padding: 40px 32px;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 2px solid transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  position: relative;
  overflow: hidden;
}

.format-option-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.format-option-card:hover::before {
  opacity: 1;
}

.format-option-card:hover {
  transform: translateY(-4px);
  border-color: v-bind('themeState.currentTheme.borderColor || "rgba(0, 0, 0, 0.2)"');
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
}

.format-option-icon {
  font-size: 64px;
  margin-bottom: 20px;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.1));
  transition: transform 0.3s ease;
}

.format-option-card:hover .format-option-icon {
  transform: scale(1.1);
}

.format-option-title {
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 12px 0;
  color: v-bind('themeState.currentTheme.textColor');
  letter-spacing: -0.01em;
}

.format-option-description {
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.8;
}

.quick-start-overlay {
  position: relative;
  width: 70vw;
  height: 90vh;
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.5s ease;
  overflow: auto;
}

.quick-start-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(8px);
}

.panel-header {
  display: flex;
  justify-content: flex-start;
  margin-bottom: 12px;
}

.panel-body {
  display: flex;
  flex: 1;
  border-top: 1px dashed var(--el-border-color);
  padding-top: 12px;
}

.panel-body__left {
  flex: 1;
  display: flex;
  overflow: hidden;
  padding-right: 12px;
}

.panel-body__right {
  width: 30%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-divider {
  width: 1px;
  margin: 0 12px;
  background: var(--el-border-color-light);
}

.tab-switch {
  display: flex;
  justify-content: center;
}

.quickstart-tab-toggle {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: v-bind('themeState.currentTheme.background || "#f5f5f5"');
  border-radius: 8px;
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "#dcdcdc"');
}

.quickstart-tab-item {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 14px;
  transition: all 0.2s ease;
}

.quickstart-tab-item[data-state='on'] {
  background: v-bind('themeState.currentTheme.primary || "#409eff"');
  color: white;
}

.document-info,
.ai-assistant {
  display: flex;
  flex-direction: column;
  align-items: stretch;

  gap: 12px;
}

.temperature-slider-wrapper {
  margin-bottom: 20px;
  width: 80%;
  align-self: center;
}

.section-title {
  width: 100%;
  text-align: center;
  font-weight: bold;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-row label {
  width: 60px;
  text-align: left;
}

.form-actions {
  display: flex;
  justify-content: center;
}

.markdown-editor {
  box-shadow: none;
}

.suggestion-container {
  position: relative;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.suggestion-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.refresh-btn {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
}

.action-buttons {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.format-selector {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
}

.selector-title {
  font-size: 28px;
  margin: 0;
  padding: 8px 0;
}

.format-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(200px, 1fr));
  gap: 16px;
}

.format-card {
  cursor: pointer;
  transition: transform 0.2s ease;
  text-align: center;
}

.format-card:hover {
  transform: translateY(-4px);
}
</style>
