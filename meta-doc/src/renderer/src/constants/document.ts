import type {
  ArticleMetaData,
  AIDialogMessage,
  AIDialog,
  DocumentOutlineNode
} from '../../../types'
import type { AgentSession } from '../types/agent'
import type { SchemaDefinition } from '../utils/schemas'

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
  keywords: []
}

export const DEFAULT_AI_ASSISTANT_GREETING =
  '### 你好！我是你的AI文档助手！\n告诉我你的任何需求，我会尝试解决。\n'

export const DEFAULT_AGENT_ASSISTANT_GREETING =
  '### 你好！我是MetaDoc AI助手！\n\n我是你的智能文档写作助手，我可以高效地使用各种AI工具，帮助你生成图文并茂、内容充实丰富的、专业的、多领域的文章。\n\n我可以：\n- 使用RAG工具检索相关知识\n- 使用图表生成工具创建可视化内容\n- 使用编辑工具优化文档结构\n- 使用校对工具确保内容质量\n\n告诉我你的需求，我会尽力帮助你完成文档创作任务！\n'

export const DEFAULT_AI_CHAT_MESSAGES: AIDialogMessage[] = [
  {
    role: 'system',
    content:
      '你是一个出色的AI文档编辑助手，现在你需要根据一篇现有的文档进行修改、优化，或者是撰写新的文档。按照对话的上下文来做出合适的回应。请按照用户需求进行回答。(用markdown语言）'
  },
  {
    role: 'assistant',
    content: DEFAULT_AI_ASSISTANT_GREETING
  }
]

export const DEFAULT_AI_DIALOGS: AIDialog[] = [
  {
    title: '新对话',
    messages: DEFAULT_AI_CHAT_MESSAGES.map((message) => ({ ...message }))
  }
]

export const DEFAULT_FIRST_LOAD = true

export const DEFAULT_AGENT_SESSIONS: AgentSession[] = []
