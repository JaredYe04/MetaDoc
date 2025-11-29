/**
 * AgentEngine 执行器
 * 负责执行AgentEngine，实现不同的执行范式
 */

import type { AgentEngine, AgentSession, AgentConfig } from '../../types/agent-framework'
import type { AgentMessage, ChatAgentMessage } from '../../types/agent'
import type { ToolObservation } from './tool-runner'
import { ToolRunner } from './tool-runner'
import { AIContextManager, type LlmMessage } from './ai-context-manager'
import { LlmAdapter } from './llm-adapter'
import { agentConfigManager } from './agent-config-manager'
import { agentToolManager } from '../agent-tool-manager'
import { workflowManager } from './workflow-manager'
import { createRendererLogger } from '../logger'
import { extractOuterJsonString } from '../regex-utils'
import { reactive } from 'vue'

// 懒加载logger，避免初始化顺序问题
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('AgentEngineExecutor')
  }
  return loggerInstance
}

/**
 * 引擎执行选项
 */
export interface EngineExecuteOptions {
  signal?: AbortSignal
  onProgress?: (progress: {
    stage: string
    message: string
    data?: unknown
  }) => void
  onTaskCreated?: (handle: string) => void // AI任务创建时的回调，用于保存handle以便取消
}

/**
 * AgentEngine执行器基类
 */
import type { AgentSession as LegacyAgentSession } from '../../types/agent'

export abstract class BaseEngineExecutor {
  protected engine: AgentEngine
  protected session: AgentSession | LegacyAgentSession
  protected agentConfig: AgentConfig
  protected options: EngineExecuteOptions

  constructor(
    engine: AgentEngine,
    session: AgentSession | LegacyAgentSession,
    agentConfig: AgentConfig,
    options: EngineExecuteOptions = {}
  ) {
    this.engine = engine
    this.session = session
    this.agentConfig = agentConfig
    this.options = options
  }

  /**
   * 执行引擎（抽象方法）
   */
  abstract execute(userMessage: string): Promise<void>

  /**
   * 获取可用工具列表
   */
  protected getAvailableTools(): Array<{ id: string; name: string; description: string; schema: unknown; instruction?: string }> {
    const toolIds = agentConfigManager.getAvailableToolIds(this.agentConfig.id)
    const tools: Array<{ id: string; name: string; description: string; schema: unknown; instruction?: string }> = []

    // 添加普通工具
    for (const toolId of toolIds) {
      const tool = agentToolManager.getTool(toolId)
      if (tool && tool.config.enabled) {
        // 提取instruction（支持string和ToolLocales格式）
        let instruction: string | undefined = undefined
        if (tool.config.instruction) {
          if (typeof tool.config.instruction === 'string') {
            instruction = tool.config.instruction
          } else {
            // ToolLocales格式，优先使用zh_cn，然后en_us
            instruction = tool.config.instruction['zh_cn']?.instruction || 
                         tool.config.instruction['en_us']?.instruction || 
                         undefined
          }
        }
        
        tools.push({
          id: toolId,
          name: typeof tool.config.name === 'string'
            ? tool.config.name
            : tool.config.name['zh_cn']?.name || tool.config.name['en_us']?.name || toolId,
          description: typeof tool.config.description === 'string'
            ? tool.config.description
            : tool.config.description['zh_cn']?.description || tool.config.description['en_us']?.description || '',
          schema: tool.config.inputSchema || {},
          instruction
        })
      }
    }

    // 添加Workflow工具（如果还没有在第一个循环中添加）
    const workflows = workflowManager.getAllWorkflows()
    const addedToolIds = new Set(tools.map(t => t.id))
    for (const workflow of workflows) {
      if (workflow.enabled !== false && toolIds.includes(workflow.id) && !addedToolIds.has(workflow.id)) {
        // 尝试从agentToolManager获取已注册的workflow工具（包含instruction）
        const registeredWorkflowTool = agentToolManager.getTool(`workflow-${workflow.id}`)
        let instruction: string | undefined = undefined
        if (registeredWorkflowTool?.config.instruction) {
          if (typeof registeredWorkflowTool.config.instruction === 'string') {
            instruction = registeredWorkflowTool.config.instruction
          } else {
            instruction = registeredWorkflowTool.config.instruction['zh_cn']?.instruction || 
                         registeredWorkflowTool.config.instruction['en_us']?.instruction || 
                         undefined
          }
        }
        
        tools.push({
          id: workflow.id,
          name: typeof workflow.name === 'string'
            ? workflow.name
            : workflow.name['zh_cn']?.name || workflow.name['en_us']?.name || workflow.id,
          description: typeof workflow.description === 'string'
            ? workflow.description
            : workflow.description['zh_cn']?.description || workflow.description['en_us']?.description || '',
          schema: workflow.inputSchema || {},
          instruction
        })
      }
    }

    return tools
  }

  /**
   * 构建工具调用提示
   */
  protected buildToolCallPrompt(): string {
    const tools = this.getAvailableTools()
    if (tools.length === 0) {
      return ''
    }

    let prompt = '\n\n=== 工具调用规范 ===\n'
    prompt += '你可以通过调用工具来完成各种任务。所有工具调用必须使用统一的标记格式。\n\n'
    
    prompt += '## 工具调用格式\n'
    prompt += '当你需要调用工具时，必须使用以下标记格式（不要使用JSON格式）：\n'
    prompt += '```\n'
    prompt += '<｜tool▁calls▁begin｜>\n'
    prompt += '<｜tool▁call▁begin｜>工具ID<｜tool▁sep｜>{"参数名1":"参数值1","参数名2":"参数值2"}<｜tool▁call▁end｜>\n'
    prompt += '<｜tool▁calls▁end｜>\n'
    prompt += '```\n\n'
    
    prompt += '## 重要规则\n'
    prompt += '1. **必须使用标记格式**：工具调用必须使用上述标记格式，不要使用JSON代码块或其他格式\n'
    prompt += '2. **标记必须完整**：必须包含所有开始和结束标记，格式严格遵循上述结构\n'
    prompt += '3. **工具ID必须准确**：使用工具列表中的确切ID，不能随意修改\n'
    prompt += '4. **参数必须是JSON字符串**：parameters部分必须是有效的JSON字符串格式\n'
    prompt += '5. **一次可调用多个工具**：可以在标记块中包含多个工具调用\n'
    prompt += '6. **不要在标记中混合文本**：标记块应该是独立的，不要在标记中混合其他文本说明\n'
    prompt += '7. **调用前先确认需求**：仔细分析用户需求，选择最合适的工具，确保参数正确\n\n'
    
    prompt += '## 工具调用示例\n'
    prompt += '示例1 - 调用单个工具：\n'
    prompt += '```\n'
    prompt += '<｜tool▁calls▁begin｜>\n'
    prompt += '<｜tool▁call▁begin｜>chart-generation<｜tool▁sep｜>{"prompt":"生成一个关于数据趋势的折线图","type":"line"}<｜tool▁call▁end｜>\n'
    prompt += '<｜tool▁calls▁end｜>\n'
    prompt += '```\n\n'
    
    prompt += '示例2 - 调用多个工具：\n'
    prompt += '```\n'
    prompt += '<｜tool▁calls▁begin｜>\n'
    prompt += '<｜tool▁call▁begin｜>outline-tree<｜tool▁sep｜>{"includeText":true}<｜tool▁call▁end｜>\n'
    prompt += '<｜tool▁call▁begin｜>chart-generation<｜tool▁sep｜>{"prompt":"生成思维导图","type":"mindmap"}<｜tool▁call▁end｜>\n'
    prompt += '<｜tool▁calls▁end｜>\n'
    prompt += '```\n\n'

    prompt += '=== 可用工具列表 ===\n'
    for (const tool of tools) {
      prompt += `\n**${tool.name}** (ID: \`${tool.id}\`)\n`
      prompt += `${tool.description}\n`
      
      // 添加工具的详细使用说明（instruction）
      if (tool.instruction) {
        prompt += `\n${tool.instruction}\n`
      }
      
      if (tool.schema && typeof tool.schema === 'object') {
        const schema = tool.schema as any
        if (schema.properties) {
          prompt += `\n参数说明：\n`
          const props = schema.properties
          const required = schema.required || []
          for (const [key, value] of Object.entries(props)) {
            const prop = value as any
            const isRequired = required.includes(key)
            prompt += `  - \`${key}\`${isRequired ? ' (必需)' : ' (可选)'}: ${prop.description || '无描述'}\n`
            if (prop.type) {
              prompt += `    类型: ${prop.type}\n`
            }
            if (prop.enum) {
              prompt += `    可选值: ${JSON.stringify(prop.enum)}\n`
            }
          }
        }
      }
    }

    prompt += '\n\n## 调用工具时的注意事项\n'
    prompt += '- 仔细阅读每个工具的说明和参数要求\n'
    prompt += '- 确保参数类型正确（字符串、数字、布尔值、对象等）\n'
    prompt += '- 参数必须是有效的JSON字符串格式\n'
    prompt += '- 如果工具调用失败，检查参数是否正确，然后重试\n'
    prompt += '- 工具调用结果会在后续对话中提供，你可以基于结果继续处理\n'
    prompt += '- 如果不需要调用工具，直接回复文本即可，不要包含工具调用标记\n'
    prompt += '- **重要**：工具调用时，标记格式中的参数内容不会显示给用户，只会在系统内部处理\n'

    return prompt
  }

  /**
   * 解析标记格式的工具调用
   * 格式: <｜tool▁calls▁begin｜><｜tool▁call▁begin｜>tool_id<｜tool▁sep｜>params<｜tool▁call▁end｜><｜tool▁calls▁end｜>
   * 支持一个或两个开始标记
   */
  private parseMarkedToolCalls(content: string): Array<{ id: string; tool_id: string; parameters: Record<string, unknown> }> | null {
    try {
      // 匹配工具调用块（支持一个或两个开始标记，使用非贪婪匹配，支持换行）
      // 注意：必须匹配完整的begin和end标记
      const markedPattern = /\<｜tool▁calls▁begin｜>([\s\S]*?)\<｜tool▁calls▁end｜>/i
      const blockMatch = content.match(markedPattern)
      
      if (!blockMatch || !blockMatch[1]) {
        getLogger().debug('[parseMarkedToolCalls] 未找到完整的工具调用块')
        return null
      }

      const toolCallsContent = blockMatch[1].trim()
      getLogger().debug('[parseMarkedToolCalls] 找到工具调用块，内容长度:', toolCallsContent.length)
      
      const toolCalls: Array<{ id: string; tool_id: string; parameters: Record<string, unknown> }> = []

      // 匹配单个工具调用
      // 格式: <｜tool▁call▁begin｜>tool_id<｜tool▁sep｜>params<｜tool▁call▁end｜>
      // 注意：使用[\s\S]*?来匹配包括换行在内的所有字符
      const toolCallPattern = /\<｜tool▁call▁begin｜>([\s\S]*?)\<｜tool▁sep｜>([\s\S]*?)\<｜tool▁call▁end｜>/gi
      
      let match
      let index = 0
      while ((match = toolCallPattern.exec(toolCallsContent)) !== null) {
        const toolId = match[1].trim()
        let paramsStr = match[2].trim()
        
        getLogger().debug(`[parseMarkedToolCalls] 解析工具调用 ${index + 1}: toolId=${toolId}, paramsStr长度=${paramsStr.length}`)
        
        // 尝试解析参数JSON
        let parameters: Record<string, unknown> = {}
        try {
          // 先尝试提取JSON字符串（处理可能包含其他文本的情况）
          const jsonStr = extractOuterJsonString(paramsStr)
          if (jsonStr) {
            parameters = JSON.parse(jsonStr)
            getLogger().debug(`[parseMarkedToolCalls] 成功解析JSON参数:`, parameters)
          } else {
            // 如果没有找到JSON，尝试直接解析
            parameters = JSON.parse(paramsStr)
            getLogger().debug(`[parseMarkedToolCalls] 直接解析JSON参数:`, parameters)
          }
        } catch (e) {
          getLogger().warn(`[parseMarkedToolCalls] 解析工具调用参数失败 (工具: ${toolId}):`, e, 'paramsStr:', paramsStr.substring(0, 100))
          // 如果解析失败，使用空对象，至少工具ID是有效的
        }

        toolCalls.push({
          id: `call_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
          tool_id: toolId,
          parameters
        })
        index++
      }

      getLogger().debug(`[parseMarkedToolCalls] 解析完成，找到 ${toolCalls.length} 个工具调用`)
      return toolCalls.length > 0 ? toolCalls : null
    } catch (error) {
      getLogger().error('[parseMarkedToolCalls] 解析标记格式工具调用失败:', error)
      return null
    }
  }

  /**
   * 创建工具调用检测回调（统一处理逻辑）
   * 用于在流式输出过程中检测并处理工具调用标记
   */
  protected createToolCallsDetectedHandler(
    assistantMessage: ChatAgentMessage
  ): (toolCalls: Array<{ id: string; tool_id: string; parameters: Record<string, unknown> }>) => Promise<void> {
    return async (toolCalls: Array<{ id: string; tool_id: string; parameters: Record<string, unknown> }>) => {
      getLogger().info('[BaseEngineExecutor] ✅✅✅ 工具调用检测回调被触发!', {
        toolCallsCount: toolCalls.length,
        toolCalls: toolCalls.map(tc => ({ 
          id: tc.tool_id, 
          parameters: tc.parameters 
        })),
        messageId: assistantMessage?.id
      })
      
      // 更新assistantMessage，添加tool_calls
      if (assistantMessage) {
        const toolCallsArray = toolCalls.map(tc => ({
          id: tc.id,
          tool_id: tc.tool_id,
          parameters: tc.parameters
        }))
        
        Object.defineProperty(assistantMessage, 'tool_calls', {
          value: toolCallsArray,
          writable: true,
          enumerable: true,
          configurable: true
        })
        
        getLogger().info('[BaseEngineExecutor] 已添加tool_calls到assistantMessage', {
          messageId: assistantMessage.id,
          toolCallsCount: toolCallsArray.length,
          originalMarkdownLength: assistantMessage.markdown?.length || 0
        })
        
        // 从markdown中移除工具调用标记，只保留标记之前的文本
        if (assistantMessage.markdown) {
          const originalMarkdown = assistantMessage.markdown
          let cleanedMarkdown = assistantMessage.markdown
          // 移除工具调用标记块
          cleanedMarkdown = cleanedMarkdown.replace(
            /\<｜tool▁calls▁begin｜>[\s\S]*?\<｜tool▁calls▁end｜>/gi,
            ''
          ).trim()
          assistantMessage.markdown = cleanedMarkdown || ''
          
          getLogger().info('[BaseEngineExecutor] 已清理markdown中的工具调用标记', {
            originalLength: originalMarkdown.length,
            cleanedLength: cleanedMarkdown.length,
            removed: originalMarkdown.length - cleanedMarkdown.length
          })
        }
      } else {
        getLogger().warn('[BaseEngineExecutor] ⚠️ assistantMessage不存在，无法更新')
      }
    }
  }

  /**
   * 解析工具调用
   * 支持多种格式：
   * 1. JSON格式: { "tool_calls": [...] }
   * 2. 代码块JSON格式: ```json { "tool_calls": [...] } ```
   * 3. 标记格式: <｜tool▁calls▁begin｜><｜tool▁call▁begin｜>tool_id<｜tool▁sep｜>params<｜tool▁call▁end｜><｜tool▁calls▁end｜>
   */
  protected parseToolCalls(content: string): Array<{ id: string; tool_id: string; parameters: Record<string, unknown> }> | null {
    try {
      // 方法1: 尝试解析标记格式（新格式，优先级较高，因为更明确）
      const markedResult = this.parseMarkedToolCalls(content)
      if (markedResult && markedResult.length > 0) {
        getLogger().debug('成功解析标记格式的工具调用:', markedResult.length)
        return markedResult
      }

      // 方法2: 尝试提取JSON（tool_calls格式）
      const jsonStr = extractOuterJsonString(content)
      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr)
          if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
            getLogger().debug('成功解析JSON格式的工具调用:', parsed.tool_calls.length)
            return parsed.tool_calls.map((call: any, index: number) => ({
              id: call.id || `call_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
              tool_id: call.tool_id || call.toolId || call.id,
              parameters: call.parameters || call.params || call.arguments || {}
            }))
          }
        } catch (e) {
          // JSON解析失败，继续尝试其他格式
        }
      }

      // 方法3: 尝试提取代码块中的JSON
      const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
      if (codeBlockMatch) {
        try {
          const parsed = JSON.parse(codeBlockMatch[1])
          if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
            getLogger().debug('成功解析代码块格式的工具调用:', parsed.tool_calls.length)
            return parsed.tool_calls.map((call: any, index: number) => ({
              id: call.id || `call_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
              tool_id: call.tool_id || call.toolId || call.id,
              parameters: call.parameters || call.params || call.arguments || {}
            }))
          }
        } catch (e) {
          // 代码块JSON解析失败
        }
      }

      return null
    } catch (error) {
      getLogger().debug('解析工具调用失败:', error)
      return null
    }
  }
}

/**
 * ReAct引擎执行器
 * 推理+行动模式，Observation驱动
 */
export class ReActEngineExecutor extends BaseEngineExecutor {
  async execute(userMessage: string): Promise<void> {
    // 用户消息已经在handleComposerSubmit中添加，这里不再重复添加

    this.options.onProgress?.({
      stage: 'thinking',
      message: 'ReAct模式：推理中...'
    })

    // 获取LLM配置
    const llmConfig = await LlmAdapter.getLlmConfig(this.engine)

    // 构建上下文消息
    const toolPrompt = this.buildToolCallPrompt()
    let contextMessages = AIContextManager.buildMessages(this.session, this.agentConfig)
    
    // 添加ReAct提示词
    const reactPrompt = this.buildReActPrompt() + toolPrompt
    if (contextMessages.length > 0 && contextMessages[0].role === 'system') {
      contextMessages[0].content += reactPrompt
    } else {
      contextMessages.unshift({
        role: 'system',
        content: reactPrompt
      })
    }

    // 最大迭代次数
    const maxIterations = this.engine.engineConfig?.maxIterations || 10
    let iterations = 0

    while (iterations < maxIterations) {
      iterations++

      this.options.onProgress?.({
        stage: 'thinking',
        message: `ReAct推理中... (${iterations}/${maxIterations})`
      })

      // 创建响应式消息对象用于实时流式显示
      const assistantMessage = reactive({
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant' as const,
        type: 'chat' as const,
        timestamp: new Date().toISOString(),
        markdown: ''
      }) as ChatAgentMessage
      
      // 立即添加到消息列表，这样消息气泡就会立即显示
      this.session.messages.push(assistantMessage)

      // 调用LLM获取思考+行动 - 使用createAiTask，传入reactiveMessage实现实时更新
      const response = await LlmAdapter.callChatViaTask(
        llmConfig,
        contextMessages,
        {
          temperature: this.engine.customLlmConfig?.temperature || 0.7,
          maxTokens: this.engine.customLlmConfig?.maxTokens,
          stream: true,
          signal: this.options.signal,
          taskName: `ReAct推理 (${iterations}/${maxIterations})`,
          originKey: `agent-react-${this.session.id}-${Date.now()}-${iterations}`,
          reactiveMessage: assistantMessage,
          onTaskCreated: this.options.onTaskCreated,
          onToolCallsDetected: this.createToolCallsDetectedHandler(assistantMessage)
        }
      )

      // 解析ReAct格式：Thought -> Action -> Observation
      const reactResult = this.parseReActResponse(response)

      // 添加思考过程（如果有）
      if (reactResult.thought) {
        AIContextManager.addAssistantMessage(this.session, `**思考**: ${reactResult.thought}`)
      }

      // 如果没有行动，直接返回
      if (!reactResult.action || reactResult.action === 'finish') {
        if (reactResult.finalAnswer) {
          AIContextManager.addAssistantMessage(this.session, reactResult.finalAnswer)
        }
        this.options.onProgress?.({
          stage: 'complete',
          message: '完成'
        })
        break
      }

      // 执行行动（工具调用）
      this.options.onProgress?.({
        stage: 'tool-calling',
        message: `执行行动: ${reactResult.action}`
      })

      try {
        // 验证并执行工具
        const validation = ToolRunner.validateToolParams(reactResult.action, reactResult.actionInput || {})
        if (!validation.valid) {
          const errorMsg = `工具调用验证失败: ${validation.errors.join(', ')}`
          AIContextManager.addToolMessage(
            this.session,
            reactResult.action,
            reactResult.action,
            'failed',
            null,
            errorMsg
          )
          
          // 添加观察结果
          contextMessages.push({
            role: 'user',
            content: `Observation: ${errorMsg}\n\n请根据这个观察继续推理和行动。`
          })
          continue
        }

        const observation = await ToolRunner.runTool(
          reactResult.action,
          reactResult.actionInput || {},
          this.options.signal
        )

        // 获取工具配置以获取displayComponent
        const tool = agentToolManager.getTool(observation.toolId)
        const toolConfig = tool?.config

        // 添加工具消息
        AIContextManager.addToolMessage(
          this.session,
          observation.toolId,
          observation.toolName,
          observation.status,
          observation.result,
          observation.error,
          observation.summary,
          undefined, // tool_call_id
          toolConfig // toolConfig
        )

        // 构建观察结果
        const observationText = observation.status === 'succeeded'
          ? (observation.summary || JSON.stringify(observation.result))
          : `错误: ${observation.error}`

        // 添加观察到上下文
        contextMessages.push({
          role: 'user',
          content: `Observation: ${observationText}\n\n请根据这个观察继续推理和行动。如果任务完成，请使用 Action: finish 并提供最终答案。`
        })
      } catch (error) {
        getLogger().error('ReAct行动执行失败:', error)
        const errorMsg = error instanceof Error ? error.message : String(error)
        contextMessages.push({
          role: 'user',
          content: `Observation: 执行失败 - ${errorMsg}\n\n请根据这个错误继续推理和行动。`
        })
      }

      // 检查是否达到最大迭代次数
      if (iterations >= maxIterations) {
        // 最后一次调用，要求返回最终答案 - 使用createAiTask
        // 创建响应式消息对象用于实时流式显示
        const finalMessage = reactive({
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          role: 'assistant' as const,
          type: 'chat' as const,
          timestamp: new Date().toISOString(),
          markdown: ''
        }) as ChatAgentMessage
        
        // 立即添加到消息列表
        this.session.messages.push(finalMessage)
        
        const finalResponse = await LlmAdapter.callChatViaTask(
          llmConfig,
          contextMessages,
          {
            temperature: this.engine.customLlmConfig?.temperature || 0.7,
            maxTokens: this.engine.customLlmConfig?.maxTokens,
            stream: true,
            signal: this.options.signal,
            taskName: `ReAct最终回复`,
            originKey: `agent-react-${this.session.id}-${Date.now()}-final`,
            reactiveMessage: finalMessage,
            onTaskCreated: this.options.onTaskCreated,
            onToolCallsDetected: this.createToolCallsDetectedHandler(finalMessage)
          }
        )
        // 消息已经通过reactiveMessage实时更新，不需要再调用addAssistantMessage
        this.options.onProgress?.({
          stage: 'complete',
          message: '完成'
        })
        break
      }
    }
  }

  /**
   * 构建ReAct提示词
   */
  private buildReActPrompt(): string {
    return '\n\n=== ReAct 模式 ===\n'
      + '你需要在每个步骤中执行以下格式：\n'
      + 'Thought: [你的思考过程]\n'
      + 'Action: [工具名称 或 finish]\n'
      + 'Action Input: [工具参数，JSON格式]\n'
      + 'Observation: [等待工具执行结果]\n\n'
      + '示例：\n'
      + 'Thought: 用户想要搜索信息，我应该使用搜索工具。\n'
      + 'Action: web-search\n'
      + 'Action Input: {"query": "关键词"}\n'
      + 'Observation: [工具执行结果会在这里显示]\n\n'
      + '如果任务完成，使用：\n'
      + 'Thought: [总结]\n'
      + 'Action: finish\n'
      + 'Final Answer: [最终答案]\n\n'
  }

  /**
   * 解析ReAct响应
   */
  private parseReActResponse(response: string): {
    thought?: string
    action?: string
    actionInput?: Record<string, unknown>
    finalAnswer?: string
  } {
    const result: {
      thought?: string
      action?: string
      actionInput?: Record<string, unknown>
      finalAnswer?: string
    } = {}

    // 提取Thought
    const thoughtMatch = response.match(/Thought:\s*(.+?)(?=Action:|Final Answer:|$)/s)
    if (thoughtMatch) {
      result.thought = thoughtMatch[1].trim()
    }

    // 提取Action
    const actionMatch = response.match(/Action:\s*(.+?)(?=Action Input:|Observation:|$)/s)
    if (actionMatch) {
      result.action = actionMatch[1].trim()
    }

    // 提取Action Input
    const actionInputMatch = response.match(/Action Input:\s*(.+?)(?=Observation:|Thought:|$)/s)
    if (actionInputMatch) {
      try {
        const jsonStr = extractOuterJsonString(actionInputMatch[1])
        if (jsonStr) {
          result.actionInput = JSON.parse(jsonStr)
        }
      } catch (error) {
        getLogger().debug('解析Action Input失败:', error)
      }
    }

    // 提取Final Answer
    const finalAnswerMatch = response.match(/Final Answer:\s*(.+?)$/s)
    if (finalAnswerMatch) {
      result.finalAnswer = finalAnswerMatch[1].trim()
    }

    return result
  }
}

/**
 * AutoGPT引擎执行器
 */
export class AutoGPTEngineExecutor extends BaseEngineExecutor {
  async execute(userMessage: string): Promise<void> {
    // 用户消息已经在handleComposerSubmit中添加，这里不再重复添加

    this.options.onProgress?.({
      stage: 'thinking',
      message: '正在思考...'
    })

    // 获取LLM配置
    const llmConfig = await LlmAdapter.getLlmConfig(this.engine)

    // 构建上下文消息
    const toolPrompt = this.buildToolCallPrompt()
    let contextMessages = AIContextManager.buildMessages(this.session, this.agentConfig)
    
    // 添加工具提示到最后一个系统消息
    if (contextMessages.length > 0 && contextMessages[0].role === 'system') {
      contextMessages[0].content += toolPrompt
    } else {
      contextMessages.unshift({
        role: 'system',
        content: toolPrompt
      })
    }

    // 最大迭代次数
    const maxIterations = this.engine.engineConfig?.maxIterations || 10
    let iterations = 0

    while (iterations < maxIterations) {
      iterations++

      this.options.onProgress?.({
        stage: 'thinking',
        message: `思考中... (${iterations}/${maxIterations})`
      })

      // 创建响应式消息对象用于实时流式显示
      const assistantMessage = reactive({
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant' as const,
        type: 'chat' as const,
        timestamp: new Date().toISOString(),
        markdown: ''
      }) as ChatAgentMessage
      
      // 立即添加到消息列表，这样消息气泡就会立即显示
      this.session.messages.push(assistantMessage)

      // 用于跟踪是否在流式输出过程中检测到工具调用
      let toolCallsDetectedDuringStream = false
      let detectedToolCalls: Array<{ id: string; tool_id: string; parameters: Record<string, unknown> }> | null = null
      
      // 调用LLM - 使用createAiTask而不是直接调用API，传入reactiveMessage实现实时更新
      const response = await LlmAdapter.callChatViaTask(
        llmConfig,
        contextMessages,
        {
          temperature: this.engine.customLlmConfig?.temperature || 0.7,
          maxTokens: this.engine.customLlmConfig?.maxTokens,
          stream: true,
          signal: this.options.signal,
          taskName: `Agent思考 (${iterations}/${maxIterations})`,
          originKey: `agent-autogpt-${this.session.id}-${Date.now()}-${iterations}`,
          reactiveMessage: assistantMessage,
          onTaskCreated: this.options.onTaskCreated,
          onToolCallsDetected: async (toolCalls) => {
            // 在流式输出过程中检测到工具调用，立即执行
            toolCallsDetectedDuringStream = true
            detectedToolCalls = toolCalls
            // 使用统一的工具调用处理逻辑
            await this.createToolCallsDetectedHandler(assistantMessage)(toolCalls)
          }
        }
      )

      // 检查是否有工具调用
      // 优先使用流式输出过程中检测到的工具调用
      // 如果没有，则从响应中解析
      let toolCalls: Array<{ id: string; tool_id: string; parameters: Record<string, unknown> }> | null = null
      
      if (toolCallsDetectedDuringStream && detectedToolCalls) {
        toolCalls = detectedToolCalls
        getLogger().debug('[AutoGPT] 使用流式输出过程中检测到的工具调用')
      } else {
        // 从响应中解析工具调用（兼容旧逻辑）
        const responseContent = response || assistantMessage.markdown || ''
        toolCalls = this.parseToolCalls(responseContent)
        getLogger().debug('[AutoGPT] 从响应中解析工具调用:', toolCalls ? toolCalls.length : 0)
      }

      if (!toolCalls || toolCalls.length === 0) {
        // 没有工具调用，消息已经通过reactiveMessage实时更新
        this.options.onProgress?.({
          stage: 'complete',
          message: '完成'
        })
        break
      }

      // 如果有工具调用，更新已创建的assistantMessage，添加tool_calls
      // 重要：必须确保tool_calls被正确添加到消息对象上，以便buildHistoryMessages能识别
      if (assistantMessage) {
        // 创建tool_calls数组（使用我们的内部格式）
        const toolCallsArray = toolCalls.map(tc => ({
          id: tc.id,
          tool_id: tc.tool_id,
          parameters: tc.parameters
        }))
        
        // 确保tool_calls被正确添加到消息对象上
        // 直接设置属性，确保它是响应式的
        Object.defineProperty(assistantMessage, 'tool_calls', {
          value: toolCallsArray,
          writable: true,
          enumerable: true,
          configurable: true
        })
        
        // 从markdown中移除tool_calls的JSON内容，只保留其他文本内容
        if (assistantMessage.markdown) {
          let cleanedMarkdown = assistantMessage.markdown
          
          // 移除代码块中的tool_calls JSON（更精确的匹配）
          cleanedMarkdown = cleanedMarkdown.replace(
            /```(?:json)?\s*\{[\s\S]*?"tool_calls"[\s\S]*?\}\s*```/g,
            ''
          )
          
          // 移除独立的tool_calls JSON对象（更精确的匹配）
          cleanedMarkdown = cleanedMarkdown.replace(
            /\{\s*"tool_calls"\s*:\s*\[[\s\S]*?\]\s*[\s\S]*?\}/g,
            ''
          )
          
          cleanedMarkdown = cleanedMarkdown.trim()
          
          // 如果清理后还有内容，保留；否则设置为空字符串
          assistantMessage.markdown = cleanedMarkdown || ''
        }
        
        // 验证tool_calls是否被正确添加
        const hasToolCalls = !!(assistantMessage as any).tool_calls
        const toolCallsValue = (assistantMessage as any).tool_calls
        
        // 记录日志用于调试
        getLogger().debug('[AutoGPT] 添加tool_calls到消息:', {
          messageId: assistantMessage.id,
          toolCallsCount: toolCallsArray.length,
          toolCalls: toolCallsArray.map(tc => ({ id: tc.id, tool_id: tc.tool_id })),
          hasToolCallsInMessage: hasToolCalls,
          toolCallsValue: toolCallsValue,
          messageKeys: Object.keys(assistantMessage),
          messageType: typeof assistantMessage
        })
        
        // 如果tool_calls没有被正确添加，抛出错误
        if (!hasToolCalls || !Array.isArray(toolCallsValue)) {
          getLogger().error('[AutoGPT] 严重错误：tool_calls没有被正确添加到消息对象上！', {
            messageId: assistantMessage.id,
            assistantMessage: assistantMessage,
            toolCallsArray: toolCallsArray
          })
        }
      }
      this.options.onProgress?.({
        stage: 'tool-calling',
        message: `正在调用 ${toolCalls.length} 个工具...`
      })

      const observations: ToolObservation[] = []

      for (const toolCall of toolCalls) {
        try {
          // 验证参数
          const validation = ToolRunner.validateToolParams(toolCall.tool_id, toolCall.parameters)
          if (!validation.valid) {
            observations.push({
              toolId: toolCall.tool_id,
              toolName: toolCall.tool_id,
              status: 'failed',
              error: validation.errors.join(', ')
            })
            continue
          }

          // 执行工具
          const observation = await ToolRunner.runTool(
            toolCall.tool_id,
            toolCall.parameters,
            this.options.signal
          )

          observations.push(observation)

          // 获取工具配置以获取displayComponent
          const tool = agentToolManager.getTool(observation.toolId)
          const toolConfig = tool?.config

          // 添加工具消息到会话
          // 使用toolCall的id作为tool_call_id
          AIContextManager.addToolMessage(
            this.session,
            observation.toolId,
            observation.toolName,
            observation.status,
            observation.result,
            observation.error,
            observation.summary,
            toolCall.id, // 使用toolCall的id作为tool_call_id
            toolConfig
          )
        } catch (error) {
          getLogger().error('工具执行失败:', error)
          observations.push({
            toolId: toolCall.tool_id,
            toolName: toolCall.tool_id,
            status: 'failed',
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      // 构建观察结果文本
      let observationText = '\n\n=== 工具执行结果 ===\n'
      for (const obs of observations) {
        observationText += `工具 ${obs.toolName}: ${obs.status === 'succeeded' ? '成功' : '失败'}\n`
        if (obs.summary) {
          observationText += `结果: ${obs.summary}\n`
        }
        if (obs.error) {
          observationText += `错误: ${obs.error}\n`
        }
      }

      // 重新构建上下文（包含新的工具结果）
      contextMessages = AIContextManager.buildMessages(this.session, this.agentConfig)
      if (contextMessages.length > 0 && contextMessages[0].role === 'system') {
        contextMessages[0].content += toolPrompt
      } else {
        contextMessages.unshift({
          role: 'system',
          content: toolPrompt
        })
      }

      // 添加观察结果
      contextMessages.push({
        role: 'user',
        content: observationText + '\n\n请根据工具执行结果继续完成任务。如果需要再次调用工具，请使用tool_calls格式。否则直接回复最终结果。'
      })

      // 检查是否达到最大迭代次数
      if (iterations >= maxIterations) {
        // 最后一次调用，要求返回最终结果 - 使用createAiTask
        // 创建响应式消息对象用于实时流式显示
        const finalMessage = reactive({
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          role: 'assistant' as const,
          type: 'chat' as const,
          timestamp: new Date().toISOString(),
          markdown: ''
        }) as ChatAgentMessage
        
        // 立即添加到消息列表
        this.session.messages.push(finalMessage)
        
        const finalResponse = await LlmAdapter.callChatViaTask(
          llmConfig,
          contextMessages,
          {
            temperature: this.engine.customLlmConfig?.temperature || 0.7,
            maxTokens: this.engine.customLlmConfig?.maxTokens,
            stream: true,
            signal: this.options.signal,
            taskName: `Agent最终回复`,
            originKey: `agent-autogpt-${this.session.id}-${Date.now()}-final`,
            reactiveMessage: finalMessage,
            onTaskCreated: this.options.onTaskCreated,
            onToolCallsDetected: this.createToolCallsDetectedHandler(finalMessage)
          }
        )
        // 消息已经通过reactiveMessage实时更新，不需要再调用addAssistantMessage
        this.options.onProgress?.({
          stage: 'complete',
          message: '完成'
        })
        break
      }
    }
  }
}

/**
 * SimpleChat引擎执行器
 * 轻量对话，适合无工具任务
 */
export class SimpleChatEngineExecutor extends BaseEngineExecutor {
  async execute(userMessage: string): Promise<void> {
    // 用户消息已经在handleComposerSubmit中添加，这里不再重复添加

    this.options.onProgress?.({
      stage: 'generating',
      message: '生成回复中...'
    })

    // 获取LLM配置
    const llmConfig = await LlmAdapter.getLlmConfig(this.engine)

    // 构建上下文消息（不包含工具提示）
    const contextMessages = AIContextManager.buildMessages(this.session, this.agentConfig)

    // 创建响应式消息对象用于实时流式显示
    const assistantMessage = reactive({
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'assistant' as const,
      type: 'chat' as const,
      timestamp: new Date().toISOString(),
      markdown: ''
    }) as ChatAgentMessage
    
    // 立即添加到消息列表，这样消息气泡就会立即显示
    this.session.messages.push(assistantMessage)

    // 调用LLM生成回复 - 使用createAiTask，传入reactiveMessage实现实时更新
    // 注意：SimpleChat引擎在AgentView中已经使用了createAiTask进行流式输出
    // 如果直接执行SimpleChatEngineExecutor，这里也会使用createAiTask
    const response = await LlmAdapter.callChatViaTask(
      llmConfig,
      contextMessages,
      {
        temperature: this.engine.customLlmConfig?.temperature || 0.7,
        maxTokens: this.engine.customLlmConfig?.maxTokens,
        stream: true,
        signal: this.options.signal,
        taskName: 'SimpleChat对话',
        originKey: `agent-simplechat-${this.session.id}-${Date.now()}`,
        reactiveMessage: assistantMessage,
        onTaskCreated: this.options.onTaskCreated,
        onToolCallsDetected: this.createToolCallsDetectedHandler(assistantMessage)
      }
    )

    // 消息已经通过reactiveMessage实时更新，不需要再调用addAssistantMessage

    this.options.onProgress?.({
      stage: 'complete',
      message: '完成'
    })
  }
}

/**
 * PlanExecute引擎执行器
 * 先生成计划，再逐项执行
 */
export class PlanExecuteEngineExecutor extends BaseEngineExecutor {
  async execute(userMessage: string): Promise<void> {
    // 用户消息已经在handleComposerSubmit中添加，这里不再重复添加

    this.options.onProgress?.({
      stage: 'thinking',
      message: '规划阶段：生成执行计划...'
    })

    // 获取LLM配置
    const llmConfig = await LlmAdapter.getLlmConfig(this.engine)

    // 阶段1: 生成计划
    const plan = await this.generatePlan(userMessage, llmConfig)
    
    if (plan && plan.steps && plan.steps.length > 0) {
      // 添加计划到会话
      const planText = '**执行计划：**\n\n' + plan.steps.map((step: any, idx: number) => 
        `${idx + 1}. ${step.description || step}`
      ).join('\n')
      AIContextManager.addAssistantMessage(this.session, planText)

      // 阶段2: 执行计划
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i]
        this.options.onProgress?.({
          stage: 'tool-calling',
          message: `执行计划步骤 ${i + 1}/${plan.steps.length}...`
        })

        // 解析步骤，可能需要工具调用
        if (step.tool || step.tool_id) {
          // 执行工具
          try {
            const toolId = step.tool_id || step.tool
            if (!toolId) {
              getLogger().warn('计划步骤缺少tool_id，跳过')
              continue
            }
            const observation = await ToolRunner.runTool(
              toolId,
              step.parameters || step.params || {},
              this.options.signal
            )

            // 获取工具配置以获取displayComponent
            const tool = agentToolManager.getTool(observation.toolId)
            const toolConfig = tool?.config

            AIContextManager.addToolMessage(
              this.session,
              observation.toolId,
              observation.toolName,
              observation.status,
              observation.result,
              observation.error,
              observation.summary,
              undefined, // tool_call_id
              toolConfig // toolConfig
            )
          } catch (error) {
            getLogger().error('计划步骤执行失败:', error)
            const toolId = step.tool_id || step.tool || 'unknown'
            AIContextManager.addToolMessage(
              this.session,
              toolId,
              toolId,
              'failed',
              null,
              error instanceof Error ? error.message : String(error)
            )
          }
        }
      }
    }

    // 阶段3: 生成最终总结
    this.options.onProgress?.({
      stage: 'generating',
      message: '生成最终总结...'
    })

    const contextMessages = AIContextManager.buildMessages(this.session, this.agentConfig)
    contextMessages.push({
      role: 'user',
      content: '请根据执行计划的完成情况，生成一个总结回复。'
    })

    // 创建响应式消息对象用于实时流式显示
    const summaryMessage = reactive({
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'assistant' as const,
      type: 'chat' as const,
      timestamp: new Date().toISOString(),
      markdown: ''
    }) as ChatAgentMessage
    
    // 立即添加到消息列表
    this.session.messages.push(summaryMessage)

    const summary = await LlmAdapter.callChatViaTask(
      llmConfig,
      contextMessages,
      {
        temperature: this.engine.customLlmConfig?.temperature || 0.7,
        maxTokens: this.engine.customLlmConfig?.maxTokens,
        stream: true,
        signal: this.options.signal,
        taskName: 'PlanExecute总结',
        originKey: `agent-planexecute-${this.session.id}-${Date.now()}-summary`,
        reactiveMessage: summaryMessage,
        onTaskCreated: this.options.onTaskCreated,
        onToolCallsDetected: this.createToolCallsDetectedHandler(summaryMessage)
      }
    )

    // 消息已经通过reactiveMessage实时更新，不需要再调用addAssistantMessage

    this.options.onProgress?.({
      stage: 'complete',
      message: '完成'
    })
  }

  /**
   * 生成执行计划
   */
  private async generatePlan(userMessage: string, llmConfig: any): Promise<{
    steps: Array<{
      description: string
      tool_id?: string
      tool?: string
      parameters?: Record<string, unknown>
      params?: Record<string, unknown>
    }>
  }> {
    const toolPrompt = this.buildToolCallPrompt()
    const planPrompt = '\n\n=== 计划生成模式 ===\n'
      + '请分析用户需求并生成详细的执行计划。\n'
      + '计划格式（JSON）：\n'
      + '```json\n'
      + '{\n'
      + '  "steps": [\n'
      + '    {\n'
      + '      "description": "步骤描述",\n'
      + '      "tool_id": "工具ID（如果需要工具）",\n'
      + '      "parameters": {"参数": "值"}\n'
      + '    }\n'
      + '  ]\n'
      + '}\n'
      + '```\n\n'
      + '如果某个步骤不需要工具，可以不包含tool_id和parameters。\n'

    const contextMessages: LlmMessage[] = [
      {
        role: 'system',
        content: toolPrompt + planPrompt
      },
      {
        role: 'user',
        content: userMessage
      }
    ]

    const response = await LlmAdapter.callChatViaTask(
      llmConfig,
      contextMessages,
      {
        temperature: this.engine.customLlmConfig?.temperature || 0.7,
        stream: true,
        signal: this.options.signal,
        taskName: 'Workflow引擎选择',
        originKey: `agent-workflow-${this.session.id}-${Date.now()}-select`,
        onTaskCreated: this.options.onTaskCreated,
        // 注意：这里没有reactiveMessage，所以不需要onToolCallsDetected
      }
    )

    // 解析计划JSON
    try {
      const jsonStr = extractOuterJsonString(response)
      if (jsonStr) {
        const plan = JSON.parse(jsonStr)
        if (plan.steps && Array.isArray(plan.steps)) {
          return plan
        }
      }
    } catch (error) {
      getLogger().debug('解析计划失败:', error)
    }

    // 如果解析失败，返回默认计划
    return {
      steps: [{ description: response || '执行用户请求' }]
    }
  }
}

/**
 * Workflow引擎执行器
 * 专为执行Workflow工具而设计
 */
export class WorkflowEngineExecutor extends BaseEngineExecutor {
  async execute(userMessage: string): Promise<void> {
    // 用户消息已经在handleComposerSubmit中添加，这里不再重复添加

    this.options.onProgress?.({
      stage: 'thinking',
      message: 'Workflow模式：分析需求...'
    })

    // 获取可用工具（包括Workflow）
    const tools = this.getAvailableTools()
    const workflows = tools.filter(t => {
      // 检查是否是workflow工具
      const workflow = workflowManager.getWorkflow(t.id)
      return workflow !== null
    })

    if (workflows.length === 0) {
      // 没有可用的Workflow，使用简单对话
      const simpleChatEngine = new SimpleChatEngineExecutor(this.engine, this.session, this.agentConfig, this.options)
      await simpleChatEngine.execute(userMessage)
      return
    }

    // 获取LLM配置
    const llmConfig = await LlmAdapter.getLlmConfig(this.engine)

    // 构建Workflow选择提示
    const workflowPrompt = '\n\n=== 可用Workflow工具 ===\n'
      + workflows.map(w => `- ${w.name} (${w.id}): ${w.description}`).join('\n')
      + '\n\n请根据用户需求选择合适的Workflow工具。如果不需要Workflow，直接回复文本。\n'

    const contextMessages = AIContextManager.buildMessages(this.session, this.agentConfig)
    if (contextMessages.length > 0 && contextMessages[0].role === 'system') {
      contextMessages[0].content += workflowPrompt
    } else {
      contextMessages.unshift({
        role: 'system',
        content: workflowPrompt
      })
    }

    // 创建响应式消息对象用于实时流式显示
    const assistantMessage = reactive({
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'assistant' as const,
      type: 'chat' as const,
      timestamp: new Date().toISOString(),
      markdown: ''
    }) as ChatAgentMessage
    
    // 立即添加到消息列表
    this.session.messages.push(assistantMessage)

    // 调用LLM选择Workflow - 使用createAiTask
    const response = await LlmAdapter.callChatViaTask(
      llmConfig,
      contextMessages,
      {
        temperature: this.engine.customLlmConfig?.temperature || 0.7,
        maxTokens: this.engine.customLlmConfig?.maxTokens,
        stream: true,
        signal: this.options.signal,
        taskName: 'Workflow引擎执行',
        originKey: `agent-workflow-${this.session.id}-${Date.now()}-execute`,
        reactiveMessage: assistantMessage,
        onTaskCreated: this.options.onTaskCreated,
        onToolCallsDetected: this.createToolCallsDetectedHandler(assistantMessage)
      }
    )

    // 检查是否选择Workflow
    const toolCalls = this.parseToolCalls(response)
    if (toolCalls && toolCalls.length > 0) {
      // 执行Workflow
      for (const toolCall of toolCalls) {
        const workflow = workflowManager.getWorkflow(toolCall.tool_id)
        if (workflow) {
          this.options.onProgress?.({
            stage: 'workflow-executing',
            message: `执行Workflow: ${workflow.name || toolCall.tool_id}`
          })

          try {
            const observation = await ToolRunner.runTool(
              toolCall.tool_id,
              toolCall.parameters || {},
              this.options.signal
            )

            // 获取工具配置以获取displayComponent
            const tool = agentToolManager.getTool(observation.toolId)
            const toolConfig = tool?.config

            AIContextManager.addToolMessage(
              this.session,
              observation.toolId,
              observation.toolName,
              observation.status,
              observation.result,
              observation.error,
              observation.summary,
              undefined, // tool_call_id
              toolConfig // toolConfig
            )

            // 如果执行成功，添加总结
            if (observation.status === 'succeeded') {
              const summaryMessages = AIContextManager.buildMessages(this.session, this.agentConfig)
              summaryMessages.push({
                role: 'user',
                content: '请根据Workflow执行结果，生成一个用户友好的总结。'
              })

              // 创建响应式消息对象用于实时流式显示
              const summaryMessage = reactive({
                id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                role: 'assistant' as const,
                type: 'chat' as const,
                timestamp: new Date().toISOString(),
                markdown: ''
              }) as ChatAgentMessage
              
              // 立即添加到消息列表
              this.session.messages.push(summaryMessage)

              const summary = await LlmAdapter.callChatViaTask(
                llmConfig,
                summaryMessages,
                {
                  temperature: this.engine.customLlmConfig?.temperature || 0.7,
                  stream: true,
                  signal: this.options.signal,
                  taskName: 'Workflow总结',
                  originKey: `agent-workflow-${this.session.id}-${Date.now()}-summary`,
                  reactiveMessage: summaryMessage,
                  onTaskCreated: this.options.onTaskCreated,
                  onToolCallsDetected: this.createToolCallsDetectedHandler(summaryMessage)
                }
              )

              // 消息已经通过reactiveMessage实时更新，不需要再调用addAssistantMessage
            }
          } catch (error) {
            getLogger().error('Workflow执行失败:', error)
            AIContextManager.addToolMessage(
              this.session,
              toolCall.tool_id,
              toolCall.tool_id,
              'failed',
              null,
              error instanceof Error ? error.message : String(error)
            )
          }
        }
      }
    } else {
      // 没有选择Workflow，消息已经通过reactiveMessage实时更新，不需要再调用addAssistantMessage
    }

    this.options.onProgress?.({
      stage: 'complete',
      message: '完成'
    })
  }
}

/**
 * AgentEngine执行器工厂
 */
export class AgentEngineExecutorFactory {
  static create(
    engine: AgentEngine,
    session: AgentSession | LegacyAgentSession,
    agentConfig: AgentConfig,
    options: EngineExecuteOptions = {}
  ): BaseEngineExecutor {
    switch (engine.engineType) {
      case 'autogpt':
        return new AutoGPTEngineExecutor(engine, session, agentConfig, options)
      case 'react':
        return new ReActEngineExecutor(engine, session, agentConfig, options)
      case 'plan-execute':
        return new PlanExecuteEngineExecutor(engine, session, agentConfig, options)
      case 'simple-chat':
        return new SimpleChatEngineExecutor(engine, session, agentConfig, options)
      case 'workflow':
        return new WorkflowEngineExecutor(engine, session, agentConfig, options)
      default:
        getLogger().warn(`未知引擎类型: ${engine.engineType}，使用AutoGPT引擎`)
        return new AutoGPTEngineExecutor(engine, session, agentConfig, options)
    }
  }
}

