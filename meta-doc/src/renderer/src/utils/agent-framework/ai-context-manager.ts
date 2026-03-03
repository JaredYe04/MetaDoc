/**
 * AIContextManager - 上下文管理器
 * 负责管理Agent的上下文，包括历史消息、工作记忆、引用素材等
 */

import { AgentMessage } from '../../types/agent'
import type { AgentSession as LegacyAgentSession } from '../../types/agent'
import type { AgentSession, Reference, PublicContext } from '../../types/agent-framework'
import type { AgentConfig } from '../../types/agent-framework'
import { createRendererLogger } from '../logger'
import { ToolRunner } from './tool-runner'
import { useWorkspace } from '../../stores/workspace'
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

/**
 * 上下文构建选项
 */
export interface ContextBuildOptions {
  includeHistory?: boolean
  includeReferences?: boolean
  maxHistoryMessages?: number
  systemPromptOverride?: string
  activeReferenceIds?: string[] // 激活的引用ID列表，只处理这些引用
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
      systemPromptOverride
    } = options

    const messages: LlmMessage[] = []

    // 1. 系统提示词
    const systemPrompt = this.buildSystemPrompt(session, agentConfig, systemPromptOverride)
    if (systemPrompt) {
      // 记录系统提示词内容（用于调试格式提示词注入）
      const logger = createRendererLogger('AIContextManager')
      logger.debug('[buildMessages] 构建系统提示词', {
        promptLength: systemPrompt.length,
        containsFormatWarning: systemPrompt.includes('⚠️ 重要：当前文档是'),
        containsMarkdownWarning: systemPrompt.includes('Markdown 格式'),
        containsLatexWarning: systemPrompt.includes('LaTeX 格式'),
        promptPreview: systemPrompt.substring(0, 500) // 前500字符预览
      })

      messages.push({
        role: 'system',
        content: systemPrompt
      })
    }

    // 2. 引用素材（作为系统消息的一部分，兼容新旧格式）
    const referenceStore = (session as any).referenceStore
    const activeReferenceIds = options.activeReferenceIds
    const enableBuiltInDocRef = (session as AgentSession).enableBuiltInDocumentReference !== false // 默认开启

    // 构建要包含的引用列表
    let referencesToInclude: Reference[] = []

    // 添加内置0号reference（如果启用）
    if (enableBuiltInDocRef && includeReferences) {
      const builtInRef = this.buildBuiltInDocumentReference()
      if (builtInRef) {
        referencesToInclude.push(builtInRef)
      }
    }

    // 添加用户添加的引用
    if (
      includeReferences &&
      referenceStore &&
      Array.isArray(referenceStore) &&
      referenceStore.length > 0
    ) {
      // 如果指定了activeReferenceIds，只处理激活的引用
      const userReferences =
        activeReferenceIds && activeReferenceIds.length > 0
          ? (referenceStore as Reference[]).filter((ref) => activeReferenceIds.includes(ref.id))
          : (referenceStore as Reference[])
      referencesToInclude.push(...userReferences)
    }

    if (referencesToInclude.length > 0) {
      const referencesContent = this.buildReferencesContent(referencesToInclude)
      if (referencesContent) {
        messages.push({
          role: 'system',
          content: referencesContent
        })
      }
    }

    // 3. 历史消息
    if (includeHistory && session.messages) {
      const historyMessages = this.buildHistoryMessages(session.messages, maxHistoryMessages)
      messages.push(...historyMessages)
    }

    return messages
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
      logger.warn('[getSystemInfo] 获取系统信息失败:', error)
    }

    // 格式化平台名称
    const platformNames: Record<string, string> = {
      win32: 'Windows',
      darwin: 'macOS',
      linux: 'Linux',
      unknown: '未知系统'
    }

    // 格式化架构名称
    const archNames: Record<string, string> = {
      x64: 'x64 (64位)',
      ia32: 'x86 (32位)',
      arm64: 'ARM64',
      arm: 'ARM',
      unknown: '未知架构'
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

    // AgentConfig的系统提示词
    if (agentConfig.llmConfig?.systemPrompt) {
      prompt += agentConfig.llmConfig.systemPrompt + '\n\n'
    }

    // 注入时间戳和系统信息
    if (agentConfig.llmConfig?.injectTimestamp) {
      const now = new Date()
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const systemInfo = this.getSystemInfo()

      prompt += `当前时间: ${now.toISOString()}\n`
      prompt += `当前时区: ${timeZone}\n`
      prompt += `系统环境: ${systemInfo.platform}\n`
      prompt += `处理器架构: ${systemInfo.arch}\n\n`
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
        prompt += `当前打开的文档 Tab（共 ${documentTabs.length} 个）：\n`
        documentTabs.forEach((t, i) => {
          prompt += `  ${i + 1}. id=${t.id}, title=${t.title || '(无标题)'}, path=${t.path || '(未保存)'}, format=${t.format}\n`
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
        prompt += `工作区根路径: ${roots.join(', ')}\n\n`
      } else {
        prompt += '工作区: 全局 default 工作区（未打开文件夹）\n\n'
      }
    } catch (e) {
      getLogger().warn('[buildSystemPrompt] 注入 openTabs/workspace 失败', e)
    }

    // 公共上下文（兼容新旧格式）
    const publicCtx = (session as any).publicContext
    if (publicCtx) {
      if (publicCtx.currentTime) {
        prompt += `系统时间: ${publicCtx.currentTime}\n`
      }
      if (publicCtx.timezone) {
        prompt += `时区: ${publicCtx.timezone}\n`
      }
      if (publicCtx.document) {
        prompt += `当前文档: ${publicCtx.document.title || publicCtx.document.path}\n`
        const docFormat = publicCtx.document.format || 'md'
        prompt += `**文档格式: ${docFormat === 'tex' ? 'LaTeX' : 'Markdown'}**\n\n`

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
          logger.info('[buildSystemPrompt] 注入LaTeX格式提示词')
          prompt += `## ⚠️ 重要：当前文档是 LaTeX 格式\n\n`
          prompt += `**你必须严格遵循以下规则：**\n`
          prompt += `1. **所有生成的内容必须使用 LaTeX 语法**，包括：\n`
          prompt += `   - 标题使用 \\section{}, \\subsection{}, \\subsubsection{} 等命令\n`
          prompt += `   - **绝对不要使用 Markdown 的 #、##、### 等标题标记**\n`
          prompt += `   - 列表使用 \\begin{itemize} 或 \\begin{enumerate}\n`
          prompt += `   - 强调使用 \\textbf{}, \\textit{} 等命令\n`
          prompt += `2. **图表插入**：必须使用 PDF 格式，插入语法：\\includegraphics[width=0.8\\textwidth]{图片URL}\n`
          prompt += `3. **不要混淆格式**：当前文档是 LaTeX，不要生成 Markdown 格式的内容\n\n`
          logger.info('[buildSystemPrompt] LaTeX格式提示词注入完成')
        } else {
          logger.info('[buildSystemPrompt] 注入Markdown格式提示词')
          prompt += `## ⚠️ 重要：当前文档是 Markdown 格式\n\n`
          prompt += `**你必须严格遵循以下规则：**\n`
          prompt += `1. **所有生成的内容必须使用 Markdown 语法**，包括：\n`
          prompt += `   - 标题使用 #、##、### 等标记\n`
          prompt += `   - **绝对不要使用 LaTeX 的 \\section{}, \\subsection{} 等命令**\n`
          prompt += `   - 列表使用 - 或 1. 等标记\n`
          prompt += `   - 强调使用 **粗体** 或 *斜体*\n`
          prompt += `2. **图表插入**：使用 SVG 或 PNG 格式，插入语法：![描述](图片URL)\n`
          prompt += `3. **不要混淆格式**：当前文档是 Markdown，不要生成 LaTeX 格式的内容\n\n`
          logger.info('[buildSystemPrompt] Markdown格式提示词注入完成')
        }
      }
      if (!publicCtx.document) {
        prompt += '\n'
      }
    }

    return prompt.trim()
  }

  /**
   * 构建内置0号reference（动态获取当前文档内容）
   */
  private static buildBuiltInDocumentReference(): Reference | null {
    try {
      const workspace = useWorkspace()
      const activeDoc = workspace.activeDocument.value

      if (!activeDoc) {
        return null
      }

      // 确定文档格式
      const docFormat = activeDoc.format === 'tex' ? 'tex' : 'md'
      const formatName = docFormat === 'tex' ? 'LaTeX' : 'Markdown'

      // 根据文档格式获取内容
      const content = docFormat === 'tex' ? activeDoc.tex : activeDoc.markdown

      if (!content || content.trim().length === 0) {
        return null
      }

      // 创建内置0号reference
      const reference: Reference = {
        id: 'built-in-document-reference-0',
        name: '当前文档内容',
        origin: activeDoc.path || '当前活动文档',
        format: docFormat,
        parsedContent: content,
        description: `动态获取的当前活动文档内容（${formatName}格式，实时更新，不占用历史消息空间）`,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      const logger = createRendererLogger('AIContextManager')
      logger.debug('[buildBuiltInDocumentReference] 构建内置文档引用', {
        format: docFormat,
        formatName,
        contentLength: content.length,
        hasPath: !!activeDoc.path
      })

      return reference
    } catch (error) {
      const logger = createRendererLogger('AIContextManager')
      logger.warn('[buildBuiltInDocumentReference] 构建内置文档引用失败:', error)
      return null
    }
  }

  /**
   * 构建引用素材内容
   */
  private static buildReferencesContent(references: Reference[]): string {
    if (references.length === 0) return ''

    const logger = createRendererLogger('AIContextManager')
    logger.info('[buildReferencesContent] 开始构建引用素材内容', {
      referenceCount: references.length,
      references: references.map((ref) => ({
        id: ref.id,
        name: ref.name,
        format: ref.format,
        hasParsedContent: !!ref.parsedContent,
        parsedContentLength: ref.parsedContent?.length || 0
      }))
    })

    let content = '=== 引用素材 ===\n\n'
    for (const ref of references) {
      // 对于内置0号reference，使用更明确的格式说明
      const isBuiltIn = ref.id === 'built-in-document-reference-0'
      const formatDisplay =
        ref.format === 'tex' ? 'LaTeX' : ref.format === 'md' ? 'Markdown' : ref.format

      if (isBuiltIn) {
        content += `[${ref.name}] (格式: ${formatDisplay}, 来源: ${ref.origin})\n`
        content += `⚠️ 这是当前活动文档的实时内容，格式为 ${formatDisplay}。内容会在每次请求时动态获取，确保始终是最新的。\n`
      } else {
        content += `[${ref.name}] (格式: ${ref.format}, 来源: ${ref.origin})\n`
      }

      if (ref.description) {
        content += `描述: ${ref.description}\n`
      }

      // 添加解析后的内容（供AI直接参考，上传时已解析）
      if (ref.parsedContent) {
        // 对于内置0号reference，使用格式对应的代码块标记
        const codeBlockLang =
          ref.format === 'tex' ? 'latex' : ref.format === 'md' ? 'markdown' : 'text'
        if (isBuiltIn) {
          content += `\n当前文档内容（${formatDisplay}格式）:\n\`\`\`${codeBlockLang}\n${ref.parsedContent}\n\`\`\`\n`
        } else {
          content += `\n解析后的内容（已进行数据分析/文本提取）:\n\`\`\`\n${ref.parsedContent}\n\`\`\`\n`
        }
        logger.debug(
          `[buildReferencesContent] 引用 ${ref.name} 包含parsedContent，长度: ${ref.parsedContent.length}, 格式: ${ref.format}`
        )
      } else {
        logger.warn(`[buildReferencesContent] 引用 ${ref.name} 缺少parsedContent`)
      }
      content += '\n'
    }

    logger.info('[buildReferencesContent] 构建完成', {
      totalContentLength: content.length
    })

    return content
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
          const contentForLlm = rawContent.replace(/@\[([^\]]+)\]/g, '@$1')
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

          // 记录调试信息
          logger.debug('[buildHistoryMessages] 检查assistant消息tool_calls:', {
            messageId: msg.id,
            hasToolCalls: !!msgToolCalls,
            toolCallsType: typeof msgToolCalls,
            isArray: Array.isArray(msgToolCalls),
            toolCallsLength: Array.isArray(msgToolCalls) ? msgToolCalls.length : 0,
            messageKeys: Object.keys(msg),
            toolCallsValue: msgToolCalls
          })

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
      if (m.role !== 'assistant' || !Array.isArray(m.tool_calls) || m.tool_calls.length === 0) continue
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
   * 添加工具消息
   *
   * 重要：这个方法会在保存工具消息时，同时保存OpenAI格式的content字符串。
   * 这样在buildHistoryMessages时，可以直接使用这个content，不需要转换。
   */
  static addToolMessage(
    session: AgentSession | LegacyAgentSession,
    toolId: string,
    toolName: string,
    status: 'succeeded' | 'failed',
    data?: unknown,
    error?: string,
    summary?: string,
    tool_call_id?: string,
    toolConfig?: any,
    params?: Record<string, unknown> // 添加params参数，用于保存工具调用参数
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
    const displayData = isWrappedResult ? (data as any).data : data // 用于Display组件的数据

    // 如果displayData是ToolCallbackData格式，提取format和content
    if (
      displayData &&
      typeof displayData === 'object' &&
      'content' in displayData &&
      'format' in displayData
    ) {
      const callbackData = displayData as any
      const displayComponent = toolConfig?.displayComponent

      // 提取组件名称（如果是组件对象）
      let rendererName: string | undefined = undefined
      if (displayComponent) {
        if (typeof displayComponent === 'string') {
          rendererName = displayComponent
        } else if (typeof displayComponent === 'object') {
          rendererName =
            (displayComponent as any).name ||
            (displayComponent as any).__name ||
            (displayComponent as any).displayName
          // 如果仍然没有名称，尝试从文件路径提取
          if (!rendererName && (displayComponent as any).__file) {
            const match = String((displayComponent as any).__file).match(/([^/\\]+)\.vue$/)
            if (match && match[1]) {
              rendererName = match[1]
            }
          }
        }
      }

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
        renderer: rendererName // 使用组件名称字符串
      })
    } else if (displayData) {
      // 兼容旧格式：直接使用displayData
      const displayComponent = toolConfig?.displayComponent

      // 提取组件名称（如果是组件对象）
      let rendererName: string | undefined = undefined
      if (displayComponent) {
        if (typeof displayComponent === 'string') {
          rendererName = displayComponent
        } else if (typeof displayComponent === 'object') {
          rendererName =
            (displayComponent as any).name ||
            (displayComponent as any).__name ||
            (displayComponent as any).displayName
          // 如果仍然没有名称，尝试从文件路径提取
          if (!rendererName && (displayComponent as any).__file) {
            const match = String((displayComponent as any).__file).match(/([^/\\]+)\.vue$/)
            if (match && match[1]) {
              rendererName = match[1]
            }
          }
        }
      }

      outputs.push({
        id: 'result',
        label: '结果',
        format: 'json' as 'text' | 'json' | 'markdown' | 'html' | 'table' | 'custom',
        data: displayData,
        renderer: rendererName // 使用组件名称字符串
      })
    }

    // 构建OpenAI格式的content字符串（在保存时就生成，确保格式正确）
    // 使用ToolRunner的序列化方法，确保所有工具的结果格式一致
    // 注意：如果data是包装对象（包含result和data），serializeToOpenAIFormat会优先使用result字段（给AI的纯文本）
    // 如果data不是包装对象，serializeToOpenAIFormat会使用data作为结果
    const observation = {
      toolId,
      toolName,
      status,
      result: data, // 传递原始data，serializeToOpenAIFormat会处理包装对象的提取
      error,
      summary,
      toolConfig
    }
    const openaiContent = ToolRunner.serializeToOpenAIFormat(observation)

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
      ...(toolConfig ? { tool_config: toolConfig } : {}),
      ...(params ? { params } : {}) // 保存工具调用参数，用于快照导出
    } as any // 使用as any因为params不在ToolAgentMessage接口中，但我们需要保存它

    session.messages.push(message)
    // 兼容新旧格式的updatedAt
    if (typeof session.updatedAt === 'string') {
      session.updatedAt = new Date().toISOString()
    } else {
      session.updatedAt = Date.now()
    }

    return message
  }
}
