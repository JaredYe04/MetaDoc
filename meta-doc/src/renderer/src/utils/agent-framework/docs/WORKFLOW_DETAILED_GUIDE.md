# 工作流（Workflow）详细使用指南

本文档是工作流系统的完整使用指南，包括语法规则、使用方法和最佳实践。

## 目录

1. [概述](#概述)
2. [工作流结构](#工作流结构)
3. [伪代码语法规则](#伪代码语法规则)
4. [图形视图和代码视图](#图形视图和代码视图)
5. [内置工作流](#内置工作流)
6. [最佳实践](#最佳实践)
7. [常见问题](#常见问题)

## 概述

工作流系统是MetaDoc Agent框架的核心组件，用于定义和执行标准化的Agent执行流程。工作流以程序流程图的方式规定了固定的、标准化的执行流程，减少由于大模型随机性造成的结果差异，使结果更为可控。

### 核心特性

- **图形化编辑**：使用draw.io（mxgraph）提供的可视化画布编辑工作流
- **代码视图**：支持伪代码编辑，可以快速定义和修改工作流
- **双向转换**：图形视图和代码视图可以无缝切换
- **内置工作流**：提供三个内置工作流模板（文章扩写、智能绘图、文章润色）
- **作为Tool**：工作流本身也是Tool，可以在Agent会话中使用

## 工作流结构

### 节点类型

#### 1. 工件节点（ArtifactNode）

执行实际操作的节点，包括：

- **`tool`**：调用工具
  - 需要在`artifactId`字段指定工具ID
  - 例如：`rag-tool`、`chart-generation`、`edit-tool`

- **`llm-decision`**：LLM决策节点
  - 使用LLM进行决策判断
  - 需要在`config.prompt`中定义决策提示词

- **`workflow`**：嵌套工作流
  - 可以在工作流中调用其他工作流
  - 需要在`artifactId`字段指定工作流ID

- **`agent-config`**：子Agent（Sub Agent）
  - 创建一个独立的Agent实例执行任务
  - 需要在`artifactId`字段指定AgentConfig ID

#### 2. 控制流节点（ControlFlowNode）

控制执行流程的节点，包括：

- **`condition`**：条件判断
  - 根据条件表达式决定执行路径
  - 条件表达式在`config.condition`中定义

- **`loop`**：循环
  - 循环执行某个节点或节点序列
  - `config.loopCondition`：循环条件
  - `config.maxIterations`：最大迭代次数

- **`parallel`**：并行执行
  - 并行执行多个节点
  - `config.parallelCount`：并行数量

- **`merge`**：合并
  - 合并多个并行执行的路径

- **`async`**：异步执行
  - 异步执行某个节点，不阻塞后续执行

- **`aggregate`**：汇总
  - 汇总多个节点的输出
  - `config.aggregateStrategy`：汇总策略（如"merge"、"concat"等）

### 节点输入输出

每个节点都有明确的输入和输出定义。

**输入（ArtifactInput）**：
```typescript
{
  name: 'question',          // 参数名称
  type: 'string',            // 参数类型
  required: true,            // 是否必需
  sourceType: 'upstream',    // 输入来源类型
  // 根据sourceType的不同，有以下字段：
  // - constant: sourceValue
  // - variable: variableName
  // - upstream: upstreamNodeId, upstreamField
  // - context: contextKey
}
```

**输入来源类型**：
- `constant`：常量值，在`sourceValue`中指定
- `variable`：工作流变量，在`variableName`中指定变量名
- `upstream`：上游节点的输出，需要指定`upstreamNodeId`和`upstreamField`
- `context`：公共上下文空间，在`contextKey`中指定键名

**输出（ArtifactOutput）**：
- 输出字段名、类型、描述
- Tool的输出由工具本身定义
- LLM决策节点的输出由提示词决定

### 边（Edge）

边连接节点，定义数据流向和执行顺序：

```typescript
{
  id: 'edge-1',
  source: 'node-1',          // 源节点ID
  target: 'node-2',          // 目标节点ID
  label: '连接标签',         // 可选的边标签
  condition: 'value > 0',    // 可选的边条件（用于条件跳转）
  sourceField: 'results',    // 源节点的输出字段
  targetField: 'input'       // 目标节点的输入字段
}
```

### 工作流变量

工作流可以定义变量，用于在整个工作流中共享数据：

```typescript
{
  name: 'result',
  type: 'string',
  defaultValue: '',
  description: '处理结果'
}
```

### 工作流配置

```typescript
{
  concurrent: true,          // 是否支持并发执行
  timeout: 60000,           // 超时时间（毫秒）
  retry: {
    maxAttempts: 3,          // 最大重试次数
    backoff: 'exponential',  // 退避策略
    delay: 1000             // 重试延迟（毫秒）
  }
}
```

## 伪代码语法规则

工作流支持使用伪代码进行定义和编辑。伪代码是一种轻量级的编程语言，语法简洁明了。

### 基本语法

#### 工作流定义

```
workflow "工作流名称" {
  id: "workflow-id"
  entry: entry-node-id
  exit: exit-node-id-1, exit-node-id-2
}
```

#### 变量定义

```
var variableName: type = defaultValue
```

示例：
```
var userQuestion: string = ""
var result: object = {}
```

#### 工件节点定义

```
nodeId: nodeType "artifactId" {
  label: "节点标签"
  position: (x, y)
  // 节点特定配置
}
```

节点类型：
- `tool`：工具节点
- `llm-decision`：LLM决策节点
- `workflow`：工作流节点
- `agent-config`：子Agent节点

示例：
```
rag-node: tool "rag-tool" {
  label: "RAG检索"
  position: (100, 200)
}

decision-node: llm-decision "" {
  label: "LLM决策"
  position: (300, 200)
  prompt: "分析用户问题并决定处理方式"
}
```

#### 控制流节点定义

```
nodeId: nodeType {
  label: "节点标签"
  position: (x, y)
  // 类型特定配置
}
```

控制流节点类型：
- `condition`：条件判断
- `loop`：循环
- `parallel`：并行
- `merge`：合并
- `async`：异步
- `aggregate`：汇总

示例：
```
condition-node: condition {
  label: "结果判断"
  position: (200, 200)
  condition: "results.length > 0"
}

loop-node: loop {
  label: "循环处理"
  position: (400, 200)
  condition: "i < 10"
  maxIterations: 100
}
```

#### 边定义

```
sourceNodeId -> targetNodeId {
  label: "连接标签"
  condition: "条件表达式"
  sourceField: "源字段"
  targetField: "目标字段"
}
```

简化形式（无需额外配置）：
```
sourceNodeId -> targetNodeId
```

#### 条件分支

```
if (condition-node.condition) {
  condition-node -> true-node
} else {
  condition-node -> false-node
}
```

### 完整示例

```
workflow "文章扩写工作流" {
  id: "article-expansion"
  entry: llm-decision-expand
  exit: outline-optimize-node

  var operation: string = ""
  var nodePath: string = ""
  var userPrompt: string = ""

  llm-decision-expand: llm-decision "" {
    label: "LLM决策扩写点"
    position: (200, 150)
    prompt: "分析文章大纲，决定在哪个节点添加子章节或生成内容"
  }

  outline-optimize-node: tool "outline-optimize" {
    label: "大纲优化工具"
    position: (400, 150)
  }

  llm-decision-expand -> outline-optimize-node {
    sourceField: "operation"
    targetField: "operation"
  }
}
```

## 图形视图和代码视图

工作流编辑器支持两种视图模式：

### 图形视图

- 使用mxgraph库提供的可视化画布
- 支持拖拽节点、连接节点、编辑节点属性
- 工具栏提供多种工具模式：
  - **指针模式**：选择和移动节点
  - **框选模式**：框选多个节点
  - **拖动画布模式**：拖动画布视图
  - **文字编辑模式**：编辑节点文本
  - **删除模式**：删除节点和连接
- 支持键盘快捷键：
  - `Ctrl+C`：复制选中节点
  - `Ctrl+V`：粘贴节点
  - `Delete`：删除选中节点
  - `Ctrl+A`：全选

### 代码视图

- 使用Monaco Editor提供代码编辑体验
- 支持语法高亮
- 支持实时预览和验证
- 与图形视图双向同步

### 切换视图

在工具栏中可以随时切换图形视图和代码视图。切换时，两种视图会自动同步。

## 内置工作流

MetaDoc提供了三个内置工作流，这些工作流无法删除，位于"默认工作流"工具集中。

### 1. 文章扩写（Article Expansion）

**ID**: `builtin-article-expansion`

**功能**: 使用大纲优化工具，在合适的地方添加子章节并生成内容。

**流程**:
1. LLM决策节点分析文章大纲，决定扩写位置
2. 调用`outline-optimize`工具添加子章节或生成内容

**使用场景**: 
- 扩展文章内容
- 为现有章节添加子章节
- 生成章节详细内容

### 2. 智能绘图（Smart Charting）

**ID**: `builtin-smart-charting`

**功能**: 阅读文章，在合适的位置生成图表。

**流程**:
1. LLM决策节点分析文章，决定图表类型和位置
2. 调用`chart-generation`工具生成图表
3. 使用`edit`工具将图表插入到文档中

**使用场景**:
- 为文章添加可视化内容
- 生成数据图表
- 创建流程图、示意图等

### 3. 文章润色（Article Polishing）

**ID**: `builtin-article-polishing`

**功能**: 阅读文章，在合适的位置进行文字替换、插入、删除操作。

**流程**:
1. LLM决策节点分析文章，决定润色策略
2. 可选择性地使用RAG工具检索知识库（默认开启）
3. 调用`edit`工具进行文本编辑

**使用场景**:
- 优化文章表达
- 修正语法错误
- 改进文章结构

## 最佳实践

### 1. 节点设计

- **保持节点职责单一**：每个节点只做一件事
- **明确输入输出格式**：使用JSON Schema定义输入输出
- **使用有意义的节点标签**：标签应该清晰描述节点功能

### 2. 变量使用

- **使用变量传递复杂数据**：避免在节点间直接传递大量数据
- **合理命名变量**：使用描述性的变量名
- **设置默认值**：为变量设置合理的默认值

### 3. 错误处理

- **在关键节点添加错误处理逻辑**：使用条件节点处理异常情况
- **设置合理的超时时间**：避免工作流无限等待
- **实现重试机制**：对于可能失败的节点，配置重试

### 4. 性能优化

- **使用并行节点**：对于可以并行的操作，使用并行节点提高效率
- **合理设置超时时间**：平衡性能和用户体验
- **避免深层嵌套**：工作流嵌套层级不宜过深

### 5. 可维护性

- **使用清晰的工作流名称和描述**：便于理解和维护
- **添加必要的注释**：在代码视图中使用注释说明
- **版本管理**：更新工作流时更新版本号
- **文档化**：为复杂的工作流编写使用文档

## 常见问题

### Q: 如何在工作流中使用变量？

A: 在节点输入中使用`sourceType: 'variable'`，并指定`variableName`。工作流变量在整个工作流中共享。

### Q: 如何在工作流中调用其他工作流？

A: 创建一个类型为`workflow`的工件节点，在`artifactId`字段中指定要调用的工作流ID。

### Q: 如何实现条件分支？

A: 使用`condition`类型的控制流节点，在边的`condition`字段中定义条件表达式。可以有多个边连接到不同的目标节点。

### Q: 如何实现循环？

A: 使用`loop`类型的控制流节点，在`config.loopCondition`中定义循环条件，在`config.maxIterations`中设置最大迭代次数。

### Q: 工作流可以嵌套吗？

A: 可以。工作流节点可以在一个工作流中调用另一个工作流，支持多层嵌套。

### Q: 如何导出和导入工作流？

A: 在工作流管理界面中，点击"导出"按钮可以导出工作流为JSON文件。导入时选择"导入"按钮，选择JSON文件即可。

## 相关文件

- 类型定义: `src/types/agent-framework.ts`
- 管理器: `src/utils/agent-framework/workflow-manager.ts`
- 执行器: `src/utils/agent-framework/workflow-executor.ts`（待实现）
- 伪代码工具: `src/utils/agent-framework/workflow-pseudo-code.ts`
- 缩略图生成: `src/utils/agent-framework/workflow-thumbnail.ts`
- 内置工作流: `src/utils/agent-framework/builtin-workflows.ts`
- 画布组件: `src/components/agent/workflow/WorkflowCanvas.vue`
- 管理界面: `src/components/agent/manage/WorkflowManager.vue`

