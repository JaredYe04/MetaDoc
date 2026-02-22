<template>
  <div class="graph-window" :style="containerStyle">
    <div class="main-container">
      <!-- 左侧会话列表（含右侧 resize 与折叠，主内容通过默认 slot 传入） -->
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
      >
        <!-- 右侧内容区域 -->
        <div class="content-area" :style="panelStyle" style="position: relative">
          <LoadingOverlay :show="loadingSession" :message="t('common.loading', '加载中...')" />
          <div v-if="!activeSession" class="empty-state" :style="emptyStateStyle">
            <p>{{ t('graph.noSessionSelected', '请选择一个会话或创建新会话') }}</p>
          </div>

          <div v-else class="dialog-container">
            <ScrollArea class="conversation-scroll">
              <GraphMessageBubble
                v-for="(msg, index) in messages.filter((item) => item.role !== 'system')"
                :key="index"
                :message="msg"
                :index="index"
                :is-streaming="
                  index === messages.length - 1 && isStreaming && msg.role === 'assistant'
                "
                :streaming-content="
                  index === messages.length - 1 && isStreaming ? streamingContent : ''
                "
                @delete="onMsgDelete"
                @edit="onMsgEdit"
                @regenerate="regenerate"
                @export="handleExport"
              />
              <div class="conversation-bottom-spacer" />
              <ScrollBar />
            </ScrollArea>
            <div class="composer-wrapper">
              <ChatComposer
                v-model="currentPrompt"
                :loading="generating || analyzingIntent"
                :disabled="false"
                :placeholder="
                  t('graph.inputPlaceholder', '输入绘图需求，AI会自动选择合适的图表引擎...')
                "
                :show-voice="false"
                :show-attach="false"
                :show-knowledge-base="false"
                @submit="handleGenerate"
                @cancel="handleCancel"
              />
            </div>
          </div>
        </div>
      </SessionList>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import SessionList from '../components/common/SessionList.vue'
import type { SessionListItem } from '../components/common/SessionList.vue'
import { ScrollArea, ScrollBar } from '@renderer/components/ui/scroll-area'
import { LoadingOverlay } from '@renderer/components/ui/loading-overlay'
import { graphSessionsDb } from '../utils/db/tool-sessions-db'
import { createAiTask, cancelAiTask } from '../utils/ai_tasks'
import { ref as vueRef } from 'vue'
import type { AIDialogMessage } from '@/types'
import { graphEngineConfig } from '../config/graph-engine-config'
import { extractOuterJsonString } from '../utils/regex-utils'
import { createRendererLogger } from '../utils/logger'
import { themeState } from '../utils/themes'
import GraphMessageBubble from '../components/GraphMessageBubble.vue'
import ChatComposer from '../components/chat/ChatComposer.vue'
import { updateTitlePrompt } from '../utils/prompts'
import {
  parseSchemaJson,
  DOCUMENT_TITLE_SCHEMA,
  type DocumentTitleSchemaResult
} from '../utils/schemas'
import { getSetting } from '../utils/settings'
import { ai_types } from '../utils/ai_tasks'
import { useWorkspace } from '../stores/workspace'

const { t } = useI18n()
const logger = createRendererLogger('GraphWindow')
const workspace = useWorkspace()

const GRAPH_ROUTES = ['/graph', '/ai-graph', '/smart-drawing-assistant']
const ourTabId = computed(
  () =>
    workspace.tabs.find((tab) => tab.kind === 'tool' && GRAPH_ROUTES.includes(tab.route ?? ''))
      ?.id ?? null
)

const sessions = ref<SessionListItem[]>([])
const activeSessionId = ref<string | null>(null)
const activeSession = computed(() => {
  if (!activeSessionId.value) return null
  return sessions.value.find((s) => s.id === activeSessionId.value) as any
})

const currentPrompt = ref('')
const generating = ref(false)
const analyzingIntent = ref(false)
const loadingSession = ref(false)
const currentAiTaskHandle = ref<string | null>(null)

// 跟踪会话是否被手动重命名过
const manuallyRenamedSessions = ref<Set<string>>(new Set())

// 消息列表（统一使用 messages，替代 conversationHistory）
interface GraphMessage extends AIDialogMessage {
  chartMarkdown?: string
  code?: string
}

const messages = ref<GraphMessage[]>([])
const lastGeneratedChartCode = ref<string | null>(null)
const detectedEngine = ref<string | null>(null)
const detectedType = ref<string | null>(null)
const detectedSpecialPrompt = ref<string>('')

// 流式显示相关的refs
const streamingContent = ref<string>('')
const streamingDonePromise = ref<Promise<any> | null | undefined>(null)
const isStreaming = computed(() => {
  return streamingDonePromise.value !== null && streamingDonePromise.value !== undefined
})

// 获取所有支持的图表引擎列表（用于intent-processer）
const getAvailableEngines = () => {
  return graphEngineConfig.map((engine) => ({
    name: engine.name.toLowerCase(),
    displayName: engine.name,
    supportedTypes: engine['graph-supported'],
    tip: engine.tip,
    specialPrompt: engine['special-prompt'] || ''
  }))
}

// Intent-processer: 分析用户需求，自动选择图表引擎
const analyzeIntent = async (
  userPrompt: string
): Promise<{
  engine: string
  type: string
  specialPrompt: string
  notes: string
}> => {
  const availableEngines = getAvailableEngines()
  const enginesList = availableEngines
    .map(
      (e) => `- ${e.displayName} (${e.name}): ${e.tip}，支持类型：${e.supportedTypes.join('、')}`
    )
    .join('\n')

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

  const messages: AIDialogMessage[] = [
    {
      role: 'user',
      content: intentPrompt
    }
  ]

  const { done } = createAiTask(
    t('graph.analyzingIntent', '分析意图中...'),
    messages,
    intentTarget,
    'chat',
    originKey,
    { stream: true }
  )

  // 设置流式显示（虽然意图分析通常很快，但也显示）
  streamingContent.value = ''
  streamingDonePromise.value = done

  try {
    await done
  } catch (error) {
    // 如果是取消错误，保留已生成的内容，当作完成处理
    const isCancelled =
      error instanceof Error &&
      (error.message === '任务已取消' ||
        error.message.includes('任务已取消') ||
        (error as any).name === 'AbortError')

    if (!isCancelled) {
      // 非取消错误，重新抛出
      throw error
    }
    // 取消时继续执行，使用已生成的内容
  }

  streamingDonePromise.value = null

  // 提取JSON
  let jsonStr = extractOuterJsonString(intentTarget.value)
  if (!jsonStr) {
    // 如果提取失败，尝试清理
    jsonStr = intentTarget.value.trim()
    // 移除可能的markdown代码块标记
    jsonStr = jsonStr
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim()
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

// 检查用户是否想要优化之前的图表
const isOptimizeRequest = (userPrompt: string): boolean => {
  const optimizeKeywords = [
    '优化',
    '改进',
    '修改',
    '调整',
    '更新',
    '改一下',
    '改改',
    '优化一下',
    '改进一下',
    '使用',
    '改成',
    '改为',
    '改为',
    '改成',
    '换成',
    '换为'
  ]
  return optimizeKeywords.some((keyword) => userPrompt.includes(keyword))
}

// 检查是否应该使用之前的引擎（多轮对话优化场景）
const shouldUsePreviousEngine = (userPrompt: string, hasPreviousChart: boolean): boolean => {
  if (!hasPreviousChart) return false

  // 如果用户明确指定了新引擎，不使用之前的
  const engineKeywords = ['mermaid', 'echarts', 'plantuml', 'graphviz', 'mindmap', 'markmap']
  const hasExplicitEngine = engineKeywords.some((keyword) =>
    userPrompt.toLowerCase().includes(keyword)
  )
  if (hasExplicitEngine) return false

  // 如果是优化请求，使用之前的引擎
  if (isOptimizeRequest(userPrompt)) return true

  // 如果对话历史中有图表，且用户没有明确要求新图表，使用之前的引擎
  return true
}

// 获取最后一个生成的图表代码
const getLastChartCode = (): string | null => {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const msg = messages.value[i]
    if (msg.role === 'assistant' && msg.chartMarkdown) {
      return msg.chartMarkdown
    }
  }
  return null
}

// 构建对话历史（用于多轮对话）- 类似 AIChat.vue 的实现
const buildConversationHistory = (): AIDialogMessage[] => {
  // 深拷贝消息列表，因为Proxy不能直接拷贝
  const messageCopy: AIDialogMessage[] = JSON.parse(JSON.stringify(messages.value))

  // 过滤系统消息，并转换格式
  const history: AIDialogMessage[] = []

  for (const msg of messageCopy) {
    if (msg.role === 'system') continue

    // 对于助手消息，如果有图表代码，使用图表代码作为内容
    if (msg.role === 'assistant' && (msg as GraphMessage).chartMarkdown) {
      history.push({
        role: 'assistant',
        content: (msg as GraphMessage).chartMarkdown || msg.content
      })
    } else {
      history.push({
        role: msg.role,
        content: msg.content
      })
    }
  }

  return history
}

// 生成图表代码的提示词
const generateChartCodePrompt = (
  userPrompt: string,
  engine: string,
  type: string,
  specialPrompt: string,
  notes: string,
  isOptimize: boolean = false,
  previousChartCode?: string | null
): string => {
  const engineConfig = graphEngineConfig.find((e) => e.name.toLowerCase() === engine.toLowerCase())
  const engineDisplayName = engineConfig?.name || engine

  let prompt = ''

  if (isOptimize && previousChartCode) {
    // 优化模式：包含之前的图表代码和对话历史
    const recentHistory = messages.value
      .filter((msg) => msg.role !== 'system')
      .slice(-6) // 最近3轮对话
      .map((msg) => {
        if (msg.role === 'assistant' && msg.chartMarkdown) {
          return `助手: [图表代码]\n${msg.chartMarkdown}`
        }
        return `${msg.role === 'user' ? '用户' : '助手'}: ${msg.content}`
      })
      .join('\n\n')

    prompt = `用户想要优化之前的图表。以下是对话历史和之前的图表代码：

对话历史：
${recentHistory}

用户的新需求：${userPrompt}

请根据用户的新需求，优化或修改之前的图表代码。`
  } else {
    // 新建模式：包含对话历史（如果有）
    const history = messages.value
      .filter((msg) => msg.role !== 'system')
      .slice(0, -1) // 排除当前用户消息（因为还没添加到 messages）
      .map((msg) => {
        if (msg.role === 'assistant' && msg.chartMarkdown) {
          return `助手: [图表代码]\n${msg.chartMarkdown}`
        }
        return `${msg.role === 'user' ? '用户' : '助手'}: ${msg.content}`
      })

    if (history.length > 0) {
      prompt = `以下是之前的对话历史：

${history.join('\n\n')}

---

现在用户的新需求是：${userPrompt}

请根据对话历史和用户的新需求，使用${engineDisplayName}来绘制一个${type}图表。`
    } else {
      prompt = `你现在需要使用${engineDisplayName}来绘制一个${type}图表。

用户需求：${userPrompt}`
    }
  }

  return `${prompt}

${specialPrompt ? `特殊要求：${specialPrompt}\n` : ''}
${notes ? `注意事项：${notes}\n` : ''}

**输出要求：**
1. 必须使用代码框包裹，格式：\`\`\`${engine}\n[代码内容]\n\`\`\`
2. 代码框的语言标识必须是：${engine}
3. 代码内容必须符合${engineDisplayName}的语法规范
4. 只输出代码框，不要包含任何其他文字或解释
5. 从第一行开始就是代码框`
}

// 加载会话列表
const loadSessions = async () => {
  try {
    const dbSessions = await graphSessionsDb.getAll()
    sessions.value = dbSessions.map((s) => ({
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
    const tid = ourTabId.value
    if (tid) workspace.setTabToolState(tid, { activeSessionId: id })
    messages.value = []
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
    const tid = ourTabId.value
    if (tid) workspace.setTabToolState(tid, { activeSessionId: item.id })
    const session = await graphSessionsDb.getById(item.id)
    if (session) {
      if (session.conversation_history) {
        messages.value = JSON.parse(session.conversation_history) as GraphMessage[]
      } else {
        messages.value = []
      }
      // 恢复配置（从description中读取）
      if (session.description) {
        try {
          const config = JSON.parse(session.description)
          detectedEngine.value = config.engine || null
          detectedType.value = config.type || null
          detectedSpecialPrompt.value = config.specialPrompt || ''
          // 如果 description 中有 manuallyRenamed 标记，添加到集合中
          if (config.manuallyRenamed) {
            manuallyRenamedSessions.value.add(item.id)
          }
        } catch {
          // 忽略解析错误
        }
      }

      // 恢复最后生成的图表代码
      if (messages.value.length > 0) {
        for (let i = messages.value.length - 1; i >= 0; i--) {
          const msg = messages.value[i]
          if (msg.role === 'assistant' && msg.chartMarkdown) {
            lastGeneratedChartCode.value = msg.chartMarkdown
            break
          }
        }
      }

      // 加载会话时清空输入框（在恢复消息之后）
      await nextTick()
      currentPrompt.value = ''

      // 等待 DOM 更新后渲染所有图表
      await nextTick()
      setTimeout(async () => {
        const filteredMessages = messages.value.filter((item) => item.role !== 'system')
        for (let i = 0; i < filteredMessages.length; i++) {
          const msg = filteredMessages[i]
          if (msg.role === 'assistant' && msg.chartMarkdown) {
            // 等待 GraphMessageBubble 组件挂载并渲染
            await nextTick()
            // 图表会在 GraphMessageBubble 的 watch 中自动渲染
          }
        }
      }, 300)
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
    // 标记为手动重命名
    manuallyRenamedSessions.value.add(item.id)
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
      current_prompt: session.current_prompt || '',
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
      messages.value = []
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
    const userPrompt = currentPrompt.value.trim()
    if (!userPrompt) {
      ElMessage.warning(t('graph.noPrompt', '请输入绘图需求'))
      return
    }

    const isOptimize = isOptimizeRequest(userPrompt)
    const previousChartCode = isOptimize ? getLastChartCode() : null

    // 立即清空输入框（在添加消息之前）
    currentPrompt.value = ''

    // 添加用户消息
    const userMessage: GraphMessage = {
      role: 'user',
      content: userPrompt
    }
    messages.value.push(userMessage)

    // 创建助手占位消息
    const assistantPlaceholder: GraphMessage = {
      role: 'assistant',
      content: ''
    }
    messages.value.push(assistantPlaceholder)

    // 步骤1: 分析意图，自动选择图表引擎
    // 智能判断：如果已有图表且是优化请求，优先使用之前的引擎
    let intentResult
    const hasPreviousChart = !!previousChartCode
    const usePreviousEngine = shouldUsePreviousEngine(userPrompt, hasPreviousChart)

    if (usePreviousEngine && previousChartCode) {
      // 使用之前的引擎：从之前的图表代码中提取引擎信息
      const codeBlockMatch = previousChartCode.match(/```(\w+)\s*\n([\s\S]*?)\n?```/)
      if (codeBlockMatch) {
        detectedEngine.value = codeBlockMatch[1]
        // 保持之前的类型和特殊提示，除非用户明确要求改变
        intentResult = {
          engine: codeBlockMatch[1],
          type: detectedType.value || 'flowchart',
          specialPrompt: detectedSpecialPrompt.value || '',
          notes: '必须使用代码框包裹'
        }
      } else {
        // 如果无法提取，重新分析
        intentResult = await analyzeIntent(userPrompt)
        detectedEngine.value = intentResult.engine
        detectedType.value = intentResult.type
        detectedSpecialPrompt.value = intentResult.specialPrompt
      }
    } else {
      // 新建图表或明确要求新引擎：重新分析意图
      intentResult = await analyzeIntent(userPrompt)
      detectedEngine.value = intentResult.engine
      detectedType.value = intentResult.type
      detectedSpecialPrompt.value = intentResult.specialPrompt
    }

    analyzingIntent.value = false

    // 步骤2: 生成图表代码
    const chartPrompt = generateChartCodePrompt(
      userPrompt,
      intentResult.engine,
      intentResult.type,
      intentResult.specialPrompt,
      intentResult.notes,
      isOptimize,
      previousChartCode
    )

    const codeTarget = vueRef('')
    const originKey = `graph-${Date.now()}-${Math.random().toString(36).slice(2)}`

    // 构建完整的对话历史（多轮对话支持）- 类似 AIChat.vue 的实现
    // 先获取当前消息（不包括刚添加的占位消息）
    const currentMessages = messages.value.slice(0, -1) // 排除占位消息
    const messageCopy: AIDialogMessage[] = JSON.parse(JSON.stringify(currentMessages))

    // 转换为 AIDialogMessage 格式，包含图表代码
    const conversationHistory: AIDialogMessage[] = []
    for (const msg of messageCopy) {
      if (msg.role === 'system') continue

      const graphMsg = msg as GraphMessage
      if (graphMsg.role === 'assistant' && graphMsg.chartMarkdown) {
        // 助手消息：使用图表代码作为内容
        conversationHistory.push({
          role: 'assistant',
          content: graphMsg.chartMarkdown
        })
      } else {
        // 用户消息或其他：使用原始内容
        conversationHistory.push({
          role: msg.role,
          content: msg.content
        })
      }
    }

    // 添加当前用户请求（使用图表生成提示词）
    conversationHistory.push({
      role: 'user',
      content: chartPrompt
    })

    const { handle, done } = createAiTask(
      t('graph.generating', '生成图表'),
      conversationHistory,
      codeTarget,
      'chat',
      originKey,
      { stream: true }
    )

    currentAiTaskHandle.value = handle

    // 设置流式显示
    streamingContent.value = ''
    streamingDonePromise.value = done

    // 同步codeTarget到streamingContent和占位消息
    const syncWatcher = watch(
      () => codeTarget.value,
      (newValue) => {
        streamingContent.value = newValue
        assistantPlaceholder.content = newValue
      },
      { immediate: true }
    )

    try {
      await done
    } catch (error) {
      // 如果是取消错误，保留已生成的内容
      const isCancelled =
        error instanceof Error &&
        (error.message === '任务已取消' ||
          error.message.includes('任务已取消') ||
          (error as any).name === 'AbortError')

      if (!isCancelled) {
        // 非取消错误，重新抛出
        throw error
      }
    } finally {
      syncWatcher()
      streamingDonePromise.value = null
      currentAiTaskHandle.value = null
    }

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

    // 更新助手消息
    assistantPlaceholder.content = t('graph.generated', '图表已生成')
    assistantPlaceholder.chartMarkdown = chartMarkdown
    assistantPlaceholder.code = chartCode

    // 强制触发响应式更新，确保图表立即渲染
    await nextTick()

    // 等待 DOM 更新后触发图表渲染
    // 使用双重 nextTick 确保 Vue 的响应式系统完成更新
    await nextTick()
    await nextTick()

    // 再次确保图表渲染（GraphMessageBubble 的 watch 应该已经触发）
    setTimeout(async () => {
      // 如果图表还没有渲染，强制触发一次
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.role === 'assistant' && lastMsg.chartMarkdown) {
        // 通过重新赋值触发 watch
        const tempMarkdown = lastMsg.chartMarkdown
        const tempCode = lastMsg.code
        // 临时清空以触发 watch
        lastMsg.chartMarkdown = ''
        lastMsg.code = ''
        await nextTick()
        // 恢复值，触发 watch 重新渲染
        lastMsg.chartMarkdown = tempMarkdown
        lastMsg.code = tempCode
        await nextTick()
      }
    }, 150)

    // 保存会话
    await graphSessionsDb.update(activeSessionId.value, {
      conversation_history: JSON.stringify(messages.value),
      current_prompt: '',
      output_format: 'svg',
      description: JSON.stringify({
        engine: detectedEngine.value,
        type: detectedType.value,
        specialPrompt: detectedSpecialPrompt.value,
        manuallyRenamed: manuallyRenamedSessions.value.has(activeSessionId.value)
      })
    })

    ElMessage.success(t('graph.generateSuccess', '生成成功'))

    // 生成标题（如果会话未被手动重命名）
    if (activeSessionId.value && !manuallyRenamedSessions.value.has(activeSessionId.value)) {
      updateTitle(userPrompt).catch((error) => {
        logger.debug('更新标题失败', error)
      })
    }
  } catch (error) {
    // 如果出错，移除占位消息
    if (
      messages.value.length > 0 &&
      messages.value[messages.value.length - 1].role === 'assistant' &&
      !messages.value[messages.value.length - 1].content
    ) {
      messages.value.pop()
    }
    ElMessage.error('生成失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    generating.value = false
    analyzingIntent.value = false
  }
}

// 取消生成
const handleCancel = () => {
  if (currentAiTaskHandle.value) {
    cancelAiTask(currentAiTaskHandle.value, false)
    currentAiTaskHandle.value = null
  }
  generating.value = false
  analyzingIntent.value = false
  streamingDonePromise.value = null
  // 如果最后一条消息是空的占位消息，移除它
  if (messages.value.length > 0) {
    const lastMsg = messages.value[messages.value.length - 1]
    if (lastMsg.role === 'assistant' && !lastMsg.content && !lastMsg.chartMarkdown) {
      messages.value.pop()
    }
  }
  ElMessage.info(t('aiChat.generationCancelled', '生成已取消'))
}

// 消息操作：删除
const onMsgDelete = (index: number) => {
  // GraphMessageBubble 传递的 index 是相对于过滤后的消息的索引
  // 需要找到实际的消息索引
  const filteredMessages = messages.value.filter((item) => item.role !== 'system')
  if (index < 0 || index >= filteredMessages.length) return

  const actualIndex = messages.value.indexOf(filteredMessages[index])
  if (actualIndex < 0) return

  messages.value.splice(actualIndex, 1)
  ElMessage.success(t('common.deleteSuccess', '删除成功'))
  saveSession()
}

// 消息操作：编辑
const onMsgEdit = async (payload: { index: number; message: string }) => {
  const filteredMessages = messages.value.filter((item) => item.role !== 'system')
  if (payload.index < 0 || payload.index >= filteredMessages.length) return

  const actualIndex = messages.value.indexOf(filteredMessages[payload.index])
  if (actualIndex < 0) return

  const message = messages.value[actualIndex]
  if (!message) return

  message.content = payload.message

  // 如果是用户消息，重新生成
  if (message.role === 'user') {
    await regenerate(actualIndex)
  } else {
    saveSession()
  }
}

// 重新生成
const regenerate = async (index: number) => {
  // GraphMessageBubble 传递的 index 是相对于过滤后的消息的索引
  // 需要找到实际的消息索引
  const filteredMessages = messages.value.filter((item) => item.role !== 'system')
  if (index < 0 || index >= filteredMessages.length) return

  const actualIndex = messages.value.indexOf(filteredMessages[index])
  if (actualIndex < 0) return

  // 找到用户消息的位置
  let userIndex = actualIndex
  while (userIndex >= 0 && messages.value[userIndex].role !== 'user') {
    userIndex--
  }

  if (userIndex < 0) return

  // 移除该用户消息之后的所有消息
  messages.value.splice(userIndex + 1)

  // 使用该用户消息的内容重新生成
  const userMessage = messages.value[userIndex]
  currentPrompt.value = userMessage.content
  await handleGenerate()
}

// 保存会话
const saveSession = async () => {
  if (!activeSessionId.value) return

  try {
    await graphSessionsDb.update(activeSessionId.value, {
      conversation_history: JSON.stringify(messages.value),
      current_prompt: currentPrompt.value,
      output_format: 'svg',
      description: JSON.stringify({
        engine: detectedEngine.value,
        type: detectedType.value,
        specialPrompt: detectedSpecialPrompt.value,
        manuallyRenamed: manuallyRenamedSessions.value.has(activeSessionId.value)
      })
    })
  } catch (error) {
    logger.error('保存会话失败:', error)
  }
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

    const codeBlockMatch =
      typeof code === 'string' ? code.match(/```(\w+)\s*\n([\s\S]*?)\n?```/) : null
    if (codeBlockMatch) {
      engine = codeBlockMatch[1]
      code = codeBlockMatch[2].trim()
    } else {
      // 如果没有代码块，直接使用代码
      code = typeof code === 'string' ? code.trim() : String(code).trim()
    }

    const messageBridge = (await import('../bridge/message-bridge')).default
    if (!messageBridge.getIpc()) {
      throw new Error('IPC渲染器不可用')
    }

    const baseUrl = await import('../config/runtime-server').then((m) => m.getRuntimeServerBaseUrl())

    // 打开保存对话框，让用户选择格式
    const result = await messageBridge.invoke('save-file-dialog', {
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
      } else if (
        imageUrl.startsWith(baseUrl + '/images/') ||
        imageUrl.startsWith('http://')
      ) {
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
        svgContent = (await messageBridge.invoke('read-file-content', localPath)) as string
      } else {
        // 本地文件路径 -> 读取内容
        svgContent = (await messageBridge.invoke('read-file-content', imageUrl)) as string
      }

      // 直接写入文件
      await messageBridge.invoke('write-file-content', {
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
      } else if (
        imageUrl.startsWith(baseUrl + '/images/') ||
        imageUrl.startsWith('http://')
      ) {
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
        const fileData = (await messageBridge.invoke('read-file-for-upload', imageUrl)) as {
          name: string
          data: string
          mimeType: string
        }
        base64Data = fileData.data
      }

      // 直接写入文件（base64 编码）
      await messageBridge.invoke('write-file-content', {
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
      if (
        svgImageUrl.startsWith(baseUrl + '/images/') ||
        svgImageUrl.startsWith('http://')
      ) {
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
        const resp = await fetch(baseUrl + '/api/image/upload?keepName=1', {
          method: 'POST',
          body: formData
        })
        if (!resp.ok) throw new Error('上传 SVG 失败')
        const json = await resp.json()
        const uploaded = json?.data?.succMap ? Object.keys(json.data.succMap)[0] : fileName
        const httpUrl = `${baseUrl}/images/${uploaded}`

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
        const resp = await fetch(baseUrl + '/api/image/upload?keepName=1', {
          method: 'POST',
          body: formData
        })
        if (!resp.ok) throw new Error('上传 SVG 失败')
        const json = await resp.json()
        const uploaded = json?.data?.succMap ? Object.keys(json.data.succMap)[0] : fileName
        const httpUrl = `${baseUrl}/images/${uploaded}`

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
      const fileData = (await messageBridge.invoke('read-file-for-upload', pdfPath)) as {
        name: string
        data: string
        mimeType: string
      }

      // 直接写入文件（base64 编码）
      await messageBridge.invoke('write-file-content', {
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

// 主题样式
const borderColor = computed(() =>
  themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)'
)

const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const panelStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background2nd,
  color: themeState.currentTheme.textColor,
  flex: 1,
  display: 'flex',
  flexDirection: 'column' as const,
  minHeight: 0,
  overflow: 'hidden' as const,
  padding: 0,
  boxSizing: 'border-box' as const,
  transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease'
}))

const emptyStateStyle = computed(() => ({
  color: themeState.currentTheme.textColor,
  opacity: 0.6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%'
}))

// 标题生成相关函数
const MAX_TITLE_LENGTH = 20
const TITLE_CONTEXT_LIMIT = 6

const buildTitleSource = (seedText?: string): string => {
  // 获取最近的对话消息（不包括系统消息）
  const recentMessages = messages.value
    .filter((msg) => msg.role !== 'system')
    .slice(-TITLE_CONTEXT_LIMIT)

  // 如果传入了 seedText（用户刚发送的消息），确保它包含在上下文中
  if (seedText && seedText.trim()) {
    // 检查最后一条消息是否是用户消息，且内容匹配 seedText
    const lastMessage = recentMessages[recentMessages.length - 1]
    if (
      lastMessage &&
      lastMessage.role === 'user' &&
      lastMessage.content.trim() === seedText.trim()
    ) {
      // 如果最后一条消息就是用户刚发送的消息，使用完整的对话上下文（包括用户消息）
      return recentMessages
        .map((msg) => {
          const graphMsg = msg as GraphMessage
          if (graphMsg.role === 'assistant' && graphMsg.chartMarkdown) {
            return `ASSISTANT: [图表代码]`
          }
          return `${msg.role.toUpperCase()}: ${msg.content}`
        })
        .join('\n')
    }
    // 如果最后一条消息不匹配（理论上不应该发生），仍然使用 seedText 和之前的消息
    const previousMessages = recentMessages.slice(0, -1)
    const contextMessages =
      previousMessages.length > 0
        ? [...previousMessages, { role: 'user', content: seedText.trim() }]
        : [{ role: 'user', content: seedText.trim() }]
    return contextMessages.map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n')
  }

  // 如果没有传入 seedText，使用最近的对话消息
  return recentMessages
    .map((msg) => {
      const graphMsg = msg as GraphMessage
      if (graphMsg.role === 'assistant' && graphMsg.chartMarkdown) {
        return `ASSISTANT: [图表代码]`
      }
      return `${msg.role.toUpperCase()}: ${msg.content}`
    })
    .join('\n')
}

const sanitizeGeneratedTitle = (raw: string): string => {
  let next = raw.trim()
  while (next.startsWith('#')) {
    next = next.slice(1).trim()
  }
  next = next.replace(/\s+/g, ' ')
  if (next.length > MAX_TITLE_LENGTH) {
    next = next
      .slice(0, MAX_TITLE_LENGTH)
      .replace(/[，。,;:!?、．…-]+$/, '')
      .trim()
  }
  if (!next) {
    next = t('graph.defaultTitle', '新绘图会话')
  }
  return next
}

const updateTitle = async (seedText?: string) => {
  if (!activeSessionId.value) return

  const titleSource = buildTitleSource(seedText)
  const prompt = updateTitlePrompt(JSON.stringify(titleSource))

  // 保存当前会话ID，因为生成标题需要时间，用户可能在此期间切换会话
  const sessionId = activeSessionId.value

  // 构建消息数组，将 prompt 转换为对话格式
  const titleMessages: AIDialogMessage[] = [
    {
      role: 'user',
      content: prompt
    }
  ]

  const generatedText = vueRef('')
  const enableKnowledgeBase = await getSetting('enableKnowledgeBase')
  const { handle, done } = createAiTask(
    activeSession?.value?.title || t('graph.defaultTitle', '新绘图会话'),
    titleMessages,
    generatedText,
    ai_types.chat,
    'graph-generate-title',
    { stream: true, enableKnowledgeBase: Boolean(enableKnowledgeBase) }
  )

  try {
    await done
  } catch (err) {
    logger.error('生成标题失败', err)
    return
  }

  let schemaTitle: string | undefined
  let fallbackTitle: string | undefined

  try {
    const parsed = parseSchemaJson<DocumentTitleSchemaResult>(
      generatedText.value,
      DOCUMENT_TITLE_SCHEMA
    )
    schemaTitle = parsed.title
  } catch (error) {
    logger.warn('解析标题JSON失败，尝试从文本中提取', error, generatedText.value)

    // 尝试从生成的文本中提取标题
    const titleMatch = generatedText.value.match(/"title"\s*:\s*"([^"]+)"/)
    if (titleMatch) {
      fallbackTitle = titleMatch[1]
    } else {
      const quotedMatch = generatedText.value.match(/"([^"]{4,40})"/)
      if (quotedMatch) {
        fallbackTitle = quotedMatch[1]
      } else {
        const lines = generatedText.value
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l)
        if (lines.length > 0) {
          const firstLine = lines[0]
            .replace(/^[{\[]/, '')
            .replace(/[}\]]$/, '')
            .replace(/^"title"\s*:\s*"?/, '')
            .replace(/^"|"$/g, '')
            .trim()
          if (firstLine.length >= 2 && firstLine.length <= 40) {
            fallbackTitle = firstLine
          }
        }
      }
    }
  }

  // 优先使用 schema 解析的标题，其次使用回退标题，最后使用原始文本或种子文本
  let newTitle = sanitizeGeneratedTitle(
    schemaTitle ?? fallbackTitle ?? generatedText.value ?? titleSource
  )

  // 确保标题不为空
  if (!newTitle || newTitle.trim() === '') {
    newTitle = t('graph.defaultTitle', '新绘图会话')
  }

  // 检查会话是否仍然存在且未被手动重命名
  if (sessionId === activeSessionId.value && !manuallyRenamedSessions.value.has(sessionId)) {
    try {
      await graphSessionsDb.update(sessionId, { title: newTitle })
      await loadSessions()
    } catch (error) {
      logger.error('更新会话标题失败', error)
    }
  }
}

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
  loadSessions()
})
</script>

<style scoped>
.graph-window {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-container {
  display: flex;
  flex: 1;
  min-height: 0;
  box-sizing: border-box;
  overflow: hidden;
}

.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.dialog-container {
  flex: 1;
  background-color: rgba(170, 221, 255, 0.11);
  padding: 20px;
  margin: 0;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-container .conversation-scroll {
  padding: 0;
}

.conversation-scroll {
  flex: 1;
  min-height: 0;
  padding-right: 4px;
}

.conversation-scroll :deep([data-radix-scroll-area-viewport]) {
  overflow-x: hidden;
}

.conversation-bottom-spacer {
  height: 160px;
  flex-shrink: 0;
}

.composer-wrapper {
  position: absolute;
  left: 20px;
  right: 20px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
  padding: 0;
  gap: 8px;
}

.composer-wrapper > * {
  pointer-events: auto;
  width: 100%;
  max-width: min(960px, 100%);
  min-width: 0;
  box-sizing: border-box;
}
</style>
