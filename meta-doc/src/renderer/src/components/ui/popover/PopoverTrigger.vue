<script setup lang="ts">
import { PopoverTrigger, useForwardProps, type PopoverTriggerProps } from 'reka-ui'
import { computed, type HTMLAttributes } from 'vue'
import { cn } from '@renderer/lib/utils'

const props = defineProps<
  PopoverTriggerProps & {
    class?: HTMLAttributes['class']
  }
>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props
  return delegated
})

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <PopoverTrigger v-bind="forwardedProps" :class="cn('', props.class)">
    <slot />
  </PopoverTrigger>
</template>
