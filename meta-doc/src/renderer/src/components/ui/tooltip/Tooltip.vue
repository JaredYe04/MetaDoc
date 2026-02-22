<script setup lang="ts">
import { TooltipRoot, TooltipTrigger, TooltipContent, TooltipPortal } from 'radix-vue'
import { cn } from '@renderer/lib/utils'

const props = defineProps<{
  class?: string
}>()
</script>

<template>
  <TooltipRoot>
    <slot />
  </TooltipRoot>
</template>
