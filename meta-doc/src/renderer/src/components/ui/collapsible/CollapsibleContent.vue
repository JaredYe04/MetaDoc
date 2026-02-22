<template>
  <CollapsibleContent
    v-bind="forwarded"
    :class="cn('overflow-hidden transition-all', $attrs.class)"
  >
    <div class="pb-4 pt-0">
      <slot />
    </div>
  </CollapsibleContent>
</template>

<script setup>
import { CollapsibleContent } from 'radix-vue'
import { cn } from '../../../lib/utils'

const props = defineProps({
  asChild: Boolean
})

const forwarded = props
</script>
