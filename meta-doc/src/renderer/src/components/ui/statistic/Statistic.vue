<script setup lang="ts">
import { computed, inject } from 'vue'
import { cn } from '@renderer/lib/utils'

interface Props {
  class?: string
  // Element Plus el-statistic compatible props
  title?: string
  value?: string | number
  prefix?: string
  suffix?: string
  valueStyle?: Record<string, string>
  formatter?: (value: string | number) => string
}

const props = withDefaults(defineProps<Props>(), {
  class: '',
  title: '',
  value: '',
  prefix: '',
  suffix: '',
  valueStyle: () => ({}),
  formatter: undefined
})

// Get themeState from global injection (provided in main.js)
const themeState = inject<any>('themeState', null)

// Format the value using formatter or default to string
const formattedValue = computed(() => {
  if (props.formatter) {
    return props.formatter(props.value)
  }
  return String(props.value)
})

// Merge value-style with theme-aware defaults
const computedValueStyle = computed(() => {
  return {
    ...props.valueStyle
  }
})
</script>

<template>
  <div :class="cn('flex flex-col gap-1', props.class)">
    <!-- Title Section -->
    <div class="text-sm text-muted-foreground">
      <slot name="title">
        {{ title }}
      </slot>
    </div>

    <!-- Value Section -->
    <div
      class="flex items-baseline gap-1 text-2xl font-semibold tracking-tight"
      :style="computedValueStyle"
    >
      <!-- Prefix Slot/Prop -->
      <span v-if="prefix || $slots.prefix" class="text-muted-foreground text-lg">
        <slot name="prefix">
          {{ prefix }}
        </slot>
      </span>

      <!-- Main Value -->
      <span class="tabular-nums">
        <slot :value="value">
          {{ formattedValue }}
        </slot>
      </span>

      <!-- Suffix Slot/Prop -->
      <span v-if="suffix || $slots.suffix" class="text-muted-foreground text-lg">
        <slot name="suffix">
          {{ suffix }}
        </slot>
      </span>
    </div>
  </div>
</template>
