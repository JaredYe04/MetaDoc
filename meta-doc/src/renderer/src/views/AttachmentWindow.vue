<template>
  <div class="attachment-window">
    <div class="main-container">
      <!-- 左侧附件列表 -->
      <SessionList
        :title="t('attachment.attachmentsTitle', '附件解析')"
        :items="attachments"
        :active-index="activeAttachmentId || undefined"
        :disabled="processing || loadingSession"
        :create-button-tooltip="t('attachment.newAttachment', '上传附件')"
        :rename-label="t('common.rename', '重命名')"
        :duplicate-label="t('common.duplicate', '复制')"
        :delete-label="t('common.delete', '删除')"
        :rename-dialog-title="t('attachment.renameTitle', '重命名附件')"
        :rename-placeholder="t('attachment.renamePlaceholder', '请输入附件名称')"
        :cancel-label="t('common.cancel', '取消')"
        :confirm-label="t('common.confirm', '确认')"
        :show-duplicate="false"
        @create="handleUploadAttachment"
        @select="handleSelectAttachment"
        @rename="handleRenameAttachment"
        @delete="handleDeleteAttachment"
      />

      <!-- 右侧内容区域 -->
      <div class="content-area" :style="contentAreaStyle" v-loading="loadingSession">
        <div v-if="!activeAttachment" class="empty-state" :style="emptyStateStyle">
          <p>{{ t('attachment.noAttachmentSelected', '请选择一个附件或上传新附件') }}</p>
        </div>
        
        <div v-else class="session-content-panel" :style="panelStyle">
          <!-- 附件信息 -->
          <div class="attachment-info" :style="attachmentInfoStyle">
            <h3 :style="attachmentTitleStyle">{{ activeAttachment.title }}</h3>
            <p v-if="activeAttachment.file_type" :style="attachmentTextStyle">{{ t('attachment.fileType', '文件类型') }}: {{ activeAttachment.file_type }}</p>
          </div>

          <!-- 解析内容 -->
          <div v-if="activeAttachment" class="parsed-section">
            <el-tabs v-model="activeTab">
              <el-tab-pane :label="t('attachment.tabs.parsed', '解析内容')" name="parsed">
                <div v-if="parsedContent && parsedContent.trim()" class="content-display" :style="contentDisplayStyle">
                  <div :ref="el => setTextEditorRef(el as HTMLElement | null)" class="text-editor-container"></div>
                </div>
                <div v-else class="no-content" :style="noAnalysisStyle">
                  <p>{{ t('attachment.noParsedContent', '暂无解析内容') }}</p>
                  <el-button 
                    type="primary" 
                    :loading="processing"
                    @click="handleParse"
                  >
                    {{ t('attachment.parse', '解析附件') }}
                  </el-button>
                </div>
              </el-tab-pane>
              <el-tab-pane :label="t('attachment.tabs.aiAnalysis', 'AI分析')" name="analysis">
                <div class="analysis-display">
                  <el-scrollbar v-if="aiAnalysis" class="ai-analysis-scrollbar">
                    <div 
                      ref="aiAnalysisContainerRef"
                      class="ai-analysis-container"
                    ></div>
                  </el-scrollbar>
                  <div v-else class="no-analysis" :style="noAnalysisStyle">
                    <p>{{ t('attachment.noAnalysis', '暂无AI分析结果') }}</p>
                    <el-button 
                      type="primary" 
                      :loading="analyzing"
                      @click="handleAiAnalysis"
                      :disabled="!parsedContent"
                    >
                      {{ t('attachment.startAnalysis', '开始AI分析') }}
                    </el-button>
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
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import SessionList from '../components/common/SessionList.vue'
import type { SessionListItem } from '../components/common/SessionList.vue'
import { attachmentSessionsDb, type AttachmentSession } from '../utils/db/tool-sessions-db'
import { processFileUpload } from '../utils/agent-framework/reference-processor'
import { generateAttachmentAnalysisPrompt } from '../utils/prompts'
import { createAiTask } from '../utils/ai_tasks'
import { ref as vueRef } from 'vue'
import type { AIDialogMessage } from '@/types'
import { selectReferenceFiles } from '../utils/agent-framework/reference-processor'
import { themeState } from '../utils/themes'
import { renderMarkdownPreview } from '../utils/md-utils'
import * as monaco from 'monaco-editor'
// 不导入 setupMonacoWorker，禁用 worker 避免卡死

const { t } = useI18n()

const attachments = ref<SessionListItem[]>([])
const activeAttachmentId = ref<string | null>(null)
const activeAttachment = computed(() => {
  if (!activeAttachmentId.value) return null
  return attachments.value.find(s => s.id === activeAttachmentId.value) as any
})

const parsedContent = ref<string>('')
const aiAnalysis = ref<string>('')
const processing = ref(false)
const analyzing = ref(false)
const loadingSession = ref(false)
const activeTab = ref('parsed')
const aiAnalysisContainerRef = ref<HTMLElement | null>(null)
const textEditorRef = ref<HTMLElement | null>(null)
let textEditor: monaco.editor.IStandaloneCodeEditor | null = null
let textEditorId: string | null = null

const setTextEditorRef = (el: HTMLElement | null) => {
  textEditorRef.value = el
  if (el) {
    nextTick(() => {
      initTextEditor()
    })
  } else {
    disposeTextEditor()
  }
}

// 初始化文本编辑器
const initTextEditor = async () => {
  const container = textEditorRef.value
  if (!container || !parsedContent.value) return
  
  // 如果已经存在编辑器，先销毁
  if (textEditor) {
    textEditor.dispose()
    textEditor = null
    textEditorId = null
  }
  
  // 等待DOM更新，确保容器有正确的高度
  await nextTick()
  
  // 确保容器有明确的高度，如果没有则延迟创建
  if (container.offsetHeight === 0) {
    setTimeout(() => {
      initTextEditor()
    }, 100)
    return
  }
  
  try {
    // 禁用 Monaco Worker，避免卡死
    // 不调用 setupMonacoWorker()
    
    // 创建编辑器（从全局 monaco 获取，不使用 ref）
    textEditor = monaco.editor.create(container, {
      value: parsedContent.value || '',
      language: 'plaintext',
      theme: themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs',
      readOnly: true,
      automaticLayout: true,
      fontSize: 14,
      lineNumbers: 'on',
      wordWrap: 'on',
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      fontFamily: "'JetBrains Mono', 'Consolas', monospace"
    })
    
    // 保存 editor ID，而不是 editor 对象本身
    textEditorId = textEditor.getId()
    
    // 手动触发布局更新，确保编辑器正确显示
    setTimeout(() => {
      if (textEditor) {
        textEditor.layout()
      }
    }, 0)
    
    // 监听主题变化（通过 editor ID 从全局获取 editor）
    watch(() => themeState.currentTheme.type, (newType) => {
      // 从全局 monaco 获取 editor
      const editors = (monaco.editor as any).getEditors?.() ?? []
      const ed = editors.find((e: monaco.editor.IStandaloneCodeEditor) => e.getId?.() === textEditorId)
      if (ed) {
        monaco.editor.setTheme(newType === 'dark' ? 'vs-dark' : 'vs')
      }
    })
  } catch (error) {
    console.error('初始化文本编辑器失败:', error)
  }
}

// 销毁文本编辑器
const disposeTextEditor = () => {
  if (textEditor) {
    textEditor.dispose()
    textEditor = null
    textEditorId = null
  }
}

// 监听解析内容变化，更新编辑器内容
watch(() => parsedContent.value, (newContent) => {
  if (textEditor && newContent) {
    try {
      const currentValue = textEditor.getValue()
      if (currentValue !== newContent) {
        textEditor.setValue(newContent || '')
      }
    } catch (error) {
      // 编辑器可能已被销毁，忽略错误
      console.warn('更新编辑器内容失败:', error)
    }
  } else if (newContent && textEditorRef.value) {
    // 如果内容存在但编辑器未初始化，初始化编辑器
    nextTick(() => {
      initTextEditor()
    })
  }
})

// 监听活动标签页变化，初始化编辑器
watch(() => activeTab.value, async (newTab) => {
  if (newTab === 'parsed' && parsedContent.value && textEditorRef.value) {
    await nextTick()
    initTextEditor()
  }
})

// 清理编辑器
onBeforeUnmount(() => {
  disposeTextEditor()
})

// 监听parsedContent变化，确保UI更新
watch(() => parsedContent.value, (newValue) => {
  if (newValue && newValue.trim()) {
    // 确保切换到解析内容标签页
    if (activeTab.value !== 'parsed') {
      activeTab.value = 'parsed'
    }
  }
}, { immediate: true, deep: false })

// 加载附件列表
const loadAttachments = async () => {
  try {
    const dbAttachments = await attachmentSessionsDb.getAll()
    attachments.value = dbAttachments.map(a => ({
      id: a.id,
      title: a.title,
      updatedAt: a.updated_at
    }))
  } catch (error) {
    ElMessage.error('加载附件列表失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 上传附件
const handleUploadAttachment = async () => {
  try {
    const filePaths = await selectReferenceFiles('all', false, t('attachment.selectFile', '选择附件'))
    if (filePaths.length === 0) return

    for (const filePath of filePaths) {
      const fileName = filePath.split(/[/\\]/).pop() || 'unknown'
      const fileType = fileName.split('.').pop()?.toLowerCase() || ''
      
      const id = `attachment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const title = fileName
      
      await attachmentSessionsDb.create({
        id,
        title,
        description: '',
        file_path: filePath,
        file_name: fileName,
        file_type: fileType,
        parsed_content: undefined,
        ai_analysis: undefined
      })
    }
    
    await loadAttachments()
    if (filePaths.length === 1) {
      // 自动选择新上传的附件
      const newAttachment = attachments.value.find(a => a.title === filePaths[0].split(/[/\\]/).pop())
      if (newAttachment) {
        activeAttachmentId.value = newAttachment.id
        await handleSelectAttachment(newAttachment)
      }
    }
    ElMessage.success(t('attachment.uploadSuccess', '附件上传成功'))
  } catch (error) {
    ElMessage.error('上传附件失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 选择附件
const handleSelectAttachment = async (item: SessionListItem) => {
  // 如果正在加载，忽略新的切换请求
  if (loadingSession.value) {
    return
  }
  
  loadingSession.value = true
  
  try {
    activeAttachmentId.value = item.id
    const attachment = await attachmentSessionsDb.getById(item.id)
    if (attachment) {
      // 确保值被正确设置
      const content = attachment.parsed_content || ''
      const analysis = attachment.ai_analysis || ''
      
      parsedContent.value = content
      aiAnalysis.value = analysis
      
      // 如果有解析内容，切换到解析内容标签页
      await nextTick()
      if (content && content.trim()) {
        activeTab.value = 'parsed'
      }
    } else {
      // 如果没有附件数据，清空显示
      parsedContent.value = ''
      aiAnalysis.value = ''
    }
  } catch (error) {
    ElMessage.error('加载附件失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    loadingSession.value = false
  }
}

// 重命名附件
const handleRenameAttachment = async (item: SessionListItem, newTitle: string) => {
  try {
    await attachmentSessionsDb.update(item.id, { title: newTitle })
    await loadAttachments()
  } catch (error) {
    ElMessage.error('重命名失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 删除附件
const handleDeleteAttachment = async (item: SessionListItem) => {
  try {
    await attachmentSessionsDb.delete(item.id)
    await loadAttachments()
    if (activeAttachmentId.value === item.id) {
      activeAttachmentId.value = null
      parsedContent.value = ''
      aiAnalysis.value = ''
    }
    ElMessage.success(t('common.deleteSuccess', '删除成功'))
  } catch (error) {
    ElMessage.error('删除失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 解析附件
const handleParse = async () => {
  console.log('[AttachmentWindow] handleParse 被调用, activeAttachmentId:', activeAttachmentId.value)
  
  if (!activeAttachmentId.value) {
    console.log('[AttachmentWindow] activeAttachmentId 为空，返回')
    return
  }
  
  console.log('[AttachmentWindow] 开始解析，processing 设置为 true')
  processing.value = true
  try {
    const attachment = await attachmentSessionsDb.getById(activeAttachmentId.value)
    if (!attachment) {
      console.log('[AttachmentWindow] 附件不存在，返回')
      return
    }
    
    console.log('[AttachmentWindow] 附件信息:', attachment.file_path, attachment.file_name)
    
    // 使用reference-processor解析文件
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
    
    // 读取文件并转换为File对象
    const fileData = await ipcRenderer.invoke('read-file-for-upload', attachment.file_path) as {
      name: string
      data: string
      mimeType: string
    }
    
    const binaryString = atob(fileData.data)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    const blob = new Blob([bytes], { type: fileData.mimeType })
    const file = new File([blob], fileData.name, { type: fileData.mimeType })
    
    // 使用reference-processor解析
    const reference = await processFileUpload(file)
    const content = reference.parsedContent || ''
    
    console.log('[AttachmentWindow] 解析完成，内容长度:', content.length, '内容预览:', content.substring(0, 100))
    
    // 先更新显示（立即更新，确保UI响应）
    parsedContent.value = content
    console.log('[AttachmentWindow] parsedContent.value 已更新:', parsedContent.value.length)
    
    // 保存解析结果到数据库
    await attachmentSessionsDb.update(activeAttachmentId.value, {
      parsed_content: content
    })
    console.log('[AttachmentWindow] 已保存到数据库')
    
    // 确保UI更新并切换到解析内容标签页
    await nextTick()
    activeTab.value = 'parsed'
    console.log('[AttachmentWindow] activeTab 已切换到 parsed, parsedContent.value:', parsedContent.value ? parsedContent.value.length : 0)
    
    // 强制触发响应式更新
    await nextTick()
    
    // 再次确保数据已更新
    if (parsedContent.value !== content) {
      console.log('[AttachmentWindow] 检测到数据不一致，重新设置')
      parsedContent.value = content
      await nextTick()
    }
    
    // 最后验证
    console.log('[AttachmentWindow] 最终状态 - parsedContent.value:', parsedContent.value ? parsedContent.value.length : 0, 'activeTab:', activeTab.value)
    
    ElMessage.success(t('attachment.parseSuccess', '解析完成'))
  } catch (error) {
    ElMessage.error('解析失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    processing.value = false
  }
}

// AI分析
const handleAiAnalysis = async () => {
  if (!activeAttachmentId.value || !parsedContent.value) {
    ElMessage.warning(t('attachment.noParsedContent', '请先解析附件'))
    return
  }
  
  analyzing.value = true
  try {
    const attachment = await attachmentSessionsDb.getById(activeAttachmentId.value)
    if (!attachment) return
    
    const prompt = generateAttachmentAnalysisPrompt(parsedContent.value, attachment.file_name)
    const target = vueRef('')
    const originKey = `attachment-analysis-${Date.now()}-${Math.random().toString(36).slice(2)}`
    
    const messages: AIDialogMessage[] = [{
      role: 'user',
      content: prompt,
    }]
    const { done } = createAiTask(
      t('attachment.analyzing', '分析附件'),
      messages,
      target,
      'chat',
      originKey,
      { stream: true }
    )
    
    await done
    aiAnalysis.value = target.value
    
    // 保存分析结果
    await attachmentSessionsDb.update(activeAttachmentId.value, {
      ai_analysis: aiAnalysis.value
    })
    
    activeTab.value = 'analysis'
    ElMessage.success(t('attachment.analysisSuccess', '分析完成'))
  } catch (error) {
    ElMessage.error('分析失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    analyzing.value = false
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

const attachmentInfoStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const attachmentTitleStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const attachmentTextStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.7
}))

const contentDisplayStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const preStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  fontFamily: "'JetBrains Mono', 'Consolas', monospace"
}))

const noAnalysisStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.6
}))

// 渲染AI分析内容
const renderAiAnalysis = async () => {
  if (!aiAnalysisContainerRef.value || !aiAnalysis.value) {
    return
  }
  
  const container = aiAnalysisContainerRef.value as HTMLDivElement
  
  try {
    // 使用统一的 Markdown 预览渲染函数
    await renderMarkdownPreview(container, aiAnalysis.value)
  } catch (error) {
    console.error('渲染AI分析失败:', error)
    container.innerHTML = `<p style="color: var(--el-color-danger);">渲染失败: ${error instanceof Error ? error.message : String(error)}</p>`
  }
}

// 监听AI分析内容变化和标签页切换
watch(
  [() => aiAnalysis.value, () => activeTab.value, () => themeState.currentTheme.type],
  () => {
    if (activeTab.value === 'analysis' && aiAnalysis.value) {
      nextTick(() => {
        renderAiAnalysis()
      })
    }
  },
  { immediate: true }
)

onMounted(() => {
  loadAttachments()
  if (activeTab.value === 'analysis' && aiAnalysis.value) {
    nextTick(() => {
      renderAiAnalysis()
    })
  }
})
</script>

<style scoped>
.attachment-window {
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
  gap: 16px;
}

.attachment-info {
  padding: 16px;
  border-radius: 8px;
}

.parsed-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 确保 el-tabs 占满父容器高度 */
.parsed-section :deep(.el-tabs) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.parsed-section :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.parsed-section :deep(.el-tab-pane) {
  height: 100%;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.content-display {
  padding: 16px;
  border-radius: 8px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.text-editor-container {
  flex: 1;
  min-height: 0;
  width: 100%;
  position: relative;
}

.analysis-display {
  padding: 16px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
}

.ai-analysis-scrollbar {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
}

.ai-analysis-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
  height: 100%;
}

.ai-analysis-scrollbar :deep(.el-scrollbar__view) {
  height: 100%;
}

.ai-analysis-container {
  width: 100%;
  min-height: 100px;
  padding: 16px;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.no-content,
.no-analysis {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  flex: 1;
  min-height: 0;
}

.action-section {
  display: flex;
  justify-content: center;
  gap: 16px;
}
</style>

