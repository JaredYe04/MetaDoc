<script setup>
import { Primitive } from 'reka-ui'
import { cn } from '@renderer/lib/utils'
import { buttonVariants } from '.'
import { computed } from 'vue'

const props = defineProps({
  variant: { type: null, required: false },
  size: { type: null, required: false },
  class: { type: null, required: false },
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false, default: 'button' },
  // Element UI compatible props
  type: { type: String, required: false },
  loading: { type: Boolean, required: false, default: false },
  disabled: { type: Boolean, required: false, default: false },
  circle: { type: Boolean, required: false, default: false },
  round: { type: Boolean, required: false, default: false },
  plain: { type: Boolean, required: false, default: false }
})

// Map Element UI type to shadcn variant
const computedVariant = computed(() => {
  if (props.variant) return props.variant
  switch (props.type) {
    case 'primary':
      return 'default'
    case 'success':
      return 'secondary'
    case 'warning':
      return 'secondary'
    case 'danger':
      return 'destructive'
    case 'info':
      return 'outline'
    case 'text':
    case 'ghost':
      return 'ghost'
    default:
      return 'default'
  }
})

// Map Element UI size to shadcn size
const computedSize = computed(() => {
  if (props.size && ['sm', 'lg', 'icon', 'icon-sm', 'icon-lg'].includes(props.size))
    return props.size
  switch (props.size) {
    case 'small':
      return 'sm'
    case 'large':
      return 'lg'
    default:
      return 'default'
  }
})

// Compute additional classes (circle size/shape 由 buttonVariants 的 compoundVariants 统一处理)
const computedClass = computed(() => {
  const classes = [props.class]
  if (props.circle) classes.push('rounded-full aspect-square')
  else if (props.round) classes.push('rounded-full')
  return classes.filter(Boolean).join(' ')
})
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :class="
      cn(
        buttonVariants({ variant: computedVariant, size: computedSize, circle: props.circle }),
        computedClass
      )
    "
    :disabled="props.disabled || props.loading"
  >
    <slot />
  </Primitive>
</template>
