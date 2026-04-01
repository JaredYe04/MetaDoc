<template>
  <Teleport to="body">
    <transition name="fade">
      <div
        v-if="visible && position"
        ref="menuRef"
        class="input-context-menu"
        :style="menuStyle"
        @click.stop
        @contextmenu.prevent
      >
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
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { themeState } from '../../utils/themes'

const { t } = useI18n()

const visible = ref(false)
const position = ref<{ x: number; y: number } | null>(null)
const targetElement = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)

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
  if (!el) return false
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.readOnly || el.disabled) return false
    return el.selectionStart !== el.selectionEnd
  }
  // contenteditable / role=textbox
  if (el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox') {
    if ((el as HTMLDivElement).isContentEditable === false) return false
    const sel = window.getSelection()
    return !!sel && !sel.isCollapsed && sel.toString().length > 0
  }
  return false
})

const canCopy = computed(() => {
  const el = targetElement.value
  if (!el) return false
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.selectionStart !== el.selectionEnd
  }
  const sel = window.getSelection()
  return !!sel && !sel.isCollapsed && sel.toString().length > 0
})

const canPaste = computed(() => {
  const el = targetElement.value
  if (!el) return false
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.readOnly || el.disabled) return false
    return true
  }
  // contenteditable / role=textbox
  if (el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox') {
    // 禁用状态：我们用 aria-disabled 约定
    if (el.getAttribute('aria-disabled') === 'true') return false
    return true
  }
  return false
})

// undo/redo 在 input/textarea 上通过 document.execCommand 实现
const canUndo = computed(() => {
  const el = targetElement.value
  if (!el) return false
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.readOnly || el.disabled) return false
    return true
  }
  if (el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox') {
    if (el.getAttribute('aria-disabled') === 'true') return false
    return true
  }
  return false
})

const canRedo = computed(() => {
  const el = targetElement.value
  if (!el) return false
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.readOnly || el.disabled) return false
    return true
  }
  if (el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox') {
    if (el.getAttribute('aria-disabled') === 'true') return false
    return true
  }
  return false
})

function handleCut() {
  const el = targetElement.value
  if (!el) return
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.readOnly || el.disabled) return
  } else {
    if (el.getAttribute('aria-disabled') === 'true') return
  }
  el.focus?.()
  document.execCommand('cut')
  close()
}

function handleCopy() {
  const el = targetElement.value
  if (!el) return
  el.focus?.()
  document.execCommand('copy')
  close()
}

async function handlePaste() {
  const el = targetElement.value
  if (!el) return
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.readOnly || el.disabled) return
  } else {
    if (el.getAttribute('aria-disabled') === 'true') return
  }
  try {
    const text = await navigator.clipboard.readText()
    el.focus?.()
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const start = el.selectionStart ?? 0
      const end = el.selectionEnd ?? 0
      const value = el.value
      const newValue = value.slice(0, start) + text + value.slice(end)
      el.value = newValue
      el.selectionStart = el.selectionEnd = start + text.length
      el.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      document.execCommand('insertText', false, text)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
  } catch {
    document.execCommand('paste')
  }
  close()
}

function handleSelectAll() {
  const el = targetElement.value
  if (!el) return
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.select()
    el.focus()
  } else {
    el.focus?.()
    document.execCommand('selectAll')
  }
  close()
}

function handleUndo() {
  const el = targetElement.value
  if (!el) return
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.readOnly || el.disabled) return
  } else {
    if (el.getAttribute('aria-disabled') === 'true') return
  }
  el.focus?.()
  document.execCommand('undo')
  close()
}

function handleRedo() {
  const el = targetElement.value
  if (!el) return
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.readOnly || el.disabled) return
  } else {
    if (el.getAttribute('aria-disabled') === 'true') return
  }
  el.focus?.()
  document.execCommand('redo')
  close()
}

function close() {
  visible.value = false
  position.value = null
  targetElement.value = null
}

function clampMenuToViewport() {
  const p = position.value
  const el = menuRef.value
  if (!p || !el) return
  const rect = el.getBoundingClientRect()
  const margin = 8
  const vw = window.innerWidth || document.documentElement.clientWidth || 0
  const vh = window.innerHeight || document.documentElement.clientHeight || 0
  if (vw <= 0 || vh <= 0) return

  let x = p.x
  let y = p.y
  if (x + rect.width + margin > vw) x = Math.max(margin, vw - rect.width - margin)
  if (y + rect.height + margin > vh) y = Math.max(margin, vh - rect.height - margin)
  if (x < margin) x = margin
  if (y < margin) y = margin
  position.value = { x, y }
}

function handleContextMenuShow(
  e: CustomEvent<{ target: HTMLElement; x: number; y: number }>
) {
  const { target, x, y } = e.detail || {}
  if (!target) return
  // 互斥：显示输入菜单时，主动关闭只读选择菜单（如果有）
  window.dispatchEvent(new CustomEvent('selection-context-menu-close'))
  targetElement.value = target
  position.value = { x, y }
  visible.value = true
  nextTick(() => clampMenuToViewport())
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (visible.value && !target.closest('.input-context-menu')) {
    close()
  }
}

function handleAnyContextMenu(e: MouseEvent) {
  // 右键新的位置时，也应关闭旧菜单（避免两个菜单共存/悬挂）
  const target = e.target as HTMLElement
  if (!visible.value) return
  if (target.closest('.input-context-menu')) return
  close()
}

function handleForceClose() {
  if (visible.value) close()
}

onMounted(() => {
  window.addEventListener('input-context-menu-show', handleContextMenuShow as EventListener)
  window.addEventListener('input-context-menu-close', handleForceClose as EventListener)
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('contextmenu', handleAnyContextMenu, { capture: true })
})

onUnmounted(() => {
  window.removeEventListener('input-context-menu-show', handleContextMenuShow as EventListener)
  window.removeEventListener('input-context-menu-close', handleForceClose as EventListener)
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('contextmenu', handleAnyContextMenu, true)
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
