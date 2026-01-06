/**
 * 意图识别处理器
 * 在用户发送消息后，识别用户意图并确定需要使用的工具
 */

import { ref, type Ref } from 'vue'
import { generateWithSchema, type SchemaTaskOptions } from '../ai-schema-task'
import type { SchemaDefinition } from '../schemas'
import type { AgentSession, AgentEngine } from '../../types/agent-framework'
import type { AgentConfig } from '../../types/agent-framework'
import { agentConfigManager } from './agent-config-manager'
import { agentToolManager } from '../agent-tool-manager'
import { workflowManager } from './workflow-manager'
import { AIContextManager } from './ai-context-manager'
import { LlmAdapter } from './llm-adapter'
import { createRendererLogger } from '../logger'
import { getLlmTemperature } from '../settings.js'

// 懒加载logger，避免初始化顺序问题
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('IntentProcessor')
  }
  return loggerInstance
}

/**
 * 意图识别结果
 */
export interface IntentRecognitionResult {
  /** 识别到的工具ID列表 */
  toolIds: string[]
  /** 识别原因（用于调试和UI显示） */
  reasoning?: string
}

/**
 * 意图识别Schema定义
 */
const INTENT_RECOGNITION_SCHEMA: SchemaDefinition<IntentRecognitionResult> = {
  name: 'intent_recognition_schema_v1',
  description: '识别用户意图并确定需要使用的工具',
  schema: {
    type: 'object',
    required: ['toolIds'],
    properties: {
      toolIds: {
        type: 'array',
        description: '根据用户消息识别出的需要使用的工具ID列表',
        items: {
          type: 'string'
        }
      },
      reasoning: {
        type: 'string',
        description: '识别原因说明（可选，用于调试）'
      }
    }
  },
  example: JSON.stringify({
    toolIds: ['edit', 'chart-generation'],
    reasoning: '用户需要编辑文档并生成图表'
  })
}

/**
 * 获取可用工具的简短说明列表（用于意图识别）
 */
function getAvailableToolBriefs(session: AgentSession, agentConfig: AgentConfig): Array<{ id: string; brief: string }> {
  const toolIds = agentConfigManager.getAvailableToolIds(agentConfig.id)
  const toolBriefs: Array<{ id: string; brief: string }> = []

  // 添加普通工具
  for (const toolId of toolIds) {
    const tool = agentToolManager.getTool(toolId)
    if (tool && tool.config.enabled) {
      // 优先使用 spec.brief，否则使用 description
      let brief: string
      if (tool.config.spec?.brief) {
        brief = tool.config.spec.brief
      } else {
        // 从 description 提取简短说明
        const description = typeof tool.config.description === 'string'
          ? tool.config.description
          : tool.config.description['zh_cn']?.description || 
            tool.config.description['en_us']?.description || 
            ''
        brief = description.length > 100 ? description.substring(0, 100) + '...' : description
      }
      
      toolBriefs.push({
        id: toolId,
        brief
      })
    }
  }

  // 添加Workflow工具
  const workflows = workflowManager.getAllWorkflows()
  const addedToolIds = new Set(toolBriefs.map(t => t.id))
  for (const workflow of workflows) {
    if (workflow.enabled !== false && toolIds.includes(workflow.id) && !addedToolIds.has(workflow.id)) {
      // 从 workflow 提取简短说明
      const description = typeof workflow.description === 'string'
        ? workflow.description
        : workflow.description['zh_cn']?.description || 
          workflow.description['en_us']?.description || 
          ''
      const brief = description.length > 100 ? description.substring(0, 100) + '...' : description
      
      toolBriefs.push({
        id: workflow.id,
        brief
      })
    }
  }

  return toolBriefs
}

/**
 * 识别用户意图并确定需要使用的工具
 * 
 * @param session - Agent会话
 * @param agentConfig - Agent配置
 * @param userMessage - 用户消息
 * @param outputRef - 用于实时展示AI输出的ref（可选）
 * @param engine - Agent引擎（可选，用于获取LLM配置）
 * @param options - 可选的配置项
 * @returns 意图识别结果
 */
export async function recognizeIntent(
  session: AgentSession,
  agentConfig: AgentConfig,
  userMessage: string,
  outputRef?: Ref<string>,
  engine?: AgentEngine,
  options: SchemaTaskOptions = {}
): Promise<IntentRecognitionResult> {
  getLogger().debug('[recognizeIntent] 开始意图识别', {
    sessionId: session.id,
    agentConfigId: agentConfig.id,
    userMessageLength: userMessage.length
  })

  // 获取可用工具的简短说明
  const availableToolBriefs = getAvailableToolBriefs(session, agentConfig)
  
  if (availableToolBriefs.length === 0) {
    getLogger().warn('[recognizeIntent] 没有可用的工具，返回空结果')
    return { toolIds: [] }
  }

  // 构建工具列表文本（用于提示词）
  const toolListText = availableToolBriefs
    .map(tool => `- **${tool.id}**: ${tool.brief}`)
    .join('\n')

  // 构建意图识别提示词
  const intentPrompt = `You are an intent recognition system. Analyze the user's message and identify which tools are needed to fulfill the user's request.

Available tools:
${toolListText}

User message: "${userMessage}"

Please analyze the user's intent and identify the tools that are likely to be needed. Return a JSON object with:
- toolIds: array of tool IDs that are needed
- reasoning: brief explanation of why these tools are selected (optional)

Important:
1. Only include tools that are directly relevant to the user's request
2. If no tools are needed, return an empty array
3. Be precise and avoid including unnecessary tools
4. Consider the context and intent, not just keywords`

  // 创建输出ref（如果没有提供）
  const intentOutputRef = outputRef || ref('')

  // 获取LLM配置（如果提供了engine，使用engine的配置，否则使用全局配置）
  let customLlmConfig: any = undefined
  if (engine) {
    const llmConfig = await LlmAdapter.getLlmConfig(engine)
    // 如果engine有自定义配置，转换为customLlmConfig格式
    if (engine.llmConfigMode === 'custom' && engine.customLlmConfig) {
      customLlmConfig = {
        baseUrl: engine.customLlmConfig.baseUrl,
        apiKey: engine.customLlmConfig.apiKey,
        model: engine.customLlmConfig.model,
        temperature: engine.customLlmConfig.temperature,
        maxTokens: engine.customLlmConfig.maxTokens,
        type: 'openai-compatible',
        chatSuffix: '/chat/completions'
      }
    }
  } else if (options.customLlmConfig) {
    customLlmConfig = options.customLlmConfig
  }

  // 执行意图识别
  try {
    const result = await generateWithSchema<IntentRecognitionResult>(
      INTENT_RECOGNITION_SCHEMA,
      intentPrompt,
      intentOutputRef,
      {
        taskName: options.taskName || 'Intent Recognition',
        temperature: options.temperature ?? 0.3, // 使用较低温度，确保识别准确性
        maxTokens: options.maxTokens ?? 500, // 意图识别不需要太多token
        customLlmConfig,
        stream: options.stream !== false
      }
    )

    getLogger().info('[recognizeIntent] 意图识别完成', {
      toolIds: result.toolIds,
      toolCount: result.toolIds.length,
      reasoning: result.reasoning
    })

    return result
  } catch (error) {
    getLogger().error('[recognizeIntent] 意图识别失败', error)
    // 如果识别失败，返回空结果（不影响主流程）
    return { toolIds: [] }
  }
}

