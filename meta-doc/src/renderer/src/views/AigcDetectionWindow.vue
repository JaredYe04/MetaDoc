<template>
  <div class="aigc-detection-window">
    <!-- 选择文档对话框 -->
    <el-dialog 
      v-model="selectDocumentDialogVisible" 
      :title="t('aigc.selectDocumentTitle', '选择要分析的文档')" 
      width="600"
      class="select-document-dialog"
    >
      <div class="select-document-content">
        <div class="select-document-header">
          <span class="selected-count">
            {{ selectedTabId ? `已选择 1 个文档` : '请选择要分析的文档' }}
          </span>
        </div>
        <el-scrollbar height="400px" class="document-list-scrollbar">
          <div class="document-list">
            <div
              v-for="tab in documentTabs"
              :key="tab.id"
              class="document-card"
              :class="{ 'selected': selectedTabId === tab.id }"
              @click="selectedTabId = tab.id"
            >
              <div class="document-card-content">
                <div class="document-card-header">
                  <el-icon class="document-icon"><Document /></el-icon>
                  <span class="document-title">{{ tab.displayName }}</span>
                </div>
                <div v-if="tab.path" class="document-path">
                  <el-icon class="path-icon"><Folder /></el-icon>
                  <span>{{ tab.path }}</span>
                </div>
                <div class="document-format">
                  <el-tag size="small" :type="tab.format === 'md' ? 'primary' : 'success'">
                    {{ tab.format === 'md' ? 'Markdown' : 'LaTeX' }}
                  </el-tag>
                </div>
              </div>
            </div>
            <div v-if="documentTabs.length === 0" class="empty-state">
              <el-empty :description="t('aigc.noDocuments', '没有打开的文档')" :image-size="80" />
            </div>
          </div>
        </el-scrollbar>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="selectDocumentDialogVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button 
            type="primary" 
            @click="confirmSelectDocument" 
            :disabled="!selectedTabId"
          >
            {{ t('common.confirm') }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <div class="main-container">
      <!-- 左侧会话列表 -->
      <SessionList
        :title="t('aigc.sessionsTitle')"
        :items="sessions"
        :active-index="activeSessionId || undefined"
        :disabled="analyzing || loadingSession || paraphrasing"
        :create-button-tooltip="t('aigc.newSession')"
        :rename-label="t('common.rename')"
        :duplicate-label="t('common.duplicate')"
        :delete-label="t('common.delete')"
        :rename-dialog-title="t('aigc.renameTitle')"
        :rename-placeholder="t('aigc.renamePlaceholder')"
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
          <p>{{ t('aigc.noSessionSelected') }}</p>
        </div>
        
        <div v-else class="session-content-panel" :style="panelStyle">
          <!-- 顶部工具栏 -->
          <div class="toolbar-section">
            <el-scrollbar class="toolbar-scrollbar" always>
              <div class="toolbar-content">
                <div class="toolbar-left">
                  <!-- 上传文件按钮 -->
                  <el-upload
                    ref="uploadRef"
                    :file-list="[]"
                    :auto-upload="false"
                    :on-change="handleFileChange"
                    :show-file-list="false"
                    :accept="acceptedFileTypes"
                  >
                    <template #trigger>
                      <el-button :icon="UploadFilled" :disabled="!!articleContent">
                        {{ t('aigc.uploadFile') }}
                      </el-button>
                    </template>
                  </el-upload>
                  
                  <!-- 从文档选择按钮 -->
                  <el-button 
                    :icon="Document" 
                    :disabled="!!articleContent || !hasActiveDocument"
                    @click="handleSelectFromDocument"
                  >
                    {{ t('aigc.selectFromDocument') }}
                  </el-button>
                  
                  <!-- 语言选择 -->
                  <el-select
                    v-model="selectedLanguage"
                    :placeholder="t('aigc.selectLanguage')"
                    size="default"
                    style="width: 120px"
                    :disabled="!!articleContent"
                  >
                    <el-option
                      v-for="lang in availableLanguages"
                      :key="lang.value"
                      :label="lang.label"
                      :value="lang.value"
                    />
                  </el-select>
                  
                  <!-- 领域选择 -->
                  <el-select
                    v-model="selectedDomain"
                    :placeholder="t('aigc.selectDomain')"
                    size="default"
                    style="width: 120px"
                    :disabled="!!articleContent"
                  >
                    <el-option
                      v-for="domain in availableDomains"
                      :key="domain.value"
                      :label="domain.label"
                      :value="domain.value"
                    />
                  </el-select>
                </div>
                
                <div class="toolbar-right">
                  <!-- 开始分析按钮 -->
                  <el-button 
                    v-if="articleContent && !overallAnalysis"
                    type="primary" 
                    :loading="analyzing"
                    @click="handleAnalyze"
                  >
                    {{ t('aigc.startAnalysis') }}
                  </el-button>
                  
                  <!-- 重新分析按钮 -->
                  <el-button 
                    v-if="articleContent && overallAnalysis"
                    :loading="analyzing"
                    @click="handleReAnalyze"
                  >
                    {{ t('aigc.reAnalyze') }}
                  </el-button>
                  
                  <!-- 生成报告按钮 -->
                  <el-button 
                    v-if="overallAnalysis && paragraphAnalyses.length > 0"
                    :loading="generatingReport"
                    @click="handleGenerateReport"
                  >
                    {{ t('aigc.generateReport') }}
                  </el-button>
                </div>
              </div>
            </el-scrollbar>
          </div>
          
          <!-- 主内容区域 -->
          <div v-if="articleContent" class="main-content">
            <!-- 左侧：Monaco编辑器显示文章内容 -->
            <div class="editor-section">
              <div class="editor-header">
                <span>{{ t('aigc.articleContent') }}</span>
                <el-button 
                  v-if="overallAnalysis"
                  size="small"
                  :loading="paraphrasing"
                  @click="handleParaphraseAll"
                >
                  {{ t('aigc.paraphraseAll') }}
                </el-button>
              </div>
              <div 
                :ref="el => setEditorRef(el as HTMLElement | null)" 
                class="monaco-editor-container"
              ></div>
            </div>
            
            <!-- 右侧：报告预览 -->
            <div class="report-section">
              <div class="report-header">
                <span>{{ t('aigc.analysisReport') }}</span>
              </div>
              <el-scrollbar class="report-scrollbar" v-if="reportMarkdown">
                <VditorPreview :markdown="reportMarkdown" />
              </el-scrollbar>
              <div v-else class="report-placeholder">
                <p v-if="!overallAnalysis">{{ t('aigc.noAnalysisYet') }}</p>
                <p v-else>{{ t('aigc.clickGenerateReport') }}</p>
              </div>
            </div>
          </div>
          
          <!-- 空状态：提示上传或选择内容 -->
          <div v-else class="empty-content">
            <p>{{ t('aigc.pleaseUploadOrSelect') }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UploadFilled, Document, Folder } from '@element-plus/icons-vue'
import SessionList from '../components/common/SessionList.vue'
import type { SessionListItem } from '../components/common/SessionList.vue'
import { aigcDetectionSessionsDb, type AigcDetectionSession } from '../utils/db/tool-sessions-db'
import { themeState } from '../utils/themes'
import { setupMonacoWorker } from '../utils/monaco-worker-config'
import * as monaco from 'monaco-editor'
import { createAiTask, ai_types } from '../utils/ai_tasks'
import type { AIDialogMessage } from '@/types'
import { buildSchemaPrompt, parseSchemaJson, AIGC_ANALYSIS_SCHEMA, type AigcAnalysisResult, type AigcDimensionScore } from '../utils/schemas'
import { referenceAdapterManager } from '../utils/agent-framework/reference-adapters'
import { useActiveDocument } from '../composables/useActiveDocument'
import { useWorkspace } from '../stores/workspace'
import VditorPreview from '../components/VditorPreview.vue'
import { ref as vueRef } from 'vue'

const { t } = useI18n()
const { activeDocument, activeTab } = useActiveDocument()
const workspace = useWorkspace()

const sessions = ref<SessionListItem[]>([])
const activeSessionId = ref<string | null>(null)
const activeSession = computed(() => {
  if (!activeSessionId.value) return null
  return sessions.value.find(s => s.id === activeSessionId.value) as any
})

const uploadRef = ref<any>(null)
const articleContent = ref<string>('')
const selectedLanguage = ref<string>('zh')
const selectedDomain = ref<string>('academic')
const analyzing = ref(false)
const loadingSession = ref(false)
const generatingReport = ref(false)
const paraphrasing = ref(false)

const overallAnalysis = ref<AigcAnalysisResult | null>(null)
const paragraphAnalyses = ref<Array<{ index: number; text: string; analysis: AigcAnalysisResult }>>([])
const reportMarkdown = ref<string>('')

const editorRef = ref<HTMLElement | null>(null)
let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null

// 可用语言列表
const availableLanguages = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' }
]

// 可用领域列表
const availableDomains = [
  { value: 'academic', label: t('aigc.domainAcademic') },
  { value: 'general', label: t('aigc.domainGeneral') }
]

// 接受的文件类型
const acceptedFileTypes = '.pdf,.doc,.docx,.txt,.md,.html,.htm'

// 选择文档对话框相关
const selectDocumentDialogVisible = ref(false)
const selectedTabId = ref<string | null>(null)

// 获取文档tabs列表
interface DocumentTabItem {
  id: string
  displayName: string
  path: string
  format: 'md' | 'tex'
}

const documentTabs = computed<DocumentTabItem[]>(() => {
  return workspace.tabs
    .filter(tab => (tab.kind === 'file' || tab.kind === 'new') && tab.id)
    .map(tab => {
      try {
        const doc = workspace.ensureDocument(tab.id)
        if (!doc || (doc.format !== 'md' && doc.format !== 'tex')) {
          return null
        }
        
        let displayName = ''
        if (tab.title && tab.title.trim() && tab.title !== '未命名文档') {
          displayName = tab.title.trim()
        } else if (tab.path) {
          const segments = tab.path.split(/[/\\]+/).filter(Boolean)
          displayName = segments[segments.length - 1] || tab.path
        } else {
          displayName = t('workspace.untitledDocument', '未命名文档')
        }
        
        return {
          id: String(tab.id),
          displayName,
          path: tab.path || '',
          format: doc.format as 'md' | 'tex'
        }
      } catch (error) {
        return null
      }
    })
    .filter((tab): tab is DocumentTabItem => tab !== null)
})

// 检查是否有活动的文档tab
// 注意：我们需要检查是否有任何文档tab，而不是当前激活的tab
// 因为当前激活的tab可能是AIGC检测窗口本身（tool类型）
const hasActiveDocument = computed(() => {
  return documentTabs.value.length > 0
})

// 设置编辑器引用
const setEditorRef = (el: HTMLElement | null) => {
  if (el) {
    editorRef.value = el
    nextTick(() => {
      initEditor()
    })
  } else {
    if (editorInstance) {
      editorInstance.dispose()
      editorInstance = null
    }
    editorRef.value = null
  }
}

// 初始化Monaco编辑器
const initEditor = async () => {
  if (!editorRef.value) return
  
  await nextTick()
  await nextTick()
  
  if (!editorRef.value || editorRef.value.offsetWidth === 0 || editorRef.value.offsetHeight === 0) {
    setTimeout(() => {
      initEditor()
    }, 100)
    return
  }
  
  if (editorInstance) {
    editorInstance.dispose()
  }
  
  try {
    setupMonacoWorker()
    
    const isDark = themeState.currentTheme.type === 'dark'
    editorInstance = monaco.editor.create(editorRef.value, {
      value: articleContent.value || '',
      language: 'plaintext',
      theme: isDark ? 'vs-dark' : 'vs',
      readOnly: false,
      automaticLayout: true,
      fontSize: 14,
      lineNumbers: 'on',
      wordWrap: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontFamily: "'JetBrains Mono', 'Consolas', monospace"
    })
    
    // 监听内容变化
    editorInstance.onDidChangeModelContent(() => {
      if (editorInstance) {
        articleContent.value = editorInstance.getValue()
      }
    })
    
    // 添加点击事件监听，用于跳转到报告
    editorInstance.onMouseDown((e) => {
      if (e.target && e.target.position) {
        handleEditorClick(e.target.position.lineNumber)
      }
    })
  } catch (error) {
    console.error('初始化编辑器失败:', error)
  }
}

// 更新编辑器内容
const updateEditorContent = () => {
  if (editorInstance && articleContent.value !== undefined) {
    const currentValue = editorInstance.getValue()
    if (currentValue !== articleContent.value) {
      editorInstance.setValue(articleContent.value || '')
    }
  }
}

// 监听文章内容变化
watch(() => articleContent.value, () => {
  updateEditorContent()
  updateEditorDecorations()
})

// 更新编辑器装饰（高亮不同段落）
const updateEditorDecorations = () => {
  if (!editorInstance || paragraphAnalyses.value.length === 0) return
  
  const decorations: monaco.editor.IModelDeltaDecoration[] = []
  const text = articleContent.value
  const model = editorInstance.getModel()
  if (!model) return
  
  // 使用与分析时相同的段落分割方式
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim())
  
  paragraphAnalyses.value.forEach((paraAnalysis) => {
    const index = paraAnalysis.index
    if (index < paragraphs.length) {
      // 找到段落在文本中的位置
      let startOffset = 0
      for (let i = 0; i < index; i++) {
        // 计算前面所有段落的长度，包括分隔符
        const paraText = paragraphs[i]
        const lines = paraText.split('\n')
        startOffset += lines.length
        // 添加段落之间的空行（至少2行）
        startOffset += 2
      }
      
      // 计算当前段落的行数
      const paraText = paragraphs[index]
      const paraLines = paraText.split('\n')
      const endOffset = startOffset + paraLines.length
      
      // 根据风险等级设置颜色
      const riskLevel = paraAnalysis.analysis.risk_level
      let className = 'aigc-low-risk'
      if (riskLevel === 'HIGH') {
        className = 'aigc-high-risk'
      } else if (riskLevel === 'MEDIUM') {
        className = 'aigc-medium-risk'
      }
      
      // 确保行号在有效范围内
      const startLine = Math.max(1, startOffset + 1)
      const endLine = Math.min(model.getLineCount(), endOffset)
      
      if (startLine <= endLine) {
        decorations.push({
          range: new monaco.Range(startLine, 1, endLine, 1),
          options: {
            isWholeLine: true,
            className: className,
            minimap: {
              color: riskLevel === 'HIGH' ? 'rgba(245, 108, 108, 0.3)' : 
                     riskLevel === 'MEDIUM' ? 'rgba(230, 162, 60, 0.3)' : 
                     'rgba(103, 194, 58, 0.3)',
              position: monaco.editor.MinimapPosition.Inline
            }
          }
        })
      }
    }
  })
  
  editorInstance.deltaDecorations([], decorations)
}

// 处理编辑器点击（跳转到报告对应位置）
const handleEditorClick = (lineNumber: number) => {
  if (!reportMarkdown.value || paragraphAnalyses.value.length === 0) return
  
  // 找到对应的段落
  const text = articleContent.value
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim())
  const lines = text.split('\n')
  let currentLine = 0
  let paragraphIndex = -1
  
  for (let i = 0; i < paragraphs.length; i++) {
    const paraLines = paragraphs[i].split('\n').length
    if (lineNumber >= currentLine && lineNumber < currentLine + paraLines) {
      paragraphIndex = i
      break
    }
    currentLine += paraLines + 1 // +1 for empty line
  }
  
  if (paragraphIndex >= 0 && paragraphIndex < paragraphAnalyses.value.length) {
    // 滚动到报告中的对应段落
    const reportElement = document.querySelector('.report-scrollbar')
    if (reportElement) {
      const targetId = `paragraph-${paragraphIndex}`
      const targetElement = reportElement.querySelector(`#${targetId}`)
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }
}

// 监听主题变化
watch(() => themeState.currentTheme.type, (newType) => {
  monaco.editor.setTheme(newType === 'dark' ? 'vs-dark' : 'vs')
})

// 清理编辑器
onBeforeUnmount(() => {
  if (editorInstance) {
    editorInstance.dispose()
    editorInstance = null
  }
})

// 加载会话列表
const loadSessions = async () => {
  try {
    const dbSessions = await aigcDetectionSessionsDb.getAll()
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
    const id = `aigc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const title = t('aigc.defaultTitle')
    
    await aigcDetectionSessionsDb.create({
      id,
      title,
      description: '',
      article_content: undefined,
      content_source: undefined,
      source_file_path: undefined,
      source_tab_id: undefined,
      overall_analysis: undefined,
      paragraph_analyses: undefined,
      report_markdown: undefined,
      language: selectedLanguage.value,
      domain: selectedDomain.value
    })
    
    await loadSessions()
    activeSessionId.value = id
    articleContent.value = ''
    overallAnalysis.value = null
    paragraphAnalyses.value = []
    reportMarkdown.value = ''
  } catch (error) {
    ElMessage.error('创建会话失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 选择会话
const handleSelectSession = async (item: SessionListItem) => {
  if (loadingSession.value) return
  
  loadingSession.value = true
  
  try {
    activeSessionId.value = item.id
    const session = await aigcDetectionSessionsDb.getById(item.id)
    if (session) {
      articleContent.value = session.article_content || ''
      selectedLanguage.value = session.language || 'zh'
      selectedDomain.value = session.domain || 'academic'
      
      if (session.overall_analysis) {
        overallAnalysis.value = JSON.parse(session.overall_analysis)
      } else {
        overallAnalysis.value = null
      }
      
      if (session.paragraph_analyses) {
        paragraphAnalyses.value = JSON.parse(session.paragraph_analyses)
      } else {
        paragraphAnalyses.value = []
      }
      
      reportMarkdown.value = session.report_markdown || ''
      
      await nextTick()
      updateEditorContent()
      updateEditorDecorations()
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
    await aigcDetectionSessionsDb.update(item.id, { title: newTitle })
    await loadSessions()
  } catch (error) {
    ElMessage.error('重命名失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 复制会话
const handleDuplicateSession = async (item: SessionListItem) => {
  try {
    const session = await aigcDetectionSessionsDb.getById(item.id)
    if (!session) return
    
    const id = `aigc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    await aigcDetectionSessionsDb.create({
      id,
      title: session.title + ' (副本)',
      description: session.description,
      article_content: session.article_content,
      content_source: session.content_source,
      source_file_path: session.source_file_path,
      source_tab_id: session.source_tab_id,
      overall_analysis: session.overall_analysis,
      paragraph_analyses: session.paragraph_analyses,
      report_markdown: session.report_markdown,
      language: session.language || 'zh',
      domain: session.domain || 'academic'
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
    await aigcDetectionSessionsDb.delete(item.id)
    await loadSessions()
    if (activeSessionId.value === item.id) {
      activeSessionId.value = null
      articleContent.value = ''
      overallAnalysis.value = null
      paragraphAnalyses.value = []
      reportMarkdown.value = ''
    }
    ElMessage.success(t('common.deleteSuccess'))
  } catch (error) {
    ElMessage.error('删除失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 处理文件上传
const handleFileChange = async (file: any) => {
  if (!activeSessionId.value) {
    await handleCreateSession()
  }
  
  try {
    const fileContent = await file.raw.arrayBuffer()
    const fileName = file.name
    const fileExt = fileName.split('.').pop()?.toLowerCase() || ''
    
    // 获取 IPC 渲染器
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
    
    // 先将文件保存到 reference 目录（因为某些 adapter 需要文件路径）
    const uint8Array = new Uint8Array(fileContent)
    const chunkSize = 8192 // 8KB chunks
    let base64 = ''
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize)
      base64 += String.fromCharCode.apply(null, Array.from(chunk))
    }
    base64 = btoa(base64)
    
    const filePath = await ipcRenderer.invoke('save-reference-file', {
      filename: fileName,
      content: base64
    }) as string
    
    if (!filePath) {
      throw new Error('保存文件失败')
    }
    
    // 使用 reference adapter 解析文件（使用文件路径）
    const adapter = referenceAdapterManager.getAdapter(fileExt)
    if (!adapter) {
      ElMessage.error(t('aigc.unsupportedFileType'))
      return
    }
    
    // 使用文件路径解析（adapter 会处理文件路径）
    const parsedContent = await adapter.parse(filePath, fileExt)
    articleContent.value = parsedContent
    
    // 保存到数据库
    if (activeSessionId.value) {
      await aigcDetectionSessionsDb.update(activeSessionId.value, {
        article_content: articleContent.value,
        content_source: 'file',
        source_file_path: filePath
      })
    }
    
    await nextTick()
    updateEditorContent()
    
    ElMessage.success(t('aigc.fileUploaded'))
  } catch (error) {
    ElMessage.error('上传文件失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 从文档选择内容（显示对话框）
const handleSelectFromDocument = async () => {
  if (!activeSessionId.value) {
    await handleCreateSession()
  }
  
  // 检查是否有可用的文档
  if (documentTabs.value.length === 0) {
    ElMessage.warning(t('aigc.noActiveDocument'))
    return
  }
  
  // 显示选择对话框
  selectedTabId.value = null
  selectDocumentDialogVisible.value = true
}

// 确认选择文档
const confirmSelectDocument = async () => {
  if (!selectedTabId.value) {
    ElMessage.warning(t('aigc.pleaseSelectDocument', '请选择一个文档'))
    return
  }
  
  try {
    const tab = workspace.tabs.find(t => String(t.id) === selectedTabId.value)
    if (!tab) {
      ElMessage.error(t('aigc.documentNotFound', '文档不存在'))
      return
    }
    
    const doc = workspace.ensureDocument(tab.id)
    if (!doc || (doc.format !== 'md' && doc.format !== 'tex')) {
      ElMessage.error(t('aigc.unsupportedFormat', '不支持的文档格式'))
      return
    }
    
    // 获取文档内容
    let content = ''
    if (doc.format === 'md') {
      content = doc.markdown || ''
    } else if (doc.format === 'tex') {
      content = doc.tex || ''
    }
    
    if (!content.trim()) {
      ElMessage.warning(t('aigc.documentEmpty'))
      return
    }
    
    articleContent.value = content
    
    // 保存到数据库
    if (activeSessionId.value) {
      await aigcDetectionSessionsDb.update(activeSessionId.value, {
        article_content: articleContent.value,
        content_source: 'document',
        source_tab_id: tab.id
      })
    }
    
    // 关闭对话框
    selectDocumentDialogVisible.value = false
    selectedTabId.value = null
    
    await nextTick()
    updateEditorContent()
    
    ElMessage.success(t('aigc.contentSelected'))
  } catch (error) {
    ElMessage.error('选择内容失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 开始分析
const handleAnalyze = async () => {
  if (!activeSessionId.value || !articleContent.value.trim()) {
    ElMessage.warning(t('aigc.noContent'))
    return
  }
  
  analyzing.value = true
  
  try {
    // 分段分析
    const paragraphs = articleContent.value.split(/\n\s*\n/).filter(p => p.trim())
    const analyses: Array<{ index: number; text: string; analysis: AigcAnalysisResult }> = []
    
    // 分析每个段落
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i].trim()
      if (!paragraph) continue
      
      try {
        const analysis = await analyzeParagraph(paragraph, i + 1, paragraphs.length)
        analyses.push({
          index: i,
          text: paragraph,
          analysis
        })
      } catch (error) {
        console.error(`段落 ${i + 1} 分析失败:`, error)
      }
    }
    
    paragraphAnalyses.value = analyses
    
    // 总体分析
    const overall = await analyzeOverall(paragraphs, analyses)
    overallAnalysis.value = overall
    
    // 保存到数据库
    if (activeSessionId.value) {
      await aigcDetectionSessionsDb.update(activeSessionId.value, {
        overall_analysis: JSON.stringify(overall),
        paragraph_analyses: JSON.stringify(analyses)
      })
    }
    
    await nextTick()
    updateEditorDecorations()
    
    ElMessage.success(t('aigc.analysisComplete'))
  } catch (error) {
    ElMessage.error('分析失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    analyzing.value = false
  }
}

// 重新分析
const handleReAnalyze = async () => {
  await handleAnalyze()
}

// 分析单个段落
const analyzeParagraph = async (
  text: string, 
  paragraphIndex: number, 
  totalParagraphs: number
): Promise<AigcAnalysisResult> => {
  const prompt = buildAigcAnalysisPrompt(text, selectedLanguage.value, selectedDomain.value, true)
  const schemaPrompt = buildSchemaPrompt(AIGC_ANALYSIS_SCHEMA, prompt)
  
  const resultRef = vueRef('')
  const originKey = `aigc-paragraph-${paragraphIndex}-${Date.now()}`
  
  const messages: AIDialogMessage[] = [{
    role: 'user',
    content: schemaPrompt
  }]
  
  const { done } = createAiTask(
    t('aigc.analyzingParagraph', { index: paragraphIndex, total: totalParagraphs }),
    messages,
    resultRef,
    ai_types.chat,
    originKey,
    { stream: true }
  )
  
  await done
  
  return parseSchemaJson<AigcAnalysisResult>(resultRef.value, AIGC_ANALYSIS_SCHEMA)
}

// 总体分析
const analyzeOverall = async (
  paragraphs: string[],
  paragraphAnalyses: Array<{ index: number; text: string; analysis: AigcAnalysisResult }>
): Promise<AigcAnalysisResult> => {
  // 计算加权平均
  const weights = {
    sentence_uniformity: 0.15,
    lexical_diversity: 0.15,
    reasoning_smoothness: 0.2,
    personal_trace: -0.2, // 负权重，因为个人痕迹越多，风险越低
    stylistic_risk: 0.2,
    over_explanation: 0.05,
    hedging_pattern: 0.05
  }
  
  const dimensionScores: AigcDimensionScore = {
    sentence_uniformity: 0,
    lexical_diversity: 0,
    reasoning_smoothness: 0,
    personal_trace: 0,
    stylistic_risk: 0,
    over_explanation: 0,
    hedging_pattern: 0
  }
  
  // 计算各维度的平均值
  paragraphAnalyses.forEach(pa => {
    dimensionScores.sentence_uniformity += pa.analysis.sentence_uniformity
    dimensionScores.lexical_diversity += pa.analysis.lexical_diversity
    dimensionScores.reasoning_smoothness += pa.analysis.reasoning_smoothness
    dimensionScores.personal_trace += pa.analysis.personal_trace
    dimensionScores.stylistic_risk += pa.analysis.stylistic_risk
    dimensionScores.over_explanation += pa.analysis.over_explanation
    dimensionScores.hedging_pattern += pa.analysis.hedging_pattern
  })
  
  const count = paragraphAnalyses.length || 1
  dimensionScores.sentence_uniformity /= count
  dimensionScores.lexical_diversity /= count
  dimensionScores.reasoning_smoothness /= count
  dimensionScores.personal_trace /= count
  dimensionScores.stylistic_risk /= count
  dimensionScores.over_explanation /= count
  dimensionScores.hedging_pattern /= count
  
  // 计算总分
  let overallRisk = 0
  overallRisk += dimensionScores.sentence_uniformity * weights.sentence_uniformity
  overallRisk += dimensionScores.lexical_diversity * weights.lexical_diversity
  overallRisk += dimensionScores.reasoning_smoothness * weights.reasoning_smoothness
  overallRisk += dimensionScores.personal_trace * weights.personal_trace
  overallRisk += dimensionScores.stylistic_risk * weights.stylistic_risk
  overallRisk += dimensionScores.over_explanation * weights.over_explanation
  overallRisk += dimensionScores.hedging_pattern * weights.hedging_pattern
  
  overallRisk = Math.max(0, Math.min(100, overallRisk * 10))
  
  // 确定风险等级
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW'
  if (overallRisk >= 70) {
    riskLevel = 'HIGH'
  } else if (overallRisk >= 40) {
    riskLevel = 'MEDIUM'
  }
  
  // 收集所有建议
  const allSuggestions = new Set<string>()
  paragraphAnalyses.forEach(pa => {
    pa.analysis.concise_suggestions.forEach(s => allSuggestions.add(s))
  })
  
  return {
    ...dimensionScores,
    overall_aigc_risk: Math.round(overallRisk),
    risk_level: riskLevel,
    concise_suggestions: Array.from(allSuggestions).slice(0, 10) // 最多10条建议
  }
}

// 构建AIGC分析提示词
const buildAigcAnalysisPrompt = (
  text: string,
  language: string,
  domain: string,
  isParagraph: boolean = false
): string => {
  const langName = language === 'zh' ? '中文' : language === 'en' ? 'English' : language
  const domainName = domain === 'academic' ? '学术' : '通用'
  const scope = isParagraph ? '段落' : '全文'
  
  return `你是一个学术写作分析 agent。

请从"写作行为特征"的角度，而非判断作者身份，对下列${scope}进行评估。

评估目标：
判断${scope}中是否存在明显的 AIGC 风格风险特征。

请从以下维度进行 0-10 打分（10 表示高度符合 AI 风格）：
- sentence_uniformity: 句式是否过于统一
- lexical_diversity: 词汇是否重复、保守
- reasoning_smoothness: 逻辑是否过于平滑
- personal_trace: 是否存在个人思考痕迹（10表示缺乏个人痕迹）
- stylistic_risk: 是否符合常见 AIGC 模板
- over_explanation: 是否"教科书式解释"
- hedging_pattern: 是否大量使用模糊限定词

语言：${langName}
领域：${domainName}

${scope}如下：

<<<TEXT>>>
${text}
<<<TEXT>>>`
}

// 生成报告
const handleGenerateReport = async () => {
  if (!overallAnalysis.value || paragraphAnalyses.value.length === 0) {
    ElMessage.warning(t('aigc.noAnalysisData'))
    return
  }
  
  generatingReport.value = true
  
  try {
    const report = generateReportMarkdown(overallAnalysis.value, paragraphAnalyses.value)
    reportMarkdown.value = report
    
    // 保存到数据库
    if (activeSessionId.value) {
      await aigcDetectionSessionsDb.update(activeSessionId.value, {
        report_markdown: report
      })
    }
    
    ElMessage.success(t('aigc.reportGenerated'))
  } catch (error) {
    ElMessage.error('生成报告失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    generatingReport.value = false
  }
}

// 生成Markdown报告
const generateReportMarkdown = (
  overall: AigcAnalysisResult,
  paragraphs: Array<{ index: number; text: string; analysis: AigcAnalysisResult }>
): string => {
  // 生成雷达图数据
  const radarData = {
    indicator: [
      { name: '句式统一性', max: 10 },
      { name: '词汇多样性', max: 10 },
      { name: '逻辑平滑度', max: 10 },
      { name: '个人痕迹', max: 10 },
      { name: '风格风险', max: 10 },
      { name: '过度解释', max: 10 },
      { name: '模糊限定', max: 10 }
    ],
    series: [{
      name: '总体评分',
      value: [
        overall.sentence_uniformity,
        overall.lexical_diversity,
        overall.reasoning_smoothness,
        overall.personal_trace,
        overall.stylistic_risk,
        overall.over_explanation,
        overall.hedging_pattern
      ]
    }]
  }
  
  // 生成风险等级颜色
  const riskColor = overall.risk_level === 'HIGH' ? '#f56c6c' : 
                    overall.risk_level === 'MEDIUM' ? '#e6a23c' : '#67c23a'
  
  let markdown = `# AIGC 风格风险评估报告\n\n`
  
  // 总体分析
  markdown += `## 总体分析\n\n`
  markdown += `### 风险评分\n\n`
  markdown += `<div style="text-align: center; margin: 20px 0;">\n`
  markdown += `<div style="font-size: 48px; font-weight: bold; color: ${riskColor};">${overall.overall_aigc_risk}</div>\n`
  markdown += `<div style="font-size: 18px; color: ${riskColor}; margin-top: 10px;">风险等级：${overall.risk_level === 'HIGH' ? '高' : overall.risk_level === 'MEDIUM' ? '中' : '低'}</div>\n`
  markdown += `</div>\n\n`
  
  // 雷达图
  markdown += `### 各维度雷达图\n\n`
  markdown += `\`\`\`echarts\n`
  markdown += JSON.stringify({
    radar: {
      indicator: radarData.indicator
    },
    series: [{
      type: 'radar',
      data: radarData.series,
      areaStyle: {
        opacity: 0.3
      }
    }]
  }, null, 2)
  markdown += `\n\`\`\`\n\n`
  
  // 维度评分表格
  markdown += `### 维度评分详情\n\n`
  markdown += `| 维度 | 评分 | 说明 |\n`
  markdown += `|------|------|------|\n`
  markdown += `| 句式统一性 | ${overall.sentence_uniformity.toFixed(1)} | ${overall.sentence_uniformity >= 7 ? '⚠️ 句式过于统一' : overall.sentence_uniformity >= 4 ? '⚠️ 句式较为统一' : '✓ 句式变化丰富'} |\n`
  markdown += `| 词汇多样性 | ${overall.lexical_diversity.toFixed(1)} | ${overall.lexical_diversity >= 7 ? '⚠️ 词汇重复、保守' : overall.lexical_diversity >= 4 ? '⚠️ 词汇使用较为保守' : '✓ 词汇使用多样'} |\n`
  markdown += `| 逻辑平滑度 | ${overall.reasoning_smoothness.toFixed(1)} | ${overall.reasoning_smoothness >= 7 ? '⚠️ 逻辑过于平滑' : overall.reasoning_smoothness >= 4 ? '⚠️ 逻辑较为平滑' : '✓ 逻辑自然'} |\n`
  markdown += `| 个人痕迹 | ${overall.personal_trace.toFixed(1)} | ${overall.personal_trace >= 7 ? '⚠️ 缺乏个人思考痕迹' : overall.personal_trace >= 4 ? '⚠️ 个人痕迹较少' : '✓ 个人思考痕迹明显'} |\n`
  markdown += `| 风格风险 | ${overall.stylistic_risk.toFixed(1)} | ${overall.stylistic_risk >= 7 ? '⚠️ 高度符合AIGC模板' : overall.stylistic_risk >= 4 ? '⚠️ 部分符合AIGC模板' : '✓ 风格自然'} |\n`
  markdown += `| 过度解释 | ${overall.over_explanation.toFixed(1)} | ${overall.over_explanation >= 7 ? '⚠️ 教科书式解释' : overall.over_explanation >= 4 ? '⚠️ 解释较为详细' : '✓ 解释适度'} |\n`
  markdown += `| 模糊限定 | ${overall.hedging_pattern.toFixed(1)} | ${overall.hedging_pattern >= 7 ? '⚠️ 大量使用模糊限定词' : overall.hedging_pattern >= 4 ? '⚠️ 使用较多模糊限定词' : '✓ 模糊限定词使用适度'} |\n\n`
  
  // 修改建议
  markdown += `### 修改建议\n\n`
  overall.concise_suggestions.forEach((suggestion, index) => {
    markdown += `${index + 1}. ${suggestion}\n`
  })
  markdown += `\n`
  
  // 分段分析
  markdown += `## 分段分析\n\n`
  paragraphs.forEach((para, index) => {
    const paraRiskColor = para.analysis.risk_level === 'HIGH' ? '#f56c6c' : 
                          para.analysis.risk_level === 'MEDIUM' ? '#e6a23c' : '#67c23a'
    
    markdown += `### 段落 ${index + 1} {#paragraph-${index}}\n\n`
    markdown += `**风险评分：** <span style="color: ${paraRiskColor}; font-weight: bold;">${para.analysis.overall_aigc_risk}</span> (${para.analysis.risk_level === 'HIGH' ? '高' : para.analysis.risk_level === 'MEDIUM' ? '中' : '低'})\n\n`
    markdown += `**段落内容：**\n\n`
    markdown += `> ${para.text.split('\n').join('\n> ')}\n\n`
    markdown += `**维度评分：**\n\n`
    markdown += `- 句式统一性：${para.analysis.sentence_uniformity.toFixed(1)}\n`
    markdown += `- 词汇多样性：${para.analysis.lexical_diversity.toFixed(1)}\n`
    markdown += `- 逻辑平滑度：${para.analysis.reasoning_smoothness.toFixed(1)}\n`
    markdown += `- 个人痕迹：${para.analysis.personal_trace.toFixed(1)}\n`
    markdown += `- 风格风险：${para.analysis.stylistic_risk.toFixed(1)}\n`
    markdown += `- 过度解释：${para.analysis.over_explanation.toFixed(1)}\n`
    markdown += `- 模糊限定：${para.analysis.hedging_pattern.toFixed(1)}\n\n`
    
    if (para.analysis.concise_suggestions.length > 0) {
      markdown += `**修改建议：**\n\n`
      para.analysis.concise_suggestions.forEach((suggestion, i) => {
        markdown += `${i + 1}. ${suggestion}\n`
      })
      markdown += `\n`
    }
    
    markdown += `---\n\n`
  })
  
  // 结论
  markdown += `## 结论\n\n`
  if (overall.risk_level === 'HIGH') {
    markdown += `本文存在较高的 AIGC 风格风险。建议进行较大幅度的改写，特别是：\n\n`
  } else if (overall.risk_level === 'MEDIUM') {
    markdown += `本文存在中等的 AIGC 风格风险。建议进行适度调整，重点关注：\n\n`
  } else {
    markdown += `本文的 AIGC 风格风险较低，但仍有改进空间。建议：\n\n`
  }
  
  overall.concise_suggestions.slice(0, 3).forEach((suggestion, index) => {
    markdown += `${index + 1}. ${suggestion}\n`
  })
  
  return markdown
}

// Paraphrase全部内容
const handleParaphraseAll = async () => {
  if (!articleContent.value.trim()) {
    ElMessage.warning(t('aigc.noContent'))
    return
  }
  
  paraphrasing.value = true
  
  try {
    const prompt = buildParaphrasePrompt(articleContent.value, selectedLanguage.value, selectedDomain.value)
    const resultRef = vueRef('')
    const originKey = `aigc-paraphrase-${Date.now()}`
    
    const messages: AIDialogMessage[] = [{
      role: 'user',
      content: prompt
    }]
    
    const { done } = createAiTask(
      t('aigc.paraphrasing'),
      messages,
      resultRef,
      ai_types.chat,
      originKey,
      { stream: true }
    )
    
    await done
    
    articleContent.value = resultRef.value.trim()
    
    // 更新编辑器
    await nextTick()
    updateEditorContent()
    
    // 保存到数据库
    if (activeSessionId.value) {
      await aigcDetectionSessionsDb.update(activeSessionId.value, {
        article_content: articleContent.value
      })
    }
    
    ElMessage.success(t('aigc.paraphraseSuccess'))
  } catch (error) {
    ElMessage.error('改写失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    paraphrasing.value = false
  }
}

// 构建Paraphrase提示词
const buildParaphrasePrompt = (text: string, language: string, domain: string): string => {
  const langName = language === 'zh' ? '中文' : language === 'en' ? 'English' : language
  const domainName = domain === 'academic' ? '学术' : '通用'
  
  return `请对下列文本进行改写，目标不是降重，而是降低 AIGC 风格风险：

要求：
- 改变句式结构与语序
- 引入更具体或局部的推理表达
- 保留${domainName}严谨性，但避免模板化语句
- 允许句子长短不均
- 不要使用"本文将…"、"因此可以看出"等常见 AI 过渡语
- 增加个人思考痕迹和具体判断
- 减少模糊限定词的使用

语言：${langName}
领域：${domainName}

输出改写后的完整文本。

文本如下：

<<<TEXT>>>
${text}
<<<TEXT>>>`
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

onMounted(() => {
  loadSessions()
})
</script>

<style scoped>
.aigc-detection-window {
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

/* 主内容区域 */
.main-content {
  flex: 1;
  display: flex;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
}

.editor-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid v-bind('borderColor');
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 500;
}

.monaco-editor-container {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.report-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.report-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid v-bind('borderColor');
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 500;
}

.report-scrollbar {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.report-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.6;
}

.empty-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.6;
}

/* 编辑器装饰样式 */
:deep(.aigc-high-risk) {
  background-color: rgba(245, 108, 108, 0.1) !important;
}

:deep(.aigc-medium-risk) {
  background-color: rgba(230, 162, 60, 0.1) !important;
}

:deep(.aigc-low-risk) {
  background-color: rgba(103, 194, 58, 0.1) !important;
}

/* 选择文档对话框样式 */
.select-document-dialog {
  .el-dialog__body {
    padding: 0;
  }
}

.select-document-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.select-document-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color-page);
}

.selected-count {
  font-size: 14px;
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.document-list-scrollbar {
  flex: 1;
  padding: 12px;
}

.document-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.document-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border: 2px solid var(--el-border-color-light);
  border-radius: 12px;
  background: var(--el-bg-color);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.document-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, rgba(64, 158, 255, 0.05) 0%, rgba(64, 158, 255, 0.02) 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.document-card:hover {
  border-color: var(--el-color-primary-light-7);
  background: var(--el-bg-color-page);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.document-card:hover::before {
  opacity: 1;
}

.document-card.selected {
  border-color: var(--el-color-primary);
  background: linear-gradient(135deg, rgba(64, 158, 255, 0.08) 0%, rgba(64, 158, 255, 0.03) 100%);
  box-shadow: 0 4px 16px rgba(64, 158, 255, 0.15);
}

.document-card.selected::before {
  opacity: 1;
}

.document-card-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.document-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.document-icon {
  font-size: 20px;
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.document-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.document-path {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  padding-left: 30px;
}

.path-icon {
  font-size: 14px;
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
}

.document-path span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-format {
  padding-left: 30px;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px 20px;
  min-height: 200px;
}
</style>

