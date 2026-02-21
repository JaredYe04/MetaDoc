<template>
  <NumberFieldDecrement v-bind="forwarded">
    <slot />
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
