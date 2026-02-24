<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@renderer/lib/utils'
import { CheckCircle2, AlertTriangle, Info, XCircle } from 'lucide-vue-next'

interface Props {
  class?: string
  // Element Plus el-result compatible props
  icon?: 'success' | 'warning' | 'info' | 'error'
  title?: string
  'sub-title'?: string
  subTitle?: string
}

const props = defineProps<Props>()

// Handle both sub-title (kebab-case) and subTitle (camelCase)
const subtitleText = computed(() => props['sub-title'] || props.subTitle)

// Icon mapping
const iconComponents = {
  success: CheckCircle2,
  warning: AlertTriangle,
  info: Info,
  error: XCircle
}

// Icon color classes - using theme-compatible colors
const iconColorClasses = {
  success: 'text-green-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
  error: 'text-red-500'
}
</script>

<template>
  <div :class="cn('flex flex-col items-center justify-center py-12 px-4 text-center', props.class)">
    <!-- Icon Section -->
    <div class="mb-6">
      <slot name="icon">
        <component
          v-if="icon && iconComponents[icon]"
          :is="iconComponents[icon]"
          :class="cn('w-16 h-16', iconColorClasses[icon])"
          stroke-width="1.5"
        />
      </slot>
    </div>

    <!-- Title Section -->
    <div v-if="title || $slots.title" :class="cn('text-2xl font-semibold text-foreground mb-2')">
      <slot name="title">
        {{ title }}
      </slot>
    </div>

    <!-- Sub-title Section -->
    <div
      v-if="subtitleText || $slots['sub-title'] || $slots.subTitle"
      :class="cn('text-sm text-muted-foreground mb-6')"
    >
      <slot name="sub-title">
        <slot name="subTitle">
          {{ subtitleText }}
        </slot>
      </slot>
    </div>

    <!-- Extra Section (Action Buttons) -->
    <div v-if="$slots.extra" class="flex items-center gap-3">
      <slot name="extra" />
    </div>
  </div>
</template>
