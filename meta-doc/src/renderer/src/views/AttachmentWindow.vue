<template>
  <div class="attachment-window">
    <div class="main-container">
      <!-- 左侧附件列表 -->
      <SessionList
        :title="t('attachment.attachmentsTitle', '附件解析')"
        :items="attachments"
        :active-index="activeAttachmentId"
        :disabled="processing"
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
      <div class="content-area" :style="contentAreaStyle">
        <div v-if="!activeAttachment" class="empty-state" :style="emptyStateStyle">
          <p>{{ t('attachment.noAttachmentSelected', '请选择一个附件或上传新附件') }}</p>
        </div>
        
        <div v-else class="attachment-content">
          <!-- 附件信息 -->
          <div class="attachment-info" :style="attachmentInfoStyle">
            <h3 :style="attachmentTitleStyle">{{ activeAttachment.title }}</h3>
            <p v-if="activeAttachment.file_type" :style="attachmentTextStyle">{{ t('attachment.fileType', '文件类型') }}: {{ activeAttachment.file_type }}</p>
          </div>

          <!-- 解析内容 -->
          <div v-if="parsedContent" class="parsed-section">
            <el-tabs v-model="activeTab">
              <el-tab-pane :label="t('attachment.tabs.parsed', '解析内容')" name="parsed">
                <div class="content-display" :style="contentDisplayStyle">
                  <pre :style="preStyle">{{ parsedContent }}</pre>
                </div>
              </el-tab-pane>
              <el-tab-pane :label="t('attachment.tabs.aiAnalysis', 'AI分析')" name="analysis">
                <div class="analysis-display">
                  <div 
                    v-if="aiAnalysis" 
                    ref="aiAnalysisContainerRef"
                    class="ai-analysis-container"
                  ></div>
                  <div v-else class="no-analysis" :style="noAnalysisStyle">
                    <p>{{ t('attachment.noAnalysis', '暂无AI分析结果') }}</p>
                    <el-button 
                      type="primary" 
                      :loading="analyzing"
                      @click="handleAiAnalysis"
                    >
                      {{ t('attachment.startAnalysis', '开始AI分析') }}
                    </el-button>
                  </div>
                </div>
              </el-tab-pane>
            </el-tabs>
          </div>

          <!-- 操作按钮 -->
          <div class="action-section">
            <el-button 
              type="primary" 
              :loading="processing"
              @click="handleParse"
              v-if="!parsedContent"
            >
              {{ t('attachment.parse', '解析附件') }}
            </el-button>
            <el-button 
              type="primary" 
              :loading="analyzing"
              @click="handleAiAnalysis"
              v-if="parsedContent && !aiAnalysis"
            >
              {{ t('attachment.startAnalysis', '开始AI分析') }}
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
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
import Vditor from 'vditor'
import { localVditorCDN, vditorCDN } from '../utils/vditor-cdn'
import { isElectronEnv } from '../utils/event-bus'
import { getSetting } from '../utils/settings'

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
const activeTab = ref('parsed')
const aiAnalysisContainerRef = ref<HTMLElement | null>(null)

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
  activeAttachmentId.value = item.id
  try {
    const attachment = await attachmentSessionsDb.getById(item.id)
    if (attachment) {
      parsedContent.value = attachment.parsed_content || ''
      aiAnalysis.value = attachment.ai_analysis || ''
    }
  } catch (error) {
    ElMessage.error('加载附件失败: ' + (error instanceof Error ? error.message : String(error)))
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
  if (!activeAttachmentId.value) return
  
  processing.value = true
  try {
    const attachment = await attachmentSessionsDb.getById(activeAttachmentId.value)
    if (!attachment) return
    
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
    parsedContent.value = reference.content || ''
    
    // 保存解析结果
    await attachmentSessionsDb.update(activeAttachmentId.value, {
      parsed_content: parsedContent.value
    })
    
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
const contentAreaStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const emptyStateStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.6
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
    // 获取 CDN 和主题设置
    const cdn = isElectronEnv() ? localVditorCDN : vditorCDN
    const contentTheme = await getSetting('contentTheme') || 'light'
    const codeTheme = themeState.currentTheme.codeTheme
    const lineNumber = await getSetting('lineNumber') ?? true
    
    // 清空容器
    container.innerHTML = ''
    
    // 使用 Vditor.preview 渲染
    const previewOptions: any = {
      cdn,
      mode: themeState.currentTheme.type === 'dark' ? 'dark' : 'light',
      markdown: {
        theme: { current: contentTheme }
      },
      hljs: {
        style: codeTheme,
        lineNumber: lineNumber
      },
      theme: themeState.currentTheme.vditorTheme
    }
    
    await Vditor.preview(container, aiAnalysis.value, previewOptions)
    
    // 等待 preview 完成后再调用其他渲染方法
    await nextTick()
    
    // 渲染代码块
    if (typeof Vditor.codeRender === 'function') {
      Vditor.codeRender(container)
    }
    
    // 渲染数学公式
    if (typeof Vditor.mathRender === 'function') {
      Vditor.mathRender(container, {
        cdn
      })
    }
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
  padding: 24px;
  overflow: auto;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.attachment-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.attachment-info {
  padding: 16px;
  border-radius: 8px;
}

.parsed-section {
  flex: 1;
  min-height: 0;
}

.content-display {
  padding: 16px;
  border-radius: 8px;
  max-height: 600px;
  overflow: auto;
}

.content-display pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.analysis-display {
  padding: 16px;
  min-height: 400px;
}

.ai-analysis-container {
  width: 100%;
  min-height: 100px;
  padding: 16px;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.no-analysis {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.action-section {
  display: flex;
  justify-content: center;
  gap: 16px;
}
</style>

