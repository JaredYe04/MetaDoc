/**
 * 根据会话内容通过 AI 生成会话标题（与 AIChat.vue 的 updateTitle 逻辑一致）
 */
import { ref } from 'vue'
import { updateTitlePrompt } from './prompts'
import { createAiTask, ai_types } from './ai_tasks'
import { parseSchemaJson, DOCUMENT_TITLE_SCHEMA, type DocumentTitleSchemaResult } from './schemas'
import { createRendererLogger } from './logger'
import type { AgentMessage } from '../types/agent'

const logger = createRendererLogger('ConversationTitle')
const MAX_TITLE_LENGTH = 20
const TITLE_CONTEXT_LIMIT = 6

function getMessageText(m: AgentMessage): string {
  if (m.role === 'system') return ''
  const text =
    (m as { markdown?: string; content?: string }).markdown ??
    (m as { content?: string }).content ??
    ''
  return typeof text === 'string' ? text : ''
}

/**
 * 从会话消息列表构建用于生成标题的上下文（最近若干条 user/assistant 对话）
 */
export function buildTitleSourceFromMessages(messages: AgentMessage[]): string {
  const chatMessages = messages.filter(
    (m) => (m.role === 'user' || m.role === 'assistant') && m.type === 'chat'
  )
  const recent = chatMessages.slice(-TITLE_CONTEXT_LIMIT)
  return recent.map((m) => `${m.role.toUpperCase()}: ${getMessageText(m)}`).join('\n')
}

function sanitizeGeneratedTitle(raw: string, defaultTitle: string): string {
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
    next = defaultTitle
  }
  return next
}

/**
 * 根据会话消息通过 AI 生成标题（参考 AIChat.vue 的 updateTitle）
 * @param messages 会话消息列表（通常为 session.messages）
 * @param defaultTitle 生成失败或为空时使用的默认标题
 * @returns 生成的标题，失败时返回 defaultTitle
 */
export async function generateConversationTitleByAi(
  messages: AgentMessage[],
  defaultTitle: string
): Promise<string> {
  const titleSource = buildTitleSourceFromMessages(messages)
  if (!titleSource.trim()) {
    return defaultTitle
  }

  const prompt = updateTitlePrompt(titleSource)
  const apiMessages = [{ role: 'user' as const, content: prompt }]
  const generatedText = ref('')

  const { done } = createAiTask(
    defaultTitle,
    apiMessages,
    generatedText,
    ai_types.chat,
    'agent-generate-title',
    { stream: true, enableKnowledgeBase: false }
  )

  try {
    await done
  } catch (err) {
    logger.debug('生成标题任务失败', err)
    return defaultTitle
  }

  let schemaTitle: string | undefined
  let fallbackTitle: string | undefined

  try {
    const parsed = parseSchemaJson<DocumentTitleSchemaResult>(
      generatedText.value,
      DOCUMENT_TITLE_SCHEMA
    )
    schemaTitle = parsed.title
  } catch {
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
          .filter(Boolean)
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

  const newTitle = sanitizeGeneratedTitle(
    schemaTitle ?? fallbackTitle ?? generatedText.value ?? titleSource,
    defaultTitle
  )
  return newTitle || defaultTitle
}
