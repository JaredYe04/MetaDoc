<script setup lang="ts">
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogClose,
  type DialogContentProps,
} from 'radix-vue'
import { X } from 'lucide-vue-next'
import { cn } from '@renderer/lib/utils'

const props = defineProps<DialogContentProps & { class?: string }>()
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      class="fixed inset-0 z-[9999] bg-black/60 dialog-overlay"
      style="backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);"
    />
    <DialogContent
      v-bind="props"
      :class="
        cn(
          'fixed z-[10000] grid w-full max-w-lg max-h-[calc(100vh-2rem)] gap-4 border bg-background p-6 shadow-xl overflow-hidden rounded-lg dialog-content',
          props.class
        )
      "
    >
      <!-- 滚动内容区域 -->
      <div class="overflow-y-auto max-h-full pr-2 -mr-2">
        <slot />
      </div>

      <!-- 默认关闭按钮 - 固定在右上角，不随滚动移动 -->
      <DialogClose
        class="absolute right-4 top-4 rounded-sm p-1 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none cursor-pointer z-[10001] bg-background/80 backdrop-blur-sm"
      >
        <X class="h-4 w-4" />
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>

<style scoped>
/* 从左上角 LogoTab 位置展开的动画 - 结束在屏幕正中央 */
@keyframes dialog-enter {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.1);
    left: 32px;
    top: 20px;
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
    left: 50%;
    top: 50%;
  }
}

@keyframes dialog-exit {
  from {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
    left: 50%;
    top: 50%;
  }
  to {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.1);
    left: 32px;
    top: 20px;
  }
}

@keyframes overlay-enter {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes overlay-exit {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

/* 使用 cubic-bezier 非线性缓动 */
.dialog-content[data-state='open'] {
  animation: dialog-enter 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.dialog-content[data-state='closed'] {
  animation: dialog-exit 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.dialog-overlay[data-state='open'] {
  animation: overlay-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.dialog-overlay[data-state='closed'] {
  animation: overlay-exit 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
</style>
