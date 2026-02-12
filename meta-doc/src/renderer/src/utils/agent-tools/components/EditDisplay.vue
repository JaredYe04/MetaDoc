<template>
  <div class="edit-display" :style="containerStyle">
    <div v-if="displayData.stage === 'loading' || displayData.stage === 'applying' || displayData.stage === 'updating'" class="status-message" :style="statusMessageStyle">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ getStageMessage(displayData.stage) }}</span>
    </div>

    <div v-else-if="displayData.stage === 'completed'" class="completed-state" :style="completedStateStyle">
      <div v-if="resultData" class="edit-header" :style="headerStyle">
        <h3 class="edit-title" :style="titleStyle">{{ $t('agent.display.edit.title') }}</h3>
        <div class="edit-stats" :style="statsStyle">
          <el-tag type="success" size="small">{{ $t('agent.display.edit.appliedEdits') }}: {{ resultData.appliedEdits }}</el-tag>
          <el-tag v-if="resultData.failedEdits > 0" type="danger" size="small">{{ $t('agent.display.edit.failedEdits') }}: {{ resultData.failedEdits }}</el-tag>
          <el-tag type="info" size="small">{{ $t('agent.display.edit.totalOperations') }}: {{ resultData.operations.length }}</el-tag>
          <el-button-group v-if="hasFullContent" class="mode-switch">
            <el-button 
              :type="viewMode === 'unified' ? 'primary' : 'default'" 
              size="small"
              @click="viewMode = 'unified'"
            >
              {{ $t('agent.display.edit.unifiedView') }}
            </el-button>
            <el-button 
              :type="viewMode === 'split' ? 'primary' : 'default'" 
              size="small"
              @click="viewMode = 'split'"
            >
              {{ $t('agent.display.edit.splitView') }}
            </el-button>
          </el-button-group>
        </div>
      </div>

      <!-- 如果没有完整内容（verbose模式），只显示概要 -->
      <div v-if="resultData && !hasFullContent" class="summary-view" :style="summaryViewStyle">
        <el-alert
          type="info"
          :closable="false"
          :title="$t('agent.display.edit.summaryMode') || '概要模式'"
        >
          <template #default>
            <div class="summary-content">
              <p>{{ $t('agent.display.edit.summaryDescription') || '编辑操作已成功完成。由于verbose模式未启用，未包含完整内容以节省空间。' }}</p>
              <ul class="summary-list">
                <li>{{ $t('agent.display.edit.appliedEdits') }}: {{ resultData.appliedEdits }}</li>
                <li v-if="resultData.failedEdits > 0">{{ $t('agent.display.edit.failedEdits') }}: {{ resultData.failedEdits }}</li>
                <li>{{ $t('agent.display.edit.totalOperations') }}: {{ resultData.operations.length }}</li>
              </ul>
            </div>
          </template>
        </el-alert>
      </div>

      <!-- 如果没有resultData，显示成功消息 -->
      <div v-else-if="!resultData" class="no-data-message" :style="noDataMessageStyle">
        <el-result
          icon="success"
          :title="$t('agent.display.edit.completed') || '编辑完成'"
          :sub-title="$t('agent.display.edit.noDetails') || '编辑操作已成功完成'"
        />
      </div>

      <!-- 统一视图（操作列表） -->
      <div v-else-if="resultData && hasFullContent && viewMode === 'unified'">
        <el-scrollbar max-height="500px">
          <div class="operations-list">
            <div
              v-for="(operation, index) in resultData.operations"
              :key="index"
              class="operation-item"
              :style="operationItemStyle"
            >
              <div class="operation-header" :style="operationHeaderStyle">
                <el-tag :type="getOperationTypeTag(operation.type)" size="small">
                  {{ getOperationTypeLabel(operation.type) }}
                </el-tag>
                <span class="operation-range" :style="rangeStyle">
                  {{ formatRange(operation.range) }}
                </span>
              </div>
              <div class="operation-content" :style="contentStyle">
                <div v-if="operation.type === 'insert' || operation.type === 'replace'" class="operation-new">
                  <span class="content-label" :style="labelStyle">{{ $t('agent.display.edit.newContent') }}:</span>
                  <pre class="content-text" :style="textStyle">{{ operation.content || '' }}</pre>
                </div>
                <div v-if="operation.type === 'delete' || operation.type === 'replace'" class="operation-old">
                  <span class="content-label" :style="labelStyle">{{ $t('agent.display.edit.oldContent') }}:</span>
                  <pre class="content-text deleted-text" :style="deletedTextStyle">{{ getOldContent(operation) }}</pre>
                </div>
              </div>
            </div>
          </div>
        </el-scrollbar>
      </div>

      <!-- 分列视图（Monaco 编辑器对比） -->
      <div v-else-if="resultData && hasFullContent" class="split-view-container">
        <div class="split-view-layout">
          <!-- 左侧：操作列表 -->
          <div class="operations-panel" :style="{ width: leftPanelWidth + '%' }">
            <div class="operations-header" :style="editorHeaderStyle">
              <span class="editor-label">{{ $t('agent.display.edit.operations') || '操作列表' }}</span>
            </div>
            <el-scrollbar class="operations-scroll">
              <div class="operations-list-compact">
                <div
                  v-for="(operation, index) in resultData.operations"
                  :key="index"
                  class="operation-item-compact"
                  :class="{ 'operation-item-active': selectedOperationIndex === index }"
                  :style="operationItemStyle"
                  @click="selectOperation(index)"
                >
                  <div class="operation-header-compact" :style="operationHeaderStyle">
                    <el-tag :type="getOperationTypeTag(operation.type)" size="small">
                      {{ getOperationTypeLabel(operation.type) }}
                    </el-tag>
                    <span class="operation-range" :style="rangeStyle">
                      {{ formatRange(operation.range) }}
                    </span>
                  </div>
                  <div v-if="operation.content" class="operation-preview" :style="contentStyle">
                    <pre class="content-text-preview" :style="textStyle">{{ truncateText(operation.content, 50) }}</pre>
                  </div>
                </div>
              </div>
            </el-scrollbar>
          </div>
          
          <!-- 分割线（固定30/70比例，不可调整） -->
          <div 
            class="resize-handle"
            :style="resizeHandleStyle"
          ></div>
          
          <!-- 右侧：Monaco 编辑器对比 -->
          <div class="editors-panel" :style="{ width: rightPanelWidth + '%' }">
            <div class="split-editors">
              <div class="editor-panel old-panel">
                <div class="editor-header" :style="editorHeaderStyle">
                  <span class="editor-label">{{ $t('agent.display.edit.oldContent') }}</span>
                </div>
                <div :id="oldEditorId" class="monaco-editor-container" :style="editorContainerStyle"></div>
              </div>
              <div class="editor-panel new-panel">
                <div class="editor-header" :style="editorHeaderStyle">
                  <span class="editor-label">{{ $t('agent.display.edit.newContent') }}</span>
                </div>
                <div :id="newEditorId" class="monaco-editor-container" :style="editorContainerStyle"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="error-state">
      <el-alert
        :title="displayData.error || $t('agent.display.edit.error')"
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
import type { EditResult, EditOperation } from '../edit-tool'
import { useWorkspace } from '../../../stores/workspace'
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
const oldEditorId = ref(`edit-old-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
const newEditorId = ref(`edit-new-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
let oldMonacoEditor: monaco.editor.IStandaloneCodeEditor | null = null
let newMonacoEditor: monaco.editor.IStandaloneCodeEditor | null = null

// 左右面板宽度（百分比）
const leftPanelWidth = ref(30)  // 默认30%
const rightPanelWidth = ref(70)  // 默认70%
const selectedOperationIndex = ref<number | null>(null)
const isResizing = ref(false)

const workspace = useWorkspace()

const displayData = computed(() => {
  // 优先使用实时数据（通过onUpdate发送的），这是工具主动发送的，更可靠
  const data = realtimeData.value !== null ? realtimeData.value : props.data
  const parsed = parseToolData(data) as any
  
  // 优先使用实时状态（通过eventBus更新的）
  const currentStatus = realtimeStatus.value !== 'running' ? realtimeStatus.value : props.status
  
  if (parsed && typeof parsed === 'object') {
    const getStage = (): 'loading' | 'applying' | 'updating' | 'completed' | 'error' => {
      // 优先使用parsed中的stage（来自onUpdate）
      if (parsed.stage) {
        return parsed.stage
      }
      // 其次使用实时状态
      if (currentStatus === 'succeeded') {
        return 'completed'
      }
      if (currentStatus === 'failed') {
        return 'error'
      }
      return 'loading'
    }
    
    return {
      ...parsed,
      stage: getStage()
    }
  }
  
  // 如果没有解析到数据，根据状态推断stage
  const defaultStage = currentStatus === 'succeeded' ? 'completed' : (currentStatus === 'failed' ? 'error' : 'loading')
  return {
    stage: defaultStage,
    result: undefined,
    error: undefined
  }
})

const resultData = computed((): EditResult | null => {
  const data = displayData.value
  if (data && typeof data === 'object') {
    // 尝试多种路径提取result
    // 1. 直接从data.result获取（最直接）
    // 2. 从data.content.result获取（ToolCallbackData格式）
    // 3. 从data.content获取（如果content本身就是result）
    // 4. 如果data本身就有operations，说明data就是result
    let result = data.result || data.content?.result || data.content || data
    
    // 如果result有operations字段，说明它是EditResult
    if (result && typeof result === 'object' && 'operations' in result && Array.isArray(result.operations)) {
      return result as EditResult
    }
  }
  return null
})

// 检查是否有完整内容（verbose模式）
const hasFullContent = computed(() => {
  return !!(resultData.value?.originalContent && resultData.value?.newContent)
})

const oldContent = computed(() => {
  return resultData.value?.originalContent || ''
})

const newContent = computed(() => {
  return resultData.value?.newContent || ''
})

const getStageMessage = (stage: string) => {
  if (stage === 'loading') return t('agent.display.edit.loading')
  if (stage === 'applying') return t('agent.display.edit.applying')
  if (stage === 'updating') return t('agent.display.edit.updating')
  return t('agent.display.edit.processing')
}

const formatRange = (range: { start: { line: number; column: number }; end: { line: number; column: number } }) => {
  if (range.start.line === range.end.line && range.start.column === range.end.column) {
    return `行 ${range.start.line}, 列 ${range.start.column}`
  }
  return `行 ${range.start.line}:${range.start.column} - ${range.end.line}:${range.end.column}`
}

const getOldContent = (operation: EditOperation) => {
  if (!resultData.value?.originalContent) return ''
  
  if (operation.type === 'delete' || operation.type === 'replace') {
    // 从原始内容中提取被删除/替换的部分
    const lines = resultData.value.originalContent.split(/\r?\n/)
    if (operation.range.start.line > 0 && operation.range.start.line <= lines.length) {
      const lineIndex = operation.range.start.line - 1
      const line = lines[lineIndex]
      
      if (operation.range.start.line === operation.range.end.line) {
        // 同一行的内容
        const startCol = operation.range.start.column - 1
        const endCol = operation.range.end.column - 1
        return line.substring(startCol, endCol)
      } else {
        // 跨行的内容
        let content = line.substring(operation.range.start.column - 1) + '\n'
        for (let i = operation.range.start.line; i < operation.range.end.line - 1; i++) {
          content += lines[i] + '\n'
        }
        content += lines[operation.range.end.line - 1].substring(0, operation.range.end.column - 1)
        return content
      }
    }
  }
  return ''
}

const getOperationTypeTag = (type: string) => {
  const map: Record<string, string> = {
    insert: 'success',
    replace: 'warning',
    delete: 'danger'
  }
  return map[type] || 'info'
}

const getOperationTypeLabel = (type: string) => {
  const map: Record<string, string> = {
    insert: t('agent.display.edit.type.insert'),
    replace: t('agent.display.edit.type.replace'),
    delete: t('agent.display.edit.type.delete')
  }
  return map[type] || type
}

// 截断文本
const truncateText = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

// 选择操作
const selectOperation = (index: number) => {
  selectedOperationIndex.value = index
  // 可以在这里添加跳转到对应位置的逻辑
  if (oldMonacoEditor && resultData.value?.operations[index]) {
    const op = resultData.value.operations[index]
    const range = new monaco.Range(
      op.range.start.line,
      op.range.start.column,
      op.range.end.line,
      op.range.end.column
    )
    oldMonacoEditor.revealRangeInCenter(range)
    oldMonacoEditor.setPosition({ lineNumber: op.range.start.line, column: op.range.start.column })
  }
}

// 调整宽度（保持30/70比例，不允许用户调整）
const startResize = (e: MouseEvent) => {
  // 禁用调整功能，始终保持30/70比例
  // 如果需要允许调整，可以取消注释下面的代码
  /*
  isResizing.value = true
  const startX = e.clientX
  const startLeftWidth = leftPanelWidth.value
  
  const handleMouseMove = (moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - startX
    const container = (moveEvent.target as HTMLElement)?.closest('.split-view-container') as HTMLElement
    if (container) {
      const containerWidth = container.clientWidth
      const deltaPercent = (deltaX / containerWidth) * 100
      const newLeftWidth = Math.max(20, Math.min(60, startLeftWidth + deltaPercent))
      leftPanelWidth.value = newLeftWidth
      rightPanelWidth.value = 100 - newLeftWidth
    }
  }
  
  const handleMouseUp = () => {
    isResizing.value = false
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }
  
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
  */
}

const resizeHandleStyle = computed(() => ({
  cursor: 'col-resize',
  backgroundColor: isResizing.value 
    ? themeState.currentTheme.textColor2 + '40' 
    : themeState.currentTheme.textColor2 + '20',
  width: '4px',
  transition: isResizing.value ? 'none' : 'background-color 0.2s'
}))

// 初始化 Monaco 编辑器（分列视图）
const initMonacoEditors = async () => {
  if (viewMode.value !== 'split') return
  
  // 确保 Monaco Worker 已配置
  setupMonacoWorker()
  
  await nextTick()
  
  const oldContainer = document.getElementById(oldEditorId.value)
  const newContainer = document.getElementById(newEditorId.value)
  
  if (!oldContainer || !newContainer) {
    console.warn('Monaco编辑器容器未找到')
    return
  }

  // 从全局获取编辑器实例
  const editors = monaco.editor.getEditors()
  const oldEditor = editors.find(e => e.getId?.() === oldEditorId.value)
  const newEditor = editors.find(e => e.getId?.() === newEditorId.value)
  
  if (oldEditor) {
    oldEditor.dispose()
  }
  if (newEditor) {
    newEditor.dispose()
  }

  // 创建旧内容编辑器（使用空内容，因为无法完全重构）
  oldMonacoEditor = monaco.editor.create(oldContainer, {
    value: oldContent.value || '',
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
    renderLineHighlight: 'all'
  })

  // 创建新内容编辑器
  newMonacoEditor = monaco.editor.create(newContainer, {
    value: newContent.value || '',
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
    renderLineHighlight: 'all'
  })

  // 同步滚动
  oldMonacoEditor.onDidScrollChange((e) => {
    if (e.scrollTop !== undefined) {
      newMonacoEditor?.setScrollTop(e.scrollTop)
    }
    if (e.scrollLeft !== undefined) {
      newMonacoEditor?.setScrollLeft(e.scrollLeft)
    }
  })

  newMonacoEditor.onDidScrollChange((e) => {
    if (e.scrollTop !== undefined) {
      oldMonacoEditor?.setScrollTop(e.scrollTop)
    }
    if (e.scrollLeft !== undefined) {
      oldMonacoEditor?.setScrollLeft(e.scrollLeft)
    }
  })

  // 高亮编辑区域（如果有 operations）
  if (resultData.value && resultData.value.operations.length > 0) {
    highlightEdits()
  }
}

const highlightEdits = () => {
  if (!oldMonacoEditor || !newMonacoEditor || !resultData.value) return
  
  const oldDecorations: monaco.editor.IModelDeltaDecoration[] = []
  const newDecorations: monaco.editor.IModelDeltaDecoration[] = []
  
  for (const op of resultData.value.operations) {
    if (op.type === 'delete' || op.type === 'replace') {
      // 在旧编辑器中高亮删除的部分
      const range = new monaco.Range(
        op.range.start.line,
        op.range.start.column,
        op.range.end.line,
        op.range.end.column
      )
      oldDecorations.push({
        range,
        options: {
          isWholeLine: op.range.start.line === op.range.end.line,
          className: 'edit-line-delete',
          minimap: {
            color: 'rgba(245, 108, 108, 0.3)',
            position: monaco.editor.MinimapPosition.Inline
          }
        }
      })
    }
    
    if (op.type === 'insert' || op.type === 'replace') {
      // 在新编辑器中高亮插入的部分
      // 需要计算插入后的位置（简化处理）
      const range = new monaco.Range(
        op.range.start.line,
        op.range.start.column,
        op.range.start.line,
        op.range.start.column + (op.content?.length || 0)
      )
      newDecorations.push({
        range,
        options: {
          isWholeLine: false,
          className: 'edit-line-insert',
          minimap: {
            color: 'rgba(103, 194, 58, 0.3)',
            position: monaco.editor.MinimapPosition.Inline
          }
        }
      })
    }
  }
  
  oldMonacoEditor.deltaDecorations([], oldDecorations)
  newMonacoEditor.deltaDecorations([], newDecorations)
}

const disposeMonacoEditors = () => {
  if (oldMonacoEditor) {
    oldMonacoEditor.dispose()
    oldMonacoEditor = null
  }
  if (newMonacoEditor) {
    newMonacoEditor.dispose()
    newMonacoEditor = null
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

// 监听内容变化
watch([() => resultData.value, oldContent, newContent], async () => {
  if (viewMode.value === 'split' && resultData.value) {
    await nextTick()
    initMonacoEditors()
  }
})

// 监听主题变化
watch(() => themeState.currentTheme.type, () => {
  if (viewMode.value === 'split') {
    const theme = themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs'
    monaco.editor.setTheme(theme)
  }
})

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
  flexWrap: 'wrap',
  alignItems: 'center'
}))

const operationItemStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  border: `1px solid ${themeState.currentTheme.textColor2}20`,
  borderRadius: '6px',
  padding: '12px',
  marginBottom: '12px'
}))

const operationHeaderStyle = computed(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '8px'
}))

const rangeStyle = computed(() => ({
  color: themeState.currentTheme.textColor2,
  fontSize: '12px',
  fontFamily: 'monospace'
}))

const contentStyle = computed(() => ({
  marginTop: '8px',
  paddingTop: '8px',
  borderTop: `1px solid ${themeState.currentTheme.textColor2}10`
}))

const labelStyle = computed(() => ({
  color: themeState.currentTheme.textColor2,
  fontSize: '12px',
  fontWeight: '500',
  marginBottom: '4px',
  display: 'block'
}))

const textStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  fontFamily: 'JetBrains Mono, Consolas, monospace',
  fontSize: '13px',
  margin: 0,
  padding: '8px',
  backgroundColor: themeState.currentTheme.background2nd,
  borderRadius: '4px',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word'
}))

const deletedTextStyle = computed(() => ({
  ...textStyle.value,
  textDecoration: 'line-through',
  color: themeState.currentTheme.textColor2
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

const noDataMessageStyle = computed(() => ({
  padding: '40px 20px',
  textAlign: 'center',
  color: themeState.currentTheme.textColor
}))

const summaryViewStyle = computed(() => ({
  padding: '20px',
  color: themeState.currentTheme.textColor
}))
</script>

<style scoped>
.edit-display {
  width: 100%;
}

.edit-header {
  margin-bottom: 16px;
}

.mode-switch {
  margin-left: auto;
}

.operations-list {
  padding: 8px;
}

.operation-item {
  transition: all 0.2s;
}

.operation-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.operation-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.content-text {
  margin: 0;
}

.deleted-text {
  text-decoration: line-through;
  opacity: 0.7;
}

.split-view-container {
  width: 100%;
  height: 500px;
  border: 1px solid v-bind('themeState.currentTheme.borderColor');
  border-radius: 6px;
  overflow: hidden;
  background-color: v-bind('themeState.currentTheme.background');
}

.split-view-layout {
  display: flex;
  width: 100%;
  height: 100%;
}

.operations-panel {
  display: flex;
  flex-direction: column;
  border-right: 1px solid v-bind('themeState.currentTheme.borderColor');
  overflow: hidden;
  min-width: 200px;
  flex-shrink: 0;
  flex-grow: 0;
}

.operations-header {
  flex-shrink: 0;
}

.operations-scroll {
  flex: 1;
  min-height: 0;
}

.operations-list-compact {
  padding: 8px;
}

.operation-item-compact {
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 8px;
}

.operation-item-compact:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.operation-item-active {
  border: 2px solid v-bind('themeState.currentTheme.primaryColor || "#409eff"') !important;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.2);
}

.operation-header-compact {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.operation-preview {
  margin-top: 4px;
}

.content-text-preview {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  max-height: 40px;
  overflow: hidden;
}

.resize-handle {
  flex-shrink: 0;
  cursor: default;
  user-select: none;
  position: relative;
}

.resize-handle:hover {
  background-color: v-bind('themeState.currentTheme.textColor2 + "30"') !important;
}

.editors-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 300px;
  flex-shrink: 0;
  flex-grow: 0;
}

.split-editors {
  display: flex;
  width: 100%;
  height: 100%;
  flex: 1;
}

.editor-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid v-bind('themeState.currentTheme.borderColor');
  overflow: hidden;
}

.editor-panel:last-child {
  border-right: none;
}

.monaco-editor-container {
  flex: 1;
  min-height: 0;
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

.summary-content {
  margin-top: 12px;
}

.summary-list {
  margin-top: 12px;
  padding-left: 20px;
}
</style>

<style>
/* 全局样式：Monaco 编辑器的编辑高亮 */
.edit-line-delete {
  background-color: rgba(245, 108, 108, 0.1) !important;
}

.edit-line-insert {
  background-color: rgba(103, 194, 58, 0.1) !important;
}
</style>

