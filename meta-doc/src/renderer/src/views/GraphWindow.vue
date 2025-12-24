<template>
  <div class="graph-window">
    <div class="main-container">
      <!-- 左侧会话列表 -->
      <SessionList
        :title="t('graph.sessionsTitle', '绘图会话')"
        :items="sessions"
        :active-index="activeSessionId || undefined"
        :disabled="generating || loadingSession"
        :create-button-tooltip="t('graph.newSession', '新建会话')"
        :rename-label="t('common.rename', '重命名')"
        :duplicate-label="t('common.duplicate', '复制')"
        :delete-label="t('common.delete', '删除')"
        :rename-dialog-title="t('graph.renameTitle', '重命名会话')"
        :rename-placeholder="t('graph.renamePlaceholder', '请输入会话名称')"
        :cancel-label="t('common.cancel', '取消')"
        :confirm-label="t('common.confirm', '确认')"
        @create="handleCreateSession"
        @select="handleSelectSession"
        @rename="handleRenameSession"
        @duplicate="handleDuplicateSession"
        @delete="handleDeleteSession"
      />

      <!-- 右侧内容区域 -->
      <div class="content-area" :style="contentAreaStyle" v-loading="loadingSession">
        <div v-if="!activeSession" class="empty-state" :style="emptyStateStyle">
          <p>{{ t('graph.noSessionSelected', '请选择一个会话或创建新会话') }}</p>
        </div>
        
        <div v-else class="session-content">
          <!-- 引擎和类型选择 -->
          <div class="config-section" :style="configSectionStyle">
            <el-form :inline="true">
              <el-form-item :label="t('graph.engine', '绘图引擎')">
                <el-select v-model="selectedEngine" @change="handleEngineChange">
                  <el-option
                    v-for="engine in engines"
                    :key="engine"
                    :label="engine"
                    :value="engine"
                  />
                </el-select>
              </el-form-item>
              <el-form-item :label="t('graph.chartType', '图表类型')">
                <el-select v-model="selectedType">
                  <el-option
                    v-for="type in availableTypes"
                    :key="type"
                    :label="type"
                    :value="type"
                  />
                </el-select>
              </el-form-item>
              <el-form-item :label="t('graph.outputFormat', '输出格式')">
                <el-select v-model="outputFormat">
                  <el-option label="SVG" value="svg" />
                  <el-option label="PNG" value="png" />
                  <el-option label="PDF" value="pdf" />
                  <el-option label="URL" value="url" />
                </el-select>
              </el-form-item>
            </el-form>
          </div>

          <!-- 对话历史 -->
          <div class="conversation-section" :style="conversationSectionStyle">
            <div class="conversation-messages">
              <div
                v-for="(msg, index) in conversationHistory"
                :key="index"
                class="message-item"
                :class="msg.role"
                :style="getMessageItemStyle(msg.role).value"
              >
                <div class="message-header" :style="messageHeaderStyle">
                  <strong>{{ msg.role === 'user' ? t('graph.user', '用户') : t('graph.assistant', '助手') }}</strong>
                </div>
                <div class="message-content">
                  <pre v-if="msg.role === 'user'" :style="preStyle">{{ msg.content }}</pre>
                  <div v-else>
                    <div v-if="msg.imageUrl" class="image-preview">
                      <img :src="msg.imageUrl" :alt="t('graph.generatedImage', '生成的图片')" />
                    </div>
                    <div v-if="msg.code" class="code-preview" :style="codePreviewStyle">
                      <pre :style="preStyle">{{ msg.code }}</pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 输入区域 -->
          <div class="input-section">
            <el-input
              v-model="currentPrompt"
              type="textarea"
              :rows="3"
              :placeholder="t('graph.inputPlaceholder', '输入绘图需求...')"
              @keydown.ctrl.enter="handleGenerate"
              @keydown.meta.enter="handleGenerate"
            />
            <div class="input-actions">
              <el-button 
                type="primary" 
                :loading="generating"
                @click="handleGenerate"
              >
                {{ t('graph.generate', '生成') }}
              </el-button>
              <el-button 
                @click="handleOptimize"
                :disabled="!lastGeneratedImage"
              >
                {{ t('graph.optimize', '优化图片') }}
              </el-button>
              <el-button 
                @click="handleExport"
                :disabled="!lastGeneratedImage"
              >
                {{ t('graph.export', '导出') }}
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import SessionList from '../components/common/SessionList.vue'
import type { SessionListItem } from '../components/common/SessionList.vue'
import { graphSessionsDb, type GraphSession } from '../utils/db/tool-sessions-db'
import { generateGraphPrompt } from '../utils/prompts'
import { createAiTask } from '../utils/ai_tasks'
import { ref as vueRef } from 'vue'
import type { AIDialogMessage } from '@/types'
import { renderChartViaVditor, renderEChartsViaIpc, renderMermaidViaApi } from '../utils/chart-pre-renderer'
import { localVditorCDN, vditorCDN } from '../utils/vditor-cdn'
import { isElectronEnv } from '../utils/event-bus'
import { convertSvgToPdf } from '../utils/svg-to-pdf-utils'
import { createRendererLogger } from '../utils/logger'
import { themeState } from '../utils/themes'

const { t } = useI18n()
const logger = createRendererLogger('GraphWindow')

const sessions = ref<SessionListItem[]>([])
const activeSessionId = ref<string | null>(null)
const activeSession = computed(() => {
  if (!activeSessionId.value) return null
  return sessions.value.find(s => s.id === activeSessionId.value) as any
})

const selectedEngine = ref('mermaid')
const selectedType = ref('flowchart')
const outputFormat = ref('svg')
const currentPrompt = ref('')
const generating = ref(false)
const loadingSession = ref(false)
const conversationHistory = ref<Array<{
  role: 'user' | 'assistant'
  content: string
  code?: string
  imageUrl?: string
}>>([])
const lastGeneratedImage = ref<string | null>(null)

// 可用引擎和类型
const engines = ['mermaid', 'echarts', 'plantuml']
const engineTypes: Record<string, string[]> = {
  mermaid: ['flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'gantt', 'pie'],
  echarts: ['line', 'bar', 'pie', 'scatter', 'radar', 'heatmap'],
  plantuml: ['sequence', 'class', 'activity', 'component']
}

const availableTypes = computed(() => {
  return engineTypes[selectedEngine.value] || []
})

// 监听引擎变化，更新类型
watch(selectedEngine, () => {
  if (availableTypes.value.length > 0) {
    selectedType.value = availableTypes.value[0]
  }
})

// 加载会话列表
const loadSessions = async () => {
  try {
    const dbSessions = await graphSessionsDb.getAll()
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
    const id = `graph-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const title = t('graph.defaultTitle', '新绘图会话')
    
    await graphSessionsDb.create({
      id,
      title,
      description: '',
      conversation_history: JSON.stringify([]),
      current_prompt: '',
      output_format: outputFormat.value,
      output_path: undefined
    })
    
    await loadSessions()
    activeSessionId.value = id
    conversationHistory.value = []
    currentPrompt.value = ''
    lastGeneratedImage.value = null
  } catch (error) {
    ElMessage.error('创建会话失败: ' + (error instanceof Error ? error.message : String(error)))
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
    activeSessionId.value = item.id
    const session = await graphSessionsDb.getById(item.id)
    if (session) {
      if (session.conversation_history) {
        conversationHistory.value = JSON.parse(session.conversation_history)
      }
      currentPrompt.value = session.current_prompt || ''
      outputFormat.value = session.output_format || 'svg'
      if (session.output_path) {
        lastGeneratedImage.value = session.output_path
      }
      
      // 恢复引擎和类型（从会话中或使用默认值）
      if (session.description) {
        const config = JSON.parse(session.description)
        selectedEngine.value = config.engine || 'mermaid'
        selectedType.value = config.type || 'flowchart'
      }
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
    await graphSessionsDb.update(item.id, { title: newTitle })
    await loadSessions()
  } catch (error) {
    ElMessage.error('重命名失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 复制会话
const handleDuplicateSession = async (item: SessionListItem) => {
  try {
    const session = await graphSessionsDb.getById(item.id)
    if (!session) return
    
    const id = `graph-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    await graphSessionsDb.create({
      id,
      title: session.title + ' (副本)',
      description: session.description,
      conversation_history: session.conversation_history,
      current_prompt: session.current_prompt,
      output_format: session.output_format,
      output_path: session.output_path
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
    await graphSessionsDb.delete(item.id)
    await loadSessions()
    if (activeSessionId.value === item.id) {
      activeSessionId.value = null
      conversationHistory.value = []
      currentPrompt.value = ''
      lastGeneratedImage.value = null
    }
    ElMessage.success(t('common.deleteSuccess', '删除成功'))
  } catch (error) {
    ElMessage.error('删除失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 引擎变化
const handleEngineChange = () => {
  if (availableTypes.value.length > 0) {
    selectedType.value = availableTypes.value[0]
  }
}

// 生成图表
const handleGenerate = async () => {
  if (!activeSessionId.value || !currentPrompt.value.trim()) {
    ElMessage.warning(t('graph.noPrompt', '请输入绘图需求'))
    return
  }
  
  generating.value = true
  
  try {
    // 添加用户消息
    conversationHistory.value.push({
      role: 'user',
      content: currentPrompt.value
    })
    
    // 生成提示词
    const prompt = generateGraphPrompt(selectedEngine.value, selectedType.value, currentPrompt.value)
    const codeTarget = vueRef('')
    const originKey = `graph-${Date.now()}-${Math.random().toString(36).slice(2)}`
    
    const messages: AIDialogMessage[] = [{
      role: 'user',
      content: prompt,
    }]
    const { done } = createAiTask(
      t('graph.generating', '生成图表'),
      messages,
      codeTarget,
      'chat',
      originKey,
      { stream: true }
    )
    
    await done
    
    let chartCode = codeTarget.value.trim()
    // 清理代码（移除markdown代码块标记）
    chartCode = chartCode.replace(/```[\w]*\n?/g, '').replace(/```$/g, '').trim()
    
    // 渲染图表
    let imageUrl: string | null = null
    
    try {
      if (selectedEngine.value === 'mermaid') {
        imageUrl = await renderMermaidViaApi(chartCode, outputFormat.value as 'svg' | 'png')
      } else if (selectedEngine.value === 'echarts') {
        // ECharts需要特殊处理
        const result = await renderEChartsViaIpc(chartCode, outputFormat.value as 'svg' | 'png')
        imageUrl = result
      } else {
        // 其他引擎使用Vditor渲染
        const cdn = isElectronEnv() ? localVditorCDN : vditorCDN
        const result = await renderChartViaVditor(selectedEngine.value, chartCode, cdn, {}, outputFormat.value)
        imageUrl = result
      }
    } catch (error) {
      logger.error('渲染图表失败:', error)
      ElMessage.error('渲染图表失败: ' + (error instanceof Error ? error.message : String(error)))
    }
    
    // 添加助手消息
    conversationHistory.value.push({
      role: 'assistant',
      content: t('graph.generated', '图表已生成'),
      code: chartCode,
      imageUrl: imageUrl || undefined
    })
    
    lastGeneratedImage.value = imageUrl
    
    // 保存会话
    await graphSessionsDb.update(activeSessionId.value, {
      conversation_history: JSON.stringify(conversationHistory.value),
      current_prompt: currentPrompt.value,
      output_format: outputFormat.value,
      output_path: imageUrl || undefined,
      description: JSON.stringify({
        engine: selectedEngine.value,
        type: selectedType.value
      })
    })
    
    currentPrompt.value = ''
    ElMessage.success(t('graph.generateSuccess', '生成成功'))
  } catch (error) {
    ElMessage.error('生成失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    generating.value = false
  }
}

// 优化图片（多轮对话）
const handleOptimize = async () => {
  if (!activeSessionId.value || !currentPrompt.value.trim()) {
    ElMessage.warning(t('graph.noOptimizePrompt', '请输入优化需求'))
    return
  }
  
  // 构建优化提示词（包含历史对话）
  const historyContext = conversationHistory.value
    .slice(-4) // 只使用最近4轮对话
    .map(msg => `${msg.role === 'user' ? '用户' : '助手'}: ${msg.content}`)
    .join('\n')
  
  const optimizePrompt = `${t('graph.optimizePrompt', '基于以下对话历史，优化图片：')}\n\n${historyContext}\n\n${t('graph.userRequest', '用户新需求')}: ${currentPrompt.value}`
  
  // 使用优化提示词生成
  currentPrompt.value = optimizePrompt
  await handleGenerate()
}

// 导出图片
const handleExport = async () => {
  if (!lastGeneratedImage.value) {
    ElMessage.warning(t('graph.noImage', '没有可导出的图片'))
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
    
    if (!ipcRenderer) {
      throw new Error('IPC渲染器不可用')
    }
    
    // 根据输出格式处理
    if (outputFormat.value === 'pdf' && lastGeneratedImage.value.endsWith('.svg')) {
      // SVG转PDF
      const pdfBuffer = await convertSvgToPdf(lastGeneratedImage.value)
      const result = await ipcRenderer.invoke('save-file-dialog', {
        defaultName: `graph-${Date.now()}.pdf`,
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
      })
      if (result && !result.canceled) {
        await ipcRenderer.invoke('write-file-content', {
          filePath: result.filePath,
          content: Buffer.from(pdfBuffer).toString('base64')
        })
        ElMessage.success(t('graph.exportSuccess', '导出成功'))
      }
    } else {
      // 其他格式直接保存
      const ext = outputFormat.value
      const result = await ipcRenderer.invoke('save-file-dialog', {
        defaultName: `graph-${Date.now()}.${ext}`,
        filters: [{ name: `${ext.toUpperCase()} Files`, extensions: [ext] }]
      })
      if (result && !result.canceled) {
        // 读取原文件并保存
        const fileContent = await ipcRenderer.invoke('read-file-content', lastGeneratedImage.value)
        await ipcRenderer.invoke('write-file-content', {
          filePath: result.filePath,
          content: fileContent
        })
        ElMessage.success(t('graph.exportSuccess', '导出成功'))
      }
    }
  } catch (error) {
    ElMessage.error('导出失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 主题样式
const contentAreaStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const emptyStateStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.6
}))

const configSectionStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const conversationSectionStyle = computed(() => ({
  borderColor: themeState.currentTheme.type === 'dark' 
    ? 'rgba(255, 255, 255, 0.1)' 
    : 'rgba(0, 0, 0, 0.08)'
}))

const getMessageItemStyle = (role: 'user' | 'assistant') => {
  return computed(() => ({
    backgroundColor: role === 'user' 
      ? (themeState.currentTheme.type === 'dark' ? 'rgba(33, 150, 243, 0.2)' : 'rgba(33, 150, 243, 0.1)')
      : (themeState.currentTheme.background2nd || themeState.currentTheme.background),
    color: themeState.currentTheme.textColor
  }))
}

const messageHeaderStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.7
}))

const preStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  fontFamily: "'JetBrains Mono', 'Consolas', monospace"
}))

const codePreviewStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

onMounted(() => {
  loadSessions()
})
</script>

<style scoped>
.graph-window {
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
  overflow: hidden;
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
  height: 100%;
  gap: 16px;
}

.config-section {
  padding: 16px;
  border-radius: 8px;
}

.conversation-section {
  flex: 1;
  overflow: auto;
  border: 1px solid;
  border-radius: 8px;
  padding: 16px;
}

.conversation-messages {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message-item {
  padding: 12px;
  border-radius: 8px;
}

.message-item.user {
  align-self: flex-end;
  max-width: 70%;
}

.message-item.assistant {
  align-self: flex-start;
  max-width: 70%;
}

.message-header {
  margin-bottom: 8px;
  font-size: 12px;
}

.message-content pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.image-preview {
  margin-top: 8px;
}

.image-preview img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}

.code-preview {
  margin-top: 8px;
  padding: 8px;
  border-radius: 4px;
}

.code-preview pre {
  margin: 0;
  font-size: 12px;
}

.input-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.input-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>

