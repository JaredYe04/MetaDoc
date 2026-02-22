<script setup lang="ts">
import { computed, useSlots } from 'vue'
import { cn } from '@renderer/lib/utils'

interface DividerProps {
  /** Direction of the divider - 'horizontal' | 'vertical' */
  direction?: 'horizontal' | 'vertical'
  /** Border style - CSS border-style value */
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'double' | 'groove' | 'ridge' | 'inset' | 'outset' | string
  /** Content position for horizontal divider with content - 'left' | 'center' | 'right' */
  contentPosition?: 'left' | 'center' | 'right'
  /** Additional CSS classes */
  class?: string
}

const props = withDefaults(defineProps<DividerProps>(), {
  direction: 'horizontal',
  borderStyle: 'solid',
  contentPosition: 'center',
  class: ''
})

const slots = useSlots()

const hasContent = computed(() => {
  return !!slots.default && props.direction === 'horizontal'
})

// Map border styles to Tailwind classes
const borderStyleClasses: Record<string, string> = {
  solid: 'border-solid',
  dashed: 'border-dashed',
  dotted: 'border-dotted',
  double: 'border-double',
  groove: 'border-solid', // Tailwind doesn't support groove, fallback to solid with inline style
  ridge: 'border-solid',
  inset: 'border-solid',
  outset: 'border-solid',
  hidden: 'border-hidden',
  none: 'border-none'
}

const borderStyleClass = computed(() => {
  return borderStyleClasses[props.borderStyle] || 'border-solid'
})

// For advanced border styles not in Tailwind, use inline style
const hasAdvancedBorderStyle = computed(() => {
  return ['groove', 'ridge', 'inset', 'outset'].includes(props.borderStyle)
})

const borderStyleValue = computed(() => {
  if (hasAdvancedBorderStyle.value) {
    return props.borderStyle
  }
  return undefined
})

const dividerClasses = computed(() => {
  if (hasContent.value) {
    return cn(
      'relative flex items-center w-full my-4',
      props.class
    )
  }
  
  return cn(
    'relative flex items-center shrink-0 bg-border',
    props.direction === 'horizontal' ? 'h-px w-full my-4' : 'w-px h-full mx-4',
    props.class
  )
})

const lineClasses = computed(() => {
  return cn(
    'flex-1 border-border',
    borderStyleClass.value,
    props.direction === 'horizontal' ? 'border-t' : 'border-l'
  )
})

// Computed style for lines with advanced border styles
const lineStyle = computed(() => {
  if (borderStyleValue.value) {
    return { borderTopStyle: borderStyleValue.value } as Record<string, string>
  }
  return undefined
})

const contentClasses = computed(() => {
  return cn(
    'px-4 text-sm text-muted-foreground whitespace-nowrap',
    {
      'order-first pr-4 pl-0': props.contentPosition === 'left',
      'px-4': props.contentPosition === 'center',
      'order-last pl-4 pr-0': props.contentPosition === 'right'
    }
  )
})
</script>

<template>
  <div 
    :class="dividerClasses" 
    role="separator"
    :style="hasContent && borderStyleValue ? { borderStyle: 'none' } : undefined"
  >
    <!-- Divider with content (horizontal only) -->
    <template v-if="hasContent">
      <div 
        :class="lineClasses" 
        :style="lineStyle"
      />
      <div :class="contentClasses">
        <slot />
      </div>
      <div 
        :class="lineClasses"
        :style="lineStyle"
      />
    </template>
    
    <!-- Simple divider (no content) - uses background for cleaner rendering -->
    <template v-else>
      <div 
        class="w-full h-full"
        :class="[
          props.direction === 'horizontal' ? 'h-px' : 'w-px',
          borderStyleClass
        ]"
        :style="[
          borderStyleValue ? { 
            backgroundColor: 'transparent',
            [props.direction === 'horizontal' ? 'borderTopStyle' : 'borderLeftStyle']: borderStyleValue,
            [props.direction === 'horizontal' ? 'borderTopWidth' : 'borderLeftWidth']: '1px',
            [props.direction === 'horizontal' ? 'borderTopColor' : 'borderLeftColor']: 'hsl(var(--border))'
          } : undefined
        ]"
      />
    </template>
  </div>
</template>
