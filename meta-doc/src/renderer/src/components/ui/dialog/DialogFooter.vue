<script setup lang="ts">
import { cn } from '@renderer/lib/utils'

const props = defineProps({
  class: { type: String, required: false }
})
</script>

<template>
  <div :class="cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2', props.class)">
    <slot />
  </div>
</template>
