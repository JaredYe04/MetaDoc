<template>
  <div class="manual-search">
    <div ref="rootRef" class="search-row">
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            class="path-button"
            variant="ghost"
            size="icon"
            type="button"
            @click="togglePathPanel"
          >
            <BookOpen class="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start">
          <p>{{ $t('userManual.sidebar.learningPathTooltip') || '查看您的学习进度与推荐学习路径' }}</p>
        </TooltipContent>
      </Tooltip>

      <div class="relative flex-1">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        v-model="query"
        :placeholder="$t('userManual.searchPlaceholder') || '搜索文档...'"
        class="pl-10"
        @input="handleSearch"
        @keydown.enter="handleEnter"
        @keydown.esc="clearSearch"
      />
      </div>

      <!-- 推荐学习路径 panel（点外部关闭） -->
      <div v-if="pathPanelOpen" class="path-panel" @click.stop>
        <LearningProgress :show-list-switch="false" />
        <LearningPathList :show-header="false" :compact="true" />
      </div>
    </div>

    <div v-if="showResults && results.length > 0" class="search-results">
      <div
        v-for="result in results"
        :key="`${result.type}-${result.articleId}-${result.lineNumber || 0}`"
        class="search-result-item"
        @click="handleResultClick(result)"
      >
        <div class="result-header">
          <el-icon class="result-icon">
            <Document v-if="result.type === 'article'" />
            <DocumentCopy v-else />
          </el-icon>
          <span class="result-title">{{ result.title }}</span>
          <Badge v-if="result.type === 'fragment'" variant="secondary">
            {{ $t('userManual.search.fragment') || '片段' }}
          </Badge>
        </div>
        <div v-if="result.fragment" class="result-fragment">
          {{ result.fragment }}
        </div>
        <div v-if="result.lineNumber" class="result-line">
          {{ $t('userManual.search.line') || '行' }} {{ result.lineNumber }}
        </div>
      </div>
    </div>

    <div v-else-if="showResults && query && results.length === 0" class="search-empty">
      <Empty
        :description="$t('userManual.search.noResults') || '未找到相关文档'"
        :image-size="80"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useUserManual } from '../../stores/userManual'
import { Document, DocumentCopy } from '@element-plus/icons-vue'
import { Search, BookOpen } from 'lucide-vue-next'
import { Input } from '@renderer/components/ui/input'
import { Badge } from '@renderer/components/ui/badge'
import { Empty } from '@renderer/components/ui/empty'
import { Button } from '@renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import LearningProgress from './LearningProgress.vue'
import LearningPathList from './LearningPathList.vue'
import type { SearchResult } from '../../manuals/types'
import eventBus from '../../utils/event-bus'

const { searchQuery, searchResults, performSearch, setCurrentArticle } = useUserManual()

const query = ref('')
const showResults = ref(false)
const pathPanelOpen = ref(false)
const rootRef = ref<HTMLElement | null>(null)

watch(searchQuery, (newVal) => {
  query.value = newVal
  if (newVal) {
    handleSearch(newVal)
  } else {
    showResults.value = false
  }
})

const results = ref<SearchResult[]>([])

const handleSearch = async (value: string | Event) => {
  // 处理 @input 事件传递的 Event 对象
  const searchValue = typeof value === 'string' ? value : query.value

  if (!searchValue.trim()) {
    results.value = []
    showResults.value = false
    return
  }

  const searchResults = await performSearch(searchValue)
  results.value = searchResults
  showResults.value = true
}

const handleEnter = () => {
  if (results.value.length > 0) {
    handleResultClick(results.value[0])
  }
}

const clearSearch = () => {
  query.value = ''
  results.value = []
  showResults.value = false
  searchQuery.value = ''
}

const togglePathPanel = () => {
  pathPanelOpen.value = !pathPanelOpen.value
}

const closePathPanel = () => {
  pathPanelOpen.value = false
}

const handleResultClick = (result: SearchResult) => {
  setCurrentArticle(result.articleId, 'search')
  // 搜索跳转也需要左侧定位与展开
  eventBus.emit('manual-navigation-focus-article', { articleId: result.articleId })
  showResults.value = false
  query.value = ''
  searchQuery.value = ''

  // 如果是片段结果，可以滚动到对应位置（需要实现）
  if (result.type === 'fragment' && result.lineNumber) {
    // TODO: 实现滚动到指定行
  }
}

const onDocumentClick = (e: MouseEvent) => {
  if (!pathPanelOpen.value) return
  const root = rootRef.value
  if (!root) return
  const target = e.target as Node | null
  if (target && !root.contains(target)) {
    closePathPanel()
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick, true)
})
</script>

<style scoped>
.manual-search {
  position: relative;
}

.search-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}

.path-button {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
}

.path-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: 360px;
  max-width: min(360px, calc(100vw - 48px));
  background-color: v-bind('themeState.currentTheme.background');
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.12)"');
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
  z-index: 99999;
  overflow: hidden;
}

.path-panel :deep(.learning-progress) {
  padding: 12px 12px;
  border-bottom: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.08)"');
}

.path-panel :deep(.learning-path-list) {
  border-bottom: none;
}

.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 8px;
  max-height: 400px;
  overflow-y: auto;
  background-color: v-bind('themeState.currentTheme.background');
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  z-index: 1000;
}

.search-result-item {
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.2s;
  border-bottom: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
}

.search-result-item:last-child {
  border-bottom: none;
}

.search-result-item:hover {
  background-color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"'
  );
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.result-icon {
  font-size: 16px;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.6)"');
}

.result-title {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: v-bind('themeState.currentTheme.textColor');
}

.result-fragment {
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.6)"');
  margin-top: 4px;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.result-line {
  font-size: 11px;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.5)"');
  margin-top: 4px;
}

.search-empty {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 8px;
  background-color: v-bind('themeState.currentTheme.background');
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
  border-radius: 4px;
  z-index: 1000;
}
</style>

<script lang="ts">
import { themeState } from '../../utils/themes'
export { themeState }
</script>
