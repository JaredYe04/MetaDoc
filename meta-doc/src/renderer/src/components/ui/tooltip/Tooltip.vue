<script setup lang="ts">
import { TooltipRoot, TooltipTrigger, TooltipContent, TooltipPortal } from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: string
}>()
</script>

<template>
  <TooltipRoot>
    <slot />
  </TooltipRoot>
</template>
