<template>
  <div class="user-manual-page">
    <div class="manual-header">
      <div class="header-left">
        <Button v-if="currentArticleId" variant="ghost" @click="goToOverview">
          <ArrowLeft class="mr-2 h-4 w-4" />
          {{ $t('userManual.backToOverview') || '返回概览' }}
        </Button>
        <h1 class="manual-title">{{ $t('userManual.title') }}</h1>
      </div>
      <div class="header-actions">
        <Button
          v-if="learningProgress >= 100"
          variant="ghost"
          class="text-primary"
          @click="showCelebration = true"
        >
          <Send class="mr-2 h-4 w-4" />
          {{ $t('userManual.replayCelebration') || '重新播放庆祝动画' }}
        </Button>
        <ManualSearch />
      </div>
    </div>
    <div class="manual-body">
      <!-- 左侧：文档列表始终显示，顶部为概览入口 -->
      <div class="manual-sidebar" :style="{ width: sidebarWidthPx }">
        <div
          class="sidebar-overview-entry"
          :class="{ 'is-active': !currentArticleId }"
          @click="goToOverview"
        >
          <LayoutDashboard class="w-4 h-4" />
          <span class="overview-label">{{ $t('userManual.overview.title') || '概览' }}</span>
        </div>
        <template v-if="learningPath.length > 0">
          <LearningProgress v-model:only-recommended="onlyRecommended" :show-list-switch="true" />
          <LearningPathList v-if="onlyRecommended" />
        </template>
        <ManualNavigation v-if="!onlyRecommended || learningPath.length === 0" />
      </div>
      <ResizableDivider
        direction="vertical"
        :size="6"
        :min-value="240"
        :max-value="520"
        @resize="onSidebarResize"
      />
      <!-- 右侧：概览或文档内容 -->
      <div class="manual-main">
        <ManualOverview v-if="!currentArticleId" @open-profile="openProfileDialog" />
        <ManualContent v-else />
      </div>
    </div>
    <UserProfileDialog ref="profileDialogRef" @submitted="handleProfileSubmitted" />

    <!-- Celebration Overlay -->
    <CelebrationOverlay
      :visible="showCelebration"
      @close="showCelebration = false"
      @continue="handleCelebrationContinue"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import ManualNavigation from '../components/manual/ManualNavigation.vue'
import ManualContent from '../components/manual/ManualContent.vue'
import ManualOverview from '../components/manual/ManualOverview.vue'
import ManualSearch from '../components/manual/ManualSearch.vue'
import LearningProgress from '../components/manual/LearningProgress.vue'
import LearningPathList from '../components/manual/LearningPathList.vue'
import UserProfileDialog from '../components/manual/UserProfileDialog.vue'
import ResizableDivider from '../components/base/ResizableDivider.vue'
import { User, ArrowLeft, LayoutDashboard, Send } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import { useUserManual } from '../stores/userManual'
import CelebrationOverlay from '../components/CelebrationOverlay.vue'

const { t } = useI18n()
const { currentArticleId, learningPath, setCurrentArticle, setUserProfile, learningProgress } =
  useUserManual()

const profileDialogRef = ref<InstanceType<typeof UserProfileDialog> | null>(null)
/** 仅显示推荐学习列表（否则显示完整目录） */
const onlyRecommended = ref(true)
/** 是否显示庆祝动画 */
const showCelebration = ref(false)

// 组件挂载时打印诊断信息
onMounted(() => {
  console.log('[UserManual] Component mounted:', {
    learningProgress: learningProgress.value,
    learningPathLength: learningPath.value.length
  })
})

const SIDEBAR_MIN = 240
const SIDEBAR_MAX = 520
const sidebarWidth = ref(320)
const sidebarWidthPx = computed(
  () => `${Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, sidebarWidth.value))}px`
)

const onSidebarResize = (delta: number) => {
  sidebarWidth.value = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, sidebarWidth.value + delta))
}

const openProfileDialog = () => {
  if (profileDialogRef.value) {
    profileDialogRef.value.open()
  }
}

const handleProfileSubmitted = async (profile: any) => {
  await setUserProfile(profile)
}

// 监听F1快捷键
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'F1') {
    e.preventDefault()
    // F1功能：打开用户手册（如果不在手册页面）
    // 这里可以根据当前路由来决定行为
  }
}

const goToOverview = () => {
  setCurrentArticle('', 'navigation')
}

// 学习进度达到 100% 时显示庆祝动画
watch(
  () => learningProgress.value,
  (newProgress, oldProgress) => {
    // 只在从非100%变为100%时触发，且要有学习路径
    if (newProgress >= 100 && oldProgress < 100 && learningPath.value.length > 0) {
      console.log('[UserManual] Progress reached 100%, triggering celebration!')
      showCelebration.value = true
    }
  }
)

// 监控 showCelebration 变化
watch(showCelebration, (newVal) => {
  console.log('[UserManual] showCelebration changed:', newVal)
})

// 处理庆祝动画继续
const handleCelebrationContinue = () => {
  showCelebration.value = false
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.user-manual-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: v-bind('themeState.currentTheme.background');
}

.manual-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
  background-color: v-bind('themeState.currentTheme.background2nd');
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.manual-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  color: v-bind('themeState.currentTheme.textColor');
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-actions .el-button {
  margin-right: 0;
}

.manual-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.manual-sidebar {
  flex: 0 0 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
  background-color: v-bind('themeState.currentTheme.background2nd');
  overflow: hidden;
}

/* 左侧顶部：概览入口（用户画像、学习路线等） */
.sidebar-overview-entry {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  border-bottom: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.08)"');
  color: v-bind('themeState.currentTheme.textColor');
  user-select: none;
}

.sidebar-overview-entry:hover {
  background-color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"'
  );
}

.sidebar-overview-entry.is-active {
  background-color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)"'
  );
  font-weight: 500;
}

.overview-icon {
  font-size: 18px;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.6)"');
  flex-shrink: 0;
}

.sidebar-overview-entry.is-active .overview-icon {
  color: v-bind('themeState.currentTheme.primaryColor || "#409EFF"');
}

.overview-label {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 右侧主内容区 */
.manual-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: v-bind('themeState.currentTheme.background');
}
</style>

<script lang="ts">
import { themeState } from '../utils/themes'
export { themeState }
</script>
