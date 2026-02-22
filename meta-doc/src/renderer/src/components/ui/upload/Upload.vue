<script setup lang="ts">
import { ref, computed, watch, useSlots } from 'vue'
import { cn } from '@renderer/lib/utils'
import { Progress } from '@renderer/components/ui/progress'
import { Button } from '@renderer/components/ui/button'
import { X, File, UploadCloud, CheckCircle2, AlertCircle } from 'lucide-vue-next'

// Upload file item interface
export interface UploadFile {
  name: string
  url?: string
  uid: number | string
  size?: number
  raw?: File
  percentage?: number
  status?: 'ready' | 'uploading' | 'success' | 'error'
  response?: any
}

// Upload raw file interface
export interface UploadRawFile extends File {
  uid: number | string
}

// Props matching Element Plus el-upload API
interface Props {
  // Core props
  action?: string
  headers?: Record<string, string>
  multiple?: boolean
  data?: Record<string, any>
  name?: string
  withCredentials?: boolean
  showFileList?: boolean
  drag?: boolean
  accept?: string
  fileList?: UploadFile[]
  autoUpload?: boolean
  disabled?: boolean
  limit?: number
  // Styling
  class?: string
  listType?: 'text' | 'picture' | 'picture-card'
}

const props = withDefaults(defineProps<Props>(), {
  name: 'file',
  multiple: false,
  withCredentials: false,
  showFileList: true,
  drag: false,
  autoUpload: true,
  disabled: false,
  fileList: () => [],
  listType: 'text',
  class: ''
})

// Emits matching Element Plus el-upload events
const emit = defineEmits<{
  'update:fileList': [files: UploadFile[]]
  'success': [response: any, file: UploadFile, fileList: UploadFile[]]
  'error': [error: any, file: UploadFile, fileList: UploadFile[]]
  'progress': [evt: ProgressEvent, file: UploadFile, fileList: UploadFile[]]
  'remove': [file: UploadFile, fileList: UploadFile[]]
  'exceed': [files: File[], fileList: UploadFile[]]
  'change': [file: UploadFile, fileList: UploadFile[]]
}>()

const slots = useSlots()
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)

// Internal file list state
const uploadFiles = ref<UploadFile[]>([...props.fileList])

// Sync with v-model:fileList
watch(() => props.fileList, (newVal) => {
  if (newVal !== uploadFiles.value) {
    uploadFiles.value = [...newVal]
  }
}, { deep: true })

watch(uploadFiles, (newVal) => {
  emit('update:fileList', newVal)
}, { deep: true })

// Generate unique ID for files
let uid = 1
const genUid = () => Date.now() + uid++

// Handle file selection
const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = target.files
  if (!files) return

  handleFiles(Array.from(files))

  // Reset input to allow selecting same files again
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

// Process selected files
const handleFiles = (files: File[]) => {
  // Check limit
  if (props.limit && uploadFiles.value.length + files.length > props.limit) {
    emit('exceed', files, uploadFiles.value)
    return
  }

  files.forEach(rawFile => {
    const file: UploadFile = {
      name: rawFile.name,
      size: rawFile.size,
      uid: genUid(),
      raw: rawFile,
      status: 'ready',
      percentage: 0
    }

    // Add to list
    uploadFiles.value.push(file)
    emit('change', file, uploadFiles.value)

    // Auto upload if enabled
    if (props.autoUpload) {
      upload(file)
    }
  })
}

// Upload file
const upload = async (file: UploadFile) => {
  if (!file.raw || !props.action) return

  // Call before-upload hook if provided (via attrs)
  const beforeUpload = (attrs as any).beforeUpload || (attrs as any)['before-upload']
  if (beforeUpload && typeof beforeUpload === 'function') {
    try {
      const result = await beforeUpload(file.raw)
      if (result === false) {
        // Remove file from list
        removeFile(file)
        return
      }
      // If result is a Promise, wait for it
      if (result instanceof Promise) {
        await result
      }
    } catch (e) {
      removeFile(file)
      return
    }
  }

  file.status = 'uploading'

  const formData = new FormData()
  formData.append(props.name, file.raw)

  // Append extra data
  if (props.data) {
    Object.entries(props.data).forEach(([key, value]) => {
      formData.append(key, value)
    })
  }

  const xhr = new XMLHttpRequest()

  // Track progress
  xhr.upload.addEventListener('progress', (evt) => {
    if (evt.lengthComputable) {
      file.percentage = Math.round((evt.loaded / evt.total) * 100)
      emit('progress', evt, file, uploadFiles.value)
    }
  })

  // Handle completion
  xhr.addEventListener('load', () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      file.status = 'success'
      file.response = xhr.response
      try {
        file.response = JSON.parse(xhr.response)
      } catch {
        // Keep as string if not JSON
      }
      emit('success', file.response, file, uploadFiles.value)
      emit('change', file, uploadFiles.value)
    } else {
      file.status = 'error'
      const error = new Error(`Upload failed with status ${xhr.status}`)
      emit('error', error, file, uploadFiles.value)
      emit('change', file, uploadFiles.value)
    }
  })

  xhr.addEventListener('error', () => {
    file.status = 'error'
    const error = new Error('Upload failed')
    emit('error', error, file, uploadFiles.value)
    emit('change', file, uploadFiles.value)
  })

  xhr.open('POST', props.action)

  // Set headers
  if (props.headers) {
    Object.entries(props.headers).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value)
    })
  }

  // Set withCredentials
  if (props.withCredentials) {
    xhr.withCredentials = true
  }

  xhr.send(formData)
}

// Remove file from list
const removeFile = (file: UploadFile) => {
  const index = uploadFiles.value.indexOf(file)
  if (index > -1) {
    uploadFiles.value.splice(index, 1)
    emit('remove', file, uploadFiles.value)
  }
}

// Handle remove button click
const handleRemove = (file: UploadFile) => {
  // Check if there's an on-remove handler in attrs
  const onRemove = (attrs as any).onRemove || (attrs as any)['on-remove']
  if (onRemove && typeof onRemove === 'function') {
    const result = onRemove(file, uploadFiles.value)
    if (result !== false) {
      removeFile(file)
    }
  } else {
    removeFile(file)
  }
}

// Drag and drop handlers
const handleDragOver = (event: DragEvent) => {
  if (props.disabled || !props.drag) return
  event.preventDefault()
  isDragging.value = true
}

const handleDragLeave = (event: DragEvent) => {
  if (props.disabled || !props.drag) return
  event.preventDefault()
  isDragging.value = false
}

const handleDrop = (event: DragEvent) => {
  if (props.disabled || !props.drag) return
  event.preventDefault()
  isDragging.value = false

  const files = event.dataTransfer?.files
  if (files) {
    handleFiles(Array.from(files))
  }
}

// Trigger file input click
const triggerUpload = () => {
  if (props.disabled) return
  fileInputRef.value?.click()
}

// Submit upload (for manual upload mode)
const submit = () => {
  uploadFiles.value.forEach(file => {
    if (file.status === 'ready') {
      upload(file)
    }
  })
}

// Clear all files
const clearFiles = () => {
  uploadFiles.value = []
}

// Expose methods
defineExpose({
  submit,
  clearFiles,
  abort: () => { /* XMLHttpRequest abort can be implemented if needed */ }
})

// Get file icon based on status
const getFileStatusIcon = (file: UploadFile) => {
  switch (file.status) {
    case 'success':
      return CheckCircle2
    case 'error':
      return AlertCircle
    case 'uploading':
      return UploadCloud
    default:
      return File
  }
}

// Format file size
const formatFileSize = (bytes?: number) => {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Access attrs for dynamic handlers
const attrs = useSlots().default ? {} : {}
</script>

<template>
  <div :class="cn('upload-component', props.class)">
    <!-- Upload Trigger Area -->
    <div
      :class="cn(
        'upload-trigger relative',
        drag && 'upload-trigger-drag',
        isDragging && 'upload-trigger-dragging',
        disabled && 'upload-trigger-disabled opacity-50 cursor-not-allowed'
      )"
      @click="triggerUpload"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <!-- Hidden File Input -->
      <input
        ref="fileInputRef"
        type="file"
        :multiple="multiple"
        :accept="accept"
        class="hidden"
        @change="handleFileChange"
      >

      <!-- Default Slot / Trigger Content -->
      <slot>
        <!-- Default drag area if drag mode enabled -->
        <div
          v-if="drag"
          :class="cn(
            'border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-200',
            'hover:border-primary hover:bg-primary/5',
            isDragging && 'border-primary bg-primary/10',
            'border-border bg-muted/30'
          )"
        >
          <UploadCloud class="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p class="text-sm text-muted-foreground">
            <span class="font-medium text-foreground">Click to upload</span> or drag and drop
          </p>
          <p v-if="accept" class="text-xs text-muted-foreground mt-1">
            {{ accept }}
          </p>
        </div>

        <!-- Default button trigger -->
        <Button
          v-else
          type="button"
          variant="outline"
          :disabled="disabled"
        >
          <UploadCloud class="mr-2 h-4 w-4" />
          Click to upload
        </Button>
      </slot>
    </div>

    <!-- Tip Slot -->
    <div v-if="slots.tip" class="upload-tip mt-2 text-sm text-muted-foreground">
      <slot name="tip" />
    </div>

    <!-- File List -->
    <div v-if="showFileList && uploadFiles.length > 0" class="upload-file-list mt-4 space-y-2">
      <div
        v-for="file in uploadFiles"
        :key="file.uid"
        :class="cn(
          'upload-file-item flex items-center gap-3 p-3 rounded-md border bg-card',
          file.status === 'error' && 'border-destructive bg-destructive/5',
          file.status === 'success' && 'border-success bg-success/5'
        )"
      >
        <!-- File Icon -->
        <component
          :is="getFileStatusIcon(file)"
          :class="cn(
            'h-5 w-5 shrink-0',
            file.status === 'success' && 'text-success',
            file.status === 'error' && 'text-destructive',
            file.status === 'uploading' && 'text-primary'
          )"
        />

        <!-- File Info -->
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">{{ file.name }}</p>
          <p class="text-xs text-muted-foreground">
            {{ formatFileSize(file.size) }}
            <span v-if="file.status === 'uploading'" class="ml-2">
              {{ file.percentage }}%
            </span>
          </p>

          <!-- Progress Bar -->
          <Progress
            v-if="file.status === 'uploading'"
            :model-value="file.percentage || 0"
            class="h-1 mt-2"
          />
        </div>

        <!-- Status Badge -->
        <span
          v-if="file.status === 'success'"
          class="text-xs text-success font-medium"
        >
          Done
        </span>
        <span
          v-else-if="file.status === 'error'"
          class="text-xs text-destructive font-medium"
        >
          Failed
        </span>

        <!-- Remove Button -->
        <Button
          variant="ghost"
          size="icon"
          class="h-8 w-8 shrink-0"
          @click.stop="handleRemove(file)"
        >
          <X class="h-4 w-4" />
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.upload-trigger-drag {
  cursor: pointer;
}

.upload-trigger-dragging {
  cursor: copy;
}

.upload-trigger-disabled {
  pointer-events: none;
}

@keyframes pulse-border {
  0%, 100% {
    border-color: hsl(var(--primary) / 0.5);
  }
  50% {
    border-color: hsl(var(--primary));
  }
}

.upload-trigger-dragging > div {
  animation: pulse-border 1.5s ease-in-out infinite;
}
</style>
