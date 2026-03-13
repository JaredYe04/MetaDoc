<template>
  <div class="shortcut-binding-input">
    <!-- 可编辑：标签 + 点击录制框 + 重置 -->
    <div class="binding-editor">
      <div
        v-for="(key, i) in keys"
        :key="i"
        class="key-tag"
      >
        <span class="key-tag-text">{{ key }}</span>
        <button
          type="button"
          class="key-tag-remove"
          :aria-label="t('setting.shortcuts.removeKey')"
          @click="removeKey(i)"
        >
          <X class="h-3 w-3" />
        </button>
      </div>
      <div
        class="record-box"
        :class="{ recording, 'has-preview': recording && recordingPreview }"
        @click="startRecording"
      >
        <template v-if="recording && recordingPreview">
          {{ recordingPreview }}
        </template>
        <template v-else>
          {{ recording ? t('setting.shortcuts.recording') : t('setting.shortcuts.pressKey') }}
        </template>
      </div>
    </div>
    <Button
      v-if="showReset"
      size="sm"
      variant="ghost"
      class="reset-btn"
      @click="$emit('reset')"
    >
      {{ t('setting.shortcuts.reset') }}
    </Button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { X } from 'lucide-vue-next'
import Button from '@renderer/components/ui/button/Button.vue'

const props = withDefaults(
  defineProps<{
    modelValue: string[]
    defaultKeys?: string[]
  }>(),
  { defaultKeys: () => [] }
)

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
  reset: []
}>()

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta'])

const { t } = useI18n()
const recording = ref(false)
const recordingPreview = ref('')

const keys = computed(() => {
  const v = props.modelValue
  return Array.isArray(v) ? [...v] : v ? [v] : []
})

const showReset = computed(() => {
  if (!props.defaultKeys?.length && !keys.value.length) return false
  const def = (props.defaultKeys || []).slice().sort().join(',')
  const cur = keys.value.slice().sort().join(',')
  return def !== cur
})

function formatMainKey(key: string): string {
  return key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key
}

function buildShortcutString(ctrl: boolean, shift: boolean, alt: boolean, meta: boolean, mainKey: string): string {
  const parts: string[] = []
  if (ctrl) parts.push('Ctrl')
  if (shift) parts.push('Shift')
  if (alt) parts.push('Alt')
  if (meta) parts.push('Meta')
  if (mainKey && !parts.includes(mainKey)) parts.push(mainKey)
  return parts.join('+')
}

function startRecording() {
  recording.value = true
  recordingPreview.value = ''
}

function removeKey(index: number) {
  const next = keys.value.filter((_, i) => i !== index)
  emit('update:modelValue', next)
}

function onKeyDown(e: KeyboardEvent) {
  if (!recording.value) return
  e.preventDefault()
  e.stopPropagation()
  if (e.key === 'Escape') {
    recording.value = false
    recordingPreview.value = ''
    return
  }
  const isModifier = MODIFIER_KEYS.has(e.key)
  const ctrl = e.ctrlKey
  const shift = e.shiftKey
  const alt = e.altKey
  const meta = e.metaKey
  const mainKey = formatMainKey(e.key)

  if (isModifier) {
    recordingPreview.value = buildShortcutString(ctrl, shift, alt, meta, '')
    return
  }
  const formatted = buildShortcutString(ctrl, shift, alt, meta, mainKey)
  if (formatted) {
    const next = keys.value.includes(formatted) ? keys.value : [...keys.value, formatted]
    emit('update:modelValue', next)
    recording.value = false
    recordingPreview.value = ''
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
.shortcut-binding-input {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.keys-readonly {
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.binding-editor {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.key-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  background: hsl(var(--muted));
  font-family: var(--font-mono, monospace);
  font-size: 12px;
}

.key-tag-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  border-radius: 2px;
}

.key-tag-remove:hover {
  color: hsl(var(--foreground));
  background: hsl(var(--muted-foreground) / 0.2);
}

.record-box {
  min-width: 120px;
  padding: 6px 10px;
  border: 1px dashed hsl(var(--border));
  border-radius: 4px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}

.record-box:hover {
  border-color: hsl(var(--primary) / 0.5);
  color: hsl(var(--primary));
}

.record-box.recording {
  border-color: hsl(var(--primary));
  color: hsl(var(--primary));
}

.reset-btn {
  flex-shrink: 0;
}

.record-box.has-preview {
  font-family: var(--font-mono, monospace);
}
</style>
