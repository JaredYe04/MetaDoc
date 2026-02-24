<template>
  <div class="reference-manager" :style="containerStyle">
    <div class="manager-header">
      <h3>{{ t('agent.reference.title') }}</h3>
      <div class="header-actions">
        <Button
          variant="destructive"
          size="sm"
          :disabled="references.length === 0"
          @click="handleClearAll"
        >
          {{ t('agent.reference.clearAll') }}
        </Button>
        <Button size="sm" @click="handleAdd">
          <Plus class="w-4 h-4 mr-1" />
          {{ t('agent.reference.add') }}
        </Button>
      </div>
    </div>

    <!-- 内置0号reference开关 -->
    <div class="built-in-reference-section">
      <div class="built-in-reference-info">
        <el-icon class="info-icon"><Document /></el-icon>
        <div class="info-content">
          <div class="info-title">
            {{ t('agent.reference.builtInDocument.title', '当前文档引用') }}
          </div>
          <div class="info-description">
            {{
              t(
                'agent.reference.builtInDocument.description',
                '动态获取当前活动文档内容，实时更新，不占用历史消息空间'
              )
            }}
          </div>
        </div>
      </div>
      <div class="built-in-reference-actions">
        <Button size="sm" variant="secondary" @click="handlePreviewBuiltInDocument">
          <View class="w-4 h-4 mr-1" />
          {{ t('agent.reference.builtInDocument.preview', '预览') }}
        </Button>
        <Switch :checked="enableBuiltInDocRef" @update:checked="handleToggleBuiltInDocRef" />
      </div>
    </div>

    <div class="table-container" style="position: relative">
      <LoadingOverlay :show="loading" :message="t('common.loading', '加载中...')" />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead style="min-width: 150px">{{ t('agent.reference.name') }}</TableHead>
            <TableHead style="width: 90px; text-align: center">{{
              t('agent.reference.format')
            }}</TableHead>
            <TableHead style="min-width: 200px">{{ t('agent.reference.origin') }}</TableHead>
            <TableHead style="min-width: 150px">{{ t('agent.reference.description') }}</TableHead>
            <TableHead style="min-width: 200px">{{ t('agent.reference.content') }}</TableHead>
            <TableHead style="width: 120px; text-align: center">{{
              t('agent.reference.actions')
            }}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="row in references" :key="row.id">
            <TableCell>
              <div class="table-cell-content">{{ row.name }}</div>
            </TableCell>
            <TableCell style="text-align: center">
              <Badge variant="outline">{{ row.format || 'txt' }}</Badge>
            </TableCell>
            <TableCell>
              <div class="table-cell-content">{{ row.origin }}</div>
            </TableCell>
            <TableCell>
              <div class="table-cell-content">{{ row.description || '-' }}</div>
            </TableCell>
            <TableCell>
              <div class="table-cell-content" v-if="row.parsedContent" :title="row.parsedContent">
                {{
                  row.parsedContent.length > 100
                    ? row.parsedContent.substring(0, 100) + '...'
                    : row.parsedContent
                }}
              </div>
              <div class="table-cell-content" v-else style="color: #999">-</div>
            </TableCell>
            <TableCell style="text-align: center">
              <div class="action-buttons">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button
                      size="icon"
                      variant="ghost"
                      class="h-8 w-8"
                      @click="handleViewContent(row)"
                    >
                      <Document class="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{{ t('agent.reference.viewContent') }}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button size="icon" variant="ghost" class="h-8 w-8" @click="handleEdit(row)">
                      <Edit class="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{{ t('common.edit') }}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button
                      size="icon"
                      variant="destructive"
                      class="h-8 w-8"
                      @click="handleDelete(row)"
                    >
                      <Delete class="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{{ t('common.delete') }}</TooltipContent>
                </Tooltip>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- 查看内容对话框 -->
    <Dialog v-model:open="contentDialogVisible">
      <DialogContent class="sm:max-w-[1000px]" :style="dialogStyle">
        <DialogHeader>
          <DialogTitle>{{ t('agent.reference.viewContent') }}</DialogTitle>
        </DialogHeader>
        <div
          v-if="viewingReference"
          class="grid gap-4 py-4"
          style="max-height: 500px; overflow: auto"
        >
          <div class="grid gap-2">
            <div class="flex justify-between py-2 border-b">
              <span class="font-medium">{{ t('agent.reference.name') }}</span>
              <span>{{ viewingReference.name }}</span>
            </div>
            <div class="flex justify-between py-2 border-b">
              <span class="font-medium">{{ t('agent.reference.format') }}</span>
              <Badge variant="outline">{{ viewingReference.format || 'txt' }}</Badge>
            </div>
            <div class="flex justify-between py-2 border-b">
              <span class="font-medium">{{ t('agent.reference.origin') }}</span>
              <span>{{ viewingReference.origin }}</span>
            </div>
            <div class="flex justify-between py-2 border-b">
              <span class="font-medium">{{ t('agent.reference.description') }}</span>
              <span>{{ viewingReference.description || '-' }}</span>
            </div>
            <div class="grid gap-2">
              <span class="font-medium">{{ t('agent.reference.content') }}</span>
              <div style="max-height: 400px; overflow: auto">
                <div
                  style="
                    white-space: pre-wrap;
                    word-break: break-word;
                    padding: 8px;
                    background: rgba(0, 0, 0, 0.05);
                    border-radius: 4px;
                  "
                >
                  {{ viewingReference.parsedContent || '-' }}
                </div>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" @click="contentDialogVisible = false">{{
            t('common.close')
          }}</Button>
          <Button @click="handleCopyContent" v-if="viewingReference?.parsedContent">
            {{ t('common.copy') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 添加/编辑对话框 -->
    <Dialog v-model:open="dialogVisible" @update:open="(val) => !val && handleDialogClose()">
      <DialogContent
        class="sm:max-w-[800px]"
        :style="dialogStyle"
        :class="{ 'pointer-events-none': parsing }"
        @escape-key-down="
          (e) => {
            if (parsing) e.preventDefault()
          }
        "
        @interact-outside="
          (e) => {
            if (parsing) e.preventDefault()
          }
        "
      >
        <DialogHeader>
          <DialogTitle>
            {{ editingReference ? t('agent.reference.edit') : t('agent.reference.add') }}
          </DialogTitle>
        </DialogHeader>
        <div style="position: relative">
          <!-- 解析加载遮罩 -->
          <div v-if="parsing" class="parsing-overlay">
            <div class="parsing-content">
              <el-icon class="is-loading" style="font-size: 32px; margin-bottom: 16px">
                <Loading />
              </el-icon>
              <div style="font-size: 14px; margin-bottom: 8px">{{ parsingMessage }}</div>
              <div v-if="parsingProgress" style="font-size: 12px; color: #999">
                {{ parsingProgress }}
              </div>
              <Button size="sm" variant="secondary" class="mt-4" @click="handleCancelParsing">
                {{ t('common.cancel') }}
              </Button>
            </div>
          </div>

          <Form class="space-y-4" :class="{ 'pointer-events-none opacity-50': parsing }">
            <FormField :label="t('agent.reference.name')" name="name" required>
              <Input v-model="formData.name" />
            </FormField>
            <FormField :label="t('agent.reference.inputType')" name="inputType" required>
              <RadioGroup
                v-model="formData.inputType"
                :disabled="parsing"
                class="flex flex-row gap-4"
              >
                <div class="flex items-center gap-2">
                  <RadioGroupItem value="file" id="input-file" />
                  <label for="input-file" class="text-sm cursor-pointer">{{
                    t('agent.reference.type.file')
                  }}</label>
                </div>
                <div class="flex items-center gap-2">
                  <RadioGroupItem value="url" id="input-url" />
                  <label for="input-url" class="text-sm cursor-pointer">{{
                    t('agent.reference.type.url')
                  }}</label>
                </div>
                <div class="flex items-center gap-2">
                  <RadioGroupItem value="text" id="input-text" />
                  <label for="input-text" class="text-sm cursor-pointer">{{
                    t('agent.reference.type.custom')
                  }}</label>
                </div>
              </RadioGroup>
            </FormField>
            <FormField
              v-if="formData.inputType === 'url'"
              :label="t('agent.reference.url')"
              name="url"
              required
            >
              <Input
                v-model="formData.url"
                :placeholder="t('agent.reference.urlPlaceholder')"
                @blur="handleUrlBlur"
              />
            </FormField>
            <FormField
              v-if="formData.inputType === 'file'"
              :label="t('agent.reference.file')"
              name="file"
              required
            >
              <Button :disabled="parsing" @click="handleSelectFile">
                {{ t('agent.reference.selectFile') }}
              </Button>
              <div v-if="selectedFile" style="margin-top: 8px; color: #666; font-size: 12px">
                {{ selectedFile.name }}
              </div>
              <div
                v-if="parsedReference && formData.inputType === 'file'"
                style="margin-top: 8px; color: #67c23a; font-size: 12px"
              >
                ✓ {{ t('agent.reference.parseSuccess') }}
              </div>
            </FormField>
            <FormField
              v-if="formData.inputType === 'text'"
              :label="t('agent.reference.text')"
              name="text"
              required
            >
              <Textarea
                v-model="formData.text"
                :rows="5"
                :placeholder="t('agent.reference.textPlaceholder')"
                class="w-full"
              />
            </FormField>
            <FormField :label="t('agent.reference.description')" name="description">
              <Textarea v-model="formData.description" :rows="3" class="w-full" />
            </FormField>
          </Form>
        </div>
        <DialogFooter>
          <Button variant="secondary" @click="handleDialogClose" :disabled="parsing">{{
            t('common.cancel')
          }}</Button>
          <Button
            @click="handleSave"
            :disabled="
              parsing || (formData.inputType === 'file' && !parsedReference && !editingReference)
            "
          >
            {{ t('common.save') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
import {
  processFileUpload,
  processUrlReference,
  selectReferenceFiles
} from '../../utils/agent-framework/reference-processor'
import messageBridge from '../../bridge/message-bridge'
import { createRendererLogger } from '../../utils/logger'
import { useWorkspace } from '../../stores/workspace'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { LoadingOverlay } from '@renderer/components/ui/loading-overlay'
import { RadioGroup, RadioGroupItem } from '@renderer/components/ui/radio-group'
import { Form, FormField } from '@renderer/components/ui/form'
import { Switch } from '@renderer/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Badge } from '@renderer/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@renderer/components/ui/tooltip'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableHead
} from '@renderer/components/ui/table'

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
  'update-built-in-doc-ref': [value: boolean]
}>()

const { t } = useI18n()
const workspace = useWorkspace()

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

// 内置0号reference开关
const enableBuiltInDocRef = computed({
  get: () => (props.session as any).enableBuiltInDocumentReference !== false, // 默认开启
  set: (value: boolean) => {
    // 通过emit更新，由父组件处理
    emit('update-built-in-doc-ref', value)
  }
})

const handleToggleBuiltInDocRef = (value: boolean) => {
  // 更新session的enableBuiltInDocumentReference字段
  const newFormatSession: any = {
    ...props.session,
    entityType: 'agent-session',
    createdAt:
      typeof props.session.createdAt === 'string'
        ? new Date(props.session.createdAt).getTime()
        : props.session.createdAt,
    updatedAt:
      typeof props.session.updatedAt === 'string'
        ? new Date(props.session.updatedAt).getTime()
        : props.session.updatedAt,
    messageQueue: props.session.messageQueue || [],
    referenceStore: props.session.referenceStore || [],
    publicContext: props.session.publicContext || {},
    executionNodes: props.session.executionNodes || [],
    status: props.session.status || 'idle',
    enableBuiltInDocumentReference: value
  }

  // 直接更新session对象
  Object.assign(props.session, { enableBuiltInDocumentReference: value } as any)
  emit('update')
}

const handlePreviewBuiltInDocument = () => {
  try {
    const activeDoc = workspace.activeDocument.value

    if (!activeDoc) {
      ElMessage.warning(t('agent.reference.builtInDocument.noActiveDocument', '没有活动的文档'))
      return
    }

    // 确定文档格式
    const docFormat = activeDoc.format === 'tex' ? 'tex' : 'md'
    const formatName = docFormat === 'tex' ? 'LaTeX' : 'Markdown'

    // 根据文档格式获取内容
    const content = docFormat === 'tex' ? activeDoc.tex : activeDoc.markdown

    if (!content || content.trim().length === 0) {
      ElMessage.info(t('agent.reference.builtInDocument.emptyDocument', '当前文档为空'))
      return
    }

    // 创建临时reference用于预览
    const builtInRef: Reference = {
      id: 'built-in-document-reference-0',
      name: t('agent.reference.builtInDocument.title'),
      origin: activeDoc.path || t('agent.reference.builtInDocument.currentActiveDocument'),
      format: docFormat,
      parsedContent: content,
      description: `${t('agent.reference.builtInDocument.description')}（${formatName}格式）`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    // 显示预览对话框
    viewingReference.value = builtInRef
    contentDialogVisible.value = true
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  padding: '16px',
  minHeight: 0
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

/**
 * 将文件路径转换为 File 对象
 */
async function pathToFile(filePath: string): Promise<File> {
  const result = (await messageBridge.invoke('read-file-for-upload', filePath)) as {
    name: string
    data: string
    mimeType: string
  }

  // 将 base64 转换为 Blob
  const binaryString = atob(result.data)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  const blob = new Blob([bytes], { type: result.mimeType })

  return new File([blob], result.name, { type: result.mimeType })
}

const handleSelectFile = async () => {
  if (parsing.value) return

  try {
    // 使用主进程文件选择服务（使用 'all' 类别，对话框内部会显示所有分组）
    const filePaths = await selectReferenceFiles('all', false, t('agent.reference.selectFile'))

    if (filePaths.length === 0) {
      return // 用户取消了选择
    }

    const filePath = filePaths[0]
    const fileName = filePath.split(/[/\\]/).pop() || filePath

    // 将文件路径转换为 File 对象
    const file = await pathToFile(filePath)

    selectedFile.value = file
    // 如果名称为空，自动使用文件名
    if (!formData.value.name.trim()) {
      formData.value.name = fileName
    }
    parsedReference.value = null

    // 立即开始解析
    await startParsingFile(file)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
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

    // 如果名称为空，自动使用文件名
    if (!formData.value.name.trim() && selectedFile.value) {
      formData.value.name = selectedFile.value.name
    }

    // 延迟一下让用户看到成功消息
    await new Promise((resolve) => setTimeout(resolve, 500))
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

    await new Promise((resolve) => setTimeout(resolve, 500))
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
  if (currentRequestId.value) {
    try {
      messageBridge.invoke('cancel-file-conversion', currentRequestId.value)
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
    inputType: isUrl ? 'url' : isFile ? 'file' : 'text',
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
      createdAt:
        typeof props.session.createdAt === 'string'
          ? new Date(props.session.createdAt).getTime()
          : props.session.createdAt,
      updatedAt:
        typeof props.session.updatedAt === 'string'
          ? new Date(props.session.updatedAt).getTime()
          : props.session.updatedAt,
      messageQueue: props.session.messageQueue || [],
      referenceStore: props.session.referenceStore || [],
      publicContext: props.session.publicContext || {},
      executionNodes: props.session.executionNodes || [],
      status: props.session.status || 'idle'
    }

    if (editingReference.value) {
      // 编辑模式：只更新基本信息，不重新解析
      agentSessionManager.updateReference(newFormatSession, editingReference.value.id, {
        name: formData.value.name,
        description: formData.value.description
      })
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
        const { processTextReference } = await import(
          '../../utils/agent-framework/reference-processor'
        )
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
      createdAt:
        typeof props.session.createdAt === 'string'
          ? new Date(props.session.createdAt).getTime()
          : props.session.createdAt,
      updatedAt:
        typeof props.session.updatedAt === 'string'
          ? new Date(props.session.updatedAt).getTime()
          : props.session.updatedAt,
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
      createdAt:
        typeof props.session.createdAt === 'string'
          ? new Date(props.session.createdAt).getTime()
          : props.session.createdAt,
      updatedAt:
        typeof props.session.updatedAt === 'string'
          ? new Date(props.session.updatedAt).getTime()
          : props.session.updatedAt,
      messageQueue: props.session.messageQueue || [],
      referenceStore: props.session.referenceStore || [],
      publicContext: props.session.publicContext || {},
      executionNodes: props.session.executionNodes || [],
      status: props.session.status || 'idle'
    }

    // 清空所有引用
    const refIds = references.value.map((ref) => ref.id)
    refIds.forEach((id) => {
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
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.manager-header h3 {
  margin: 0;
  font-size: 16px;
}

.table-container {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
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

.built-in-reference-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  margin-bottom: 16px;
  background: var(--el-bg-color-page);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-light);
}

.built-in-reference-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.built-in-reference-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.info-icon {
  font-size: 20px;
  color: var(--el-color-primary);
}

.info-content {
  flex: 1;
}

.info-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}

.info-description {
  font-size: 12px;
  color: var(--el-text-color-regular);
  line-height: 1.4;
}
</style>
