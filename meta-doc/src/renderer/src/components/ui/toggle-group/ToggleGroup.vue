<template>
  <ToggleGroupRoot
    v-bind="forwarded"
    :class="cn('flex items-center justify-center gap-1', props.class)"
  >
    <slot />
  </ToggleGroupRoot>
</template>

<script setup>
import { ToggleGroupRoot, useForwardPropsEmits } from 'radix-vue'
import { cn } from '@renderer/lib/utils'

const props = defineProps({
  modelValue: {
    type: [String, Array],
    default: undefined
  },
  defaultValue: {
    type: [String, Array],
    default: undefined
  },
  type: {
    type: String,
    default: 'single'
  },
  disabled: {
    type: Boolean,
    default: false
  },
  rovingFocus: {
    type: Boolean,
    default: true
  },
  loop: {
    type: Boolean,
    default: true
  },
  dir: {
    type: String,
    default: undefined
  },
  orientation: {
    type: String,
    default: 'horizontal'
  },
  class: {
    type: [String, Object, Array],
    default: ''
  }
})

const emit = defineEmits(['update:modelValue'])

const forwarded = useForwardPropsEmits(props, emit)
</script>
