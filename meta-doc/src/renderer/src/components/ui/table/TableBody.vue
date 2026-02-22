<template>
  <tbody :class="cn('[&_tr:last-child]:border-0', $attrs.class)">
    <slot />
  </tbody>
</template>

<script setup>
import { cn } from '../../../lib/utils'
</script>
