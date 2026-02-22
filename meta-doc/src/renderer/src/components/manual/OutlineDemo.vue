<template>
  <div class="outline-demo" :style="containerStyle" :data-direction="direction">
    <div class="outline-container" :style="outlineContainerStyle">
      <!-- 大纲树 -->
      <div class="tree-container" :style="treeContainerStyle">
        <div class="tree-node root-node">
          <div class="node-content" :style="nodeContentStyle">
            <ChevronDown class="w-4 h-4 expand-icon" />
            <span class="node-title">{{ t('outline.rootNode', '文档根节点') }}</span>
          </div>

          <!-- 一级节点 -->
          <div class="children-container">
            <div v-for="(node, index) in demoOutline" :key="node.path" class="tree-node level-1">
              <div class="node-content" :style="nodeContentStyle">
                <component
                  :is="node.expanded ? ChevronDown : ChevronRight"
                  class="w-4 h-4 expand-icon"
                />
                <span class="node-title">{{ node.title }}</span>
                <div class="node-actions">
                  <Button variant="ghost" size="sm" class="action-btn">
                    <Plus class="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="sm" class="action-btn">
                    <MoreVertical class="w-3 h-3" />
                  </Button>
                </div>
              </div>

              <!-- 二级节点 -->
              <div v-if="node.expanded && node.children" class="children-container">
                <div
                  v-for="(child, childIndex) in node.children"
                  :key="child.path"
                  class="tree-node level-2"
                >
                  <div class="node-content" :style="nodeContentStyle">
                    <component
                      :is="child.expanded ? ChevronDown : ChevronRight"
                      class="w-4 h-4 expand-icon"
                    />
                    <span class="node-title">{{ child.title }}</span>
                    <div class="node-actions">
                      <Button variant="ghost" size="sm" class="action-btn">
                        <Plus class="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" class="action-btn">
                        <MoreVertical class="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  <!-- 三级节点 -->
                  <div v-if="child.expanded && child.children" class="children-container">
                    <div
                      v-for="(grandChild, grandChildIndex) in child.children"
                      :key="grandChild.path"
                      class="tree-node level-3"
                    >
                      <div class="node-content" :style="nodeContentStyle">
                        <ChevronRight class="w-4 h-4 expand-icon invisible" />
                        <span class="node-title">{{ grandChild.title }}</span>
                        <div class="node-actions">
                          <Button variant="ghost" size="sm" class="action-btn">
                            <MoreVertical class="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部工具栏 -->
      <div class="toolbar" :style="toolbarStyle">
        <Button variant="outline" size="icon" class="toolbar-btn">
          <ArrowUpDown class="w-4 h-4" />
        </Button>
        <Button variant="default" size="icon" class="toolbar-btn">
          <Plus class="w-4 h-4" />
        </Button>
        <Button variant="secondary" size="icon" class="toolbar-btn">
          <Minus class="w-4 h-4" />
        </Button>
        <Button variant="outline" size="icon" class="toolbar-btn">
          <RefreshCw class="w-4 h-4" />
        </Button>
        <Button variant="secondary" size="icon" class="toolbar-btn">
          <span class="text-xs font-bold">AI</span>
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '../components/ui/button'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  MoreVertical,
  ArrowUpDown,
  Minus,
  RefreshCw
} from 'lucide-vue-next'
import { themeState } from '../utils/themes'

const { t } = useI18n()

const direction = ref('vertical')

// Demo 大纲数据
const demoOutline = [
  {
    title: '第一章 概述',
    path: '1',
    expanded: true,
    children: [
      {
        title: '1.1 项目背景',
        path: '1.1',
        expanded: false
      },
      {
        title: '1.2 功能特点',
        path: '1.2',
        expanded: true,
        children: [
          {
            title: '1.2.1 核心功能',
            path: '1.2.1'
          },
          {
            title: '1.2.2 特色功能',
            path: '1.2.2'
          }
        ]
      },
      {
        title: '1.3 技术架构',
        path: '1.3',
        expanded: false
      }
    ]
  },
  {
    title: '第二章 快速开始',
    path: '2',
    expanded: false,
    children: [
      {
        title: '2.1 安装配置',
        path: '2.1',
        expanded: false
      },
      {
        title: '2.2 基础使用',
        path: '2.2',
        expanded: false
      }
    ]
  },
  {
    title: '第三章 高级功能',
    path: '3',
    expanded: false,
    children: [
      {
        title: '3.1 AI 辅助',
        path: '3.1',
        expanded: false
      },
      {
        title: '3.2 知识库',
        path: '3.2',
        expanded: false
      },
      {
        title: '3.3 图表生成',
        path: '3.3',
        expanded: false
      }
    ]
  },
  {
    title: '第四章 附录',
    path: '4',
    expanded: false
  }
]

// 样式计算
const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const outlineContainerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  border: `1px solid ${themeState.currentTheme.borderColor || '#e0e0e0'}`
}))

const treeContainerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background
}))

const nodeContentStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.outlineNode || themeState.currentTheme.background
}))

const toolbarStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  borderTop: `1px solid ${themeState.currentTheme.borderColor || '#e0e0e0'}`
}))
</script>

<style scoped>
.outline-demo {
  width: 100%;
  height: 400px;
  overflow: hidden;
  border-radius: 8px;
}

.outline-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  overflow: hidden;
}

.tree-container {
  flex: 1;
  overflow: auto;
  padding: 12px;
}

/* 树节点样式 */
.tree-node {
  position: relative;
}

.node-content {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.node-content:hover {
  filter: brightness(0.95);
}

.node-content:hover .node-actions {
  opacity: 1;
}

.expand-icon {
  flex-shrink: 0;
  opacity: 0.6;
}

.expand-icon.invisible {
  visibility: hidden;
}

.node-title {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
}

.action-btn {
  padding: 2px 4px;
  height: 24px;
}

/* 层级缩进 */
.children-container {
  margin-left: 16px;
  position: relative;
}

.children-container::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 0;
  bottom: 0;
  width: 1px;
  background-color: var(--el-border-color-light);
  opacity: 0.5;
}

.level-1 > .node-content {
  font-weight: 600;
}

.level-1 > .node-content .node-title {
  font-size: 14px;
}

.level-2 > .node-content .node-title {
  font-size: 13px;
}

.level-3 > .node-content .node-title {
  font-size: 12px;
  opacity: 0.9;
}

/* 根节点 */
.root-node > .node-content {
  font-weight: 600;
  margin-bottom: 8px;
}

.root-node > .node-content .node-title {
  font-size: 14px;
  color: var(--el-color-primary);
}

/* 工具栏 */
.toolbar {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  flex-shrink: 0;
}

.toolbar-btn {
  width: 32px;
  height: 32px;
}
</style>
