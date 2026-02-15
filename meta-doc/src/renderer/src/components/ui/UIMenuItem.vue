<template>
  <el-tooltip
    v-if="tooltip && collapse"
    :content="tooltip"
    placement="right"
    :disabled="hasOpenSubMenu"
    transition=""
    :show-after="0"
    :hide-after="0"
  >
    <div
      class="ui-menu-item"
      :class="{ 'is-collapsed': collapse, 'is-disabled': disabled }"
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
  </el-tooltip>
  <div
    v-else
    class="ui-menu-item"
    :class="{ 'is-collapsed': collapse, 'is-disabled': disabled }"
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
  }>(),
  {
    label: '',
    tooltip: '',
    disabled: false
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
