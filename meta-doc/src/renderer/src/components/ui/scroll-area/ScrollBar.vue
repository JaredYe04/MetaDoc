<script setup>
import { reactiveOmit } from '@vueuse/core'
import { ScrollAreaScrollbar, ScrollAreaThumb } from 'reka-ui'
import { cn } from '@renderer/lib/utils'

const props = defineProps({
  orientation: { type: String, required: false, default: 'vertical' },
  forceMount: { type: Boolean, required: false },
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false },
  class: { type: null, required: false }
})

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <ScrollAreaScrollbar
    v-bind="delegatedProps"
    :class="
      cn(
        'flex touch-none select-none transition-colors',
        orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-px',
        orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-px',
        props.class
      )
    "
  >
    <!-- 颜色与 el-scrollbar 统一，由下方 :deep 样式强制为 --md-el-scrollbar-thumb -->
    <ScrollAreaThumb class="relative flex-1 rounded-full bg-border" />
  </ScrollAreaScrollbar>
</template>

<style scoped>
/* Reka Thumb 的 DOM 类为 relative flex-1 rounded-full bg-border，覆盖 bg-border 为与 el-scrollbar 同色 */
:deep(.relative.flex-1.rounded-full.bg-border) {
  background-color: var(--md-el-scrollbar-thumb, var(--el-text-color-secondary)) !important;
}
:deep(.relative.flex-1.rounded-full.bg-border:hover) {
  background-color: var(--md-el-scrollbar-thumb-hover, var(--el-text-color-secondary)) !important;
}
</style>
