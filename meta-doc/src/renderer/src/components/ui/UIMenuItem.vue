<template>
  <Tooltip v-if="tooltip && collapse" :disabled="hasOpenSubMenu">
    <TooltipTrigger as-child>
      <div
        class="ui-menu-item"
        :class="{ 'is-collapsed': collapse, 'is-disabled': disabled, 'is-active': active }"
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
          <span v-if="!collapse" class="ui-menu-item__label">
            <slot>{{ label }}</slot>
          </span>
        </div>
      </div>
    </TooltipTrigger>
    <TooltipContent side="right">
      {{ tooltip }}
    </TooltipContent>
  </Tooltip>
  <div
    v-else
    class="ui-menu-item"
    :class="{ 'is-collapsed': collapse, 'is-disabled': disabled, 'is-active': active }"
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
      <span v-if="!collapse" class="ui-menu-item__label">
        <slot>{{ label }}</slot>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, computed, type ComputedRef } from 'vue'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { themeState, mixColors } from '../../utils/themes'

// 计算与 HeadMenu 一致的 active 背景色
const activeBackgroundColor = computed(() =>
  mixColors(themeState.currentTheme.background2nd, themeState.currentTheme.textColor, 0.3)
)
const activeTextColor = computed(() => themeState.currentTheme.textColor)

const props = withDefaults(
  defineProps<{
    label?: string
    tooltip?: string
    icon?: any
    iconImage?: string
    disabled?: boolean
    active?: boolean
  }>(),
  {
    label: '',
    tooltip: '',
    disabled: false,
    active: false
  }
)

const emit = defineEmits<{
  (e: 'click'): void
  (e: 'mouseenter'): void
  (e: 'mouseleave'): void
}>()

const collapse = inject<boolean>('menuCollapse', false)
const hasOpenSubMenu = inject<ComputedRef<boolean>>(
  'hasOpenSubMenu',
  computed(() => false)
)

const handleClick = () => {
  if (!props.disabled) {
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
.ui-menu-item {
  height: 36px;
  line-height: 36px;
  margin: 2px 6px;
  border-radius: 4px;
  border: 1px solid transparent;
  transition: all 0.15s ease;
  position: relative;
  padding-left: 10px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  cursor: pointer;
  color: var(--sidebar-text, var(--el-text-color-primary));
  font-size: 13px;
}

.ui-menu-item:hover:not(.is-disabled) {
  background-color: var(--sidebar-hover-bg, v-bind('activeBackgroundColor'));
  border-radius: 4px;
}

/* 粗野主义按压效果 - 主色边框 + 浅色背景 */
.ui-menu-item:active:not(.is-disabled) {
  border: 1px solid var(--el-color-primary) !important;
  background-color: var(--el-color-primary-light-9) !important;
  color: var(--el-color-primary) !important;
  border-radius: 4px !important;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.15) !important;
}

/* 按压时图标颜色 */
.ui-menu-item:active:not(.is-disabled) .ui-menu-item__icon,
.ui-menu-item:active:not(.is-disabled) .ui-menu-item__icon-image {
  color: var(--el-color-primary) !important;
}

/* VSCode 风格 - 激活状态 */
.ui-menu-item.is-active {
  background-color: var(--sidebar-active-bg, v-bind('activeBackgroundColor'));
  color: var(--sidebar-text-active, var(--el-text-color-primary));
  font-weight: 500;
}

.ui-menu-item.is-disabled {
  cursor: default;
  opacity: 0.6;
}

.ui-menu-item.is-collapsed {
  padding: 0;
  justify-content: center;
}

.ui-menu-item__content {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
}

.ui-menu-item.is-collapsed .ui-menu-item__content {
  justify-content: center;
}

.ui-menu-item__icon {
  margin-right: 8px;
  font-size: 18px;
  width: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ui-menu-item__icon-image {
  width: 18px;
  height: 18px;
  margin-right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ui-menu-item.is-collapsed .ui-menu-item__icon,
.ui-menu-item.is-collapsed .ui-menu-item__icon-image {
  margin: 0 auto;
}

.ui-menu-item__label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
