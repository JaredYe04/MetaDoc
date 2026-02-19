<template>
  <div class="user-profile-visualization">
    <!-- 用户画像卡片 -->
    <div class="profile-card">
      <div class="card-header">
        <h3 class="card-title">{{ $t('userManual.profile.title') || '用户画像' }}</h3>
        <el-button
          type="primary"
          plain
          size="small"
          :icon="Refresh"
          @click="handleReanalyze"
          class="reanalyze-btn"
        >
          {{ $t('userManual.profile.reanalyze') || '重新分析' }}
        </el-button>
      </div>

      <div class="profile-content">
        <!-- 使用场景 -->
        <div class="profile-section">
          <div class="section-label">{{ $t('userManual.profile.scenario') || '使用场景' }}</div>
          <el-tag :type="getScenarioTagType(profile.scenario)" size="large" class="scenario-tag">
            {{ getScenarioLabel(profile.scenario) }}
          </el-tag>
        </div>

        <!-- 技能展示 -->
        <div class="skills-section">
          <!-- Markdown技能 -->
          <div class="skill-item">
            <div class="skill-header">
              <span class="skill-name">Markdown</span>
              <span class="skill-level" :style="{ color: getLevelColor(profile.markdownLevel || 0) }">
                {{ getLevelLabel(profile.markdownLevel || 0) }}
              </span>
            </div>
            <div class="skill-bar-wrapper">
              <div 
                class="skill-bar" 
                :style="{ 
                  width: `${getLevelPercentage(profile.markdownLevel || 0, 3)}%`,
                  backgroundColor: getLevelColor(profile.markdownLevel || 0)
                }"
              ></div>
            </div>
          </div>

          <!-- LaTeX技能 -->
          <div class="skill-item">
            <div class="skill-header">
              <span class="skill-name">LaTeX</span>
              <span class="skill-level" :style="{ color: getLevelColor(profile.latexLevel || 0) }">
                {{ getLevelLabel(profile.latexLevel || 0) }}
              </span>
            </div>
            <div class="skill-bar-wrapper">
              <div 
                class="skill-bar" 
                :style="{ 
                  width: `${getLevelPercentage(profile.latexLevel || 0, 3)}%`,
                  backgroundColor: getLevelColor(profile.latexLevel || 0)
                }"
              ></div>
            </div>
          </div>

          <!-- Agent技能 -->
          <div class="skill-item">
            <div class="skill-header">
              <span class="skill-name">AI Agent</span>
              <span class="skill-level" :style="{ color: getAgentLevelColor(profile.agentLevel || 0) }">
                {{ getAgentLevelLabel(profile.agentLevel || 0) }}
              </span>
            </div>
            <div class="skill-bar-wrapper">
              <div 
                class="skill-bar" 
                :style="{ 
                  width: `${getLevelPercentage(profile.agentLevel || 0, 4)}%`,
                  backgroundColor: getAgentLevelColor(profile.agentLevel || 0)
                }"
              ></div>
            </div>
          </div>
        </div>

        <!-- 编辑器经验 -->
        <div v-if="hasEditorExperience" class="experience-section">
          <div class="section-label">{{ $t('userManual.profile.experienceTitle') || '编辑器经验' }}</div>
          <div class="experience-tags">
            <el-tag v-if="profile.usedWysiwygMarkdown" size="small" class="experience-tag">
              WYSIWYG Markdown
            </el-tag>
            <el-tag v-if="profile.usedLatexEditor" size="small" class="experience-tag">
              LaTeX编辑器
            </el-tag>
            <el-tag v-if="profile.usedOtherMarkdownEditor" size="small" class="experience-tag">
              其他Markdown编辑器
            </el-tag>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UserProfile } from '../../stores/userManual'
import { Refresh } from '@element-plus/icons-vue'
import { themeState } from '../../utils/themes'

const props = defineProps<{
  profile: UserProfile
}>()

const emit = defineEmits<{
  reanalyze: []
}>()

const { t } = useI18n()

const handleReanalyze = () => {
  emit('reanalyze')
}

const getScenarioLabel = (scenario?: string) => {
  if (!scenario) return t('userManual.profile.scenarios.other') || '其他'
  return t(`userManual.profile.scenarios.${scenario}`) || scenario
}

const getScenarioTagType = (scenario?: string): 'success' | 'warning' | 'danger' | 'info' => {
  const typeMap: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
    student: 'success',
    researcher: 'warning',
    it: 'info',
    office: 'danger',
    other: 'info'
  }
  return typeMap[scenario || 'other'] || 'info'
}

const getLevelLabel = (level: number) => {
  const labels = [
    t('userManual.profile.levels.none') || '无',
    t('userManual.profile.levels.basic') || '基础',
    t('userManual.profile.levels.intermediate') || '中级',
    t('userManual.profile.levels.advanced') || '高级'
  ]
  return labels[level] || labels[0]
}

const getLevelPercentage = (level: number, maxLevel: number) => {
  return Math.round((level / maxLevel) * 100)
}

const getLevelColor = (level: number) => {
  const colors = ['#9ca3af', '#6b7280', '#4b5563', '#374151']
  return colors[level] || colors[0]
}

const getAgentLevelLabel = (level: number) => {
  const labels = [
    t('userManual.profile.agentLevels.none') || '完全不了解',
    t('userManual.profile.agentLevels.heard') || '听说过但不了解',
    t('userManual.profile.agentLevels.basic') || '了解基本概念',
    t('userManual.profile.agentLevels.used') || '使用过',
    t('userManual.profile.agentLevels.proficient') || '熟练使用'
  ]
  return labels[level] || labels[0]
}

const getAgentLevelColor = (level: number) => {
  const colors = ['#9ca3af', '#9ca3af', '#6b7280', '#4b5563', '#374151']
  return colors[level] || colors[0]
}

const hasEditorExperience = computed(() => {
  return props.profile.usedWysiwygMarkdown || 
         props.profile.usedLatexEditor || 
         props.profile.usedOtherMarkdownEditor
})
</script>

<style scoped>
.user-profile-visualization {
  padding: 0;
}

.profile-card {
  background: v-bind('themeState.currentTheme.background2nd');
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
  border-radius: 8px;
  overflow: hidden;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
}

.card-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: v-bind('themeState.currentTheme.textColor');
}

.reanalyze-btn {
  font-size: 13px;
}

.profile-content {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.profile-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-label {
  font-size: 13px;
  font-weight: 500;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.6)"');
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.scenario-tag {
  font-size: 14px;
  padding: 6px 16px;
  width: fit-content;
}

.skills-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.skill-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skill-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.skill-name {
  font-size: 14px;
  font-weight: 500;
  color: v-bind('themeState.currentTheme.textColor');
}

.skill-level {
  font-size: 13px;
  font-weight: 600;
}

.skill-bar-wrapper {
  width: 100%;
  height: 6px;
  background: v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
  border-radius: 3px;
  overflow: hidden;
}

.skill-bar {
  height: 100%;
  border-radius: 3px;
  transition: width 0.6s ease;
}

.experience-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 20px;
  border-top: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
}

.experience-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.experience-tag {
  font-size: 12px;
  background: v-bind('themeState.currentTheme.background');
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.15)"');
  color: v-bind('themeState.currentTheme.textColor');
}
</style>
