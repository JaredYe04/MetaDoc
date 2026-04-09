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
const recordingStartedAt = ref(0)

// 录制状态：以 mouseup / keyup 作为“输入结束”
const lastMods = ref({ ctrl: false, shift: false, alt: false, meta: false })
const hadAnyModifierDuringRecording = ref(false)
const mouseIsDown = ref(false)
const modifierSnapshot = ref('')
const modifierSnapshotCount = ref(0)

type PendingAction =
  | { kind: 'mouse'; mainKey: string; mods: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean } }
  | { kind: 'wheel'; mainKey: 'WheelUp' | 'WheelDown'; mods: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean } }

const pendingAction = ref<PendingAction | null>(null)

let pendingSingleClickTimer: number | null = null
let pendingSingleClickCandidate:
  | { mainKey: string; mods: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean } }
  | null = null

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
  recordingStartedAt.value = typeof performance !== 'undefined' ? performance.now() : Date.now()
  lastMods.value = { ctrl: false, shift: false, alt: false, meta: false }
  hadAnyModifierDuringRecording.value = false
  mouseIsDown.value = false
  modifierSnapshot.value = ''
  modifierSnapshotCount.value = 0
  pendingAction.value = null
  pendingSingleClickCandidate = null
  if (pendingSingleClickTimer != null) {
    window.clearTimeout(pendingSingleClickTimer)
    pendingSingleClickTimer = null
  }
}

function removeKey(index: number) {
  const next = keys.value.filter((_, i) => i !== index)
  emit('update:modelValue', next)
}

function countMods(mods: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean }): number {
  return (mods.ctrl ? 1 : 0) + (mods.shift ? 1 : 0) + (mods.alt ? 1 : 0) + (mods.meta ? 1 : 0)
}

function updateModsFromEvent(
  e: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean },
  options: { captureSnapshot: boolean }
) {
  lastMods.value = {
    ctrl: !!e.ctrlKey,
    shift: !!e.shiftKey,
    alt: !!e.altKey,
    meta: !!e.metaKey
  }
  if (lastMods.value.ctrl || lastMods.value.shift || lastMods.value.alt || lastMods.value.meta) {
    hadAnyModifierDuringRecording.value = true
  }
  if (!options.captureSnapshot) return

  // 录制过程中：只在“修饰键数量增加/达到更复杂组合”时更新快照，避免 keyup 覆盖成单键
  const curCount = countMods(lastMods.value)
  if (curCount <= 0) return
  const preview = buildShortcutString(lastMods.value.ctrl, lastMods.value.shift, lastMods.value.alt, lastMods.value.meta, '')
  if (!preview) return
  if (curCount >= modifierSnapshotCount.value) {
    modifierSnapshotCount.value = curCount
    modifierSnapshot.value = preview
    recordingPreview.value = preview
  }
}

function commitShortcut(formatted: string) {
  if (!formatted) return
  const next = keys.value.includes(formatted) ? keys.value : [...keys.value, formatted]
  emit('update:modelValue', next)
  recording.value = false
  recordingPreview.value = ''
  pendingAction.value = null
  pendingSingleClickCandidate = null
  if (pendingSingleClickTimer != null) {
    window.clearTimeout(pendingSingleClickTimer)
    pendingSingleClickTimer = null
  }
}

function tryFinalizeOnRelease() {
  if (!recording.value) return
  // 必须等鼠标与修饰键全部松开，才算一次输入结束
  const modsAllReleased =
    !lastMods.value.ctrl && !lastMods.value.shift && !lastMods.value.alt && !lastMods.value.meta
  if (mouseIsDown.value) return
  if (!modsAllReleased) return

  // 如果有待提交动作（点击/双击/滚轮），用动作发生时的 mods 快照
  if (pendingAction.value) {
    const a = pendingAction.value
    commitShortcut(buildShortcutString(a.mods.ctrl, a.mods.shift, a.mods.alt, a.mods.meta, a.mainKey))
    return
  }

  // 否则允许仅修饰键（曾经按下过）作为快捷键
  if (hadAnyModifierDuringRecording.value) {
    const preview = modifierSnapshot.value || recordingPreview.value
    if (preview) {
      commitShortcut(preview)
      return
    }
  }

  // 没有任何有效输入，保持录制（等待下一次输入）
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
  updateModsFromEvent(e, { captureSnapshot: true })
  const ctrl = e.ctrlKey
  const shift = e.shiftKey
  const alt = e.altKey
  const meta = e.metaKey
  const mainKey = formatMainKey(e.key)

  if (isModifier) {
    return
  }
  // 非修饰键：按键本身立即作为 mainKey，但仍以“释放结束”作为最终提交
  pendingAction.value = {
    kind: 'mouse',
    mainKey,
    mods: { ctrl, shift, alt, meta }
  }
  recordingPreview.value = buildShortcutString(ctrl, shift, alt, meta, mainKey)
}

function onKeyUp(e: KeyboardEvent) {
  if (!recording.value) return
  e.preventDefault()
  e.stopPropagation()
  updateModsFromEvent(e, { captureSnapshot: false })
  // keyup 作为“释放结束”的触发点之一
  tryFinalizeOnRelease()
}

function onMouseDown(e: MouseEvent) {
  if (!recording.value) return
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (now - recordingStartedAt.value < 200) return
  e.preventDefault()
  e.stopPropagation()
  mouseIsDown.value = true
  updateModsFromEvent(e, { captureSnapshot: true })
}

function onDblClick(e: MouseEvent) {
  if (!recording.value) return
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (now - recordingStartedAt.value < 200) return

  e.preventDefault()
  e.stopPropagation()
  updateModsFromEvent(e, { captureSnapshot: true })
  // dblclick 出现时，取消单击候选
  if (pendingSingleClickTimer != null) {
    window.clearTimeout(pendingSingleClickTimer)
    pendingSingleClickTimer = null
  }
  pendingSingleClickCandidate = null

  pendingAction.value = {
    kind: 'mouse',
    mainKey: 'DoubleClick',
    mods: { ctrl: !!e.ctrlKey, shift: !!e.shiftKey, alt: !!e.altKey, meta: !!e.metaKey }
  }
  recordingPreview.value = buildShortcutString(
    !!e.ctrlKey,
    !!e.shiftKey,
    !!e.altKey,
    !!e.metaKey,
    'DoubleClick'
  )
  // dblclick 本身可能不会再有后续 mouseup/keyup（无修饰键时），因此这里尝试直接 finalize
  tryFinalizeOnRelease()
}

function onWheel(e: WheelEvent) {
  if (!recording.value) return
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (now - recordingStartedAt.value < 200) return

  e.preventDefault()
  e.stopPropagation()
  updateModsFromEvent(e, { captureSnapshot: true })
  const mainKey = e.deltaY < 0 ? 'WheelUp' : e.deltaY > 0 ? 'WheelDown' : ''
  if (!mainKey) return
  pendingAction.value = {
    kind: 'wheel',
    mainKey: mainKey as 'WheelUp' | 'WheelDown',
    mods: { ctrl: !!e.ctrlKey, shift: !!e.shiftKey, alt: !!e.altKey, meta: !!e.metaKey }
  }
  recordingPreview.value = buildShortcutString(
    !!e.ctrlKey,
    !!e.shiftKey,
    !!e.altKey,
    !!e.metaKey,
    mainKey
  )
  // 滚轮没有 mouseup，通常靠 keyup（松开 Ctrl 等）来 finalize；若无修饰键，则立即 finalize
  tryFinalizeOnRelease()
}

function onMouseUp(e: MouseEvent) {
  if (!recording.value) return
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (now - recordingStartedAt.value < 200) return
  e.preventDefault()
  e.stopPropagation()
  mouseIsDown.value = false
  updateModsFromEvent(e, { captureSnapshot: true })

  const mainKey =
    e.button === 0
      ? 'LeftClick'
      : e.button === 1
        ? 'MiddleClick'
        : e.button === 2
          ? 'RightClick'
          : e.button === 3
            ? 'Button4'
            : e.button === 4
              ? 'Button5'
              : ''

  // mouseup 先作为“单击候选”，给 dblclick 留窗口；若窗口期内收到 dblclick，会被 onDblClick 取消并升级
  if (mainKey) {
    pendingSingleClickCandidate = {
      mainKey,
      mods: { ctrl: !!e.ctrlKey, shift: !!e.shiftKey, alt: !!e.altKey, meta: !!e.metaKey }
    }
    if (pendingSingleClickTimer != null) window.clearTimeout(pendingSingleClickTimer)
    pendingSingleClickTimer = window.setTimeout(() => {
      if (!recording.value) return
      if (pendingSingleClickCandidate) {
        pendingAction.value = { kind: 'mouse', mainKey, mods: pendingSingleClickCandidate.mods }
        recordingPreview.value = buildShortcutString(
          pendingSingleClickCandidate.mods.ctrl,
          pendingSingleClickCandidate.mods.shift,
          pendingSingleClickCandidate.mods.alt,
          pendingSingleClickCandidate.mods.meta,
          mainKey
        )
        pendingSingleClickCandidate = null
        pendingSingleClickTimer = null
        tryFinalizeOnRelease()
      }
    }, 250)
  } else {
    tryFinalizeOnRelease()
  }
}

watch(recording, (val) => {
  if (val) {
    nextTick(() => {
      window.addEventListener('keydown', onKeyDown, true)
      window.addEventListener('keyup', onKeyUp, true)
      window.addEventListener('mousedown', onMouseDown, true)
      window.addEventListener('mouseup', onMouseUp, true)
      window.addEventListener('dblclick', onDblClick, true)
      window.addEventListener('wheel', onWheel, { capture: true, passive: false })
    })
  } else {
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('keyup', onKeyUp, true)
    window.removeEventListener('mousedown', onMouseDown, true)
    window.removeEventListener('mouseup', onMouseUp, true)
    window.removeEventListener('dblclick', onDblClick, true)
    window.removeEventListener('wheel', onWheel as any, true)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('keyup', onKeyUp, true)
  window.removeEventListener('mousedown', onMouseDown, true)
  window.removeEventListener('mouseup', onMouseUp, true)
  window.removeEventListener('dblclick', onDblClick, true)
  window.removeEventListener('wheel', onWheel as any, true)
  if (pendingSingleClickTimer != null) {
    window.clearTimeout(pendingSingleClickTimer)
    pendingSingleClickTimer = null
  }
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
