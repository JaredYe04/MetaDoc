<script setup>
import { computed } from 'vue'
import { cn } from '@renderer/lib/utils'
import { textVariants } from '.'

const props = defineProps({
  type: { type: String, required: false },
  size: { type: String, required: false, default: 'default' },
  truncated: { type: Boolean, required: false, default: false },
  lineClamp: { type: [Number, String], required: false },
  tag: { type: String, required: false, default: 'span' },
  class: { type: null, required: false }
})

const sizeClasses = computed(() => {
  const sizeMap = { large: 'text-base', default: 'text-sm', small: 'text-xs' }
  return sizeMap[props.size] || sizeMap.default
})

const truncationClasses = computed(() => {
  const classes = []
  if (props.truncated) classes.push('truncate')
  if (props.lineClamp !== undefined) {
    const clampValue = Number(props.lineClamp)
    if (!isNaN(clampValue) && clampValue > 0) {
      classes.push(`line-clamp-${clampValue}`)
    }
  }
  return classes
})

const componentTag = computed(() => props.tag)
</script>

<template>
  <component
    :is="componentTag"
    :class="cn(textVariants({ type }), sizeClasses, truncationClasses, props.class)"
  >
    <slot />
  </component>
</template>

<style scoped>
.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.line-clamp-4 {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.line-clamp-5 {
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.line-clamp-6 {
  display: -webkit-box;
  -webkit-line-clamp: 6;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
