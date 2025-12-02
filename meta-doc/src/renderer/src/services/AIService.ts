/**
 * AI服务层
 * 统一管理AI相关功能，包括LLM调用、任务管理等
 */
import type { 
  AITaskInfo,
  AITaskType,
  AIDialogMessage,
  LLMConfig
} from '../../../types'
import { 
  createAiTask, 
  startAiTask, 
  cancelAiTask, 
  clearAiTasks,
  useAiTasks
} from '../utils/ai_tasks'
import { 
  answerQuestion, 
  continueConversation 
} from '../utils/llm-api'
import { getLlmTemperature } from '../utils/settings.js'
import { getSetting } from '../utils/settings'
import eventBus from '../utils/event-bus'
import type { Ref } from 'vue'
import { createRendererLogger } from '../utils/logger';
const logger = createRendererLogger('AIService');

/** AI任务创建选项 */
export interface CreateAITaskOptions {
  name: string
  prompt: string | AIDialogMessage[]
  target: Ref<string>
  type: AITaskType
  originKey: string
  meta?: Record<string, any>
}

/** AI服务类 */
export class AIService {
  /**
   * 创建AI任务
   */
  static async createTask(options: CreateAITaskOptions): Promise<{ handle: string; done: Promise<any> }> {
    try {
      const {
        name,
        prompt,
        target,
        type,
        originKey,
        meta = { stream: true }
      } = options

      return createAiTask(name, prompt, target, type, originKey, meta)
    } catch (error) {
      logger.error('创建AI任务失败:', error)
      eventBus.emit('show-error', `创建AI任务失败: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  /**
   * 启动AI任务
   */
  static async startTask(handle: string): Promise<void> {
    try {
      await startAiTask(handle)
    } catch (error) {
      logger.error('启动AI任务失败:', error)
      eventBus.emit('show-error', `启动AI任务失败: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  /**
   * 取消AI任务
   */
  static cancelTask(handle: string, showWarning = true): void {
    try {
      cancelAiTask(handle, showWarning)
    } catch (error) {
      logger.error('取消AI任务失败:', error)
      if (showWarning) {
        eventBus.emit('show-error', `取消AI任务失败: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  /**
   * 清空所有任务
   */
  static clearAllTasks(): void {
    try {
      clearAiTasks()
    } catch (error) {
      logger.error('清空AI任务失败:', error)
      eventBus.emit('show-error', `清空AI任务失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 获取所有任务
   */
  static getTasks(): Ref<AITaskInfo[]> {
    return useAiTasks()
  }

  /**
   * 直接调用LLM回答问题
   */
  static async askQuestion(
    prompt: string,
    target: Ref<string>,
    options: {
      meta?: Record<string, any>
      signal?: AbortSignal
    } = {}
  ): Promise<void> {
    try {
      const globalTemperature = await getLlmTemperature()
      const { meta = { temperature: globalTemperature }, signal } = options
      await answerQuestion(prompt, target, meta, signal)
    } catch (error) {
      logger.error('AI回答问题失败:', error)
      eventBus.emit('show-error', `AI回答问题失败: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  /**
   * 继续对话
   */
  static async continueChat(
    conversation: AIDialogMessage[],
    target: Ref<string>,
    options: {
      meta?: Record<string, any>
      signal?: AbortSignal
    } = {}
  ): Promise<void> {
    try {
      const globalTemperature = await getLlmTemperature()
      const { meta = { temperature: globalTemperature }, signal } = options
      await continueConversation(conversation, target, meta as any, signal)
    } catch (error) {
      logger.error('AI对话失败:', error)
      eventBus.emit('show-error', `AI对话失败: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  /**
   * 检查LLM是否可用
   */
  static async isLLMAvailable(): Promise<boolean> {
    try {
      const llmEnabled = await getSetting('llmEnabled')
      const selectedLlm = await getSetting('selectedLlm')
      return llmEnabled && selectedLlm
    } catch (error) {
      logger.error('检查LLM可用性失败:', error)
      return false
    }
  }

  /**
   * 获取当前LLM配置
   */
  static async getCurrentLLMConfig(): Promise<LLMConfig | null> {
    try {
      const selectedLlm = await getSetting('selectedLlm')
      if (!selectedLlm) return null

      switch (selectedLlm) {
        case 'openai':
          return {
            type: 'openai',
            apiUrl: await getSetting('openaiApiUrl') || 'https://api.openai.com/v1',
            apiKey: await getSetting('openaiApiKey') || '',
            selectedModel: await getSetting('openaiSelectedModel') || 'gpt-3.5-turbo',
            completionSuffix: await getSetting('openaiCompletionSuffix') || '',
            chatSuffix: await getSetting('openaiChatSuffix') || ''
          }

        case 'ollama':
          return {
            type: 'ollama',
            apiUrl: await getSetting('ollamaApiUrl') || 'http://localhost:11434/api',
            selectedModel: await getSetting('ollamaSelectedModel') || ''
          }

        case 'metadoc':
          return {
            type: 'metadoc',
            apiUrl: '', // 从其他地方获取
            selectedModel: await getSetting('metadocSelectedModel') || ''
          }

        default:
          return null
      }
    } catch (error) {
      logger.error('获取LLM配置失败:', error)
      return null
    }
  }

  /**
   * 创建问答任务的便捷方法
   */
  static createQuestionTask(
    question: string,
    target: Ref<string>,
    options: {
      name?: string
      useRAG?: boolean
      originKey?: string
    } = {}
  ): Promise<{ handle: string; done: Promise<any> }> {
    const { name = '回答问题', useRAG = false, originKey = `question_${Date.now()}` } = options
    
    return this.createTask({
      name,
      prompt: question,
      target,
      type: 'answer',
      originKey,
      useRAG
    })
  }

  /**
   * 创建对话任务的便捷方法
   */
  static createChatTask(
    conversation: AIDialogMessage[],
    target: Ref<string>,
    options: {
      name?: string
      originKey?: string
    } = {}
  ): Promise<{ handle: string; done: Promise<any> }> {
    const { name = '多轮对话', originKey = `chat_${Date.now()}` } = options
    
    return this.createTask({
      name,
      prompt: conversation,
      target,
      type: 'chat',
      originKey
    })
  }
}

// 导出服务实例（可选）
export const aiService = new AIService()
