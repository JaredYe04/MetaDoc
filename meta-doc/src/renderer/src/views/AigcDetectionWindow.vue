<template>
  <div class="aigc-detection-window">
    <!-- 选择文档对话框 -->
    <Dialog v-model:open="selectDocumentDialogVisible">
      <DialogContent class="sm:max-w-[600px] select-document-dialog">
        <DialogHeader>
          <DialogTitle>{{ t('aigc.selectDocumentTitle') }}</DialogTitle>
        </DialogHeader>
        <div class="select-document-content">
          <div class="select-document-header">
            <span class="selected-count">
              {{
                selectedTabId
                  ? t('aigc.selectedOneDocument', '已选择 1 个文档')
                  : t('aigc.pleaseSelectDocument')
              }}
            </span>
          </div>
          <ScrollArea class="h-[400px] document-list-scrollbar">
            <div class="document-list">
              <div
                v-for="tab in documentTabs"
                :key="tab.id"
                class="document-card"
                :class="{ selected: selectedTabId === tab.id }"
                @click="selectedTabId = tab.id"
              >
                <div class="document-card-content">
                  <div class="document-card-header">
                    <FileText class="document-icon" />
                    <span class="document-title">{{ tab.displayName }}</span>
                  </div>
                  <div v-if="tab.path" class="document-path">
                    <FolderOpen class="path-icon" />
                    <span>{{ tab.path }}</span>
                  </div>
                  <div class="document-format">
                    <Badge :variant="tab.format === 'md' ? 'default' : 'secondary'">
                      {{ tab.format === 'md' ? 'Markdown' : 'LaTeX' }}
                    </Badge>
                  </div>
                </div>
              </div>
              <div v-if="documentTabs.length === 0" class="empty-state">
                <div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <FileX class="w-16 h-16 mb-4 opacity-50" />
                  <p>{{ t('aigc.noDocuments') }}</p>
                </div>
              </div>
            </div>
            <ScrollBar />
          </ScrollArea>
        </div>
        <DialogFooter>
          <div class="dialog-footer">
            <Button variant="outline" @click="selectDocumentDialogVisible = false">{{
              t('common.cancel')
            }}</Button>
            <Button @click="confirmSelectDocument" :disabled="!selectedTabId">
              {{ t('common.confirm') }}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

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
        <div class="content-area" :style="contentAreaStyle" style="position: relative">
          <LoadingOverlay :show="loadingSession" :message="t('common.loading', '加载中...')" />
          <div v-if="!activeSession" class="empty-state" :style="emptyStateStyle">
            <p>{{ t('aigc.noSessionSelected') }}</p>
          </div>

          <div v-else class="session-content-panel" :style="panelStyle">
            <!-- 顶部工具栏 -->
            <div class="toolbar-section">
              <ScrollArea class="toolbar-scrollbar">
                <div class="toolbar-content">
                  <div class="toolbar-left">
                    <template v-if="!articleContent">
                      <FileUpload
                        ref="uploadRef"
                        :file-list="[]"
                        :auto-upload="false"
                        :show-file-list="false"
                        :accept="acceptedFileTypes"
                        @change="handleFileChange"
                      >
                        <Button>
                          <Upload class="w-4 h-4 mr-2" />
                          {{ t('aigc.uploadFile') }}
                        </Button>
                      </FileUpload>
                      <Button :disabled="!hasActiveDocument" @click="handleSelectFromDocument">
                        <Document class="w-4 h-4 mr-2" />
                        {{ t('aigc.selectFromDocument') }}
                      </Button>
                    </template>
                    <Button
                      :disabled="!articleContent || !paragraphs.length || analyzing"
                      @click="handleSplitAtCursor"
                    >
                      {{ t('aigc.splitAtCursor') }}
                    </Button>
                    <Button
                      :disabled="!articleContent || !canMergeWithNext || analyzing"
                      @click="handleMergeWithNext"
                    >
                      {{ t('aigc.mergeWithNext') }}
                    </Button>
                    <Button
                      :disabled="!articleContent || !articleContent.trim() || analyzing"
                      @click="handleRePreprocess"
                    >
                      {{ t('aigc.rePreprocess') }}
                    </Button>
                    <Tooltip v-if="overallAnalysis">
                      <TooltipTrigger as-child>
                        <Button
                          :disabled="!articleContent || analyzing"
                          :loading="paraphrasing"
                          @click="handleParaphraseAll"
                        >
                          {{ hasAllParaphrases ? t('aigc.reParaphraseAll') : t('aigc.paraphraseAll') }}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {{ t('aigc.paraphraseHint') }}
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  <div class="toolbar-right">
                    <Button v-if="articleContent" :loading="analyzing" @click="handleAnalyze">
                      {{ overallAnalysis ? t('aigc.reAnalyze') : t('aigc.startAnalysis') }}
                    </Button>
                    <DropdownMenu
                      v-if="overallAnalysis && paragraphAnalyses.length > 0 && reportMarkdown"
                    >
                      <DropdownMenuTrigger as-child>
                        <Button>
                          {{ t('aigc.export', '导出') }}
                          <ArrowDown class="w-4 h-4 ml-2" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent class="aigc-export-dropdown-menu">
                        <DropdownMenuItem @click="handleExportCommand('report')">
                          {{ t('aigc.exportReport') }}
                        </DropdownMenuItem>
                        <DropdownMenuItem @click="handleExportParaphrasedCommand('doc')">
                          {{ t('aigc.exportAsNewDoc', '作为新文档') }}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </ScrollArea>
            </div>

            <!-- 主内容区域：无报告时 Monaco 70% / 报告 30%，有报告时 Monaco 30% / 报告 70% -->
            <div v-if="articleContent" ref="mainContentWrapRef" class="main-content">
              <ResizableContainer
                direction="vertical"
                storage-key="aigc-report-panel"
                :initial-sidebar-size="initialReportPanelWidth"
                :min-size="200"
                :max-size="800"
                :show-sidebar="true"
                sidebar-position="end"
              >
                <template #main>
                  <!-- 左侧：Monaco 编辑器（main 用 order -1 保证在左） -->
                  <div class="editor-section">
                    <div class="editor-header">
                      <span
                        >{{ t('aigc.articleContent')
                        }}<template v-if="paragraphs.length"
                          >（{{ t('aigc.paragraphCount', { n: paragraphs.length }) }}）</template
                        ></span
                      >
                    </div>
                    <div
                      :ref="(el) => setEditorRef(el as HTMLElement | null)"
                      class="monaco-editor-container"
                    ></div>
                  </div>
                </template>
                <template #sidebar>
                  <!-- 右侧：报告预览（sidebar 用 order 1 保证在右） -->
                  <div ref="reportSectionRef" class="report-section">
                    <div class="report-header">
                      <span>{{ t('aigc.analysisReport') }}</span>
                      <Button
                        v-if="reportMarkdown"
                        variant="ghost"
                        size="sm"
                        @click="scrollReportToTop"
                      >
                        {{ t('aigc.backToTop', '回到顶端') }}
                      </Button>
                    </div>
                    <ScrollArea
                      v-if="reportMarkdown"
                      class="report-scrollbar"
                      @click="onReportAreaClick"
                    >
                      <VditorPreview :markdown="reportMarkdown" @rendered="onReportRendered" />
                      <ScrollBar />
                    </ScrollArea>
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
import { ElMessageBox } from 'element-plus'
import { notifySuccess, notifyError, notifyWarning } from '@renderer/utils/notify'

// Demo mode support
const props = defineProps({
  mode: {
    type: String,
    default: 'normal'
  }
})
const isDemo = computed(() => props.mode === 'demo')
import { FileText, FolderOpen, Upload, ArrowDown, FileX } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import { Upload as FileUpload } from '@renderer/components/ui/upload'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@renderer/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { ScrollArea, ScrollBar } from '@renderer/components/ui/scroll-area'
import { Badge } from '@renderer/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { LoadingOverlay } from '@renderer/components/ui/loading-overlay'
import SessionList from '../components/common/SessionList.vue'
import type { SessionListItem } from '../components/common/SessionList.vue'
import { aigcDetectionSessionsDb, type AigcDetectionSession } from '../utils/db/tool-sessions-db'
import { themeState } from '../utils/themes'
import { setupMonacoWorker } from '../utils/monaco-worker-config'
import * as monaco from 'monaco-editor'
import { createAiTask, ai_types } from '../utils/ai_tasks'
import type { AIDialogMessage } from '@/types'
import {
  buildSchemaPrompt,
  parseSchemaJson,
  AIGC_ANALYSIS_SCHEMA,
  AIGC_DIMENSION_WEIGHTS,
  AIGC_POWER_MEAN_P,
  AIGC_VETO_THRESHOLD,
  AIGC_VETO_BONUS_FACTOR,
  DOCUMENT_TITLE_SCHEMA,
  type AigcAnalysisResult,
  type AigcDimensionScore,
  type DocumentTitleSchemaResult
} from '../utils/schemas'
import { updateTitlePrompt } from '../utils/prompts'
import { referenceAdapterManager } from '../utils/agent-framework/reference-adapters'
import {
  preprocessParagraphs,
  MIN_PARAGRAPH_CHARS,
  DEFAULT_MIN_SEGMENTS,
  DEFAULT_MAX_SEGMENTS,
  type ContentFormat
} from '../utils/aigc-paragraph-utils'
import { useActiveDocument } from '../composables/useActiveDocument'
import { useWorkspace } from '../stores/workspace'
import VditorPreview from '../components/VditorPreview.vue'
import ResizableContainer from '../components/base/ResizableContainer.vue'
import eventBus from '../utils/event-bus'
import messageBridge from '../bridge/message-bridge'
import { renderMarkdownPreview } from '../utils/md-utils'
import { ref as vueRef } from 'vue'

/** AIGC 维度键名列表（与 schemas.AigcDimensionScore 一致） */
const AIGC_DIMENSION_KEYS: (keyof AigcDimensionScore)[] = [
  'sentence_uniformity',
  'lexical_diversity',
  'reasoning_smoothness',
  'personal_trace',
  'stylistic_risk',
  'over_explanation',
  'hedging_pattern',
  'opening_transition_pattern',
  'structural_repetition',
  'abstractness',
  'emotional_flatness',
  'formulaic_closure'
]
/** 从分析结果中安全取维度分（兼容旧数据缺字段） */
function getDimensionScore(result: AigcAnalysisResult, key: keyof AigcDimensionScore): number {
  const v = result[key]
  return typeof v === 'number' ? v : 0
}

/** 构建 AIGC 雷达图 ECharts 配置（留足边距避免轴标签被截断） */
function buildAigcRadarEchartsOption(radarData: {
  indicator: Array<{ name: string; max: number }>
  series: Array<{ name: string; value: number[] }>
}): Record<string, unknown> {
  return {
    backgroundColor: 'transparent',
    radar: {
      indicator: radarData.indicator,
      radius: '58%',
      center: ['50%', '50%'],
      axisName: { margin: 14, fontSize: 12 }
    },
    series: [{ type: 'radar', data: radarData.series, areaStyle: { opacity: 0.3 } }]
  }
}

/** 风险来源权重饼图：单独展示占比前 K 名，其余合并为「不显著风险」（避免一刀切忽视 8%、9% 等仍有意义的项） */
const AIGC_WEIGHT_PIE_TOP_K = 6
/** 保底：占比不低于此值的维度即使不在前 K 也单独展示，避免「有意义但排名靠后」被合并 */
const AIGC_WEIGHT_PIE_MIN_VISIBLE = 0.05

/** 根据加权幂次贡献构建风险来源权重饼图 ECharts 配置（背景透明、居中），文案通过 t 做 i18n */
function buildAigcWeightPieEchartsOption(
  overall: AigcAnalysisResult,
  t: (key: string) => string
): Record<string, unknown> {
  const p = AIGC_POWER_MEAN_P
  const items: { key: keyof AigcDimensionScore; name: string; value: number }[] =
    AIGC_DIMENSION_KEYS.map((k) => {
      const score = getDimensionScore(overall, k)
      const contribution = AIGC_DIMENSION_WEIGHTS[k] * Math.pow(Math.max(0, score), p)
      return { key: k, name: t(`aigc.dimensions.${k}`), value: contribution }
    })
  const total = items.reduce((s, x) => s + x.value, 0) || 1
  const withShare = items.map((x) => ({ ...x, share: x.value / total }))
  const sorted = [...withShare].sort((a, b) => b.share - a.share)
  const main: { name: string; value: number }[] = []
  let otherSum = 0
  sorted.forEach((x, i) => {
    const inTopK = i < AIGC_WEIGHT_PIE_TOP_K
    const aboveMin = x.share >= AIGC_WEIGHT_PIE_MIN_VISIBLE
    if (inTopK || aboveMin) {
      main.push({ name: x.name, value: Math.round(x.share * 1000) / 10 })
    } else {
      otherSum += x.share
    }
  })
  if (otherSum > 0) {
    main.push({ name: t('aigc.nonSignificantRisk'), value: Math.round(otherSum * 1000) / 10 })
  }
  main.sort((a, b) => b.value - a.value)
  return {
    backgroundColor: 'transparent',
    title: {
      text: t('aigc.chartWeightTitle'),
      left: 'center',
      top: 8,
      textStyle: { fontSize: 14 }
    },
    tooltip: { trigger: 'item', formatter: '{b}: {c}%' },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '55%'],
        data: main,
        label: { fontSize: 11 },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.2)' }
        }
      }
    ]
  }
}
/** 各维度「高/中/低」说明文案，用于报告表格（i18n） */
function getDimDesc(k: keyof AigcDimensionScore): [string, string, string] {
  return [
    t(`aigc.dimDesc.${k}.high`),
    t(`aigc.dimDesc.${k}.mid`),
    t(`aigc.dimDesc.${k}.low`)
  ]
}

const { t, locale } = useI18n()
/** 维度标签 i18n（雷达图、饼图、报告表格等）
 * 使用 aigcDetection 命名空间下的新 i18n 键
 */
function getDimensionLabel(k: keyof AigcDimensionScore): string {
  const keyMap: Record<keyof AigcDimensionScore, string> = {
    sentence_uniformity: 'aigcDetection.sentenceUniformity',
    lexical_diversity: 'aigcDetection.lexicalDiversity',
    reasoning_smoothness: 'aigcDetection.reasoningSmoothness',
    personal_trace: 'aigcDetection.personalTrace',
    stylistic_risk: 'aigcDetection.styleConsistency',
    over_explanation: 'aigcDetection.overExplanation',
    hedging_pattern: 'aigcDetection.hedgingPattern',
    opening_transition_pattern: 'aigcDetection.openingTransitionPattern',
    structural_repetition: 'aigcDetection.structuralCompleteness',
    abstractness: 'aigcDetection.contentDepth',
    emotional_flatness: 'aigcDetection.emotionalConsistency',
    formulaic_closure: 'aigcDetection.formulaicClosure'
  }
  return t(keyMap[k] || `aigc.dimensions.${k}`)
}
const { activeDocument, activeTab } = useActiveDocument()
const workspace = useWorkspace()

const ourTabId = computed(
  () =>
    workspace.tabs.find((tab) => tab.kind === 'tool' && tab.route === '/aigc-detection')?.id ?? null
)

const sessions = ref<SessionListItem[]>([])
const activeSessionId = ref<string | null>(null)
const activeSession = computed(() => {
  if (!activeSessionId.value) return null
  return sessions.value.find((s) => s.id === activeSessionId.value) as any
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
const paragraphAnalyses = ref<Array<{ index: number; text: string; analysis: AigcAnalysisResult }>>(
  []
)
const reportMarkdown = ref<string>('')
/** 各段落报告块，按索引存储；分析完成时及时追加并按顺序刷新 reportMarkdown */
const segmentBlocks = ref<(string | null)[]>([])

/** 主内容区容器 ref（Monaco + 报告），用于测量宽度以计算报告面板默认占比） */
const mainContentWrapRef = ref<HTMLElement | null>(null)
/** 主内容区当前宽度（用于 30% / 70% 默认布局） */
const mainContentWidth = ref(1000)
/** 报告面板默认宽度：无报告时 30%，有报告时 70%，限制在 [200, 800] */
const initialReportPanelWidth = computed(() => {
  const w = mainContentWidth.value
  const ratio = reportMarkdown.value ? 0.7 : 0.3
  return Math.round(Math.max(200, Math.min(800, w * ratio)))
})

/** 每段改写前的原文备份，与段落一一对应；非 null 表示该段已改写可撤回。改写时直接替换 paragraphs，此处存原文。 */
const paragraphOriginals = ref<(string | null)[]>([])

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

const MAX_SESSION_TITLE_LENGTH = 20
const TITLE_CONTENT_LIMIT = 600

/** 根据文章内容通过 AI 生成会话标题（参考 AIChat / conversation-title） */
async function generateSessionTitleFromContent(articleContent: string): Promise<string> {
  const trimmed = (articleContent || '').trim()
  if (!trimmed) return ''
  const titleSource = trimmed.slice(0, TITLE_CONTENT_LIMIT)
  const prompt = updateTitlePrompt(JSON.stringify(titleSource))
  const messages: AIDialogMessage[] = [{ role: 'user', content: prompt }]
  const generatedText = vueRef('')
  const { done } = createAiTask(
    t('aigc.sessionsTitle'),
    messages,
    generatedText,
    ai_types.chat,
    'aigc-generate-session-title',
    { stream: true }
  )
  try {
    await done
  } catch {
    return ''
  }
  let schemaTitle: string | undefined
  let fallbackTitle: string | undefined
  try {
    const parsed = parseSchemaJson<DocumentTitleSchemaResult>(
      generatedText.value,
      DOCUMENT_TITLE_SCHEMA
    )
    schemaTitle = parsed.title
  } catch {
    const m = generatedText.value.match(/"title"\s*:\s*"([^"]+)"/)
    if (m) fallbackTitle = m[1]
    else {
      const q = generatedText.value.match(/"([^"]{4,40})"/)
      if (q) fallbackTitle = q[1]
    }
  }
  let raw = (schemaTitle ?? fallbackTitle ?? generatedText.value ?? titleSource).trim()
  raw = raw.replace(/^\s*#+/, '').replace(/\s+/g, ' ')
  if (raw.length > MAX_SESSION_TITLE_LENGTH) {
    raw = raw.slice(0, MAX_SESSION_TITLE_LENGTH).replace(/[，。,;:!?、．…-]+$/, '').trim()
  }
  return raw || t('aigc.sessionsTitle')
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
    .filter((tab) => (tab.kind === 'file' || tab.kind === 'new') && tab.id)
    .map((tab) => {
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
    const o = paragraphOriginals.value[i]
    return o != null && (o ?? '').trim() !== ''
  })
})

/** 是否至少有一段已改写可撤回（用于导出等） */
const hasAnyParaphrase = computed(() => {
  return paragraphOriginals.value.some((o) => o != null && (o ?? '').trim() !== '')
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
watch(
  () => paragraphs.value,
  () => {
    syncContentFromParagraphs()
    nextTick(() => updateEditorDecorations())
  },
  { deep: true }
)

// 监听文章内容变化（来自编辑器输入等）
watch(
  () => articleContent.value,
  () => {
    updateEditorContent()
    updateEditorDecorations()
  }
)

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
      className =
        riskLevel === 'HIGH'
          ? 'aigc-high-risk'
          : riskLevel === 'MEDIUM'
            ? 'aigc-medium-risk'
            : 'aigc-low-risk'
      minimapColor =
        riskLevel === 'HIGH'
          ? 'rgba(245, 108, 108, 0.3)'
          : riskLevel === 'MEDIUM'
            ? 'rgba(230, 162, 60, 0.3)'
            : 'rgba(103, 194, 58, 0.3)'
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
  const reportEl =
    reportSectionRef.value?.querySelector('.report-scrollbar') ??
    document.querySelector('.report-scrollbar')
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
  const container = reportSectionRef.value?.querySelector(
    '.vditor-preview-container'
  ) as HTMLElement | null
  if (!container) return
  applyReportParagraphCollapse(container)
  updateModificationMarkers()
  await renderAigcContentSwitcherMarkdown(container)
}

/** 将 A/B 切换块内的原文与改写内容用 Vditor.preview 渲染（支持 Markdown）；渲染到容器内层，保留容器边缘与背景 */
async function renderAigcContentSwitcherMarkdown(container: HTMLElement) {
  const nodes = container.querySelectorAll(
    '.aigc-original-content, .aigc-paraphrased-content-block'
  )
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

/** 报告区点击委托：撤回单段改写 */
function onReportAreaClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  const revertBtn = target.closest?.('.aigc-revert-one-btn') as HTMLElement | null
  if (revertBtn) {
    e.preventDefault()
    e.stopPropagation()
    const idx = revertBtn.getAttribute('data-paragraph-index')
    if (idx != null) handleRevertOne(parseInt(idx, 10))
  }
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
    summary.textContent = h3.textContent || t('aigc.paragraphN', { n: index + 1 })
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
    paraphraseBtn.textContent =
      paragraphOriginals.value[index] != null
        ? t('aigc.reParaphraseOne')
        : t('aigc.paraphraseOne')
    paraphraseBtn.setAttribute('title', t('aigc.paraphraseHint'))
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
  const wrap = reportSectionRef.value?.querySelector(
    '.report-scrollbar [data-radix-scroll-area-viewport]'
  ) as HTMLElement | null
  if (wrap) wrap.scrollTop = 0
}

/** 根据当前 segmentBlocks 与 overallReportBlock 刷新 reportMarkdown */
function refreshReportMarkdown() {
  const reportTitle = `# ${t('aigc.reportTitle')}\n\n`
  const segmentHead = `## ${t('aigc.segmentAnalysis')}\n\n`
  const mid = overallReportBlock.value ? overallReportBlock.value + `\n` : ``
  reportMarkdown.value =
    reportTitle + mid + segmentHead + segmentBlocks.value.map((b) => b ?? '').join('')
}

// 监听主题变化
watch(
  () => themeState.currentTheme.type,
  (newType) => {
    monaco.editor.setTheme(newType === 'dark' ? 'vs-dark' : 'vs')
  }
)

// 清理编辑器
let mainContentResizeObserver: ResizeObserver | null = null
watch(
  mainContentWrapRef,
  (el) => {
    if (mainContentResizeObserver) {
      mainContentResizeObserver.disconnect()
      mainContentResizeObserver = null
    }
    if (!el) return
    mainContentResizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry?.contentRect?.width) mainContentWidth.value = entry.contentRect.width
    })
    mainContentResizeObserver.observe(el)
    mainContentWidth.value = el.offsetWidth || el.getBoundingClientRect().width || 1000
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (mainContentResizeObserver && mainContentWrapRef.value) {
    mainContentResizeObserver.disconnect()
    mainContentResizeObserver = null
  }
  if (editorInstance) {
    editorInstance.dispose()
    editorInstance = null
  }
})

// 加载会话列表
const loadSessions = async () => {
  try {
    const dbSessions = await aigcDetectionSessionsDb.getAll()
    sessions.value = dbSessions.map((s) => ({
      id: s.id,
      title: s.title,
      updatedAt: s.updated_at
    }))
  } catch (error) {
    notifyError('加载会话列表失败: ' + (error instanceof Error ? error.message : String(error)))
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
    const tid = ourTabId.value
    if (tid) workspace.setTabToolState(tid, { activeSessionId: id })
    articleContent.value = ''
    paragraphs.value = []
    contentFormat.value = 'plain'
    overallAnalysis.value = null
    paragraphAnalyses.value = []
    reportMarkdown.value = ''
    segmentBlocks.value = []
    paragraphOriginals.value = []
    overallReportBlock.value = ''
    modifiedParagraphIndices.value = new Set()
  } catch (error) {
    notifyError('创建会话失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 选择会话
const handleSelectSession = async (item: SessionListItem) => {
  if (loadingSession.value) return

  loadingSession.value = true

  try {
    activeSessionId.value = item.id
    const tid = ourTabId.value
    if (tid) workspace.setTabToolState(tid, { activeSessionId: item.id })
    const session = await aigcDetectionSessionsDb.getById(item.id)
    if (session) {
      // 从会话来源推断内容格式，便于「重新划分段落」时使用
      if (session.content_source === 'document' && session.source_tab_id) {
        try {
          const doc = workspace.ensureDocument(session.source_tab_id)
          contentFormat.value = (
            doc?.format === 'tex' ? 'tex' : doc?.format === 'md' ? 'md' : 'plain'
          ) as ContentFormat
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
      const opts = {
        format: contentFormat.value,
        minChars: MIN_PARAGRAPH_CHARS,
        minSegments: DEFAULT_MIN_SEGMENTS,
        maxSegments: DEFAULT_MAX_SEGMENTS
      }
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

      if (session.paragraph_originals) {
        try {
          const arr = JSON.parse(session.paragraph_originals) as (string | null)[]
          paragraphOriginals.value = Array.isArray(arr) ? arr : []
        } catch {
          paragraphOriginals.value = []
        }
      } else {
        paragraphOriginals.value = []
        // 兼容旧会话：若有 paragraph_paraphrases 则应用改写并写入 paragraph_originals（改写即替换正文）
        if (session.paragraph_paraphrases) {
          try {
            const paraphrases = JSON.parse(session.paragraph_paraphrases) as (string | null)[]
            if (Array.isArray(paraphrases) && paraphrases.some((p) => p != null && (p ?? '').trim())) {
              const orig = [...paragraphs.value]
              for (let i = 0; i < paraphrases.length && i < paragraphs.value.length; i++) {
                if (paraphrases[i] != null && String(paraphrases[i]).trim()) {
                  paragraphOriginals.value[i] = orig[i]
                  paragraphs.value[i] = String(paraphrases[i]).trim()
                }
              }
              articleContent.value = paragraphs.value.join('\n\n')
            }
          } catch {
            // ignore
          }
        }
      }
      // 若有分段分析，从分析结果与当前段落、可撤回信息重建 segmentBlocks
      if (paragraphAnalyses.value.length > 0) {
        const overall = overallAnalysis.value
        overallReportBlock.value = overall ? buildOverallReportBlock(overall) : ''
        segmentBlocks.value = paragraphAnalyses.value.map((pa, i) =>
          buildParagraphReportBlock(pa, paragraphs.value[i] ?? pa.text, !!paragraphOriginals.value[i])
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
    notifyError('加载会话失败: ' + (error instanceof Error ? error.message : String(error)))
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
    notifyError('重命名失败: ' + (error instanceof Error ? error.message : String(error)))
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
      paragraph_originals: session.paragraph_originals,
      language: session.language || 'zh',
      domain: session.domain || 'academic'
    })

    await loadSessions()
    notifySuccess(t('common.duplicateSuccess'))
  } catch (error) {
    notifyError('复制失败: ' + (error instanceof Error ? error.message : String(error)))
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
      paragraphOriginals.value = []
      overallReportBlock.value = ''
      modifiedParagraphIndices.value = new Set()
    }
    notifySuccess(t('common.deleteSuccess'))
  } catch (error) {
    notifyError('删除失败: ' + (error instanceof Error ? error.message : String(error)))
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
      const uint8Array = new Uint8Array(fileContent)
      const chunkSize = 8192
      let base64 = ''
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.slice(i, i + chunkSize)
        base64 += String.fromCharCode.apply(null, Array.from(chunk))
      }
      base64 = btoa(base64)
      const filePath = (await messageBridge.invoke('save-reference-file', {
        filename: fileName,
        content: base64
      })) as string
      if (!filePath) throw new Error('保存文件失败')
      const adapter = referenceAdapterManager.getAdapter(fileExt)
      if (!adapter) {
        notifyError(t('aigc.unsupportedFileType'))
        return
      }
      parsedContent = await adapter.parse(filePath, fileExt)
      sourceFilePath = filePath
    }

    contentFormat.value = formatFromFileExtension(fileExt)
    paragraphs.value = preprocessParagraphs(parsedContent, {
      format: contentFormat.value,
      minChars: MIN_PARAGRAPH_CHARS,
      minSegments: DEFAULT_MIN_SEGMENTS,
      maxSegments: DEFAULT_MAX_SEGMENTS
    })
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

    notifySuccess(t('aigc.fileUploaded'))
  } catch (error) {
    notifyError('上传文件失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 从文档选择内容（显示对话框）
const handleSelectFromDocument = async () => {
  if (!activeSessionId.value) {
    await handleCreateSession()
  }

  // 检查是否有可用的文档
  if (documentTabs.value.length === 0) {
    notifyWarning(t('aigc.noActiveDocument'))
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
    notifyWarning(t('aigc.pleaseSelectDocument'))
    return
  }

  try {
    const tab = workspace.tabs.find((t) => String(t.id) === selectedTabId.value)
    if (!tab) {
      notifyError(t('aigc.documentNotFound'))
      return
    }

    const doc = workspace.ensureDocument(tab.id)
    if (!doc || (doc.format !== 'md' && doc.format !== 'tex')) {
      notifyError(t('aigc.unsupportedFormat'))
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
      notifyWarning(t('aigc.documentEmpty'))
      return
    }

    contentFormat.value = (
      doc.format === 'tex' ? 'tex' : doc.format === 'md' ? 'md' : 'plain'
    ) as ContentFormat
    paragraphs.value = preprocessParagraphs(content, {
      format: contentFormat.value,
      minChars: MIN_PARAGRAPH_CHARS,
      minSegments: DEFAULT_MIN_SEGMENTS,
      maxSegments: DEFAULT_MAX_SEGMENTS
    })
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

    notifySuccess(t('aigc.contentSelected'))
  } catch (error) {
    notifyError('选择内容失败: ' + (error instanceof Error ? error.message : String(error)))
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
  const next = [
    ...paragraphs.value.slice(0, idx),
    before,
    after,
    ...paragraphs.value.slice(idx + 1)
  ]
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
  paragraphs.value = preprocessParagraphs(raw, {
    format: contentFormat.value,
    minChars: MIN_PARAGRAPH_CHARS,
    minSegments: DEFAULT_MIN_SEGMENTS,
    maxSegments: DEFAULT_MAX_SEGMENTS
  })
  paragraphOriginals.value = []
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
    aigcDetectionSessionsDb
      .update(activeSessionId.value, {
        paragraph_texts: JSON.stringify(paragraphs.value),
        article_content: paragraphs.value.join('\n\n'),
        paragraph_originals: JSON.stringify(paragraphOriginals.value)
      })
      .catch(() => {})
  }
}

// 开始分析：以当前划分好的段落为单位，并行执行，每个子任务完成后立即追加到报告
const handleAnalyze = async () => {
  if (!activeSessionId.value) {
    notifyWarning(t('aigc.noContent'))
    return
  }
  const list = paragraphs.value.filter((p) => p.trim())
  if (list.length === 0) {
    notifyWarning(t('aigc.noContent'))
    return
  }

  analyzing.value = true
  modifiedParagraphIndices.value = new Set()
  reportMarkdown.value = ''
  paragraphAnalyses.value = []
  overallAnalysis.value = null
  overallReportBlock.value = ''
  segmentBlocks.value = list.map(() => null)
  refreshReportMarkdown()

  try {
    const total = list.length
    const analyses: Array<{ index: number; text: string; analysis: AigcAnalysisResult }> = []

    // 并行分析，每完成一个立即按索引插入到正确位置并刷新（当前段落内容与可撤回状态保留）
    const promises = list.map(async (text, i) => {
      const analysis = await analyzeParagraph(text.trim(), i + 1, total)
      const result = { index: i, text: text.trim(), analysis }
      analyses.push(result)
      const currentText = paragraphs.value[result.index] ?? result.text
      const canRevert = !!paragraphOriginals.value[result.index]
      segmentBlocks.value[result.index] = buildParagraphReportBlock(result, currentText, canRevert)
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
        paragraph_originals: JSON.stringify(paragraphOriginals.value),
        report_markdown: reportMarkdown.value
      })
    }
    await nextTick()
    updateEditorDecorations()
    notifySuccess(t('aigc.analysisComplete'))
    // 分析完成后根据正文生成会话标题（参考 AIChat）
    if (activeSessionId.value && articleContent.value.trim()) {
      generateSessionTitleFromContent(articleContent.value).then((newTitle) => {
        if (newTitle && activeSessionId.value) {
          aigcDetectionSessionsDb.update(activeSessionId.value, { title: newTitle }).then(() => loadSessions())
        }
      })
    }
  } catch (error) {
    notifyError('分析失败: ' + (error instanceof Error ? error.message : String(error)))
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

  const messages: AIDialogMessage[] = [
    {
      role: 'user',
      content: schemaPrompt
    }
  ]

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
    hedging_pattern: 0,
    opening_transition_pattern: 0,
    structural_repetition: 0,
    abstractness: 0,
    emotional_flatness: 0,
    formulaic_closure: 0
  }

  const count = paragraphAnalyses.length || 1
  paragraphAnalyses.forEach((pa) => {
    AIGC_DIMENSION_KEYS.forEach((key) => {
      dimensionScores[key] += getDimensionScore(pa.analysis, key)
    })
  })
  AIGC_DIMENSION_KEYS.forEach((key) => {
    dimensionScores[key] /= count
  })

  const weightTotal = AIGC_DIMENSION_KEYS.reduce((s, k) => s + AIGC_DIMENSION_WEIGHTS[k], 0)
  // 基础分：加权幂次平均（p>1 时高分维度放大），再 ×10 得到 0–100
  const weightedPowerSum = AIGC_DIMENSION_KEYS.reduce(
    (s, k) =>
      s + AIGC_DIMENSION_WEIGHTS[k] * Math.pow(Math.max(0, dimensionScores[k]), AIGC_POWER_MEAN_P),
    0
  )
  const baseRaw = Math.pow(weightedPowerSum / weightTotal, 1 / AIGC_POWER_MEAN_P)
  let baseScore = Math.max(0, Math.min(100, baseRaw * 10))
  // 一票否决：任一维度 ≥ 阈值时按 (max - threshold)^2 加分，使总分明显升高
  const maxDim = Math.max(...AIGC_DIMENSION_KEYS.map((k) => dimensionScores[k]))
  const vetoBonus =
    maxDim >= AIGC_VETO_THRESHOLD
      ? AIGC_VETO_BONUS_FACTOR * Math.pow(maxDim - AIGC_VETO_THRESHOLD, 2)
      : 0
  const overallRisk = Math.max(0, Math.min(100, Math.round(baseScore + vetoBonus)))
  const riskLevel = getRiskLevelFromScore(overallRisk)

  // 收集所有建议
  const allSuggestions = new Set<string>()
  paragraphAnalyses.forEach((pa) => {
    pa.analysis.concise_suggestions.forEach((s) => allSuggestions.add(s))
  })

  return {
    ...dimensionScores,
    overall_aigc_risk: Math.round(overallRisk),
    risk_level: riskLevel,
    concise_suggestions: Array.from(allSuggestions).slice(0, 10) // 最多10条建议
  }
}

// 构建AIGC分析提示词（语言由当前 i18n locale 决定，不区分学术/通用）
const buildAigcAnalysisPrompt = (
  text: string,
  language: string,
  isParagraph: boolean = false
): string => {
  const langName =
    language === 'zh'
      ? '中文'
      : language === 'en'
        ? 'English'
        : language === 'ja'
          ? '日本語'
          : language === 'ko'
            ? '한국어'
            : language
  const scope = isParagraph ? '段落' : '全文'
  return `你是一个学术写作分析 agent。

请从"写作行为特征"的角度，而非判断作者身份，对下列${scope}进行评估。

评估目标：
判断${scope}中是否存在明显的 AIGC 风格风险特征。

请从以下维度进行 0-10 打分（所有维度统一方向：10 表示该维度上越像 AIGC、风险越高）：
- sentence_uniformity: 句式是否过于统一（10=高度统一=高风险）
- lexical_diversity: 词汇是否重复、保守（10=越重复保守=高风险）
- reasoning_smoothness: 逻辑是否过于平滑（10=过于平滑=高风险）
- personal_trace: 是否缺乏个人思考痕迹（10=缺乏个人痕迹=高风险）
- stylistic_risk: 是否符合常见 AIGC 模板（10=高度符合=高风险）
- over_explanation: 是否"教科书式解释"（10=过度解释=高风险）
- hedging_pattern: 是否大量使用模糊限定词（10=大量使用=高风险）
- opening_transition_pattern: 是否大量使用模板化过渡语（10=大量使用=高风险）
- structural_repetition: 段落/句式结构是否过于规整（10=过于规整=高风险）
- abstractness: 是否泛泛而谈、缺乏具体例证（10=越抽象空洞=高风险）
- emotional_flatness: 是否缺乏情绪起伏、过于中性客观（10=越平淡=高风险）
- formulaic_closure: 结尾是否套路化（10=高度套路化=高风险）

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

/** 构建单个段落的报告块：显示当前段落内容，可撤回时显示撤回按钮 */
function buildParagraphReportBlock(
  para: { index: number; text: string; analysis: AigcAnalysisResult },
  currentText: string,
  canRevert: boolean
): string {
  const paraLevel = getRiskLevelFromScore(para.analysis.overall_aigc_risk)
  const paraRiskColor =
    paraLevel === 'HIGH' ? '#f56c6c' : paraLevel === 'MEDIUM' ? '#e6a23c' : '#67c23a'
  const riskLevelLabel =
    paraLevel === 'HIGH' ? t('aigc.riskHigh') : paraLevel === 'MEDIUM' ? t('aigc.riskMedium') : t('aigc.riskLow')
  const radarData = {
    indicator: AIGC_DIMENSION_KEYS.map((k) => ({ name: getDimensionLabel(k), max: 10 })),
    series: [
      {
        name: t('aigc.paragraphScore', { n: para.index + 1 }),
        value: AIGC_DIMENSION_KEYS.map((k) => getDimensionScore(para.analysis, k))
      }
    ]
  }
  let block = `### ${t('aigc.paragraphN', { n: para.index + 1 })} {#paragraph-${para.index}}\n\n`
  block += `**${t('aigc.riskScore')}：** <span style="color: ${paraRiskColor}; font-weight: bold;">${para.analysis.overall_aigc_risk}</span> (${riskLevelLabel})\n\n`
  block += `**${t('aigc.paragraphContent')}：**\n\n`
  const displayText = (currentText || para.text).trim()
  block += `> ${displayText.split('\n').join('\n> ')}\n\n`
  if (canRevert) {
    block += `<button type="button" class="aigc-revert-one-btn" data-paragraph-index="${para.index}">${t('aigc.revertOne')}</button>\n\n`
  }
  block += `**${t('aigc.radarChart')}：**\n\n`
  block += `\`\`\`echarts\n`
  block += JSON.stringify(buildAigcRadarEchartsOption(radarData), null, 2)
  block += `\n\`\`\`\n\n`
  block += `**${t('aigc.dimensionScore')}：**\n\n`
  AIGC_DIMENSION_KEYS.forEach((k) => {
    const v = getDimensionScore(para.analysis, k)
    block += `- ${getDimensionLabel(k)}：${v.toFixed(1)}\n`
  })
  block += `\n`
  if (para.analysis.concise_suggestions.length > 0) {
    block += `**${t('aigc.modificationSuggestions')}：**\n\n`
    para.analysis.concise_suggestions.forEach((s, i) => {
      block += `${i + 1}. ${s}\n`
    })
    block += `\n`
  }
  block += `---\n\n`
  return block
}

/** 构建总体报告块（不含标题与分段分析），供 refreshReportMarkdown 使用 */
function buildOverallReportBlock(overall: AigcAnalysisResult): string {
  const radarData = {
    indicator: AIGC_DIMENSION_KEYS.map((k) => ({ name: getDimensionLabel(k), max: 10 })),
    series: [
      {
        name: t('aigc.overallScore'),
        value: AIGC_DIMENSION_KEYS.map((k) => getDimensionScore(overall, k))
      }
    ]
  }
  const riskColor =
    overall.risk_level === 'HIGH'
      ? '#f56c6c'
      : overall.risk_level === 'MEDIUM'
        ? '#e6a23c'
        : '#67c23a'
  const riskLevelLabel =
    overall.risk_level === 'HIGH'
      ? t('aigc.riskHigh')
      : overall.risk_level === 'MEDIUM'
        ? t('aigc.riskMedium')
        : t('aigc.riskLow')
  const dimDesc = (v: number, high: string, mid: string, low: string) =>
    v >= 7 ? `⚠️ ${high}` : v >= 4 ? `⚠️ ${mid}` : `✓ ${low}`
  let overallBlock = `## ${t('aigc.overallAnalysis')}\n\n`
  overallBlock += `### ${t('aigc.riskScore')}\n\n`
  overallBlock += `<div style="text-align: center; margin: 20px 0;">\n`
  overallBlock += `<div style="font-size: 48px; font-weight: bold; color: ${riskColor};">${overall.overall_aigc_risk}</div>\n`
  overallBlock += `<div style="font-size: 18px; color: ${riskColor}; margin-top: 10px;">${t('aigc.riskLevel')}：${riskLevelLabel}</div>\n`
  overallBlock += `</div>\n\n`
  overallBlock += `### ${t('aigc.radarChart')}\n\n`
  overallBlock += `\`\`\`echarts\n`
  overallBlock += JSON.stringify(buildAigcRadarEchartsOption(radarData), null, 2)
  overallBlock += `\n\`\`\`\n\n`
  overallBlock += `### ${t('aigc.riskWeightPie')}\n\n`
  overallBlock += `\`\`\`echarts\n`
  overallBlock += JSON.stringify(buildAigcWeightPieEchartsOption(overall, t), null, 2)
  overallBlock += `\n\`\`\`\n\n`
  overallBlock += `### ${t('aigc.dimensionScoreDetail')}\n\n`
  overallBlock += `| ${t('aigc.dimension')} | ${t('aigc.score')} | ${t('aigc.description')} |\n`
  overallBlock += `|------|------|------|\n`
  AIGC_DIMENSION_KEYS.forEach((k) => {
    const v = getDimensionScore(overall, k)
    const [high, mid, low] = getDimDesc(k)
    overallBlock += `| ${getDimensionLabel(k)} | ${v.toFixed(1)} | ${dimDesc(v, high, mid, low)} |\n`
  })
  overallBlock += `\n`

  overallBlock += `### ${t('aigc.modificationSuggestions')}\n\n`
  overall.concise_suggestions.forEach((suggestion, index) => {
    overallBlock += `${index + 1}. ${suggestion}\n`
  })
  overallBlock += `\n`

  overallBlock += `## ${t('aigc.conclusion')}\n\n`
  if (overall.risk_level === 'HIGH') {
    overallBlock += t('aigc.conclusionHigh')
  } else if (overall.risk_level === 'MEDIUM') {
    overallBlock += t('aigc.conclusionMedium')
  } else {
    overallBlock += t('aigc.conclusionLow')
  }

  overall.concise_suggestions.slice(0, 3).forEach((suggestion, index) => {
    overallBlock += `${index + 1}. ${suggestion}\n`
  })

  return overallBlock
}

// 导出报告到新文档
const handleExportReport = () => {
  if (!reportMarkdown.value) {
    notifyWarning(t('aigc.noAnalysisData'))
    return
  }
  eventBus.emit('ai-chat-export-to-document', {
    content: reportMarkdown.value
  })
  notifySuccess(t('aigc.exportReportSuccess', '已导出到新文档'))
}

/** 导出下拉菜单：report=导出报告；二级菜单由 handleExportParaphrasedCommand 处理 */
const handleExportCommand = (command: string) => {
  if (command === 'report') handleExportReport()
}

/** 导出当前正文到新文档 */
const handleExportParaphrasedCommand = (command: string) => {
  if (command === 'doc') handleExportParaphrasedArticle()
}

/** 导出当前正文到新文档（改写已直接替换在 paragraphs 中） */
const handleExportParaphrasedArticle = () => {
  if (!paragraphs.value.length) {
    notifyWarning(t('aigc.noContent'))
    return
  }
  const newContent = paragraphs.value.join('\n\n')
  eventBus.emit('ai-chat-export-to-document', {
    content: newContent
  })
  notifySuccess(t('aigc.exportParaphrasedSuccess', '已导出到新文档'))
}

// 生成Markdown报告
const generateReportMarkdown = (
  overall: AigcAnalysisResult,
  paragraphs: Array<{ index: number; text: string; analysis: AigcAnalysisResult }>
): string => {
  const radarData = {
    indicator: AIGC_DIMENSION_KEYS.map((k) => ({ name: getDimensionLabel(k), max: 10 })),
    series: [
      {
        name: '总体评分',
        value: AIGC_DIMENSION_KEYS.map((k) => getDimensionScore(overall, k))
      }
    ]
  }
  const riskColor =
    overall.risk_level === 'HIGH'
      ? '#f56c6c'
      : overall.risk_level === 'MEDIUM'
        ? '#e6a23c'
        : '#67c23a'
  const dimDesc = (v: number, high: string, mid: string, low: string) =>
    v >= 7 ? `⚠️ ${high}` : v >= 4 ? `⚠️ ${mid}` : `✓ ${low}`
  const riskLevelLabel =
    overall.risk_level === 'HIGH'
      ? t('aigc.riskHigh')
      : overall.risk_level === 'MEDIUM'
        ? t('aigc.riskMedium')
        : t('aigc.riskLow')
  let markdown = `# ${t('aigc.reportTitle')}\n\n`
  markdown += `## ${t('aigc.overallAnalysis')}\n\n`
  markdown += `### ${t('aigc.riskScore')}\n\n`
  markdown += `<div style="text-align: center; margin: 20px 0;">\n`
  markdown += `<div style="font-size: 48px; font-weight: bold; color: ${riskColor};">${overall.overall_aigc_risk}</div>\n`
  markdown += `<div style="font-size: 18px; color: ${riskColor}; margin-top: 10px;">${t('aigc.riskLevel')}：${riskLevelLabel}</div>\n`
  markdown += `</div>\n\n`
  markdown += `### ${t('aigc.radarChart')}\n\n`
  markdown += `\`\`\`echarts\n`
  markdown += JSON.stringify(buildAigcRadarEchartsOption(radarData), null, 2)
  markdown += `\n\`\`\`\n\n`
  markdown += `### ${t('aigc.riskWeightPie')}\n\n`
  markdown += `\`\`\`echarts\n`
  markdown += JSON.stringify(buildAigcWeightPieEchartsOption(overall, t), null, 2)
  markdown += `\n\`\`\`\n\n`
  markdown += `### ${t('aigc.dimensionScoreDetail')}\n\n`
  markdown += `| ${t('aigc.dimension')} | ${t('aigc.score')} | ${t('aigc.description')} |\n`
  markdown += `|------|------|------|\n`
  AIGC_DIMENSION_KEYS.forEach((k) => {
    const v = getDimensionScore(overall, k)
    const [high, mid, low] = getDimDesc(k)
    markdown += `| ${getDimensionLabel(k)} | ${v.toFixed(1)} | ${dimDesc(v, high, mid, low)} |\n`
  })
  markdown += `\n`

  markdown += `### ${t('aigc.modificationSuggestions')}\n\n`
  overall.concise_suggestions.forEach((suggestion, index) => {
    markdown += `${index + 1}. ${suggestion}\n`
  })
  markdown += `\n`

  markdown += `## ${t('aigc.segmentAnalysis')}\n\n`
  paragraphs.forEach((para, index) => {
    const paraRiskColor =
      para.analysis.risk_level === 'HIGH'
        ? '#f56c6c'
        : para.analysis.risk_level === 'MEDIUM'
          ? '#e6a23c'
          : '#67c23a'
    const paraLevelLabel =
      para.analysis.risk_level === 'HIGH'
        ? t('aigc.riskHigh')
        : para.analysis.risk_level === 'MEDIUM'
          ? t('aigc.riskMedium')
          : t('aigc.riskLow')

    markdown += `### ${t('aigc.paragraphN', { n: index + 1 })} {#paragraph-${index}}\n\n`
    markdown += `**${t('aigc.riskScore')}：** <span style="color: ${paraRiskColor}; font-weight: bold;">${para.analysis.overall_aigc_risk}</span> (${paraLevelLabel})\n\n`
    markdown += `**${t('aigc.paragraphContent')}：**\n\n`
    markdown += `> ${para.text.split('\n').join('\n> ')}\n\n`
    markdown += `**${t('aigc.dimensionScore')}：**\n\n`
    AIGC_DIMENSION_KEYS.forEach((k) => {
      markdown += `- ${getDimensionLabel(k)}：${getDimensionScore(para.analysis, k).toFixed(1)}\n`
    })
    markdown += `\n`

    if (para.analysis.concise_suggestions.length > 0) {
      markdown += `**${t('aigc.modificationSuggestions')}：**\n\n`
      para.analysis.concise_suggestions.forEach((suggestion, i) => {
        markdown += `${i + 1}. ${suggestion}\n`
      })
      markdown += `\n`
    }

    markdown += `---\n\n`
  })

  markdown += `## ${t('aigc.conclusion')}\n\n`
  if (overall.risk_level === 'HIGH') {
    markdown += t('aigc.conclusionHigh')
  } else if (overall.risk_level === 'MEDIUM') {
    markdown += t('aigc.conclusionMedium')
  } else {
    markdown += t('aigc.conclusionLow')
  }

  overall.concise_suggestions.slice(0, 3).forEach((suggestion, index) => {
    markdown += `${index + 1}. ${suggestion}\n`
  })

  return markdown
}

/** 对单段做同义转述并直接替换正文，原文存入 paragraphOriginals 供撤回
 * @param skipDbSave 为 true 时不写库（由调用方在全部完成后统一保存）
 */
async function paraphraseOneSegment(index: number, skipDbSave = false): Promise<void> {
  const text = paragraphs.value[index]
  const pa = paragraphAnalyses.value[index]
  if (!text?.trim() || !pa) return
  const suggestions = pa.analysis.concise_suggestions ?? []
  const riskLevel = pa.analysis.risk_level ?? 'MEDIUM'
  const overallRisk = pa.analysis.overall_aigc_risk ?? 50
  const prompt = buildParaphraseSegmentPrompt(
    text.trim(),
    aigcLanguage.value,
    suggestions,
    riskLevel,
    overallRisk
  )
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
  const original = paragraphs.value[index]
  while (paragraphOriginals.value.length <= index) {
    paragraphOriginals.value.push(null)
  }
  paragraphOriginals.value[index] = original
  paragraphs.value[index] = paraphrased
  syncContentFromParagraphs()
  segmentBlocks.value[index] = buildParagraphReportBlock(pa, paraphrased, true)
  refreshReportMarkdown()
  if (!skipDbSave && activeSessionId.value) {
    await aigcDetectionSessionsDb.update(activeSessionId.value, {
      paragraph_texts: JSON.stringify(paragraphs.value),
      paragraph_originals: JSON.stringify(paragraphOriginals.value),
      report_markdown: reportMarkdown.value
    })
  }
}

/** 改写全部：并发对各段做同义转述并替换正文，完成后自动重新分析得到新报告 */
const handleParaphraseAll = async () => {
  if (!paragraphAnalyses.value.length || !paragraphs.value.length) {
    notifyWarning(t('aigc.noContent'))
    return
  }
  paraphrasing.value = true
  try {
    const n = Math.min(paragraphAnalyses.value.length, paragraphs.value.length)
    await Promise.all(Array.from({ length: n }, (_, i) => paraphraseOneSegment(i, true)))
    if (activeSessionId.value) {
      await aigcDetectionSessionsDb.update(activeSessionId.value, {
        paragraph_texts: JSON.stringify(paragraphs.value),
        paragraph_originals: JSON.stringify(paragraphOriginals.value),
        report_markdown: reportMarkdown.value
      })
    }
    await nextTick()
    onReportRendered()
    notifySuccess(t('aigc.paraphraseSuccess'))
    await handleAnalyze()
  } catch (error) {
    notifyError('改写失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    paraphrasing.value = false
  }
}

/** 对本段改写（首次或重新），在 summary 旁按钮触发；改写后直接替换正文并保留原文供撤回 */
const handleParaphraseOne = async (index: number) => {
  if (paraphrasingOneIndex.value != null || paraphrasing.value) return
  paraphrasingOneIndex.value = index
  try {
    await paraphraseOneSegment(index)
    await nextTick()
    onReportRendered()
    notifySuccess(t('aigc.paraphraseSuccess'))
  } catch (error) {
    notifyError('改写失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    paraphrasingOneIndex.value = null
  }
}

/** 撤回单段改写：该段恢复为改写前原文 */
async function handleRevertOne(index: number) {
  const orig = paragraphOriginals.value[index]
  if (orig == null || index < 0 || index >= paragraphs.value.length) return
  paragraphs.value[index] = orig
  paragraphOriginals.value[index] = null
  syncContentFromParagraphs()
  const pa = paragraphAnalyses.value[index]
  if (pa) {
    segmentBlocks.value[index] = buildParagraphReportBlock(
      pa,
      paragraphs.value[index],
      false
    )
    refreshReportMarkdown()
  }
  if (activeSessionId.value) {
    await aigcDetectionSessionsDb.update(activeSessionId.value, {
      paragraph_texts: JSON.stringify(paragraphs.value),
      paragraph_originals: JSON.stringify(paragraphOriginals.value),
      report_markdown: reportMarkdown.value
    })
  }
  await nextTick()
  onReportRendered()
  notifySuccess(t('aigc.revertSuccess', '已撤回该段'))
}

/** 构建单段改写提示词：目标为一次性改写至低 AIGC 风险，非仅做轻微降低 */
function buildParaphraseSegmentPrompt(
  text: string,
  language: string,
  suggestions: string[],
  riskLevel: string = 'MEDIUM',
  overallRisk: number = 50
): string {
  const langName =
    language === 'zh'
      ? '中文'
      : language === 'en'
        ? 'English'
        : language === 'ja'
          ? '日本語'
          : language === 'ko'
            ? '한국어'
            : language
  const riskLabel = riskLevel === 'HIGH' ? '高' : riskLevel === 'MEDIUM' ? '中' : '低'
  let block = `你是一位擅长「去 AIGC 化」的改写专家。请对下列段落进行改写。

【当前状态】本段 AIGC 风险评分约 ${overallRisk}，风险等级：${riskLabel}。

【改写目标】在一次改写中直接达到「低 AIGC 风险、读起来像人写」的效果，而不是只做轻微降低。要求：
1. 不改变原意，但要在句式、用词、衔接、个人化表达上明显改观，避免仅做同义词替换。
2. 务必逐条落实下方「修改建议」，从结构和风格上脱胎换骨，而非点到为止。
3. 具体可做：长短句交错、减少模板化过渡语（如首先/其次/综上所述）、增加具体细节或个人判断、适度保留语气起伏、结尾避免套路化总结/展望/建议三板斧。
4. 语言：${langName}。
5. 只输出改写后的段落正文，不要加任何解释或前缀。

<<<段落>>>
${text}
<<<段落>>>`
  if (suggestions.length > 0) {
    block += `\n\n【修改建议】（请务必在改写中落实）：\n`
    suggestions.forEach((s, i) => {
      block += `${i + 1}. ${s}\n`
    })
  }
  return block
}

// 主题样式
const borderColor = computed(() =>
  themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)'
)

const panelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor,
  borderColor: borderColor.value
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

// 窗口迁移后恢复当前选中的会话
watch(
  [() => workspace.activeTabId.value, ourTabId, () => sessions.value],
  () => {
    const tid = ourTabId.value
    if (!tid || workspace.activeTabId.value !== tid || sessions.value.length === 0) return
    const state = workspace.getTabToolState(tid)
    const savedId = state.activeSessionId
    if (!savedId || !sessions.value.some((s) => s.id === savedId)) return
    if (activeSessionId.value === savedId) return
    const item = sessions.value.find((s) => s.id === savedId)!
    activeSessionId.value = savedId
    handleSelectSession(item)
  },
  { immediate: true, deep: true }
)

onMounted(() => {
  if (isDemo.value) {
    // Demo mode: use mock data
    sessions.value = [
      { id: 'demo-1', title: '示例文档检测', updatedAt: Date.now() },
      { id: 'demo-2', title: '论文检测', updatedAt: Date.now() - 3600000 }
    ]
    activeSessionId.value = 'demo-1'
    return
  }
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
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
  gap: 0;
}

/* 工具栏区域 */
.toolbar-section {
  margin-bottom: 16px;
  background-color: v-bind(
    'themeState.currentTheme.background2nd || themeState.currentTheme.background'
  );
  border-radius: 8px;
  border: 1px solid v-bind('borderColor');
  flex-shrink: 0;
  overflow: hidden;
  height: auto;
}

.toolbar-scrollbar {
  width: 100%;
}

.toolbar-scrollbar :deep([data-radix-scroll-area-viewport]) {
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

.aigc-export-submenu-trigger {
  display: inline-flex;
  align-items: center;
  width: 100%;
  justify-content: space-between;
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
.report-scrollbar :deep([data-radix-scroll-area-viewport]) {
  overflow-x: hidden;
  overflow-y: auto;
}

.report-scrollbar :deep([data-radix-scroll-area-viewport])::-webkit-scrollbar {
  width: 6px;
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
  background-color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"'
  );
}
.report-scrollbar :deep(.el-scrollbar__thumb) {
  border-radius: 4px;
  background-color: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.2)"'
  );
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
.report-scrollbar :deep(.aigc-revert-one-btn) {
  margin-top: 6px;
  padding: 2px 10px;
  font-size: 12px;
  border: 1px solid v-bind('borderColor');
  border-radius: 4px;
  background: v-bind('themeState.currentTheme.background2nd');
  color: v-bind('themeState.currentTheme.textColor');
  cursor: pointer;
}
.report-scrollbar :deep(.aigc-revert-one-btn:hover) {
  opacity: 0.9;
}
/* 雷达图容器：加大宽度与内边距，避免 12 维轴标签左右被截断 */
.report-scrollbar :deep(.language-echarts),
.report-scrollbar :deep(pre:has(code.language-echarts)) {
  margin-left: auto;
  margin-right: auto;
  min-width: 640px;
  width: fit-content;
  max-width: 100%;
  padding: 8px 12px;
  box-sizing: border-box;
}
/* 报告内表格与雷达图一致居中 */
.report-scrollbar :deep(table) {
  margin-left: auto;
  margin-right: auto;
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
  background: v-bind(
    'themeState.currentTheme.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"'
  );
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
.select-document-dialog [data-slot='dialog-content'] {
  padding: 0;
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
/* 导出下拉菜单（含二级）文字不可选中 */
.aigc-export-dropdown-menu {
  user-select: none;
}
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
