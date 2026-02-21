<template>
  <DropdownMenuSeparator
    v-bind="forwarded"
    :class="cn('-mx-1 my-1 h-px bg-muted', $attrs.class ?? '')"
  />
</template>

<script setup>
import { DropdownMenuSeparator, useForwardProps } from 'radix-vue'
import { cn } from '../../../lib/utils'

defineOptions({
  inheritAttrs: false
})

const props = defineProps({
  asChild: Boolean
})

const forwarded = useForwardProps(props)
</script>
