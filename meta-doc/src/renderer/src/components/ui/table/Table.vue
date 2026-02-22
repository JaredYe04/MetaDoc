<template>
  <div :class="cn('w-full overflow-auto', $attrs.class)">
    <table :class="cn('w-full caption-bottom text-sm', $attrs.class)">
      <slot />
    </table>
  </div>
</template>

<script setup>
import { cn } from '../../../lib/utils'
</script>
