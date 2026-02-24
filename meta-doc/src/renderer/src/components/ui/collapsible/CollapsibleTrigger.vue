<template>
  <CollapsibleTrigger
    v-bind="forwarded"
    :class="
      cn(
        'flex items-center justify-between w-full py-2 px-3 text-sm font-medium transition-all hover:bg-accent hover:text-accent-foreground rounded-md [&[data-state=open]>svg]:rotate-180',
        $attrs.class
      )
    "
  >
    <slot />
    <ChevronDown v-if="!hideIcon" class="h-4 w-4 shrink-0 transition-transform duration-200" />
  </CollapsibleTrigger>
</template>

<script setup>
import { CollapsibleTrigger } from 'radix-vue'
import { ChevronDown } from 'lucide-vue-next'
import { cn } from '../../../lib/utils'

defineProps({
  asChild: Boolean,
  hideIcon: Boolean
})
</script>
