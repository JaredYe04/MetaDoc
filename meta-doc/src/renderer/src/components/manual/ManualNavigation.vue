<template>
  <div class="manual-navigation">
    <el-scrollbar class="navigation-scrollbar">
      <el-tree
        :data="treeData"
        :props="{ children: 'children', label: 'title' }"
        :default-expand-all="false"
        :highlight-current="true"
        :current-node-key="currentSection"
        node-key="id"
        @node-click="handleNodeClick"
        class="navigation-tree"
      >
        <template #default="{ node, data }">
          <div class="tree-node">
            <el-icon v-if="data.children && data.children.length > 0" class="node-icon">
              <Folder />
            </el-icon>
            <el-icon v-else class="node-icon">
              <Document />
            </el-icon>
            <span class="node-label">{{ data.title }}</span>
          </div>
        </template>
      </el-tree>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUserManual } from '../../stores/userManual'
import { Folder, Document } from '@element-plus/icons-vue'

const { navigationTree, currentSection, setCurrentSection } = useUserManual()

const treeData = computed(() => navigationTree.value)

const handleNodeClick = (data: any) => {
  if (data.id) {
    // 如果点击的是有子节点的节点，不设置section（让树自动展开/折叠）
    // 只有当节点没有子节点时才设置section
    if (!data.children || data.children.length === 0) {
      setCurrentSection(data.id)
    }
  }
}
</script>

<style scoped>
.manual-navigation {
  width: 280px;
  min-width: 200px;
  height: 100%;
  border-right: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
  background-color: v-bind('themeState.currentTheme.background2nd');
  display: flex;
  flex-direction: column;
}

.navigation-scrollbar {
  flex: 1;
  height: 100%;
}

.navigation-tree {
  padding: 12px;
  background: transparent;
}

.navigation-tree :deep(.el-tree-node) {
  margin-bottom: 4px;
}

.navigation-tree :deep(.el-tree-node__content) {
  height: 32px;
  border-radius: 6px;
  padding: 0 8px;
  transition: all 0.2s ease;
  min-width: 0;
  overflow: hidden;
}

.navigation-tree :deep(.el-tree-node__content:hover) {
  background-color: v-bind('themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"');
}

.navigation-tree :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background-color: v-bind('themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)"');
  font-weight: 500;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

.node-icon {
  font-size: 16px;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.6)"');
  flex-shrink: 0;
}

.node-label {
  font-size: 14px;
  color: v-bind('themeState.currentTheme.textColor');
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  max-width: 100%;
}

.navigation-tree :deep(.el-tree-node__expand-icon) {
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.6)"');
}
</style>

<script lang="ts">
import { themeState } from '../../utils/themes'
export { themeState }
</script>
