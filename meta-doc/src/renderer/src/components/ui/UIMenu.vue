<template>
  <div 
    class="ui-menu" 
    :class="{ 'is-collapsed': collapse }"
    :style="menuStyle"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, provide } from 'vue'
import { themeState } from '../../utils/themes'

const props = withDefaults(defineProps<{
  collapse?: boolean
  backgroundColor?: string
  textColor?: string
}>(), {
  collapse: true,
  backgroundColor: '',
  textColor: ''
})

const menuStyle = computed(() => ({
  '--menu-bg': props.backgroundColor || themeState.currentTheme.background2nd,
  '--menu-text': props.textColor || themeState.currentTheme.SideTextColor,
  backgroundColor: props.backgroundColor || themeState.currentTheme.background2nd,
  color: props.textColor || themeState.currentTheme.SideTextColor
}))

// 管理所有打开的 click 触发的子菜单
const openClickSubMenus = ref<Set<() => void>>(new Set())

// 关闭所有 click 触发的子菜单
const closeAllClickSubMenus = () => {
  openClickSubMenus.value.forEach(closeFn => closeFn())
  openClickSubMenus.value.clear()
}

// 注册/注销 click 触发的子菜单
const registerClickSubMenu = (closeFn: () => void) => {
  openClickSubMenus.value.add(closeFn)
}

const unregisterClickSubMenu = (closeFn: () => void) => {
  openClickSubMenus.value.delete(closeFn)
}

// 提供给子组件使用
provide('closeAllClickSubMenus', closeAllClickSubMenus)
provide('registerClickSubMenu', registerClickSubMenu)
provide('unregisterClickSubMenu', unregisterClickSubMenu)
</script>

<style scoped>
.ui-menu {
  width: 64px;
  height: 100%;
  transition: width 0.2s ease;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  overflow: hidden;
  border-right: none;
  display: flex;
  flex-direction: column;
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
