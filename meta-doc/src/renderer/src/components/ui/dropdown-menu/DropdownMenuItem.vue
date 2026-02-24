<script setup>
import { reactiveOmit } from '@vueuse/core'
import { DropdownMenuItem, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@renderer/lib/utils'

const props = defineProps({
  disabled: { type: Boolean, required: false },
  textValue: { type: String, required: false },
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false },
  class: { type: null, required: false },
  inset: { type: Boolean, required: false }
})

const emits = defineEmits(['select', 'click'])

const delegatedProps = reactiveOmit(props, 'class')

const forwardedProps = useForwardPropsEmits(delegatedProps, emits)

// Handle select event and also emit click for Element Plus compatibility
const handleSelect = (event) => {
  emits('select', event)
  emits('click', event)
}
</script>

<template>
  <DropdownMenuItem
    v-bind="forwardedProps"
    @select="handleSelect"
    :class="
      cn(
        'relative flex cursor-default select-none items-center rounded-sm gap-2 px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0',
        inset && 'pl-8',
        props.class
      )
    "
  >
    <slot />
  </DropdownMenuItem>
</template>
