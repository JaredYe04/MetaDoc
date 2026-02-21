<template>
  <NavigationMenuTrigger
    v-bind="forwarded"
    class="navigation-menu-trigger"
  >
    <slot />
  </NavigationMenuTrigger>
</template>

<script setup lang="ts">
import { NavigationMenuTrigger, useForwardPropsEmits } from 'radix-vue'

const props = defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{}>()

const forwarded = useForwardPropsEmits(props, emit)
</script>

<style scoped>
.navigation-menu-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s ease;
  user-select: none;
  background: transparent;
  border: none;
  width: 100%;
  text-align: left;
  font: inherit;
  color: inherit;
}

.navigation-menu-trigger:hover:not([data-disabled]) {
  background-color: rgba(0, 0, 0, 0.06);
}

.navigation-menu-trigger[data-disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
