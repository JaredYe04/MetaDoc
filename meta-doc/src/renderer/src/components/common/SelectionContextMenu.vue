<template>
  <Teleport to="body">
    <transition name="fade">
      <div
        v-if="visible && position"
        ref="menuRef"
        class="selection-context-menu"
        :style="menuStyle"
        @click.stop
        @contextmenu.prevent
      >
        <button
          type="button"
          class="selection-context-menu__item"
          :disabled="!canCopy"
          @click="handleCopy"
        >
          {{ t('contextMenu.copy') }}
        </button>
        <button type="button" class="selection-context-menu__item" @click="handleSelectAll">
          {{ t('contextMenu.selectAll') }}
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
const hasSelection = ref(false)
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

const canCopy = computed(() => hasSelection.value)

async function handleCopy() {
  if (!hasSelection.value) return
  const sel = window.getSelection?.()
  const text = sel?.toString?.() ?? ''
  try {
    if (text) await navigator.clipboard.writeText(text)
    else document.execCommand('copy')
  } catch {
    document.execCommand('copy')
  }
  close()
}

function handleSelectAll() {
  // 尽量保持行为简单一致：全选当前文档可选文本
  document.execCommand('selectAll')
  close()
}

function close() {
  visible.value = false
  position.value = null
  hasSelection.value = false
}

function handleContextMenuShow(e: CustomEvent<{ x: number; y: number; hasSelection: boolean }>) {
  const { x, y, hasSelection: hs } = e.detail || ({} as { x: number; y: number; hasSelection: boolean })
  // 互斥：显示只读菜单时，主动关闭输入菜单（如果有）
  window.dispatchEvent(new CustomEvent('input-context-menu-close'))
  position.value = { x, y }
  hasSelection.value = !!hs
  visible.value = true
  nextTick(() => clampMenuToViewport())
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

function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (visible.value && !target.closest('.selection-context-menu')) close()
}

function handleAnyContextMenu(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!visible.value) return
  if (target.closest('.selection-context-menu')) return
  close()
}

function handleForceClose() {
  if (visible.value) close()
}

onMounted(() => {
  window.addEventListener('selection-context-menu-show', handleContextMenuShow as EventListener)
  window.addEventListener('selection-context-menu-close', handleForceClose as EventListener)
  // 当输入框菜单弹出时也要关闭自己
  window.addEventListener('input-context-menu-show', handleForceClose as EventListener)
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('contextmenu', handleAnyContextMenu, { capture: true })
})

onUnmounted(() => {
  window.removeEventListener('selection-context-menu-show', handleContextMenuShow as EventListener)
  window.removeEventListener('selection-context-menu-close', handleForceClose as EventListener)
  window.removeEventListener('input-context-menu-show', handleForceClose as EventListener)
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('contextmenu', handleAnyContextMenu, true)
})
</script>

<style scoped>
.selection-context-menu {
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

.selection-context-menu__item {
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

.selection-context-menu__item:hover:not(:disabled) {
  background-color: rgba(64, 158, 255, 0.16);
}

.selection-context-menu__item:disabled {
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

