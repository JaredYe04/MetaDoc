<script setup lang="ts">
/**
 * InlineDialog - 在文档中内嵌展示任意 Dialog 组件
 *
 * 解决 Dialog 组件使用 Teleport/Portal 跳出文档流的问题
 * 通过禁用 teleport 和重写 CSS 定位，强制 Dialog 渲染在容器内
 *
 * 用法示例：
 * ```vue
 * <InlineDialog
 *   component="ExportOptionsDialog"
 *   :mock-data="{
 *     adapter: mockAdapter,
 *     sourceFormat: 'markdown',
 *     targetFormat: 'docx'
 *   }"
 * />
 * ```
 */
import { ref, computed, provide, inject, type Component, defineAsyncComponent } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Layers, Maximize2, X } from 'lucide-vue-next'
import { cn } from '@renderer/lib/utils'

// ==================== 类型定义 ====================

export interface InlineDialogProps {
  /** 要展示的 Dialog 组件名或组件实例 */
  component?: string | Component
  /** 传递给组件的 mock 数据 */
  mockData?: Record<string, any>
  /** 容器宽度 */
  width?: string
  /** 容器高度 */
  height?: string
  /** 是否默认展开 */
  defaultOpen?: boolean
  /** Dialog 标题 */
  title?: string
  /** Dialog 描述 */
  description?: string
  /** 自定义类名 */
  class?: string
  /** 是否显示预览标签 */
  showPreviewBadge?: boolean
  /** 预览标签文本 */
  previewText?: string
}

// ==================== Demo Context ====================

export const InlineDialogContextKey = Symbol('InlineDialogContext')

export interface InlineDialogContext {
  isInlineMode: true
  closeDialog: () => void
}

// ==================== 组件实现 ====================

const props = withDefaults(defineProps<InlineDialogProps>(), {
  width: '100%',
  height: 'auto',
  defaultOpen: true,
  showPreviewBadge: true,
  previewText: '组件预览',
  mockData: () => ({})
})

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

// 内部状态
const isOpen = ref(props.defaultOpen)
const isFullscreen = ref(false)

// 提供上下文给子组件
provide(InlineDialogContextKey, {
  isInlineMode: true,
  closeDialog: () => {
    isOpen.value = false
  }
})

// 动态加载组件
const dynamicComponent = computed(() => {
  if (!props.component) return null

  if (typeof props.component === 'string') {
    // 异步加载组件
    return defineAsyncComponent(() => {
      // 尝试从常见路径加载
      const paths = [
        `@renderer/components/${props.component}.vue`,
        `@renderer/components/${props.component}/index.vue`,
        `@renderer/views/${props.component}.vue`
      ]

      // 使用动态 import
      return import(`@renderer/components/${props.component}.vue`).catch(() => {
        // 如果找不到组件，返回一个占位组件
        return {
          name: 'ComponentNotFound',
          template: `
            <div class="inline-dialog-placeholder">
              <p>组件 "${props.component}" 未找到</p>
              <p class="text-sm text-muted-foreground">请检查组件路径</p>
            </div>
          `
        }
      })
    })
  }

  return props.component
})

// 处理 v-model:open 的绑定
const handleOpenChange = (value: boolean) => {
  isOpen.value = value
  emit('update:open', value)
}

// 切换全屏
const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value
}

// 关闭 Dialog
const closeDialog = () => {
  isOpen.value = false
  emit('update:open', false)
}

// 准备传递给子组件的 props
const componentProps = computed(() => {
  const baseProps: Record<string, any> = {
    ...props.mockData,
    mode: 'demo' // 添加 demo 模式标记
  }

  // 如果子组件使用 v-model:modelValue，绑定到 isOpen
  baseProps.modelValue = isOpen.value
  baseProps['onUpdate:modelValue'] = handleOpenChange

  // 添加内联模式标记
  baseProps.inlineMode = true
  baseProps.isInlineMode = true

  return baseProps
})
</script>

<template>
  <div
    class="inline-dialog-container"
    :class="[props.class, { 'inline-dialog-fullscreen': isFullscreen }]"
    :style="{ width, height: isFullscreen ? '80vh' : height }"
  >
    <!-- 预览标签 -->
    <div v-if="showPreviewBadge" class="inline-dialog-badge">
      <Layers class="w-3 h-3" />
      <span>{{ previewText }}</span>
    </div>

    <!-- 工具栏 -->
    <div class="inline-dialog-toolbar">
      <button
        class="inline-dialog-toolbar-btn"
        @click="toggleFullscreen"
        :title="isFullscreen ? '退出全屏' : '全屏预览'"
      >
        <Maximize2 class="w-4 h-4" />
      </button>
      <button class="inline-dialog-toolbar-btn" @click="closeDialog" title="关闭">
        <X class="w-4 h-4" />
      </button>
    </div>

    <!-- Dialog 区域 - 内嵌在文档流中 -->
    <Dialog :open="isOpen" @update:open="handleOpenChange">
      <DialogTrigger as-child>
        <Button v-if="!isOpen" variant="outline" class="inline-dialog-trigger">
          <Layers class="w-4 h-4 mr-2" />
          打开 Dialog
        </Button>
      </DialogTrigger>

      <!-- 使用 teleport="false" 禁用 Portal -->
      <DialogContent
        class="inline-dialog-content"
        :teleport="false"
        @pointer-down-outside="closeDialog"
        @escape-key-down="closeDialog"
      >
        <!-- 头部 -->
        <DialogHeader v-if="title || description">
          <DialogTitle v-if="title">{{ title }}</DialogTitle>
          <DialogDescription v-if="description">
            {{ description }}
          </DialogDescription>
        </DialogHeader>

        <!-- 组件内容区域 -->
        <div class="inline-dialog-body">
          <slot :open="isOpen" :close="closeDialog">
            <!-- 动态渲染传入的组件 -->
            <component v-if="dynamicComponent" :is="dynamicComponent" v-bind="componentProps" />
            <div v-else class="inline-dialog-placeholder">
              <p>请传入 component 属性来展示 Dialog 组件</p>
              <code class="inline-dialog-code">
                &lt;InlineDialog component="YourDialog" :mock-data="{}" /&gt;
              </code>
            </div>
          </slot>
        </div>

        <!-- 底部 -->
        <DialogFooter v-if="$slots.footer">
          <slot name="footer" :close="closeDialog">
            <Button variant="outline" @click="closeDialog">关闭</Button>
          </slot>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
.inline-dialog-container {
  position: relative;
  border: 1px dashed hsl(var(--border));
  border-radius: var(--radius);
  background: hsl(var(--muted) / 0.2);
  padding: 2.5rem 1rem 1rem;
  margin: 1rem 0;
  overflow: visible;
}

.inline-dialog-fullscreen {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 9999;
  background: hsl(var(--background));
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  padding: 3rem 2rem 2rem;
}

.inline-dialog-badge {
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

.inline-dialog-toolbar {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: flex;
  gap: 0.25rem;
  z-index: 10;
}

.inline-dialog-toolbar-btn {
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

.inline-dialog-toolbar-btn:hover {
  color: hsl(var(--foreground));
  background: hsl(var(--muted));
}

.inline-dialog-trigger {
  width: 100%;
  justify-content: center;
}

/* 覆盖 DialogContent 的样式，确保在容器内渲染 */
:deep(.inline-dialog-content) {
  position: relative !important;
  top: auto !important;
  left: auto !important;
  right: auto !important;
  bottom: auto !important;
  transform: none !important;
  width: 100% !important;
  max-width: 100% !important;
  max-height: none !important;
  margin: 0 !important;
}

/* 隐藏遮罩层或使其仅覆盖容器 */
:deep(.dialog-overlay),
:deep([data-radix-dialog-overlay]) {
  position: absolute !important;
  inset: 0 !important;
  border-radius: var(--radius);
}

/* 移除 fixed 定位 */
:deep(.fixed) {
  position: relative !important;
}

/* 确保内容在容器内 */
.inline-dialog-body {
  min-height: 200px;
  max-height: 600px;
  overflow-y: auto;
}

.inline-dialog-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  text-align: center;
  color: hsl(var(--muted-foreground));
}

.inline-dialog-code {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  font-family:
    ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.875rem;
  color: hsl(var(--foreground));
  background: hsl(var(--muted));
  border-radius: calc(var(--radius) - 2px);
}
</style>
