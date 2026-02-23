<script setup lang="ts">
/**
 * DialogContainer - 用于在文档中内嵌展示任意 Dialog 组件
 *
 * 解决 Dialog 组件使用 DialogPortal/Teleport 跳出文档流的问题
 * 通过重写 CSS 定位和提供局部上下文，强制 Dialog 渲染在容器内
 */
import { ref, computed, watch, onMounted, nextTick, provide } from 'vue'

interface Props {
  /** 控制 Dialog 是否显示 */
  open?: boolean
  /** 容器宽度 */
  width?: string
  /** 容器高度 */
  height?: string
  /** 是否显示遮罩层 */
  showOverlay?: boolean
  /** 自定义类名 */
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  open: false,
  width: '100%',
  height: '400px',
  showOverlay: true
})

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

// 容器引用
const containerRef = ref<HTMLDivElement>()
const dialogWrapperRef = ref<HTMLDivElement>()

// 内部状态
const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value)
})

// 提供上下文给子组件
provide('dialogDemoContainer', {
  getContainer: () => containerRef.value,
  isDemoMode: true
})

// 拦截全局点击事件，阻止事件冒泡到 document.body
function handleContainerClick(event: MouseEvent) {
  event.stopPropagation()
}

// 关闭 dialog
function close() {
  isOpen.value = false
}

// 当 Dialog 打开时，调整样式以确保它在容器内正确显示
watch(
  () => props.open,
  async (newVal) => {
    if (newVal) {
      await nextTick()
      // 查找并调整任何使用 fixed 定位的元素
      if (containerRef.value) {
        const fixedElements = containerRef.value.querySelectorAll('[class*="fixed"]')
        fixedElements.forEach((el) => {
          const htmlEl = el as HTMLElement
          // 只在容器内强制 relative 定位
          if (
            htmlEl.classList.contains('dialog-overlay') ||
            htmlEl.hasAttribute('data-radix-dialog-overlay')
          ) {
            // 遮罩层保持覆盖整个容器
            htmlEl.style.position = 'absolute'
            htmlEl.style.inset = '0'
          }
        })
      }
    }
  }
)
</script>

<template>
  <div
    ref="containerRef"
    class="dialog-container"
    :class="props.class"
    :style="{ width, height }"
    @click="handleContainerClick"
  >
    <!-- 遮罩层 - 仅覆盖容器 -->
    <transition name="fade">
      <div v-if="showOverlay && isOpen" class="dialog-container-overlay" @click="close" />
    </transition>

    <!-- Dialog 内容区域 -->
    <div v-if="isOpen" ref="dialogWrapperRef" class="dialog-container-content">
      <slot :close="close" :open="isOpen">
        <div class="dialog-container-placeholder">
          <h4>Dialog 内容区域</h4>
          <p>通过 slot 传入 Dialog 组件的内容</p>
          <button @click="close">关闭</button>
        </div>
      </slot>
    </div>

    <!-- 触发按钮 - 当 Dialog 关闭时显示 -->
    <div v-if="!isOpen" class="dialog-container-trigger">
      <slot name="trigger" :open="() => (isOpen = true)">
        <button class="dialog-container-trigger-btn" @click="isOpen = true">打开 Dialog</button>
      </slot>
    </div>
  </div>
</template>

<style scoped>
.dialog-container {
  position: relative;
  border: 2px dashed hsl(var(--border));
  border-radius: var(--radius);
  background: hsl(var(--muted) / 0.2);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.dialog-container-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
  z-index: 10;
}

.dialog-container-content {
  position: relative;
  z-index: 20;
  width: 90%;
  max-width: 500px;
  max-height: 90%;
  background: hsl(var(--background));
  border-radius: var(--radius);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  overflow: auto;
}

.dialog-container-trigger {
  z-index: 5;
}

.dialog-container-trigger-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem 1.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: hsl(var(--primary-foreground));
  background-color: hsl(var(--primary));
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  transition: opacity 0.2s;
}

.dialog-container-trigger-btn:hover {
  opacity: 0.9;
}

.dialog-container-placeholder {
  padding: 2rem;
  text-align: center;
}

.dialog-container-placeholder h4 {
  margin: 0 0 0.5rem;
  font-size: 1.125rem;
  font-weight: 600;
}

.dialog-container-placeholder p {
  margin: 0 0 1rem;
  color: hsl(var(--muted-foreground));
}

.dialog-container-placeholder button {
  padding: 0.5rem 1rem;
  background: hsl(var(--muted));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  cursor: pointer;
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 覆盖全局 Dialog 样式，强制在容器内渲染 */
:deep(.dialog-overlay),
:deep([data-radix-dialog-overlay]) {
  position: absolute !important;
  inset: 0 !important;
}

:deep(.dialog-content),
:deep([data-radix-dialog-content]) {
  position: relative !important;
  top: auto !important;
  left: auto !important;
  transform: none !important;
  max-height: 100% !important;
}

:deep(.fixed) {
  position: absolute !important;
}

:deep(.inset-0) {
  top: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  left: 0 !important;
}

:deep(.left-\[50\%\]),
:deep(.left-1\/2) {
  left: auto !important;
}

:deep(.top-\[50\%\]),
:deep(.top-1\/2) {
  top: auto !important;
}

:deep(.translate-x-\[-50\%\]),
:deep(.-translate-x-1\/2) {
  transform: translateX(0) !important;
}

:deep(.translate-y-\[-50\%\]),
:deep(.-translate-y-1\/2) {
  transform: translateY(0) !important;
}

:deep(.z-\[9999\]),
:deep(.z-\[10000\]),
:deep(.z-\[10001\]) {
  z-index: auto !important;
}
</style>
