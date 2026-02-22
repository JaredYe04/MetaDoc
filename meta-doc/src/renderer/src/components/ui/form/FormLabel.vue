<template>
  <Label :for="for" :class="cn('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', $attrs.class)">
    <slot />
  </Label>
</template>

<script setup>
import { Label } from 'radix-vue'
import { cn } from '../../../lib/utils'

defineProps({
  for: String
})
</script>
