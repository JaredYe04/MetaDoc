<template>
  <div class="user-feedback-view" :style="containerStyle">
    <div class="view-header">
      <h2 class="view-title">{{ $t('userFeedback.title') }}</h2>
    </div>

    <div class="feedback-form-scroll">
      <Form class="feedback-form space-y-4">
        <FormField :label="$t('userFeedback.feedbackType')" name="type" required>
          <Select
            v-model="form.type"
            :disabled="submitting"
          >
            <SelectTrigger :style="{ color: themeState.currentTheme.textColor, width: '100%' }">
              <SelectValue :placeholder="$t('userFeedback.selectType')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="opt in feedbackTypeOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        <FormField :label="$t('userFeedback.titleLabel')" name="title" required>
          <Input
            v-model="form.title"
            :placeholder="$t('userFeedback.titlePlaceholder')"
            maxlength="200"
            :disabled="submitting"
          />
          <div class="text-xs text-muted-foreground mt-1">{{ form.title.length }}/200</div>
        </FormField>

        <FormField :label="$t('userFeedback.bodyLabel')" name="body" required>
          <div ref="editorContainer" class="monaco-editor-container"></div>
        </FormField>

        <FormField :label="$t('userFeedback.attachments')" name="attachments">
          <div class="attachments-area">
            <Upload
              ref="uploadRef"
              :auto-upload="false"
              :limit="5"
              multiple
              :show-file-list="false"
              :disabled="submitting || attachmentBase64List.length >= MAX_ATTACHMENTS"
              @change="handleFileChange"
              @exceed="handleExceed"
              @remove="handleRemove"
              v-model:file-list="fileList"
            >
              <Button
                type="primary"
                plain
                :disabled="submitting || attachmentBase64List.length >= MAX_ATTACHMENTS"
                >{{ $t('userFeedback.addAttachment') }}</Button
              >
            </Upload>
            <div v-if="attachmentBase64List.length > 0" class="attachment-list">
              <div
                v-for="(att, index) in attachmentBase64List"
                :key="att.filename + index"
                class="attachment-item"
                :class="{ 'attachment-image': isImageMime(att.mime) }"
                @click="isImageMime(att.mime) ? openImagePreview(att) : null"
              >
                <img
                  v-if="isImageMime(att.mime)"
                  :src="'data:' + att.mime + ';base64,' + att.content_base64"
                  class="attachment-thumb"
                  :alt="att.filename"
                />
                <span v-else class="attachment-name">{{ att.filename }}</span>
                <Check
                  v-if="uploadedAttachmentIndices.includes(index)"
                  class="w-4 h-4"
                  title="已上传到 Gist"
                />
                <Eye
                  v-if="isImageMime(att.mime)"
                  class="w-4 h-4"
                />
                <XCircle
                  v-show="!submitting"
                  class="w-4 h-4"
                  @click.stop="removeAttachment(att.filename)"
                />
              </div>
            </div>
            <div class="attachment-hint">
              {{ $t('userFeedback.attachmentRules') }}
            </div>
            <div v-if="attachmentsError" class="attachment-error">{{ attachmentsError }}</div>
          </div>
        </FormField>

        <div class="feedback-footer">
          <div class="footer-hint">{{ $t('userFeedback.footerHint') }}</div>
          <div class="footer-contact">
            {{ $t('userFeedback.emailHint') }}
            <span class="footer-copy" @click="copyToClipboard('1010268129@outlook.com')"
              >1010268129@outlook.com</span
            >
          </div>
          <div class="footer-contact">
            {{ $t('userFeedback.qqGroupHint') }}
            <span class="footer-copy" @click="copyToClipboard('1079841705')">1079841705</span>
          </div>
        </div>
      </Form>
    </div>

    <div class="feedback-submit-bar">
      <Button type="primary" :loading="submitting" :disabled="!canSubmit" @click="handleSubmit">
        {{ submitting ? $t('userFeedback.submitting') : $t('userFeedback.submit') }}
      </Button>
    </div>

    <ImagePreviewDialog v-model="showImagePreview" :image-url="previewImageUrl" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Eye, XCircle, Check } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Form, FormField } from '@renderer/components/ui/form'
import { Upload, type UploadFile } from '@renderer/components/ui/upload'
import * as monaco from 'monaco-editor'
import { themeState } from '../utils/themes'
import { getAppVersion } from '../utils/version'
import { setupMonacoWorker } from '../utils/monaco-worker-config'
import ImagePreviewDialog from '../components/common/ImagePreviewDialog.vue'
import messageBridge from '../bridge/message-bridge'

// 与 Gist 能力一致：单文件 raw 可至约 10 MB，最多 5 个附件
const SINGLE_FILE_MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const TOTAL_ATTACHMENTS_MAX_BYTES = 50 * 1024 * 1024 // 50 MB (5 × 10 MB)
const MAX_ATTACHMENTS = 5
const SINGLE_FILE_MAX_LABEL = '10 MB'
const TOTAL_MAX_LABEL = '50 MB'

const { t } = useI18n()

const form = ref({
  type: 'bug' as 'bug' | 'feature' | 'security' | 'other',
  title: '',
  body: ''
})

const feedbackTypeOptions = computed(() => [
  { value: 'bug', label: t('userFeedback.types.bug') },
  { value: 'feature', label: t('userFeedback.types.feature') },
  { value: 'security', label: t('userFeedback.types.security') },
  { value: 'other', label: t('userFeedback.types.other') }
])

const editorContainer = ref<HTMLElement>()
let editor: monaco.editor.IStandaloneCodeEditor | null = null
const submitting = ref(false)
const fileList = ref<UploadFile[]>([])
const attachmentBase64List = ref<Array<{ filename: string; mime: string; content_base64: string }>>(
  []
)
const attachmentsError = ref('')
const uploadRef = ref<any>()

const bodyFromEditor = ref('')
const showImagePreview = ref(false)
const previewImageUrl = ref('')
/** 提交过程中已成功上传到 Gist 的附件索引，用于显示打勾 */
const uploadedAttachmentIndices = ref<number[]>([])

const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

function getSystemInfoBlock(): string {
  const os = typeof navigator !== 'undefined' ? `${navigator.platform || 'Unknown'}` : 'Unknown'
  const cpu =
    typeof navigator !== 'undefined' && (navigator as any).hardwareConcurrency
      ? `${(navigator as any).hardwareConcurrency} cores`
      : 'Unknown'
  const ram = 'N/A'
  const gpu = 'N/A'
  const version = 'MetaDoc Version'
  return [
    `### ${t('userFeedback.template.systemInfo')}`,
    `- OS: ${os}`,
    `- CPU: ${cpu}`,
    `- GPU: ${gpu}`,
    `- RAM: ${ram}`,
    `- ${version}: `
  ].join('\n')
}

async function buildBodyTemplate(): Promise<string> {
  const sysBlock = getSystemInfoBlock()
  const metaVersion = await getAppVersion()
  const sysBlockWithVersion = sysBlock + metaVersion + '\n\n'
  const desc = t('userFeedback.template.describeProblem')
  const expected = t('userFeedback.template.expectedResult')
  const other = t('userFeedback.template.otherInfo')
  const contact = t('userFeedback.template.contactOptional')
  return (
    sysBlockWithVersion +
    `### ${t('userFeedback.template.describeProblemTitle')}\n\n<!-- ${desc} -->\n\n` +
    `### ${t('userFeedback.template.expectedResultTitle')}\n\n<!-- ${expected} -->\n\n` +
    `### ${t('userFeedback.template.otherInfoTitle')}\n\n<!-- ${other} -->\n\n` +
    `### ${t('userFeedback.template.contactTitle')}\n\n<!-- ${contact} -->`
  )
}

async function injectSystemInfoFromMain(): Promise<void> {
  let os = navigator.platform || 'Unknown'
  let cpu = `${(navigator as any).hardwareConcurrency ?? '?'} cores`
  let ram = 'N/A'
  let gpu = 'N/A'
  try {
    const ipc = messageBridge.getIpc()
    if (ipc?.invoke) {
      const info = await ipc.invoke('get-system-info')
      if (info) {
        os = info.os ?? os
        cpu = info.cpu ?? cpu
        ram = info.ram ?? ram
        gpu = info.gpu ?? gpu
      }
    }
  } catch (_) {}
  const version = await getAppVersion()
  const model = editor?.getModel()
  if (model) {
    const full = model.getValue()
    const head = '### ' + t('userFeedback.template.systemInfo')
    const idx = full.indexOf(head)
    if (idx !== -1) {
      const endOfLine = full.indexOf('\n', idx)
      const afterHead = full.slice(endOfLine + 1)
      const nextH3 = afterHead.indexOf('\n### ')
      const systemPart = nextH3 === -1 ? afterHead : afterHead.slice(0, nextH3)
      const rest = nextH3 === -1 ? '' : afterHead.slice(nextH3)
      const newSystem = [
        head,
        `- OS: ${os}`,
        `- CPU: ${cpu}`,
        `- GPU: ${gpu}`,
        `- RAM: ${ram}`,
        `- MetaDoc Version: ${version}`
      ].join('\n')
      const before = full.slice(0, idx)
      const newFull = before + newSystem + (rest ? '\n' + rest : '')
      editor?.setValue(newFull)
      return
    }
  }
  const sysBlock =
    [
      '### ' + t('userFeedback.template.systemInfo'),
      `- OS: ${os}`,
      `- CPU: ${cpu}`,
      `- GPU: ${gpu}`,
      `- RAM: ${ram}`,
      `- MetaDoc Version: ${version}`
    ].join('\n') + '\n\n'
  const tail = [
    `### ${t('userFeedback.template.describeProblemTitle')}\n\n<!-- ${t('userFeedback.template.describeProblem')} -->\n\n`,
    `### ${t('userFeedback.template.expectedResultTitle')}\n\n<!-- ${t('userFeedback.template.expectedResult')} -->\n\n`,
    `### ${t('userFeedback.template.otherInfoTitle')}\n\n<!-- ${t('userFeedback.template.otherInfo')} -->\n\n`,
    `### ${t('userFeedback.template.contactTitle')}\n\n<!-- ${t('userFeedback.template.contactOptional')} -->`
  ].join('')
  if (editor) editor.setValue(sysBlock + tail)
}

function totalAttachmentBytes(): number {
  return attachmentBase64List.value.reduce((sum, a) => {
    try {
      const bin = atob(a.content_base64)
      return sum + bin.length
    } catch {
      return sum
    }
  }, 0)
}

function validateAttachments(): boolean {
  attachmentsError.value = ''
  if (attachmentBase64List.value.length > MAX_ATTACHMENTS) {
    attachmentsError.value = t('userFeedback.errors.tooManyFiles', { max: MAX_ATTACHMENTS })
    return false
  }
  for (const a of attachmentBase64List.value) {
    try {
      const bin = atob(a.content_base64)
      if (bin.length > SINGLE_FILE_MAX_BYTES) {
        attachmentsError.value = t('userFeedback.errors.singleFileTooLarge', {
          max: SINGLE_FILE_MAX_LABEL
        })
        return false
      }
    } catch {
      attachmentsError.value = t('userFeedback.errors.invalidFile')
      return false
    }
  }
  const total = totalAttachmentBytes()
  if (total > TOTAL_ATTACHMENTS_MAX_BYTES) {
    attachmentsError.value = t('userFeedback.errors.totalTooLarge', { max: TOTAL_MAX_LABEL })
    return false
  }
  return true
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function getMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    log: 'text/plain'
  }
  return map[ext] || 'application/octet-stream'
}

async function handleFileChange(uploadFile: UploadFile) {
  const raw = uploadFile.raw
  if (!raw) return
  if (raw.size > SINGLE_FILE_MAX_BYTES) {
    ElMessage.warning(t('userFeedback.errors.singleFileTooLarge', { max: SINGLE_FILE_MAX_LABEL }))
    fileList.value = fileList.value.filter((f) => f.uid !== uploadFile.uid)
    return
  }
  const base64 = await readFileAsBase64(raw)
  const existing = attachmentBase64List.value.findIndex((a) => a.filename === raw.name)
  if (existing >= 0) {
    attachmentBase64List.value[existing] = {
      filename: raw.name,
      mime: getMime(raw.name),
      content_base64: base64
    }
  } else {
    attachmentBase64List.value.push({
      filename: raw.name,
      mime: getMime(raw.name),
      content_base64: base64
    })
  }
  const total = totalAttachmentBytes()
  if (total > TOTAL_ATTACHMENTS_MAX_BYTES) {
    attachmentsError.value = t('userFeedback.errors.totalTooLarge', { max: TOTAL_MAX_LABEL })
  } else {
    attachmentsError.value = ''
  }
  if (attachmentBase64List.value.length > MAX_ATTACHMENTS) {
    fileList.value = fileList.value.slice(0, MAX_ATTACHMENTS)
    attachmentBase64List.value = attachmentBase64List.value.slice(0, MAX_ATTACHMENTS)
    attachmentsError.value = t('userFeedback.errors.tooManyFiles', { max: MAX_ATTACHMENTS })
  }
}

function handleExceed() {
  ElMessage.warning(t('userFeedback.errors.tooManyFiles', { max: MAX_ATTACHMENTS }))
}

function handleRemove(uploadFile: UploadFile) {
  removeAttachment(uploadFile.name)
}

function removeAttachment(filename: string) {
  fileList.value = fileList.value.filter((f) => f.name !== filename)
  attachmentBase64List.value = attachmentBase64List.value.filter((a) => a.filename !== filename)
  attachmentsError.value = ''
}

function isImageMime(mime: string): boolean {
  return /^image\//.test(mime)
}

function openImagePreview(att: { filename: string; mime: string; content_base64: string }) {
  previewImageUrl.value = `data:${att.mime};base64,${att.content_base64}`
  showImagePreview.value = true
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(t('userFeedback.copied'))
  } catch {
    ElMessage.error(t('userFeedback.copyFailed'))
  }
}

const canSubmit = computed(() => {
  const body = bodyFromEditor.value.trim()
  return !!form.value.title.trim() && !!body && !attachmentsError.value
})

async function handleSubmit() {
  if (!editor) return
  const body = editor.getValue()
  form.value.body = body
  if (!form.value.title.trim()) {
    ElMessage.warning(t('userFeedback.errors.titleRequired'))
    return
  }
  if (!body.trim()) {
    ElMessage.warning(t('userFeedback.errors.bodyRequired'))
    return
  }
  if (!validateAttachments()) {
    return
  }
  submitting.value = true
  uploadedAttachmentIndices.value = []
  try {
    const ipc = messageBridge.getIpc()
    if (!ipc?.invoke) {
      ElMessage.error(t('userFeedback.errors.noIpc'))
      return
    }
    const attachmentsJson = JSON.stringify(attachmentBase64List.value)
    await messageBridge.invoke('trigger-feedback-workflow', {
      title: form.value.title.trim(),
      type: form.value.type,
      body,
      attachments: attachmentsJson
    })
    ElMessage.success(t('userFeedback.submitSuccess'))
    form.value.title = ''
    form.value.body = ''
    const template = await buildBodyTemplate()
    editor.setValue(template)
    await injectSystemInfoFromMain()
    fileList.value = []
    attachmentBase64List.value = []
    uploadRef.value?.clearFiles()
  } catch (err: any) {
    const msg = err?.message || String(err)
    ElMessage.error(t('userFeedback.submitFailed') + ': ' + msg)
  } finally {
    submitting.value = false
  }
}

let feedbackAttachmentUploadedHandler: ((_e: any, index: number) => void) | null = null

onMounted(async () => {
  feedbackAttachmentUploadedHandler = (_e: any, index: number) => {
    uploadedAttachmentIndices.value = [...uploadedAttachmentIndices.value, index]
  }
  messageBridge.on('feedback-attachment-uploaded', feedbackAttachmentUploadedHandler)
  setupMonacoWorker()
  if (!editorContainer.value) return
  const template = await buildBodyTemplate()
  const isDark = themeState.currentTheme.type === 'dark'
  editor = monaco.editor.create(editorContainer.value, {
    value: template,
    language: 'markdown',
    theme: isDark ? 'vs-dark' : 'vs',
    automaticLayout: true,
    minimap: { enabled: true },
    scrollBeyondLastLine: false,
    fontSize: 14,
    lineNumbers: 'on',
    wordWrap: 'on',
    readOnly: false
  })
  bodyFromEditor.value = editor.getValue()
  editor.onDidChangeModelContent(() => {
    bodyFromEditor.value = editor?.getModel()?.getValue() ?? ''
  })
  await injectSystemInfoFromMain()
})

watch(
  () => themeState.currentTheme.type,
  (type) => {
    if (editor) {
      monaco.editor.setTheme(type === 'dark' ? 'vs-dark' : 'vs')
    }
  }
)

watch(submitting, (v) => {
  if (editor) {
    editor.updateOptions({ readOnly: v })
  }
})

onBeforeUnmount(() => {
  if (feedbackAttachmentUploadedHandler) {
    messageBridge.removeListener('feedback-attachment-uploaded', feedbackAttachmentUploadedHandler)
    feedbackAttachmentUploadedHandler = null
  }
  if (editor) {
    editor.dispose()
    editor = null
  }
})
</script>

<style scoped>
.user-feedback-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px;
  overflow: hidden;
}

.view-header {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.3);
}

.view-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.feedback-form-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.feedback-form {
  min-height: 0;
}

.feedback-submit-bar {
  flex-shrink: 0;
  padding: 16px 0 0;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
}

.monaco-editor-container {
  width: 100%;
  height: 320px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
}

.attachments-area {
  width: 100%;
}

.attachment-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 8px;
}

.attachment-error {
  color: var(--el-color-danger);
  font-size: 12px;
  margin-top: 4px;
}

.feedback-footer {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.footer-hint {
  margin-bottom: 8px;
}

.footer-contact {
  margin-bottom: 4px;
}

.footer-copy {
  cursor: pointer;
  text-decoration: underline;
  color: var(--el-color-primary);
  user-select: none;
}

.footer-copy:hover {
  opacity: 0.85;
}

.attachment-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
}

.attachment-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-light);
  font-size: 13px;
}

.attachment-item.attachment-image {
  cursor: pointer;
  padding: 4px;
}

.attachment-item.attachment-image:hover {
  border-color: var(--el-color-primary);
  background: var(--el-fill-color);
}

.attachment-thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 4px;
  display: block;
}

.attachment-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-preview-hint {
  font-size: 14px;
  color: var(--el-color-primary);
  margin-left: 4px;
}

.attachment-remove {
  font-size: 16px;
  margin-left: 4px;
  cursor: pointer;
  color: var(--el-text-color-secondary);
}

.attachment-remove:hover {
  color: var(--el-color-danger);
}

.attachment-uploaded-check {
  font-size: 16px;
  margin-left: 4px;
  color: var(--el-color-success);
}
</style>
