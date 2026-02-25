<script setup lang="ts">
import { ref, computed, provide } from 'vue'
import { DialogRoot, DialogTitle, DialogDescription, DialogClose } from 'radix-vue'
import DemoDialogContent from './DemoDialogContent.vue'
import { DialogHeader, DialogFooter } from '@renderer/components/ui/dialog'
import { Layers, Maximize2, X } from 'lucide-vue-next'

// ==================== Demo Context ====================

const DialogDemoContextKey = Symbol('DialogDemoContext')

// ==================== 类型定义 ====================

interface DialogDemoWrapperProps {
  showTrigger?: boolean
  triggerText?: string
  defaultOpen?: boolean
  open?: boolean
  title?: string
  description?: string
  class?: string
  contentClass?: string
  showPreviewBadge?: boolean
  previewText?: string
  allowFullscreen?: boolean
}

// ==================== 组件实现 ====================

const props = withDefaults(defineProps<DialogDemoWrapperProps>(), {
  showTrigger: true,
  triggerText: '打开 Dialog',
  defaultOpen: false,
  showPreviewBadge: true,
  previewText: '组件预览',
  allowFullscreen: true
})

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

// 容器引用
const containerRef = ref<HTMLElement>()

// 内部状态
const internalOpen = ref(props.defaultOpen)
const isFullscreen = ref(false)

// 受控/非受控模式处理
const isOpen = computed({
  get: () => (props.open !== undefined ? props.open : internalOpen.value),
  set: (value) => {
    internalOpen.value = value
    emit('update:open', value)
  }
})

// 提供 demo 上下文
provide(DialogDemoContextKey, {
  isDemoMode: true,
  containerRef
})

function handleUpdateOpen(value: boolean) {
  isOpen.value = value
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
}
</script>

<template>
  <div
    ref="containerRef"
    class="dialog-demo-wrapper"
    :class="[props.class, { 'dialog-demo-fullscreen': isFullscreen }]"
  >
    <!-- 预览标签 -->
    <div v-if="showPreviewBadge" class="dialog-demo-badge">
      <Layers class="w-3 h-3" />
      <span>{{ previewText }}</span>
    </div>

    <!-- 工具栏 -->
    <div v-if="allowFullscreen" class="dialog-demo-toolbar">
      <button
        v-if="isOpen"
        class="dialog-demo-toolbar-btn"
        @click="toggleFullscreen"
        :title="isFullscreen ? '退出全屏' : '全屏预览'"
      >
        <Maximize2 class="w-4 h-4" />
      </button>
    </div>

    <!-- 触发按钮区域 -->
    <div v-if="showTrigger && !isOpen" class="dialog-demo-trigger">
      <slot name="trigger" :open="() => (isOpen = true)">
        <button class="dialog-demo-trigger-btn" @click="isOpen = true">
          {{ triggerText }}
        </button>
      </slot>
    </div>

    <!-- Dialog 容器 - 内嵌在文档流中 -->
    <DialogRoot :open="isOpen" :modal="true" @update:open="handleUpdateOpen">
      <!-- 使用自定义的 DemoDialogContent 替代 DialogContent -->
      <DemoDialogContent
        v-if="isOpen"
        :open="isOpen"
        :class="contentClass"
        @pointer-down-outside="isOpen = false"
        @escape-key-down="isOpen = false"
      >
        <!-- 默认 Header -->
        <DialogHeader v-if="title || description || $slots.header" class="dialog-demo-header">
          <slot name="header" :close="() => (isOpen = false)">
            <DialogTitle v-if="title" class="dialog-demo-title">{{ title }}</DialogTitle>
            <DialogDescription v-if="description" class="dialog-demo-description">
              {{ description }}
            </DialogDescription>
          </slot>
        </DialogHeader>

        <!-- 内容区域 -->
        <div class="dialog-demo-body">
          <slot :close="() => (isOpen = false)" :open="isOpen">
            <p class="dialog-demo-placeholder">Dialog 内容区域</p>
          </slot>
        </div>

        <!-- 默认 Footer -->
        <DialogFooter v-if="$slots.footer" class="dialog-demo-footer">
          <slot name="footer" :close="() => (isOpen = false)">
            <button class="dialog-demo-btn dialog-demo-btn-secondary" @click="isOpen = false">
              关闭
            </button>
          </slot>
        </DialogFooter>
      </DemoDialogContent>
    </DialogRoot>
  </div>
</template>

<style scoped>
.dialog-demo-wrapper {
  position: relative;
  width: 100%;
  padding: 2.5rem 1rem 1rem;
  border: 1px dashed hsl(var(--border));
  border-radius: var(--radius);
  background: hsl(var(--muted) / 0.3);
  overflow: visible;
  transition: all 0.3s ease;
}

.dialog-demo-fullscreen {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 90vw;
  height: 85vh;
  max-width: 1200px;
  z-index: 9999;
  background: hsl(var(--background));
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  padding: 3rem 2rem 2rem;
}

.dialog-demo-badge {
  position: absolute;
  top: -1px;
  left: -1px;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: hsl(var(--primary-foreground));
  background: hsl(var(--primary));
  border-top-left-radius: var(--radius);
  border-bottom-right-radius: var(--radius);
  z-index: 10;
}

.dialog-demo-toolbar {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: flex;
  gap: 0.25rem;
  z-index: 10;
}

.dialog-demo-toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: calc(var(--radius) - 2px);
  cursor: pointer;
  transition: all 0.15s ease;
}

.dialog-demo-toolbar-btn:hover {
  color: hsl(var(--foreground));
  background: hsl(var(--muted));
}

.dialog-demo-trigger {
  margin-bottom: 1rem;
}

.dialog-demo-trigger-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.5;
  color: hsl(var(--primary-foreground));
  background-color: hsl(var(--primary));
  border: 1px solid transparent;
  border-radius: var(--radius);
  cursor: pointer;
  transition: all 0.2s ease;
}

.dialog-demo-trigger-btn:hover {
  background-color: hsl(var(--primary) / 0.9);
}

.dialog-demo-header {
  margin-bottom: 1rem;
}

.dialog-demo-title {
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.5;
  color: hsl(var(--foreground));
}

.dialog-demo-description {
  margin-top: 0.25rem;
  font-size: 0.875rem;
  color: hsl(var(--muted-foreground));
}

.dialog-demo-body {
  flex: 1;
  min-height: 0;
}

.dialog-demo-placeholder {
  color: hsl(var(--muted-foreground));
  text-align: center;
  padding: 2rem;
}

.dialog-demo-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid hsl(var(--border));
}

.dialog-demo-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.5;
  border-radius: var(--radius);
  cursor: pointer;
  transition: all 0.2s ease;
}

.dialog-demo-btn-secondary {
  color: hsl(var(--foreground));
  background-color: hsl(var(--background));
  border: 1px solid hsl(var(--border));
}

.dialog-demo-btn-secondary:hover {
  background-color: hsl(var(--muted));
}
</style>
