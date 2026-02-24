<script setup lang="ts">
import { TooltipTrigger, type TooltipTriggerProps } from 'radix-vue'
import { cn } from '@renderer/lib/utils'

const props = defineProps<TooltipTriggerProps & { class?: string }>()
</script>

<template>
  <TooltipTrigger v-bind="props" :class="cn('', props.class)">
    <slot />
  </TooltipTrigger>
</template>
