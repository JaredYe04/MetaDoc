<template>
  <div 
    class="resizable-container" 
    :class="containerClass" 
    ref="containerRef"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
  >
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
      v-if="showDivider && !isCollapsed"
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
      v-if="showSidebar && !isCollapsed"
      class="sidebar-content" 
      :class="sidebarClass"
      :style="sidebarStyle"
    >
      <!-- 折叠按钮（紧贴分割线左侧，当展开时显示） -->
      <div 
        v-if="collapsible && showCollapseButton"
        class="collapse-button"
        :class="collapseButtonClass"
        @click="toggleCollapse"
        :title="collapseButtonTitle"
      >
        <el-icon><ArrowLeft v-if="sidebarPosition === 'start'" /><ArrowRight v-else /></el-icon>
      </div>
      <div class="sidebar-inner">
        <slot name="sidebar"></slot>
      </div>
    </div>

    <!-- 展开按钮（当折叠时显示，仅在 hover 时显示） -->
    <div 
      v-if="showSidebar && isCollapsed && collapsible && showCollapseButton"
      class="expand-button"
      :class="[expandButtonClass, { 'expand-button-visible': showExpandButton }]"
      @click="toggleCollapse"
      @mouseenter="handleExpandButtonEnter"
      @mouseleave="handleExpandButtonLeave"
      :title="expandButtonTitle"
    >
      <el-icon><ArrowRight v-if="sidebarPosition === 'start'" /><ArrowLeft v-else /></el-icon>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { ElIcon } from 'element-plus'
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
  /** 是否可折叠 */
  collapsible?: boolean
  /** 是否显示折叠按钮（当 collapsible 为 true 时，可以通过此参数控制是否显示按钮） */
  showCollapseButton?: boolean
  /** 自动折叠的宽度阈值（当窗口宽度小于此值时自动折叠） */
  autoCollapseWidth?: number
  /** 折叠按钮标题 */
  collapseButtonTitle?: string
  /** 展开按钮标题 */
  expandButtonTitle?: string
}

const props = withDefaults(defineProps<Props>(), {
  direction: 'horizontal',
  initialSidebarSize: 300,
  minSize: 100,
  maxSize: 800,
  dividerSize: 5,
  showSidebar: true,
  reverse: false,
  sidebarPosition: 'end',
  collapsible: false,
  showCollapseButton: true,
  autoCollapseWidth: 0,
  collapseButtonTitle: '折叠',
  expandButtonTitle: '展开'
})

const emit = defineEmits<{
  resize: [size: number, event: MouseEvent]
  resizeStart: [event: MouseEvent]
  resizeEnd: [event: MouseEvent]
  collapse: [collapsed: boolean]
}>()

// 当前侧边栏尺寸
const sidebarSize = ref(props.initialSidebarSize)
const startSidebarSize = ref(props.initialSidebarSize)

// 折叠状态
const isCollapsed = ref(false)

// 是否显示展开按钮
const showExpandButton = ref(false)

// 是否显示分割线
const showDivider = computed(() => props.showSidebar && !isCollapsed.value)

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
  if (isCollapsed.value) {
    return { display: 'none' }
  }
  
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

// 折叠按钮类名
const collapseButtonClass = computed(() => {
  const base = 'collapse-button'
  if (props.direction === 'horizontal') {
    return `${base} collapse-button-horizontal`
  } else {
    return `${base} collapse-button-vertical ${props.sidebarPosition === 'start' ? 'collapse-button-left' : 'collapse-button-right'}`
  }
})

// 展开按钮类名
const expandButtonClass = computed(() => {
  const base = 'expand-button'
  if (props.direction === 'horizontal') {
    return `${base} expand-button-horizontal`
  } else {
    return `${base} expand-button-vertical ${props.sidebarPosition === 'start' ? 'expand-button-left' : 'expand-button-right'}`
  }
})

// 处理鼠标移动，检测是否在边缘区域
function handleMouseMove(event: MouseEvent) {
  if (!isCollapsed.value || !props.collapsible || !props.showCollapseButton) {
    showExpandButton.value = false
    return
  }
  
  const container = containerRef.value
  if (!container) return
  
  const rect = container.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  const edgeThreshold = 30 // 边缘检测阈值（像素）
  
  // 检测是否在边缘区域
  let isInEdgeZone = false
  
  if (props.direction === 'vertical') {
    // 垂直布局：检测左右边缘
    if (props.sidebarPosition === 'end') {
      // 侧边栏在右侧，检测右边缘
      isInEdgeZone = x >= rect.width - edgeThreshold
    } else {
      // 侧边栏在左侧，检测左边缘
      isInEdgeZone = x <= edgeThreshold
    }
  } else {
    // 水平布局：检测上下边缘
    if (props.sidebarPosition === 'end') {
      // 侧边栏在下侧，检测下边缘
      isInEdgeZone = y >= rect.height - edgeThreshold
    } else {
      // 侧边栏在上侧，检测上边缘
      isInEdgeZone = y <= edgeThreshold
    }
  }
  
  showExpandButton.value = isInEdgeZone
}

// 处理鼠标离开容器
function handleMouseLeave() {
  // 延迟隐藏，给按钮 hover 留出时间
  setTimeout(() => {
    if (!showExpandButton.value) return
    
    // 检查鼠标是否在按钮上
    const container = containerRef.value
    if (container) {
      const expandButton = container.querySelector('.expand-button') as HTMLElement
      if (expandButton) {
        const buttonRect = expandButton.getBoundingClientRect()
        const mouseX = (window as any).lastMouseX || 0
        const mouseY = (window as any).lastMouseY || 0
        
        // 如果鼠标不在按钮上，才隐藏
        if (
          mouseX < buttonRect.left ||
          mouseX > buttonRect.right ||
          mouseY < buttonRect.top ||
          mouseY > buttonRect.bottom
        ) {
          showExpandButton.value = false
        }
      } else {
        showExpandButton.value = false
      }
    }
  }, 100)
}

// 处理展开按钮鼠标进入
function handleExpandButtonEnter() {
  showExpandButton.value = true
}

// 处理展开按钮鼠标离开
function handleExpandButtonLeave() {
  // 延迟隐藏，检查鼠标是否移回边缘区域
  setTimeout(() => {
    const container = containerRef.value
    if (container) {
      const rect = container.getBoundingClientRect()
      const mouseX = (window as any).lastMouseX || 0
      const mouseY = (window as any).lastMouseY || 0
      
      // 检查鼠标是否还在容器内
      if (
        mouseX < rect.left ||
        mouseX > rect.right ||
        mouseY < rect.top ||
        mouseY > rect.bottom
      ) {
        showExpandButton.value = false
        return
      }
      
      // 检查是否还在边缘区域
      const x = mouseX - rect.left
      const y = mouseY - rect.top
      const edgeThreshold = 30
      
      let isInEdgeZone = false
      if (props.direction === 'vertical') {
        if (props.sidebarPosition === 'end') {
          isInEdgeZone = x >= rect.width - edgeThreshold
        } else {
          isInEdgeZone = x <= edgeThreshold
        }
      } else {
        if (props.sidebarPosition === 'end') {
          isInEdgeZone = y >= rect.height - edgeThreshold
        } else {
          isInEdgeZone = y <= edgeThreshold
        }
      }
      
      if (!isInEdgeZone) {
        showExpandButton.value = false
      }
    }
  }, 100)
}

// 容器引用
const containerRef = ref<HTMLElement | null>(null)

// 切换折叠状态
function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
  emit('collapse', isCollapsed.value)
}

// 监听窗口大小变化，自动折叠
let resizeObserver: ResizeObserver | null = null

// 全局鼠标移动处理函数引用
let handleGlobalMouseMove: ((event: MouseEvent) => void) | null = null

onMounted(async () => {
  await nextTick()
  if (props.collapsible && props.autoCollapseWidth > 0 && containerRef.value) {
    const parentContainer = containerRef.value.parentElement
    if (parentContainer) {
      // 检查并折叠的函数
      const checkAndCollapse = () => {
        const width = parentContainer.clientWidth || parentContainer.getBoundingClientRect().width
        if (width < props.autoCollapseWidth && !isCollapsed.value) {
          isCollapsed.value = true
          emit('collapse', true)
        }
      }
      
      // 设置 ResizeObserver 监听后续变化
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const width = entry.contentRect.width
          if (width < props.autoCollapseWidth && !isCollapsed.value) {
            isCollapsed.value = true
            emit('collapse', true)
          }
        }
      })
      resizeObserver.observe(parentContainer)
      
      // 等待 DOM 完全渲染后立即检查一次初始宽度
      // 使用 requestAnimationFrame 确保在下一帧渲染后检查
      requestAnimationFrame(() => {
        // 再等待一个 nextTick 确保所有子组件都已挂载
        nextTick(() => {
          checkAndCollapse()
        })
      })
    }
  }
  
  // 监听全局鼠标移动，记录鼠标位置
  handleGlobalMouseMove = (event: MouseEvent) => {
    ;(window as any).lastMouseX = event.clientX
    ;(window as any).lastMouseY = event.clientY
  }
  window.addEventListener('mousemove', handleGlobalMouseMove)
})

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  if (handleGlobalMouseMove) {
    window.removeEventListener('mousemove', handleGlobalMouseMove)
    handleGlobalMouseMove = null
  }
})

// 处理尺寸调整
function handleResize(delta: number, event: MouseEvent) {
  const directionSign = props.reverse ? 1 : -1
  let newSize = startSidebarSize.value + directionSign * delta

  newSize = Math.max(props.minSize, Math.min(props.maxSize, newSize))
  sidebarSize.value = newSize

  emit('resize', newSize, event)
}

// 处理调整开始
function handleResizeStart(event: MouseEvent) {
  startSidebarSize.value = sidebarSize.value
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
    startSidebarSize.value = sidebarSize.value
  },
  getSidebarSize: () => sidebarSize.value,
  setCollapsed: (collapsed: boolean) => {
    isCollapsed.value = collapsed
    emit('collapse', collapsed)
  },
  getCollapsed: () => isCollapsed.value,
  toggleCollapse
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
  overflow: visible;
  position: relative;
}

.sidebar-inner {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.sidebar-horizontal {
  width: 100%;
}

.sidebar-vertical {
  height: 100%;
}

/* 折叠按钮样式 */
.collapse-button {
  position: absolute;
  z-index: 100;
  cursor: pointer;
  background-color: var(--el-bg-color-page, #f5f7fa);
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  pointer-events: auto;
}

.collapse-button:hover {
  background-color: var(--el-bg-color, #ffffff);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.collapse-button-vertical {
  width: 24px;
  height: 40px;
  top: 50%;
  transform: translateY(-50%);
}

/* 当侧边栏在左侧时，按钮在分割线右侧（相对于侧边栏） */
.collapse-button-left {
  left: 100%;
  margin-left: -12px;
}

/* 当侧边栏在右侧时，按钮在分割线左侧（相对于侧边栏，紧贴分割线） */
.collapse-button-right {
  left: -12px;
}

/* 展开按钮样式 - 默认隐藏 */
.expand-button {
  position: absolute;
  z-index: 10;
  cursor: pointer;
  background-color: var(--el-bg-color-page, #f5f7fa);
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  transition: opacity 0.2s, visibility 0.2s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

/* 当按钮可见时 */
.expand-button.expand-button-visible {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}

/* 当 hover 到按钮本身时 */
.expand-button:hover {
  background-color: var(--el-bg-color, #ffffff);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.expand-button-vertical {
  width: 24px;
  height: 40px;
  top: 50%;
  transform: translateY(-50%);
}

.expand-button-left {
  left: 0;
}

.expand-button-right {
  right: 0;
}
</style>
