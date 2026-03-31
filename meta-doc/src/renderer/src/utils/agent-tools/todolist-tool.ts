/**
 * 意图识别与任务划分Tool
 * 根据用户输入生成结构化的任务列表（TodoList）
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress
} from '../../types/agent-tool'
import type { AIDialogMessage } from '@/types'
import { createAiTask } from '../ai_tasks'
import { cancelAiTask } from '../ai_tasks'
import { ref } from 'vue'
import TodoListDisplay from './components/TodoListDisplay.vue'
import { createRendererLogger } from '../logger'
import { getPromptByKey } from '../prompts'
import { i18n } from '../../i18n'
import {
  parseJsonWithClean,
  isJsonParseError,
  createDetailedError,
  retryLLMCall
} from './tool-utils'
import { agentSessionManager } from '../agent-framework/agent-session-manager'
import type { AgentSession } from '../../types/agent-framework'

const logger = createRendererLogger('TodoListTool')

/**
 * 生成todolist的存储key
 * 格式：tabId-sessionId（如果tabId存在）或 sessionId（如果tabId不存在）
 * 这样确保同一个tab下的同一个session共享同一个todolist
 */
function getTodoListKey(session: AgentSession | undefined): string | null {
  if (!session) {
    return null
  }

  // 从publicContext中获取document.id（即tabId）
  const tabId = session.publicContext?.document?.id
  if (tabId) {
    return `todolist-${tabId}-${session.id}`
  }

  // 如果没有tabId，使用session.id作为fallback
  return `todolist-${session.id}`
}

/**
 * 从session中获取todolist（如果存在）
 * 使用tabId-sessionId作为key，确保同一个tab下的同一个session共享todolist
 */
function getTodoListFromSession(session: AgentSession | undefined): TodoList | null {
  try {
    if (!session) {
      logger.debug('[getTodoListFromSession] session为空')
      return null
    }

    const key = getTodoListKey(session)
    if (!key) {
      logger.warn('[getTodoListFromSession] 无法生成key')
      return null
    }

    // 调试信息：检查publicContext的结构
    // logger.debug('[getTodoListFromSession] 调试信息:', {
    //   sessionId: session.id,
    //   key,
    //   hasPublicContext: !!session.publicContext,
    //   hasCustom: !!session.publicContext?.custom,
    //   customKeys: session.publicContext?.custom ? Object.keys(session.publicContext.custom) : [],
    //   documentId: session.publicContext?.document?.id
    // })

    const todoList = agentSessionManager.readFromPublicContext(session, key) as TodoList | undefined
    if (todoList && typeof todoList === 'object' && 'items' in todoList) {
      logger.info(
        '[getTodoListFromSession] 从session中读取到todolist:',
        todoList.id,
        '任务数:',
        todoList.items?.length || 0,
        'key:',
        key
      )
      return todoList as TodoList
    }

    // logger.debug('[getTodoListFromSession] 未找到todolist，key:', key, 'readFromPublicContext返回:', todoList)
    return null
  } catch (error) {
    logger.warn('[getTodoListFromSession] 读取session todolist失败:', error)
    return null
  }
}

/**
 * 是否仍有未完成待办（pending / in_progress）。
 * 供 AutoGPT 等在「模型本轮未发出 tool_calls」时决定是否自动续跑一轮，避免只输出「接下来我要…」就 idle。
 */
export function sessionHasPendingTodoItems(session: AgentSession | undefined | null): boolean {
  const list = getTodoListFromSession(session || undefined)
  if (!list?.items?.length) return false
  return list.items.some((i) => i.status === 'pending' || i.status === 'in_progress')
}

/**
 * 保存todolist到session
 * 使用tabId-sessionId作为key，确保同一个tab下的同一个session共享todolist
 */
function saveTodoListToSession(session: AgentSession | undefined, todoList: TodoList): void {
  try {
    if (!session) {
      logger.debug('[saveTodoListToSession] 没有session，跳过保存')
      return
    }

    const key = getTodoListKey(session)
    if (!key) {
      logger.warn('[saveTodoListToSession] 无法生成key，跳过保存')
      return
    }

    // 调试信息：检查保存前的状态
    // logger.debug('[saveTodoListToSession] 保存前调试信息:', {
    //   sessionId: session.id,
    //   key,
    //   hasPublicContext: !!session.publicContext,
    //   hasCustom: !!session.publicContext?.custom,
    //   customKeysBefore: session.publicContext?.custom ? Object.keys(session.publicContext.custom) : [],
    //   documentId: session.publicContext?.document?.id
    // })

    agentSessionManager.writeToPublicContext(session, key, todoList)

    // 验证保存是否成功：立即读取一次，确保数据被正确保存
    const verifyValue = agentSessionManager.readFromPublicContext(session, key)
    if (!verifyValue) {
      logger.error('[saveTodoListToSession] 保存后验证失败：无法读取刚保存的值！', {
        sessionId: session.id,
        key,
        hasCustom: !!session.publicContext?.custom,
        customKeys: session.publicContext?.custom ? Object.keys(session.publicContext.custom) : []
      })
    }

    // 调试信息：检查保存后的状态
    // logger.debug('[saveTodoListToSession] 保存后调试信息:', {
    //   sessionId: session.id,
    //   key,
    //   hasCustom: !!session.publicContext?.custom,
    //   customKeysAfter: session.publicContext?.custom ? Object.keys(session.publicContext.custom) : [],
    //   savedValue: verifyValue ? '存在' : '不存在',
    //   verifySuccess: !!verifyValue
    // })

    logger.info(
      '[saveTodoListToSession] Todolist已保存到session:',
      session.id,
      '任务数:',
      todoList.items?.length || 0,
      'key:',
      key,
      '验证:',
      verifyValue ? '成功' : '失败'
    )
  } catch (error) {
    logger.warn('[saveTodoListToSession] 保存todolist到session失败:', error)
  }
}

/**
 * 更新todolist中的任务状态
 */
function updateTodoItemStatus(
  todoList: TodoList,
  itemId: string,
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
): boolean {
  const item = todoList.items.find((i) => i.id === itemId)
  if (!item) {
    logger.warn('[updateTodoItemStatus] 任务不存在:', itemId)
    return false
  }

  item.status = status
  todoList.updatedAt = new Date().toISOString()
  logger.info('[updateTodoItemStatus] 任务状态已更新:', itemId, '->', status)
  return true
}

/**
 * 将 markComplete 的输入解析为任务 ID 列表：支持 task-N 或按任务标题匹配（AI 常传标题而非 ID）
 */
function resolveMarkCompleteToTaskIds(todoList: TodoList, inputs: (string | boolean)[]): string[] {
  const result: string[] = []
  for (const input of inputs) {
    if (input === true || input === 'true') continue
    if (typeof input !== 'string') continue
    const s = input.trim()
    if (!s) continue
    // 已是 task-N 形式且存在于列表中
    if (/^task-\d+$/i.test(s)) {
      if (todoList.items.some((i) => i.id === s)) result.push(s)
      continue
    }
    // 按标题匹配：完全匹配或互相包含（AI 常传 "1. 分析开题报告..." 这类标题）
    const found = todoList.items.find(
      (i) =>
        (i.title && i.title.trim() === s) ||
        (i.title && s === i.title.trim()) ||
        (i.title && i.title.includes(s)) ||
        (i.title && s.includes(i.title.trim()))
    )
    if (found?.id) result.push(found.id)
  }
  return result
}

/**
 * TodoList JSON Schema定义
 * 简化设计：大多数字段都是可选的，只有title是必需的
 */
export interface TodoItem {
  id?: string // 可选，自动生成
  title: string // 必需
  description?: string
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled' // 可选，默认为pending
  priority?: 'low' | 'medium' | 'high' | 'urgent' // 可选
  dueDate?: string // ISO 8601格式，可选
  tags?: string[] // 可选
  dependencies?: string[] // 依赖的其他任务ID，可选
  estimatedTime?: string // 预估时间，如 "2h", "30m"，可选
  assignee?: string // 可选
  metadata?: Record<string, unknown> // 可选
}

/**
 * 灵活的TodoItem输入类型：可以是字符串或对象
 */
export type FlexibleTodoItem = string | TodoItem

/**
 * 灵活的TodoList输入类型：支持多种格式
 */
export interface FlexibleTodoListInput {
  items?: FlexibleTodoItem[] // 可以是字符串列表或混合列表
  title?: string
  description?: string
  id?: string
  createdAt?: string
  updatedAt?: string
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

const TODOLIST_INSTRUCTION_EN = `
# Intent Recognition & Task Planning Tool

## Description
Analyzes user's natural language input to recognize intent and decompose complex tasks into structured todo lists. Supports both automatic generation and manual creation modes.

## Usage Scenarios
- User proposes complex requirements that need to be broken down
- Project management, creating task lists
- Workflow planning
- Study plan creation

## Input Format

### Mode 1: Automatic Generation (using input parameter)
\`\`\`json
{
  "input": "string", // Required, user's natural language input
  "context": "string" // Optional, context information
}
\`\`\`

### Mode 2: Manual Creation (directly provide todoList) ⭐
\`\`\`json
{
  "todoList": {
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
}
\`\`\`

**Note**: Choose one of the two modes
- If \`todoList\` parameter is provided, the tool will use it directly (manual creation mode)
- If \`todoList\` is not provided, \`input\` parameter is required, and the tool will call LLM to generate a todo list (automatic generation mode)

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

## Usage Modes

### Automatic Generation Mode
Provide \`input\` parameter, and the tool will automatically analyze user intent and generate a todo list.

### Manual Creation Mode ⭐
Directly provide \`todoList\` object, and the tool will use it directly. Suitable for scenarios requiring precise control over the todo list structure.

## ⚠️ Only mark complete when the step actually succeeded (required)
**Use \`markComplete\` only when the tool run for that task clearly succeeded.**
- If the previous tool returned **error, failure, or exception** (e.g. "command syntax incorrect", "failed", "error", non-zero exit, error message), **do not** mark that task complete.
- Fix the command or parameters and retry, or report the failure to the user; otherwise one failed step leads to more failures.
- Check the tool result for that task: no error, no failure message, no syntax error — then call \`markComplete\`.

## Notes
1. **Choose one mode**: Either provide \`input\` (automatic generation) or \`items\` / \`todoList\` (manual creation).
2. **Keep tasks minimal**: When creating tasks, only include \`title\` (required) and optionally \`description\`. Do not add \`createdAt\`, \`updatedAt\`, \`metadata\`, \`dueDate\`, \`assignee\`, \`estimatedTime\` unless the user explicitly asks.
3. Tasks should be arranged in logical order.
4. **Batch mark complete (recommended)**: When multiple tasks are done, mark them in one call with an array, e.g. \`{"markComplete": ["task-1", "task-2", "task-3"]}\`, instead of calling the tool once per task. This saves tokens and reduces round-trips.
`

const TODOLIST_TOOL_NAME = 'Intent Recognition & Task Planning'
const TODOLIST_TOOL_DESCRIPTION =
  'Analyze user intent and decompose complex tasks into structured todo lists'

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
  // 从 locale_prompts 读取提示词模板
  const retryBlock =
    retryCount > 0 && lastError ? getPromptByKey('tools.todolist.retryBlock', { lastError }) : ''
  const contextStr = context ? `上下文信息：${context}` : ''
  const systemPrompt = getPromptByKey('tools.todolist.systemPrompt', {
    input,
    context: contextStr,
    retryBlock
  })

  const target = ref('')
  const originKey = `todolist-${Date.now()}-${Math.random().toString(36).slice(2)}`
  // 温度配置将在llm-api.js中从全局配置读取
  const messages: AIDialogMessage[] = [
    {
      role: 'user',
      content: systemPrompt
    }
  ]
  const { handle, done } = createAiTask(
    retryCount > 0
      ? `Regenerate task list (retry ${retryCount}/${maxRetries})`
      : 'Generate task list',
    messages,
    target,
    'chat',
    originKey,
    { stream: true }
  )

  // 立即通过 onUpdate 传递流式输出信息（在 await done 之前）
  if (onUpdate) {
    onUpdate(
      {
        content: {
          stage: retryCount > 0 ? 'retrying-streaming' : 'generating-streaming',
          input,
          context,
          retryCount,
          lastError,
          todoListTargetRef: target,
          todoListDonePromise: done
        },
        format: 'json'
      },
      {
        percentage: retryCount > 0 ? 40 + retryCount * 10 : 40,
        message:
          retryCount > 0
            ? i18n.global.t(
                'agent.tool.todolist.progress.retrying',
                `Retrying task list generation (${retryCount}/${maxRetries})... (streaming)`
              )
            : i18n.global.t(
                'agent.tool.todolist.progress.generating',
                'Generating task list... (streaming)'
              )
      }
    )
  }

  if (signal) {
    signal.addEventListener('abort', () => {
      cancelAiTask(handle, false)
    })
  }

  try {
    await done
  } catch (error) {
    // 如果任务被取消或出错，检查是否是因为取消
    if (signal?.aborted) {
      throw new Error('Operation cancelled')
    }
    // 重新抛出原始错误，让调用者知道任务失败
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('生成任务列表失败:', error)
    throw new Error(`AI task failed: ${errorMessage}`)
  }

  if (signal?.aborted) {
    throw new Error('Operation cancelled')
  }

  if (!target.value || target.value.trim() === '') {
    throw new Error(
      i18n.global.t('agent.tool.todolist.error.emptyResult', 'LLM returned empty result')
    )
  }

  // 尝试解析JSON（带清理）
  const parseResult = parseJsonWithClean<TodoList>(target.value)

  if (!parseResult.success || !parseResult.data) {
    const errorMessage = parseResult.error || 'JSON parse failed'
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
/**
 * 将灵活的输入格式转换为标准TodoItem；仅保留有值的字段，避免冗长的空字段和时间戳
 */
function normalizeTodoItem(item: FlexibleTodoItem, index: number): TodoItem {
  if (typeof item === 'string') {
    return { id: `task-${index + 1}`, title: item, status: 'pending' }
  }
  if (item && typeof item === 'object') {
    const base: TodoItem = {
      id: item.id || `task-${index + 1}`,
      title: item.title || `Task ${index + 1}`,
      status: item.status || 'pending'
    }
    if (item.description != null && item.description !== '') base.description = item.description
    if (item.priority != null) base.priority = item.priority
    if (item.dueDate != null && item.dueDate !== '') base.dueDate = item.dueDate
    if (item.tags != null && item.tags.length > 0) base.tags = item.tags
    if (item.dependencies != null && item.dependencies.length > 0)
      base.dependencies = item.dependencies
    if (item.estimatedTime != null && item.estimatedTime !== '')
      base.estimatedTime = item.estimatedTime
    if (item.assignee != null && item.assignee !== '') base.assignee = item.assignee
    if (item.metadata != null && Object.keys(item.metadata).length > 0)
      base.metadata = item.metadata
    return base
  }
  return { id: `task-${index + 1}`, title: `Task ${index + 1}`, status: 'pending' }
}

/**
 * 将灵活的输入转换为标准TodoList
 */
function normalizeTodoList(input: FlexibleTodoListInput | TodoList | FlexibleTodoItem[]): TodoList {
  const now = new Date().toISOString()

  // 如果输入是数组（字符串列表或混合列表），转换为TodoList格式
  if (Array.isArray(input)) {
    return {
      id: `todolist-${Date.now()}`,
      title: 'Task list',
      description: '',
      createdAt: now,
      updatedAt: now,
      items: input.map((item, index) => normalizeTodoItem(item, index)),
      metadata: {}
    }
  }

  // 如果输入是FlexibleTodoListInput或TodoList对象
  if (input && typeof input === 'object') {
    const items = input.items || []
    const normalizedItems = items.map((item, index) => normalizeTodoItem(item, index))

    return {
      id: input.id || `todolist-${Date.now()}`,
      title: input.title || 'Task list',
      description: input.description,
      createdAt: input.createdAt || (input as TodoList).createdAt || now,
      updatedAt: input.updatedAt || (input as TodoList).updatedAt || now,
      items: normalizedItems,
      metadata: input.metadata || {}
    }
  }

  // Invalid input, return empty list
  return {
    id: `todolist-${Date.now()}`,
    title: 'Task list',
    description: '',
    createdAt: now,
    updatedAt: now,
    items: [],
    metadata: {}
  }
}

/** 给 LLM 的简短结果，避免长 JSON 并明确提示勿重复调用，减少 agent 反复调用 todolist */
function buildShortResultForLlm(todoList: TodoList | null): string {
  if (!todoList || !todoList.items?.length) {
    return 'TodoList operation succeeded. Do not call todolist again this turn unless the user explicitly asks to change the plan.'
  }
  const n = todoList.items.length
  const completed = todoList.items.filter((i) => i.status === 'completed').length
  const preview = todoList.items
    .slice(0, 3)
    .map((i) => i.title)
    .join(', ')
  const suffix = n > 3 ? ` ... (${n} total, ${completed} completed)` : ` (${completed} completed)`
  return `TodoList updated: ${preview}${suffix}. Do not call this tool again in this turn unless the user asks to change the plan or you have just finished a task and need to mark it complete.`
}

const todolistToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const input = params.input as string
  const context = params.context as string | undefined
  const todoList = params.todoList as
    | TodoList
    | FlexibleTodoListInput
    | FlexibleTodoItem[]
    | undefined
  const items = params.items as FlexibleTodoItem[] | undefined // 支持直接传入items数组
  const session = params._session as AgentSession | undefined // 从agent-engine-executor自动注入
  const updateStatus = params.updateStatus as
    | { itemId: string; status: 'pending' | 'in_progress' | 'completed' | 'cancelled' }
    | undefined // 更新任务状态
  const markComplete = params.markComplete as string | string[] | boolean | undefined // 标记任务为完成（任务ID、ID数组、或true/"true"自动标记下一个）

  // 调试：检查session是否被正确传递
  // logger.info('[todolistToolCallback] 开始执行，参数检查:', {
  //   hasSession: !!session,
  //   sessionId: session?.id,
  //   hasInput: !!input,
  //   hasItems: !!items,
  //   hasTodoList: !!todoList,
  //   hasMarkComplete: !!markComplete,
  //   hasUpdateStatus: !!updateStatus,
  //   allParams: Object.keys(params)
  // })

  // 首先尝试从session中读取现有的todolist（使用新的key逻辑：tabId-sessionId）
  let existingTodoList: TodoList | null = null
  if (session) {
    const key = getTodoListKey(session)
    // logger.debug('[todolistToolCallback] 准备读取todolist，key:', key)
    existingTodoList = getTodoListFromSession(session)
    if (existingTodoList) {
      logger.info(
        '[todolistToolCallback] 从session中读取到现有todolist，任务数:',
        existingTodoList.items.length,
        'key:',
        key
      )
    } else {
      logger.debug('[todolistToolCallback] 当前tab和session下没有todolist，key:', key)
    }
  } else {
    logger.warn(
      '[todolistToolCallback] ⚠️ session为空！无法读取或保存todolist。params._session:',
      params._session
    )
  }

  // 如果提供了updateStatus，更新任务状态
  if (updateStatus) {
    if (!existingTodoList) {
      return {
        status: 'failed',
        error: createDetailedError(
          'Cannot update status: no task list in current session. Create a task list first.',
          [
            '{"items": ["Task 1", "Task 2", "Task 3"]}  // Create list first',
            '{"updateStatus": {"itemId": "task-1", "status": "completed"}}  // Then update'
          ],
          [
            'Create a task list first using the todolist tool',
            'Then use updateStatus to update task status',
            'Task ID must exist in the current task list'
          ]
        )
      }
    }
    const updated = updateTodoItemStatus(existingTodoList, updateStatus.itemId, updateStatus.status)
    if (updated) {
      saveTodoListToSession(session, existingTodoList)
      return {
        status: 'succeeded',
        data: {
          content: {
            stage: 'completed',
            todoList: existingTodoList
          },
          format: 'json',
          componentName: 'TodoListDisplay'
        },
        result: buildShortResultForLlm(existingTodoList)
      }
    } else {
      return {
        status: 'failed',
        error: createDetailedError(
          `Cannot update status: task ID "${updateStatus.itemId}" not found in current task list`,
          [
            `{"updateStatus": {"itemId": "task-1", "status": "completed"}}  // Use valid task ID`,
            '{}  // View current task list to confirm task IDs'
          ],
          [
            'Task ID must match an existing task in the list',
            'Use empty {} to view the current task list',
            'Task IDs are usually "task-1", "task-2", etc.'
          ]
        )
      }
    }
  }

  // 如果提供了markComplete，标记任务为完成
  if (markComplete) {
    if (!existingTodoList) {
      return {
        status: 'failed',
        error: createDetailedError(
          'Cannot mark complete: no task list in current session. Create a task list first.',
          [
            '{"items": ["Task 1", "Task 2", "Task 3"]}  // Create list first',
            '{"markComplete": "task-1"}  // Then mark complete'
          ],
          [
            'Create a task list first using the todolist tool',
            'Then use markComplete to mark tasks complete',
            'Task ID must exist in the current task list'
          ]
        )
      }
    }

    // 特殊处理：如果markComplete是"true"字符串或布尔值true，标记最后一条已完成任务的下一条任务
    const isAutoMark = markComplete === 'true' || markComplete === true
    if (isAutoMark) {
      // 找到最后一条已完成的任务
      let lastCompletedIndex = -1
      for (let i = existingTodoList.items.length - 1; i >= 0; i--) {
        if (existingTodoList.items[i].status === 'completed') {
          lastCompletedIndex = i
          break
        }
      }

      // 如果找到了已完成的任务，且还有下一条任务，标记下一条为完成
      if (lastCompletedIndex >= 0 && lastCompletedIndex < existingTodoList.items.length - 1) {
        const nextItem = existingTodoList.items[lastCompletedIndex + 1]
        if (updateTodoItemStatus(existingTodoList, nextItem.id!, 'completed')) {
          saveTodoListToSession(session, existingTodoList)
          return {
            status: 'succeeded',
            data: {
              content: {
                stage: 'completed',
                todoList: existingTodoList
              },
              format: 'json',
              componentName: 'TodoListDisplay'
            },
            result: buildShortResultForLlm(existingTodoList)
          }
        }
      } else if (lastCompletedIndex === -1) {
        // 没有已完成的任务，标记第一条为完成
        if (existingTodoList.items.length > 0) {
          const firstItem = existingTodoList.items[0]
          if (updateTodoItemStatus(existingTodoList, firstItem.id!, 'completed')) {
            saveTodoListToSession(session, existingTodoList)
            return {
              status: 'succeeded',
              data: {
                content: {
                  stage: 'completed',
                  todoList: existingTodoList
                },
                format: 'json',
                componentName: 'TodoListDisplay'
              },
              result: buildShortResultForLlm(existingTodoList)
            }
          }
        }
      } else {
        // 最后一条任务已完成，没有下一条任务
        return {
          status: 'failed',
          error: createDetailedError(
            'Cannot mark complete: all tasks are already completed; no next task to mark',
            [
              '{"markComplete": "true"}  // Only marks the next incomplete task',
              '{}  // View current task list status'
            ],
            [
              'When all tasks are done, markComplete: "true" has no effect',
              'Use markComplete: "task-id" to mark a specific task'
            ]
          )
        }
      }
    }

    // 普通处理：markComplete 支持任务 ID（task-N）或任务标题（按标题匹配，避免 AI 传标题导致失败）
    const rawInputs = Array.isArray(markComplete) ? markComplete : [markComplete]
    const resolvedIds = resolveMarkCompleteToTaskIds(
      existingTodoList,
      rawInputs.filter((x) => x !== 'true' && x !== true)
    )
    let anyUpdated = false
    const notFoundIds: string[] = []
    for (const itemId of resolvedIds) {
      if (updateTodoItemStatus(existingTodoList, itemId, 'completed')) {
        anyUpdated = true
      } else {
        notFoundIds.push(itemId)
      }
    }
    if (anyUpdated) {
      saveTodoListToSession(session, existingTodoList)
      if (notFoundIds.length > 0) {
        logger.warn('[todolistToolCallback] 部分任务ID未找到:', notFoundIds)
      }
      return {
        status: 'succeeded',
        data: {
          content: {
            stage: 'completed',
            todoList: existingTodoList
          },
          format: 'json',
          componentName: 'TodoListDisplay'
        },
        result: buildShortResultForLlm(existingTodoList)
      }
    } else {
      const displayInputs = rawInputs.filter((x) => x !== 'true' && x !== true)
      return {
        status: 'failed',
        error: createDetailedError(
          `Cannot mark complete: ${displayInputs.length ? `"${displayInputs.join(', ')}"` : 'task ID'} did not match any task in the list (use task-1 or task title)`,
          [
            `{"markComplete": "task-1"} or by title {"markComplete": ["1. Analyze proposal..."]}`,
            '{"markComplete": "true"}  // Or use true to mark next task',
            '{}  // View current task list to confirm IDs or titles'
          ],
          [
            'Task ID (task-1) or task title must match an item in the list',
            'Use empty {} to view the current task list',
            'Or use "true" to auto-mark the next incomplete task'
          ]
        )
      }
    }
  }

  // 优先级：items > todoList > input（自动生成）

  // 方式1：直接传入items数组（最简化的方式）
  if (items && Array.isArray(items)) {
    try {
      let normalized: TodoList

      // 如果session中已有todolist，合并新任务
      if (existingTodoList) {
        logger.info('[todolistToolCallback] 合并新任务到现有todolist')
        const newItems = items.map((item, index) =>
          normalizeTodoItem(item, existingTodoList.items.length + index)
        )
        normalized = {
          ...existingTodoList,
          items: [...existingTodoList.items, ...newItems],
          updatedAt: new Date().toISOString()
        }
      } else {
        normalized = normalizeTodoList(items)
      }

      // 保存到session
      if (session) {
        saveTodoListToSession(session, normalized)
      }

      onUpdate(
        {
          content: {
            stage: 'completed',
            todoList: normalized
          },
          format: 'json',
          componentName: 'TodoListDisplay'
        },
        {
          percentage: 100,
          message: i18n.global.t('agent.tool.todolist.progress.completed', 'Task list created')
        }
      )

      return {
        status: 'succeeded',
        data: {
          content: {
            stage: 'completed',
            todoList: normalized
          },
          format: 'json',
          componentName: 'TodoListDisplay'
        },
        result: buildShortResultForLlm(normalized)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('创建TodoList失败:', error)
      return {
        status: 'failed',
        error: createDetailedError(
          `Failed to create task list: ${errorMessage}`,
          [
            '{"items": ["Task 1", "Task 2", "Task 3"]}',
            '{"items": ["Task 1", {"title": "Task 2", "tags": ["important"]}]}',
            'Ensure items is an array'
          ],
          [
            'items can be string array or mixed (strings + objects)',
            'Each object only needs title; other fields are optional'
          ]
        )
      }
    }
  }

  // 方式2：传入todoList对象或FlexibleTodoListInput（手动创建模式）
  // 或者todoList本身就是数组（FlexibleTodoItem[]）
  if (todoList) {
    try {
      let normalized: TodoList

      // 如果todoList是数组，直接标准化
      if (Array.isArray(todoList)) {
        // 如果session中已有todolist，合并新任务
        if (existingTodoList) {
          logger.info('[todolistToolCallback] 合并新任务到现有todolist')
          const newItems = todoList.map((item, index) =>
            normalizeTodoItem(item, existingTodoList.items.length + index)
          )
          normalized = {
            ...existingTodoList,
            items: [...existingTodoList.items, ...newItems],
            updatedAt: new Date().toISOString()
          }
        } else {
          normalized = normalizeTodoList(todoList)
        }
      } else if (typeof todoList === 'object') {
        // 如果是对象，检查是否有id字段，如果有且与session中的id相同，则更新
        const inputTodoList = todoList as TodoList | FlexibleTodoListInput
        if ('id' in inputTodoList && existingTodoList && inputTodoList.id === existingTodoList.id) {
          logger.info('[todolistToolCallback] 更新现有todolist')
          // 更新现有todolist
          normalized = {
            ...existingTodoList,
            ...normalizeTodoList(inputTodoList),
            id: existingTodoList.id, // 保持原有ID
            createdAt: existingTodoList.createdAt, // 保持原有创建时间
            updatedAt: new Date().toISOString()
          }
        } else {
          normalized = normalizeTodoList(inputTodoList)
        }
      } else {
        throw new Error('todoList must be an array or object')
      }

      // 保存到session
      if (session) {
        saveTodoListToSession(session, normalized)
      }

      onUpdate(
        {
          content: {
            stage: 'completed',
            todoList: normalized
          },
          format: 'json',
          componentName: 'TodoListDisplay'
        },
        {
          percentage: 100,
          message: i18n.global.t('agent.tool.todolist.progress.completed', 'Task list created')
        }
      )

      return {
        status: 'succeeded',
        data: {
          content: {
            stage: 'completed',
            todoList: normalized
          },
          format: 'json',
          componentName: 'TodoListDisplay'
        },
        result: buildShortResultForLlm(normalized)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('手动创建TodoList失败:', error)
      return {
        status: 'failed',
        error: createDetailedError(
          `Failed to create task list: ${errorMessage}`,
          [
            '{"items": ["Task 1", "Task 2", "Task 3"]}  // Simple string list',
            '{"items": ["Task 1", {"title": "Task 2", "tags": ["important"]}]}  // Mixed list',
            '{"todoList": {"items": ["Task 1", "Task 2"]}}  // Full object'
          ],
          [
            'Supported: string array, mixed (strings + objects), or full todoList object',
            'Each task object only needs title; other fields optional',
            'Strings are auto-converted to task objects (title=string content)'
          ]
        )
      }
    }
  }

  // 如果没有提供items或todoList，检查是否只是查看现有todolist
  // 注意：如果提供了markComplete或updateStatus，已经在上面处理了，不会走到这里
  if (!input && !items && !todoList && !markComplete && !updateStatus) {
    // 如果session中有todolist，直接返回（使用新的key逻辑自动识别当前tab和session）
    if (existingTodoList) {
      logger.info(
        '[todolistToolCallback] 返回session中的现有todolist（使用key:',
        getTodoListKey(session),
        ')'
      )
      return {
        status: 'succeeded',
        data: {
          content: {
            stage: 'completed',
            todoList: existingTodoList
          },
          format: 'json',
          componentName: 'TodoListDisplay'
        },
        result: buildShortResultForLlm(existingTodoList)
      }
    }
    // 如果没有todolist，返回友好的提示信息（而不是错误）
    // 说明当前tab和session下还没有任务列表，需要先创建
    const key = getTodoListKey(session)
    logger.info(
      '[todolistToolCallback] 当前tab和session下没有todolist（key:',
      key,
      '），返回提示信息'
    )
    return {
      status: 'succeeded',
      data: {
        content: {
          stage: 'empty',
          message: 'No task list in this session yet. Create a task list first.',
          todoList: null
        },
        format: 'json',
        componentName: 'TodoListDisplay'
      },
      result:
        'No todo list in this session yet. Do not call todolist again unless the user explicitly asks to create a task list or plan.'
    }
  }

  // 如果没有提供items或todoList，使用input生成（自动生成模式）
  // 注意：如果提供了markComplete或updateStatus，已经在上面处理了，不会走到这里
  if (!items && !todoList && (!input || typeof input !== 'string')) {
    // 如果已经处理了markComplete或updateStatus，不应该走到这里
    // 但为了安全起见，再次检查
    if (markComplete || updateStatus) {
      // 这种情况不应该发生，因为已经在上面处理了
      logger.error('[todolistToolCallback] 逻辑错误：markComplete或updateStatus应该已经处理')
      return {
        status: 'failed',
        error: createDetailedError('Internal error: status update failed', [], ['Please retry'])
      }
    }
    return {
      status: 'failed',
      error: createDetailedError(
        'Missing required parameter: provide one of input (for LLM-generated list), items (string array), or todoList (manual object)',
        [
          '{"input": "Write an article about AI"}  // Mode 1: auto-generate',
          '{"items": ["Task 1", "Task 2", "Task 3"]}  // Mode 2: string list',
          '{"items": ["Task 1", {"title": "Task 2", "tags": ["important"]}]}  // Mode 3: mixed',
          '{"todoList": {"items": ["Task 1", "Task 2"]}}  // Mode 4: full object'
        ],
        [
          'Mode 1: use input, tool will analyze and generate task list',
          'Mode 2: pass items array (strings)',
          'Mode 3: mixed list (strings and objects)',
          'Mode 4: full todoList object',
          'If items or todoList is provided, input can be omitted'
        ]
      )
    }
  }

  try {
    onUpdate(
      {
        content: {
          stage: 'analyzing',
          input,
          context
        },
        format: 'json'
      },
      {
        percentage: 10,
        message: i18n.global.t('agent.tool.todolist.progress.analyzing', 'Analyzing user intent...')
      }
    )

    // 调用LLM生成TodoList（带自动重试）
    let todoList: TodoList
    try {
      // 使用retryLLMCall包装，处理返回空的情况
      todoList = await retryLLMCall(
        () => generateTodoListWithLLM(input, context, signal, onUpdate),
        {
          maxRetries: 3,
          retryDelay: 3000,
          onRetry: (attempt, error) => {
            logger.warn(`[todolist-tool] LLM返回空，正在重试 (${attempt}/3)...`, error)
          }
        }
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('生成TodoList失败:', error)
      return {
        status: 'failed',
        error: createDetailedError(
          `Failed to parse task list JSON: ${errorMessage}`,
          [
            '{"input": "Write an article"}',
            '{"input": "Create a todo management system"}',
            'Ensure input is a valid string'
          ],
          [
            'Tool calls LLM to analyze input and generate task list',
            'If JSON parse fails, check LLM response format',
            'Try a clearer input description',
            'Adding context may improve results'
          ]
        )
      }
    }

    // 验证基本结构
    if (!todoList.items || !Array.isArray(todoList.items)) {
      return {
        status: 'failed',
        error: createDetailedError(
          'Invalid task list structure: missing items array',
          [
            'Expected JSON with items array',
            'Example: {"items": [{"id": "1", "title": "Task 1", "status": "pending"}]}'
          ],
          [
            'Task list must include items array; each element is a task',
            'Each task should have id, title, status, etc.',
            'Tool will retry automatically on generation failure'
          ]
        )
      }
    }

    // 确保必要字段存在
    if (!todoList.id) {
      todoList.id = `todolist-${Date.now()}`
    }
    if (!todoList.title) {
      todoList.title = 'Task list'
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

    // 保存到session
    if (session) {
      saveTodoListToSession(session, todoList)
    }

    onUpdate(
      {
        content: {
          stage: 'completed',
          todoList
        },
        format: 'json',
        componentName: 'TodoListDisplay'
      },
      {
        percentage: 100,
        message: i18n.global.t('agent.tool.todolist.progress.completed', 'Task list generated')
      }
    )

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
      result: buildShortResultForLlm(todoList)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('TodoList生成失败:', error)
    return {
      status: 'failed',
      error: createDetailedError(
        `Failed to generate task list: ${errorMessage}`,
        [
          '{"input": "Write an article for me"}',
          '{"input": "Create a todo management system", "context": "Include frontend and backend"}',
          'Ensure input is a valid string'
        ],
        [
          'Check that input is provided correctly',
          'Ensure LLM service is available and configured',
          'Try a clearer input description',
          'Adding context may improve the generated task list'
        ]
      )
    }
  }
}

export const todolistToolConfig: AgentToolConfig = {
  id: 'todolist-planning',
  name: TODOLIST_TOOL_NAME,
  description: TODOLIST_TOOL_DESCRIPTION,
  origin: 'internal',
  spec: {
    name: 'todolist-planning',
    brief:
      'Only when user explicitly asks for a task list, plan, or breakdown (e.g. "make a plan", "task list", "break down tasks"). Do not use for general writing, editing, or document generation.',
    fullSpec: `# Intent Recognition & Task Planning Tool

## Description
Analyzes user's natural language input to recognize intent and decompose complex tasks into structured todo lists. Supports both automatic generation and manual creation modes.

## Usage Scenarios
- User proposes complex requirements that need to be broken down
- Project management, creating task lists
- Workflow planning
- Study plan creation

## Input Format

### Mode 1: Automatic Generation (using input parameter)
\`\`\`json
{
  "input": "string", // Required, user's natural language input
  "context": "string" // Optional, context information
}
\`\`\`

### Mode 2: Manual Creation (directly provide todoList)
\`\`\`json
{
  "todoList": {
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
}
\`\`\`

## Output Format
Returns the created or updated todo list with all items and their status.

## Important: When to Call This Tool
- **Call only when necessary.** Typical usage: (1) Once to create or update the task list when the user asks for a plan or breakdown. (2) Once to mark a task as completed when you have actually finished that task.
- **Do NOT** call repeatedly for the same purpose, or to poll status, or to "refresh" the list. Prefer a single call per logical action.`
  },
  instruction: TODOLIST_INSTRUCTION_EN,
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
        description: 'Natural language input describing tasks or goals (auto-generate mode)'
      },
      context: {
        type: 'string',
        description: 'Optional context to better understand user intent'
      },
      items: {
        type: 'array',
        description:
          'Task list: string array or mixed (strings + objects). Items may be strings or objects.',
        items: {}
      },
      todoList: {
        type: 'object',
        description:
          'Manually created task list object; if items or todoList provided, input can be omitted'
      },
      markComplete: {
        description:
          'Mark task(s) complete: task ID string, array of task IDs, boolean true to mark next after last completed, or string "true".'
      },
      updateStatus: {
        type: 'object',
        description:
          'Update task status: itemId (task ID) and status (pending|in_progress|completed|cancelled)',
        properties: {
          itemId: {
            type: 'string',
            description: 'Task ID to update'
          },
          status: {
            type: 'string',
            description: 'New status: pending | in_progress | completed | cancelled'
          }
        },
        required: ['itemId', 'status']
      }
    }
  },
  outputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Task list unique ID' },
      title: { type: 'string', description: 'Task list title' },
      description: { type: 'string', description: 'Task list description' },
      createdAt: { type: 'string', description: 'Created at (ISO 8601)' },
      updatedAt: { type: 'string', description: 'Updated at (ISO 8601)' },
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
  }
}
