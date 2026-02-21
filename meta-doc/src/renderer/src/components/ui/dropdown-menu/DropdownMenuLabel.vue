<template>
  <DropdownMenuLabel
    v-bind="forwarded"
    :class="cn('px-2 py-1.5 text-sm font-semibold', inset && 'pl-8', $attrs.class ?? '')"
  >
    <slot />
  </DropdownMenuLabel>
</template>

<script setup>
import { DropdownMenuLabel, useForwardProps } from 'radix-vue'
import { cn } from '../../../lib/utils'

defineOptions({
  inheritAttrs: false
})

const props = defineProps({
  asChild: Boolean,
  inset: Boolean
})

const forwarded = useForwardProps(props)
</script>
