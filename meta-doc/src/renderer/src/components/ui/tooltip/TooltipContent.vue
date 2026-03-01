<script setup lang="ts">
import { TooltipContent, TooltipPortal, type TooltipContentProps } from 'radix-vue'
import { cn } from '@renderer/lib/utils'

const props = withDefaults(
  defineProps<
    TooltipContentProps & {
      class?: string
      avoidCollisions?: boolean
      collisionPadding?: number | Partial<Record<'top' | 'bottom' | 'left' | 'right', number>>
    }
  >(),
  {
    sideOffset: 4,
    avoidCollisions: true,
    collisionPadding: 8
  }
)

// 与 Tooltip.vue 一致：置顶 z-index，避免被任意父容器或 MainTabs 等遮挡
const tooltipContentClass =
  'z-[2147483646] overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2'
</script>

<template>
  <!-- 强制挂载到 body，避免被父容器 overflow 裁剪，保证 tooltip 始终可见 -->
  <TooltipPortal to="body">
    <TooltipContent
      v-bind="props"
      :class="cn(tooltipContentClass, props.class)"
    >
      <slot />
    </TooltipContent>
  </TooltipPortal>
</template>
