<script setup lang="ts">
import { PopoverContent, PopoverPortal, useForwardProps, type PopoverContentProps } from 'reka-ui'
import { computed, onUnmounted, type HTMLAttributes } from 'vue'
import { cn } from '@renderer/lib/utils'
import { repairModalPointerEvents } from '@renderer/utils/restore-body-pointer-events'

const props = withDefaults(
  defineProps<
    PopoverContentProps & {
      class?: HTMLAttributes['class']
    }
  >(),
  {
    side: 'bottom',
    sideOffset: 4,
    align: 'center'
  }
)

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props
  return delegated
})

const forwardedProps = useForwardProps(delegatedProps)

onUnmounted(() => {
  repairModalPointerEvents(250)
})
</script>

<template>
  <PopoverPortal>
    <PopoverContent
      v-bind="forwardedProps"
      :class="
        cn(
          'z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          props.class
        )
      "
    >
      <slot />
    </PopoverContent>
  </PopoverPortal>
</template>
