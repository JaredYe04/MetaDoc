<script setup lang="ts">
import { computed, inject, useSlots } from 'vue'
import { useRouter } from 'vue-router'
import { cn } from '@renderer/lib/utils'

interface Props {
  class?: string
  // Element Plus el-breadcrumb-item compatible props
  to?: string | Record<string, any>
  replace?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  class: '',
  to: undefined,
  replace: false
})

const router = useRouter()
const slots = useSlots()

// Inject separator config from parent Breadcrumb
const separatorConfig = inject<{
  separator: string
  separatorClass: string
}>('breadcrumbSeparator', {
  separator: '/',
  separatorClass: ''
})

// Check if this is the last item (no separator after last item)
const isLast = computed(() => {
  // This is determined by the parent through context if needed
  // For now, we render separator by default and parent can control via CSS
  return false
})

// Compute if we have a custom separator slot from parent
const hasSeparatorSlot = computed(() => {
  // Check if the parent has a separator slot
  return false
})

// Handle click for navigation
const handleClick = () => {
  if (!props.to || !router) return

  const routeConfig = typeof props.to === 'string' ? { path: props.to } : props.to

  if (props.replace) {
    router.replace(routeConfig)
  } else {
    router.push(routeConfig)
  }
}

// Check if this item is clickable (has 'to' prop)
const isClickable = computed(() => !!props.to)
</script>

<template>
  <li
    :class="cn(
      'inline-flex items-center gap-1.5 sm:gap-2.5',
      props.class
    )"
  >
    <!-- Content: RouterLink if 'to' prop provided, otherwise span -->
    <component
      :is="isClickable ? 'a' : 'span'"
      :class="cn(
        'text-sm transition-colors hover:text-foreground',
        isClickable ? 'cursor-pointer hover:underline' : 'text-foreground font-medium'
      )"
      @click.prevent="isClickable && handleClick()"
    >
      <slot />
    </component>

    <!-- Separator -->
    <span
      v-if="!isLast"
      role="presentation"
      aria-hidden="true"
      :class="cn(
        'flex items-center text-muted-foreground/40',
        separatorConfig.separatorClass
      )"
    >
      <!-- Custom separator slot from parent -->
      <slot name="separator">
        <!-- Icon separator if separator-class is provided -->
        <i
          v-if="separatorConfig.separatorClass"
          :class="separatorConfig.separatorClass"
        />
        <!-- Text separator fallback -->
        <span v-else>{{ separatorConfig.separator }}</span>
      </slot>
    </span>
  </li>
</template>
