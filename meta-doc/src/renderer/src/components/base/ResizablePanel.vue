<template>
  <div 
    v-if="visible" 
    ref="panelRef" 
    class="resizable-panel" 
    :style="{
      background: backgroundColor,
      width: width + 'px',
      height: height + 'px',
      minWidth: minWidth + 'px',
      minHeight: minHeight + 'px',
      maxWidth: maxWidth ? maxWidth + 'px' : 'none',
      maxHeight: maxHeight ? maxHeight + 'px' : 'none',
      position: position,
      ...positionStyles
    }"
  >
    <!-- 顶部拖拽条 -->
    <div 
      v-if="enableTopResize"
      class="resize-handle resize-handle-top" 
      @mousedown.prevent="startResizing('top', $event)"
    ></div>
    
    <!-- 左侧拖拽条 -->
    <div 
      v-if="enableLeftResize"
      class="resize-handle resize-handle-left" 
      @mousedown.prevent="startResizing('left', $event)"
    ></div>
    
    <!-- 右侧拖拽条 -->
    <div 
      v-if="enableRightResize"
      class="resize-handle resize-handle-right" 
      @mousedown.prevent="startResizing('right', $event)"
    ></div>
    
    <!-- 底部拖拽条 -->
    <div 
      v-if="enableBottomResize"
      class="resize-handle resize-handle-bottom" 
      @mousedown.prevent="startResizing('bottom', $event)"
    ></div>

    <!-- 内容区域 -->
    <div class="panel-content" :style="{ padding: contentPadding + 'px' }">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

interface Props {
  /** 是否显示面板 */
  visible?: boolean
  /** 初始宽度 */
  initialWidth?: number
  /** 初始高度 */
  initialHeight?: number
  /** 最小宽度 */
  minWidth?: number
  /** 最小高度 */
  minHeight?: number
  /** 最大宽度 */
  maxWidth?: number
  /** 最大高度 */
  maxHeight?: number
  /** 背景色 */
  backgroundColor?: string
  /** 定位方式 */
  position?: 'fixed' | 'absolute' | 'relative'
  /** 顶部位置 */
  top?: number
  /** 左侧位置 */
  left?: number
  /** 右侧位置 */
  right?: number
  /** 底部位置 */
  bottom?: number
  /** 启用顶部调整 */
  enableTopResize?: boolean
  /** 启用左侧调整 */
  enableLeftResize?: boolean
  /** 启用右侧调整 */
  enableRightResize?: boolean
  /** 启用底部调整 */
  enableBottomResize?: boolean
  /** 内容区域内边距 */
  contentPadding?: number
}

const props = withDefaults(defineProps<Props>(), {
  visible: true,
  initialWidth: 300,
  initialHeight: 400,
  minWidth: 200,
  minHeight: 150,
  backgroundColor: '#ffffff',
  position: 'fixed',
  enableTopResize: true,
  enableLeftResize: true,
  enableRightResize: false,
  enableBottomResize: false,
  contentPadding: 10
})

const emit = defineEmits<{
  resize: [width: number, height: number]
}>()

// 响应式尺寸
const width = ref(props.initialWidth)
const height = ref(props.initialHeight)

// 拖拽状态
const resizing = ref(false)
const resizeDirection = ref<'top' | 'left' | 'right' | 'bottom' | null>(null)

// 拖拽起始位置和尺寸
let startX = 0
let startY = 0
let startWidth = 0
let startHeight = 0

// 计算定位样式
const positionStyles = computed(() => {
  const styles: Record<string, string> = {}
  
  if (props.top !== undefined) styles.top = props.top + 'px'
  if (props.left !== undefined) styles.left = props.left + 'px'
  if (props.right !== undefined) styles.right = props.right + 'px'
  if (props.bottom !== undefined) styles.bottom = props.bottom + 'px'
  
  return styles
})

// 开始拖拽调整大小
function startResizing(direction: 'top' | 'left' | 'right' | 'bottom', event: MouseEvent) {
  resizing.value = true
  resizeDirection.value = direction
  
  startX = event.clientX
  startY = event.clientY
  startWidth = width.value
  startHeight = height.value
  
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResizing)
  document.body.style.cursor = getCursor(direction)
  
  // 防止选择文本
  document.body.style.userSelect = 'none'
}

// 处理拖拽调整大小
function handleResize(event: MouseEvent) {
  if (!resizing.value || !resizeDirection.value) return
  
  const deltaX = event.clientX - startX
  const deltaY = event.clientY - startY
  
  switch (resizeDirection.value) {
    case 'top':
      const newHeight = Math.max(props.minWidth, startHeight - deltaY)
      if (!props.maxHeight || newHeight <= props.maxHeight) {
        height.value = newHeight
      }
      break
      
    case 'left':
      const newWidth = Math.max(props.minWidth, startWidth - deltaX)
      if (!props.maxWidth || newWidth <= props.maxWidth) {
        width.value = newWidth
      }
      break
      
    case 'right':
      const newWidthRight = Math.max(props.minWidth, startWidth + deltaX)
      if (!props.maxWidth || newWidthRight <= props.maxWidth) {
        width.value = newWidthRight
      }
      break
      
    case 'bottom':
      const newHeightBottom = Math.max(props.minHeight, startHeight + deltaY)
      if (!props.maxHeight || newHeightBottom <= props.maxHeight) {
        height.value = newHeightBottom
      }
      break
  }
}

// 停止拖拽调整大小
function stopResizing() {
  if (resizing.value) {
    resizing.value = false
    resizeDirection.value = null
    
    document.removeEventListener('mousemove', handleResize)
    document.removeEventListener('mouseup', stopResizing)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    
    // 发出调整大小事件
    emit('resize', width.value, height.value)
  }
}

// 获取调整大小的光标样式
function getCursor(direction: 'top' | 'left' | 'right' | 'bottom'): string {
  const cursorMap = {
    top: 'ns-resize',
    bottom: 'ns-resize',
    left: 'ew-resize',
    right: 'ew-resize'
  }
  return cursorMap[direction]
}

// 监听尺寸变化
watch([width, height], ([newWidth, newHeight]) => {
  emit('resize', newWidth, newHeight)
})

// 清理事件监听器
onUnmounted(() => {
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResizing)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
})
</script>

<style scoped>
.resizable-panel {
  border: 1px solid #cccccc44;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.resize-handle {
  position: absolute;
  z-index: 10;
  opacity: 0;
  transition: opacity 0.2s;
}

.resize-handle:hover {
  opacity: 0.6;
  background-color: #007bff;
}

.resize-handle-top {
  top: 0;
  left: 0;
  right: 0;
  height: 6px;
  cursor: ns-resize;
}

.resize-handle-left {
  top: 0;
  bottom: 0;
  left: 0;
  width: 6px;
  cursor: ew-resize;
}

.resize-handle-right {
  top: 0;
  bottom: 0;
  right: 0;
  width: 6px;
  cursor: ew-resize;
}

.resize-handle-bottom {
  bottom: 0;
  left: 0;
  right: 0;
  height: 6px;
  cursor: ns-resize;
}

.panel-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
