<template>
  <p :class="cn('text-sm text-muted-foreground', $attrs.class ?? '')">
    <slot />
  </p>
</template>

<script setup>
import { cn } from '../../../lib/utils'

defineOptions({
  inheritAttrs: false
})
</script>
