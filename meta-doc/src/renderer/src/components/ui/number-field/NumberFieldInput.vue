<template>
  <div class="flex items-center border rounded-md">
    <NumberFieldDecrement class="px-2 py-1 border-r hover:bg-muted" />
    <NumberFieldInput
      :class="cn(
        'flex-1 px-3 py-1 text-center text-sm bg-transparent focus:outline-none',
        $attrs.class ?? ''
      )"
    />
    <NumberFieldIncrement class="px-2 py-1 border-l hover:bg-muted" />
  </div>
</template>

<script setup>
import { NumberFieldInput, NumberFieldDecrement, NumberFieldIncrement } from 'radix-vue'
import { cn } from '../../../lib/utils'

defineOptions({
  inheritAttrs: false
})
</script>
