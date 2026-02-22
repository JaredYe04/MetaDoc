<template>
  <div :class="cn('el-tree', $attrs.class as string)" role="tree">
    <TreeItem
      v-for="(node, index) in visibleData"
      :key="getNodeKey(node, index)"
      :node="node"
      :node-key="getNodeKey(node, index)"
      :level="0"
      :props="mergedProps"
      :expanded-keys="expandedKeys"
      :current-key="currentKey"
      :highlight-current="highlightCurrent"
      :expand-on-click-node="expandOnClickNode"
      :filter-node-method="filterNodeMethod"
      :filter-value="filterValue"
      :lazy="lazy"
      :load="load"
      :loaded-keys="loadedKeys"
      :loading-keys="loadingKeys"
      @node-click="handleNodeClick"
      @node-expand="handleNodeExpand"
      @node-collapse="handleNodeCollapse"
      @lazy-load="handleLazyLoad"
    >
      <template #default="{ node: slotNode, data: slotData }">
        <slot :node="slotNode" :data="slotData">
          <span class="tree-node-label">{{ getLabel(slotData) }}</span>
        </slot>
      </template>
    </TreeItem>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, provide, toRefs, useSlots } from 'vue'
import { cn } from '../../../lib/utils'
import TreeItem from './TreeItem.vue'

// Tree node interface
export interface TreeNode {
  [key: string]: any
  children?: TreeNode[]
}

// Tree props interface
export interface TreeProps {
  label?: string
  children?: string
  disabled?: string
  isLeaf?: string
}

// Props definition - Element Plus el-tree compatible
const props = withDefaults(defineProps<{
  // Core data
  data?: TreeNode[]
  // Node mapping props
  props?: TreeProps
  // Unique key for each node
  nodeKey?: string
  // Whether to expand all nodes by default
  defaultExpandAll?: boolean
  // Whether to expand/collapse node on click
  expandOnClickNode?: boolean
  // Whether to highlight current node
  highlightCurrent?: boolean
  // Current node key
  currentNodeKey?: string | number
  // Filter function
  filterNodeMethod?: (value: string, data: TreeNode, node: TreeNode) => boolean
  // Lazy loading
  lazy?: boolean
  // Load function for lazy loading
  load?: (node: TreeNode, resolve: (data: TreeNode[]) => void) => void
}>(), {
  data: () => [],
  props: () => ({
    label: 'label',
    children: 'children',
    disabled: 'disabled',
    isLeaf: 'isLeaf'
  }),
  nodeKey: 'id',
  defaultExpandAll: false,
  expandOnClickNode: true,
  highlightCurrent: false,
  currentNodeKey: undefined,
  filterNodeMethod: undefined,
  lazy: false,
  load: undefined
})

// Emits - Element Plus el-tree compatible
const emit = defineEmits<{
  'node-click': [data: TreeNode, node: TreeNode, component: any]
  'node-expand': [data: TreeNode, node: TreeNode, component: any]
  'node-collapse': [data: TreeNode, node: TreeNode, component: any]
  'current-change': [data: TreeNode, oldData: TreeNode | null]
}>()

// Internal state
const expandedKeys = ref<Set<string | number>>(new Set())
const currentKey = ref<string | number | null>(props.currentNodeKey ?? null)
const loadedKeys = ref<Set<string | number>>(new Set())
const loadingKeys = ref<Set<string | number>>(new Set())
const filterValue = ref<string>('')
const lazyLoadData = ref<Map<string | number, TreeNode[]>>(new Map())

// Provide slots to child components
const slots = useSlots()
provide('treeSlots', slots)

// Merge default props with user props
const mergedProps = computed<TreeProps>(() => ({
  label: props.props?.label ?? 'label',
  children: props.props?.children ?? 'children',
  disabled: props.props?.disabled ?? 'disabled',
  isLeaf: props.props?.isLeaf ?? 'isLeaf'
}))

// Get node key from data
const getNodeKey = (node: TreeNode, index: number): string | number => {
  if (props.nodeKey && node[props.nodeKey] !== undefined) {
    return node[props.nodeKey]
  }
  return `__tree_node_${index}`
}

// Get label from data
const getLabel = (data: TreeNode): string => {
  return data[mergedProps.value.label!] ?? ''
}

// Check if node should be visible based on filter
const isNodeVisible = (node: TreeNode): boolean => {
  if (!filterValue.value || !props.filterNodeMethod) return true
  return props.filterNodeMethod(filterValue.value, node, node)
}

// Check if any children match filter
const hasVisibleChildren = (node: TreeNode): boolean => {
  if (!filterValue.value || !props.filterNodeMethod) return false
  const children = node[mergedProps.value.children!]
  if (!Array.isArray(children)) return false
  return children.some(child => isNodeVisible(child) || hasVisibleChildren(child))
}

// Get visible data based on filter
const visibleData = computed(() => {
  if (!filterValue.value || !props.filterNodeMethod) {
    return props.data
  }
  // When filtering, show all nodes that match or have matching children
  return props.data.filter(node => isNodeVisible(node) || hasVisibleChildren(node))
})

// Initialize expanded state
const initializeExpanded = () => {
  if (props.defaultExpandAll) {
    const keys = new Set<string | number>()
    const collectKeys = (nodes: TreeNode[]) => {
      nodes.forEach(node => {
        const key = getNodeKey(node, 0)
        keys.add(key)
        const children = node[mergedProps.value.children!]
        if (Array.isArray(children) && children.length > 0) {
          collectKeys(children)
        }
      })
    }
    collectKeys(props.data)
    expandedKeys.value = keys
  }
}

// Handle node click
const handleNodeClick = (data: TreeNode, node: TreeNode, component: any) => {
  const oldData = currentKey.value !== null 
    ? findNodeByKey(currentKey.value) 
    : null
  
  // Update current key
  if (props.nodeKey && data[props.nodeKey] !== undefined) {
    currentKey.value = data[props.nodeKey]
  }
  
  emit('node-click', data, node, component)
  emit('current-change', data, oldData)
}

// Handle node expand
const handleNodeExpand = (data: TreeNode, node: TreeNode, component: any) => {
  const key = getNodeKey(data, 0)
  expandedKeys.value.add(key)
  emit('node-expand', data, node, component)
}

// Handle node collapse
const handleNodeCollapse = (data: TreeNode, node: TreeNode, component: any) => {
  const key = getNodeKey(data, 0)
  expandedKeys.value.delete(key)
  emit('node-collapse', data, node, component)
}

// Handle lazy load
const handleLazyLoad = (key: string | number, children: TreeNode[]) => {
  lazyLoadData.value.set(key, children)
  loadedKeys.value.add(key)
  loadingKeys.value.delete(key)
}

// Find node by key
const findNodeByKey = (key: string | number): TreeNode | null => {
  const search = (nodes: TreeNode[]): TreeNode | null => {
    for (const node of nodes) {
      if (getNodeKey(node, 0) === key) {
        return node
      }
      const children = node[mergedProps.value.children!]
      if (Array.isArray(children)) {
        const found = search(children)
        if (found) return found
      }
    }
    return null
  }
  return search(props.data)
}

// Public methods - exposed via ref
const getCurrentKey = (): string | number | null => {
  return currentKey.value
}

const setCurrentKey = (key: string | number | null) => {
  if (key === null) {
    currentKey.value = null
    return
  }
  
  currentKey.value = key
  
  // Expand parent nodes if necessary
  const expandParents = (nodes: TreeNode[], parentChain: TreeNode[] = []): boolean => {
    for (const node of nodes) {
      const nodeKey = getNodeKey(node, 0)
      if (nodeKey === key) {
        // Found the node, expand all parents
        parentChain.forEach(parent => {
          expandedKeys.value.add(getNodeKey(parent, 0))
        })
        return true
      }
      const children = node[mergedProps.value.children!]
      if (Array.isArray(children) && children.length > 0) {
        if (expandParents(children, [...parentChain, node])) {
          return true
        }
      }
    }
    return false
  }
  
  expandParents(props.data)
}

const filter = (value: string) => {
  filterValue.value = value
  
  // When filtering, expand all nodes to show matching children
  if (value && props.filterNodeMethod) {
    const keys = new Set<string | number>()
    const collectKeys = (nodes: TreeNode[]) => {
      nodes.forEach(node => {
        const key = getNodeKey(node, 0)
        if (isNodeVisible(node) || hasVisibleChildren(node)) {
          keys.add(key)
          const children = node[mergedProps.value.children!]
          if (Array.isArray(children) && children.length > 0) {
            collectKeys(children)
          }
        }
      })
    }
    collectKeys(props.data)
    expandedKeys.value = keys
  }
}

// Watch for currentNodeKey changes
watch(() => props.currentNodeKey, (newKey) => {
  if (newKey !== undefined) {
    currentKey.value = newKey
  }
}, { immediate: true })

// Watch for data changes to initialize expanded state
watch(() => props.data, (newData) => {
  if (newData && newData.length > 0) {
    initializeExpanded()
  }
}, { immediate: true })

// Expose methods
defineExpose({
  getCurrentKey,
  setCurrentKey,
  filter
})
</script>

<style scoped>
.el-tree {
  width: 100%;
  background: transparent;
}

.tree-node-label {
  font-size: 14px;
  line-height: 1.5;
}
</style>
