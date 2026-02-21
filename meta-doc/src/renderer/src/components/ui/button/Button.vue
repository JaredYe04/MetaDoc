<template>
  <component
    :is="as"
    v-bind="$attrs"
    :class="cn(buttonVariants({ variant: computedVariant, size: computedSize }), $attrs.class ?? '')"
  >
    <slot />
  </component>
</template>

<script setup>
import { computed } from 'vue'
import { cn } from '../../../lib/utils'
import { buttonVariants } from './index.js'

const props = defineProps({
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
  },
  // Element UI compatible props
  type: {
    type: String,
    default: undefined
  },
  loading: {
    type: Boolean,
    default: false
  },
  circle: {
    type: Boolean,
    default: false
  }
})

const computedVariant = computed(() => {
  if (props.variant !== 'default') return props.variant
  // Map Element UI type to shadcn variant
  switch (props.type) {
    case 'primary': return 'default'
    case 'success': return 'secondary'
    case 'warning': return 'secondary'
    case 'danger': return 'destructive'
    case 'info': return 'outline'
    case 'text': return 'ghost'
    default: return 'default'
  }
})

const computedSize = computed(() => {
  // Map Element UI size to shadcn size
  switch (props.size) {
    case 'small': return 'sm'
    case 'large': return 'lg'
    default: return props.size
  }
})
</script>
