<template>
  <DropdownMenuTrigger v-bind="forwarded" :class="$attrs.class">
    <slot />
  </DropdownMenuTrigger>
</template>

<script setup>
import { DropdownMenuTrigger, useForwardProps } from 'radix-vue'

defineOptions({
  inheritAttrs: false
})

const props = defineProps({
  disabled: Boolean,
  asChild: Boolean
})

const forwarded = useForwardProps(props)
</script>
