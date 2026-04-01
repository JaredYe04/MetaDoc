<template>
  <div class="manual-navigation">
    <ScrollArea class="navigation-scrollbar">
      <Tree
        ref="treeRef"
        :data="treeData"
        :props="{ children: 'children', label: 'title' }"
        :default-expand-all="false"
        :highlight-current="true"
        :current-node-key="currentArticleId"
        node-key="id"
        @node-click="handleNodeClick"
        class="navigation-tree"
      >
        <template #default="{ data }">
          <div class="tree-node">
            <Folder v-if="data.children && data.children.length > 0" class="w-4 h-4" />
            <FileText v-else class="w-4 h-4" />
            <span class="node-label">{{ data.title }}</span>
            <Check v-if="!data.children && isArticleRead(data.id)" class="w-4 h-4" />
          </div>
        </template>
      </Tree>
    </ScrollArea>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useUserManual } from '../../stores/userManual'
import { Folder, FileText, Check } from 'lucide-vue-next'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Tree } from '@renderer/components/ui/tree'
import eventBus from '../../utils/event-bus'

const { navigationTree, currentArticleId, articleProgress, setCurrentArticle } = useUserManual()

const treeData = computed(() => navigationTree.value)
const treeRef = ref<InstanceType<typeof Tree> | null>(null)

const isArticleRead = (articleId: string) => {
  const progress = articleProgress.value.get(articleId)
  return progress?.read === true
}

const handleNodeClick = (data: any) => {
  if (data.id) {
    // 如果点击的是有子节点的节点，不设置article（让树自动展开/折叠）
    // 只有当节点没有子节点时才设置article
    if (!data.children || data.children.length === 0) {
      setCurrentArticle(data.id, 'navigation')
    }
  }
}

function scrollCurrentNodeIntoView() {
  nextTick(() => {
    const el = document.querySelector('.navigation-tree .el-tree-node.is-current') as HTMLElement | null
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', inline: 'nearest' })
    }
  })
}

function focusArticle(articleId: string) {
  if (!articleId) return
  // 通过 Tree 的公开方法 setCurrentKey 展开父级节点
  treeRef.value?.setCurrentKey?.(articleId)
  scrollCurrentNodeIntoView()
}

const handleFocusEvent = (payload: unknown) => {
  const { articleId } = (payload as { articleId?: string }) ?? {}
  if (articleId) {
    focusArticle(articleId)
  }
}

onMounted(() => {
  eventBus.on('manual-navigation-focus-article', handleFocusEvent)
})

onBeforeUnmount(() => {
  eventBus.off('manual-navigation-focus-article', handleFocusEvent)
})
</script>

<style scoped>
.manual-navigation {
  flex: 1;
  min-width: 200px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
  background-color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"'
  );
}

.navigation-tree :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background-color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)"'
  );
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

.read-icon {
  font-size: 16px;
  color: #67c23a;
  flex-shrink: 0;
  margin-left: 4px;
}

.navigation-tree :deep(.el-tree-node__expand-icon) {
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.6)"');
}
</style>

<script lang="ts">
import { themeState } from '../../utils/themes'
export { themeState }
</script>
