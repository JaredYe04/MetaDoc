<template>
  <transition name="fade">
    <div
      v-if="visible && position"
      class="item-action-menu"
      :style="menuStyle"
      @click.stop
    >
      <button
        v-for="action in items"
        :key="action.command"
        type="button"
        class="item-action-menu__item"
        :class="{ danger: action.danger }"
        :disabled="action.disabled"
        @click="handleClick(action)"
      >
        {{ action.label }}
      </button>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { themeState } from '../../utils/themes'

export interface ItemActionMenuItem {
  command: string
  label: string
  disabled?: boolean
  danger?: boolean
}

const props = withDefaults(
  defineProps<{
    visible: boolean
    position: { x: number; y: number } | null
    items: ItemActionMenuItem[]
  }>(),
  { items: () => [] }
)

const emit = defineEmits<{
  command: [command: string]
  close: []
}>()

const borderColor = computed(() =>
  themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
)

const menuStyle = computed(() => {
  if (!props.position) return {}
  return {
    position: 'fixed' as const,
    left: props.position.x + 'px',
    top: props.position.y + 'px',
    backgroundColor: themeState.currentTheme.background,
    color: themeState.currentTheme.textColor
  }
})

const handleClick = (action: ItemActionMenuItem) => {
  if (action.disabled) return
  emit('command', action.command)
  emit('close')
}

const handleClickOutside = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (props.visible && !target.closest('.item-action-menu')) {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.item-action-menu {
  z-index: 10002;
  padding: 4px;
  border-radius: 8px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  min-width: 140px;
  width: max-content;
  max-width: 280px;
  border: 1px solid v-bind('borderColor');
  display: flex;
  flex-direction: column;
}

.item-action-menu__item {
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

.item-action-menu__item:hover:not(:disabled) {
  background-color: rgba(64, 158, 255, 0.16);
}

.item-action-menu__item.danger {
  color: #f56c6c;
}

.item-action-menu__item.danger:hover:not(:disabled) {
  background-color: rgba(245, 108, 108, 0.18);
}

.item-action-menu__item:disabled {
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
