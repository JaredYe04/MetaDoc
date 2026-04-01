<template>
  <div class="manual-overview">
    <ScrollArea class="overview-scrollbar">
      <div class="overview-content">
        <!-- 快速链接（放最前） -->
        <div class="quick-links-section">
          <div class="section-header">
            <h2 class="section-title">
              <Link class="w-4 h-4" />
              {{ $t('userManual.overview.quickLinks') || '快速链接' }}
            </h2>
          </div>
          <div class="quick-links-grid">
            <button
              v-for="category in quickLinks"
              :key="category.id"
              class="quick-link-card"
              type="button"
              @click="navigateToCategory(category.id)"
            >
              <div class="link-icon">
                <img
                  v-if="category.iconPath"
                  :src="category.iconPath"
                  :alt="category.title"
                  class="link-icon-image"
                />
                <span v-else class="link-icon-emoji">{{ category.icon }}</span>
              </div>
              <div class="link-title">{{ category.title }}</div>
              <div class="link-count">
                {{ category.count }} {{ $t('userManual.overview.articles') || '篇文章' }}
              </div>
            </button>
          </div>
        </div>

        <!-- 推荐学习路径（合并：使用定位 + 学习进度 + 路径列表） -->
        <div class="path-panel">
          <div class="section-header">
            <h2 class="section-title">
              <BookOpen class="w-4 h-4" />
              {{ $t('userManual.overview.recommendedPath') || '推荐学习路径' }}
            </h2>
            <Button v-if="learningPath.length > 0" variant="ghost" size="sm" @click="handleClearProgress">
              {{ $t('userManual.progress.clearProgress') || '清空学习进度' }}
            </Button>
          </div>

          <div class="path-card">
            <div v-if="userProfile" class="path-profile">
              <UserProfileVisualization :profile="userProfile" @reanalyze="openProfileDialog" />
            </div>

            <div v-if="learningPath.length > 0" class="path-progress-row">
              <div class="progress-meta">
                <span class="progress-label">{{ $t('userManual.progress.label') || '学习进度' }}</span>
                <span class="progress-value">{{ learningProgress }}%</span>
                <span class="progress-sub">
                  {{ completedCount }} / {{ totalCount }} {{ $t('userManual.progress.completed') || '已完成' }}
                </span>
              </div>
              <Progress
                class="progress-bar"
                :percentage="learningProgress"
                :stroke-width="10"
                :show-text="false"
                :color="progressColor"
              />
            </div>

            <div v-if="learningPath.length === 0" class="path-empty">
              <p class="path-empty-text">
                {{
                  $t('userManual.overview.noProfile') ||
                  '还没有设置用户画像？让我们先了解一下您的使用偏好，以便为您推荐最适合的学习路径。'
                }}
              </p>
              <Button size="sm" @click="openProfileDialog">
                <User class="mr-2 h-4 w-4" />
                {{ $t('userManual.profile.buttonText') || '完善我的使用偏好' }}
              </Button>
            </div>

            <div v-if="learningPath.length > 0" class="path-steps">
              <button
                v-for="(articleId, index) in learningPath"
                :key="articleId"
                class="path-step"
                type="button"
                :class="{
                  'is-completed': isArticleCompleted(articleId),
                  'is-current': articleId === currentArticleId
                }"
                @click="startLearningStep(articleId)"
              >
                <div class="step-number">{{ index + 1 }}</div>
                <div class="step-content">
                  <div class="step-title">{{ getArticleTitle(articleId) }}</div>
                </div>
                <Badge v-if="isArticleCompleted(articleId)" variant="default">
                  {{ $t('userManual.overview.completed') || '已完成' }}
                </Badge>
                <Badge v-else-if="articleId === currentArticleId" variant="secondary">
                  {{ $t('userManual.overview.current') || '当前' }}
                </Badge>
              </button>
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from '@renderer/utils/toast'
import { messageBox } from '@renderer/utils/messageBox'
import { Button } from '@renderer/components/ui/button'
import { useUserManual } from '../../stores/userManual'
import type { UserProfile, ManualCategory } from '../../stores/userManual'
import UserProfileVisualization from './UserProfileVisualization.vue'
 import eventBus from '../../utils/event-bus'
 import { User, BookOpen, Link } from 'lucide-vue-next'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Badge } from '@renderer/components/ui/badge'
import { Progress } from '@renderer/components/ui/progress'
import { themeState } from '../../utils/themes'

const { t, locale } = useI18n()
const {
  userProfile,
  learningPath,
  learningProgress,
  articleProgress,
  currentArticleId,
  manualIndex,
  setCurrentArticle,
  clearLearningProgress,
  getAllArticles,
  getArticleById
} = useUserManual()

// 文章标题缓存
const articleTitles = ref<Map<string, string>>(new Map())

// 加载文章标题
const loadArticleTitles = async () => {
  if (learningPath.value.length > 0) {
    const titles = new Map<string, string>()
    const currentLocale = locale.value || 'zh_CN'

    for (const articleId of learningPath.value) {
      const article = await getArticleById(articleId)
      if (article) {
        titles.set(articleId, article.title[currentLocale] || article.title.en_US || articleId)
      }
    }

    articleTitles.value = titles
  }
}

onMounted(() => {
  loadArticleTitles()
})

// 监听学习路径变化
watch([learningPath, locale], () => {
  loadArticleTitles()
})

const emit = defineEmits<{ openProfile: [] }>()

const completedCount = computed(() => {
  return learningPath.value.filter((id) => {
    const progress = articleProgress.value.get(id)
    return progress?.read === true
  }).length
})

const totalCount = computed(() => {
  return learningPath.value.length
})

const progressColor = computed(() => {
  const progress = learningProgress.value
  if (progress >= 80) return '#67c23a'
  if (progress >= 50) return '#e6a23c'
  return '#409eff'
})

const pathDescription = computed(() => {
  if (!userProfile.value || !manualIndex.value) return ''

  const scenario = userProfile.value.scenario || 'other'
  const path = manualIndex.value.learningPaths[scenario]
  if (!path) return ''

  const currentLocale = locale.value || 'zh_CN'
  return path.description[currentLocale] || path.description.en_US || ''
})

const isArticleCompleted = (articleId: string) => {
  const progress = articleProgress.value.get(articleId)
  return progress?.read === true
}

const getArticleTitle = (articleId: string) => {
  // 先从缓存中获取
  if (articleTitles.value.has(articleId)) {
    return articleTitles.value.get(articleId) || articleId
  }

  // 如果缓存中没有，从索引中查找
  if (manualIndex.value) {
    for (const category of manualIndex.value.categories) {
      const article = category.articles.find((a) => a.id === articleId)
      if (article) {
        const currentLocale = locale.value || 'zh_CN'
        const title = article.title[currentLocale] || article.title.en_US || articleId
        articleTitles.value.set(articleId, title)
        return title
      }
    }
  }

  return articleId
}

/** 双击列表项直接开始学习 */
const startLearningStep = (articleId: string) => {
  setCurrentArticle(articleId, 'navigation')
  // 通知左侧导航树展开并滚动到当前位置
  eventBus.emit('manual-navigation-focus-article', { articleId })
}

/** 清空当前推荐路径的学习进度 */
const handleClearProgress = async () => {
  try {
    await messageBox.confirm(
      t('userManual.progress.clearProgressConfirm'),
      t('userManual.progress.clearProgress') || '清空学习进度',
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      }
    )
    clearLearningProgress()
    toast.success(t('userManual.progress.clearProgressDone') || '学习进度已清空')
  } catch {
    // 用户取消
  }
}

const startFromBeginning = () => {
  if (learningPath.value.length > 0) {
    setCurrentArticle(learningPath.value[0], 'navigation')
  }
}

// 不再需要viewGraph，有向图默认显示

const openProfileDialog = () => {
  emit('openProfile')
}

// 图标映射：将category.id映射到themeState中的SVG图标路径
const categoryIconMap: Record<string, string> = {
  'quick-start': 'HomeIcon',
  core: 'FileIcon',
  markdown: 'MdIcon',
  latex: 'TexIcon',
  ai: 'AiLogo',
  agent: 'AiLogo',
  'knowledge-base': 'KnowledgeIcon',
  settings: 'SettingIcon',
  charts: 'VisualIcon'
}

// 获取类别图标路径
const getCategoryIconPath = (categoryId: string) => {
  const iconKey = categoryIconMap[categoryId]
  if (iconKey && (themeState.currentTheme as any)[iconKey]) {
    return (themeState.currentTheme as any)[iconKey]
  }
  return null
}

const quickLinks = computed(() => {
  if (!manualIndex.value) return []

  const currentLocale = locale.value || 'zh_CN'
  return manualIndex.value.categories.map((category) => ({
    id: category.id,
    title: category.title[currentLocale] || category.title.en_US || category.id,
    icon: category.icon, // 保留emoji作为fallback
    iconPath: getCategoryIconPath(category.id), // SVG图标路径
    count: category.articles.length
  }))
})

const navigateToCategory = async (categoryId: string) => {
  if (!manualIndex.value) return

  const category = manualIndex.value.categories.find((c) => c.id === categoryId)
  if (category && category.articles.length > 0) {
    const firstId = category.articles[0].id
    await setCurrentArticle(firstId, 'navigation')
    // 通知左侧导航树展开并滚动到当前位置
    eventBus.emit('manual-navigation-focus-article', { articleId: firstId })
  }
}
</script>

<style scoped>
.manual-overview {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: v-bind('themeState.currentTheme.background');
}

.overview-scrollbar {
  flex: 1;
  height: 100%;
}

.overview-content {
  width: 100%;
  max-width: 100%;
  padding: 20px;
  margin: 0 auto;
  box-sizing: border-box;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: v-bind('themeState.currentTheme.textColor');
}

.quick-links-section {
  margin-bottom: 14px;
}

.path-card,
.progress-card {
  padding: 16px;
  background-color: v-bind('themeState.currentTheme.background2nd');
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
  border-radius: 8px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.path-panel {
  margin-top: 10px;
}

.path-card {
  padding: 14px;
}

.path-profile {
  margin-bottom: 12px;
}

.path-progress-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background-color: v-bind('themeState.currentTheme.background');
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.08)"');
  margin-bottom: 12px;
}

.progress-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.progress-label {
  font-size: 13px;
  font-weight: 600;
  color: v-bind('themeState.currentTheme.textColor');
}

.progress-value {
  font-size: 13px;
  font-weight: 700;
  color: v-bind('themeState.currentTheme.primaryColor || "#409EFF"');
}

.progress-sub {
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.6)"');
}

.path-steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.path-step {
  appearance: none;
  border: none;
  width: 100%;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background-color: v-bind('themeState.currentTheme.background');
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.path-step:hover {
  background-color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"'
  );
  border-color: v-bind('themeState.currentTheme.primaryColor || "#409EFF"');
}

.path-step.is-current {
  border-color: v-bind('themeState.currentTheme.primaryColor || "#409EFF"');
  background-color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(64, 158, 255, 0.1)" : "rgba(64, 158, 255, 0.05)"'
  );
}

.step-number {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: v-bind('themeState.currentTheme.primaryColor || "#409EFF"');
  color: white;
  border-radius: 50%;
  font-weight: 600;
  flex-shrink: 0;
  font-size: 12px;
}

.path-step.is-completed .step-number {
  background-color: #67c23a;
}

.step-content {
  flex: 1;
  min-width: 0;
}

.step-title {
  font-size: 13px;
  font-weight: 600;
  color: v-bind('themeState.currentTheme.textColor');
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quick-links-grid {
  display: grid;
  /* 更紧凑：降低最小列宽，减少“空旷冗余” */
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 10px;
}

.quick-link-card {
  appearance: none;
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
  padding: 12px;
  background-color: v-bind('themeState.currentTheme.background2nd');
  border-radius: 8px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  color: inherit;
}

.quick-link-card:hover {
  border-color: v-bind('themeState.currentTheme.primaryColor || "#409EFF"');
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.link-icon {
  width: 28px;
  height: 28px;
  margin: 0 auto 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1),
    filter 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
  transform-origin: 50% 50%;
}

.link-icon-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition: inherit;
}

.link-icon-emoji {
  font-size: 28px;
  line-height: 1;
  transition: inherit;
}

.quick-link-card:hover .link-icon {
  transform: scale(1.12);
  animation: quickLinkWiggle 1.9s ease-in-out infinite;
}

@keyframes quickLinkWiggle {
  0% {
    transform: scale(1.12) translateY(0) rotate(0deg);
  }
  25% {
    transform: scale(1.12) translateY(-0.5px) rotate(-1.2deg);
  }
  50% {
    transform: scale(1.12) translateY(0) rotate(1.2deg);
  }
  75% {
    transform: scale(1.12) translateY(0.4px) rotate(-0.8deg);
  }
  100% {
    transform: scale(1.12) translateY(0) rotate(0deg);
  }
}

.link-title {
  font-size: 13px;
  font-weight: 600;
  color: v-bind('themeState.currentTheme.textColor');
  margin-bottom: 4px;
}

.link-count {
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.6)"');
}

.path-empty {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px dashed v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.15)"');
  background-color: transparent;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.path-empty-text {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.6)"');
}
</style>
