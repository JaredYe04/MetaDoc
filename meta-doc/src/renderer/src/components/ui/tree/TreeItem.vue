<template>
  <div
    :class="cn(
      'el-tree-node',
      'select-none',
      isExpanded && 'is-expanded',
      isCurrent && highlightCurrent && 'is-current',
      isDisabled && 'is-disabled'
    )"
    role="treeitem"
    :aria-expanded="hasChildren ? isExpanded : undefined"
    :aria-selected="isCurrent"
  >
    <!-- Node content -->
    <div
      :class="cn(
        'el-tree-node__content',
        'flex items-center',
        'py-1.5 px-2',
        'cursor-pointer',
        'transition-colors duration-200',
        'hover:bg-accent hover:text-accent-foreground',
        isCurrent && highlightCurrent && 'bg-accent/60 font-medium',
        isDisabled && 'opacity-50 cursor-not-allowed',
        'rounded-md'
      )"
      :style="{ paddingLeft: `${level * 16 + 8}px` }"
      @click="handleClick"
    >
      <!-- Expand/collapse icon -->
      <span
        v-if="(hasChildren || (lazy && !isLeaf)) && !isFilteredHidden"
        :class="cn(
          'el-tree-node__expand-icon',
          'mr-1 flex items-center justify-center',
          'w-4 h-4',
          'transition-transform duration-200',
          isExpanded && 'is-expanded rotate-90'
        )"
        @click.stop="handleExpandClick"
      >
        <ChevronRight v-if="!isLoading" class="w-4 h-4" />
        <Loader2 v-else class="w-4 h-4 animate-spin" />
      </span>
      
      <span v-else class="w-4 h-4 mr-1 el-tree-node__expand-icon-placeholder" />

      <!-- Node label slot -->
      <div class="el-tree-node__label flex-1 min-w-0">
        <slot :node="node" :data="node">
          <span class="truncate">{{ label }}</span>
        </slot>
      </div>
    </div>

    <!-- Children -->
    <div
      v-if="(hasChildren || lazyChildren.length > 0) && isExpanded && !isFilteredHidden"
      class="el-tree-node__children"
      role="group"
    >
      <TreeItem
        v-for="(child, index) in visibleChildren"
        :key="getChildKey(child, index)"
        :node="child"
        :node-key="getChildKey(child, index)"
        :level="level + 1"
        :props="props"
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
        @node-click="(data, node, component) => $emit('node-click', data, node, component)"
        @node-expand="(data, node, component) => $emit('node-expand', data, node, component)"
        @node-collapse="(data, node, component) => $emit('node-collapse', data, node, component)"
        @lazy-load="(key, children) => $emit('lazy-load', key, children)"
      >
        <template #default="{ node: slotNode, data: slotData }">
          <slot :node="slotNode" :data="slotData" />
        </template>
      </TreeItem>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, ref } from 'vue'
import { ChevronRight, Loader2 } from 'lucide-vue-next'
import { cn } from '../../../lib/utils'
import type { TreeNode, TreeProps } from './Tree.vue'

// Props
const props = withDefaults(defineProps<{
  node: TreeNode
  nodeKey: string | number
  level: number
  props: TreeProps
  expandedKeys: Set<string | number>
  currentKey: string | number | null
  highlightCurrent: boolean
  expandOnClickNode: boolean
  filterNodeMethod?: (value: string, data: TreeNode, node: TreeNode) => boolean
  filterValue: string
  lazy: boolean
  load?: (node: TreeNode, resolve: (data: TreeNode[]) => void) => void
  loadedKeys: Set<string | number>
  loadingKeys: Set<string | number>
}>(), {
  level: 0,
  filterValue: ''
})

// Emits
const emit = defineEmits<{
  'node-click': [data: TreeNode, node: TreeNode, component: any]
  'node-expand': [data: TreeNode, node: TreeNode, component: any]
  'node-collapse': [data: TreeNode, node: TreeNode, component: any]
  'lazy-load': [key: string | number, children: TreeNode[]]
}>()

// Internal state
const lazyChildren = ref<TreeNode[]>([])

// Computed properties
const label = computed(() => {
  return props.node[props.props.label!] ?? ''
})

const children = computed(() => {
  return props.node[props.props.children!]
})

const hasChildren = computed(() => {
  return Array.isArray(children.value) && children.value.length > 0
})

const isLeaf = computed(() => {
  return props.node[props.props.isLeaf!] === true
})

const isExpanded = computed(() => {
  return props.expandedKeys.has(props.nodeKey)
})

const isCurrent = computed(() => {
  return props.currentKey === props.nodeKey
})

const isDisabled = computed(() => {
  return props.node[props.props.disabled!] === true
})

const isLoading = computed(() => {
  return props.loadingKeys.has(props.nodeKey)
})

const isFilteredHidden = computed(() => {
  if (!props.filterValue || !props.filterNodeMethod) return false
  // If this node matches, show it
  if (props.filterNodeMethod(props.filterValue, props.node, props.node)) return false
  // If any child matches, show this node
  if (hasVisibleChildren(props.node)) return false
  return true
})

const visibleChildren = computed(() => {
  const allChildren = [...(Array.isArray(children.value) ? children.value : []), ...lazyChildren.value]
  
  if (!props.filterValue || !props.filterNodeMethod) {
    return allChildren
  }
  
  // When filtering, show children that match or have matching children
  return allChildren.filter(child => {
    return props.filterNodeMethod!(props.filterValue, child, child) || hasVisibleChildren(child)
  })
})

// Check if any children match filter
const hasVisibleChildren = (node: TreeNode): boolean => {
  if (!props.filterValue || !props.filterNodeMethod) return false
  const childNodes = node[props.props.children!]
  if (!Array.isArray(childNodes)) return false
  return childNodes.some(child => {
    return props.filterNodeMethod!(props.filterValue, child, child) || hasVisibleChildren(child)
  })
}

// Get child key
const getChildKey = (child: TreeNode, index: number): string | number => {
  // Use the same key field as parent
  const keyField = 'id' // Default
  if (child[keyField] !== undefined) {
    return child[keyField]
  }
  return `${props.nodeKey}_child_${index}`
}

// Load children for lazy loading
const loadChildren = () => {
  if (!props.lazy || !props.load || props.loadedKeys.has(props.nodeKey)) {
    return
  }
  
  // Add to loading keys
  // Note: This would need to be managed at parent level for proper reactivity
  
  props.load(props.node, (data) => {
    lazyChildren.value = data
    emit('lazy-load', props.nodeKey, data)
  })
}

// Handle click
const handleClick = () => {
  if (isDisabled.value) return
  
  emit('node-click', props.node, props.node, null)
  
  if (props.expandOnClickNode) {
    toggleExpand()
  }
}

// Handle expand icon click
const handleExpandClick = () => {
  if (isDisabled.value) return
  toggleExpand()
}

// Toggle expand/collapse
const toggleExpand = () => {
  if (hasChildren.value || (props.lazy && !isLeaf.value && lazyChildren.value.length === 0)) {
    if (isExpanded.value) {
      emit('node-collapse', props.node, props.node, null)
    } else {
      emit('node-expand', props.node, props.node, null)
      // Load children if lazy loading
      if (props.lazy && !props.loadedKeys.has(props.nodeKey) && !isLeaf.value) {
        loadChildren()
      }
    }
  }
}

// Watch for lazy loading trigger
watch(() => props.expandedKeys, (newKeys) => {
  if (newKeys.has(props.nodeKey) && props.lazy && !props.loadedKeys.has(props.nodeKey) && !isLeaf.value) {
    loadChildren()
  }
}, { deep: true })
</script>

<style scoped>
.el-tree-node {
  width: 100%;
  white-space: nowrap;
  outline: none;
}

.el-tree-node__content {
  display: flex;
  align-items: center;
  height: 28px;
  cursor: pointer;
}

.el-tree-node__content > .el-tree-node__expand-icon,
.el-tree-node__content > .el-tree-node__expand-icon-placeholder {
  padding: 6px;
  cursor: pointer;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  transform: rotate(0deg);
  transition: transform 0.3s ease-in-out;
}

.el-tree-node__expand-icon.is-expanded {
  transform: rotate(90deg);
}

.el-tree-node__expand-icon:hover {
  color: hsl(var(--foreground));
}

.el-tree-node__label {
  font-size: 14px;
  line-height: 1.5;
}

.el-tree-node.is-current > .el-tree-node__content {
  background-color: hsl(var(--accent));
}

.el-tree-node.is-disabled > .el-tree-node__content {
  opacity: 0.5;
  cursor: not-allowed;
}

.el-tree-node__children {
  width: 100%;
}
</style>
