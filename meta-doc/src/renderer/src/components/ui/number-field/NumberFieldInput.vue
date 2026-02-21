<template>
  <div class="flex items-center">
    <NumberFieldDecrement as-child>
      <Button
        type="button"
        variant="outline"
        size="icon"
        class="h-8 w-8 rounded-r-none border-r-0"
      >
        <Minus class="h-3 w-3" />
      </Button>
    </NumberFieldDecrement>
    <NumberFieldInput
      :class="cn(
        'h-8 w-20 border-y border-input bg-background px-3 py-1 text-center text-sm',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        $attrs.class ?? ''
      )"
    />
    <NumberFieldIncrement as-child>
      <Button
        type="button"
        variant="outline"
        size="icon"
        class="h-8 w-8 rounded-l-none border-l-0"
      >
        <Plus class="h-3 w-3" />
      </Button>
    </NumberFieldIncrement>
  </div>
</template>

<script setup>
import { NumberFieldInput, NumberFieldDecrement, NumberFieldIncrement } from 'radix-vue'
import { cn } from '../../../lib/utils'
import { Button } from '../button'
import { Minus, Plus } from 'lucide-vue-next'

defineOptions({
  inheritAttrs: false
})
</script>
