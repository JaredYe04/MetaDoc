/**
 * AIContextManager - 上下文管理器
 * 负责管理Agent的上下文，包括历史消息、工作记忆、引用素材等
 */

import type { AgentMessage, ChatAgentMessage } from '../../types/agent'
import type { AgentSession as LegacyAgentSession } from '../../types/agent'
import type { AgentSession, Reference, PublicContext, AgentEngine } from '../../types/agent-framework'
import type { AgentConfig } from '../../types/agent-framework'
import { createRendererLogger } from '../logger'
import { LlmAdapter } from './llm-adapter'
import { getPromptByKey } from '../prompts'
import { ToolRunner, type ToolObservation } from './tool-runner'
import { useWorkspace } from '../../stores/workspace'
import { agentToolManager } from '../agent-tool-manager'

function resolveToolDisplayNameForSynthetic(toolId: string): string {
  try {
    const tool = agentToolManager.getTool(toolId)
    const n = tool?.config?.name
    if (typeof n === 'string') return n
    if (n && typeof n === 'object') {
      return (n as { zh_cn?: { name?: string }; en_us?: { name?: string } }).zh_cn?.name ||
        (n as { en_us?: { name?: string } }).en_us?.name ||
        toolId
    }
  } catch {
    /* ignore */
  }
  return toolId
}
// 懒加载logger，避免初始化顺序问题
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('AIContextManager')
  }
  return loggerInstance
}

/**
 * LLM消息格式
 */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null // assistant消息有tool_calls时，content可以是null
  name?: string
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string // OpenAI API要求：必须是JSON字符串！
    }
  }>
}

/** 上下文组成部分 ID（用于 i18n 与 UI） */
export const CONTEXT_PART_IDS = [
  'systemPrompt',
  'references',
  'summary',
  'history'
] as const

export type ContextPartId = (typeof CONTEXT_PART_IDS)[number]

/** 单一部分的占用信息 */
export interface ContextPartUsage {
  id: ContextPartId
  chars: number
  tokens: number
}

/** 上下文组成详情（供「上下文组成」对话框展示） */
export interface ContextBreakdown {
  parts: ContextPartUsage[]
  totalChars: number
  totalTokens: number
  maxTokens: number
  percentage: number
}

/** 状态化上下文默认参数 */
export const CONTEXT_CONFIG = {
  /** 滑动窗口：最近多少条完整消息发给 LLM */
  recentMessagesDefault: 16,
  /** 消息数超过此值时触发自动摘要 */
  summaryTrigger: 40,
  /** 每次摘要覆盖的消息条数（旧历史进入 summary） */
  summaryBatch: 30,
  /** 上下文 token 软上限，超过 80% 可触发强制摘要 */
  maxContextTokens: 120000,
  /** 工具输出压缩：单条结果最大字符数（terminal 等） */
  toolOutputLimitChars: 2000,
  /** read_file 类结果最大行数（超则提示用 read_file_range） */
  readFileMaxLines: 200
} as const

/**
 * 上下文构建选项
 */
export interface ContextBuildOptions {
  includeHistory?: boolean
  includeReferences?: boolean
  /** 兼容旧逻辑：未使用 stateful 时使用的历史条数上限 */
  maxHistoryMessages?: number
  /** 状态化上下文：最近 N 条完整消息（与 summary 配合） */
  recentMessages?: number
  systemPromptOverride?: string
  activeReferenceIds?: string[] // 激活的引用ID列表，只处理这些引用
  /** 临时引用（不写入 referenceStore，仅本次调用注入） */
  extraReferences?: Reference[]
  /** 是否使用状态化上下文（summary + recent）；不传时根据 session.contextState 自动判断 */
  useStatefulContext?: boolean
}

/**
 * AIContextManager 类
 */
export class AIContextManager {
  /**
   * 构建LLM消息列表
   */
  static buildMessages(
    session: AgentSession | LegacyAgentSession,
    agentConfig: AgentConfig,
    options: ContextBuildOptions = {}
  ): LlmMessage[] {
    const {
      includeHistory = true,
      includeReferences = true,
      maxHistoryMessages = 50,
      recentMessages = CONTEXT_CONFIG.recentMessagesDefault,
      systemPromptOverride,
      useStatefulContext
    } = options

    const sessionAny = session as any
    const contextState = sessionAny.contextState
    const useStateful =
      useStatefulContext ?? (contextState && typeof contextState.summary === 'string')

    const messages: LlmMessage[] = []

    // 1. 系统提示词
    const systemPrompt = this.buildSystemPrompt(session, agentConfig, systemPromptOverride)
    if (systemPrompt) {
      const logger = createRendererLogger('AIContextManager')
      // logger.debug('[buildMessages] 构建系统提示词', {
      //   promptLength: systemPrompt.length,
      //   containsFormatWarning: systemPrompt.includes('⚠️ 重要：当前文档是'),
      //   containsMarkdownWarning: systemPrompt.includes('Markdown 格式'),
      //   containsLatexWarning: systemPrompt.includes('LaTeX 格式'),
      //   promptPreview: systemPrompt.substring(0, 500)
      // })
      messages.push({ role: 'system', content: systemPrompt })
    }

    // 2. 引用素材
    const referenceStore = Array.isArray(sessionAny.referenceStore) ? sessionAny.referenceStore : []
    const activeReferenceIds = options.activeReferenceIds
    const extraReferences = Array.isArray(options.extraReferences) ? options.extraReferences : []

    let referencesToInclude: Reference[] = []
    if (
      includeReferences &&
      referenceStore &&
      Array.isArray(referenceStore) &&
      referenceStore.length > 0
    ) {
      const userReferences =
        activeReferenceIds !== undefined && activeReferenceIds !== null
          ? (referenceStore as Reference[]).filter((ref) => activeReferenceIds.includes(ref.id))
          : (referenceStore as Reference[])
      referencesToInclude.push(...userReferences)
    }
    if (includeReferences && extraReferences.length > 0) {
      // 追加临时引用（本次消息 @ 引用解析出来的内容）
      // - 不受 activeReferenceIds 过滤（这些引用只在本次生成中出现）
      // - 去重：避免与 referenceStore 或 built-in 重复
      const existing = new Set(referencesToInclude.map((r) => r.id))
      for (const ref of extraReferences) {
        if (ref && ref.id && !existing.has(ref.id)) {
          referencesToInclude.push(ref)
          existing.add(ref.id)
        }
      }
    }
    if (referencesToInclude.length > 0) {
      const referencesContent = this.buildReferencesContent(referencesToInclude)
      if (referencesContent) {
        messages.push({ role: 'system', content: referencesContent })
      }
    }

    // 3. 状态化上下文：历史摘要层
    if (useStateful && contextState?.summary) {
      messages.push({
        role: 'system',
        content: `=== 对话摘要（此前轮次） ===\n\n${contextState.summary}`
      })
    }

    // 4. 历史消息：滑动窗口（状态化）或最近 N 条（兼容）
    if (includeHistory && session.messages) {
      const historyLimit = useStateful ? recentMessages : maxHistoryMessages
      const historyMessages = this.buildHistoryMessages(session.messages, historyLimit)
      messages.push(...historyMessages)
    }

    // 5. Token 安全：若超 80% 软上限，仅做日志与截断提示（强制摘要在执行器触发）
    const estimated = this.estimateTokens(messages)
    if (estimated > CONTEXT_CONFIG.maxContextTokens * 0.8) {
      getLogger().warn('[buildMessages] 上下文 token 接近上限，建议触发摘要', {
        estimated,
        max: CONTEXT_CONFIG.maxContextTokens
      })
    }

    return messages
  }

  /**
   * 估算消息列表的 token 数（约 4 字符/token，与常见模型一致）
   */
  static estimateTokens(messages: LlmMessage[]): number {
    let chars = 0
    for (const m of messages) {
      if (m.content && typeof m.content === 'string') chars += m.content.length
      if (Array.isArray(m.tool_calls)) {
        for (const tc of m.tool_calls) {
          if (tc.function?.arguments) chars += tc.function.arguments.length
          if (tc.function?.name) chars += tc.function.name.length
        }
      }
    }
    return Math.ceil(chars / 4)
  }

  /**
   * 获取当前上下文的 token 占用（供 UI 显示进度）
   */
  static getContextUsage(
    session: AgentSession | LegacyAgentSession,
    agentConfig: AgentConfig,
    options: ContextBuildOptions = {}
  ): { estimatedTokens: number; maxTokens: number; percentage: number } {
    const messages = this.buildMessages(session, agentConfig, options)
    const estimatedTokens = this.estimateTokens(messages)
    const maxTokens = CONTEXT_CONFIG.maxContextTokens
    const percentage = Math.min(100, Math.round((estimatedTokens / maxTokens) * 100))
    return { estimatedTokens, maxTokens, percentage }
  }

  /**
   * 获取当前上下文的组成明细（系统提示、引用、摘要、历史消息及各部分 token 占用）
   */
  static getContextBreakdown(
    session: AgentSession | LegacyAgentSession,
    agentConfig: AgentConfig,
    options: ContextBuildOptions = {}
  ): ContextBreakdown {
    const messages = this.buildMessages(session, agentConfig, options)
    const maxTokens = CONTEXT_CONFIG.maxContextTokens

    const partIds: Array<ContextPartId> = ['systemPrompt', 'references', 'summary', 'history']
    const partChars: Record<ContextPartId, number> = {
      systemPrompt: 0,
      references: 0,
      summary: 0,
      history: 0
    }

    let systemIndex = 0
    for (const m of messages) {
      const contentLength =
        (typeof m.content === 'string' ? m.content.length : 0) +
        (Array.isArray(m.tool_calls)
          ? (m.tool_calls as any[]).reduce(
              (acc, tc) =>
                acc + (tc.function?.arguments?.length ?? 0) + (tc.function?.name?.length ?? 0),
              0
            )
          : 0)

      if (m.role === 'system') {
        systemIndex++
        if (systemIndex === 1) partChars.systemPrompt += contentLength
        else if (systemIndex === 2) partChars.references += contentLength
        else if (systemIndex >= 3) partChars.summary += contentLength
      } else {
        partChars.history += contentLength
      }
    }

    const parts: ContextPartUsage[] = partIds.map((id) => ({
      id,
      chars: partChars[id],
      tokens: Math.ceil(partChars[id] / 4)
    }))

    const totalChars = parts.reduce((sum, p) => sum + p.chars, 0)
    const totalTokens = parts.reduce((sum, p) => sum + p.tokens, 0)
    const percentage = Math.min(100, Math.round((totalTokens / maxTokens) * 100))

    return {
      parts,
      totalChars,
      totalTokens,
      maxTokens,
      percentage
    }
  }

  /**
   * 压缩工具输出，避免炸上下文（terminal / 大文件等）
   */
  static compressToolResult(toolId: string, content: string): string {
    if (!content || typeof content !== 'string') return content
    const limit = CONTEXT_CONFIG.toolOutputLimitChars
    const id = (toolId || '').toLowerCase()

    if (id === 'terminal' || id.includes('terminal')) {
      if (content.length <= limit) return content
      const head = content.slice(0, 1200)
      const tail = content.slice(-400)
      const hasError = /error|failed|✘|错误|失败/i.test(content)
      const hasWarn = /warn|⚠/i.test(content)
      return [
        'Command output truncated for context (total ' + content.length + ' chars).',
        hasError ? '✘ Contains errors.' : '✔ No errors in excerpt.',
        hasWarn ? '⚠ Warnings present.' : '',
        '--- First part ---',
        head,
        '...',
        '--- Last part ---',
        tail
      ]
        .filter(Boolean)
        .join('\n')
    }

    if (id === 'workspace' || id === 'read_file' || id.includes('workspace')) {
      const lines = content.split(/\r?\n/)
      const maxLines = CONTEXT_CONFIG.readFileMaxLines
      if (lines.length <= maxLines) return content
      return (
        `File too large (${lines.length} lines). Showing first ${maxLines} lines. Use read_file_range or grep for more.\n\n` +
        lines.slice(0, maxLines).join('\n') +
        '\n... (truncated)'
      )
    }

    if (content.length > limit) {
      return content.slice(0, limit) + '\n... (truncated, total ' + content.length + ' chars)'
    }
    return content
  }

  /**
   * 自动历史摘要：将旧消息归纳为 summary，供状态化上下文使用
   * 触发条件：session.messages.length > summaryTrigger 且存在 engine
   */
  static async summarizeHistory(
    session: AgentSession | LegacyAgentSession,
    _agentConfig: AgentConfig,
    engine: AgentEngine,
    signal?: AbortSignal
  ): Promise<void> {
    const sessionAny = session as any
    if (!session.messages || session.messages.length < CONTEXT_CONFIG.summaryTrigger) {
      return
    }
    if (!sessionAny.contextState) {
      sessionAny.contextState = {}
    }
    const endIndex = Math.max(
      0,
      session.messages.length - CONTEXT_CONFIG.recentMessagesDefault
    )
    if (endIndex <= 0) return

    const lastSummaryIndex = sessionAny.contextState.lastSummaryIndex ?? 0
    if (endIndex <= lastSummaryIndex) return

    const toSummarize = session.messages.slice(0, endIndex)
    const historyLines: string[] = []
    const maxLineLen = 800
    for (const msg of toSummarize) {
      let line = ''
      if (msg.role === 'user' && msg.type === 'chat') {
        const t = (msg as any).markdown || ''
        line = 'User: ' + (t.length > maxLineLen ? t.slice(0, maxLineLen) + '...' : t)
      } else if (msg.role === 'assistant' && msg.type === 'chat') {
        const t = (msg as any).markdown || ''
        line = 'Assistant: ' + (t.length > maxLineLen ? t.slice(0, maxLineLen) + '...' : t)
      } else if (msg.role === 'tool' && msg.type === 'tool') {
        const name = (msg as any).tool?.name || (msg as any).tool?.id || 'tool'
        const t = (msg as any).markdown || (msg as any).summary || ''
        line = 'Tool (' + name + '): ' + (t.length > maxLineLen ? t.slice(0, maxLineLen) + '...' : t)
      }
      if (line) historyLines.push(line)
    }
    const historyText = historyLines.join('\n\n')
    if (!historyText.trim()) return

    const prompt = getPromptByKey('agent.contextSummary.prompt', { historyText })
    try {
      const llmConfig = await LlmAdapter.getLlmConfig(engine)
      const summary = await LlmAdapter.callChat(
        llmConfig,
        [
          { role: 'system', content: 'You summarize conversation history. Output only the summary, no preamble.' },
          { role: 'user', content: prompt }
        ],
        { temperature: 0.3, maxTokens: 800, stream: false, signal }
      )
      const trimmed = (summary || '').trim()
      if (trimmed) {
        sessionAny.contextState.summary = trimmed
        sessionAny.contextState.lastSummaryIndex = endIndex
        getLogger().info('[summarizeHistory] 已更新对话摘要', {
          endIndex,
          summaryLength: trimmed.length
        })
      }
    } catch (e) {
      getLogger().warn('[summarizeHistory] 摘要失败，继续使用近期消息', e)
    }
  }

  /**
   * 获取系统信息（操作系统、处理器架构）
   */
  private static getSystemInfo(): { platform: string; arch: string } {
    let platform = 'unknown'
    let arch = 'unknown'

    try {
      // 优先使用 Electron 的 process 对象（如果可用）
      // 在 Electron 中，window.electron.process 可能包含 platform 和 arch
      if (typeof window !== 'undefined') {
        const win = window as any
        // 尝试多种方式获取 Electron process 信息
        if (win.electron?.process) {
          const electronProcess = win.electron.process
          if (electronProcess.platform) {
            platform = electronProcess.platform
          }
          if (electronProcess.arch) {
            arch = electronProcess.arch
          }
        }
        // 如果 Electron process 不可用，尝试直接访问 process（如果 contextIsolation 允许）
        if (
          (platform === 'unknown' || arch === 'unknown') &&
          typeof (window as any).process !== 'undefined'
        ) {
          const nodeProcess = (window as any).process
          if (nodeProcess.platform && platform === 'unknown') {
            platform = nodeProcess.platform
          }
          if (nodeProcess.arch && arch === 'unknown') {
            arch = nodeProcess.arch
          }
        }
      }

      // 如果仍未获取到信息，回退到 navigator API
      if ((platform === 'unknown' || arch === 'unknown') && typeof navigator !== 'undefined') {
        const userAgent = navigator.userAgent || ''
        const platformStr = navigator.platform || ''

        // 解析操作系统
        if (platform === 'unknown') {
          if (userAgent.includes('Win') || platformStr.includes('Win')) {
            platform = 'win32'
          } else if (userAgent.includes('Mac') || platformStr.includes('Mac')) {
            platform = 'darwin'
          } else if (userAgent.includes('Linux') || platformStr.includes('Linux')) {
            platform = 'linux'
          } else {
            platform = platformStr.toLowerCase() || 'unknown'
          }
        }

        // 解析处理器架构
        if (arch === 'unknown') {
          if (
            userAgent.includes('x64') ||
            userAgent.includes('x86_64') ||
            userAgent.includes('AMD64')
          ) {
            arch = 'x64'
          } else if (userAgent.includes('x86') || userAgent.includes('i686')) {
            arch = 'ia32'
          } else if (userAgent.includes('ARM64') || userAgent.includes('arm64')) {
            arch = 'arm64'
          } else if (userAgent.includes('ARM')) {
            arch = 'arm'
          } else {
            // 尝试从 navigator 获取
            const cpuClass = (navigator as any).cpuClass
            if (cpuClass) {
              arch = cpuClass.toLowerCase()
            } else {
              arch = 'unknown'
            }
          }
        }
      }
    } catch (error) {
      const logger = createRendererLogger('AIContextManager')
      logger.warn('[getSystemInfo] Failed to get system info:', error)
    }

    const platformNames: Record<string, string> = {
      win32: 'Windows',
      darwin: 'macOS',
      linux: 'Linux',
      unknown: 'Unknown'
    }

    const archNames: Record<string, string> = {
      x64: 'x64 (64-bit)',
      ia32: 'x86 (32-bit)',
      arm64: 'ARM64',
      arm: 'ARM',
      unknown: 'Unknown'
    }

    return {
      platform: platformNames[platform] || platform,
      arch: archNames[arch] || arch
    }
  }

  /**
   * 构建系统提示词
   */
  private static buildSystemPrompt(
    session: AgentSession | LegacyAgentSession,
    agentConfig: AgentConfig,
    override?: string
  ): string {
    if (override) {
      return override
    }

    let prompt = ''

    // AgentConfig 的系统提示词：优先从 locale_prompts 的 systemPromptKey 解析，否则用内联 systemPrompt
    const systemPromptKey = agentConfig.llmConfig?.systemPromptKey
    const systemPromptFromLocale =
      systemPromptKey ? getPromptByKey(systemPromptKey) : ''
    const baseSystemPrompt =
      (systemPromptFromLocale && systemPromptFromLocale.trim()) ||
      agentConfig.llmConfig?.systemPrompt ||
      ''
    if (baseSystemPrompt) {
      prompt += baseSystemPrompt + '\n\n'
    }

    const sessionRecord = session as unknown as { __agentRulesPromptBlock?: string }
    const rulesBlock = sessionRecord.__agentRulesPromptBlock
    if (rulesBlock && String(rulesBlock).trim()) {
      prompt += '=== MetaDoc rules (system + approved dynamic) ===\n\n'
      prompt += String(rulesBlock).trim()
      prompt += '\n\n'
    }

    // 若当前语言有「仅在实际成功后再标记 todolist 完成」的独立文案，则追加（en/ja/ko/de/fr 等短 prompt 语言）
    const todolistRule = getPromptByKey('agent.todolist.onlyMarkCompleteWhenSucceeded')
    if (todolistRule && todolistRule.trim()) {
      prompt += todolistRule.trim() + '\n\n'
    }

    // Inject timestamp and system info (English only for agent prompts)
    if (agentConfig.llmConfig?.injectTimestamp) {
      const now = new Date()
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const systemInfo = this.getSystemInfo()

      prompt += `Current time: ${now.toISOString()}\n`
      prompt += `Timezone: ${timeZone}\n`
      prompt += `Platform: ${systemInfo.platform}\n`
      prompt += `Architecture: ${systemInfo.arch}\n\n`
    }

    // 注入当前打开的文档 Tab 列表与工作区信息（与时间戳、当前 tab reference 同级）
    try {
      const workspace = useWorkspace()
      const documentTabs = (
        workspace.tabs as Array<{
          id: string
          title: string
          path: string
          kind: string
          format?: string
        }>
      )
        .filter((tab) => tab.kind === 'file' || tab.kind === 'new')
        .map((tab) => ({
          id: tab.id,
          title: tab.title,
          path: tab.path,
          format: tab.format || 'md'
        }))
      if (documentTabs.length > 0) {
        prompt += `Open document tabs (${documentTabs.length}):\n`
        documentTabs.forEach((t, i) => {
          prompt += `  ${i + 1}. id=${t.id}, title=${t.title || '(untitled)'}, path=${t.path || '(unsaved)'}, format=${t.format}\n`
        })
        prompt += '\n'
      }
      let roots: string[] = []
      try {
        const saved = localStorage.getItem('workspaceFolders')
        if (saved) {
          const arr = JSON.parse(saved)
          roots = Array.isArray(arr)
            ? arr.filter((p: unknown) => typeof p === 'string' && p.length > 0)
            : []
        }
      } catch {
        // ignore
      }
      if (roots.length > 0) {
        prompt += `Workspace roots: ${roots.join(', ')}\n\n`
      } else {
        prompt += 'Workspace: default (no folder open)\n\n'
      }
    } catch (e) {
      getLogger().warn('[buildSystemPrompt] Failed to inject openTabs/workspace', e)
    }

    // 公共上下文（兼容新旧格式）
    const publicCtx = (session as any).publicContext
    if (publicCtx) {
      if (publicCtx.currentTime) {
        prompt += `System time: ${publicCtx.currentTime}\n`
      }
      if (publicCtx.timezone) {
        prompt += `Timezone: ${publicCtx.timezone}\n`
      }
      if (publicCtx.document) {
        prompt += `Current document: ${publicCtx.document.title || publicCtx.document.path}\n`
        const docFormat = publicCtx.document.format || 'md'
        prompt += `**Document format: ${docFormat === 'tex' ? 'LaTeX' : 'Markdown'}**\n\n`

        // 记录日志：文档格式检测和提示词注入
        const logger = createRendererLogger('AIContextManager')
        logger.info('[buildSystemPrompt] 检测到文档格式，注入格式提示词', {
          documentPath: publicCtx.document.path,
          documentTitle: publicCtx.document.title,
          detectedFormat: docFormat,
          formatType: docFormat === 'tex' ? 'LaTeX' : 'Markdown'
        })

        // 根据文档格式添加格式特定的重要提示
        if (docFormat === 'tex') {
          logger.info('[buildSystemPrompt] Inject LaTeX format prompt')
          prompt += `## ⚠️ Important: Current document is LaTeX format\n\n`
          prompt += `**You must follow these rules:**\n`
          prompt += `1. **All generated content must use LaTeX syntax**:\n`
          prompt += `   - Use \\section{}, \\subsection{}, \\subsubsection{} for headings\n`
          prompt += `   - **Do not use Markdown #, ##, ### for headings**\n`
          prompt += `   - Use \\begin{itemize} or \\begin{enumerate} for lists\n`
          prompt += `   - Use \\textbf{}, \\textit{} for emphasis\n`
          prompt += `2. **Chart insertion**: Use PDF format, syntax: \\includegraphics[width=0.8\\textwidth]{imageURL}\n`
          prompt += `3. **Do not mix formats**: Current document is LaTeX; do not generate Markdown.\n\n`
          logger.info('[buildSystemPrompt] LaTeX format prompt injected')
        } else {
          logger.info('[buildSystemPrompt] Inject Markdown format prompt')
          prompt += `## ⚠️ Important: Current document is Markdown format\n\n`
          prompt += `**You must follow these rules:**\n`
          prompt += `1. **All generated content must use Markdown syntax**:\n`
          prompt += `   - Use #, ##, ### for headings\n`
          prompt += `   - **Do not use LaTeX \\section{}, \\subsection{}**\n`
          prompt += `   - Use - or 1. for lists\n`
          prompt += `   - Use **bold** or *italic* for emphasis\n`
          prompt += `2. **Chart insertion**: Use SVG or PNG, syntax: ![description](imageURL)\n`
          prompt += `3. **Do not mix formats**: Current document is Markdown; do not generate LaTeX.\n\n`
          logger.info('[buildSystemPrompt] Markdown format prompt injected')
        }
      }
      if (!publicCtx.document) {
        prompt += '\n'
      }
    }

    return prompt.trim()
  }

  /**
   * 构建引用素材内容
   */
  private static buildReferencesContent(references: Reference[]): string {
    if (references.length === 0) return ''

    const logger = createRendererLogger('AIContextManager')
    logger.info('[buildReferencesContent] Building reference content', {
      referenceCount: references.length,
      references: references.map((ref) => ({
        id: ref.id,
        name: ref.name,
        format: ref.format,
        hasParsedContent: !!ref.parsedContent,
        parsedContentLength: ref.parsedContent?.length || 0
      }))
    })

    let content = '=== Reference Materials ===\n\n'
    for (const ref of references) {
      content += `[${ref.name}] (format: ${ref.format}, origin: ${ref.origin})\n`

      if (ref.description) {
        content += `Description: ${ref.description}\n`
      }

      if (ref.metadata?.attachmentStorage === 'workspace' && !ref.parsedContent) {
        content += `Workspace attachment (read via workspace tool; absolute path): ${ref.origin}\n`
        if (ref.metadata?.workspaceRelativePath) {
          content += `Relative to workspace root: ${ref.metadata.workspaceRelativePath}\n`
        }
      } else if (ref.parsedContent) {
        content += `\nParsed content (data analysis/text extraction):\n\`\`\`\n${ref.parsedContent}\n\`\`\`\n`
      } else {
        logger.warn(`[buildReferencesContent] Reference ${ref.name} missing parsedContent`)
      }
      content += '\n'
    }

    logger.info('[buildReferencesContent] Build complete', {
      totalContentLength: content.length
    })

    return content
  }

  /** 将用户消息中快照的附件路径/内联片段拼入发给 LLM 的正文（工作区附件不注入全文） */
  private static appendUserChatAttachmentHints(content: string, msg: ChatAgentMessage): string {
    let out = content
    const wa = msg.workspaceAttachments
    if (wa && wa.length > 0) {
      const lines = wa.map((a) => `- ${a.name} (${a.format}): ${a.absolutePath}`).join('\n')
      const relHint = wa
        .map((a) => a.relativePath)
        .filter(Boolean)
        .map((p) => `  relative: ${p}`)
        .join('\n')
      out +=
        '\n\n[Attached files in workspace — file contents are not inlined. Use the **workspace** tool with these absolute paths (or the relative paths from workspace root).]\n' +
        lines +
        (relHint ? `\n${relHint}` : '')
    }
    const inlineSnippets = msg.inlineReferenceSnippets
    if (inlineSnippets && inlineSnippets.length > 0) {
      for (const s of inlineSnippets) {
        out += `\n\n[Reference snippet: ${s.name}] (format: ${s.format})\n\`\`\`\n${s.text}\n\`\`\``
      }
    }
    return out
  }

  /**
   * 构建历史消息
   */
  private static buildHistoryMessages(messages: AgentMessage[], maxMessages: number): LlmMessage[] {
    const llmMessages: LlmMessage[] = []

    // 只取最近的消息
    const recentMessages = messages.slice(-maxMessages)

    // 验证并修复消息顺序：确保assistant消息有tool_calls后必须紧跟tool消息
    // 记录每个assistant消息的tool_call_ids
    const pendingToolCallIds = new Set<string>()

    for (const msg of recentMessages) {
      if (msg.role === 'user') {
        if (msg.type === 'chat') {
          // 发送给 AI 时把闭合 tag @[path] 转成 @path，便于模型理解
          const rawContent = msg.markdown || ''
          let contentForLlm = rawContent.replace(/@\[([^\]]+)\]/g, '@$1')
          contentForLlm = this.appendUserChatAttachmentHints(
            contentForLlm,
            msg as ChatAgentMessage
          )
          llmMessages.push({
            role: msg.role,
            content: contentForLlm
          })
        }
      } else if (msg.role === 'assistant') {
        if (msg.type === 'chat') {
          // 构建符合OpenAI API规范的消息对象，确保不包含type字段
          const assistantLlmMessage: any = {
            role: msg.role
          }

          // 如果助手消息包含tool_calls，添加到LLM消息中（OpenAI格式）
          const msgToolCalls = (msg as any).tool_calls
          const logger = createRendererLogger('AIContextManager')

          // // 记录调试信息
          // logger.debug('[buildHistoryMessages] 检查assistant消息tool_calls:', {
          //   messageId: msg.id,
          //   hasToolCalls: !!msgToolCalls,
          //   toolCallsType: typeof msgToolCalls,
          //   isArray: Array.isArray(msgToolCalls),
          //   toolCallsLength: Array.isArray(msgToolCalls) ? msgToolCalls.length : 0,
          //   messageKeys: Object.keys(msg),
          //   toolCallsValue: msgToolCalls
          // })

          if (msgToolCalls && Array.isArray(msgToolCalls) && msgToolCalls.length > 0) {
            const mappedCalls = msgToolCalls.map((tc: any) => {
              // 确保arguments是对象格式（OpenAI API要求）
              // 支持多种输入格式：
              // 1. tc.parameters (我们的内部格式)
              // 2. tc.function?.arguments (OpenAI格式)
              // 3. tc.arguments (其他格式)
              let functionArgs: any

              // 优先使用function.arguments（如果已经是OpenAI格式）
              if (tc.function && typeof tc.function.arguments !== 'undefined') {
                if (typeof tc.function.arguments === 'string') {
                  try {
                    functionArgs = JSON.parse(tc.function.arguments)
                  } catch {
                    functionArgs = {}
                  }
                } else if (
                  typeof tc.function.arguments === 'object' &&
                  tc.function.arguments !== null
                ) {
                  functionArgs = tc.function.arguments
                } else {
                  functionArgs = {}
                }
              } else if (typeof tc.parameters !== 'undefined') {
                // 使用我们的内部格式（parameters）
                if (typeof tc.parameters === 'string') {
                  try {
                    functionArgs = JSON.parse(tc.parameters)
                  } catch {
                    functionArgs = {}
                  }
                } else if (typeof tc.parameters === 'object' && tc.parameters !== null) {
                  functionArgs = tc.parameters
                } else {
                  functionArgs = {}
                }
              } else if (typeof tc.arguments !== 'undefined') {
                // 其他格式
                if (typeof tc.arguments === 'string') {
                  try {
                    functionArgs = JSON.parse(tc.arguments)
                  } catch {
                    functionArgs = {}
                  }
                } else if (typeof tc.arguments === 'object' && tc.arguments !== null) {
                  functionArgs = tc.arguments
                } else {
                  functionArgs = {}
                }
              } else {
                functionArgs = {}
              }

              // 确保functionArgs是对象（用于后续序列化）
              if (typeof functionArgs === 'string') {
                try {
                  functionArgs = JSON.parse(functionArgs)
                } catch {
                  functionArgs = {}
                }
              } else if (typeof functionArgs !== 'object' || functionArgs === null) {
                functionArgs = {}
              }

              // OpenAI API要求：arguments必须是JSON字符串，不是对象！
              // 将functionArgs对象序列化为JSON字符串
              let argumentsString: string
              try {
                argumentsString = JSON.stringify(functionArgs)
              } catch {
                argumentsString = '{}'
              }

              const id = tc.id || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
              return {
                id,
                type: 'function',
                function: {
                  name: tc.tool_id || tc.function?.name || '',
                  arguments: argumentsString // OpenAI API要求：必须是JSON字符串！
                }
              }
            })
            assistantLlmMessage.tool_calls = mappedCalls
            // 如果有tool_calls，content应该为null（如果markdown为空或只包含空白字符）
            assistantLlmMessage.content = msg.markdown && msg.markdown.trim() ? msg.markdown : null

            // 记录本条 assistant 实际发出的 tool_call id（与 llm 消息中一致），用于后续匹配 tool 消息
            for (const c of mappedCalls) {
              pendingToolCallIds.add(c.id)
            }
          } else {
            // 没有tool_calls，使用正常的content
            assistantLlmMessage.content = msg.markdown || ''
          }

          // 确保不包含type字段
          llmMessages.push(assistantLlmMessage)
        }
      } else if (msg.role === 'tool' && msg.type === 'tool') {
        // 工具调用结果
        // 重要：工具消息在addToolMessage时已经保存了OpenAI格式的content字符串（保存在markdown字段）
        // 这里直接使用，不需要转换
        const toolCallId = (msg as any).tool_call_id || msg.id
        const toolName = msg.tool?.name || msg.tool?.id || 'unknown'

        // 使用保存的OpenAI格式content（如果存在），否则回退到markdown字段或生成默认内容
        let content: string
        if (msg.markdown && typeof msg.markdown === 'string') {
          // 使用已保存的OpenAI格式content
          content = msg.markdown
        } else {
          // 回退：如果没有保存OpenAI格式content，使用ToolRunner序列化方法生成

          const observation = {
            toolId: msg.tool?.id || 'unknown',
            toolName,
            status: (msg.status === 'succeeded' ? 'succeeded' : 'failed') as 'succeeded' | 'failed',
            result: msg.outputs && msg.outputs.length > 0 ? msg.outputs[0].data : undefined,
            error: (msg as any).error,
            summary: (msg as any).summary
          }
          content = ToolRunner.serializeToOpenAIFormat(observation)
        }

        // 确保content是字符串（双重检查）
        if (typeof content !== 'string') {
          content = String(content || '')
        }

        const toolLlmMessage: any = {
          role: 'tool',
          content: content, // content必须是字符串，已经在addToolMessage时序列化好了
          tool_call_id: toolCallId
        }

        // 根据OpenAI API规范，tool消息应该包含name字段（函数名称）
        if (toolName && toolName !== 'unknown') {
          toolLlmMessage.name = toolName
        }

        // 移除pendingToolCallIds中对应的id
        if (toolCallId && pendingToolCallIds.has(toolCallId)) {
          pendingToolCallIds.delete(toolCallId)
        }

        llmMessages.push(toolLlmMessage)
      }
    }

    // 对齐 id：若 assistant 的 tool_calls 与紧随的 tool 消息数量一致，用 tool 消息的 tool_call_id 覆盖 assistant.tool_calls[].id，避免 session 中 id 缺失导致 API 报 “insufficient tool messages”
    for (let i = 0; i < llmMessages.length; i++) {
      const m = llmMessages[i] as any
      if (m.role !== 'assistant' || !Array.isArray(m.tool_calls) || m.tool_calls.length === 0)
        continue
      const need = m.tool_calls.length
      let j = i + 1
      while (j < llmMessages.length && (llmMessages[j] as any).role === 'tool') j++
      const toolCount = j - i - 1
      if (toolCount !== need) continue
      for (let k = 0; k < need; k++) {
        const toolMsg = llmMessages[i + 1 + k] as any
        const newId = toolMsg.tool_call_id
        if (newId) {
          const oldId = m.tool_calls[k].id
          if (oldId) pendingToolCallIds.delete(oldId)
          m.tool_calls[k].id = newId
        }
      }
    }

    // 若有未匹配的 tool_calls（如 singleStep 打断后下一轮），API 会 400。移除“带 tool_calls 且无对应 tool”的 assistant 及其紧随的 tool 消息，避免孤立的 tool 消息导致 400。
    while (pendingToolCallIds.size > 0) {
      let removed = false
      for (let i = llmMessages.length - 1; i >= 0; i--) {
        if (llmMessages[i].role === 'assistant' && (llmMessages[i] as any).tool_calls?.length) {
          const tc = (llmMessages[i] as any).tool_calls as Array<{ id?: string }>
          for (const c of tc) if (c.id) pendingToolCallIds.delete(c.id)
          llmMessages.splice(i, 1)
          // 移除紧随其后的 tool 消息，否则会出现 "tool must be response to tool_calls" 的 400
          while (i < llmMessages.length && llmMessages[i].role === 'tool') {
            llmMessages.splice(i, 1)
          }
          removed = true
          break
        }
      }
      if (!removed) break
    }
    if (pendingToolCallIds.size > 0) {
      const logger = createRendererLogger('AIContextManager')
      logger.warn(
        `仍有 ${pendingToolCallIds.size} 个 tool_calls 无对应 tool 消息（已移除不完整 assistant）`
      )
    }

    // 再做一层安全过滤：移除历史中「找不到任一 assistant.tool_calls 对应关系」的孤立 tool 消息，
    // 避免 AI SDK / OpenAI 报错 “Messages with role 'tool' must be a response to a preceding message with 'tool_calls'”
    const validToolCallIds = new Set<string>()
    for (const m of llmMessages as any[]) {
      if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
        for (const tc of m.tool_calls) {
          if (tc && typeof tc.id === 'string' && tc.id) {
            validToolCallIds.add(tc.id)
          }
        }
      }
    }
    if (validToolCallIds.size > 0) {
      for (let i = llmMessages.length - 1; i >= 0; i--) {
        const m: any = llmMessages[i]
        if (m.role === 'tool') {
          const tcId = m.tool_call_id
          // 没有 tool_call_id 或在任何 assistant.tool_calls 中都不存在，视为「孤立 tool」，从上下文中移除
          if (!tcId || !validToolCallIds.has(tcId)) {
            llmMessages.splice(i, 1)
          }
        }
      }
    } else {
      // 没有任何 assistant.tool_calls，则所有历史 tool 消息对当前调用都是多余的，全部移除以避免协议错误
      for (let i = llmMessages.length - 1; i >= 0; i--) {
        if ((llmMessages[i] as any).role === 'tool') {
          llmMessages.splice(i, 1)
        }
      }
    }

    // 移除末尾「仅空白内容」的 assistant 消息（取消/中断后残留），确保 API 不收到空 assistant 导致“思考后无输出”
    while (llmMessages.length > 0) {
      const last = llmMessages[llmMessages.length - 1] as any
      if (last.role === 'assistant') {
        const content = last.content
        const isEmpty =
          content == null || (typeof content === 'string' && !String(content).trim())
        const noToolCalls = !Array.isArray(last.tool_calls) || last.tool_calls.length === 0
        if (isEmpty && noToolCalls) {
          llmMessages.pop()
          continue
        }
      }
      break
    }

    return llmMessages
  }

  /**
   * 添加用户消息
   */
  static addUserMessage(session: AgentSession | LegacyAgentSession, content: string): AgentMessage {
    const message: AgentMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'user',
      type: 'chat',
      timestamp: new Date().toISOString(),
      markdown: content
    }

    session.messages.push(message)
    // 兼容新旧格式的updatedAt
    if (typeof session.updatedAt === 'string') {
      session.updatedAt = new Date().toISOString()
    } else {
      session.updatedAt = Date.now()
    }

    return message
  }

  /**
   * 添加助手消息
   */
  static addAssistantMessage(
    session: AgentSession | LegacyAgentSession,
    content: string,
    tool_calls: Array<{ id: string; tool_id: string; parameters: Record<string, unknown> }> = []
  ): AgentMessage {
    const message: AgentMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'assistant',
      type: 'chat',
      timestamp: new Date().toISOString(),
      markdown: content,
      ...(tool_calls.length > 0 ? { tool_calls } : {})
    }

    session.messages.push(message)
    // 兼容新旧格式的updatedAt
    if (typeof session.updatedAt === 'string') {
      session.updatedAt = new Date().toISOString()
    } else {
      session.updatedAt = Date.now()
    }

    return message
  }

  /**
   * 添加工具消息（支持一开始就插入 status='running'，便于 UI 立即展示并随执行过程更新）
   *
   * 重要：status 为 running/pending 时立即 push 到 session.messages，返回该 message；
   * 执行完成后由调用方使用 completeToolMessage(session, message.id, observation, params) 替换同一条消息以触发视图更新。
   */
  static addToolMessage(
    session: AgentSession | LegacyAgentSession,
    toolId: string,
    toolName: string,
    status: 'pending' | 'running' | 'succeeded' | 'failed',
    data?: unknown,
    error?: string,
    summary?: string,
    tool_call_id?: string,
    toolConfig?: any,
    params?: Record<string, unknown>, // 添加params参数，用于保存工具调用参数
    /** 若指定，将消息插入到该下标处（splice），否则 push 到末尾；用于在 assistant 与 tool 块之间补协议占位 */
    insertAtIndex?: number
  ): AgentMessage {
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // 构建outputs数组，支持从ToolCallbackResult.data中提取信息（用于显示和快照）
    let outputs: Array<{
      id: string
      label: string
      format: 'text' | 'json' | 'markdown' | 'html' | 'table' | 'custom'
      data: unknown
      renderer?: string
    }> = []

    // 检查是否是包装对象（包含result和data字段，用于区分给AI和Display的内容）
    const isWrappedResult = data && typeof data === 'object' && 'result' in data && 'data' in data
    let displayData = isWrappedResult ? (data as any).data : data // 用于Display组件的数据
    // running/pending 时若无 data，用占位数据以便正确选出 Display 组件并显示“执行中”
    if ((status === 'running' || status === 'pending') && displayData == null) {
      displayData = { stage: 'loading' }
    }

    // toolId -> Display 组件名，组件对象无 .name 时用于补全 renderer（持久化后能正确渲染）
    const TOOL_ID_RENDERER: Record<string, string> = {
      edit: 'EditDisplay',
      grep: 'GrepDisplay',
      todolist: 'TodoListDisplay',
      'todolist-planning': 'TodoListDisplay',
      workspace: 'WorkspaceDisplay',
      'outline-tree': 'OutlineTreeDisplay',
      'outline-optimize': 'OutlineOptimizeDisplay',
      diff: 'DiffDisplay',
      proofread: 'ProofreadDisplay',
      'title-format': 'TitleFormatDisplay',
      'chart-generation': 'ChartGenerationDisplay',
      'data-analysis': 'DataAnalysisDisplay',
      'web-crawler': 'WebCrawlerDisplay',
      terminal: 'TerminalExecutionDisplay',
      'latex-compile': 'LaTeXCompileDisplay',
      metadata: 'MetadataDisplay',
      color: 'ColorDisplay',
      rag: 'RAGToolDisplay',
      'subagent-workspace-reader': 'SubagentDisplay',
      'subagent-doc-writer': 'SubagentDisplay',
      'subagent-search': 'SubagentDisplay',
      'subagent-chart': 'SubagentDisplay'
    }
    const resolveRendererName = (fromComponent: string | undefined): string | undefined =>
      fromComponent ?? (toolId ? TOOL_ID_RENDERER[toolId] : undefined)

    // 如果displayData是ToolCallbackData格式，提取format和content
    if (
      displayData &&
      typeof displayData === 'object' &&
      'content' in displayData &&
      'format' in displayData
    ) {
      const callbackData = displayData as any
      const displayComponent = toolConfig?.displayComponent

      let rendererName: string | undefined = undefined
      if (displayComponent) {
        if (typeof displayComponent === 'string') {
          rendererName = displayComponent
        } else if (typeof displayComponent === 'object') {
          rendererName =
            (displayComponent as any).name ||
            (displayComponent as any).__name ||
            (displayComponent as any).displayName
          if (!rendererName && (displayComponent as any).__file) {
            const match = String((displayComponent as any).__file).match(/([^/\\]+)\.vue$/)
            if (match && match[1]) {
              rendererName = match[1]
            }
          }
        }
      }
      rendererName = resolveRendererName(rendererName)

      outputs.push({
        id: 'result',
        label: '结果',
        format: (callbackData.format || 'json') as
          | 'text'
          | 'json'
          | 'markdown'
          | 'html'
          | 'table'
          | 'custom',
        data: callbackData.content,
        renderer: rendererName
      })
    } else if (displayData) {
      // 兼容旧格式：直接使用displayData
      const displayComponent = toolConfig?.displayComponent

      let rendererName: string | undefined = undefined
      if (displayComponent) {
        if (typeof displayComponent === 'string') {
          rendererName = displayComponent
        } else if (typeof displayComponent === 'object') {
          rendererName =
            (displayComponent as any).name ||
            (displayComponent as any).__name ||
            (displayComponent as any).displayName
          if (!rendererName && (displayComponent as any).__file) {
            const match = String((displayComponent as any).__file).match(/([^/\\]+)\.vue$/)
            if (match && match[1]) {
              rendererName = match[1]
            }
          }
        }
      }
      rendererName = resolveRendererName(rendererName)

      outputs.push({
        id: 'result',
        label: '结果',
        format: 'json' as 'text' | 'json' | 'markdown' | 'html' | 'table' | 'custom',
        data: displayData,
        renderer: rendererName
      })
    }

    // 构建OpenAI格式的content字符串（running/pending 时用占位，完成后由 completeToolMessage 覆盖）
    let openaiContent: string
    if (status === 'running' || status === 'pending') {
      openaiContent = '(执行中...)'
    } else {
      const observation = {
        toolId,
        toolName,
        status,
        result: data,
        error,
        summary,
        toolConfig
      }
      openaiContent = ToolRunner.serializeToOpenAIFormat(observation)
      openaiContent = this.compressToolResult(toolId, openaiContent)
    }

    const message: AgentMessage = {
      id: messageId,
      role: 'tool',
      type: 'tool',
      timestamp: new Date().toISOString(),
      tool: { id: toolId, name: toolName },
      status,
      error,
      summary,
      outputs,
      // 保存OpenAI格式的content字符串，这样buildHistoryMessages可以直接使用
      markdown: openaiContent, // 使用markdown字段保存OpenAI格式的content
      ...(tool_call_id ? { tool_call_id } : {}),
      // 与 tool_call_id 一致，供 Display 组件 useToolDisplayRealtime 订阅实时更新（执行中可收到 onUpdate）
      ...(tool_call_id ? { invocationId: tool_call_id } : {}),
      ...(toolConfig ? { tool_config: toolConfig } : {}),
      ...(params ? { params } : {}) // 保存工具调用参数，用于快照导出
    } as any // 使用as any因为params不在ToolAgentMessage接口中，但我们需要保存它

    if (typeof insertAtIndex === 'number' && insertAtIndex >= 0) {
      session.messages.splice(insertAtIndex, 0, message)
    } else {
      session.messages.push(message)
    }
    // 兼容新旧格式的updatedAt
    if (typeof session.updatedAt === 'string') {
      session.updatedAt = new Date().toISOString()
    } else {
      session.updatedAt = Date.now()
    }

    return message
  }

  /**
   * 中断/取消后：将仍为 running/pending 的工具行收尾，并为尚无对应 tool 消息的 tool_call_id 补失败占位，
   * 保证发给 LLM 的上下文满足「每个 tool_call_id 均有 tool 消息」的协议。
   */
  static finalizeInterruptedToolRounds(
    session: AgentSession | LegacyAgentSession,
    reason: string
  ): void {
    const messages = session.messages
    if (!Array.isArray(messages) || messages.length === 0) return

    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i] as any
      if (
        m.role === 'tool' &&
        m.type === 'tool' &&
        (m.status === 'running' || m.status === 'pending')
      ) {
        const toolId = m.tool?.id || 'unknown'
        let toolName = toolId
        const tn = m.tool?.name
        if (typeof tn === 'string') toolName = tn
        else if (tn && typeof tn === 'object') {
          toolName =
            (tn as { zh_cn?: { name?: string }; en_us?: { name?: string } }).zh_cn?.name ||
            (tn as { en_us?: { name?: string } }).en_us?.name ||
            toolId
        }
        const obs: ToolObservation = {
          toolId,
          toolName,
          status: 'failed',
          error: reason
        }
        AIContextManager.completeToolMessage(session, m.id, obs, m.params)
      }
    }

    const assistantIndicesWithTools: number[] = []
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i]
      if (m.role !== 'assistant' || m.type !== 'chat') continue
      const tcs = (m as any).tool_calls
      if (Array.isArray(tcs) && tcs.length > 0) assistantIndicesWithTools.push(i)
    }
    for (let k = assistantIndicesWithTools.length - 1; k >= 0; k--) {
      const i = assistantIndicesWithTools[k]
      const m = messages[i]
      const tcs = (m as any).tool_calls
      const needed = new Map<string, { toolId: string }>()
      for (const tc of tcs) {
        const id = tc?.id
        if (!id || typeof id !== 'string') continue
        const toolId =
          tc.tool_id ||
          (typeof tc.function?.name === 'string' ? tc.function.name : '') ||
          'unknown'
        needed.set(id, { toolId })
      }
      let insertAt = i + 1
      while (insertAt < messages.length && messages[insertAt].role === 'tool') {
        const tid = (messages[insertAt] as any).tool_call_id
        if (tid && needed.has(tid)) needed.delete(tid)
        insertAt++
      }
      if (needed.size === 0) continue
      let idx = insertAt
      for (const [callId, meta] of needed) {
        const nm = resolveToolDisplayNameForSynthetic(meta.toolId)
        AIContextManager.addToolMessage(
          session,
          meta.toolId,
          nm,
          'failed',
          undefined,
          reason,
          undefined,
          callId,
          undefined,
          undefined,
          idx
        )
        idx++
      }
    }
  }

  /**
   * 将之前用 addToolMessage(..., 'running') 插入的消息更新为完成状态。
   * 通过「按 id 查找并替换整条消息」触发 Vue 响应式更新，避免原地改属性不触发视图刷新。
   */
  static completeToolMessage(
    session: AgentSession | LegacyAgentSession,
    messageId: string,
    observation: ToolObservation,
    params?: Record<string, unknown>
  ): void {
    const index = session.messages.findIndex((m) => m.id === messageId)
    if (index < 0) return
    const existing = session.messages[index] as any
    if (existing.type !== 'tool' || existing.role !== 'tool') return

    const toolId = existing.tool?.id ?? observation.toolId
    const toolName = existing.tool?.name ?? observation.toolName
    const toolConfig = existing.tool_config

    const data = observation.result
    const isWrappedResult = data && typeof data === 'object' && 'result' in data && 'data' in data
    const displayData = isWrappedResult ? (data as any).data : data

    const TOOL_ID_RENDERER: Record<string, string> = {
      edit: 'EditDisplay',
      grep: 'GrepDisplay',
      timestamp: 'TimestampDisplay',
      todolist: 'TodoListDisplay',
      'todolist-planning': 'TodoListDisplay',
      workspace: 'WorkspaceDisplay',
      'outline-tree': 'OutlineTreeDisplay',
      'outline-optimize': 'OutlineOptimizeDisplay',
      diff: 'DiffDisplay',
      proofread: 'ProofreadDisplay',
      'title-format': 'TitleFormatDisplay',
      'chart-generation': 'ChartGenerationDisplay',
      'data-analysis': 'DataAnalysisDisplay',
      'web-crawler': 'WebCrawlerDisplay',
      terminal: 'TerminalExecutionDisplay',
      'latex-compile': 'LaTeXCompileDisplay',
      metadata: 'MetadataDisplay',
      color: 'ColorDisplay',
      rag: 'RAGToolDisplay',
      'subagent-workspace-reader': 'SubagentDisplay',
      'subagent-doc-writer': 'SubagentDisplay',
      'subagent-search': 'SubagentDisplay',
      'subagent-chart': 'SubagentDisplay'
    }
    const resolveRendererName = (fromComponent: string | undefined): string | undefined =>
      fromComponent ?? (toolId ? TOOL_ID_RENDERER[toolId] : undefined)

    const outputs: Array<{
      id: string
      label: string
      format: 'text' | 'json' | 'markdown' | 'html' | 'table' | 'custom'
      data: unknown
      renderer?: string
    }> = []

    if (
      displayData &&
      typeof displayData === 'object' &&
      'content' in displayData &&
      'format' in displayData
    ) {
      const callbackData = displayData as any
      let rendererName: string | undefined
      if (toolConfig?.displayComponent) {
        const dc = toolConfig.displayComponent
        rendererName =
          typeof dc === 'string'
            ? dc
            : (dc as any).name || (dc as any).__name || (dc as any).displayName
      }
      rendererName = resolveRendererName(rendererName)
      outputs.push({
        id: 'result',
        label: '结果',
        format: (callbackData.format || 'json') as 'text' | 'json' | 'markdown' | 'html' | 'table' | 'custom',
        data: callbackData.content,
        renderer: rendererName
      })
    } else if (displayData) {
      let rendererName: string | undefined
      if (toolConfig?.displayComponent) {
        const dc = toolConfig.displayComponent
        rendererName =
          typeof dc === 'string'
            ? dc
            : (dc as any).name || (dc as any).__name || (dc as any).displayName
      }
      rendererName = resolveRendererName(rendererName)
      outputs.push({
        id: 'result',
        label: '结果',
        format: 'json',
        data: displayData,
        renderer: rendererName
      })
    }

    let openaiContent = ToolRunner.serializeToOpenAIFormat({
      toolId,
      toolName,
      status: observation.status,
      result: data,
      error: observation.error,
      summary: observation.summary,
      toolConfig
    })
    openaiContent = this.compressToolResult(toolId, openaiContent)

    const completed: AgentMessage = {
      ...existing,
      status: observation.status,
      error: observation.error,
      summary: observation.summary,
      outputs,
      markdown: openaiContent,
      ...(params != null ? { params } : {})
    } as any

    session.messages[index] = completed
    if (typeof session.updatedAt === 'string') {
      session.updatedAt = new Date().toISOString()
    } else {
      session.updatedAt = Date.now()
    }
  }
}
