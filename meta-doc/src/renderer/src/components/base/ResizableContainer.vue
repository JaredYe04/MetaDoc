<template>
  <div
    class="resizable-container"
    :class="containerClass"
    :style="seamlessDivider ? { '--seamless-divider-half': dividerSize / 2 + 'px' } : undefined"
    ref="containerRef"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
  >
    <!-- 主要内容区域 -->
    <div class="main-content" :class="mainContentClass" :style="mainContentStyle">
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
    >
      <!-- 折叠按钮（在分割线上显示，仅在鼠标靠近 divider 中心时显示） -->
      <div
        v-if="collapsible && showCollapseButton"
        class="collapse-button"
        :class="[collapseButtonClass, { 'collapse-button-visible': showCollapseButtonHover }]"
        @click.stop="toggleCollapse"
        @mouseenter="handleCollapseButtonEnter"
        @mouseleave="handleCollapseButtonLeave"
        :title="resolvedCollapseButtonTitle"
      >
        <el-icon
          ><ArrowLeft v-if="sidebarOnLeft" /><ArrowRight
            v-else-if="sidebarPosition === 'start'" /><ArrowLeft v-else
        /></el-icon>
      </div>
    </ResizableDivider>

    <!-- 侧边内容区域（未折叠时显示，或折叠且 collapsedWidth>0 时显示为窄条） -->
    <div
      v-if="showSidebar && (!isCollapsed || collapsedWidth > 0)"
      class="sidebar-content"
      :class="[sidebarClass, { 'sidebar-collapsed-narrow': isCollapsed && collapsedWidth > 0 }]"
      :style="sidebarStyle"
    >
      <div class="sidebar-inner">
        <slot name="sidebar"></slot>
      </div>
    </div>

    <!-- 展开按钮（当折叠时显示，仅在 hover 时显示） -->
    <div
      v-if="showSidebar && isCollapsed && collapsible && showCollapseButton"
      class="expand-button"
      :class="[expandButtonClass, { 'expand-button-visible': showExpandButton }]"
      :style="expandButtonStyle"
      @click="toggleCollapse"
      @mouseenter="handleExpandButtonEnter"
      @mouseleave="handleExpandButtonLeave"
      :title="resolvedExpandButtonTitle"
    >
      <el-icon
        ><ArrowRight v-if="sidebarOnLeft" /><ArrowLeft
          v-else-if="sidebarPosition === 'start'" /><ArrowRight v-else
      /></el-icon>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { ElIcon } from 'element-plus'
import ResizableDivider from './ResizableDivider.vue'

const { t } = useI18n()

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
  /** 折叠时的侧边栏宽度（>0 时折叠为窄条而不完全隐藏；0 则折叠时完全隐藏侧边栏） */
  collapsedWidth?: number
  /** 是否将侧边栏放在左侧（仅 vertical + sidebarPosition start 时有效；false 时保持 DOM 顺序：主内容左、侧边栏右） */
  sidebarOnLeft?: boolean
  /** localStorage 持久化 key，设置后侧边栏尺寸和折叠状态会自动保存/恢复 */
  storageKey?: string
  /** 无缝分割线模式：透明背景 + 负边距重叠，使分割线默认不可见，仅 hover 时显示 */
  seamlessDivider?: boolean
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
  collapseButtonTitle: undefined,
  expandButtonTitle: undefined,
  collapsedWidth: 0,
  sidebarOnLeft: false,
  storageKey: undefined,
  seamlessDivider: false
})

const emit = defineEmits<{
  resize: [size: number, event: MouseEvent]
  resizeStart: [event: MouseEvent]
  resizeEnd: [event: MouseEvent]
  collapse: [collapsed: boolean]
}>()

// localStorage 持久化工具
const STORAGE_PREFIX = 'metadoc-resize-'

function loadFromStorage(): { size?: number; collapsed?: boolean } | null {
  if (!props.storageKey) return null
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + props.storageKey)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return null
}

function saveToStorage() {
  if (!props.storageKey) return
  try {
    localStorage.setItem(
      STORAGE_PREFIX + props.storageKey,
      JSON.stringify({
        size: sidebarSize.value,
        collapsed: isCollapsed.value
      })
    )
  } catch {
    /* ignore */
  }
}

// 从 localStorage 恢复初始值
const savedState = loadFromStorage()
const resolvedInitialSize = savedState?.size ?? props.initialSidebarSize

// 当前侧边栏尺寸
const sidebarSize = ref(resolvedInitialSize)
const startSidebarSize = ref(resolvedInitialSize)

// 父组件更新 initialSidebarSize 时同步到内部（用于按比例切换默认布局等）
watch(
  () => props.initialSidebarSize,
  (val) => {
    if (val != null && !Number.isNaN(val)) {
      const clamped = Math.max(props.minSize, Math.min(props.maxSize, val))
      sidebarSize.value = clamped
      startSidebarSize.value = clamped
    }
  }
)

// 折叠状态（从 localStorage 恢复，如果有的话）
const isCollapsed = ref(savedState?.collapsed ?? false)

// 是否显示展开按钮
const showExpandButton = ref(false)

// 按钮标题（使用计算属性支持国际化）
const resolvedCollapseButtonTitle = computed(() => {
  return props.collapseButtonTitle ?? t('resizableContainer.collapse')
})

const resolvedExpandButtonTitle = computed(() => {
  return props.expandButtonTitle ?? t('resizableContainer.expand')
})

// 是否显示折叠按钮（仅当鼠标靠近 divider 中心时为 true）
const showCollapseButtonHover = ref(false)

// 是否显示分割线（折叠且使用 collapsedWidth 时不显示）
const showDivider = computed(() => {
  if (!props.showSidebar || isCollapsed.value) return false
  return true
})

// 容器类名
const containerClass = computed(() => ({
  'horizontal-layout': props.direction === 'horizontal',
  'vertical-layout': props.direction === 'vertical',
  'sidebar-start': props.sidebarPosition === 'start',
  'sidebar-end': props.sidebarPosition === 'end',
  'sidebar-on-left':
    props.sidebarOnLeft && props.sidebarPosition === 'start' && props.direction === 'vertical',
  'seamless-divider-mode': props.seamlessDivider
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
  const collapsedNarrow = isCollapsed.value && props.collapsedWidth > 0
  if (isCollapsed.value && !collapsedNarrow) {
    return { display: 'none' }
  }

  const size = collapsedNarrow ? props.collapsedWidth : sidebarSize.value
  const sizePx = size + 'px'

  if (props.direction === 'horizontal') {
    return {
      height: sizePx,
      minHeight: collapsedNarrow ? sizePx : props.minSize + 'px',
      maxHeight: collapsedNarrow ? sizePx : props.maxSize + 'px'
    }
  } else {
    return {
      width: sizePx,
      minWidth: collapsedNarrow ? sizePx : props.minSize + 'px',
      maxWidth: collapsedNarrow ? sizePx : props.maxSize + 'px'
    }
  }
})

// 折叠按钮类名
const collapseButtonClass = computed(() => {
  const base = 'collapse-button'
  if (props.direction === 'horizontal') {
    return `${base} collapse-button-horizontal`
  } else {
    return `${base} collapse-button-vertical ${props.sidebarOnLeft ? 'collapse-button-left' : 'collapse-button-right'}`
  }
})

// 展开按钮类名
const expandButtonClass = computed(() => {
  const base = 'expand-button'
  if (props.direction === 'horizontal') {
    return `${base} expand-button-horizontal`
  } else {
    // 侧栏在左（sidebarOnLeft）：折叠后从窗口左缘展开；侧栏在右：从右缘展开
    const atLeftEdge = props.sidebarOnLeft
    return `${base} expand-button-vertical ${atLeftEdge ? 'expand-button-left' : 'expand-button-right'}`
  }
})

// 展开按钮样式（折叠且 collapsedWidth>0 时，按钮定位在窄条右边缘）
const expandButtonStyle = computed(() => {
  if (!isCollapsed.value || props.collapsedWidth <= 0) return {}
  if (props.direction === 'vertical' && props.sidebarPosition === 'start') {
    return { left: props.collapsedWidth + 'px', right: 'auto' }
  }
  if (props.direction === 'vertical' && props.sidebarPosition === 'end') {
    return { right: props.collapsedWidth + 'px', left: 'auto' }
  }
  return {}
})

// 检测鼠标是否在 divider 中心附近（用于折叠按钮的 hover 显示）
const DIVIDER_CENTER_THRESHOLD = 60 // 沿 divider 方向中心区域半宽（像素）
const DIVIDER_SIDE_THRESHOLD = 35 // 垂直于 divider 方向的半宽（像素）

// 只取本容器直接子元素中的 divider，避免嵌套时误匹配到内层 ResizableContainer 的 divider
function getOwnDividerElement(container: HTMLElement): HTMLElement | null {
  for (let i = 0; i < container.children.length; i++) {
    const el = container.children[i] as HTMLElement
    if (el.classList && el.classList.contains('resizable-divider')) return el
  }
  return null
}

function isMouseNearDividerCenter(mouseX: number, mouseY: number): boolean {
  if (isCollapsed.value) return false
  const container = containerRef.value
  if (!container) return false
  const divider = getOwnDividerElement(container)
  if (!divider) return false
  const dr = divider.getBoundingClientRect()
  const centerX = dr.left + dr.width / 2
  const centerY = dr.top + dr.height / 2
  if (props.direction === 'vertical') {
    // 垂直分割线：鼠标 X 靠近分割线，Y 靠近分割线垂直中心
    const xNear =
      mouseX >= dr.left - DIVIDER_SIDE_THRESHOLD && mouseX <= dr.right + DIVIDER_SIDE_THRESHOLD
    const yNear = Math.abs(mouseY - centerY) <= DIVIDER_CENTER_THRESHOLD
    // 仅当鼠标在「侧边栏一侧」时显示：start=侧边在左，要求鼠标在分割线左或分割条上；end=侧边在右，要求鼠标在分割线右或分割条上
    const dividerPad = Math.min(props.dividerSize || 5, DIVIDER_SIDE_THRESHOLD)
    const onSidebarSide =
      props.sidebarPosition === 'start'
        ? mouseX <= dr.right + dividerPad
        : mouseX >= dr.left - dividerPad
    return xNear && yNear && onSidebarSide
  } else {
    // 水平分割线：鼠标 Y 靠近分割线，X 靠近分割线水平中心
    const yNear =
      mouseY >= dr.top - DIVIDER_SIDE_THRESHOLD && mouseY <= dr.bottom + DIVIDER_SIDE_THRESHOLD
    const xNear = Math.abs(mouseX - centerX) <= DIVIDER_CENTER_THRESHOLD
    const dividerPad = Math.min(props.dividerSize || 5, DIVIDER_SIDE_THRESHOLD)
    const onSidebarSide =
      props.sidebarPosition === 'start'
        ? mouseY <= dr.bottom + dividerPad
        : mouseY >= dr.top - dividerPad
    return yNear && xNear && onSidebarSide
  }
}

// 计算展开按钮边缘 X（用于 hover 显示/隐藏）
function getExpandEdgeX(rect: DOMRect): number {
  if (props.direction !== 'vertical') return 0
  if (props.collapsedWidth > 0) {
    if (props.sidebarOnLeft) {
      return rect.left + props.collapsedWidth
    }
    return rect.right - props.collapsedWidth
  }
  if (props.sidebarOnLeft) {
    return rect.left
  }
  return rect.right
}

// 处理鼠标移动，检测是否在边缘区域（展开按钮）或 divider 中心附近（折叠按钮）
function handleMouseMove(event: MouseEvent) {
  const container = containerRef.value
  const windowX = event.clientX
  const windowY = event.clientY

  // 折叠按钮：未折叠时，仅当鼠标靠近 divider 中心时显示
  if (!isCollapsed.value && props.collapsible && props.showCollapseButton) {
    showCollapseButtonHover.value = isMouseNearDividerCenter(windowX, windowY)
  } else {
    showCollapseButtonHover.value = false
  }

  // 展开按钮：已折叠时，仅当鼠标在边缘区域时显示
  if (!isCollapsed.value || !props.collapsible || !props.showCollapseButton) {
    showExpandButton.value = false
    return
  }
  if (!container) return

  const rect = container.getBoundingClientRect()
  const edgeThreshold = 30 // 边缘检测阈值（像素）
  const edgeX = getExpandEdgeX(rect)

  let isInEdgeZone = false
  if (props.direction === 'vertical') {
    const x = windowX - edgeX
    isInEdgeZone = x >= -edgeThreshold && x <= edgeThreshold
  } else {
    if (props.sidebarPosition === 'end') {
      isInEdgeZone = windowY >= window.innerHeight - edgeThreshold
    } else {
      const y = windowY - rect.top
      isInEdgeZone = y >= -edgeThreshold && y <= edgeThreshold
    }
  }
  showExpandButton.value = isInEdgeZone
}

// 处理鼠标离开容器
function handleMouseLeave() {
  // 延迟隐藏，给按钮 hover 留出时间
  setTimeout(() => {
    const container = containerRef.value
    const mouseX = (window as any).lastMouseX || 0
    const mouseY = (window as any).lastMouseY || 0

    // 折叠按钮：若已显示，检查鼠标是否在按钮上或仍在 divider 中心附近
    if (showCollapseButtonHover.value && container) {
      const collapseButton = container.querySelector('.collapse-button') as HTMLElement
      const stillNearDivider = isMouseNearDividerCenter(mouseX, mouseY)
      const onCollapseButton =
        collapseButton &&
        mouseX >= collapseButton.getBoundingClientRect().left &&
        mouseX <= collapseButton.getBoundingClientRect().right &&
        mouseY >= collapseButton.getBoundingClientRect().top &&
        mouseY <= collapseButton.getBoundingClientRect().bottom
      if (!stillNearDivider && !onCollapseButton) {
        showCollapseButtonHover.value = false
      }
    }

    // 展开按钮：若已显示，检查鼠标是否在按钮上
    if (showExpandButton.value && container) {
      const expandButton = container.querySelector('.expand-button') as HTMLElement
      if (expandButton) {
        const buttonRect = expandButton.getBoundingClientRect()
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

// 处理折叠按钮鼠标进入
function handleCollapseButtonEnter() {
  showCollapseButtonHover.value = true
}

// 处理折叠按钮鼠标离开
function handleCollapseButtonLeave() {
  setTimeout(() => {
    const mouseX = (window as any).lastMouseX || 0
    const mouseY = (window as any).lastMouseY || 0
    if (!isMouseNearDividerCenter(mouseX, mouseY)) {
      showCollapseButtonHover.value = false
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
      const edgeThreshold = 30
      const edgeX = getExpandEdgeX(rect)

      let isInEdgeZone = false
      if (props.direction === 'vertical') {
        if (props.sidebarPosition === 'end') {
          // 侧边栏在右侧，展开按钮在左侧，检测容器左边缘
          const x = mouseX - rect.left
          isInEdgeZone = x >= -edgeThreshold && x <= edgeThreshold
        } else {
          const x = mouseX - edgeX
          isInEdgeZone = x >= -edgeThreshold && x <= edgeThreshold
        }
      } else {
        if (props.sidebarPosition === 'end') {
          isInEdgeZone = mouseY >= window.innerHeight - edgeThreshold
        } else {
          const y = mouseY - rect.top
          isInEdgeZone = y >= -edgeThreshold && y <= edgeThreshold
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
  saveToStorage()
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

  // 监听全局鼠标移动，记录鼠标位置并检测边缘/divider 中心
  handleGlobalMouseMove = (event: MouseEvent) => {
    ;(window as any).lastMouseX = event.clientX
    ;(window as any).lastMouseY = event.clientY

    // 未折叠时检测 divider 中心附近（折叠按钮）；已折叠时检测边缘（展开按钮）
    if (props.collapsible && props.showCollapseButton) {
      handleMouseMove(event)
    }
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
// 使用鼠标绝对位置计算宽度，使分割线严格跟随鼠标（在 min/max 内），避免 delta 与容器 scale/坐标系不一致导致变化幅度异常
function handleResize(delta: number, event: MouseEvent) {
  const container = containerRef.value
  if (!container) return

  let newSize: number
  if (props.direction === 'vertical') {
    const rect = container.getBoundingClientRect()
    const containerWidth = container.clientWidth
    const scale = rect.width > 0 ? containerWidth / rect.width : 1
    const sidebarOnRight =
      props.sidebarPosition === 'end' || (props.sidebarPosition === 'start' && !props.sidebarOnLeft)
    if (sidebarOnRight) {
      newSize = (rect.right - event.clientX) * scale
    } else {
      newSize = (event.clientX - rect.left) * scale
    }
  } else {
    const rect = container.getBoundingClientRect()
    const containerHeight = container.clientHeight
    const scale = rect.height > 0 ? containerHeight / rect.height : 1
    const sidebarOnBottom =
      props.sidebarPosition === 'end' || (props.sidebarPosition === 'start' && !props.sidebarOnLeft)
    if (sidebarOnBottom) {
      newSize = (rect.bottom - event.clientY) * scale
    } else {
      newSize = (event.clientY - rect.top) * scale
    }
  }

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
  saveToStorage()
  emit('resizeEnd', event)
}

// 暴露方法供外部使用
defineExpose({
  setSidebarSize: (size: number) => {
    sidebarSize.value = Math.max(props.minSize, Math.min(props.maxSize, size))
    startSidebarSize.value = sidebarSize.value
    saveToStorage()
  },
  getSidebarSize: () => sidebarSize.value,
  setCollapsed: (collapsed: boolean) => {
    isCollapsed.value = collapsed
    saveToStorage()
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

/* sidebar-end（如 session-content-panel）：main 左（order -1）、sidebar 右（order 1），保证 Monaco 左、报告右 */
.sidebar-end.vertical-layout .main-content {
  order: -1 !important;
}

.sidebar-end.vertical-layout .sidebar-content {
  order: 1 !important;
}

.sidebar-end.vertical-layout :deep(.resizable-divider) {
  order: 0;
}

.sidebar-end.vertical-layout {
  flex-direction: row;
}

/* sidebar-start 且未传 sidebarOnLeft 时，保持 DOM 顺序（main 左、sidebar 右） */
.sidebar-start.vertical-layout .main-content {
  order: 0;
}

.sidebar-start.vertical-layout .sidebar-content {
  order: 0;
}

.sidebar-start.vertical-layout :deep(.resizable-divider) {
  order: 0;
}

/* 仅当 sidebarOnLeft 为 true 时把侧边栏放左侧（仅 SessionList 传此 prop） */
.sidebar-on-left.vertical-layout .main-content {
  order: 1;
}

.sidebar-on-left.vertical-layout .sidebar-content {
  order: -1;
}

.sidebar-on-left.vertical-layout :deep(.resizable-divider) {
  order: 0;
}

/* min-width/min-height:0 避免 flex 子项 min-size:auto 随内容撑开，导致内层无法出现滚动 */
.main-content {
  display: flex;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
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

.sidebar-collapsed-narrow .sidebar-inner {
  overflow: hidden;
}

/* 折叠按钮样式 - 在 ResizableDivider 内部，默认隐藏，仅 hover 到 divider 中心附近时显示 */
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
  transition:
    opacity 0.2s,
    visibility 0.2s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.collapse-button.collapse-button-visible {
  opacity: 1;
  visibility: visible;
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

/* 当侧边栏在左侧时，按钮在分割线右侧（相对于分割线，紧贴分割线右侧） */
.collapse-button-left {
  right: -12px;
}

/* 当侧边栏在右侧时，按钮在分割线左侧（相对于分割线，紧贴分割线左侧） */
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
  transition:
    opacity 0.2s,
    visibility 0.2s;
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

/* === 无缝分割线模式 === */
/* 分割线默认透明，使用负边距使其重叠在相邻内容之上，消除可见间隙 */
.seamless-divider-mode :deep(.resizable-divider) {
  background-color: transparent !important;
}

.seamless-divider-mode.vertical-layout :deep(.resizable-divider) {
  margin-left: calc(-1 * var(--seamless-divider-half, 2.5px));
  margin-right: calc(-1 * var(--seamless-divider-half, 2.5px));
}

.seamless-divider-mode.horizontal-layout :deep(.resizable-divider) {
  margin-top: calc(-1 * var(--seamless-divider-half, 2.5px));
  margin-bottom: calc(-1 * var(--seamless-divider-half, 2.5px));
}

/* hover 时显示半透明高亮，覆盖在内容之上；重置 opacity 以避免基础样式的 0.8 干扰 */
.seamless-divider-mode :deep(.resizable-divider:hover) {
  background-color: var(--divider-hover-color, rgba(128, 128, 128, 0.2)) !important;
  opacity: 1 !important;
}

/* 拖拽时显示更明显的高亮 */
.seamless-divider-mode :deep(.resizable-divider.divider-resizing) {
  background-color: var(--divider-hover-color, rgba(128, 128, 128, 0.3)) !important;
  opacity: 1 !important;
}
</style>
