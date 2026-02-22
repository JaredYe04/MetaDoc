<template>
  <ToggleGroupItem
    v-bind="forwarded"
    :class="
      cn(
        'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors',
        'hover:bg-muted hover:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        'data-[state=on]:bg-accent data-[state=on]:text-accent-foreground',
        'h-9 px-3',
        props.class
      )
    "
  >
    <slot />
  </ToggleGroupItem>
</template>

<script setup>
import { ToggleGroupItem, useForwardProps } from 'radix-vue'
import { cn } from '@renderer/lib/utils'

const props = defineProps({
  value: {
    type: String,
    required: true
  },
  disabled: {
    type: Boolean,
    default: false
  },
  class: {
    type: [String, Object, Array],
    default: ''
  }
})

const forwarded = useForwardProps(props)
</script>
