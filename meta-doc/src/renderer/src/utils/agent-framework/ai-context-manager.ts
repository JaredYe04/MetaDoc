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
        promptPreview: systemPrompt.substring(0, 500)  // 前500字符预览
      })
      
      messages.push({
        role: 'system',
        content: systemPrompt
      })
    }

    // 2. 引用素材（作为系统消息的一部分，兼容新旧格式）
    const referenceStore = (session as any).referenceStore
    if (includeReferences && referenceStore && Array.isArray(referenceStore) && referenceStore.length > 0) {
      const referencesContent = this.buildReferencesContent(referenceStore as Reference[])
      if (referencesContent) {
        messages.push({
          role: 'system',
          content: referencesContent
        })
      }
    }

    // 3. 历史消息
    if (includeHistory && session.messages) {
      const historyMessages = this.buildHistoryMessages(
        session.messages,
        maxHistoryMessages
      )
      messages.push(...historyMessages)
    }

    return messages
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

    // 注入时间戳
    if (agentConfig.llmConfig?.injectTimestamp) {
      const now = new Date()
      prompt += `当前时间: ${now.toISOString()}\n`
      prompt += `当前时区: ${Intl.DateTimeFormat().resolvedOptions().timeZone}\n\n`
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
   * 构建引用素材内容
   */
  private static buildReferencesContent(references: Reference[]): string {
    if (references.length === 0) return ''

    let content = '=== 引用素材 ===\n\n'
    for (const ref of references) {
      content += `[${ref.name}] (${ref.type}): ${ref.url}\n`
      if (ref.description) {
        content += `  描述: ${ref.description}\n`
      }
      content += '\n'
    }

    return content
  }

  /**
   * 构建历史消息
   */
  private static buildHistoryMessages(
    messages: AgentMessage[],
    maxMessages: number
  ): LlmMessage[] {
    const llmMessages: LlmMessage[] = []

    // 只取最近的消息
    const recentMessages = messages.slice(-maxMessages)

    // 验证并修复消息顺序：确保assistant消息有tool_calls后必须紧跟tool消息
    // 记录每个assistant消息的tool_call_ids
    const pendingToolCallIds = new Set<string>()
    
    for (const msg of recentMessages) {
      if (msg.role === 'user') {
        if (msg.type === 'chat') {
          llmMessages.push({
            role: msg.role,
            content: msg.markdown || ''
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
            assistantLlmMessage.tool_calls = msgToolCalls.map((tc: any) => {
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
                } else if (typeof tc.function.arguments === 'object' && tc.function.arguments !== null) {
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
              
              return {
                id: tc.id || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'function',
                function: {
                  name: tc.tool_id || tc.function?.name || '',
                  arguments: argumentsString // OpenAI API要求：必须是JSON字符串！
                }
              }
            })
            // 如果有tool_calls，content应该为null（如果markdown为空或只包含空白字符）
            assistantLlmMessage.content = (msg.markdown && msg.markdown.trim()) ? msg.markdown : null
            
            // 记录所有tool_call_ids，等待对应的tool消息
            for (const tc of (msg as any).tool_calls) {
              if (tc.id) {
                pendingToolCallIds.add(tc.id)
              }
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
    
    // 验证：如果还有pendingToolCallIds，说明有assistant消息的tool_calls没有对应的tool消息
    // 这种情况不应该发送给LLM API，但为了向后兼容，我们仍然发送，只是记录警告
    if (pendingToolCallIds.size > 0) {
      const logger = createRendererLogger('AIContextManager')
      logger.warn(`警告：发现${pendingToolCallIds.size}个tool_calls没有对应的tool消息: ${Array.from(pendingToolCallIds).join(', ')}`)
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
    params?: Record<string, unknown>  // 添加params参数，用于保存工具调用参数
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
    const displayData = isWrappedResult ? (data as any).data : data  // 用于Display组件的数据
    
    // 如果displayData是ToolCallbackData格式，提取format和content
    if (displayData && typeof displayData === 'object' && 'content' in displayData && 'format' in displayData) {
      const callbackData = displayData as any
      const displayComponent = toolConfig?.displayComponent
      
      // 提取组件名称（如果是组件对象）
      let rendererName: string | undefined = undefined
      if (displayComponent) {
        if (typeof displayComponent === 'string') {
          rendererName = displayComponent
        } else if (typeof displayComponent === 'object') {
          rendererName = (displayComponent as any).name || 
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
        format: (callbackData.format || 'json') as 'text' | 'json' | 'markdown' | 'html' | 'table' | 'custom',
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
          rendererName = (displayComponent as any).name || 
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
      result: data,  // 传递原始data，serializeToOpenAIFormat会处理包装对象的提取
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
      ...(params ? { params } : {})  // 保存工具调用参数，用于快照导出
    } as any  // 使用as any因为params不在ToolAgentMessage接口中，但我们需要保存它

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

