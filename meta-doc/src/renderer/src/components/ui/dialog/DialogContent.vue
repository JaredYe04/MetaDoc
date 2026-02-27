<script setup lang="ts">
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogClose,
  useForwardPropsEmits,
  type DialogContentProps
} from 'radix-vue'
import { X } from 'lucide-vue-next'
import { cn } from '@renderer/lib/utils'
import { ref, watch, onUnmounted } from 'vue'

// 防止事件监听器自动继承到 DialogPortal（DialogPortal 渲染 fragment，无法继承）
defineOptions({
  inheritAttrs: false
})

const props = defineProps<DialogContentProps & { class?: string }>()
const emits = defineEmits([
  'openAutoFocus',
  'closeAutoFocus',
  'escapeKeyDown',
  'pointerDownOutside',
  'focusOutside',
  'interactOutside'
])

const forwarded = useForwardPropsEmits(props, emits)

// 跟踪 Dialog 打开状态
const isOpen = ref(false)

// 监听 forwarded 中的 open 属性变化
watch(
  () => (forwarded.value as any)?.open,
  (newVal) => {
    isOpen.value = !!newVal
  },
  { immediate: true }
)

// 组件卸载时清理可能残留的遮罩
onUnmounted(() => {
  // 延迟清理，确保动画完成
  setTimeout(() => {
    const overlays = document.querySelectorAll('.dialog-overlay[data-state="closed"]')
    overlays.forEach((el) => {
      ;(el as HTMLElement).style.display = 'none'
      el.remove()
    })
  }, 200)
})
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      class="fixed inset-0 z-[9999] bg-black/60 dialog-overlay pointer-events-auto"
    />
    <DialogContent
      v-bind="forwarded"
      :class="
        cn(
          'fixed left-[50%] top-[50%] z-[10000] grid w-[calc(100%-2rem)] max-w-lg max-h-[calc(100vh-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-xl overflow-hidden rounded-lg dialog-content',
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
        class="absolute right-4 top-4 rounded-sm p-1 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none cursor-pointer z-[10001] bg-background"
      >
        <X class="h-4 w-4" />
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>

<style scoped>
/* 简单的淡入淡出 + 缩放动画，无位移 */
@keyframes dialog-enter {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes dialog-exit {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.95);
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
.dialog-content {
  transform-origin: center center;
}

.dialog-content[data-state='open'] {
  animation: dialog-enter 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.dialog-content[data-state='closed'] {
  animation: dialog-exit 0.15s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  pointer-events: none !important;
}

.dialog-overlay[data-state='open'] {
  animation: overlay-enter 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.dialog-overlay[data-state='closed'] {
  animation: overlay-exit 0.15s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  pointer-events: none !important;
  opacity: 0 !important;
}
</style>
