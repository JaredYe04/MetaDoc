<template>
  <div class="resizable-container" :class="containerClass" ref="containerRef">
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
        v-if="collapsible"
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

    <!-- 展开按钮（当折叠时显示） -->
    <div 
      v-if="showSidebar && isCollapsed && collapsible"
      class="expand-button"
      :class="expandButtonClass"
      @click="toggleCollapse"
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

// 容器引用
const containerRef = ref<HTMLElement | null>(null)

// 切换折叠状态
function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
  emit('collapse', isCollapsed.value)
}

// 监听窗口大小变化，自动折叠
let resizeObserver: ResizeObserver | null = null

onMounted(async () => {
  await nextTick()
  if (props.collapsible && props.autoCollapseWidth > 0 && containerRef.value) {
    const parentContainer = containerRef.value.parentElement
    if (parentContainer) {
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
    }
  }
})

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
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

/* 展开按钮样式 */
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
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

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
