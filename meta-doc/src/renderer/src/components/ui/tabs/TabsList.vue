<template>
  <TabsList
    v-bind="forwarded"
    :class="cn('inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground', $attrs.class ?? '')"
  >
    <slot />
  </TabsList>
</template>

<script setup>
import { TabsList, useForwardProps } from 'radix-vue'
import { cn } from '../../../lib/utils'

defineOptions({
  inheritAttrs: false
})

const props = defineProps({
  loop: {
    type: Boolean,
    default: true
  }
})

const forwarded = useForwardProps(props)
</script>
