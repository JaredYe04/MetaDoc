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

### 方式1：自动生成模式（使用input参数）
\`\`\`json
{
  "input": "string", // 用户的自然语言输入，工具会分析并生成任务列表
  "context": "string" // 可选，上下文信息
}
\`\`\`

### 方式2：字符串列表（最简单）⭐ 推荐
直接传入任务标题的字符串列表，工具会自动转换为任务列表：
\`\`\`json
{
  "items": ["任务1", "任务2", "任务3"]
}
\`\`\`

### 方式3：混合列表（灵活）⭐ 推荐
列表中可以混合使用字符串和对象，字符串会被自动转换为任务，对象可以包含额外信息：
\`\`\`json
{
  "items": [
    "任务1",
    {
      "title": "任务2",
      "description": "这是任务2的描述",
      "tags": ["重要", "紧急"]
    },
    "任务3",
    {
      "title": "任务4",
      "dependencies": ["task-1", "task-2"],
      "priority": "high"
    }
  ]
}
\`\`\`

### 方式4：完整对象模式（高级）
提供完整的TodoList对象，支持所有字段：
\`\`\`json
{
  "todoList": {
    "title": "任务列表标题",
    "items": [
      {
        "title": "任务1",
        "description": "任务描述",
        "status": "pending",
        "priority": "high",
        "tags": ["重要"],
        "dependencies": []
      }
    ]
  }
}
\`\`\`

**注意**：以上方式任选一种
- **推荐使用方式2或方式3**：简洁灵活，只需提供任务标题即可
- **字段说明**：大多数字段都是可选的（priority、tags、status、dependencies等），只有title是必需的
- 字符串会被自动转换为任务对象，id和status会自动生成

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

## 使用方式

### 自动生成模式
提供 \`input\` 参数，工具会自动分析用户意图并生成任务列表。

### 手动创建模式 ⭐ 推荐（更灵活）
支持多种简化格式，**推荐使用字符串列表或混合列表**：

**最简单的用法**（仅字符串列表）：
\`\`\`json
{"items": ["任务1", "任务2", "任务3"]}
\`\`\`

**灵活的用法**（混合列表，部分任务有额外信息）：
\`\`\`json
{
  "items": [
    "任务1",
    {"title": "任务2", "tags": ["重要"]},
    "任务3"
  ]
}
\`\`\`

## 字段说明（简化设计）

任务对象的字段**大多是可选的**，只有 \`title\` 是必需的：
- **必需**：\`title\`（任务标题）
- **可选**：\`description\`、\`status\`、\`priority\`、\`tags\`、\`dependencies\`、\`dueDate\`、\`estimatedTime\`、\`assignee\` 等

如果未提供，系统会自动生成默认值（如id自动生成，status默认为"pending"）。

### 方式5：查看现有任务列表 ⭐ 新功能
如果当前Agent会话中已有任务列表，可以直接查看（不提供任何参数）：
\`\`\`json
{}  // 返回当前会话中的任务列表
\`\`\`

### 方式6：更新任务状态 ⭐ 新功能（类似Cursor）
标记任务为完成或其他状态：

**标记单个任务为完成**：
\`\`\`json
{
  "markComplete": "task-1"  // 标记指定任务ID为完成
}
\`\`\`

**标记多个任务为完成**：
\`\`\`json
{
  "markComplete": ["task-1", "task-2"]  // 标记多个任务为完成
}
\`\`\`

**自动标记下一个任务为完成** ⭐ 推荐：
\`\`\`json
{
  "markComplete": "true"  // 自动找到最后一条已完成的任务，将下一条任务标记为完成
}
\`\`\`
例如：如果任务2已完成，调用 \`{"markComplete": "true"}\` 会将任务3标记为完成。如果没有已完成的任务，会标记第一条任务为完成。

**更新任务状态**：
\`\`\`json
{
  "updateStatus": {
    "itemId": "task-1",
    "status": "completed"  // pending | in_progress | completed | cancelled
  }
}
\`\`\`

## ⚠️ 标记完成前必须确认执行成功（必读）
**只有在上一步工具明确执行成功时，才可使用 \`markComplete\` 标记该项任务完成。**
- 若上一步工具返回了**错误、失败或异常**（例如「命令语法不正确」「failed」「error」、非零退出码、报错信息等），**不得**标记该任务为完成。
- 应先根据报错修正命令或参数后重试，或向用户说明失败原因；否则会导致一步错步步错。
- 确认方式：查看该任务对应工具调用的返回内容，无报错、无失败提示、无语法错误提示，再调用 \`markComplete\`。

## ⚠️ 重要：会话内状态管理 ⭐ 新功能
**todolist工具支持在同一个Agent会话中维护统一的任务列表状态：**
- **自动保存**：每次创建或更新任务列表时，会自动保存到当前Agent会话中
- **自动合并**：如果会话中已有任务列表，新添加的任务会自动合并到现有列表中
- **状态持久化**：任务状态（pending、in_progress、completed等）会在会话中持久保存
- **多次调用**：可以在同一个会话中多次调用todolist工具，查看进度、添加任务、更新状态
- **查看进度**：不提供任何参数时，会返回当前会话中的任务列表，可以查看哪些任务已完成、哪些待完成

**使用示例**：
1. 第一次调用：创建任务列表
   \`\`\`json
   {"items": ["任务1", "任务2", "任务3"]}
   \`\`\`
2. 执行任务1后，标记为完成（方式1：指定任务ID）：
   \`\`\`json
   {"markComplete": "task-1"}
   \`\`\`
   或（方式2：自动标记下一个）⭐ 推荐：
   \`\`\`json
   {"markComplete": "true"}  // 自动标记下一个未完成的任务
   \`\`\`
3. 查看当前进度：
   \`\`\`json
   {}
   \`\`\`
4. 添加新任务：
   \`\`\`json
   {"items": ["任务4"]}
   \`\`\`

## 注意事项
1. **多种输入方式**：可以使用 \`input\`（自动生成）、\`items\`（字符串/混合列表）或 \`todoList\`（完整对象）
2. **推荐使用简化格式**：字符串列表或混合列表，简洁高效
3. **会话内状态管理**：工具会自动在Agent会话中维护任务列表状态，支持多次调用和状态更新
4. 任务应该按照逻辑顺序排列
5. 如果任务之间有依赖关系，可以在dependencies中标注（可选）
6. priority、tags、status等字段都是可选的，根据需要添加
7. **字符串会自动转换**：列表中的字符串会自动转换为任务对象（title=字符串内容）
8. **状态更新**：使用 \`markComplete\` 或 \`updateStatus\` 可以更新任务状态，类似Cursor的任务管理
9. **自动标记下一个任务**：使用 \`{"markComplete": "true"}\` 可以自动找到最后一条已完成的任务，将下一条任务标记为完成，非常适合按顺序完成任务
10. **⭐ 批量标记完成（推荐）**：当多个任务已完成时，应**一次性**用数组标记，例如 \`{"markComplete": ["task-1", "task-2", "task-3"]}\`，而不要多次单独调用 \`{"markComplete": "task-1"}\`。批量标记可减少请求次数、节省 token，并提高效率。
`
  },
  en_us: {
    name: 'Intent Recognition & Task Planning',
    description: 'Analyze user intent and decompose complex tasks into structured todo lists',
    instruction: `
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
1. **Choose one mode**: Either provide \`input\` (automatic generation) or \`todoList\` (manual creation)
2. Tasks should be arranged in logical order
3. If tasks have dependencies, mark them in dependencies
4. Priority settings should be reasonable
5. Estimated time should be as accurate as possible
6. When manually creating, must provide complete TodoList object structure, including items array
7. **Batch mark complete (recommended)**: When multiple tasks are done, mark them in one call with an array, e.g. \`{"markComplete": ["task-1", "task-2", "task-3"]}\`, instead of calling the tool once per task. This saves tokens and reduces round-trips.
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
  // 从 locale_prompts 读取提示词模板
  const retryBlock =
    retryCount > 0 && lastError
      ? getPromptByKey('tools.todolist.retryBlock', { lastError })
      : ''
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
    retryCount > 0 ? `重新生成任务列表（重试 ${retryCount}/${maxRetries}）` : '生成任务列表',
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
                `正在重试生成任务列表（${retryCount}/${maxRetries}）...（流式输出）`
              )
            : i18n.global.t(
                'agent.tool.todolist.progress.generating',
                '正在生成任务列表...（流式输出）'
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
      throw new Error('操作已取消')
    }
    // 重新抛出原始错误，让调用者知道任务失败
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('生成任务列表失败:', error)
    throw new Error(`AI任务失败: ${errorMessage}`)
  }

  if (signal?.aborted) {
    throw new Error('操作已取消')
  }

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
/**
 * 将灵活的输入格式转换为标准TodoItem
 */
function normalizeTodoItem(item: FlexibleTodoItem, index: number): TodoItem {
  if (typeof item === 'string') {
    // 如果是字符串，直接作为title
    return {
      id: `task-${index + 1}`,
      title: item,
      status: 'pending'
    }
  } else if (item && typeof item === 'object') {
    // 如果是对象，保留已有字段，补充缺失字段
    return {
      id: item.id || `task-${index + 1}`,
      title: item.title || `任务 ${index + 1}`, // title必需，如果没有则生成
      description: item.description,
      status: item.status || 'pending',
      priority: item.priority,
      dueDate: item.dueDate,
      tags: item.tags,
      dependencies: item.dependencies,
      estimatedTime: item.estimatedTime,
      assignee: item.assignee,
      metadata: item.metadata
    }
  } else {
    // 无效格式，返回默认值
    return {
      id: `task-${index + 1}`,
      title: `任务 ${index + 1}`,
      status: 'pending'
    }
  }
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
      title: '任务列表',
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
      title: input.title || '任务列表',
      description: input.description,
      createdAt: input.createdAt || (input as TodoList).createdAt || now,
      updatedAt: input.updatedAt || (input as TodoList).updatedAt || now,
      items: normalizedItems,
      metadata: input.metadata || {}
    }
  }

  // 无效输入，返回空列表
  return {
    id: `todolist-${Date.now()}`,
    title: '任务列表',
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
  const preview = todoList.items.slice(0, 3).map((i) => i.title).join(', ')
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
          '无法更新任务状态：当前会话中还没有任务列表。请先创建任务列表。',
          [
            '{"items": ["任务1", "任务2", "任务3"]}  // 先创建任务列表',
            '{"updateStatus": {"itemId": "task-1", "status": "completed"}}  // 然后更新状态'
          ],
          [
            '需要先使用todolist工具创建任务列表',
            '然后才能使用updateStatus更新任务状态',
            '任务ID必须存在于任务列表中'
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
          `无法更新任务状态：任务ID "${updateStatus.itemId}" 不存在于当前任务列表中`,
          [
            `{"updateStatus": {"itemId": "task-1", "status": "completed"}}  // 确保任务ID正确`,
            '{}  // 先查看当前任务列表，确认任务ID'
          ],
          [
            '任务ID必须与任务列表中的任务ID匹配',
            '可以使用空参数 {} 查看当前任务列表',
            '任务ID格式通常是 "task-1", "task-2" 等'
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
          '无法标记任务为完成：当前会话中还没有任务列表。请先创建任务列表。',
          [
            '{"items": ["任务1", "任务2", "任务3"]}  // 先创建任务列表',
            '{"markComplete": "task-1"}  // 然后标记任务为完成'
          ],
          [
            '需要先使用todolist工具创建任务列表',
            '然后才能使用markComplete标记任务为完成',
            '任务ID必须存在于任务列表中'
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
            '无法标记任务为完成：所有任务都已完成，没有下一个任务可以标记',
            [
              '{"markComplete": "true"}  // 只能标记下一个未完成的任务',
              '{}  // 查看当前任务列表状态'
            ],
            [
              '所有任务都已完成时，无法使用 markComplete: "true"',
              '可以使用 markComplete: "task-id" 来标记特定任务'
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
          `无法标记任务为完成：${displayInputs.length ? `"${displayInputs.join(', ')}"` : '任务ID'} 无法匹配到当前任务列表（支持 task-1 或任务标题）`,
          [
            `{"markComplete": "task-1"} 或按任务标题 {"markComplete": ["1. 分析开题报告..."]}`,
            '{"markComplete": "true"}  // 或使用true标记下一个任务',
            '{}  // 先查看当前任务列表，确认任务ID或标题'
          ],
          [
            '任务ID（task-1）或任务标题必须与任务列表中的项匹配',
            '可以使用空参数 {} 查看当前任务列表',
            '或使用 "true" 自动标记下一个未完成的任务'
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
          message: i18n.global.t('agent.tool.todolist.progress.completed', '任务列表创建完成')
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
          `创建任务列表失败: ${errorMessage}`,
          [
            '{"items": ["任务1", "任务2", "任务3"]}',
            '{"items": ["任务1", {"title": "任务2", "tags": ["重要"]}]}',
            '确保items是数组'
          ],
          [
            'items可以是字符串数组，也可以是混合数组（字符串+对象）',
            '每个对象只需要包含title字段，其他字段都是可选的'
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
        throw new Error('todoList参数格式无效，必须是数组或对象')
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
          message: i18n.global.t('agent.tool.todolist.progress.completed', '任务列表创建完成')
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
          `创建任务列表失败: ${errorMessage}`,
          [
            '{"items": ["任务1", "任务2", "任务3"]}  // 最简单的字符串列表',
            '{"items": ["任务1", {"title": "任务2", "tags": ["重要"]}]}  // 混合列表',
            '{"todoList": {"items": ["任务1", "任务2"]}}  // 完整的对象格式'
          ],
          [
            '支持多种格式：字符串列表、混合列表（字符串+对象）、完整对象',
            '每个任务对象只需要包含title字段，其他字段都是可选的',
            '字符串会被自动转换为任务对象（title=字符串内容）'
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
          message: '当前会话中还没有任务列表。请先创建任务列表。',
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
        error: createDetailedError('内部错误：状态更新处理失败', [], ['请重试操作'])
      }
    }
    return {
      status: 'failed',
      error: createDetailedError(
        '缺少必需参数: 必须提供 input（用于生成任务列表）、items（字符串列表）或 todoList（手动创建任务列表）之一',
        [
          '{"input": "帮我写一篇关于人工智能的文章"}  // 方式1：自动生成',
          '{"items": ["任务1", "任务2", "任务3"]}  // 方式2：字符串列表（最简单）',
          '{"items": ["任务1", {"title": "任务2", "tags": ["重要"]}]}  // 方式3：混合列表',
          '{"todoList": {"items": ["任务1", "任务2"]}}  // 方式4：完整对象'
        ],
        [
          '方式1：使用input参数，工具会自动分析用户意图并生成任务列表',
          '方式2：直接传入items数组（字符串列表）',
          '方式3：传入混合列表（字符串和对象的组合）',
          '方式4：传入完整的todoList对象',
          '如果提供了items或todoList，input可以为空'
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
        message: i18n.global.t('agent.tool.todolist.progress.analyzing', '正在分析用户意图...')
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
          `解析任务列表JSON失败: ${errorMessage}`,
          [
            '{"input": "帮我写一篇文章"}',
            '{"input": "创建一个待办事项管理系统"}',
            '确保input参数是有效的字符串'
          ],
          [
            '工具会调用LLM分析用户输入并生成任务列表',
            '如果JSON解析失败，请检查LLM响应格式',
            '可以尝试提供更清晰的input描述',
            '添加context参数可能有助于生成更准确的结果'
          ]
        )
      }
    }

    // 验证基本结构
    if (!todoList.items || !Array.isArray(todoList.items)) {
      return {
        status: 'failed',
        error: createDetailedError(
          '任务列表结构无效：缺少items数组',
          [
            '工具期望的JSON格式包含items数组',
            '示例结构：{"items": [{"id": "1", "title": "任务1", "status": "pending"}]}'
          ],
          [
            '任务列表必须包含items数组，数组中每个元素代表一个任务',
            '每个任务应该包含id、title、status等字段',
            '如果生成失败，工具会自动重试'
          ]
        )
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
        message: i18n.global.t('agent.tool.todolist.progress.completed', '任务列表生成完成')
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
        `生成任务列表失败: ${errorMessage}`,
        [
          '{"input": "帮我写一篇文章"}',
          '{"input": "创建一个待办事项管理系统", "context": "需要包含前端和后端"}',
          '确保input参数是有效的字符串'
        ],
        [
          '检查input参数是否正确提供',
          '确保LLM服务可用且配置正确',
          '可以尝试提供更清晰的输入描述',
          '添加context参数可能有助于生成更准确的任务列表'
        ]
      )
    }
  }
}

export const todolistToolConfig: AgentToolConfig = {
  id: 'todolist-planning',
  name: todolistToolLocales,
  description: todolistToolLocales,
  origin: 'internal',
  spec: {
    name: 'todolist-planning',
    brief:
      'Only when user explicitly asks for a task list, plan, or breakdown (e.g. "列个计划", "任务清单", "分解任务"). Do not use for general writing, editing, or document generation.',
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
  instruction: todolistToolLocales,
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
        description: '用户的自然语言输入，描述需要完成的任务或目标（自动生成模式使用）'
      },
      context: {
        type: 'string',
        description: '可选的上下文信息，帮助更好地理解用户意图'
      },
      items: {
        type: 'array',
        description: '任务列表数组，支持字符串列表或混合列表（字符串+对象），最简单的方式',
        items: {
          oneOf: [{ type: 'string' }, { type: 'object' }]
        }
      },
      todoList: {
        type: 'object',
        description:
          '手动创建的任务列表对象（手动创建模式使用），如果提供了items或todoList，input可以为空'
      },
      markComplete: {
        oneOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'string' } },
          { type: 'boolean' }
        ],
        description:
          '标记任务为完成。可以是：1) 单个任务ID（字符串），如 "task-1"；2) 多个任务ID（字符串数组），如 ["task-1", "task-2"]；3) 布尔值 true 或字符串 "true"，自动标记最后一条已完成任务的下一条任务为完成'
      },
      updateStatus: {
        type: 'object',
        description:
          '更新任务状态，包含itemId（任务ID）和status（状态：pending|in_progress|completed|cancelled）',
        properties: {
          itemId: {
            type: 'string',
            description: '要更新的任务ID'
          },
          status: {
            type: 'string',
            enum: ['pending', 'in_progress', 'completed', 'cancelled'],
            description: '新的任务状态'
          }
        },
        required: ['itemId', 'status']
      }
    }
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
