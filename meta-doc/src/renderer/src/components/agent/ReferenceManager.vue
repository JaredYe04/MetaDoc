<template>
  <div class="reference-manager" :style="containerStyle">
    <div class="manager-header">
      <h3>{{ t('agent.reference.title') }}</h3>
      <div class="header-actions">
        <el-button 
          type="danger" 
          size="small" 
          :disabled="references.length === 0"
          @click="handleClearAll"
        >
          {{ t('agent.reference.clearAll') }}
        </el-button>
        <el-button type="primary" size="small" :icon="Plus" @click="handleAdd">
          {{ t('agent.reference.add') }}
        </el-button>
      </div>
    </div>

    <el-table
      :data="references"
      border
      stripe
      :style="tableStyle"
      v-loading="loading"
      max-height="600"
      :table-layout="'auto'"
      :row-style="{ height: 'auto' }"
    >
      <el-table-column :label="t('agent.reference.name')" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">
          <div class="table-cell-content">{{ row.name }}</div>
        </template>
      </el-table-column>
      <el-table-column :label="t('agent.reference.format')" width="90" align="center">
        <template #default="{ row }">
          <el-tag size="small">{{ row.format || 'txt' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('agent.reference.origin')" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          <div class="table-cell-content">{{ row.origin }}</div>
        </template>
      </el-table-column>
      <el-table-column :label="t('agent.reference.description')" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">
          <div class="table-cell-content">{{ row.description || '-' }}</div>
        </template>
      </el-table-column>
      <el-table-column :label="t('agent.reference.content')" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          <div class="table-cell-content" v-if="row.parsedContent" :title="row.parsedContent">
            {{ row.parsedContent.length > 100 ? row.parsedContent.substring(0, 100) + '...' : row.parsedContent }}
          </div>
          <div class="table-cell-content" v-else style="color: #999;">-</div>
        </template>
      </el-table-column>
      <el-table-column :label="t('agent.reference.actions')" width="120" fixed="right" align="center">
        <template #default="{ row }">
          <div class="action-buttons">
            <el-tooltip :content="t('agent.reference.viewContent')" placement="top">
              <el-button 
                size="small" 
                circle 
                :icon="Document" 
                @click="handleViewContent(row)"
              />
            </el-tooltip>
            <el-tooltip :content="t('common.edit')" placement="top">
              <el-button 
                size="small" 
                circle 
                :icon="Edit" 
                @click="handleEdit(row)"
              />
            </el-tooltip>
            <el-tooltip :content="t('common.delete')" placement="top">
              <el-button 
                size="small" 
                circle 
                type="danger" 
                :icon="Delete" 
                @click="handleDelete(row)"
              />
            </el-tooltip>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <!-- 查看内容对话框 -->
    <el-dialog
      v-model="contentDialogVisible"
      :title="t('agent.reference.viewContent')"
      width="1000px"
      :style="dialogStyle"
    >
      <el-scrollbar v-if="viewingReference" height="500px">
        <el-descriptions :column="1" border>
          <el-descriptions-item :label="t('agent.reference.name')">
            {{ viewingReference.name }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('agent.reference.format')">
            <el-tag size="small">{{ viewingReference.format || 'txt' }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item :label="t('agent.reference.origin')">
            {{ viewingReference.origin }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('agent.reference.description')">
            {{ viewingReference.description || '-' }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('agent.reference.content')">
            <el-scrollbar height="400px">
              <div style="white-space: pre-wrap; word-break: break-word; padding: 8px; background: rgba(0,0,0,0.05); border-radius: 4px;">
                {{ viewingReference.parsedContent || '-' }}
              </div>
            </el-scrollbar>
          </el-descriptions-item>
        </el-descriptions>
      </el-scrollbar>
      <template #footer>
        <el-button @click="contentDialogVisible = false">{{ t('common.close') }}</el-button>
        <el-button type="primary" @click="handleCopyContent" v-if="viewingReference?.parsedContent">
          {{ t('common.copy') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 添加/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingReference ? t('agent.reference.edit') : t('agent.reference.add')"
      width="800px"
      :style="dialogStyle"
      :close-on-click-modal="!parsing"
      :close-on-press-escape="!parsing"
      :show-close="!parsing"
      @close="handleDialogClose"
      class="reference-dialog"
    >
      <div style="position: relative;">
        <!-- 解析加载遮罩 -->
        <div v-if="parsing" class="parsing-overlay">
          <div class="parsing-content">
            <el-icon class="is-loading" style="font-size: 32px; margin-bottom: 16px;">
              <Loading />
            </el-icon>
            <div style="font-size: 14px; margin-bottom: 8px;">{{ parsingMessage }}</div>
            <div v-if="parsingProgress" style="font-size: 12px; color: #999;">{{ parsingProgress }}</div>
            <el-button 
              size="small" 
              style="margin-top: 16px;" 
              @click="handleCancelParsing"
            >
              {{ t('common.cancel') }}
            </el-button>
          </div>
        </div>

        <el-form :model="formData" label-width="100px" :disabled="parsing">
        <el-form-item :label="t('agent.reference.name')" required>
          <el-input v-model="formData.name" />
        </el-form-item>
        <el-form-item :label="t('agent.reference.inputType')" required>
          <el-radio-group v-model="formData.inputType" :disabled="parsing">
            <el-radio label="file">{{ t('agent.reference.type.file') }}</el-radio>
            <el-radio label="url">{{ t('agent.reference.type.url') }}</el-radio>
            <el-radio label="text">{{ t('agent.reference.type.custom') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('agent.reference.url')" required v-if="formData.inputType === 'url'">
          <el-input v-model="formData.url" :placeholder="t('agent.reference.urlPlaceholder')" @blur="handleUrlBlur" />
        </el-form-item>
        <el-form-item :label="t('agent.reference.file')" required v-if="formData.inputType === 'file'">
          <el-upload
            :auto-upload="false"
            :on-change="handleFileChange"
            :show-file-list="false"
            :disabled="parsing"
            accept="*/*"
          >
            <el-button type="primary" :disabled="parsing">{{ t('agent.reference.selectFile') }}</el-button>
            <span v-if="selectedFile" style="margin-left: 8px;">{{ selectedFile.name }}</span>
          </el-upload>
          <div v-if="parsedReference && formData.inputType === 'file'" style="margin-top: 8px; color: #67c23a; font-size: 12px;">
            ✓ {{ t('agent.reference.parseSuccess') }}
          </div>
        </el-form-item>
        <el-form-item :label="t('agent.reference.text')" required v-if="formData.inputType === 'text'">
          <el-input v-model="formData.text" type="textarea" :rows="5" :placeholder="t('agent.reference.textPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('agent.reference.description')">
          <el-input v-model="formData.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      </div>
      <template #footer>
        <el-button @click="handleDialogClose" :disabled="parsing">{{ t('common.cancel') }}</el-button>
        <el-button 
          type="primary" 
          @click="handleSave" 
          :disabled="parsing || (formData.inputType === 'file' && !parsedReference && !editingReference)"
        >
          {{ t('common.save') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import eventBus from '../../utils/event-bus'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, View, Edit, Delete, Document, Loading } from '@element-plus/icons-vue'
import { themeState } from '../../utils/themes'
import type { Reference } from '../../types/agent-framework'
import type { AgentSession } from '../../types/agent'
import { agentSessionManager } from '../../utils/agent-framework'
import { processFileUpload, processUrlReference } from '../../utils/agent-framework/reference-processor'
import localIpcRenderer from '../../utils/web-adapter/local-ipc-renderer'
import { createRendererLogger } from '../../utils/logger'

// 获取IPC渲染器
let ipcRenderer: typeof localIpcRenderer | null = null
if (typeof window !== 'undefined') {
  if ((window as any).electron?.ipcRenderer) {
    ipcRenderer = (window as any).electron.ipcRenderer
  } else {
    ipcRenderer = localIpcRenderer
  }
}

// 懒加载logger
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null
function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('ReferenceManager')
  }
  return loggerInstance
}

const props = defineProps<{
  session: AgentSession
}>()

const emit = defineEmits<{
  update: []
}>()

const { t } = useI18n()

const loading = ref(false)
const dialogVisible = ref(false)
const contentDialogVisible = ref(false)
const editingReference = ref<Reference | null>(null)
const viewingReference = ref<Reference | null>(null)
const selectedFile = ref<File | null>(null)
const parsing = ref(false)
const parsingMessage = ref('')
const parsingProgress = ref('')
const parsedReference = ref<Reference | null>(null)
const abortController = ref<AbortController | null>(null)
const currentRequestId = ref<string | null>(null)

const formData = ref({
  name: '',
  inputType: 'file' as 'file' | 'url' | 'text',
  url: '',
  text: '',
  description: ''
})

const references = computed(() => {
  return props.session.referenceStore || []
})

const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  padding: '16px'
}))

const tableStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd
}))

const dialogStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const handleAdd = () => {
  editingReference.value = null
  selectedFile.value = null
  parsedReference.value = null
  parsing.value = false
  parsingMessage.value = ''
  parsingProgress.value = ''
  formData.value = {
    name: '',
    inputType: 'file',
    url: '',
    text: '',
    description: ''
  }
  dialogVisible.value = true
}

const handleFileChange = async (file: any) => {
  selectedFile.value = file.raw
  formData.value.name = file.name
  parsedReference.value = null
  
  // 立即开始解析
  if (file.raw) {
    await startParsingFile(file.raw)
  }
}

const handleUrlBlur = async () => {
  if (formData.value.inputType === 'url' && formData.value.url.trim() && !parsedReference.value) {
    await startParsingUrl(formData.value.url)
  }
}

const startParsingFile = async (file: File) => {
  if (parsing.value) {
    return // 如果正在解析，不重复开始
  }
  
  parsing.value = true
  parsingMessage.value = t('agent.reference.parsingFile')
  parsingProgress.value = ''
  parsedReference.value = null
  
  // 创建AbortController用于取消
  abortController.value = new AbortController()
  
  // 生成requestId用于取消主进程任务
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  currentRequestId.value = requestId
  
  try {
    const { processFileUpload } = await import('../../utils/agent-framework/reference-processor')
    
    parsingMessage.value = t('agent.reference.parsingFile')
    
    const reference = await processFileUpload(file, abortController.value.signal, requestId)
    
    if (abortController.value?.signal.aborted) {
      return // 已取消，不更新结果
    }
    
    parsedReference.value = reference
    parsingMessage.value = t('agent.reference.parseSuccess')
    
    // 延迟一下让用户看到成功消息
    await new Promise(resolve => setTimeout(resolve, 500))
  } catch (error) {
    if (abortController.value?.signal.aborted) {
      return // 已取消，不显示错误
    }
    
    ElMessage.error(error instanceof Error ? error.message : String(error))
    parsingMessage.value = t('agent.reference.parseFailed')
  } finally {
    if (!abortController.value?.signal.aborted) {
      parsing.value = false
      parsingMessage.value = ''
      parsingProgress.value = ''
    }
    abortController.value = null
    currentRequestId.value = null
  }
}

const startParsingUrl = async (url: string) => {
  if (parsing.value) {
    return
  }
  
  parsing.value = true
  parsingMessage.value = t('agent.reference.parsingUrl')
  parsingProgress.value = ''
  parsedReference.value = null
  
  abortController.value = new AbortController()
  
  try {
    parsingMessage.value = t('agent.reference.downloadingUrl')
    
    const reference = await processUrlReference(url, abortController.value.signal)
    
    if (abortController.value?.signal.aborted) {
      return
    }
    
    parsedReference.value = reference
    parsingMessage.value = t('agent.reference.parseSuccess')
    
    await new Promise(resolve => setTimeout(resolve, 500))
  } catch (error) {
    if (abortController.value?.signal.aborted) {
      return
    }
    
    ElMessage.error(error instanceof Error ? error.message : String(error))
    parsingMessage.value = t('agent.reference.parseFailed')
  } finally {
    if (!abortController.value?.signal.aborted) {
      parsing.value = false
      parsingMessage.value = ''
      parsingProgress.value = ''
    }
    abortController.value = null
    currentRequestId.value = null
  }
}

const handleCancelParsing = () => {
  if (abortController.value) {
    abortController.value.abort()
    abortController.value = null
  }
  
  // 如果有requestId，发送取消请求到主进程
  if (currentRequestId.value && ipcRenderer) {
    try {
      ipcRenderer.invoke('cancel-file-conversion', currentRequestId.value)
    } catch (error) {
      getLogger().warn('发送取消请求失败:', error)
    }
    currentRequestId.value = null
  }
  
  parsing.value = false
  parsingMessage.value = ''
  parsingProgress.value = ''
  parsedReference.value = null
  // 隐藏进度条
  eventBus.emit('global-progress', {
    visible: false,
    message: '',
    percentage: 0
  })
  ElMessage.info(t('agent.reference.parseCancelled'))
}

const handleDialogClose = () => {
  if (parsing.value) {
    handleCancelParsing()
  }
  dialogVisible.value = false
  selectedFile.value = null
  parsedReference.value = null
  editingReference.value = null
}

// 监听全局取消事件（从进度条触发）
const handleCancelProgress = (event: unknown) => {
  const cancelEvent = event as { requestId?: string }
  if (parsing.value && cancelEvent.requestId === currentRequestId.value) {
    handleCancelParsing()
  }
}

onMounted(() => {
  eventBus.on('cancel-progress', handleCancelProgress)
})

onUnmounted(() => {
  eventBus.off('cancel-progress', handleCancelProgress)
})

const handleViewContent = (reference: Reference) => {
  viewingReference.value = reference
  contentDialogVisible.value = true
}

const handleCopyContent = async () => {
  if (viewingReference.value?.parsedContent) {
    try {
      await navigator.clipboard.writeText(viewingReference.value.parsedContent)
      ElMessage.success(t('common.copySuccess'))
    } catch (error) {
      ElMessage.error(t('common.copyFailed'))
    }
  }
}

const handleEdit = (reference: Reference) => {
  editingReference.value = reference
  // 根据origin判断输入类型
  const isUrl = /^https?:\/\//.test(reference.origin)
  const isFile = /^[A-Za-z]:[\\/]/.test(reference.origin) || reference.origin.startsWith('/')
  formData.value = {
    name: reference.name,
    inputType: isUrl ? 'url' : (isFile ? 'file' : 'text'),
    url: isUrl ? reference.origin : '',
    text: !isUrl && !isFile ? reference.parsedContent : '',
    description: reference.description || ''
  }
  dialogVisible.value = true
}

const handleSave = async () => {
  if (!formData.value.name.trim()) {
    ElMessage.warning(t('agent.reference.nameRequired'))
    return
  }

  if (formData.value.inputType === 'file' && !selectedFile.value && !editingReference.value) {
    ElMessage.warning(t('agent.reference.fileRequired'))
    return
  }

  if (formData.value.inputType === 'url' && !formData.value.url.trim()) {
    ElMessage.warning(t('agent.reference.urlRequired'))
    return
  }

  if (formData.value.inputType === 'text' && !formData.value.text.trim()) {
    ElMessage.warning(t('agent.reference.textRequired'))
    return
  }

  try {
    loading.value = true

    // 转换为新的AgentSession格式
    const newFormatSession: any = {
      ...props.session,
      entityType: 'agent-session',
      createdAt: typeof props.session.createdAt === 'string' ? new Date(props.session.createdAt).getTime() : props.session.createdAt,
      updatedAt: typeof props.session.updatedAt === 'string' ? new Date(props.session.updatedAt).getTime() : props.session.updatedAt,
      messageQueue: props.session.messageQueue || [],
      referenceStore: props.session.referenceStore || [],
      publicContext: props.session.publicContext || {},
      executionNodes: props.session.executionNodes || [],
      status: props.session.status || 'idle'
    }

    if (editingReference.value) {
      // 编辑模式：只更新基本信息，不重新解析
      agentSessionManager.updateReference(
        newFormatSession,
        editingReference.value.id,
        {
          name: formData.value.name,
          description: formData.value.description
        }
      )
      ElMessage.success(t('agent.reference.updateSuccess'))
    } else {
      // 添加模式：处理文件上传、URL或文本
      let reference: Reference
      
      if (formData.value.inputType === 'file' && selectedFile.value) {
        // 使用已解析的引用（如果存在）
        if (parsedReference.value) {
          reference = parsedReference.value
          reference.description = formData.value.description
        } else {
          // 如果没有解析结果，重新解析（这种情况不应该发生）
          reference = await processFileUpload(selectedFile.value)
          reference.description = formData.value.description
        }
      } else if (formData.value.inputType === 'url') {
        // 使用已解析的引用（如果存在）
        if (parsedReference.value) {
          reference = parsedReference.value
          reference.description = formData.value.description
        } else {
          // 如果没有解析结果，重新解析
          reference = await processUrlReference(formData.value.url)
          reference.description = formData.value.description
        }
      } else {
        // 处理文本引用
        const { processTextReference } = await import('../../utils/agent-framework/reference-processor')
        reference = processTextReference(formData.value.text, formData.value.name)
        reference.description = formData.value.description
      }
      
      agentSessionManager.addReferenceObject(newFormatSession, reference)
      ElMessage.success(t('agent.reference.addSuccess'))
    }

    dialogVisible.value = false
    selectedFile.value = null
    emit('update')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    loading.value = false
  }
}

const handleDelete = async (reference: Reference) => {
  try {
    await ElMessageBox.confirm(
      t('agent.reference.confirmDelete', { name: reference.name }),
      t('common.confirm'),
      { type: 'warning' }
    )

    // 转换为新的AgentSession格式
    const newFormatSession: any = {
      ...props.session,
      entityType: 'agent-session',
      createdAt: typeof props.session.createdAt === 'string' ? new Date(props.session.createdAt).getTime() : props.session.createdAt,
      updatedAt: typeof props.session.updatedAt === 'string' ? new Date(props.session.updatedAt).getTime() : props.session.updatedAt,
      messageQueue: props.session.messageQueue || [],
      referenceStore: props.session.referenceStore || [],
      publicContext: props.session.publicContext || {},
      executionNodes: props.session.executionNodes || [],
      status: props.session.status || 'idle'
    }

    agentSessionManager.removeReference(newFormatSession, reference.id)
    ElMessage.success(t('agent.reference.deleteSuccess'))
    emit('update')
  } catch {
    // 用户取消
  }
}

const handleClearAll = async () => {
  try {
    await ElMessageBox.confirm(
      t('agent.reference.confirmClearAll', { count: references.value.length }),
      t('agent.reference.clearAllConfirmTitle'),
      {
        confirmButtonText: t('agent.reference.clearAll'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      }
    )

    // 转换为新的AgentSession格式
    const newFormatSession: any = {
      ...props.session,
      entityType: 'agent-session',
      createdAt: typeof props.session.createdAt === 'string' ? new Date(props.session.createdAt).getTime() : props.session.createdAt,
      updatedAt: typeof props.session.updatedAt === 'string' ? new Date(props.session.updatedAt).getTime() : props.session.updatedAt,
      messageQueue: props.session.messageQueue || [],
      referenceStore: props.session.referenceStore || [],
      publicContext: props.session.publicContext || {},
      executionNodes: props.session.executionNodes || [],
      status: props.session.status || 'idle'
    }

    // 清空所有引用
    const refIds = references.value.map(ref => ref.id)
    refIds.forEach(id => {
      agentSessionManager.removeReference(newFormatSession, id)
    })
    
    ElMessage.success(t('agent.reference.clearAllSuccess'))
    emit('update')
  } catch {
    // 用户取消
  }
}
</script>

<style scoped>
.reference-manager {
  width: 100%;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.manager-header h3 {
  margin: 0;
  font-size: 16px;
}

.table-cell-content {
  padding: 4px 0;
  line-height: 1.5;
  word-break: break-word;
  white-space: normal;
  max-height: 4.5em;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
}

.action-buttons {
  display: flex;
  gap: 8px;
  justify-content: center;
  align-items: center;
}

.parsing-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  border-radius: 4px;
}

.parsing-content {
  background: var(--el-bg-color);
  padding: 32px;
  border-radius: 8px;
  text-align: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 200px;
}
</style>

