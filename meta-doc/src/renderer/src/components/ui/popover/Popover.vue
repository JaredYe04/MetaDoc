<script setup lang="ts">
import { computed } from 'vue'
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
  useForwardPropsEmits,
  type PopoverContentProps,
  type PopoverRootEmits,
  type PopoverRootProps
} from 'reka-ui'
import { cn } from '@renderer/lib/utils'

const props = withDefaults(
  defineProps<
    PopoverRootProps &
      PopoverContentProps & {
        class?: string
      }
  >(),
  {
    side: 'bottom',
    sideOffset: 4,
    align: 'center'
  }
)

const emits = defineEmits<PopoverRootEmits>()

const delegatedRootProps = computed(() => {
  const { class: _, side, sideOffset, align, collisionPadding, ...rootProps } = props
  return rootProps
})

const delegatedContentProps = computed(() => {
  const { class: _, open, defaultOpen, modal, ...contentProps } = props
  return contentProps
})

const forwarded = useForwardPropsEmits(delegatedRootProps, emits)
</script>

<template>
  <PopoverRoot v-bind="forwarded">
    <PopoverTrigger as-child>
      <slot />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        v-bind="delegatedContentProps"
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
  </PopoverRoot>
</template>
