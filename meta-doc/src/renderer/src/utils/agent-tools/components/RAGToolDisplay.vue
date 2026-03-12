<template>
  <el-scrollbar class="rag-tool-display-scrollbar">
    <div
      class="rag-tool-display"
      :style="containerStyle"
      :class="{ 'rag-tool-display--compact': compact }"
    >
      <div
        v-if="displayData.stage === 'searching'"
        class="searching-state"
        :style="statusMessageStyle"
      >
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>{{ $t('agent.display.ragTool.searching') }}</span>
      </div>

      <div
        v-else-if="displayData.stage === 'completed'"
        class="completed-state"
        :style="completedStateStyle"
      >
        <div class="result-header" :style="resultHeaderStyle">
          <Badge variant="default" class="bg-green-600 hover:bg-green-700 text-white">
            {{ displayData.resultCount || 0 }}{{ $t('agent.display.ragTool.results') }}
          </Badge>
          <div v-if="!compact && effectiveQuestion" class="question-text-wrapper">
            <el-tooltip
              :content="effectiveQuestion"
              placement="top"
              :show-after="300"
            >
              <span class="question-text question-text--truncate" :style="questionTextStyle">{{
                effectiveQuestion
              }}</span>
            </el-tooltip>
          </div>
        </div>

        <div v-if="displayData.results && displayData.results.length > 0" class="results-container">
          <el-scrollbar
            :class="compact ? 'rag-results-scrollbar max-h-[240px]' : 'rag-results-scrollbar max-h-[400px]'"
          >
            <div class="results-inner">
              <Card
                v-for="(result, index) in displayData.results"
                :key="index"
                class="result-card"
                :style="cardStyle"
              >
                <CardContent class="result-content">
                  <pre class="result-text" :style="resultTextStyle">{{ result }}</pre>
                </CardContent>
              </Card>
            </div>
          </el-scrollbar>
        </div>

        <div v-else class="no-results">
          <Empty :description="$t('agent.display.ragTool.noResults')" :image-size="80" />
          <p class="hint" :style="hintStyle">
            {{ $t('agent.display.ragTool.hint') }}
          </p>
        </div>
      </div>

      <div v-else-if="displayData.stage === 'error'" class="error-state">
        <Alert variant="destructive">
          <XCircle class="h-4 w-4" />
          <AlertTitle>{{ displayData.error || $t('agent.display.ragTool.searchFailed') }}</AlertTitle>
        </Alert>
      </div>

      <!-- 进度条 -->
      <div v-if="effectiveProgress && effectiveProgress.percentage > 0" style="margin-top: 12px">
        <Progress
          :percentage="effectiveProgress.percentage"
          :status="progressStatus"
          :stroke-width="6"
          :show-text="true"
        />
      </div>
    </div>
  </el-scrollbar>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { Alert, AlertTitle, AlertDescription } from '../../../components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { Progress } from '@renderer/components/ui/progress'
import { Empty } from '@renderer/components/ui/empty'
import { XCircle } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { Card, CardContent } from '@renderer/components/ui/card'
import { themeState } from '../../../utils/themes'
import type { ToolDisplayComponentProps } from '../../../types/agent-tool'
import { useToolDisplayRealtime, parseToolData } from '../composables/useToolDisplayRealtime'

const { t } = useI18n()

const props = withDefaults(
  defineProps<
    ToolDisplayComponentProps & { mode?: string; params?: Record<string, unknown> }
  >(),
  { compact: false }
)
const isDemo = computed(() => props.mode === 'demo')

// Demo data
const demoData = ref({
  stage: 'completed' as const,
  question: '什么是机器学习？',
  resultCount: 3,
  results: [
    '机器学习是人工智能的一个分支，它使计算机系统能够通过经验自动改进。机器学习算法使用统计技术从数据中“学习”，而无需明确编程。',
    '深度学习是机器学习的一个子集，使用多层神经网络来模拟人脑的工作方式。它在图像识别、自然语言处理等领域取得了突破性进展。',
    '监督学习、无监督学习和强化学习是机器学习的三种主要类型。每种类型适用于不同的应用场景和数据特点。'
  ],
  scoreThreshold: 0.7
})

const loadDemoData = () => {
  // Demo data is set in the reactive ref above
}

onMounted(() => {
  if (isDemo.value) {
    loadDemoData()
    return
  }
  // Real initialization continues below
})

// 使用实时通信
const { realtimeData, realtimeStatus, realtimeProgress } = useToolDisplayRealtime(
  props.invocationId,
  props.data,
  props.status,
  props.progress
)

// 解析显示数据（优先使用实时数据）
const displayData = computed(() => {
  // Demo mode: return demo data
  if (isDemo.value) {
    return demoData.value
  }

  const data = realtimeData.value !== null ? realtimeData.value : props.data
  const parsed = parseToolData(data)

  if (typeof parsed === 'object' && parsed !== null) {
    return parsed as {
      stage: 'searching' | 'completed' | 'error'
      question?: string
      results?: string[]
      resultCount?: number
      error?: string
      scoreThreshold?: number
    }
  }
  return { stage: 'searching' }
})

// 检索词：优先用结果里的 question，否则用工具调用参数 params.question（兼容未带 question 的旧数据）
const effectiveQuestion = computed(() => {
  const fromData = displayData.value && typeof displayData.value === 'object' && 'question' in displayData.value
    ? (displayData.value as { question?: string }).question
    : undefined
  const fromParams =
    props.params && typeof props.params.question === 'string' ? props.params.question : undefined
  return (fromData ?? fromParams ?? '') as string
})

// 进度状态（优先使用实时状态）
const effectiveStatus = computed(() => {
  return realtimeStatus.value !== 'running' ? realtimeStatus.value : props.status
})

const effectiveProgress = computed(() => {
  return realtimeProgress.value || props.progress
})

const progressStatus = computed(() => {
  if (effectiveStatus.value === 'failed') return 'exception'
  if (effectiveStatus.value === 'succeeded') return 'success'
  return undefined
})

// 主题样式
const containerStyle = computed(() => ({
  backgroundColor: 'transparent',
  color: themeState.currentTheme.textColor
}))

const statusMessageStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const completedStateStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const resultHeaderStyle = computed(() => ({
  borderBottomColor:
    themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
}))

const questionTextStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const resultTextStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const hintStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

// 卡片样式
const cardStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  borderColor:
    themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
}))
</script>

<style scoped>
.rag-tool-display-scrollbar {
  width: 100%;
  max-height: 80vh;
}

.rag-tool-display-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: auto;
}

.rag-results-scrollbar {
  width: 100%;
  display: block;
}

.rag-results-scrollbar.max-h-\[240px\] {
  max-height: 240px;
}

.rag-results-scrollbar.max-h-\[400px\] {
  max-height: 400px;
}

.rag-results-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: auto;
  overflow-y: scroll;
}

.rag-results-scrollbar.max-h-\[240px\] :deep(.el-scrollbar__wrap) {
  max-height: 240px;
}

.rag-results-scrollbar.max-h-\[400px\] :deep(.el-scrollbar__wrap) {
  max-height: 400px;
}

.rag-results-scrollbar :deep(.el-scrollbar__view) {
  display: block;
}

.rag-tool-display {
  width: 100%;
}

.rag-tool-display--compact .result-header {
  padding-bottom: 4px;
  margin-bottom: 6px;
}

.rag-tool-display--compact .result-card {
  margin-bottom: 4px;
}

.rag-tool-display--compact .result-content {
  padding: 8px 12px;
}

.rag-tool-display--compact .result-text {
  font-size: 12px;
  line-height: 1.45;
}

.searching-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
}

.completed-state {
  width: 100%;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid;
}

.question-text-wrapper {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.question-text {
  font-size: 14px;
}

.question-text--truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.results-container {
  margin-top: 12px;
}

.results-inner {
  padding: 4px 12px;
}

.result-card {
  margin-bottom: 8px;
  transition: box-shadow 0.2s;
}

.result-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.result-content {
  padding: 12px 16px;
}

.result-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--code-font-family, 'JetBrains Mono', monospace);
  font-size: 13px;
  line-height: 1.6;
}

.no-results {
  padding: 24px;
  text-align: center;
}

.hint {
  margin-top: 12px;
  font-size: 12px;
}

.error-state {
  padding: 12px;
}
</style>
