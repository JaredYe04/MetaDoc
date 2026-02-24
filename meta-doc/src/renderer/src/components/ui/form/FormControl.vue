<template>
  <div :class="cn('space-y-2', $attrs.class)">
    <slot />
  </div>
</template>

<script setup>
import { cn } from '../../../lib/utils'
</script>
