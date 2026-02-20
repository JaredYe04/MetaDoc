<template>
  <div class="quick-start-panel-wrapper">
    <div class="quick-start-panel-container" :style="containerStyle">
      <!-- 头部 -->
      <div class="panel-header">
        <h2 class="panel-title">{{ $t('home.quickStartTitle') }} · Markdown</h2>
        <el-button @click="emitClose" class="close-button" circle size="small" :icon="Close" />
      </div>

      <!-- 主内容区域 -->
      <div class="panel-content">
        <!-- 左侧：预览区域 -->
        <div class="preview-section">
          <div class="preview-header">
            <span class="section-label">预览</span>
          </div>
          <el-scrollbar class="preview-container">
            <div class="preview-content">
              <MarkdownItEditor :source="generatedText" @mousedown.stop style="box-shadow: none" />
            </div>
          </el-scrollbar>
        </div>

        <!-- 分隔线 -->
        <div class="content-divider"></div>

        <!-- 右侧：控制面板 -->
        <div class="control-section">
          <div class="tab-switch-wrapper">
            <el-segmented v-model="tab" :options="segmentOptions" class="tab-switch" />
          </div>

          <!-- 文档信息面板 -->
          <div class="control-panel" v-if="tab === segmentOptions[1]">
            <el-scrollbar class="panel-scrollbar">
              <div class="panel-section">
                <h3 class="section-title">{{ $t('home.documentInfoLabel') }}</h3>
                <div class="form-fields">
                  <div class="form-field">
                    <label class="field-label">{{ $t('home.label.title') }}</label>
                    <el-input v-model="metaTitle" :placeholder="$t('home.placeholder.title')" />
                  </div>
                  <div class="form-field">
                    <label class="field-label">{{ $t('home.label.author') }}</label>
                    <el-input v-model="metaAuthor" :placeholder="$t('home.placeholder.author')" />
                  </div>
                  <div class="form-field">
                    <label class="field-label">{{ $t('home.label.abstract') }}</label>
                    <el-input
                      v-model="metaDescription"
                      type="textarea"
                      :placeholder="$t('home.placeholder.abstract')"
                      :autosize="{ minRows: 3, maxRows: 4 }"
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
                    <el-button type="success" @click="allSet" :icon="Check">
                      {{ $t('home.tooltip.ready') }}
                    </el-button>
                  </el-tooltip>
                </div>
              </div>
            </el-scrollbar>
          </div>

          <!-- AI 助手面板 -->
          <div class="control-panel" v-if="tab === segmentOptions[0]">
            <el-scrollbar class="panel-scrollbar">
              <div class="panel-section">
                <h3 class="section-title">{{ $t('home.aiAssistantLabel') }}</h3>
                <!-- 温度滑块 -->
                <div class="control-item">
                  <div class="control-item-header">
                    <span class="control-label">{{ $t('home.tooltip.selectTemperature') }}</span>
                  </div>
                  <el-slider
                    v-model="temperature"
                    :marks="marks"
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
                  <el-select
                    v-model="mood"
                    multiple
                    filterable
                    allow-create
                    :placeholder="$t('home.tooltip.selectMood')"
                    :disabled="generating || generated"
                    class="mood-select"
                  >
                    <el-option
                      v-for="option in moodOptions"
                      :key="option.value"
                      :label="option.label"
                      :value="option.value"
                    >
                      <template #prefix>
                        <el-icon :size="14">
                          <component :is="option.icon" />
                        </el-icon>
                      </template>
                    </el-option>
                  </el-select>
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
                    <el-button
                      type="primary"
                      :disabled="generating || userPrompt.length === 0"
                      @click="generate"
                      :icon="Promotion"
                      :loading="generating"
                    >
                      {{ $t('home.tooltip.generateArticle') }}
                    </el-button>
                  </el-tooltip>
                  <el-tooltip :content="$t('home.tooltip.reset')" placement="top">
                    <el-button v-if="generated" @click="reset" :icon="RefreshLeft">
                      {{ $t('home.tooltip.reset') }}
                    </el-button>
                  </el-tooltip>
                  <el-tooltip :content="$t('home.tooltip.accept')" placement="top">
                    <el-button v-if="generated" type="success" @click="accept" :icon="Check">
                      {{ $t('home.tooltip.accept') }}
                    </el-button>
                  </el-tooltip>
                </div>
              </div>
            </el-scrollbar>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import VoiceInput from '../VoiceInput.vue'
// @ts-expect-error: No type definitions for vue3-markdown-it
import MarkdownItEditor from 'vue3-markdown-it'
import { Check, Promotion, Refresh, RefreshLeft, Close } from '@element-plus/icons-vue'
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
import { themeState } from '../../utils/themes'
import eventBus, { getWindowType } from '../../utils/event-bus'
import { generateMarkdownPrompt, getSuggestionPresets, getPresets } from '../../utils/prompts'
import { getSetting } from '../../utils/settings'
import { ai_types, createAiTask } from '../../utils/ai_tasks'
import { createRendererLogger } from '../../utils/logger'
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
  updateDocumentMeta,
  updateDocumentOutline,
  updateDocumentLastView,
  initializeDocumentFromTemplate,
  openNewDocumentTab,
  activateTab
} = workspace

const logger = createRendererLogger('QuickStartMarkdown', {
  windowTypeProvider: () => getWindowType()
})

const metaTitle = ref('')
const metaAuthor = ref('')
const metaDescription = ref('')
const metaKeywords = ref<string[]>([])

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
const defaultText = t('home.defaultText')
const generatedText = ref(defaultText)
const generated = ref(false)
const generating = ref(false)

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

const generate = async () => {
  workspace.lockUI?.()
  generating.value = true
  generated.value = false

  const prompt = generateMarkdownPrompt(mood.value, userPrompt.value)
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
    'quick-start-markdown',
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
    logger.warn('任务失败或取消', error)
  } finally {
    generating.value = false
    workspace.unlockUI?.()
  }
}

// 自动生成元信息（标题、摘要、关键词）
const autoGenerateMetaInfo = async () => {
  if (!generatedText.value) return

  try {
    // 提取大纲
    const outline = extractOutlineTreeFromMarkdown(generatedText.value) ?? DEFAULT_OUTLINE_TREE
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
      // 提取标题（去除可能的解释文字）
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
  generating.value = false
  userPrompt.value = ''
  tab.value = segmentOptions.value[0]
  generatedText.value = defaultText
  metaTitle.value = ''
  metaAuthor.value = ''
  metaDescription.value = ''
  metaKeywords.value = []
}

const accept = () => {
  logger.info('[QuickStartMarkdown] accept 开始')

  if (generatedText.value.length && !generatedText.value.endsWith('\n')) {
    generatedText.value += '\n'
  }

  // 创建并激活新文档 tab
  const tabObj = openNewDocumentTab()
  const tabId = tabObj.id
  activateTab(tabId)

  // 初始化文档
  initializeDocumentFromTemplate(tabId, 'md')

  // 更新内容与元信息
  updateDocumentMarkdown(tabId, generatedText.value)
  updateDocumentMeta(tabId, (meta) => {
    meta.title = metaTitle.value
    meta.author = metaAuthor.value
    meta.description = metaDescription.value
    meta.keywords = metaKeywords.value
  })
  const outline = extractOutlineTreeFromMarkdown(generatedText.value) ?? DEFAULT_OUTLINE_TREE
  updateDocumentOutline(tabId, outline)

  // 切换到编辑视图
  updateDocumentLastView(tabId, 'editor')

  // 进入编辑器
  eventBus.emit('nav-to', '/editor')

  emitClose()
  logger.info('[QuickStartMarkdown] accept - 完成', { tabId })
}

const allSet = () => {
  accept()
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

onMounted(() => {
  refreshButtons()
  tab.value = segmentOptions.value[0]
  eventBus.emit('theme-changed')
})

eventBus.on('reset-quickstart', reset)

onBeforeUnmount(() => {
  eventBus.off('reset-quickstart', reset)
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

.preview-container {
  flex: 1;
  min-height: 0;
}

.preview-content {
  padding: 24px;
  min-height: 100%;
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

/* 滚动条样式 */
.panel-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.preview-container :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}
</style>
