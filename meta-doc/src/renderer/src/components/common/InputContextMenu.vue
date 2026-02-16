<template>
  <Teleport to="body">
    <transition name="fade">
      <div v-if="visible && position" class="input-context-menu" :style="menuStyle" @click.stop>
        <button
          type="button"
          class="input-context-menu__item"
          :disabled="!canCut"
          @click="handleCut"
        >
          {{ t('contextMenu.cut') }}
        </button>
        <button
          type="button"
          class="input-context-menu__item"
          :disabled="!canCopy"
          @click="handleCopy"
        >
          {{ t('contextMenu.copy') }}
        </button>
        <button
          type="button"
          class="input-context-menu__item"
          :disabled="!canPaste"
          @click="handlePaste"
        >
          {{ t('contextMenu.paste') }}
        </button>
        <button type="button" class="input-context-menu__item" @click="handleSelectAll">
          {{ t('contextMenu.selectAll') }}
        </button>
        <button
          type="button"
          class="input-context-menu__item"
          :disabled="!canUndo"
          @click="handleUndo"
        >
          {{ t('contextMenu.undo') }}
        </button>
        <button
          type="button"
          class="input-context-menu__item"
          :disabled="!canRedo"
          @click="handleRedo"
        >
          {{ t('contextMenu.redo') }}
        </button>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { themeState } from '../../utils/themes'

const { t } = useI18n()

const visible = ref(false)
const position = ref<{ x: number; y: number } | null>(null)
const targetElement = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)

const menuStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  borderColor:
    themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
  ...(position.value
    ? {
        position: 'fixed' as const,
        left: position.value.x + 'px',
        top: position.value.y + 'px'
      }
    : {})
}))

const canCut = computed(() => {
  const el = targetElement.value
  if (!el || el.readOnly || el.disabled) return false
  const hasSelection = el.selectionStart !== el.selectionEnd
  return hasSelection
})

const canCopy = computed(() => {
  const el = targetElement.value
  if (!el) return false
  const hasSelection = el.selectionStart !== el.selectionEnd
  return hasSelection
})

const canPaste = computed(() => {
  const el = targetElement.value
  if (!el || el.readOnly || el.disabled) return false
  return true
})

// undo/redo 在 input/textarea 上通过 document.execCommand 实现
const canUndo = computed(() => {
  const el = targetElement.value
  if (!el || el.readOnly || el.disabled) return false
  return true
})

const canRedo = computed(() => {
  const el = targetElement.value
  if (!el || el.readOnly || el.disabled) return false
  return true
})

function handleCut() {
  const el = targetElement.value
  if (!el || el.readOnly || el.disabled) return
  document.execCommand('cut')
  close()
}

function handleCopy() {
  const el = targetElement.value
  if (!el) return
  document.execCommand('copy')
  close()
}

async function handlePaste() {
  const el = targetElement.value
  if (!el || el.readOnly || el.disabled) return
  try {
    const text = await navigator.clipboard.readText()
    el.focus()
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const value = el.value
    const newValue = value.slice(0, start) + text + value.slice(end)
    el.value = newValue
    el.selectionStart = el.selectionEnd = start + text.length
    el.dispatchEvent(new Event('input', { bubbles: true }))
  } catch {
    document.execCommand('paste')
  }
  close()
}

function handleSelectAll() {
  const el = targetElement.value
  if (!el) return
  el.select()
  el.focus()
  close()
}

function handleUndo() {
  const el = targetElement.value
  if (!el || el.readOnly || el.disabled) return
  el.focus()
  document.execCommand('undo')
  close()
}

function handleRedo() {
  const el = targetElement.value
  if (!el || el.readOnly || el.disabled) return
  el.focus()
  document.execCommand('redo')
  close()
}

function close() {
  visible.value = false
  position.value = null
  targetElement.value = null
}

function handleContextMenuShow(
  e: CustomEvent<{ target: HTMLInputElement | HTMLTextAreaElement; x: number; y: number }>
) {
  const { target, x, y } = e.detail || {}
  if (!target) return
  targetElement.value = target
  position.value = { x, y }
  visible.value = true
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (visible.value && !target.closest('.input-context-menu')) {
    close()
  }
}

onMounted(() => {
  window.addEventListener('input-context-menu-show', handleContextMenuShow as EventListener)
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  window.removeEventListener('input-context-menu-show', handleContextMenuShow as EventListener)
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.input-context-menu {
  position: fixed;
  z-index: 10002;
  padding: 4px;
  border-radius: 8px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  min-width: 120px;
  width: max-content;
  max-width: 280px;
  border: 1px solid v-bind('menuStyle.borderColor');
  display: flex;
  flex-direction: column;
}

.input-context-menu__item {
  background: transparent;
  border: none;
  padding: 8px 10px;
  text-align: left;
  color: inherit;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background-color 0.2s ease;
  width: 100%;
}

.input-context-menu__item:hover:not(:disabled) {
  background-color: rgba(64, 158, 255, 0.16);
}

.input-context-menu__item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
