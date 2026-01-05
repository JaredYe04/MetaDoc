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
          <!-- 语言包选择 -->
          <div class="language-section">
            <el-form-item :label="t('ocr.languages')">
              <el-select
                v-model="selectedLanguages"
                multiple
                :placeholder="t('ocr.selectLanguages')"
                style="width: 100%"
              >
                <el-option
                  v-for="lang in availableLanguages"
                  :key="lang.value"
                  :label="lang.label"
                  :value="lang.value"
                />
              </el-select>
            </el-form-item>
          </div>

          <!-- 图片上传区域 -->
          <div class="upload-section">
            <el-upload
              :file-list="imageList"
              :auto-upload="false"
              :on-change="(file: any, fileList: any[]) => handleImageChange(file, fileList)"
              :on-remove="handleImageRemove"
              accept="image/*"
              drag
              multiple
            >
              <el-icon class="el-icon--upload"><upload-filled /></el-icon>
              <div class="el-upload__text">
                {{ t('ocr.uploadHint') }}
              </div>
              <template #tip>
                <div class="el-upload__tip">
                  {{ t('ocr.uploadTip') }}
                </div>
              </template>
            </el-upload>
            
            <!-- 剪切板粘贴 -->
            <div class="paste-section">
              <el-button @click="handlePasteFromClipboard">
                {{ t('ocr.pasteFromClipboard') }}
              </el-button>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="action-section" v-if="imageList.length > 0">
            <el-button 
              type="primary" 
              :loading="processing"
              @click="handleOcr"
            >
              {{ t('ocr.startOcr') }}
            </el-button>
            <el-button 
              :loading="processing"
              @click="handleReOcr"
              v-if="ocrResults.length > 0"
            >
              {{ t('ocr.reOcr') }}
            </el-button>
          </div>

          <!-- OCR结果展示 -->
          <div v-if="ocrResults.length > 0" class="result-section">
            <el-tabs v-model="activeTab">
              <el-tab-pane 
                v-for="(result, index) in ocrResults" 
                :key="index"
                :label="`${t('ocr.image')} ${index + 1}`"
                :name="`image-${index}`"
              >
                <div class="ocr-result-item">
                  <div class="image-section">
                    <div class="image-preview" @click="handleImageClick(result.imageUrl)">
                      <img :src="getImageDataUrlSync(result.imageUrl)" :alt="`Image ${index + 1}`" @error="handleImageError($event, result.imageUrl)" />
                    </div>
                    <div class="image-actions">
                      <el-button 
                        size="small" 
                        @click="handleCopyText(result.text)"
                      >
                        {{ t('ocr.copyText') }}
                      </el-button>
                    </div>
                  </div>
                  <div class="text-result">
                    <div class="text-content" :style="textContentStyle">
                      <div :ref="el => setTextEditorRef(el as HTMLElement | null, index)" class="text-editor-container"></div>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import SessionList from '../components/common/SessionList.vue'
import ImagePreviewDialog from '../components/common/ImagePreviewDialog.vue'
import type { SessionListItem } from '../components/common/SessionList.vue'
import { ocrSessionsDb, type OcrSession } from '../utils/db/tool-sessions-db'
import { i18n } from '../i18n'
import { themeState } from '../utils/themes'
import { setupMonacoWorker } from '../utils/monaco-worker-config'
import * as monaco from 'monaco-editor'

const { t } = useI18n()

const sessions = ref<SessionListItem[]>([])
const activeSessionId = ref<string | null>(null)
const activeSession = computed(() => {
  if (!activeSessionId.value) return null
  return sessions.value.find(s => s.id === activeSessionId.value) as any
})

const imageList = ref<any[]>([])
const selectedLanguages = ref<string[]>(['eng'])
const processing = ref(false)
const loadingSession = ref(false)
const ocrResults = ref<Array<{ imageUrl: string; text: string }>>([])
const activeTab = ref('image-0')
const imageDataUrlCache = ref<Map<string, string>>(new Map())
const textEditorRefs = ref<Map<number, HTMLElement>>(new Map())

// 图片预览对话框相关
const imagePreviewVisible = ref(false)
const previewImageUrl = ref<string>('')

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
  await nextTick()
  
  const container = textEditorRefs.value.get(index)
  if (!container) {
    console.warn(`编辑器容器 ${index} 未找到`)
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
    
    // 创建编辑器
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
    console.error('初始化文本编辑器失败:', error)
  }
}

// 更新编辑器内容（参考KnowledgeBase.vue的实现）
const updateEditorContent = (index: number): void => {
  const editor = getTextEditor(index)
  if (editor && ocrResults.value[index]) {
    try {
      const currentValue = editor.getValue()
      if (currentValue !== ocrResults.value[index].text) {
        editor.setValue(ocrResults.value[index].text || '')
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
    if (textEditorRefs.value.has(index)) {
      await initTextEditor(index)
      updateEditorContent(index)
    }
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
  })
  textEditorRefs.value.clear()
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
    activeSessionId.value = item.id
    const session = await ocrSessionsDb.getById(item.id)
    if (session) {
      if (session.images) {
        const images = JSON.parse(session.images)
        imageList.value = images.map((img: string) => {
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
            name: img.split(/[/\\]/).pop(),
            url: imageUrl,
            path: img
          }
        })
      }
      if (session.ocr_languages) {
        selectedLanguages.value = JSON.parse(session.ocr_languages)
      }
      if (session.ocr_results) {
        ocrResults.value = JSON.parse(session.ocr_results)
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
      uid: f.uid
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
        uid: f.uid
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
      uid: f.uid
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
    
    // 保存图片到临时目录
    const filePath = await ipcRenderer.invoke('save-reference-file', {
      filename: `clipboard-${Date.now()}.png`,
      content: clipboardImage.split(',')[1] // 移除data:image/png;base64,前缀
    }) as string
    
    // 添加到图片列表
    imageList.value.push({
      name: `clipboard-${Date.now()}.png`,
      url: filePath
    })
    
    // 更新数据库
    if (activeSessionId.value) {
      const currentImages = imageList.value.map(img => img.url || img.path).filter(Boolean)
      await ocrSessionsDb.update(activeSessionId.value, {
        images: JSON.stringify(currentImages)
      })
    }
    
    ElMessage.success(t('ocr.pasteSuccess'))
  } catch (error) {
    ElMessage.error('粘贴失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 执行OCR
const handleOcr = async () => {
  if (!activeSessionId.value || imageList.value.length === 0) {
    ElMessage.warning(t('ocr.noImages'))
    return
  }
  
  if (selectedLanguages.value.length === 0) {
    ElMessage.warning(t('ocr.noLanguages'))
    return
  }
  
  processing.value = true
  try {
    const results: Array<{ imageUrl: string; text: string }> = []
    
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
    
    // 对每张图片进行OCR
    for (const image of imageList.value) {
      const imagePath = image.url || image.path
      if (!imagePath) continue
      
      // 确保languages是数组格式，且只传递字符串数组（可序列化）
      const languages = Array.isArray(selectedLanguages.value) 
        ? [...selectedLanguages.value] // 创建新数组避免引用问题
        : []
      
      const ocrText = await ipcRenderer.invoke('ocr-recognize-file', {
        imagePath: String(imagePath), // 确保是字符串
        languages: languages // 传递可序列化的数组
      }) as string
      
      // 确保图片路径使用file://协议（Windows路径需要转换）
      let imageUrl = imagePath
      if (imagePath && !imagePath.startsWith('file://') && !imagePath.startsWith('http://') && !imagePath.startsWith('https://') && !imagePath.startsWith('data:')) {
        // Windows路径需要转换为file://协议
        imageUrl = imagePath.replace(/\\/g, '/')
        if (!imageUrl.startsWith('/')) {
          imageUrl = '/' + imageUrl
        }
        imageUrl = 'file://' + imageUrl
      }
      
      results.push({
        imageUrl: imageUrl,
        text: ocrText
      })
    }
    
    ocrResults.value = results
    
    // 保存结果
    await ocrSessionsDb.update(activeSessionId.value, {
      ocr_results: JSON.stringify(results),
      ocr_languages: JSON.stringify(selectedLanguages.value)
    })
    
    activeTab.value = 'image-0'
    ElMessage.success(t('ocr.ocrSuccess'))
  } catch (error) {
    ElMessage.error('OCR识别失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    processing.value = false
  }
}

// 重新识别
const handleReOcr = () => {
  ocrResults.value = []
  handleOcr()
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
  padding: 16px;
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
}

.language-section {
  margin-bottom: 16px;
}

.upload-section {
  margin-bottom: 24px;
}

.paste-section {
  margin-top: 16px;
  text-align: center;
}

.action-section {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-bottom: 24px;
}

.result-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
  gap: 16px;
  padding: 16px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
}

.image-section {
  flex: 0 0 300px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-width: 300px;
  height: 100%;
  max-height: 100%;
  gap: 12px;
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
  padding-top: 8px;
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

.text-editor-container {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

</style>



