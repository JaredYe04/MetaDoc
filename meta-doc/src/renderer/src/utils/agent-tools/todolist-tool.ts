/**
 * 意图识别与任务划分Tool
 * 根据用户输入生成结构化的任务列表（TodoList）
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress,
  ToolLocales
} from '../../types/agent-tool'
import { createAiTask } from '../ai_tasks'
import { cancelAiTask } from '../ai_tasks'
import { ref } from 'vue'
import TodoListDisplay from './components/TodoListDisplay.vue'
import { createRendererLogger } from '../logger'
import { i18n } from '../../i18n'
import { parseJsonWithClean, isJsonParseError } from './tool-utils'

const logger = createRendererLogger('TodoListTool')

/**
 * TodoList JSON Schema定义
 */
export interface TodoItem {
  id: string
  title: string
  description?: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  dueDate?: string // ISO 8601格式
  tags?: string[]
  dependencies?: string[] // 依赖的其他任务ID
  estimatedTime?: string // 预估时间，如 "2h", "30m"
  assignee?: string
  metadata?: Record<string, unknown>
}

export interface TodoList {
  id: string
  title: string
  description?: string
  createdAt: string // ISO 8601格式
  updatedAt: string // ISO 8601格式
  items: TodoItem[]
  metadata?: Record<string, unknown>
}

const todolistToolLocales: ToolLocales = {
  zh_cn: {
    name: '意图识别与任务划分',
    description: '分析用户意图，将复杂任务分解为结构化的任务列表（TodoList）',
    instruction: `
# 意图识别与任务划分工具

## 功能描述
根据用户输入的自然语言描述，识别用户意图，并将复杂任务分解为结构化的任务列表（TodoList）。

## 使用场景
- 用户提出复杂需求，需要分解为多个步骤
- 项目管理，需要创建任务清单
- 工作流程规划
- 学习计划制定

## 输入格式
\`\`\`json
{
  "input": "string", // 必需，用户的自然语言输入
  "context": "string" // 可选，上下文信息
}
\`\`\`

## 输出格式
返回符合TodoList JSON Schema的结构化任务列表：
\`\`\`json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "createdAt": "string",
  "updatedAt": "string",
  "items": [
    {
      "id": "string",
      "title": "string",
      "description": "string",
      "status": "pending|in_progress|completed|cancelled",
      "priority": "low|medium|high|urgent",
      "dueDate": "string",
      "tags": ["string"],
      "dependencies": ["string"],
      "estimatedTime": "string",
      "assignee": "string",
      "metadata": {}
    }
  ],
  "metadata": {}
}
\`\`\`

## 注意事项
1. 任务应该按照逻辑顺序排列
2. 如果任务之间有依赖关系，需要在dependencies中标注
3. 优先级的设置应该合理
4. 预估时间应该尽可能准确
`
  },
  en_us: {
    name: 'Intent Recognition & Task Planning',
    description: 'Analyze user intent and decompose complex tasks into structured todo lists',
    instruction: `
# Intent Recognition & Task Planning Tool

## Description
Analyzes user's natural language input to recognize intent and decompose complex tasks into structured todo lists.

## Usage Scenarios
- User proposes complex requirements that need to be broken down
- Project management, creating task lists
- Workflow planning
- Study plan creation

## Input Format
\`\`\`json
{
  "input": "string", // Required, user's natural language input
  "context": "string" // Optional, context information
}
\`\`\`

## Output Format
Returns a structured todo list conforming to TodoList JSON Schema:
\`\`\`json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "createdAt": "string",
  "updatedAt": "string",
  "items": [
    {
      "id": "string",
      "title": "string",
      "description": "string",
      "status": "pending|in_progress|completed|cancelled",
      "priority": "low|medium|high|urgent",
      "dueDate": "string",
      "tags": ["string"],
      "dependencies": ["string"],
      "estimatedTime": "string",
      "assignee": "string",
      "metadata": {}
    }
  ],
  "metadata": {}
}
\`\`\`

## Notes
1. Tasks should be arranged in logical order
2. If tasks have dependencies, mark them in dependencies
3. Priority settings should be reasonable
4. Estimated time should be as accurate as possible
`
  }
}

/**
 * 调用LLM生成TodoList（支持重试）
 */
async function generateTodoListWithLLM(
  input: string,
  context: string | undefined,
  signal: AbortSignal | undefined,
  onUpdate: (data: ToolCallbackData, progress?: ToolProgress) => void,
  retryCount: number = 0,
  maxRetries: number = 2,
  lastError?: string
): Promise<TodoList> {
  // 构建提示词
  let systemPrompt = `你是一个专业的任务规划助手。根据用户的输入，识别用户意图，并将复杂任务分解为结构化的任务列表。

要求：
1. 仔细分析用户的输入，理解用户的真实意图
2. 将复杂任务分解为多个可执行的小任务
3. 为每个任务分配合理的优先级
4. 识别任务之间的依赖关系
5. **最重要**：输出必须严格符合以下JSON Schema格式，**只返回纯JSON，不要包含任何其他文字、解释、说明、注释或中文描述**
6. **禁止**在JSON前后添加任何文字，例如"请根据以上要求生成任务列表"、"以下是任务列表"等
7. **必须**使用英文标点符号（逗号、冒号、引号），不要使用中文标点符号（，、：、"）
8. 所有字符串键和值必须使用英文双引号包裹
9. 确保JSON格式完全正确，可以通过JSON.parse验证
10. 输出格式：直接以 { 开头，以 } 结尾，中间是完整的JSON内容

{
  "id": "唯一标识符",
  "title": "任务列表标题",
  "description": "任务列表描述",
  "createdAt": "ISO 8601格式的时间戳",
  "updatedAt": "ISO 8601格式的时间戳",
  "items": [
    {
      "id": "任务唯一ID",
      "title": "任务标题",
      "description": "任务详细描述（可选）",
      "status": "pending",
      "priority": "low|medium|high|urgent",
      "dueDate": "ISO 8601格式（可选）",
      "tags": ["标签1", "标签2"],
      "dependencies": ["依赖的任务ID"],
      "estimatedTime": "预估时间，如2h或30m（可选）",
      "assignee": "负责人（可选）",
      "metadata": {}
    }
  ],
  "metadata": {}
}

用户输入：${input}
${context ? `上下文信息：${context}` : ''}`

  // 如果有之前的错误，添加到提示词中
  if (retryCount > 0 && lastError) {
    systemPrompt += `\n\n⚠️ 重要：之前的JSON解析失败，错误信息：${lastError}\n请仔细分析错误原因，修复所有问题，确保生成的JSON格式完全正确。特别注意：\n1. **只返回纯JSON**，不要包含任何其他文字、解释、说明、注释或中文描述\n2. **禁止**在JSON前后添加任何文字，例如"请根据以上要求生成任务列表"等\n3. 使用英文标点符号，不要使用中文标点\n4. 所有字符串必须用英文双引号包裹\n5. 确保JSON语法完全正确\n6. 输出格式：直接以 { 开头，以 } 结尾`
  }

  const target = ref('')
  const originKey = `todolist-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const { handle, done } = createAiTask(
    retryCount > 0 ? `重新生成任务列表（重试 ${retryCount}/${maxRetries}）` : '生成任务列表',
    systemPrompt,
    target,
    'answer',
    originKey,
    { temperature: 0.7, stream: false }
  )

  if (signal) {
    signal.addEventListener('abort', () => {
      cancelAiTask(handle, false)
    })
  }

  if (retryCount > 0) {
    onUpdate({
      content: {
        stage: 'retrying',
        input,
        context,
        retryCount,
        lastError
      },
      format: 'json'
    }, {
      percentage: 40 + (retryCount * 10),
      message: i18n.global.t('agent.tool.todolist.progress.retrying', `正在重试生成任务列表（${retryCount}/${maxRetries}）...`)
    })
  } else {
    onUpdate({
      content: {
        stage: 'generating',
        input,
        context
      },
      format: 'json'
    }, {
      percentage: 40,
      message: i18n.global.t('agent.tool.todolist.progress.generating', '正在生成任务列表...')
    })
  }

  await done

  if (!target.value || target.value.trim() === '') {
    throw new Error(i18n.global.t('agent.tool.todolist.error.emptyResult', 'LLM返回结果为空'))
  }

  // 尝试解析JSON（带清理）
  const parseResult = parseJsonWithClean<TodoList>(target.value)
  
  if (!parseResult.success || !parseResult.data) {
    const errorMessage = parseResult.error || 'JSON解析失败'
    logger.error(`解析TodoList JSON失败 (重试 ${retryCount}/${maxRetries}):`, errorMessage)
    
    // 如果还有重试次数，递归重试
    if (retryCount < maxRetries && isJsonParseError(parseResult.error)) {
      logger.info(`准备重试生成TodoList (${retryCount + 1}/${maxRetries})`)
      return await generateTodoListWithLLM(
        input,
        context,
        signal,
        onUpdate,
        retryCount + 1,
        maxRetries,
        errorMessage
      )
    }
    
    throw new Error(errorMessage)
  }

  return parseResult.data
}

/**
 * TodoList Tool回调函数
 */
const todolistToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const input = params.input as string
  const context = params.context as string | undefined

  if (!input || typeof input !== 'string') {
    return {
      status: 'failed',
      error: i18n.global.t('agent.tool.todolist.error.missingInput', '缺少必需参数: input')
    }
  }

  try {
    onUpdate({
      content: {
        stage: 'analyzing',
        input,
        context
      },
      format: 'json'
    }, {
      percentage: 10,
      message: i18n.global.t('agent.tool.todolist.progress.analyzing', '正在分析用户意图...')
    })

    // 调用LLM生成TodoList（带自动重试）
    let todoList: TodoList
    try {
      todoList = await generateTodoListWithLLM(input, context, signal, onUpdate)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('生成TodoList失败:', error)
      return {
        status: 'failed',
        error: i18n.global.t('agent.tool.todolist.error.parseFailed', `解析任务列表JSON失败: ${errorMessage}`)
      }
    }

    // 验证基本结构
    if (!todoList.items || !Array.isArray(todoList.items)) {
      return {
        status: 'failed',
        error: i18n.global.t('agent.tool.todolist.error.invalidStructure', '任务列表结构无效：缺少items数组')
      }
    }

    // 确保必要字段存在
    if (!todoList.id) {
      todoList.id = `todolist-${Date.now()}`
    }
    if (!todoList.title) {
      todoList.title = '任务列表'
    }
    const now = new Date().toISOString()
    if (!todoList.createdAt) {
      todoList.createdAt = now
    }
    if (!todoList.updatedAt) {
      todoList.updatedAt = now
    }

    // 为每个任务项确保必要字段
    todoList.items = todoList.items.map((item, index) => {
      if (!item.id) {
        item.id = `task-${index + 1}`
      }
      if (!item.status) {
        item.status = 'pending'
      }
      return item
    })

    onUpdate({
      content: {
        stage: 'completed',
        todoList
      },
      format: 'json',
      componentName: 'TodoListDisplay'
    }, {
      percentage: 100,
      message: i18n.global.t('agent.tool.todolist.progress.completed', '任务列表生成完成')
    })

    return {
      status: 'succeeded',
      data: {
        content: {
          stage: 'completed',
          todoList
        },
        format: 'json',
        componentName: 'TodoListDisplay'
      },
      result: todoList
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('TodoList生成失败:', error)
    return {
      status: 'failed',
      error: i18n.global.t('agent.tool.todolist.error.failed', { error: errorMessage }, `生成任务列表失败: ${errorMessage}`)
    }
  }
}

export const todolistToolConfig: AgentToolConfig = {
  id: 'todolist-planning',
  name: {
    'zh_cn': { name: '意图识别与任务划分' },
    'en_us': { name: 'Intent Recognition & Task Planning' },
    'de_DE': { name: 'Absichtserkennung & Aufgabenplanung' },
    'fr_FR': { name: 'Reconnaissance d\'intention et planification de tâches' },
    'ja_JP': { name: '意図認識とタスク計画' },
    'ko_KR': { name: '의도 인식 및 작업 계획' }
  } as any,
  description: {
    'zh_cn': { description: '分析用户意图，将复杂任务分解为结构化的任务列表（TodoList）' },
    'en_us': { description: 'Analyze user intent and decompose complex tasks into structured todo lists' },
    'de_DE': { description: 'Analysiert Benutzerabsichten und zerlegt komplexe Aufgaben in strukturierte Aufgabenlisten' },
    'fr_FR': { description: 'Analyse l\'intention de l\'utilisateur et décompose les tâches complexes en listes de tâches structurées' },
    'ja_JP': { description: 'ユーザーの意図を分析し、複雑なタスクを構造化されたタスクリストに分解' },
    'ko_KR': { description: '사용자 의도를 분석하고 복잡한 작업을 구조화된 할 일 목록으로 분해' }
  } as any,
  instruction: todolistToolLocales,
  origin: 'internal',
  tags: ['planning', 'task', 'todolist', 'intent'],
  running: false,
  enabled: true,
  requiresLLM: true,
  displayComponent: TodoListDisplay,
  callback: todolistToolCallback,
  inputSchema: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: '用户的自然语言输入，描述需要完成的任务或目标'
      },
      context: {
        type: 'string',
        description: '可选的上下文信息，帮助更好地理解用户意图'
      }
    },
    required: ['input']
  },
  outputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '任务列表唯一标识符' },
      title: { type: 'string', description: '任务列表标题' },
      description: { type: 'string', description: '任务列表描述' },
      createdAt: { type: 'string', description: '创建时间（ISO 8601）' },
      updatedAt: { type: 'string', description: '更新时间（ISO 8601）' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            dueDate: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            dependencies: { type: 'array', items: { type: 'string' } },
            estimatedTime: { type: 'string' },
            assignee: { type: 'string' },
            metadata: { type: 'object' }
          }
        }
      },
      metadata: { type: 'object' }
    }
  },
  locales: todolistToolLocales
}

