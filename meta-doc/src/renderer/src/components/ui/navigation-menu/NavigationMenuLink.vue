<template>
  <NavigationMenuLink
    v-bind="forwarded"
    :active="isActive"
    class="navigation-menu-link"
    @click="handleClick"
  >
    <slot />
  </NavigationMenuLink>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NavigationMenuLink, useForwardPropsEmits } from 'radix-vue'

const props = defineProps<{
  value?: string
  index?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const forwarded = useForwardPropsEmits(props, emit)

// Support both 'value' (radix-vue) and 'index' (element-plus style) props
const itemValue = computed(() => props.value || props.index)

const isActive = computed(() => false)

const handleClick = (event: MouseEvent) => {
  if (!props.disabled) {
    emit('click', event)
  }
}
</script>

<style scoped>
.navigation-menu-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s ease;
  user-select: none;
  text-decoration: none;
  color: inherit;
}

.navigation-menu-link:hover:not([data-disabled]) {
  background-color: rgba(0, 0, 0, 0.06);
}

.navigation-menu-link[data-active] {
  background-color: rgba(0, 0, 0, 0.1);
}

.navigation-menu-link[data-disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
