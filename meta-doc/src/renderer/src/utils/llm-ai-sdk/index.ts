/**
 * Vercel AI SDK 桥接层
 * 在保持 createAiTask 统一任务管理的前提下，将底层 LLM 调用迁移到 AI SDK
 */

export { getModelFromConfig } from './model-from-config'
export { toAISDKMessages } from './messages'
export { streamChat, type StreamChatOptions, type StreamChatResult } from './stream-chat'
export { streamChatWithTools, type StreamChatWithToolsOptions, type StreamChatWithToolsResult } from './stream-chat-with-tools'
export { generateChat, type GenerateChatOptions, type GenerateChatResult } from './generate-chat'
export { toAISDKTools, type EngineToolSpec } from './tools-to-ai-sdk'
