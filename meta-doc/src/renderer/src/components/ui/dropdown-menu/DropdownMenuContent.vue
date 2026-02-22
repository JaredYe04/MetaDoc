<template>
  <DropdownMenuPortal>
    <DropdownMenuContent
      v-bind="forwarded"
      :class="
        cn(
          'z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          $attrs.class ?? ''
        )
      "
    >
      <slot />
    </DropdownMenuContent>
  </DropdownMenuPortal>
</template>

<script setup>
import { DropdownMenuContent, DropdownMenuPortal, useForwardPropsEmits } from 'radix-vue'
import { cn } from '../../../lib/utils'

defineOptions({
  inheritAttrs: false
})

const props = defineProps({
  forceMount: Boolean,
  loop: Boolean,
  side: {
    type: String,
    default: 'bottom'
  },
  sideOffset: {
    type: Number,
    default: 4
  },
  align: {
    type: String,
    default: 'center'
  },
  alignOffset: Number,
  avoidCollisions: {
    type: Boolean,
    default: true
  },
  collisionBoundary: {
    type: [String, Object],
    default: () => []
  },
  collisionPadding: {
    type: [Number, Object],
    default: 0
  },
  arrowPadding: {
    type: Number,
    default: 0
  },
  sticky: {
    type: String,
    default: 'partial'
  },
  hideWhenDetached: Boolean,
  updatePositionStrategy: {
    type: String,
    default: 'optimized'
  }
})

const emit = defineEmits([
  'escapeKeyDown',
  'pointerDownOutside',
  'focusOutside',
  'interactOutside',
  'closeAutoFocus'
])

const forwarded = useForwardPropsEmits(props, emit)
</script>
