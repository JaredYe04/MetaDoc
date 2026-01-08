<template>
  <div class="workspace-tree-node">
    <div
      class="workspace-tree-node-item"
      :class="{ 'is-expanded': isExpanded, 'is-file': node.type === 'file' }"
      :style="{ paddingLeft: `${depth * 12 + 8}px` }"
      @click="handleClick"
    >
      <el-icon v-if="node.type === 'directory'" class="workspace-tree-node-icon">
        <ArrowRight v-if="!isExpanded" />
        <ArrowDown v-else />
      </el-icon>
      <img
        v-else
        :src="getFileIcon(node.name)"
        class="workspace-tree-node-file-icon"
        alt=""
      />
      <span class="workspace-tree-node-name">{{ node.name }}</span>
    </div>
    <div v-if="isExpanded && node.children" class="workspace-tree-node-children">
      <WorkspaceTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :expanded-paths="expandedPaths"
        @toggle="$emit('toggle', $event)"
        @open-file="$emit('open-file', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, ArrowDown } from '@element-plus/icons-vue'
import { ElIcon } from 'element-plus'
import { themeState, mixColors } from '../utils/themes'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

interface Props {
  node: FileNode
  depth?: number
  expandedPaths: Set<string>
}

const props = withDefaults(defineProps<Props>(), {
  depth: 0
})

const emit = defineEmits<{
  toggle: [node: FileNode]
  'open-file': [path: string]
}>()

const isExpanded = computed(() => {
  return props.node.type === 'directory' && props.expandedPaths.has(props.node.path)
})

const handleClick = () => {
  if (props.node.type === 'directory') {
    emit('toggle', props.node)
  } else {
    emit('open-file', props.node.path)
  }
}

const getFileIcon = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase()
  const theme = themeState.currentTheme as any
  if (ext === 'tex') {
    return theme.TexDocIcon || ''
  }
  return theme.MdDocIcon || ''
}

// 计算悬停颜色
const hoverColor = computed(() => {
  return mixColors(themeState.currentTheme.background2nd, themeState.currentTheme.SideTextColor, 0.15)
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
}

.workspace-tree-node-item:hover {
  background-color: v-bind('hoverColor');
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

.workspace-tree-node-children {
  margin-left: 0;
}
</style>

