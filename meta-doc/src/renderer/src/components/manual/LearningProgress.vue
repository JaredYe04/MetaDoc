<template>
  <div class="learning-progress">
    <div class="progress-header">
      <span class="progress-label">{{ $t('userManual.progress.label') || '学习进度' }}</span>
      <span class="progress-percentage">{{ learningProgress }}%</span>
    </div>
    <el-progress
      :percentage="learningProgress"
      :stroke-width="8"
      :show-text="false"
      :color="progressColor"
    />
    <div class="progress-info">
      <span>{{ completedCount }} / {{ totalCount }} {{ $t('userManual.progress.completed') || '已完成' }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUserManual } from '../../stores/userManual'

const { learningPath, articleProgress, learningProgress } = useUserManual()

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
</script>

<style scoped>
.learning-progress {
  padding: 16px 24px;
  border-bottom: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
  background-color: v-bind('themeState.currentTheme.background2nd');
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.progress-label {
  font-size: 14px;
  font-weight: 500;
  color: v-bind('themeState.currentTheme.textColor');
}

.progress-percentage {
  font-size: 16px;
  font-weight: 600;
  color: v-bind('themeState.currentTheme.primaryColor || "#409EFF"');
}

.progress-info {
  margin-top: 8px;
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.6)"');
}
</style>

<script lang="ts">
import { themeState } from '../../utils/themes'
export { themeState }
</script>
