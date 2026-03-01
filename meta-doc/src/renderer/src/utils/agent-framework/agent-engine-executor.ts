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
import { createRendererLogger } from '../logger'
import { extractOuterJsonString } from '../regex-utils'
import { parseToolCalls, type ParsedToolCall } from './tool-call-processor'
import { ToolCallQueue } from './tool-call-queue'
import { reactive, ref, type Ref } from 'vue'
import { getLlmTemperature } from '../settings.js'
import { recognizeIntent, type IntentRecognitionResult } from './intent-processor'

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
  onProgress?: (progress: { stage: string; message: string; data?: unknown }) => void
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
  protected currentToolCallQueue: ToolCallQueue | null = null // 当前的工具调用队列
  protected isAiResponding = false // 标记AI是否正在响应

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
   * 获取可以传递给工具的session对象
   * 新类型有entityType字段，旧类型有publicContext字段，都可以使用
   */
  protected getSessionForTool(): AgentSession | undefined {
    const session = this.session as any
    // 新类型：有entityType字段
    if (session.entityType === 'agent-session') {
      return session as AgentSession
    }
    // 旧类型：有publicContext字段，也可以使用（需要确保publicContext存在）
    if (session.publicContext) {
      return session as AgentSession
    }
    return undefined
  }

  /**
   * 执行引擎（抽象方法）
   */
  abstract execute(userMessage: string): Promise<void>

  /**
   * 执行意图识别并更新activeToolSpecs
   * 每次用户发送消息时调用，清空旧的fullSpecs并注入新的
   */
  protected async processIntentAndUpdateSpecs(
    userMessage: string,
    intentOutputRef?: Ref<string>
  ): Promise<IntentRecognitionResult> {
    const session = this.session as any

    // 清空当前的activeToolSpecs（每次用户消息时清空）
    // 检查是否是 Map 实例（可能被序列化后变成普通对象）
    if (!session.activeToolSpecs || !(session.activeToolSpecs instanceof Map)) {
      session.activeToolSpecs = new Map<string, string>()
    } else {
      session.activeToolSpecs.clear()
    }

    getLogger().debug('[processIntentAndUpdateSpecs] 已清空activeToolSpecs，开始意图识别')

    // 执行意图识别
    const intentResult = await recognizeIntent(
      session as AgentSession,
      this.agentConfig,
      userMessage,
      intentOutputRef,
      this.engine,
      {
        taskName: 'Intent Recognition',
        temperature: 0.3,
        maxTokens: 500
      }
    )

    getLogger().info('[processIntentAndUpdateSpecs] 意图识别完成', {
      toolIds: intentResult.toolIds,
      toolCount: intentResult.toolIds.length
    })

    // 更新session的activeToolIds（用于UI高亮显示）
    if (session.activeToolIds) {
      session.activeToolIds = [...intentResult.toolIds]
      getLogger().debug('[processIntentAndUpdateSpecs] 已更新activeToolIds', {
        activeToolIds: session.activeToolIds
      })
    }

    // 根据识别结果，注入对应工具的fullSpec
    for (const toolId of intentResult.toolIds) {
      // 尝试从普通工具获取
      let tool = agentToolManager.getTool(toolId)
      let fullSpec: string | undefined = undefined

      if (tool && tool.config.enabled) {
        if (tool.config.spec?.fullSpec) {
          fullSpec = tool.config.spec.fullSpec
        } else if (tool.config.instruction) {
          // 回退到instruction
          if (typeof tool.config.instruction === 'string') {
            fullSpec = tool.config.instruction
          } else {
            fullSpec =
              tool.config.instruction['zh_cn']?.instruction ||
              tool.config.instruction['en_us']?.instruction ||
              undefined
          }
        }
      }

      if (fullSpec) {
        session.activeToolSpecs.set(toolId, fullSpec)
        getLogger().debug(`[processIntentAndUpdateSpecs] 已注入工具 ${toolId} 的fullSpec`, {
          toolId,
          fullSpecLength: fullSpec.length
        })
      } else {
        getLogger().warn(`[processIntentAndUpdateSpecs] 工具 ${toolId} 没有找到fullSpec`)
      }
    }

    getLogger().info('[processIntentAndUpdateSpecs] fullSpec注入完成', {
      activeToolSpecsCount: session.activeToolSpecs.size,
      toolIds: Array.from(session.activeToolSpecs.keys())
    })

    return intentResult
  }

  /**
   * 获取最大迭代次数（考虑maxToolCalls配置）
   * 如果maxToolCalls为null（无限制），返回一个很大的值（2147483647）
   * 否则返回engineConfig中的maxIterations或默认值10
   */
  protected getMaxIterations(): { maxIterations: number; isUnlimited: boolean } {
    const maxToolCalls = this.agentConfig.maxToolCalls
    const isUnlimited = maxToolCalls === null || maxToolCalls === undefined
    const maxIterations = isUnlimited
      ? 2147483647 // 无限制时使用一个很大的值
      : this.engine.engineConfig?.maxIterations || 10
    return { maxIterations, isUnlimited }
  }

  /**
   * 格式化进度消息（考虑无限制情况）
   */
  protected formatProgressMessage(
    baseMessage: string,
    current: number,
    total: number,
    isUnlimited: boolean
  ): string {
    if (isUnlimited) {
      return `${baseMessage} (${current})`
    } else {
      return `${baseMessage} (${current}/${total})`
    }
  }

  /**
   * 获取温度配置（优先使用engine的自定义配置，否则使用全局配置）
   */
  protected async getTemperature(): Promise<number> {
    if (this.engine.customLlmConfig?.temperature !== undefined) {
      return this.engine.customLlmConfig.temperature
    }
    return await getLlmTemperature()
  }

  /**
   * 获取可用工具列表（包含brief和fullSpec信息）
   */
  protected getAvailableTools(): Array<{
    id: string
    name: string
    description: string
    schema: unknown
    brief?: string
    fullSpec?: string
  }> {
    const toolIds = agentConfigManager.getAvailableToolIds(this.agentConfig.id)
    const tools: Array<{
      id: string
      name: string
      description: string
      schema: unknown
      brief?: string
      fullSpec?: string
    }> = []

    // 获取当前会话的activeToolSpecs（如果存在）
    const session = this.session as any
    // 确保 activeToolSpecs 是 Map 实例（可能被序列化后变成普通对象）
    const activeToolSpecs =
      session.activeToolSpecs instanceof Map ? session.activeToolSpecs : new Map<string, string>()

    // 添加普通工具
    for (const toolId of toolIds) {
      const tool = agentToolManager.getTool(toolId)
      if (tool && tool.config.enabled) {
        // 提取brief和fullSpec
        let brief: string | undefined = undefined
        let fullSpec: string | undefined = undefined

        if (tool.config.spec) {
          // 优先使用spec
          brief = tool.config.spec.brief
          fullSpec = tool.config.spec.fullSpec
        } else {
          // 回退到description和instruction
          brief =
            typeof tool.config.description === 'string'
              ? tool.config.description
              : tool.config.description['zh_cn']?.description ||
                tool.config.description['en_us']?.description ||
                ''

          if (tool.config.instruction) {
            if (typeof tool.config.instruction === 'string') {
              fullSpec = tool.config.instruction
            } else {
              fullSpec =
                tool.config.instruction['zh_cn']?.instruction ||
                tool.config.instruction['en_us']?.instruction ||
                undefined
            }
          }
        }

        // 如果activeToolSpecs中有该工具的fullSpec，使用它（按需注入）
        if (activeToolSpecs.has(toolId)) {
          fullSpec = activeToolSpecs.get(toolId)
        }

        tools.push({
          id: toolId,
          name:
            typeof tool.config.name === 'string'
              ? tool.config.name
              : tool.config.name['zh_cn']?.name || tool.config.name['en_us']?.name || toolId,
          description:
            typeof tool.config.description === 'string'
              ? tool.config.description
              : tool.config.description['zh_cn']?.description ||
                tool.config.description['en_us']?.description ||
                '',
          schema: tool.config.inputSchema || {},
          brief,
          fullSpec
        })
      }
    }

    return tools
  }

  /**
   * 构建工具调用提示（支持brief和fullSpec）
   */
  protected buildToolCallPrompt(): string {
    const tools = this.getAvailableTools()
    if (tools.length === 0) {
      return ''
    }

    let prompt = '\n\n=== Tool Calling Specification ===\n'
    prompt +=
      'You can call tools to complete various tasks. All tool calls must use a unified marker format.\n\n'

    prompt += '## Tool Call Format\n'
    prompt += 'When you need to call a tool, you must use the following marker format:\n'
    prompt += '```\n'
    prompt += '<tool_call>\n'
    prompt += '{"name": "tool_id", "arguments": {"param1": "value1", "param2": "value2"}}\n'
    prompt += '</tool_call>\n'
    prompt += '```\n\n'

    prompt += '## Important Rules\n'
    prompt +=
      '1. **Must use marker format**: Tool calls must use `<tool_call></tool_call>` marker format\n'
    prompt +=
      '2. **Markers must be complete**: Must include both opening `<tool_call>` and closing `</tool_call>` markers\n'
    prompt +=
      '3. **Tool ID must be accurate**: Use the exact ID from the tool list as the `name` field value, do not modify it\n'
    prompt +=
      '4. **Arguments must be JSON object**: The `arguments` field must be a valid JSON object format\n'
    prompt +=
      '5. **Can call multiple tools**: You can use multiple `<tool_call></tool_call>` blocks to call multiple tools\n'
    prompt +=
      '6. **Do not mix text in markers**: Marker blocks should be independent, do not mix other text explanations in markers\n'
    prompt +=
      '7. **Confirm requirements before calling**: Carefully analyze user requirements, select the most appropriate tool, and ensure parameters are correct\n\n'

    prompt += '## Tool Call Examples\n'
    prompt += 'Example 1 - Call a single tool:\n'
    prompt += '```\n'
    prompt += '<tool_call>\n'
    prompt +=
      '{"name": "chart-generation", "arguments": {"prompt": "Generate a line chart about data trends", "type": "line"}}\n'
    prompt += '</tool_call>\n'
    prompt += '```\n\n'

    prompt += 'Example 2 - Call multiple tools:\n'
    prompt += '```\n'
    prompt += '<tool_call>\n'
    prompt += '{"name": "outline-tree", "arguments": {"includeText": true}}\n'
    prompt += '</tool_call>\n'
    prompt += '<tool_call>\n'
    prompt +=
      '{"name": "chart-generation", "arguments": {"prompt": "Generate a mind map", "type": "mindmap"}}\n'
    prompt += '</tool_call>\n'
    prompt += '```\n\n'

    prompt += '=== Available Tools List ===\n'
    for (const tool of tools) {
      prompt += `\n**${tool.name}** (ID: \`${tool.id}\`)\n`

      // 总是显示brief（简短说明）
      if (tool.brief) {
        prompt += `${tool.brief}\n`
      } else {
        prompt += `${tool.description}\n`
      }

      // 如果有fullSpec（按需注入的完整说明），显示它
      if (tool.fullSpec) {
        prompt += `\n${tool.fullSpec}\n`
      }

      // 显示参数说明
      if (tool.schema && typeof tool.schema === 'object') {
        const schema = tool.schema as any
        if (schema.properties) {
          prompt += `\nParameters:\n`
          const props = schema.properties
          const required = schema.required || []
          for (const [key, value] of Object.entries(props)) {
            const prop = value as any
            const isRequired = required.includes(key)
            prompt += `  - \`${key}\`${isRequired ? ' (required)' : ' (optional)'}: ${prop.description || 'No description'}\n`
            if (prop.type) {
              prompt += `    Type: ${prop.type}\n`
            }
            if (prop.enum) {
              prompt += `    Allowed values: ${JSON.stringify(prop.enum)}\n`
            }
          }
        }
      }
    }

    prompt += '\n\n## Notes When Calling Tools\n'
    prompt += "- Read each tool's instructions and parameter requirements carefully\n"
    prompt += '- Ensure parameter types are correct (string, number, boolean, object, etc.)\n'
    prompt += '- Parameters must be in valid JSON string format\n'
    prompt += '- If tool call fails, check if parameters are correct, then retry\n'
    prompt +=
      '- Tool call results will be provided in subsequent conversations, you can continue processing based on results\n'
    prompt +=
      '- If no tools are needed, reply with text directly, do not include tool call markers\n'
    prompt +=
      '- **Important**: When calling tools, the parameter content in the marker format will not be displayed to users, it will only be processed internally by the system\n'

    return prompt
  }

  /**
   * 检测是否有未完成的工具调用标记（用于判断是否需要继续执行）
   */
  protected hasIncompleteToolCalls(content: string): boolean {
    const beginMarker = '<tool_call>'
    const endMarker = '</tool_call>'

    // 检查是否有开始标记但没有结束标记
    const hasBegin = content.includes(beginMarker)
    const hasEnd = content.includes(endMarker)

    // 如果有开始标记但没有结束标记，说明可能未完成
    if (hasBegin && !hasEnd) {
      getLogger().warn(
        '[hasIncompleteToolCalls] 检测到未完成的工具调用块（有<tool_call>但没有</tool_call>）'
      )
      return true
    }

    // 检查是否有不匹配的标记（开始标记数量多于结束标记）
    const beginCount = (content.match(/<tool_call>/g) || []).length
    const endCount = (content.match(/<\/tool_call>/g) || []).length
    if (beginCount > endCount) {
      getLogger().warn(
        '[hasIncompleteToolCalls] 检测到不匹配的工具调用标记（开始标记数量多于结束标记）'
      )
      return true
    }

    return false
  }

  /**
   * 检测任务是否完成（通过检查完成标记）
   */
  protected isTaskComplete(content: string): boolean {
    const completeMarkers = [
      '<|TASK_COMPLETE|>',
      '任务已完成',
      '所有任务已完成',
      '任务完成',
      'TASK_COMPLETE'
    ]

    const lowerContent = content.toLowerCase()
    for (const marker of completeMarkers) {
      if (lowerContent.includes(marker.toLowerCase())) {
        getLogger().info('[isTaskComplete] 检测到任务完成标记:', marker)
        return true
      }
    }

    return false
  }

  /**
   * 解析标记格式的工具调用
   * 格式: <tool_call>{"name": "tool_id", "arguments": {...}}</tool_call>
   * 使用统一的工具调用处理工具
   */
  private parseMarkedToolCalls(
    content: string
  ): Array<{ id: string; tool_id: string; parameters: Record<string, unknown> }> | null {
    try {
      // 使用统一的工具调用解析函数
      const parsedToolCalls = parseToolCalls(content, {
        loose: false, // 严格模式：需要完整的结束标记
        validateToolId: false // 不在这里验证，在执行时验证
      })

      if (!parsedToolCalls || parsedToolCalls.length === 0) {
        return null
      }

      // 转换格式并处理无效的工具调用
      const toolCalls: Array<{ id: string; tool_id: string; parameters: Record<string, unknown> }> =
        []

      for (const parsed of parsedToolCalls) {
        if (parsed.isValid) {
          // 有效的工具调用
          toolCalls.push({
            id: parsed.id,
            tool_id: parsed.tool_id,
            parameters: parsed.parameters
          })
        } else {
          // 无效的工具调用：使用dummy-tool处理
          getLogger().warn(
            `[parseMarkedToolCalls] 检测到无效的工具调用，使用dummy-tool处理:`,
            parsed.error
          )
          toolCalls.push({
            id: parsed.id,
            tool_id: 'dummy-tool', // 使用dummy-tool作为fallback
            parameters: parsed.parameters // 包含错误信息
          })
        }
      }

      getLogger().debug(
        `[parseMarkedToolCalls] 解析完成，找到 ${toolCalls.length} 个工具调用（有效: ${parsedToolCalls.filter((p) => p.isValid).length}, 无效: ${parsedToolCalls.filter((p) => !p.isValid).length}）`
      )
      return toolCalls.length > 0 ? toolCalls : null
    } catch (error) {
      getLogger().error('[parseMarkedToolCalls] 解析标记格式工具调用失败:', error)
      return null
    }
  }

  /**
   * 创建工具调用队列（每次AI输出开始时调用）
   */
  protected createToolCallQueue(): ToolCallQueue {
    // 如果已有队列且正在运行，等待完成
    if (this.currentToolCallQueue && !this.currentToolCallQueue.isEmpty()) {
      getLogger().warn('[BaseEngineExecutor] 检测到未完成的工具调用队列，等待完成...')
      // 等待旧队列完成
      this.currentToolCallQueue.waitForComplete().catch((error) => {
        getLogger().error('[BaseEngineExecutor] 等待旧队列完成时出错:', error)
      })
    }

    // 创建新的队列
    this.currentToolCallQueue = new ToolCallQueue(
      this.session,
      this.options.signal,
      (task, observation) => {
        // 工具调用完成回调（可选）
        getLogger().debug('[BaseEngineExecutor] 工具调用完成:', {
          toolId: task.tool_id,
          status: observation.status
        })
      },
      () => {
        // 队列完成回调
        getLogger().debug('[BaseEngineExecutor] 工具调用队列完成')
      }
    )

    // 重置队列状态（新队列，输入还未完成）
    this.currentToolCallQueue.reset()

    return this.currentToolCallQueue
  }

  /**
   * 创建工具调用检测回调（统一处理逻辑）
   * 用于在流式输出过程中检测并处理工具调用标记
   * 现在会将工具调用添加到队列中，而不是立即执行
   */
  protected createToolCallsDetectedHandler(
    assistantMessage: ChatAgentMessage
  ): (
    toolCalls: Array<{ id: string; tool_id: string; parameters: Record<string, unknown> }>
  ) => Promise<void> {
    return async (
      toolCalls: Array<{ id: string; tool_id: string; parameters: Record<string, unknown> }>
    ) => {
      getLogger().info('[BaseEngineExecutor] ✅✅✅ 工具调用检测回调被触发!', {
        toolCallsCount: toolCalls.length,
        toolCalls: toolCalls.map((tc) => ({
          id: tc.id,
          tool_id: tc.tool_id,
          parameters: tc.parameters
        })),
        messageId: assistantMessage?.id
      })

      // 更新assistantMessage，添加tool_calls
      if (assistantMessage) {
        // 获取现有的tool_calls数组（如果存在）
        const existingToolCalls = (assistantMessage as any).tool_calls || []
        const existingToolCallIds = new Set(existingToolCalls.map((tc: any) => tc.id))

        // 过滤出新的工具调用（避免重复添加）
        const newToolCalls = toolCalls.filter((tc) => !existingToolCallIds.has(tc.id))

        if (newToolCalls.length === 0) {
          getLogger().debug('[BaseEngineExecutor] 所有工具调用都已存在，跳过添加', {
            existingCount: existingToolCalls.length,
            incomingCount: toolCalls.length
          })
          return
        }

        // 合并现有的和新的工具调用
        const toolCallsArray = [
          ...existingToolCalls,
          ...newToolCalls.map((tc) => ({
            id: tc.id,
            tool_id: tc.tool_id,
            parameters: tc.parameters
          }))
        ]

        Object.defineProperty(assistantMessage, 'tool_calls', {
          value: toolCallsArray,
          writable: true,
          enumerable: true,
          configurable: true
        })

        getLogger().info('[BaseEngineExecutor] 已添加tool_calls到assistantMessage（追加模式）', {
          messageId: assistantMessage.id,
          existingCount: existingToolCalls.length,
          newCount: newToolCalls.length,
          totalCount: toolCallsArray.length,
          originalMarkdownLength: assistantMessage.markdown?.length || 0
        })

        // 确保工具调用队列存在
        if (!this.currentToolCallQueue) {
          this.createToolCallQueue()
        }

        // 只将新的工具调用添加到队列（立即开始执行）
        for (const toolCall of newToolCalls) {
          this.currentToolCallQueue!.addTask(toolCall)
        }

        getLogger().info('[BaseEngineExecutor] 已将新工具调用添加到队列，开始异步执行', {
          addedCount: newToolCalls.length
        })

        // 注意：不删除markdown中的工具调用标记
        // 原因：
        // 1. AI需要看到这些内容来理解上下文（在buildHistoryMessages中会使用）
        // 2. UI层面（AgentMessageRenderer）已经有逻辑：如果有tool_calls，就替换标记为友好的提示
        // 3. 这样既保证了AI能看到完整上下文，又保证了用户看到的是友好的UI提示
      } else {
        getLogger().warn('[BaseEngineExecutor] ⚠️ assistantMessage不存在，无法更新')
      }
    }
  }

  /**
   * 等待工具调用队列完成
   * 需要在AI输出完成后调用，确保所有工具调用都已添加到队列并执行完成
   */
  protected async waitForToolCallQueue(): Promise<void> {
    if (this.currentToolCallQueue) {
      getLogger().debug('[BaseEngineExecutor] 等待工具调用队列完成...', {
        queueLength: this.currentToolCallQueue.getLength(),
        isRunning: this.currentToolCallQueue.getIsRunning()
      })

      // 标记AI输出已完成，队列可以开始真正完成
      this.currentToolCallQueue.setInputComplete()

      // 等待队列完成
      await this.currentToolCallQueue.waitForComplete()
      getLogger().debug('[BaseEngineExecutor] 工具调用队列已完成')
    }
  }

  /**
   * 解析工具调用
   * 支持多种格式：
   * 1. JSON格式: { "tool_calls": [...] }
   * 2. 代码块JSON格式: ```json { "tool_calls": [...] } ```
   * 3. 标记格式: <tool_call>{"name": "tool_id", "arguments": {...}}</tool_call>
   */
  protected parseToolCalls(
    content: string
  ): Array<{ id: string; tool_id: string; parameters: Record<string, unknown> }> | null {
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
              id:
                call.id || `call_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
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
              id:
                call.id || `call_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
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

    // 步骤1: 意图识别并更新activeToolSpecs
    this.options.onProgress?.({
      stage: 'thinking',
      message: 'Analyzing intent...'
    })

    const intentOutputRef = ref('')
    const intentResult = await this.processIntentAndUpdateSpecs(userMessage, intentOutputRef)

    // 添加意图识别消息到会话（用于UI显示）
    if (intentResult.toolIds.length > 0) {
      const intentMessage = {
        id: `intent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'system' as const,
        type: 'intent-recognition' as const,
        timestamp: new Date().toISOString(),
        toolIds: intentResult.toolIds,
        reasoning: intentResult.reasoning,
        output: intentOutputRef.value
      }
      this.session.messages.push(intentMessage as any)
    }

    this.options.onProgress?.({
      stage: 'thinking',
      message: 'ReAct mode: Reasoning...'
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

    // 最大迭代次数（使用基类方法，考虑maxToolCalls配置）
    const { maxIterations, isUnlimited } = this.getMaxIterations()
    let iterations = 0

    while (iterations < maxIterations) {
      iterations++

      this.options.onProgress?.({
        stage: 'thinking',
        message: this.formatProgressMessage(
          'ReAct推理中...',
          iterations,
          maxIterations,
          isUnlimited
        )
      })

      // 创建新的工具调用队列（每次AI输出开始时）
      this.createToolCallQueue()

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
      const response = await LlmAdapter.callChatViaTask(llmConfig, contextMessages, {
        temperature: await this.getTemperature(),
        maxTokens: this.engine.customLlmConfig?.maxTokens,
        stream: true,
        signal: this.options.signal,
        taskName: this.formatProgressMessage('ReAct推理', iterations, maxIterations, isUnlimited),
        originKey: `agent-react-${this.session.id}-${Date.now()}-${iterations}`,
        reactiveMessage: assistantMessage,
        onTaskCreated: this.options.onTaskCreated,
        onToolCallsDetected: this.createToolCallsDetectedHandler(assistantMessage)
      })

      // 解析ReAct格式：Thought -> Action -> Observation
      const reactResult = this.parseReActResponse(response)

      // 添加思考过程（如果有）
      if (reactResult.thought) {
        AIContextManager.addAssistantMessage(this.session, `**思考**: ${reactResult.thought}`)
      }

      // 如果没有行动，需要先等待队列完成（确保队列状态干净）
      // 标记AI输出已完成，然后等待队列完成
      await this.waitForToolCallQueue()

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

      // 确保工具调用队列存在
      if (!this.currentToolCallQueue) {
        this.createToolCallQueue()
      }

      // 将ReAct格式的工具调用转换为队列任务格式
      const toolCallId = `react-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const toolCall = {
        id: toolCallId,
        tool_id: reactResult.action,
        parameters: reactResult.actionInput || {}
      }

      // 添加到队列并等待完成
      this.currentToolCallQueue!.addTask(toolCall)
      await this.waitForToolCallQueue()

      // 从消息中获取工具执行结果
      const currentMessageIndex = this.session.messages.indexOf(assistantMessage)
      let observation: ToolObservation | null = null

      if (currentMessageIndex !== -1) {
        for (let i = currentMessageIndex + 1; i < this.session.messages.length; i++) {
          const msg = this.session.messages[i]
          if (
            msg.type === 'tool' &&
            msg.role === 'tool' &&
            (msg as any).tool_call_id === toolCallId
          ) {
            const toolMsg = msg as any
            observation = {
              toolId: reactResult.action,
              toolName: reactResult.action,
              status: toolMsg.status === 'succeeded' ? 'succeeded' : 'failed',
              result: toolMsg.outputs?.[0]?.data,
              error: toolMsg.error,
              summary: toolMsg.summary
            }
            break
          }
        }
      }

      // 构建观察结果
      if (observation) {
        const observationText =
          observation.status === 'succeeded'
            ? ToolRunner.serializeToOpenAIFormat(observation)
            : `错误: ${observation.error || '执行失败'}`

        // 添加观察到上下文
        contextMessages.push({
          role: 'user',
          content: `Observation: ${observationText}\n\n请根据这个观察继续推理和行动。如果任务完成，请使用 Action: finish 并提供最终答案。`
        })
      } else {
        // 如果没有找到观察结果，添加错误信息
        contextMessages.push({
          role: 'user',
          content: `Observation: 工具执行结果未找到\n\n请根据这个错误继续推理和行动。`
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

        const finalResponse = await LlmAdapter.callChatViaTask(llmConfig, contextMessages, {
          temperature: await this.getTemperature(),
          maxTokens: this.engine.customLlmConfig?.maxTokens,
          stream: true,
          signal: this.options.signal,
          taskName: `ReAct最终回复`,
          originKey: `agent-react-${this.session.id}-${Date.now()}-final`,
          reactiveMessage: finalMessage,
          onTaskCreated: this.options.onTaskCreated,
          onToolCallsDetected: this.createToolCallsDetectedHandler(finalMessage)
        })

        // 等待队列完成（最终回复可能也有工具调用）
        await this.waitForToolCallQueue()

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
    return (
      '\n\n=== ReAct 模式 ===\n' +
      '你需要在每个步骤中执行以下格式：\n' +
      'Thought: [你的思考过程]\n' +
      'Action: [工具名称 或 finish]\n' +
      'Action Input: [工具参数，JSON格式]\n' +
      'Observation: [等待工具执行结果]\n\n' +
      '示例：\n' +
      'Thought: 用户想要搜索信息，我应该使用搜索工具。\n' +
      'Action: web-search\n' +
      'Action Input: {"query": "关键词"}\n' +
      'Observation: [工具执行结果会在这里显示]\n\n' +
      '如果任务完成，使用：\n' +
      'Thought: [总结]\n' +
      'Action: finish\n' +
      'Final Answer: [最终答案]\n\n'
    )
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

    // 步骤1: 意图识别并更新activeToolSpecs
    this.options.onProgress?.({
      stage: 'thinking',
      message: 'Analyzing intent...'
    })

    const intentOutputRef = ref('')
    const intentResult = await this.processIntentAndUpdateSpecs(userMessage, intentOutputRef)

    // 添加意图识别消息到会话（用于UI显示）
    if (intentResult.toolIds.length > 0) {
      const intentMessage = {
        id: `intent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'system' as const,
        type: 'intent-recognition' as const,
        timestamp: new Date().toISOString(),
        toolIds: intentResult.toolIds,
        reasoning: intentResult.reasoning,
        output: intentOutputRef.value
      }
      this.session.messages.push(intentMessage as any)
    }

    this.options.onProgress?.({
      stage: 'thinking',
      message: 'Thinking...'
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

    // 最大迭代次数（使用基类方法，考虑maxToolCalls配置）
    const { maxIterations, isUnlimited } = this.getMaxIterations()
    let iterations = 0

    while (iterations < maxIterations) {
      iterations++

      this.options.onProgress?.({
        stage: 'thinking',
        message: this.formatProgressMessage('思考中...', iterations, maxIterations, isUnlimited)
      })

      // 创建新的工具调用队列（每次AI输出开始时）
      this.createToolCallQueue()
      this.isAiResponding = true

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
      let detectedToolCalls: Array<{
        id: string
        tool_id: string
        parameters: Record<string, unknown>
      }> | null = null

      // 注意：detectedToolCalls只用于标记，实际的tool_calls应该从assistantMessage中获取

      // 调用LLM - 使用createAiTask而不是直接调用API，传入reactiveMessage实现实时更新
      const response = await LlmAdapter.callChatViaTask(llmConfig, contextMessages, {
        temperature: await this.getTemperature(),
        maxTokens: this.engine.customLlmConfig?.maxTokens,
        stream: true,
        signal: this.options.signal,
        taskName: this.formatProgressMessage('Agent思考', iterations, maxIterations, isUnlimited),
        originKey: `agent-autogpt-${this.session.id}-${Date.now()}-${iterations}`,
        reactiveMessage: assistantMessage,
        onTaskCreated: this.options.onTaskCreated,
        onToolCallsDetected: async (
          toolCalls: Array<{ id: string; tool_id: string; parameters: Record<string, unknown> }>
        ) => {
          // 在流式输出过程中检测到工具调用，添加到队列
          toolCallsDetectedDuringStream = true
          detectedToolCalls = toolCalls
          // 使用统一的工具调用处理逻辑（会添加到队列并立即执行）
          await this.createToolCallsDetectedHandler(assistantMessage)(toolCalls)
        }
      })

      // AI输出完成
      this.isAiResponding = false

      // 检查是否有工具调用
      // 优先使用流式输出过程中检测到的工具调用（已经在onToolCallsDetected中添加到tool_calls数组和队列）
      // 如果没有，则从响应中解析（兜底机制）
      let toolCalls: Array<{
        id: string
        tool_id: string
        parameters: Record<string, unknown>
      }> | null = null

      // 获取已经在assistantMessage中的tool_calls（由onToolCallsDetected添加）
      const existingToolCallsInMessage = (assistantMessage as any).tool_calls || []
      const existingToolCallIds = new Set(existingToolCallsInMessage.map((tc: any) => tc.id))

      if (toolCallsDetectedDuringStream && detectedToolCalls !== null) {
        // 流式过程中已经检测到工具调用，并且已经通过onToolCallsDetected添加到tool_calls数组和队列
        // 使用assistantMessage中已有的tool_calls（可能包含多次检测到的工具调用）
        const mappedToolCalls = existingToolCallsInMessage.map((tc: any) => ({
          id: tc.id,
          tool_id: tc.tool_id,
          parameters: tc.parameters
        }))
        toolCalls = mappedToolCalls
        // 计算detectedToolCalls的长度（用于日志）
        const detectedCountValue = (
          detectedToolCalls as Array<{
            id: string
            tool_id: string
            parameters: Record<string, unknown>
          }>
        ).length
        getLogger().debug('[AutoGPT] 使用流式输出过程中检测到的工具调用', {
          toolCallsCount: mappedToolCalls.length,
          detectedCount: detectedCountValue,
          existingCount: existingToolCallsInMessage.length
        })
      } else {
        // 从响应中解析工具调用（兜底机制：流式检测可能遗漏某些工具调用）
        const responseContent = response || assistantMessage.markdown || ''
        const parsedToolCalls = this.parseToolCalls(responseContent)
        getLogger().debug(
          '[AutoGPT] 从响应中解析工具调用:',
          parsedToolCalls ? parsedToolCalls.length : 0
        )

        if (parsedToolCalls && parsedToolCalls.length > 0) {
          // 过滤出新的工具调用（避免重复）
          const newToolCalls = parsedToolCalls.filter((tc) => !existingToolCallIds.has(tc.id))

          if (newToolCalls.length > 0) {
            getLogger().debug(
              '[AutoGPT] 兜底机制：从响应中解析到新工具调用，添加到队列和tool_calls数组',
              {
                newCount: newToolCalls.length,
                existingCount: existingToolCallsInMessage.length
              }
            )

            // 合并现有的和新的工具调用
            const mergedToolCalls: Array<{
              id: string
              tool_id: string
              parameters: Record<string, unknown>
            }> = [
              ...existingToolCallsInMessage.map((tc: any) => ({
                id: tc.id,
                tool_id: tc.tool_id,
                parameters: tc.parameters
              })),
              ...newToolCalls
            ]

            // 更新assistantMessage的tool_calls
            Object.defineProperty(assistantMessage, 'tool_calls', {
              value: mergedToolCalls,
              writable: true,
              enumerable: true,
              configurable: true
            })

            // 将新工具调用添加到队列
            for (const toolCall of newToolCalls) {
              if (this.currentToolCallQueue) {
                this.currentToolCallQueue.addTask(toolCall)
              }
            }

            toolCalls = mergedToolCalls
          } else {
            // 没有新工具调用，使用现有的
            toolCalls =
              existingToolCallsInMessage.length > 0
                ? existingToolCallsInMessage.map((tc: any) => ({
                    id: tc.id,
                    tool_id: tc.tool_id,
                    parameters: tc.parameters
                  }))
                : null
          }
        } else {
          // 没有解析到工具调用，使用现有的
          toolCalls =
            existingToolCallsInMessage.length > 0
              ? existingToolCallsInMessage.map((tc: any) => ({
                  id: tc.id,
                  tool_id: tc.tool_id,
                  parameters: tc.parameters
                }))
              : null
        }
      }

      // 检查是否有未完成的工具调用标记
      const responseContent = response || assistantMessage.markdown || ''
      const hasIncomplete = this.hasIncompleteToolCalls(responseContent)

      if (!toolCalls || toolCalls.length === 0) {
        // 即使没有工具调用，也需要等待队列完成（确保队列状态干净）
        // 标记AI输出已完成，然后等待队列完成
        await this.waitForToolCallQueue()

        // 没有工具调用，检查是否有未完成的标记
        if (hasIncomplete) {
          getLogger().warn('[AutoGPT] 检测到未完成的工具调用标记，继续执行...')
          // 添加系统提示消息（不显示给用户），让AI知道工具调用未完成
          contextMessages.push({
            role: 'user',
            content:
              '⚠️ 检测到未完成的工具调用标记。请重新调用工具，确保使用完整的标记格式：\n\n<tool_call>\n{"name": "工具ID", "arguments": {"参数名": "参数值"}}\n</tool_call>\n\n**重要**：工具调用标记必须直接输出，不要放在代码块中！'
          })
          // 继续循环，不break（确保队列已完成）
          continue
        }

        // 检查任务是否完成
        const isComplete = this.isTaskComplete(responseContent)
        if (isComplete) {
          getLogger().info('[AutoGPT] 检测到任务完成标记，结束执行')
          this.options.onProgress?.({
            stage: 'complete',
            message: '完成'
          })
          break
        }

        // 没有工具调用，也没有完成标记，结束执行
        getLogger().info('[AutoGPT] 没有工具调用且没有完成标记，结束执行')
        this.options.onProgress?.({
          stage: 'complete',
          message: '完成'
        })
        break
      }

      // 如果有工具调用，确保tool_calls已经被正确添加到assistantMessage
      // 注意：tool_calls可能已经在onToolCallsDetected回调中添加了，这里只需要验证
      if (assistantMessage && toolCalls && toolCalls.length > 0) {
        // 验证tool_calls是否已经存在
        const existingToolCalls = (assistantMessage as any).tool_calls || []

        // 如果tool_calls不存在或数量不匹配，更新它
        if (existingToolCalls.length !== toolCalls.length) {
          getLogger().warn('[AutoGPT] tool_calls数量不匹配，更新tool_calls数组', {
            existingCount: existingToolCalls.length,
            expectedCount: toolCalls.length
          })

          const toolCallsArray = toolCalls.map((tc) => ({
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
        }

        // 验证tool_calls是否被正确添加
        const hasToolCalls = !!(assistantMessage as any).tool_calls
        const toolCallsValue = (assistantMessage as any).tool_calls

        // 记录日志用于调试
        getLogger().debug('[AutoGPT] 验证tool_calls:', {
          messageId: assistantMessage.id,
          toolCallsCount: toolCalls.length,
          toolCallsInMessage: toolCallsValue?.length || 0,
          toolCalls: toolCalls.map((tc) => ({ id: tc.id, tool_id: tc.tool_id })),
          hasToolCallsInMessage: hasToolCalls,
          messageKeys: Object.keys(assistantMessage)
        })

        // 如果tool_calls没有被正确添加，记录错误
        if (!hasToolCalls || !Array.isArray(toolCallsValue)) {
          getLogger().error('[AutoGPT] 严重错误：tool_calls没有被正确添加到消息对象上！', {
            messageId: assistantMessage.id,
            hasToolCalls,
            toolCallsValueType: typeof toolCallsValue,
            toolCallsValue
          })
        } else if (toolCallsValue.length !== toolCalls.length) {
          getLogger().error('[AutoGPT] 严重错误：tool_calls数量不匹配！', {
            messageId: assistantMessage.id,
            expectedCount: toolCalls.length,
            actualCount: toolCallsValue.length,
            expectedIds: toolCalls.map((tc) => tc.id),
            actualIds: toolCallsValue.map((tc: any) => tc.id)
          })
        }
      }
      // 等待工具调用队列完成
      // 重要：先标记AI输出已完成，然后等待队列完成
      // 这样可以确保所有在流式过程中检测到的工具调用都已添加到队列并执行完成
      await this.waitForToolCallQueue()

      this.options.onProgress?.({
        stage: 'tool-calling',
        message: `工具调用完成`
      })

      // 旧的执行逻辑已移除，因为工具调用现在在队列中执行
      // 工具调用结果已经通过队列添加到messages中，我们需要从messages中获取结果
      // 构建观察结果文本（从messages中获取工具执行结果）
      let observationText = '\n\n=== 工具执行结果 ===\n'

      // 从messages中查找对应的tool消息
      if (toolCalls) {
        for (const toolCall of toolCalls) {
          // 在当前消息之后查找对应的tool消息
          const currentMessageIndex = this.session.messages.indexOf(assistantMessage)
          if (currentMessageIndex !== -1) {
            for (let i = currentMessageIndex + 1; i < this.session.messages.length; i++) {
              const msg = this.session.messages[i]
              if (
                msg.type === 'tool' &&
                msg.role === 'tool' &&
                (msg as any).tool_call_id === toolCall.id
              ) {
                const toolMsg = msg as any
                const toolName = toolMsg.tool?.name || toolCall.tool_id
                const status = toolMsg.status === 'succeeded' ? '成功' : '失败'
                observationText += `工具 ${toolName}: ${status}\n`

                if (toolMsg.status === 'succeeded') {
                  // 使用已保存的OpenAI格式content（在markdown字段中）
                  const content =
                    toolMsg.markdown ||
                    ToolRunner.serializeToOpenAIFormat({
                      toolId: toolCall.tool_id,
                      toolName,
                      status: 'succeeded',
                      result: toolMsg.outputs?.[0]?.data
                    })
                  observationText += `结果: ${content}\n`
                } else if (toolMsg.error) {
                  observationText += `错误: ${toolMsg.error}\n`
                }
                break
              }
            }
          }
        }
      }

      // 注意：不再需要手动执行工具调用，因为它们已经在队列中执行完成
      // 下面的代码已被注释，但保留用于参考
      /*
      const observations: ToolObservation[] = []
      for (const toolCall of toolCalls) {
        try {
          // 处理dummy-tool（无效的工具调用）
          if (toolCall.tool_id === 'dummy-tool') {
            const errorInfo = toolCall.parameters.error as string || '工具调用格式错误'
            const rawContent = toolCall.parameters.rawContent as string || ''
            const parsed = toolCall.parameters.parsed as any
            
            // 构建详细的错误信息
            let errorMessage = `工具调用格式错误：${errorInfo}\n\n`
            errorMessage += `**原始内容：**\n\`\`\`\n${rawContent}\n\`\`\`\n\n`
            
            if (parsed) {
              errorMessage += `**解析结果：**\n\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\`\n\n`
            }
            
            errorMessage += `**正确的调用格式：**\n\`\`\`\n<tool_call>\n{"name": "工具ID", "arguments": {"参数名": "参数值"}}\n</tool_call>\n\`\`\`\n\n`
            errorMessage += `**注意事项：**\n`
            errorMessage += `1. 必须包含 "name" 字段指定工具ID\n`
            errorMessage += `2. 必须包含 "arguments" 字段（对象类型）\n`
            errorMessage += `3. 标记必须完整：<tool_call>...</tool_call>\n`
            errorMessage += `4. JSON格式必须正确（注意引号、逗号等）`
            
            const failedObservation: ToolObservation = {
              toolId: 'dummy-tool',
              toolName: '工具调用错误',
              status: 'failed',
              error: errorMessage
            }
            observations.push(failedObservation)
            
            // 添加tool消息
            AIContextManager.addToolMessage(
              this.session,
              'dummy-tool',
              '工具调用错误',
              'failed',
              undefined,
              errorMessage,
              undefined,
              toolCall.id,
              undefined // dummy-tool没有配置
            )
            continue
          }
          
          // 验证参数
          const validation = ToolRunner.validateToolParams(toolCall.tool_id, toolCall.parameters)
          if (!validation.valid) {
            const errorMessage = validation.errors.join(', ')
            const failedObservation: ToolObservation = {
              toolId: toolCall.tool_id,
              toolName: toolCall.tool_id,
              status: 'failed',
              error: errorMessage
            }
            observations.push(failedObservation)
            
            // 重要：即使验证失败，也必须添加tool消息，确保每个tool_call都有对应的tool消息
            // 获取工具配置
            const tool = agentToolManager.getTool(toolCall.tool_id)
            const toolConfig = tool?.config
            
            AIContextManager.addToolMessage(
              this.session,
              toolCall.tool_id,
              toolCall.tool_id,
              'failed',
              undefined,
              errorMessage,
              undefined,
              toolCall.id, // 使用toolCall的id作为tool_call_id
              toolConfig
            )
            continue
          }

          // 执行工具（自动传递session对象，用于工具访问session状态）
          const observation = await ToolRunner.runTool(
            toolCall.tool_id,
            toolCall.parameters,
            this.options.signal,
            this.getSessionForTool()  // 使用辅助函数获取session
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
            toolConfig,
            observation.params || toolCall.parameters || {}  // params: 保存工具调用参数
          )
        } catch (error) {
          getLogger().error('工具执行失败:', error)
          const errorMessage = error instanceof Error ? error.message : String(error)
          const failedObservation: ToolObservation = {
            toolId: toolCall.tool_id,
            toolName: toolCall.tool_id,
            status: 'failed',
            error: errorMessage
          }
          observations.push(failedObservation)
          
          // 重要：即使执行异常，也必须添加tool消息，确保每个tool_call都有对应的tool消息
          // 获取工具配置
          const tool = agentToolManager.getTool(toolCall.tool_id)
          const toolConfig = tool?.config
          
          AIContextManager.addToolMessage(
            this.session,
            toolCall.tool_id,
            toolCall.tool_id,
            'failed',
            undefined,
            errorMessage,
            undefined,
            toolCall.id, // 使用toolCall的id作为tool_call_id
            toolConfig,
            toolCall.parameters || {}  // params: 保存工具调用参数
          )
        }
      }
      */

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
        content:
          observationText +
          '\n\n请根据工具执行结果继续完成任务。如果需要再次调用工具，请使用tool_calls格式。否则直接回复最终结果。'
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

        const finalResponse = await LlmAdapter.callChatViaTask(llmConfig, contextMessages, {
          temperature: await this.getTemperature(),
          maxTokens: this.engine.customLlmConfig?.maxTokens,
          stream: true,
          signal: this.options.signal,
          taskName: `Agent最终回复`,
          originKey: `agent-autogpt-${this.session.id}-${Date.now()}-final`,
          reactiveMessage: finalMessage,
          onTaskCreated: this.options.onTaskCreated,
          onToolCallsDetected: this.createToolCallsDetectedHandler(finalMessage)
        })

        // 等待队列完成（最终回复可能也有工具调用）
        await this.waitForToolCallQueue()

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

    // 步骤1: 意图识别并更新activeToolSpecs（即使SimpleChat也可能需要工具）
    this.options.onProgress?.({
      stage: 'thinking',
      message: 'Analyzing intent...'
    })

    const intentOutputRef = ref('')
    const intentResult = await this.processIntentAndUpdateSpecs(userMessage, intentOutputRef)

    // 添加意图识别消息到会话（用于UI显示）
    if (intentResult.toolIds.length > 0) {
      const intentMessage = {
        id: `intent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'system' as const,
        type: 'intent-recognition' as const,
        timestamp: new Date().toISOString(),
        toolIds: intentResult.toolIds,
        reasoning: intentResult.reasoning,
        output: intentOutputRef.value
      }
      this.session.messages.push(intentMessage as any)
    }

    this.options.onProgress?.({
      stage: 'generating',
      message: 'Generating response...'
    })

    // 获取LLM配置
    const llmConfig = await LlmAdapter.getLlmConfig(this.engine)

    // 构建上下文消息（不包含工具提示）
    const contextMessages = AIContextManager.buildMessages(this.session, this.agentConfig)

    // 创建新的工具调用队列（每次AI输出开始时）
    this.createToolCallQueue()
    this.isAiResponding = true

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
    const response = await LlmAdapter.callChatViaTask(llmConfig, contextMessages, {
      temperature: await this.getTemperature(),
      maxTokens: this.engine.customLlmConfig?.maxTokens,
      stream: true,
      signal: this.options.signal,
      taskName: 'SimpleChat对话',
      originKey: `agent-simplechat-${this.session.id}-${Date.now()}`,
      reactiveMessage: assistantMessage,
      onTaskCreated: this.options.onTaskCreated,
      onToolCallsDetected: this.createToolCallsDetectedHandler(assistantMessage)
    })

    // AI输出完成
    this.isAiResponding = false

    // 等待工具调用队列完成（如果队列中有任务）
    await this.waitForToolCallQueue()

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

    // 步骤1: 意图识别并更新activeToolSpecs
    this.options.onProgress?.({
      stage: 'thinking',
      message: 'Analyzing intent...'
    })

    const intentOutputRef = ref('')
    const intentResult = await this.processIntentAndUpdateSpecs(userMessage, intentOutputRef)

    // 添加意图识别消息到会话（用于UI显示）
    if (intentResult.toolIds.length > 0) {
      const intentMessage = {
        id: `intent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'system' as const,
        type: 'intent-recognition' as const,
        timestamp: new Date().toISOString(),
        toolIds: intentResult.toolIds,
        reasoning: intentResult.reasoning,
        output: intentOutputRef.value
      }
      this.session.messages.push(intentMessage as any)
    }

    this.options.onProgress?.({
      stage: 'thinking',
      message: 'Planning phase: Generating execution plan...'
    })

    // 获取LLM配置
    const llmConfig = await LlmAdapter.getLlmConfig(this.engine)

    // 阶段1: 生成计划
    const plan = await this.generatePlan(userMessage, llmConfig)

    if (plan && plan.steps && plan.steps.length > 0) {
      // 添加计划到会话
      const planText =
        '**执行计划：**\n\n' +
        plan.steps
          .map((step: any, idx: number) => `${idx + 1}. ${step.description || step}`)
          .join('\n')
      AIContextManager.addAssistantMessage(this.session, planText)

      // 阶段2: 执行计划
      // 考虑maxToolCalls限制：如果设置了限制，只执行前N个步骤
      const { maxIterations, isUnlimited } = this.getMaxIterations()
      const maxSteps = isUnlimited ? plan.steps.length : Math.min(plan.steps.length, maxIterations)

      // 创建工具调用队列
      this.createToolCallQueue()

      // 收集所有需要工具调用的步骤
      const toolCallSteps: Array<{
        step: any
        toolCall: { id: string; tool_id: string; parameters: Record<string, unknown> }
      }> = []

      for (let i = 0; i < maxSteps; i++) {
        const step = plan.steps[i]

        // 解析步骤，可能需要工具调用
        if (step.tool || step.tool_id) {
          const toolId = step.tool_id || step.tool
          if (!toolId) {
            getLogger().warn('计划步骤缺少tool_id，跳过')
            continue
          }

          const toolCallId = `plan-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`
          toolCallSteps.push({
            step,
            toolCall: {
              id: toolCallId,
              tool_id: toolId,
              parameters: step.parameters || step.params || {}
            }
          })
        }
      }

      // 将所有工具调用添加到队列
      for (const { step, toolCall } of toolCallSteps) {
        this.options.onProgress?.({
          stage: 'tool-calling',
          message: `执行计划步骤: ${step.description || toolCall.tool_id}`
        })
        this.currentToolCallQueue!.addTask(toolCall)
      }

      // 等待所有工具调用完成
      await this.waitForToolCallQueue()
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

    const summary = await LlmAdapter.callChatViaTask(llmConfig, contextMessages, {
      temperature: await this.getTemperature(),
      maxTokens: this.engine.customLlmConfig?.maxTokens,
      stream: true,
      signal: this.options.signal,
      taskName: 'PlanExecute总结',
      originKey: `agent-planexecute-${this.session.id}-${Date.now()}-summary`,
      reactiveMessage: summaryMessage,
      onTaskCreated: this.options.onTaskCreated,
      onToolCallsDetected: this.createToolCallsDetectedHandler(summaryMessage)
    })

    // 消息已经通过reactiveMessage实时更新，不需要再调用addAssistantMessage

    this.options.onProgress?.({
      stage: 'complete',
      message: '完成'
    })
  }

  /**
   * 生成执行计划
   */
  private async generatePlan(
    userMessage: string,
    llmConfig: any
  ): Promise<{
    steps: Array<{
      description: string
      tool_id?: string
      tool?: string
      parameters?: Record<string, unknown>
      params?: Record<string, unknown>
    }>
  }> {
    const toolPrompt = this.buildToolCallPrompt()
    const planPrompt =
      '\n\n=== 计划生成模式 ===\n' +
      '请分析用户需求并生成详细的执行计划。\n' +
      '计划格式（JSON）：\n' +
      '```json\n' +
      '{\n' +
      '  "steps": [\n' +
      '    {\n' +
      '      "description": "步骤描述",\n' +
      '      "tool_id": "工具ID（如果需要工具）",\n' +
      '      "parameters": {"参数": "值"}\n' +
      '    }\n' +
      '  ]\n' +
      '}\n' +
      '```\n\n' +
      '如果某个步骤不需要工具，可以不包含tool_id和parameters。\n'

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

    const response = await LlmAdapter.callChatViaTask(llmConfig, contextMessages, {
      temperature: await this.getTemperature(),
      stream: true,
      signal: this.options.signal,
      taskName: '计划步骤选择',
      originKey: `agent-plan-${this.session.id}-${Date.now()}-select`,
      onTaskCreated: this.options.onTaskCreated
      // 注意：这里没有reactiveMessage，所以不需要onToolCallsDetected
    })

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
      default:
        getLogger().warn(`未知引擎类型: ${engine.engineType}，使用AutoGPT引擎`)
        return new AutoGPTEngineExecutor(engine, session, agentConfig, options)
    }
  }
}
