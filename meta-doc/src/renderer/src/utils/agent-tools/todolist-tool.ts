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
import { parseJsonWithClean, isJsonParseError, createDetailedError, retryLLMCall } from './tool-utils'

const logger = createRendererLogger('TodoListTool')

/**
 * TodoList JSON Schema定义
 * 简化设计：大多数字段都是可选的，只有title是必需的
 */
export interface TodoItem {
  id?: string  // 可选，自动生成
  title: string  // 必需
  description?: string
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled'  // 可选，默认为pending
  priority?: 'low' | 'medium' | 'high' | 'urgent'  // 可选
  dueDate?: string // ISO 8601格式，可选
  tags?: string[]  // 可选
  dependencies?: string[] // 依赖的其他任务ID，可选
  estimatedTime?: string // 预估时间，如 "2h", "30m"，可选
  assignee?: string  // 可选
  metadata?: Record<string, unknown>  // 可选
}

/**
 * 灵活的TodoItem输入类型：可以是字符串或对象
 */
export type FlexibleTodoItem = string | TodoItem

/**
 * 灵活的TodoList输入类型：支持多种格式
 */
export interface FlexibleTodoListInput {
  items?: FlexibleTodoItem[]  // 可以是字符串列表或混合列表
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

## 注意事项
1. **多种输入方式**：可以使用 \`input\`（自动生成）、\`items\`（字符串/混合列表）或 \`todoList\`（完整对象）
2. **推荐使用简化格式**：字符串列表或混合列表，简洁高效
3. 任务应该按照逻辑顺序排列
4. 如果任务之间有依赖关系，可以在dependencies中标注（可选）
5. priority、tags、status等字段都是可选的，根据需要添加
6. **字符串会自动转换**：列表中的字符串会自动转换为任务对象（title=字符串内容）
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

## Notes
1. **Choose one mode**: Either provide \`input\` (automatic generation) or \`todoList\` (manual creation)
2. Tasks should be arranged in logical order
3. If tasks have dependencies, mark them in dependencies
4. Priority settings should be reasonable
5. Estimated time should be as accurate as possible
6. When manually creating, must provide complete TodoList object structure, including items array
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
      title: item.title || `任务 ${index + 1}`,  // title必需，如果没有则生成
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

const todolistToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const input = params.input as string
  const context = params.context as string | undefined
  const todoList = params.todoList as TodoList | FlexibleTodoListInput | FlexibleTodoItem[] | undefined
  const items = params.items as FlexibleTodoItem[] | undefined  // 支持直接传入items数组

  // 优先级：items > todoList > input（自动生成）
  
  // 方式1：直接传入items数组（最简化的方式）
  if (items && Array.isArray(items)) {
    try {
      const normalized = normalizeTodoList(items)
      
      onUpdate({
        content: {
          stage: 'completed',
          todoList: normalized
        },
        format: 'json',
        componentName: 'TodoListDisplay'
      }, {
        percentage: 100,
        message: i18n.global.t('agent.tool.todolist.progress.completed', '任务列表创建完成')
      })

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
        result: normalized
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
        normalized = normalizeTodoList(todoList)
      } else if (typeof todoList === 'object') {
        // 如果是对象，使用normalizeTodoList处理
        normalized = normalizeTodoList(todoList as FlexibleTodoListInput)
      } else {
        throw new Error('todoList参数格式无效，必须是数组或对象')
      }
      
      onUpdate({
        content: {
          stage: 'completed',
          todoList: normalized
        },
        format: 'json',
        componentName: 'TodoListDisplay'
      }, {
        percentage: 100,
        message: i18n.global.t('agent.tool.todolist.progress.completed', '任务列表创建完成')
      })

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
        result: normalized
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

  // 如果没有提供items或todoList，使用input生成（自动生成模式）
  if (!input || typeof input !== 'string') {
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
          oneOf: [
            { type: 'string' },
            { type: 'object' }
          ]
        }
      },
      todoList: {
        type: 'object',
        description: '手动创建的任务列表对象（手动创建模式使用），如果提供了items或todoList，input可以为空'
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

