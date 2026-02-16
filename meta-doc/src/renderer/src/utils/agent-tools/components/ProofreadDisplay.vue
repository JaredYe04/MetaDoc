<template>
  <div class="proofread-display" :style="containerStyle">
    <div
      v-if="
        displayData.stage === 'loading' ||
        displayData.stage === 'proofreading' ||
        displayData.stage === 'fixing'
      "
      class="status-message"
      :style="statusMessageStyle"
    >
      <el-icon class="is-loading"><Loading /></el-icon>
      <span v-if="displayData.stage === 'fixing'">{{ $t('agent.display.proofread.fixing') }}</span>
      <span v-else>{{ $t('agent.display.proofread.proofreading') }}</span>
    </div>

    <div
      v-else-if="displayData.stage === 'completed' && resultData"
      class="completed-state"
      :style="completedStateStyle"
    >
      <div class="proofread-header" :style="headerStyle">
        <h3 class="proofread-title" :style="titleStyle">
          {{ $t('agent.display.proofread.title') }}
        </h3>
        <div class="error-stats" :style="statsStyle">
          <el-tag type="danger" size="small">{{
            $t('agent.display.proofread.totalErrors', { count: resultData.totalErrors || 0 })
          }}</el-tag>
          <el-tag
            v-for="(count, type) in resultData.errorCounts"
            :key="type"
            :type="getErrorTypeTag(type)"
            size="small"
            v-if="count > 0"
          >
            {{ getErrorTypeLabel(type) }}: {{ count }}
          </el-tag>
          <el-button-group class="mode-switch">
            <el-button
              :type="viewMode === 'unified' ? 'primary' : 'default'"
              size="small"
              @click="viewMode = 'unified'"
            >
              {{ $t('agent.display.proofread.unifiedView') }}
            </el-button>
            <el-button
              :type="viewMode === 'split' ? 'primary' : 'default'"
              size="small"
              @click="viewMode = 'split'"
            >
              {{ $t('agent.display.proofread.splitView') }}
            </el-button>
          </el-button-group>
        </div>
      </div>

      <!-- 统一视图（错误列表） -->
      <div v-if="viewMode === 'unified'">
        <el-scrollbar max-height="500px">
          <div class="errors-list">
            <div
              v-if="!resultData.errors || resultData.errors.length === 0"
              class="no-errors-message"
            >
              <p>{{ $t('agent.display.proofread.noErrors') }}</p>
            </div>
            <div
              v-for="(error, index) in resultData.errors || []"
              v-else
              :key="index"
              class="error-item"
              :class="[`severity-${error.severity}`, { 'error-fixed': error.fixed }]"
              :style="errorItemStyle"
            >
              <div class="error-header">
                <el-tag :type="getSeverityType(error.severity)" size="small">{{
                  getSeverityLabel(error.severity)
                }}</el-tag>
                <el-tag :type="getErrorTypeTag(error.type)" size="small">{{
                  getErrorTypeLabel(error.type)
                }}</el-tag>
                <el-tag v-if="error.fixed" type="success" size="small">{{
                  $t('agent.display.proofread.autoFixed')
                }}</el-tag>
                <span class="error-location" :style="locationStyle">
                  {{
                    $t('agent.display.proofread.location', {
                      line: error.line,
                      column: error.column
                    })
                  }}
                </span>
              </div>
              <div class="error-content" :style="contentStyle">
                <div class="error-text">
                  <span class="label">{{ $t('agent.display.proofread.errorText') }}:</span>
                  <code>{{ error.text }}</code>
                </div>
                <div class="error-suggestions">
                  <span class="label"
                    >{{ $t('agent.display.proofread.suggestions', '修改建议') }}:</span
                  >
                  <div class="suggestions-list">
                    <el-tag
                      v-for="(suggestion, sugIndex) in error.suggestions || [error.suggestion]"
                      :key="sugIndex"
                      type="info"
                      class="suggestion-tag"
                      size="small"
                      effect="plain"
                    >
                      {{ suggestion }}
                    </el-tag>
                  </div>
                </div>
                <div v-if="error.message" class="error-message" :style="messageStyle">
                  {{ error.message }}
                </div>
              </div>
            </div>
          </div>
        </el-scrollbar>
      </div>

      <!-- 分列视图（Monaco 编辑器对比） -->
      <div v-else class="split-view-container">
        <div class="split-editors">
          <div class="editor-panel original-panel">
            <div class="editor-header" :style="editorHeaderStyle">
              <span class="editor-label">{{ $t('agent.display.proofread.originalText') }}</span>
            </div>
            <div
              :id="originalEditorId"
              class="monaco-editor-container"
              :style="editorContainerStyle"
            ></div>
          </div>
          <div class="editor-panel corrected-panel">
            <div class="editor-header" :style="editorHeaderStyle">
              <span class="editor-label">{{ $t('agent.display.proofread.correctedText') }}</span>
            </div>
            <div
              :id="correctedEditorId"
              class="monaco-editor-container"
              :style="editorContainerStyle"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-else-if="
        displayData.stage === 'completed' &&
        resultData &&
        (!resultData.errors || resultData.errors.length === 0)
      "
      class="no-errors"
      :style="noErrorsStyle"
    >
      <el-result icon="success" :title="$t('agent.display.proofread.noErrors')" />
    </div>

    <div v-else class="error-state">
      <el-alert
        :title="displayData.error || $t('agent.display.proofread.error')"
        type="error"
        :closable="false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import type { ToolDisplayComponentProps } from '../../../types/agent-tool'
import { useToolDisplayRealtime, parseToolData } from '../composables/useToolDisplayRealtime'
import { themeState } from '../../themes'
import * as monaco from 'monaco-editor'
import type { ProofreadResult, ProofreadError } from '../proofread-tool'
import { setupMonacoWorker } from '../../monaco-worker-config'

const { t } = useI18n()
const props = defineProps<ToolDisplayComponentProps>()

const { realtimeData, realtimeStatus, realtimeProgress } = useToolDisplayRealtime(
  props.invocationId,
  props.data,
  props.status,
  props.progress
)

const viewMode = ref<'unified' | 'split'>('unified')
const originalEditorId = ref(
  `proofread-original-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
)
const correctedEditorId = ref(
  `proofread-corrected-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
)
let originalMonacoEditor: monaco.editor.IStandaloneCodeEditor | null = null
let correctedMonacoEditor: monaco.editor.IStandaloneCodeEditor | null = null

const displayData = computed(() => {
  const data = realtimeData.value !== null ? realtimeData.value : props.data
  const parsed = parseToolData(data) as any

  if (parsed && typeof parsed === 'object') {
    const getStage = (): 'loading' | 'proofreading' | 'fixing' | 'completed' | 'error' => {
      if (parsed.stage) {
        return parsed.stage
      }
      if (props.status === 'succeeded') {
        return 'completed'
      }
      if (props.status === 'failed') {
        return 'error'
      }
      return 'proofreading'
    }

    return {
      ...parsed,
      stage: getStage()
    }
  }

  const defaultStage =
    props.status === 'succeeded'
      ? 'completed'
      : props.status === 'failed'
        ? 'error'
        : 'proofreading'
  return {
    stage: defaultStage,
    result: undefined,
    error: undefined
  }
})

const resultData = computed((): ProofreadResult | null => {
  const data = displayData.value
  if (data && typeof data === 'object') {
    // 尝试多种路径获取 result
    // 1. 直接从 data.result 获取（如果 parseToolData 已经提取了 content）
    // 2. 从 data.content.result 获取（如果 data 是 ToolCallbackData 格式）
    // 3. 从 data 本身获取（如果 data 就是 ProofreadResult）
    // 4. 从 props.data 中获取（fallback）
    let result = data.result || data.content?.result

    // 如果 result 不是 ProofreadResult 格式，尝试从 props.data 获取
    if (!result || !result.errors || !Array.isArray(result.errors)) {
      const propsData = props.data as any
      if (propsData) {
        // 尝试从 props.data.content.result 获取
        if (propsData.content?.result) {
          result = propsData.content.result
        }
        // 尝试从 props.data.result 获取
        else if (propsData.result) {
          result = propsData.result
        }
        // 如果 props.data 本身就是 ProofreadResult
        else if (propsData.errors && Array.isArray(propsData.errors)) {
          result = propsData
        }
      }
    }

    // 验证 result 是否是有效的 ProofreadResult
    if (result && typeof result === 'object' && result.errors && Array.isArray(result.errors)) {
      return result as ProofreadResult
    }
  }
  return null
})

// 获取原始文本
const originalText = computed(() => {
  return resultData.value?.text || ''
})

// 获取修正后的文本（应用所有修正）
const correctedText = computed(() => {
  if (!resultData.value || !resultData.value.errors || resultData.value.errors.length === 0) {
    return originalText.value
  }

  let text = originalText.value
  const lines = text.split(/\r?\n/)

  // 从后往前应用修正，避免位置偏移
  const sortedErrors = [...resultData.value.errors].sort((a, b) => {
    if (a.line !== b.line) return b.line - a.line
    return b.column - a.column
  })

  for (const error of sortedErrors) {
    if (error.line > 0 && error.line <= lines.length) {
      const lineIndex = error.line - 1
      const line = lines[lineIndex]

      if (error.column > 0 && error.column <= line.length) {
        const before = line.substring(0, error.column - 1)
        const after = line.substring(error.column - 1 + error.length)
        // 使用选中的建议或第一个建议
        const selectedSuggestion = error.selectedSuggestion || error.suggestion || ''
        lines[lineIndex] = before + selectedSuggestion + after
      }
    }
  }

  return lines.join('\n')
})

const effectiveStatus = computed(() => {
  return realtimeStatus.value !== 'running' ? realtimeStatus.value : props.status
})

const getSeverityType = (severity: string) => {
  if (severity === 'error') return 'danger'
  if (severity === 'warning') return 'warning'
  return 'info'
}

const getSeverityLabel = (severity: string) => {
  return t(`agent.display.proofread.severity.${severity}`)
}

const getErrorTypeTag = (type: string) => {
  const typeMap: Record<string, string> = {
    grammar: 'primary',
    spelling: 'warning',
    latex: 'danger',
    style: 'info',
    other: 'info'
  }
  return typeMap[type] || 'info'
}

const getErrorTypeLabel = (type: string) => {
  return t(`agent.display.proofread.errorType.${type}`)
}

// 初始化 Monaco 编辑器（分列视图）
const initMonacoEditors = async () => {
  if (viewMode.value !== 'split') return

  // 确保 Monaco Worker 已配置
  setupMonacoWorker()

  await nextTick()

  const originalContainer = document.getElementById(originalEditorId.value)
  const correctedContainer = document.getElementById(correctedEditorId.value)

  if (!originalContainer || !correctedContainer) {
    console.warn('Monaco编辑器容器未找到')
    return
  }

  // 从全局获取编辑器实例
  const editors = monaco.editor.getEditors()
  const originalEditor = editors.find((e) => e.getId?.() === originalEditorId.value)
  const correctedEditor = editors.find((e) => e.getId?.() === correctedEditorId.value)

  if (originalEditor) {
    originalEditor.dispose()
  }
  if (correctedEditor) {
    correctedEditor.dispose()
  }

  // 创建原始文本编辑器
  originalMonacoEditor = monaco.editor.create(originalContainer, {
    value: originalText.value,
    language: 'plaintext',
    theme: themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs',
    readOnly: true,
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    automaticLayout: true,
    fontSize: 13,
    fontFamily: 'JetBrains Mono, Consolas, monospace',
    renderLineHighlight: 'all',
    lineDecorationsWidth: 10,
    glyphMargin: true
  })

  // 创建修正文本编辑器
  correctedMonacoEditor = monaco.editor.create(correctedContainer, {
    value: correctedText.value,
    language: 'plaintext',
    theme: themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs',
    readOnly: true,
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    automaticLayout: true,
    fontSize: 13,
    fontFamily: 'JetBrains Mono, Consolas, monospace',
    renderLineHighlight: 'all',
    lineDecorationsWidth: 10,
    glyphMargin: true
  })

  // 同步滚动
  originalMonacoEditor.onDidScrollChange((e) => {
    if (e.scrollTop !== undefined) {
      correctedMonacoEditor?.setScrollTop(e.scrollTop)
    }
    if (e.scrollLeft !== undefined) {
      correctedMonacoEditor?.setScrollLeft(e.scrollLeft)
    }
  })

  correctedMonacoEditor.onDidScrollChange((e) => {
    if (e.scrollTop !== undefined) {
      originalMonacoEditor?.setScrollTop(e.scrollTop)
    }
    if (e.scrollLeft !== undefined) {
      originalMonacoEditor?.setScrollLeft(e.scrollLeft)
    }
  })

  // 高亮错误和修正
  highlightErrors()
}

const highlightErrors = () => {
  if (
    !originalMonacoEditor ||
    !correctedMonacoEditor ||
    !resultData.value ||
    !resultData.value.errors
  )
    return

  const originalDecorations: monaco.editor.IModelDeltaDecoration[] = []
  const correctedDecorations: monaco.editor.IModelDeltaDecoration[] = []

  for (const error of resultData.value.errors) {
    // 在原始编辑器中高亮错误（红色）
    if (error.line > 0) {
      const range = new monaco.Range(
        error.line,
        error.column,
        error.line,
        error.column + error.length
      )
      originalDecorations.push({
        range,
        options: {
          inlineClassName: 'proofread-error-highlight',
          hoverMessage: {
            value: `${error.message || ''}\n建议: ${error.selectedSuggestion || error.suggestion || ''}`
          },
          minimap: {
            color: 'rgba(245, 108, 108, 0.5)',
            position: monaco.editor.MinimapPosition.Inline
          }
        }
      })

      // 整行背景高亮
      originalDecorations.push({
        range: new monaco.Range(error.line, 1, error.line, 1),
        options: {
          isWholeLine: true,
          className: 'proofread-error-line',
          glyphMarginClassName: 'proofread-error-glyph'
        }
      })
    }

    // 在修正编辑器中高亮修正（绿色）
    const selectedSuggestion = error.selectedSuggestion || error.suggestion
    if (error.line > 0 && selectedSuggestion) {
      // 计算修正后的位置（简化处理）
      const range = new monaco.Range(
        error.line,
        error.column,
        error.line,
        error.column + selectedSuggestion.length
      )
      correctedDecorations.push({
        range,
        options: {
          inlineClassName: 'proofread-suggestion-highlight',
          hoverMessage: { value: `修正: ${selectedSuggestion}` },
          minimap: {
            color: 'rgba(103, 194, 58, 0.5)',
            position: monaco.editor.MinimapPosition.Inline
          }
        }
      })

      // 整行背景高亮
      correctedDecorations.push({
        range: new monaco.Range(error.line, 1, error.line, 1),
        options: {
          isWholeLine: true,
          className: 'proofread-suggestion-line',
          glyphMarginClassName: 'proofread-suggestion-glyph'
        }
      })
    }
  }

  originalMonacoEditor.deltaDecorations([], originalDecorations)
  correctedMonacoEditor.deltaDecorations([], correctedDecorations)
}

const disposeMonacoEditors = () => {
  if (originalMonacoEditor) {
    originalMonacoEditor.dispose()
    originalMonacoEditor = null
  }
  if (correctedMonacoEditor) {
    correctedMonacoEditor.dispose()
    correctedMonacoEditor = null
  }
}

// 监听视图模式变化
watch(viewMode, async (newMode) => {
  if (newMode === 'split') {
    await nextTick()
    initMonacoEditors()
  } else {
    disposeMonacoEditors()
  }
})

// 监听结果数据变化
watch([() => resultData.value, originalText, correctedText], async () => {
  if (viewMode.value === 'split' && resultData.value) {
    await nextTick()
    initMonacoEditors()
  }
})

// 监听主题变化
watch(
  () => themeState.currentTheme.type,
  () => {
    if (viewMode.value === 'split') {
      const theme = themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs'
      monaco.editor.setTheme(theme)
    }
  }
)

onMounted(async () => {
  if (viewMode.value === 'split' && resultData.value) {
    await nextTick()
    initMonacoEditors()
  }
})

onBeforeUnmount(() => {
  disposeMonacoEditors()
})

const containerStyle = computed(() => ({
  padding: '16px',
  backgroundColor: 'transparent',
  borderRadius: '0',
  color: themeState.currentTheme.textColor
}))

const statusMessageStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '20px',
  textAlign: 'center',
  justifyContent: 'center'
}))

const completedStateStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const headerStyle = computed(() => ({
  marginBottom: '16px',
  paddingBottom: '12px',
  borderBottom: `1px solid ${themeState.currentTheme.textColor2}20`,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '12px'
}))

const titleStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  margin: 0
}))

const statsStyle = computed(() => ({
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap'
}))

const errorItemStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  border: `1px solid ${themeState.currentTheme.textColor2}20`,
  borderRadius: '6px',
  padding: '12px',
  marginBottom: '8px'
}))

const locationStyle = computed(() => ({
  color: themeState.currentTheme.textColor2,
  fontSize: '12px',
  fontFamily: 'monospace'
}))

const contentStyle = computed(() => ({
  marginTop: '8px',
  paddingTop: '8px',
  borderTop: `1px solid ${themeState.currentTheme.textColor2}20`
}))

const messageStyle = computed(() => ({
  color: themeState.currentTheme.textColor2,
  fontSize: '12px',
  marginTop: '4px',
  fontStyle: 'italic'
}))

const noErrorsStyle = computed(() => ({
  padding: '40px 20px',
  textAlign: 'center'
}))

const editorHeaderStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor,
  borderBottom: `1px solid ${themeState.currentTheme.textColor2}20`,
  padding: '8px 12px',
  fontSize: '13px',
  fontWeight: '500'
}))

const editorContainerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  height: '500px'
}))
</script>

<style scoped>
.proofread-display {
  width: 100%;
}

.errors-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.error-item {
  transition: all 0.2s;
}

.error-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.error-item.error-fixed {
  border-left: 4px solid #67c23a;
  opacity: 0.8;
}

.error-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.error-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.error-text,
.error-suggestions {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;
}

.suggestions-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}

.suggestion-tag {
  user-select: none;
}

.label {
  font-weight: bold;
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor2');
}

code {
  background-color: v-bind('themeState.currentTheme.background2nd');
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
  font-family: monospace;
}

.suggestion-text {
  color: #67c23a;
}

.is-loading {
  animation: rotating 2s linear infinite;
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.mode-switch {
  margin-left: auto;
}

.split-view-container {
  width: 100%;
  height: 500px;
  border: 1px solid v-bind('themeState.currentTheme.textColor2');
  border-radius: 6px;
  overflow: hidden;
  background-color: v-bind('themeState.currentTheme.background');
}

.split-editors {
  display: flex;
  width: 100%;
  height: 100%;
}

.editor-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid v-bind('themeState.currentTheme.textColor2');
  overflow: hidden;
}

.editor-panel:last-child {
  border-right: none;
}

.monaco-editor-container {
  flex: 1;
  min-height: 0;
}
</style>

<style>
/* 全局样式：Monaco 编辑器的校对高亮 */
.proofread-error-highlight {
  background-color: rgba(245, 108, 108, 0.3) !important;
  font-weight: bold;
}

.proofread-error-line {
  background-color: rgba(245, 108, 108, 0.1) !important;
}

.proofread-error-glyph {
  background-color: rgba(245, 108, 108, 0.3) !important;
}

.proofread-suggestion-highlight {
  background-color: rgba(103, 194, 58, 0.3) !important;
  font-weight: bold;
}

.proofread-suggestion-line {
  background-color: rgba(103, 194, 58, 0.1) !important;
}

.proofread-suggestion-glyph {
  background-color: rgba(103, 194, 58, 0.3) !important;
}
</style>
