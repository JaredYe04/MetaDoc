<template>
  <NavigationMenuList class="navigation-menu-list">
    <slot />
  </NavigationMenuList>
</template>

<script setup lang="ts">
import { NavigationMenuList } from 'radix-vue'
</script>

<style scoped>
.navigation-menu-list {
  display: flex;
  flex-direction: column;
  list-style: none;
  margin: 0;
  padding: 0;
}
</style>
