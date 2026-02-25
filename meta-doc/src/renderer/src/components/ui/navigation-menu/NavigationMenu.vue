<template>
  <NavigationMenuRoot
    v-bind="forwarded"
    :value="modelValue"
    :defaultValue="defaultValue"
    @update:value="$emit('update:value', $event)"
  >
    <slot />
  </NavigationMenuRoot>
</template>

<script setup lang="ts">
import { NavigationMenuRoot, useForwardPropsEmits } from 'radix-vue'

const props = defineProps<{
  modelValue?: string
  defaultValue?: string
  delayDuration?: number
  skipDelayDuration?: number
  dir?: string
  orientation?: 'horizontal' | 'vertical'
}>()

const emit = defineEmits<{
  'update:value': [value: string]
}>()

const forwarded = useForwardPropsEmits(props, emit)
</script>
