# 工具实时进度显示重构分析（包含LLM流式输出）

## 问题描述

当前工具执行流程：
1. `ToolCallQueue` 添加任务
2. 调用 `createAiTask` 创建 AI 任务（类型为 `tool`）
3. `startAiTask` 通过 `ToolRunner.runTool` 执行工具
4. 工具执行完成后，才显示 Display 组件

**核心问题**：
1. **进度更新不实时**：虽然有工具支持 `onUpdate` 回调发送进度更新，但这些更新没有实时传递给 Display 组件，用户无法看到执行进度
2. **LLM流式输出未显示**：许多工具内部调用LLM进行文本生成（如数据分析、图表生成、大纲优化等），这些LLM调用使用流式输出，但用户无法看到实时的流式输出内容
3. **Display组件渲染时机**：Display组件在工具执行完成后才渲染，而不是在开始执行时就开始显示

## 当前流程分析

### 1. 工具调用流程
```
AgentEngineExecutor
  └─> ToolCallQueue.addTask()
      └─> ToolCallQueue.start()
          └─> createAiTask(type='tool')
              └─> startAiTask()
                  └─> ToolRunner.runTool()
                      └─> agentToolManager.invokeTool()
                          └─> tool.callback(params, signal, onUpdate)
                              └─> onUpdate() // 进度更新回调
```

### 2. 进度更新机制
- 工具回调函数接收 `onUpdate` 参数
- `onUpdate` 可以发送进度更新：`onUpdate(data, progress)`
- `agentToolManager.invokeTool` 中，`onUpdate` 会：
  1. 通过 `eventBus.emit('tool-update', ...)` 发送事件（已实现）
  2. 调用 `onStatusUpdate` 回调（但当前未传递）

### 3. LLM流式输出机制
- 工具内部调用 `createAiTask` 创建LLM任务（类型为 `chat`）
- `createAiTask` 创建任务时，传入 `target` ref 用于存储流式输出
- LLM流式输出会实时更新 `target.value`
- **问题**：这些 `target` ref 没有被传递给 Display 组件，用户无法看到实时流式输出

### 4. Display 组件更新机制
- Display 组件使用 `useToolDisplayRealtime` composable
- `useToolDisplayRealtime` 监听 `tool-update`、`tool-complete`、`tool-failed` 事件
- 但需要 `invocationId` 才能正确监听
- **问题**：LLM流式输出的 `targetRef` 和 `donePromise` 没有通过 `onUpdate` 传递给 Display 组件

## 需要修改的工具列表

### 已支持 onUpdate 的工具（需要确保实时更新）
1. ✅ **terminal-tool.ts** - 终端执行（已支持流式输出）
2. ✅ **data-analysis-tool.ts** - 数据分析（已支持多阶段进度）
3. ✅ **edit-tool.ts** - 文档编辑（已支持进度更新）
4. ✅ **web-crawler-tool.ts** - 网页爬取（已支持进度更新）
5. ✅ **chart-generation-tool.ts** - 图表生成（已支持进度更新）
6. ✅ **outline-optimize-tool.ts** - 大纲优化（已支持多阶段进度）
7. ✅ **metadata-tool.ts** - 元信息处理（已支持进度更新）
8. ✅ **proofread-tool.ts** - 校对工具（已支持进度更新）
9. ✅ **todolist-tool.ts** - 待办列表（已支持进度更新）
10. ✅ **diff-tool.ts** - 差异比较（已支持进度更新）

### 需要添加 onUpdate 支持的工具
1. ❌ **grep-tool.ts** - 文本搜索（可能长时间执行）
2. ❌ **outline-tree-tool.ts** - 大纲树生成（可能长时间执行）
3. ❌ **rag-tool.ts** - RAG 搜索（已支持进度，但需要确认）
4. ⚠️ **title-format-tool.ts** - 标题格式化（可能不需要实时进度）
5. ⚠️ **calculation-tool.ts** - 计算工具（通常很快，可能不需要）
6. ⚠️ **timestamp-tool.ts** - 时间戳工具（通常很快，可能不需要）
7. ⚠️ **color-tool.ts** - 颜色工具（通常很快，可能不需要）
8. ⚠️ **tool-spec-fetcher-tool.ts** - 工具规范获取（通常很快）

## 需要修改的代码位置

### 1. `ToolRunner.runTool()` (tool-runner.ts:54)
**问题**：没有传递 `onStatusUpdate` 回调给 `agentToolManager.invokeTool`

**修改**：
```typescript
// 当前代码：
const result = await agentToolManager.invokeTool(
  toolId,
  toolParams,
  undefined, // 状态更新回调（可选）<- 这里是 undefined
  signal
)

// 需要改为：
const onStatusUpdate = (status, data, progress) => {
  // 通过 eventBus 发送实时更新
  // 需要传递 invocationId
}
const result = await agentToolManager.invokeTool(
  toolId,
  toolParams,
  onStatusUpdate, // 传递回调
  signal
)
```

**但问题**：`ToolRunner.runTool` 没有 `invocationId`，需要从调用链传递下来。

### 2. `tool-call-queue.ts` (第 216-247 行)
**问题**：创建 AI 任务时，需要传递 `invocationId`，并且需要在工具执行前就创建 Display 显示

**修改**：
```typescript
// 在执行工具前，获取 invocationId（从 agentToolManager 或创建新的）
// 创建 AI 任务时，需要传递 invocationId
const { handle, done } = createAiTask(
  toolName,
  task.tool_id,
  taskResultRef,
  ai_types.tool,
  originKey,
  {
    toolId: task.tool_id,
    parameters: task.parameters,
    tool_call_id: task.tool_call_id,
    session: sessionForTool,
    invocationId: invocationId, // 新增：传递 invocationId
    stream: false
  }
)

// 在执行工具时，传递 invocationId 和进度回调
const observation = await ToolRunner.runTool(
  task.tool_id,
  task.parameters,
  this.signal,
  sessionForTool,
  invocationId, // 新增：传递 invocationId
  (status, data, progress) => {
    // 进度更新回调
    // 通过 eventBus 发送实时更新
    emitToolUpdate(invocationId, data, progress)
    
    // 更新 AI 任务状态（如果需要）
    // 更新 task.target.value（实时显示进度）
  }
)
```

### 3. `ToolRunner.runTool()` 方法签名
**修改**：添加 `invocationId` 和 `onProgress` 参数

```typescript
static async runTool(
  toolId: string,
  params: Record<string, unknown>,
  signal?: AbortSignal,
  session?: AgentSession,
  invocationId?: string, // 新增
  onProgress?: (status: ToolExecutionStatus, data?: ToolCallbackData, progress?: ToolProgress) => void // 新增
): Promise<ToolObservation>
```

### 4. `agent-tool-manager.ts` 的 `invokeTool` 方法
**问题**：`onStatusUpdate` 回调应该：
1. 通过 `eventBus.emit('tool-update', ...)` 发送事件（已实现）
2. 更新 AI 任务状态（需要新增）
3. 调用传入的 `onProgress` 回调（需要新增）

**修改**：
```typescript
async invokeTool(
  toolId: string,
  params: Record<string, unknown>,
  onStatusUpdate?: (status: ToolExecutionStatus, data?: ToolCallbackData, progress?: ToolProgress) => void,
  externalSignal?: AbortSignal
): Promise<ToolCallbackResult> {
  // ... 现有代码 ...
  
  // 在 onUpdate 回调中，同时调用 onStatusUpdate
  const onUpdate = (data: ToolCallbackData, progress?: ToolProgress) => {
    // 现有的 eventBus 发送（保留）
    emitToolUpdate(invocationId, data, progress)
    
    // 新增：调用外部传入的 onStatusUpdate 回调
    onStatusUpdate?.('running', data, progress)
  }
  
  // ... 执行工具 ...
}
```

### 5. `ai_tasks.ts` 的 `startAiTask` (tool 类型)
**问题**：
1. 需要在工具执行过程中实时更新 `task.target.value`，而不是等到执行完成后
2. 需要保存工具执行过程中的 LLM 流式输出信息（`targetRef` 和 `donePromise`），以便 Display 组件使用

**修改**：
```typescript
} else if (task.type === ai_types.tool && task.target) {
  const logger = createRendererLogger('AiTasks')
  
  // ... 现有代码 ...
  
  // 获取 invocationId（从 meta 中）
  const invocationId = task.meta?.invocationId as string | undefined
  
  // 保存 LLM 流式输出信息的容器（用于传递给 Display）
  let currentStreamingRef: Ref<string> | null = null
  let currentStreamingDone: Promise<any> | null = null
  
  // 创建进度回调
  const onProgress = (status: ToolExecutionStatus, data?: ToolCallbackData, progress?: ToolProgress) => {
    // 检查 data 中是否包含 LLM 流式输出信息
    if (data && typeof data === 'object' && 'content' in data) {
      const content = (data as any).content
      
      // 如果 content 包含流式输出信息（targetRef 和 donePromise）
      if (content && typeof content === 'object') {
        if (content.reportTargetRef && content.reportDonePromise) {
          // 数据分析工具：保存流式输出信息
          currentStreamingRef = content.reportTargetRef
          currentStreamingDone = content.reportDonePromise
          
          // 保存到 task.meta 中，供 Display 组件使用
          if (task.meta) {
            (task.meta as any).__streamingRef = content.reportTargetRef
            ;(task.meta as any).__streamingDone = content.reportDonePromise
          }
          
          logger.debug('[startAiTask] 检测到LLM流式输出，已保存 targetRef 和 donePromise')
        } else if (content.codeTargetRef && content.codeDonePromise) {
          // 图表生成工具：保存流式输出信息
          currentStreamingRef = content.codeTargetRef
          currentStreamingDone = content.codeDonePromise
          
          if (task.meta) {
            (task.meta as any).__streamingRef = content.codeTargetRef
            ;(task.meta as any).__streamingDone = content.codeDonePromise
          }
          
          logger.debug('[startAiTask] 检测到LLM流式输出（图表代码），已保存 targetRef 和 donePromise')
        } else if (content.rawContentRef && content.rawContentDone) {
          // 大纲优化工具：保存流式输出信息
          currentStreamingRef = content.rawContentRef
          currentStreamingDone = content.rawContentDone
          
          if (task.meta) {
            (task.meta as any).__streamingRef = content.rawContentRef
            ;(task.meta as any).__streamingDone = content.rawContentDone
          }
          
          logger.debug('[startAiTask] 检测到LLM流式输出（大纲内容），已保存 targetRef 和 donePromise')
        }
      }
    }
    
    // 实时更新 task.target.value（显示进度信息）
    if (data && progress) {
      const progressText = `[${progress.percentage}%] ${progress.message || ''}`
      task.target.value = progressText
    } else if (data && !progress) {
      // 如果没有进度信息，只显示数据内容（如果有）
      if (typeof data === 'object' && 'content' in data) {
        const content = (data as any).content
        if (typeof content === 'string') {
          task.target.value = content
        }
      }
    }
  }
  
  // 执行工具，传递 invocationId 和 onProgress
  const observation = await ToolRunner.runTool(
    toolId,
    parameters,
    controller.signal,
    session,
    invocationId,
    onProgress // 新增：传递进度回调
  )
  
  // 保存 LLM 流式输出信息到 observation（如果有）
  if (currentStreamingRef && currentStreamingDone) {
    if (task.meta) {
      (task.meta as any).__streamingRef = currentStreamingRef
      ;(task.meta as any).__streamingDone = currentStreamingDone
    }
    
    logger.debug('[startAiTask] 工具执行完成，已保存LLM流式输出信息到 task.meta')
  }
  
  // ... 现有代码 ...
}
```

### 6. `AITask.vue` 组件
**问题**：需要显示工具执行的实时进度和LLM流式输出，而不是只显示任务名称和状态

**修改**：
- 对于 `tool` 类型的任务，需要：
  1. 显示进度条（如果有 progress）
  2. 显示进度消息（如果有 progress.message）
  3. **显示LLM流式输出**（如果有 `targetRef` 和 `donePromise`），使用 `StreamingContentDisplay` 组件
  4. 显示 Display 组件（如果有 displayComponent）

**完整实现方案**：
```vue
<!-- 在 AITask.vue 中 -->
<template>
  <el-card>
    <!-- 现有代码：任务名称和状态 ... -->
    
    <!-- 对于 tool 类型任务，显示进度 -->
    <div v-if="task.type === 'tool' && taskProgress" class="task-progress">
      <el-progress 
        :percentage="taskProgress.percentage" 
        :status="taskProgress.status"
      />
      <div class="progress-message">{{ taskProgress.message }}</div>
    </div>
    
    <!-- 对于 tool 类型任务，显示LLM流式输出（如果有） -->
    <div v-if="task.type === 'tool' && streamingRef" class="tool-streaming">
      <StreamingContentDisplay
        :content-ref="streamingRef"
        :done="streamingDone"
      />
    </div>
    
    <!-- 对于 tool 类型任务，显示 Display 组件（如果有 displayComponent） -->
    <div v-if="task.type === 'tool' && taskDisplayComponent" class="tool-display">
      <component 
        :is="taskDisplayComponent"
        :invocation-id="task.meta?.invocationId"
        :data="taskData"
        :status="taskStatus"
        :progress="taskProgress"
      />
    </div>
  </el-card>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import StreamingContentDisplay from './common/StreamingContentDisplay.vue'
import { useToolDisplayRealtime } from '../utils/agent-tools/composables/useToolDisplayRealtime'
import { getDisplayComponentForTool } from '../utils/agent-tools/components/AutoTestResultDisplay'

// 计算属性：获取流式输出信息
const streamingRef = computed(() => {
  if (props.task.type !== 'tool' || !props.task.meta) return null
  return props.task.meta.__streamingRef || null
})

const streamingDone = computed(() => {
  if (props.task.type !== 'tool' || !props.task.meta) return null
  return props.task.meta.__streamingDone || null
})

// 计算属性：获取 Display 组件
const taskDisplayComponent = computed(() => {
  if (props.task.type !== 'tool' || !props.task.meta?.toolId) return null
  const toolId = props.task.meta.toolId as string
  return getDisplayComponentForTool(toolId)
})

// 计算属性：获取任务数据（从实时更新中获取，或从初始数据获取）
const taskData = computed(() => {
  const invocationId = props.task.meta?.invocationId as string | undefined
  if (!invocationId || !taskDisplayComponent.value) return null
  
  // 使用 useToolDisplayRealtime 获取实时数据
  const { realtimeData } = useToolDisplayRealtime(
    invocationId,
    null,
    'running',
    undefined
  )
  
  return realtimeData.value || null
})

// 计算属性：获取任务进度（从实时更新中获取，或从初始进度获取）
const taskProgress = computed(() => {
  const invocationId = props.task.meta?.invocationId as string | undefined
  if (!invocationId) return undefined
  
  // 使用 useToolDisplayRealtime 获取实时进度
  const { realtimeProgress } = useToolDisplayRealtime(
    invocationId,
    null,
    'running',
    undefined
  )
  
  return realtimeProgress.value || undefined
})
</script>
```

### 7. `agentToolManager.invokeTool` - 生成 invocationId
**问题**：`invocationId` 应该在 `invokeTool` 中生成，并传递给 `onUpdate` 回调

**当前代码**：
```typescript
const invocationId = `invocation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
```

**需要修改**：确保 `invocationId` 在创建时就传递给 AI 任务，而不是在执行时生成

## 重构方案

### 方案 1：在 ToolCallQueue 中生成 invocationId
**优点**：
- invocationId 在任务创建时就确定
- 可以提前创建 Display 显示

**缺点**：
- 需要修改 ToolCallQueue 和 createAiTask 的接口

### 方案 2：在 agentToolManager.invokeTool 中生成 invocationId，并通过回调返回
**优点**：
- 不改变现有接口
- invocationId 在执行时生成

**缺点**：
- AI 任务创建时还不知道 invocationId
- Display 组件需要等待 invocationId 才能监听事件

### 方案 3（推荐）：在 ToolCallQueue 中生成 invocationId，并在创建 AI 任务时传递
**优点**：
- invocationId 在任务创建时就确定
- 可以提前创建 Display 显示
- AI 任务可以立即开始监听进度更新

**修改步骤**：
1. 在 `ToolCallQueue.addTask` 时生成 `invocationId`，存储在 `ToolCallTask` 中
2. 在 `ToolCallQueue.start` 中创建 AI 任务时，传递 `invocationId`
3. 在 `ToolRunner.runTool` 中，接收 `invocationId` 和 `onProgress` 参数
4. 在 `agentToolManager.invokeTool` 中，使用传入的 `invocationId`（如果提供），否则生成新的
5. 在 `startAiTask` 中，设置进度回调，实时更新任务状态和 Display

## 需要修改的文件清单

### 核心文件（必须修改）
1. ✅ `meta-doc/src/renderer/src/utils/agent-framework/tool-call-queue.ts`
   - 在创建 AI 任务前生成 invocationId
   - 传递 invocationId 给 ToolRunner
   - 在工具执行前就创建 Display 显示

2. ✅ `meta-doc/src/renderer/src/utils/agent-framework/tool-runner.ts`
   - 添加 invocationId 和 onProgress 参数
   - 传递 onProgress 给 agentToolManager.invokeTool

3. ✅ `meta-doc/src/renderer/src/utils/agent-tool-manager.ts`
   - 在 invokeTool 中接收 invocationId（如果提供）
   - onUpdate 回调中调用传入的 onStatusUpdate

4. ✅ `meta-doc/src/renderer/src/utils/ai_tasks.ts`
   - 在 startAiTask 中，对于 tool 类型任务，设置进度回调
   - 实时更新 task.target.value 和任务状态
   - 保存 displayComponent 到 task.meta 中

5. ✅ `meta-doc/src/renderer/src/components/AITask.vue`
   - 显示工具执行的进度条和消息
   - 显示 Display 组件（如果有）

### 工具文件（根据实际情况修改）
- 已支持 onUpdate 的工具：确保正确使用 onUpdate
- 未支持 onUpdate 的工具：添加 onUpdate 支持（如果执行时间较长）

## 关键问题

### 1. invocationId 的传递链路
```
ToolCallQueue.addTask() 
  └─> 生成 invocationId
  └─> createAiTask(meta.invocationId)
      └─> startAiTask()
          └─> ToolRunner.runTool(invocationId, onProgress)
              └─> agentToolManager.invokeTool(invocationId, onStatusUpdate)
                  └─> tool.callback(onUpdate)
                      └─> onUpdate() -> emitToolUpdate(invocationId, ...)
```

### 2. Display 组件的渲染时机
- **当前**：工具执行完成后才渲染 Display
- **目标**：工具执行开始时就开始渲染 Display，显示加载状态
- **实现**：在创建 AI 任务时，如果工具有 displayComponent，立即渲染 Display 组件（状态为 loading）

### 3. AI 任务状态与工具执行状态的同步
- **当前**：AI 任务状态只显示"运行中"或"已完成"
- **目标**：AI 任务状态应该反映工具执行的实时进度
- **实现**：通过 onProgress 回调，实时更新 task.status.value 和 task.progress

## LLM流式输出的实时显示方案

### 问题分析
许多工具内部调用LLM进行文本生成，这些LLM调用使用 `createAiTask` 创建任务，并传入 `target` ref 接收流式输出。但是：
1. 这些 `targetRef` 和 `donePromise` 没有传递给 Display 组件
2. Display 组件无法实时显示LLM流式输出的内容
3. 用户需要等待LLM输出完成后才能看到结果

### 解决方案：通过 onUpdate 传递流式输出信息

#### 方案概述
1. 工具内部调用LLM时，在 `onUpdate` 回调中传递 `targetRef` 和 `donePromise`
2. `onUpdate` 会将流式输出信息传递给 Display 组件
3. Display 组件（或 AITask.vue）使用 `StreamingContentDisplay` 组件显示LLM流式输出

#### 需要修改的工具（涉及LLM输出）

**1. data-analysis-tool.ts**
- **当前实现**：`generateAnalysisSummary()` 已经返回 `targetRef` 和 `donePromise`，并在 `onUpdate` 中传递
- **需要确认**：确保 `onUpdate` 中的数据格式正确，Display 组件能够识别

**2. chart-generation-tool.ts**
- **当前实现**：`generateChartCodeWithLLM()` 使用 `target` ref，但没有通过 `onUpdate` 传递
- **需要修改**：在 `generateChartCodeWithLLM` 中，通过 `onUpdate` 传递 `targetRef` 和 `donePromise`
```typescript
// 在 chart-generation-tool.ts 的 generateChartCodeWithLLM 中
const { handle, done } = createAiTask(...)

// 立即通过 onUpdate 传递流式输出信息
if (onUpdate) {
  onUpdate({
    content: {
      stage: 'generating-code-streaming',
      codeTargetRef: target,  // 传递 target ref
      codeDonePromise: done   // 传递 done promise
    },
    format: 'json'
  }, {
    percentage: 30,
    message: '正在生成图表代码（流式输出）...'
  })
}

// 然后等待 done 完成
await done
```

**3. outline-optimize-tool.ts**
- **当前实现**：`generateChildNodes()` 和 `generateNodeContent()` 使用 `rawContentRef`，但没有通过 `onUpdate` 传递
- **需要修改**：在调用 `generateChildNodes` 和 `generateNodeContent` 时，传递 `onUpdate`，并在函数内部通过 `onUpdate` 传递流式输出信息
```typescript
// 在 outline-optimize-tool.ts 中，需要修改 generateChildNodes 和 generateNodeContent 的调用
// 方案1：在工具回调中创建 rawContentRef，然后传递给 generateChildNodes
const rawContentRef = ref('')
onUpdate({
  content: {
    stage: 'generating-streaming',
    rawContentRef: rawContentRef,
    rawContentDone: null  // 稍后更新
  },
  format: 'json'
})

const children = await generateChildNodes(..., rawContentRef)
// 在 generateChildNodes 内部，donePromise 需要在函数执行完成后才能获取
// 所以需要在 generateChildNodes 中返回 donePromise

// 方案2：修改 generateChildNodes 和 generateNodeContent，返回 donePromise
// 然后在工具回调中通过 onUpdate 传递
```

**4. terminal-tool.ts**
- **当前实现**：`analyzeOutput()` 使用 `createAiTask`，但没有通过 `onUpdate` 传递流式输出
- **需要修改**：在 `analyzeOutput` 中，通过 `onUpdate` 传递 `targetRef` 和 `donePromise`

**5. metadata-tool.ts**
- **当前实现**：`generateTitleWithLLM()`, `generateDescriptionWithLLM()`, `generateKeywordsWithLLM()` 都使用 `target` ref
- **需要修改**：在每个生成函数中，通过 `onUpdate` 传递 `targetRef` 和 `donePromise`

**6. todolist-tool.ts**
- **当前实现**：`generateTodoListWithLLM()` 使用 `target` ref，但没有通过 `onUpdate` 传递
- **需要修改**：在 `generateTodoListWithLLM` 中，通过 `onUpdate` 传递 `targetRef` 和 `donePromise`

**7. proofread-tool.ts**
- **当前实现**：`proofreadWithLLM()` 使用 `target` ref，但没有通过 `onUpdate` 传递
- **需要修改**：在 `proofreadWithLLM` 中，通过 `onUpdate` 传递 `targetRef` 和 `donePromise`

#### onUpdate 数据格式规范

对于包含LLM流式输出的工具，`onUpdate` 的数据格式应该是：

```typescript
onUpdate({
  content: {
    // 工具特定的阶段信息
    stage: 'generating-streaming' | 'summarizing-streaming' | 'analyzing-streaming' | ...,
    
    // LLM流式输出信息（必需）
    // 命名规范：{用途}TargetRef 和 {用途}DonePromise
    // 例如：reportTargetRef, codeTargetRef, rawContentRef, analysisTargetRef 等
    reportTargetRef?: Ref<string>,
    reportDonePromise?: Promise<any>,
    
    codeTargetRef?: Ref<string>,
    codeDonePromise?: Promise<any>,
    
    rawContentRef?: Ref<string>,
    rawContentDone?: Promise<any>,
    
    // 其他工具特定的数据
    // ...
  },
  format: 'json',
  componentName: '...'  // 可选，Display 组件名称
}, {
  percentage: number,
  message: string
})
```

#### Display 组件的修改

对于有LLM流式输出的工具，Display 组件需要：
1. 从 `content` 中提取 `targetRef` 和 `donePromise`
2. 使用 `StreamingContentDisplay` 组件显示流式输出
3. 在流式输出完成后，显示最终结果

**示例**（DataAnalysisDisplay.vue）：
```vue
<template>
  <div class="data-analysis-display">
    <!-- 其他内容 ... -->
    
    <!-- LLM流式输出显示 -->
    <StreamingContentDisplay
      v-if="streamingRef"
      :content-ref="streamingRef"
      :done="streamingDone"
    />
    
    <!-- 最终结果显示（流式输出完成后） -->
    <div v-if="displayData.stage === 'completed' && !streamingRef">
      <!-- 显示最终结果 ... -->
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import StreamingContentDisplay from '../../common/StreamingContentDisplay.vue'
import { useToolDisplayRealtime } from '../composables/useToolDisplayRealtime'

const props = defineProps<ToolDisplayComponentProps>()

const { realtimeData, realtimeStatus, realtimeProgress } = useToolDisplayRealtime(
  props.invocationId,
  props.data,
  props.status,
  props.progress
)

const displayData = computed(() => {
  const data = realtimeData.value !== null ? realtimeData.value : props.data
  const parsed = parseToolData(data)
  // ... 解析逻辑 ...
  return parsed
})

// 提取流式输出信息
const streamingRef = computed(() => {
  if (displayData.value && typeof displayData.value === 'object') {
    // 根据不同的工具，提取不同的流式输出信息
    return (displayData.value as any).reportTargetRef 
        || (displayData.value as any).codeTargetRef
        || (displayData.value as any).rawContentRef
        || null
  }
  return null
})

const streamingDone = computed(() => {
  if (displayData.value && typeof displayData.value === 'object') {
    return (displayData.value as any).reportDonePromise 
        || (displayData.value as any).codeDonePromise
        || (displayData.value as any).rawContentDone
        || null
  }
  return null
})
</script>
```

## 详细实现方案与提示词

### 实现步骤

#### 阶段1：基础架构修改（核心文件）
1. **修改 ToolCallQueue**：在创建 AI 任务前生成 `invocationId`
2. **修改 ToolRunner**：添加 `invocationId` 和 `onProgress` 参数
3. **修改 agentToolManager**：支持传入的 `invocationId` 和 `onStatusUpdate`
4. **修改 startAiTask**：设置进度回调，保存LLM流式输出信息

#### 阶段2：工具修改（涉及LLM输出的工具）
1. **data-analysis-tool.ts**：确认 `onUpdate` 格式正确（已实现，需要验证）
2. **chart-generation-tool.ts**：在 `generateChartCodeWithLLM` 中传递流式输出信息
3. **outline-optimize-tool.ts**：修改 `generateChildNodes` 和 `generateNodeContent`，传递流式输出信息
4. **terminal-tool.ts**：在 `analyzeOutput` 中传递流式输出信息（如果启用）
5. **metadata-tool.ts**：在三个生成函数中传递流式输出信息
6. **todolist-tool.ts**：在 `generateTodoListWithLLM` 中传递流式输出信息
7. **proofread-tool.ts**：在 `proofreadWithLLM` 中传递流式输出信息

#### 阶段3：Display 组件修改
1. **DataAnalysisDisplay.vue**：添加 `StreamingContentDisplay` 支持
2. **ChartGenerationDisplay.vue**：添加 `StreamingContentDisplay` 支持
3. **OutlineOptimizeDisplay.vue**：添加 `StreamingContentDisplay` 支持
4. **TerminalExecutionDisplay.vue**：添加 `StreamingContentDisplay` 支持（如果启用分析）
5. **MetadataDisplay.vue**：添加 `StreamingContentDisplay` 支持
6. **TodoListDisplay.vue**：添加 `StreamingContentDisplay` 支持
7. **ProofreadDisplay.vue**：添加 `StreamingContentDisplay` 支持
8. **AITask.vue**：添加 `StreamingContentDisplay` 支持（用于显示工具级别的流式输出）

#### 阶段4：AITask.vue 增强
- 对于 `tool` 类型任务，如果 `task.meta.__streamingRef` 存在，使用 `StreamingContentDisplay` 显示
- 同时显示 Display 组件（如果有）和流式输出组件

### 关键技术点

#### 1. 流式输出信息的传递链路
```
工具内部 createAiTask(targetRef)
  └─> onUpdate({ content: { targetRef, donePromise }, ... })
      └─> agentToolManager.invokeTool 的 onUpdate
          └─> onStatusUpdate(status, data, progress)
              └─> ToolRunner 的 onProgress
                  └─> startAiTask 的 onProgress
                      └─> 保存到 task.meta.__streamingRef 和 __streamingDone
                          └─> AITask.vue 读取并传递给 StreamingContentDisplay
```

#### 2. StreamingContentDisplay 的使用
- **props**：
  - `contentRef: Ref<string>` - LLM流式输出的ref，实时更新
  - `done: Promise<any>` - 任务完成Promise，用于判断是否完成
  - `style?: Record<string, string>` - 自定义样式
- **行为**：
  - 自动监听 `contentRef.value` 的变化，实时显示内容
  - 当 `done` 完成时，自动隐藏组件（但保留内容）
  - 支持自定义样式，适应不同的Display组件

#### 3. Display 组件的兼容性
- 对于有流式输出的工具，Display 组件需要：
  1. 在流式输出阶段，显示 `StreamingContentDisplay` 组件
  2. 在流式输出完成后，显示最终结果（可能包含格式化后的内容）
  3. 同时支持阶段进度显示（progress bar）和流式输出显示

#### 4. 工具修改的通用模式

所有涉及LLM输出的工具，都需要遵循以下模式：

**通用模式模板**：
```typescript
// 在工具回调函数中
const toolCallback: ToolCallback = async (params, signal, onUpdate) => {
  // ... 前置处理 ...
  
  // 创建 LLM 任务的 target ref
  const llmTargetRef = ref('')
  const originKey = `tool-${toolId}-${Date.now()}`
  
  const messages: AIDialogMessage[] = [{
    role: 'user',
    content: prompt,
  }]
  
  const { handle, done } = createAiTask(
    'LLM任务名称',
    messages,
    llmTargetRef,
    'chat',
    originKey,
    { stream: true }
  )
  
  // 重要：立即通过 onUpdate 传递流式输出信息（在 await done 之前）
  if (onUpdate) {
    onUpdate({
      content: {
        stage: 'llm-generating',
        // 根据工具用途命名：reportTargetRef, codeTargetRef, rawContentRef, analysisTargetRef 等
        // 命名规范：{用途}TargetRef 和 {用途}DonePromise
        reportTargetRef: llmTargetRef,  // 数据分析工具使用 reportTargetRef
        codeTargetRef: llmTargetRef,    // 图表生成工具使用 codeTargetRef
        rawContentRef: llmTargetRef,    // 大纲优化工具使用 rawContentRef
        analysisTargetRef: llmTargetRef, // 终端分析工具使用 analysisTargetRef
        // 对应 donePromise
        reportDonePromise: done,
        codeDonePromise: done,
        rawContentDone: done,
        analysisDonePromise: done,
        // 其他工具特定的数据
        // ...
      },
      format: 'json',
      componentName: 'ToolDisplayComponent'  // 对应的 Display 组件名称
    }, {
      percentage: 当前进度,
      message: '正在生成...（流式输出）'
    })
  }
  
  // 等待 LLM 输出完成
  try {
    await done
  } catch (error) {
    // 处理错误（取消时保留已生成的内容）
    const isCancelled = error instanceof Error && (
      error.message === '任务已取消' || 
      error.message.includes('任务已取消') ||
      (error as any).name === 'AbortError'
    )
    
    if (!isCancelled) {
      throw error
    }
    // 取消时继续执行，使用已生成的内容
  }
  
  // 使用 llmTargetRef.value 获取最终结果
  const finalResult = llmTargetRef.value.trim()
  
  // 流式输出完成后，通过 onUpdate 发送最终结果
  if (onUpdate) {
    onUpdate({
      content: {
        stage: 'completed',
        // 最终结果数据
        // ...
      },
      format: 'json',
      componentName: 'ToolDisplayComponent'
    }, {
      percentage: 100,
      message: '生成完成'
    })
  }
  
  // ... 后续处理 ...
}
```

**具体工具示例**：

**1. chart-generation-tool.ts**
```typescript
// 在 generateChartCodeWithLLM 函数中
async function generateChartCodeWithLLM(
  prompt: string,
  chartType: string,
  target: Ref<string>,
  signal?: AbortSignal,
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void  // 新增参数
): Promise<string> {
  // ... 现有代码 ...
  
  const { handle, done } = createAiTask(
    '生成图表代码',
    messages,
    target,
    'chat',
    originKey,
    { stream: true }
  )
  
  // 立即通过 onUpdate 传递流式输出信息
  if (onUpdate) {
    onUpdate({
      content: {
        stage: 'generating-code-streaming',
        codeTargetRef: target,
        codeDonePromise: done
      },
      format: 'json'
    }, {
      percentage: 30,
      message: '正在生成图表代码（流式输出）...'
    })
  }
  
  // 然后等待 done 完成
  try {
    await done
  } catch (error) {
    // ... 错误处理 ...
  }
  
  // 使用 target.value 获取最终结果
  const finalCode = target.value.trim()
  return finalCode
}

// 在 chartGenerationCallback 中调用时，传递 onUpdate
const codeTarget = ref('')
finalChartCode = await generateChartCodeWithLLM(
  prompt, 
  normalizedChartType, 
  codeTarget, 
  signal,
  onUpdate  // 传递 onUpdate 参数
)
```

**2. outline-optimize-tool.ts**
```typescript
// 修改 generateChildNodes 和 generateNodeContent，添加 onUpdate 参数
async function generateChildNodes(
  node: DocumentOutlineNode,
  outlineTree: DocumentOutlineNode,
  userPrompt: string,
  docFormat: 'md' | 'tex' = 'md',
  signal?: AbortSignal,
  rawContentRef?: Ref<string>,  // 可选，用于实时显示
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void  // 新增参数
): Promise<DocumentOutlineNode[]> {
  // ... 现有代码 ...
  
  const rawStringRef = rawContentRef || ref('')
  const { handle, done } = createAiTask(
    node.title,
    messages,
    rawStringRef,
    'chat',
    originKey,
    { stream: true }
  )
  
  // 立即通过 onUpdate 传递流式输出信息
  if (onUpdate) {
    onUpdate({
      content: {
        stage: 'generating-children-streaming',
        rawContentRef: rawStringRef,
        rawContentDone: done
      },
      format: 'json'
    }, {
      percentage: 30,
      message: `正在为节点 "${node.title}" 生成子节点（流式输出）...`
    })
  }
  
  // 然后等待 done 完成
  try {
    await done
  } catch (error) {
    // ... 错误处理 ...
  }
  
  // 使用 rawStringRef.value 获取最终结果
  const rawOutput = rawStringRef.value.trim()
  // ... 解析 JSON ...
}

// 在 outlineOptimizeToolCallback 中调用时，传递 onUpdate
const newChildren = await generateChildNodes(
  workingNode, 
  workingOutline, 
  userPrompt, 
  doc.format, 
  signal,
  undefined,  // rawContentRef
  onUpdate    // 传递 onUpdate 参数
)
```

**3. terminal-tool.ts**
```typescript
// 在 analyzeOutput 函数中（如果启用分析）
async function analyzeOutput(
  command: string,
  stdout: string,
  stderr: string,
  signal?: AbortSignal,
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void  // 新增参数
): Promise<string> {
  // ... 现有代码 ...
  
  const target = ref('')
  const originKey = `terminal-analysis-${Date.now()}`
  const messages: AIDialogMessage[] = [{
    role: 'user',
    content: prompt,
  }]
  
  const { handle, done } = createAiTask(
    '分析命令输出',
    messages,
    target,
    'chat',
    originKey,
    { stream: true }
  )
  
  // 立即通过 onUpdate 传递流式输出信息
  if (onUpdate) {
    onUpdate({
      content: {
        stage: 'analyzing-streaming',
        analysisTargetRef: target,
        analysisDonePromise: done
      },
      format: 'json'
    }, {
      percentage: 70,
      message: '正在分析命令输出（流式输出）...'
    })
  }
  
  // 然后等待 done 完成
  try {
    await done
  } catch (error) {
    // ... 错误处理 ...
  }
  
  // 使用 target.value 获取最终结果
  const summary = target.value.trim()
  return summary
}

// 在 terminalToolCallback 中调用时，传递 onUpdate
if (analyze) {
  summary = await analyzeOutput(command, finalStdout, finalStderr, signal, onUpdate)
}
```

## 实现检查清单

### 阶段1：核心架构修改（必须按顺序执行）
- [ ] **tool-call-queue.ts**
  - [ ] 在 `addTask` 时生成 `invocationId`，存储在 `ToolCallTask` 中
  - [ ] 在创建 AI 任务时，传递 `invocationId` 到 `task.meta`
  - [ ] 在调用 `ToolRunner.runTool` 时，传递 `invocationId` 和 `onProgress` 回调
  - [ ] 确保工具执行前就创建 Display 显示（状态为 loading）

- [ ] **tool-runner.ts**
  - [ ] 修改 `runTool` 方法签名，添加 `invocationId` 和 `onProgress` 参数
  - [ ] 传递 `invocationId` 给 `agentToolManager.invokeTool`
  - [ ] 传递 `onProgress` 回调给 `agentToolManager.invokeTool`（作为 `onStatusUpdate` 参数）

- [ ] **agent-tool-manager.ts**
  - [ ] 修改 `invokeTool` 方法，接收 `invocationId`（如果提供，否则生成新的）
  - [ ] 在 `onUpdate` 回调中，调用传入的 `onStatusUpdate` 回调
  - [ ] 确保 `eventBus.emit('tool-update', ...)` 使用正确的 `invocationId`

- [ ] **ai_tasks.ts**
  - [ ] 在 `startAiTask` 中，对于 `tool` 类型任务，创建 `onProgress` 回调
  - [ ] 在 `onProgress` 回调中，检查 `data.content` 是否包含流式输出信息
  - [ ] 保存流式输出信息（`targetRef` 和 `donePromise`）到 `task.meta.__streamingRef` 和 `__streamingDone`
  - [ ] 实时更新 `task.target.value`（显示进度信息）

### 阶段2：工具修改（涉及LLM输出，可以并行修改）
- [ ] **chart-generation-tool.ts**
  - [ ] 修改 `generateChartCodeWithLLM`，添加 `onUpdate` 参数
  - [ ] 在 `createAiTask` 后，立即通过 `onUpdate` 传递 `codeTargetRef` 和 `codeDonePromise`
  - [ ] 在 `chartGenerationCallback` 中，传递 `onUpdate` 给 `generateChartCodeWithLLM`

- [ ] **outline-optimize-tool.ts**
  - [ ] 修改 `generateChildNodes`，添加 `onUpdate` 参数（如果没有）
  - [ ] 修改 `generateNodeContent`，添加 `onUpdate` 参数（如果没有）
  - [ ] 在两个函数中，在 `createAiTask` 后，立即通过 `onUpdate` 传递 `rawContentRef` 和 `rawContentDone`
  - [ ] 在 `outlineOptimizeToolCallback` 中，传递 `onUpdate` 给这两个函数
  - [ ] 注意：`generateChildNodes` 和 `generateNodeContent` 可能调用工具函数（`generateChildNodesUtil` 等），需要确保这些工具函数也支持传递流式输出信息

- [ ] **terminal-tool.ts**
  - [ ] 修改 `analyzeOutput`，添加 `onUpdate` 参数
  - [ ] 在 `createAiTask` 后，立即通过 `onUpdate` 传递 `analysisTargetRef` 和 `analysisDonePromise`
  - [ ] 在 `terminalToolCallback` 中，如果启用分析，传递 `onUpdate` 给 `analyzeOutput`

- [ ] **metadata-tool.ts**
  - [ ] 修改 `generateTitleWithLLM`，添加 `onUpdate` 参数
  - [ ] 修改 `generateDescriptionWithLLM`，添加 `onUpdate` 参数
  - [ ] 修改 `generateKeywordsWithLLM`，添加 `onUpdate` 参数
  - [ ] 在三个函数中，在 `createAiTask` 后，立即通过 `onUpdate` 传递流式输出信息
  - [ ] 在 `metadataToolCallback` 中，传递 `onUpdate` 给这三个函数

- [ ] **todolist-tool.ts**
  - [ ] 修改 `generateTodoListWithLLM`，添加 `onUpdate` 参数
  - [ ] 在 `createAiTask` 后，立即通过 `onUpdate` 传递流式输出信息
  - [ ] 在 `todolistToolCallback` 中，传递 `onUpdate` 给 `generateTodoListWithLLM`

- [ ] **proofread-tool.ts**
  - [ ] 修改 `proofreadWithLLM`，添加 `onUpdate` 参数
  - [ ] 在 `createAiTask` 后，立即通过 `onUpdate` 传递流式输出信息
  - [ ] 在 `proofreadToolCallback` 中，传递 `onUpdate` 给 `proofreadWithLLM`

- [ ] **data-analysis-tool.ts**
  - [ ] 确认 `generateAnalysisSummary` 已经通过 `onUpdate` 传递 `reportTargetRef` 和 `reportDonePromise`
  - [ ] 验证数据格式是否正确，Display 组件能够识别

### 阶段3：Display 组件修改（对应工具）
- [ ] **DataAnalysisDisplay.vue**
  - [ ] 导入 `StreamingContentDisplay` 组件
  - [ ] 从 `displayData` 中提取 `reportTargetRef` 和 `reportDonePromise`
  - [ ] 在流式输出阶段，显示 `StreamingContentDisplay` 组件
  - [ ] 在流式输出完成后，显示最终结果

- [ ] **ChartGenerationDisplay.vue**
  - [ ] 导入 `StreamingContentDisplay` 组件
  - [ ] 从 `displayData` 中提取 `codeTargetRef` 和 `codeDonePromise`
  - [ ] 在流式输出阶段，显示 `StreamingContentDisplay` 组件（显示代码生成过程）
  - [ ] 在流式输出完成后，显示图表渲染结果

- [ ] **OutlineOptimizeDisplay.vue**
  - [ ] 导入 `StreamingContentDisplay` 组件
  - [ ] 从 `displayData` 中提取 `rawContentRef` 和 `rawContentDone`
  - [ ] 在流式输出阶段，显示 `StreamingContentDisplay` 组件
  - [ ] 在流式输出完成后，显示最终结果

- [ ] **TerminalExecutionDisplay.vue**
  - [ ] 导入 `StreamingContentDisplay` 组件
  - [ ] 从 `displayData` 中提取 `analysisTargetRef` 和 `analysisDonePromise`（如果启用分析）
  - [ ] 在流式输出阶段，显示 `StreamingContentDisplay` 组件（显示分析过程）
  - [ ] 在流式输出完成后，显示最终分析结果

- [ ] **MetadataDisplay.vue**
  - [ ] 导入 `StreamingContentDisplay` 组件
  - [ ] 从 `displayData` 中提取流式输出信息（根据不同的生成阶段，可能是 titleTargetRef, descriptionTargetRef, keywordsTargetRef）
  - [ ] 在流式输出阶段，显示 `StreamingContentDisplay` 组件
  - [ ] 在流式输出完成后，显示最终结果

- [ ] **TodoListDisplay.vue**
  - [ ] 导入 `StreamingContentDisplay` 组件
  - [ ] 从 `displayData` 中提取流式输出信息
  - [ ] 在流式输出阶段，显示 `StreamingContentDisplay` 组件
  - [ ] 在流式输出完成后，显示最终任务列表

- [ ] **ProofreadDisplay.vue**
  - [ ] 导入 `StreamingContentDisplay` 组件
  - [ ] 从 `displayData` 中提取流式输出信息
  - [ ] 在流式输出阶段，显示 `StreamingContentDisplay` 组件
  - [ ] 在流式输出完成后，显示最终校对结果

### 阶段4：AITask.vue 增强（工具级别的流式输出显示）
- [ ] **AITask.vue**
  - [ ] 导入 `StreamingContentDisplay` 组件
  - [ ] 从 `task.meta` 中提取 `__streamingRef` 和 `__streamingDone`
  - [ ] 如果有流式输出信息，显示 `StreamingContentDisplay` 组件
  - [ ] 确保与 Display 组件不冲突（如果工具有专门的 Display 组件，优先使用 Display 组件）

### 阶段5：工具函数修改（outline-ai-utils.ts）
- [ ] **outline-ai-utils.ts**
  - [ ] 修改 `generateChildNodes`，添加 `onUpdate` 参数（如果需要）
  - [ ] 修改 `generateNodeContent`，添加 `onUpdate` 参数（如果需要）
  - [ ] 在这两个函数中，通过 `onUpdate` 传递流式输出信息
  - [ ] 注意：这些函数可能在多个地方调用（Outline.vue 和 outline-optimize-tool.ts），需要保持向后兼容

## 关键技术细节

### 1. 流式输出信息的传递时机
- **关键**：必须在 `createAiTask` 后、`await done` 前，通过 `onUpdate` 传递流式输出信息
- **原因**：这样 Display 组件可以在LLM开始输出时就开始监听和显示，而不是等到输出完成后

### 2. onUpdate 数据格式规范
```typescript
onUpdate({
  content: {
    // 阶段标识（必需）
    stage: 'generating-streaming' | 'summarizing-streaming' | 'analyzing-streaming' | ...,
    
    // LLM流式输出信息（必需，如果涉及LLM输出）
    // 命名规范：{用途}TargetRef 和 {用途}DonePromise
    reportTargetRef?: Ref<string>,      // 数据分析工具
    reportDonePromise?: Promise<any>,
    
    codeTargetRef?: Ref<string>,        // 图表生成工具
    codeDonePromise?: Promise<any>,
    
    rawContentRef?: Ref<string>,        // 大纲优化工具
    rawContentDone?: Promise<any>,
    
    analysisTargetRef?: Ref<string>,    // 终端分析工具
    analysisDonePromise?: Promise<any>,
    
    titleTargetRef?: Ref<string>,       // 元信息工具（标题）
    titleDonePromise?: Promise<any>,
    
    descriptionTargetRef?: Ref<string>, // 元信息工具（描述）
    descriptionDonePromise?: Promise<any>,
    
    keywordsTargetRef?: Ref<string>,    // 元信息工具（关键词）
    keywordsDonePromise?: Promise<any>,
    
    // 其他工具特定的数据
    // ...
  },
  format: 'json',
  componentName: '...'  // 可选，Display 组件名称
}, {
  percentage: number,
  message: string
})
```

### 3. StreamingContentDisplay 组件使用规范
```vue
<StreamingContentDisplay
  :content-ref="streamingRef"
  :done="streamingDone"
  :style="{ minHeight: '200px' }"  // 可选，自定义样式
/>
```

**注意事项**：
- `contentRef` 必须是 `Ref<string>` 类型
- `done` 可以是 `Promise<any>`、`boolean` 或 `null`
- 组件会自动监听 `contentRef.value` 的变化，实时显示
- 组件会在 `done` 完成后自动隐藏（但保留内容）

### 4. Display 组件的兼容性处理
Display 组件需要同时支持：
1. **流式输出阶段**：显示 `StreamingContentDisplay` 组件
2. **最终结果阶段**：显示格式化后的最终结果
3. **进度更新**：显示进度条和进度消息

**实现模式**：
```vue
<template>
  <div class="tool-display">
    <!-- 进度条 -->
    <el-progress v-if="effectiveProgress" ... />
    
    <!-- LLM流式输出（如果有） -->
    <StreamingContentDisplay
      v-if="streamingRef && !streamingDone"
      :content-ref="streamingRef"
      :done="streamingDone"
    />
    
    <!-- 最终结果显示（流式输出完成后） -->
    <div v-if="displayData.stage === 'completed' || (streamingDone && streamingDone !== false)">
      <!-- 显示最终结果 ... -->
    </div>
  </div>
</template>
```

## 下一步行动（详细步骤）

### 第一步：修改核心架构（优先级：高，必须按顺序）
1. **tool-call-queue.ts** - 生成 invocationId，建立传递链路
2. **tool-runner.ts** - 添加 invocationId 和 onProgress 参数
3. **agent-tool-manager.ts** - 支持传入的 invocationId，调用 onStatusUpdate
4. **ai_tasks.ts** - 在 startAiTask 中保存流式输出信息

### 第二步：修改涉及LLM输出的工具（优先级：高，可以并行修改）
按重要性顺序：
1. **data-analysis-tool.ts** - 验证已实现的流式输出传递
2. **chart-generation-tool.ts** - 添加流式输出传递
3. **outline-optimize-tool.ts** - 添加流式输出传递（需要注意工具函数的调用链）
4. **todolist-tool.ts** - 添加流式输出传递
5. **metadata-tool.ts** - 添加流式输出传递（三个生成函数）
6. **proofread-tool.ts** - 添加流式输出传递
7. **terminal-tool.ts** - 添加流式输出传递（如果启用分析）

### 第三步：修改 Display 组件（优先级：高，对应工具）
按重要性顺序：
1. **DataAnalysisDisplay.vue** - 添加 StreamingContentDisplay 支持
2. **ChartGenerationDisplay.vue** - 添加 StreamingContentDisplay 支持
3. **OutlineOptimizeDisplay.vue** - 添加 StreamingContentDisplay 支持
4. **TodoListDisplay.vue** - 添加 StreamingContentDisplay 支持
5. **MetadataDisplay.vue** - 添加 StreamingContentDisplay 支持
6. **ProofreadDisplay.vue** - 添加 StreamingContentDisplay 支持
7. **TerminalExecutionDisplay.vue** - 添加 StreamingContentDisplay 支持（如果启用分析）

### 第四步：修改 AITask.vue（优先级：中）
- 添加 StreamingContentDisplay 支持，用于显示工具级别的流式输出（如果没有专门的 Display 组件）

### 第五步：修改 outline-ai-utils.ts（优先级：中）
- 如果需要，修改 `generateChildNodes` 和 `generateNodeContent`，支持传递流式输出信息

### 第六步：测试验证（优先级：高）
**测试内容**：
1. **实时进度更新**：确保所有工具的进度更新都能实时显示在 AITaskQueue 中
2. **LLM流式输出**：确保所有涉及LLM输出的工具，流式输出都能实时显示
3. **Display组件**：确保 Display 组件正确显示流式输出和最终结果
4. **工具取消**：确保工具取消时，流式输出内容被保留
5. **工具完成**：确保工具完成后，所有状态正确更新

## 实现提示词（供下一个Agent使用）

### 提示词模板

```
你是一个高级前端开发工程师，负责实现工具实时进度显示和LLM流式输出功能。

## 背景
我们已经将工具调用纳入AI任务系统管理，每个工具执行都会在AITaskQueue中显示。
现在需要实现：
1. 工具执行的实时进度更新（通过 onUpdate 回调）
2. 工具内部LLM调用的实时流式输出显示（使用 StreamingContentDisplay 组件）

## 核心要求

### 1. invocationId 传递链路
- ToolCallQueue 在创建 AI 任务前生成 invocationId
- invocationId 传递给 ToolRunner.runTool
- ToolRunner 传递给 agentToolManager.invokeTool
- agentToolManager 使用 invocationId 发送 eventBus 事件
- Display 组件使用 invocationId 监听事件

### 2. LLM流式输出传递
- 工具内部调用 createAiTask 时，创建 targetRef 接收流式输出
- 通过 onUpdate 回调传递 targetRef 和 donePromise：
  ```typescript
  onUpdate({
    content: {
      stage: 'generating-streaming',
      [用途]TargetRef: targetRef,  // 如 reportTargetRef, codeTargetRef
      [用途]DonePromise: donePromise
    },
    format: 'json'
  }, { percentage, message })
  ```
- startAiTask 保存流式输出信息到 task.meta
- Display 组件或 AITask.vue 提取流式输出信息，使用 StreamingContentDisplay 显示

### 3. StreamingContentDisplay 使用
- 组件路径：`meta-doc/src/renderer/src/components/common/StreamingContentDisplay.vue`
- Props：
  - contentRef: Ref<string> - 流式输出的ref，实时更新
  - done: Promise<any> - 任务完成Promise
  - style?: Record<string, string> - 自定义样式
- 行为：自动监听 contentRef 变化，实时显示；done 完成后自动隐藏

### 4. 工具修改规范
所有涉及LLM输出的工具，都需要：
1. 在 createAiTask 后，立即通过 onUpdate 传递 targetRef 和 donePromise
2. 使用规范的命名：{用途}TargetRef 和 {用途}DonePromise
3. 在 onUpdate 的 content 中包含 stage 信息，标识当前阶段

## 需要修改的文件清单

### 核心文件（必须按顺序修改）
1. tool-call-queue.ts - 生成 invocationId，传递给 ToolRunner
2. tool-runner.ts - 添加 invocationId 和 onProgress 参数
3. agent-tool-manager.ts - 支持传入的 invocationId，调用 onStatusUpdate
4. ai_tasks.ts - 在 startAiTask 中保存流式输出信息

### 工具文件（涉及LLM输出，按优先级修改）
1. data-analysis-tool.ts - 确认 onUpdate 格式（已实现，需要验证）
2. chart-generation-tool.ts - 添加流式输出传递
3. outline-optimize-tool.ts - 添加流式输出传递
4. terminal-tool.ts - 添加流式输出传递（如果启用分析）
5. metadata-tool.ts - 添加流式输出传递
6. todolist-tool.ts - 添加流式输出传递
7. proofread-tool.ts - 添加流式输出传递

### Display 组件（对应工具）
1. DataAnalysisDisplay.vue
2. ChartGenerationDisplay.vue
3. OutlineOptimizeDisplay.vue
4. TerminalExecutionDisplay.vue
5. MetadataDisplay.vue
6. TodoListDisplay.vue
7. ProofreadDisplay.vue
8. AITask.vue（工具级别的流式输出显示）

## 注意事项
1. 流式输出信息必须通过 onUpdate 传递，不能等到工具执行完成
2. targetRef 和 donePromise 的命名要规范，便于 Display 组件提取
3. StreamingContentDisplay 只在流式输出期间显示，完成后隐藏
4. Display 组件需要同时支持流式输出显示和最终结果显示
5. 工具取消时，流式输出内容应该被保留

请按照以上规范，逐步实现所有修改。每个文件的修改都要确保向后兼容，不要破坏现有功能。

## 完整实现提示词（供下一个Agent使用）

```
你是一个高级前端开发工程师，负责实现工具实时进度显示和LLM流式输出功能。

## 任务概述
实现工具执行的实时进度显示和LLM流式输出功能，让用户能够看到工具执行的实时进度和LLM生成的实时输出。

## 核心需求

### 1. 实时进度显示
- 工具执行过程中，通过 onUpdate 回调实时更新进度
- 进度信息包括：百分比、消息、阶段信息
- AITaskQueue 中的任务能够实时显示进度条和消息

### 2. LLM流式输出显示
- 对于涉及LLM输出的工具，实时显示LLM流式输出内容
- 使用 StreamingContentDisplay 组件显示纯文本流式输出
- 流式输出信息通过 onUpdate 回调传递 targetRef 和 donePromise

## 涉及LLM输出的工具（7个，必须全部支持）

### 优先级1：数据分析工具（已实现，需要验证）
- **文件**：`meta-doc/src/renderer/src/utils/agent-tools/data-analysis-tool.ts`
- **函数**：`generateAnalysisSummary()`
- **当前状态**：已经返回 `targetRef` 和 `donePromise`，并在 `onUpdate` 中传递
- **需要验证**：确认数据格式正确，Display 组件能够识别
- **流式输出命名**：`reportTargetRef` 和 `reportDonePromise`
- **Display组件**：`DataAnalysisDisplay.vue`

### 优先级2：图表生成工具（需要修改）
- **文件**：`meta-doc/src/renderer/src/utils/agent-tools/chart-generation-tool.ts`
- **函数**：`generateChartCodeWithLLM()`
- **当前状态**：使用 `target` ref 接收流式输出，但没有通过 `onUpdate` 传递
- **需要修改**：
  1. 修改 `generateChartCodeWithLLM` 函数签名，添加 `onUpdate` 参数
  2. 在 `createAiTask` 后、`await done` 前，通过 `onUpdate` 传递 `codeTargetRef` 和 `codeDonePromise`
  3. 在 `chartGenerationCallback` 中，传递 `onUpdate` 给 `generateChartCodeWithLLM`
- **流式输出命名**：`codeTargetRef` 和 `codeDonePromise`
- **Display组件**：`ChartGenerationDisplay.vue`

### 优先级3：大纲优化工具（需要修改，注意调用链）
- **文件**：`meta-doc/src/renderer/src/utils/agent-tools/outline-optimize-tool.ts`
- **函数**：`generateChildNodes()` 和 `generateNodeContent()`
- **当前状态**：使用 `rawContentRef` 接收流式输出，但没有通过 `onUpdate` 传递
- **需要注意**：这两个函数可能调用 `outline-ai-utils.ts` 中的工具函数，需要确保整个调用链都支持流式输出传递
- **需要修改**：
  1. 修改 `generateChildNodes` 和 `generateNodeContent`，添加 `onUpdate` 参数
  2. 在 `createAiTask` 后、`await done` 前，通过 `onUpdate` 传递 `rawContentRef` 和 `rawContentDone`
  3. 如果调用工具函数（`generateChildNodesUtil`、`generateNodeContentUtil`），需要确保这些函数也支持 `onUpdate` 参数
  4. 在 `outlineOptimizeToolCallback` 中，传递 `onUpdate` 给这两个函数
- **流式输出命名**：`rawContentRef` 和 `rawContentDone`
- **Display组件**：`OutlineOptimizeDisplay.vue`

### 优先级4：待办列表工具（需要修改）
- **文件**：`meta-doc/src/renderer/src/utils/agent-tools/todolist-tool.ts`
- **函数**：`generateTodoListWithLLM()`
- **当前状态**：使用 `target` ref 接收流式输出，但没有通过 `onUpdate` 传递
- **需要修改**：
  1. 修改 `generateTodoListWithLLM`，添加 `onUpdate` 参数
  2. 在 `createAiTask` 后、`await done` 前，通过 `onUpdate` 传递流式输出信息
  3. 在 `todolistToolCallback` 中，传递 `onUpdate` 给 `generateTodoListWithLLM`
- **流式输出命名**：`todoListTargetRef` 和 `todoListDonePromise`（或使用通用命名）
- **Display组件**：`TodoListDisplay.vue`

### 优先级5：元信息管理工具（需要修改，3个函数）
- **文件**：`meta-doc/src/renderer/src/utils/agent-tools/metadata-tool.ts`
- **函数**：`generateTitleWithLLM()`, `generateDescriptionWithLLM()`, `generateKeywordsWithLLM()`
- **当前状态**：都使用 `target` ref 接收流式输出，但没有通过 `onUpdate` 传递
- **需要修改**：
  1. 修改三个函数，都添加 `onUpdate` 参数
  2. 在 `createAiTask` 后、`await done` 前，通过 `onUpdate` 传递流式输出信息
  3. 使用不同的命名：`titleTargetRef`, `descriptionTargetRef`, `keywordsTargetRef`
  4. 在 `metadataToolCallback` 中，根据不同的生成类型，传递 `onUpdate` 给对应的函数
- **流式输出命名**：
  - `titleTargetRef` 和 `titleDonePromise`（标题生成）
  - `descriptionTargetRef` 和 `descriptionDonePromise`（描述生成）
  - `keywordsTargetRef` 和 `keywordsDonePromise`（关键词生成）
- **Display组件**：`MetadataDisplay.vue`

### 优先级6：校对工具（需要修改）
- **文件**：`meta-doc/src/renderer/src/utils/agent-tools/proofread-tool.ts`
- **函数**：`proofreadWithLLM()`
- **当前状态**：使用 `target` ref 接收流式输出，但没有通过 `onUpdate` 传递
- **需要修改**：
  1. 修改 `proofreadWithLLM`，添加 `onUpdate` 参数
  2. 在 `createAiTask` 后、`await done` 前，通过 `onUpdate` 传递流式输出信息
  3. 在 `proofreadToolCallback` 中，传递 `onUpdate` 给 `proofreadWithLLM`
- **流式输出命名**：`proofreadTargetRef` 和 `proofreadDonePromise`
- **Display组件**：`ProofreadDisplay.vue`

### 优先级7：终端执行工具（可选，如果启用分析）
- **文件**：`meta-doc/src/renderer/src/utils/agent-tools/terminal-tool.ts`
- **函数**：`analyzeOutput()`（仅在 `analyze=true` 时调用）
- **当前状态**：使用 `createAiTask`，但没有通过 `onUpdate` 传递流式输出
- **需要修改**：
  1. 修改 `analyzeOutput`，添加 `onUpdate` 参数
  2. 在 `createAiTask` 后、`await done` 前，通过 `onUpdate` 传递流式输出信息
  3. 在 `terminalToolCallback` 中，如果启用分析，传递 `onUpdate` 给 `analyzeOutput`
- **流式输出命名**：`analysisTargetRef` 和 `analysisDonePromise`
- **Display组件**：`TerminalExecutionDisplay.vue`

## 核心文件修改（必须按顺序）

### 1. tool-call-queue.ts（第一步）
**修改内容**：
- 在 `addTask` 时生成 `invocationId`，存储在 `ToolCallTask` 中
- 在创建 AI 任务时，传递 `invocationId` 到 `task.meta.invocationId`
- 在调用 `ToolRunner.runTool` 时，传递 `invocationId` 和 `onProgress` 回调

**关键代码**：
```typescript
// 在 addTask 方法中
addTask(toolCall: ToolCall) {
  const invocationId = `invocation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  const task: ToolCallTask = {
    ...toolCall,
    invocationId  // 新增：存储 invocationId
  }
  // ...
}

// 在 start 方法中，创建 AI 任务时
const { handle, done } = createAiTask(
  toolName,
  task.tool_id,
  taskResultRef,
  ai_types.tool,
  originKey,
  {
    toolId: task.tool_id,
    parameters: task.parameters,
    tool_call_id: task.tool_call_id,
    session: sessionForTool,
    invocationId: task.invocationId,  // 传递 invocationId
    stream: false
  }
)

// 在执行工具时
const observation = await ToolRunner.runTool(
  task.tool_id,
  task.parameters,
  this.signal,
  sessionForTool,
  task.invocationId,  // 传递 invocationId
  (status, data, progress) => {  // 传递 onProgress 回调
    // 进度更新会通过 eventBus 发送，使用 invocationId
    // 同时可以在这里更新 AI 任务状态
  }
)
```

### 2. tool-runner.ts（第二步）
**修改内容**：
- 修改 `runTool` 方法签名，添加 `invocationId` 和 `onProgress` 参数
- 传递 `invocationId` 给 `agentToolManager.invokeTool`
- 传递 `onProgress` 回调给 `agentToolManager.invokeTool`（作为 `onStatusUpdate` 参数）

**关键代码**：
```typescript
static async runTool(
  toolId: string,
  params: Record<string, unknown>,
  signal?: AbortSignal,
  session?: AgentSession,
  invocationId?: string,  // 新增
  onProgress?: (status: ToolExecutionStatus, data?: ToolCallbackData, progress?: ToolProgress) => void  // 新增
): Promise<ToolObservation> {
  // ...
  
  const result = await agentToolManager.invokeTool(
    toolId,
    toolParams,
    (status, data, progress) => {  // 包装 onProgress，作为 onStatusUpdate
      // 调用传入的 onProgress 回调
      onProgress?.(status, data, progress)
    },
    signal,
    invocationId  // 传递 invocationId（需要修改 agentToolManager.invokeTool 签名）
  )
  
  // ...
}
```

### 3. agent-tool-manager.ts（第三步）
**修改内容**：
- 修改 `invokeTool` 方法签名，添加 `invocationId` 参数（可选）
- 如果提供了 `invocationId`，使用它；否则生成新的
- 在 `onUpdate` 回调中，调用传入的 `onStatusUpdate` 回调

**关键代码**：
```typescript
async invokeTool(
  toolId: string,
  params: Record<string, unknown>,
  onStatusUpdate?: (status: ToolExecutionStatus, data?: ToolCallbackData, progress?: ToolProgress) => void,
  externalSignal?: AbortSignal,
  providedInvocationId?: string  // 新增：如果提供，使用它；否则生成新的
): Promise<ToolCallbackResult> {
  // 使用提供的 invocationId，如果没有则生成新的
  const invocationId = providedInvocationId || `invocation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  // ... 现有代码 ...
  
  // 在 onUpdate 回调中，同时调用 onStatusUpdate
  const onUpdate = (data: ToolCallbackData, progress?: ToolProgress) => {
    // 现有的 eventBus 发送（保留）
    emitToolUpdate(invocationId, data, progress)
    
    // 新增：调用外部传入的 onStatusUpdate 回调
    onStatusUpdate?.('running', data, progress)
  }
  
  // ... 执行工具 ...
}
```

### 4. ai_tasks.ts（第四步）
**修改内容**：
- 在 `startAiTask` 中，对于 `tool` 类型任务，创建 `onProgress` 回调
- 在 `onProgress` 回调中，检查 `data.content` 是否包含流式输出信息（`targetRef` 和 `donePromise`）
- 保存流式输出信息到 `task.meta.__streamingRef` 和 `__streamingDone`
- 实时更新 `task.target.value`（显示进度信息）

**关键代码**：
```typescript
} else if (task.type === ai_types.tool && task.target) {
  const logger = createRendererLogger('AiTasks')
  
  // 从 meta 中获取工具信息
  const toolId = task.meta?.toolId as string | undefined
  const parameters = task.meta?.parameters as Record<string, unknown> | undefined
  const session = task.meta?.session as AgentSession | undefined
  const invocationId = task.meta?.invocationId as string | undefined
  
  // 保存流式输出信息的容器
  let currentStreamingRef: Ref<string> | null = null
  let currentStreamingDone: Promise<any> | null = null
  
  // 创建进度回调
  const onProgress = (status: ToolExecutionStatus, data?: ToolCallbackData, progress?: ToolProgress) => {
    // 检查 data.content 中是否包含流式输出信息
    if (data && typeof data === 'object' && 'content' in data) {
      const content = (data as any).content
      
      if (content && typeof content === 'object') {
        // 检查各种可能的流式输出信息
        const streamingInfo = 
          (content.reportTargetRef && content.reportDonePromise) ? {
            ref: content.reportTargetRef,
            done: content.reportDonePromise
          } :
          (content.codeTargetRef && content.codeDonePromise) ? {
            ref: content.codeTargetRef,
            done: content.codeDonePromise
          } :
          (content.rawContentRef && content.rawContentDone) ? {
            ref: content.rawContentRef,
            done: content.rawContentDone
          } :
          (content.analysisTargetRef && content.analysisDonePromise) ? {
            ref: content.analysisTargetRef,
            done: content.analysisDonePromise
          } :
          (content.titleTargetRef && content.titleDonePromise) ? {
            ref: content.titleTargetRef,
            done: content.titleDonePromise
          } :
          (content.descriptionTargetRef && content.descriptionDonePromise) ? {
            ref: content.descriptionTargetRef,
            done: content.descriptionDonePromise
          } :
          (content.keywordsTargetRef && content.keywordsDonePromise) ? {
            ref: content.keywordsTargetRef,
            done: content.keywordsDonePromise
          } :
          (content.proofreadTargetRef && content.proofreadDonePromise) ? {
            ref: content.proofreadTargetRef,
            done: content.proofreadDonePromise
          } :
          (content.todoListTargetRef && content.todoListDonePromise) ? {
            ref: content.todoListTargetRef,
            done: content.todoListDonePromise
          } : null
        
        // 如果找到流式输出信息，保存到 task.meta
        if (streamingInfo) {
          currentStreamingRef = streamingInfo.ref
          currentStreamingDone = streamingInfo.done
          
          if (task.meta) {
            (task.meta as any).__streamingRef = streamingInfo.ref
            ;(task.meta as any).__streamingDone = streamingInfo.done
          }
          
          logger.debug('[startAiTask] 检测到LLM流式输出，已保存 targetRef 和 donePromise')
        }
      }
    }
    
    // 实时更新 task.target.value（显示进度信息）
    if (progress) {
      const progressText = `[${progress.percentage}%] ${progress.message || ''}`
      task.target.value = progressText
    } else if (data && typeof data === 'object' && 'content' in data) {
      const content = (data as any).content
      if (typeof content === 'string') {
        task.target.value = content
      }
    }
  }
  
  // 执行工具，传递 invocationId 和 onProgress
  const observation = await ToolRunner.runTool(
    toolId!,
    parameters!,
    controller.signal,
    session,
    invocationId,
    onProgress
  )
  
  // 工具执行完成后，保存最终的流式输出信息（如果有）
  if (currentStreamingRef && currentStreamingDone) {
    if (task.meta) {
      (task.meta as any).__streamingRef = currentStreamingRef
      ;(task.meta as any).__streamingDone = currentStreamingDone
    }
  }
  
  // ... 保存 observation 到 task.meta ...
}
```

## Display 组件修改规范

### 通用模式
所有涉及LLM流式输出的 Display 组件，都需要：

1. **导入 StreamingContentDisplay**
```vue
import StreamingContentDisplay from '../../common/StreamingContentDisplay.vue'
```

2. **从 displayData 中提取流式输出信息**
```typescript
const streamingRef = computed(() => {
  if (displayData.value && typeof displayData.value === 'object') {
    const content = displayData.value as any
    // 根据工具类型提取不同的流式输出信息
    return content.reportTargetRef 
        || content.codeTargetRef
        || content.rawContentRef
        || content.analysisTargetRef
        || content.titleTargetRef
        || content.descriptionTargetRef
        || content.keywordsTargetRef
        || content.proofreadTargetRef
        || content.todoListTargetRef
        || null
  }
  return null
})

const streamingDone = computed(() => {
  if (displayData.value && typeof displayData.value === 'object') {
    const content = displayData.value as any
    return content.reportDonePromise 
        || content.codeDonePromise
        || content.rawContentDone
        || content.analysisDonePromise
        || content.titleDonePromise
        || content.descriptionDonePromise
        || content.keywordsDonePromise
        || content.proofreadDonePromise
        || content.todoListDonePromise
        || null
  }
  return null
})
```

3. **在模板中使用 StreamingContentDisplay**
```vue
<template>
  <div class="tool-display">
    <!-- 进度条（如果有） -->
    <el-progress v-if="effectiveProgress" ... />
    
    <!-- LLM流式输出（如果有，且在流式输出阶段） -->
    <StreamingContentDisplay
      v-if="streamingRef && !isStreamingDone"
      :content-ref="streamingRef"
      :done="streamingDone"
      :style="{ minHeight: '200px', marginTop: '12px' }"
    />
    
    <!-- 最终结果显示（流式输出完成后） -->
    <div v-if="displayData.stage === 'completed' || isStreamingDone">
      <!-- 显示最终结果 ... -->
    </div>
  </div>
</template>

<script setup>
// 计算流式输出是否完成
const isStreamingDone = computed(() => {
  // 如果 streamingDone 是 Promise，需要特殊处理
  // 如果 streamingDone 是 boolean，直接使用
  if (streamingDone.value === null || streamingDone.value === undefined) {
    return false
  }
  if (typeof streamingDone.value === 'boolean') {
    return streamingDone.value
  }
  // 如果是 Promise，由 StreamingContentDisplay 组件处理
  return false
})
</script>
```

## 工具修改详细规范

### 通用模式（所有涉及LLM输出的工具）
```typescript
// 1. 修改函数签名，添加 onUpdate 参数
async function generateXXXWithLLM(
  // ... 现有参数 ...,
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void  // 新增参数
): Promise<ReturnType> {
  // 2. 创建 target ref 和 AI 任务
  const targetRef = ref('')
  const originKey = `tool-xxx-${Date.now()}`
  const messages: AIDialogMessage[] = [{ role: 'user', content: prompt }]
  
  const { handle, done } = createAiTask(
    '任务名称',
    messages,
    targetRef,
    'chat',
    originKey,
    { stream: true }
  )
  
  // 3. 关键：立即通过 onUpdate 传递流式输出信息（在 await done 之前）
  if (onUpdate) {
    onUpdate({
      content: {
        stage: 'xxx-generating-streaming',  // 工具特定的阶段标识
        xxxTargetRef: targetRef,            // 工具特定的命名：{用途}TargetRef
        xxxDonePromise: done                // 工具特定的命名：{用途}DonePromise
      },
      format: 'json',
      componentName: 'ToolDisplayComponent'  // 对应的 Display 组件名称
    }, {
      percentage: 当前进度百分比,
      message: '正在生成...（流式输出）'
    })
  }
  
  // 4. 等待 LLM 输出完成
  try {
    await done
  } catch (error) {
    // 处理取消错误（保留已生成的内容）
    const isCancelled = error instanceof Error && (
      error.message === '任务已取消' || 
      error.message.includes('任务已取消') ||
      (error as any).name === 'AbortError'
    )
    
    if (!isCancelled) {
      throw error
    }
  }
  
  // 5. 使用 targetRef.value 获取最终结果
  const finalResult = targetRef.value.trim()
  
  // 6. 流式输出完成后，通过 onUpdate 发送最终结果
  if (onUpdate) {
    onUpdate({
      content: {
        stage: 'completed',
        // 最终结果数据
      },
      format: 'json',
      componentName: 'ToolDisplayComponent'
    }, {
      percentage: 100,
      message: '生成完成'
    })
  }
  
  return finalResult
}

// 7. 在工具回调函数中，传递 onUpdate
const toolCallback: ToolCallback = async (params, signal, onUpdate) => {
  // ... 前置处理 ...
  
  const result = await generateXXXWithLLM(
    // ... 其他参数 ...,
    onUpdate  // 传递 onUpdate 参数
  )
  
  // ... 后续处理 ...
}
```

### 命名规范
- **数据分析工具**：`reportTargetRef` 和 `reportDonePromise`
- **图表生成工具**：`codeTargetRef` 和 `codeDonePromise`
- **大纲优化工具**：`rawContentRef` 和 `rawContentDone`
- **终端分析工具**：`analysisTargetRef` 和 `analysisDonePromise`
- **元信息工具**：`titleTargetRef`, `descriptionTargetRef`, `keywordsTargetRef` 和对应的 DonePromise
- **校对工具**：`proofreadTargetRef` 和 `proofreadDonePromise`
- **待办列表工具**：`todoListTargetRef` 和 `todoListDonePromise`

## 注意事项

1. **流式输出信息传递时机**：必须在 `createAiTask` 后、`await done` 前，通过 `onUpdate` 传递流式输出信息，这样 Display 组件才能在LLM开始输出时就开始监听和显示。

2. **命名规范**：必须使用规范的命名（`{用途}TargetRef` 和 `{用途}DonePromise`），便于 Display 组件提取。

3. **向后兼容**：修改函数签名时，`onUpdate` 参数应该是可选的（`onUpdate?:`），确保不影响现有调用。

4. **取消处理**：工具取消时，流式输出内容应该被保留，使用已生成的内容作为最终结果。

5. **Display组件优先级**：如果工具有专门的 Display 组件，优先使用 Display 组件显示流式输出；如果没有，使用 AITask.vue 中的 StreamingContentDisplay。

6. **工具函数调用链**：对于 `outline-optimize-tool.ts`，需要注意 `generateChildNodes` 和 `generateNodeContent` 可能调用 `outline-ai-utils.ts` 中的工具函数，需要确保整个调用链都支持 `onUpdate` 参数。

7. **Promise 处理**：`donePromise` 在传递给 Display 组件时，应该保持为 Promise 对象，不要等待完成后再传递。

## 测试要求

1. **实时进度更新测试**：
   - 验证所有工具的进度更新都能实时显示在 AITaskQueue 中
   - 验证进度条和消息能够实时更新

2. **LLM流式输出测试**：
   - 验证所有涉及LLM输出的工具，流式输出都能实时显示
   - 验证 StreamingContentDisplay 组件能够实时更新内容
   - 验证流式输出完成后，组件自动隐藏

3. **Display组件测试**：
   - 验证 Display 组件能够正确提取流式输出信息
   - 验证 Display 组件能够同时显示流式输出和最终结果
   - 验证流式输出阶段和最终结果阶段能够正确切换

4. **工具取消测试**：
   - 验证工具取消时，流式输出内容被保留
   - 验证取消后，Display 组件显示已生成的内容

5. **兼容性测试**：
   - 验证所有修改都向后兼容，不影响现有功能
   - 验证没有 Display 组件的工具也能正常工作

## 实现顺序建议

1. **第一步**：修改核心架构（tool-call-queue.ts, tool-runner.ts, agent-tool-manager.ts, ai_tasks.ts）
2. **第二步**：修改数据分析工具（验证已实现的流式输出传递）
3. **第三步**：修改图表生成工具（添加流式输出传递）
4. **第四步**：修改其他工具（按优先级顺序）
5. **第五步**：修改 Display 组件（对应工具）
6. **第六步**：修改 AITask.vue（工具级别的流式输出显示）
7. **第七步**：全面测试验证

请按照以上规范，逐步实现所有修改。每个文件的修改都要确保向后兼容，不要破坏现有功能。
```

## 总结

本文档详细分析了工具实时进度显示和LLM流式输出的实现方案，包括：

1. **问题分析**：当前工具执行流程和LLM流式输出机制的问题
2. **工具清单**：涉及LLM输出的7个工具，以及每个工具的具体修改要求
3. **核心架构修改**：invocationId 传递链路和进度回调机制的建立
4. **工具修改规范**：所有涉及LLM输出的工具都需要遵循的通用模式
5. **Display组件规范**：如何使用 StreamingContentDisplay 显示流式输出
6. **完整实现提示词**：供下一个Agent使用的详细实现指南

**关键要点**：
- 流式输出信息必须在 `createAiTask` 后、`await done` 前，通过 `onUpdate` 传递
- 使用规范的命名（`{用途}TargetRef` 和 `{用途}DonePromise`），便于 Display 组件提取
- StreamingContentDisplay 组件自动监听 `contentRef.value` 的变化，实时显示内容
- Display 组件需要同时支持流式输出显示和最终结果显示

**下一步**：将本文档交给下一个Agent，按照规范逐步实现所有修改。

