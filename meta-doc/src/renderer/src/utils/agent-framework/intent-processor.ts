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
import { AIContextManager } from './ai-context-manager'
import { LlmAdapter } from './llm-adapter'
import { createRendererLogger } from '../logger'
import { getPromptByKey } from '../prompts'
import {
  RAGRetriever,
  CapabilityRouter,
  messageTouchesSkills,
  messageTouchesRules
} from './capability-intelligence'

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
 * 包含：主 Agent 配置下的普通工具 + 所有启用的 Subagent 配置（作为可调用的“工具”）
 */
function getAvailableToolBriefs(
  session: AgentSession,
  agentConfig: AgentConfig
): Array<{ id: string; brief: string }> {
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
        const description =
          typeof tool.config.description === 'string'
            ? tool.config.description
            : tool.config.description['zh_cn']?.description ||
              tool.config.description['en_us']?.description ||
              ''
        brief = description.length > 100 ? description.substring(0, 100) + '...' : description
      }
      toolBriefs.push({ id: toolId, brief })
    }
  }

  // 仅主 Agent 可见 Subagent：Subagent 不能再调用 Subagent，意图识别时也不加入 Subagent 选项
  const isSubagent = (agentConfig as { isSubagent?: boolean }).isSubagent === true
  if (!isSubagent) {
    const subagentConfigs = agentConfigManager.getSubagentConfigs()
    for (const config of subagentConfigs) {
      const desc =
        typeof config.description === 'string'
          ? config.description
          : config.description['zh_cn']?.description ||
            config.description['en_us']?.description ||
            ''
      const brief = desc.length > 120 ? desc.substring(0, 120) + '...' : desc
      toolBriefs.push({ id: config.id, brief })
    }
  }

  return toolBriefs
}

/**
 * IntentProcessor：与 RAGRetriever、CapabilityRouter 协同的意图阶段入口（检索合并见 capability-intelligence.ts）
 */
export class IntentProcessor {
  /** 执行完整意图识别（内置工具 top-K + skills/MCP/knowledge 摘要注入到意图提示词） */
  static run(
    session: AgentSession,
    agentConfig: AgentConfig,
    userMessage: string,
    outputRef?: Ref<string>,
    engine?: AgentEngine,
    options?: SchemaTaskOptions
  ): Promise<IntentRecognitionResult> {
    return recognizeIntent(session, agentConfig, userMessage, outputRef, engine, options)
  }
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

  const retrieval = await RAGRetriever.retrieveMerged(userMessage, {
    topKSkills: 5,
    topKMcp: 5,
    topKnowledge: 3
  })
  const narrowedBriefs = CapabilityRouter.narrowBuiltinToolBriefs(availableToolBriefs, userMessage)
  const supplement = CapabilityRouter.buildIntentContextSupplement(retrieval)

  // 构建工具列表文本（用于提示词）：内置工具 top-K + RAG 摘要（技能全文仅 load_skill 后加载）
  const toolListText = narrowedBriefs.map((tool) => `- **${tool.id}**: ${tool.brief}`).join('\n')

  let intentPrompt =
    getPromptByKey('agent.intentRecognition.prompt', {
      toolListText,
      userMessage
    }) + supplement

  if (messageTouchesSkills(userMessage)) {
    intentPrompt += `\n\n[Workspace skills] Prefer **create_workspace_skill** (writes SKILL.md + indexes) or **sync_workspace_skills** after changes. Use **search_skill** / **load_skill** to query. Do not answer only with **edit** + **workspace** when the user explicitly wants MetaDoc skills under \`.metadoc/skills/\`.`
  }

  if (messageTouchesRules(userMessage)) {
    intentPrompt += `\n\n[Dynamic rules] Prefer **create_dynamic_rule** (SQLite + system prompt) or **update_dynamic_rule** with \`ruleId\`. Do **not** create a workspace file to stand in for MetaDoc dynamic rules.`
  }

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
