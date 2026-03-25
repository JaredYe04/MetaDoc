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

// useForwardPropsEmits + useEmitAsProps 已向子组件注入 onSelect/onClick，勿再写 @select，否则会与 v-bind 合并后触发两次
const forwardedProps = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DropdownMenuItem
    v-bind="forwardedProps"
:class="
        cn(
          'relative flex cursor-default select-none items-center rounded-sm gap-2 px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0',
          inset && 'pl-8',
          props.class
        )
      "
  >
    <slot />
  </DropdownMenuItem>
</template>
