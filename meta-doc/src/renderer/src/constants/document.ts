import type {
  ArticleMetaData,
  AIDialogMessage,
  AIDialog,
  DocumentOutlineNode,
  MaterialBasketItem
} from '../../../types'
import type { AgentSession } from '../types/agent'
import type { SchemaDefinition } from '../utils/common/schemas'
import { getPromptByKey } from '../utils/common/prompts'
import { i18n } from '../i18n.js'

export const TREE_NODE_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'DocumentOutlineNode',
  type: 'object',
  required: ['path', 'title', 'text', 'title_level', 'children'],
  properties: {
    path: {
      type: 'string',
      description:
        "节点的编号路径，根节点为 'dummy'。例如：'1' 表示根节点 dummy 的第一个子节点，'1.1' 表示 1 的第一个子节点，'1.1.1' 表示 1.1 的第一个子节点，以此类推。"
    },
    title: {
      type: 'string',
      description: '节点对应的标题文字。'
    },
    text: {
      type: 'string',
      description: '该节点正文的文本内容，可为空字符串。'
    },
    title_level: {
      type: 'integer',
      minimum: 0,
      description: '标题的层级，0 表示根节点，1 表示一级标题，2 表示二级标题，以此类推。'
    },
    children: {
      type: 'array',
      description: '子节点列表，结构与当前节点相同。',
      items: {
        $ref: '#'
      }
    }
  }
} as const

export interface ContentSchemaResult {
  content: string
}

export const CONTENT_SCHEMA: SchemaDefinition<ContentSchemaResult> = {
  name: 'content_schema_v1',
  description: '生成章节的正文内容',
  schema: {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'Content',
    type: 'object',
    required: ['content'],
    properties: {
      content: {
        type: 'string',
        description: '章节的正文内容，使用 Markdown 格式。'
      }
    }
  },
  example: '{"content":"这是章节的正文内容..."}'
}

export const DEFAULT_OUTLINE_TREE: DocumentOutlineNode = {
  path: 'dummy',
  title: '',
  text: '',
  title_level: 0,
  children: []
}

export const DEFAULT_ARTICLE_META: ArticleMetaData = {
  title: '',
  author: '',
  description: '',
  keywords: [],
  materialBasket: []
}

export const DEFAULT_AI_ASSISTANT_GREETING =
  '### {{agentEngine.greeting.title}}\n{{agentEngine.greeting.subtitle}}\n'

export const DEFAULT_AGENT_ASSISTANT_GREETING =
  '### {{agentEngine.greeting.title}}\n\n{{agentEngine.greeting.subtitle}}\n\n{{agentEngine.greeting.canDo}}\n- {{agentEngine.greeting.ragTool}}\n- {{agentEngine.greeting.chartTool}}\n- {{agentEngine.greeting.editTool}}\n- {{agentEngine.greeting.proofreadTool}}\n\n{{agentEngine.greeting.tellMe}}\n'

/** 返回基于当前语言的默认 AI 对话消息（系统提示来自 locale_prompts；助手欢迎语来自 locales i18n） */
export function getDefaultAiChatMessages(): AIDialogMessage[] {
  const greeting =
    (typeof i18n?.global?.t === 'function' &&
      (i18n.global.t('document.aiAssistantGreeting') as string)) ||
    DEFAULT_AI_ASSISTANT_GREETING
  return [
    { role: 'system', content: getPromptByKey('chat.documentSystemPrompt') },
    { role: 'assistant', content: greeting }
  ]
}

/** @deprecated 使用 getDefaultAiChatMessages() 以支持 i18n */
export const DEFAULT_AI_CHAT_MESSAGES: AIDialogMessage[] = getDefaultAiChatMessages()

export const DEFAULT_AI_DIALOGS: AIDialog[] = [
  {
    title: '新对话',
    messages: getDefaultAiChatMessages().map((message) => ({ ...message }))
  }
]

export const DEFAULT_FIRST_LOAD = true

export const DEFAULT_AGENT_SESSIONS: AgentSession[] = []
