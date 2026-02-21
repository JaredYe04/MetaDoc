<template>
  <NavigationMenuContent
    v-bind="forwarded"
    class="navigation-menu-content"
  >
    <slot />
  </NavigationMenuContent>
</template>

<script setup lang="ts">
import { NavigationMenuContent, useForwardPropsEmits } from 'radix-vue'

const props = defineProps<{
  disableOutsidePointerEvents?: boolean
}>()

const emit = defineEmits<{}>()

const forwarded = useForwardPropsEmits(props, emit)
</script>

<style scoped>
.navigation-menu-content {
  position: absolute;
  top: 0;
  left: 100%;
  min-width: 160px;
  background: var(--background, white);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 4px;
  z-index: 100;
}
</style>
