<template>
  <div class="graph-window">
    <div class="main-container">
      <!-- 左侧会话列表 -->
      <SessionList
        :title="t('graph.sessionsTitle', '绘图会话')"
        :items="sessions"
        :active-index="activeSessionId || undefined"
        :disabled="generating || loadingSession || analyzingIntent"
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
        
        <div v-else class="session-content-panel" :style="panelStyle">
          <!-- 模式切换 -->
          <div class="mode-switcher" :style="modeSwitcherStyle">
            <el-radio-group v-model="mode" size="default">
              <el-radio-button value="simple">{{ t('graph.simpleMode', '简单模式') }}</el-radio-button>
              <el-radio-button value="conversation">{{ t('graph.conversationMode', '对话模式') }}</el-radio-button>
            </el-radio-group>
          </div>

          <!-- 简单模式 -->
          <div v-if="mode === 'simple'" class="simple-mode-content">
            <!-- 图表预览区域 -->
            <div class="preview-section" :style="previewSectionStyle">
              <el-scrollbar>
                <div 
                  ref="chartPreviewContainerRef"
                  class="chart-preview-container"
                  :style="chartPreviewContainerStyle"
                ></div>
              </el-scrollbar>
            </div>

            <!-- 输入区域 -->
            <div class="input-section">
              <AutoResizeTextarea
                v-model="currentPrompt"
                :placeholder="t('graph.inputPlaceholder', '输入绘图需求，AI会自动选择合适的图表引擎...')"
                :autosize="{ minRows: 3, maxRows: 8 }"
                @keydown.ctrl.enter="handleGenerate"
                @keydown.meta.enter="handleGenerate"
              />
              <div class="input-actions">
                <el-button 
                  type="primary" 
                  :loading="generating || analyzingIntent"
                  @click="handleGenerate"
                >
                  {{ generating ? t('graph.generating', '生成中...') : analyzingIntent ? t('graph.analyzingIntent', '分析意图中...') : t('graph.generate', '生成') }}
                </el-button>
                <el-button 
                  @click="handleExport"
                  :disabled="!lastGeneratedChartCode"
                >
                  {{ t('graph.export', '导出') }}
                </el-button>
              </div>
            </div>
          </div>

          <!-- 对话模式 -->
          <div v-else class="conversation-mode-content">
            <!-- 对话历史 -->
            <div class="conversation-section" :style="conversationSectionStyle">
              <el-scrollbar>
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
                      <el-button
                        v-if="msg.role === 'assistant' && msg.chartMarkdown"
                        size="small"
                        type="primary"
                        plain
                        @click="handleExport(msg.chartMarkdown)"
                        class="message-export-btn"
                      >
                        {{ t('graph.export', '导出') }}
                      </el-button>
                    </div>
                    <div class="message-content">
                      <pre v-if="msg.role === 'user'" :style="preStyle">{{ msg.content }}</pre>
                      <div v-else>
                        <!-- 使用renderMarkdownPreview渲染图表 -->
                        <el-scrollbar v-if="msg.chartMarkdown">
                          <div 
                            :ref="el => setChartContainerRef(el as HTMLElement | null, index)"
                            class="chart-container"
                            :style="chartContainerStyle"
                          ></div>
                        </el-scrollbar>
                        <div v-if="msg.code && !msg.chartMarkdown" class="code-preview" :style="codePreviewStyle">
                          <pre :style="preStyle">{{ msg.code }}</pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </el-scrollbar>
            </div>

            <!-- 输入区域 -->
            <div class="input-section">
              <AutoResizeTextarea
                v-model="currentPrompt"
                :placeholder="t('graph.inputPlaceholder', '输入绘图需求...')"
                :autosize="{ minRows: 3, maxRows: 8 }"
                @keydown.ctrl.enter="handleGenerate"
                @keydown.meta.enter="handleGenerate"
              />
              <div class="input-actions">
                <el-button 
                  type="primary" 
                  :loading="generating || analyzingIntent"
                  @click="handleGenerate"
                >
                  {{ generating ? t('graph.generating', '生成中...') : analyzingIntent ? t('graph.analyzingIntent', '分析意图中...') : t('graph.generate', '生成') }}
                </el-button>
                <el-button 
                  @click="handleOptimize"
                  :disabled="!lastGeneratedChartCode"
                >
                  {{ t('graph.optimize', '优化图片') }}
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import SessionList from '../components/common/SessionList.vue'
import type { SessionListItem } from '../components/common/SessionList.vue'
import { graphSessionsDb, type GraphSession } from '../utils/db/tool-sessions-db'
import { createAiTask } from '../utils/ai_tasks'
import { ref as vueRef } from 'vue'
import type { AIDialogMessage } from '@/types'
import { renderMarkdownPreview } from '../utils/md-utils'
import { graphEngineConfig } from '../config/graph-engine-config'
import { extractOuterJsonString } from '../utils/regex-utils'
import { createRendererLogger } from '../utils/logger'
import { themeState } from '../utils/themes'
import AutoResizeTextarea from '../components/base/AutoResizeTextarea.vue'

const { t } = useI18n()
const logger = createRendererLogger('GraphWindow')

const sessions = ref<SessionListItem[]>([])
const activeSessionId = ref<string | null>(null)
const activeSession = computed(() => {
  if (!activeSessionId.value) return null
  return sessions.value.find(s => s.id === activeSessionId.value) as any
})

const mode = ref<'simple' | 'conversation'>('simple')
const currentPrompt = ref('')
const generating = ref(false)
const analyzingIntent = ref(false)
const loadingSession = ref(false)
const conversationHistory = ref<Array<{
  role: 'user' | 'assistant'
  content: string
  code?: string
  chartMarkdown?: string
  imageUrl?: string
}>>([])
const lastGeneratedChartCode = ref<string | null>(null)
const detectedEngine = ref<string | null>(null)
const detectedType = ref<string | null>(null)
const detectedSpecialPrompt = ref<string>('')

// 图表预览容器引用
const chartPreviewContainerRef = ref<HTMLElement | null>(null)
const chartContainerRefs = ref<Map<number, HTMLElement>>(new Map())

const setChartContainerRef = (el: HTMLElement | null, index: number) => {
  if (el) {
    chartContainerRefs.value.set(index, el)
  } else {
    chartContainerRefs.value.delete(index)
  }
}

// 防抖渲染定时器
let renderDebounceTimer: ReturnType<typeof setTimeout> | null = null
const RENDER_DEBOUNCE_MS = 1000

// 获取所有支持的图表引擎列表（用于intent-processer）
const getAvailableEngines = () => {
  return graphEngineConfig.map(engine => ({
    name: engine.name.toLowerCase(),
    displayName: engine.name,
    supportedTypes: engine['graph-supported'],
    tip: engine.tip,
    specialPrompt: engine['special-prompt'] || ''
  }))
}

// Intent-processer: 分析用户需求，自动选择图表引擎
const analyzeIntent = async (userPrompt: string): Promise<{
  engine: string
  type: string
  specialPrompt: string
  notes: string
}> => {
  const availableEngines = getAvailableEngines()
  const enginesList = availableEngines.map(e => 
    `- ${e.displayName} (${e.name}): ${e.tip}，支持类型：${e.supportedTypes.join('、')}`
  ).join('\n')

  const intentPrompt = `你是一个图表意图分析助手。用户想要绘制图表，请根据用户的需求，从以下可用的图表引擎中选择最合适的一个：

可用图表引擎：
${enginesList}

用户需求：${userPrompt}

请分析用户需求，并返回一个JSON对象，格式如下：
{
  "engine": "引擎名称（小写，如mermaid、echarts、plantuml等）",
  "type": "图表类型（从该引擎支持的类型中选择一个）",
  "specialPrompt": "该引擎的特殊提示（如果有）",
  "notes": "绘图注意事项（例如：必须使用代码框包裹，如\`\`\`mermaid，不要有多余内容等）"
}

**重要要求：**
1. 只返回JSON对象，不要包含任何其他文字
2. engine字段必须是上述引擎列表中的一个（小写）
3. type字段必须从该引擎的supportedTypes中选择
4. notes字段必须强调使用代码框包裹，格式如\`\`\`{engine}\`\`\``

  const intentTarget = vueRef('')
  const originKey = `graph-intent-${Date.now()}-${Math.random().toString(36).slice(2)}`
  
  const messages: AIDialogMessage[] = [{
    role: 'user',
    content: intentPrompt,
  }]
  
  const { done } = createAiTask(
    t('graph.analyzingIntent', '分析意图中...'),
    messages,
    intentTarget,
    'chat',
    originKey,
    { stream: true }
  )
  
  await done
  
  // 提取JSON
  let jsonStr = extractOuterJsonString(intentTarget.value)
  if (!jsonStr) {
    // 如果提取失败，尝试清理
    jsonStr = intentTarget.value.trim()
    // 移除可能的markdown代码块标记
    jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  }
  
  try {
    const result = JSON.parse(jsonStr)
    return {
      engine: result.engine || 'mermaid',
      type: result.type || 'flowchart',
      specialPrompt: result.specialPrompt || '',
      notes: result.notes || ''
    }
  } catch (error) {
    logger.warn('解析意图分析结果失败，使用默认值:', error)
    // 默认使用mermaid
    return {
      engine: 'mermaid',
      type: 'flowchart',
      specialPrompt: '',
      notes: '必须使用代码框包裹，如```mermaid'
    }
  }
}

// 生成图表代码的提示词
const generateChartCodePrompt = (
  userPrompt: string,
  engine: string,
  type: string,
  specialPrompt: string,
  notes: string
): string => {
  const engineConfig = graphEngineConfig.find(e => e.name.toLowerCase() === engine.toLowerCase())
  const engineDisplayName = engineConfig?.name || engine
  
  return `你现在需要使用${engineDisplayName}来绘制一个${type}图表。

用户需求：${userPrompt}

${specialPrompt ? `特殊要求：${specialPrompt}\n` : ''}
${notes ? `注意事项：${notes}\n` : ''}

**输出要求：**
1. 必须使用代码框包裹，格式：\`\`\`${engine}\n[代码内容]\n\`\`\`
2. 代码框的语言标识必须是：${engine}
3. 代码内容必须符合${engineDisplayName}的语法规范
4. 只输出代码框，不要包含任何其他文字或解释
5. 从第一行开始就是代码框`
}

// 防抖渲染图表
const debouncedRenderChart = async (container: HTMLElement, markdown: string) => {
  if (renderDebounceTimer) {
    clearTimeout(renderDebounceTimer)
  }
  
  renderDebounceTimer = setTimeout(async () => {
    try {
      await renderMarkdownPreview(container, markdown)
    } catch (error) {
      logger.error('渲染图表失败:', error)
      container.innerHTML = `<p style="color: var(--el-color-danger);">渲染失败: ${error instanceof Error ? error.message : String(error)}</p>`
    }
    renderDebounceTimer = null
  }, RENDER_DEBOUNCE_MS)
}

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
      output_format: 'svg',
      output_path: undefined
    })
    
    await loadSessions()
    activeSessionId.value = id
    conversationHistory.value = []
    currentPrompt.value = ''
    lastGeneratedChartCode.value = null
    detectedEngine.value = null
    detectedType.value = null
    detectedSpecialPrompt.value = ''
  } catch (error) {
    ElMessage.error('创建会话失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 选择会话
const handleSelectSession = async (item: SessionListItem) => {
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
      } else {
        conversationHistory.value = []
      }
      currentPrompt.value = session.current_prompt || ''
      
      // 恢复模式（从description中读取）
      if (session.description) {
        try {
          const config = JSON.parse(session.description)
          mode.value = config.mode || 'simple'
          detectedEngine.value = config.engine || null
          detectedType.value = config.type || null
          detectedSpecialPrompt.value = config.specialPrompt || ''
        } catch {
          mode.value = 'simple'
        }
      }
      
      // 恢复最后生成的图表代码
      if (conversationHistory.value.length > 0) {
        const lastMsg = conversationHistory.value[conversationHistory.value.length - 1]
        if (lastMsg.chartMarkdown) {
          lastGeneratedChartCode.value = lastMsg.chartMarkdown
        } else if (lastMsg.code) {
          lastGeneratedChartCode.value = lastMsg.code
        }
      }
      
      // 等待DOM更新后渲染图表
      await nextTick()
      if (mode.value === 'simple' && lastGeneratedChartCode.value && chartPreviewContainerRef.value) {
        await renderMarkdownPreview(chartPreviewContainerRef.value, lastGeneratedChartCode.value)
      } else if (mode.value === 'conversation' && conversationHistory.value.length > 0) {
        // 对话模式下，等待DOM更新后渲染所有图表
        setTimeout(async () => {
          for (let i = 0; i < conversationHistory.value.length; i++) {
            const msg = conversationHistory.value[i]
            if (msg.role === 'assistant' && msg.chartMarkdown) {
              const container = chartContainerRefs.value.get(i)
              if (container) {
                try {
                  await renderMarkdownPreview(container, msg.chartMarkdown)
                } catch (error) {
                  logger.error(`渲染历史消息 ${i} 的图表失败:`, error)
                }
              }
            }
          }
        }, 300)
      }
      
      // 渲染图表
      await nextTick()
      if (mode.value === 'simple' && chartPreviewContainerRef.value && lastGeneratedChartCode.value) {
        await debouncedRenderChart(chartPreviewContainerRef.value, lastGeneratedChartCode.value)
      } else if (mode.value === 'conversation') {
        // 渲染对话模式中的所有图表
        for (const [index, msg] of conversationHistory.value.entries()) {
          if (msg.role === 'assistant' && msg.chartMarkdown) {
            const container = chartContainerRefs.value.get(index)
            if (container) {
              await debouncedRenderChart(container, msg.chartMarkdown)
            }
          }
        }
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
      lastGeneratedChartCode.value = null
    }
    ElMessage.success(t('common.deleteSuccess', '删除成功'))
  } catch (error) {
    ElMessage.error('删除失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 生成图表
const handleGenerate = async () => {
  if (!activeSessionId.value || !currentPrompt.value.trim()) {
    ElMessage.warning(t('graph.noPrompt', '请输入绘图需求'))
    return
  }
  
  generating.value = true
  analyzingIntent.value = true
  
  try {
    const userPrompt = currentPrompt.value
    
    // 步骤1: 分析意图，自动选择图表引擎
    const intentResult = await analyzeIntent(userPrompt)
    detectedEngine.value = intentResult.engine
    detectedType.value = intentResult.type
    detectedSpecialPrompt.value = intentResult.specialPrompt
    
    analyzingIntent.value = false
    
    // 步骤2: 生成图表代码
    const chartPrompt = generateChartCodePrompt(
      userPrompt,
      intentResult.engine,
      intentResult.type,
      intentResult.specialPrompt,
      intentResult.notes
    )
    
    const codeTarget = vueRef('')
    const originKey = `graph-${Date.now()}-${Math.random().toString(36).slice(2)}`
    
    const messages: AIDialogMessage[] = [{
      role: 'user',
      content: chartPrompt,
    }]
    
    const { done } = createAiTask(
      t('graph.generating', '生成图表'),
      messages,
      codeTarget,
      'chat',
      originKey,
      { stream: true }
    )
    
    // 监听代码生成，实时渲染
    const renderWatcher = watch(
      () => codeTarget.value,
      async (newCode) => {
        if (!newCode.trim()) return
        
        // 提取代码块内容
        let chartCode = newCode.trim()
        const codeBlockMatch = chartCode.match(/```(\w+)\s*\n([\s\S]*?)\n?```/)
        
        if (codeBlockMatch) {
          const engine = codeBlockMatch[1]
          const code = codeBlockMatch[2].trim()
          
          // 构建markdown（包含代码块）
          const markdown = `\`\`\`${engine}\n${code}\n\`\`\``
          
          // 实时渲染（防抖）
          if (mode.value === 'simple' && chartPreviewContainerRef.value) {
            await debouncedRenderChart(chartPreviewContainerRef.value, markdown)
          }
        }
      },
      { immediate: false }
    )
    
    await done
    
    // 清理监听器
    renderWatcher()
    
    let chartCode = codeTarget.value.trim()
    let chartMarkdown = chartCode
    
    // 确保代码被代码块包裹
    if (!chartCode.includes('```')) {
      const engine = detectedEngine.value || 'mermaid'
      chartMarkdown = `\`\`\`${engine}\n${chartCode}\n\`\`\``
    } else {
      // 提取代码块内容用于保存
      const codeBlockMatch = chartCode.match(/```(\w+)\s*\n([\s\S]*?)\n?```/)
      if (codeBlockMatch) {
        chartCode = codeBlockMatch[2].trim()
      }
    }
    
    lastGeneratedChartCode.value = chartMarkdown
    
    // 添加用户消息（对话模式）
    if (mode.value === 'conversation') {
      conversationHistory.value.push({
        role: 'user',
        content: userPrompt
      })
    }
    
    // 添加助手消息
    const assistantMsg: typeof conversationHistory.value[0] = {
      role: 'assistant',
      content: t('graph.generated', '图表已生成'),
      chartMarkdown: chartMarkdown,
      code: chartCode
    }
    
    if (mode.value === 'conversation') {
      conversationHistory.value.push(assistantMsg)
    }
    
    // 渲染图表
    await nextTick()
    if (mode.value === 'simple' && chartPreviewContainerRef.value) {
      await renderMarkdownPreview(chartPreviewContainerRef.value, chartMarkdown)
    } else if (mode.value === 'conversation') {
      // 对话模式下，等待DOM更新后渲染新添加的图表
      // watch会自动处理渲染，这里只需要确保DOM已更新
      await nextTick()
      setTimeout(async () => {
        const msgIndex = conversationHistory.value.length - 1
        const container = chartContainerRefs.value.get(msgIndex)
        if (container && assistantMsg.chartMarkdown) {
          try {
            await renderMarkdownPreview(container, assistantMsg.chartMarkdown)
          } catch (error) {
            logger.error('渲染新图表失败:', error)
          }
        }
      }, 200)
    }
    
    // 保存会话
    await graphSessionsDb.update(activeSessionId.value, {
      conversation_history: JSON.stringify(conversationHistory.value),
      current_prompt: currentPrompt.value,
      output_format: 'svg',
      description: JSON.stringify({
        mode: mode.value,
        engine: detectedEngine.value,
        type: detectedType.value,
        specialPrompt: detectedSpecialPrompt.value
      })
    })
    
    currentPrompt.value = ''
    ElMessage.success(t('graph.generateSuccess', '生成成功'))
  } catch (error) {
    ElMessage.error('生成失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    generating.value = false
    analyzingIntent.value = false
  }
}

// 优化图片（多轮对话）
const handleOptimize = async () => {
  if (!activeSessionId.value || !currentPrompt.value.trim()) {
    ElMessage.warning(t('graph.noOptimizePrompt', '请输入优化需求'))
    return
  }
  
  if (mode.value !== 'conversation') {
    ElMessage.warning(t('graph.optimizeOnlyInConversation', '优化功能仅在对话模式下可用'))
    return
  }
  
  // 构建优化提示词（包含历史对话）
  const historyContext = conversationHistory.value
    .slice(-4) // 只使用最近4轮对话
    .map(msg => `${msg.role === 'user' ? t('graph.user', '用户') : t('graph.assistant', '助手')}: ${msg.content}`)
    .join('\n')
  
  const optimizePrompt = `${t('graph.optimizePrompt', '基于以下对话历史，优化图片：')}\n\n${historyContext}\n\n${t('graph.userRequest', '用户新需求')}: ${currentPrompt.value}`
  
  // 使用优化提示词生成
  currentPrompt.value = optimizePrompt
  await handleGenerate()
}

// 导出图片（统一使用chart-renderer）
const handleExport = async (chartMarkdown?: string) => {
  const chartCode = chartMarkdown || lastGeneratedChartCode.value
  if (!chartCode) {
    ElMessage.warning(t('graph.noChart', '没有可导出的图表'))
    return
  }
  
  try {
    // 确保chartCode是字符串
    const chartCodeStr = typeof chartCode === 'string' ? chartCode : String(chartCode)
    
    // 从markdown中提取代码
    let code = chartCodeStr
    let engine = detectedEngine.value || 'mermaid'
    
    const codeBlockMatch = typeof code === 'string' ? code.match(/```(\w+)\s*\n([\s\S]*?)\n?```/) : null
    if (codeBlockMatch) {
      engine = codeBlockMatch[1]
      code = codeBlockMatch[2].trim()
    } else {
      // 如果没有代码块，直接使用代码
      code = typeof code === 'string' ? code.trim() : String(code).trim()
    }
    
    // 获取 IPC 渲染器
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
    
    // 打开保存对话框，让用户选择格式
    const result = await ipcRenderer.invoke('save-file-dialog', {
      defaultName: `graph-${Date.now()}.svg`,
      filters: [
        { name: 'SVG Files', extensions: ['svg'] },
        { name: 'PNG Files', extensions: ['png'] },
        { name: 'PDF Files', extensions: ['pdf'] }
      ]
    })
    
    if (!result || result.canceled || !result.filePath) {
      return
    }
    
    // 根据文件扩展名确定格式
    const filePath = result.filePath
    const ext = filePath.split('.').pop()?.toLowerCase() || 'svg'
    
    // 参考 chart-pre-renderer.js 的处理方式：targetFormat = format === 'bitmap' ? 'png' : 'svg'
    // 对于 PDF，先渲染为 SVG，然后转换
    const targetFormat = ext === 'png' ? 'png' : 'svg'
    
    // 使用 renderChart 渲染图表（参考 chart-pre-renderer.js 的处理方式）
    const { renderChart } = await import('../utils/chart-renderer')
    const imageUrl = await renderChart({
      chartType: engine,
      code: code,
      format: targetFormat as 'svg' | 'png'
    })
    
    if (!imageUrl) {
      throw new Error('渲染失败')
    }
    
    if (ext === 'svg') {
      // SVG：直接写入文件（已经弹出对话框，不需要再弹出）
      let svgContent: string
      if (imageUrl.startsWith('data:')) {
        // data URL -> 提取内容
        const base64Match = imageUrl.match(/data:image\/svg\+xml[^,]+,(.+)/)
        if (base64Match) {
          try {
            svgContent = decodeURIComponent(base64Match[1])
          } catch {
            svgContent = atob(base64Match[1])
          }
        } else {
          const base64Match2 = imageUrl.match(/data:[^,]+,(.+)/)
          if (base64Match2) {
            try {
              svgContent = decodeURIComponent(base64Match2[1])
            } catch {
              svgContent = atob(base64Match2[1])
            }
          } else {
            throw new Error('无法解析 SVG data URL')
          }
        }
      } else if (imageUrl.startsWith('blob:')) {
        // blob URL -> 文本内容
        const response = await fetch(imageUrl)
        svgContent = await response.text()
      } else if (imageUrl.startsWith('http://localhost:52521/images/') || imageUrl.startsWith('http://')) {
        // HTTP URL -> 文本内容
        const response = await fetch(imageUrl)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        svgContent = await response.text()
      } else if (imageUrl.startsWith('file://')) {
        // file:// URL -> 本地路径 -> 读取内容
        let localPath = imageUrl.replace(/^file:\/\//, '')
        if (localPath.startsWith('/') && /^[A-Za-z]:/.test(localPath.substring(1))) {
          localPath = localPath.substring(1)
        }
        svgContent = await ipcRenderer.invoke('read-file-content', localPath) as string
      } else {
        // 本地文件路径 -> 读取内容
        svgContent = await ipcRenderer.invoke('read-file-content', imageUrl) as string
      }
      
      // 直接写入文件
      await ipcRenderer.invoke('write-file-content', {
        filePath: filePath,
        content: svgContent,
        encoding: 'utf8'
      })
      ElMessage.success(t('graph.exportSuccess', '导出成功'))
    } else if (ext === 'png') {
      // PNG：直接写入文件（已经弹出对话框，不需要再弹出）
      // 获取 PNG 的 base64 内容
      let base64Data: string
      if (imageUrl.startsWith('data:')) {
        // data URL -> 提取 base64
        const commaIdx = imageUrl.indexOf(',')
        base64Data = imageUrl.substring(commaIdx + 1)
      } else if (imageUrl.startsWith('blob:')) {
        // blob URL -> data URL -> base64
        const response = await fetch(imageUrl)
        const blob = await response.blob()
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result || ''))
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
        const commaIdx = dataUrl.indexOf(',')
        base64Data = dataUrl.substring(commaIdx + 1)
      } else if (imageUrl.startsWith('http://localhost:52521/images/') || imageUrl.startsWith('http://')) {
        // HTTP URL -> fetch 获取内容 -> base64
        const response = await fetch(imageUrl)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        const blob = await response.blob()
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result || ''))
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
        const commaIdx = dataUrl.indexOf(',')
        base64Data = dataUrl.substring(commaIdx + 1)
      } else {
        // 本地文件路径 -> 读取为 base64
        const fileData = await ipcRenderer.invoke('read-file-for-upload', imageUrl) as {
          name: string
          data: string
          mimeType: string
        }
        base64Data = fileData.data
      }
      
      // 直接写入文件（base64 编码）
      await ipcRenderer.invoke('write-file-content', {
        filePath: filePath,
        content: base64Data,
        encoding: 'base64'
      })
      ElMessage.success(t('graph.exportSuccess', '导出成功'))
    } else if (ext === 'pdf') {
      // PDF：先渲染为 SVG，然后转换为 PDF（参考 chart-generation-tool.ts 和 FomulaRecognition.vue）
      const svgImageUrl = await renderChart({
        chartType: engine,
        code: code,
        format: 'svg'
      })
      
      if (!svgImageUrl) {
        throw new Error('渲染 SVG 失败')
      }
      
      // 如果 SVG URL 是 HTTP URL，需要先转换为本地路径（参考 FomulaRecognition.vue）
      let svgPath: string
      if (svgImageUrl.startsWith('http://localhost:52521/images/') || svgImageUrl.startsWith('http://')) {
        // HTTP URL -> 本地路径
        const { image2local } = await import('../utils/md-utils.js')
        const mdTmp = `![x](${svgImageUrl})`
        const converted = await image2local(mdTmp)
        const m = converted.match(/!\[.*?\]\((.+?)\)/)
        svgPath = m ? m[1] : svgImageUrl
      } else if (svgImageUrl.startsWith('data:')) {
        // data URL -> 上传为 HTTP URL -> 本地路径
        const blob = await (await fetch(svgImageUrl)).blob()
        const fileName = `graph_${Date.now()}.svg`
        const formData = new FormData()
        const file = new File([blob], fileName, { type: 'image/svg+xml' })
        formData.append('file[]', file, fileName)
        const resp = await fetch('http://localhost:52521/api/image/upload?keepName=1', { method: 'POST', body: formData })
        if (!resp.ok) throw new Error('上传 SVG 失败')
        const json = await resp.json()
        const uploaded = json?.data?.succMap ? Object.keys(json.data.succMap)[0] : fileName
        const httpUrl = `http://localhost:52521/images/${uploaded}`
        
        const { image2local } = await import('../utils/md-utils.js')
        const mdTmp = `![x](${httpUrl})`
        const converted = await image2local(mdTmp)
        const m = converted.match(/!\[.*?\]\((.+?)\)/)
        svgPath = m ? m[1] : httpUrl
      } else if (svgImageUrl.startsWith('blob:')) {
        // blob URL -> data URL -> 上传为 HTTP URL -> 本地路径
        const blob = await (await fetch(svgImageUrl)).blob()
        const fileName = `graph_${Date.now()}.svg`
        const formData = new FormData()
        const file = new File([blob], fileName, { type: 'image/svg+xml' })
        formData.append('file[]', file, fileName)
        const resp = await fetch('http://localhost:52521/api/image/upload?keepName=1', { method: 'POST', body: formData })
        if (!resp.ok) throw new Error('上传 SVG 失败')
        const json = await resp.json()
        const uploaded = json?.data?.succMap ? Object.keys(json.data.succMap)[0] : fileName
        const httpUrl = `http://localhost:52521/images/${uploaded}`
        
        const { image2local } = await import('../utils/md-utils.js')
        const mdTmp = `![x](${httpUrl})`
        const converted = await image2local(mdTmp)
        const m = converted.match(/!\[.*?\]\((.+?)\)/)
        svgPath = m ? m[1] : httpUrl
      } else {
        // 本地文件路径
        svgPath = svgImageUrl
      }
      
      // 使用统一的 SVG 转 PDF 工具函数（参考 chart-generation-tool.ts）
      const { convertSvgToPdf } = await import('../utils/svg-to-pdf-utils')
      const pdfPath = await convertSvgToPdf(svgPath, { returnUrl: false })
      
      // 读取 PDF 文件为 base64，然后写入目标文件（已经弹出对话框，不需要再弹出）
      const fileData = await ipcRenderer.invoke('read-file-for-upload', pdfPath) as {
        name: string
        data: string
        mimeType: string
      }
      
      // 直接写入文件（base64 编码）
      await ipcRenderer.invoke('write-file-content', {
        filePath: filePath,
        content: fileData.data,
        encoding: 'base64'
      })
      ElMessage.success(t('graph.exportSuccess', '导出成功'))
    } else {
      throw new Error(`不支持的格式: ${ext}`)
    }
  } catch (error) {
    ElMessage.error('导出失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 监听模式切换，重新渲染图表
watch(mode, async () => {
  if (!activeSessionId.value) return
  
  await nextTick()
  
  if (mode.value === 'simple' && chartPreviewContainerRef.value && lastGeneratedChartCode.value) {
    await renderMarkdownPreview(chartPreviewContainerRef.value, lastGeneratedChartCode.value)
  } else if (mode.value === 'conversation') {
    // 渲染对话模式中的所有图表
    for (const [index, msg] of conversationHistory.value.entries()) {
      if (msg.role === 'assistant' && msg.chartMarkdown) {
        const container = chartContainerRefs.value.get(index)
        if (container) {
          await renderMarkdownPreview(container, msg.chartMarkdown)
        }
      }
    }
  }
  
  // 保存模式到数据库
  if (activeSessionId.value) {
    const session = await graphSessionsDb.getById(activeSessionId.value)
    if (session) {
      let config: any = {}
      try {
        if (session.description) {
          config = JSON.parse(session.description)
        }
      } catch {}
      
      config.mode = mode.value
      
      await graphSessionsDb.update(activeSessionId.value, {
        description: JSON.stringify(config)
      })
    }
  }
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

const modeSwitcherStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd || themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  padding: '16px',
  borderRadius: '8px',
  marginBottom: '16px'
}))

const previewSectionStyle = computed(() => ({
  flex: 1,
  minHeight: 0,
  border: `1px solid ${themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
  borderRadius: '8px',
  padding: '16px',
  overflow: 'auto'
}))

const chartPreviewContainerStyle = computed(() => ({
  width: '100%',
  minHeight: '100%'
}))

const conversationSectionStyle = computed(() => ({
  flex: 1,
  overflow: 'auto',
  border: `1px solid ${themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
  borderRadius: '8px',
  padding: '16px'
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

const chartContainerStyle = computed(() => ({
  width: '100%',
  minHeight: '100px'
}))

// 监听对话历史变化，自动渲染图表
watch(
  () => conversationHistory.value,
  async (newHistory) => {
    if (mode.value === 'conversation' && newHistory.length > 0) {
      await nextTick()
      // 等待DOM更新后渲染所有图表
      setTimeout(async () => {
        for (let i = 0; i < newHistory.length; i++) {
          const msg = newHistory[i]
          if (msg.role === 'assistant' && msg.chartMarkdown) {
            const container = chartContainerRefs.value.get(i)
            if (container) {
              try {
                await renderMarkdownPreview(container, msg.chartMarkdown)
              } catch (error) {
                logger.error(`渲染消息 ${i} 的图表失败:`, error)
              }
            }
          }
        }
      }, 200)
    }
  },
  { deep: true }
)

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
  padding: 16px;
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
  gap: 16px;
}

.mode-switcher {
  flex-shrink: 0;
}

.simple-mode-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 16px;
}

.preview-section {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.preview-section :deep(.el-scrollbar) {
  height: 100%;
}

.chart-preview-container {
  width: 100%;
  min-height: 100%;
}

.conversation-mode-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 16px;
}

.conversation-section {
  flex: 1;
  overflow: hidden;
}

.conversation-section :deep(.el-scrollbar) {
  height: 100%;
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
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.message-export-btn {
  margin-left: 8px;
}

.message-content pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.chart-container {
  margin-top: 8px;
  width: 100%;
  min-height: 100px;
}

.chart-container :deep(.el-scrollbar) {
  max-height: 600px;
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
  flex-shrink: 0;
}

.input-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
