<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { cn } from '@renderer/lib/utils'
import { cva } from 'class-variance-authority'

/**
 * Skeleton component compatible with Element Plus el-skeleton API
 * Supports: rows, animated, loading, throttle props
 * Variants: default (text), image, avatar
 */

interface Props {
  /** Number of skeleton rows (lines) to display */
  rows?: number
  /** Whether to show animation */
  animated?: boolean
  /** Whether to show skeleton (v-model alternative for loading state) */
  loading?: boolean
  /** Throttle delay in milliseconds before showing skeleton */
  throttle?: number
  /** Variant type: text (default), image, or avatar */
  variant?: 'text' | 'image' | 'avatar'
  /** Additional CSS classes */
  class?: string
  /** Width of skeleton (CSS value) */
  width?: string
  /** Height of skeleton (CSS value) */
  height?: string
  /** Whether this is the last item (controls margin) */
  last?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  rows: 1,
  animated: true,
  loading: true,
  throttle: 0,
  variant: 'text',
  class: '',
  width: undefined,
  height: undefined,
  last: false
})

const emit = defineEmits<{
  (e: 'update:loading', value: boolean): void
}>()

// Throttle handling
const isVisible = ref(!props.throttle)
let throttleTimer: ReturnType<typeof setTimeout> | null = null

const startThrottle = () => {
  if (throttleTimer) {
    clearTimeout(throttleTimer)
  }
  if (props.throttle > 0 && props.loading) {
    isVisible.value = false
    throttleTimer = setTimeout(() => {
      isVisible.value = true
    }, props.throttle)
  } else {
    isVisible.value = props.loading
  }
}

watch(() => props.loading, (newVal) => {
  if (newVal) {
    startThrottle()
  } else {
    if (throttleTimer) {
      clearTimeout(throttleTimer)
      throttleTimer = null
    }
    isVisible.value = false
  }
}, { immediate: true })

onUnmounted(() => {
  if (throttleTimer) {
    clearTimeout(throttleTimer)
  }
})

// Skeleton variants using class-variance-authority
const skeletonVariants = cva('bg-muted', {
  variants: {
    variant: {
      text: 'rounded-md',
      image: 'rounded-lg',
      avatar: 'rounded-full'
    },
    animated: {
      true: 'animate-pulse',
      false: ''
    }
  },
  defaultVariants: {
    variant: 'text',
    animated: true
  }
})

// Compute container classes
const containerClasses = computed(() => {
  return cn(
    'flex flex-col gap-2',
    props.class
  )
})

// Compute skeleton item classes
const itemClasses = computed(() => {
  return cn(
    skeletonVariants({ 
      variant: props.variant, 
      animated: props.animated 
    }),
    // Text variant specific sizing
    props.variant === 'text' && 'h-4 w-full',
    // Avatar variant specific sizing
    props.variant === 'avatar' && 'h-10 w-10',
    // Image variant specific sizing (if no explicit height)
    props.variant === 'image' && !props.height && 'aspect-video w-full'
  )
})

// Compute dynamic styles
const itemStyles = computed(() => {
  const styles: Record<string, string> = {}
  if (props.width) styles.width = props.width
  if (props.height) styles.height = props.height
  return styles
})

// Generate array for rows
const rowArray = computed(() => {
  return Array.from({ length: props.rows }, (_, i) => i)
})

// Last row styling (80% width for text variant to simulate paragraph end)
const getRowClasses = (index: number) => {
  const isLastRow = index === props.rows - 1 && props.variant === 'text'
  return cn(
    itemClasses.value,
    isLastRow && !props.width && 'w-[80%]'
  )
}
</script>

<template>
  <div v-if="loading && isVisible" :class="containerClasses">
    <template v-if="variant === 'text'">
      <div
        v-for="index in rowArray"
        :key="index"
        :class="getRowClasses(index)"
        :style="itemStyles"
      />
    </template>
    <template v-else-if="variant === 'avatar'">
      <div
        v-for="index in rowArray"
        :key="index"
        :class="itemClasses"
        :style="itemStyles"
      />
    </template>
    <template v-else-if="variant === 'image'">
      <div
        v-for="index in rowArray"
        :key="index"
        :class="itemClasses"
        :style="itemStyles"
      />
    </template>
  </div>
  <slot v-else />
</template>

<style scoped>
/* Custom shimmer animation for more sophisticated loading effect */
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.animate-shimmer {
  background: linear-gradient(
    90deg,
    hsl(var(--muted)) 25%,
    hsl(var(--muted-foreground) / 0.1) 50%,
    hsl(var(--muted)) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
</style>
