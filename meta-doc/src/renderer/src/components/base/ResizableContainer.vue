<template>
  <div class="resizable-container" :class="containerClass">
    <!-- 主要内容区域 -->
    <div 
      class="main-content" 
      :class="mainContentClass"
      :style="mainContentStyle"
    >
      <slot name="main"></slot>
    </div>

    <!-- 可调整大小的分割线 -->
    <ResizableDivider
      v-if="showDivider"
      :direction="direction"
      :size="dividerSize"
      :reverse="reverse"
      :min-value="minSize"
      :max-value="maxSize"
      @resize="handleResize"
      @resize-start="handleResizeStart"
      @resize-end="handleResizeEnd"
    />

    <!-- 侧边内容区域 -->
    <div 
      v-if="showSidebar"
      class="sidebar-content" 
      :class="sidebarClass"
      :style="sidebarStyle"
    >
      <slot name="sidebar"></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import ResizableDivider from './ResizableDivider.vue'

interface Props {
  /** 布局方向 */
  direction: 'horizontal' | 'vertical'
  /** 初始侧边栏尺寸 */
  initialSidebarSize?: number
  /** 最小尺寸 */
  minSize?: number
  /** 最大尺寸 */
  maxSize?: number
  /** 分割线尺寸 */
  dividerSize?: number
  /** 是否显示侧边栏 */
  showSidebar?: boolean
  /** 是否反向计算 */
  reverse?: boolean
  /** 侧边栏位置 */
  sidebarPosition?: 'start' | 'end'
}

const props = withDefaults(defineProps<Props>(), {
  direction: 'horizontal',
  initialSidebarSize: 300,
  minSize: 100,
  maxSize: 800,
  dividerSize: 5,
  showSidebar: true,
  reverse: false,
  sidebarPosition: 'end'
})

const emit = defineEmits<{
  resize: [size: number, event: MouseEvent]
  resizeStart: [event: MouseEvent]
  resizeEnd: [event: MouseEvent]
}>()

// 当前侧边栏尺寸
const sidebarSize = ref(props.initialSidebarSize)

// 是否显示分割线
const showDivider = computed(() => props.showSidebar)

// 容器类名
const containerClass = computed(() => ({
  'horizontal-layout': props.direction === 'horizontal',
  'vertical-layout': props.direction === 'vertical',
  'sidebar-start': props.sidebarPosition === 'start',
  'sidebar-end': props.sidebarPosition === 'end'
}))

// 主内容区样式
const mainContentClass = computed(() => ({
  'flex-column': props.direction === 'horizontal',
  'flex-row': props.direction === 'vertical'
}))

const mainContentStyle = computed(() => {
  if (!props.showSidebar) return { flex: '1' }
  
  return {
    flex: '1',
    overflow: 'hidden'
  }
})

// 侧边栏类名
const sidebarClass = computed(() => ({
  'sidebar-horizontal': props.direction === 'horizontal',
  'sidebar-vertical': props.direction === 'vertical'
}))

// 侧边栏样式
const sidebarStyle = computed(() => {
  const size = sidebarSize.value + 'px'
  
  if (props.direction === 'horizontal') {
    return {
      height: size,
      minHeight: props.minSize + 'px',
      maxHeight: props.maxSize + 'px'
    }
  } else {
    return {
      width: size,
      minWidth: props.minSize + 'px',
      maxWidth: props.maxSize + 'px'
    }
  }
})

// 处理尺寸调整
function handleResize(delta: number, event: MouseEvent) {
  let newSize: number
  
  if (props.reverse) {
    newSize = sidebarSize.value + delta
  } else {
    newSize = sidebarSize.value - delta
  }
  
  // 应用尺寸限制
  newSize = Math.max(props.minSize, Math.min(props.maxSize, newSize))
  sidebarSize.value = newSize
  
  emit('resize', newSize, event)
}

// 处理调整开始
function handleResizeStart(event: MouseEvent) {
  emit('resizeStart', event)
}

// 处理调整结束
function handleResizeEnd(event: MouseEvent) {
  emit('resizeEnd', event)
}

// 暴露方法供外部使用
defineExpose({
  setSidebarSize: (size: number) => {
    sidebarSize.value = Math.max(props.minSize, Math.min(props.maxSize, size))
  },
  getSidebarSize: () => sidebarSize.value
})
</script>

<style scoped>
.resizable-container {
  display: flex;
  width: 100%;
  height: 100%;
  position: relative;
}

.horizontal-layout {
  flex-direction: column;
}

.vertical-layout {
  flex-direction: row;
}

.sidebar-start.horizontal-layout {
  flex-direction: column;
}

.sidebar-end.horizontal-layout {
  flex-direction: column;
}

.sidebar-start.vertical-layout {
  flex-direction: row;
}

.sidebar-end.vertical-layout {
  flex-direction: row;
}

.main-content {
  display: flex;
  overflow: hidden;
}

.sidebar-content {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-horizontal {
  width: 100%;
}

.sidebar-vertical {
  height: 100%;
}
</style>
