<template>
  <div class="shortcut-key-input">
    <Button
      v-if="!recording"
      type="button"
      variant="outline"
      size="sm"
      class="key-display"
      @click="startRecording"
    >
      {{ displayText || t('setting.shortcuts.pressKey') }}
    </Button>
    <span v-else class="recording-hint">{{ t('setting.shortcuts.recording') }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@renderer/components/ui/button/Button.vue'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { t } = useI18n()
const recording = ref(false)

const displayText = computed(() => props.modelValue || '')

function formatKeyboardKey(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  if (e.metaKey) parts.push('Meta')
  const key =
    e.key === ' '
      ? 'Space'
      : e.key.length === 1
        ? e.key.toUpperCase()
        : e.key
  if (key && !parts.includes(key)) parts.push(key)
  return parts.join('+')
}

function formatMouseKey(e: MouseEvent, extraKey?: string): string {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  if (e.metaKey) parts.push('Meta')

  let key = extraKey
  if (!key) {
    if (e.button === 0) key = 'LeftClick'
    else if (e.button === 1) key = 'MiddleClick'
    else if (e.button === 2) key = 'RightClick'
    else if (e.button === 3) key = 'Button4'
    else if (e.button === 4) key = 'Button5'
  }

  if (key && !parts.includes(key)) parts.push(key)
  return parts.join('+')
}

function formatWheelKey(e: WheelEvent): string {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  if (e.metaKey) parts.push('Meta')
  const key = e.deltaY < 0 ? 'WheelUp' : e.deltaY > 0 ? 'WheelDown' : ''
  if (key && !parts.includes(key)) parts.push(key)
  return parts.join('+')
}

function startRecording() {
  recording.value = true
}

function finishRecording(value: string | null) {
  if (value) {
    emit('update:modelValue', value)
  }
  recording.value = false
}

function onKeyDown(e: KeyboardEvent) {
  if (!recording.value) return
  e.preventDefault()
  e.stopPropagation()
  if (e.key === 'Escape') {
    finishRecording(null)
    return
  }
  const formatted = formatKeyboardKey(e)
  if (formatted) {
    finishRecording(formatted)
  }
}

function onMouseDown(e: MouseEvent) {
  if (!recording.value) return
  e.preventDefault()
  e.stopPropagation()
  const formatted = formatMouseKey(e)
  if (formatted) {
    finishRecording(formatted)
  }
}

function onDblClick(e: MouseEvent) {
  if (!recording.value) return
  e.preventDefault()
  e.stopPropagation()
  const formatted = formatMouseKey(e, 'DoubleClick')
  if (formatted) {
    finishRecording(formatted)
  }
}

function onWheel(e: WheelEvent) {
  if (!recording.value) return
  e.preventDefault()
  e.stopPropagation()
  const formatted = formatWheelKey(e)
  if (formatted) {
    finishRecording(formatted)
  }
}

watch(recording, (val) => {
  if (val) {
    nextTick(() => {
      window.addEventListener('keydown', onKeyDown, true)
      window.addEventListener('mousedown', onMouseDown, true)
      window.addEventListener('dblclick', onDblClick, true)
      window.addEventListener('wheel', onWheel, { capture: true, passive: false })
    })
  } else {
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('mousedown', onMouseDown, true)
    window.removeEventListener('dblclick', onDblClick, true)
    window.removeEventListener('wheel', onWheel as any, true)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('mousedown', onMouseDown, true)
  window.removeEventListener('dblclick', onDblClick, true)
  window.removeEventListener('wheel', onWheel as any, true)
})
</script>

<style scoped>
.shortcut-key-input {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.key-display {
  min-width: 140px;
  font-family: var(--font-mono, monospace);
}
.recording-hint {
  font-size: 12px;
  color: var(--el-color-primary);
}
</style>
