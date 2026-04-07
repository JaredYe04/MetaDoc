<template>
  <div class="ui-menu" :class="{ 'is-collapsed': collapse }" :style="menuStyle">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, provide } from 'vue'
import { themeState } from '../../utils/themes'

const props = withDefaults(
  defineProps<{
    collapse?: boolean
    backgroundColor?: string
    textColor?: string
  }>(),
  {
    collapse: true,
    backgroundColor: '',
    textColor: ''
  }
)

const menuStyle = computed(() => ({
  '--menu-bg': props.backgroundColor || themeState.currentTheme.background2nd,
  '--menu-text': props.textColor || themeState.currentTheme.SideTextColor,
  backgroundColor: props.backgroundColor || themeState.currentTheme.background2nd,
  color: props.textColor || themeState.currentTheme.SideTextColor
}))

// 管理所有打开的 click 触发的子菜单
const openClickSubMenus = ref<Set<() => void>>(new Set())
// 管理所有打开的子菜单（包括 hover 和 click，用于控制 tooltip 显示）
const openSubMenus = ref<Set<() => void>>(new Set())

// 是否有任何子菜单打开（用于控制 tooltip 显示）
const hasOpenSubMenu = computed(() => openSubMenus.value.size > 0)

// 关闭所有 click 触发的子菜单
const closeAllClickSubMenus = () => {
  // 先调用所有关闭函数，它们会自动从 openSubMenus 中注销
  openClickSubMenus.value.forEach((closeFn) => closeFn())
  openClickSubMenus.value.clear()
  // 注意：不需要手动清理 openSubMenus，因为 closeFn 会调用 unregisterSubMenu
}

// 注册/注销 click 触发的子菜单
const registerClickSubMenu = (closeFn: () => void) => {
  openClickSubMenus.value.add(closeFn)
}

const unregisterClickSubMenu = (closeFn: () => void) => {
  openClickSubMenus.value.delete(closeFn)
}

// 注册/注销所有类型的子菜单（用于 tooltip 控制）
const registerSubMenu = (closeFn: () => void) => {
  openSubMenus.value.add(closeFn)
}

const unregisterSubMenu = (closeFn: () => void) => {
  openSubMenus.value.delete(closeFn)
}

// 提供给子组件使用
provide('closeAllClickSubMenus', closeAllClickSubMenus)
provide('registerClickSubMenu', registerClickSubMenu)
provide('unregisterClickSubMenu', unregisterClickSubMenu)
provide('registerSubMenu', registerSubMenu)
provide('unregisterSubMenu', unregisterSubMenu)
provide('hasOpenSubMenu', hasOpenSubMenu)

defineExpose({ closeAllClickSubMenus })
</script>

<style scoped>
.ui-menu {
  width: 64px;
  height: 100%;
  transition:
    width 0.2s ease,
    background-color 0.2s ease;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  overflow: hidden;
  /* 与主界面之间的半透明边界，避免背景撞色时看不出分界 */
  border-right: 1px solid var(--sidebar-border, rgba(128, 128, 128, 0.28));
  display: flex;
  flex-direction: column;
  background-color: var(--menu-bg);
  color: var(--menu-text);
}

.ui-menu:not(.is-collapsed) {
  width: 180px;
  min-height: 400px;
}

@media (max-width: 768px) {
  .ui-menu:not(.is-collapsed) {
    width: 160px;
  }
}
</style>
