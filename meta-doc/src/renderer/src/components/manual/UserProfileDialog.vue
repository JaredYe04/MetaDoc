<template>
  <el-dialog
    v-model="visible"
    :title="$t('userManual.profile.title')"
    width="900px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    append-to-body
    class="profile-dialog"
  >
    <div class="profile-container">
      <!-- 步骤条 -->
      <el-steps
        :active="currentStep"
        finish-status="success"
        align-center
        class="profile-steps"
      >
        <el-step :title="$t('userManual.profile.steps.scenario')" />
        <el-step :title="$t('userManual.profile.steps.markdown')" />
        <el-step v-if="shouldShowMarkdownEditorQuestions" :title="$t('userManual.profile.steps.markdownEditor')" />
        <el-step :title="$t('userManual.profile.steps.latex')" />
        <el-step v-if="shouldShowLatexEditorQuestions" :title="$t('userManual.profile.steps.latexEditor')" />
        <el-step :title="$t('userManual.profile.steps.agent')" />
      </el-steps>

      <!-- 表单内容区域 -->
      <div class="form-content-wrapper">
        <transition name="fade-slide" mode="out-in">
          <!-- 步骤1: 使用场景 -->
          <div v-if="currentStep === 0" key="step-0" class="step-content">
            <div class="step-header">
              <h3 class="step-title">{{ $t('userManual.profile.scenario') }}</h3>
              <p class="step-description">
                {{ $t('userManual.profile.scenarioHint') || '请选择您的主要使用场景，这将帮助我们为您推荐最适合的学习路径' }}
              </p>
            </div>
            <el-radio-group v-model="form.scenario" class="radio-button-group">
              <el-radio-button label="student" class="radio-option">
                <div class="radio-content">
                  <span>{{ $t('userManual.profile.scenarios.student') }}</span>
                </div>
              </el-radio-button>
              <el-radio-button label="researcher" class="radio-option">
                <div class="radio-content">
                  <span>{{ $t('userManual.profile.scenarios.researcher') }}</span>
                </div>
              </el-radio-button>
              <el-radio-button label="it" class="radio-option">
                <div class="radio-content">
                  <span>{{ $t('userManual.profile.scenarios.it') }}</span>
                </div>
              </el-radio-button>
              <el-radio-button label="office" class="radio-option">
                <div class="radio-content">
                  <span>{{ $t('userManual.profile.scenarios.office') }}</span>
                </div>
              </el-radio-button>
              <el-radio-button label="other" class="radio-option">
                <div class="radio-content">
                  <span>{{ $t('userManual.profile.scenarios.other') }}</span>
                </div>
              </el-radio-button>
            </el-radio-group>
            <transition name="fade">
              <div v-if="form.scenario" class="scenario-hint">
                {{ getScenarioHint(form.scenario) }}
              </div>
            </transition>
          </div>

          <!-- 步骤2: Markdown熟练度 -->
          <div v-else-if="currentStep === 1" key="step-1" class="step-content">
            <div class="step-header">
              <h3 class="step-title">{{ $t('userManual.profile.markdownLevel') }}</h3>
              <p class="step-description">
                {{ $t('userManual.profile.markdownLevelHint') || '请评估您对Markdown语法的熟悉程度' }}
              </p>
            </div>
            <el-radio-group v-model="form.markdownLevel" class="radio-button-group">
              <el-radio-button :label="0" class="radio-option">
                <div class="radio-content">
                  <span>{{ $t('userManual.profile.levels.none') }}</span>
                </div>
              </el-radio-button>
              <el-radio-button :label="1" class="radio-option">
                <div class="radio-content">
                  <span>{{ $t('userManual.profile.levels.basic') }}</span>
                </div>
              </el-radio-button>
              <el-radio-button :label="2" class="radio-option">
                <div class="radio-content">
                  <span>{{ $t('userManual.profile.levels.intermediate') }}</span>
                </div>
              </el-radio-button>
              <el-radio-button :label="3" class="radio-option">
                <div class="radio-content">
                  <span>{{ $t('userManual.profile.levels.advanced') }}</span>
                </div>
              </el-radio-button>
            </el-radio-group>
            <transition name="fade">
              <div v-if="form.markdownLevel !== undefined" class="level-hint">
                {{ getMarkdownLevelHint(form.markdownLevel) }}
              </div>
            </transition>
          </div>

          <!-- 步骤3: Markdown编辑器经验（仅在Markdown熟练度>0时显示） -->
          <div v-else-if="currentStep === 2 && shouldShowMarkdownEditorQuestions" key="step-2" class="step-content">
            <div class="step-header">
              <h3 class="step-title">{{ $t('userManual.profile.steps.markdownEditor') }}</h3>
              <p class="step-description">
                {{ $t('userManual.profile.markdownEditorHint') || '请告诉我们您使用过的Markdown编辑器经验' }}
              </p>
            </div>
            
            <el-form-item :label="$t('userManual.profile.usedWysiwygMarkdown')">
              <div class="form-item-hint">
                {{ $t('userManual.profile.usedWysiwygMarkdownHint') }}
              </div>
              <el-radio-group v-model="form.usedWysiwygMarkdown" class="radio-button-group">
                <el-radio-button :label="true" class="radio-option">
                  <div class="radio-content">
                    <span>{{ $t('userManual.profile.yes') }}</span>
                  </div>
                </el-radio-button>
                <el-radio-button :label="false" class="radio-option">
                  <div class="radio-content">
                    <span>{{ $t('userManual.profile.no') }}</span>
                  </div>
                </el-radio-button>
              </el-radio-group>
            </el-form-item>

            <el-form-item :label="$t('userManual.profile.usedOtherMarkdownEditor')">
              <div class="form-item-hint">
                {{ $t('userManual.profile.usedOtherMarkdownEditorHint') }}
              </div>
              <el-radio-group v-model="form.usedOtherMarkdownEditor" class="radio-button-group">
                <el-radio-button :label="true" class="radio-option">
                  <div class="radio-content">
                    <span>{{ $t('userManual.profile.yes') }}</span>
                  </div>
                </el-radio-button>
                <el-radio-button :label="false" class="radio-option">
                  <div class="radio-content">
                    <span>{{ $t('userManual.profile.no') }}</span>
                  </div>
                </el-radio-button>
              </el-radio-group>
            </el-form-item>
          </div>

          <!-- 步骤4: LaTeX熟练度 -->
          <div v-else-if="getStepIndex('latex') === currentStep" key="step-latex" class="step-content">
            <div class="step-header">
              <h3 class="step-title">{{ $t('userManual.profile.latexLevel') }}</h3>
              <p class="step-description">
                {{ $t('userManual.profile.latexLevelHint') || '请评估您对LaTeX语法的熟悉程度' }}
              </p>
            </div>
            <el-radio-group v-model="form.latexLevel" class="radio-button-group">
              <el-radio-button :label="0" class="radio-option">
                <div class="radio-content">
                  <span>{{ $t('userManual.profile.levels.none') }}</span>
                </div>
              </el-radio-button>
              <el-radio-button :label="1" class="radio-option">
                <div class="radio-content">
                  <span>{{ $t('userManual.profile.levels.basic') }}</span>
                </div>
              </el-radio-button>
              <el-radio-button :label="2" class="radio-option">
                <div class="radio-content">
                  <span>{{ $t('userManual.profile.levels.intermediate') }}</span>
                </div>
              </el-radio-button>
              <el-radio-button :label="3" class="radio-option">
                <div class="radio-content">
                  <span>{{ $t('userManual.profile.levels.advanced') }}</span>
                </div>
              </el-radio-button>
            </el-radio-group>
            <transition name="fade">
              <div v-if="form.latexLevel !== undefined" class="level-hint">
                {{ getLatexLevelHint(form.latexLevel) }}
              </div>
            </transition>
          </div>

          <!-- 步骤5: LaTeX编辑器经验（仅在LaTeX熟练度>0时显示） -->
          <div v-else-if="currentStep === getStepIndex('latexEditor') && shouldShowLatexEditorQuestions" key="step-latex-editor" class="step-content">
            <div class="step-header">
              <h3 class="step-title">{{ $t('userManual.profile.steps.latexEditor') }}</h3>
              <p class="step-description">
                {{ $t('userManual.profile.latexEditorHint') || '请告诉我们您使用过的LaTeX编辑器经验' }}
              </p>
            </div>
            
            <el-form-item :label="$t('userManual.profile.usedLatexEditor')">
              <div class="form-item-hint">
                {{ $t('userManual.profile.usedLatexEditorHint') }}
              </div>
              <el-radio-group v-model="form.usedLatexEditor" class="radio-button-group">
                <el-radio-button :label="true" class="radio-option">
                  <div class="radio-content">
                    <span>{{ $t('userManual.profile.yes') }}</span>
                  </div>
                </el-radio-button>
                <el-radio-button :label="false" class="radio-option">
                  <div class="radio-content">
                    <span>{{ $t('userManual.profile.no') }}</span>
                  </div>
                </el-radio-button>
              </el-radio-group>
            </el-form-item>
          </div>

          <!-- 步骤6: Agent了解程度 -->
          <div v-else-if="currentStep === getStepIndex('agent')" key="step-agent" class="step-content">
            <div class="step-header">
              <h3 class="step-title">{{ $t('userManual.profile.agentLevel') }}</h3>
              <p class="step-description">
                {{ $t('userManual.profile.agentLevelHint') || '请评估您对AI Agent的了解程度' }}
              </p>
            </div>
            <el-radio-group v-model="form.agentLevel" class="radio-button-group">
              <el-radio-button :label="0" class="radio-option">
                <div class="radio-content">
                  <span>{{ $t('userManual.profile.agentLevels.none') }}</span>
                </div>
              </el-radio-button>
              <el-radio-button :label="1" class="radio-option">
                <div class="radio-content">
                  <span>{{ $t('userManual.profile.agentLevels.heard') }}</span>
                </div>
              </el-radio-button>
              <el-radio-button :label="2" class="radio-option">
                <div class="radio-content">
                  <span>{{ $t('userManual.profile.agentLevels.basic') }}</span>
                </div>
              </el-radio-button>
              <el-radio-button :label="3" class="radio-option">
                <div class="radio-content">
                  <span>{{ $t('userManual.profile.agentLevels.used') }}</span>
                </div>
              </el-radio-button>
              <el-radio-button :label="4" class="radio-option">
                <div class="radio-content">
                  <span>{{ $t('userManual.profile.agentLevels.proficient') }}</span>
                </div>
              </el-radio-button>
            </el-radio-group>
          </div>
        </transition>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleCancel">{{ $t('userManual.profile.skip') }}</el-button>
        <div class="footer-actions">
          <el-button v-if="currentStep > 0" @click="prevStep">上一步</el-button>
          <el-button
            v-if="currentStep < maxStep"
            type="primary"
            :disabled="!canProceed"
            @click="nextStep"
          >
            {{ $t('userManual.profile.next') || '下一步' }}
          </el-button>
          <el-button
            v-if="currentStep === maxStep"
            type="primary"
            :disabled="!canSubmit"
            @click="handleSubmit"
          >
            {{ $t('userManual.profile.submit') }}
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { saveUserProfile } from '../../utils/user-profile'
import { useUserManual } from '../../stores/userManual'
import type { UserProfile } from '../../stores/userManual'
import { themeState } from '../../utils/themes'

const { t } = useI18n()
const { setUserProfile } = useUserManual()

const visible = ref(false)
const currentStep = ref(0)

const form = reactive<Partial<UserProfile>>({
  scenario: undefined,
  markdownLevel: undefined,
  latexLevel: undefined,
  agentLevel: undefined,
  usedWysiwygMarkdown: undefined,
  usedLatexEditor: undefined,
  usedOtherMarkdownEditor: undefined
})

const emit = defineEmits<{
  submitted: [profile: UserProfile]
  cancelled: []
}>()

// 是否应该显示Markdown编辑器问题
const shouldShowMarkdownEditorQuestions = computed(() => {
  return form.markdownLevel !== undefined && form.markdownLevel > 0
})

// 是否应该显示LaTeX编辑器问题
const shouldShowLatexEditorQuestions = computed(() => {
  return form.latexLevel !== undefined && form.latexLevel > 0
})

// 获取步骤索引
const getStepIndex = (stepName: string): number => {
  let index = 0
  if (stepName === 'scenario') return 0
  index = 1
  if (stepName === 'markdown') return index
  index++
  if (shouldShowMarkdownEditorQuestions.value) {
    if (stepName === 'markdownEditor') return index
    index++
  }
  if (stepName === 'latex') return index
  index++
  if (shouldShowLatexEditorQuestions.value) {
    if (stepName === 'latexEditor') return index
    index++
  }
  if (stepName === 'agent') return index
  return 0
}

// 计算最大步骤数
const maxStep = computed(() => {
  return getStepIndex('agent')
})

// 是否可以进入下一步
const canProceed = computed(() => {
  const step = currentStep.value
  if (step === 0) return form.scenario !== undefined
  if (step === getStepIndex('markdown')) return form.markdownLevel !== undefined
  if (step === getStepIndex('markdownEditor') && shouldShowMarkdownEditorQuestions.value) {
    return form.usedWysiwygMarkdown !== undefined && form.usedOtherMarkdownEditor !== undefined
  }
  if (step === getStepIndex('latex')) return form.latexLevel !== undefined
  if (step === getStepIndex('latexEditor') && shouldShowLatexEditorQuestions.value) {
    return form.usedLatexEditor !== undefined
  }
  if (step === getStepIndex('agent')) return form.agentLevel !== undefined
  return false
})

// 是否可以提交
const canSubmit = computed(() => {
  if (currentStep.value !== maxStep.value) return false
  return form.agentLevel !== undefined
})

const getScenarioHint = (scenario: string): string => {
  const hints: Record<string, string> = {
    student: t('userManual.profile.scenarios.hint.student') || '学生：主要用于课程笔记、作业文档、学习资料整理等场景',
    researcher: t('userManual.profile.scenarios.hint.researcher') || '科研人员：主要用于学术论文、研究报告、实验记录等场景',
    it: t('userManual.profile.scenarios.hint.it') || 'IT人员：主要用于技术文档、代码注释、API文档、项目文档等场景',
    office: t('userManual.profile.scenarios.hint.office') || '办公人员：主要用于会议纪要、工作报告、商务文档等场景',
    other: t('userManual.profile.scenarios.hint.other') || '其他：通用文档编辑场景'
  }
  return hints[scenario] || ''
}

const getMarkdownLevelHint = (level: number): string => {
  const hints: Record<number, string> = {
    0: t('userManual.profile.markdownLevelHints.none') || '完全不了解Markdown语法，需要从基础语法开始学习',
    1: t('userManual.profile.markdownLevelHints.basic') || '了解基本语法（标题、列表、加粗等），可以编写简单的文档',
    2: t('userManual.profile.markdownLevelHints.intermediate') || '熟练使用Markdown语法，了解表格、代码块、链接等高级功能',
    3: t('userManual.profile.markdownLevelHints.advanced') || '精通Markdown，熟悉扩展语法、数学公式、图表等高级特性'
  }
  return hints[level] || ''
}

const getLatexLevelHint = (level: number): string => {
  const hints: Record<number, string> = {
    0: t('userManual.profile.latexLevelHints.none') || '完全不了解LaTeX，需要从基础语法和文档结构开始学习',
    1: t('userManual.profile.latexLevelHints.basic') || '了解基本语法和文档结构，可以编写简单的LaTeX文档',
    2: t('userManual.profile.latexLevelHints.intermediate') || '熟练使用LaTeX，了解数学公式、表格、图片插入等常用功能',
    3: t('userManual.profile.latexLevelHints.advanced') || '精通LaTeX，熟悉宏包使用、自定义命令、参考文献管理等高级特性'
  }
  return hints[level] || ''
}

const nextStep = () => {
  if (!canProceed.value) return
  if (currentStep.value < maxStep.value) {
    currentStep.value++
  }
}

const prevStep = () => {
  if (currentStep.value > 0) {
    currentStep.value--
  }
}

const open = () => {
  visible.value = true
  currentStep.value = 0
  form.scenario = undefined
  form.markdownLevel = undefined
  form.latexLevel = undefined
  form.agentLevel = undefined
  form.usedWysiwygMarkdown = undefined
  form.usedLatexEditor = undefined
  form.usedOtherMarkdownEditor = undefined
}

const handleSubmit = async () => {
  const profile: UserProfile = {
    scenario: form.scenario || 'other',
    markdownLevel: form.markdownLevel ?? 0,
    latexLevel: form.latexLevel ?? 0,
    agentLevel: form.agentLevel ?? 0,
    usedWysiwygMarkdown: form.usedWysiwygMarkdown ?? false,
    usedLatexEditor: form.usedLatexEditor ?? false,
    usedOtherMarkdownEditor: form.usedOtherMarkdownEditor ?? false
  }

  try {
    await saveUserProfile(profile)
    setUserProfile(profile)
    visible.value = false
    emit('submitted', profile)
  } catch (error) {
    console.error('保存用户画像失败:', error)
  }
}

const handleCancel = () => {
  visible.value = false
  emit('cancelled')
}

defineExpose({
  open
})
</script>

<style scoped>
.profile-dialog :deep(.el-dialog__body) {
  padding: 32px 40px;
}

.profile-container {
  min-height: 400px;
}

.profile-steps {
  margin-bottom: 40px;
}

.form-content-wrapper {
  min-height: 300px;
  position: relative;
}

.step-content {
  animation: fadeInUp 0.3s ease-out;
}

.step-header {
  text-align: center;
  margin-bottom: 32px;
}

.step-title {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 12px 0;
  color: v-bind('themeState.currentTheme.textColor');
}

.step-description {
  font-size: 14px;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.6)"');
  margin: 0;
  line-height: 1.6;
}

.radio-button-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  width: 100%;
  justify-content: center;
}

.radio-button-group :deep(.el-radio-button) {
  flex: 1;
  min-width: 120px;
  max-width: 200px;
}

.radio-button-group :deep(.el-radio-button__inner) {
  width: 100%;
  padding: 16px 20px;
  border-radius: 6px;
  transition: all 0.2s ease;
  border: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.15)"');
  background: v-bind('themeState.currentTheme.background2nd');
  color: v-bind('themeState.currentTheme.textColor');
}

.radio-button-group :deep(.el-radio-button.is-active .el-radio-button__inner) {
  background: v-bind('themeState.currentTheme.textColor');
  border-color: v-bind('themeState.currentTheme.textColor');
  color: v-bind('themeState.currentTheme.background');
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.radio-button-group :deep(.el-radio-button:not(.is-active) .el-radio-button__inner:hover) {
  border-color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.3)"');
}

.radio-content {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.scenario-hint,
.level-hint {
  margin-top: 24px;
  padding: 16px 20px;
  background: v-bind('themeState.currentTheme.background2nd');
  border-left: 3px solid v-bind('themeState.currentTheme.textColor');
  border-radius: 4px;
  font-size: 14px;
  color: v-bind('themeState.currentTheme.textColor');
  line-height: 1.6;
  animation: fadeIn 0.3s ease-out;
}

.form-item-hint {
  font-size: 13px;
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.6)"');
  margin-bottom: 16px;
  line-height: 1.5;
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.footer-actions {
  display: flex;
  gap: 12px;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.fade-slide-enter-active {
  animation: fadeInUp 0.3s ease-out;
}

.fade-slide-leave-active {
  animation: fadeInUp 0.2s ease-in reverse;
}

.fade-enter-active {
  animation: fadeIn 0.3s ease-out;
}

.fade-leave-active {
  animation: fadeIn 0.2s ease-in reverse;
}
</style>
