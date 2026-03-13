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

function formatKey(e: KeyboardEvent): string {
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

function startRecording() {
  recording.value = true
}

function onKeyDown(e: KeyboardEvent) {
  if (!recording.value) return
  e.preventDefault()
  e.stopPropagation()
  if (e.key === 'Escape') {
    recording.value = false
    return
  }
  const formatted = formatKey(e)
  if (formatted) {
    emit('update:modelValue', formatted)
    recording.value = false
  }
}

watch(recording, (val) => {
  if (val) {
    nextTick(() => {
      window.addEventListener('keydown', onKeyDown, true)
    })
  } else {
    window.removeEventListener('keydown', onKeyDown, true)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown, true)
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
