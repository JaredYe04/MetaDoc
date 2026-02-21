<template>
  <NumberFieldDecrement v-bind="forwarded" :class="$attrs.class">
    <slot>
      <span class="text-lg leading-none">−</span>
    </slot>
  </NumberFieldDecrement>
</template>

<script setup>
import { NumberFieldDecrement, useForwardProps } from 'radix-vue'

defineOptions({
  inheritAttrs: false
})

const props = defineProps({
  disabled: Boolean,
  asChild: Boolean
})

const forwarded = useForwardProps(props)
</script>
