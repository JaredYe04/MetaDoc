<template>
  <div class="ocr-window">
    <div class="main-container">
      <!-- 左侧会话列表 -->
      <SessionList
        :title="t('ocr.sessionsTitle', 'OCR会话')"
        :items="sessions"
        :active-index="activeSessionId"
        :disabled="processing || loadingSession"
        :create-button-tooltip="t('ocr.newSession', '新建会话')"
        :rename-label="t('common.rename', '重命名')"
        :duplicate-label="t('common.duplicate', '复制')"
        :delete-label="t('common.delete', '删除')"
        :rename-dialog-title="t('ocr.renameTitle', '重命名会话')"
        :rename-placeholder="t('ocr.renamePlaceholder', '请输入会话名称')"
        :cancel-label="t('common.cancel', '取消')"
        :confirm-label="t('common.confirm', '确认')"
        @create="handleCreateSession"
        @select="handleSelectSession"
        @rename="handleRenameSession"
        @duplicate="handleDuplicateSession"
        @delete="handleDeleteSession"
      />

      <!-- 右侧内容区域 -->
      <div class="content-area" :style="contentAreaStyle" v-loading="loadingSession">
        <div v-if="!activeSession" class="empty-state" :style="emptyStateStyle">
          <p>{{ t('ocr.noSessionSelected', '请选择一个会话或创建新会话') }}</p>
        </div>
        
        <div v-else class="session-content">
          <!-- 语言包选择 -->
          <div class="language-section">
            <el-form-item :label="t('ocr.languages', 'OCR语言包')">
              <el-select
                v-model="selectedLanguages"
                multiple
                :placeholder="t('ocr.selectLanguages', '选择语言包')"
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
              :on-change="handleImageChange"
              :on-remove="handleImageRemove"
              accept="image/*"
              drag
              multiple
            >
              <el-icon class="el-icon--upload"><upload-filled /></el-icon>
              <div class="el-upload__text">
                {{ t('ocr.uploadHint', '将图片拖到此处，或点击上传') }}
              </div>
              <template #tip>
                <div class="el-upload__tip">
                  {{ t('ocr.uploadTip', '支持 JPG、PNG、GIF、BMP 等格式，可多选') }}
                </div>
              </template>
            </el-upload>
            
            <!-- 剪切板粘贴 -->
            <div class="paste-section">
              <el-button @click="handlePasteFromClipboard">
                {{ t('ocr.pasteFromClipboard', '从剪切板粘贴图片') }}
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
              {{ t('ocr.startOcr', '开始识别') }}
            </el-button>
            <el-button 
              :loading="processing"
              @click="handleReOcr"
              v-if="ocrResults.length > 0"
            >
              {{ t('ocr.reOcr', '重新识别') }}
            </el-button>
          </div>

          <!-- OCR结果展示 -->
          <div v-if="ocrResults.length > 0" class="result-section">
            <el-tabs v-model="activeTab">
              <el-tab-pane 
                v-for="(result, index) in ocrResults" 
                :key="index"
                :label="`${t('ocr.image', '图片')} ${index + 1}`"
                :name="`image-${index}`"
              >
                <div class="ocr-result-item">
                  <div class="image-preview">
                    <img :src="result.imageUrl" :alt="`Image ${index + 1}`" />
                  </div>
                  <div class="text-result">
                    <div class="result-header">
                      <el-button 
                        size="small" 
                        @click="handleCopyText(result.text)"
                      >
                        {{ t('ocr.copyText', '复制文本') }}
                      </el-button>
                    </div>
                    <div class="text-content" :style="textContentStyle">
                      <pre :style="preStyle">{{ result.text }}</pre>
                    </div>
                  </div>
                </div>
              </el-tab-pane>
            </el-tabs>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import SessionList from '../components/common/SessionList.vue'
import type { SessionListItem } from '../components/common/SessionList.vue'
import { ocrSessionsDb, type OcrSession } from '../utils/db/tool-sessions-db'
import { i18n } from '../i18n'
import { themeState } from '../utils/themes'

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
  const locale = i18n.global.locale.value || 'zh_CN'
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
    const title = t('ocr.defaultTitle', '新OCR会话')
    
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
        imageList.value = images.map((img: string) => ({
          name: img.split(/[/\\]/).pop(),
          url: img
        }))
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
    ElMessage.success(t('common.duplicateSuccess', '复制成功'))
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
    ElMessage.success(t('common.deleteSuccess', '删除成功'))
  } catch (error) {
    ElMessage.error('删除失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 图片变化
const handleImageChange = async (file: any) => {
  if (!activeSessionId.value) {
    await handleCreateSession()
  }
  
  try {
    let filePath: string
    
    if (file.raw) {
      // 新上传的图片，保存到临时目录
      const fileContent = await file.raw.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(fileContent)))
      
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
      
      filePath = await ipcRenderer.invoke('save-reference-file', {
        filename: file.name,
        content: base64
      }) as string
    } else {
      filePath = file.url || file.path
    }
    
    if (activeSessionId.value && filePath) {
      const currentImages = imageList.value.map(img => img.url || img.path).filter(Boolean)
      currentImages.push(filePath)
      
      await ocrSessionsDb.update(activeSessionId.value, {
        images: JSON.stringify(currentImages)
      })
    }
  } catch (error) {
    ElMessage.error('保存图片失败: ' + (error instanceof Error ? error.message : String(error)))
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
      ElMessage.warning(t('ocr.noClipboardImage', '剪切板中没有图片'))
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
    
    ElMessage.success(t('ocr.pasteSuccess', '图片已从剪切板粘贴'))
  } catch (error) {
    ElMessage.error('粘贴失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 执行OCR
const handleOcr = async () => {
  if (!activeSessionId.value || imageList.value.length === 0) {
    ElMessage.warning(t('ocr.noImages', '请先上传图片'))
    return
  }
  
  if (selectedLanguages.value.length === 0) {
    ElMessage.warning(t('ocr.noLanguages', '请至少选择一个语言包'))
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
      
      const ocrText = await ipcRenderer.invoke('ocr-recognize-file', {
        imagePath,
        languages: selectedLanguages.value
      }) as string
      
      results.push({
        imageUrl: imagePath,
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
    ElMessage.success(t('ocr.ocrSuccess', '识别完成'))
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
    ElMessage.success(t('ocr.copySuccess', '文本已复制到剪切板'))
  } catch (error) {
    ElMessage.error('复制失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 主题样式
const contentAreaStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const emptyStateStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.6
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
  padding: 24px;
  overflow: auto;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.session-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
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
}

.ocr-result-item {
  display: flex;
  gap: 24px;
  padding: 16px;
}

.image-preview {
  flex: 0 0 300px;
}

.image-preview img {
  width: 100%;
  height: auto;
  border-radius: 8px;
}

.text-result {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.result-header {
  margin-bottom: 16px;
}

.text-content {
  flex: 1;
  padding: 16px;
  border-radius: 8px;
  overflow: auto;
}

.text-content pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>

