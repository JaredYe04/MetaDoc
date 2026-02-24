<template>
  <NavigationMenuItem class="navigation-menu-item">
    <slot />
  </NavigationMenuItem>
</template>

<script setup lang="ts">
import { NavigationMenuItem } from 'radix-vue'
</script>

<style scoped>
.navigation-menu-item {
  position: relative;
}
</style>
