<template>
  <div class="workspace-tree-node">
    <div
      class="workspace-tree-node-item"
      :class="{
        'is-expanded': isExpanded,
        'is-file': node.type === 'file',
        'is-selected': isSelected,
        'is-workspace-root': node.isWorkspaceRoot,
        'is-directory': node.type === 'directory' || node.type === 'workspaceRoot'
      }"
      :style="{
        paddingLeft: `${depth * 12 + 8}px`,
        top: node.type === 'directory' || node.type === 'workspaceRoot' ? `${getStickyTop()}px` : undefined,
        zIndex: node.type === 'directory' || node.type === 'workspaceRoot' ? getStickyZIndex() : undefined
      }"
      @click="handleClick"
      @contextmenu="handleContextMenu"
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
      >{{ node.name }}</span>
      <el-button
        v-if="node.isWorkspaceRoot"
        text
        size="small"
        class="workspace-tree-node-close"
        @click.stop="handleCloseWorkspace"
        :title="$t('workspaceExplorer.closeWorkspace')"
      >
        <el-icon><Close /></el-icon>
      </el-button>
    </div>
    <div v-if="isExpanded && node.children" class="workspace-tree-node-children">
      <WorkspaceTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :expanded-paths="expandedPaths"
        :workspace-folder="workspaceFolder"
        :selected-paths="selectedPaths"
        :last-selected-index="lastSelectedIndex"
        @toggle="$emit('toggle', $event)"
        @open-file="$emit('open-file', $event)"
        @context-menu="$emit('context-menu', $event)"
        @node-click="$emit('node-click', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, ArrowDown, Close } from '@element-plus/icons-vue'
import { ElIcon, ElButton } from 'element-plus'
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
  lastSelectedIndex?: number
}

const props = withDefaults(defineProps<Props>(), {
  depth: 0
})

const emit = defineEmits<{
  toggle: [node: FileNode]
  'open-file': [path: string]
  'context-menu': [event: { node: FileNode; x: number; y: number }]
  'node-click': [event: { node: FileNode; ctrlKey: boolean; shiftKey: boolean }]
  'close-workspace': [path: string]
}>()

const isExpanded = computed(() => {
  return (props.node.type === 'directory' || props.node.type === 'workspaceRoot') && props.expandedPaths.has(props.node.path)
})

const isSelected = computed(() => {
  // 工作文件夹根节点不可选中
  if (props.node.isWorkspaceRoot) {
    return false
  }
  return props.selectedPaths?.has(props.node.path) || false
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
const getStickyZIndex = () => {
  if (props.node.type === 'workspaceRoot') {
    // 工作文件夹使用较高的z-index，确保在普通文件夹上方
    return 2
  }
  if (props.node.type === 'directory') {
    // 普通文件夹使用较低的z-index
    // 使用较小的z-index值，确保不会覆盖滚动条
    // 工作文件夹：z-index = 2
    // 普通文件夹：z-index = 1
    return 1
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
  // 工作文件夹根节点：点击整个节点可以展开/折叠
  if (props.node.isWorkspaceRoot) {
    // 检查是否点击在关闭按钮上
    const target = event.target as HTMLElement
    if (target.closest('.workspace-tree-node-close')) {
      return // 关闭按钮点击已单独处理
    }
    // 点击节点其他部分，切换展开/折叠
    emit('toggle', props.node)
    return
  }
  // 所有点击都触发选中逻辑（图标点击已单独处理）
  emit('node-click', {
    node: props.node,
    ctrlKey: event.ctrlKey || event.metaKey,
    shiftKey: event.shiftKey
  })
}

const handleContextMenu = (event: MouseEvent) => {
  // 检查是否点击在关闭按钮上
  const target = event.target as HTMLElement
  if (target.closest('.workspace-tree-node-close')) {
    return // 关闭按钮不触发右键菜单
  }
  event.preventDefault()
  event.stopPropagation()
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
  return mixColors(themeState.currentTheme.background2nd, themeState.currentTheme.SideTextColor, 0.15)
})

// 计算选中颜色
const selectedColor = computed(() => {
  return mixColors(themeState.currentTheme.background2nd, themeState.currentTheme.primaryColor || '#409eff', 0.3)
})
</script>

<style scoped>
.workspace-tree-node {
  user-select: none;
}

.workspace-tree-node-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 13px;
  color: v-bind('themeState.currentTheme.SideTextColor');
  cursor: pointer;
  min-height: 20px;
  height: 20px;
  box-sizing: border-box;
  position: relative;
}

.workspace-tree-node-item.is-directory {
  position: sticky;
  background-color: v-bind('themeState.currentTheme.editorToolbarBackgroundColor');
}

.workspace-tree-node-item.is-workspace-root {
  position: sticky;
  top: 0;
  background-color: v-bind('themeState.currentTheme.editorToolbarBackgroundColor');
}

.workspace-tree-node-item:hover {
  background-color: v-bind('hoverColor');
}

.workspace-tree-node-item.is-selected {
  background-color: v-bind('selectedColor');
}

.workspace-tree-node-item.is-selected:hover {
  background-color: v-bind('selectedColor');
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
}
</style>

