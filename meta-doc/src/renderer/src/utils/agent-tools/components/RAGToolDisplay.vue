<template>
  <div class="rag-tool-display" :style="containerStyle">
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
        <span class="question-text" :style="questionTextStyle">{{ displayData.question }}</span>
      </div>

      <div v-if="displayData.results && displayData.results.length > 0" class="results-container">
        <ScrollArea class="max-h-[400px]">
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
        </ScrollArea>
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
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
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

const props = defineProps<ToolDisplayComponentProps & { mode?: string }>()
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
.rag-tool-display {
  width: 100%;
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

.question-text {
  font-size: 14px;
  flex: 1;
}

.results-container {
  margin-top: 12px;
}

.result-card {
  margin-bottom: 8px;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

.result-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.result-content {
  padding: 8px 0;
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
