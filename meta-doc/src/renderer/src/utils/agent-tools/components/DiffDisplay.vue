<template>
  <div class="diff-display" :style="containerStyle">
    <div v-if="displayData.stage === 'fetching_content'" class="status-message" :style="statusMessageStyle">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ $t('agent.display.diff.fetching') }}</span>
    </div>

    <div v-else-if="displayData.stage === 'calculating_diff'" class="status-message" :style="statusMessageStyle">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ $t('agent.display.diff.calculating') }}</span>
    </div>

    <div v-else-if="displayData.stage === 'completed' && displayData.diffResult" class="completed-state" :style="completedStateStyle">
      <div class="diff-header" :style="headerStyle">
        <h3 class="diff-title" :style="titleStyle">{{ $t('agent.display.diff.title') }}</h3>
        <div class="diff-stats" :style="statsStyle">
          <el-tag type="success" size="small">{{ $t('agent.display.diff.insertions', { count: insertionsCount }) }}</el-tag>
          <el-tag type="danger" size="small">{{ $t('agent.display.diff.deletions', { count: deletionsCount }) }}</el-tag>
          <el-tag type="info" size="small">{{ $t('agent.display.diff.equal', { count: equalCount }) }}</el-tag>
          <el-button-group class="mode-switch">
            <el-button 
              :type="viewMode === 'unified' ? 'primary' : 'default'" 
              size="small"
              @click="viewMode = 'unified'"
            >
              {{ $t('agent.display.diff.unifiedView', '统一视图') }}
            </el-button>
            <el-button 
              :type="viewMode === 'split' ? 'primary' : 'default'" 
              size="small"
              @click="viewMode = 'split'"
            >
              {{ $t('agent.display.diff.splitView', '分列视图') }}
            </el-button>
          </el-button-group>
        </div>
      </div>

      <!-- 统一视图（单列） -->
      <el-scrollbar v-if="viewMode === 'unified'" max-height="500px">
        <div class="diff-content">
          <!-- 如果diffResult是对象，遍历chunks -->
          <template v-if="diffChunks && diffChunks.length > 0">
            <div
              v-for="(chunk, chunkIndex) in diffChunks"
              :key="`chunk-${chunkIndex}`"
              class="diff-chunk"
            >
              <div class="chunk-header" :style="chunkHeaderStyle">
                <span class="chunk-info">
                  {{ chunk.oldStart }}-{{ chunk.oldEnd }} → {{ chunk.newStart }}-{{ chunk.newEnd }}
                </span>
                <el-tag :type="getChunkTagType(chunk.type)" size="small">
                  {{ getTypeLabel(chunk.type) }}
                </el-tag>
              </div>
              <!-- 显示旧文本（删除） -->
              <div v-if="chunk.oldLines && chunk.oldLines.length > 0" class="diff-lines old-lines">
                <div
                  v-for="(line, lineIndex) in chunk.oldLines"
                  :key="`old-${chunkIndex}-${lineIndex}`"
                  class="diff-line diff-delete"
                  :style="getDiffTextStyle('delete')"
                >
                  <span class="line-number">{{ chunk.oldStart + lineIndex }}</span>
                  <span class="line-content">- {{ line }}</span>
                </div>
              </div>
              <!-- 显示新文本（插入） -->
              <div v-if="chunk.newLines && chunk.newLines.length > 0" class="diff-lines new-lines">
                <div
                  v-for="(line, lineIndex) in chunk.newLines"
                  :key="`new-${chunkIndex}-${lineIndex}`"
                  class="diff-line diff-insert"
                  :style="getDiffTextStyle('insert')"
                >
                  <span class="line-number">{{ chunk.newStart + lineIndex }}</span>
                  <span class="line-content">+ {{ line }}</span>
                </div>
              </div>
            </div>
          </template>
          <!-- 如果diffResult是数组（旧格式兼容） -->
          <template v-else-if="Array.isArray(displayData.diffResult)">
          <div
            v-for="(item, index) in displayData.diffResult"
            :key="index"
            class="diff-item"
            :class="{
              'diff-insert': item.type === 'insert',
              'diff-delete': item.type === 'delete',
              'diff-equal': item.type === 'equal'
            }"
          >
            <div class="diff-line-number">{{ index + 1 }}</div>
            <div class="diff-type-badge" :class="`type-${item.type}`">
              {{ getTypeLabel(item.type) }}
            </div>
            <div class="diff-text" :style="getDiffTextStyle(item.type)">
              {{ item.value }}
            </div>
            </div>
          </template>
          <!-- 如果没有差异数据 -->
          <div v-else class="no-diff-data">
            {{ $t('agent.display.diff.noData', '无差异数据') }}
          </div>
        </div>
      </el-scrollbar>

      <!-- 分列视图（双列 Monaco 编辑器） -->
      <div v-else class="split-view-container">
        <div class="split-editors">
          <div class="editor-panel old-panel">
            <div class="editor-header" :style="editorHeaderStyle">
              <span class="editor-label">{{ $t('agent.display.diff.oldText', '旧文本') }}</span>
            </div>
            <div :id="oldEditorId" class="monaco-editor-container" :style="editorContainerStyle"></div>
          </div>
          <div class="editor-panel new-panel">
            <div class="editor-header" :style="editorHeaderStyle">
              <span class="editor-label">{{ $t('agent.display.diff.newText', '新文本') }}</span>
            </div>
            <div :id="newEditorId" class="monaco-editor-container" :style="editorContainerStyle"></div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="error-state">
      <el-alert
        :title="displayData.error || $t('agent.display.diff.error')"
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
const oldEditorId = ref(`diff-old-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
const newEditorId = ref(`diff-new-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)

const displayData = computed(() => {
  const data = realtimeData.value !== null ? realtimeData.value : props.data
  const parsed = parseToolData(data) as any
  
  if (parsed && typeof parsed === 'object') {
    // 根据status确定stage，优先使用数据中的stage，如果没有则根据status推断
    const getStage = (): 'loading' | 'computing' | 'completed' | 'error' => {
      if (parsed.stage) {
        return parsed.stage
      }
      // 根据status推断stage
      if (props.status === 'succeeded') {
        return 'completed'
      }
      if (props.status === 'failed') {
        return 'error'
      }
      return 'computing'
    }
    // 提取diffResult（可能在content中，也可能在顶层）
    let diffResult = parsed.diffResult || parsed.content?.diffResult || parsed.result
    
    return {
      ...parsed,
      stage: getStage(),
      diffResult: diffResult
    }
  }
  
  // 如果没有数据，根据status设置默认stage
  const defaultStage = props.status === 'succeeded' ? 'completed' : (props.status === 'failed' ? 'error' : 'computing')
  return {
    stage: defaultStage,
    diffResult: undefined,
    error: undefined
  }
})

const effectiveStatus = computed(() => {
  return realtimeStatus.value !== 'running' ? realtimeStatus.value : props.status
})

// 获取diff chunks（处理不同的数据格式）
const diffChunks = computed(() => {
  if (!displayData.value.diffResult) return []
  
  // 如果diffResult是对象，返回chunks数组
  if (displayData.value.diffResult.chunks && Array.isArray(displayData.value.diffResult.chunks)) {
    return displayData.value.diffResult.chunks
  }
  
  // 如果diffResult本身就是数组，直接返回
  if (Array.isArray(displayData.value.diffResult)) {
    return displayData.value.diffResult
  }
  
  return []
})

// 获取旧文本和新文本（用于分列视图）
const oldText = computed(() => {
  if (displayData.value.diffResult?.oldText) {
    return displayData.value.diffResult.oldText
  }
  // 如果没有oldText，从chunks构建
  if (diffChunks.value.length > 0) {
    return diffChunks.value
      .filter((chunk: any) => chunk.oldLines && chunk.oldLines.length > 0)
      .map((chunk: any) => chunk.oldLines.join('\n'))
      .join('\n')
  }
  return ''
})

const newText = computed(() => {
  if (displayData.value.diffResult?.newText) {
    return displayData.value.diffResult.newText
  }
  // 如果没有newText，从chunks构建
  if (diffChunks.value.length > 0) {
    return diffChunks.value
      .filter((chunk: any) => chunk.newLines && chunk.newLines.length > 0)
      .map((chunk: any) => chunk.newLines.join('\n'))
      .join('\n')
  }
  return ''
})

// 获取chunk标签类型
const getChunkTagType = (type: string) => {
  const map: Record<string, string> = {
    insert: 'success',
    delete: 'danger',
    replace: 'warning',
    equal: 'info'
  }
  return map[type] || 'info'
}

const insertionsCount = computed(() => {
  if (!displayData.value.diffResult) return 0
  // diffResult可能是对象（包含chunks和summary）或数组（chunks）
  const summary = displayData.value.diffResult.summary
  if (summary && typeof summary.insertions === 'number') {
    return summary.insertions
  }
  // 如果是数组，计算插入数量
  if (Array.isArray(displayData.value.diffResult)) {
  return displayData.value.diffResult.filter((item: any) => item.type === 'insert').length
  }
  // 如果是对象，从chunks计算
  if (displayData.value.diffResult.chunks && Array.isArray(displayData.value.diffResult.chunks)) {
    return displayData.value.diffResult.chunks
      .filter((chunk: any) => chunk.type === 'insert')
      .reduce((sum: number, chunk: any) => sum + (chunk.newLines?.length || 0), 0)
  }
  return 0
})

const deletionsCount = computed(() => {
  if (!displayData.value.diffResult) return 0
  // diffResult可能是对象（包含chunks和summary）或数组（chunks）
  const summary = displayData.value.diffResult.summary
  if (summary && typeof summary.deletions === 'number') {
    return summary.deletions
  }
  // 如果是数组，计算删除数量
  if (Array.isArray(displayData.value.diffResult)) {
  return displayData.value.diffResult.filter((item: any) => item.type === 'delete').length
  }
  // 如果是对象，从chunks计算
  if (displayData.value.diffResult.chunks && Array.isArray(displayData.value.diffResult.chunks)) {
    return displayData.value.diffResult.chunks
      .filter((chunk: any) => chunk.type === 'delete')
      .reduce((sum: number, chunk: any) => sum + (chunk.oldLines?.length || 0), 0)
  }
  return 0
})

const equalCount = computed(() => {
  if (!displayData.value.diffResult) return 0
  // 如果是数组，计算相同数量
  if (Array.isArray(displayData.value.diffResult)) {
  return displayData.value.diffResult.filter((item: any) => item.type === 'equal').length
  }
  // 如果是对象，从chunks计算
  if (displayData.value.diffResult.chunks && Array.isArray(displayData.value.diffResult.chunks)) {
    return displayData.value.diffResult.chunks
      .filter((chunk: any) => chunk.type === 'equal')
      .reduce((sum: number, chunk: any) => sum + (chunk.oldLines?.length || 0), 0)
  }
  return 0
})

const getTypeLabel = (type: string) => {
  if (type === 'insert') return '+'
  if (type === 'delete') return '-'
  if (type === 'replace') return '~'
  return '='
}

const getDiffTextStyle = (type: string) => {
  const baseStyle: Record<string, string> = {
    padding: '2px 8px',
    borderRadius: '4px',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  }

  if (type === 'insert') {
    baseStyle.backgroundColor = 'rgba(103, 194, 58, 0.1)'
    baseStyle.color = themeState.currentTheme.textColor
  } else if (type === 'delete') {
    baseStyle.backgroundColor = 'rgba(245, 108, 108, 0.1)'
    baseStyle.color = themeState.currentTheme.textColor
    baseStyle.textDecoration = 'line-through'
  } else {
    baseStyle.color = themeState.currentTheme.textColor2
  }

  return baseStyle
}

const containerStyle = computed(() => ({
  padding: '16px',
  backgroundColor: themeState.currentTheme.background2nd,
  borderRadius: '8px',
  color: themeState.currentTheme.textColor
}))

const statusMessageStyle = computed<Record<string, string>>(() => ({
  color: themeState.currentTheme.textColor,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '20px',
  textAlign: 'center',
  justifyContent: 'center'
}))

const chunkHeaderStyle = computed(() => ({
  borderBottomColor: `${themeState.currentTheme.textColor2}20`
}))

const completedStateStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))

const headerStyle = computed(() => ({
  marginBottom: '16px',
  paddingBottom: '12px',
  borderBottom: `1px solid ${themeState.currentTheme.textColor2}20`
}))

const titleStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  margin: '0 0 12px 0'
}))

const statsStyle = computed<Record<string, string>>(() => ({
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap'
}))

const editorHeaderStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor,
  borderBottomColor: `${themeState.currentTheme.textColor2}20`
}))

const editorContainerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background
}))

const chunkBorderColor = computed(() => `${themeState.currentTheme.textColor2}20`)
const splitBorderColor = computed(() => `${themeState.currentTheme.textColor2}20`)

// 初始化 Monaco 编辑器（分列视图）
const initMonacoEditors = async () => {
  if (viewMode.value !== 'split') return
  
  await nextTick()
  
  const oldContainer = document.getElementById(oldEditorId.value)
  const newContainer = document.getElementById(newEditorId.value)
  
  if (!oldContainer || !newContainer) {
    console.warn('Monaco编辑器容器未找到')
    return
  }

  // 确保 Monaco Worker 已配置
  setupMonacoWorker()

  // 从全局获取编辑器实例（如果已存在则先销毁）
  const editors = monaco.editor.getEditors()
  const oldEditor = editors.find(e => e.getId?.() === oldEditorId.value)
  const newEditor = editors.find(e => e.getId?.() === newEditorId.value)
  
  if (oldEditor) {
    oldEditor.dispose()
  }
  if (newEditor) {
    newEditor.dispose()
  }

  // 创建旧文本编辑器
  const oldMonacoEditor = monaco.editor.create(oldContainer, {
    value: oldText.value,
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
    // 添加删除行的背景色
    lineDecorationsWidth: 10,
    glyphMargin: true
  })

  // 创建新文本编辑器
  const newMonacoEditor = monaco.editor.create(newContainer, {
    value: newText.value,
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
    // 添加插入行的背景色
    lineDecorationsWidth: 10,
    glyphMargin: true
  })

  // 同步滚动
  oldMonacoEditor.onDidScrollChange((e) => {
    if (e.scrollTop !== undefined) {
      newMonacoEditor.setScrollTop(e.scrollTop)
    }
    if (e.scrollLeft !== undefined) {
      newMonacoEditor.setScrollLeft(e.scrollLeft)
    }
  })

  newMonacoEditor.onDidScrollChange((e) => {
    if (e.scrollTop !== undefined) {
      oldMonacoEditor.setScrollTop(e.scrollTop)
    }
    if (e.scrollLeft !== undefined) {
      oldMonacoEditor.setScrollLeft(e.scrollLeft)
    }
  })

  // 根据diff chunks添加行装饰（高亮删除和插入的行）
  if (diffChunks.value.length > 0) {
    const oldDecorations: monaco.editor.IModelDeltaDecoration[] = []
    const newDecorations: monaco.editor.IModelDeltaDecoration[] = []
    let oldLineOffset = 0
    let newLineOffset = 0

    for (const chunk of diffChunks.value) {
      if (chunk.type === 'delete' && chunk.oldLines) {
        // 删除的行：在旧编辑器中高亮为红色
        for (let i = 0; i < chunk.oldLines.length; i++) {
          const line = chunk.oldStart + i
          oldDecorations.push({
            range: new monaco.Range(line, 1, line, 1),
            options: {
              isWholeLine: true,
              className: 'diff-line-delete',
              glyphMarginClassName: 'diff-glyph-delete',
              minimap: {
                color: 'rgba(245, 108, 108, 0.3)',
                position: monaco.editor.MinimapPosition.Inline
              }
            }
          })
        }
        oldLineOffset += chunk.oldLines.length
      } else if (chunk.type === 'insert' && chunk.newLines) {
        // 插入的行：在新编辑器中高亮为绿色
        for (let i = 0; i < chunk.newLines.length; i++) {
          const line = chunk.newStart + i
          newDecorations.push({
            range: new monaco.Range(line, 1, line, 1),
            options: {
              isWholeLine: true,
              className: 'diff-line-insert',
              glyphMarginClassName: 'diff-glyph-insert',
              minimap: {
                color: 'rgba(103, 194, 58, 0.3)',
                position: monaco.editor.MinimapPosition.Inline
              }
            }
          })
        }
        newLineOffset += chunk.newLines.length
      } else if (chunk.type === 'replace') {
        // 替换：旧编辑器显示删除，新编辑器显示插入
        if (chunk.oldLines) {
          for (let i = 0; i < chunk.oldLines.length; i++) {
            const line = chunk.oldStart + i
            oldDecorations.push({
              range: new monaco.Range(line, 1, line, 1),
              options: {
                isWholeLine: true,
                className: 'diff-line-delete',
                glyphMarginClassName: 'diff-glyph-delete',
                minimap: {
                  color: 'rgba(245, 108, 108, 0.3)',
                  position: monaco.editor.MinimapPosition.Inline
                }
              }
            })
          }
        }
        if (chunk.newLines) {
          for (let i = 0; i < chunk.newLines.length; i++) {
            const line = chunk.newStart + i
            newDecorations.push({
              range: new monaco.Range(line, 1, line, 1),
              options: {
                isWholeLine: true,
                className: 'diff-line-insert',
                glyphMarginClassName: 'diff-glyph-insert',
                minimap: {
                  color: 'rgba(103, 194, 58, 0.3)',
                  position: monaco.editor.MinimapPosition.Inline
                }
              }
            })
          }
        }
      }
    }

    oldMonacoEditor.deltaDecorations([], oldDecorations)
    newMonacoEditor.deltaDecorations([], newDecorations)
  }
}

// 清理 Monaco 编辑器
const disposeMonacoEditors = () => {
  const editors = monaco.editor.getEditors()
  const oldEditor = editors.find(e => e.getId?.() === oldEditorId.value)
  const newEditor = editors.find(e => e.getId?.() === newEditorId.value)
  
  if (oldEditor) {
    oldEditor.dispose()
  }
  if (newEditor) {
    newEditor.dispose()
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

// 监听diff结果变化
watch([() => displayData.value.diffResult, oldText, newText], async () => {
  if (viewMode.value === 'split') {
    await nextTick()
    initMonacoEditors()
  }
})

// 监听主题变化
watch(() => themeState.currentTheme.type, async () => {
  if (viewMode.value === 'split') {
    const editors = monaco.editor.getEditors()
    const oldEditor = editors.find(e => e.getId?.() === oldEditorId.value)
    const newEditor = editors.find(e => e.getId?.() === newEditorId.value)
    
    const theme = themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs'
    if (oldEditor) {
      monaco.editor.setTheme(theme)
    }
    if (newEditor) {
      monaco.editor.setTheme(theme)
    }
  }
})

onMounted(async () => {
  if (viewMode.value === 'split') {
    await nextTick()
    initMonacoEditors()
  }
})

onBeforeUnmount(() => {
  disposeMonacoEditors()
})
</script>

<style scoped>
.diff-display {
  width: 100%;
}

.diff-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.mode-switch {
  margin-left: auto;
}

.diff-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.diff-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
}

.diff-line-number {
  min-width: 40px;
  text-align: right;
  color: v-bind('themeState.currentTheme.textColor2');
  font-size: 11px;
  padding-right: 8px;
}

.diff-type-badge {
  min-width: 20px;
  text-align: center;
  font-weight: bold;
  font-size: 12px;
}

.type-insert {
  color: #67c23a;
}

.type-delete {
  color: #f56c6c;
}

.type-equal {
  color: v-bind('themeState.currentTheme.textColor2');
}

.diff-text {
  flex: 1;
  min-width: 0;
}

.diff-insert .diff-text {
  background-color: rgba(103, 194, 58, 0.1);
}

.diff-delete .diff-text {
  background-color: rgba(245, 108, 108, 0.1);
  text-decoration: line-through;
}

.diff-chunk {
  margin-bottom: 16px;
  border: 1px solid;
  border-color: v-bind('chunkBorderColor');
  border-radius: 6px;
  overflow: hidden;
  background-color: v-bind('themeState.currentTheme.background');
}

.chunk-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid;
  border-bottom-color: v-bind('chunkBorderColor');
  background-color: v-bind('themeState.currentTheme.background2nd');
}

.chunk-info {
  font-size: 12px;
  color: v-bind('themeState.currentTheme.textColor');
  font-family: 'JetBrains Mono', 'Consolas', monospace;
}

.diff-lines {
  display: flex;
  flex-direction: column;
}

.diff-line {
  display: flex;
  align-items: flex-start;
  padding: 2px 0;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.5;
}

.line-number {
  min-width: 60px;
  text-align: right;
  padding: 0 8px;
  color: v-bind('themeState.currentTheme.textColor');
  font-size: 11px;
  user-select: none;
}

.line-content {
  flex: 1;
  padding: 0 8px;
  white-space: pre-wrap;
  word-break: break-word;
}

.old-lines .diff-line {
  background-color: rgba(245, 108, 108, 0.05);
}

.new-lines .diff-line {
  background-color: rgba(103, 194, 58, 0.05);
}

.no-diff-data {
  padding: 20px;
  text-align: center;
  color: v-bind('themeState.currentTheme.textColor');
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

/* 分列视图样式 */
.split-view-container {
  width: 100%;
  height: 500px;
  border: 1px solid;
  border-color: v-bind('splitBorderColor');
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
  border-right: 1px solid;
  border-right-color: v-bind('splitBorderColor');
  overflow: hidden;
}

.editor-panel:last-child {
  border-right: none;
}

.editor-header {
  padding: 8px 12px;
  border-bottom: 1px solid;
  border-bottom-color: v-bind('splitBorderColor');
  font-weight: 500;
  font-size: 13px;
}

.monaco-editor-container {
  flex: 1;
  min-height: 0;
}
</style>

<style>
/* 全局样式：Monaco 编辑器的行装饰 */
.diff-line-delete {
  background-color: rgba(245, 108, 108, 0.1) !important;
}

.diff-line-insert {
  background-color: rgba(103, 194, 58, 0.1) !important;
}

.diff-glyph-delete {
  background-color: rgba(245, 108, 108, 0.3) !important;
}

.diff-glyph-insert {
  background-color: rgba(103, 194, 58, 0.3) !important;
}
</style>
