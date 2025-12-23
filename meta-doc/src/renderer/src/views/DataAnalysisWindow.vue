<template>
  <div class="data-analysis-window">
    <div class="main-container">
      <!-- 左侧会话列表 -->
      <SessionList
        :title="t('dataAnalysis.sessionsTitle', '数据分析会话')"
        :items="sessions"
        :active-index="activeSessionId || undefined"
        :disabled="analyzing"
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
      />

      <!-- 右侧内容区域 -->
      <div class="content-area" :style="contentAreaStyle">
        <div v-if="!activeSession" class="empty-state" :style="emptyStateStyle">
          <p>{{ t('dataAnalysis.noSessionSelected', '请选择一个会话或创建新会话') }}</p>
        </div>
        
        <div v-else class="session-content-panel" :style="panelStyle">
          <!-- 文件上传/显示区域（在最上方） -->
          <div class="file-section" :style="fileSectionStyle">
            <el-upload
              v-if="!currentFile"
              :file-list="[]"
              :auto-upload="false"
              :on-change="handleFileChange"
              :limit="1"
              accept=".csv,.xlsx,.xls,.json"
              class="compact-upload"
            >
              <template #trigger>
                <el-button type="primary" :icon="UploadFilled">
                  {{ t('dataAnalysis.uploadFile', '上传文件') }}
                </el-button>
              </template>
              <template #tip>
                <div class="upload-tip" :style="tipStyle">
                  {{ t('dataAnalysis.uploadTip', '支持 CSV、Excel、JSON 格式') }}
                </div>
              </template>
            </el-upload>
            
            <div v-else class="file-list-item" :style="fileListItemStyle">
              <el-icon class="file-icon"><Document /></el-icon>
              <span class="file-name" :style="fileNameStyle">{{ currentFile.name }}</span>
              <el-button
                type="danger"
                :icon="Delete"
                circle plain
                
                size="small"
                @click="handleFileRemove"
              />
            </div>
          </div>
          
          <!-- Tab 内容 -->
          <el-tabs v-model="activeTab" type="border-card" class="main-tabs" :style="tabsStyle">
            <!-- Tab 1: 数据预览与参数设置 -->
            <el-tab-pane :label="t('dataAnalysis.tabs.preview', '数据预览')" name="preview">
              <div class="preview-tab-content">
                <!-- 参数设置区域 -->
                <div v-if="currentFile && (isCsvFile || isExcelFile)" class="params-section" :style="paramsSectionStyle">
                  <el-form :model="analysisParams" label-width="200px" size="default" class="centered-form">
                    <el-form-item :label="t('dataAnalysis.headerRowIndex', '表头行数（从0开始）')">
                      <el-input-number
                        v-model="headerRowIndex"
                        :min="0"
                        :max="20"
                        :step="1"
                        :precision="0"
                        controls-position="right"
                        style="width: 200px"
                        @change="handleHeaderRowIndexChange"
                      />
                      <div class="header-row-hint" :style="hintStyle">
                        {{ t('dataAnalysis.headerRowHint', `默认值：自动检测（当前猜测：第 ${detectedHeaderRowIndex + 1} 行）`) }}
                      </div>
                    </el-form-item>
                    
                    <el-form-item :label="t('dataAnalysis.autoGroupBy', '自动聚合分析')">
                      <el-switch v-model="analysisParams.autoGroupBy" />
                    </el-form-item>
                    
                    <el-form-item :label="t('dataAnalysis.generateReport', '生成AI报告')">
                      <el-switch v-model="analysisParams.generateReport" />
                    </el-form-item>
                    
                    <!-- 表头预览已注释，因为底部已有预览组件 -->
                    <!--
                    <el-form-item v-if="headerPreview.length > 0" label="表头预览">
                      <el-scrollbar class="header-preview-scrollbar">
                        <div class="header-preview-content">
                          <el-tag
                            v-for="(header, index) in headerPreview"
                            :key="index"
                            size="small"
                            effect="plain"
                            class="header-tag"
                            :style="headerTagStyle"
                          >
                            {{ header || `列${index + 1}` }}
                          </el-tag>
                        </div>
                      </el-scrollbar>
                    </el-form-item>
                    <el-form-item v-else label="表头预览">
                      <div class="no-header-preview" :style="noHeaderPreviewStyle">
                        {{ t('dataAnalysis.noHeaderPreview', '暂无表头数据') }}
                      </div>
                    </el-form-item>
                    -->
                    
                    <el-form-item v-if="analysisParams.generateReport" :label="t('dataAnalysis.analysisRequest', '分析需求（可选）')">
                      <el-input
                        v-model="analysisParams.analysisRequest"
                        type="textarea"
                        :rows="2"
                        :placeholder="t('dataAnalysis.analysisRequestPlaceholder', '描述您的分析需求...')"
                      />
                    </el-form-item>
                  </el-form>
                </div>

                <!-- 数据预览表格 -->
                <div v-if="currentFile && previewData.length > 0" class="preview-table-container" ref="tableContainerRef">
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
                  />
                </div>
                
                <div v-else-if="currentFile" class="no-preview-data" :style="noPreviewDataStyle">
                  {{ t('dataAnalysis.loadingPreview', '正在加载数据预览...') }}
                </div>
                
                <div v-else class="no-file-hint" :style="noFileHintStyle">
                  {{ t('dataAnalysis.uploadFileFirst', '请先上传数据文件') }}
                </div>

                <!-- 分析按钮（固定在底部） -->
                <div v-if="currentFile" class="analyze-button-container" :style="analyzeButtonContainerStyle">
                  <el-button 
                    type="primary" 
                    size="large"
                    :loading="analyzing"
                    :disabled="!currentFile"
                    @click="handleAnalyze"
                  >
                    {{ analyzing ? t('dataAnalysis.analyzing', '分析中...') : t('dataAnalysis.analyze', '开始分析') }}
                  </el-button>
                </div>
              </div>
            </el-tab-pane>
            
            <!-- Tab 2: 分析结果 -->
            <el-tab-pane :label="t('dataAnalysis.tabs.result', '分析结果')" name="result">
              <el-scrollbar class="result-tab-scrollbar">
                <div class="result-tab-content" :style="resultTabContentStyle">
                <!-- 分析状态显示 -->
                <div v-if="analyzing || analysisStage" class="analysis-status" :style="analysisStatusStyle">
                  <el-icon class="is-loading"><Loading /></el-icon>
                  <span>{{ getStageMessage() }}</span>
                </div>

                <!-- 分析结果展示 -->
                <div v-if="analysisResult" class="result-content">
                  <DataAnalysisResultDisplay :result="analysisResult" />
                </div>
                
                <!-- AI报告 -->
                <div v-if="analysisResult || reportMarkdown" class="report-section" :style="reportSectionStyle">
                  <div class="report-header" :style="reportHeaderStyle">
                    <h3>{{ t('dataAnalysis.tabs.report', '分析报告') }}</h3>
                  </div>
                  <div 
                    v-if="reportMarkdown" 
                    ref="reportContainerRef"
                    class="report-markdown-container"
                    :style="reportContainerStyle"
                  ></div>
                  <div v-else class="no-report" :style="noReportStyle">
                    {{ analyzing ? t('dataAnalysis.generatingReport', '正在生成报告...') : t('dataAnalysis.noReport', '暂无分析报告') }}
                  </div>
                </div>
                
                <!-- 空状态 -->
                <div v-if="!analyzing && !analysisResult && !reportMarkdown" class="empty-result" :style="emptyResultStyle">
                  {{ t('dataAnalysis.noAnalysisResult', '暂无分析结果，请在"数据预览"标签页中开始分析') }}
                </div>
                </div>
              </el-scrollbar>
            </el-tab-pane>
          </el-tabs>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UploadFilled, Delete, Document, Loading } from '@element-plus/icons-vue'
import SessionList from '../components/common/SessionList.vue'
import DataTable from '../components/common/DataTable.vue'
import type { SessionListItem } from '../components/common/SessionList.vue'
import { dataAnalysisSessionsDb, type DataAnalysisSession } from '../utils/db/tool-sessions-db'
import { dataAnalysisToolCallback } from '../utils/agent-tools/data-analysis-tool'
import DataAnalysisResultDisplay from '../components/data-analysis/DataAnalysisResultDisplay.vue'
import { themeState } from '../utils/themes'
import Vditor from 'vditor'
import { localVditorCDN, vditorCDN } from '../utils/vditor-cdn'
import { isElectronEnv } from '../utils/event-bus'
import { getSetting } from '../utils/settings'
import { parseCSV } from '../utils/agent-tools/data-analysis-tool'

const { t } = useI18n()

const sessions = ref<SessionListItem[]>([])
const activeSessionId = ref<string | null>(null)
const activeSessionData = ref<DataAnalysisSession | null>(null)
const activeSession = computed(() => {
  if (!activeSessionId.value) return null
  if (activeSessionData.value && activeSessionData.value.id === activeSessionId.value) {
    return activeSessionData.value
  }
  return sessions.value.find(s => s.id === activeSessionId.value) as any
})

const currentFile = ref<{ name: string; path: string } | null>(null)
const analyzing = ref(false)
const analysisStage = ref<string>('')
const analysisResult = ref<any>(null)
const reportMarkdown = ref<string>('')
const activeTab = ref('preview')
const headerRowIndex = ref<number | undefined>(undefined)
const detectedHeaderRowIndex = ref<number>(0)
const headerPreview = ref<string[]>([])
const reportContainerRef = ref<HTMLElement | null>(null)
const dataTableRef = ref<InstanceType<typeof DataTable> | null>(null)
const tableContainerRef = ref<HTMLElement | null>(null)
const previewData = ref<any[][]>([])

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
      report_markdown: undefined
    }
    
    await dataAnalysisSessionsDb.create(newSession)
    
    await loadSessions()
    activeSessionId.value = id
    activeSessionData.value = {
      ...newSession,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    currentFile.value = null
    analysisResult.value = null
    reportMarkdown.value = ''
    previewData.value = []
    analysisParams.value = {
      autoGroupBy: true,
      generateReport: true,
      analysisRequest: ''
    }
  } catch (error) {
    ElMessage.error('创建会话失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 选择会话
const handleSelectSession = async (item: SessionListItem) => {
  activeSessionId.value = item.id
  try {
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
          name: session.data_file_path.split(/[/\\]/).pop() || '未知文件',
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
      }
      
      // 加载分析参数（如果有保存的话，可以从数据库扩展字段读取）
      // 这里暂时使用默认值
    }
  } catch (error) {
    ElMessage.error('加载会话失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 重命名会话
const handleRenameSession = async (item: SessionListItem, newTitle: string) => {
  try {
    await dataAnalysisSessionsDb.update(item.id, { title: newTitle })
    await loadSessions()
  } catch (error) {
    ElMessage.error('重命名失败: ' + (error instanceof Error ? error.message : String(error)))
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
      title: session.title + ' (副本)',
      description: session.description,
      data_file_path: session.data_file_path,
      data_format: session.data_format,
      analysis_result: session.analysis_result,
      report_markdown: session.report_markdown
    })
    
    await loadSessions()
    ElMessage.success(t('common.duplicateSuccess', '复制成功'))
  } catch (error) {
    ElMessage.error('复制失败: ' + (error instanceof Error ? error.message : String(error)))
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
    }
    ElMessage.success(t('common.deleteSuccess', '删除成功'))
  } catch (error) {
    ElMessage.error('删除失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 加载预览数据
const loadPreviewData = async () => {
  if (!activeSessionData.value?.data_file_path) {
    previewData.value = []
    return
  }
  
  try {
    let ipcRenderer: any = null
    if (typeof window !== 'undefined') {
      if ((window as any).electron?.ipcRenderer) {
        ipcRenderer = (window as any).electron.ipcRenderer
      } else {
        const { localIpcRenderer } = await import('../utils/web-adapter/local-ipc-renderer')
        ipcRenderer = localIpcRenderer
      }
    }
    
    if (!ipcRenderer) return
    
    const filePath = activeSessionData.value.data_file_path
    const format = activeSessionData.value.data_format || 'csv'
    const finalHeaderRowIndex = headerRowIndex.value !== undefined ? headerRowIndex.value : 0
    
    if (format === 'csv') {
      const content = await ipcRenderer.invoke('read-file-content', filePath) as string
      const lines = content.trim().split('\n').filter(line => line.trim())
      
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
      const headerData = headerLine.split(delimiter).map(c => c.trim())
      previewRows.push(headerData)
      
      // 然后添加数据行（从表头行的下一行开始）
      for (let i = finalHeaderRowIndex + 1; i < lines.length; i++) {
        const rowData = lines[i].split(delimiter).map(c => c.trim())
        previewRows.push(rowData)
        
        // 限制预览行数（避免性能问题）
        if (previewRows.length >= 1000) break
      }
      
      previewData.value = previewRows
    } else if (format === 'xlsx' || format === 'xls') {
      const excelText = await ipcRenderer.invoke('convert-excel-to-text', filePath) as string
      const lines = excelText.split('\n').filter(line => line.trim())
      
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
          headerRowData = rowMatch[1].split('\t').map(c => c.trim())
          previewRows.push(headerRowData)
          dataRowIndex++
          continue
        }
        
        // 只显示表头行之后的数据
        if (dataRowIndex > finalHeaderRowIndex) {
          const rowData = rowMatch[1].split('\t').map(c => c.trim())
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
    let ipcRenderer: any = null
    if (typeof window !== 'undefined') {
      if ((window as any).electron?.ipcRenderer) {
        ipcRenderer = (window as any).electron.ipcRenderer
      } else {
        const { localIpcRenderer } = await import('../utils/web-adapter/local-ipc-renderer')
        ipcRenderer = localIpcRenderer
      }
    }
    
    if (!ipcRenderer) return []
    
    const content = await ipcRenderer.invoke('read-file-content', filePath) as string
    const lines = content.trim().split('\n').filter(line => line.trim())
    if (lines.length === 0 || rowIndex >= lines.length) return []
    
    const headerLine = lines[rowIndex]
    const columns = headerLine.includes('\t') ? headerLine.split('\t') : headerLine.split(',')
    return columns.map(c => c.trim())
  } catch (error) {
    console.error('预览CSV表头失败:', error)
    return []
  }
}

// 预览表头（Excel）
const previewExcelHeader = async (filePath: string, rowIndex: number) => {
  try {
    let ipcRenderer: any = null
    if (typeof window !== 'undefined') {
      if ((window as any).electron?.ipcRenderer) {
        ipcRenderer = (window as any).electron.ipcRenderer
      } else {
        const { localIpcRenderer } = await import('../utils/web-adapter/local-ipc-renderer')
        ipcRenderer = localIpcRenderer
      }
    }
    
    if (!ipcRenderer) return []
    
    const excelText = await ipcRenderer.invoke('convert-excel-to-text', filePath) as string
    const lines = excelText.split('\n').filter(line => line.trim())
    
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
    return rowData.map(c => c.trim())
  } catch (error) {
    console.error('预览Excel表头失败:', error)
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
    let ipcRenderer: any = null
    if (typeof window !== 'undefined') {
      if ((window as any).electron?.ipcRenderer) {
        ipcRenderer = (window as any).electron.ipcRenderer
      } else {
        const { localIpcRenderer } = await import('../utils/web-adapter/local-ipc-renderer')
        ipcRenderer = localIpcRenderer
      }
    }
    
    if (!ipcRenderer) return
    
    const content = await ipcRenderer.invoke('read-file-content', filePath) as string
    const lines = content.trim().split('\n').filter(line => line.trim())
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
    detectedHeaderRowIndex.value = 0
    headerRowIndex.value = 0
    headerPreview.value = []
  }
}

// 检测Excel表头行数
const detectExcelHeaderRow = async (filePath: string) => {
  try {
    let ipcRenderer: any = null
    if (typeof window !== 'undefined') {
      if ((window as any).electron?.ipcRenderer) {
        ipcRenderer = (window as any).electron.ipcRenderer
      } else {
        const { localIpcRenderer } = await import('../utils/web-adapter/local-ipc-renderer')
        ipcRenderer = localIpcRenderer
      }
    }
    
    if (!ipcRenderer) return
    
    const excelText = await ipcRenderer.invoke('convert-excel-to-text', filePath) as string
    const lines = excelText.split('\n').filter(line => line.trim())
    
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
      
      let ipcRenderer: any = null
      if (typeof window !== 'undefined') {
        if ((window as any).electron?.ipcRenderer) {
          ipcRenderer = (window as any).electron.ipcRenderer
        } else {
          const { localIpcRenderer } = await import('../utils/web-adapter/local-ipc-renderer')
          ipcRenderer = localIpcRenderer
        }
      }
      
      if (!ipcRenderer) {
        throw new Error('IPC渲染器不可用')
      }
      
      filePath = await ipcRenderer.invoke('save-reference-file', {
        filename: file.name,
        content: base64
      }) as string
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
        const truncatedFileName = fileNameWithoutExt.length > maxLength 
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
    ElMessage.error('保存文件信息失败: ' + (error instanceof Error ? error.message : String(error)))
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
    analysisResult.value = null
    reportMarkdown.value = ''
    
    if (activeSessionData.value) {
      activeSessionData.value.data_file_path = undefined
      activeSessionData.value.data_format = undefined
      activeSessionData.value.header_row_index = undefined
    }
  }
}

// 执行分析
const handleAnalyze = async () => {
  if (!activeSessionId.value) {
    ElMessage.warning(t('dataAnalysis.noSession', '请先选择或创建会话'))
    return
  }
  
  if (!activeSessionData.value) {
    const session = await dataAnalysisSessionsDb.getById(activeSessionId.value)
    if (!session) {
      ElMessage.warning(t('dataAnalysis.noSession', '会话不存在'))
      return
    }
    activeSessionData.value = session
  }
  
  if (!activeSessionData.value.data_file_path) {
    ElMessage.warning(t('dataAnalysis.noFile', '请先上传数据文件'))
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
    
    // 创建进度更新回调
    const onProgress = (progress: any) => {
      if (progress.message) {
        analysisStage.value = progress.message
      }
    }
    
    // 调用数据分析工具
    const abortController = new AbortController()
    const result = await dataAnalysisToolCallback({
      data: session.data_file_path!,
      format: session.data_format || 'csv',
      dataSource: 'file',
      headerRowIndex: (isCsvFile.value || isExcelFile.value) ? headerRowIndex.value : undefined,
      autoGroupBy: analysisParams.value.autoGroupBy,
      generateReport: analysisParams.value.generateReport === true, // 明确传递generateReport参数
      analysisRequest: analysisParams.value.analysisRequest || undefined
    }, abortController.signal, onProgress)
    
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
      
      ElMessage.success(t('dataAnalysis.analyzeSuccess', '分析完成'))
    } else {
      ElMessage.error(result.error || t('dataAnalysis.analyzeFailed', '分析失败'))
      analysisStage.value = ''
    }
  } catch (error) {
    ElMessage.error('分析失败: ' + (error instanceof Error ? error.message : String(error)))
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
    const cdn = isElectronEnv() ? localVditorCDN : vditorCDN
    const contentTheme = await getSetting('contentTheme') || 'light'
    const codeTheme = themeState.currentTheme.codeTheme
    const lineNumber = await getSetting('lineNumber') ?? true
    
    container.innerHTML = ''
    
    const previewOptions: any = {
      cdn,
      mode: themeState.currentTheme.type === 'dark' ? 'dark' : 'light',
      markdown: {
        theme: { current: contentTheme }
      },
      hljs: {
        style: codeTheme,
        lineNumber: lineNumber
      },
      theme: themeState.currentTheme.vditorTheme
    }
    
    await Vditor.preview(container, reportMarkdown.value, previewOptions)
    
    await nextTick()
    
    if (typeof Vditor.codeRender === 'function') {
      Vditor.codeRender(container)
    }
    
    if (typeof Vditor.mathRender === 'function') {
      Vditor.mathRender(container, {
        cdn
      })
    }
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
  border: `1px solid ${borderColor.value}`
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

const emptyResultStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.6,
  textAlign: 'center' as const,
  padding: '40px'
}))

onMounted(() => {
  loadSessions()
  
  if (activeTab.value === 'result' && reportMarkdown.value) {
    nextTick(() => {
      renderReport()
    })
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
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
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

.main-tabs :deep(.el-tabs__header) {
  order: -999 !important;
  flex-shrink: 0 !important;
  flex-grow: 0 !important;
  margin: 0 !important;
  position: relative !important;
}

.main-tabs :deep(.el-tabs__header.is-top) {
  order: -999 !important;
}

.main-tabs :deep(.el-tabs__header.is-bottom) {
  order: 999 !important;
}

.main-tabs :deep(.el-tabs__content) {
  order: 0 !important;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative !important;
  padding: 0 !important;
}

.main-tabs :deep(.el-tab-pane) {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}


.preview-tab-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 16px;
  overflow: hidden;
}

.params-section {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
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
