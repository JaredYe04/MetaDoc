<template>
  <div class="user-manual-page">
    <div class="manual-header">
      <h1 class="manual-title">{{ $t('userManual.title') }}</h1>
      <div class="header-actions">
        <el-button
          type="primary"
          plain
          :icon="User"
          @click="openProfileDialog"
        >
          {{ $t('userManual.profile.buttonText') || '完善我的使用偏好' }}
        </el-button>
        <el-input
          v-model="searchQuery"
          :placeholder="$t('userManual.searchPlaceholder')"
          class="search-input"
          clearable
          @keydown.ctrl.k.prevent="focusSearch"
          @keydown.esc="clearSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </div>
    </div>
    <div class="manual-body">
      <ManualNavigation />
      <ManualContent />
    </div>
    <UserProfileDialog ref="profileDialogRef" @submitted="handleProfileSubmitted" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import ManualNavigation from '../components/manual/ManualNavigation.vue'
import ManualContent from '../components/manual/ManualContent.vue'
import UserProfileDialog from '../components/manual/UserProfileDialog.vue'
import { Search, User } from '@element-plus/icons-vue'
import { useUserManual } from '../stores/userManual'

const { t } = useI18n()
const { setCurrentSection } = useUserManual()

const searchQuery = ref('')
const profileDialogRef = ref<InstanceType<typeof UserProfileDialog> | null>(null)

const openProfileDialog = () => {
  if (profileDialogRef.value) {
    profileDialogRef.value.open()
  }
}

const handleProfileSubmitted = () => {
  // 可以在这里根据用户画像推荐学习路径
  console.log('用户画像已更新')
}

const focusSearch = () => {
  const input = document.querySelector('.search-input input') as HTMLInputElement
  if (input) {
    input.focus()
  }
}

const clearSearch = () => {
  searchQuery.value = ''
}

// 监听F1快捷键
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'F1') {
    e.preventDefault()
    // F1功能：跳转到当前页面对应的教程
    // 这里可以根据当前路由或上下文来决定跳转到哪个章节
    // 暂时先聚焦搜索框
    focusSearch()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  // 设置默认章节
  setCurrentSection('core.fileOperations')
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

.search-input {
  width: 300px;
}

.manual-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}
</style>

<script lang="ts">
import { themeState } from '../utils/themes'
export { themeState }
</script>
