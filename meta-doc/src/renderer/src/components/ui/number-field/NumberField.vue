<template>
  <NumberFieldRoot v-bind="forwarded" :class="$attrs.class">
    <slot />
  </NumberFieldRoot>
</template>

<script setup>
import { NumberFieldRoot, useForwardPropsEmits } from 'radix-vue'

const props = defineProps({
  defaultValue: Number,
  modelValue: Number,
  min: Number,
  max: Number,
  step: {
    type: Number,
    default: 1
  },
  disabled: Boolean,
  required: Boolean,
  name: String,
  id: String
})

const emit = defineEmits(['update:modelValue'])

const forwarded = useForwardPropsEmits(props, emit)
</script>
