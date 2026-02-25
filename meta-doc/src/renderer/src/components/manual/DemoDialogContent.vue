<script lang="ts">
import { ref, provide, inject, type InjectionKey } from 'vue'

// Demo模式标志的注入键
export const DialogDemoContextKey: InjectionKey<{ isDemoMode: boolean; containerRef: any }> =
  Symbol('DialogDemoContext')

// 提供demo上下文的组合式函数
export function provideDialogDemoContext() {
  provide(DialogDemoContextKey, {
    isDemoMode: true,
    containerRef: ref<HTMLElement | null>(null)
  })
}

// 使用demo上下文的组合式函数
export function useDialogDemoContext() {
  return inject(DialogDemoContextKey, null)
}
</script>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { X } from 'lucide-vue-next'
import { cn } from '@renderer/lib/utils'
import {
  DialogOverlay,
  DialogContent,
  DialogClose,
  useForwardPropsEmits,
  type DialogContentProps,
  DialogPortal,
  DialogRoot,
  useForwardProps
} from 'radix-vue'

// ==================== DemoDialogContent 组件 ====================

interface DemoDialogContentProps extends DialogContentProps {
  class?: string
}

const props = defineProps<DemoDialogContentProps>()
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

// 组件卸载时清理
onUnmounted(() => {
  setTimeout(() => {
    const overlays = document.querySelectorAll('.demo-dialog-overlay[data-state="closed"]')
    overlays.forEach((el) => {
      ;(el as HTMLElement).style.display = 'none'
      el.remove()
    })
  }, 200)
})
</script>

<template>
  <!-- Demo模式：不使用 DialogPortal，直接渲染在文档流中 -->
  <div class="demo-dialog-wrapper">
    <DialogOverlay
      class="demo-dialog-overlay bg-black/60 pointer-events-auto"
      style="backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px)"
    />
    <DialogContent
      v-bind="forwarded"
      :class="
        cn(
          'demo-dialog-content grid w-full gap-4 border bg-background p-6 shadow-xl overflow-hidden rounded-lg relative',
          props.class
        )
      "
    >
      <!-- 滚动内容区域 -->
      <div class="overflow-y-auto max-h-full pr-2 -mr-2">
        <slot />
      </div>

      <!-- 关闭按钮 -->
      <DialogClose
        class="absolute right-4 top-4 rounded-sm p-1 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none cursor-pointer z-10 bg-background/80 backdrop-blur-sm"
      >
        <X class="h-4 w-4" />
      </DialogClose>
    </DialogContent>
  </div>
</template>

<style scoped>
.demo-dialog-wrapper {
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.demo-dialog-overlay {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  z-index: 1;
}

.demo-dialog-content {
  position: relative;
  z-index: 2;
  max-height: 100%;
}

/* 动画效果 */
@keyframes demo-dialog-enter {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes demo-dialog-exit {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.95);
  }
}

@keyframes demo-overlay-enter {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes demo-overlay-exit {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

.demo-dialog-content {
  transform-origin: center center;
}

.demo-dialog-content[data-state='open'] {
  animation: demo-dialog-enter 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.demo-dialog-content[data-state='closed'] {
  animation: demo-dialog-exit 0.15s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  pointer-events: none !important;
}

.demo-dialog-overlay[data-state='open'] {
  animation: demo-overlay-enter 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.demo-dialog-overlay[data-state='closed'] {
  animation: demo-overlay-exit 0.15s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  pointer-events: none !important;
  opacity: 0 !important;
}
</style>
