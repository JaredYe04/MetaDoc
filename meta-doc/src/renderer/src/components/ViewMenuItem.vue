<template>
  <Tooltip v-if="isCollapsed && !isDisabled" :content="label" placement="right">
    <div
      class="view-menu-item"
      :class="{
        'is-collapsed': isCollapsed,
        'is-active': isActive,
        'is-disabled': isDisabled
      }"
      @click="handleClick"
    >
      <div ref="contentRef" class="view-menu-item__content">
        <div class="icon-wrapper">
          <img v-if="iconImage" :src="iconImage" class="menu-icon" :alt="index" />
        </div>
        <span
          v-if="!isCollapsed"
          ref="labelRef"
          class="view-menu-item__label"
          :style="labelStyle"
        >{{ label }}</span>
      </div>
    </div>
  </Tooltip>
  <div
    v-else
    class="view-menu-item"
    :class="{
      'is-collapsed': isCollapsed,
      'is-active': isActive,
      'is-disabled': isDisabled
    }"
    @click="handleClick"
  >
    <div ref="contentRef" class="view-menu-item__content">
      <div class="icon-wrapper">
        <img v-if="iconImage" :src="iconImage" class="menu-icon" :alt="index" />
      </div>
      <span
        v-if="!isCollapsed"
        ref="labelRef"
        class="view-menu-item__label"
        :style="labelStyle"
      >{{ label }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { Tooltip } from '@renderer/components/ui/tooltip'
import { themeState, mixColors } from '../utils/themes'

// 使用主题色作为 active 状态
const activeBackgroundColor = computed(() =>
  mixColors(themeState.currentTheme.background, themeState.currentTheme.primaryColor, 0.2)
)
const activeTextColor = computed(() => themeState.currentTheme.primaryColor)

const props = defineProps<{
  index: string
  label: string
  iconImage?: string
  isActive?: boolean
  isCollapsed?: boolean
  isDisabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', index: string): void
}>()

const labelRef = ref<HTMLSpanElement | null>(null)
const contentRef = ref<HTMLDivElement | null>(null)
const labelStyle = ref<{ fontSize?: string }>({})

const MIN_FONT_SIZE = 1
const MAX_FONT_SIZE = 13

/** 强制浏览器重排，以便 scrollWidth/clientWidth 等为最新值 */
function forceReflow(el: HTMLElement) {
  void el.offsetHeight
}

function adjustLabelFontSize() {
  if (props.isCollapsed) {
    labelStyle.value = {}
    return
  }
  nextTick(() => {
    const el = labelRef.value
    if (!el) return
    const availableWidth = el.clientWidth
    if (availableWidth <= 0) return
    // 先以最大字号测量，得到当前文字“想要”的宽度
    el.style.fontSize = `${MAX_FONT_SIZE}px`
    forceReflow(el)
    const contentWidth = el.scrollWidth
    let fontSize: number
    if (contentWidth <= availableWidth) {
      fontSize = MAX_FONT_SIZE
    } else {
      // 按比例算出刚好能塞下的字号
      fontSize = Math.max(MIN_FONT_SIZE, Math.floor((MAX_FONT_SIZE * availableWidth) / contentWidth))
      el.style.fontSize = `${fontSize}px`
      forceReflow(el)
      // 若仍溢出则继续逐 px 缩小直到刚好塞下
      while (fontSize > MIN_FONT_SIZE && el.scrollWidth > el.clientWidth) {
        fontSize -= 1
        el.style.fontSize = `${fontSize}px`
        forceReflow(el)
      }
    }
    labelStyle.value = { fontSize: `${fontSize}px` }
  })
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  adjustLabelFontSize()
  const content = contentRef.value
  if (content) {
    resizeObserver = new ResizeObserver(() => adjustLabelFontSize())
    resizeObserver.observe(content)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

watch(
  () => [props.label, props.isCollapsed],
  () => adjustLabelFontSize(),
  { immediate: false }
)

const handleClick = () => {
  if (!props.isDisabled) {
    emit('select', props.index)
  }
}
</script>

<style scoped>
.view-menu-item {
  height: 40px;
  line-height: 40px;
  margin: 4px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  transition: none !important;
  position: relative;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  cursor: pointer;
  color: inherit;
}

.view-menu-item:hover:not(.is-disabled):not(.is-active) {
  background-color: v-bind('activeBackgroundColor');
  border-radius: 6px;
}

/* 粗野主义按压效果 - 主色边框 + 浅色背景 */
.view-menu-item:active:not(.is-disabled) {
  border: 1px solid var(--el-color-primary) !important;
  background-color: var(--el-color-primary-light-9) !important;
  color: var(--el-color-primary) !important;
  border-radius: 6px !important;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.15) !important;
}

/* 激活状态 */
.view-menu-item.is-active {
  background-color: v-bind('activeBackgroundColor') !important;
  color: v-bind('activeTextColor') !important;
  border-radius: 6px !important;
}

/* 按压时图标颜色 */
.view-menu-item:active:not(.is-disabled) .menu-icon {
  filter: brightness(0.8) sepia(1) hue-rotate(180deg) saturate(2);
}

.view-menu-item.is-disabled {
  cursor: default;
  opacity: 0.6;
}

.view-menu-item.is-collapsed {
  padding: 0;
  justify-content: center;
}

.view-menu-item__content {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
}

.view-menu-item.is-collapsed .view-menu-item__content {
  justify-content: center;
}

/* 图标容器 - 固定尺寸的正方形 */
.icon-wrapper {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* 图标样式 - 在容器内自适应 */
.menu-icon {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
}

.view-menu-item.is-collapsed .icon-wrapper {
  margin: 0 auto;
}

.view-menu-item:not(.is-collapsed) .icon-wrapper {
  margin-right: 8px;
}

.view-menu-item__label {
  flex: 1;
  min-width: 0; /* 允许 flex 子项收缩，便于正确测量可用宽度 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
</style>
