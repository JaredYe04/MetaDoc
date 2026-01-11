<template>
  <div
    class="ui-menu-item"
    :class="{ 'is-collapsed': collapse, 'is-disabled': disabled, 'is-hovered': isHovered }"
    @click="handleClick"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <div class="ui-menu-item__content">
      <slot name="icon">
        <el-icon v-if="icon" class="ui-menu-item__icon">
          <component :is="icon" />
        </el-icon>
        <img v-else-if="iconImage" :src="iconImage" class="ui-menu-item__icon-image" />
      </slot>
      <span v-if="!collapse || isHovered" ref="labelRef" class="ui-menu-item__label">
        <slot>{{ label }}</slot>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, computed, ref, onMounted, nextTick, type ComputedRef } from 'vue'
import { themeState, mixColors } from '../../utils/themes'

// 计算与 HeadMenu 一致的 active 背景色
const activeBackgroundColor = computed(() => mixColors(themeState.currentTheme.background2nd, themeState.currentTheme.textColor, 0.3))
const activeTextColor = computed(() => themeState.currentTheme.textColor)

const props = withDefaults(defineProps<{
  label?: string
  tooltip?: string
  icon?: any
  iconImage?: string
  disabled?: boolean
}>(), {
  label: '',
  tooltip: '',
  disabled: false
})

const emit = defineEmits<{
  (e: 'click'): void
  (e: 'mouseenter'): void
  (e: 'mouseleave'): void
}>()

const collapse = inject<boolean>('menuCollapse', false)
const hasOpenSubMenu = inject<ComputedRef<boolean>>('hasOpenSubMenu', computed(() => false))
const isHovered = ref(false)
const labelRef = ref<HTMLElement | null>(null)
const fontSize = ref(12)

// 自适应字号计算（与UISubMenu完全一致）
const adjustFontSize = async () => {
  if (!isHovered.value || !collapse) return
  
  await nextTick()
  if (!labelRef.value) return
  
  const element = labelRef.value
  const maxWidth = 64 // 折叠菜单的宽度
  const minFontSize = 9
  const maxFontSize = 12
  
  // 重置字号到最大值，并设置不换行
  element.style.fontSize = `${maxFontSize}px`
  element.style.whiteSpace = 'nowrap'
  element.style.overflow = 'hidden'
  element.style.textOverflow = 'ellipsis'
  element.style.maxWidth = '64px'
  
  // 如果文字超出，逐步减小字号
  if (element.scrollWidth > maxWidth) {
    let currentSize = maxFontSize
    while (currentSize > minFontSize && element.scrollWidth > maxWidth) {
      currentSize -= 0.5
      element.style.fontSize = `${currentSize}px`
    }
    fontSize.value = currentSize
  } else {
    fontSize.value = maxFontSize
  }
}

onMounted(() => {
  // 监听hover状态变化，调整字号
  if (isHovered.value) {
    adjustFontSize()
  }
})

const handleClick = () => {
  if (!props.disabled) {
    emit('click')
  }
}

const handleMouseEnter = async () => {
  if (collapse && !hasOpenSubMenu.value) {
    isHovered.value = true
    await nextTick()
    adjustFontSize()
  }
  emit('mouseenter')
}

const handleMouseLeave = () => {
  isHovered.value = false
  fontSize.value = 12 // 重置字号
  emit('mouseleave')
}
</script>

<style scoped>
.ui-menu-item {
  height: 40px;
  line-height: 40px;
  margin: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s ease;
  position: relative;
  padding-left: 12px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  cursor: pointer;
}

.ui-menu-item:hover:not(.is-disabled) {
  background-color: v-bind('activeBackgroundColor');
  border-radius: 6px;
}

.ui-menu-item.is-disabled {
  cursor: default;
  opacity: 0.6;
}

.ui-menu-item.is-collapsed {
  padding: 8px 0;
  justify-content: center;
  min-height: 48px;
  flex-direction: column;
}

.ui-menu-item__content {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  flex-direction: row;
}

.ui-menu-item.is-collapsed .ui-menu-item__content {
  justify-content: center;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

/* Hover状态下，折叠菜单的content布局 */
.ui-menu-item.is-collapsed.is-hovered .ui-menu-item__content {
  gap: 6px;
  padding: 4px 0;
}

.ui-menu-item__icon {
  margin-right: 8px;
  font-size: 18px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.2s ease, margin 0.2s ease;
}

.ui-menu-item__icon-image {
  width: 18px;
  height: 18px;
  margin-right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease, margin 0.2s ease;
}

.ui-menu-item.is-collapsed .ui-menu-item__icon,
.ui-menu-item.is-collapsed .ui-menu-item__icon-image {
  margin: 0 !important;
  margin-right: 0 !important;
  margin-left: 0 !important;
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}

/* Hover状态下，icon向上移动（与UISubMenu完全一致：-3px） */
.ui-menu-item.is-collapsed.is-hovered .ui-menu-item__icon,
.ui-menu-item.is-collapsed.is-hovered .ui-menu-item__icon-image {
  transform: translateY(-3px) !important;
  margin: 0 !important;
  position: relative !important;
}

.ui-menu-item__label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  opacity: 0;
  max-height: 0;
  transition: opacity 0.2s ease, max-height 0.2s ease;
}

/* 展开状态下显示label */
.ui-menu-item:not(.is-collapsed) .ui-menu-item__label {
  opacity: 1;
  max-height: 20px;
}

/* Hover状态下，折叠菜单显示label（与UISubMenu完全一致） */
.ui-menu-item.is-collapsed.is-hovered .ui-menu-item__label {
  opacity: 1 !important;
  max-height: 20px !important;
  text-align: center !important;
  line-height: 1.2 !important;
  max-width: 64px !important;
  width: auto !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  visibility: visible !important;
  position: static !important;
}
</style>
