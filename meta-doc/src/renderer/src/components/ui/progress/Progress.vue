<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@renderer/lib/utils'

interface Props {
  modelValue?: number
  max?: number
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: 0,
  max: 100,
  class: ''
})

// 计算百分比进度
const percentage = computed(() => {
  const value = Math.max(0, Math.min(props.max, props.modelValue))
  return Math.round((value / props.max) * 100)
})
</script>

<template>
  <div
    :class="
      cn(
        'relative h-4 w-full overflow-hidden rounded-full bg-secondary',
        props.class
      )
    "
    role="progressbar"
    :aria-valuenow="percentage"
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <div
      :class="
        cn(
          'h-full w-full flex-1 bg-primary transition-all duration-300 ease-in-out',
          percentage === 0 && 'opacity-0'
        )
      "
      :style="{ width: `${percentage}%` }"
    />
  </div>
</template>
