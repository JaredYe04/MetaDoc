# Agent Tool 系统文档

## 概述

Agent Tool系统是一个灵活、可扩展的工具框架，用于为AI Agent提供各种功能服务。系统支持内部Tool、外部Tool和MCP（Model Context Protocol）服务，提供了完整的Tool生命周期管理、状态跟踪、进度显示和交互式组件支持。

## 核心概念

### 1. Tool配置结构

每个Tool都需要一个TypeScript配置文件，包含以下核心属性：

```typescript
interface AgentToolConfig {
  // 必需属性
  id: string                    // Tool唯一标识
  name: LocalizedText          // Tool名称（支持i18n）
  description: LocalizedText   // Tool描述（支持i18n）
  origin: ToolOrigin           // Tool来源：'internal' | 'external' | 'mcp'
  instruction: string          // Markdown格式的详细说明
  callback: ToolCallback       // 回调函数（必须）
  
  // 可选属性
  displayComponent?: Component // 显示组件（可选）
  tags?: string[]              // 标签
  enabled?: boolean            // 是否启用
  editable?: boolean           // 是否可编辑（内部tool为false）
  mcpConfig?: MCPToolConfig    // MCP配置（如果是MCP tool）
  locales?: {                  // i18n文本映射
    [locale: string]: {
      name?: string
      description?: string
    }
  }
}
```

### 2. Tool回调函数规范

回调函数是Tool的核心，负责执行实际的功能逻辑：

```typescript
type ToolCallback = (
  params: Record<string, unknown>,      // 调用参数
  signal: AbortSignal,                   // 取消信号
  onUpdate: (data: ToolCallbackData, progress?: ToolProgress) => void  // 更新回调
) => Promise<ToolCallbackResult>
```

#### 回调函数返回值

```typescript
interface ToolCallbackResult {
  status: ToolExecutionStatus    // 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  data?: ToolCallbackData        // 中间数据（用于展示）
  progress?: ToolProgress       // 进度信息（可选）
  error?: string                // 错误信息
  result?: unknown              // 最终结果
}
```

#### 进度更新

回调函数可以通过`onUpdate`参数实时报告进度：

```typescript
onUpdate({
  content: { /* 数据内容 */ },
  format: 'json',
  componentName: 'MyToolDisplay'  // 可选：指定显示组件
}, {
  percentage: 50,
  message: '正在处理...'
})
```

### 3. 显示组件规范

显示组件用于展示Tool执行过程中的中间数据和结果。组件需要实现`ToolDisplayComponentProps`接口：

```typescript
interface ToolDisplayComponentProps {
  data: unknown                    // 当前回调数据
  status: ToolExecutionStatus      // 当前执行状态
  progress?: ToolProgress         // 当前进度（如果有）
  error?: string                  // 错误信息（如果有）
  toolConfig: AgentToolConfig     // 工具配置
  invocationId?: string           // Tool执行ID（用于eventBus实时通信）
  onUpdate?: (data: unknown) => void  // 更新回调（用于交互）
  onCancel?: () => void           // 取消回调
}
```

#### Tool与Display组件的实时通信机制

系统使用基于eventBus的实时通信机制，确保Display组件能够实时接收Tool执行过程中的更新。这个机制不仅适用于有Display组件的Tool，也适用于没有Display组件的Tool（fallback显示）。

**通信流程：**

1. **Tool执行开始**：
   - `AgentToolManager.invokeTool`在调用Tool时生成唯一的`invocationId`（格式：`invocation-{timestamp}-{random}`）
   - `AgentToolManager`通过eventBus发送`tool-invocation-started`事件，包含`invocationId`、`toolId`和`params`
   - 测试界面（`SettingDebugSection.vue`）监听此事件，获取`invocationId`并设置到对应的entry中

2. **建立连接**：
   - 测试界面使用`onToolUpdate`、`onToolComplete`、`onToolFailed`监听该Tool的更新事件
   - Display组件（如果有）通过`invocationId` prop接收执行ID，使用`useToolDisplayRealtime` composable监听eventBus事件

3. **实时更新**：
   - Tool回调函数通过`onUpdate`参数发送更新时，`AgentToolManager`会通过eventBus发送`tool-update:{invocationId}`事件
   - 事件包含：`{ invocationId, data, progress, timestamp }`
   - 测试界面和Display组件都会收到此事件并更新UI

4. **完成通知**：
   - Tool执行完成或失败时，`AgentToolManager`会发送`tool-complete:{invocationId}`或`tool-failed:{invocationId}`事件
   - 事件包含：`{ invocationId, status, data, error, progress, timestamp }`
   - 测试界面和Display组件都会收到此事件并更新最终状态

5. **Display组件响应**：
   - Display组件通过`invocationId` prop接收执行ID
   - 使用`useToolDisplayRealtime` composable监听eventBus事件，实时更新显示内容
   - 如果没有Display组件，测试界面会使用fallback的纯文本显示，同样会实时更新状态

**使用实时通信的Display组件示例：**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { ToolDisplayComponentProps } from '../../../types/agent-tool'
import { useToolDisplayRealtime, parseToolData } from '../composables/useToolDisplayRealtime'

const props = defineProps<ToolDisplayComponentProps>()

// 使用实时通信composable
const { realtimeData, realtimeStatus, realtimeProgress } = useToolDisplayRealtime(
  props.invocationId,  // 传入invocationId（必需，用于事件监听）
  props.data,           // 初始数据
  props.status,         // 初始状态
  props.progress        // 初始进度
)

// 解析显示数据（优先使用实时数据）
const displayData = computed(() => {
  const data = realtimeData.value !== null ? realtimeData.value : props.data
  return parseToolData(data)
})

// 使用实时状态和进度
const effectiveStatus = computed(() => {
  // 如果实时状态不是 'running'，使用实时状态；否则使用 props 中的状态
  return realtimeStatus.value !== 'running' ? realtimeStatus.value : props.status
})

const effectiveProgress = computed(() => {
  return realtimeProgress.value || props.progress
})
</script>
```

**关键点：**

- `invocationId` 是必需的，用于在eventBus中识别特定Tool执行实例
- `useToolDisplayRealtime` 会自动设置事件监听器，并在组件卸载时清理
- 如果 `invocationId` 为 `undefined`，composable 会输出警告，但不会设置监听器
- 实时数据会优先于初始 props 数据，确保UI始终显示最新状态

**优势：**

- **实时性**：Display组件能够立即响应Tool执行过程中的更新，无需等待Tool完成
- **解耦**：Tool和Display组件通过eventBus通信，不直接依赖
- **可扩展**：所有Display组件都可以使用相同的实时通信机制
- **向后兼容**：保留props传递机制，确保向后兼容
- **统一性**：无论Tool是否有Display组件，状态更新机制都是统一的

**事件命名规范：**

- `tool-invocation-started`: Tool执行开始事件，包含 `{ invocationId, toolId, params, timestamp }`
- `tool-update:{invocationId}`: Tool执行过程中的更新事件，包含 `{ invocationId, data, progress, timestamp }`
- `tool-complete:{invocationId}`: Tool执行完成事件，包含 `{ invocationId, status, data, error, progress, timestamp }`
- `tool-failed:{invocationId}`: Tool执行失败事件，包含 `{ invocationId, error, timestamp }`

**Entry查找机制：**

在测试界面（`SettingDebugSection.vue`）中，为了确保能够正确找到并更新entry，系统使用了多层次的查找策略：

1. **优先通过 `invocationId` 查找**：最可靠的方式，因为每个Tool执行都有唯一的ID
2. **通过 `toolId` 和 `timestamp` 查找**：作为后备方案，因为这两个值在创建entry时就确定了
3. **通过对象引用查找**：最后的后备方案，用于处理特殊情况

这种多层次的查找策略确保了即使在某些边缘情况下，entry也能被正确找到和更新。

**Vue响应式更新：**

为了确保Vue能够正确检测到状态变化，所有entry更新都使用`Array.splice()`方法：

```typescript
// ✅ 正确：使用 splice 方法
toolTestHistory.value.splice(index, 1, {
  ...oldEntry,
  status: newStatus
})

// ❌ 错误：直接赋值不会触发响应式更新
toolTestHistory.value[index].status = newStatus
```

**事件命名规范：**

- `tool-invocation-started`: Tool执行开始事件，包含 `{ invocationId, toolId, params, timestamp }`
- `tool-update:{invocationId}`: Tool执行过程中的更新事件，包含 `{ invocationId, data, progress, timestamp }`
- `tool-complete:{invocationId}`: Tool执行完成事件，包含 `{ invocationId, status, data, error, progress, timestamp }`
- `tool-failed:{invocationId}`: Tool执行失败事件，包含 `{ invocationId, error, timestamp }`

**Entry查找机制：**

在测试界面（`SettingDebugSection.vue`）中，为了确保能够正确找到并更新entry，系统使用了多层次的查找策略：

1. **优先通过 `invocationId` 查找**：最可靠的方式，因为每个Tool执行都有唯一的ID
2. **通过 `toolId` 和 `timestamp` 查找**：作为后备方案，因为这两个值在创建entry时就确定了
3. **通过对象引用查找**：最后的后备方案，用于处理特殊情况

这种多层次的查找策略确保了即使在某些边缘情况下，entry也能被正确找到和更新。

**Vue响应式更新：**

为了确保Vue能够正确检测到状态变化，所有entry更新都使用`Array.splice()`方法：

```typescript
// ✅ 正确：使用 splice 方法
toolTestHistory.value.splice(index, 1, {
  ...oldEntry,
  status: newStatus
})

// ❌ 错误：直接赋值不会触发响应式更新
toolTestHistory.value[index].status = newStatus
```

#### 交互式组件

显示组件不仅可以展示数据，还可以与用户交互。例如，可以渲染一个问卷调查表单，收集用户输入后通过`onUpdate`回调传递给Tool回调函数。对于需要用户交互的组件（如终端执行工具的批准界面），可以通过eventBus发送自定义事件，Tool回调函数监听这些事件并做出响应。

#### Display组件的主题同步和国际化

所有Display组件都应该支持主题同步和国际化（i18n），以确保与应用程序的整体UI风格和语言设置保持一致。

**主题同步：**

Display组件应该使用`themeState`来同步主题颜色和样式：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { themeState } from '../../themes'

// 创建主题样式 computed 属性
const containerStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor
}))

const statusMessageStyle = computed(() => ({
  color: themeState.currentTheme.textColor
}))
</script>

<template>
  <div :style="containerStyle">
    <div :style="statusMessageStyle">状态消息</div>
  </div>
</template>

<style scoped>
/* 使用 v-bind 动态绑定主题颜色 */
.status-message {
  color: v-bind('themeState.currentTheme.textColor');
  background-color: v-bind('themeState.currentTheme.background');
}
</style>
```

**国际化支持：**

Display组件应该使用`useI18n`来支持多语言：

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div>
    <span>{{ $t('agent.display.myTool.status') }}</span>
  </div>
</template>
```

**翻译键规范：**

所有Display组件的翻译键应该放在`locales/{locale}/agent.display.{toolName}`下，例如：

```json
{
  "agent": {
    "display": {
      "myTool": {
        "status": "状态",
        "loading": "加载中...",
        "error": "错误"
      }
    }
  }
}
```

**参考实现：**

- `DataAnalysisDisplay.vue`：完整实现了主题同步和i18n
- `ChartGenerationDisplay.vue`：完整实现了主题同步和i18n
- `TerminalExecutionDisplay.vue`：完整实现了主题同步和i18n
- `TodoListDisplay.vue`：完整实现了主题同步和i18n
- `RAGToolDisplay.vue`：完整实现了主题同步和i18n
- `AutoTestResultDisplay.vue`：完整实现了主题同步和i18n

### 4. Tool状态管理

Tool执行状态包括：
- `pending`: 等待开始
- `running`: 运行中
- `succeeded`: 已完成
- `failed`: 失败
- `cancelled`: 已取消

### 5. 存活检查（Alive Check）

每个Tool都应该能够响应存活检查。如果Tool超过一段时间（默认60秒）没有触发回调函数更新，系统会主动发起alive请求，检查Tool是否还存活。

## 创建内部Tool

### 步骤1：创建Tool配置文件

在`meta-doc/src/renderer/src/utils/agent-tools/`目录下创建Tool配置文件，例如`my-tool.ts`：

```typescript
import type { AgentToolConfig, ToolCallback } from '../../types/agent-tool'
import MyToolDisplay from '../../components/agent/tools/MyToolDisplay.vue'

const myToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  // 1. 参数验证
  const input = params.input as string
  if (!input) {
    return {
      status: 'failed',
      error: '缺少必需参数: input'
    }
  }

  // 2. 报告进度
  onUpdate({
    content: { stage: 'processing', input },
    format: 'json'
  }, {
    percentage: 30,
    message: '正在处理...'
  })

  // 3. 执行实际逻辑
  try {
    const result = await doSomething(input)
    
    // 4. 返回结果
    return {
      status: 'succeeded',
      data: {
        content: result,
        format: 'json',
        componentName: 'MyToolDisplay'
      },
      result
    }
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export const myToolConfig: AgentToolConfig = {
  id: 'my-tool',
  name: {
    'zh_cn': '我的工具',
    'en_us': 'My Tool'
  },
  description: {
    'zh_cn': '这是一个示例工具',
    'en_us': 'This is an example tool'
  },
  origin: 'internal',
  instruction: `# 我的工具

## 功能描述
详细描述工具的功能...

## 使用场景
- 场景1
- 场景2

## 输入参数
\`\`\`json
{
  "input": "string"
}
\`\`\`

## 输出格式
...`,
  callback: myToolCallback,
  displayComponent: MyToolDisplay,
  tags: ['example', 'internal'],
  enabled: true,
  editable: false,
  locales: {
    'zh_cn': {
      name: '我的工具',
      description: '这是一个示例工具'
    },
    'en_us': {
      name: 'My Tool',
      description: 'This is an example tool'
    }
  }
}
```

### 步骤2：创建显示组件（可选）

在`meta-doc/src/renderer/src/components/agent/tools/`目录下创建显示组件：

```vue
<template>
  <div class="my-tool-display">
    <!-- 根据data和status渲染内容 -->
    <div v-if="displayData.stage === 'processing'">
      正在处理: {{ displayData.input }}
    </div>
    <div v-else-if="displayData.stage === 'completed'">
      结果: {{ displayData.result }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ToolDisplayComponentProps } from '../../../types/agent-tool'

const props = defineProps<ToolDisplayComponentProps>()

const displayData = computed(() => {
  return props.data as { stage: string; input?: string; result?: string }
})
</script>
```

### 步骤3：注册Tool

在`meta-doc/src/renderer/src/utils/agent-tools/index.ts`中注册：

```typescript
import { myToolConfig } from './my-tool'

export function initializeAgentTools(): void {
  agentToolManager.registerTool(myToolConfig)
  // ... 其他Tool
}
```

## 插件化Tool系统

### 导入Tool配置

```typescript
import { toolPluginManager } from './utils/agent-tools/plugin-manager'

// 从JSON字符串导入
const jsonConfig = `{...}`
toolPluginManager.importToolConfigFromJSON(jsonConfig)

// 或从对象导入
toolPluginManager.importToolConfig(exportedConfig)
```

### 导出Tool配置

```typescript
// 导出为JSON字符串
const json = toolPluginManager.exportToolConfigAsJSON('tool-id')

// 导出为对象
const config = toolPluginManager.exportToolConfig('tool-id')
```

### MCP Tool支持

MCP（Model Context Protocol）Tool需要提供MCP配置：

```typescript
{
  id: 'mcp-tool',
  origin: 'mcp',
  mcpConfig: {
    serverName: 'my-mcp-server',
    toolName: 'my-tool',
    serverUrl: 'http://localhost:8080'
  },
  // ... 其他配置
}
```

## AgentToolResultCard组件

`AgentToolResultCard`组件负责显示Tool的调用结果，支持：

1. **纯文本显示**：如果Tool没有提供显示组件，使用纯文本渲染
2. **组件渲染**：如果Tool提供了显示组件，直接渲染组件
3. **进度条**：显示Tool执行进度（0-100）
4. **状态标签**：显示Tool执行状态（执行中、成功、失败）
5. **错误显示**：显示错误信息

组件会自动适配这两种方式，无需额外配置。

**状态更新机制：**

- 无论Tool是否有Display组件，状态都会通过eventBus实时更新
- 测试界面（`SettingDebugSection.vue`）会监听所有Tool执行事件，实时更新entry的状态
- 状态标签（"执行中"、"成功"、"失败"）会根据entry的`status`字段实时更新
- 使用Vue的响应式更新机制（`splice`方法），确保UI能够正确响应状态变化
- 即使Tool没有Display组件，fallback的纯文本显示也会实时更新状态

## Tool测试工具

系统提供了统一的Tool测试工具，位于**设置界面 → 开发者调试 → Agent Tool测试**标签页。这个工具可以帮助开发者快速测试和调试Tool。

### 功能特性

1. **Tool选择**
   - 下拉列表显示所有已注册的Tool
   - 自动加载Tool的显示名称（支持i18n）

2. **工具说明显示**
   - 在参数输入框上方显示只读的`instruction`字段
   - 帮助测试者了解Tool的功能、参数格式和使用场景
   - 使用等宽字体显示，便于阅读Markdown格式的说明

3. **参数配置**
   - 支持JSON格式的参数输入
   - 实时验证JSON格式
   - 根据Tool的`instruction`了解参数结构

4. **配置管理**
   - **新建配置**：保存当前Tool和参数为新的测试配置
   - **编辑配置**：修改已保存的配置
   - **加载配置**：快速加载已保存的配置
   - **删除配置**：删除不需要的配置
   - 配置自动保存到`localStorage`，支持多个配置
   - 切换Tool时自动尝试加载匹配的配置

5. **执行测试**
   - 执行Tool并实时显示进度
   - 显示所有中间输出（`onUpdate`调用）
   - 显示Tool的专用渲染组件（如果有）
   - 显示原始执行结果
   - 显示错误信息（如果有）

6. **测试历史**
   - 记录所有测试执行历史
   - 显示Tool名称、参数、时间戳
   - 支持查看历史结果和错误信息
   - 支持清空历史记录

### 使用流程

1. **选择Tool**：从下拉列表中选择要测试的Tool
2. **查看说明**：阅读工具说明，了解参数格式和使用场景
3. **输入参数**：在参数JSON输入框中输入测试参数
4. **保存配置（可选）**：点击"新建配置"保存当前配置，方便下次使用
5. **执行测试**：点击"执行Tool"按钮开始测试
6. **查看结果**：在结果区域查看执行结果、中间输出和渲染组件

### 配置管理示例

```json
// 示例：图表生成Tool的测试配置
{
  "id": "config_1234567890",
  "name": "图表生成_11-24_15:30",
  "toolId": "chart-generation",
  "paramsJson": "{\"prompt\": \"生成一个流程图\", \"chartType\": \"mermaid\", \"format\": \"svg\"}",
  "createdAt": 1234567890000,
  "updatedAt": 1234567890000
}
```

配置会自动保存到浏览器的`localStorage`中，键名为`agent-tool-test-configs`。

### 测试界面布局

```
┌─────────────────────────────────────────┐
│ 选择Tool: [下拉列表]                    │
├─────────────────────────────────────────┤
│ 保存的配置: [选择] [新建] [编辑] [删除] │
├─────────────────────────────────────────┤
│ ──── 参数配置 ────                      │
│ 工具说明: [只读文本域，显示instruction] │
│ 参数JSON: [可编辑文本域]                │
│ [执行Tool按钮]                          │
├─────────────────────────────────────────┤
│ ──── 执行结果 ────                      │
│ [原始结果]                              │
│ [渲染组件（如果有）]                    │
│ [测试历史列表]                          │
└─────────────────────────────────────────┘
```

## 最佳实践

### 1. 错误处理

- 始终在回调函数中使用try-catch
- 返回明确的错误信息
- 检查必需参数

### 2. 进度报告

- 对于耗时操作，定期报告进度
- 提供有意义的进度消息
- 进度百分比应该反映实际完成情况

### 3. 取消支持

- 检查`signal.aborted`状态
- 在适当的时候停止操作
- 清理资源

### 4. 数据格式

- 使用JSON格式便于序列化和展示
- 为复杂数据提供显示组件
- 保持数据结构清晰

### 5. i18n支持

- 为所有用户可见文本提供多语言支持
- 使用locales对象存储翻译
- 支持纯文本和i18n对象两种格式

### 6. 错误重试机制

所有Tool都应该支持自动重试机制，特别是涉及LLM调用和JSON解析的场景。系统提供了通用的工具函数来简化重试实现。

**为什么需要重试？**
- LLM可能返回格式不正确的JSON（包含中文标点、注释等）
- 网络请求可能临时失败
- 某些错误是暂时性的，重试可能成功

**使用工具函数：**

```typescript
import { parseJsonWithClean, retryWithBackoff, isJsonParseError } from './tool-utils'

// 方式1：使用 parseJsonWithClean 自动清理和解析JSON
const parseResult = parseJsonWithClean<TodoList>(llmOutput)
if (!parseResult.success) {
  // 解析失败，可以重试LLM调用
  if (retryCount < maxRetries && isJsonParseError(parseResult.error)) {
    return await generateWithLLM(params, retryCount + 1, parseResult.error)
  }
  throw new Error(parseResult.error)
}

// 方式2：使用 retryWithBackoff 包装整个操作
const result = await retryWithBackoff(
  async () => {
    const output = await callLLM()
    const parsed = parseJsonWithClean(output)
    if (!parsed.success) throw new Error(parsed.error)
    return parsed.data
  },
  {
    maxRetries: 2,
    retryable: isJsonParseError
  }
)
```

**重试策略：**
- **JSON解析错误**：自动清理JSON（替换中文标点、移除注释等）后重试
- **LLM调用失败**：重新调用LLM，并在提示词中包含错误信息，帮助LLM修复问题
- **网络错误**：使用指数退避策略重试
- **最大重试次数**：默认2次，可根据需要调整

**示例：参考 `todolist-tool.ts` 和 `chart-generation-tool.ts`**

### 7. instruction字段的重要性

`instruction`字段是Tool的详细说明文档，应该包含：

- **功能描述**：Tool的主要功能
- **使用场景**：什么情况下应该使用这个Tool
- **输入参数**：详细的参数说明，包括JSON Schema示例
- **输出格式**：返回数据的格式和结构
- **注意事项**：使用时的注意点、限制条件
- **与其他Tool的区别**：帮助AI Agent选择合适的Tool

**为什么重要？**
- 测试工具会显示instruction，帮助开发者了解Tool的使用方法
- AI Agent会读取instruction来决定是否调用Tool以及如何调用
- 清晰的instruction可以提高Tool的可用性和准确性

**示例：**
```markdown
# RAG知识库检索工具

## 功能描述
从用户的知识库中检索与查询问题相关的文档片段。

## 输入参数
\`\`\`json
{
  "question": "string",  // 必需，要检索的问题
  "scoreThreshold": 0.5  // 可选，相似度阈值（0-1）
}
\`\`\`

## 注意事项
- 需要先在知识库中上传文档
- scoreThreshold值越大，结果越精确但可能更少
```

## 实际应用示例

### RAG Tool示例

RAG Tool是系统中的一个完整示例，展示了如何：

1. 创建Tool配置和回调函数
2. 实现进度报告
3. 创建显示组件
4. 处理错误情况
5. **支持参数灵活性**：允许调用时手动指定相似度阈值，而不是只能使用设置中的默认值

**关键特性：**
- 参数验证：检查必需参数和参数类型
- 灵活配置：`scoreThreshold`可以从参数传入，也可以使用默认值
- 进度报告：实时报告检索进度
- 结果显示：使用专用组件展示检索结果

参考`meta-doc/src/renderer/src/utils/agent-tools/rag-tool.ts`和`meta-doc/src/renderer/src/components/agent/tools/RAGToolDisplay.vue`。

### 图表生成Tool示例

图表生成Tool展示了更复杂的Tool实现，包括：

1. **LLM集成**：Tool内部调用LLM生成图表代码
   - 使用`createAiTask`创建AI任务
   - 支持任务取消（通过`AbortSignal`）
   - 处理LLM调用错误

2. **错误重试机制**：所有图表类型都支持自动重试
   - 语法验证失败时自动重试（最多2次）
   - 渲染失败时自动重试
   - 传递错误信息给LLM，帮助修复问题

3. **代码清理和解析**：
   - ECharts：处理包含JavaScript函数的配置
   - 自动替换中文标点为英文标点
   - 移除注释和多余内容

4. **多格式支持**：支持SVG、PNG、PDF输出
   - 使用现有的渲染基础设施
   - 处理格式转换

5. **显示组件**：
   - 预览生成的图表
   - 提供下载功能
   - 显示生成过程和代码

**关键代码模式：**
```typescript
// 错误重试示例
if (retryCount < maxRetries) {
  const validation = await validateChartSyntax(code, chartType)
  if (!validation.valid) {
    // 传递错误信息，让LLM修复
    return await generateChartCodeWithLLM(
      prompt, chartType, target, signal,
      retryCount + 1, maxRetries, validation.error
    )
  }
}

// 参数灵活性示例
let scoreThreshold: number
if (params.scoreThreshold !== undefined) {
  scoreThreshold = parseFloat(String(params.scoreThreshold))
  // 验证范围
} else {
  scoreThreshold = await getSetting('defaultThreshold')
}
```

参考`meta-doc/src/renderer/src/utils/agent-tools/chart-generation-tool.ts`和`meta-doc/src/renderer/src/components/agent/tools/ChartGenerationDisplay.vue`。

## 常见问题

### Q: 如何让Tool支持用户交互？

A: 在显示组件中实现交互逻辑，通过`onUpdate`回调向Tool回调函数发送数据。Tool回调函数可以监听这些更新并做出响应。

### Q: 如何实现Tool的取消功能？

A: 在回调函数中检查`signal.aborted`，如果为true，立即停止操作并返回`{ status: 'cancelled' }`。

### Q: 如何添加新的内部Tool？

A: 按照"创建内部Tool"部分的步骤，创建配置文件、显示组件（可选），然后在`index.ts`中注册。

### Q: MCP Tool如何工作？

A: MCP Tool通过MCP协议连接到外部服务器。系统会创建MCP客户端，调用服务器上的工具。需要实现MCP客户端来支持此功能。

### Q: 如何测试我创建的Tool？

A: 使用系统提供的Tool测试工具：
1. 打开设置界面 → 开发者调试 → Agent Tool测试
2. 选择你创建的Tool
3. 查看工具说明了解参数格式
4. 输入测试参数（JSON格式）
5. 执行测试并查看结果
6. 可以保存配置，方便下次测试

### Q: 如何让Tool支持参数灵活性（如RAG Tool的scoreThreshold）？

A: 在回调函数中检查参数，优先使用传入的值，如果没有则使用默认值：
```typescript
const value = params.customParam !== undefined 
  ? params.customParam 
  : await getSetting('defaultValue')
```

### Q: 如何实现错误重试机制（如图表生成Tool和TodoList Tool）？

A: 使用系统提供的工具函数，有两种方式：

**方式1：手动重试（推荐用于LLM调用）**
```typescript
import { parseJsonWithClean, isJsonParseError } from './tool-utils'

async function generateWithLLM(params, retryCount = 0, maxRetries = 2, lastError?: string) {
  const output = await callLLM(params, lastError) // 传递错误信息给LLM
  const parseResult = parseJsonWithClean(output)
  
  if (!parseResult.success) {
    if (retryCount < maxRetries && isJsonParseError(parseResult.error)) {
      return await generateWithLLM(params, retryCount + 1, maxRetries, parseResult.error)
    }
    throw new Error(parseResult.error)
  }
  
  return parseResult.data
}
```

**方式2：使用 retryWithBackoff（推荐用于网络请求等）**
```typescript
import { retryWithBackoff, isRetryableError } from './tool-utils'

const result = await retryWithBackoff(
  async () => {
    const output = await callLLM()
    const parsed = parseJsonWithClean(output)
    if (!parsed.success) throw new Error(parsed.error)
    return parsed.data
  },
  {
    maxRetries: 2,
    retryable: isRetryableError
  }
)
```

参考 `todolist-tool.ts` 和 `chart-generation-tool.ts` 的完整实现。

## 外部Tool扩展指南

系统提供了统一的运行时服务接口，供外部Tool扩展使用。这些接口封装了应用程序的核心服务，包括主题状态、国际化、工作区管理和本地IPC接口。

### 服务接口概览

所有服务接口都通过`agentToolServices`单例提供：

```typescript
import { agentToolServices } from './agent-tool-services'

// 获取各个服务
const themeService = agentToolServices.getThemeService()
const i18nService = agentToolServices.getI18nService()
const workspaceService = agentToolServices.getWorkspaceService()
const ipcService = agentToolServices.getIpcService()
```

### 1. 主题服务（ThemeService）

用于获取当前主题信息和监听主题变化。

**接口定义：**

```typescript
interface ThemeService {
  getCurrentTheme(): {
    type: 'light' | 'dark'
    background: string
    background2nd: string
    textColor: string
    textColor2: string
    [key: string]: any
  }
  onThemeChange(callback: (theme: any) => void): () => void
}
```

**使用示例：**

```typescript
import { getThemeService } from './agent-tool-services'

const themeService = getThemeService()

// 获取当前主题
const currentTheme = themeService.getCurrentTheme()
console.log('当前主题类型:', currentTheme.type)
console.log('背景色:', currentTheme.background)
console.log('文本颜色:', currentTheme.textColor)

// 监听主题变化
const unwatch = themeService.onThemeChange((newTheme) => {
  console.log('主题已更改为:', newTheme.type)
  // 更新UI样式
})

// 取消监听
unwatch()
```

### 2. 国际化服务（I18nService）

用于获取当前语言和翻译文本。

**接口定义：**

```typescript
interface I18nService {
  getCurrentLocale(): string
  t(key: string, params?: Record<string, any>): string
  onLocaleChange(callback: (locale: string) => void): () => void
}
```

**使用示例：**

```typescript
import { getI18nService } from './agent-tool-services'

const i18nService = getI18nService()

// 获取当前语言
const currentLocale = i18nService.getCurrentLocale()
console.log('当前语言:', currentLocale) // 例如: 'zh_cn', 'en_us'

// 翻译文本
const translated = i18nService.t('agent.display.myTool.status')
console.log('翻译结果:', translated)

// 带参数的翻译
const translatedWithParams = i18nService.t('agent.display.myTool.count', { count: 5 })
console.log('翻译结果:', translatedWithParams) // 例如: "共 5 项"

// 监听语言变化
const unwatch = i18nService.onLocaleChange((newLocale) => {
  console.log('语言已更改为:', newLocale)
  // 更新UI文本
})

// 取消监听
unwatch()
```

### 3. 工作区服务（WorkspaceService）

用于获取当前文档和工作区信息。

**接口定义：**

```typescript
interface WorkspaceService {
  getActiveDocument(): {
    id: string
    path: string
    format: 'md' | 'tex'
    markdown: string
    tex: string
    meta: any
    outline: any
  } | null
  getTabs(): Array<{
    id: string
    title: string
    path: string
    format: 'md' | 'tex'
  }>
  getActiveTabId(): string | null
  onDocumentChange(callback: (document: any) => void): () => void
}
```

**使用示例：**

```typescript
import { getWorkspaceService } from './agent-tool-services'

const workspaceService = getWorkspaceService()

// 获取当前活动文档
const activeDoc = workspaceService.getActiveDocument()
if (activeDoc) {
  console.log('文档路径:', activeDoc.path)
  console.log('文档格式:', activeDoc.format)
  console.log('Markdown内容:', activeDoc.markdown)
  console.log('文档元数据:', activeDoc.meta)
}

// 获取所有标签页
const tabs = workspaceService.getTabs()
console.log('所有标签页:', tabs)

// 获取当前活动标签页ID
const activeTabId = workspaceService.getActiveTabId()
console.log('活动标签页ID:', activeTabId)

// 监听文档变化
const unwatch = workspaceService.onDocumentChange((newDoc) => {
  console.log('文档已更改:', newDoc.path)
  // 更新UI或执行其他操作
})

// 取消监听
unwatch()
```

### 4. IPC服务（IpcService）

用于访问本地文件系统和系统对话框（仅在Electron环境中可用）。

**接口定义：**

```typescript
interface IpcService {
  showOpenDialog(options?: {
    title?: string
    defaultPath?: string
    filters?: Array<{ name: string; extensions: string[] }>
    properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>
  }): Promise<string | string[] | null>
  
  showSaveDialog(options?: {
    title?: string
    defaultPath?: string
    filters?: Array<{ name: string; extensions: string[] }>
  }): Promise<string | null>
  
  openFolder(path: string): Promise<void>
  openFile(path: string): Promise<void>
  readFile(filePath: string): Promise<string>
  writeFile(filePath: string, content: string): Promise<void>
  fileExists(filePath: string): Promise<boolean>
  getDirectoryPath(filePath: string): Promise<string>
}
```

**使用示例：**

```typescript
import { getIpcService } from './agent-tool-services'

const ipcService = getIpcService()

// 打开文件对话框
const selectedFile = await ipcService.showOpenDialog({
  title: '选择文件',
  filters: [
    { name: 'Markdown Files', extensions: ['md'] },
    { name: 'All Files', extensions: ['*'] }
  ],
  properties: ['openFile']
})
if (selectedFile) {
  console.log('选中的文件:', selectedFile)
}

// 打开保存文件对话框
const savePath = await ipcService.showSaveDialog({
  title: '保存文件',
  defaultPath: 'output.md',
  filters: [
    { name: 'Markdown Files', extensions: ['md'] }
  ]
})
if (savePath) {
  console.log('保存路径:', savePath)
}

// 打开文件夹（在系统文件管理器中）
await ipcService.openFolder('/path/to/folder')

// 打开文件（使用系统默认应用）
await ipcService.openFile('/path/to/file.md')

// 读取文件内容
const content = await ipcService.readFile('/path/to/file.md')
console.log('文件内容:', content)

// 写入文件内容
await ipcService.writeFile('/path/to/output.md', '# Hello World')

// 检查文件是否存在
const exists = await ipcService.fileExists('/path/to/file.md')
console.log('文件是否存在:', exists)

// 获取文件所在目录路径
const dirPath = await ipcService.getDirectoryPath('/path/to/file.md')
console.log('目录路径:', dirPath) // '/path/to'
```

**注意事项：**

- IPC服务仅在Electron环境中可用，在Web环境中调用会抛出错误
- 所有IPC方法都是异步的，需要使用`await`或`.then()`
- 文件对话框方法在用户取消时会返回`null`

### 在外部Tool中使用服务

外部Tool可以在回调函数中使用这些服务：

```typescript
import { getThemeService, getI18nService, getWorkspaceService, getIpcService } from './agent-tool-services'

const myToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  // 获取服务
  const themeService = getThemeService()
  const i18nService = getI18nService()
  const workspaceService = getWorkspaceService()
  const ipcService = getIpcService()
  
  // 使用主题服务
  const theme = themeService.getCurrentTheme()
  console.log('当前主题:', theme.type)
  
  // 使用国际化服务
  const statusText = i18nService.t('agent.display.myTool.processing')
  onUpdate({
    content: { status: statusText },
    format: 'json'
  })
  
  // 使用工作区服务
  const activeDoc = workspaceService.getActiveDocument()
  if (activeDoc) {
    console.log('当前文档:', activeDoc.path)
  }
  
  // 使用IPC服务（仅在Electron环境中）
  try {
    const filePath = await ipcService.showOpenDialog({
      title: '选择数据文件',
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    })
    if (filePath) {
      const content = await ipcService.readFile(filePath as string)
      // 处理文件内容...
    }
  } catch (error) {
    console.warn('IPC服务不可用（可能不在Electron环境中）:', error)
  }
  
  return {
    status: 'succeeded',
    result: { /* ... */ }
  }
}
```

### 服务接口的优势

1. **统一接口**：所有外部Tool使用相同的服务接口，无需直接访问内部实现
2. **类型安全**：TypeScript接口定义确保类型安全
3. **向后兼容**：内部Tool可以直接导入服务，接口变更不会影响现有代码
4. **环境适配**：服务接口会自动适配Electron和Web环境
5. **易于测试**：服务接口可以轻松mock，便于单元测试

## 未来扩展

- [ ] MCP客户端完整实现
- [ ] Tool市场/仓库
- [ ] Tool版本管理
- [ ] Tool依赖管理
- [ ] 更丰富的交互组件库
- [ ] 服务接口的事件总线支持（用于跨组件通信）

## 相关文件

- 类型定义: `src/renderer/src/types/agent-tool.ts`
- Tool管理器: `src/renderer/src/utils/agent-tool-manager.ts`
- 插件管理器: `src/renderer/src/utils/agent-tools/plugin-manager.ts`
- 实时通信机制: `src/renderer/src/utils/agent-tools/tool-display-communication.ts`
- 实时通信Composable: `src/renderer/src/utils/agent-tools/composables/useToolDisplayRealtime.ts`
- **工具函数**: `src/renderer/src/utils/agent-tools/tool-utils.ts` (JSON清理、重试机制等)
- **公共服务接口**: `src/renderer/src/utils/agent-tools/agent-tool-services.ts` (主题、i18n、工作区、IPC服务)
- RAG Tool示例: `src/renderer/src/utils/agent-tools/rag-tool.ts`
- 图表生成Tool示例: `src/renderer/src/utils/agent-tools/chart-generation-tool.ts`
- TodoList Tool示例: `src/renderer/src/utils/agent-tools/todolist-tool.ts` (包含错误重试示例)
- 显示组件: `src/renderer/src/utils/agent-tools/components/`
- Tool测试界面: `src/renderer/src/views/setting/SettingDebugSection.vue`
- 结果展示组件: `src/renderer/src/components/agent/AgentToolResultCard.vue`

