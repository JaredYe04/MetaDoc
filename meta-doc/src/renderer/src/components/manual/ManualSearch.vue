<template>
  <div class="manual-search">
    <div class="relative">
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
          <el-tag v-if="result.type === 'fragment'" size="small" type="info">
            {{ $t('userManual.search.fragment') || '片段' }}
          </el-tag>
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
      <el-empty
        :description="$t('userManual.search.noResults') || '未找到相关文档'"
        :image-size="80"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useUserManual } from '../../stores/userManual'
import { Document, DocumentCopy } from '@element-plus/icons-vue'
import { Search } from 'lucide-vue-next'
import { Input } from '@renderer/components/ui/input'
import type { SearchResult } from '../../manuals/types'

const { searchQuery, searchResults, performSearch, setCurrentArticle } = useUserManual()

const query = ref('')
const showResults = ref(false)

watch(searchQuery, (newVal) => {
  query.value = newVal
  if (newVal) {
    handleSearch(newVal)
  } else {
    showResults.value = false
  }
})

const results = ref<SearchResult[]>([])

const handleSearch = async (value: string) => {
  if (!value.trim()) {
    results.value = []
    showResults.value = false
    return
  }

  const searchResults = await performSearch(value)
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

const handleResultClick = (result: SearchResult) => {
  setCurrentArticle(result.articleId, 'search')
  showResults.value = false
  query.value = ''
  searchQuery.value = ''
  
  // 如果是片段结果，可以滚动到对应位置（需要实现）
  if (result.type === 'fragment' && result.lineNumber) {
    // TODO: 实现滚动到指定行
  }
}
</script>

<style scoped>
.manual-search {
  position: relative;
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
  background-color: v-bind('themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"');
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
