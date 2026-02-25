<template>
  <td :class="cn('p-4 align-middle [&:has([role=checkbox])]:pr-0', $attrs.class)">
    <slot />
  </td>
</template>

<script setup>
import { cn } from '../../../lib/utils'
</script>
