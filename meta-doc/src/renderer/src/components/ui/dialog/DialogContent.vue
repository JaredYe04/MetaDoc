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
import { ref, watch, onUnmounted, computed } from 'vue'

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

// 根节点只保留居中样式，不接收调用方的 width 类，否则对话框会偏左
const forwardedForRoot = computed(() => {
  const f = forwarded.value as Record<string, unknown>
  const { class: _omit, ...rest } = f ?? {}
  return { ...rest, class: 'dialog-content dialog-content-viewport' }
})

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
  <DialogPortal :to="'body'">
    <DialogOverlay
      class="fixed inset-0 z-[9999] bg-black/60 dialog-overlay pointer-events-auto dialog-viewport-full"
    />
    <DialogContent v-bind="forwardedForRoot">
      <!-- 内容盒：居中于整个视口，宽度类由调用方传入 -->
      <div
        :class="cn('dialog-content-box grid w-full max-w-lg max-h-[85vh] gap-4 border bg-background p-6 shadow-xl overflow-hidden rounded-lg relative min-h-0 grid-rows-[1fr]', props.class)"
      >
        <el-scrollbar class="dialog-slot-scrollbar max-h-full min-h-0">
          <slot />
        </el-scrollbar>
        <DialogClose
          class="absolute right-4 top-4 rounded-sm p-1 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none cursor-pointer z-[10001] bg-background"
        >
          <X class="h-4 w-4" />
        </DialogClose>
      </div>
    </DialogContent>
  </DialogPortal>
</template>

<style scoped>
/* 仅淡入淡出，不缩放，避免文字模糊 */
@keyframes dialog-enter {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes dialog-exit {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
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

/* 确保遮罩覆盖整个视口 */
.dialog-viewport-full {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
}

/* 对话框内容层：必须铺满视口并居中，不能受调用方 class 影响宽度 */
.dialog-content-viewport {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  margin: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  z-index: 10000;
  /* 空白区域不拦截点击，让点击穿透到 overlay，从而触发“点击外部关闭” */
  pointer-events: none !important;
}

.dialog-content-viewport .dialog-content-box {
  pointer-events: auto !important;
}

.dialog-slot-scrollbar {
  height: 100%;
  max-height: 100%;
}
.dialog-slot-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.dialog-content {
  /* 无 transform 缩放，保持内容清晰 */
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
