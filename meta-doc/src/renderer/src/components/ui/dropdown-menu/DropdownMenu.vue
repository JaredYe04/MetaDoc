<template>
  <DropdownMenuRoot v-bind="forwarded">
    <slot />
  </DropdownMenuRoot>
</template>

<script setup>
import { DropdownMenuRoot, useForwardPropsEmits } from 'radix-vue'

const props = defineProps({
  defaultOpen: Boolean,
  open: Boolean,
  dir: String,
  modal: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['update:open'])

const forwarded = useForwardPropsEmits(props, emit)
</script>
