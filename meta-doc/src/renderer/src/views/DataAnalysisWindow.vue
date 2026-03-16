<template>
  <div class="data-analysis-window">
    <div class="main-container">
      <!-- 左侧会话列表（含右侧 resize 与折叠，主内容通过默认 slot 传入） -->
      <SessionList
        :title="t('dataAnalysis.sessionsTitle', '数据分析会话')"
        :items="sessions"
        :active-index="activeSessionId || undefined"
        :disabled="analyzing || loadingSession"
        :create-button-tooltip="t('dataAnalysis.newSession', '新建会话')"
        :rename-label="t('common.rename', '重命名')"
        :duplicate-label="t('common.duplicate', '复制')"
        :delete-label="t('common.delete', '删除')"
        :rename-dialog-title="t('dataAnalysis.renameTitle', '重命名会话')"
        :rename-placeholder="t('dataAnalysis.renamePlaceholder', '请输入会话名称')"
        :cancel-label="t('common.cancel', '取消')"
        :confirm-label="t('common.confirm', '确认')"
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
            <p>{{ t('dataAnalysis.noSessionSelected', '请选择一个会话或创建新会话') }}</p>
          </div>

          <div v-else class="session-content-panel" :style="panelStyle">
            <!-- 文件上传/显示区域（在最上方） -->
            <div class="file-section" :style="fileSectionStyle">
              <Upload
                v-if="!currentFile"
                :file-list="[]"
                :auto-upload="false"
                @change="handleFileChange"
                :limit="1"
                accept=".csv,.xlsx,.xls,.json"
                class="compact-upload"
                :show-file-list="false"
              >
                <Button type="primary">
                  <el-icon><UploadFilled /></el-icon>
                  {{ t('dataAnalysis.uploadFile', '上传文件') }}
                </Button>
                <template #tip>
                  <div class="upload-tip" :style="tipStyle">
                    {{ t('dataAnalysis.uploadTip', '支持 CSV、Excel、JSON 格式') }}
                  </div>
                </template>
              </Upload>

              <div v-else class="file-list-item" :style="fileListItemStyle">
                <el-icon class="file-icon"><Document /></el-icon>
                <span class="file-name" :style="fileNameStyle">{{ currentFile.name }}</span>
                <Button type="danger" circle plain size="small" @click="handleFileRemove">
                  <el-icon><Delete /></el-icon>
                </Button>
              </div>
            </div>

            <!-- Tab 内容 -->
            <Tabs v-model="activeTab" class="main-tabs border-card" :style="tabsStyle">
              <TabsList>
                <TabsTrigger value="preview">
                  {{ t('dataAnalysis.tabs.preview', '数据预览') }}
                </TabsTrigger>
                <TabsTrigger value="result">
                  {{ t('dataAnalysis.tabs.result', '分析结果') }}
                </TabsTrigger>
              </TabsList>
              <!-- Tab 1: 数据预览与参数设置 -->
              <TabsContent value="preview">
                <div class="preview-tab-content">
                  <!-- 参数设置区域 - 拆分为左右两个panel -->
                  <div
                    v-if="currentFile && (isCsvFile || isExcelFile)"
                    class="params-section-split"
                    :style="paramsSectionStyle"
                  >
                    <!-- 左侧70%：参数设置 -->
                    <div class="params-left-panel">
                      <Form class="centered-form">
                        <FormField
                          :label="t('dataAnalysis.headerRowIndex', '表头行数（从0开始）')"
                          name=""
                        >
                          <NumberField
                            v-model="headerRowIndex"
                            :min="0"
                            :max="20"
                            :step="1"
                            style="width: 200px"
                            @update:model-value="handleHeaderRowIndexChange"
                          >
                            <NumberFieldContent>
                              <NumberFieldDecrement />
                              <NumberFieldInput />
                              <NumberFieldIncrement />
                            </NumberFieldContent>
                          </NumberField>
                          <div class="header-row-hint" :style="hintStyle">
                            {{
                              t(
                                'dataAnalysis.headerRowHint',
                                `默认值：自动检测（当前猜测：第 ${detectedHeaderRowIndex + 1} 行）`
                              )
                            }}
                          </div>
                        </FormField>

                        <FormField :label="t('dataAnalysis.autoGroupBy', '自动聚合分析')" name="">
                          <Switch
                            :checked="analysisParams.autoGroupBy"
                            @update:checked="analysisParams.autoGroupBy = $event"
                          />
                        </FormField>

                        <FormField :label="t('dataAnalysis.generateReport', '生成AI报告')" name="">
                          <Switch
                            :checked="analysisParams.generateReport"
                            @update:checked="analysisParams.generateReport = $event"
                          />
                        </FormField>

                        <FormField
                          v-if="analysisParams.generateReport"
                          :label="t('dataAnalysis.analysisRequest', '分析需求（可选）')"
                          name=""
                        >
                          <Textarea
                            v-model="analysisParams.analysisRequest"
                            :rows="2"
                            :placeholder="
                              t('dataAnalysis.analysisRequestPlaceholder', '描述您的分析需求...')
                            "
                            class="w-full"
                          />
                        </FormField>
                      </Form>
                    </div>

                    <!-- 右侧30%：当前表头显示 -->
                    <div class="params-right-panel" :style="paramsRightPanelStyle">
                      <div class="header-preview-title" :style="headerPreviewTitleStyle">
                        {{ t('dataAnalysis.currentHeader', '当前表头') }}
                      </div>
                      <ScrollArea class="header-preview-scrollbar" v-if="headerPreview.length > 0">
                        <div class="header-preview-content">
                          <Badge
                            v-for="(header, index) in headerPreview"
                            :key="index"
                            size="small"
                            effect="plain"
                            class="header-tag"
                            :style="headerTagStyle"
                          >
                            {{
                              header || t('dataAnalysis.column', '列{index}', { index: index + 1 })
                            }}
                          </Badge>
                        </div>
                      </ScrollArea>
                      <div v-else class="no-header-preview" :style="noHeaderPreviewStyle">
                        {{ t('dataAnalysis.noHeaderPreview', '暂无表头数据') }}
                      </div>
                    </div>
                  </div>

                  <!-- 数据预览表格 -->
                  <div
                    v-if="currentFile && previewData.length > 0"
                    class="preview-table-container"
                    ref="tableContainerRef"
                  >
                    <DataTable
                      ref="dataTableRef"
                      :data="previewData"
                      :read-only="true"
                      :row-headers="true"
                      :col-headers="true"
                      :auto-column-size="true"
                      :manual-column-resize="true"
                      :stretch-h="'none'"
                      table-class="preview-table"
                      @selection-changed="handleSelectionChanged"
                    />
                  </div>

                  <div v-else-if="currentFile" class="no-preview-data" :style="noPreviewDataStyle">
                    {{ t('dataAnalysis.loadingPreview', '正在加载数据预览...') }}
                  </div>

                  <div v-else class="no-file-hint" :style="noFileHintStyle">
                    {{ t('dataAnalysis.uploadFileFirst', '请先上传数据文件') }}
                  </div>

                  <!-- 分析按钮（固定在底部） -->
                  <div
                    v-if="currentFile"
                    class="analyze-button-container"
                    :style="analyzeButtonContainerStyle"
                  >
                    <div class="analyze-button-row">
                      <Button
                        type="primary"
                        size="large"
                        :loading="analyzing"
                        :disabled="!currentFile"
                        @click="handleAnalyze"
                      >
                        {{
                          analyzing
                            ? t('dataAnalysis.analyzing', '分析中...')
                            : t('dataAnalysis.analyze', '开始分析')
                        }}
                      </Button>
                      <span
                        v-if="selectedRowCount > 0"
                        class="selection-hint"
                        :style="selectionHintStyle"
                      >
                        {{
                          t(
                            'dataAnalysis.selectedRowsHint',
                            `已选中 ${selectedRowCount} 行，将仅分析选中数据`,
                            { count: selectedRowCount }
                          )
                        }}
                      </span>
                      <span
                        v-else-if="previewData.length > 1"
                        class="selection-hint selection-hint-dim"
                        :style="selectionHintDimStyle"
                      >
                        {{
                          t(
                            'dataAnalysis.noSelectionHint',
                            '提示：可在表格中勾选行来仅分析部分数据'
                          )
                        }}
                      </span>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <!-- Tab 2: 分析结果 -->
              <TabsContent value="result">
                <ScrollArea class="result-tab-scrollbar">
                  <div class="result-tab-content" :style="resultTabContentStyle">
                    <!-- 分析状态显示（仅在非报告流式生成阶段显示） -->
                    <div
                      v-if="(analyzing || analysisStage) && !isReportStreaming"
                      class="analysis-status"
                      :style="analysisStatusStyle"
                    >
                      <el-icon class="is-loading"><Loading /></el-icon>
                      <span>{{ getStageMessage() }}</span>
                    </div>

                    <!-- 分析结果展示 -->
                    <div v-if="analysisResult" class="result-content">
                      <DataAnalysisResultDisplay :result="analysisResult" />
                    </div>

                    <!-- AI报告 -->
                    <div
                      v-if="analysisResult || reportMarkdown || isReportStreaming"
                      class="report-section"
                      :style="reportSectionStyle"
                    >
                      <div class="report-header" :style="reportHeaderStyle">
                        <h3>{{ t('dataAnalysis.tabs.report', '分析报告') }}</h3>
                      </div>
                      <!-- 流式输出显示 -->
                      <StreamingContentDisplay
                        v-if="isReportStreaming"
                        :content-ref="reportStreamingRefWrapper"
                        :done="reportStreamingDoneValue"
                        :style="{ marginBottom: '16px' }"
                      />
                      <div
                        v-else-if="reportMarkdown"
                        ref="reportContainerRef"
                        class="report-markdown-container"
                        :style="reportContainerStyle"
                      ></div>
                      <div v-else class="no-report" :style="noReportStyle">
                        {{ t('dataAnalysis.noReport', '暂无分析报告') }}
                      </div>
                    </div>

                    <!-- 空状态 -->
                    <div
                      v-if="!analyzing && !analysisResult && !reportMarkdown"
                      class="empty-result"
                      :style="emptyResultStyle"
                    >
                      {{
                        t(
                          'dataAnalysis.noAnalysisResult',
                          '暂无分析结果，请在"数据预览"标签页中开始分析'
                        )
                      }}
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </SessionList>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { notifySuccess, notifyError, notifyWarning } from '@renderer/utils/notify'

// Demo mode support
const props = defineProps({
  mode: {
    type: String,
    default: 'normal'
  }
})
const isDemo = computed(() => props.mode === 'demo')
import { UploadFilled, Delete, Document, Loading } from '@element-plus/icons-vue'
import { Button } from '@renderer/components/ui/button'
import { Form, FormField } from '@renderer/components/ui/form'
import {
  NumberField,
  NumberFieldInput,
  NumberFieldIncrement,
  NumberFieldDecrement,
  NumberFieldContent
} from '@renderer/components/ui/number-field'
import { Textarea } from '@renderer/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { LoadingOverlay } from '@renderer/components/ui/loading-overlay'
import SessionList from '../components/common/SessionList.vue'
import DataTable from '../components/common/DataTable.vue'
import type { SessionListItem } from '../components/common/SessionList.vue'
import { dataAnalysisSessionsDb, type DataAnalysisSession } from '../utils/db/tool-sessions-db'
import { dataAnalysisToolCallback } from '../utils/agent-tools/data-analysis-tool'
import DataAnalysisResultDisplay from '../components/data-analysis/DataAnalysisResultDisplay.vue'
import { themeState } from '../utils/themes'
import { renderMarkdownPreview } from '../utils/md-utils'
import { parseCSV } from '../utils/agent-tools/data-analysis-tool'
import StreamingContentDisplay from '../components/common/StreamingContentDisplay.vue'
import type { Ref } from 'vue'
import { useWorkspace } from '../stores/workspace'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Switch } from '@renderer/components/ui/switch'
import { Upload } from '@renderer/components/ui/upload'
import { Badge } from '@renderer/components/ui/badge'

const { t } = useI18n()
const workspace = useWorkspace()

const ourTabId = computed(
  () =>
    workspace.tabs.find((tab) => tab.kind === 'tool' && tab.route === '/data-analysis')?.id ?? null
)

const sessions = ref<SessionListItem[]>([])
const activeSessionId = ref<string | null>(null)
const activeSessionData = ref<DataAnalysisSession | null>(null)
const activeSession = computed(() => {
  if (!activeSessionId.value) return null
  if (activeSessionData.value && activeSessionData.value.id === activeSessionId.value) {
    return activeSessionData.value
  }
  return sessions.value.find((s) => s.id === activeSessionId.value) as any
})

const currentFile = ref<{ name: string; path: string } | null>(null)
const analyzing = ref(false)
const loadingSession = ref(false)
const analysisStage = ref<string>('')
const analysisResult = ref<any>(null)
const reportMarkdown = ref<string>('')

// 报告流式显示相关的refs
const reportStreamingRef = ref<string>('')
const reportStreamingDonePromise = ref<Promise<any> | null | undefined>(null)
const isReportStreaming = computed(
  () => reportStreamingDonePromise.value !== null && reportStreamingDonePromise.value !== undefined
)
const reportStreamingDoneValue = computed(() => reportStreamingDonePromise.value || undefined)
const reportStreamingRefWrapper = computed(() => reportStreamingRef)
const activeTab = ref('preview')
const headerRowIndex = ref<number | undefined>(undefined)
const detectedHeaderRowIndex = ref<number>(0)
const headerPreview = ref<string[]>([])
const reportContainerRef = ref<HTMLElement | null>(null)
const dataTableRef = ref<InstanceType<typeof DataTable> | null>(null)
const tableContainerRef = ref<HTMLElement | null>(null)
const previewData = ref<any[][]>([])

// 选中行数
const selectedRowCount = ref(0)

// 分析参数
const analysisParams = ref({
  autoGroupBy: true,
  generateReport: true,
  analysisRequest: ''
})

// 报告渲染防抖
let reportRenderTimer: ReturnType<typeof setTimeout> | null = null
let lastReportRenderTime = 0
const REPORT_DEBOUNCE_MS = 3000

// 加载会话列表
const loadSessions = async () => {
  try {
    const dbSessions = await dataAnalysisSessionsDb.getAll()
    sessions.value = dbSessions.map((s) => ({
      id: s.id,
      title: s.title,
      updatedAt: s.updated_at
    }))
  } catch (error) {
    notifyError(
      t('dataAnalysis.loadSessionsFailed', '加载会话列表失败') +
        ': ' +
        (error instanceof Error ? error.message : String(error))
    )
  }
}

// 创建新会话
const handleCreateSession = async () => {
  try {
    const id = `data-analysis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const title = t('dataAnalysis.defaultTitle', '新数据分析会话')

    const newSession: Omit<DataAnalysisSession, 'created_at' | 'updated_at'> = {
      id,
      title,
      description: '',
      data_file_path: undefined,
      data_format: undefined,
      header_row_index: undefined,
      analysis_result: undefined,
      report_markdown: undefined,
      analysis_request: undefined,
      auto_group_by: undefined,
      generate_report: undefined
    }

    await dataAnalysisSessionsDb.create(newSession)

    await loadSessions()
    activeSessionId.value = id
    const tid = ourTabId.value
    if (tid) workspace.setTabToolState(tid, { activeSessionId: id })
    activeSessionData.value = {
      ...newSession,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    currentFile.value = null
    analysisResult.value = null
    reportMarkdown.value = ''
    previewData.value = []
    selectedRowCount.value = 0
    analysisParams.value = {
      autoGroupBy: true,
      generateReport: true,
      analysisRequest: ''
    }
  } catch (error) {
    notifyError(
      t('dataAnalysis.createSessionFailed', '创建会话失败') +
        ': ' +
        (error instanceof Error ? error.message : String(error))
    )
  }
}

// 选择会话
const handleSelectSession = async (item: SessionListItem) => {
  // 如果正在加载，忽略新的切换请求
  if (loadingSession.value) {
    return
  }

  loadingSession.value = true

  try {
    // 在切换会话前，先保存当前会话的参数（如果有未保存的更改）
    if (activeSessionId.value && analysisParamsSaveTimer) {
      // 清除防抖定时器
      clearTimeout(analysisParamsSaveTimer)
      analysisParamsSaveTimer = null
      // 立即保存当前会话的参数
      await saveAnalysisParamsImmediately(activeSessionId.value)
      pendingSessionId = null
    }

    activeSessionId.value = item.id
    const tid = ourTabId.value
    if (tid) workspace.setTabToolState(tid, { activeSessionId: item.id })
    selectedRowCount.value = 0
    const session = await dataAnalysisSessionsDb.getById(item.id)
    if (session) {
      activeSessionData.value = session

      if (session.analysis_result) {
        analysisResult.value = JSON.parse(session.analysis_result)
      } else {
        analysisResult.value = null
      }
      if (session.report_markdown) {
        reportMarkdown.value = session.report_markdown
      } else {
        reportMarkdown.value = ''
      }
      if (session.data_file_path) {
        currentFile.value = {
          name:
            session.data_file_path.split(/[/\\]/).pop() ||
            t('dataAnalysis.unknownFile', '未知文件'),
          path: session.data_file_path
        }
        // 加载预览数据
        await loadPreviewData()

        // 如果是CSV或Excel文件，处理表头行数
        if (session.data_format === 'csv') {
          if (session.header_row_index !== undefined && session.header_row_index !== null) {
            headerRowIndex.value = session.header_row_index
            detectedHeaderRowIndex.value = session.header_row_index
            await updateHeaderPreview()
          } else {
            await detectCsvHeaderRow(session.data_file_path)
            if (headerRowIndex.value !== undefined) {
              await dataAnalysisSessionsDb.update(item.id, {
                header_row_index: headerRowIndex.value
              })
            }
          }
        } else if (session.data_format === 'xlsx' || session.data_format === 'xls') {
          if (session.header_row_index !== undefined && session.header_row_index !== null) {
            headerRowIndex.value = session.header_row_index
            detectedHeaderRowIndex.value = session.header_row_index
            await updateHeaderPreview()
          } else {
            await detectExcelHeaderRow(session.data_file_path)
            if (headerRowIndex.value !== undefined) {
              await dataAnalysisSessionsDb.update(item.id, {
                header_row_index: headerRowIndex.value
              })
            }
          }
        } else {
          headerRowIndex.value = undefined
          detectedHeaderRowIndex.value = 0
          headerPreview.value = []
        }
      } else {
        currentFile.value = null
        headerRowIndex.value = undefined
        detectedHeaderRowIndex.value = 0
        headerPreview.value = []
        previewData.value = []
        selectedRowCount.value = 0
      }

      // 加载分析参数（数据库存储为0/1，需要转换为boolean）
      analysisParams.value = {
        autoGroupBy:
          session.auto_group_by !== undefined && session.auto_group_by !== null
            ? session.auto_group_by === 1
            : true,
        generateReport:
          session.generate_report !== undefined && session.generate_report !== null
            ? session.generate_report === 1
            : true,
        analysisRequest: session.analysis_request || ''
      }
    }
  } catch (error) {
    notifyError(
      t('dataAnalysis.loadSessionFailed', '加载会话失败') +
        ': ' +
        (error instanceof Error ? error.message : String(error))
    )
  } finally {
    loadingSession.value = false
  }
}

// 重命名会话
const handleRenameSession = async (item: SessionListItem, newTitle: string) => {
  try {
    await dataAnalysisSessionsDb.update(item.id, { title: newTitle })
    await loadSessions()
  } catch (error) {
    notifyError(
      t('dataAnalysis.renameFailed', '重命名失败') +
        ': ' +
        (error instanceof Error ? error.message : String(error))
    )
  }
}

// 复制会话
const handleDuplicateSession = async (item: SessionListItem) => {
  try {
    const session = await dataAnalysisSessionsDb.getById(item.id)
    if (!session) return

    const id = `data-analysis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    await dataAnalysisSessionsDb.create({
      id,
      title: session.title + t('dataAnalysis.copySuffix', ' (副本)'),
      description: session.description,
      data_file_path: session.data_file_path,
      data_format: session.data_format,
      header_row_index: session.header_row_index,
      analysis_result: session.analysis_result,
      report_markdown: session.report_markdown,
      analysis_request: session.analysis_request,
      auto_group_by: session.auto_group_by,
      generate_report: session.generate_report
    })

    await loadSessions()
    notifySuccess(t('common.duplicateSuccess', '复制成功'))
  } catch (error) {
    notifyError(
      t('dataAnalysis.duplicateFailed', '复制失败') +
        ': ' +
        (error instanceof Error ? error.message : String(error))
    )
  }
}

// 删除会话
const handleDeleteSession = async (item: SessionListItem) => {
  try {
    await dataAnalysisSessionsDb.delete(item.id)
    await loadSessions()
    if (activeSessionId.value === item.id) {
      activeSessionId.value = null
      activeSessionData.value = null
      analysisResult.value = null
      reportMarkdown.value = ''
      currentFile.value = null
      previewData.value = []
      selectedRowCount.value = 0
      analysisParams.value = {
        autoGroupBy: true,
        generateReport: true,
        analysisRequest: ''
      }
    }
    notifySuccess(t('common.deleteSuccess', '删除成功'))
  } catch (error) {
    notifyError(
      t('dataAnalysis.deleteFailed', '删除失败') +
        ': ' +
        (error instanceof Error ? error.message : String(error))
    )
  }
}

// 加载预览数据
const loadPreviewData = async () => {
  if (!activeSessionData.value?.data_file_path) {
    previewData.value = []
    return
  }

  try {
    const messageBridge = (await import('../bridge/message-bridge')).default
    if (!messageBridge.getIpc()) return

    const filePath = activeSessionData.value.data_file_path
    const format = activeSessionData.value.data_format || 'csv'
    const finalHeaderRowIndex = headerRowIndex.value !== undefined ? headerRowIndex.value : 0

    if (format === 'csv') {
      const content = (await messageBridge.invoke('read-file-content', filePath)) as string
      if (!content) {
        console.error('CSV文件不存在或无法读取:', filePath)
        previewData.value = []
        return
      }
      const lines = content
        .trim()
        .split('\n')
        .filter((line) => line.trim())

      if (lines.length === 0) {
        previewData.value = []
        return
      }

      // 检测分隔符
      const detectDelimiter = (line: string): string => {
        const tabColumns = line.split('\t')
        const commaColumns = line.split(',')
        return tabColumns.length >= 3 && tabColumns.length > commaColumns.length ? '\t' : ','
      }

      const delimiter = detectDelimiter(lines[Math.min(finalHeaderRowIndex, lines.length - 1)])

      // 从表头行开始显示所有数据（包括表头行本身）
      const previewRows: any[][] = []
      // 首先添加表头行
      const headerLine = lines[finalHeaderRowIndex]
      const headerData = headerLine.split(delimiter).map((c) => c.trim())
      previewRows.push(headerData)

      // 然后添加数据行（从表头行的下一行开始）
      for (let i = finalHeaderRowIndex + 1; i < lines.length; i++) {
        const rowData = lines[i].split(delimiter).map((c) => c.trim())
        previewRows.push(rowData)

        // 限制预览行数（避免性能问题）
        if (previewRows.length >= 1000) break
      }

      previewData.value = previewRows
    } else if (format === 'xlsx' || format === 'xls') {
      // 检查文件是否存在
      const fileExists = (await messageBridge.invoke('file-exists', filePath)) as boolean
      if (!fileExists) {
        console.error(
          'Excel文件不存在:',
          filePath,
          '文件可能已被删除或移动到其他位置，请重新上传文件'
        )
        previewData.value = []
        return
      }

      const excelText = (await messageBridge.invoke('convert-excel-to-text', filePath)) as string
      const lines = excelText.split('\n').filter((line) => line.trim())

      let dataStartIndex = -1
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('工作表')) {
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].match(/^行 \d+:/)) {
              dataStartIndex = j
              break
            }
          }
          break
        }
      }

      if (dataStartIndex === -1) {
        previewData.value = []
        return
      }

      // 从表头行开始显示所有数据（包括表头行本身）
      const previewRows: any[][] = []
      let dataRowIndex = 0

      // 首先找到并添加表头行
      let headerRowData: string[] | null = null
      for (let i = dataStartIndex; i < lines.length; i++) {
        const rowMatch = lines[i].match(/^行 \d+:\s*(.+)$/)
        if (!rowMatch) continue

        if (dataRowIndex === finalHeaderRowIndex) {
          headerRowData = rowMatch[1].split('\t').map((c) => c.trim())
          previewRows.push(headerRowData)
          dataRowIndex++
          continue
        }

        // 只显示表头行之后的数据
        if (dataRowIndex > finalHeaderRowIndex) {
          const rowData = rowMatch[1].split('\t').map((c) => c.trim())
          previewRows.push(rowData)
        }

        dataRowIndex++

        // 限制预览行数（避免性能问题）
        if (previewRows.length >= 1000) break
      }

      previewData.value = previewRows
    } else {
      previewData.value = []
    }
  } catch (error) {
    console.error('加载预览数据失败:', error)
    previewData.value = []
  }
}

// 预览表头（CSV）
const previewCsvHeader = async (filePath: string, rowIndex: number) => {
  try {
    const messageBridge = (await import('../bridge/message-bridge')).default
    if (!messageBridge.getIpc()) return []

    const content = (await messageBridge.invoke('read-file-content', filePath)) as string
    const lines = content
      .trim()
      .split('\n')
      .filter((line) => line.trim())
    if (lines.length === 0 || rowIndex >= lines.length) return []

    const headerLine = lines[rowIndex]
    const columns = headerLine.includes('\t') ? headerLine.split('\t') : headerLine.split(',')
    return columns.map((c) => c.trim())
  } catch (error) {
    console.error('预览CSV表头失败:', error)
    return []
  }
}

// 预览表头（Excel）
const previewExcelHeader = async (filePath: string, rowIndex: number) => {
  try {
    const messageBridge = (await import('../bridge/message-bridge')).default
    if (!messageBridge.getIpc()) return []

    // 检查文件是否存在
    const fileExists = (await messageBridge.invoke('file-exists', filePath)) as boolean
    if (!fileExists) {
      console.error(
        'Excel文件不存在:',
        filePath,
        '文件可能已被删除或移动到其他位置，请重新上传文件'
      )
      return []
    }

    const excelText = (await messageBridge.invoke('convert-excel-to-text', filePath)) as string
    const lines = excelText.split('\n').filter((line) => line.trim())

    let dataStartIndex = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('工作表')) {
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].match(/^行 \d+:/)) {
            dataStartIndex = j
            break
          }
        }
        break
      }
    }

    if (dataStartIndex === -1) return []

    const targetLineIndex = dataStartIndex + rowIndex
    if (targetLineIndex >= lines.length) return []

    const targetLine = lines[targetLineIndex]
    const rowMatch = targetLine.match(/^行 \d+:\s*(.+)$/)
    if (!rowMatch) return []

    const rowData = rowMatch[1].split('\t')
    return rowData.map((c) => c.trim())
  } catch (error) {
    console.error('预览Excel表头失败:', error)
    // 如果错误信息包含文件不存在的提示，记录更详细的日志
    if (error instanceof Error && error.message.includes('文件不存在')) {
      console.error('文件不存在，请重新上传文件')
    }
    return []
  }
}

// 更新表头预览
const updateHeaderPreview = async () => {
  if (!activeSessionData.value?.data_file_path || headerRowIndex.value === undefined) {
    headerPreview.value = []
    return
  }

  const filePath = activeSessionData.value.data_file_path
  const format = activeSessionData.value.data_format || 'csv'

  if (format === 'csv') {
    headerPreview.value = await previewCsvHeader(filePath, headerRowIndex.value)
  } else if (format === 'xlsx' || format === 'xls') {
    headerPreview.value = await previewExcelHeader(filePath, headerRowIndex.value)
  } else {
    headerPreview.value = []
  }

  // 重新加载预览数据
  await loadPreviewData()
}

// 表头行数变化处理
const handleHeaderRowIndexChange = async () => {
  // 先更新表头预览
  await updateHeaderPreview()
  // 然后更新预览数据（使用新的表头行数）
  await loadPreviewData()
  // 最后保存到数据库
  if (activeSessionId.value && headerRowIndex.value !== undefined) {
    await dataAnalysisSessionsDb.update(activeSessionId.value, {
      header_row_index: headerRowIndex.value
    })
    if (activeSessionData.value) {
      activeSessionData.value.header_row_index = headerRowIndex.value
    }
  }
  // 强制更新表格
  await nextTick()
  if (dataTableRef.value) {
    dataTableRef.value.render()
  }
}

// 检测CSV表头行数
const detectCsvHeaderRow = async (filePath: string) => {
  try {
    const messageBridge = (await import('../bridge/message-bridge')).default
    if (!messageBridge.getIpc()) return

    const content = (await messageBridge.invoke('read-file-content', filePath)) as string
    const lines = content
      .trim()
      .split('\n')
      .filter((line) => line.trim())
    if (lines.length === 0) return

    let bestIndex = 0
    let bestScore = -1

    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const line = lines[i]
      const columns = line.includes('\t') ? line.split('\t') : line.split(',')
      if (columns.length < 3) continue

      let consistentCount = 0
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const nextLine = lines[j]
        const nextColumns = nextLine.includes('\t') ? nextLine.split('\t') : nextLine.split(',')
        if (nextColumns.length === columns.length) {
          consistentCount++
        }
      }

      const score = consistentCount * 10 + columns.length
      if (score > bestScore) {
        bestScore = score
        bestIndex = i
      }
    }

    detectedHeaderRowIndex.value = bestIndex
    headerRowIndex.value = bestIndex
    await updateHeaderPreview()
  } catch (error) {
    console.error('检测表头行数失败:', error)
    // 如果错误信息包含文件不存在的提示，记录更详细的日志
    if (error instanceof Error && error.message.includes('文件不存在')) {
      console.error('文件不存在，请重新上传文件')
    }
    detectedHeaderRowIndex.value = 0
    headerRowIndex.value = 0
    headerPreview.value = []
  }
}

// 检测Excel表头行数
const detectExcelHeaderRow = async (filePath: string) => {
  try {
    const messageBridge = (await import('../bridge/message-bridge')).default
    if (!messageBridge.getIpc()) return

    // 检查文件是否存在
    const fileExists = (await messageBridge.invoke('file-exists', filePath)) as boolean
    if (!fileExists) {
      console.error(
        'Excel文件不存在:',
        filePath,
        '文件可能已被删除或移动到其他位置，请重新上传文件'
      )
      detectedHeaderRowIndex.value = 0
      headerRowIndex.value = 0
      return
    }

    const excelText = (await messageBridge.invoke('convert-excel-to-text', filePath)) as string
    const lines = excelText.split('\n').filter((line) => line.trim())

    let dataStartIndex = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('工作表')) {
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].match(/^行 \d+:/)) {
            dataStartIndex = j
            break
          }
        }
        break
      }
    }

    if (dataStartIndex === -1) {
      detectedHeaderRowIndex.value = 0
      headerRowIndex.value = 0
      return
    }

    let bestIndex = 0
    let bestScore = -1

    for (let i = 0; i < Math.min(10, lines.length - dataStartIndex); i++) {
      const lineIndex = dataStartIndex + i
      if (lineIndex >= lines.length) break

      const line = lines[lineIndex]
      const rowMatch = line.match(/^行 \d+:\s*(.+)$/)
      if (!rowMatch) continue

      const columns = rowMatch[1].split('\t')
      if (columns.length < 3) continue

      let consistentCount = 0
      for (let j = i + 1; j < Math.min(i + 5, lines.length - dataStartIndex); j++) {
        const nextLineIndex = dataStartIndex + j
        if (nextLineIndex >= lines.length) break

        const nextLine = lines[nextLineIndex]
        const nextRowMatch = nextLine.match(/^行 \d+:\s*(.+)$/)
        if (!nextRowMatch) continue

        const nextColumns = nextRowMatch[1].split('\t')
        if (nextColumns.length === columns.length) {
          consistentCount++
        }
      }

      const score = consistentCount * 10 + columns.length
      if (score > bestScore) {
        bestScore = score
        bestIndex = i
      }
    }

    detectedHeaderRowIndex.value = bestIndex
    headerRowIndex.value = bestIndex
    await updateHeaderPreview()
  } catch (error) {
    console.error('检测Excel表头行数失败:', error)
    detectedHeaderRowIndex.value = 0
    headerRowIndex.value = 0
    headerPreview.value = []
  }
}

// 文件变化
const handleFileChange = async (file: any) => {
  if (!activeSessionId.value) {
    await handleCreateSession()
  }

  try {
    let filePath: string

    if (file.raw) {
      const fileContent = await file.raw.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(fileContent)))

      const messageBridge = (await import('../bridge/message-bridge')).default
      if (!messageBridge.getIpc()) {
        throw new Error(t('dataAnalysis.ipcNotAvailable', 'IPC渲染器不可用'))
      }

      filePath = (await messageBridge.invoke('save-reference-file', {
        filename: file.name,
        content: base64
      })) as string
    } else {
      filePath = file.url || file.path
    }

    if (activeSessionId.value && filePath) {
      const format = file.name.split('.').pop()?.toLowerCase() || 'csv'

      // 检查是否是首次上传（会话之前没有文件）
      const isFirstUpload = !activeSessionData.value?.data_file_path

      // 如果是首次上传，更新会话名称为文件名（截断处理）
      let updateData: any = {
        data_file_path: filePath,
        data_format: format === 'xlsx' || format === 'xls' ? format : format
      }

      if (isFirstUpload) {
        // 提取文件名（去掉扩展名）
        const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '')
        // 截断文件名（最大50个字符）
        const maxLength = 50
        const truncatedFileName =
          fileNameWithoutExt.length > maxLength
            ? fileNameWithoutExt.substring(0, maxLength) + '...'
            : fileNameWithoutExt
        updateData.title = truncatedFileName
      }

      await dataAnalysisSessionsDb.update(activeSessionId.value, updateData)

      if (activeSessionData.value) {
        activeSessionData.value.data_file_path = filePath
        activeSessionData.value.data_format = format
        if (isFirstUpload) {
          activeSessionData.value.title = updateData.title
        }
      }

      // 如果是首次上传，更新会话列表中的标题
      if (isFirstUpload) {
        await loadSessions()
      }

      currentFile.value = {
        name: file.name,
        path: filePath
      }

      // 如果是CSV或Excel文件，检测表头行数
      if (format === 'csv') {
        await detectCsvHeaderRow(filePath)
        if (headerRowIndex.value !== undefined) {
          await dataAnalysisSessionsDb.update(activeSessionId.value, {
            header_row_index: headerRowIndex.value
          })
        }
      } else if (format === 'xlsx' || format === 'xls') {
        await detectExcelHeaderRow(filePath)
        if (headerRowIndex.value !== undefined) {
          await dataAnalysisSessionsDb.update(activeSessionId.value, {
            header_row_index: headerRowIndex.value
          })
        }
      } else {
        headerRowIndex.value = undefined
        detectedHeaderRowIndex.value = 0
        headerPreview.value = []
        await dataAnalysisSessionsDb.update(activeSessionId.value, {
          header_row_index: undefined
        })
      }

      // 加载预览数据
      await loadPreviewData()
    }
  } catch (error) {
    notifyError(
      t('dataAnalysis.saveFileFailed', '保存文件信息失败') +
        ': ' +
        (error instanceof Error ? error.message : String(error))
    )
  }
}

const handleFileRemove = async () => {
  if (activeSessionId.value) {
    await dataAnalysisSessionsDb.update(activeSessionId.value, {
      data_file_path: undefined,
      data_format: undefined,
      header_row_index: undefined
    })
    currentFile.value = null
    headerRowIndex.value = undefined
    detectedHeaderRowIndex.value = 0
    headerPreview.value = []
    previewData.value = []
    selectedRowCount.value = 0
    analysisResult.value = null
    reportMarkdown.value = ''

    if (activeSessionData.value) {
      activeSessionData.value.data_file_path = undefined
      activeSessionData.value.data_format = undefined
      activeSessionData.value.header_row_index = undefined
    }
  }
}

// 选择变化事件处理
const handleSelectionChanged = (count: number) => {
  selectedRowCount.value = count
}

// 将选中行数据转换为CSV字符串
const convertSelectedRowsToCsv = (): string | null => {
  if (!dataTableRef.value) return null

  const selectedData = dataTableRef.value.getSelectedRowsData()
  if (!selectedData || selectedData.length <= 1) return null // 仅有表头行或无数据

  // 将二维数组转为CSV字符串
  const csvLines = selectedData.map((row) =>
    row
      .map((cell: any) => {
        const str = String(cell ?? '')
        // 如果包含逗号、换行、双引号，需要用双引号包裹
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      })
      .join(',')
  )

  return csvLines.join('\n')
}

// 执行分析
const handleAnalyze = async () => {
  if (!activeSessionId.value) {
    notifyWarning(t('dataAnalysis.noSession', '请先选择或创建会话'))
    return
  }

  if (!activeSessionData.value) {
    const session = await dataAnalysisSessionsDb.getById(activeSessionId.value)
    if (!session) {
      notifyWarning(t('dataAnalysis.noSession', '会话不存在'))
      return
    }
    activeSessionData.value = session
  }

  if (!activeSessionData.value.data_file_path) {
    notifyWarning(t('dataAnalysis.noFile', '请先上传数据文件'))
    return
  }

  analyzing.value = true
  analysisStage.value = 'loading'
  analysisResult.value = null
  reportMarkdown.value = ''

  // 切换到结果标签页
  activeTab.value = 'result'

  try {
    const session = activeSessionData.value

    // 清空流式显示状态
    reportStreamingRef.value = ''
    reportStreamingDonePromise.value = null

    // 创建进度更新回调
    const onProgress = (data: any, progress?: any) => {
      if (progress?.message) {
        analysisStage.value = t(progress.message, progress.params || {})
      }

      // 检查是否是报告流式输出更新
      if (data?.content?.stage === 'summarizing-streaming') {
        const content = data.content as any
        if (content.reportTargetRef && content.reportDonePromise) {
          // 设置流式显示
          reportStreamingRef.value = ''
          reportStreamingDonePromise.value = content.reportDonePromise

          // 同步targetRef到reportStreamingRef
          const syncWatcher = watch(
            () => content.reportTargetRef.value,
            (newValue) => {
              reportStreamingRef.value = newValue || ''
            },
            { immediate: true }
          )

          // 当done完成时，清理（取消时也保留已生成的内容）
          content.reportDonePromise
            .then(() => {
              syncWatcher()
              reportStreamingDonePromise.value = null
            })
            .catch((error: any) => {
              // 如果是取消错误，保留已生成的内容，当作完成处理
              const isCancelled =
                error instanceof Error &&
                (error.message === '任务已取消' ||
                  error.message.includes('任务已取消') ||
                  error.name === 'AbortError')

              // 无论是否取消，都清理流式显示状态
              syncWatcher()
              reportStreamingDonePromise.value = null

              // 取消时保留内容，继续处理后续逻辑（不需要抛出错误）
            })
        }
      }
    }

    // 检查是否有选中的行
    const selectedCsv = convertSelectedRowsToCsv()
    const hasSelectedRows = selectedCsv !== null

    // 调用数据分析工具
    const abortController = new AbortController()
    const result = await dataAnalysisToolCallback(
      hasSelectedRows
        ? {
            // 使用选中行的数据（内联CSV），表头行固定为第0行
            data: selectedCsv,
            format: 'csv',
            dataSource: 'inline',
            headerRowIndex: 0,
            autoGroupBy: analysisParams.value.autoGroupBy,
            generateReport: analysisParams.value.generateReport === true,
            analysisRequest: analysisParams.value.analysisRequest || undefined
          }
        : {
            // 使用完整文件
            data: session.data_file_path!,
            format: session.data_format || 'csv',
            dataSource: 'file',
            headerRowIndex: isCsvFile.value || isExcelFile.value ? headerRowIndex.value : undefined,
            autoGroupBy: analysisParams.value.autoGroupBy,
            generateReport: analysisParams.value.generateReport === true,
            analysisRequest: analysisParams.value.analysisRequest || undefined
          },
      abortController.signal,
      onProgress
    )

    if (result.status === 'succeeded' && result.result) {
      const analysisResultData = result.result as any
      analysisResult.value = analysisResultData
      analysisStage.value = ''

      // 从tool返回的结果中获取报告内容
      if (analysisResultData.reportMarkdown) {
        reportMarkdown.value = analysisResultData.reportMarkdown
        // 确保最终渲染
        await nextTick()
        await renderReport()
      } else {
        reportMarkdown.value = ''
      }

      // 保存分析结果（包括报告）
      await dataAnalysisSessionsDb.update(activeSessionId.value, {
        analysis_result: JSON.stringify(analysisResultData),
        report_markdown: analysisResultData.reportMarkdown || undefined
      })

      if (activeSessionData.value) {
        activeSessionData.value.analysis_result = JSON.stringify(analysisResultData)
        activeSessionData.value.report_markdown = analysisResultData.reportMarkdown || undefined
      }

      notifySuccess(t('dataAnalysis.analyzeSuccess', '分析完成'))
    } else {
      // 清理流式显示
      reportStreamingDonePromise.value = null
      notifyError(result.error || t('dataAnalysis.analyzeFailed', '分析失败'))
      analysisStage.value = ''
    }
  } catch (error) {
    // 清理流式显示
    reportStreamingDonePromise.value = null
    notifyError(
      t('dataAnalysis.analyzeFailed', '分析失败') +
        ': ' +
        (error instanceof Error ? error.message : String(error))
    )
    analysisStage.value = ''
  } finally {
    analyzing.value = false
  }
}

// 获取阶段消息
const getStageMessage = () => {
  if (analysisStage.value) {
    return analysisStage.value
  }
  if (analyzing.value) {
    return t('dataAnalysis.analyzing', '分析中...')
  }
  return ''
}

// 防抖渲染报告
const debouncedRenderReport = () => {
  const now = Date.now()
  const timeSinceLastRender = now - lastReportRenderTime

  if (reportRenderTimer) {
    clearTimeout(reportRenderTimer)
  }

  if (timeSinceLastRender >= REPORT_DEBOUNCE_MS) {
    // 立即渲染
    renderReport()
    lastReportRenderTime = now
  } else {
    // 延迟渲染
    reportRenderTimer = setTimeout(() => {
      renderReport()
      lastReportRenderTime = Date.now()
      reportRenderTimer = null
    }, REPORT_DEBOUNCE_MS - timeSinceLastRender)
  }
}

// 渲染分析报告
const renderReport = async () => {
  if (!reportContainerRef.value || !reportMarkdown.value) {
    return
  }

  const container = reportContainerRef.value as HTMLDivElement

  try {
    // 使用统一的 Markdown 预览渲染函数
    await renderMarkdownPreview(container, reportMarkdown.value)
  } catch (error) {
    console.error('渲染分析报告失败:', error)
    container.innerHTML = `<p style="color: var(--el-color-danger);">渲染失败: ${error instanceof Error ? error.message : String(error)}</p>`
  }
}

// 监听报告内容变化和标签页切换
watch(
  [() => reportMarkdown.value, () => activeTab.value, () => themeState.currentTheme.type],
  () => {
    if (activeTab.value === 'result' && reportMarkdown.value) {
      nextTick(() => {
        debouncedRenderReport()
      })
    }
  },
  { immediate: true }
)

// 监听预览数据变化，更新表格
watch(
  () => previewData.value,
  () => {
    nextTick(() => {
      if (dataTableRef.value) {
        dataTableRef.value.updateData(previewData.value)
        dataTableRef.value.render()
        // 延迟执行自动列宽计算，确保表格已完全渲染
        setTimeout(() => {
          dataTableRef.value?.render()
        }, 200)
      }
    })
  },
  { deep: true }
)

// 监听分析参数变化，自动保存到数据库（防抖）
let analysisParamsSaveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSessionId: string | null = null // 记录待保存的会话ID

// 立即保存分析参数（不防抖）
const saveAnalysisParamsImmediately = async (sessionId: string) => {
  if (!sessionId) return

  try {
    await dataAnalysisSessionsDb.update(sessionId, {
      analysis_request: analysisParams.value.analysisRequest || undefined,
      auto_group_by: analysisParams.value.autoGroupBy ? 1 : 0,
      generate_report: analysisParams.value.generateReport ? 1 : 0
    })
    // 更新本地数据
    if (activeSessionData.value && activeSessionData.value.id === sessionId) {
      activeSessionData.value.analysis_request = analysisParams.value.analysisRequest || undefined
      activeSessionData.value.auto_group_by = analysisParams.value.autoGroupBy ? 1 : 0
      activeSessionData.value.generate_report = analysisParams.value.generateReport ? 1 : 0
    }
  } catch (error) {
    console.error('保存分析参数失败:', error)
  }
}

watch(
  () => analysisParams.value,
  (newParams) => {
    if (!activeSessionId.value) return

    // 记录当前会话ID
    const currentSessionId = activeSessionId.value

    // 清除之前的定时器
    if (analysisParamsSaveTimer) {
      clearTimeout(analysisParamsSaveTimer)
      analysisParamsSaveTimer = null
    }

    // 防抖保存（500ms）
    pendingSessionId = currentSessionId
    analysisParamsSaveTimer = setTimeout(async () => {
      // 检查会话ID是否还是原来的（防止快速切换会话导致保存到错误的会话）
      if (activeSessionId.value === pendingSessionId && pendingSessionId) {
        await saveAnalysisParamsImmediately(pendingSessionId)
      }
      pendingSessionId = null
      analysisParamsSaveTimer = null
    }, 500)
  },
  { deep: true }
)

// 计算属性
const isCsvFile = computed(() => {
  if (!activeSessionData.value?.data_file_path) return false
  const path = activeSessionData.value.data_file_path.toLowerCase()
  return path.endsWith('.csv')
})

const isExcelFile = computed(() => {
  if (!activeSessionData.value?.data_file_path) return false
  const path = activeSessionData.value.data_file_path.toLowerCase()
  return path.endsWith('.xlsx') || path.endsWith('.xls')
})

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
  overflow: 'hidden' as const
}))

const emptyStateStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%'
}))

const fileSectionStyle = computed(() => ({
  padding: '16px',
  borderBottom: `1px solid ${borderColor.value}`,
  flexShrink: 0
}))

const fileListItemStyle = computed(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  color: themeState.currentTheme.textColor
}))

const fileNameStyle = computed(() => ({
  flex: 1,
  color: themeState.currentTheme.textColor
}))

const tipStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.7,
  fontSize: '12px',
  marginTop: '8px'
}))

const tabsStyle = computed(() => ({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden'
}))

const paramsSectionStyle = computed(() => ({
  padding: '16px',
  backgroundColor: themeState.currentTheme.background,
  borderRadius: '8px',
  marginBottom: '16px',
  border: `1px solid ${borderColor.value}`,
  display: 'flex',
  gap: '16px'
}))

const paramsRightPanelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  borderRadius: '8px',
  padding: '16px',
  border: `1px solid ${borderColor.value}`
}))

const headerPreviewTitleStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  fontWeight: 'bold',
  marginBottom: '12px',
  fontSize: '14px'
}))

const hintStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.7,
  fontSize: '12px'
}))

const headerTagStyle = computed(() => ({
  fontFamily: "'JetBrains Mono', 'Consolas', monospace"
}))

const noHeaderPreviewStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.6,
  fontSize: '12px',
  textAlign: 'center' as const,
  padding: '20px'
}))

const previewTableContainerStyle = computed(() => ({
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  marginBottom: '60px' // 为底部按钮留出空间
}))

const noPreviewDataStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.6,
  textAlign: 'center' as const,
  padding: '40px'
}))

const noFileHintStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.6,
  textAlign: 'center' as const,
  padding: '40px',
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
}))

const analyzeButtonContainerStyle = computed(() => ({
  flexShrink: 0,
  padding: '12px 16px',
  marginBottom: '-16px',
  marginLeft: '-16px',
  marginRight: '-16px',
  backgroundColor: themeState.currentTheme.background,
  borderTop: `1px solid ${themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
  display: 'flex',
  justifyContent: 'center' as const,
  zIndex: 10
}))

const resultTabContentStyle = computed(() => ({
  padding: '16px',
  height: '100%',
  overflow: 'auto'
}))

const analysisStatusStyle = computed(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '16px',
  color: themeState.currentTheme.textColor,
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  borderRadius: '8px',
  marginBottom: '16px'
}))

const reportSectionStyle = computed(() => ({
  marginTop: '24px'
}))

const reportHeaderStyle = computed(() => ({
  marginBottom: '16px',
  color: themeState.currentTheme.textColor
}))

const reportContainerStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  padding: '16px',
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  borderRadius: '8px',
  minHeight: '100px'
}))

const noReportStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.6,
  textAlign: 'center' as const,
  padding: '40px'
}))

const selectionHintStyle = computed(() => ({
  color: themeState.currentTheme.type === 'dark' ? '#67c23a' : '#409eff',
  fontSize: '13px',
  fontWeight: '500'
}))

const selectionHintDimStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.45,
  fontSize: '12px'
}))

const emptyResultStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.6,
  textAlign: 'center' as const,
  padding: '40px'
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
      {
        id: 'demo-1',
        title: t('dataAnalysis.salesAnalysis', '销售数据分析'),
        updatedAt: Date.now()
      },
      {
        id: 'demo-2',
        title: t('dataAnalysis.userBehavior', '用户行为分析'),
        updatedAt: Date.now() - 3600000
      }
    ]
    activeSessionId.value = 'demo-1'
    return
  }
  loadSessions()

  if (activeTab.value === 'result' && reportMarkdown.value) {
    nextTick(() => {
      renderReport()
    })
  }
})

onUnmounted(() => {
  // 在组件卸载前，保存当前会话的参数（如果有未保存的更改）
  if (activeSessionId.value && analysisParamsSaveTimer) {
    clearTimeout(analysisParamsSaveTimer)
    analysisParamsSaveTimer = null
    // 立即保存，不等待防抖
    saveAnalysisParamsImmediately(activeSessionId.value)
    pendingSessionId = null
  }

  // 清理定时器
  if (analysisParamsSaveTimer) {
    clearTimeout(analysisParamsSaveTimer)
    analysisParamsSaveTimer = null
  }
  if (reportRenderTimer) {
    clearTimeout(reportRenderTimer)
    reportRenderTimer = null
  }
})
</script>

<style scoped>
.data-analysis-window {
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
  padding: 0;
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
}

.file-section {
  flex-shrink: 0;
  padding: 16px;
  border-bottom: 1px solid;
}

.compact-upload {
  width: 100%;
}

.file-list-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-icon {
  font-size: 20px;
}

.main-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* shadcn-vue Tabs styling */
.main-tabs :deep([role='tablist']) {
  flex-shrink: 0;
}

.main-tabs :deep([role='tabpanel']) {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.main-tabs :deep([role='tabpanel'][data-state='active']) {
  height: 100%;
}

.preview-tab-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 16px;
  overflow: hidden;
}

.params-section-split {
  flex-shrink: 0;
  display: flex;
  gap: 16px;
  width: 100%;
  box-sizing: border-box;
}

.params-left-panel {
  flex: 0 0 70%;
  min-width: 0;
  max-width: 70%;
  box-sizing: border-box;
}

.params-right-panel {
  flex: 0 0 30%;
  min-width: 0;
  max-width: 30%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.centered-form {
  max-width: 900px;
  width: 100%;
}

.centered-form :deep(.el-form-item) {
  margin-bottom: 18px;
}

.centered-form :deep(.el-form-item__label) {
  text-align: left !important;
  justify-content: flex-start !important;
}

.header-row-hint {
  margin-top: 8px;
  line-height: 1.5;
}

.header-preview-scrollbar {
  max-height: 120px;
  min-height: 40px;
  width: 100%;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  padding: 8px;
  box-sizing: border-box;
  background-color: var(--el-fill-color-lighter);
}

.header-preview-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.header-preview-scrollbar :deep(.el-scrollbar__bar) {
  opacity: 0.6;
}

.header-preview-content {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: min-content;
}

.no-header-preview {
  text-align: center;
  padding: 20px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.preview-table-container {
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow: hidden;
  margin-bottom: 0;
}

.preview-table {
  width: 100%;
}

.no-preview-data,
.no-file-hint {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.analyze-button-container {
  flex-shrink: 0;
  z-index: 10;
  margin-top: auto;
  margin-bottom: 0;
}

.analyze-button-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.selection-hint {
  white-space: nowrap;
}

.selection-hint-dim {
  font-style: italic;
}

.result-tab-scrollbar {
  height: 100%;
}

.result-tab-content {
  padding: 16px;
}

.analysis-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.report-section {
  margin-top: 24px;
}

.report-markdown-container {
  width: 100%;
  min-height: 100px;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.empty-result {
  text-align: center;
  padding: 40px;
}
</style>
