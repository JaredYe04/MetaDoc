import { ref, computed, watch, nextTick, type Ref } from 'vue'
import { ref as vueRef } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AIDialogMessage } from '@/types'
import { createAiTask, cancelAiTask, ai_types } from '../utils/ai_tasks'
import { graphSessionsDb, type GraphSession } from '../utils/db/tool-sessions-db'
import { graphEngineConfig } from '../config/graph-engine-config'
import { extractOuterJsonString } from '../utils/regex-utils'
import { createRendererLogger } from '../utils/logger'
import { updateTitlePrompt } from '../utils/prompts'
import {
  parseSchemaJson,
  DOCUMENT_TITLE_SCHEMA,
  type DocumentTitleSchemaResult
} from '../utils/schemas'
import { getSetting } from '../utils/settings'
import { notifySuccess, notifyError, notifyWarning, notifyInfo } from '../utils/notify'

const logger = createRendererLogger('useGraphSessionFlow')

export interface GraphMessage extends AIDialogMessage {
  chartMarkdown?: string
  code?: string
}

export interface UseGraphSessionFlowOptions {
  activeSessionId: Ref<string | null>
  getActiveSessionTitle: () => string
  onPersisted?: () => Promise<void>
  /** When false, skip graphSessionsDb writes (e.g. GraphWindow demo mode) */
  persistEnabled?: () => boolean
}

export function useGraphSessionFlow(options: UseGraphSessionFlowOptions) {
  const { t } = useI18n()
  const persistEnabled = options.persistEnabled ?? (() => true)

  const currentPrompt = ref('')
  const generating = ref(false)
  const analyzingIntent = ref(false)
  const loadingSession = ref(false)
  const currentAiTaskHandle = ref<string | null>(null)
  const manuallyRenamedSessions = ref<Set<string>>(new Set())
  const messages = ref<GraphMessage[]>([])
  const lastGeneratedChartCode = ref<string | null>(null)
  const lastExportedFilePath = ref<string | null>(null)
  const detectedEngine = ref<string | null>(null)
  const detectedType = ref<string | null>(null)
  const detectedSpecialPrompt = ref<string>('')
  const streamingContent = ref<string>('')
  const streamingReasoning = ref<string>('')
  const streamingDonePromise = ref<Promise<unknown> | null | undefined>(null)
  const isStreaming = computed(
    () => streamingDonePromise.value !== null && streamingDonePromise.value !== undefined
  )

  const getAvailableEngines = () => {
    return graphEngineConfig.map((engine) => ({
      name: engine.name.toLowerCase(),
      displayName: engine.name,
      supportedTypes: engine['graph-supported'],
      tip: engine.tip,
      specialPrompt: engine['special-prompt'] || ''
    }))
  }

  const analyzeIntent = async (
    userPrompt: string
  ): Promise<{ engine: string; type: string; specialPrompt: string; notes: string }> => {
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

    const intentMessages: AIDialogMessage[] = [{ role: 'user', content: intentPrompt }]

    const { done } = createAiTask(
      t('graph.analyzingIntent', '分析意图中...'),
      intentMessages,
      intentTarget,
      'chat',
      originKey,
      { stream: true }
    )

    streamingContent.value = ''
    streamingDonePromise.value = done

    try {
      await done
    } catch (error) {
      const isCancelled =
        error instanceof Error &&
        (error.message === '任务已取消' ||
          error.message.includes('任务已取消') ||
          (error as Error & { name?: string }).name === 'AbortError')

      if (!isCancelled) throw error
    }

    streamingDonePromise.value = null

    let jsonStr = extractOuterJsonString(intentTarget.value)
    if (!jsonStr) {
      jsonStr = intentTarget.value
        .trim()
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
      return {
        engine: 'mermaid',
        type: 'flowchart',
        specialPrompt: '',
        notes: '必须使用代码框包裹，如```mermaid'
      }
    }
  }

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
      '换成',
      '换为'
    ]
    return optimizeKeywords.some((keyword) => userPrompt.includes(keyword))
  }

  const shouldUsePreviousEngine = (userPrompt: string, hasPreviousChart: boolean): boolean => {
    if (!hasPreviousChart) return false
    const engineKeywords = ['mermaid', 'echarts', 'plantuml', 'graphviz', 'mindmap', 'markmap']
    const hasExplicitEngine = engineKeywords.some((keyword) =>
      userPrompt.toLowerCase().includes(keyword)
    )
    if (hasExplicitEngine) return false
    if (isOptimizeRequest(userPrompt)) return true
    return true
  }

  const getLastChartCode = (): string | null => {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const msg = messages.value[i]
      if (msg.role === 'assistant' && msg.chartMarkdown) {
        return msg.chartMarkdown
      }
    }
    return null
  }

  const generateChartCodePrompt = (
    userPrompt: string,
    engine: string,
    type: string,
    specialPrompt: string,
    notes: string,
    isOptimize = false,
    previousChartCode?: string | null
  ): string => {
    const engineConfig = graphEngineConfig.find(
      (e) => e.name.toLowerCase() === engine.toLowerCase()
    )
    const engineDisplayName = engineConfig?.name || engine

    let prompt = ''

    if (isOptimize && previousChartCode) {
      const recentHistory = messages.value
        .filter((msg) => msg.role !== 'system')
        .slice(-6)
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
      const history = messages.value
        .filter((msg) => msg.role !== 'system')
        .slice(0, -1)
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

  const persistUpdate = async (patch: Parameters<typeof graphSessionsDb.update>[1]) => {
    const id = options.activeSessionId.value
    if (!id || !persistEnabled()) return
    await graphSessionsDb.update(id, patch)
  }

  const handleGenerate = async () => {
    if (!options.activeSessionId.value || !currentPrompt.value.trim()) {
      notifyWarning(t('graph.noPrompt', '请输入绘图需求'))
      return
    }

    generating.value = true
    analyzingIntent.value = true

    try {
      const userPrompt = currentPrompt.value.trim()
      if (!userPrompt) {
        notifyWarning(t('graph.noPrompt', '请输入绘图需求'))
        return
      }

      const isOptimize = isOptimizeRequest(userPrompt)
      const previousChartCode = isOptimize ? getLastChartCode() : null

      currentPrompt.value = ''

      const userMessage: GraphMessage = { role: 'user', content: userPrompt }
      messages.value.push(userMessage)

      const assistantPlaceholder: GraphMessage = { role: 'assistant', content: '', reasoning: '' }
      messages.value.push(assistantPlaceholder)

      let intentResult
      const hasPreviousChart = !!previousChartCode
      const usePreviousEngine = shouldUsePreviousEngine(userPrompt, hasPreviousChart)

      if (usePreviousEngine && previousChartCode) {
        const codeBlockMatch = previousChartCode.match(/```(\w+)\s*\n([\s\S]*?)\n?```/)
        if (codeBlockMatch) {
          detectedEngine.value = codeBlockMatch[1]
          intentResult = {
            engine: codeBlockMatch[1],
            type: detectedType.value || 'flowchart',
            specialPrompt: detectedSpecialPrompt.value || '',
            notes: '必须使用代码框包裹'
          }
        } else {
          intentResult = await analyzeIntent(userPrompt)
          detectedEngine.value = intentResult.engine
          detectedType.value = intentResult.type
          detectedSpecialPrompt.value = intentResult.specialPrompt
        }
      } else {
        intentResult = await analyzeIntent(userPrompt)
        detectedEngine.value = intentResult.engine
        detectedType.value = intentResult.type
        detectedSpecialPrompt.value = intentResult.specialPrompt
      }

      analyzingIntent.value = false

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
      const reasoningTarget = vueRef('')
      const originKey = `graph-${Date.now()}-${Math.random().toString(36).slice(2)}`

      const currentMessages = messages.value.slice(0, -1)
      const messageCopy: AIDialogMessage[] = JSON.parse(JSON.stringify(currentMessages))

      const conversationHistory: AIDialogMessage[] = []
      for (const msg of messageCopy) {
        if (msg.role === 'system') continue

        const graphMsg = msg as GraphMessage
        if (graphMsg.role === 'assistant' && graphMsg.chartMarkdown) {
          conversationHistory.push({ role: 'assistant', content: graphMsg.chartMarkdown })
        } else {
          conversationHistory.push({ role: msg.role, content: msg.content })
        }
      }

      conversationHistory.push({ role: 'user', content: chartPrompt })

      const { handle, done } = createAiTask(
        t('graph.generating', '生成图表'),
        conversationHistory,
        codeTarget,
        'chat',
        originKey,
        { stream: true, reasoningRef: reasoningTarget }
      )

      currentAiTaskHandle.value = handle

      streamingContent.value = ''
      streamingReasoning.value = ''
      streamingDonePromise.value = done

      const syncWatcher = watch(
        () => codeTarget.value,
        (newValue) => {
          streamingContent.value = newValue
          assistantPlaceholder.content = newValue
        },
        { immediate: true }
      )
      const syncReasoningWatcher = watch(
        () => reasoningTarget.value,
        (newValue) => {
          streamingReasoning.value = newValue
          assistantPlaceholder.reasoning = newValue
        },
        { immediate: true }
      )

      try {
        await done
      } catch (error) {
        const isCancelled =
          error instanceof Error &&
          (error.message === '任务已取消' ||
            error.message.includes('任务已取消') ||
            (error as Error & { name?: string }).name === 'AbortError')

        if (!isCancelled) throw error
      } finally {
        syncWatcher()
        syncReasoningWatcher()
        streamingDonePromise.value = null
        currentAiTaskHandle.value = null
      }

      assistantPlaceholder.reasoning = reasoningTarget.value

      let chartCode = codeTarget.value.trim()
      let chartMarkdown = chartCode

      if (!chartCode.includes('```')) {
        const engine = detectedEngine.value || 'mermaid'
        chartMarkdown = `\`\`\`${engine}\n${chartCode}\n\`\`\``
      } else {
        const codeBlockMatch = chartCode.match(/```(\w+)\s*\n([\s\S]*?)\n?```/)
        if (codeBlockMatch) {
          chartCode = codeBlockMatch[2].trim()
        }
      }

      lastGeneratedChartCode.value = chartMarkdown

      assistantPlaceholder.content = t('graph.generated', '图表已生成')
      assistantPlaceholder.chartMarkdown = chartMarkdown
      assistantPlaceholder.code = chartCode

      await nextTick()
      await nextTick()
      await nextTick()

      setTimeout(async () => {
        const lastMsg = messages.value[messages.value.length - 1]
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.chartMarkdown) {
          const tempMarkdown = lastMsg.chartMarkdown
          const tempCode = lastMsg.code
          lastMsg.chartMarkdown = ''
          lastMsg.code = ''
          await nextTick()
          lastMsg.chartMarkdown = tempMarkdown
          lastMsg.code = tempCode
          await nextTick()
        }
      }, 150)

      await persistUpdate({
        conversation_history: JSON.stringify(messages.value),
        current_prompt: '',
        output_format: 'svg',
        description: JSON.stringify({
          engine: detectedEngine.value,
          type: detectedType.value,
          specialPrompt: detectedSpecialPrompt.value,
          manuallyRenamed: manuallyRenamedSessions.value.has(options.activeSessionId.value!)
        })
      })

      notifySuccess(t('graph.generateSuccess', '生成成功'))

      if (
        options.activeSessionId.value &&
        !manuallyRenamedSessions.value.has(options.activeSessionId.value)
      ) {
        updateTitle(userPrompt).catch((error) => {
          logger.debug('更新标题失败', error)
        })
      }
    } catch (error) {
      if (
        messages.value.length > 0 &&
        messages.value[messages.value.length - 1].role === 'assistant' &&
        !messages.value[messages.value.length - 1].content
      ) {
        messages.value.pop()
      }
      notifyError('生成失败: ' + (error instanceof Error ? error.message : String(error)))
    } finally {
      generating.value = false
      analyzingIntent.value = false
    }
  }

  const handleCancel = () => {
    if (currentAiTaskHandle.value) {
      cancelAiTask(currentAiTaskHandle.value, false)
      currentAiTaskHandle.value = null
    }
    generating.value = false
    analyzingIntent.value = false
    streamingDonePromise.value = null
    if (messages.value.length > 0) {
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg.role === 'assistant' && !lastMsg.content && !lastMsg.chartMarkdown) {
        messages.value.pop()
      }
    }
    notifyInfo(t('aiChat.generationCancelled', '生成已取消'))
  }

  const saveSession = async () => {
    if (!options.activeSessionId.value) return

    try {
      await persistUpdate({
        conversation_history: JSON.stringify(messages.value),
        current_prompt: currentPrompt.value,
        output_format: 'svg',
        description: JSON.stringify({
          engine: detectedEngine.value,
          type: detectedType.value,
          specialPrompt: detectedSpecialPrompt.value,
          manuallyRenamed: manuallyRenamedSessions.value.has(options.activeSessionId.value)
        })
      })
    } catch (error) {
      logger.error('保存会话失败:', error)
    }
  }

  const onMsgDelete = (index: number) => {
    const filteredMessages = messages.value.filter((item) => item.role !== 'system')
    if (index < 0 || index >= filteredMessages.length) return

    const actualIndex = messages.value.indexOf(filteredMessages[index])
    if (actualIndex < 0) return

    messages.value.splice(actualIndex, 1)
    notifySuccess(t('common.deleteSuccess', '删除成功'))
    saveSession()
  }

  const onMsgEdit = async (payload: { index: number; message: string }) => {
    const filteredMessages = messages.value.filter((item) => item.role !== 'system')
    if (payload.index < 0 || payload.index >= filteredMessages.length) return

    const actualIndex = messages.value.indexOf(filteredMessages[payload.index])
    if (actualIndex < 0) return

    const message = messages.value[actualIndex]
    if (!message) return

    message.content = payload.message

    if (message.role === 'user') {
      await regenerate(actualIndex)
    } else {
      saveSession()
    }
  }

  const regenerate = async (index: number) => {
    const filteredMessages = messages.value.filter((item) => item.role !== 'system')
    if (index < 0 || index >= filteredMessages.length) return

    const actualIndex = messages.value.indexOf(filteredMessages[index])
    if (actualIndex < 0) return

    let userIndex = actualIndex
    while (userIndex >= 0 && messages.value[userIndex].role !== 'user') {
      userIndex--
    }

    if (userIndex < 0) return

    messages.value.splice(userIndex + 1)

    const userMessage = messages.value[userIndex]
    currentPrompt.value = userMessage.content
    await handleGenerate()
  }

  const MAX_TITLE_LENGTH = 20
  const TITLE_CONTEXT_LIMIT = 6

  const buildTitleSource = (seedText?: string): string => {
    const recentMessages = messages.value
      .filter((msg) => msg.role !== 'system')
      .slice(-TITLE_CONTEXT_LIMIT)

    if (seedText && seedText.trim()) {
      const lastMessage = recentMessages[recentMessages.length - 1]
      if (
        lastMessage &&
        lastMessage.role === 'user' &&
        lastMessage.content.trim() === seedText.trim()
      ) {
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
      const previousMessages = recentMessages.slice(0, -1)
      const contextMessages =
        previousMessages.length > 0
          ? [...previousMessages, { role: 'user' as const, content: seedText.trim() }]
          : [{ role: 'user' as const, content: seedText.trim() }]
      return contextMessages.map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n')
    }

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
    if (!options.activeSessionId.value) return

    const titleSource = buildTitleSource(seedText)
    const prompt = updateTitlePrompt(JSON.stringify(titleSource))

    const sessionId = options.activeSessionId.value

    const titleMessages: AIDialogMessage[] = [{ role: 'user', content: prompt }]

    const generatedText = vueRef('')
    const enableKnowledgeBase = await getSetting('enableKnowledgeBase')
    const { done } = createAiTask(
      options.getActiveSessionTitle() || t('graph.defaultTitle', '新绘图会话'),
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

    let newTitle = sanitizeGeneratedTitle(
      schemaTitle ?? fallbackTitle ?? generatedText.value ?? titleSource
    )

    if (!newTitle || newTitle.trim() === '') {
      newTitle = t('graph.defaultTitle', '新绘图会话')
    }

    if (
      sessionId === options.activeSessionId.value &&
      !manuallyRenamedSessions.value.has(sessionId) &&
      persistEnabled()
    ) {
      try {
        await graphSessionsDb.update(sessionId, { title: newTitle })
        await options.onPersisted?.()
      } catch (error) {
        logger.error('更新会话标题失败', error)
      }
    }
  }

  const handleExport = async (chartMarkdown?: string) => {
    const chartCode = chartMarkdown || lastGeneratedChartCode.value
    if (!chartCode) {
      notifyWarning(t('graph.noChart', '没有可导出的图表'))
      return
    }

    try {
      const chartCodeStr = typeof chartCode === 'string' ? chartCode : String(chartCode)

      let code = chartCodeStr
      let engine = detectedEngine.value || 'mermaid'

      const codeBlockMatch =
        typeof code === 'string' ? code.match(/```(\w+)\s*\n([\s\S]*?)\n?```/) : null
      if (codeBlockMatch) {
        engine = codeBlockMatch[1]
        code = codeBlockMatch[2].trim()
      } else {
        code = typeof code === 'string' ? code.trim() : String(code).trim()
      }

      const messageBridge = (await import('../bridge/message-bridge')).default
      if (!messageBridge.getIpc()) {
        throw new Error('IPC渲染器不可用')
      }

      const baseUrl = await import('../config/runtime-server').then((m) =>
        m.getRuntimeServerBaseUrl()
      )

      const result = await messageBridge.invoke('save-file-dialog', {
        defaultName: `graph-${Date.now()}.svg`,
        filters: [
          { name: 'SVG Files', extensions: ['svg'] },
          { name: 'PNG Files', extensions: ['png'] },
          { name: 'PDF Files', extensions: ['pdf'] }
        ]
      })

      if (
        !result ||
        (result as { canceled?: boolean }).canceled ||
        !(result as { filePath?: string }).filePath
      ) {
        return
      }

      const filePath = (result as { filePath: string }).filePath
      const ext = filePath.split('.').pop()?.toLowerCase() || 'svg'

      const targetFormat = ext === 'png' ? 'png' : 'svg'

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
        let svgContent: string
        if (imageUrl.startsWith('data:')) {
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
          const response = await fetch(imageUrl)
          svgContent = await response.text()
        } else if (imageUrl.startsWith(baseUrl + '/images/') || imageUrl.startsWith('http://')) {
          const response = await fetch(imageUrl)
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
          svgContent = await response.text()
        } else if (imageUrl.startsWith('file://')) {
          let localPath = imageUrl.replace(/^file:\/\//, '')
          if (localPath.startsWith('/') && /^[A-Za-z]:/.test(localPath.substring(1))) {
            localPath = localPath.substring(1)
          }
          svgContent = (await messageBridge.invoke('read-file-content', localPath)) as string
        } else {
          svgContent = (await messageBridge.invoke('read-file-content', imageUrl)) as string
        }

        await messageBridge.invoke('write-file-content', {
          filePath: filePath,
          content: svgContent,
          encoding: 'utf8'
        })
        lastExportedFilePath.value = filePath
        notifySuccess(t('graph.exportSuccess', '导出成功'))
      } else if (ext === 'png') {
        let base64Data: string
        if (imageUrl.startsWith('data:')) {
          const commaIdx = imageUrl.indexOf(',')
          base64Data = imageUrl.substring(commaIdx + 1)
        } else if (imageUrl.startsWith('blob:')) {
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
        } else if (imageUrl.startsWith(baseUrl + '/images/') || imageUrl.startsWith('http://')) {
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
          const fileData = (await messageBridge.invoke('read-file-for-upload', imageUrl)) as {
            name: string
            data: string
            mimeType: string
          }
          base64Data = fileData.data
        }

        await messageBridge.invoke('write-file-content', {
          filePath: filePath,
          content: base64Data,
          encoding: 'base64'
        })
        lastExportedFilePath.value = filePath
        notifySuccess(t('graph.exportSuccess', '导出成功'))
      } else if (ext === 'pdf') {
        const svgImageUrl = await renderChart({
          chartType: engine,
          code: code,
          format: 'svg'
        })

        if (!svgImageUrl) {
          throw new Error('渲染 SVG 失败')
        }

        let svgPath: string
        if (svgImageUrl.startsWith(baseUrl + '/images/') || svgImageUrl.startsWith('http://')) {
          const { image2local } = await import('../utils/md-utils.js')
          const mdTmp = `![x](${svgImageUrl})`
          const converted = await image2local(mdTmp)
          const m = converted.match(/!\[.*?\]\((.+?)\)/)
          svgPath = m ? m[1] : svgImageUrl
        } else if (svgImageUrl.startsWith('data:')) {
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
          svgPath = svgImageUrl
        }

        const { convertSvgToPdf } = await import('../utils/svg-to-pdf-utils')
        const pdfPath = await convertSvgToPdf(svgPath, { returnUrl: false })

        const fileData = (await messageBridge.invoke('read-file-for-upload', pdfPath)) as {
          name: string
          data: string
          mimeType: string
        }

        await messageBridge.invoke('write-file-content', {
          filePath: filePath,
          content: fileData.data,
          encoding: 'base64'
        })
        lastExportedFilePath.value = filePath
        notifySuccess(t('graph.exportSuccess', '导出成功'))
      } else {
        throw new Error(`不支持的格式: ${ext}`)
      }
    } catch (error) {
      notifyError('导出失败: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  function resetConversation() {
    messages.value = []
    currentPrompt.value = ''
    lastGeneratedChartCode.value = null
    lastExportedFilePath.value = null
    detectedEngine.value = null
    detectedType.value = null
    detectedSpecialPrompt.value = ''
    streamingContent.value = ''
    streamingDonePromise.value = null
    currentAiTaskHandle.value = null
  }

  async function hydrateFromSession(session: GraphSession | null, sessionListItemId?: string) {
    if (!session) return
    loadingSession.value = true
    try {
      if (session.conversation_history) {
        messages.value = JSON.parse(session.conversation_history) as GraphMessage[]
      } else {
        messages.value = []
      }
      if (session.description) {
        try {
          const config = JSON.parse(session.description)
          detectedEngine.value = config.engine || null
          detectedType.value = config.type || null
          detectedSpecialPrompt.value = config.specialPrompt || ''
          if (config.manuallyRenamed && sessionListItemId) {
            manuallyRenamedSessions.value.add(sessionListItemId)
          }
        } catch {
          /* ignore */
        }
      }

      if (messages.value.length > 0) {
        for (let i = messages.value.length - 1; i >= 0; i--) {
          const msg = messages.value[i]
          if (msg.role === 'assistant' && msg.chartMarkdown) {
            lastGeneratedChartCode.value = msg.chartMarkdown
            break
          }
        }
      }

      await nextTick()
      currentPrompt.value = ''

      await nextTick()
      setTimeout(async () => {
        const filteredMessages = messages.value.filter((item) => item.role !== 'system')
        for (let i = 0; i < filteredMessages.length; i++) {
          const msg = filteredMessages[i]
          if (msg.role === 'assistant' && msg.chartMarkdown) {
            await nextTick()
          }
        }
      }, 300)
    } finally {
      loadingSession.value = false
    }
  }

  return {
    currentPrompt,
    generating,
    analyzingIntent,
    loadingSession,
    manuallyRenamedSessions,
    messages,
    lastGeneratedChartCode,
    lastExportedFilePath,
    detectedEngine,
    detectedType,
    detectedSpecialPrompt,
    streamingContent,
    streamingReasoning,
    streamingDonePromise,
    isStreaming,
    handleGenerate,
    handleCancel,
    saveSession,
    onMsgDelete,
    onMsgEdit,
    regenerate,
    handleExport,
    updateTitle,
    resetConversation,
    hydrateFromSession
  }
}
