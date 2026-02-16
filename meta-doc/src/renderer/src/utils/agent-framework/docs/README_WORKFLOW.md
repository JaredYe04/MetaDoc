# 工作流（Workflow）系统文档

## 概述

工作流系统是Agent框架的核心组件之一，用于定义和执行标准化的Agent执行流程。工作流以程序流程图的方式规定了固定的、标准化的执行流程，减少由于大模型随机性造成的结果差异，使结果更为可控。

## 核心概念

### 1. 工作流结构

工作流是一个有向图，由以下部分组成：

- **工件节点（ArtifactNode）**：执行实际操作的节点
  - `tool`：调用工具
  - `llm-decision`：LLM决策节点
  - `workflow`：嵌套工作流
  - `agent-config`：子Agent（Sub Agent）

- **控制流节点（ControlFlowNode）**：控制执行流程的节点
  - `condition`：条件判断
  - `loop`：循环
  - `parallel`：并行执行
  - `merge`：合并
  - `async`：异步执行
  - `aggregate`：汇总

- **边（Edge）**：连接节点，定义数据流向和执行顺序
  - 可以指定源节点的输出字段
  - 可以指定目标节点的输入字段
  - 可以包含条件表达式（用于条件跳转）

### 2. 节点输入输出

每个节点都有明确的输入和输出定义：

**输入（ArtifactInput）**：

- 参数名称、类型、是否必需
- 输入来源类型：
  - `constant`：常量值
  - `variable`：工作流变量
  - `upstream`：上游节点的输出
  - `context`：公共上下文空间

**输出（ArtifactOutput）**：

- 输出字段名、类型、描述

### 3. 工作流变量

工作流可以定义变量，用于在整个工作流中共享数据：

```typescript
{
  name: 'result',
  type: 'string',
  defaultValue: '',
  description: '处理结果'
}
```

### 4. 工作流配置

```typescript
{
  concurrent: true,  // 是否支持并发执行
  timeout: 60000,   // 超时时间（毫秒）
  retry: {
    maxAttempts: 3,
    backoff: 'exponential',
    delay: 1000
  }
}
```

## 使用方式

### 创建工作流

```typescript
import { workflowManager } from '@/utils/agent-framework'

const workflow = workflowManager.createWorkflow(
  '数据处理工作流',
  '用于处理和分析数据的标准化流程',
  'entry-node-id',
  ['exit-node-id']
)
```

### 添加节点

```typescript
// 添加工具节点
workflow.artifactNodes.push({
  id: 'tool-node-1',
  type: 'tool',
  artifactId: 'rag-tool',
  label: 'RAG检索',
  inputs: [
    {
      name: 'question',
      type: 'string',
      required: true,
      sourceType: 'variable',
      variableName: 'userQuestion'
    }
  ],
  outputs: [
    {
      name: 'results',
      type: 'array',
      description: '检索结果'
    }
  ]
})

// 添加控制流节点
workflow.controlFlowNodes.push({
  id: 'condition-node-1',
  type: 'condition',
  label: '结果判断',
  config: {
    condition: 'results.length > 0'
  }
})
```

### 添加边

```typescript
workflow.edges.push({
  id: 'edge-1',
  source: 'tool-node-1',
  target: 'condition-node-1',
  sourceField: 'results',
  targetField: 'input'
})
```

### 执行工作流

```typescript
import { workflowExecutor } from '@/utils/agent-framework'

const result = await workflowExecutor.executeWorkflow('workflow-id', {
  userQuestion: '什么是AI？'
})
```

## 工作流作为Tool

工作流本身也是一个Tool，实现了AgentToolConfig接口，可以在Agent会话中使用。

### 注册工作流为Tool

工作流在执行时会自动注册为Tool，可以通过`agentToolManager.getTool('workflow-{workflowId}')`获取。

### 工作流Display组件

工作流提供了统一的Display组件，以流程图+当前执行节点的方式展示执行状态：

- 显示工作流结构（节点和边）
- 高亮当前执行的节点
- 显示已完成的节点
- 显示节点执行结果
- 显示执行进度

## 最佳实践

1. **节点设计**：
   - 保持节点职责单一
   - 明确输入输出格式
   - 使用有意义的节点标签

2. **变量使用**：
   - 使用变量传递复杂数据
   - 避免在节点间直接传递大量数据

3. **错误处理**：
   - 在关键节点添加错误处理逻辑
   - 使用条件节点处理异常情况

4. **性能优化**：
   - 对于可以并行的操作，使用并行节点
   - 合理设置超时时间

5. **可维护性**：
   - 使用清晰的工作流名称和描述
   - 添加必要的注释和文档
   - 版本管理：更新工作流时更新版本号

## 序列化与反序列化

工作流支持完整的序列化和反序列化：

```typescript
// 导出工作流（包含依赖）
const entity = workflowManager.exportWorkflow('workflow-id', true)

// 导入工作流
const workflow = workflowManager.importWorkflow(entity, true)
```

## 相关文件

- 类型定义: `src/types/agent-framework.ts`
- 管理器: `src/utils/agent-framework/workflow-manager.ts`
- 执行器: `src/utils/agent-framework/workflow-executor.ts`
- Display组件: `src/components/agent/workflow/WorkflowDisplay.vue`（待实现）
