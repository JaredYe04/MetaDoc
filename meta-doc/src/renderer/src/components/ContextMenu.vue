<template>
  <div ref="menuRef" class="context-menu" :style="menuStyle" @contextmenu.prevent @mousedown.stop>
    <template v-for="(item, index) in items" :key="item.value ?? `item-${index}`">
      <div v-if="item.type === 'divider'" class="context-menu__divider" />
      <div
        v-else-if="item.type === 'submenu' && item.children?.length"
        class="context-menu__submenu-wrap"
        @mouseenter="openSubmenuIndex = index"
        @mouseleave="openSubmenuIndex = null"
      >
        <div
          class="context-menu__item context-menu__item--submenu-parent"
          :style="menuItemStyle"
          :class="{ 'is-disabled': item.disabled }"
        >
          <span class="context-menu__label">{{ item.label ? $t(item.label) : '' }}</span>
          <span class="context-menu__submenu-chevron">›</span>
        </div>
        <div
          v-show="openSubmenuIndex === index"
          class="context-menu__submenu-panel"
          :style="submenuPanelStyle"
          @mouseenter="openSubmenuIndex = index"
          @mouseleave="openSubmenuIndex = null"
        >
          <template v-for="(child, ci) in item.children" :key="child.value ?? `sub-${ci}`">
            <div v-if="child.type === 'divider'" class="context-menu__divider" />
            <div
              v-else
              class="context-menu__item"
              :style="menuItemStyle"
              :class="{
                'is-danger': child.danger,
                'is-disabled': child.disabled
              }"
              @mousedown.prevent="onMenuItemMouseDown(child)"
            >
              <span class="context-menu__label">{{ child.label ? $t(child.label) : '' }}</span>
            </div>
          </template>
        </div>
      </div>
      <div
        v-else
        class="context-menu__item"
        :style="menuItemStyle"
        :class="{
          'is-danger': item.danger,
          'is-disabled': item.disabled
        }"
        @mousedown.prevent="onMenuItemMouseDown(item)"
      >
        <span class="context-menu__label">{{ item.label ? $t(item.label) : '' }}</span>
        <span v-if="item.shortcut" class="context-menu__shortcut">{{ item.shortcut }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import type { ContextMenuItem } from './contextMenus/types'
import { themeState, mixColors } from '../utils/themes'

const props = withDefaults(
  defineProps<{
    x: number
    y: number
    items?: ContextMenuItem[]
  }>(),
  {
    items: () => []
  }
)

const emit = defineEmits<{
  (e: 'trigger', value: string): void
  (e: 'close'): void
}>()

const menuRef = ref<HTMLElement | null>(null)
const menuPosition = ref({ top: props.y ?? 0, left: props.x ?? 0 })
const openSubmenuIndex = ref<number | null>(null)

const adjustWithinViewport = () => {
  const el = menuRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const padding = 8
  const maxLeft = Math.max(padding, window.innerWidth - rect.width - padding)
  const maxTop = Math.max(padding, window.innerHeight - rect.height - padding)
  const nextLeft = Math.min(Math.max(padding, menuPosition.value.left), maxLeft)
  const nextTop = Math.min(Math.max(padding, menuPosition.value.top), maxTop)
  if (nextLeft !== menuPosition.value.left || nextTop !== menuPosition.value.top) {
    menuPosition.value = { top: nextTop, left: nextLeft }
  }
}

const updatePosition = (x: number, y: number) => {
  menuPosition.value = { top: y, left: x }
  nextTick(adjustWithinViewport)
}

watch(
  () => [props.x, props.y],
  ([x, y]) => updatePosition(x ?? 0, y ?? 0),
  { immediate: true }
)

watch(
  () => props.items,
  () => {
    openSubmenuIndex.value = null
  }
)

const closeMenu = () => emit('close')
const handleDocumentPointer = (event: Event) => {
  const target = event.target as Node | null
  if (!target || !menuRef.value || menuRef.value.contains(target)) {
    return
  }
  closeMenu()
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    closeMenu()
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentPointer)
  // 仅监听窗口自身滚动；捕获阶段会收到可滚动子元素上的 scroll，导致从大纲移入菜单途中菜单被误关
  window.addEventListener('scroll', closeMenu, false)
  window.addEventListener('resize', closeMenu)
  window.addEventListener('keydown', handleKeydown)
  nextTick(adjustWithinViewport)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentPointer)
  window.removeEventListener('scroll', closeMenu, false)
  window.removeEventListener('resize', closeMenu)
  window.removeEventListener('keydown', handleKeydown)
})

const menuStyle = computed(() => {
  const background = themeState.currentTheme.background2nd
  const textColor = themeState.currentTheme.textColor
  const borderColor = mixColors(
    background,
    textColor,
    themeState.currentTheme.type === 'dark' ? 0.5 : 0.35
  )
  const dividerColor = mixColors(
    background,
    textColor,
    themeState.currentTheme.type === 'dark' ? 0.6 : 0.25
  )
  const style: CSSProperties & Record<string, string | number> = {
    top: `${menuPosition.value.top}px`,
    left: `${menuPosition.value.left}px`,
    position: 'fixed',
    background,
    color: textColor,
    border: `1px solid ${borderColor}`,
    boxShadow:
      themeState.currentTheme.type === 'dark'
        ? '0 12px 28px rgba(0, 0, 0, 0.45)'
        : '0 12px 28px rgba(15, 23, 42, 0.16)',
    borderRadius: '10px',
    padding: '4px 0',
    minWidth: '184px',
    zIndex: 12000
  }
  style['--menu-divider-color'] = dividerColor
  return style
})

const submenuPanelStyle = computed(() => {
  const background = themeState.currentTheme.background2nd
  const textColor = themeState.currentTheme.textColor
  const borderColor = mixColors(
    background,
    textColor,
    themeState.currentTheme.type === 'dark' ? 0.5 : 0.35
  )
  return {
    background,
    color: textColor,
    border: `1px solid ${borderColor}`,
    boxShadow:
      themeState.currentTheme.type === 'dark'
        ? '0 12px 28px rgba(0, 0, 0, 0.45)'
        : '0 12px 28px rgba(15, 23, 42, 0.16)',
    borderRadius: '10px',
    padding: '4px 0',
    minWidth: '160px'
  } as CSSProperties
})

const menuItemStyle = computed(() => {
  const baseBg = themeState.currentTheme.background2nd
  const baseText = themeState.currentTheme.textColor
  const hoverColor =
    themeState.currentTheme.type === 'dark'
      ? mixColors(baseBg, '#ffffff', 0.18)
      : mixColors(baseBg, '#000000', 0.08)
  const activeColor =
    themeState.currentTheme.type === 'dark'
      ? mixColors(baseBg, '#ffffff', 0.06)
      : mixColors(baseBg, '#000000', 0.15)
  const disabledColor = mixColors(baseBg, baseText, 0.08)
  const dangerColor =
    themeState.currentTheme.type === 'dark' ? mixColors('#ff4d4f', '#ffffff', 0.3) : '#d93026'
  return {
    color: baseText,
    height: '30px',
    fontSize: '13px',
    lineHeight: '1.4',
    cursor: 'pointer',
    width: '100%',
    border: 'none',
    textAlign: 'left',
    padding: '0 12px',
    boxSizing: 'border-box',
    '--menu-hover-color': hoverColor,
    '--menu-active-color': activeColor,
    '--menu-disabled-color': disabledColor,
    '--menu-danger-color': dangerColor
  } as CSSProperties & Record<string, string | number>
})

const onMenuItemMouseDown = (item: ContextMenuItem) => {
  if (!item.value || item.disabled) return
  emit('trigger', item.value)
  closeMenu()
}
</script>

<style scoped>
.context-menu {
  font-size: 13px;
  line-height: 1.4;
  pointer-events: auto;
}

.context-menu__submenu-wrap {
  position: relative;
}

.context-menu__submenu-panel {
  position: absolute;
  left: 100%;
  top: 0;
  margin-left: 2px;
  z-index: 12100;
}

.context-menu__item--submenu-parent {
  padding-right: 8px;
}

.context-menu__submenu-chevron {
  margin-left: auto;
  opacity: 0.65;
  font-size: 14px;
  line-height: 1;
}

.context-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  transition:
    background-color ease,
    color ease;
  border-radius: 0;
}

.context-menu__item:not(.is-disabled):hover {
  background-color: var(--menu-hover-color);
}

.context-menu__item:not(.is-disabled):active {
  background-color: var(--menu-active-color);
}

.context-menu__item.is-disabled {
  background-color: transparent;
  cursor: not-allowed;
  color: var(--menu-disabled-color);
  pointer-events: none;
}

.context-menu__item.is-danger {
  color: var(--menu-danger-color);
}

.context-menu__divider {
  height: 1px;
  background-color: var(--menu-divider-color);
  margin: 4px 8px;
}

.context-menu__label {
  flex: 1;
  white-space: nowrap;
}

.context-menu__shortcut {
  font-size: 11px;
  opacity: 0.6;
  margin-left: 16px;
  white-space: nowrap;
}
</style>
