<script setup>
import { computed } from 'vue'
import { cn } from '@renderer/lib/utils'
import { linkVariants } from '.'

const props = defineProps({
  type: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'success', 'warning', 'danger', 'info'].includes(value)
  },
  underline: {
    type: Boolean,
    default: true
  },
  disabled: {
    type: Boolean,
    default: false
  },
  href: {
    type: String,
    default: ''
  },
  target: {
    type: String,
    default: ''
  },
  class: {
    type: null,
    required: false
  }
})

const emit = defineEmits(['click'])

// Determine if the component should render as an anchor or span
const isAnchor = computed(() => !!props.href && !props.disabled)

// Handle click event
const handleClick = (event) => {
  if (props.disabled) {
    event.preventDefault()
    return
  }
  emit('click', event)
}
</script>

<template>
  <component
    :is="isAnchor ? 'a' : 'span'"
    :href="isAnchor ? href : undefined"
    :target="isAnchor && target ? target : undefined"
    :class="cn(
      linkVariants({ type, underline }),
      disabled && 'cursor-not-allowed opacity-50 pointer-events-none',
      props.class
    )"
    @click="handleClick"
  >
    <slot />
  </component>
</template>
