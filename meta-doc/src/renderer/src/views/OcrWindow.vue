<template>
  <div class="ocr-window">
    <div class="main-container">
      <!-- 左侧会话列表（含右侧 resize 与折叠，主内容通过默认 slot 传入） -->
      <SessionList
        :title="t('ocr.sessionsTitle')"
        :items="sessions"
        :active-index="activeSessionId || undefined"
        :disabled="processing || loadingSession"
        :create-button-tooltip="t('ocr.newSession')"
        :rename-label="t('common.rename')"
        :duplicate-label="t('common.duplicate')"
        :delete-label="t('common.delete')"
        :rename-dialog-title="t('ocr.renameTitle')"
        :rename-placeholder="t('ocr.renamePlaceholder')"
        :cancel-label="t('common.cancel')"
        :confirm-label="t('common.confirm')"
        @create="handleCreateSession"
        @select="handleSelectSession"
        @rename="handleRenameSession"
        @duplicate="handleDuplicateSession"
        @delete="handleDeleteSession"
      >
        <!-- 右侧内容区域 -->
        <div class="content-area" :style="contentAreaStyle" style="position: relative">
          <LoadingOverlay :show="loadingSession" :message="t('common.loading', '加载中...')" />
          <div v-if="!activeSession" class="empty-state" :style="emptyStateStyle">
            <p>{{ t('ocr.noSessionSelected') }}</p>
          </div>

          <div v-else class="session-content-panel" :style="panelStyle">
            <!-- 顶部工具栏 -->
            <div class="toolbar-section">
              <el-scrollbar class="toolbar-scrollbar" always>
                <div class="toolbar-content">
                  <div class="toolbar-left">
                    <!-- 语言包选择 -->
                    <div class="language-select-wrapper">
                      <Select v-model="selectedLanguages" multiple>
                        <SelectTrigger class="w-[200px]">
                          <SelectValue :placeholder="t('ocr.selectLanguages')" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem
                            v-for="lang in availableLanguages"
                            :key="lang.value"
                            :value="lang.value"
                          >
                            {{ lang.label }}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <!-- 上传和粘贴按钮 -->
                    <Upload
                      ref="uploadRef"
                      v-model:file-list="imageList"
                      :auto-upload="false"
                      @change="(file: any, fileList: any[]) => handleImageChange(file, fileList)"
                      @remove="handleImageRemove"
                      accept="image/*"
                      multiple
                      :show-file-list="false"
                    >
                      <Button>
                        <UploadFilled class="mr-1 h-4 w-4" />
                        {{ t('ocr.uploadHint') }}
                      </Button>
                    </Upload>

                    <Button variant="outline" @click="handlePasteFromClipboard">
                      {{ t('ocr.pasteFromClipboard') }}
                    </Button>
                  </div>

                  <div class="toolbar-right">
                    <!-- 操作按钮 -->
                    <Button
                      size="sm"
                      variant="outline"
                      :disabled="aiFixing.get(index)"
                      @click="handleAiFix(index)"
                    >
                      <img
                        :src="(themeState.currentTheme as any).AiLogo"
                        alt="AI"
                        class="ai-logo-icon-small"
                      />
                      {{ t('ocr.aiFix') }}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      :disabled="recognizingIndex.has(index)"
                      @click="handleReRecognizeSingle(index)"
                    >
                      {{ t('ocr.reRecognize') }}
                    </Button>
                  </div>
                </div>
              </el-scrollbar>
            </div>

            <!-- OCR结果展示 -->
            <div v-if="ocrResults.length > 0" class="result-section">
              <Tabs v-model="activeTab" class="ocr-tabs">
                <TabsList>
                  <TabsTrigger
                    v-for="(result, index) in ocrResults"
                    :key="index"
                    :value="`image-${index}`"
                  >
                    <span
                      class="tab-label-wrapper"
                      @mouseenter="(e) => handleTabHover(e, index)"
                      @mouseleave="handleTabLeave"
                    >
                      {{ t('ocr.image') }} {{ index + 1 }}
                      <Button
                        variant="ghost"
                        size="sm"
                        class="tab-delete-btn h-6 w-6 p-0"
                        @click.stop="handleDeleteImage(index)"
                      >
                        <Delete class="h-3 w-3" />
                      </Button>
                    </span>
                  </TabsTrigger>
                </TabsList>
                <TabsContent
                  v-for="(result, index) in ocrResults"
                  :key="index"
                  :value="`image-${index}`"
                >
                  <div class="ocr-result-item">
                    <div class="image-section">
                      <div class="image-preview" @click="handleImageClick(result.imageUrl, index)">
                        <img
                          :src="getProcessedImageUrl(index)"
                          :alt="`Image ${index + 1}`"
                          @error="handleImageError($event, result.imageUrl)"
                        />
                      </div>
                      <!-- 预处理面板 -->
                      <div class="preprocessing-panel">
                        <div class="panel-header">
                          <div class="panel-title">{{ t('ocr.imagePreprocessing') }}</div>
                        </div>
                        <div class="panel-actions">
                          <Button
                            size="sm"
                            variant="outline"
                            @click="resetPreprocessingParams(index)"
                          >
                            {{ t('ocr.resetParams') }}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            @click="applyDefaultPreprocessingParams(index)"
                          >
                            {{ t('ocr.defaultParams') }}
                          </Button>
                        </div>
                        <div class="params-list">
                          <div class="param-item">
                            <label>{{ t('ocr.brightness') }}</label>
                            <Slider
                              :model-value="getPreprocessingParams(index).brightness"
                              @update:model-value="
                                (val: number) => updatePreprocessingParam(index, 'brightness', val)
                              "
                              :min="-100"
                              :max="100"
                              :step="1"
                            />
                            <span class="param-value">{{
                              getPreprocessingParams(index).brightness
                            }}</span>
                          </div>
                          <div class="param-item">
                            <label>{{ t('ocr.contrast') }}</label>
                            <Slider
                              :model-value="getPreprocessingParams(index).contrast"
                              @update:model-value="
                                (val: number) => updatePreprocessingParam(index, 'contrast', val)
                              "
                              :min="-100"
                              :max="100"
                              :step="1"
                            />
                            <span class="param-value">{{
                              getPreprocessingParams(index).contrast
                            }}</span>
                          </div>
                          <div class="param-item">
                            <label>{{ t('ocr.saturation') }}</label>
                            <Slider
                              :model-value="getPreprocessingParams(index).saturation"
                              @update:model-value="
                                (val: number) => updatePreprocessingParam(index, 'saturation', val)
                              "
                              :min="-100"
                              :max="100"
                              :step="1"
                            />
                            <span class="param-value">{{
                              getPreprocessingParams(index).saturation
                            }}</span>
                          </div>
                          <div class="param-item">
                            <label>{{ t('ocr.sharpness') }}</label>
                            <Slider
                              :model-value="getPreprocessingParams(index).sharpness"
                              @update:model-value="
                                (val: number) => updatePreprocessingParam(index, 'sharpness', val)
                              "
                              :min="0"
                              :max="100"
                              :step="1"
                            />
                            <span class="param-value">{{
                              getPreprocessingParams(index).sharpness
                            }}</span>
                          </div>
                          <div class="param-item param-item-row">
                            <Checkbox
                              :id="`ocr-grayscale-${index}`"
                              :model-value="getPreprocessingParams(index).grayscale"
                              @update:model-value="
                                (val: boolean) => updatePreprocessingParam(index, 'grayscale', val)
                              "
                            />
                            <label
                              :for="`ocr-grayscale-${index}`"
                              class="param-item-row-label"
                            >
                              {{ t('ocr.grayscale') }}
                            </label>
                          </div>
                          <div class="param-item param-item-row">
                            <Checkbox
                              :id="`ocr-normalize-${index}`"
                              :model-value="getPreprocessingParams(index).normalize"
                              @update:model-value="
                                (val: boolean) => updatePreprocessingParam(index, 'normalize', val)
                              "
                            />
                            <label
                              :for="`ocr-normalize-${index}`"
                              class="param-item-row-label"
                            >
                              {{ t('ocr.normalize') }}
                            </label>
                          </div>
                        </div>
                      </div>
                      <div class="image-actions" v-if="result.recognized">
                        <DropdownMenu v-if="aiFixedTexts.get(index)">
                          <DropdownMenuTrigger as-child>
                            <Button size="sm" variant="outline">
                              {{ t('ocr.copyText') }}
                              <ArrowDown class="ml-1 h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem @click="handleCopyCommand('original', index)">
                              {{ t('ocr.copyOriginalText') }}
                            </DropdownMenuItem>
                            <DropdownMenuItem @click="handleCopyCommand('fixed', index)">
                              {{ t('ocr.copyFixedText') }}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          v-else
                          size="sm"
                          variant="outline"
                          @click="handleCopyText(result.text)"
                        >
                          {{ t('ocr.copyText') }}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          :loading="aiFixing.get(index)"
                          @click="handleAiFix(index)"
                        >
                          <img
                            :src="(themeState.currentTheme as any).AiLogo"
                            alt="AI"
                            class="ai-logo-icon-small"
                          />
                          {{ t('ocr.aiFix') }}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          :loading="recognizingIndex.has(index)"
                          @click="handleReRecognizeSingle(index)"
                        >
                          {{ t('ocr.reRecognize') }}
                        </Button>
                      </div>
                      <div class="image-actions" v-else>
                        <Button
                          size="sm"
                          type="primary"
                          :loading="recognizingIndex.has(index)"
                          @click="handleRecognizeSingle(index)"
                        >
                          {{
                            recognizingIndex.has(index)
                              ? t('ocr.recognizing')
                              : t('ocr.startRecognize')
                          }}
                        </Button>
                      </div>
                    </div>
                    <div class="text-result">
                      <!-- 视图切换 -->
                      <div class="text-result-header" v-if="aiFixedTexts.get(index)">
                        <RadioGroup
                          :model-value="viewModes.get(index) || 'single'"
                          @update:model-value="
                            (val: 'single' | 'diff') => viewModes.set(index, val)
                          "
                          class="flex"
                        >
                          <div
                            class="inline-flex h-8 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground"
                          >
                            <div class="flex items-center">
                              <RadioGroupItem
                                value="single"
                                :id="'view-single-' + index"
                                class="sr-only peer"
                              />
                              <label
                                :for="'view-single-' + index"
                                class="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-sm font-medium ring-offset-background transition-all cursor-pointer peer-data-[state=checked]:bg-background peer-data-[state=checked]:text-foreground peer-data-[state=checked]:shadow"
                              >
                                {{ t('ocr.singleView') }}
                              </label>
                            </div>
                            <div class="flex items-center">
                              <RadioGroupItem
                                value="diff"
                                :id="'view-diff-' + index"
                                class="sr-only peer"
                              />
                              <label
                                :for="'view-diff-' + index"
                                class="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-sm font-medium ring-offset-background transition-all cursor-pointer peer-data-[state=checked]:bg-background peer-data-[state=checked]:text-foreground peer-data-[state=checked]:shadow"
                              >
                                {{ t('ocr.diffView') }}
                              </label>
                            </div>
                          </div>
                        </RadioGroup>
                      </div>
                      <!-- 未识别状态 -->
                      <div
                        class="text-content unrecognized"
                        :style="textContentStyle"
                        v-if="!result.recognized"
                      >
                        <div class="unrecognized-placeholder">
                          <p>{{ t('ocr.notRecognized') }}</p>
                          <p class="hint">{{ t('ocr.clickRecognizeHint') }}</p>
                        </div>
                      </div>
                      <!-- 已识别：单视图或diff视图 -->
                      <div
                        class="text-content"
                        :style="textContentStyle"
                        v-else-if="!aiFixedTexts.get(index) || viewModes.get(index) === 'single'"
                      >
                        <div
                          :ref="(el) => setTextEditorRef(el as HTMLElement | null, index)"
                          class="text-editor-container"
                          :key="`text-editor-${index}-${viewModes.get(index) || 'single'}`"
                        ></div>
                      </div>
                      <!-- 已识别：Diff视图 -->
                      <div class="diff-view-container" v-else-if="viewModes.get(index) === 'diff'">
                        <div class="split-editors">
                          <div class="editor-panel old-panel">
                            <div class="editor-header" :style="editorHeaderStyle">
                              <span class="editor-label">{{ t('ocr.originalText') }}</span>
                            </div>
                            <div
                              :ref="(el) => setOldEditorRef(el as HTMLElement | null, index)"
                              class="monaco-editor-container"
                            ></div>
                          </div>
                          <div class="editor-panel new-panel">
                            <div class="editor-header" :style="editorHeaderStyle">
                              <span class="editor-label">{{ t('ocr.fixedText') }}</span>
                            </div>
                            <div
                              :ref="(el) => setNewEditorRef(el as HTMLElement | null, index)"
                              class="monaco-editor-container"
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </SessionList>
    </div>

    <!-- 图片预览对话框 -->
    <ImagePreviewDialog v-model="imagePreviewVisible" :image-url="previewImageUrl" />

    <!-- Tab 缩略图（固定定位） -->
    <div
      v-if="thumbnailVisible && thumbnailImageUrl"
      class="tab-thumbnail"
      :style="{
        top: thumbnailPosition.top + 'px',
        left: thumbnailPosition.left + 'px'
      }"
    >
      <img :src="thumbnailImageUrl" alt="thumbnail" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

// Demo mode support
const props = defineProps({
  mode: {
    type: String,
    default: 'normal'
  }
})
const isDemo = computed(() => props.mode === 'demo')
import { messageBox } from '@renderer/utils/messageBox'
import { notifySuccess, notifyError, notifyWarning, notifyInfo } from '@renderer/utils/notify'
import { UploadFilled, ArrowDown, Delete } from '@element-plus/icons-vue'
import { Button } from '../components/ui/button'
import { Upload } from '@renderer/components/ui/upload'
import { Slider } from '@renderer/components/ui/slider'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { LoadingOverlay } from '@renderer/components/ui/loading-overlay'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@renderer/components/ui/select'
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from '../components/ui/dropdown-menu'
import SessionList from '../components/common/SessionList.vue'
import ImagePreviewDialog, {
  type ImagePreprocessingParams
} from '../components/common/ImagePreviewDialog.vue'
import type { SessionListItem } from '../components/common/SessionList.vue'
import { ocrSessionsDb, type OcrSession } from '../utils/db/tool-sessions-db'
import { i18n } from '../i18n'
import { themeState } from '../utils/themes'
import { setupMonacoWorker } from '../utils/monaco-worker-config'
import * as monaco from 'monaco-editor'
import { generateOcrFixPrompt } from '../utils/prompts'
import { ai_types, createAiTask } from '../utils/ai_tasks'
import type { AIDialogMessage } from '@/types'
import { computeDiff } from '../utils/agent-tools/diff-tool'
import { useWorkspace } from '../stores/workspace'

const { t } = useI18n()
const workspace = useWorkspace()

const ourTabId = computed(
  () => workspace.tabs.find((tab) => tab.kind === 'tool' && tab.route === '/ocr')?.id ?? null
)

const sessions = ref<SessionListItem[]>([])
const activeSessionId = ref<string | null>(null)
const activeSession = computed(() => {
  if (!activeSessionId.value) return null
  return sessions.value.find((s) => s.id === activeSessionId.value) as any
})

const imageList = ref<any[]>([])
const uploadRef = ref<any>(null)
const selectedLanguages = ref<string[]>(['eng'])
const processing = ref(false)
const loadingSession = ref(false)
const ocrResults = ref<
  Array<{
    imageUrl: string
    text: string
    recognized: boolean
    aiFixedText?: string
    preprocessingParams?: ImagePreprocessingParams
  }>
>([])
const recognizingIndex = ref<Set<number>>(new Set())
const activeTab = ref('image-0')
const imageDataUrlCache = ref<Map<string, string>>(new Map())
const textEditorRefs = ref<Map<number, HTMLElement>>(new Map())
const oldEditorRefs = ref<Map<number, HTMLElement>>(new Map())
const newEditorRefs = ref<Map<number, HTMLElement>>(new Map())
const aiFixedTexts = ref<Map<number, string>>(new Map())
const aiFixing = ref<Map<number, boolean>>(new Map())
const viewModes = ref<Map<number, 'single' | 'diff'>>(new Map())

// 图片预览对话框相关
const imagePreviewVisible = ref(false)
const previewImageUrl = ref<string>('')
const previewImageIndex = ref<number>(-1)
const previewPreprocessingParams = ref<ImagePreprocessingParams>({
  brightness: 0,
  contrast: 0,
  saturation: 0,
  sharpness: 0,
  grayscale: false,
  normalize: false
})
const thumbnailVisible = ref(false)
const thumbnailPosition = ref({ top: 0, left: 0 })
const thumbnailImageUrl = ref<string>('')

// 处理后的图片缓存（每个图片索引对应处理后的 data URL）
const processedImageCache = ref<Map<number, string>>(new Map())

// 编辑器头部样式
const editorHeaderStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  borderColor: borderColor.value
}))

// 生成编辑器容器 ID
const getEditorId = (index: number): string => {
  return `ocr-text-editor-${index}`
}

// 获取Monaco编辑器实例（参考KnowledgeBase.vue的实现）
const getTextEditor = (index: number): monaco.editor.IStandaloneCodeEditor | null => {
  const editorId = getEditorId(index)
  const editors = monaco.editor.getEditors() || []
  const found = editors.find((e) => {
    try {
      const editor = e as monaco.editor.IStandaloneCodeEditor
      const container = editor.getContainerDomNode()
      return container && container.id === editorId
    } catch {
      return false
    }
  })
  return found as monaco.editor.IStandaloneCodeEditor | null
}

const setTextEditorRef = (el: HTMLElement | null, index: number) => {
  if (el) {
    // 设置容器 ID
    el.id = getEditorId(index)
    textEditorRefs.value.set(index, el)
    // 初始化编辑器
    nextTick(() => {
      initTextEditor(index)
    })
  } else {
    // 清理编辑器
    const editor = getTextEditor(index)
    if (editor) {
      editor.dispose()
    }
    textEditorRefs.value.delete(index)
  }
}

// 初始化文本编辑器（参考KnowledgeBase.vue的实现）
const initTextEditor = async (index: number) => {
  // 等待多次 nextTick 确保 DOM 完全渲染
  await nextTick()
  await nextTick()

  const container = textEditorRefs.value.get(index)
  if (!container) {
    console.warn(`编辑器容器 ${index} 未找到`)
    return
  }

  // 检查容器是否可见且有尺寸
  if (container.offsetWidth === 0 || container.offsetHeight === 0) {
    // 如果容器还没有尺寸，延迟初始化
    setTimeout(() => {
      initTextEditor(index)
    }, 100)
    return
  }

  // 确保容器有 ID
  if (!container.id) {
    container.id = getEditorId(index)
  }

  // 检查是否已存在编辑器，先销毁
  const existingEditor = getTextEditor(index)
  if (existingEditor) {
    existingEditor.dispose()
  }

  const result = ocrResults.value[index]
  if (!result) return

  try {
    // 确保Monaco Worker已配置
    setupMonacoWorker()

    // 确定显示的内容：如果有AI修复后的文本且当前是单视图，显示修复后的文本；否则显示原始文本
    const viewMode = viewModes.value.get(index)
    const aiFixedText = aiFixedTexts.value.get(index)
    const displayText = viewMode === 'single' && aiFixedText ? aiFixedText : result.text

    // 创建编辑器
    const isDark = themeState.currentTheme.type === 'dark'
    const editor = monaco.editor.create(container, {
      value: displayText || '',
      language: 'plaintext',
      theme: isDark ? 'vs-dark' : 'vs',
      readOnly: true,
      automaticLayout: true,
      fontSize: 14,
      lineNumbers: 'on',
      wordWrap: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontFamily: "'JetBrains Mono', 'Consolas', monospace"
    })
  } catch (error) {
    console.error('初始化文本编辑器失败:', error)
  }
}

// 更新编辑器内容（参考KnowledgeBase.vue的实现）
const updateEditorContent = (index: number): void => {
  const editor = getTextEditor(index)
  if (editor && ocrResults.value[index]) {
    try {
      // 确定显示的内容：如果有AI修复后的文本且当前是单视图，显示修复后的文本；否则显示原始文本
      const viewMode = viewModes.value.get(index)
      const aiFixedText = aiFixedTexts.value.get(index)
      const displayText =
        viewMode === 'single' && aiFixedText ? aiFixedText : ocrResults.value[index].text

      const currentValue = editor.getValue()
      if (currentValue !== displayText) {
        editor.setValue(displayText || '')
      }
    } catch (error) {
      // 编辑器可能已被销毁，忽略错误
      console.warn(`更新编辑器 ${index} 内容失败:`, error)
    }
  }
}

// 监听OCR结果变化，更新编辑器内容
watch(
  () => ocrResults.value,
  (newResults) => {
    for (let i = 0; i < newResults.length; i++) {
      updateEditorContent(i)
    }
  },
  { deep: true }
)

// 监听活动标签页变化，初始化编辑器
watch(
  () => activeTab.value,
  async (newTab) => {
    if (newTab && newTab.startsWith('image-')) {
      const index = parseInt(newTab.replace('image-', ''))
      await nextTick()
      await nextTick()
      // 延迟初始化，确保容器已渲染
      setTimeout(() => {
        if (textEditorRefs.value.has(index)) {
          initTextEditor(index)
          updateEditorContent(index)
        }
      }, 100)
    }
  }
)

// 监听主题变化，更新所有编辑器主题（参考KnowledgeBase.vue的实现）
watch(
  () => themeState.currentTheme.type,
  (newType) => {
    // 设置全局主题（所有编辑器会自动应用）
    monaco.editor.setTheme(newType === 'dark' ? 'vs-dark' : 'vs')
  }
)

// 清理所有编辑器（参考KnowledgeBase.vue的实现）
onBeforeUnmount(() => {
  // 清理所有存在的编辑器
  ocrResults.value.forEach((_, index) => {
    const editor = getTextEditor(index)
    if (editor) {
      editor.dispose()
    }
    const oldEditor = getOldEditor(index)
    if (oldEditor) {
      oldEditor.dispose()
    }
    const newEditor = getNewEditor(index)
    if (newEditor) {
      newEditor.dispose()
    }
  })
  textEditorRefs.value.clear()
  oldEditorRefs.value.clear()
  newEditorRefs.value.clear()
})

// 同步获取图片data URL（从缓存）
const getImageDataUrlSync = (imagePath: string): string => {
  // 如果已经是data URL，直接返回
  if (
    imagePath.startsWith('data:') ||
    imagePath.startsWith('http://') ||
    imagePath.startsWith('https://')
  ) {
    return imagePath
  }

  // 检查缓存
  if (imageDataUrlCache.value.has(imagePath)) {
    return imageDataUrlCache.value.get(imagePath)!
  }

  // 如果缓存中没有，异步加载
  getImageDataUrl(imagePath).catch((err) => {
    console.error('异步加载图片失败:', err)
  })

  // 返回占位符
  return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2RkZCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE0IiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+5Lit5paH5Zu+54mH5pyq5Yqg6L295paH5Lu2PC90ZXh0Pjwvc3ZnPg=='
}

// 图片加载错误处理
const handleImageError = async (event: Event, imagePath: string) => {
  const img = event.target as HTMLImageElement
  try {
    const dataUrl = await getImageDataUrl(imagePath)
    img.src = dataUrl
  } catch (error) {
    console.error('加载图片失败:', error)
  }
}

// 将本地文件路径转换为data URL（用于Electron中显示图片）
const getImageDataUrl = async (imagePath: string): Promise<string> => {
  // 如果已经是data URL，直接返回
  if (
    imagePath.startsWith('data:') ||
    imagePath.startsWith('http://') ||
    imagePath.startsWith('https://')
  ) {
    return imagePath
  }

  // 检查缓存
  if (imageDataUrlCache.value.has(imagePath)) {
    return imageDataUrlCache.value.get(imagePath)!
  }

  try {
    // 如果是file://协议，提取实际路径
    let localPath = imagePath
    if (imagePath.startsWith('file://')) {
      localPath = imagePath.replace(/^file:\/\//, '')
      // Windows路径处理：file:///C:/path -> C:/path
      if (localPath.startsWith('/') && /^[A-Za-z]:/.test(localPath.substring(1))) {
        localPath = localPath.substring(1)
      }
    }

    // 通过IPC读取文件并转换为base64
    const messageBridge = (await import('../bridge/message-bridge')).default
    if (!messageBridge.getIpc()) {
      throw new Error('IPC渲染器不可用')
    }

    const fileData = (await messageBridge.invoke('read-file-for-upload', localPath)) as {
      name: string
      data: string
      mimeType: string
    }

    // 构建data URL
    const dataUrl = `data:${fileData.mimeType};base64,${fileData.data}`

    // 缓存结果
    imageDataUrlCache.value.set(imagePath, dataUrl)

    return dataUrl
  } catch (error) {
    console.error('转换图片为data URL失败:', error)
    // 返回空字符串或占位符
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2RkZCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE0IiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+5Zu+54mH5pyq5Yqg6L295Lit5paHPC90ZXh0Pjwvc3ZnPg=='
  }
}

// 可用语言包列表
const availableLanguages = [
  { value: 'eng', label: 'English' },
  { value: 'chi_sim', label: '简体中文' },
  { value: 'chi_tra', label: '繁体中文' },
  { value: 'jpn', label: '日本語' },
  { value: 'kor', label: '한국어' },
  { value: 'deu', label: 'Deutsch' },
  { value: 'fra', label: 'Français' },
  { value: 'spa', label: 'Español' },
  { value: 'rus', label: 'Русский' },
  { value: 'por', label: 'Português' }
]

// 窗口迁移后恢复当前选中的会话
watch(
  [() => workspace.activeTabId.value, ourTabId, () => sessions.value],
  () => {
    const tid = ourTabId.value
    if (!tid || workspace.activeTabId.value !== tid || sessions.value.length === 0) return
    const state = workspace.getTabToolState(tid)
    const savedId = state.activeSessionId
    if (!savedId || !sessions.value.some((s) => s.id === savedId)) return
    if (activeSessionId.value === savedId) return
    const item = sessions.value.find((s) => s.id === savedId)!
    activeSessionId.value = savedId
    handleSelectSession(item)
  },
  { immediate: true, deep: true }
)

// 初始化默认语言（eng + 当前语言）
onMounted(() => {
  if (isDemo.value) {
    // Demo mode: use mock data only
    sessions.value = [
      { id: 'demo-1', title: '示例文档识别', updatedAt: Date.now() },
      { id: 'demo-2', title: '书籍扫描', updatedAt: Date.now() - 3600000 }
    ]
    activeSessionId.value = 'demo-1'
    return
  }
  const locale = (i18n.global.locale as any).value || 'zh_CN'
  const localeMap: Record<string, string> = {
    zh_CN: 'chi_sim',
    zh_TW: 'chi_tra',
    ja_JP: 'jpn',
    ko_KR: 'kor',
    de_DE: 'deu',
    fr_FR: 'fra',
    es_ES: 'spa',
    ru_RU: 'rus',
    pt_PT: 'por'
  }

  const currentLang = localeMap[locale] || 'eng'
  if (currentLang !== 'eng') {
    selectedLanguages.value = ['eng', currentLang]
  }

  loadSessions()
})

// 加载会话列表
const loadSessions = async () => {
  try {
    const dbSessions = await ocrSessionsDb.getAll()
    sessions.value = dbSessions.map((s) => ({
      id: s.id,
      title: s.title,
      updatedAt: s.updated_at
    }))
  } catch (error) {
    notifyError('加载会话列表失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 创建新会话
const handleCreateSession = async () => {
  try {
    const id = `ocr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const title = t('ocr.defaultTitle')

    await ocrSessionsDb.create({
      id,
      title,
      description: '',
      images: JSON.stringify([]),
      ocr_languages: JSON.stringify(selectedLanguages.value),
      ocr_results: undefined
    })

    await loadSessions()
    activeSessionId.value = id
    const tid = ourTabId.value
    if (tid) workspace.setTabToolState(tid, { activeSessionId: id })
    imageList.value = []
    ocrResults.value = []
    // 清空所有状态
    aiFixedTexts.value.clear()
    viewModes.value.clear()
    recognizingIndex.value.clear()
    processedImageCache.value.clear()
  } catch (error) {
    notifyError('创建会话失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 选择会话
const handleSelectSession = async (item: SessionListItem) => {
  // 如果正在加载，忽略新的切换请求
  if (loadingSession.value) {
    return
  }

  loadingSession.value = true

  try {
    // 先清空所有状态，避免旧数据残留
    aiFixedTexts.value.clear()
    viewModes.value.clear()
    recognizingIndex.value.clear()
    processedImageCache.value.clear()

    // 清理所有编辑器
    textEditorRefs.value.forEach((_, index) => {
      const editor = getTextEditor(index)
      if (editor) {
        editor.dispose()
      }
    })
    textEditorRefs.value.clear()

    oldEditorRefs.value.forEach((_, index) => {
      const editor = getOldEditor(index)
      if (editor) {
        editor.dispose()
      }
    })
    oldEditorRefs.value.clear()

    newEditorRefs.value.forEach((_, index) => {
      const editor = getNewEditor(index)
      if (editor) {
        editor.dispose()
      }
    })
    newEditorRefs.value.clear()

    activeSessionId.value = item.id
    const tid = ourTabId.value
    if (tid) workspace.setTabToolState(tid, { activeSessionId: item.id })
    const session = await ocrSessionsDb.getById(item.id)
    if (session) {
      if (session.images) {
        const images = JSON.parse(session.images)
        imageList.value = images.map((img: string, index: number) => {
          // 确保图片路径使用file://协议
          let imageUrl = img
          if (
            img &&
            !img.startsWith('file://') &&
            !img.startsWith('http://') &&
            !img.startsWith('https://') &&
            !img.startsWith('data:')
          ) {
            imageUrl = img.replace(/\\/g, '/')
            if (!imageUrl.startsWith('/')) {
              imageUrl = '/' + imageUrl
            }
            imageUrl = 'file://' + imageUrl
          }
          return {
            name: img.split(/[/\\]/).pop() || `image-${index}`,
            url: imageUrl,
            path: img,
            uid: Date.now() + index, // 生成唯一ID
            status: 'success' as const
          }
        })
      }
      if (session.ocr_languages) {
        selectedLanguages.value = JSON.parse(session.ocr_languages)
      }
      if (session.ocr_results) {
        const parsedResults = JSON.parse(session.ocr_results)
        ocrResults.value = parsedResults.map((r: any) => ({
          ...r,
          recognized: r.recognized !== undefined ? r.recognized : !!r.text,
          // 确保预处理参数被正确保留（如果存在）
          preprocessingParams: r.preprocessingParams || undefined
        }))

        // 恢复AI修复后的文本和视图模式
        parsedResults.forEach((r: any, index: number) => {
          if (r.aiFixedText) {
            aiFixedTexts.value.set(index, r.aiFixedText)
            // 如果有AI修复后的文本，默认使用diff视图
            if (!viewModes.value.has(index)) {
              viewModes.value.set(index, 'diff')
            }
          }
        })

        // 等待DOM更新后初始化编辑器
        await nextTick()
        await nextTick()

        // 初始化当前活动标签页的编辑器
        if (ocrResults.value.length > 0) {
          const currentIndex = activeTab.value.startsWith('image-')
            ? parseInt(activeTab.value.replace('image-', ''))
            : 0
          if (ocrResults.value[currentIndex] && ocrResults.value[currentIndex].recognized) {
            // 延迟初始化，确保容器已渲染
            setTimeout(() => {
              const viewMode = viewModes.value.get(currentIndex) || 'single'
              if (viewMode === 'single' && textEditorRefs.value.has(currentIndex)) {
                initTextEditor(currentIndex)
              } else if (viewMode === 'diff') {
                initDiffEditors(currentIndex)
              }
            }, 300)
          }
        }
      } else {
        // 如果没有结果，但有图片，创建未识别的结果
        if (imageList.value.length > 0) {
          ocrResults.value = imageList.value.map((img) => {
            const imageUrl = img.url || img.path
            const url = imageUrl.startsWith('file://')
              ? imageUrl
              : imageUrl.replace(/\\/g, '/').startsWith('/')
                ? 'file://' + imageUrl.replace(/\\/g, '/')
                : 'file:///' + imageUrl.replace(/\\/g, '/')
            return {
              imageUrl: url,
              text: '',
              recognized: false
            }
          })
        } else {
          // 如果没有图片也没有结果，清空结果
          ocrResults.value = []
        }
      }
    }
  } catch (error) {
    notifyError('加载会话失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    loadingSession.value = false
  }
}

// 重命名会话
const handleRenameSession = async (item: SessionListItem, newTitle: string) => {
  try {
    await ocrSessionsDb.update(item.id, { title: newTitle })
    await loadSessions()
  } catch (error) {
    notifyError('重命名失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 复制会话
const handleDuplicateSession = async (item: SessionListItem) => {
  try {
    const session = await ocrSessionsDb.getById(item.id)
    if (!session) return

    const id = `ocr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    await ocrSessionsDb.create({
      id,
      title: session.title + ' (副本)',
      description: session.description,
      images: session.images,
      ocr_languages: session.ocr_languages,
      ocr_results: session.ocr_results
    })

    await loadSessions()
    notifySuccess(t('common.duplicateSuccess'))
  } catch (error) {
    notifyError('复制失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 删除会话
const handleDeleteSession = async (item: SessionListItem) => {
  try {
    await ocrSessionsDb.delete(item.id)
    await loadSessions()
    if (activeSessionId.value === item.id) {
      activeSessionId.value = null
      imageList.value = []
      ocrResults.value = []
    }
    notifySuccess(t('common.deleteSuccess'))
  } catch (error) {
    notifyError('删除失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 图片变化
const handleImageChange = async (file: any, fileList: any[]) => {
  // 防止递归调用：只在有新文件上传时处理
  if (!file.raw) {
    // 如果不是新上传的文件，只同步fileList到imageList，不保存
    imageList.value = fileList.map((f) => ({
      name: f.name,
      url: f.url || f.path,
      path: f.path || f.url,
      uid: f.uid,
      status: f.status || ('success' as const)
    }))
    return
  }

  if (!activeSessionId.value) {
    await handleCreateSession()
  }

  try {
    // 新上传的图片，保存到reference目录
    const fileContent = await file.raw.arrayBuffer()
    // 使用分块处理大文件，避免栈溢出
    const uint8Array = new Uint8Array(fileContent)
    const chunkSize = 8192 // 8KB chunks
    let base64 = ''
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize)
      base64 += String.fromCharCode.apply(null, Array.from(chunk))
    }
    base64 = btoa(base64)

    const messageBridge = (await import('../bridge/message-bridge')).default
    if (!messageBridge.getIpc()) {
      throw new Error('IPC渲染器不可用')
    }

    const filePath = (await messageBridge.invoke('save-reference-file', {
      filename: file.name,
      content: base64
    })) as string

    if (activeSessionId.value && filePath) {
      // 更新imageList，使用fileList但替换新文件的路径
      const updatedFileList = fileList.map((f) => {
        if (f.uid === file.uid) {
          return {
            ...f,
            url: filePath,
            path: filePath
          }
        }
        return f
      })

      imageList.value = updatedFileList.map((f) => ({
        name: f.name,
        url: f.url || f.path,
        path: f.path || f.url,
        uid: f.uid,
        status: 'success' as const
      }))

      // 同步更新 ocrResults，确保新上传的图片有对应的结果项
      const newImages = imageList.value
      const currentOcrResults = ocrResults.value

      // 如果 ocrResults 长度小于 imageList，需要添加新的结果项
      if (currentOcrResults.length < newImages.length) {
        const missingCount = newImages.length - currentOcrResults.length
        for (let i = 0; i < missingCount; i++) {
          const imgIndex = currentOcrResults.length + i
          const img = newImages[imgIndex]
          if (img) {
            const imageUrl = img.url || img.path
            const url = imageUrl.startsWith('file://')
              ? imageUrl
              : imageUrl.replace(/\\/g, '/').startsWith('/')
                ? 'file://' + imageUrl.replace(/\\/g, '/')
                : 'file:///' + imageUrl.replace(/\\/g, '/')
            ocrResults.value.push({
              imageUrl: url,
              text: '',
              recognized: false
              // 新上传的图片默认没有预处理参数
            })
          }
        }
      }

      // 保存到数据库
      const currentImages = imageList.value.map((img) => img.url || img.path).filter(Boolean)
      await ocrSessionsDb.update(activeSessionId.value, {
        images: JSON.stringify(currentImages),
        ocr_results: JSON.stringify(ocrResults.value)
      })
    }
  } catch (error) {
    notifyError('保存图片失败: ' + (error instanceof Error ? error.message : String(error)))
    // 如果保存失败，从fileList中移除这个文件
    imageList.value = fileList
      .filter((f) => f.uid !== file.uid)
      .map((f) => ({
        name: f.name,
        url: f.url || f.path,
        path: f.path || f.url,
        uid: f.uid,
        status: f.status || ('success' as const)
      }))
  }
}

const handleImageRemove = async (file: any) => {
  if (activeSessionId.value) {
    const currentImages = imageList.value
      .filter((img) => img.uid !== file.uid)
      .map((img) => img.url || img.path)
      .filter(Boolean)

    await ocrSessionsDb.update(activeSessionId.value, {
      images: JSON.stringify(currentImages)
    })
  }
}

// 从剪切板粘贴
const handlePasteFromClipboard = async () => {
  try {
    if (!activeSessionId.value) {
      await handleCreateSession()
    }

    // 读取剪切板图片
    const messageBridge = (await import('../bridge/message-bridge')).default
    if (!messageBridge.getIpc()) {
      throw new Error('IPC渲染器不可用')
    }

    const clipboardImage = (await messageBridge.invoke('read-clipboard-image')) as string | null
    if (!clipboardImage) {
      notifyWarning(t('ocr.noClipboardImage'))
      return
    }

    // 提取 base64 内容（处理可能包含 data:image/png;base64, 前缀的情况）
    let base64Content = clipboardImage
    if (clipboardImage.includes(',')) {
      base64Content = clipboardImage.split(',')[1]
    } else if (clipboardImage.startsWith('data:')) {
      // 如果包含 data: 但没有逗号，可能是格式问题
      base64Content = clipboardImage.replace(/^data:image\/[^;]+;base64,/, '')
    }

    // 保存图片到临时目录
    const timestamp = Date.now()
    const filePath = (await messageBridge.invoke('save-reference-file', {
      filename: `clipboard-${timestamp}.png`,
      content: base64Content
    })) as string

    if (!filePath) {
      throw new Error('保存图片失败')
    }

    // 添加到图片列表（使用与 handleImageChange 相同的格式）
    // 注意：el-upload 需要特定的文件格式，包括 status 属性
    const newImage = {
      name: `clipboard-${timestamp}.png`,
      url: filePath,
      path: filePath,
      uid: timestamp,
      status: 'success' as const
    }

    // 使用响应式方式添加 - 确保创建新数组以触发响应式更新
    const updatedList = [...imageList.value]
    updatedList.push(newImage)
    imageList.value = updatedList

    // 立即添加到结果列表（未识别状态）
    const imageUrl = filePath.startsWith('file://')
      ? filePath
      : filePath.replace(/\\/g, '/').startsWith('/')
        ? 'file://' + filePath.replace(/\\/g, '/')
        : 'file:///' + filePath.replace(/\\/g, '/')

    ocrResults.value.push({
      imageUrl: imageUrl,
      text: '',
      recognized: false
    })

    // 切换到新添加的标签
    activeTab.value = `image-${ocrResults.value.length - 1}`

    // 更新数据库
    if (activeSessionId.value) {
      const currentImages = imageList.value.map((img) => img.url || img.path).filter(Boolean)
      await ocrSessionsDb.update(activeSessionId.value, {
        images: JSON.stringify(currentImages)
      })
    }

    // 确保 UI 更新
    await nextTick()

    // 验证图片是否成功添加到列表
    const addedImage = imageList.value.find((img) => img.uid === timestamp)
    if (!addedImage) {
      console.error('图片添加失败，未在列表中找到')
      notifyError('图片添加失败，请重试')
      return
    }

    console.log('粘贴图片成功，当前图片列表长度:', imageList.value.length, '图片:', addedImage)
    notifySuccess(t('ocr.pasteSuccess'))
  } catch (error) {
    console.error('粘贴失败:', error)
    notifyError('粘贴失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 识别单张图片
const handleRecognizeSingle = async (index: number) => {
  if (!activeSessionId.value) {
    notifyWarning(t('ocr.noSession'))
    return
  }

  if (selectedLanguages.value.length === 0) {
    notifyWarning(t('ocr.noLanguages'))
    return
  }

  const result = ocrResults.value[index]
  if (!result || result.recognized) {
    return
  }

  recognizingIndex.value.add(index)

  try {
    // 找到对应的图片
    const image = imageList.value[index]
    if (!image) {
      throw new Error('找不到对应的图片')
    }

    // 优先使用 path（实际文件路径），如果没有则使用 url
    let imagePath = image.path || image.url
    if (!imagePath) {
      throw new Error('图片路径为空')
    }

    // 如果是 file:// 协议，需要转换为实际路径（OCR 需要实际路径）
    if (imagePath.startsWith('file://')) {
      imagePath = imagePath.replace(/^file:\/\//, '')
      // Windows路径处理：file:///C:/path -> C:/path
      if (imagePath.startsWith('/') && /^[A-Za-z]:/.test(imagePath.substring(1))) {
        imagePath = imagePath.substring(1)
      }
    }

    const messageBridge = (await import('../bridge/message-bridge')).default
    if (!messageBridge.getIpc()) {
      throw new Error('IPC渲染器不可用')
    }

    // 确保languages是数组格式，且只传递字符串数组（可序列化）
    const languages = Array.isArray(selectedLanguages.value)
      ? [...selectedLanguages.value] // 创建新数组避免引用问题
      : []

    // 获取预处理参数，确保是可序列化的纯对象
    const preprocessingParams = result.preprocessingParams
      ? {
          brightness: Number(result.preprocessingParams.brightness) || 0,
          contrast: Number(result.preprocessingParams.contrast) || 0,
          saturation: Number(result.preprocessingParams.saturation) || 0,
          sharpness: Number(result.preprocessingParams.sharpness) || 0,
          grayscale: Boolean(result.preprocessingParams.grayscale) || false,
          normalize: Boolean(result.preprocessingParams.normalize) || false
        }
      : undefined

    const ocrText = (await messageBridge.invoke('ocr-recognize-file', {
      imagePath: String(imagePath), // 确保是字符串，使用实际路径
      languages: languages, // 传递可序列化的数组
      preprocessingParams: preprocessingParams // 传递可序列化的预处理参数
    })) as string

    // 更新结果（保留AI修复后的文本）
    const existingAiFixedText = result.aiFixedText || aiFixedTexts.value.get(index)
    ocrResults.value[index] = {
      ...result,
      text: ocrText,
      recognized: true,
      aiFixedText: existingAiFixedText, // 保留AI修复后的内容
      preprocessingParams: preprocessingParams // 保留预处理参数
    }

    // 保存结果到数据库
    await ocrSessionsDb.update(activeSessionId.value, {
      ocr_results: JSON.stringify(ocrResults.value),
      ocr_languages: JSON.stringify(selectedLanguages.value)
    })

    // 更新编辑器
    await nextTick()
    updateEditorContent(index)

    notifySuccess(t('ocr.recognizeSuccess'))
  } catch (error) {
    console.error(`图片 ${index + 1} OCR 失败:`, error)
    notifyError(`识别失败: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    recognizingIndex.value.delete(index)
  }
}

// 重新识别单张图片（不会覆盖AI修复后的内容）
const handleReRecognizeSingle = async (index: number) => {
  if (!activeSessionId.value) {
    notifyWarning(t('ocr.noSession'))
    return
  }

  if (selectedLanguages.value.length === 0) {
    notifyWarning(t('ocr.noLanguages'))
    return
  }

  const result = ocrResults.value[index]
  if (!result) {
    return
  }

  recognizingIndex.value.add(index)

  try {
    // 找到对应的图片
    const image = imageList.value[index]
    if (!image) {
      throw new Error('找不到对应的图片')
    }

    // 优先使用 path（实际文件路径），如果没有则使用 url
    let imagePath = image.path || image.url
    if (!imagePath) {
      throw new Error('图片路径为空')
    }

    // 如果是 file:// 协议，需要转换为实际路径（OCR 需要实际路径）
    if (imagePath.startsWith('file://')) {
      imagePath = imagePath.replace(/^file:\/\//, '')
      // Windows路径处理：file:///C:/path -> C:/path
      if (imagePath.startsWith('/') && /^[A-Za-z]:/.test(imagePath.substring(1))) {
        imagePath = imagePath.substring(1)
      }
    }

    const messageBridge = (await import('../bridge/message-bridge')).default
    if (!messageBridge.getIpc()) {
      throw new Error('IPC渲染器不可用')
    }

    // 确保languages是数组格式，且只传递字符串数组（可序列化）
    const languages = Array.isArray(selectedLanguages.value)
      ? [...selectedLanguages.value] // 创建新数组避免引用问题
      : []

    // 获取预处理参数，确保是可序列化的纯对象
    const preprocessingParams = result.preprocessingParams
      ? {
          brightness: Number(result.preprocessingParams.brightness) || 0,
          contrast: Number(result.preprocessingParams.contrast) || 0,
          saturation: Number(result.preprocessingParams.saturation) || 0,
          sharpness: Number(result.preprocessingParams.sharpness) || 0,
          grayscale: Boolean(result.preprocessingParams.grayscale) || false,
          normalize: Boolean(result.preprocessingParams.normalize) || false
        }
      : undefined

    const ocrText = (await messageBridge.invoke('ocr-recognize-file', {
      imagePath: String(imagePath), // 确保是字符串，使用实际路径
      languages: languages, // 传递可序列化的数组
      preprocessingParams: preprocessingParams // 传递可序列化的预处理参数
    })) as string

    // 只更新原始OCR文本，保留AI修复后的内容和预处理参数
    const existingAiFixedText = result.aiFixedText || aiFixedTexts.value.get(index)
    const existingPreprocessingParams = result.preprocessingParams || undefined
    ocrResults.value[index] = {
      ...result,
      text: ocrText,
      recognized: true,
      aiFixedText: existingAiFixedText, // 保留AI修复后的内容
      preprocessingParams: existingPreprocessingParams // 保留预处理参数
    }
    // 注意：不清除 aiFixedTexts.value.get(index)，保留AI修复后的内容

    // 保存结果到数据库
    await ocrSessionsDb.update(activeSessionId.value, {
      ocr_results: JSON.stringify(ocrResults.value),
      ocr_languages: JSON.stringify(selectedLanguages.value)
    })

    // 更新编辑器（只更新原始文本编辑器，不更新AI修复的编辑器）
    await nextTick()
    updateEditorContent(index)

    // 如果当前是diff视图，更新原始文本编辑器
    const viewMode = viewModes.value.get(index)
    if (viewMode === 'diff') {
      const oldEditor = getOldEditor(index)
      if (oldEditor) {
        oldEditor.setValue(ocrText)
      }
    }

    notifySuccess(t('ocr.reRecognizeSuccess'))
  } catch (error) {
    console.error(`图片 ${index + 1} 重新识别失败:`, error)
    notifyError(`重新识别失败: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    recognizingIndex.value.delete(index)
  }
}

// 执行OCR（批量识别所有未识别的图片）
const handleOcr = async () => {
  if (!activeSessionId.value || ocrResults.value.length === 0) {
    notifyWarning(t('ocr.noImages'))
    return
  }

  if (selectedLanguages.value.length === 0) {
    notifyWarning(t('ocr.noLanguages'))
    return
  }

  // 找到所有未识别的图片
  const unrecognizedIndices = ocrResults.value
    .map((r, i) => (!r.recognized ? i : -1))
    .filter((i) => i !== -1)

  if (unrecognizedIndices.length === 0) {
    notifyInfo(t('ocr.allRecognized'))
    return
  }

  processing.value = true

  try {
    const messageBridge = (await import('../bridge/message-bridge')).default
    if (!messageBridge.getIpc()) {
      throw new Error('IPC渲染器不可用')
    }

    // 确保languages是数组格式，且只传递字符串数组（可序列化）
    const languages = Array.isArray(selectedLanguages.value)
      ? [...selectedLanguages.value] // 创建新数组避免引用问题
      : []

    // 对每张未识别的图片进行OCR
    for (const index of unrecognizedIndices) {
      recognizingIndex.value.add(index)

      try {
        const result = ocrResults.value[index]
        const image = imageList.value[index]

        if (!image) {
          console.warn(`图片 ${index + 1} 不存在，跳过`)
          continue
        }

        // 优先使用 path（实际文件路径），如果没有则使用 url
        let imagePath = image.path || image.url
        if (!imagePath) {
          console.warn(`图片 ${index + 1} 路径为空，跳过`)
          continue
        }

        // 如果是 file:// 协议，需要转换为实际路径（OCR 需要实际路径）
        if (imagePath.startsWith('file://')) {
          imagePath = imagePath.replace(/^file:\/\//, '')
          // Windows路径处理：file:///C:/path -> C:/path
          if (imagePath.startsWith('/') && /^[A-Za-z]:/.test(imagePath.substring(1))) {
            imagePath = imagePath.substring(1)
          }
        }

        // 获取预处理参数，确保是可序列化的纯对象
        const preprocessingParams = result.preprocessingParams
          ? {
              brightness: Number(result.preprocessingParams.brightness) || 0,
              contrast: Number(result.preprocessingParams.contrast) || 0,
              saturation: Number(result.preprocessingParams.saturation) || 0,
              sharpness: Number(result.preprocessingParams.sharpness) || 0,
              grayscale: Boolean(result.preprocessingParams.grayscale) || false,
              normalize: Boolean(result.preprocessingParams.normalize) || false
            }
          : undefined

        const ocrText = (await messageBridge.invoke('ocr-recognize-file', {
          imagePath: String(imagePath), // 确保是字符串，使用实际路径
          languages: languages, // 传递可序列化的数组
          preprocessingParams: preprocessingParams // 传递可序列化的预处理参数
        })) as string

        // 更新结果（保留AI修复后的文本）
        const existingAiFixedText = result.aiFixedText || aiFixedTexts.value.get(index)
        ocrResults.value[index] = {
          ...result,
          text: ocrText,
          recognized: true,
          aiFixedText: existingAiFixedText, // 保留AI修复后的内容
          preprocessingParams: preprocessingParams // 保留预处理参数
        }

        // 更新编辑器
        await nextTick()
        updateEditorContent(index)

        console.log(`图片 ${index + 1} OCR 成功`)
      } catch (error) {
        console.error(`图片 ${index + 1} OCR 失败:`, error)
        notifyWarning(
          `图片 ${index + 1} OCR 识别失败: ${error instanceof Error ? error.message : String(error)}`
        )
      } finally {
        recognizingIndex.value.delete(index)
      }
    }

    // 保存结果到数据库
    await ocrSessionsDb.update(activeSessionId.value, {
      ocr_results: JSON.stringify(ocrResults.value),
      ocr_languages: JSON.stringify(selectedLanguages.value)
    })

    notifySuccess(t('ocr.ocrSuccess'))
  } catch (error) {
    notifyError('OCR识别失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    processing.value = false
  }
}

// 删除图片
const handleDeleteImage = async (index: number) => {
  try {
    // 显示确认对话框
    await messageBox.confirm(
      t('ocr.deleteConfirm', { defaultValue: '确定要删除这张图片吗？' }),
      t('ocr.deleteTitle', { defaultValue: '删除图片' }),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      }
    )

    // 从结果列表中移除
    ocrResults.value.splice(index, 1)

    // 从图片列表中移除
    if (imageList.value[index]) {
      imageList.value.splice(index, 1)
    }

    // 清理相关的编辑器
    const textEditor = getTextEditor(index)
    if (textEditor) {
      textEditor.dispose()
    }
    const oldEditor = getOldEditor(index)
    if (oldEditor) {
      oldEditor.dispose()
    }
    const newEditor = getNewEditor(index)
    if (newEditor) {
      newEditor.dispose()
    }

    // 清理引用
    textEditorRefs.value.delete(index)
    oldEditorRefs.value.delete(index)
    newEditorRefs.value.delete(index)
    aiFixedTexts.value.delete(index)
    aiFixing.value.delete(index)
    viewModes.value.delete(index)
    recognizingIndex.value.delete(index)
    processedImageCache.value.delete(index)

    // 重新索引（因为删除了一个元素，后面的索引都要减1）
    // 这里简化处理，直接清理所有编辑器，让它们重新初始化
    textEditorRefs.value.clear()
    oldEditorRefs.value.clear()
    newEditorRefs.value.clear()

    // 切换到第一个标签（如果还有的话）
    if (ocrResults.value.length > 0) {
      activeTab.value = 'image-0'
    }

    // 更新数据库
    if (activeSessionId.value) {
      const currentImages = imageList.value.map((img) => img.url || img.path).filter(Boolean)
      await ocrSessionsDb.update(activeSessionId.value, {
        images: JSON.stringify(currentImages),
        ocr_results: JSON.stringify(ocrResults.value)
      })
    }

    notifySuccess(t('ocr.deleteSuccess'))
  } catch (error) {
    // 用户取消删除
    if (error === 'cancel' || (error as any)?.action === 'cancel') {
      return
    }
    console.error('删除图片失败:', error)
    notifyError('删除图片失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 复制文本
const handleCopyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    notifySuccess(t('ocr.copySuccess'))
  } catch (error) {
    notifyError('复制失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 处理复制命令（下拉菜单）
const handleCopyCommand = async (command: string, index: number) => {
  const result = ocrResults.value[index]
  if (!result) return

  if (command === 'original') {
    await handleCopyText(result.text)
  } else if (command === 'fixed') {
    const fixedText = aiFixedTexts.value.get(index)
    if (fixedText) {
      await handleCopyText(fixedText)
    }
  }
}

// Tab hover 处理
const handleTabHover = async (e: MouseEvent, index: number) => {
  if (!imageList.value[index]) return

  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()

  thumbnailPosition.value = {
    top: rect.bottom + 8,
    left: rect.left
  }

  const imageUrl = imageList.value[index].url || imageList.value[index].path
  thumbnailImageUrl.value = getImageDataUrlSync(imageUrl)
  thumbnailVisible.value = true
}

// Tab leave 处理
const handleTabLeave = () => {
  thumbnailVisible.value = false
}

// 图片点击处理
const handleImageClick = async (imageUrl: string, index: number) => {
  try {
    // 获取预处理后的图片 URL（使用处理后的图片）
    const processedUrl = getProcessedImageUrl(index)

    // 如果有缓存，直接使用；否则等待处理完成
    if (processedImageCache.value.has(index)) {
      previewImageUrl.value = processedImageCache.value.get(index)!
    } else {
      // 先显示原始图片，然后异步处理
      const originalUrl = await getImageDataUrl(imageUrl)
      previewImageUrl.value = originalUrl

      // 异步处理图片
      await applyPreprocessingToImage(index)
      if (processedImageCache.value.has(index)) {
        previewImageUrl.value = processedImageCache.value.get(index)!
      }
    }

    previewImageIndex.value = index

    // 加载该图片的预处理参数
    const result = ocrResults.value[index]
    if (result?.preprocessingParams) {
      previewPreprocessingParams.value = { ...result.preprocessingParams }
    } else {
      previewPreprocessingParams.value = {
        brightness: 0,
        contrast: 0,
        saturation: 0,
        sharpness: 0,
        grayscale: false,
        normalize: false
      }
    }

    imagePreviewVisible.value = true
  } catch (error) {
    console.error('打开图片预览失败:', error)
    notifyError('打开图片预览失败')
  }
}

// 获取预处理参数（带默认值）
const getPreprocessingParams = (index: number): ImagePreprocessingParams => {
  const result = ocrResults.value[index]
  if (result?.preprocessingParams) {
    return { ...result.preprocessingParams }
  }
  return {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    sharpness: 0,
    grayscale: false,
    normalize: false
  }
}

// 更新预处理参数
const updatePreprocessingParam = async (
  index: number,
  key: keyof ImagePreprocessingParams,
  value: number | boolean
) => {
  if (!ocrResults.value[index]) {
    return
  }

  const currentParams = getPreprocessingParams(index)
  const newParams: ImagePreprocessingParams = {
    ...currentParams,
    [key]: value
  }

  ocrResults.value[index] = {
    ...ocrResults.value[index],
    preprocessingParams: newParams
  }

  // 立即应用预处理并更新图片
  await applyPreprocessingToImage(index)

  // 保存到数据库
  if (activeSessionId.value) {
    ocrSessionsDb
      .update(activeSessionId.value, {
        ocr_results: JSON.stringify(ocrResults.value)
      })
      .catch((err) => {
        console.error('保存预处理参数失败:', err)
      })
  }
}

// 重置预处理参数
const resetPreprocessingParams = async (index: number) => {
  const defaultParams: ImagePreprocessingParams = {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    sharpness: 0,
    grayscale: false,
    normalize: false
  }

  if (!ocrResults.value[index]) {
    return
  }

  ocrResults.value[index] = {
    ...ocrResults.value[index],
    preprocessingParams: defaultParams
  }

  // 清除缓存并重新处理
  processedImageCache.value.delete(index)
  await applyPreprocessingToImage(index)

  // 保存到数据库
  if (activeSessionId.value) {
    ocrSessionsDb
      .update(activeSessionId.value, {
        ocr_results: JSON.stringify(ocrResults.value)
      })
      .catch((err) => {
        console.error('保存预处理参数失败:', err)
      })
  }
}

// 分析图片特征
const analyzeImageCharacteristics = async (
  index: number
): Promise<{
  averageBrightness: number // 0-255
  contrast: number // 0-1
  saturation: number // 0-1
  clarity: number // 0-1 (基于边缘检测)
}> => {
  const result = ocrResults.value[index]
  if (!result) {
    throw new Error('图片不存在')
  }

  try {
    // 获取原始图片 URL
    const originalImageUrl = await getImageDataUrl(result.imageUrl)

    // 加载原始图片
    const img = new Image()
    img.crossOrigin = 'anonymous'

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = reject
      img.src = originalImageUrl
    })

    // 创建 Canvas
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('无法创建 Canvas 上下文')
    }

    // 绘制原始图片
    ctx.drawImage(img, 0, 0)

    // 获取图像数据
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data

    // 计算平均亮度
    let totalBrightness = 0
    let minBrightness = 255
    let maxBrightness = 0

    // 计算饱和度和对比度
    let totalSaturation = 0
    let pixelCount = 0

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]

      // 计算亮度（使用加权平均）
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b
      totalBrightness += brightness
      minBrightness = Math.min(minBrightness, brightness)
      maxBrightness = Math.max(maxBrightness, brightness)

      // 计算饱和度
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const saturation = max === 0 ? 0 : (max - min) / max
      totalSaturation += saturation

      pixelCount++
    }

    const averageBrightness = totalBrightness / pixelCount
    const contrast = (maxBrightness - minBrightness) / 255
    const avgSaturation = totalSaturation / pixelCount

    // 计算清晰度（基于拉普拉斯算子的方差）
    let claritySum = 0
    let clarityCount = 0
    const laplacianKernel = [
      [0, -1, 0],
      [-1, 4, -1],
      [0, -1, 0]
    ]

    for (let y = 1; y < canvas.height - 1; y++) {
      for (let x = 1; x < canvas.width - 1; x++) {
        let laplacian = 0
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * canvas.width + (x + kx)) * 4
            const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
            laplacian += gray * laplacianKernel[ky + 1][kx + 1]
          }
        }
        claritySum += Math.abs(laplacian)
        clarityCount++
      }
    }

    const clarity = Math.min(1, claritySum / clarityCount / 255)

    return {
      averageBrightness,
      contrast,
      saturation: avgSaturation,
      clarity
    }
  } catch (error) {
    console.error('分析图片特征失败:', error)
    // 返回默认值
    return {
      averageBrightness: 128,
      contrast: 0.5,
      saturation: 0.5,
      clarity: 0.5
    }
  }
}

// 根据图片特征生成推荐参数
const generateRecommendedParams = (characteristics: {
  averageBrightness: number
  contrast: number
  saturation: number
  clarity: number
}): ImagePreprocessingParams => {
  const { averageBrightness, contrast, saturation, clarity } = characteristics

  // 亮度标准化：将图片亮度调整到标准值（约 60，适合OCR的亮度）
  // 计算需要调整的亮度值
  const targetBrightness = 60
  const brightnessDiff = targetBrightness - averageBrightness
  // 将差值转换为亮度调整值（-100 到 100）
  // 如果图片太暗，需要增加亮度；如果太亮，需要降低亮度
  const brightness = Math.max(-50, Math.min(50, brightnessDiff * 0.5))

  // 对比度调整：始终增强对比度，让文字更明显
  // 基础对比度增强 + 根据原图对比度调整
  let contrastAdjust = 30 // 基础增强
  if (contrast < 0.4) {
    // 对比度很低，需要大幅增强
    contrastAdjust = 40 + (0.4 - contrast) * 30
  } else if (contrast < 0.6) {
    // 对比度中等，适度增强
    contrastAdjust = 30 + (0.6 - contrast) * 20
  } else {
    // 对比度已经较高，保持基础增强
    contrastAdjust = 25
  }
  contrastAdjust = Math.min(60, contrastAdjust) // 限制最大值

  // 饱和度调整：保持原图饱和度，不刻意降低
  const saturationAdjust = 0

  // 锐化调整：始终增强锐化，让文字边缘更清晰
  // 基础锐化 + 根据清晰度调整
  let sharpness = 15 // 基础锐化值
  if (clarity < 0.4) {
    // 图片模糊，需要更多锐化
    sharpness = 20 + (0.4 - clarity) * 30
  } else if (clarity < 0.6) {
    // 清晰度中等，适度锐化
    sharpness = 15 + (0.6 - clarity) * 15
  } else {
    // 已经很清晰，保持基础锐化
    sharpness = 12
  }
  sharpness = Math.min(35, sharpness) // 限制最大值，避免过度锐化

  // 归一化：默认不启用
  const normalize = false

  return {
    brightness: Math.round(brightness),
    contrast: Math.round(contrastAdjust),
    saturation: Math.round(saturationAdjust),
    sharpness: Math.round(sharpness),
    grayscale: false, // 默认不进行灰度化
    normalize
  }
}

// 应用推荐预处理参数（根据图片特征动态生成）
const applyDefaultPreprocessingParams = async (index: number) => {
  if (!ocrResults.value[index]) {
    return
  }

  try {
    // 分析图片特征
    const characteristics = await analyzeImageCharacteristics(index)

    // 生成推荐参数
    const recommendedParams = generateRecommendedParams(characteristics)

    ocrResults.value[index] = {
      ...ocrResults.value[index],
      preprocessingParams: recommendedParams
    }

    // 清除缓存并重新处理
    processedImageCache.value.delete(index)
    await applyPreprocessingToImage(index)

    // 保存到数据库
    if (activeSessionId.value) {
      ocrSessionsDb
        .update(activeSessionId.value, {
          ocr_results: JSON.stringify(ocrResults.value)
        })
        .catch((err) => {
          console.error('保存预处理参数失败:', err)
        })
    }
  } catch (error) {
    console.error('生成推荐参数失败:', error)
    notifyWarning('分析图片特征失败，使用默认参数')

    // 使用保守的默认参数
    const defaultParams: ImagePreprocessingParams = {
      brightness: 0,
      contrast: 15,
      saturation: 0,
      sharpness: 5,
      grayscale: false,
      normalize: false
    }

    ocrResults.value[index] = {
      ...ocrResults.value[index],
      preprocessingParams: defaultParams
    }

    processedImageCache.value.delete(index)
    await applyPreprocessingToImage(index)
  }
}

// 应用图片预处理
const applyPreprocessingToImage = async (index: number): Promise<void> => {
  const result = ocrResults.value[index]
  if (!result) {
    return
  }

  try {
    // 获取原始图片 URL
    const originalImageUrl = await getImageDataUrl(result.imageUrl)

    // 加载原始图片
    const img = new Image()
    img.crossOrigin = 'anonymous'

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = reject
      img.src = originalImageUrl
    })

    // 创建 Canvas
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    // 绘制原始图片
    ctx.drawImage(img, 0, 0)

    // 获取图像数据
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data

    // 获取预处理参数
    const params = getPreprocessingParams(index)

    // 应用预处理（与 ImagePreviewDialog 中的逻辑相同）
    // 亮度调整
    if (params.brightness !== 0) {
      const brightness = params.brightness / 100
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.max(0, Math.min(255, data[i] + brightness * 255)) // R
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + brightness * 255)) // G
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + brightness * 255)) // B
      }
    }

    // 对比度调整（修正算法）
    if (params.contrast !== 0) {
      // 将 -100 到 100 的对比度值转换为 -1 到 1 的因子
      // contrast = -100 时，factor = 0（完全无对比度，灰色）
      // contrast = 0 时，factor = 1（无变化）
      // contrast = 100 时，factor = 2（最大对比度）
      const factor = (params.contrast + 100) / 100
      for (let i = 0; i < data.length; i += 4) {
        // 使用标准的对比度调整公式：newValue = (oldValue - 128) * factor + 128
        data[i] = Math.max(0, Math.min(255, (data[i] - 128) * factor + 128)) // R
        data[i + 1] = Math.max(0, Math.min(255, (data[i + 1] - 128) * factor + 128)) // G
        data[i + 2] = Math.max(0, Math.min(255, (data[i + 2] - 128) * factor + 128)) // B
      }
    }

    // 饱和度调整
    if (params.saturation !== 0 || params.grayscale) {
      const saturation = params.grayscale ? -100 : params.saturation
      const sat = (saturation + 100) / 100
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const gray = 0.299 * r + 0.587 * g + 0.114 * b
        data[i] = Math.max(0, Math.min(255, gray + sat * (r - gray))) // R
        data[i + 1] = Math.max(0, Math.min(255, gray + sat * (g - gray))) // G
        data[i + 2] = Math.max(0, Math.min(255, gray + sat * (b - gray))) // B
      }
    }

    // 归一化
    if (params.normalize) {
      let minR = 255,
        maxR = 0
      let minG = 255,
        maxG = 0
      let minB = 255,
        maxB = 0

      for (let i = 0; i < data.length; i += 4) {
        minR = Math.min(minR, data[i])
        maxR = Math.max(maxR, data[i])
        minG = Math.min(minG, data[i + 1])
        maxG = Math.max(maxG, data[i + 1])
        minB = Math.min(minB, data[i + 2])
        maxB = Math.max(maxB, data[i + 2])
      }

      const rangeR = maxR - minR || 1
      const rangeG = maxG - minG || 1
      const rangeB = maxB - minB || 1

      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.max(0, Math.min(255, ((data[i] - minR) / rangeR) * 255)) // R
        data[i + 1] = Math.max(0, Math.min(255, ((data[i + 1] - minG) / rangeG) * 255)) // G
        data[i + 2] = Math.max(0, Math.min(255, ((data[i + 2] - minB) / rangeB) * 255)) // B
      }
    }

    // 锐化（修正算法，使用安全的锐化方法）
    if (params.sharpness > 0) {
      // 将 0-100 的锐化值转换为 0-1 的强度
      const sharpness = params.sharpness / 100
      const tempData = new Uint8ClampedArray(data)
      const width = canvas.width
      const height = canvas.height

      // 使用 Unsharp Masking 方法：原图 + (原图 - 模糊图) * 强度
      // 这里使用简单的拉普拉斯算子来模拟边缘检测
      const laplacianKernel = [
        [0, -1, 0],
        [-1, 4, -1],
        [0, -1, 0]
      ]

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          for (let c = 0; c < 3; c++) {
            const original = tempData[(y * width + x) * 4 + c]

            // 计算拉普拉斯算子（边缘检测）
            let laplacian = 0
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                const idx = ((y + ky) * width + (x + kx)) * 4 + c
                const kernelValue = laplacianKernel[ky + 1][kx + 1]
                laplacian += tempData[idx] * kernelValue
              }
            }

            // 锐化公式：newValue = original + laplacian * sharpness
            // 拉普拉斯算子的和应该接近 0（因为核的总和为 0），所以直接加上拉普拉斯值
            const sharpened = original + laplacian * sharpness

            const idx = (y * width + x) * 4 + c
            // 确保值在 0-255 范围内
            data[idx] = Math.max(0, Math.min(255, Math.round(sharpened)))
          }
        }
      }
    }

    // 写回图像数据
    ctx.putImageData(imageData, 0, 0)

    // 转换为 data URL 并缓存
    const processedDataUrl = canvas.toDataURL('image/png')
    processedImageCache.value.set(index, processedDataUrl)
  } catch (error) {
    console.error('图片预处理失败:', error)
    // 如果预处理失败，使用原始图片
    processedImageCache.value.delete(index)
  }
}

// 获取处理后的图片 URL
const getProcessedImageUrl = (index: number): string => {
  // 如果有缓存，直接返回
  if (processedImageCache.value.has(index)) {
    return processedImageCache.value.get(index)!
  }

  // 如果没有预处理参数，返回原始图片
  const params = getPreprocessingParams(index)
  const hasParams =
    params.brightness !== 0 ||
    params.contrast !== 0 ||
    params.saturation !== 0 ||
    params.sharpness !== 0 ||
    params.grayscale ||
    params.normalize

  if (!hasParams) {
    return getImageDataUrlSync(ocrResults.value[index]?.imageUrl || '')
  }

  // 异步处理图片
  applyPreprocessingToImage(index).catch((err) => {
    console.error('预处理图片失败:', err)
  })

  // 暂时返回原始图片
  return getImageDataUrlSync(ocrResults.value[index]?.imageUrl || '')
}

// 监听预处理参数变化，自动重新处理图片
watch(
  () => ocrResults.value,
  async (newResults) => {
    // 当预处理参数变化时，清除缓存并重新处理所有图片
    for (let i = 0; i < newResults.length; i++) {
      const params = getPreprocessingParams(i)
      const hasParams =
        params.brightness !== 0 ||
        params.contrast !== 0 ||
        params.saturation !== 0 ||
        params.sharpness !== 0 ||
        params.grayscale ||
        params.normalize
      if (hasParams) {
        // 延迟处理，避免频繁触发
        setTimeout(() => {
          processedImageCache.value.delete(i)
          applyPreprocessingToImage(i)
        }, 100)
      } else {
        // 如果没有参数，清除缓存
        processedImageCache.value.delete(i)
      }
    }
  },
  { deep: true }
)

// AI修复处理（可以多次修复）
const handleAiFix = async (index: number) => {
  const result = ocrResults.value[index]
  if (!result || !result.text) {
    notifyWarning(t('ocr.noImages'))
    return
  }

  aiFixing.value.set(index, true)

  try {
    // 使用最新的原始OCR文本进行修复（如果重新识别过，会使用最新的文本）
    const prompt = generateOcrFixPrompt(result.text)
    const fixedText = ref('')

    const messages: AIDialogMessage[] = [
      {
        role: 'user',
        content: prompt
      }
    ]

    const { done } = createAiTask(
      t('ocr.aiFix'),
      messages,
      fixedText,
      ai_types.chat,
      `ocr-ai-fix-${index}`,
      { stream: true }
    )

    // 直接切换到diff视图
    viewModes.value.set(index, 'diff')

    // 如果之前有AI修复内容，先清除旧编辑器（让新内容覆盖）
    const existingNewEditor = getNewEditor(index)
    if (existingNewEditor) {
      existingNewEditor.setValue('')
    }

    // 监听流式输出，实时更新编辑器
    const stopWatcher = watch(
      () => fixedText.value,
      (newValue) => {
        aiFixedTexts.value.set(index, newValue)
        // 更新新编辑器
        updateNewEditorContent(index, newValue)
      }
    )

    await done
    stopWatcher() // 停止监听
    aiFixedTexts.value.set(index, fixedText.value)

    // 更新 ocrResults，保存 AI 修复后的文本
    if (ocrResults.value[index]) {
      ocrResults.value[index] = {
        ...ocrResults.value[index],
        aiFixedText: fixedText.value
      }

      // 保存到数据库
      if (activeSessionId.value) {
        await ocrSessionsDb.update(activeSessionId.value, {
          ocr_results: JSON.stringify(ocrResults.value)
        })
      }
    }

    // 重新初始化diff编辑器（确保原始文本也是最新的）
    await nextTick()
    initDiffEditors(index)

    notifySuccess(t('ocr.aiFixSuccess'))
  } catch (error) {
    console.error('AI修复失败:', error)
    notifyError(
      t('ocr.aiFixFailed') + ': ' + (error instanceof Error ? error.message : String(error))
    )
  } finally {
    aiFixing.value.set(index, false)
  }
}

// 设置旧编辑器引用
const setOldEditorRef = (el: HTMLElement | null, index: number) => {
  if (el) {
    oldEditorRefs.value.set(index, el)
    nextTick(() => {
      initOldEditor(index)
    })
  } else {
    const editor = getOldEditor(index)
    if (editor) {
      editor.dispose()
    }
    oldEditorRefs.value.delete(index)
  }
}

// 设置新编辑器引用
const setNewEditorRef = (el: HTMLElement | null, index: number) => {
  if (el) {
    newEditorRefs.value.set(index, el)
    nextTick(() => {
      initNewEditor(index)
    })
  } else {
    const editor = getNewEditor(index)
    if (editor) {
      editor.dispose()
    }
    newEditorRefs.value.delete(index)
  }
}

// 获取旧编辑器
const getOldEditor = (index: number): monaco.editor.IStandaloneCodeEditor | null => {
  const editorId = `ocr-old-editor-${index}`
  const editors = monaco.editor.getEditors() || []
  const found = editors.find((e) => {
    try {
      const editor = e as monaco.editor.IStandaloneCodeEditor
      const container = editor.getContainerDomNode()
      return container && container.id === editorId
    } catch {
      return false
    }
  })
  return found as monaco.editor.IStandaloneCodeEditor | null
}

// 获取新编辑器
const getNewEditor = (index: number): monaco.editor.IStandaloneCodeEditor | null => {
  const editorId = `ocr-new-editor-${index}`
  const editors = monaco.editor.getEditors() || []
  const found = editors.find((e) => {
    try {
      const editor = e as monaco.editor.IStandaloneCodeEditor
      const container = editor.getContainerDomNode()
      return container && container.id === editorId
    } catch {
      return false
    }
  })
  return found as monaco.editor.IStandaloneCodeEditor | null
}

// 初始化旧编辑器
const initOldEditor = async (index: number) => {
  await nextTick()

  const container = oldEditorRefs.value.get(index)
  if (!container) return

  container.id = `ocr-old-editor-${index}`

  const existingEditor = getOldEditor(index)
  if (existingEditor) {
    existingEditor.dispose()
  }

  const result = ocrResults.value[index]
  if (!result) return

  try {
    setupMonacoWorker()

    const isDark = themeState.currentTheme.type === 'dark'
    const editor = monaco.editor.create(container, {
      value: result.text || '',
      language: 'plaintext',
      theme: isDark ? 'vs-dark' : 'vs',
      readOnly: true,
      automaticLayout: true,
      fontSize: 14,
      lineNumbers: 'on',
      wordWrap: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontFamily: "'JetBrains Mono', 'Consolas', monospace"
    })
  } catch (error) {
    console.error('初始化旧编辑器失败:', error)
  }
}

// 初始化新编辑器
const initNewEditor = async (index: number) => {
  await nextTick()

  const container = newEditorRefs.value.get(index)
  if (!container) return

  container.id = `ocr-new-editor-${index}`

  const existingEditor = getNewEditor(index)
  if (existingEditor) {
    existingEditor.dispose()
  }

  const fixedText = aiFixedTexts.value.get(index)
  if (!fixedText) return

  try {
    setupMonacoWorker()

    const isDark = themeState.currentTheme.type === 'dark'
    const editor = monaco.editor.create(container, {
      value: fixedText || '',
      language: 'plaintext',
      theme: isDark ? 'vs-dark' : 'vs',
      readOnly: true,
      automaticLayout: true,
      fontSize: 14,
      lineNumbers: 'on',
      wordWrap: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontFamily: "'JetBrains Mono', 'Consolas', monospace"
    })
  } catch (error) {
    console.error('初始化新编辑器失败:', error)
  }
}

// 更新新编辑器内容
const updateNewEditorContent = (index: number, newValue: string): void => {
  const editor = getNewEditor(index)
  if (editor) {
    try {
      const currentValue = editor.getValue()
      if (currentValue !== newValue) {
        editor.setValue(newValue || '')
      }
    } catch (error) {
      console.warn(`更新新编辑器 ${index} 内容失败:`, error)
    }
  }
}

// 初始化diff编辑器
const initDiffEditors = async (index: number) => {
  await nextTick()

  const result = ocrResults.value[index]
  const fixedText = aiFixedTexts.value.get(index)
  if (!result || !fixedText) return

  // 初始化两个编辑器
  await initOldEditor(index)
  await initNewEditor(index)

  // 计算diff并添加装饰
  const oldEditor = getOldEditor(index)
  const newEditor = getNewEditor(index)
  if (!oldEditor || !newEditor) return

  try {
    const diffResult = computeDiff(result.text, fixedText)
    const oldDecorations: monaco.editor.IModelDeltaDecoration[] = []
    const newDecorations: monaco.editor.IModelDeltaDecoration[] = []

    let oldLineOffset = 0
    let newLineOffset = 0

    for (const chunk of diffResult.chunks) {
      if (chunk.type === 'delete') {
        // 删除：旧编辑器显示删除标记
        if (chunk.oldLines) {
          for (let i = 0; i < chunk.oldLines.length; i++) {
            const line = chunk.oldStart + i
            oldDecorations.push({
              range: new monaco.Range(line, 1, line, 1),
              options: {
                isWholeLine: true,
                className: 'diff-line-delete',
                glyphMarginClassName: 'diff-glyph-delete',
                minimap: {
                  color: 'rgba(245, 108, 108, 0.3)',
                  position: monaco.editor.MinimapPosition.Inline
                }
              }
            })
          }
        }
        oldLineOffset += chunk.oldLines?.length || 0
      } else if (chunk.type === 'insert') {
        // 插入：新编辑器显示插入标记
        if (chunk.newLines) {
          for (let i = 0; i < chunk.newLines.length; i++) {
            const line = chunk.newStart + i
            newDecorations.push({
              range: new monaco.Range(line, 1, line, 1),
              options: {
                isWholeLine: true,
                className: 'diff-line-insert',
                glyphMarginClassName: 'diff-glyph-insert',
                minimap: {
                  color: 'rgba(103, 194, 58, 0.3)',
                  position: monaco.editor.MinimapPosition.Inline
                }
              }
            })
          }
        }
        newLineOffset += chunk.newLines?.length || 0
      } else if (chunk.type === 'replace') {
        // 替换：旧编辑器显示删除，新编辑器显示插入
        if (chunk.oldLines) {
          for (let i = 0; i < chunk.oldLines.length; i++) {
            const line = chunk.oldStart + i
            oldDecorations.push({
              range: new monaco.Range(line, 1, line, 1),
              options: {
                isWholeLine: true,
                className: 'diff-line-delete',
                glyphMarginClassName: 'diff-glyph-delete',
                minimap: {
                  color: 'rgba(245, 108, 108, 0.3)',
                  position: monaco.editor.MinimapPosition.Inline
                }
              }
            })
          }
        }
        if (chunk.newLines) {
          for (let i = 0; i < chunk.newLines.length; i++) {
            const line = chunk.newStart + i
            newDecorations.push({
              range: new monaco.Range(line, 1, line, 1),
              options: {
                isWholeLine: true,
                className: 'diff-line-insert',
                glyphMarginClassName: 'diff-glyph-insert',
                minimap: {
                  color: 'rgba(103, 194, 58, 0.3)',
                  position: monaco.editor.MinimapPosition.Inline
                }
              }
            })
          }
        }
        oldLineOffset += chunk.oldLines?.length || 0
        newLineOffset += chunk.newLines?.length || 0
      }
    }

    oldEditor.deltaDecorations([], oldDecorations)
    newEditor.deltaDecorations([], newDecorations)

    // 同步滚动
    oldEditor.onDidScrollChange((e) => {
      if (e.scrollTop !== undefined) {
        newEditor.setScrollTop(e.scrollTop)
      }
      if (e.scrollLeft !== undefined) {
        newEditor.setScrollLeft(e.scrollLeft)
      }
    })

    newEditor.onDidScrollChange((e) => {
      if (e.scrollTop !== undefined) {
        oldEditor.setScrollTop(e.scrollTop)
      }
      if (e.scrollLeft !== undefined) {
        oldEditor.setScrollLeft(e.scrollLeft)
      }
    })
  } catch (error) {
    console.error('初始化diff编辑器失败:', error)
  }
}

// 监听视图模式变化
watch(
  () => viewModes.value,
  async (newModes, oldModes) => {
    for (const [index, mode] of newModes.entries()) {
      const oldMode = oldModes?.get(index)
      if (mode === 'diff') {
        await nextTick()
        await nextTick()
        setTimeout(() => {
          initDiffEditors(index)
        }, 100)
      } else if (mode === 'single' && oldMode !== 'single') {
        // 切换到单视图时，重新初始化单视图编辑器
        await nextTick()
        await nextTick()
        setTimeout(() => {
          if (textEditorRefs.value.has(index)) {
            initTextEditor(index)
            updateEditorContent(index)
          }
        }, 100)
      }
    }
  },
  { deep: true }
)

// 主题样式
const borderColor = computed(() =>
  themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)'
)

const panelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor,
  borderColor: borderColor.value
}))

const contentAreaStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  flex: 1,
  display: 'flex',
  flexDirection: 'column' as const,
  overflow: 'hidden' as const,
  height: '100%',
  minHeight: 0,
  padding: '16px',
  boxSizing: 'border-box' as const
}))

const emptyStateStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%'
}))

const textContentStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const preStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  fontFamily: "'JetBrains Mono', 'Consolas', monospace"
}))
</script>

<style scoped>
.ocr-window {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.main-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
  min-height: 0;
  padding: 16px;
  box-sizing: border-box;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.session-content-panel {
  border-radius: 16px;
  border: 1px solid;
  padding: 12px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
  margin: 0;
  height: 100%;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
  gap: 0;
}

/* 工具栏区域 */
.toolbar-section {
  margin-bottom: 16px;
  background-color: v-bind(
    'themeState.currentTheme.background2nd || themeState.currentTheme.background'
  );
  border-radius: 8px;
  border: 1px solid v-bind('borderColor');
  flex-shrink: 0;
  overflow: hidden;
  height: auto;
}

.toolbar-scrollbar {
  width: 100%;
}

.toolbar-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: auto;
  overflow-y: hidden;
}

.toolbar-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  gap: 16px;
  min-width: max-content;
  white-space: nowrap;
  flex-wrap: nowrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 1 auto;
  min-width: 0;
  white-space: nowrap;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  white-space: nowrap;
}

/* 工具栏滚动条样式 */
.toolbar-scrollbar :deep(.el-scrollbar__bar) {
  bottom: 0;
}

.toolbar-scrollbar :deep(.el-scrollbar__bar.is-horizontal) {
  height: 6px;
}

.language-select-wrapper {
  flex-shrink: 0;
}

/* Tab 缩略图样式 */
.ocr-tabs {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* shadcn-vue Tabs styling */
.ocr-tabs :deep([role='tab']) {
  position: relative;
}

.ocr-tabs :deep([role='tab']:hover) {
  position: relative;
}

.tab-thumbnail {
  position: fixed;
  width: 120px;
  height: 120px;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid v-bind('themeState.currentTheme.primaryColor || "#409EFF"');
  background-color: v-bind('themeState.currentTheme.background');
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  pointer-events: none;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tab-thumbnail img {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
}

.ocr-tabs :deep([role='tab']:hover) .tab-thumbnail {
  opacity: 1;
}

.tab-thumbnail img {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
}

.result-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin-top: 0;
}

/* shadcn-vue Tabs layout */
.ocr-tabs :deep([role='tablist']) {
  flex-shrink: 0;
}

.ocr-tabs :deep([role='tabpanel']) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.ocr-tabs :deep([role='tabpanel'][data-state='active']) {
  height: 100%;
}

.ocr-result-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
}

.image-section {
  flex: 0 0 250px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-width: 250px;
  height: 100%;
  max-height: 100%;
  gap: 8px;
  overflow-x: hidden;
}

.image-preview {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  min-height: 0;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.image-preview:hover {
  opacity: 0.8;
}

.image-preview img {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 8px;
}

.preprocessing-panel {
  flex-shrink: 0;
  background-color: v-bind('themeState.currentTheme.background2nd');
  border-radius: 8px;
  padding: 12px;
  margin-top: 8px;
  border: 1px solid
    v-bind(
      'themeState.currentTheme.type === "dark" ? "rgba(255, 255, 255, 0.18)" : "rgba(0, 0, 0, 0.12)"'
    );
  max-height: 400px;
  overflow-y: auto;
}

.panel-header {
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid
    v-bind(
      'themeState.currentTheme.type === "dark" ? "rgba(255, 255, 255, 0.18)" : "rgba(0, 0, 0, 0.12)"'
    );
}

.panel-title {
  font-weight: 600;
  font-size: 13px;
  color: v-bind('themeState.currentTheme.textColor');
  text-align: center;
  width: 100%;
}

.panel-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 12px;
}

.params-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.param-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* checkbox 行：横向排列，label 在 checkbox 右侧 */
.param-item-row {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.param-item-row-label {
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor');
  font-weight: 500;
  cursor: pointer;
  flex-shrink: 0;
}

.param-item label {
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor');
  font-weight: 500;
}

.param-item .el-slider {
  flex: 1;
}

.param-value {
  font-size: 11px;
  color: v-bind('themeState.currentTheme.textColor2');
  min-width: 35px;
  text-align: right;
}

.param-item .el-checkbox {
  margin-top: 2px;
}

.image-actions {
  flex-shrink: 0;
  display: flex;
  flex-wrap: nowrap;
  justify-content: stretch;
  align-items: center;
  gap: 8px;
  padding-top: 8px;
  min-width: 0;
  max-width: 100%;
}

/* 按钮自适应：平分空间并随容器缩小 */
.image-actions > * {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  overflow: hidden;
}

.image-actions :deep(button) {
  min-width: 0;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 单按钮时不拉伸，保持自然宽度 */
.image-actions > *:only-child {
  flex: 0 1 auto;
}

.ai-logo-icon-small {
  width: 14px;
  height: 14px;
  margin-right: 4px;
  vertical-align: middle;
}

.text-result {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.text-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
  border-radius: 8px;
  overflow: hidden;
  box-sizing: border-box;
}

.text-content.unrecognized {
  display: flex;
  align-items: center;
  justify-content: center;
}

.unrecognized-placeholder {
  text-align: center;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.6;
}

.unrecognized-placeholder p {
  margin: 8px 0;
  font-size: 14px;
}

.unrecognized-placeholder .hint {
  font-size: 12px;
  opacity: 0.5;
}

.text-editor-container {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.text-result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  margin-bottom: 8px;
  border-bottom: 1px solid v-bind('borderColor');
}

.text-result-actions {
  display: flex;
  gap: 8px;
}

.diff-view-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.split-editors {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 1px;
  border: 1px solid v-bind('borderColor');
  border-radius: 8px;
  overflow: hidden;
}

.editor-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.editor-header {
  padding: 8px 12px;
  border-bottom: 1px solid v-bind('borderColor');
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 500;
}

.editor-label {
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.8;
}

.monaco-editor-container {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* Diff装饰样式 */
:deep(.diff-line-delete) {
  background-color: rgba(245, 108, 108, 0.1) !important;
}

:deep(.diff-line-insert) {
  background-color: rgba(103, 194, 58, 0.1) !important;
}

:deep(.diff-glyph-delete) {
  background-color: rgba(245, 108, 108, 0.3) !important;
}

:deep(.diff-glyph-insert) {
  background-color: rgba(103, 194, 58, 0.3) !important;
}
</style>
