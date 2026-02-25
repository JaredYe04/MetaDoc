<script setup>
import { reactiveOmit } from '@vueuse/core'
import { SelectContent, SelectPortal, SelectViewport, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@renderer/lib/utils'
import { SelectScrollDownButton, SelectScrollUpButton } from '.'

defineOptions({
  inheritAttrs: false
})

const props = defineProps({
  forceMount: { type: Boolean, required: false },
  position: { type: String, required: false, default: 'popper' },
  bodyLock: { type: Boolean, required: false },
  side: { type: null, required: false },
  sideOffset: { type: Number, required: false },
  sideFlip: { type: Boolean, required: false },
  align: { type: null, required: false },
  alignOffset: { type: Number, required: false },
  alignFlip: { type: Boolean, required: false },
  avoidCollisions: { type: Boolean, required: false },
  collisionBoundary: { type: null, required: false },
  collisionPadding: { type: [Number, Object], required: false },
  arrowPadding: { type: Number, required: false },
  hideShiftedArrow: { type: Boolean, required: false },
  sticky: { type: String, required: false },
  hideWhenDetached: { type: Boolean, required: false },
  positionStrategy: { type: String, required: false },
  updatePositionStrategy: { type: String, required: false },
  disableUpdateOnLayoutShift: { type: Boolean, required: false },
  prioritizePosition: { type: Boolean, required: false },
  reference: { type: null, required: false },
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false },
  disableOutsidePointerEvents: { type: Boolean, required: false },
  class: { type: null, required: false }
})
const emits = defineEmits(['closeAutoFocus', 'escapeKeyDown', 'pointerDownOutside'])

const delegatedProps = reactiveOmit(props, 'class')

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <SelectPortal>
    <SelectContent
      v-bind="{ ...forwarded, ...$attrs }"
      :class="
        cn(
          'relative z-[10001] max-h-96 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md select-content-wrapper data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          position === 'popper' &&
            'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
          props.class
        )
      "
    >
      <SelectScrollUpButton />
      <SelectViewport
        :class="
          cn('p-1 select-viewport', position === 'popper' && 'h-[--reka-select-trigger-height]')
        "
      >
        <slot />
      </SelectViewport>
      <SelectScrollDownButton />
    </SelectContent>
  </SelectPortal>
</template>

<style scoped>
/* 
 * SelectContent 宽度规范：
 * 1. 下拉菜单宽度必须与 trigger 宽度完全一致
 * 2. 最小宽度必须能容纳最长的选项元素
 * 
 * 实现原理：
 * - width: auto 允许内容决定宽度
 * - min-width: max(var(--reka-select-trigger-width), fit-content) 确保最小宽度同时满足：
 *   a) 至少与 trigger 等宽
 *   b) 至少能容纳最长的选项
 */
.select-content-wrapper {
  width: auto;
  min-width: max(var(--reka-select-trigger-width), fit-content);
  max-width: fit-content;
}

/* 
 * Viewport 宽度规范：
 * - width: fit-content 让 viewport 根据内容自动调整宽度
 * - min-width: 100% 确保至少填满父容器
 */
.select-viewport {
  width: fit-content;
  min-width: 100%;
}

/* 
 * 选项元素规范：
 * - white-space: nowrap 防止文本折行，确保能正确计算最大宽度
 * - display: flex 确保布局正确
 */
:deep([role='option']) {
  white-space: nowrap;
  display: flex;
  align-items: center;
}

/* 
 * 选项文本规范：
 * - 防止文本溢出和折行
 */
:deep([role='option'] .select-item-text),
:deep([role='option'] span) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
