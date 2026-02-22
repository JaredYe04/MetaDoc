<template>
  <div class="workspace-explorer-demo" :style="containerStyle">
    <!-- 工具栏 -->
    <div class="toolbar" :style="toolbarStyle">
      <div class="toolbar-left">
        <Button variant="ghost" size="sm" disabled>
          <FolderOpen class="w-4 h-4 mr-1" /
          {{ t('workspace.openFolder', '打开文件夹') }}
        </Button>
        <Button variant="ghost" size="sm" disabled>
          <RefreshCw class="w-4 h-4" /
        </Button>
      </div>
      
      <div class="toolbar-right">
        <Button variant="ghost" size="sm" disabled>
          <List class="w-4 h-4" /
        </Button>
        <Button variant="ghost" size="sm" disabled>
          <MoreVertical class="w-4 h-4" /
        </Button>
      </div>
    </div>

    <!-- 文件树 -->
    <div class="file-tree" :style="fileTreeStyle">
      <!-- 根目录 -->
      <div class="tree-root">
        <div class="tree-item root-item">
          <ChevronDown class="w-4 h-4 tree-toggle" />
          <Folder class="w-4 h-4 tree-icon" />
          <span class="tree-label">my-project</span>
        </div>

        <!-- 子目录和文件 -->
        <div class="tree-children">
          <!-- docs 目录 -->
          <div class="tree-item folder-item"
            <ChevronRight class="w-4 h-4 tree-toggle" /
            <Folder class="w-4 h-4 tree-icon" /
            <span class="tree-label">docs</span>
          </div>

          <!-- src 目录 -->
          <div class="tree-item folder-item">
            <ChevronDown class="w-4 h-4 tree-toggle" /
            <Folder class="w-4 h-4 tree-icon" /
            <span class="tree-label">src</span>
          </div>

          <!-- src 子项 -->
          <div class="tree-children level-2">
            <div class="tree-item file-item"
              <FileCode class="w-4 h-4 tree-icon" /
              <span class="tree-label">main.ts</span>
            </div>
            
            <div class="tree-item file-item"
              <FileCode class="w-4 h-4 tree-icon" /
              <span class="tree-label">app.vue</span>
            </div>
            
            <div class="tree-item folder-item"
              <ChevronRight class="w-4 h-4 tree-toggle" /
              <Folder class="w-4 h-4 tree-icon" /
              <span class="tree-label">components</span>
            </div>
          </div>

          <!-- assets 目录 -->
          <div class="tree-item folder-item"
            <ChevronRight class="w-4 h-4 tree-toggle" /
            <Folder class="w-4 h-4 tree-icon" /
            <span class="tree-label">assets</span>
          </div>

          <!-- README 文件 -->
          <div class="tree-item file-item"
            <FileText class="w-4 h-4 tree-icon" /
            <span class="tree-label">README.md</span>
          </div>

          <!-- package.json -->
          <div class="tree-item file-item active"
            <FileJson class="w-4 h-4 tree-icon" /
            <span class="tree-label">package.json</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部统计 -->
    <div class="footer-stats" :style="footerStyle"
      <span>{{ t('workspace.totalFiles', '共 12 个文件，3 个文件夹') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@renderer/components/ui/button'
import {
  FolderOpen,
  RefreshCw,
  List,
  MoreVertical,
  ChevronRight,
  ChevronDown,
  Folder,
  FileCode,
  FileText,
  FileJson
} from 'lucide-vue-next'
import { themeState } from '@renderer/utils/themes'

const { t } = useI18n()

const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const toolbarStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  borderBottom: `1px solid ${themeState.currentTheme.borderColor || '#e0e0e0'}`
}))

const fileTreeStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background
}))

const footerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  borderTop: `1px solid ${themeState.currentTheme.borderColor || '#e0e0e0'}`
}))
</script>

<style scoped>
.workspace-explorer-demo {
  width: 100%;
  height: 400px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-light);
}

/* 工具栏 */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  flex-shrink: 0;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  gap: 4px;
}

/* 文件树 */
.file-tree {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.tree-root {
  padding-left: 0;
}

.tree-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
  font-size: 13px;
}

.tree-item:hover {
  background-color: var(--el-color-primary-light-9);
}

.tree-item.active {
  background-color: var(--el-color-primary-light-8);
}

.tree-toggle {
  opacity: 0.5;
  flex-shrink: 0;
}

.tree-icon {
  opacity: 0.7;
  flex-shrink: 0;
}

.folder-item .tree-icon {
  color: var(--el-color-warning);
  opacity: 1;
}

.file-item .tree-icon {
  color: var(--el-color-info);
  opacity: 0.8;
}

.tree-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 层级缩进 */
.tree-children {
  padding-left: 20px;
}

.tree-children.level-2 {
  padding-left: 20px;
}

/* 底部统计 */
.footer-stats {
  padding: 8px 12px;
  font-size: 12px;
  opacity: 0.7;
  flex-shrink: 0;
}
</style>
