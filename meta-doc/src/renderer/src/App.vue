<!-- App.vue -->
<template>
  <div class="common-layout">
    <!-- 布局仅在需要时显示 -->
    <Main v-if="requiresLayout" />
    <!-- 如果不需要布局，则直接渲染路由页面 -->
    <router-view v-else />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Main from './views/Main.vue'

// 获取当前路由信息
const route = useRoute()

// 根据路由的 meta 信息判断是否需要顶部菜单和侧边菜单
const requiresLayout = computed(() => route.meta.requiresLayout !== false)
</script>

<style scoped>
/* App.vue 样式（可以为空） */
</style>
