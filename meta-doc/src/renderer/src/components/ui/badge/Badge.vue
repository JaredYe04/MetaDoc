<script setup>
import { computed } from 'vue'
import { cn } from '@renderer/lib/utils'
import { badgeVariants } from '.'

const props = defineProps({
  variant: { type: null, required: false },
  class: { type: null, required: false },
  // Element Plus compatible props
  type: { type: String, required: false },
  size: { type: String, required: false },
  effect: { type: String, required: false },
  round: { type: Boolean, required: false, default: false },
  closable: { type: Boolean, required: false, default: false },
  hit: { type: Boolean, required: false, default: false }
})

// Map Element Plus type to shadcn variant
const mappedVariant = computed(() => {
  if (props.variant) return props.variant

  if (props.effect === 'plain') {
    return 'outline'
  }

  switch (props.type) {
    case 'success':
      return 'default'
    case 'warning':
      return 'warning'
    case 'danger':
    case 'error':
      return 'destructive'
    case 'info':
    case 'primary':
    default:
      return props.effect === 'dark' ? 'default' : 'secondary'
  }
})
</script>

<template>
  <div :class="cn(badgeVariants({ variant }), props.class)">
    <slot />
  </div>
</template>
