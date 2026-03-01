<template>
  <TabsContent
    v-bind="forwarded"
    :class="
      cn(
        'mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        $attrs.class ?? ''
      )
    "
  >
    <slot />
  </TabsContent>
</template>

<script setup>
import { TabsContent, useForwardProps } from 'radix-vue'
import { cn } from '../../../lib/utils'

defineOptions({
  inheritAttrs: false
})

const props = defineProps({
  value: {
    type: String,
    required: true
  },
  forceMount: Boolean
})

const forwarded = useForwardProps(props)
</script>
