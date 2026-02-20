<template>
  <div class="learning-path-list">
    <div class="list-header">
      <span class="list-title">{{ $t('userManual.sidebar.recommendedList') }}</span>
    </div>
    <el-scrollbar class="list-scrollbar">
      <div class="path-items">
        <div
          v-for="(articleId, index) in learningPath"
          :key="articleId"
          class="path-item"
          :class="{
            'is-completed': isCompleted(articleId),
            'is-current': articleId === currentArticleId
          }"
          @click="selectItem(articleId)"
          @dblclick.prevent="openItem(articleId)"
        >
          <div class="item-number">{{ index + 1 }}</div>
          <div class="item-content">
            <span class="item-title">{{ getTitle(articleId) }}</span>
          </div>
          <el-icon v-if="isCompleted(articleId)" class="item-check">
            <Check />
          </el-icon>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUserManual } from '../../stores/userManual'
import { Check } from '@element-plus/icons-vue'

const { locale } = useI18n()
const {
  learningPath,
  articleProgress,
  currentArticleId,
  setCurrentArticle,
  getArticleById
} = useUserManual()

const articleTitles = ref<Map<string, string>>(new Map())

const loadTitles = async () => {
  if (learningPath.value.length === 0) return
  const titles = new Map<string, string>()
  const currentLocale = locale.value || 'zh_CN'
  for (const id of learningPath.value) {
    const article = await getArticleById(id)
    if (article) {
      titles.set(id, article.title[currentLocale] || article.title.en_US || id)
    }
  }
  articleTitles.value = titles
}

onMounted(loadTitles)
watch([learningPath, locale], loadTitles)

function isCompleted(articleId: string) {
  const p = articleProgress.value.get(articleId)
  return p?.read === true
}

function getTitle(articleId: string) {
  return articleTitles.value.get(articleId) || articleId
}

function selectItem(articleId: string) {
  setCurrentArticle(articleId, 'navigation')
}

function openItem(articleId: string) {
  setCurrentArticle(articleId, 'navigation')
}
</script>

<style scoped>
.learning-path-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.08)"');
}

.list-header {
  flex-shrink: 0;
  padding: 10px 12px 8px;
  border-bottom: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.08)"');
}

.list-title {
  font-size: 14px;
  font-weight: 600;
  color: v-bind('themeState.currentTheme.textColor');
}

.list-scrollbar {
  flex: 1;
  min-height: 0;
}

.path-items {
  padding: 8px 12px;
}

.path-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 6px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.path-item:hover {
  background-color: v-bind('themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"');
}

.path-item.is-current {
  background-color: v-bind('themeState.currentTheme.type === "dark" ? "rgba(64, 158, 255, 0.12)" : "rgba(64, 158, 255, 0.08)"');
  color: v-bind('themeState.currentTheme.primaryColor || "#409EFF"');
}

.path-item.is-completed {
  opacity: 0.85;
}

.item-number {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: v-bind('themeState.currentTheme.primaryColor || "#409EFF"');
  color: #fff;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 600;
}

.path-item.is-completed .item-number {
  background-color: #67c23a;
}

.item-content {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-size: 13px;
  color: v-bind('themeState.currentTheme.textColor');
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.path-item.is-current .item-title {
  color: inherit;
}

.item-check {
  font-size: 16px;
  color: #67c23a;
  flex-shrink: 0;
}
</style>

<script lang="ts">
import { themeState } from '../../utils/themes'
export { themeState }
</script>
