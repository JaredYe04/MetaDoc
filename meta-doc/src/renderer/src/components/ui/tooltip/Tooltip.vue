<script setup>
import {
  TooltipArrow,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger
} from 'radix-vue'
import { cn } from '@renderer/lib/utils'
import { computed } from 'vue'

const props = defineProps({
  // Element Plus compatible props
  content: { type: String, required: false, default: '' },
  placement: {
    type: String,
    required: false,
    default: 'top',
    validator: (value) => {
      const validPlacements = [
        'top', 'top-start', 'top-end',
        'bottom', 'bottom-start', 'bottom-end',
        'left', 'left-start', 'left-end',
        'right', 'right-start', 'right-end'
      ]
      return validPlacements.includes(value)
    }
  },
  disabled: { type: Boolean, required: false, default: false },
  offset: { type: Number, required: false, default: 4 },
  showArrow: { type: Boolean, required: false, default: true },
  // Additional props for flexibility
  class: { type: String, required: false },
  contentClass: { type: String, required: false },
  delayDuration: { type: Number, required: false, default: 0 }
})

// Map Element Plus placement to Radix Vue side and align
const placementMap = {
  'top': { side: 'top', align: 'center' },
  'top-start': { side: 'top', align: 'start' },
  'top-end': { side: 'top', align: 'end' },
  'bottom': { side: 'bottom', align: 'center' },
  'bottom-start': { side: 'bottom', align: 'start' },
  'bottom-end': { side: 'bottom', align: 'end' },
  'left': { side: 'left', align: 'center' },
  'left-start': { side: 'left', align: 'start' },
  'left-end': { side: 'left', align: 'end' },
  'right': { side: 'right', align: 'center' },
  'right-start': { side: 'right', align: 'start' },
  'right-end': { side: 'right', align: 'end' }
}

const computedPlacement = computed(() => placementMap[props.placement] || placementMap['top'])

// Compute tooltip open state based on disabled prop
const isDisabled = computed(() => props.disabled)
</script>

<template>
  <TooltipProvider :delay-duration="delayDuration">
    <TooltipRoot :disabled="isDisabled">
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          :side="computedPlacement.side"
          :align="computedPlacement.align"
          :side-offset="offset"
          :class="
            cn(
              'z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
              contentClass
            )
          "
        >
          <slot name="content">
            {{ content }}
          </slot>
          <TooltipArrow
            v-if="showArrow"
            class="fill-popover"
            :width="8"
            :height="4"
          />
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
