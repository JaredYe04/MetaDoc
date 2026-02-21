<template>
  <NumberFieldIncrement v-bind="forwarded">
    <slot />
  </NumberFieldIncrement>
</template>

<script setup>
import { NumberFieldIncrement, useForwardProps } from 'radix-vue'

defineOptions({
  inheritAttrs: false
})

const props = defineProps({
  disabled: Boolean,
  asChild: Boolean
})

const forwarded = useForwardProps(props)
</script>
