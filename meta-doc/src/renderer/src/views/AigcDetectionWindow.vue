<template>
  <div class="aigc-detection-window">
    <!-- 选择文档对话框 -->
    <el-dialog 
      v-model="selectDocumentDialogVisible" 
      :title="t('aigc.selectDocumentTitle')" 
      width="600"
      class="select-document-dialog"
    >
      <div class="select-document-content">
        <div class="select-document-header">
          <span class="selected-count">
            {{ selectedTabId ? t('aigc.selectedOneDocument', '已选择 1 个文档') : t('aigc.pleaseSelectDocument') }}
          </span>
        </div>
        <el-scrollbar height="400px" class="document-list-scrollbar">
          <div class="document-list">
            <div
              v-for="tab in documentTabs"
              :key="tab.id"
              class="document-card"
              :class="{ 'selected': selectedTabId === tab.id }"
              @click="selectedTabId = tab.id"
            >
              <div class="document-card-content">
                <div class="document-card-header">
                  <el-icon class="document-icon"><Document /></el-icon>
                  <span class="document-title">{{ tab.displayName }}</span>
                </div>
                <div v-if="tab.path" class="document-path">
                  <el-icon class="path-icon"><Folder /></el-icon>
                  <span>{{ tab.path }}</span>
                </div>
                <div class="document-format">
                  <el-tag size="small" :type="tab.format === 'md' ? 'primary' : 'success'">
                    {{ tab.format === 'md' ? 'Markdown' : 'LaTeX' }}
                  </el-tag>
                </div>
              </div>
            </div>
            <div v-if="documentTabs.length === 0" class="empty-state">
              <el-empty :description="t('aigc.noDocuments')" :image-size="80" />
            </div>
          </div>
        </el-scrollbar>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="selectDocumentDialogVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button 
            type="primary" 
            @click="confirmSelectDocument" 
            :disabled="!selectedTabId"
          >
            {{ t('common.confirm') }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <div class="main-container">
      <!-- 左侧会话列表（含右侧 resize 与折叠，主内容通过默认 slot 传入） -->
      <SessionList
        :title="t('aigc.sessionsTitle')"
        :items="sessions"
        :active-index="activeSessionId || undefined"
        :disabled="analyzing || loadingSession || paraphrasing || paraphrasingOneIndex !== null"
        :create-button-tooltip="t('aigc.newSession')"
        :rename-label="t('common.rename')"
        :duplicate-label="t('common.duplicate')"
        :delete-label="t('common.delete')"
        :rename-dialog-title="t('aigc.renameTitle')"
        :rename-placeholder="t('aigc.renamePlaceholder')"
        :cancel-label="t('common.cancel')"
        :confirm-label="t('common.confirm')"
        @create="handleCreateSession"
        @select="handleSelectSession"
        @rename="handleRenameSession"
        @duplicate="handleDuplicateSession"
        @delete="handleDeleteSession"
      >
      <!-- 右侧内容区域 -->
      <div class="content-area" :style="contentAreaStyle" v-loading="loadingSession">
        <div v-if="!activeSession" class="empty-state" :style="emptyStateStyle">
          <p>{{ t('aigc.noSessionSelected') }}</p>
        </div>
        
        <div v-else class="session-content-panel" :style="panelStyle">
          <!-- 顶部工具栏 -->
          <div class="toolbar-section">
            <el-scrollbar class="toolbar-scrollbar" always>
              <div class="toolbar-content">
                <div class="toolbar-left">
                  <template v-if="!articleContent">
                    <el-upload
                      ref="uploadRef"
                      :file-list="[]"
                      :auto-upload="false"
                      :on-change="handleFileChange"
                      :show-file-list="false"
                      :accept="acceptedFileTypes"
                    >
                      <template #trigger>
                        <el-button :icon="UploadFilled">
                          {{ t('aigc.uploadFile') }}
                        </el-button>
                      </template>
                    </el-upload>
                    <el-button 
                      :icon="Document" 
                      :disabled="!hasActiveDocument"
                      @click="handleSelectFromDocument"
                    >
                      {{ t('aigc.selectFromDocument') }}
                    </el-button>
                  </template>
                  <el-button 
                    :disabled="!articleContent || !paragraphs.length || analyzing" 
                    @click="handleSplitAtCursor"
                  >
                    {{ t('aigc.splitAtCursor') }}
                  </el-button>
                  <el-button 
                    :disabled="!articleContent || !canMergeWithNext || analyzing" 
                    @click="handleMergeWithNext"
                  >
                    {{ t('aigc.mergeWithNext') }}
                  </el-button>
                  <el-button 
                    :disabled="!articleContent || !articleContent.trim() || analyzing" 
                    @click="handleRePreprocess"
                  >
                    {{ t('aigc.rePreprocess') }}
                  </el-button>
                  <el-button 
                    v-if="overallAnalysis"
                    :disabled="!articleContent || analyzing"
                    :loading="paraphrasing"
                    @click="handleParaphraseAll"
                  >
                    {{ hasAllParaphrases ? t('aigc.reParaphraseAll') : t('aigc.paraphraseAll') }}
                  </el-button>
                </div>
                
                <div class="toolbar-right">
                  <el-button 
                    v-if="articleContent"
                    type="primary" 
                    :loading="analyzing"
                    @click="handleAnalyze"
                  >
                    {{ overallAnalysis ? t('aigc.reAnalyze') : t('aigc.startAnalysis') }}
                  </el-button>
                  <el-button 
                    v-if="overallAnalysis && paragraphAnalyses.length > 0 && reportMarkdown"
                    @click="handleExportReport"
                  >
                    {{ t('aigc.exportReport') }}
                  </el-button>
                </div>
              </div>
            </el-scrollbar>
          </div>
          
          <!-- 主内容区域 -->
          <div v-if="articleContent" class="main-content">
            <ResizableContainer
              direction="vertical"
              :initial-sidebar-size="400"
              :min-size="200"
              :max-size="800"
              :show-sidebar="true"
              sidebar-position="end"
            >
              <template #main>
                <!-- 左侧：Monaco 编辑器（main 用 order -1 保证在左） -->
                <div class="editor-section">
                  <div class="editor-header">
                    <span>{{ t('aigc.articleContent') }}<template v-if="paragraphs.length">（{{ t('aigc.paragraphCount', { n: paragraphs.length }) }}）</template></span>
                  </div>
                  <div 
                    :ref="el => setEditorRef(el as HTMLElement | null)" 
                    class="monaco-editor-container"
                  ></div>
                </div>
              </template>
              <template #sidebar>
                <!-- 右侧：报告预览（sidebar 用 order 1 保证在右） -->
                <div ref="reportSectionRef" class="report-section">
                  <div class="report-header">
                    <span>{{ t('aigc.analysisReport') }}</span>
                    <el-button
                      v-if="reportMarkdown"
                      size="small"
                      text
                      @click="scrollReportToTop"
                    >
                      {{ t('aigc.backToTop', '回到顶端') }}
                    </el-button>
                  </div>
                  <el-scrollbar class="report-scrollbar" v-if="reportMarkdown" always @click="onReportAreaClick">
                    <VditorPreview :markdown="reportMarkdown" @rendered="onReportRendered" />
                  </el-scrollbar>
                  <div v-else class="report-placeholder">
                    <p v-if="!overallAnalysis">{{ t('aigc.noAnalysisYet') }}</p>
                    <p v-else>{{ t('aigc.analyzing') }}</p>
                  </div>
                </div>
              </template>
            </ResizableContainer>
          </div>
          
          <!-- 空状态：提示上传或选择内容 -->
          <div v-else class="empty-content">
            <p>{{ t('aigc.pleaseUploadOrSelect') }}</p>
          </div>
        </div>
      </div>
      </SessionList>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UploadFilled, Document, Folder } from '@element-plus/icons-vue'
import SessionList from '../components/common/SessionList.vue'
import type { SessionListItem } from '../components/common/SessionList.vue'
import { aigcDetectionSessionsDb, type AigcDetectionSession } from '../utils/db/tool-sessions-db'
import { themeState } from '../utils/themes'
import { setupMonacoWorker } from '../utils/monaco-worker-config'
import * as monaco from 'monaco-editor'
import { createAiTask, ai_types } from '../utils/ai_tasks'
import type { AIDialogMessage } from '@/types'
import { buildSchemaPrompt, parseSchemaJson, AIGC_ANALYSIS_SCHEMA, type AigcAnalysisResult, type AigcDimensionScore } from '../utils/schemas'
import { referenceAdapterManager } from '../utils/agent-framework/reference-adapters'
import { preprocessParagraphs, MIN_PARAGRAPH_CHARS, DEFAULT_MIN_SEGMENTS, DEFAULT_MAX_SEGMENTS, type ContentFormat } from '../utils/aigc-paragraph-utils'
import { useActiveDocument } from '../composables/useActiveDocument'
import { useWorkspace } from '../stores/workspace'
import VditorPreview from '../components/VditorPreview.vue'
import ResizableContainer from '../components/base/ResizableContainer.vue'
import eventBus from '../utils/event-bus'
import { renderMarkdownPreview } from '../utils/md-utils'
import { ref as vueRef } from 'vue'

const { t, locale } = useI18n()
const { activeDocument, activeTab } = useActiveDocument()
const workspace = useWorkspace()

const sessions = ref<SessionListItem[]>([])
const activeSessionId = ref<string | null>(null)
const activeSession = computed(() => {
  if (!activeSessionId.value) return null
  return sessions.value.find(s => s.id === activeSessionId.value) as any
})

const uploadRef = ref<any>(null)
const articleContent = ref<string>('')
/** 内容格式，用于段落划分：文档/文件为 md|tex，否则 plain */
const contentFormat = ref<ContentFormat>('plain')
const analyzing = ref(false)
const loadingSession = ref(false)
const generatingReport = ref(false)
const paraphrasing = ref(false)

const overallAnalysis = ref<AigcAnalysisResult | null>(null)
const paragraphAnalyses = ref<Array<{ index: number; text: string; analysis: AigcAnalysisResult }>>([])
const reportMarkdown = ref<string>('')
/** 各段落报告块，按索引存储；分析完成时及时追加并按顺序刷新 reportMarkdown */
const segmentBlocks = ref<(string | null)[]>([])

/** 每段改写后的文本，与段落一一对应；null 表示未改写。不修改原文，由用户决定是否采用。 */
const paragraphParaphrases = ref<(string | null)[]>([])

/** 总体报告块（标题后、分段分析前），用于刷新 reportMarkdown */
const overallReportBlock = ref<string>('')

/** 当前正在改写单段的段落索引，用于「改写」按钮 loading */
const paraphrasingOneIndex = ref<number | null>(null)

/** 拆分/合并/重新划分后受影响的报告段落索引；对应 summary 显示「已改动」标记，不重置整篇报告 */
const modifiedParagraphIndices = ref<Set<number>>(new Set())

/** 当前划分好的段落（预处理 + 用户手动调整），分析时直接使用，不再重新切分 */
const paragraphs = ref<string[]>([])

/** 光标所在段落索引（用于“与下一段合并”等），-1 表示未知或无效 */
const currentCursorParagraphIndex = ref(-1)

const editorRef = ref<HTMLElement | null>(null)
const reportSectionRef = ref<HTMLElement | null>(null)
let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null

/** 当前 i18n locale 映射为 AIGC 分析用语言（zh/en/ja/ko，否则 en） */
function localeToAigcLanguage(loc: string): string {
  const v = (loc || '').toLowerCase()
  if (v.startsWith('zh')) return 'zh'
  if (v.startsWith('ja')) return 'ja'
  if (v.startsWith('ko')) return 'ko'
  return 'en'
}

const aigcLanguage = computed(() => localeToAigcLanguage(locale.value))

// 接受的文件类型
const acceptedFileTypes = '.pdf,.doc,.docx,.txt,.md,.tex,.html,.htm'

/** 根据文件扩展名得到内容格式 */
function formatFromFileExtension(ext: string): ContentFormat {
  const e = (ext || '').toLowerCase()
  if (e === 'md' || e === 'htm' || e === 'html') return 'md'
  if (e === 'tex') return 'tex'
  return 'plain'
}

// 选择文档对话框相关
const selectDocumentDialogVisible = ref(false)
const selectedTabId = ref<string | null>(null)

// 获取文档tabs列表
interface DocumentTabItem {
  id: string
  displayName: string
  path: string
  format: 'md' | 'tex'
}

const documentTabs = computed<DocumentTabItem[]>(() => {
  return workspace.tabs
    .filter(tab => (tab.kind === 'file' || tab.kind === 'new') && tab.id)
    .map(tab => {
      try {
        const doc = workspace.ensureDocument(tab.id)
        if (!doc || (doc.format !== 'md' && doc.format !== 'tex')) {
          return null
        }
        
        let displayName = ''
        if (tab.title && tab.title.trim() && tab.title !== '未命名文档') {
          displayName = tab.title.trim()
        } else if (tab.path) {
          const segments = tab.path.split(/[/\\]+/).filter(Boolean)
          displayName = segments[segments.length - 1] || tab.path
        } else {
          displayName = t('workspace.untitledDocument', '未命名文档')
        }
        
        return {
          id: String(tab.id),
          displayName,
          path: tab.path || '',
          format: doc.format as 'md' | 'tex'
        }
      } catch (error) {
        return null
      }
    })
    .filter((tab): tab is DocumentTabItem => tab !== null)
})

// 检查是否有活动的文档tab
// 注意：我们需要检查是否有任何文档tab，而不是当前激活的tab
// 因为当前激活的tab可能是AIGC检测窗口本身（tool类型）
const hasActiveDocument = computed(() => {
  return documentTabs.value.length > 0
})

/** 根据行号得到段落下标 */
function getParagraphIndexByLine(lineNumber: number): number {
  const ranges = getParagraphLineRanges()
  for (let i = 0; i < ranges.length; i++) {
    const [s, e] = ranges[i]
    if (lineNumber >= s && lineNumber <= e) return i
  }
  return -1
}

/** 是否允许“与下一段合并”（光标在某一节且非最后一段） */
const canMergeWithNext = computed(() => {
  const i = currentCursorParagraphIndex.value
  return i >= 0 && i < paragraphs.value.length - 1
})

/** 是否所有段落都已改写（用于工具栏「改写全部」→「重新改写全部」） */
const hasAllParaphrases = computed(() => {
  const n = paragraphAnalyses.value.length
  if (n === 0) return false
  return paragraphAnalyses.value.every((_, i) => {
    const p = paragraphParaphrases.value[i]
    return p != null && (p ?? '').trim() !== ''
  })
})

// 设置编辑器引用
const setEditorRef = (el: HTMLElement | null) => {
  if (el) {
    editorRef.value = el
    nextTick(() => {
      initEditor()
    })
  } else {
    if (editorInstance) {
      editorInstance.dispose()
      editorInstance = null
    }
    editorRef.value = null
  }
}

// 初始化Monaco编辑器
const initEditor = async () => {
  if (!editorRef.value) return
  
  await nextTick()
  await nextTick()
  
  if (!editorRef.value || editorRef.value.offsetWidth === 0 || editorRef.value.offsetHeight === 0) {
    setTimeout(() => {
      initEditor()
    }, 100)
    return
  }
  
  if (editorInstance) {
    editorInstance.dispose()
  }
  
  try {
    setupMonacoWorker()
    
    const isDark = themeState.currentTheme.type === 'dark'
    editorInstance = monaco.editor.create(editorRef.value, {
      value: articleContent.value || '',
      language: 'plaintext',
      theme: isDark ? 'vs-dark' : 'vs',
      readOnly: false,
      automaticLayout: true,
      fontSize: 14,
      lineNumbers: 'on',
      wordWrap: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontFamily: "'JetBrains Mono', 'Consolas', monospace"
    })
    
    // 监听内容变化
    editorInstance.onDidChangeModelContent(() => {
      if (editorInstance) {
        articleContent.value = editorInstance.getValue()
      }
    })
    
    // 光标移动时更新“当前段落”索引（用于“与下一段合并”等）
    editorInstance.onDidChangeCursorPosition((e) => {
      currentCursorParagraphIndex.value = getParagraphIndexByLine(e.position.lineNumber)
    })
    // 点击时若已有报告则跳转到报告对应段落
    editorInstance.onMouseDown((e) => {
      if (e.target && e.target.position) {
        handleEditorClick(e.target.position.lineNumber)
      }
    })
    // 编辑器就绪后立刻按当前段落画出高亮
    nextTick(() => updateEditorDecorations())
  } catch (error) {
    console.error('初始化编辑器失败:', error)
  }
}

// 更新编辑器内容
const updateEditorContent = () => {
  if (editorInstance && articleContent.value !== undefined) {
    const currentValue = editorInstance.getValue()
    if (currentValue !== articleContent.value) {
      editorInstance.setValue(articleContent.value || '')
    }
  }
}

// 用当前 paragraphs 刷新正文与编辑器（不触发表格/分析重算）
const syncContentFromParagraphs = () => {
  const joined = paragraphs.value.join('\n\n')
  articleContent.value = joined
  if (editorInstance) {
    editorInstance.setValue(joined)
  }
}

// 监听 paragraphs 变化：同步到正文并更新装饰
watch(() => paragraphs.value, () => {
  syncContentFromParagraphs()
  nextTick(() => updateEditorDecorations())
}, { deep: true })

// 监听文章内容变化（来自编辑器输入等）
watch(() => articleContent.value, () => {
  updateEditorContent()
  updateEditorDecorations()
})

/** 根据当前 paragraphs 计算每个段落在全文中的起止行号 [startLine, endLine]（1-based），仅依 paragraphs 推导，不依赖 articleContent 一致 */
function getParagraphLineRanges(): Array<[number, number]> {
  if (!paragraphs.value.length) return []
  let line = 1
  const ranges: Array<[number, number]> = []
  for (const p of paragraphs.value) {
    const lineCount = Math.max(1, p.split('\n').length)
    const startLine = line
    const endLine = line + lineCount - 1
    ranges.push([startLine, endLine])
    line = endLine + 2 // 段落后空一行
  }
  return ranges
}

// 更新编辑器装饰：按当前划分的段落高亮；已有分析结果则按风险上色，否则按奇偶段落区分
const decorationIdsRef = ref<string[]>([])
const updateEditorDecorations = () => {
  if (!editorInstance) return
  const model = editorInstance.getModel()
  if (!model) return
  const ranges = getParagraphLineRanges()
  if (ranges.length === 0) {
    editorInstance.deltaDecorations(decorationIdsRef.value, [])
    decorationIdsRef.value = []
    return
  }

  const decorations: monaco.editor.IModelDeltaDecoration[] = []
  const hasAnalysis = paragraphAnalyses.value.length > 0
  const lineCount = model.getLineCount()

  ranges.forEach(([startLine, endLine], index) => {
    let className: string
    let minimapColor: string
    if (hasAnalysis && paragraphAnalyses.value[index]) {
      const score = paragraphAnalyses.value[index].analysis.overall_aigc_risk
      const riskLevel = getRiskLevelFromScore(score)
      className = riskLevel === 'HIGH' ? 'aigc-high-risk' : riskLevel === 'MEDIUM' ? 'aigc-medium-risk' : 'aigc-low-risk'
      minimapColor = riskLevel === 'HIGH' ? 'rgba(245, 108, 108, 0.3)' : riskLevel === 'MEDIUM' ? 'rgba(230, 162, 60, 0.3)' : 'rgba(103, 194, 58, 0.3)'
    } else {
      className = index % 2 === 0 ? 'aigc-para-even' : 'aigc-para-odd'
      minimapColor = index % 2 === 0 ? 'rgba(64, 158, 255, 0.12)' : 'rgba(64, 158, 255, 0.06)'
    }
    const start = Math.max(1, Math.min(startLine, lineCount))
    const end = Math.max(start, Math.min(endLine, lineCount))
    if (start <= end) {
      decorations.push({
        range: new monaco.Range(start, 1, end, 1),
        options: {
          isWholeLine: true,
          className,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          minimap: { color: minimapColor, position: monaco.editor.MinimapPosition.Inline }
        }
      })
    }
  })

  decorationIdsRef.value = editorInstance.deltaDecorations(decorationIdsRef.value, decorations)
}

// 处理编辑器点击（跳转到报告对应位置，并折叠其它段落、仅展开目标）
const handleEditorClick = (lineNumber: number) => {
  if (!reportMarkdown.value || paragraphAnalyses.value.length === 0) return
  const ranges = getParagraphLineRanges()
  let paragraphIndex = -1
  for (let i = 0; i < ranges.length; i++) {
    const [s, e] = ranges[i]
    if (lineNumber >= s && lineNumber <= e) {
      paragraphIndex = i
      break
    }
  }
  if (paragraphIndex < 0 || paragraphIndex >= paragraphAnalyses.value.length) return
  const reportEl = reportSectionRef.value?.querySelector('.report-scrollbar') ?? document.querySelector('.report-scrollbar')
  if (!reportEl) return
  const blocks = reportEl.querySelectorAll('.aigc-paragraph-block')
  blocks.forEach((el) => {
    const idx = el.getAttribute('data-paragraph-index')
    const open = idx !== null && parseInt(idx, 10) === paragraphIndex
    ;(el as HTMLDetailsElement).open = open
  })
  const target = reportEl.querySelector(`#paragraph-${paragraphIndex}`)
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** 报告渲染完成后：对段落块做 DOM 后处理，支持折叠与「已改动」标记；A/B 内容用 Vditor 渲染 */
async function onReportRendered() {
  await nextTick()
  const container = reportSectionRef.value?.querySelector('.vditor-preview-container') as HTMLElement | null
  if (!container) return
  applyReportParagraphCollapse(container)
  updateModificationMarkers()
  await renderAigcContentSwitcherMarkdown(container)
}

/** 将 A/B 切换块内的原文与改写内容用 Vditor.preview 渲染（支持 Markdown）；渲染到容器内层，保留容器边缘与背景 */
async function renderAigcContentSwitcherMarkdown(container: HTMLElement) {
  const nodes = container.querySelectorAll('.aigc-original-content, .aigc-paraphrased-content-block')
  for (const el of Array.from(nodes)) {
    const pre = el.querySelector('pre')
    if (!pre) continue
    const text = (pre.textContent ?? '').trim()
    if (!text) continue
    try {
      pre.remove()
      const inner = document.createElement('div')
      inner.className = 'aigc-content-inner'
      el.appendChild(inner)
      await renderMarkdownPreview(inner, text)
    } catch (err) {
      console.error('AIGC 段落内容 Markdown 渲染失败:', err)
    }
  }
}

/** 报告区点击委托：一键复制改写内容 */
function onReportAreaClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  // A|B 切换：原文 / 改写
  const abBtn = target.closest?.('.aigc-ab-btn') as HTMLElement | null
  if (abBtn) {
    e.preventDefault()
    e.stopPropagation()
    const switcher = abBtn.closest('.aigc-paragraph-content-switcher')
    if (!switcher) return
    const showOriginal = abBtn.classList.contains('aigc-ab-original')
    switcher.querySelectorAll('.aigc-ab-btn').forEach((btn) => btn.classList.remove('active'))
    abBtn.classList.add('active')
    const origDiv = switcher.querySelector('.aigc-original-content') as HTMLElement | null
    const parDiv = switcher.querySelector('.aigc-paraphrased-content-block') as HTMLElement | null
    if (origDiv && parDiv) {
      if (showOriginal) {
        origDiv.style.display = ''
        parDiv.style.display = 'none'
      } else {
        origDiv.style.display = 'none'
        parDiv.style.display = ''
      }
    }
    return
  }
  // 复制：根据当前 A/B 视图复制原文或改写内容
  const copyBtn = target.closest?.('.aigc-copy-paraphrase-btn') as HTMLElement | null
  if (!copyBtn) return
  const switcher = copyBtn.closest('.aigc-paragraph-content-switcher')
  if (!switcher) return
  const idx = copyBtn.getAttribute('data-paragraph-index')
  if (idx == null) return
  const showOriginal = switcher.querySelector('.aigc-ab-original.active') != null
  const contentDiv = showOriginal
    ? switcher.querySelector('.aigc-original-content') as HTMLElement | null
    : switcher.querySelector('.aigc-paraphrased-content-block') as HTMLElement | null
  if (!contentDiv?.textContent?.trim()) return
  navigator.clipboard.writeText(contentDiv.textContent.trim()).then(() => {
    ElMessage.success(t('aigc.copySuccess', '已复制'))
  }).catch(() => {
    ElMessage.error(t('aigc.copyFailed', '复制失败'))
  })
}

/** 根据 modifiedParagraphIndices 更新各段落 summary 上的「已改动」标记 */
function updateModificationMarkers() {
  const reportEl = reportSectionRef.value?.querySelector('.report-scrollbar')
  if (!reportEl) return
  const modified = modifiedParagraphIndices.value
  reportEl.querySelectorAll<HTMLElement>('.aigc-paragraph-block').forEach((block) => {
    const idx = block.getAttribute('data-paragraph-index')
    if (idx == null) return
    const index = parseInt(idx, 10)
    const summary = block.querySelector('summary')
    if (!summary) return
    let badge = summary.querySelector<HTMLElement>('.aigc-modified-badge')
    if (modified.has(index)) {
      if (!badge) {
        badge = document.createElement('span')
        badge.className = 'aigc-modified-badge'
        badge.textContent = t('aigc.modified')
        summary.appendChild(document.createTextNode(' '))
        summary.appendChild(badge)
      }
    } else if (badge) {
      const prev = badge.previousSibling
      if (prev?.nodeType === Node.TEXT_NODE && prev.textContent === ' ') prev.remove()
      badge.remove()
    }
  })
}

/** 将 h3#paragraph-* 及其后内容包裹为可折叠的 <details>，并根据 modifiedParagraphIndices 加「已改动」标记 */
function applyReportParagraphCollapse(container: HTMLElement) {
  const h3s = Array.from(container.querySelectorAll<HTMLHeadingElement>('h3[id^="paragraph-"]'))
  const modified = modifiedParagraphIndices.value
  for (const h3 of h3s) {
    const m = h3.id.match(/^paragraph-(\d+)$/)
    if (!m) continue
    const index = parseInt(m[1], 10)
    const parent = h3.parentElement
    if (!parent) continue
    const rest: ChildNode[] = []
    let n: ChildNode | null = h3.nextSibling
    while (n) {
      const next = n.nextSibling
      if (n instanceof HTMLHeadingElement && n.id.startsWith('paragraph-')) break
      rest.push(n)
      n = next
    }
    const details = document.createElement('details')
    details.id = `paragraph-${index}`
    details.className = 'aigc-paragraph-block'
    details.setAttribute('data-paragraph-index', String(index))
    details.open = true
    const summary = document.createElement('summary')
    summary.textContent = h3.textContent || `段落 ${index + 1}`
    if (modified.has(index)) {
      summary.appendChild(document.createTextNode(' '))
      const badge = document.createElement('span')
      badge.className = 'aigc-modified-badge'
      badge.textContent = t('aigc.modified')
      summary.appendChild(badge)
    }
    summary.appendChild(document.createTextNode(' '))
    const paraphraseBtn = document.createElement('button')
    paraphraseBtn.type = 'button'
    paraphraseBtn.className = 'aigc-paraphrase-one-btn'
    paraphraseBtn.setAttribute('data-paragraph-index', String(index))
    paraphraseBtn.textContent = paragraphParaphrases.value[index] != null ? t('aigc.reParaphraseOne') : t('aigc.paraphraseOne')
    paraphraseBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      handleParaphraseOne(index)
    })
    summary.appendChild(paraphraseBtn)
    details.appendChild(summary)
    const body = document.createElement('div')
    body.className = 'aigc-paragraph-block-body'
    rest.forEach((node) => body.appendChild(node))
    details.appendChild(body)
    parent.insertBefore(details, h3)
    h3.remove()
  }
}

/** 报告区回到顶端 */
function scrollReportToTop() {
  const wrap = reportSectionRef.value?.querySelector('.report-scrollbar .el-scrollbar__wrap') as HTMLElement | null
  if (wrap) wrap.scrollTop = 0
}

const REPORT_TITLE = `# AIGC 风格风险评估报告\n\n`
const SEGMENT_HEAD = `## 分段分析\n\n`

/** 根据当前 segmentBlocks 与 overallReportBlock 刷新 reportMarkdown */
function refreshReportMarkdown() {
  const mid = overallReportBlock.value ? overallReportBlock.value + `\n` : ``
  reportMarkdown.value = REPORT_TITLE + mid + SEGMENT_HEAD + segmentBlocks.value.map((b) => b ?? '').join('')
}

// 监听主题变化
watch(() => themeState.currentTheme.type, (newType) => {
  monaco.editor.setTheme(newType === 'dark' ? 'vs-dark' : 'vs')
})

// 清理编辑器
onBeforeUnmount(() => {
  if (editorInstance) {
    editorInstance.dispose()
    editorInstance = null
  }
})

// 加载会话列表
const loadSessions = async () => {
  try {
    const dbSessions = await aigcDetectionSessionsDb.getAll()
    sessions.value = dbSessions.map(s => ({
      id: s.id,
      title: s.title,
      updatedAt: s.updated_at
    }))
  } catch (error) {
    ElMessage.error('加载会话列表失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 创建新会话
const handleCreateSession = async () => {
  try {
    const id = `aigc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const title = t('aigc.defaultTitle')
    
    await aigcDetectionSessionsDb.create({
      id,
      title,
      description: '',
      article_content: undefined,
      content_source: undefined,
      source_file_path: undefined,
      source_tab_id: undefined,
      overall_analysis: undefined,
      paragraph_analyses: undefined,
      report_markdown: undefined,
      language: aigcLanguage.value,
      domain: 'general'
    })
    
    await loadSessions()
    activeSessionId.value = id
    articleContent.value = ''
    paragraphs.value = []
    contentFormat.value = 'plain'
    overallAnalysis.value = null
    paragraphAnalyses.value = []
    reportMarkdown.value = ''
    segmentBlocks.value = []
    paragraphParaphrases.value = []
    overallReportBlock.value = ''
    modifiedParagraphIndices.value = new Set()
  } catch (error) {
    ElMessage.error('创建会话失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 选择会话
const handleSelectSession = async (item: SessionListItem) => {
  if (loadingSession.value) return
  
  loadingSession.value = true
  
  try {
    activeSessionId.value = item.id
    const session = await aigcDetectionSessionsDb.getById(item.id)
    if (session) {
      // 从会话来源推断内容格式，便于「重新划分段落」时使用
      if (session.content_source === 'document' && session.source_tab_id) {
        try {
          const doc = workspace.ensureDocument(session.source_tab_id)
          contentFormat.value = (doc?.format === 'tex' ? 'tex' : doc?.format === 'md' ? 'md' : 'plain') as ContentFormat
        } catch {
          contentFormat.value = 'plain'
        }
      } else if (session.content_source === 'file' && session.source_file_path) {
        const ext = session.source_file_path.replace(/^.*\.([^.\\/]*)$/, '$1')
        contentFormat.value = formatFromFileExtension(ext)
      } else {
        contentFormat.value = 'plain'
      }
      const raw = session.article_content || ''
      const opts = { format: contentFormat.value, minChars: MIN_PARAGRAPH_CHARS, minSegments: DEFAULT_MIN_SEGMENTS, maxSegments: DEFAULT_MAX_SEGMENTS }
      if (session.paragraph_texts) {
        try {
          paragraphs.value = JSON.parse(session.paragraph_texts) as string[]
          if (!Array.isArray(paragraphs.value)) paragraphs.value = preprocessParagraphs(raw, opts)
        } catch {
          paragraphs.value = preprocessParagraphs(raw, opts)
        }
      } else {
        paragraphs.value = preprocessParagraphs(raw, opts)
      }
      articleContent.value = paragraphs.value.length ? paragraphs.value.join('\n\n') : raw
      
      if (session.overall_analysis) {
        overallAnalysis.value = JSON.parse(session.overall_analysis)
      } else {
        overallAnalysis.value = null
      }
      
      if (session.paragraph_analyses) {
        paragraphAnalyses.value = JSON.parse(session.paragraph_analyses)
      } else {
        paragraphAnalyses.value = []
      }
      
      if (session.paragraph_paraphrases) {
        try {
          paragraphParaphrases.value = JSON.parse(session.paragraph_paraphrases) as (string | null)[]
          if (!Array.isArray(paragraphParaphrases.value)) paragraphParaphrases.value = []
        } catch {
          paragraphParaphrases.value = []
        }
      } else {
        paragraphParaphrases.value = []
      }
      // 若有分段分析，从分析结果与改写结果重建 segmentBlocks 与 overallReportBlock，保证报告含「改写后的内容」
      if (paragraphAnalyses.value.length > 0) {
        const overall = overallAnalysis.value
        overallReportBlock.value = overall ? buildOverallReportBlock(overall) : ''
        segmentBlocks.value = paragraphAnalyses.value.map((pa, i) =>
          buildParagraphReportBlock(pa, paragraphParaphrases.value[i] ?? null)
        )
        refreshReportMarkdown()
      } else {
        overallReportBlock.value = ''
        segmentBlocks.value = []
        reportMarkdown.value = session.report_markdown || ''
      }
      modifiedParagraphIndices.value = new Set()
      
      await nextTick()
      updateEditorContent()
      updateEditorDecorations()
    }
  } catch (error) {
    ElMessage.error('加载会话失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    loadingSession.value = false
  }
}

// 重命名会话
const handleRenameSession = async (item: SessionListItem, newTitle: string) => {
  try {
    await aigcDetectionSessionsDb.update(item.id, { title: newTitle })
    await loadSessions()
  } catch (error) {
    ElMessage.error('重命名失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 复制会话
const handleDuplicateSession = async (item: SessionListItem) => {
  try {
    const session = await aigcDetectionSessionsDb.getById(item.id)
    if (!session) return
    
    const id = `aigc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    await aigcDetectionSessionsDb.create({
      id,
      title: session.title + ' (副本)',
      description: session.description,
      article_content: session.article_content,
      content_source: session.content_source,
      source_file_path: session.source_file_path,
      source_tab_id: session.source_tab_id,
      overall_analysis: session.overall_analysis,
      paragraph_analyses: session.paragraph_analyses,
      report_markdown: session.report_markdown,
      paragraph_paraphrases: session.paragraph_paraphrases,
      language: session.language || 'zh',
      domain: session.domain || 'academic'
    })
    
    await loadSessions()
    ElMessage.success(t('common.duplicateSuccess'))
  } catch (error) {
    ElMessage.error('复制失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 删除会话
const handleDeleteSession = async (item: SessionListItem) => {
  try {
    await aigcDetectionSessionsDb.delete(item.id)
    await loadSessions()
    if (activeSessionId.value === item.id) {
      activeSessionId.value = null
      articleContent.value = ''
      paragraphs.value = []
      contentFormat.value = 'plain'
      overallAnalysis.value = null
      paragraphAnalyses.value = []
      reportMarkdown.value = ''
      segmentBlocks.value = []
      paragraphParaphrases.value = []
      overallReportBlock.value = ''
      modifiedParagraphIndices.value = new Set()
    }
    ElMessage.success(t('common.deleteSuccess'))
  } catch (error) {
    ElMessage.error('删除失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

/** 可直接读取的文本格式：不保存临时 reference 文件，直接 file.text() 解析 */
const DIRECT_READ_EXTS = ['md', 'tex', 'txt', 'html', 'htm']

// 处理文件上传
const handleFileChange = async (file: any) => {
  if (!activeSessionId.value) {
    await handleCreateSession()
  }
  
  try {
    const fileName = file.name
    const fileExt = fileName.split('.').pop()?.toLowerCase() || ''
    
    let parsedContent: string
    let sourceFilePath: string

    if (DIRECT_READ_EXTS.includes(fileExt)) {
      // md/tex/txt/html/htm：直接读取文件内容，不保存临时 reference
      parsedContent = await file.raw.text()
      sourceFilePath = fileName
    } else {
      // pdf/doc/docx：保存到 reference 后通过 adapter 解析
      const fileContent = await file.raw.arrayBuffer()
      let ipcRenderer: any = null
      if (typeof window !== 'undefined') {
        if ((window as any).electron?.ipcRenderer) {
          ipcRenderer = (window as any).electron.ipcRenderer
        } else {
          const { localIpcRenderer } = await import('../utils/web-adapter/local-ipc-renderer')
          ipcRenderer = localIpcRenderer
        }
      }
      if (!ipcRenderer) throw new Error('IPC渲染器不可用')
      const uint8Array = new Uint8Array(fileContent)
      const chunkSize = 8192
      let base64 = ''
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.slice(i, i + chunkSize)
        base64 += String.fromCharCode.apply(null, Array.from(chunk))
      }
      base64 = btoa(base64)
      const filePath = await ipcRenderer.invoke('save-reference-file', {
        filename: fileName,
        content: base64
      }) as string
      if (!filePath) throw new Error('保存文件失败')
      const adapter = referenceAdapterManager.getAdapter(fileExt)
      if (!adapter) {
        ElMessage.error(t('aigc.unsupportedFileType'))
        return
      }
      parsedContent = await adapter.parse(filePath, fileExt)
      sourceFilePath = filePath
    }

    contentFormat.value = formatFromFileExtension(fileExt)
    paragraphs.value = preprocessParagraphs(parsedContent, { format: contentFormat.value, minChars: MIN_PARAGRAPH_CHARS, minSegments: DEFAULT_MIN_SEGMENTS, maxSegments: DEFAULT_MAX_SEGMENTS })
    articleContent.value = paragraphs.value.join('\n\n')
    
    if (activeSessionId.value) {
      await aigcDetectionSessionsDb.update(activeSessionId.value, {
        title: fileName,
        article_content: articleContent.value,
        content_source: 'file',
        source_file_path: sourceFilePath,
        paragraph_texts: JSON.stringify(paragraphs.value)
      })
      await loadSessions()
    }
    
    await nextTick()
    updateEditorContent()
    updateEditorDecorations()
    
    ElMessage.success(t('aigc.fileUploaded'))
  } catch (error) {
    ElMessage.error('上传文件失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 从文档选择内容（显示对话框）
const handleSelectFromDocument = async () => {
  if (!activeSessionId.value) {
    await handleCreateSession()
  }
  
  // 检查是否有可用的文档
  if (documentTabs.value.length === 0) {
    ElMessage.warning(t('aigc.noActiveDocument'))
    return
  }
  
  // 显示选择对话框
  selectedTabId.value = null
  selectDocumentDialogVisible.value = true
}

/** 从 tab 得到显示标题（与 documentTabs 的 displayName 逻辑一致） */
function getDisplayNameFromTab(tab: { title?: string; path?: string }): string {
  if (tab.title && tab.title.trim() && tab.title !== '未命名文档') {
    return tab.title.trim()
  }
  if (tab.path) {
    const segments = tab.path.split(/[/\\]+/).filter(Boolean)
    return segments[segments.length - 1] || tab.path
  }
  return t('workspace.untitledDocument', '未命名文档')
}

// 确认选择文档
const confirmSelectDocument = async () => {
  if (!selectedTabId.value) {
    ElMessage.warning(t('aigc.pleaseSelectDocument'))
    return
  }
  
  try {
    const tab = workspace.tabs.find(t => String(t.id) === selectedTabId.value)
    if (!tab) {
      ElMessage.error(t('aigc.documentNotFound'))
      return
    }
    
    const doc = workspace.ensureDocument(tab.id)
    if (!doc || (doc.format !== 'md' && doc.format !== 'tex')) {
      ElMessage.error(t('aigc.unsupportedFormat'))
      return
    }
    
    // 获取文档内容
    let content = ''
    if (doc.format === 'md') {
      content = doc.markdown || ''
    } else if (doc.format === 'tex') {
      content = doc.tex || ''
    }
    
    if (!content.trim()) {
      ElMessage.warning(t('aigc.documentEmpty'))
      return
    }
    
    contentFormat.value = (doc.format === 'tex' ? 'tex' : doc.format === 'md' ? 'md' : 'plain') as ContentFormat
    paragraphs.value = preprocessParagraphs(content, { format: contentFormat.value, minChars: MIN_PARAGRAPH_CHARS, minSegments: DEFAULT_MIN_SEGMENTS, maxSegments: DEFAULT_MAX_SEGMENTS })
    articleContent.value = paragraphs.value.join('\n\n')
    
    const displayName = getDisplayNameFromTab(tab)
    if (activeSessionId.value) {
      await aigcDetectionSessionsDb.update(activeSessionId.value, {
        title: displayName,
        article_content: articleContent.value,
        content_source: 'document',
        source_tab_id: tab.id,
        paragraph_texts: JSON.stringify(paragraphs.value)
      })
      await loadSessions()
    }
    
    selectDocumentDialogVisible.value = false
    selectedTabId.value = null
    
    await nextTick()
    updateEditorContent()
    updateEditorDecorations()
    
    ElMessage.success(t('aigc.contentSelected'))
  } catch (error) {
    ElMessage.error('选择内容失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 在光标处拆分为两段
const handleSplitAtCursor = () => {
  if (!editorInstance || paragraphs.value.length === 0) return
  const pos = editorInstance.getPosition()
  if (!pos) return
  const lineNumber = pos.lineNumber
  const ranges = getParagraphLineRanges()
  const idx = getParagraphIndexByLine(lineNumber)
  if (idx < 0 || idx >= paragraphs.value.length) return
  const [startLine] = ranges[idx]
  const lineOffset = lineNumber - startLine
  const lines = paragraphs.value[idx].split('\n')
  if (lineOffset <= 0 || lineOffset >= lines.length) return
  const before = lines.slice(0, lineOffset).join('\n').trimEnd()
  const after = lines.slice(lineOffset).join('\n').trimStart()
  if (!before || !after) return
  const next = [...paragraphs.value.slice(0, idx), before, after, ...paragraphs.value.slice(idx + 1)]
  paragraphs.value = next
  modifiedParagraphIndices.value = new Set([...modifiedParagraphIndices.value, idx])
  saveParagraphTexts()
  nextTick(() => {
    updateEditorDecorations()
    currentCursorParagraphIndex.value = getParagraphIndexByLine(lineNumber)
    updateModificationMarkers()
  })
}

// 当前段与下一段合并
const handleMergeWithNext = () => {
  const i = currentCursorParagraphIndex.value
  if (i < 0 || i >= paragraphs.value.length - 1) return
  const merged = paragraphs.value[i] + '\n\n' + paragraphs.value[i + 1]
  const next = [...paragraphs.value.slice(0, i), merged, ...paragraphs.value.slice(i + 2)]
  paragraphs.value = next
  modifiedParagraphIndices.value = new Set([...modifiedParagraphIndices.value, i, i + 1])
  saveParagraphTexts()
  nextTick(() => {
    updateEditorDecorations()
    currentCursorParagraphIndex.value = i < next.length ? i : next.length - 1
    updateModificationMarkers()
  })
}

// 按当前正文重新做规则划分（按 contentFormat：md/tex/plain）
const handleRePreprocess = () => {
  const raw = (editorInstance && editorInstance.getValue()) || articleContent.value
  if (!raw || !raw.trim()) return
  paragraphs.value = preprocessParagraphs(raw, { format: contentFormat.value, minChars: MIN_PARAGRAPH_CHARS, minSegments: DEFAULT_MIN_SEGMENTS, maxSegments: DEFAULT_MAX_SEGMENTS })
  const n = paragraphAnalyses.value.length
  if (n) modifiedParagraphIndices.value = new Set(Array.from({ length: n }, (_, j) => j))
  saveParagraphTexts()
  nextTick(() => {
    updateEditorDecorations()
    updateModificationMarkers()
  })
}

function saveParagraphTexts() {
  if (activeSessionId.value) {
    aigcDetectionSessionsDb.update(activeSessionId.value, {
      paragraph_texts: JSON.stringify(paragraphs.value),
      article_content: paragraphs.value.join('\n\n')
    }).catch(() => {})
  }
}

// 开始分析：以当前划分好的段落为单位，并行执行，每个子任务完成后立即追加到报告
const handleAnalyze = async () => {
  if (!activeSessionId.value) {
    ElMessage.warning(t('aigc.noContent'))
    return
  }
  const list = paragraphs.value.filter(p => p.trim())
  if (list.length === 0) {
    ElMessage.warning(t('aigc.noContent'))
    return
  }

  analyzing.value = true
  modifiedParagraphIndices.value = new Set()
  reportMarkdown.value = ''
  paragraphAnalyses.value = []
  overallAnalysis.value = null
  paragraphParaphrases.value = list.map(() => null)
  overallReportBlock.value = ''
  segmentBlocks.value = list.map(() => null)
  refreshReportMarkdown()

  try {
    const total = list.length
    const analyses: Array<{ index: number; text: string; analysis: AigcAnalysisResult }> = []

    // 并行分析，每完成一个立即按索引插入到正确位置并刷新
    const promises = list.map(async (text, i) => {
      const analysis = await analyzeParagraph(text.trim(), i + 1, total)
      const result = { index: i, text: text.trim(), analysis }
      analyses.push(result)
      segmentBlocks.value[result.index] = buildParagraphReportBlock(result, paragraphParaphrases.value[result.index] ?? null)
      refreshReportMarkdown()
      return result
    })
    
    await Promise.all(promises)
    
    analyses.sort((a, b) => a.index - b.index)
    paragraphAnalyses.value = analyses
    
    // 计算总体分析
    const overall = await analyzeOverall(list, analyses)
    overallAnalysis.value = overall
    
    // 生成并追加总体报告
    overallReportBlock.value = buildOverallReportBlock(overall)
    refreshReportMarkdown()

    if (activeSessionId.value) {
      await aigcDetectionSessionsDb.update(activeSessionId.value, {
        overall_analysis: JSON.stringify(overall),
        paragraph_analyses: JSON.stringify(analyses),
        paragraph_texts: JSON.stringify(paragraphs.value),
        paragraph_paraphrases: JSON.stringify(paragraphParaphrases.value),
        report_markdown: reportMarkdown.value
      })
    }
    await nextTick()
    updateEditorDecorations()
    ElMessage.success(t('aigc.analysisComplete'))
  } catch (error) {
    ElMessage.error('分析失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    analyzing.value = false
  }
}

// 重新分析（已合并到 handleAnalyze，此函数保留以兼容）
const handleReAnalyze = async () => {
  await handleAnalyze()
}

// 分析单个段落
const analyzeParagraph = async (
  text: string, 
  paragraphIndex: number, 
  totalParagraphs: number
): Promise<AigcAnalysisResult> => {
  const prompt = buildAigcAnalysisPrompt(text, aigcLanguage.value, true)
  const schemaPrompt = buildSchemaPrompt(AIGC_ANALYSIS_SCHEMA, prompt)
  
  const resultRef = vueRef('')
  const originKey = `aigc-paragraph-${paragraphIndex}-${Date.now()}`
  
  const messages: AIDialogMessage[] = [{
    role: 'user',
    content: schemaPrompt
  }]
  
  const { done } = createAiTask(
    t('aigc.analyzingParagraph', { index: paragraphIndex, total: totalParagraphs }),
    messages,
    resultRef,
    ai_types.chat,
    originKey,
    { stream: true }
  )
  
  await done
  
  return parseSchemaJson<AigcAnalysisResult>(resultRef.value, AIGC_ANALYSIS_SCHEMA)
}

/** 按统一阈值从分数得到风险等级（≥55 高，35–55 中，<35 低） */
function getRiskLevelFromScore(score: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (score >= 55) return 'HIGH'
  if (score >= 35) return 'MEDIUM'
  return 'LOW'
}

// 总体分析
const analyzeOverall = async (
  paragraphs: string[],
  paragraphAnalyses: Array<{ index: number; text: string; analysis: AigcAnalysisResult }>
): Promise<AigcAnalysisResult> => {
  const dimensionScores: AigcDimensionScore = {
    sentence_uniformity: 0,
    lexical_diversity: 0,
    reasoning_smoothness: 0,
    personal_trace: 0,
    stylistic_risk: 0,
    over_explanation: 0,
    hedging_pattern: 0
  }
  
  // 计算各维度的段落平均值
  paragraphAnalyses.forEach(pa => {
    dimensionScores.sentence_uniformity += pa.analysis.sentence_uniformity
    dimensionScores.lexical_diversity += pa.analysis.lexical_diversity
    dimensionScores.reasoning_smoothness += pa.analysis.reasoning_smoothness
    dimensionScores.personal_trace += pa.analysis.personal_trace
    dimensionScores.stylistic_risk += pa.analysis.stylistic_risk
    dimensionScores.over_explanation += pa.analysis.over_explanation
    dimensionScores.hedging_pattern += pa.analysis.hedging_pattern
  })
  
  const count = paragraphAnalyses.length || 1
  dimensionScores.sentence_uniformity /= count
  dimensionScores.lexical_diversity /= count
  dimensionScores.reasoning_smoothness /= count
  dimensionScores.personal_trace /= count
  dimensionScores.stylistic_risk /= count
  dimensionScores.over_explanation /= count
  dimensionScores.hedging_pattern /= count
  
  // 总体风险分：七维度的平均分 × 10，范围 0–100。各维度均为「高分=更偏 AI 风格」。
  // 评判标准从严：55 及以上为高，35–55 为中，35 以下为低（纯 AI 文易被判高）。
  const sum =
    dimensionScores.sentence_uniformity +
    dimensionScores.lexical_diversity +
    dimensionScores.reasoning_smoothness +
    dimensionScores.personal_trace +
    dimensionScores.stylistic_risk +
    dimensionScores.over_explanation +
    dimensionScores.hedging_pattern
  let overallRisk = Math.max(0, Math.min(100, (sum / 7) * 10))
  const riskLevel = getRiskLevelFromScore(overallRisk)
  
  // 收集所有建议
  const allSuggestions = new Set<string>()
  paragraphAnalyses.forEach(pa => {
    pa.analysis.concise_suggestions.forEach(s => allSuggestions.add(s))
  })
  
  return {
    ...dimensionScores,
    overall_aigc_risk: Math.round(overallRisk),
    risk_level: riskLevel,
    concise_suggestions: Array.from(allSuggestions).slice(0, 10) // 最多10条建议
  }
}

// 构建AIGC分析提示词（语言由当前 i18n locale 决定，不区分学术/通用）
const buildAigcAnalysisPrompt = (text: string, language: string, isParagraph: boolean = false): string => {
  const langName = language === 'zh' ? '中文' : language === 'en' ? 'English' : language === 'ja' ? '日本語' : language === 'ko' ? '한국어' : language
  const scope = isParagraph ? '段落' : '全文'
  return `你是一个学术写作分析 agent。

请从"写作行为特征"的角度，而非判断作者身份，对下列${scope}进行评估。

评估目标：
判断${scope}中是否存在明显的 AIGC 风格风险特征。

请从以下维度进行 0-10 打分（10 表示高度符合 AI 风格）：
- sentence_uniformity: 句式是否过于统一
- lexical_diversity: 词汇是否重复、保守
- reasoning_smoothness: 逻辑是否过于平滑
- personal_trace: 是否存在个人思考痕迹（10表示缺乏个人痕迹）
- stylistic_risk: 是否符合常见 AIGC 模板
- over_explanation: 是否"教科书式解释"
- hedging_pattern: 是否大量使用模糊限定词

语言：${langName}

${scope}如下：

<<<TEXT>>>
${text}
<<<TEXT>>>`
}

/** 转义 HTML 以便放入属性或标签内容 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 构建单个段落的报告块（不追加，供按索引插入用）；paraphrased 有值时追加「改写后的内容」与一键复制 */
function buildParagraphReportBlock(para: { index: number; text: string; analysis: AigcAnalysisResult }, paraphrased: string | null = null): string {
  const paraLevel = getRiskLevelFromScore(para.analysis.overall_aigc_risk)
  const paraRiskColor = paraLevel === 'HIGH' ? '#f56c6c' : paraLevel === 'MEDIUM' ? '#e6a23c' : '#67c23a'
  const radarData = {
    indicator: [
      { name: '句式统一性', max: 10 },
      { name: '词汇多样性', max: 10 },
      { name: '逻辑平滑度', max: 10 },
      { name: '个人痕迹', max: 10 },
      { name: '风格风险', max: 10 },
      { name: '过度解释', max: 10 },
      { name: '模糊限定', max: 10 }
    ],
    series: [{
      name: `段落 ${para.index + 1} 评分`,
      value: [
        para.analysis.sentence_uniformity,
        para.analysis.lexical_diversity,
        para.analysis.reasoning_smoothness,
        para.analysis.personal_trace,
        para.analysis.stylistic_risk,
        para.analysis.over_explanation,
        para.analysis.hedging_pattern
      ]
    }]
  }
  let block = `### 段落 ${para.index + 1} {#paragraph-${para.index}}\n\n`
  block += `**风险评分：** <span style="color: ${paraRiskColor}; font-weight: bold;">${para.analysis.overall_aigc_risk}</span> (${paraLevel === 'HIGH' ? '高' : paraLevel === 'MEDIUM' ? '中' : '低'})\n\n`
  // 有改写时：主显示改写内容，A|B 切换查看原文/改写对比
  if (paraphrased != null && paraphrased.trim()) {
    const origEscaped = escapeHtml(para.text.trim())
    const parEscaped = escapeHtml(paraphrased.trim())
    block += `**${t('aigc.paragraphContent')}：**\n\n`
    block += `<div class="aigc-paragraph-content-switcher" data-paragraph-index="${para.index}">\n`
    block += `<span class="aigc-ab-btns">\n`
    block += `<button type="button" class="aigc-ab-btn aigc-ab-original" data-paragraph-index="${para.index}">${t('aigc.viewOriginal')}</button>\n`
    block += `<button type="button" class="aigc-ab-btn aigc-ab-paraphrased active" data-paragraph-index="${para.index}">${t('aigc.viewParaphrased')}</button>\n`
    block += `<button type="button" class="aigc-copy-paraphrase-btn" data-paragraph-index="${para.index}">${t('aigc.copy')}</button>\n`
    block += `</span>\n`
    block += `<div class="aigc-original-content" data-paragraph-index="${para.index}" style="display:none"><pre class="aigc-original-pre">${origEscaped}</pre></div>\n`
    block += `<div class="aigc-paraphrased-content-block" data-paragraph-index="${para.index}"><pre class="aigc-paraphrased-content" data-paragraph-index="${para.index}">${parEscaped}</pre></div>\n`
    block += `</div>\n\n`
  } else {
    block += `**${t('aigc.paragraphContent')}：**\n\n`
    block += `> ${para.text.split('\n').join('\n> ')}\n\n`
  }
  block += `**各维度雷达图：**\n\n`
  block += `\`\`\`echarts\n`
  block += JSON.stringify({
    backgroundColor: 'transparent',
    radar: { indicator: radarData.indicator },
    series: [{ type: 'radar', data: radarData.series, areaStyle: { opacity: 0.3 } }]
  }, null, 2)
  block += `\n\`\`\`\n\n`
  block += `**维度评分：**\n\n`
  block += `- 句式统一性：${para.analysis.sentence_uniformity.toFixed(1)}\n`
  block += `- 词汇多样性：${para.analysis.lexical_diversity.toFixed(1)}\n`
  block += `- 逻辑平滑度：${para.analysis.reasoning_smoothness.toFixed(1)}\n`
  block += `- 个人痕迹：${para.analysis.personal_trace.toFixed(1)}\n`
  block += `- 风格风险：${para.analysis.stylistic_risk.toFixed(1)}\n`
  block += `- 过度解释：${para.analysis.over_explanation.toFixed(1)}\n`
  block += `- 模糊限定：${para.analysis.hedging_pattern.toFixed(1)}\n\n`
  if (para.analysis.concise_suggestions.length > 0) {
    block += `**修改建议：**\n\n`
    para.analysis.concise_suggestions.forEach((s, i) => { block += `${i + 1}. ${s}\n` })
    block += `\n`
  }
  block += `---\n\n`
  return block
}

/** 构建总体报告块（不含标题与分段分析），供 refreshReportMarkdown 使用 */
function buildOverallReportBlock(overall: AigcAnalysisResult): string {
  // 生成雷达图数据
  const radarData = {
    indicator: [
      { name: '句式统一性', max: 10 },
      { name: '词汇多样性', max: 10 },
      { name: '逻辑平滑度', max: 10 },
      { name: '个人痕迹', max: 10 },
      { name: '风格风险', max: 10 },
      { name: '过度解释', max: 10 },
      { name: '模糊限定', max: 10 }
    ],
    series: [{
      name: '总体评分',
      value: [
        overall.sentence_uniformity,
        overall.lexical_diversity,
        overall.reasoning_smoothness,
        overall.personal_trace,
        overall.stylistic_risk,
        overall.over_explanation,
        overall.hedging_pattern
      ]
    }]
  }
  
  // 生成风险等级颜色
  const riskColor = overall.risk_level === 'HIGH' ? '#f56c6c' : 
                    overall.risk_level === 'MEDIUM' ? '#e6a23c' : '#67c23a'
  
  let overallBlock = `## 总体分析\n\n`
  overallBlock += `### 风险评分\n\n`
  overallBlock += `<div style="text-align: center; margin: 20px 0;">\n`
  overallBlock += `<div style="font-size: 48px; font-weight: bold; color: ${riskColor};">${overall.overall_aigc_risk}</div>\n`
  overallBlock += `<div style="font-size: 18px; color: ${riskColor}; margin-top: 10px;">风险等级：${overall.risk_level === 'HIGH' ? '高' : overall.risk_level === 'MEDIUM' ? '中' : '低'}</div>\n`
  overallBlock += `</div>\n\n`
  
  overallBlock += `### 各维度雷达图\n\n`
  overallBlock += `\`\`\`echarts\n`
  overallBlock += JSON.stringify({
    backgroundColor: 'transparent',
    radar: {
      indicator: radarData.indicator
    },
    series: [{
      type: 'radar',
      data: radarData.series,
      areaStyle: {
        opacity: 0.3
      }
    }]
  }, null, 2)
  overallBlock += `\n\`\`\`\n\n`
  
  overallBlock += `### 维度评分详情\n\n`
  overallBlock += `| 维度 | 评分 | 说明 |\n`
  overallBlock += `|------|------|------|\n`
  overallBlock += `| 句式统一性 | ${overall.sentence_uniformity.toFixed(1)} | ${overall.sentence_uniformity >= 7 ? '⚠️ 句式过于统一' : overall.sentence_uniformity >= 4 ? '⚠️ 句式较为统一' : '✓ 句式变化丰富'} |\n`
  overallBlock += `| 词汇多样性 | ${overall.lexical_diversity.toFixed(1)} | ${overall.lexical_diversity >= 7 ? '⚠️ 词汇重复、保守' : overall.lexical_diversity >= 4 ? '⚠️ 词汇使用较为保守' : '✓ 词汇使用多样'} |\n`
  overallBlock += `| 逻辑平滑度 | ${overall.reasoning_smoothness.toFixed(1)} | ${overall.reasoning_smoothness >= 7 ? '⚠️ 逻辑过于平滑' : overall.reasoning_smoothness >= 4 ? '⚠️ 逻辑较为平滑' : '✓ 逻辑自然'} |\n`
  overallBlock += `| 个人痕迹 | ${overall.personal_trace.toFixed(1)} | ${overall.personal_trace >= 7 ? '⚠️ 缺乏个人思考痕迹' : overall.personal_trace >= 4 ? '⚠️ 个人痕迹较少' : '✓ 个人思考痕迹明显'} |\n`
  overallBlock += `| 风格风险 | ${overall.stylistic_risk.toFixed(1)} | ${overall.stylistic_risk >= 7 ? '⚠️ 高度符合AIGC模板' : overall.stylistic_risk >= 4 ? '⚠️ 部分符合AIGC模板' : '✓ 风格自然'} |\n`
  overallBlock += `| 过度解释 | ${overall.over_explanation.toFixed(1)} | ${overall.over_explanation >= 7 ? '⚠️ 教科书式解释' : overall.over_explanation >= 4 ? '⚠️ 解释较为详细' : '✓ 解释适度'} |\n`
  overallBlock += `| 模糊限定 | ${overall.hedging_pattern.toFixed(1)} | ${overall.hedging_pattern >= 7 ? '⚠️ 大量使用模糊限定词' : overall.hedging_pattern >= 4 ? '⚠️ 使用较多模糊限定词' : '✓ 模糊限定词使用适度'} |\n\n`
  
  overallBlock += `### 修改建议\n\n`
  overall.concise_suggestions.forEach((suggestion, index) => {
    overallBlock += `${index + 1}. ${suggestion}\n`
  })
  overallBlock += `\n`
  
  overallBlock += `## 结论\n\n`
  if (overall.risk_level === 'HIGH') {
    overallBlock += `本文存在较高的 AIGC 风格风险。建议进行较大幅度的改写，特别是：\n\n`
  } else if (overall.risk_level === 'MEDIUM') {
    overallBlock += `本文存在中等的 AIGC 风格风险。建议进行适度调整，重点关注：\n\n`
  } else {
    overallBlock += `本文的 AIGC 风格风险较低，但仍有改进空间。建议：\n\n`
  }
  
  overall.concise_suggestions.slice(0, 3).forEach((suggestion, index) => {
    overallBlock += `${index + 1}. ${suggestion}\n`
  })
  
  return overallBlock
}

// 导出报告到新文档
const handleExportReport = () => {
  if (!reportMarkdown.value) {
    ElMessage.warning(t('aigc.noAnalysisData'))
    return
  }
  
  eventBus.emit('ai-chat-export-to-document', {
    content: reportMarkdown.value
  })
  ElMessage.success(t('aigc.exportReportSuccess', '已导出到新文档'))
}

// 生成Markdown报告
const generateReportMarkdown = (
  overall: AigcAnalysisResult,
  paragraphs: Array<{ index: number; text: string; analysis: AigcAnalysisResult }>
): string => {
  // 生成雷达图数据
  const radarData = {
    indicator: [
      { name: '句式统一性', max: 10 },
      { name: '词汇多样性', max: 10 },
      { name: '逻辑平滑度', max: 10 },
      { name: '个人痕迹', max: 10 },
      { name: '风格风险', max: 10 },
      { name: '过度解释', max: 10 },
      { name: '模糊限定', max: 10 }
    ],
    series: [{
      name: '总体评分',
      value: [
        overall.sentence_uniformity,
        overall.lexical_diversity,
        overall.reasoning_smoothness,
        overall.personal_trace,
        overall.stylistic_risk,
        overall.over_explanation,
        overall.hedging_pattern
      ]
    }]
  }
  
  // 生成风险等级颜色
  const riskColor = overall.risk_level === 'HIGH' ? '#f56c6c' : 
                    overall.risk_level === 'MEDIUM' ? '#e6a23c' : '#67c23a'
  
  let markdown = `# AIGC 风格风险评估报告\n\n`
  
  // 总体分析
  markdown += `## 总体分析\n\n`
  markdown += `### 风险评分\n\n`
  markdown += `<div style="text-align: center; margin: 20px 0;">\n`
  markdown += `<div style="font-size: 48px; font-weight: bold; color: ${riskColor};">${overall.overall_aigc_risk}</div>\n`
  markdown += `<div style="font-size: 18px; color: ${riskColor}; margin-top: 10px;">风险等级：${overall.risk_level === 'HIGH' ? '高' : overall.risk_level === 'MEDIUM' ? '中' : '低'}</div>\n`
  markdown += `</div>\n\n`
  
  // 雷达图
  markdown += `### 各维度雷达图\n\n`
  markdown += `\`\`\`echarts\n`
  markdown += JSON.stringify({
    radar: {
      indicator: radarData.indicator
    },
    series: [{
      type: 'radar',
      data: radarData.series,
      areaStyle: {
        opacity: 0.3
      }
    }]
  }, null, 2)
  markdown += `\n\`\`\`\n\n`
  
  // 维度评分表格
  markdown += `### 维度评分详情\n\n`
  markdown += `| 维度 | 评分 | 说明 |\n`
  markdown += `|------|------|------|\n`
  markdown += `| 句式统一性 | ${overall.sentence_uniformity.toFixed(1)} | ${overall.sentence_uniformity >= 7 ? '⚠️ 句式过于统一' : overall.sentence_uniformity >= 4 ? '⚠️ 句式较为统一' : '✓ 句式变化丰富'} |\n`
  markdown += `| 词汇多样性 | ${overall.lexical_diversity.toFixed(1)} | ${overall.lexical_diversity >= 7 ? '⚠️ 词汇重复、保守' : overall.lexical_diversity >= 4 ? '⚠️ 词汇使用较为保守' : '✓ 词汇使用多样'} |\n`
  markdown += `| 逻辑平滑度 | ${overall.reasoning_smoothness.toFixed(1)} | ${overall.reasoning_smoothness >= 7 ? '⚠️ 逻辑过于平滑' : overall.reasoning_smoothness >= 4 ? '⚠️ 逻辑较为平滑' : '✓ 逻辑自然'} |\n`
  markdown += `| 个人痕迹 | ${overall.personal_trace.toFixed(1)} | ${overall.personal_trace >= 7 ? '⚠️ 缺乏个人思考痕迹' : overall.personal_trace >= 4 ? '⚠️ 个人痕迹较少' : '✓ 个人思考痕迹明显'} |\n`
  markdown += `| 风格风险 | ${overall.stylistic_risk.toFixed(1)} | ${overall.stylistic_risk >= 7 ? '⚠️ 高度符合AIGC模板' : overall.stylistic_risk >= 4 ? '⚠️ 部分符合AIGC模板' : '✓ 风格自然'} |\n`
  markdown += `| 过度解释 | ${overall.over_explanation.toFixed(1)} | ${overall.over_explanation >= 7 ? '⚠️ 教科书式解释' : overall.over_explanation >= 4 ? '⚠️ 解释较为详细' : '✓ 解释适度'} |\n`
  markdown += `| 模糊限定 | ${overall.hedging_pattern.toFixed(1)} | ${overall.hedging_pattern >= 7 ? '⚠️ 大量使用模糊限定词' : overall.hedging_pattern >= 4 ? '⚠️ 使用较多模糊限定词' : '✓ 模糊限定词使用适度'} |\n\n`
  
  // 修改建议
  markdown += `### 修改建议\n\n`
  overall.concise_suggestions.forEach((suggestion, index) => {
    markdown += `${index + 1}. ${suggestion}\n`
  })
  markdown += `\n`
  
  // 分段分析
  markdown += `## 分段分析\n\n`
  paragraphs.forEach((para, index) => {
    const paraRiskColor = para.analysis.risk_level === 'HIGH' ? '#f56c6c' : 
                          para.analysis.risk_level === 'MEDIUM' ? '#e6a23c' : '#67c23a'
    
    markdown += `### 段落 ${index + 1} {#paragraph-${index}}\n\n`
    markdown += `**风险评分：** <span style="color: ${paraRiskColor}; font-weight: bold;">${para.analysis.overall_aigc_risk}</span> (${para.analysis.risk_level === 'HIGH' ? '高' : para.analysis.risk_level === 'MEDIUM' ? '中' : '低'})\n\n`
    markdown += `**段落内容：**\n\n`
    markdown += `> ${para.text.split('\n').join('\n> ')}\n\n`
    markdown += `**维度评分：**\n\n`
    markdown += `- 句式统一性：${para.analysis.sentence_uniformity.toFixed(1)}\n`
    markdown += `- 词汇多样性：${para.analysis.lexical_diversity.toFixed(1)}\n`
    markdown += `- 逻辑平滑度：${para.analysis.reasoning_smoothness.toFixed(1)}\n`
    markdown += `- 个人痕迹：${para.analysis.personal_trace.toFixed(1)}\n`
    markdown += `- 风格风险：${para.analysis.stylistic_risk.toFixed(1)}\n`
    markdown += `- 过度解释：${para.analysis.over_explanation.toFixed(1)}\n`
    markdown += `- 模糊限定：${para.analysis.hedging_pattern.toFixed(1)}\n\n`
    
    if (para.analysis.concise_suggestions.length > 0) {
      markdown += `**修改建议：**\n\n`
      para.analysis.concise_suggestions.forEach((suggestion, i) => {
        markdown += `${i + 1}. ${suggestion}\n`
      })
      markdown += `\n`
    }
    
    markdown += `---\n\n`
  })
  
  // 结论
  markdown += `## 结论\n\n`
  if (overall.risk_level === 'HIGH') {
    markdown += `本文存在较高的 AIGC 风格风险。建议进行较大幅度的改写，特别是：\n\n`
  } else if (overall.risk_level === 'MEDIUM') {
    markdown += `本文存在中等的 AIGC 风格风险。建议进行适度调整，重点关注：\n\n`
  } else {
    markdown += `本文的 AIGC 风格风险较低，但仍有改进空间。建议：\n\n`
  }
  
  overall.concise_suggestions.slice(0, 3).forEach((suggestion, index) => {
    markdown += `${index + 1}. ${suggestion}\n`
  })
  
  return markdown
}

/** 对单段做同义转述（参考报告修改建议），不修改原文，结果存入 paragraphParaphrases */
async function paraphraseOneSegment(index: number): Promise<void> {
  const text = paragraphs.value[index]
  const pa = paragraphAnalyses.value[index]
  if (!text?.trim() || !pa) return
  const suggestions = pa.analysis.concise_suggestions ?? []
  const prompt = buildParaphraseSegmentPrompt(text.trim(), aigcLanguage.value, suggestions)
  const resultRef = vueRef('')
  const originKey = `aigc-paraphrase-seg-${index}-${Date.now()}`
  const messages: AIDialogMessage[] = [{ role: 'user', content: prompt }]
  const { done } = createAiTask(
    t('aigc.paraphrasing'),
    messages,
    resultRef,
    ai_types.chat,
    originKey,
    { stream: true }
  )
  await done
  const paraphrased = resultRef.value.trim()
  if (!paraphrased) return
  // 保证数组长度
  while (paragraphParaphrases.value.length <= index) {
    paragraphParaphrases.value.push(null)
  }
  paragraphParaphrases.value[index] = paraphrased
  segmentBlocks.value[index] = buildParagraphReportBlock(pa, paraphrased)
  refreshReportMarkdown()
  if (activeSessionId.value) {
    await aigcDetectionSessionsDb.update(activeSessionId.value, {
      paragraph_paraphrases: JSON.stringify(paragraphParaphrases.value),
      report_markdown: reportMarkdown.value
    })
  }
}

/** 改写全部：对每一段做同义转述（参考该段报告建议），不修改原文，结果展示在报告内 */
const handleParaphraseAll = async () => {
  if (!paragraphAnalyses.value.length || !paragraphs.value.length) {
    ElMessage.warning(t('aigc.noContent'))
    return
  }
  paraphrasing.value = true
  try {
    const n = Math.min(paragraphAnalyses.value.length, paragraphs.value.length)
    for (let i = 0; i < n; i++) {
      await paraphraseOneSegment(i)
    }
    await nextTick()
    onReportRendered()
    ElMessage.success(t('aigc.paraphraseSuccess'))
  } catch (error) {
    ElMessage.error('改写失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    paraphrasing.value = false
  }
}

/** 对本段改写（首次或重新），在 summary 旁按钮触发 */
const handleParaphraseOne = async (index: number) => {
  if (paraphrasingOneIndex.value != null || paraphrasing.value) return
  paraphrasingOneIndex.value = index
  try {
    await paraphraseOneSegment(index)
    await nextTick()
    onReportRendered()
    ElMessage.success(t('aigc.paraphraseSuccess'))
  } catch (error) {
    ElMessage.error('改写失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    paraphrasingOneIndex.value = null
  }
}

/** 构建单段改写提示词：同义转述 + 参考报告修改建议 */
function buildParaphraseSegmentPrompt(text: string, language: string, suggestions: string[]): string {
  const langName = language === 'zh' ? '中文' : language === 'en' ? 'English' : language === 'ja' ? '日本語' : language === 'ko' ? '한국어' : language
  let block = `请对下列段落进行同义转述（paraphrase），要求：
- 不改变原意，仅换一种说法
- 适当参考下方「修改建议」优化表达（句式、词汇、逻辑等），降低 AIGC 风格风险
- 语言：${langName}
- 只输出改写后的段落正文，不要加解释

<<<段落>>>
${text}
<<<段落>>>`
  if (suggestions.length > 0) {
    block += `\n\n修改建议（供参考）：\n`
    suggestions.forEach((s, i) => { block += `${i + 1}. ${s}\n` })
  }
  return block
}

// 主题样式
const borderColor = computed(() =>
  themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)',
)

const panelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor,
  borderColor: borderColor.value,
}))

const contentAreaStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  flex: 1,
  display: 'flex',
  flexDirection: 'column' as const,
  overflow: 'hidden' as const,
  height: '100%',
  minHeight: 0,
  padding: '16px',
  boxSizing: 'border-box' as const
}))

const emptyStateStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%'
}))

onMounted(() => {
  loadSessions()
})
</script>

<style scoped>
.aigc-detection-window {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.main-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
  min-height: 0;
  padding: 16px;
  box-sizing: border-box;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.session-content-panel {
  border-radius: 16px;
  border: 1px solid;
  padding: 12px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
  margin: 0;
  height: 100%;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
  gap: 0;
}

/* 工具栏区域 */
.toolbar-section {
  margin-bottom: 16px;
  background-color: v-bind('themeState.currentTheme.background2nd || themeState.currentTheme.background');
  border-radius: 8px;
  border: 1px solid v-bind('borderColor');
  flex-shrink: 0;
  overflow: hidden;
  height: auto;
}

.toolbar-scrollbar {
  width: 100%;
}

.toolbar-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: auto;
  overflow-y: hidden;
}

.toolbar-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  gap: 16px;
  min-width: max-content;
  white-space: nowrap;
  flex-wrap: nowrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 1 auto;
  min-width: 0;
  white-space: nowrap;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  white-space: nowrap;
}

/* 主内容区域 */
.main-content {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

.editor-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.editor-header {
  padding: 8px 12px;
  border-bottom: 1px solid v-bind('borderColor');
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 500;
}

.monaco-editor-container {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.report-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  height: 100%;
}

.report-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid v-bind('borderColor');
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 500;
}

.report-scrollbar {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  height: 100%;
}
.report-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.report-scrollbar :deep(.el-scrollbar__wrap)::-webkit-scrollbar {
  display: none;
}
/* 始终显示竖向滚动条轨道与滑块 */
.report-scrollbar :deep(.el-scrollbar__bar.is-vertical) {
  opacity: 1 !important;
  visibility: visible !important;
  display: block !important;
  width: 8px;
  right: 2px;
  border-radius: 4px;
  background-color: v-bind('themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"');
}
.report-scrollbar :deep(.el-scrollbar__thumb) {
  border-radius: 4px;
  background-color: v-bind('themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.2)"');
}

.report-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.6;
}

/* 报告段落折叠块（DOM 后处理添加） */
.report-scrollbar :deep(.aigc-paragraph-block) {
  margin: 12px 0;
  border: 1px solid v-bind('borderColor');
  border-radius: 8px;
  overflow: hidden;
}
.report-scrollbar :deep(.aigc-paragraph-block summary) {
  padding: 10px 12px;
  cursor: pointer;
  font-weight: 600;
  font-size: 14px;
  user-select: none;
  list-style: none;
}
.report-scrollbar :deep(.aigc-paragraph-block summary::-webkit-details-marker) {
  display: none;
}
.report-scrollbar :deep(.aigc-paragraph-block summary::before) {
  content: '▾ ';
  opacity: 0.6;
}
.report-scrollbar :deep(.aigc-paragraph-block:not([open]) summary::before) {
  content: '▸ ';
}
.report-scrollbar :deep(.aigc-paragraph-block-body) {
  padding: 0 12px 12px;
  border-top: 1px solid v-bind('borderColor');
}
.report-scrollbar :deep(.aigc-modified-badge) {
  margin-left: 6px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--el-color-warning-dark-2, #b88230);
  background-color: var(--el-color-warning-light-9, #fdf6ec);
  border-radius: 4px;
}
.report-scrollbar :deep(.aigc-paraphrase-one-btn) {
  margin-left: 8px;
  padding: 2px 10px;
  font-size: 12px;
  border: 1px solid v-bind('borderColor');
  border-radius: 4px;
  background: v-bind('themeState.currentTheme.background2nd');
  color: v-bind('themeState.currentTheme.textColor');
  cursor: pointer;
}
.report-scrollbar :deep(.aigc-paraphrase-one-btn:hover) {
  opacity: 0.9;
}
/* 雷达图容器居中；避免 width:fit-content 在 ECharts 未绘制时坍缩为 0 导致图表不显示 */
.report-scrollbar :deep(.language-echarts),
.report-scrollbar :deep(pre:has(code.language-echarts)) {
  margin-left: auto;
  margin-right: auto;
  min-width: 380px;
  width: fit-content;
  max-width: 100%;
}
.report-scrollbar :deep(.aigc-paragraph-content-switcher) {
  margin-top: 8px;
}
.report-scrollbar :deep(.aigc-ab-btns) {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.report-scrollbar :deep(.aigc-ab-btn) {
  padding: 4px 12px;
  font-size: 12px;
  border: 1px solid v-bind('borderColor');
  border-radius: 4px;
  background: v-bind('themeState.currentTheme.background2nd');
  color: v-bind('themeState.currentTheme.textColor');
  cursor: pointer;
}
.report-scrollbar :deep(.aigc-ab-btn:hover) {
  opacity: 0.9;
}
.report-scrollbar :deep(.aigc-ab-btn.active) {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9, rgba(64, 158, 255, 0.1));
  color: var(--el-color-primary);
}
/* A/B 容器：保留边缘与背景，仅内部用 Vditor 渲染 */
.report-scrollbar :deep(.aigc-original-content),
.report-scrollbar :deep(.aigc-paraphrased-content-block) {
  padding: 10px;
  background: v-bind('themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"');
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 8px;
}
.report-scrollbar :deep(.aigc-original-content .aigc-original-pre),
.report-scrollbar :deep(.aigc-paraphrased-content-block .aigc-paraphrased-content) {
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}
.report-scrollbar :deep(.aigc-content-inner) {
  word-break: break-word;
}
.report-scrollbar :deep(.aigc-paraphrased-block) {
  margin-top: 8px;
}
.report-scrollbar :deep(.aigc-copy-paraphrase-btn) {
  padding: 4px 12px;
  font-size: 12px;
  border: 1px solid v-bind('borderColor');
  border-radius: 4px;
  background: v-bind('themeState.currentTheme.background2nd');
  color: v-bind('themeState.currentTheme.textColor');
  cursor: pointer;
}
.report-scrollbar :deep(.aigc-copy-paraphrase-btn:hover) {
  opacity: 0.9;
}

.empty-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: v-bind('themeState.currentTheme.textColor');
  opacity: 0.6;
}

/* 编辑器装饰样式 */
:deep(.aigc-high-risk) {
  background-color: rgba(245, 108, 108, 0.1) !important;
}

:deep(.aigc-medium-risk) {
  background-color: rgba(230, 162, 60, 0.1) !important;
}

:deep(.aigc-low-risk) {
  background-color: rgba(103, 194, 58, 0.1) !important;
}

/* 未分析时按奇偶段落区分的高亮（scoped 内先保留，下面用非 scoped 保证 Monaco 内部也生效） */
:deep(.aigc-para-odd) {
  background-color: rgba(64, 158, 255, 0.14) !important;
}

:deep(.aigc-para-even) {
  background-color: rgba(64, 158, 255, 0.08) !important;
}

/* 选择文档对话框样式 */
.select-document-dialog {
  .el-dialog__body {
    padding: 0;
  }
}

.select-document-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.select-document-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color-page);
}

.selected-count {
  font-size: 14px;
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.document-list-scrollbar {
  flex: 1;
  padding: 12px;
}

.document-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.document-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border: 2px solid var(--el-border-color-light);
  border-radius: 12px;
  background: var(--el-bg-color);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.document-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, rgba(64, 158, 255, 0.05) 0%, rgba(64, 158, 255, 0.02) 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.document-card:hover {
  border-color: var(--el-color-primary-light-7);
  background: var(--el-bg-color-page);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.document-card:hover::before {
  opacity: 1;
}

.document-card.selected {
  border-color: var(--el-color-primary);
  background: linear-gradient(135deg, rgba(64, 158, 255, 0.08) 0%, rgba(64, 158, 255, 0.03) 100%);
  box-shadow: 0 4px 16px rgba(64, 158, 255, 0.15);
}

.document-card.selected::before {
  opacity: 1;
}

.document-card-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.document-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.document-icon {
  font-size: 20px;
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.document-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.document-path {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  padding-left: 30px;
}

.path-icon {
  font-size: 14px;
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
}

.document-path span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-format {
  padding-left: 30px;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px 20px;
  min-height: 200px;
}
</style>

<!-- 段落高亮：非 scoped，确保 Monaco 内部装饰元素也能被命中 -->
<style>
.aigc-detection-window .aigc-para-odd,
.aigc-detection-window .monaco-editor .aigc-para-odd {
  background-color: rgba(64, 158, 255, 0.18) !important;
}
.aigc-detection-window .aigc-para-even,
.aigc-detection-window .monaco-editor .aigc-para-even {
  background-color: rgba(64, 158, 255, 0.08) !important;
}
.aigc-detection-window .aigc-high-risk,
.aigc-detection-window .monaco-editor .aigc-high-risk {
  background-color: rgba(245, 108, 108, 0.15) !important;
}
.aigc-detection-window .aigc-medium-risk,
.aigc-detection-window .monaco-editor .aigc-medium-risk {
  background-color: rgba(230, 162, 60, 0.15) !important;
}
.aigc-detection-window .aigc-low-risk,
.aigc-detection-window .monaco-editor .aigc-low-risk {
  background-color: rgba(103, 194, 58, 0.12) !important;
}
</style>

