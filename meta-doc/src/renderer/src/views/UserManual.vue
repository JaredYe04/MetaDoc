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
        <Button v-if="currentArticleId" variant="ghost" @click="exportCurrentArticleAsPureMarkdown">
          <Download class="mr-2 h-4 w-4" />
          {{ $t('userManual.exportPureMarkdown') || '导出纯 Markdown' }}
        </Button>
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
        <ManualNavigation />
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

    <Dialog v-model:open="onboardingLearningHintOpen" modal>
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t('userManual.onboardingLearningHintTitle') }}</DialogTitle>
          <DialogDescription class="text-left">
            {{ t('userManual.onboardingLearningHintBody') }}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" @click="dismissOnboardingLearningHint">
            {{ t('userManual.onboardingLearningHintOk') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onActivated, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import ManualNavigation from '../components/manual/ManualNavigation.vue'
import ManualContent from '../components/manual/ManualContent.vue'
import ManualOverview from '../components/manual/ManualOverview.vue'
import ManualSearch from '../components/manual/ManualSearch.vue'
import UserProfileDialog from '../components/manual/UserProfileDialog.vue'
import ResizableDivider from '../components/base/ResizableDivider.vue'
import { User, ArrowLeft, LayoutDashboard, Send, Download } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { useUserManual } from '../stores/userManual'
import CelebrationOverlay from '../components/CelebrationOverlay.vue'
import { useWorkspace } from '../stores/workspace'
import { toPureManualMarkdown } from '../manuals/pure-markdown'

const { t, locale } = useI18n()
const {
  currentArticleId,
  currentArticleContent,
  setCurrentArticle,
  setUserProfile,
  learningProgress,
  getArticleById
} = useUserManual()
const workspace = useWorkspace()

const profileDialogRef = ref<InstanceType<typeof UserProfileDialog> | null>(null)
/** 是否显示庆祝动画 */
const showCelebration = ref(false)

const MANUAL_ONBOARDING_HINT_KEY = 'metadoc_show_manual_learning_hint'
const onboardingLearningHintOpen = ref(false)

function dismissOnboardingLearningHint() {
  onboardingLearningHintOpen.value = false
  try {
    sessionStorage.removeItem(MANUAL_ONBOARDING_HINT_KEY)
  } catch {
    /* ignore */
  }
}

function tryOpenOnboardingLearningHint() {
  try {
    if (sessionStorage.getItem(MANUAL_ONBOARDING_HINT_KEY) === '1') {
      onboardingLearningHintOpen.value = true
    }
  } catch {
    /* ignore */
  }
}

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

const exportCurrentArticleAsPureMarkdown = async () => {
  const articleId = currentArticleId.value
  if (!articleId) return

  const raw = currentArticleContent.value ?? ''
  const pure = toPureManualMarkdown(raw)

  const article = await getArticleById(articleId)
  const currentLocale = locale.value || 'zh_CN'
  const baseTitle =
    (article?.title?.[currentLocale] as string | undefined) ||
    (article?.title?.en_US as string | undefined) ||
    articleId
  const title = `${baseTitle}（导出）`

  const snapshot = workspace.createDocumentSnapshotFromTemplate('md', '')
  snapshot.markdown = pure
  snapshot.format = 'md'
  // 导出后默认进入编辑器视图（ViewMenu：Editor），且为正式 tab（非 preview）
  snapshot.lastView = 'editor'
  snapshot.meta = { ...snapshot.meta, title }

  const tab = workspace.addDocumentTab(snapshot, {
    kind: 'file',
    title,
    subtitle: '用户手册导出',
    readonly: false,
    preview: false
  })
  workspace.activateTab(tab.id)
}

// 学习进度达到 100% 时显示庆祝动画，并切换为普通手册
watch(
  () => learningProgress.value,
  (newProgress, oldProgress) => {
    // 只在从非100%变为100%时触发
    if (newProgress >= 100 && oldProgress < 100) {
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

onMounted(() => {
  console.log('[UserManual] Component mounted:', {
    learningProgress: learningProgress.value,
    hasLearningProgress: learningProgress.value > 0
  })
  window.addEventListener('keydown', handleKeyDown)
})

onActivated(() => {
  tryOpenOnboardingLearningHint()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<script lang="ts">
import { themeState } from '../utils/themes'
export { themeState }
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
