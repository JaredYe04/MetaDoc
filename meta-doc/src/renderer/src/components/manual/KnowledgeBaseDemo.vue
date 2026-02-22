<template>
  <div class="knowledge-base-demo" :style="containerStyle">
    <!-- 左侧分类列表 -->
    <div class="category-sidebar" :style="sidebarStyle">
      <div class="sidebar-header">
        <Button size="sm" disabled>
          <Plus class="w-4 h-4 mr-1" />
          {{ t('knowledgeBase.addCategory', '新建分类') }}
        </Button>
      </div>
      <div class="category-list">
        <div
          v-for="(category, index) in demoCategories"
          :key="category.id"
          class="category-item"
          :class="{ active: activeCategory === index }"
        >
          <Folder class="w-4 h-4 category-icon" />
          <span class="category-name">{{ category.name }}</span>
          <span class="category-count">{{ category.count }}</span>
        </div>
      </div>
    </div>

    <!-- 右侧内容区 -->
    <div class="content-area" :style="contentAreaStyle">
      <!-- 搜索栏 -->
      <div class="search-bar">
        <div class="search-input-wrapper">
          <Search class="w-4 h-4 search-icon" />
          <input
            type="text"
            class="search-input"
            :placeholder="t('knowledgeBase.searchPlaceholder', '搜索知识库...')"
            disabled
          />
        </div>
        <div class="search-actions">
          <Button variant="outline" size="sm" disabled>
            <Upload class="w-4 h-4 mr-1" />
            {{ t('knowledgeBase.import', '导入') }}
          </Button>
          <Button size="sm" disabled>
            <Plus class="w-4 h-4 mr-1" />
            {{ t('knowledgeBase.addDocument', '添加文档') }}
          </Button>
        </div>
      </div>

      <!-- 文档列表 -->
      <div class="document-list">
        <div
          v-for="doc in demoDocuments"
          :key="doc.id"
          class="document-card"
          :style="documentCardStyle"
        >
          <div class="document-icon">
            <component :is="doc.icon" class="w-8 h-8" />
          </div>

          <div class="document-info">
            <div class="document-header">
              <span class="document-title">{{ doc.title }}</span>
              <div class="document-tags">
                <span
                  v-for="(tag, tagIndex) in doc.tags"
                  :key="tagIndex"
                  class="document-tag"
                  :style="tagStyle"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
            <div class="document-meta">
              <span class="meta-item">
                <FileText class="w-3 h-3" />
                {{ doc.size }}
              </span>
              <span class="meta-item">
                <Clock class="w-3 h-3" />
                {{ doc.date }}
              </span>
            </div>
            <p class="document-desc">{{ doc.description }}</p>
          </div>

          <div class="document-actions">
            <Button variant="ghost" size="sm" disabled>
              <Eye class="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" disabled>
              <MoreVertical class="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <!-- 统计信息 -->
      <div class="stats-bar">
        <div class="stat-item">
          <span class="stat-value">128</span>
          <span class="stat-label">{{ t('knowledgeBase.stats.documents', '文档') }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">12</span>
          <span class="stat-label">{{ t('knowledgeBase.stats.categories', '分类') }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">2.5MB</span>
          <span class="stat-label">{{ t('knowledgeBase.stats.size', '总大小') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@renderer/components/ui/button'
import {
  Plus,
  Folder,
  Search,
  Upload,
  FileText,
  FileCode,
  Image as ImageIcon,
  FileText as Pdf,
  Clock,
  Eye,
  MoreVertical
} from 'lucide-vue-next'
import { themeState } from '@renderer/utils/themes'

const { t } = useI18n()

const activeCategory = 0

const demoCategories = [
  { id: 'all', name: t('knowledgeBase.categories.all', '全部文档'), count: 128 },
  { id: 'work', name: t('knowledgeBase.categories.work', '工作文档'), count: 45 },
  { id: 'study', name: t('knowledgeBase.categories.study', '学习资料'), count: 32 },
  { id: 'reference', name: t('knowledgeBase.categories.reference', '参考资料'), count: 28 },
  { id: 'templates', name: t('knowledgeBase.categories.templates', '模板文件'), count: 15 },
  { id: 'archive', name: t('knowledgeBase.categories.archive', '归档文件'), count: 8 }
]

const demoDocuments = [
  {
    id: '1',
    title: '产品需求文档 v2.0',
    icon: FileText,
    size: '2.3MB',
    date: '2024-02-20',
    tags: ['PRD', '产品'],
    description: 'MetaDoc 产品需求文档，包含功能规格说明和交互设计。'
  },
  {
    id: '2',
    title: 'API 接口文档',
    icon: FileCode,
    size: '856KB',
    date: '2024-02-18',
    tags: ['技术', 'API'],
    description: '后端 API 接口规范文档，包含请求参数和响应格式。'
  },
  {
    id: '3',
    title: '设计规范手册',
    icon: ImageIcon,
    size: '15.2MB',
    date: '2024-02-15',
    tags: ['设计', 'UI'],
    description: '产品 UI 设计规范，包含色彩、字体、组件规范。'
  },
  {
    id: '4',
    title: '项目计划书',
    icon: Pdf,
    size: '3.1MB',
    date: '2024-02-10',
    tags: ['计划', '管理'],
    description: '2024年 Q1 项目计划，包含里程碑和任务分配。'
  }
]

// 样式计算
const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const sidebarStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  borderRight: `1px solid ${themeState.currentTheme.borderColor || '#e0e0e0'}`
}))

const contentAreaStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background
}))

const documentCardStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  border: `1px solid ${themeState.currentTheme.borderColor || '#e0e0e0'}`
}))

const tagStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))
</script>

<style scoped>
.knowledge-base-demo {
  width: 100%;
  height: 500px;
  display: flex;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-light);
}

/* 分类侧边栏 */
.category-sidebar {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.category-list {
  flex: 1;
  padding: 8px;
  overflow-y: auto;
}

.category-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 2px;
}

.category-item:hover {
  background-color: var(--el-color-primary-light-9);
}

.category-item.active {
  background-color: var(--el-color-primary-light-8);
}

.category-icon {
  opacity: 0.6;
}

.category-name {
  flex: 1;
  font-size: 13px;
}

.category-count {
  font-size: 11px;
  opacity: 0.5;
  padding: 2px 6px;
  background-color: var(--el-bg-color-page);
  border-radius: 10px;
}

/* 内容区域 */
.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* 搜索栏 */
.search-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--el-border-color-light);
  gap: 16px;
}

.search-input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background-color: var(--el-bg-color);
}

.search-icon {
  opacity: 0.5;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: inherit;
}

.search-actions {
  display: flex;
  gap: 8px;
}

/* 文档列表 */
.document-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.document-card {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px;
  border-radius: 8px;
  transition: all 0.2s;
}

.document-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.document-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  background-color: var(--el-color-primary-light-9);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.document-info {
  flex: 1;
  min-width: 0;
}

.document-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}

.document-title {
  font-size: 14px;
  font-weight: 600;
}

.document-tags {
  display: flex;
  gap: 6px;
}

.document-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--el-border-color-light);
}

.document-meta {
  display: flex;
  gap: 16px;
  margin-bottom: 6px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  opacity: 0.6;
}

.document-desc {
  font-size: 13px;
  opacity: 0.7;
  margin: 0;
  line-height: 1.5;
}

.document-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.document-card:hover .document-actions {
  opacity: 1;
}

/* 统计栏 */
.stats-bar {
  display: flex;
  gap: 32px;
  padding: 16px 20px;
  border-top: 1px solid var(--el-border-color-light);
  background-color: var(--el-bg-color-page);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--el-color-primary);
}

.stat-label {
  font-size: 13px;
  opacity: 0.7;
}
</style>
