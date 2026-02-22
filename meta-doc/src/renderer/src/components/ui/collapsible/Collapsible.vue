<template>
  <CollapsibleRoot v-bind="forwarded" :class="$attrs.class">
    <slot />
  </CollapsibleRoot>
</template>

<script setup>
import { CollapsibleRoot, useForwardPropsEmits } from 'radix-vue'

const props = defineProps({
  defaultOpen: Boolean,
  open: Boolean,
  disabled: Boolean
})

const emit = defineEmits(['update:open'])

const forwarded = useForwardPropsEmits(props, emit)
</script>
