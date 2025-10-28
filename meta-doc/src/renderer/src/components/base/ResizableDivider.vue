<template>
  <div 
    class="resizable-divider" 
    :class="[
      `divider-${direction}`,
      { 'divider-resizing': isResizing }
    ]"
    :style="dividerStyle"
    @mousedown.prevent="startResize"
  >
    <slot>
      <!-- 默认分割线样式 -->
      <div class="divider-handle"></div>
    </slot>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'

interface Props {
  /** 拖拽方向 */
  direction: 'horizontal' | 'vertical'
  /** 分割线尺寸 */
  size?: number
  /** 背景色 */
  backgroundColor?: string
  /** 悬停时的背景色 */
  hoverColor?: string
  /** 最小值限制 */
  minValue?: number
  /** 最大值限制 */
  maxValue?: number
  /** 是否反向计算（如从右到左） */
  reverse?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  direction: 'vertical',
  size: 5,
  backgroundColor: '#55555555',
  hoverColor: '#007bff',
  minValue: 100,
  maxValue: 1000,
  reverse: false
})

const emit = defineEmits<{
  resize: [delta: number, event: MouseEvent]
  resizeStart: [event: MouseEvent]
  resizeEnd: [event: MouseEvent]
}>()

// 拖拽状态
const isResizing = ref(false)

// 起始位置
let startX = 0
let startY = 0

// 分割线样式
const dividerStyle = computed(() => {
  const baseStyle = {
    backgroundColor: isResizing.value ? props.hoverColor : props.backgroundColor,
    cursor: props.direction === 'horizontal' ? 'row-resize' : 'col-resize'
  }

  if (props.direction === 'horizontal') {
    return {
      ...baseStyle,
      height: props.size + 'px',
      width: '100%'
    }
  } else {
    return {
      ...baseStyle,
      width: props.size + 'px',
      height: '100%'
    }
  }
})

// 开始拖拽
function startResize(event: MouseEvent) {
  isResizing.value = true
  startX = event.clientX
  startY = event.clientY
  
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = props.direction === 'horizontal' ? 'row-resize' : 'col-resize'
  document.body.style.userSelect = 'none'
  
  emit('resizeStart', event)
}

// 处理拖拽
function handleResize(event: MouseEvent) {
  if (!isResizing.value) return
  
  let delta: number
  
  if (props.direction === 'horizontal') {
    delta = event.clientY - startY
  } else {
    delta = event.clientX - startX
  }
  
  // 如果是反向计算
  if (props.reverse) {
    delta = -delta
  }
  
  emit('resize', delta, event)
}

// 停止拖拽
function stopResize(event: MouseEvent) {
  if (isResizing.value) {
    isResizing.value = false
    
    document.removeEventListener('mousemove', handleResize)
    document.removeEventListener('mouseup', stopResize)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    
    emit('resizeEnd', event)
  }
}

// 清理事件监听器
onUnmounted(() => {
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
})
</script>

<style scoped>
.resizable-divider {
  position: relative;
  transition: background-color 0.2s ease;
  z-index: 10;
}

.divider-horizontal {
  cursor: row-resize;
}

.divider-vertical {
  cursor: col-resize;
}

.divider-resizing {
  transition: none;
}

.divider-handle {
  width: 100%;
  height: 100%;
  position: relative;
}

/* 悬停效果 */
.resizable-divider:hover {
  opacity: 0.8;
}

.resizable-divider:hover .divider-handle::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
}

.divider-horizontal:hover .divider-handle::after {
  width: 40px;
  height: 2px;
}

.divider-vertical:hover .divider-handle::after {
  width: 2px;
  height: 40px;
}
</style>
