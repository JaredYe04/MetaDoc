<template>
  <div class="manual-overview">
    <ScrollArea class="overview-scrollbar">
      <div class="overview-content">
        <!-- 欢迎区域 -->
        <div class="welcome-section">
          <h1 class="welcome-title">{{ $t('userManual.overview.welcome') || '欢迎使用用户手册' }}</h1>
          <p class="welcome-description">
            {{ $t('userManual.overview.description') || '根据您的使用偏好，我们为您推荐了最适合的学习路径' }}
          </p>
        </div>

        <!-- 使用定位（用户画像） -->
        <div v-if="userProfile" class="profile-section">
          <h2 class="section-title">
            <User class="w-4 h-4" />
            {{ $t('userManual.overview.profileSummary') || '您的使用定位' }}
          </h2>
          <UserProfileVisualization :profile="userProfile" @reanalyze="openProfileDialog" />
        </div>

        <!-- 学习进度 -->
        <div v-if="learningPath.length > 0" class="progress-section">
          <h2 class="section-title">
            <BarChart3 class="w-4 h-4" />
            {{ $t('userManual.overview.progress') || '学习进度' }}
          </h2>
          <div class="progress-card">
            <div class="progress-header">
              <span class="progress-label">{{ $t('userManual.progress.label') || '学习进度' }}</span>
              <span class="progress-percentage">{{ learningProgress }}%</span>
            </div>
            <Progress
              :percentage="learningProgress"
              :stroke-width="12"
              :show-text="false"
              :color="progressColor"
            />
            <div class="progress-info">
              <span>{{ completedCount }} / {{ totalCount }} {{ $t('userManual.progress.completed') || '已完成' }}</span>
            </div>
          </div>
        </div>

        <!-- 推荐学习路径 -->
        <div v-if="learningPath.length > 0" class="path-section">
          <h2 class="section-title">
            <BookOpen class="w-4 h-4" />
            {{ $t('userManual.overview.recommendedPath') || '推荐学习路径' }}
          </h2>
          <div class="path-card">
            <div class="path-description">
              <p>{{ pathDescription }}</p>
            </div>
            <!-- 有向图展示：点击节点仅选中，与下方列表双向联动 -->
            <div class="path-graph-container">
              <LearningGraph
                v-model:selected-id="selectedNodeId"
                :default-expanded="true"
              />
            </div>
            <div class="path-steps">
              <div
                v-for="(articleId, index) in learningPath"
                :key="articleId"
                class="path-step"
                :class="{
                  'is-completed': isArticleCompleted(articleId),
                  'is-current': articleId === currentArticleId,
                  'is-selected': articleId === selectedNodeId
                }"
                @click="selectStep(articleId)"
                @dblclick.prevent="startLearningStep(articleId)"
              >
                <div class="step-number">{{ index + 1 }}</div>
                <div class="step-content">
                  <div class="step-title">{{ getArticleTitle(articleId) }}</div>
                  <div class="step-meta">
                    <Badge v-if="isArticleCompleted(articleId)" variant="default">
                      {{ $t('userManual.overview.completed') || '已完成' }}
                    </Badge>
                    <Badge v-else-if="articleId === currentArticleId" variant="default">
                      {{ $t('userManual.overview.current') || '当前' }}
                    </Badge>
                    <Badge v-else variant="secondary">
                      {{ $t('userManual.overview.pending') || '待学习' }}
                    </Badge>
                  </div>
                </div>
                <Check class="w-4 h-4" />
              </div>
            </div>
            <div class="path-actions">
            <Button
              :disabled="!selectedNodeId"
              @click="startSelectedLearning"
            >
              <FileText class="mr-2 h-4 w-4" />
              {{ $t('userManual.overview.startLearning') || '开始学习' }}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              @click="handleClearProgress"
            >
              {{ $t('userManual.progress.clearProgress') || '清空学习进度' }}
            </Button>
            </div>
          </div>
        </div>

        <!-- 快速开始 -->
        <div v-else class="quick-start-section">
          <h2 class="section-title">
            <Zap class="w-4 h-4" />
            {{ $t('userManual.overview.quickStart') || '快速开始' }}
          </h2>
          <div class="quick-start-card">
            <p>{{ $t('userManual.overview.noProfile') || '还没有设置用户画像？让我们先了解一下您的使用偏好，以便为您推荐最适合的学习路径。' }}</p>
            <Button
              @click="openProfileDialog"
            >
              <User class="mr-2 h-4 w-4" />
              {{ $t('userManual.profile.buttonText') || '完善我的使用偏好' }}
            </Button>
          </div>
        </div>

        <!-- 快速链接 -->
        <div class="quick-links-section">
          <h2 class="section-title">
            <Link class="w-4 h-4" />
            {{ $t('userManual.overview.quickLinks') || '快速链接' }}
          </h2>
          <div class="quick-links-grid">
            <div
              v-for="category in quickLinks"
              :key="category.id"
              class="quick-link-card"
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
              <div class="link-count">{{ category.count }} {{ $t('userManual.overview.articles') || '篇文章' }}</div>
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
import { ElMessage, ElMessageBox } from 'element-plus'
import { Button } from '@renderer/components/ui/button'
import { useUserManual } from '../../stores/userManual'
import type { UserProfile, ManualCategory } from '../../stores/userManual'
import UserProfileVisualization from './UserProfileVisualization.vue'
import LearningGraph from './LearningGraph.vue'
import {
  User,
  BarChart3,
  BookOpen,
  Check,
  FileText,
  Zap,
  Link
} from 'lucide-vue-next'
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

const emit = defineEmits<{
  openProfile: []
  viewGraph: []
}>()

const completedCount = computed(() => {
  return learningPath.value.filter(id => {
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
      const article = category.articles.find(a => a.id === articleId)
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

/** 仅选中步骤（与图节点双向绑定），不跳转 */
const selectStep = (articleId: string) => {
  selectedNodeId.value = selectedNodeId.value === articleId ? null : articleId
}

const selectedNodeId = ref<string | null>(null)

/** 点击「开始学习」再跳转到选中的文档 */
const startSelectedLearning = () => {
  if (selectedNodeId.value) {
    setCurrentArticle(selectedNodeId.value, 'navigation')
    selectedNodeId.value = null
  }
}

/** 双击列表项直接开始学习 */
const startLearningStep = (articleId: string) => {
  setCurrentArticle(articleId, 'navigation')
  selectedNodeId.value = null
}

/** 清空当前推荐路径的学习进度 */
const handleClearProgress = async () => {
  try {
    await ElMessageBox.confirm(
      t('userManual.progress.clearProgressConfirm'),
      t('userManual.progress.clearProgress') || '清空学习进度',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    clearLearningProgress()
    ElMessage.success(t('userManual.progress.clearProgressDone') || '学习进度已清空')
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
  'core': 'FileIcon',
  'markdown': 'MdDocIcon',
  'latex': 'TexDocIcon',
  'ai': 'AiLogo',
  'agent': 'AiLogo',
  'knowledge-base': 'KnowledgeIcon',
  'settings': 'SettingIcon',
  'charts': 'VisualIcon'
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
  return manualIndex.value.categories.map(category => ({
    id: category.id,
    title: category.title[currentLocale] || category.title.en_US || category.id,
    icon: category.icon, // 保留emoji作为fallback
    iconPath: getCategoryIconPath(category.id), // SVG图标路径
    count: category.articles.length
  }))
})

const navigateToCategory = async (categoryId: string) => {
  if (!manualIndex.value) return
  
  const category = manualIndex.value.categories.find(c => c.id === categoryId)
  if (category && category.articles.length > 0) {
    await setCurrentArticle(category.articles[0].id, 'navigation')
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
  padding: 32px;
  margin: 0 auto;
  box-sizing: border-box;
}

.welcome-section {
  text-align: center;
  margin-bottom: 48px;
  padding: 32px;
  background-color: v-bind('themeState.currentTheme.background2nd');
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
  border-radius: 8px;
}

.welcome-title {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 12px 0;
  color: v-bind('themeState.currentTheme.textColor');
}

.welcome-description {
  font-size: 14px;
  margin: 0;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.6)"');
  line-height: 1.6;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 16px 0;
  color: v-bind('themeState.currentTheme.textColor');
}

.profile-section,
.progress-section,
.path-section,
.quick-start-section,
.quick-links-section {
  margin-bottom: 32px;
}

.progress-card,
.path-card,
.quick-start-card {
  padding: 24px;
  background-color: v-bind('themeState.currentTheme.background2nd');
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
  border-radius: 8px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.progress-label {
  font-size: 16px;
  font-weight: 500;
  color: v-bind('themeState.currentTheme.textColor');
}

.progress-percentage {
  font-size: 24px;
  font-weight: 600;
  color: v-bind('themeState.currentTheme.primaryColor || "#409EFF"');
}

.progress-info {
  margin-top: 12px;
  font-size: 14px;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.6)"');
}

.path-description {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
}

.path-description p {
  margin: 0;
  color: v-bind('themeState.currentTheme.textColor');
  line-height: 1.6;
}

.path-graph-container {
  margin-bottom: 24px;
  height: 360px;
  min-height: 320px;
}

.path-graph-container :deep(.learning-graph) {
  border: none;
  background-color: transparent;
  margin-bottom: 0;
  height: 100%;
}

.path-graph-container :deep(.graph-content) {
  padding: 16px;
  height: calc(100% - 48px);
  box-sizing: border-box;
}

.path-graph-container :deep(.graph-canvas) {
  min-height: 0;
  height: 100%;
}

.path-steps {
  margin-bottom: 24px;
}

.path-step {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  margin-bottom: 12px;
  background-color: v-bind('themeState.currentTheme.background');
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.path-step:hover {
  background-color: v-bind('themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"');
  border-color: v-bind('themeState.currentTheme.primaryColor || "#409EFF"');
}

.path-step.is-completed {
  opacity: 0.7;
}

.path-step.is-current {
  border-color: v-bind('themeState.currentTheme.primaryColor || "#409EFF"');
  background-color: v-bind('themeState.currentTheme.type === "dark" ? "rgba(64, 158, 255, 0.1)" : "rgba(64, 158, 255, 0.05)"');
}

.path-step.is-selected {
  border-color: #e6a23c;
  background-color: v-bind('themeState.currentTheme.type === "dark" ? "rgba(230, 162, 60, 0.12)" : "rgba(230, 162, 60, 0.08)"');
}

.step-number {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: v-bind('themeState.currentTheme.primaryColor || "#409EFF"');
  color: white;
  border-radius: 50%;
  font-weight: 600;
  flex-shrink: 0;
}

.path-step.is-completed .step-number {
  background-color: #67c23a;
}

.step-content {
  flex: 1;
  min-width: 0;
}

.step-title {
  font-size: 16px;
  font-weight: 500;
  color: v-bind('themeState.currentTheme.textColor');
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-meta {
  display: flex;
  gap: 8px;
}

.step-check {
  font-size: 20px;
  color: #67c23a;
  flex-shrink: 0;
}

.path-actions {
  display: flex;
  gap: 12px;
  padding-top: 24px;
  border-top: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
}

.quick-start-card {
  text-align: center;
  padding: 48px 24px;
}

.quick-start-card p {
  margin: 0 0 24px 0;
  color: v-bind('themeState.currentTheme.textColor');
  line-height: 1.6;
}

.quick-links-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.quick-link-card {
  padding: 24px;
  background-color: v-bind('themeState.currentTheme.background2nd');
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
  border-radius: 8px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.quick-link-card:hover {
  border-color: v-bind('themeState.currentTheme.primaryColor || "#409EFF"');
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.link-icon {
  width: 32px;
  height: 32px;
  margin: 0 auto 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.link-icon-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.link-icon-emoji {
  font-size: 32px;
  line-height: 1;
}

.link-title {
  font-size: 16px;
  font-weight: 500;
  color: v-bind('themeState.currentTheme.textColor');
  margin-bottom: 8px;
}

.link-count {
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.6)"');
}
</style>

