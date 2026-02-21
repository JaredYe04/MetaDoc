<template>
  <div class="workspace-tree-node">
    <div
      class="workspace-tree-node-item"
      :class="{
        'is-expanded': isExpanded,
        'is-file': node.type === 'file',
        'is-selected': isSelected,
        'is-focused': isFocused,
        'is-workspace-root': node.isWorkspaceRoot,
        'is-directory': node.type === 'directory' || node.type === 'workspaceRoot',
        'is-drag-target': isDragTarget
      }"
      :style="{
        paddingLeft: `${depth * 12 + 8}px`,
        top:
          node.type === 'directory' || node.type === 'workspaceRoot'
            ? `${getStickyTop()}px`
            : undefined,
        zIndex:
          node.type === 'directory' || node.type === 'workspaceRoot' ? getStickyZIndex() : undefined
      }"
      :draggable="canDrag"
      :data-path="node.path"
      @click="handleClick"
      @dblclick="handleDblclick"
      @contextmenu="handleContextMenu"
      @dragstart="handleDragStart"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
      @dragend="handleDragEnd"
    >
      <el-icon
        v-if="node.type === 'directory' || node.type === 'workspaceRoot'"
        class="workspace-tree-node-icon"
        :class="{ 'is-workspace-root': node.isWorkspaceRoot }"
        @click.stop="handleIconClick"
      >
        <ArrowRight v-if="!isExpanded" />
        <ArrowDown v-else />
      </el-icon>
      <img
        v-else-if="node.type === 'file'"
        :src="getFileIcon(node.name)"
        class="workspace-tree-node-file-icon"
        alt=""
      />
      <span
        class="workspace-tree-node-name"
        :class="{ 'is-workspace-root': node.isWorkspaceRoot }"
        >{{ node.name }}</span
      >
      <Button
        v-if="node.isWorkspaceRoot"
        variant="ghost"
        size="icon"
        class="workspace-tree-node-close h-4 w-4"
        @click.stop="handleCloseWorkspace"
        :title="$t('workspaceExplorer.closeWorkspace')"
      >
        <Close class="h-3 w-3" />
      </Button>
    </div>
    <div
      v-if="isExpanded && node.children"
      class="workspace-tree-node-children"
      :class="{ 'is-drag-target-area': isDragTargetArea }"
      @dragover="handleChildrenDragOver"
      @dragleave="handleChildrenDragLeave"
      @drop="handleChildrenDrop"
    >
      <WorkspaceTreeNode
        v-for="(child, index) in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :sibling-index="index"
        :expanded-paths="expandedPaths"
        :workspace-folder="workspaceFolder"
        :selected-paths="selectedPaths"
        :focused-path="focusedPath"
        :last-selected-index="lastSelectedIndex"
        :drag-target-path="dragTargetPath"
        @toggle="$emit('toggle', $event)"
        @open-file="$emit('open-file', $event)"
        @open-file-permanent="$emit('open-file-permanent', $event)"
        @context-menu="$emit('context-menu', $event)"
        @node-click="$emit('node-click', $event)"
        @drag-start="$emit('drag-start', $event)"
        @drag-over="$emit('drag-over', $event)"
        @drag-leave="$emit('drag-leave', $event)"
        @drop="$emit('drop', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, ArrowDown, Close } from '@element-plus/icons-vue'
import { ElIcon } from 'element-plus'
import { Button } from '@renderer/components/ui/button'
import { useI18n } from 'vue-i18n'
import { themeState, mixColors } from '../utils/themes'
import { formatRegistry } from '../utils/format-registry'
import { extname } from '../utils/path-utils'

const { t } = useI18n()

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory' | 'workspaceRoot'
  children?: FileNode[]
  isWorkspaceRoot?: boolean
}

interface Props {
  node: FileNode
  depth?: number
  expandedPaths: Set<string>
  workspaceFolder?: string | null
  selectedPaths?: Set<string>
  focusedPath?: string | null
  lastSelectedIndex?: number
  siblingIndex?: number // 同级节点中的索引（从上到下，从0开始）
  dragTargetPath?: string | null // 拖拽目标路径（用于高亮显示）
}

const props = withDefaults(defineProps<Props>(), {
  depth: 0,
  siblingIndex: 0
})

const emit = defineEmits<{
  toggle: [node: FileNode]
  'open-file': [path: string]
  'open-file-permanent': [path: string]
  'context-menu': [event: { node: FileNode; x: number; y: number }]
  'node-click': [event: { node: FileNode; ctrlKey: boolean; shiftKey: boolean }]
  'close-workspace': [path: string]
  'drag-start': [event: { node: FileNode; event: DragEvent }]
  'drag-over': [event: { node: FileNode; event: DragEvent }]
  'drag-leave': [event: { node: FileNode; event: DragEvent }]
  drop: [event: { node: FileNode; event: DragEvent }]
  'drag-end': [event: DragEvent]
}>()

const isExpanded = computed(() => {
  return (
    (props.node.type === 'directory' || props.node.type === 'workspaceRoot') &&
    props.expandedPaths.has(props.node.path)
  )
})

const isSelected = computed(() => {
  // 工作文件夹根节点不可选中
  if (props.node.isWorkspaceRoot) {
    return false
  }
  return props.selectedPaths?.has(props.node.path) || false
})

const isFocused = computed(() => {
  // 工作文件夹根节点不可聚焦
  if (props.node.isWorkspaceRoot) {
    return false
  }
  return props.focusedPath === props.node.path
})

// 是否可以拖拽（只有选中的节点才能拖拽）
const canDrag = computed(() => {
  // 工作文件夹根节点不可拖拽
  if (props.node.isWorkspaceRoot) {
    return false
  }
  // 只有选中的节点才能拖拽
  return isSelected.value
})

// 是否是拖拽目标（用于高亮显示）
const isDragTarget = computed(() => {
  if (!props.dragTargetPath) {
    return false
  }
  // 目录节点可以作为拖拽目标
  if (props.node.type === 'directory' || props.node.isWorkspaceRoot) {
    return props.dragTargetPath === props.node.path
  }
  return false
})

// 是否是拖拽目标区域（展开目录的文件区域）
const isDragTargetArea = computed(() => {
  if (!props.dragTargetPath) {
    return false
  }
  // 展开的目录的文件区域可以作为拖拽目标
  if (isExpanded.value && (props.node.type === 'directory' || props.node.isWorkspaceRoot)) {
    return props.dragTargetPath === props.node.path
  }
  return false
})

// 计算sticky定位的top值
const getStickyTop = () => {
  if (props.node.type === 'workspaceRoot') {
    return 0
  }
  if (props.node.type === 'directory') {
    // 计算层级：工作文件夹在depth 0，第一层目录在depth 1，以此类推
    // 所有节点都使用 min-height: 20px，所以实际高度都是20px
    // - 工作文件夹：top = 0, z-index = 10, 高度 = 20px
    // - 第一层目录：top = 20px (工作文件夹高度), z-index = 9, 高度 = 20px
    // - 第二层目录：top = 40px (工作文件夹20px + 第一层20px), z-index = 8, 高度 = 20px
    // - 第三层目录：top = 60px (工作文件夹20px + 第一层20px + 第二层20px), z-index = 7
    // 计算公式：top = depth * 20px
    return props.depth * 20
  }
  return 0
}

// 计算sticky定位的z-index值
// 规则：
// 1. 深度越浅（depth 越小），z-index 越高（位于前台，第一层盖在第二层上面）
// 2. 同级节点，前面的（siblingIndex 小）z-index 更高（前面的盖在后面的上面）
// 3. 所有 z-index 必须小于 el-scrollbar 的滚动条（z-index = 10）
// 策略：
// - 使用 z-index 范围 1-9（确保小于滚动条的 10）
// - 主要根据 depth 区分层级：depth 越小，z-index 越高
// - 对于同级节点，使用一个很小的偏移量（每 100 个同级节点递减 1）
//   这样可以确保即使有很多同级节点，也能正确区分
const getStickyZIndex = () => {
  if (props.node.type === 'workspaceRoot') {
    // 工作文件夹（depth=0）：z-index = 9（最高层级）
    // 如果有多个工作文件夹，前面的比后面的高
    // 但通常工作文件夹不会重叠，所以使用固定值 9
    // 如果确实需要区分，可以使用：9 - Math.min(siblingIndex, 8)
    return 9
  }
  if (props.node.type === 'directory') {
    // 普通文件夹：
    // - 基础 z-index = 9 - depth（深度越浅，z-index 越高）
    //   depth 1 -> 8, depth 2 -> 7, depth 3 -> 6, ...
    // - 对于同级节点，前面的比后面的高
    //   使用 siblingIndex 的分数影响：每 100 个同级节点递减 1
    //   这样可以确保即使有很多同级节点，也能正确区分
    const baseZIndex = 9 - props.depth // depth 越小，z-index 越高
    // 同级节点：前面的比后面的高，但差异很小
    // 每 100 个同级节点递减 1，确保不会影响主要层级区分
    const siblingOffset = Math.floor(props.siblingIndex / 100)
    const finalZIndex = baseZIndex - siblingOffset
    return Math.max(1, finalZIndex) // 确保至少为 1，但小于 10
  }
  return 0
}

const handleIconClick = (event: MouseEvent) => {
  // 点击图标时，只切换展开/折叠，不触发选中
  event.stopPropagation()
  if (props.node.type === 'directory' || props.node.type === 'workspaceRoot') {
    emit('toggle', props.node)
  }
}

const handleClick = (event: MouseEvent) => {
  // 检查是否点击在关闭按钮上
  const target = event.target as HTMLElement
  if (target.closest('.workspace-tree-node-close')) {
    return // 关闭按钮点击已单独处理
  }

  // 如果是目录节点，点击图标切换展开/折叠（不触发选中）
  if (target.closest('.workspace-tree-node-icon')) {
    return // 图标点击已单独处理
  }

  // 所有节点点击都触发 focus 和 selection 逻辑
  // 工作文件夹根节点不可选中，但也会触发事件（由父组件处理）
  emit('node-click', {
    node: props.node,
    ctrlKey: event.ctrlKey || event.metaKey,
    shiftKey: event.shiftKey
  })

  // 如果是目录节点，点击节点其他部分也切换展开/折叠
  if (props.node.isWorkspaceRoot || props.node.type === 'directory') {
    emit('toggle', props.node)
  }
}

const handleDblclick = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  if (target.closest('.workspace-tree-node-close') || target.closest('.workspace-tree-node-icon')) {
    return
  }
  if (props.node.type === 'file') {
    emit('open-file-permanent', props.node.path)
  }
}

const handleContextMenu = (event: MouseEvent) => {
  // 检查是否点击在关闭按钮上
  const target = event.target as HTMLElement
  if (target.closest('.workspace-tree-node-close')) {
    return // 关闭按钮不触发右键菜单
  }
  event.preventDefault()
  event.stopPropagation()

  // 右键菜单只触发 context-menu 事件，不触发 node-click（避免打开文件和高亮）
  // selection 和 focus 的处理在 handleContextMenu 中完成

  emit('context-menu', {
    node: props.node,
    x: event.clientX,
    y: event.clientY
  })
}

const handleCloseWorkspace = () => {
  emit('close-workspace', props.node.path)
}

const getFileIcon = (fileName: string): string => {
  const theme = themeState.currentTheme as any
  const fileExt = extname(fileName)
  const formatId = formatRegistry.getFormatByExtension(fileExt)

  // 根据格式ID选择图标
  if (formatId === 'tex') {
    return theme.TexDocIcon || ''
  } else if (formatId === 'txt' || formatId === 'plaintext') {
    // plaintext 文件显示 base-doc 图标
    return theme.BaseDocIcon || ''
  } else if (formatId === 'md') {
    return theme.MdDocIcon || ''
  }

  // 默认使用 base-doc 图标（用于其他格式）
  return theme.BaseDocIcon || theme.MdDocIcon || ''
}

// 计算悬停颜色
const hoverColor = computed(() => {
  return mixColors(
    themeState.currentTheme.background2nd,
    themeState.currentTheme.SideTextColor,
    0.15
  )
})

// 计算选中颜色
const selectedColor = computed(() => {
  return mixColors(
    themeState.currentTheme.background2nd,
    themeState.currentTheme.primaryColor || '#409eff',
    0.3
  )
})

// 计算拖拽目标高亮颜色
const dragTargetColor = computed(() => {
  return mixColors(
    themeState.currentTheme.background2nd,
    themeState.currentTheme.primaryColor || '#409eff',
    0.2
  )
})

// 处理拖拽开始
const handleDragStart = (event: DragEvent) => {
  // 只有选中的节点才能拖拽
  if (!canDrag.value) {
    event.preventDefault()
    return
  }

  // 设置拖拽数据
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', props.node.path)
  }

  emit('drag-start', { node: props.node, event })
}

// 处理拖拽悬停（在节点上）
const handleDragOver = (event: DragEvent) => {
  // 只有目录节点可以作为拖拽目标
  if (props.node.type === 'directory' || props.node.isWorkspaceRoot) {
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
    emit('drag-over', { node: props.node, event })
  }
}

// 处理拖拽离开（从节点上）
const handleDragLeave = (event: DragEvent) => {
  emit('drag-leave', { node: props.node, event })
}

// 处理拖拽释放（在节点上）
const handleDrop = (event: DragEvent) => {
  // 只有目录节点可以作为拖拽目标
  if (props.node.type === 'directory' || props.node.isWorkspaceRoot) {
    event.preventDefault()
    event.stopPropagation()
    emit('drop', { node: props.node, event })
  }
}

// 处理拖拽悬停（在展开目录的文件区域）
const handleChildrenDragOver = (event: DragEvent) => {
  if (isExpanded.value && (props.node.type === 'directory' || props.node.isWorkspaceRoot)) {
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
    emit('drag-over', { node: props.node, event })
  }
}

// 处理拖拽离开（从展开目录的文件区域）
const handleChildrenDragLeave = (event: DragEvent) => {
  emit('drag-leave', { node: props.node, event })
}

// 处理拖拽释放（在展开目录的文件区域）
const handleChildrenDrop = (event: DragEvent) => {
  if (isExpanded.value && (props.node.type === 'directory' || props.node.isWorkspaceRoot)) {
    event.preventDefault()
    event.stopPropagation()
    emit('drop', { node: props.node, event })
  }
}

// 处理拖拽结束
const handleDragEnd = (event: DragEvent) => {
  emit('drag-end', event)
}
</script>

<style scoped>
.workspace-tree-node {
  user-select: none;
  margin: 0;
  padding: 0;
}

.workspace-tree-node-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 13px;
  background-color: v-bind('themeState.currentTheme.background2nd');
  color: v-bind('themeState.currentTheme.SideTextColor');
  cursor: pointer;
  min-height: 20px;
  height: 20px;
  box-sizing: border-box;
  position: relative;
  margin: 0;
  line-height: 20px;
}

.workspace-tree-node-item.is-directory {
  position: sticky;
}

.workspace-tree-node-item.is-workspace-root {
  position: sticky;
  top: 0;
}

.workspace-tree-node-item:hover {
  background-color: v-bind('hoverColor');
}

.workspace-tree-node-item.is-focused {
  outline: 1px solid v-bind('themeState.currentTheme.primaryColor || "#409eff"');
  outline-offset: -1px;
}

.workspace-tree-node-item.is-selected {
  background-color: v-bind('selectedColor');
}

.workspace-tree-node-item.is-selected:hover {
  background-color: v-bind('selectedColor');
}

.workspace-tree-node-item.is-focused.is-selected {
  /* Focus 和 Selection 同时存在时，显示选中背景色 + focus 边框 */
  background-color: v-bind('selectedColor');
  outline: 1px solid v-bind('themeState.currentTheme.primaryColor || "#409eff"');
  outline-offset: -1px;
}

.workspace-tree-node-item.is-drag-target {
  /* 拖拽目标高亮 */
  background-color: v-bind('dragTargetColor');
  outline: 1px dashed #999;
  outline-offset: -1px;
}

.workspace-tree-node-children.is-drag-target-area {
  /* 展开目录的文件区域拖拽目标高亮 */
  background-color: v-bind('dragTargetColor');
  border: 1px dashed #999;
  border-radius: 4px;
  margin: 0;
  min-height: 20px;
}

.workspace-tree-node-icon {
  font-size: 13px;
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: v-bind('themeState.currentTheme.SideTextColor2');
}

.workspace-tree-node-file-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.workspace-tree-node-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-tree-node-name.is-workspace-root {
  font-size: 14px;
  font-weight: 600;
}

.workspace-tree-node-icon.is-workspace-root {
  font-size: 14px;
}

.workspace-tree-node-close {
  opacity: 0;
  transition: opacity 0.2s;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.workspace-tree-node-item:hover .workspace-tree-node-close {
  opacity: 1;
}

.workspace-tree-node-children {
  margin-left: 0;
  margin-top: 0;
  margin-bottom: 0;
}
</style>
