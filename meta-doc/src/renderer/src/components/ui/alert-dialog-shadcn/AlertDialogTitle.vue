<script setup>
import { reactiveOmit } from '@vueuse/core'
import { AlertDialogTitle } from 'reka-ui'
import { cn } from '@renderer/lib/utils'

const props = defineProps({
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false },
  class: { type: null, required: false }
})

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <AlertDialogTitle v-bind="delegatedProps" :class="cn('text-lg font-semibold', props.class)">
    <slot />
  </AlertDialogTitle>
</template>
