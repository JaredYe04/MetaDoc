<template>
  <div class="data-analysis-window">
    <div class="main-container">
      <!-- 左侧会话列表 -->
      <SessionList
        :title="t('dataAnalysis.sessionsTitle', '数据分析会话')"
        :items="sessions"
        :active-index="activeSessionId"
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
        
        <div v-else class="session-content">
          <!-- 文件上传区域 -->
          <div class="upload-section">
            <el-upload
              :file-list="fileList"
              :auto-upload="false"
              :on-change="handleFileChange"
              :on-remove="handleFileRemove"
              accept=".csv,.xlsx,.xls,.json"
              drag
            >
              <el-icon class="el-icon--upload"><upload-filled /></el-icon>
              <div class="el-upload__text">
                {{ t('dataAnalysis.uploadHint', '将文件拖到此处，或点击上传') }}
              </div>
              <template #tip>
                <div class="el-upload__tip">
                  {{ t('dataAnalysis.uploadTip', '支持 CSV、Excel、JSON 格式') }}
                </div>
              </template>
            </el-upload>
          </div>

          <!-- 表头设置（CSV和Excel文件显示） -->
          <div v-if="activeSession && activeSession.data_file_path && (isCsvFile || isExcelFile)" class="header-row-section" :style="headerRowSectionStyle">
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
              <span class="header-row-hint" :style="hintStyle">
                {{ t('dataAnalysis.headerRowHint', '默认值：自动检测（当前猜测：第 {index} 行）', { index: detectedHeaderRowIndex + 1 }) }}
              </span>
            </el-form-item>
            
            <!-- 表头预览 -->
            <div v-if="headerPreview.length > 0" class="header-preview" :style="headerPreviewStyle">
              <div class="header-preview-label" :style="headerPreviewLabelStyle">
                {{ t('dataAnalysis.headerPreview', '当前表头预览：') }}
              </div>
              <div class="header-preview-content" :style="headerPreviewContentStyle">
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
            </div>
          </div>

          <!-- 分析按钮 -->
          <div class="action-section" v-if="activeSession && activeSession.data_file_path">
            <el-button 
              type="primary" 
              :loading="analyzing"
              @click="handleAnalyze"
            >
              {{ t('dataAnalysis.analyze', '开始分析') }}
            </el-button>
          </div>

          <!-- 分析结果展示 -->
          <div v-if="analysisResult" class="result-section" :style="resultSectionStyle">
            <el-tabs v-model="activeTab" type="border-card" class="result-tabs">
              <!-- 字段信息、描述统计、聚合分析 -->
              <el-tab-pane :label="t('dataAnalysis.tabs.analysis', '数据分析')" name="analysis">
                <DataAnalysisResultDisplay :result="analysisResult" />
              </el-tab-pane>
              
              <!-- 分析报告 -->
              <el-tab-pane :label="t('dataAnalysis.tabs.report', '分析报告')" name="report">
                <div class="report-container" :style="reportContainerStyle">
                  <div 
                    v-if="reportMarkdown" 
                    ref="reportContainerRef"
                    class="report-markdown-container"
                  ></div>
                  <div v-else class="no-report" :style="noReportStyle">
                    {{ t('dataAnalysis.noReport', '暂无分析报告') }}
                  </div>
                </div>
              </el-tab-pane>
              
              <!-- 原始数据 -->
              <el-tab-pane :label="t('dataAnalysis.tabs.data', '原始数据')" name="data">
                <div class="data-container" :style="dataContainerStyle">
                  <pre :style="preStyle">{{ JSON.stringify(analysisResult, null, 2) }}</pre>
                </div>
              </el-tab-pane>
            </el-tabs>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import SessionList from '../components/common/SessionList.vue'
import type { SessionListItem } from '../components/common/SessionList.vue'
import { dataAnalysisSessionsDb, type DataAnalysisSession } from '../utils/db/tool-sessions-db'
import { dataAnalysisToolCallback } from '../utils/agent-tools/data-analysis-tool'
import { generateDataAnalysisReportPrompt } from '../utils/prompts'
import { createAiTask } from '../utils/ai_tasks'
import { ref as vueRef } from 'vue'
import type { AIDialogMessage } from '@/types'
import DataAnalysisResultDisplay from '../components/data-analysis/DataAnalysisResultDisplay.vue'
import { themeState } from '../utils/themes'
import Vditor from 'vditor'
import { localVditorCDN, vditorCDN } from '../utils/vditor-cdn'
import { isElectronEnv } from '../utils/event-bus'
import { getSetting } from '../utils/settings'

const { t } = useI18n()

const sessions = ref<SessionListItem[]>([])
const activeSessionId = ref<string | null>(null)
const activeSessionData = ref<DataAnalysisSession | null>(null)
const activeSession = computed(() => {
  if (!activeSessionId.value) return null
  // 优先使用 activeSessionData，如果没有则从 sessions 中查找
  if (activeSessionData.value && activeSessionData.value.id === activeSessionId.value) {
    return activeSessionData.value
  }
  return sessions.value.find(s => s.id === activeSessionId.value) as any
})

const fileList = ref<any[]>([])
const analyzing = ref(false)
const analysisResult = ref<any>(null)
const reportMarkdown = ref<string>('')
const activeTab = ref('report')
const headerRowIndex = ref<number | undefined>(undefined)
const detectedHeaderRowIndex = ref<number>(0)
const headerPreview = ref<string[]>([])
const reportContainerRef = ref<HTMLElement | null>(null)

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
    // 设置 activeSessionData
    activeSessionData.value = {
      ...newSession,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    fileList.value = []
    analysisResult.value = null
    reportMarkdown.value = ''
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
      // 保存完整的会话数据
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
        fileList.value = [{
          name: session.data_file_path.split(/[/\\]/).pop(),
          url: session.data_file_path
        }]
        // 如果是CSV或Excel文件，处理表头行数
        if (session.data_format === 'csv') {
          // 如果数据库中有保存的表头行数，优先使用保存的值
          if (session.header_row_index !== undefined && session.header_row_index !== null) {
            headerRowIndex.value = session.header_row_index
            detectedHeaderRowIndex.value = session.header_row_index
            await updateHeaderPreview()
          } else {
            // 如果没有保存的值，自动检测
            await detectCsvHeaderRow(session.data_file_path)
            // 保存检测到的值
            if (headerRowIndex.value !== undefined) {
              await dataAnalysisSessionsDb.update(item.id, {
                header_row_index: headerRowIndex.value
              })
            }
          }
        } else if (session.data_format === 'xlsx' || session.data_format === 'xls') {
          // 如果数据库中有保存的表头行数，优先使用保存的值
          if (session.header_row_index !== undefined && session.header_row_index !== null) {
            headerRowIndex.value = session.header_row_index
            detectedHeaderRowIndex.value = session.header_row_index
            await updateHeaderPreview()
          } else {
            // 如果没有保存的值，自动检测
            await detectExcelHeaderRow(session.data_file_path)
            // 保存检测到的值
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
        fileList.value = []
        headerRowIndex.value = undefined
        detectedHeaderRowIndex.value = 0
        headerPreview.value = []
      }
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
      fileList.value = []
    }
    ElMessage.success(t('common.deleteSuccess', '删除成功'))
  } catch (error) {
    ElMessage.error('删除失败: ' + (error instanceof Error ? error.message : String(error)))
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
    
    // 转换Excel为文本
    const excelText = await ipcRenderer.invoke('convert-excel-to-text', filePath) as string
    const lines = excelText.split('\n').filter(line => line.trim())
    
    // 找到第一个工作表的数据行
    let dataStartIndex = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('工作表')) {
        // 找到下一个"行 X:"格式的行
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
    
    // 计算目标行（跳过工作表标题，行号从1开始，所以rowIndex对应行号rowIndex+1）
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
}

// 表头行数变化处理
const handleHeaderRowIndexChange = async () => {
  await updateHeaderPreview()
  // 保存表头行数到数据库
  if (activeSessionId.value && headerRowIndex.value !== undefined) {
    await dataAnalysisSessionsDb.update(activeSessionId.value, {
      header_row_index: headerRowIndex.value
    })
    // 更新 activeSessionData
    if (activeSessionData.value) {
      activeSessionData.value.header_row_index = headerRowIndex.value
    }
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
    
    // 读取文件前几行来检测表头
    const content = await ipcRenderer.invoke('read-file-content', filePath) as string
    const lines = content.trim().split('\n').filter(line => line.trim())
    if (lines.length === 0) return
    
    // 使用智能检测算法（只检测，不解析）
    // 简化版检测：检查前10行，找出最可能是表头的行
    let bestIndex = 0
    let bestScore = -1
    
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const line = lines[i]
      const columns = line.includes('\t') ? line.split('\t') : line.split(',')
      if (columns.length < 3) continue
      
      // 简单评分：检查后续行是否有相同列数
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
    // 默认使用检测到的值
    headerRowIndex.value = bestIndex
    // 更新预览
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
    
    // 转换Excel为文本
    const excelText = await ipcRenderer.invoke('convert-excel-to-text', filePath) as string
    const lines = excelText.split('\n').filter(line => line.trim())
    
    // 找到第一个工作表的数据行
    let dataStartIndex = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('工作表')) {
        // 找到下一个"行 X:"格式的行
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
    
    // 检测前几行，找出最可能是表头的行
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
      
      // 简单评分：检查后续行是否有相同列数
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
    // 默认使用检测到的值
    headerRowIndex.value = bestIndex
    // 更新预览
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
      // 新上传的文件，需要保存到临时目录
      const fileContent = await file.raw.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(fileContent)))
      
      // 获取IPC渲染器
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
      
      // 保存文件到临时目录
      filePath = await ipcRenderer.invoke('save-reference-file', {
        filename: file.name,
        content: base64
      }) as string
    } else {
      // 已有文件路径
      filePath = file.url || file.path
    }
    
    if (activeSessionId.value && filePath) {
      const format = file.name.split('.').pop()?.toLowerCase() || 'csv'
      await dataAnalysisSessionsDb.update(activeSessionId.value, {
        data_file_path: filePath,
        data_format: format === 'xlsx' || format === 'xls' ? format : format
      })
      // 更新 activeSessionData
      if (activeSessionData.value) {
        activeSessionData.value.data_file_path = filePath
        activeSessionData.value.data_format = format
      }
      
      // 如果是CSV或Excel文件，检测表头行数
      if (format === 'csv') {
        await detectCsvHeaderRow(filePath)
        // 保存表头行数到数据库
        if (headerRowIndex.value !== undefined) {
          await dataAnalysisSessionsDb.update(activeSessionId.value, {
            header_row_index: headerRowIndex.value
          })
        }
      } else if (format === 'xlsx' || format === 'xls') {
        await detectExcelHeaderRow(filePath)
        // 保存表头行数到数据库
        if (headerRowIndex.value !== undefined) {
          await dataAnalysisSessionsDb.update(activeSessionId.value, {
            header_row_index: headerRowIndex.value
          })
        }
      } else {
        headerRowIndex.value = undefined
        detectedHeaderRowIndex.value = 0
        headerPreview.value = []
        // 清空数据库中的表头行数
        await dataAnalysisSessionsDb.update(activeSessionId.value, {
          header_row_index: null
        })
      }
    }
  } catch (error) {
    ElMessage.error('保存文件信息失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

const handleFileRemove = () => {
  if (activeSessionId.value) {
    dataAnalysisSessionsDb.update(activeSessionId.value, {
      data_file_path: undefined,
      data_format: undefined
    })
    // 清空表头相关数据
    headerRowIndex.value = undefined
    detectedHeaderRowIndex.value = 0
    headerPreview.value = []
  }
}

// 执行分析
const handleAnalyze = async () => {
  if (!activeSessionId.value) {
    ElMessage.warning(t('dataAnalysis.noSession', '请先选择或创建会话'))
    return
  }
  
  // 确保有最新的会话数据
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
  try {
    const session = activeSessionData.value
    
    // 调用数据分析工具
    const result = await dataAnalysisToolCallback({
      data: session.data_file_path!,
      format: session.data_format || 'csv',
      dataSource: 'file',
      headerRowIndex: (isCsvFile.value || isExcelFile.value) ? headerRowIndex.value : undefined
    }, undefined, () => {})
    
    if (result.status === 'succeeded' && result.result) {
      analysisResult.value = result.result
      
      // 保存分析结果
      await dataAnalysisSessionsDb.update(activeSessionId.value, {
        analysis_result: JSON.stringify(result.result)
      })
      
      // 更新 activeSessionData
      if (activeSessionData.value) {
        activeSessionData.value.analysis_result = JSON.stringify(result.result)
      }
      
      // 生成Markdown报告（使用新的提示词函数）
      const prompt = generateDataAnalysisReportPrompt(result.result)
      const target = vueRef('')
      const originKey = `data-analysis-report-${Date.now()}-${Math.random().toString(36).slice(2)}`
      
      const messages: AIDialogMessage[] = [{
        role: 'user',
        content: prompt,
      }]
      const { done } = createAiTask(
        t('dataAnalysis.generateReport', '生成分析报告'),
        messages,
        target,
        'chat',
        originKey,
        { stream: true }
      )
      
      await done
      reportMarkdown.value = target.value
      
      // 保存报告
      await dataAnalysisSessionsDb.update(activeSessionId.value, {
        report_markdown: target.value
      })
      
      // 更新 activeSessionData
      if (activeSessionData.value) {
        activeSessionData.value.report_markdown = target.value
      }
      
      activeTab.value = 'analysis'
      ElMessage.success(t('dataAnalysis.analyzeSuccess', '分析完成'))
    } else {
      ElMessage.error(result.error || t('dataAnalysis.analyzeFailed', '分析失败'))
    }
  } catch (error) {
    ElMessage.error('分析失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    analyzing.value = false
  }
}

// 主题样式
const resultSectionStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const reportContainerStyle = computed(() => ({
  padding: '16px',
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  borderRadius: '8px',
  maxHeight: '600px',
  overflow: 'auto'
}))

const dataContainerStyle = computed(() => ({
  padding: '16px',
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  borderRadius: '8px',
  maxHeight: '600px',
  overflow: 'auto'
}))

const preStyle = computed(() => ({
  margin: 0,
  fontSize: '12px',
  color: themeState.currentTheme.textColor,
  fontFamily: "'JetBrains Mono', 'Consolas', monospace"
}))

const noReportStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.6,
  textAlign: 'center',
  padding: '40px'
}))

const contentAreaStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const emptyStateStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.6
}))

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

const headerRowSectionStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  padding: '16px',
  borderRadius: '8px',
  marginBottom: '16px'
}))

const hintStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.7,
  fontSize: '12px',
  marginLeft: '12px'
}))

const headerPreviewStyle = computed(() => ({
  marginTop: '16px',
  padding: '12px',
  backgroundColor: themeState.currentTheme.background,
  borderRadius: '6px',
  border: `1px solid ${themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`
}))

const headerPreviewLabelStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  fontSize: '13px',
  fontWeight: 500,
  marginBottom: '8px'
}))

const headerPreviewContentStyle = computed(() => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px'
}))

const headerTagStyle = computed(() => ({
  fontFamily: "'JetBrains Mono', 'Consolas', monospace"
}))

// 渲染分析报告
const renderReport = async () => {
  if (!reportContainerRef.value || !reportMarkdown.value) {
    return
  }
  
  const container = reportContainerRef.value as HTMLDivElement
  
  try {
    // 获取 CDN 和主题设置
    const cdn = isElectronEnv() ? localVditorCDN : vditorCDN
    const contentTheme = await getSetting('contentTheme') || 'light'
    const codeTheme = themeState.currentTheme.codeTheme
    const lineNumber = await getSetting('lineNumber') ?? true
    
    // 清空容器
    container.innerHTML = ''
    
    // 使用 Vditor.preview 渲染
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
    
    // 等待 preview 完成后再调用其他渲染方法
    await nextTick()
    
    // 渲染代码块
    if (typeof Vditor.codeRender === 'function') {
      Vditor.codeRender(container)
    }
    
    // 渲染数学公式
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
    if (activeTab.value === 'report' && reportMarkdown.value) {
      nextTick(() => {
        renderReport()
      })
    }
  },
  { immediate: true }
)

onMounted(() => {
  loadSessions()
  if (activeTab.value === 'report' && reportMarkdown.value) {
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
  padding: 24px;
  overflow: auto;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.session-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.upload-section {
  margin-bottom: 24px;
}

.action-section {
  display: flex;
  justify-content: center;
  margin-bottom: 24px;
}

.result-section {
  flex: 1;
  min-height: 0;
}

.result-tabs {
  width: 100%;
}

.header-row-section {
  margin-bottom: 16px;
}

.header-row-hint {
  display: inline-block;
}

.header-preview {
  margin-top: 16px;
}

.header-preview-label {
  display: block;
}

.header-preview-content {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.header-tag {
  font-family: 'JetBrains Mono', 'Consolas', monospace;
}

.report-markdown-container {
  width: 100%;
  min-height: 100px;
  padding: 16px;
  box-sizing: border-box;
  word-wrap: break-word;
  overflow-wrap: break-word;
}
</style>

