<template>
  <component
    :is="as"
    :class="cn(buttonVariants({ variant, size }), $attrs.class ?? '')"
  >
    <slot />
  </component>
</template>

<script setup>
import { cn } from '../../../lib/utils'
import { buttonVariants } from './index.js'

defineOptions({
  inheritAttrs: false
})

defineProps({
  variant: {
    type: String,
    default: 'default'
  },
  size: {
    type: String,
    default: 'default'
  },
  as: {
    type: String,
    default: 'button'
  }
})
</script>
