<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@renderer/lib/utils'

interface Props {
  class?: string
  variant?: 'default' | 'destructive'
  // Element Plus compatible props
  type?: 'success' | 'warning' | 'error' | 'info' | 'primary'
  closable?: boolean
  showIcon?: boolean
  center?: boolean
  effect?: 'light' | 'dark'
  title?: string
  description?: string
}

const props = defineProps<Props>()

const variantClasses = {
  default: 'bg-background text-foreground',
  destructive:
    'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive'
}

// Map Element Plus type to shadcn variant
const mappedVariant = computed(() => {
  if (props.variant) return props.variant

  switch (props.type) {
    case 'success':
    case 'info':
    case 'primary':
      return 'default'
    case 'warning':
      return 'warning'
    case 'error':
    case 'danger':
      return 'destructive'
    default:
      return 'default'
  }
})
</script>

<template>
  <div
    :class="
      cn(
        'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
        variantClasses[variant || 'default'],
        props.class
      )
    "
    role="alert"
  >
    <slot />
  </div>
</template>
