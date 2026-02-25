<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'
import { cn } from '@renderer/lib/utils'
import { badgeVariants } from './variants'
import type { BadgeVariants } from './variants'

export interface BadgeProps {
  /** shadcn variant - takes precedence over type */
  variant?: BadgeVariants['variant']
  /** Additional CSS classes */
  class?: string
  /** Element Plus tag type */
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  /** Element Plus tag size */
  size?: 'large' | 'default' | 'small'
  /** Whether tag can be closed */
  closable?: boolean
  /** Whether tag is rounded */
  round?: boolean
  /** Element Plus effect style (mapped to variants) */
  effect?: 'light' | 'dark' | 'plain'
  /** Whether to show border (hit) */
  hit?: boolean
  /** Background color (Element Plus) */
  color?: string
}

const props = withDefaults(defineProps<BadgeProps>(), {
  type: 'primary',
  size: 'default',
  closable: false,
  round: false,
  hit: false,
  effect: 'light'
})

const emit = defineEmits<{
  /** Emitted when close button is clicked */
  (e: 'close', event: MouseEvent): void
}>()

// Map Element Plus type to shadcn variant
const mappedVariant = computed<BadgeVariants['variant']>(() => {
  if (props.variant) return props.variant

  if (props.effect === 'plain') {
    return 'outline'
  }

  switch (props.type) {
    case 'success':
      return 'success'
    case 'warning':
      return 'warning'
    case 'danger':
      return 'destructive'
    case 'info':
      return 'info'
    case 'primary':
    default:
      return props.effect === 'dark' ? 'default' : 'secondary'
  }
})

// Size classes mapping
const sizeClasses = computed(() => {
  switch (props.size) {
    case 'large':
      return 'px-3 py-1 text-sm'
    case 'small':
      return 'px-1.5 py-0 text-[10px]'
    case 'default':
    default:
      return 'px-2.5 py-0.5 text-xs'
  }
})

// Handle close event
const handleClose = (event: MouseEvent) => {
  event.stopPropagation()
  emit('close', event)
}

// Dynamic styles for custom color
const dynamicStyles = computed(() => {
  if (props.color) {
    return {
      backgroundColor: props.color,
      borderColor: props.color
    }
  }
  return {}
})
</script>

<template>
  <div
    :class="
      cn(
        badgeVariants({ variant: mappedVariant }),
        sizeClasses,
        round ? 'rounded-full' : 'rounded-md',
        hit ? 'border-2' : 'border',
        closable ? 'pr-1' : '',
        props.class
      )
    "
    :style="dynamicStyles"
  >
    <slot />
    <button
      v-if="closable"
      type="button"
      class="ml-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      @click="handleClose"
    >
      <X class="h-3 w-3" />
      <span class="sr-only">Remove</span>
    </button>
  </div>
</template>
