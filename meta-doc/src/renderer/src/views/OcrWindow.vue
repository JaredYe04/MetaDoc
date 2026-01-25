<template>
  <div class="ocr-window">
    <div class="main-container">
      <!-- 左侧会话列表 -->
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
      />

      <!-- 右侧内容区域 -->
      <div class="content-area" :style="contentAreaStyle" v-loading="loadingSession">
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
                    <el-select
                      v-model="selectedLanguages"
                      multiple
                      collapse-tags
                      collapse-tags-tooltip
                      :placeholder="t('ocr.selectLanguages')"
                      size="default"
                      style="width: 200px"
                    >
                      <el-option
                        v-for="lang in availableLanguages"
                        :key="lang.value"
                        :label="lang.label"
                        :value="lang.value"
                      />
                    </el-select>
                  </div>
                  
                  <!-- 上传和粘贴按钮 -->
                  <el-upload
                    ref="uploadRef"
                    :file-list="imageList"
                    :auto-upload="false"
                    :on-change="(file: any, fileList: any[]) => handleImageChange(file, fileList)"
                    :on-remove="handleImageRemove"
                    accept="image/*"
                    multiple
                    :show-file-list="false"
                  >
                    <template #trigger>
                      <el-button :icon="UploadFilled">
                        {{ t('ocr.uploadHint') }}
                      </el-button>
                    </template>
                  </el-upload>
                  
                  <el-button @click="handlePasteFromClipboard">
                    {{ t('ocr.pasteFromClipboard') }}
                  </el-button>
                </div>
                
                <div class="toolbar-right">
                  <!-- 操作按钮 -->
                  <el-button 
                    v-if="ocrResults.length > 0"
                    type="primary" 
                    :loading="processing"
                    @click="handleOcr"
                  >
                    {{ t('ocr.startOcr') }}
                  </el-button>
                </div>
              </div>
            </el-scrollbar>
          </div>
          
          <!-- OCR结果展示 -->
          <div v-if="ocrResults.length > 0" class="result-section">
            <el-tabs v-model="activeTab" class="ocr-tabs">
              <el-tab-pane 
                v-for="(result, index) in ocrResults" 
                :key="index"
                :name="`image-${index}`"
              >
                <!-- Tab hover 时显示的缩略图 -->
                <template #label>
                  <span 
                    class="tab-label-wrapper"
                    @mouseenter="(e) => handleTabHover(e, index)"
                    @mouseleave="handleTabLeave"
                  >
                    {{ t('ocr.image') }} {{ index + 1 }}
                    <el-button
                      :icon="Delete"
                      link
                      size="small"
                      class="tab-delete-btn"
                      @click.stop="handleDeleteImage(index)"
                    />
                  </span>
                </template>
                <div class="ocr-result-item">
                  <div class="image-section">
                    <div class="image-preview" @click="handleImageClick(result.imageUrl)">
                      <img :src="getImageDataUrlSync(result.imageUrl)" :alt="`Image ${index + 1}`" @error="handleImageError($event, result.imageUrl)" />
                    </div>
                    <div class="image-actions" v-if="result.recognized">
                      <el-dropdown 
                        v-if="aiFixedTexts.get(index)"
                        @command="(cmd: string) => handleCopyCommand(cmd, index)"
                        trigger="click"
                      >
                        <el-button size="small">
                          {{ t('ocr.copyText') }}
                          <el-icon class="el-icon--right"><arrow-down /></el-icon>
                        </el-button>
                        <template #dropdown>
                          <el-dropdown-menu>
                            <el-dropdown-item command="original">
                              {{ t('ocr.copyOriginalText') }}
                            </el-dropdown-item>
                            <el-dropdown-item command="fixed">
                              {{ t('ocr.copyFixedText') }}
                            </el-dropdown-item>
                          </el-dropdown-menu>
                        </template>
                      </el-dropdown>
                      <el-button 
                        v-else
                        size="small" 
                        @click="handleCopyText(result.text)"
                      >
                        {{ t('ocr.copyText') }}
                      </el-button>
                      <el-button 
                        size="small" 
                        :loading="aiFixing.get(index)"
                        @click="handleAiFix(index)"
                      >
                        <img :src="(themeState.currentTheme as any).AiLogo" alt="AI" class="ai-logo-icon-small" />
                        {{ t('ocr.aiFix') }}
                      </el-button>
                      <el-button 
                        size="small" 
                        :loading="recognizingIndex.has(index)"
                        @click="handleReRecognizeSingle(index)"
                      >
                        {{ t('ocr.reRecognize') }}
                      </el-button>
                    </div>
                    <div class="image-actions" v-else>
                      <el-button 
                        size="small" 
                        type="primary"
                        :loading="recognizingIndex.has(index)"
                        @click="handleRecognizeSingle(index)"
                      >
                        {{ recognizingIndex.has(index) ? t('ocr.recognizing') : t('ocr.startRecognize') }}
                      </el-button>
                    </div>
                  </div>
                  <div class="text-result">
                    <!-- 视图切换 -->
                    <div class="text-result-header" v-if="aiFixedTexts.get(index)">
                      <el-radio-group 
                        :model-value="viewModes.get(index) || 'single'"
                        @update:model-value="(val: 'single' | 'diff') => viewModes.set(index, val)"
                        size="small"
                      >
                        <el-radio-button :label="'single'">{{ t('ocr.singleView') }}</el-radio-button>
                        <el-radio-button :label="'diff'">{{ t('ocr.diffView') }}</el-radio-button>
                      </el-radio-group>
                    </div>
                    <!-- 未识别状态 -->
                    <div class="text-content unrecognized" :style="textContentStyle" v-if="!result.recognized">
                      <div class="unrecognized-placeholder">
                        <p>{{ t('ocr.notRecognized') }}</p>
                        <p class="hint">{{ t('ocr.clickRecognizeHint') }}</p>
                      </div>
                    </div>
                    <!-- 已识别：单视图或diff视图 -->
                    <div class="text-content" :style="textContentStyle" v-else-if="!aiFixedTexts.get(index) || viewModes.get(index) === 'single'">
                      <div 
                        :ref="el => setTextEditorRef(el as HTMLElement | null, index)" 
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
                          <div :ref="el => setOldEditorRef(el as HTMLElement | null, index)" class="monaco-editor-container"></div>
                        </div>
                        <div class="editor-panel new-panel">
                          <div class="editor-header" :style="editorHeaderStyle">
                            <span class="editor-label">{{ t('ocr.fixedText') }}</span>
                          </div>
                          <div :ref="el => setNewEditorRef(el as HTMLElement | null, index)" class="monaco-editor-container"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </el-tab-pane>
            </el-tabs>
          </div>
        </div>
      </div>
    </div>

    <!-- 图片预览对话框 -->
    <ImagePreviewDialog
      v-model="imagePreviewVisible"
      :image-url="previewImageUrl"
    />
    
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
import { ElMessage, ElMessageBox } from 'element-plus'
import { UploadFilled, ArrowDown, Delete } from '@element-plus/icons-vue'
import SessionList from '../components/common/SessionList.vue'
import ImagePreviewDialog from '../components/common/ImagePreviewDialog.vue'
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

const { t } = useI18n()

const sessions = ref<SessionListItem[]>([])
const activeSessionId = ref<string | null>(null)
const activeSession = computed(() => {
  if (!activeSessionId.value) return null
  return sessions.value.find(s => s.id === activeSessionId.value) as any
})

const imageList = ref<any[]>([])
const uploadRef = ref<any>(null)
const selectedLanguages = ref<string[]>(['eng'])
const processing = ref(false)
const loadingSession = ref(false)
const ocrResults = ref<Array<{ imageUrl: string; text: string; recognized: boolean; aiFixedText?: string }>>([])
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
const thumbnailVisible = ref(false)
const thumbnailPosition = ref({ top: 0, left: 0 })
const thumbnailImageUrl = ref<string>('')

// 编辑器头部样式
const editorHeaderStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  borderColor: borderColor.value,
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
    const displayText = (viewMode === 'single' && aiFixedText) ? aiFixedText : result.text
    
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
      const displayText = (viewMode === 'single' && aiFixedText) ? aiFixedText : ocrResults.value[index].text
      
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
watch(() => ocrResults.value, (newResults) => {
  for (let i = 0; i < newResults.length; i++) {
    updateEditorContent(i)
  }
}, { deep: true })

// 监听活动标签页变化，初始化编辑器
watch(() => activeTab.value, async (newTab) => {
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
})

// 监听主题变化，更新所有编辑器主题（参考KnowledgeBase.vue的实现）
watch(() => themeState.currentTheme.type, (newType) => {
  // 设置全局主题（所有编辑器会自动应用）
  monaco.editor.setTheme(newType === 'dark' ? 'vs-dark' : 'vs')
})

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
  if (imagePath.startsWith('data:') || imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath
  }
  
  // 检查缓存
  if (imageDataUrlCache.value.has(imagePath)) {
    return imageDataUrlCache.value.get(imagePath)!
  }
  
  // 如果缓存中没有，异步加载
  getImageDataUrl(imagePath).catch(err => {
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
  if (imagePath.startsWith('data:') || imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
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
    let ipcRenderer: any = null
    if (typeof window !== 'undefined') {
      if ((window as any).electron?.ipcRenderer) {
        ipcRenderer = (window as any).electron.ipcRenderer
      } else {
        const { localIpcRenderer } = await import('../utils/web-adapter/local-ipc-renderer')
        ipcRenderer = localIpcRenderer
      }
    }
    
    if (!ipcRenderer) {
      throw new Error('IPC渲染器不可用')
    }
    
    const fileData = await ipcRenderer.invoke('read-file-for-upload', localPath) as {
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

// 初始化默认语言（eng + 当前语言）
onMounted(() => {
  const locale = (i18n.global.locale as any).value || 'zh_CN'
  const localeMap: Record<string, string> = {
    'zh_CN': 'chi_sim',
    'zh_TW': 'chi_tra',
    'ja_JP': 'jpn',
    'ko_KR': 'kor',
    'de_DE': 'deu',
    'fr_FR': 'fra',
    'es_ES': 'spa',
    'ru_RU': 'rus',
    'pt_PT': 'por'
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
    sessions.value = dbSessions.map(s => ({
      id: s.id,
      title: s.title,
      updatedAt: s.updated_at
    }))
  } catch (error) {
    ElMessage.error('加载会话列表失败: ' + (error instanceof Error ? error.message : String(error)))
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
    imageList.value = []
    ocrResults.value = []
    // 清空所有状态
    aiFixedTexts.value.clear()
    viewModes.value.clear()
    recognizingIndex.value.clear()
  } catch (error) {
    ElMessage.error('创建会话失败: ' + (error instanceof Error ? error.message : String(error)))
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
    const session = await ocrSessionsDb.getById(item.id)
    if (session) {
      if (session.images) {
        const images = JSON.parse(session.images)
        imageList.value = images.map((img: string, index: number) => {
          // 确保图片路径使用file://协议
          let imageUrl = img
          if (img && !img.startsWith('file://') && !img.startsWith('http://') && !img.startsWith('https://') && !img.startsWith('data:')) {
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
          recognized: r.recognized !== undefined ? r.recognized : !!r.text
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
          ocrResults.value = imageList.value.map(img => {
            const imageUrl = img.url || img.path
            const url = imageUrl.startsWith('file://') ? imageUrl : 
              (imageUrl.replace(/\\/g, '/').startsWith('/') ? 'file://' + imageUrl.replace(/\\/g, '/') : 
              'file:///' + imageUrl.replace(/\\/g, '/'))
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
    ElMessage.error('加载会话失败: ' + (error instanceof Error ? error.message : String(error)))
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
    ElMessage.error('重命名失败: ' + (error instanceof Error ? error.message : String(error)))
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
    ElMessage.success(t('common.duplicateSuccess'))
  } catch (error) {
    ElMessage.error('复制失败: ' + (error instanceof Error ? error.message : String(error)))
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
    ElMessage.success(t('common.deleteSuccess'))
  } catch (error) {
    ElMessage.error('删除失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 图片变化
const handleImageChange = async (file: any, fileList: any[]) => {
  // 防止递归调用：只在有新文件上传时处理
  if (!file.raw) {
    // 如果不是新上传的文件，只同步fileList到imageList，不保存
    imageList.value = fileList.map(f => ({
      name: f.name,
      url: f.url || f.path,
      path: f.path || f.url,
      uid: f.uid,
      status: f.status || 'success' as const
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
    
    let ipcRenderer: any = null
    if (typeof window !== 'undefined') {
      if ((window as any).electron?.ipcRenderer) {
        ipcRenderer = (window as any).electron.ipcRenderer
      } else {
        const { localIpcRenderer } = await import('../utils/web-adapter/local-ipc-renderer')
        ipcRenderer = localIpcRenderer
      }
    }
    
    if (!ipcRenderer) {
      throw new Error('IPC渲染器不可用')
    }
    
    const filePath = await ipcRenderer.invoke('save-reference-file', {
      filename: file.name,
      content: base64
    }) as string
    
    if (activeSessionId.value && filePath) {
      // 更新imageList，使用fileList但替换新文件的路径
      const updatedFileList = fileList.map(f => {
        if (f.uid === file.uid) {
          return {
            ...f,
            url: filePath,
            path: filePath
          }
        }
        return f
      })
      
      imageList.value = updatedFileList.map(f => ({
        name: f.name,
        url: f.url || f.path,
        path: f.path || f.url,
        uid: f.uid,
        status: 'success' as const
      }))
      
      // 保存到数据库
      const currentImages = imageList.value.map(img => img.url || img.path).filter(Boolean)
      await ocrSessionsDb.update(activeSessionId.value, {
        images: JSON.stringify(currentImages)
      })
    }
  } catch (error) {
    ElMessage.error('保存图片失败: ' + (error instanceof Error ? error.message : String(error)))
    // 如果保存失败，从fileList中移除这个文件
    imageList.value = fileList.filter(f => f.uid !== file.uid).map(f => ({
      name: f.name,
      url: f.url || f.path,
      path: f.path || f.url,
      uid: f.uid,
      status: f.status || 'success' as const
    }))
  }
}

const handleImageRemove = async (file: any) => {
  if (activeSessionId.value) {
    const currentImages = imageList.value
      .filter(img => img.uid !== file.uid)
      .map(img => img.url || img.path)
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
    let ipcRenderer: any = null
    if (typeof window !== 'undefined') {
      if ((window as any).electron?.ipcRenderer) {
        ipcRenderer = (window as any).electron.ipcRenderer
      } else {
        const { localIpcRenderer } = await import('../utils/web-adapter/local-ipc-renderer')
        ipcRenderer = localIpcRenderer
      }
    }
    
    if (!ipcRenderer) {
      throw new Error('IPC渲染器不可用')
    }
    
    const clipboardImage = await ipcRenderer.invoke('read-clipboard-image') as string | null
    if (!clipboardImage) {
      ElMessage.warning(t('ocr.noClipboardImage'))
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
    const filePath = await ipcRenderer.invoke('save-reference-file', {
      filename: `clipboard-${timestamp}.png`,
      content: base64Content
    }) as string
    
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
    const imageUrl = filePath.startsWith('file://') ? filePath : 
      (filePath.replace(/\\/g, '/').startsWith('/') ? 'file://' + filePath.replace(/\\/g, '/') : 
      'file:///' + filePath.replace(/\\/g, '/'))
    
    ocrResults.value.push({
      imageUrl: imageUrl,
      text: '',
      recognized: false
    })
    
    // 切换到新添加的标签
    activeTab.value = `image-${ocrResults.value.length - 1}`
    
    // 更新数据库
    if (activeSessionId.value) {
      const currentImages = imageList.value.map(img => img.url || img.path).filter(Boolean)
      await ocrSessionsDb.update(activeSessionId.value, {
        images: JSON.stringify(currentImages)
      })
    }
    
    // 确保 UI 更新
    await nextTick()
    
    // 验证图片是否成功添加到列表
    const addedImage = imageList.value.find(img => img.uid === timestamp)
    if (!addedImage) {
      console.error('图片添加失败，未在列表中找到')
      ElMessage.error('图片添加失败，请重试')
      return
    }
    
    console.log('粘贴图片成功，当前图片列表长度:', imageList.value.length, '图片:', addedImage)
    ElMessage.success(t('ocr.pasteSuccess'))
  } catch (error) {
    console.error('粘贴失败:', error)
    ElMessage.error('粘贴失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 识别单张图片
const handleRecognizeSingle = async (index: number) => {
  if (!activeSessionId.value) {
    ElMessage.warning(t('ocr.noSession'))
    return
  }
  
  if (selectedLanguages.value.length === 0) {
    ElMessage.warning(t('ocr.noLanguages'))
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
    
    let ipcRenderer: any = null
    if (typeof window !== 'undefined') {
      if ((window as any).electron?.ipcRenderer) {
        ipcRenderer = (window as any).electron.ipcRenderer
      } else {
        const { localIpcRenderer } = await import('../utils/web-adapter/local-ipc-renderer')
        ipcRenderer = localIpcRenderer
      }
    }
    
    if (!ipcRenderer) {
      throw new Error('IPC渲染器不可用')
    }
    
    // 确保languages是数组格式，且只传递字符串数组（可序列化）
    const languages = Array.isArray(selectedLanguages.value) 
      ? [...selectedLanguages.value] // 创建新数组避免引用问题
      : []
    
    const ocrText = await ipcRenderer.invoke('ocr-recognize-file', {
      imagePath: String(imagePath), // 确保是字符串，使用实际路径
      languages: languages // 传递可序列化的数组
    }) as string
    
    // 更新结果（保留AI修复后的文本）
    const existingAiFixedText = result.aiFixedText || aiFixedTexts.value.get(index)
    ocrResults.value[index] = {
      ...result,
      text: ocrText,
      recognized: true,
      aiFixedText: existingAiFixedText // 保留AI修复后的内容
    }
    
    // 保存结果到数据库
    await ocrSessionsDb.update(activeSessionId.value, {
      ocr_results: JSON.stringify(ocrResults.value),
      ocr_languages: JSON.stringify(selectedLanguages.value)
    })
    
    // 更新编辑器
    await nextTick()
    updateEditorContent(index)
    
    ElMessage.success(t('ocr.recognizeSuccess'))
  } catch (error) {
    console.error(`图片 ${index + 1} OCR 失败:`, error)
    ElMessage.error(`识别失败: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    recognizingIndex.value.delete(index)
  }
}

// 重新识别单张图片（不会覆盖AI修复后的内容）
const handleReRecognizeSingle = async (index: number) => {
  if (!activeSessionId.value) {
    ElMessage.warning(t('ocr.noSession'))
    return
  }
  
  if (selectedLanguages.value.length === 0) {
    ElMessage.warning(t('ocr.noLanguages'))
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
    
    let ipcRenderer: any = null
    if (typeof window !== 'undefined') {
      if ((window as any).electron?.ipcRenderer) {
        ipcRenderer = (window as any).electron.ipcRenderer
      } else {
        const { localIpcRenderer } = await import('../utils/web-adapter/local-ipc-renderer')
        ipcRenderer = localIpcRenderer
      }
    }
    
    if (!ipcRenderer) {
      throw new Error('IPC渲染器不可用')
    }
    
    // 确保languages是数组格式，且只传递字符串数组（可序列化）
    const languages = Array.isArray(selectedLanguages.value) 
      ? [...selectedLanguages.value] // 创建新数组避免引用问题
      : []
    
    const ocrText = await ipcRenderer.invoke('ocr-recognize-file', {
      imagePath: String(imagePath), // 确保是字符串，使用实际路径
      languages: languages // 传递可序列化的数组
    }) as string
    
    // 只更新原始OCR文本，保留AI修复后的内容
    const existingAiFixedText = result.aiFixedText || aiFixedTexts.value.get(index)
    ocrResults.value[index] = {
      ...result,
      text: ocrText,
      recognized: true,
      aiFixedText: existingAiFixedText // 保留AI修复后的内容
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
    
    ElMessage.success(t('ocr.reRecognizeSuccess'))
  } catch (error) {
    console.error(`图片 ${index + 1} 重新识别失败:`, error)
    ElMessage.error(`重新识别失败: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    recognizingIndex.value.delete(index)
  }
}

// 执行OCR（批量识别所有未识别的图片）
const handleOcr = async () => {
  if (!activeSessionId.value || ocrResults.value.length === 0) {
    ElMessage.warning(t('ocr.noImages'))
    return
  }
  
  if (selectedLanguages.value.length === 0) {
    ElMessage.warning(t('ocr.noLanguages'))
    return
  }
  
  // 找到所有未识别的图片
  const unrecognizedIndices = ocrResults.value
    .map((r, i) => !r.recognized ? i : -1)
    .filter(i => i !== -1)
  
  if (unrecognizedIndices.length === 0) {
    ElMessage.info(t('ocr.allRecognized'))
    return
  }
  
  processing.value = true
  
  try {
    let ipcRenderer: any = null
    if (typeof window !== 'undefined') {
      if ((window as any).electron?.ipcRenderer) {
        ipcRenderer = (window as any).electron.ipcRenderer
      } else {
        const { localIpcRenderer } = await import('../utils/web-adapter/local-ipc-renderer')
        ipcRenderer = localIpcRenderer
      }
    }
    
    if (!ipcRenderer) {
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
        
        const ocrText = await ipcRenderer.invoke('ocr-recognize-file', {
          imagePath: String(imagePath), // 确保是字符串，使用实际路径
          languages: languages // 传递可序列化的数组
        }) as string
        
        // 更新结果（保留AI修复后的文本）
        const existingAiFixedText = result.aiFixedText || aiFixedTexts.value.get(index)
        ocrResults.value[index] = {
          ...result,
          text: ocrText,
          recognized: true,
          aiFixedText: existingAiFixedText // 保留AI修复后的内容
        }
        
        // 更新编辑器
        await nextTick()
        updateEditorContent(index)
        
        console.log(`图片 ${index + 1} OCR 成功`)
      } catch (error) {
        console.error(`图片 ${index + 1} OCR 失败:`, error)
        ElMessage.warning(`图片 ${index + 1} OCR 识别失败: ${error instanceof Error ? error.message : String(error)}`)
      } finally {
        recognizingIndex.value.delete(index)
      }
    }
    
    // 保存结果到数据库
    await ocrSessionsDb.update(activeSessionId.value, {
      ocr_results: JSON.stringify(ocrResults.value),
      ocr_languages: JSON.stringify(selectedLanguages.value)
    })
    
    ElMessage.success(t('ocr.ocrSuccess'))
  } catch (error) {
    ElMessage.error('OCR识别失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    processing.value = false
  }
}

// 删除图片
const handleDeleteImage = async (index: number) => {
  try {
    // 显示确认对话框
    await ElMessageBox.confirm(
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
      const currentImages = imageList.value.map(img => img.url || img.path).filter(Boolean)
      await ocrSessionsDb.update(activeSessionId.value, {
        images: JSON.stringify(currentImages),
        ocr_results: JSON.stringify(ocrResults.value)
      })
    }
    
    ElMessage.success(t('ocr.deleteSuccess'))
  } catch (error) {
    // 用户取消删除
    if (error === 'cancel' || (error as any)?.action === 'cancel') {
      return
    }
    console.error('删除图片失败:', error)
    ElMessage.error('删除图片失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 复制文本
const handleCopyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(t('ocr.copySuccess'))
  } catch (error) {
    ElMessage.error('复制失败: ' + (error instanceof Error ? error.message : String(error)))
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
const handleImageClick = async (imageUrl: string) => {
  try {
    // 获取完整的图片 data URL
    const dataUrl = await getImageDataUrl(imageUrl)
    previewImageUrl.value = dataUrl
    imagePreviewVisible.value = true
  } catch (error) {
    console.error('打开图片预览失败:', error)
    ElMessage.error('打开图片预览失败')
  }
}

// AI修复处理（可以多次修复）
const handleAiFix = async (index: number) => {
  const result = ocrResults.value[index]
  if (!result || !result.text) {
    ElMessage.warning(t('ocr.noImages'))
    return
  }
  
  aiFixing.value.set(index, true)
  
  try {
    // 使用最新的原始OCR文本进行修复（如果重新识别过，会使用最新的文本）
    const prompt = generateOcrFixPrompt(result.text)
    const fixedText = ref('')
    
    const messages: AIDialogMessage[] = [{
      role: 'user',
      content: prompt,
    }]
    
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
    const stopWatcher = watch(() => fixedText.value, (newValue) => {
      aiFixedTexts.value.set(index, newValue)
      // 更新新编辑器
      updateNewEditorContent(index, newValue)
    })
    
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
    
    ElMessage.success(t('ocr.aiFixSuccess'))
  } catch (error) {
    console.error('AI修复失败:', error)
    ElMessage.error(t('ocr.aiFixFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
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
watch(() => viewModes.value, async (newModes, oldModes) => {
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
}, { deep: true })

// 主题样式
const borderColor = computed(() =>
  themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)',
)

const panelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor,
  borderColor: borderColor.value,
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
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
  gap: 0;
}

/* 工具栏区域 */
.toolbar-section {
  margin-bottom: 16px;
  background-color: v-bind('themeState.currentTheme.background2nd || themeState.currentTheme.background');
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
}

:deep(.el-tabs__item) {
  position: relative;
}

:deep(.el-tabs__item:hover) {
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

:deep(.el-tabs__item:hover) .tab-thumbnail {
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

/* 确保 el-tabs 占满容器 */
:deep(.el-tabs) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

:deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

:deep(.el-tab-pane) {
  height: 100%;
  overflow: hidden;
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

.image-actions {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  gap: 8px;
  padding-top: 8px;
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



