# Agent会话（AgentSession）系统文档

## 概述

Agent会话是Agent框架中AgentConfig的实例，代表一个独立的、有上下文的Agent执行环境。每个会话维护自己的消息历史、引用素材、公共上下文空间，并支持消息队列、重试、Duplicate等高级功能。

## 核心概念

### 1. Agent会话结构

```typescript
interface AgentSession {
  id: string                    // 会话ID（在文档内唯一）
  title: string                 // 会话标题
  description?: string          // 会话描述
  agentConfigId: string         // 关联的AgentConfig ID
  messages: AgentMessage[]      // 消息列表
  messageQueue: QueuedMessage[] // 消息队列
  referenceStore: Reference[]   // 引用素材存储
  publicContext: PublicContext  // 公共上下文空间
  executionNodes: ExecutionNode[] // 执行节点（用于重试）
  status: AgentSessionStatus    // 会话状态
  readonly?: boolean            // 是否只读（用于模板）
}
```

### 2. 消息队列

消息队列允许在Agent执行过程中插入消息：

- **插入时机**：当Agent正在生成回复或调用工具时，消息会暂存到队列
- **处理时机**：当前任务执行完成后，在执行下一步之前，会先处理队列中的消息
- **标注信息**：队列消息会标注插入时间点和插入时的消息ID，帮助Agent理解上下文

```typescript
interface QueuedMessage {
  id: string
  content: string
  role: 'user' | 'system' | 'assistant'
  timestamp: number
  insertedAtMessageId?: string  // 插入时的消息ID
  processed: boolean
}
```

### 3. 引用素材存储（ReferenceStore）

统一管理Agent会话中引用的素材和文件：

```typescript
interface Reference {
  id: string
  name: string
  type: 'file' | 'url' | 'knowledge-base' | 'article-service' | 'custom'
  url: string
  description?: string
  metadata?: Record<string, unknown>
  createdAt: number
  updatedAt: number
}
```

**使用方式**：
- 用户可以通过`@`符号引用素材
- Agent可以感知到referenceStore中的内容
- 支持多种类型的引用（文件、URL、知识库等）

### 4. 公共上下文空间（PublicContext）

公共上下文空间是Agent会话中所有LLM调用都能感知到的上下文：

```typescript
interface PublicContext {
  currentTime?: string           // 当前时间
  timezone?: string              // 时区
  document?: {                   // 当前文档信息
    id: string
    path: string
    format: 'md' | 'tex'
    title?: string
  }
  custom?: Record<string, unknown> // 自定义上下文（谨慎使用）
}
```

**设计原则**：
- 上下文隔离：每个工作流/工具的调用方只能知道输入输出，中间内容透明
- 谨慎写入：公共上下文空间应该只包含最底层、重要的信息
- 数据量控制：不能过多，避免影响性能

### 5. 执行节点（ExecutionNode）

执行节点用于支持重试和Duplicate功能：

```typescript
interface ExecutionNode {
  id: string
  type: 'message' | 'tool-call' | 'workflow-call' | 'llm-call'
  timestamp: number
  data: unknown
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  result?: unknown
  error?: string
}
```

## 使用方式

### 创建Agent会话

```typescript
import { agentSessionManager } from '@/utils/agent-framework'

const session = agentSessionManager.createSession(
  'agent-config-id',
  '数据分析会话',
  '用于分析用户数据的会话'
)
```

### 消息队列操作

```typescript
// 添加消息到队列
const queuedMessage = agentSessionManager.enqueueMessage(
  session,
  '请重新分析数据',
  'user',
  'message-id-123'  // 插入时的消息ID
)

// 处理消息队列（在Agent执行下一步之前调用）
const processedMessages = agentSessionManager.processMessageQueue(session)
```

### 引用素材管理

```typescript
// 添加引用素材
const reference = agentSessionManager.addReference(
  session,
  '用户数据.csv',
  'file',
  '/path/to/data.csv',
  '用户行为数据',
  { size: 1024, format: 'csv' }
)

// 移除引用素材
agentSessionManager.removeReference(session, reference.id)

// 更新引用素材
agentSessionManager.updateReference(session, reference.id, {
  description: '更新后的描述'
})
```

### 公共上下文操作

```typescript
// 写入公共上下文
agentSessionManager.writeToPublicContext(session, 'customKey', 'customValue')

// 读取公共上下文
const value = agentSessionManager.readFromPublicContext(session, 'customKey')
```

### 执行节点操作

```typescript
// 添加执行节点
const node = agentSessionManager.addExecutionNode(
  session,
  'tool-call',
  { toolId: 'rag-tool', params: {...} }
)

// 更新执行节点状态
agentSessionManager.updateExecutionNode(session, node.id, {
  status: 'succeeded',
  result: {...}
})
```

### 重试功能

```typescript
// 重试到指定节点
agentSessionManager.retryToNode(session, 'node-id-123')
```

### Duplicate功能

```typescript
// 复制会话（从指定节点）
const duplicated = agentSessionManager.duplicateSession(session, 'node-id-123')

// 复制会话（完整复制）
const duplicated = agentSessionManager.duplicateSession(session)
```

## 会话状态管理

Agent会话有以下状态：

- `idle`：空闲
- `thinking`：思考中
- `generating`：生成中
- `tool-calling`：调用工具中
- `workflow-executing`：执行工作流中
- `waiting-input`：等待输入
- `error`：错误

```typescript
agentSessionManager.updateSessionStatus(session, 'generating')
```

## 序列化与反序列化

### 导出会话

```typescript
// 导出会话（包含依赖）
const serialized = agentSessionManager.serializeSession(session, true)
```

### 导入会话

```typescript
// 导入会话
const session = agentSessionManager.deserializeSession(serialized, {
  importDependencies: true,
  overwriteDependencies: false
})
```

## 导入导出策略

### 策略1：内嵌所有依赖

导出时将所有依赖（AgentConfig、ToolSet、Workflow）都内嵌到会话文件中：

- **优点**：会话完全独立，可以在任何环境中使用
- **缺点**：文件较大，可能包含重复内容

```typescript
const serialized = agentSessionManager.serializeSession(session, true)
```

### 策略2：仅引用（假设环境已有）

导出时只保存引用信息，不包含依赖的完整内容：

- **优点**：文件小，不重复
- **缺点**：需要确保环境中已有相关依赖

```typescript
const serialized = agentSessionManager.serializeSession(session, false)
```

### 版本冲突处理

导入时如果发现依赖的实体已存在但版本不同，会弹出对话框让用户选择：

```typescript
interface EntityVersionConflict {
  entityId: string
  entityType: EntityType
  local: {
    version: string
    updatedAt: number
  }
  imported: {
    version: string
    updatedAt: number
  }
}
```

## 会话存储

Agent会话存储在文档的metadata中，不存储在全局存储中：

- 每个文档有自己独立的会话列表
- 会话属于文档，不会跨文档共享
- 导入的会话默认引用当前文档

## 只读模式

会话可以设置为只读模式，用于作为模板：

```typescript
session.readonly = true
```

只读会话：
- 不能修改
- 不能执行
- 可以复制（Duplicate）创建新会话

## 最佳实践

1. **消息队列**：
   - 合理使用消息队列，避免队列过长
   - 及时处理队列中的消息

2. **引用素材**：
   - 及时清理不需要的引用
   - 使用有意义的名称和描述

3. **公共上下文**：
   - 谨慎写入，只写入必要的信息
   - 避免写入大量数据

4. **执行节点**：
   - 在关键节点添加执行节点
   - 合理使用重试和Duplicate功能

5. **会话管理**：
   - 定期清理不需要的会话
   - 使用有意义的会话标题和描述
   - 合理使用只读模式

## 相关文件

- 类型定义: `src/types/agent-framework.ts`
- 会话管理器: `src/utils/agent-framework/agent-session-manager.ts`
- 文档存储: `src/stores/workspace.ts` (agentSessions字段)

