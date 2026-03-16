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
    // 关闭后：清理残留遮罩，并恢复 body 的 pointer-events（避免 reka-ui DismissableLayer 关闭时未恢复导致整页无法点击）
    if (!newVal) {
      setTimeout(() => {
        removeClosedDialogOverlays()
        restoreBodyPointerEvents()
      }, 250)
    }
  },
  { immediate: true }
)

function removeClosedDialogOverlays() {
  const overlays = document.querySelectorAll('.dialog-overlay[data-state="closed"]')
  overlays.forEach((el) => {
    el.remove()
  })
}

/** 恢复 body 的 pointer-events，修复 reka-ui DismissableLayer 关闭时未恢复导致整页无法点击的问题 */
function restoreBodyPointerEvents() {
  if (typeof document !== 'undefined' && document.body) {
    document.body.style.pointerEvents = ''
  }
}

// 组件卸载时清理可能残留的遮罩并恢复 body
onUnmounted(() => {
  setTimeout(() => {
    removeClosedDialogOverlays()
    restoreBodyPointerEvents()
  }, 250)
})
</script>

<template>
  <DialogPortal :to="'body'">
    <!-- overlay 必须在 MainTabs(40px) 下方，不遮挡任务栏 -->
    <DialogOverlay class="fixed z-[9999] bg-black/60 dialog-overlay dialog-viewport-below-tabs" />
    <!-- 点击 overlay 不关闭：preventDefault 阻止 pointerDownOutside/interactOutside 的默认关闭行为 -->
    <DialogContent
      v-bind="forwardedForRoot"
      @pointer-down-outside="(e: any) => e?.preventDefault?.()"
      @interact-outside="(e: any) => e?.preventDefault?.()"
    >
      <!-- 内容盒：居中于整个视口，宽度由调用方 class 控制；有自定义 class 时不加 max-w-lg 以免限制宽度 -->
      <div
        :class="
          cn(
            'dialog-content-box grid w-full max-h-[85vh] gap-4 border bg-background p-6 shadow-xl overflow-hidden rounded-lg relative min-h-0 grid-rows-[1fr]',
            props.class ? '' : 'max-w-lg',
            props.class
          )
        "
      >
        <el-scrollbar class="dialog-slot-scrollbar max-h-full min-h-0">
          <slot />
        </el-scrollbar>
        <DialogClose
          class="absolute right-4 top-4 rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring disabled:pointer-events-none cursor-pointer z-[10001] bg-background"
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

/* 对话框内容层：必须在 MainTabs 下方，铺满剩余视口并居中 */
.dialog-content-viewport {
  position: fixed !important;
  top: 40px !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100vw !important;
  height: calc(100vh - 40px) !important;
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

/* 默认不拦截点击，避免关闭后遮罩残留导致页面无法点击 */
.dialog-overlay {
  pointer-events: none;
}

.dialog-overlay[data-state='open'] {
  pointer-events: auto;
  animation: overlay-enter 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.dialog-overlay[data-state='closed'] {
  pointer-events: none !important;
  animation: overlay-exit 0.15s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  opacity: 0 !important;
}
</style>

<!-- 非 scoped：overlay 通过 Portal 渲染到 body，需全局样式确保尺寸与 pointer-events 生效 -->
<style>
.dialog-overlay.dialog-viewport-below-tabs {
  position: fixed !important;
  top: 40px !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100vw !important;
  height: calc(100vh - 40px) !important;
}

.dialog-overlay.dialog-viewport-below-tabs[data-state='open'] {
  pointer-events: auto !important;
}
</style>
