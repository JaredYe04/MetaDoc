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
import { inject } from 'vue'

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
  border-radius: 6px;
  height: 34px;
  line-height: 34px;
  padding: 0 12px;
  background-color: transparent;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  cursor: pointer;
  transition: background-color 0.2s;
}

.ui-sub-menu-item:not(.is-title):not(.is-disabled):hover {
  background-color: var(--sub-menu-hover, rgba(0, 0, 0, 0.06));
  border-radius: 6px;
}

.ui-sub-menu-item.is-disabled {
  cursor: default;
  opacity: 0.6;
}

.ui-sub-menu-item.is-title {
  cursor: default;
  margin: 4px 4px 8px 4px;
  height: 34px;
  line-height: 34px;
  padding: 0 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 0;
  background-color: transparent;
}

.ui-sub-menu-item.is-title:hover {
  background-color: transparent;
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
}

.ui-sub-menu-item__icon-image {
  width: 16px;
  height: 16px;
  margin: 0;
  flex-shrink: 0;
}

.ui-sub-menu-item__label {
  font-size: 13px;
  text-align: left;
  flex: 1;
}

.ui-sub-menu-item.is-title .ui-sub-menu-item__content {
  justify-content: center;
}

.ui-sub-menu-item.is-title .ui-sub-menu-item__label {
  font-size: 12px;
  font-weight: 500;
  opacity: 0.8;
  text-align: center;
  flex: 0 0 auto;
}
</style>
