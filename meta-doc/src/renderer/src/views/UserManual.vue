<template>
  <div class="user-manual-page">
    <div class="manual-header">
      <div class="header-left">
        <el-button
          v-if="currentArticleId"
          text
          :icon="ArrowLeft"
          @click="backToOverview"
        >
          {{ $t('userManual.backToOverview') || '返回概览' }}
        </el-button>
        <h1 class="manual-title">{{ $t('userManual.title') }}</h1>
      </div>
      <div class="header-actions">
        <ManualSearch />
      </div>
    </div>
    <div class="manual-body">
      <!-- 概览页面 -->
      <ManualOverview
        v-if="!currentArticleId"
        @open-profile="openProfileDialog"
      />
      
      <!-- 文档内容页面 -->
      <template v-else>
        <div class="manual-sidebar">
          <LearningProgress v-if="learningPath.length > 0" />
          <LearningGraph v-if="learningPath.length > 0 && showGraph" />
          <ManualNavigation />
        </div>
        <ManualContent />
      </template>
    </div>
    <UserProfileDialog ref="profileDialogRef" @submitted="handleProfileSubmitted" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import ManualNavigation from '../components/manual/ManualNavigation.vue'
import ManualContent from '../components/manual/ManualContent.vue'
import ManualOverview from '../components/manual/ManualOverview.vue'
import ManualSearch from '../components/manual/ManualSearch.vue'
import LearningProgress from '../components/manual/LearningProgress.vue'
import LearningGraph from '../components/manual/LearningGraph.vue'
import UserProfileDialog from '../components/manual/UserProfileDialog.vue'
import { User, ArrowLeft } from '@element-plus/icons-vue'
import { useUserManual } from '../stores/userManual'

const { t } = useI18n()
const { currentArticleId, learningPath, setCurrentArticle, setUserProfile } = useUserManual()

const profileDialogRef = ref<InstanceType<typeof UserProfileDialog> | null>(null)
const showGraph = ref(true) // 默认显示有向图

const openProfileDialog = () => {
  if (profileDialogRef.value) {
    profileDialogRef.value.open()
  }
}

const handleProfileSubmitted = async (profile: any) => {
  // 根据用户画像生成学习路径
  await setUserProfile(profile)
  // 不自动跳转，保持在概览页面，让用户查看学习路径图后自己点击开始学习
  showGraph.value = true
}

// 监听F1快捷键
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'F1') {
    e.preventDefault()
    // F1功能：打开用户手册（如果不在手册页面）
    // 这里可以根据当前路由来决定行为
  }
}

const backToOverview = () => {
  setCurrentArticle('', 'navigation')
  showGraph.value = false
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeyDown)
  // 不设置默认文档，显示概览页面
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
  width: min(320px, 25%);
  min-width: 240px;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
  background-color: v-bind('themeState.currentTheme.background2nd');
  overflow: hidden;
}
</style>

<script lang="ts">
import { themeState } from '../utils/themes'
export { themeState }
</script>
