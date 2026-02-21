<template>
  <TabsRoot v-bind="forwarded" :class="$attrs.class">
    <slot />
  </TabsRoot>
</template>

<script setup>
import { TabsRoot, useForwardPropsEmits } from 'radix-vue'

const props = defineProps({
  defaultValue: String,
  modelValue: String,
  orientation: {
    type: String,
    default: 'horizontal'
  },
  dir: String,
  activationMode: {
    type: String,
    default: 'automatic'
  }
})

const emit = defineEmits(['update:modelValue'])

const forwarded = useForwardPropsEmits(props, emit)
</script>
