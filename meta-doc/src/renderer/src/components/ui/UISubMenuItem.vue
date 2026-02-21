<template>
  <div
    class="ui-sub-menu-item"
    :class="{ 'is-title': isTitle, 'is-disabled': disabled }"
    @click="handleClick"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <div class="ui-sub-menu-item__content">
      <slot name="icon">
        <el-icon v-if="icon" class="ui-sub-menu-item__icon">
          <component :is="icon" />
        </el-icon>
        <img v-else-if="iconImage" :src="iconImage" class="ui-sub-menu-item__icon-image" />
      </slot>
      <span class="ui-sub-menu-item__label">
        <slot>{{ label }}</slot>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, computed } from 'vue'
import { themeState, mixColors } from '../../utils/themes'

// 计算与 HeadMenu 一致的 active 背景色
const activeBackgroundColor = computed(() =>
  mixColors(themeState.currentTheme.background2nd, themeState.currentTheme.textColor, 0.3)
)

const props = withDefaults(
  defineProps<{
    label?: string
    icon?: any
    iconImage?: string
    disabled?: boolean
    isTitle?: boolean
  }>(),
  {
    label: '',
    disabled: false,
    isTitle: false
  }
)

const emit = defineEmits<{
  (e: 'click'): void
  (e: 'mouseenter'): void
  (e: 'mouseleave'): void
}>()

const closeAllClickSubMenus = inject<(() => void) | undefined>('closeAllClickSubMenus', undefined)

const handleClick = () => {
  if (!props.disabled && !props.isTitle) {
    // 点击叶子节点后，关闭所有打开的菜单
    if (closeAllClickSubMenus) {
      closeAllClickSubMenus()
    }
    emit('click')
  }
}

const handleMouseEnter = () => {
  emit('mouseenter')
}

const handleMouseLeave = () => {
  emit('mouseleave')
}
</script>

<style scoped>
.ui-sub-menu-item {
  margin: 1px 4px;
  border-radius: 4px;
  height: 34px;
  line-height: 34px;
  padding: 0 12px;
  background-color: transparent;
  border: 1px solid transparent;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  cursor: pointer;
  transition: none !important;
  color: var(--el-text-color-primary);
}

/* 粗野主义悬停效果 - 统一灰色背景 */
.ui-sub-menu-item:not(.is-title):not(.is-disabled):hover {
  background-color: v-bind('activeBackgroundColor');
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  color: var(--el-text-color-primary);
}

/* 粗野主义按压效果 - 硬边轮廓 + 背景变化 */
.ui-sub-menu-item:not(.is-title):not(.is-disabled):active {
  border: 1px solid var(--el-color-primary) !important;
  background-color: var(--el-color-primary-light-9) !important;
  color: var(--el-color-primary) !important;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.15) !important;
}

/* 按压时图标和文字颜色 */
.ui-sub-menu-item:not(.is-title):not(.is-disabled):active .ui-sub-menu-item__icon,
.ui-sub-menu-item:not(.is-title):not(.is-disabled):active .ui-sub-menu-item__icon-image,
.ui-sub-menu-item:not(.is-title):not(.is-disabled):active .ui-sub-menu-item__label {
  color: var(--el-color-primary) !important;
}

.ui-sub-menu-item.is-disabled {
  cursor: default;
  opacity: 0.4;
  color: var(--el-text-color-placeholder);
}

.ui-sub-menu-item.is-title {
  cursor: default;
  margin: 4px 4px 8px 4px;
  height: 34px;
  line-height: 34px;
  padding: 0 12px;
  border-bottom: 1px solid var(--el-border-color);
  border-radius: 4px;
  background-color: transparent;
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.ui-sub-menu-item.is-title:hover {
  background-color: transparent;
  color: var(--el-text-color-primary);
}

.ui-sub-menu-item__content {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-direction: row;
  gap: 8px;
  width: 100%;
}

.ui-sub-menu-item__icon {
  font-size: 16px;
  margin: 0;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: inherit;
  transition: none !important;
}

.ui-sub-menu-item__icon-image {
  width: 16px;
  height: 16px;
  margin: 0;
  flex-shrink: 0;
  opacity: 0.8;
}

.ui-sub-menu-item__label {
  font-size: 13px;
  text-align: left;
  flex: 1;
  color: inherit;
  transition: none !important;
}

.ui-sub-menu-item.is-title .ui-sub-menu-item__content {
  justify-content: center;
}

.ui-sub-menu-item.is-title .ui-sub-menu-item__label {
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  flex: 0 0 auto;
  letter-spacing: 0.5px;
}
</style>
