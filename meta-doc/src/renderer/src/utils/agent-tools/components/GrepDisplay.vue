<template>
  <div class="grep-display" :style="containerStyle">
    <div v-if="displayData.stage === 'searching'" class="status-message" :style="statusMessageStyle">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ $t('agent.display.grep.searching') }}</span>
    </div>

    <div v-else-if="displayData.stage === 'completed' && resultData && resultData.matches" class="completed-state" :style="completedStateStyle">
      <div class="grep-header" :style="headerStyle">
        <h3 class="grep-title" :style="titleStyle">{{ $t('agent.display.grep.title') }}</h3>
        <div class="header-tags" :style="headerTagsStyle">
          <el-tag type="info" size="small">{{ $t('agent.display.grep.matchesCount', { count: resultData.totalMatches }) }}</el-tag>
          <el-tag type="primary" size="small">{{ $t('agent.display.grep.searchPattern') }}: {{ resultData.searchPattern }}</el-tag>
          <el-tag v-if="resultData.replacedCount && resultData.replacedCount > 0" type="success" size="small">
            {{ $t('agent.display.grep.replacedCount', { count: resultData.replacedCount }) }}
          </el-tag>
          <el-tag v-if="resultData.replacementText" type="warning" size="small">
            {{ $t('agent.display.grep.replacementText') }}: {{ resultData.replacementText }}
          </el-tag>
        </div>
      </div>

      <!-- 如果没有完整内容（verbose模式），只显示概要 -->
      <div v-if="!hasFullContent" class="summary-view" :style="summaryViewStyle">
        <el-alert
          type="info"
          :closable="false"
          :title="$t('agent.display.grep.summaryMode') || '概要模式'"
        >
          <template #default>
            <div class="summary-content">
              <p>{{ $t('agent.display.grep.summaryDescription') || '搜索操作已成功完成。由于verbose模式未启用，未包含完整文档内容以节省空间。' }}</p>
              <ul class="summary-list">
                <li>{{ $t('agent.display.grep.matchesCount', { count: resultData.totalMatches }) }}</li>
                <li v-if="resultData.replacedCount && resultData.replacedCount > 0">
                  {{ $t('agent.display.grep.replacedCount', { count: resultData.replacedCount }) }}
                </li>
              </ul>
            </div>
          </template>
        </el-alert>
      </div>

      <!-- 匹配列表（始终显示） -->
      <div v-if="!hasFullContent" class="matches-only-view">
        <div class="panel-header" :style="panelHeaderStyle">
          <span>{{ $t('agent.display.grep.matchesList') }} ({{ resultData.matches.length }})</span>
        </div>
        <el-scrollbar height="400px">
          <div class="matches-list">
            <div
              v-for="(match, index) in resultData.matches"
              :key="index"
              class="match-item"
              :style="getMatchItemStyle(index)"
            >
              <div class="match-header">
                <el-tag :type="getMatchScopeTag(match)" size="small">
                  {{ getMatchScopeLabel(match) }}
                </el-tag>
                <span class="match-location" :style="locationStyle">
                  {{ $t('agent.display.grep.line') }} {{ match.line }}, {{ $t('agent.display.grep.column') }} {{ match.column }}
                </span>
              </div>
              <div class="match-text" :style="matchTextStyle">
                <code>{{ match.match }}</code>
              </div>
              <div v-if="match.context" class="match-context" :style="matchContextStyle">
                <pre>{{ match.context }}</pre>
              </div>
            </div>
          </div>
        </el-scrollbar>
      </div>

      <div v-else class="grep-content">
        <!-- 左侧：搜索结果列表 -->
        <div class="matches-panel">
          <div class="panel-header" :style="panelHeaderStyle">
            <span>{{ $t('agent.display.grep.matchesList') }} ({{ resultData.matches.length }})</span>
          </div>
          <el-scrollbar height="500px">
            <div class="matches-list">
              <div
                v-for="(match, index) in resultData.matches"
                :key="index"
                class="match-item"
                :class="{ 'match-item-active': selectedMatchIndex === index }"
                :style="getMatchItemStyle(index)"
                @click="selectMatch(index)"
              >
                <div class="match-header">
                  <el-tag :type="getMatchScopeTag(match)" size="small">
                    {{ getMatchScopeLabel(match) }}
                  </el-tag>
                  <span class="match-location" :style="locationStyle">
                    {{ $t('agent.display.grep.line') }} {{ match.line }}, {{ $t('agent.display.grep.column') }} {{ match.column }}
                  </span>
                </div>
                <div class="match-text" :style="matchTextStyle">
                  <code>{{ match.match }}</code>
                </div>
              </div>
            </div>
          </el-scrollbar>
        </div>

        <!-- 右侧：Monaco 编辑器显示完整上下文 -->
        <div class="editor-panel">
          <div class="panel-header" :style="panelHeaderStyle">
            <span>{{ $t('agent.display.grep.contextView') }}</span>
            <el-button
              v-if="hasReplacedContent"
              size="small"
              :type="showReplacedContent ? 'primary' : 'default'"
              @click="toggleContent"
            >
              {{ showReplacedContent ? $t('agent.display.grep.showOriginal') : $t('agent.display.grep.showReplaced') }}
            </el-button>
          </div>
          <div :id="editorId" class="monaco-editor-container" :style="editorContainerStyle"></div>
        </div>
      </div>
    </div>

    <div v-else-if="displayData.stage === 'completed' && (!resultData || !resultData.matches || resultData.matches.length === 0)" class="no-results" :style="noResultsStyle">
      <el-empty :description="$t('agent.display.grep.noMatches')" />
    </div>

    <div v-else class="error-state">
      <el-alert
        :title="displayData.error || $t('agent.display.grep.error')"
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
import type { GrepResult, GrepMatch } from '../grep-tool'
import { setupMonacoWorker } from '../../monaco-worker-config'
import { createRendererLogger } from '../../logger'

const { t } = useI18n()
const props = defineProps<ToolDisplayComponentProps>()

const { realtimeData, realtimeStatus, realtimeProgress } = useToolDisplayRealtime(
  props.invocationId,
  props.data,
  props.status,
  props.progress
)

const selectedMatchIndex = ref<number | null>(null)
const editorId = ref(`grep-editor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
const showReplacedContent = ref(false) // 是否显示替换后的内容
let monacoEditor: monaco.editor.IStandaloneCodeEditor | null = null
let currentDecorations: string[] = [] // 保存当前的高亮装饰ID，用于清除

const displayData = computed(() => {
  const data = realtimeData.value !== null ? realtimeData.value : props.data
  const parsed = parseToolData(data) as any
  
  if (parsed && typeof parsed === 'object') {
    const getStage = (): 'searching' | 'completed' | 'error' => {
      if (parsed.stage) {
        return parsed.stage
      }
      if (props.status === 'succeeded') {
        return 'completed'
      }
      if (props.status === 'failed') {
        return 'error'
      }
      return 'searching'
    }
    
    return {
      ...parsed,
      stage: getStage()
    }
  }
  
  const defaultStage = props.status === 'succeeded' ? 'completed' : (props.status === 'failed' ? 'error' : 'searching')
  return {
    stage: defaultStage,
    result: undefined,
    error: undefined
  }
})

const resultData = computed((): GrepResult | null => {
  const data = displayData.value
  if (data && typeof data === 'object') {
    // 可能 result 在 content.result 或直接是 result
    const result = data.result || data.content?.result || data
    if (result && result.matches && Array.isArray(result.matches)) {
      return result as GrepResult
    }
  }
  return null
})

// 检查是否有完整内容（verbose模式）
const hasFullContent = computed(() => {
  return !!(resultData.value?.originalContent)
})

// 检查是否有替换后的内容
const hasReplacedContent = computed(() => {
  return !!(resultData.value?.replacedContent && resultData.value.replacedCount && resultData.value.replacedCount > 0)
})

// 获取当前显示的内容（原始内容或替换后内容）
const currentContent = computed(() => {
  if (showReplacedContent.value && hasReplacedContent.value && resultData.value?.replacedContent) {
    return resultData.value.replacedContent
  }
  return resultData.value?.originalContent || ''
})

// 获取原始内容（用于向后兼容）
const originalContent = computed(() => {
  return resultData.value?.originalContent || ''
})

// 切换显示内容
const toggleContent = async () => {
  showReplacedContent.value = !showReplacedContent.value
  // 切换内容后，重新初始化编辑器
  await nextTick()
  if (monacoEditor && currentContent.value) {
    monacoEditor.setValue(currentContent.value)
    // 如果选中了匹配项，重新高亮
    if (selectedMatchIndex.value !== null) {
      await highlightMatchInEditor(selectedMatchIndex.value)
    }
  }
}

// 获取文档语言
const documentLanguage = computed(() => {
  const lang = resultData.value?.language || 'plaintext'
  // Monaco编辑器支持的语言映射
  if (lang === 'markdown') return 'markdown'
  if (lang === 'latex') return 'latex'
  return 'plaintext'
})

const effectiveStatus = computed(() => {
  return realtimeStatus.value !== 'running' ? realtimeStatus.value : props.status
})

const getMatchScopeTag = (match: GrepMatch) => {
  // 检查 match.match 是否包含 metadata 标识
  if (match.match && match.match.startsWith('[metadata.')) {
    return 'warning'
  }
  return 'primary'
}

const getMatchScopeLabel = (match: GrepMatch) => {
  if (match.match && match.match.startsWith('[metadata.')) {
    return t('agent.display.grep.metadata')
  }
  return t('agent.display.grep.document')
}

const selectMatch = async (index: number) => {
  selectedMatchIndex.value = index
  await nextTick()
  await highlightMatchInEditor(index)
}

const getMonacoEditor = (): monaco.editor.IStandaloneCodeEditor | null => {
  // 首先尝试使用缓存的编辑器实例
  if (monacoEditor) {
    // 验证编辑器是否仍然有效
    try {
      const container = monacoEditor.getContainerDomNode()
      if (container && container.id === editorId.value) {
        return monacoEditor
      }
      // 容器 ID 不匹配，清除缓存
      monacoEditor = null
    } catch {
      // 编辑器已被销毁，清除缓存
      monacoEditor = null
    }
  }
  
  // 如果缓存为空，从全局获取编辑器实例（通过容器 ID 匹配）
  const editors = monaco.editor.getEditors()
  const foundEditor = editors.find(e => {
    try {
      const container = e.getContainerDomNode()
      // 通过容器 ID 匹配（这是最可靠的方式）
      return container && container.id === editorId.value
    } catch {
      return false
    }
  })
  
  if (foundEditor) {
    // foundEditor 可能是 ICodeEditor 类型（不是 IStandaloneCodeEditor），做类型断言
    monacoEditor = foundEditor as monaco.editor.IStandaloneCodeEditor
    return monacoEditor
  }
  
  console.warn('[GrepDisplay] 编辑器实例未找到，editorId:', editorId.value, '当前编辑器数量:', editors.length)
  // 输出所有编辑器的容器 ID 用于调试
  if (editors.length > 0) {
    const containerIds = editors.map(e => {
      try {
        return e.getContainerDomNode()?.id || 'no-id'
      } catch {
        return 'error'
      }
    })
  }
  return null
}

const highlightMatchInEditor = async (index: number) => {
  if (!resultData.value || !currentContent.value) return
  
  const match = resultData.value.matches[index]
  if (!match) return

  // 获取编辑器实例（如果不存在则从全局获取）
  const editor = getMonacoEditor()
  if (!editor) {
    const logger = createRendererLogger('GrepDisplay')
    logger.warn('[GrepDisplay] 无法获取编辑器实例，等待编辑器初始化')
    // 如果编辑器还未初始化，等待一下再试
    await nextTick()
    const retryEditor = getMonacoEditor()
    if (!retryEditor) {
      logger.error('[GrepDisplay] 编辑器初始化失败，无法高亮匹配')
      return
    }
    await highlightMatchInEditor(index)
    return
  }

  // 清除之前的高亮装饰
  if (currentDecorations.length > 0) {
    editor.deltaDecorations(currentDecorations, [])
    currentDecorations = []
  }

  // 检查是否是 metadata 匹配（metadata 匹配不在原始文档中，无法高亮）
  const isMetadataMatch = match.match && match.match.startsWith('[metadata.')
  
  if (isMetadataMatch) {
    // 对于 metadata 匹配，无法在文档中定位，编辑器保持显示原始文档内容
    // 用户可以在左侧查看匹配项信息
    return
  }

  // 如果显示的是替换后的内容，需要重新计算位置（因为替换可能改变了文本长度）
  // 为了简化，我们使用原始内容的行号和列号（通常替换不会改变行号，除非替换文本包含换行）
  // 如果替换文本长度变化很大，列号可能会有偏差，但行号通常保持不变
  const lineNumber = match.line
  const column = match.column
  
  // 获取匹配文本（去除可能的 metadata 前缀）
  const matchText = match.match
  let actualMatchText = matchText
  
  // 如果显示替换后的内容，使用替换文本作为高亮目标
  if (showReplacedContent.value && resultData.value.replacementText) {
    actualMatchText = resultData.value.replacementText
  }
  
  // 确保行号和列号在有效范围内（使用当前显示的内容）
  const contentLines = currentContent.value.split(/\r?\n/)
  if (lineNumber < 1 || lineNumber > contentLines.length) {
    console.warn(`行号 ${lineNumber} 超出范围 [1, ${contentLines.length}]`)
    return
  }
  
  const lineContent = contentLines[lineNumber - 1] || ''
  const maxColumn = lineContent.length
  
  // 如果显示替换后的内容，尝试在当前行查找替换文本
  let actualColumn = column
  let actualMatchLength = actualMatchText.length
  
  if (showReplacedContent.value && resultData.value.replacementText) {
    // 在替换后的内容中，尝试找到替换文本的位置
    // 由于替换可能改变了列号，我们在当前行中搜索替换文本
    const replacementText = resultData.value.replacementText
    const replacementIndex = lineContent.indexOf(replacementText, Math.max(0, column - 10))
    if (replacementIndex >= 0) {
      actualColumn = replacementIndex + 1 // 转换为1-based
      actualMatchLength = replacementText.length
    } else {
      // 如果找不到，使用原始列号（可能不准确，但总比没有好）
      actualColumn = Math.min(column, maxColumn)
      actualMatchLength = Math.min(actualMatchText.length, maxColumn - actualColumn + 1)
    }
  } else {
    // 显示原始内容，使用原始列号
    actualColumn = Math.min(column, maxColumn)
    actualMatchLength = Math.min(actualMatchText.length, maxColumn - actualColumn + 1)
  }
  
  // 创建高亮范围（在原始文档中）
  const range = new monaco.Range(
    lineNumber,
    actualColumn,
    lineNumber,
    actualColumn + actualMatchLength
  )
  
  // 添加行装饰（整行背景）和文本高亮
  currentDecorations = editor.deltaDecorations([], [
    {
      range: new monaco.Range(lineNumber, 1, lineNumber, 1),
      options: {
        isWholeLine: true,
        className: 'grep-match-highlight-line',
        glyphMarginClassName: 'grep-match-glyph'
      }
    },
    {
      range,
      options: {
        inlineClassName: 'grep-match-highlight-text',
        hoverMessage: { value: actualMatchText }
      }
    }
  ])
  
  // 等待 DOM 更新完成后再执行跳转（参考 LaTeXEditor.vue 的做法）
  await nextTick()
  
  // 滚动到匹配行并设置光标位置
  try {
    editor.revealLineInCenter(lineNumber)
    await nextTick()
    editor.setPosition({ lineNumber, column: actualColumn })
    // 再次确保滚动到中心位置
    await nextTick()
    editor.revealLineInCenter(lineNumber)
  } catch (error) {
    console.error('[GrepDisplay] 跳转到匹配行失败:', error)
  }
}

const initMonacoEditor = async () => {
  if (!resultData.value || resultData.value.matches.length === 0 || !currentContent.value) return
  
  // 确保 Monaco Worker 已配置
  setupMonacoWorker()
  
  await nextTick()
  
  const container = document.getElementById(editorId.value)
  if (!container) {
    console.warn('[GrepDisplay] Monaco编辑器容器未找到，editorId:', editorId.value)
    return
  }

  // 从全局获取编辑器实例（如果已存在则先销毁）
  const editors = monaco.editor.getEditors()
  const existingEditor = editors.find(e => {
    try {
      const editorContainer = e.getContainerDomNode()
      return editorContainer && editorContainer.id === editorId.value
    } catch {
      return false
    }
  })
  
  if (existingEditor) {
    existingEditor.dispose()
    currentDecorations = [] // 清除装饰
    monacoEditor = null // 清除缓存
  }

  // 确保容器有 ID（在创建编辑器之前设置，这是匹配的关键）
  container.id = editorId.value

  // 使用当前选择的内容（原始内容或替换后内容）
  const content = currentContent.value || ''
  const lang = documentLanguage.value

  // 创建 Monaco 编辑器（参考 LaTeXEditor.vue 的做法）
  try {
    monacoEditor = monaco.editor.create(container, {
      value: content,
      language: lang,
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
    
  } catch (error) {
    const logger = createRendererLogger('GrepDisplay')
    logger.error('[GrepDisplay] 创建编辑器失败:', error)
    return
  }

  // 默认选中并高亮第一个匹配
  if (resultData.value.matches.length > 0) {
    selectedMatchIndex.value = 0
    await nextTick()
    await highlightMatchInEditor(0)
  }
}

const disposeMonacoEditor = () => {
  if (monacoEditor) {
    monacoEditor.dispose()
    monacoEditor = null
    currentDecorations = []
  }
}

// 监听结果数据和当前内容变化，重新初始化编辑器
watch([() => resultData.value, () => currentContent.value], async () => {
  if (resultData.value && resultData.value.matches && resultData.value.matches.length > 0 && currentContent.value) {
    await nextTick()
    initMonacoEditor()
  }
}, { immediate: true, deep: true })

// 监听selectedMatchIndex变化，切换高亮
watch(selectedMatchIndex, async (newIndex) => {
  if (newIndex !== null) {
    await nextTick()
    await highlightMatchInEditor(newIndex)
  }
})

// 监听主题变化
watch(() => themeState.currentTheme.type, () => {
  if (monacoEditor) {
    const theme = themeState.currentTheme.type === 'dark' ? 'vs-dark' : 'vs'
    monaco.editor.setTheme(theme)
  }
})

onMounted(async () => {
  if (resultData.value && resultData.value.matches && resultData.value.matches.length > 0) {
    await nextTick()
    initMonacoEditor()
  }
})

onBeforeUnmount(() => {
  disposeMonacoEditor()
})

const containerStyle = computed(() => ({
  padding: '16px',
  backgroundColor: themeState.currentTheme.background2nd,
  borderRadius: '8px',
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
  gap: '12px',
  flexWrap: 'wrap'
}))

const headerTagsStyle = computed(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap'
}))

const titleStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  margin: 0
}))

const panelHeaderStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor,
  borderBottom: `1px solid ${themeState.currentTheme.textColor2}20`,
  padding: '8px 12px',
  fontWeight: '500',
  fontSize: '13px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '8px'
}))

const getMatchItemStyle = (index: number) => {
  const isActive = selectedMatchIndex.value === index
  return {
    backgroundColor: isActive 
      ? (themeState.currentTheme.type === 'dark' ? 'rgba(64, 158, 255, 0.2)' : 'rgba(64, 158, 255, 0.1)')
      : themeState.currentTheme.background,
    border: `1px solid ${isActive 
      ? themeState.currentTheme.primaryColor 
      : themeState.currentTheme.textColor2}20`,
    borderRadius: '6px',
    padding: '12px',
    marginBottom: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  }
}

const locationStyle = computed(() => ({
  color: themeState.currentTheme.textColor2,
  fontSize: '11px',
  fontFamily: 'monospace',
  marginLeft: '8px'
}))

const matchTextStyle = computed(() => ({
  marginTop: '8px',
  fontSize: '13px',
  fontFamily: 'monospace'
}))

const editorContainerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  height: '500px'
}))

const noResultsStyle = computed(() => ({
  padding: '40px 20px',
  textAlign: 'center'
}))

const summaryViewStyle = computed(() => ({
  padding: '20px',
  color: themeState.currentTheme.textColor,
  marginBottom: '16px'
}))

const matchContextStyle = computed(() => ({
  marginTop: '8px',
  padding: '8px',
  backgroundColor: themeState.currentTheme.background2nd,
  borderRadius: '4px',
  fontSize: '12px',
  fontFamily: 'monospace',
  maxHeight: '100px',
  overflow: 'auto'
}))
</script>

<style scoped>
.grep-display {
  width: 100%;
}

.grep-content {
  display: flex;
  gap: 12px;
  height: 500px;
}

.matches-panel {
  width: 30%;
  display: flex;
  flex-direction: column;
  border: 1px solid v-bind('themeState.currentTheme.borderColor');
  border-radius: 6px;
  overflow: hidden;
  background-color: v-bind('themeState.currentTheme.background');
  flex-shrink: 0;
  flex-grow: 0;
}

.editor-panel {
  width: 70%;
  display: flex;
  flex-direction: column;
  border: 1px solid v-bind('themeState.currentTheme.borderColor');
  border-radius: 6px;
  overflow: hidden;
  background-color: v-bind('themeState.currentTheme.background');
  flex-shrink: 0;
  flex-grow: 0;
}

.monaco-editor-container {
  flex: 1;
  min-height: 0;
}

.matches-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
}

.match-item {
  transition: all 0.2s;
}

.match-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transform: translateX(2px);
}

.match-item-active {
  box-shadow: 0 2px 12px rgba(64, 158, 255, 0.3);
}

.match-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.match-text {
  margin-top: 8px;
}

code {
  background-color: v-bind('themeState.currentTheme.background2nd');
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
  word-break: break-all;
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
</style>

<style>
/* 全局样式：Monaco 编辑器的匹配高亮 */
.grep-match-highlight-line {
  background-color: rgba(64, 158, 255, 0.15) !important;
}

.grep-match-highlight-text {
  background-color: rgba(64, 158, 255, 0.3) !important;
  font-weight: bold;
}

.grep-match-glyph {
  background-color: rgba(64, 158, 255, 0.5) !important;
}

.matches-only-view {
  margin-top: 16px;
  border: 1px solid v-bind('themeState.currentTheme.borderColor');
  border-radius: 6px;
  overflow: hidden;
  background-color: v-bind('themeState.currentTheme.background');
}

.summary-content {
  margin-top: 12px;
}

.summary-list {
  margin-top: 12px;
  padding-left: 20px;
}

.match-context pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>

