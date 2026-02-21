<template>
  <div class="user-profile-visualization">
    <div class="profile-card">
      <div class="card-header">
        <h3 class="card-title">{{ $t('userManual.overview.profileSummary') || '您的使用定位' }}</h3>
        <Button
          variant="outline"
          size="sm"
          @click="handleReanalyze"
          class="reanalyze-btn"
        >
          <Refresh class="mr-1 h-3 w-3" />
          {{ $t('userManual.profile.reanalyze') || '重新分析' }}
        </Button>
      </div>

      <div class="profile-content">
        <!-- 一句话定位：场景 + 能力简述 -->
        <p class="profile-summary">
          {{ summarySentence }}
        </p>

        <!-- 能力维度：用简短标签代替进度条 -->
        <div class="dimensions">
          <div class="dimension">
            <span class="dimension-name">Markdown</span>
            <span class="dimension-badge" :class="levelClass(profile.markdownLevel ?? 0, 3)">
              {{ getLevelLabel(profile.markdownLevel ?? 0) }}
            </span>
          </div>
          <div class="dimension">
            <span class="dimension-name">LaTeX</span>
            <span class="dimension-badge" :class="levelClass(profile.latexLevel ?? 0, 3)">
              {{ getLevelLabel(profile.latexLevel ?? 0) }}
            </span>
          </div>
          <div class="dimension">
            <span class="dimension-name">AI Agent</span>
            <span class="dimension-badge" :class="agentLevelClass(profile.agentLevel ?? 0)">
              {{ getAgentLevelLabel(profile.agentLevel ?? 0) }}
            </span>
          </div>
        </div>

        <!-- 使用过的工具（若有） -->
        <div v-if="hasEditorExperience" class="tools-used">
          <span class="tools-label">{{ $t('userManual.profile.experienceTitle') || '使用过的工具' }}</span>
          <div class="tools-tags">
            <span v-if="profile.usedWysiwygMarkdown" class="tool-tag">WYSIWYG Markdown</span>
            <span v-if="profile.usedLatexEditor" class="tool-tag">LaTeX 编辑器</span>
            <span v-if="profile.usedOtherMarkdownEditor" class="tool-tag">其他 Markdown 编辑器</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import type { UserProfile } from '../../stores/userManual'
import { Refresh } from '@element-plus/icons-vue'
import { Button } from '@renderer/components/ui/button'

const props = defineProps<{
  profile: UserProfile
}>()

const emit = defineEmits<{
  reanalyze: []
}>()

const { t } = useI18n()

const handleReanalyze = async () => {
  try {
    await ElMessageBox.confirm(
      t('userManual.profile.reanalyzeConfirmMessage') || '重置用户画像将清空当前学习进度，是否继续？',
      t('userManual.profile.reanalyzeConfirmTitle') || '重置用户画像',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    emit('reanalyze')
  } catch {
    // 用户取消
  }
}

const getScenarioLabel = (scenario?: string) => {
  if (!scenario) return t('userManual.profile.scenarios.other') || '其他'
  return t(`userManual.profile.scenarios.${scenario}`) || scenario
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

/** 用于样式的级别 class（0–3） */
function levelClass(level: number, maxLevel: number): string {
  const step = maxLevel <= 0 ? 0 : level / maxLevel
  if (step >= 2 / 3) return 'level-high'
  if (step >= 1 / 3) return 'level-mid'
  return 'level-low'
}

function agentLevelClass(level: number): string {
  if (level >= 4) return 'level-high'
  if (level >= 2) return 'level-mid'
  return 'level-low'
}

const summarySentence = computed(() => {
  const scenario = getScenarioLabel(props.profile.scenario)
  const md = getLevelLabel(props.profile.markdownLevel ?? 0)
  const tex = getLevelLabel(props.profile.latexLevel ?? 0)
  const agent = getAgentLevelLabel(props.profile.agentLevel ?? 0)
  return t('userManual.overview.profileSummarySentence', {
    scenario,
    markdown: md,
    latex: tex,
    agent
  }) || `您主要面向「${scenario}」场景；当前对 Markdown 为 ${md}、LaTeX 为 ${tex}、AI Agent 为 ${agent}。`
})

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
  padding: 16px 20px;
  border-bottom: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: v-bind('themeState.currentTheme.textColor');
}

.reanalyze-btn {
  font-size: 13px;
}

.profile-content {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.profile-summary {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  color: v-bind('themeState.currentTheme.textColor');
}

.dimensions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.dimension {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dimension-name {
  font-size: 13px;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.6)"');
}

.dimension-badge {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 500;
}

.dimension-badge.level-low {
  background: v-bind('themeState.currentTheme.type === "dark" ? "rgba(156,163,175,0.2)" : "rgba(156,163,175,0.15)"');
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.6)"');
}

.dimension-badge.level-mid {
  background: v-bind('themeState.currentTheme.type === "dark" ? "rgba(59,130,246,0.2)" : "rgba(59,130,246,0.12)"');
  color: #3b82f6;
}

.dimension-badge.level-high {
  background: v-bind('themeState.currentTheme.type === "dark" ? "rgba(34,197,94,0.2)" : "rgba(34,197,94,0.12)"');
  color: #22c55e;
}

.tools-used {
  padding-top: 12px;
  border-top: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.08)"');
}

.tools-label {
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.5)"');
  display: block;
  margin-bottom: 8px;
}

.tools-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tool-tag {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  background: v-bind('themeState.currentTheme.background');
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.65)"');
}
</style>

<script lang="ts">
import { themeState } from '../../utils/themes'
export { themeState }
</script>
