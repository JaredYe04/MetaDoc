<template>
  <div
    class="aitask-item rounded-lg border bg-muted/30 px-3 py-2.5 mb-2 last:mb-0 transition-colors hover:bg-muted/50"
    :class="{
      'border-destructive/50': taskStatus === ai_task_status.FAILED
    }"
  >
    <div class="flex flex-col gap-1.5">
      <div class="flex justify-between items-start gap-2">
        <div class="min-w-0 flex-1">
          <div class="text-sm font-medium text-foreground truncate">
            {{ task.name.length > 24 ? task.name.slice(0, 24) + '…' : task.name }}
          </div>
          <div
            class="text-xs mt-0.5 min-h-[1.25rem] truncate max-w-full"
            :class="statusTextClass"
          >
            {{ statusLabel }}
          </div>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <Button
            v-if="taskStatus === ai_task_status.READY"
            size="icon-sm"
            variant="ghost"
            class="h-7 w-7 text-muted-foreground hover:text-foreground"
            @click="$emit('start')"
          >
            <PlayIcon class="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            class="h-7 w-7 text-muted-foreground hover:text-destructive"
            @click="$emit('cancel')"
          >
            <X class="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div
        v-if="taskStatus === ai_task_status.FAILED && task.error"
        class="rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive flex items-start gap-1.5"
      >
        <AlertTriangle class="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span><strong>{{ t('aiTask.errorTitle') }}:</strong> {{ task.error }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { X, AlertTriangle } from 'lucide-vue-next'
import { PlayIcon } from 'tdesign-icons-vue-next'
import { ai_task_status } from '../utils/consts'
import { useI18n } from 'vue-i18n'
import { Button } from '@renderer/components/ui/button'

const { t } = useI18n()

const props = defineProps({
  task: Object
})

const STREAM_PREVIEW_LEN = 48

function truncateStreamTail(raw) {
  if (!raw || typeof raw !== 'string') return ''
  const s = raw.trim()
  if (s.length <= STREAM_PREVIEW_LEN) return s
  return '…' + s.slice(-(STREAM_PREVIEW_LEN - 1))
}

const taskStatus = computed(() => {
  if (!props.task?.status) return ''
  const s = props.task.status
  return typeof s === 'object' && s && 'value' in s ? s.value : s
})

const targetContent = computed(() => {
  const target = props.task?.target
  if (!target) return ''
  return typeof target === 'object' && target && 'value' in target ? target.value : target
})

const isStreamingRunning = computed(() => {
  if (taskStatus.value !== ai_task_status.RUNNING) return false
  const meta = props.task?.meta
  if (meta && meta.stream === false) return false
  if (props.task?.type === 'tool') return false
  return true
})

const streamPreview = computed(() => {
  if (!isStreamingRunning.value) return ''
  const content = targetContent.value
  return truncateStreamTail(content)
})

const statusLabel = computed(() => {
  if (taskStatus.value === ai_task_status.RUNNING) {
    if (isStreamingRunning.value && streamPreview.value) return streamPreview.value
    return t('aiTask.status') + ': ' + taskStatus.value
  }
  return t('aiTask.status') + ': ' + taskStatus.value
})

const statusTextClass = computed(() => {
  switch (taskStatus.value) {
    case ai_task_status.FAILED:
      return 'text-destructive'
    case ai_task_status.CANCELLED:
      return 'text-muted-foreground'
    case ai_task_status.FINISHED:
      return 'text-muted-foreground'
    default:
      return 'text-muted-foreground'
  }
})
</script>
