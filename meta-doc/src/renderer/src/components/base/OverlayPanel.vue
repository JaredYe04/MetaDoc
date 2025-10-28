<template>
  <div 
    v-show="visible" 
    class="overlay-panel" 
    :class="positionClass"
    :style="panelStyle"
  >
    <!-- 调整大小的分割线 -->
    <ResizableDivider
      :direction="resizeDirection"
      :size="dividerSize"
      @resize="handleResize"
      @resize-start="onResizeStart"
      @resize-end="onResizeEnd"
    />
    
    <!-- 面板内容 -->
    <div class="panel-content" :style="contentStyle">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import ResizableDivider from './ResizableDivider.vue'

interface Props {
  /** 是否显示面板 */
  visible?: boolean
  /** 面板位置 */
  position: 'top' | 'bottom' | 'left' | 'right'
  /** 初始尺寸 */
  initialSize?: number
  /** 最小尺寸 */
  minSize?: number
  /** 最大尺寸 */
  maxSize?: number
  /** 分割线尺寸 */
  dividerSize?: number
  /** 背景色 */
  backgroundColor?: string
  /** 阴影 */
  boxShadow?: string
  /** z-index */
  zIndex?: number
}

const props = withDefaults(defineProps<Props>(), {
  visible: true,
  position: 'bottom',
  initialSize: 200,
  minSize: 50,
  maxSize: 600,
  dividerSize: 2,
  backgroundColor: '#ffffff',
  boxShadow: '0 -2px 6px rgba(0,0,0,0.3)',
  zIndex: 10
})

const emit = defineEmits<{
  resize: [size: number, event: MouseEvent]
  resizeStart: [event: MouseEvent]
  resizeEnd: [event: MouseEvent]
}>()

// 当前面板尺寸
const panelSize = ref(props.initialSize)

// 位置相关的类
const positionClass = computed(() => `panel-${props.position}`)

// 调整方向
const resizeDirection = computed(() => {
  return props.position === 'top' || props.position === 'bottom' 
    ? 'horizontal' 
    : 'vertical'
})

// 面板样式
const panelStyle = computed(() => {
  const baseStyle = {
    backgroundColor: props.backgroundColor,
    boxShadow: props.boxShadow,
    zIndex: props.zIndex
  }

  // 根据位置设置尺寸
  if (props.position === 'top' || props.position === 'bottom') {
    return {
      ...baseStyle,
      height: panelSize.value + 'px',
      minHeight: props.minSize + 'px',
      maxHeight: props.maxSize + 'px'
    }
  } else {
    return {
      ...baseStyle,
      width: panelSize.value + 'px',
      minWidth: props.minSize + 'px',
      maxWidth: props.maxSize + 'px'
    }
  }
})

// 内容区域样式
const contentStyle = computed(() => ({
  flex: 1,
  overflow: 'auto',
  backgroundColor: props.backgroundColor
}))

// 处理尺寸调整
function handleResize(delta: number, event: MouseEvent) {
  let newSize = panelSize.value

  // 根据位置计算新尺寸
  if (props.position === 'bottom' || props.position === 'right') {
    newSize = panelSize.value - delta
  } else {
    newSize = panelSize.value + delta
  }

  // 应用尺寸限制
  newSize = Math.max(props.minSize, Math.min(props.maxSize, newSize))
  panelSize.value = newSize

  emit('resize', newSize, event)
}

// 调整开始
function onResizeStart(event: MouseEvent) {
  emit('resizeStart', event)
}

// 调整结束
function onResizeEnd(event: MouseEvent) {
  emit('resizeEnd', event)
}

// 暴露方法
defineExpose({
  setSize: (size: number) => {
    panelSize.value = Math.max(props.minSize, Math.min(props.maxSize, size))
  },
  getSize: () => panelSize.value
})
</script>

<style scoped>
.overlay-panel {
  position: absolute;
  display: flex;
  background-color: #ffffff;
}

.panel-top {
  top: 0;
  left: 0;
  right: 0;
  flex-direction: column;
}

.panel-bottom {
  bottom: 0;
  left: 0;
  right: 0;
  flex-direction: column;
}

.panel-left {
  top: 0;
  bottom: 0;
  left: 0;
  flex-direction: row;
}

.panel-right {
  top: 0;
  bottom: 0;
  right: 0;
  flex-direction: row;
}

.panel-content {
  display: flex;
  flex-direction: column;
}
</style>
