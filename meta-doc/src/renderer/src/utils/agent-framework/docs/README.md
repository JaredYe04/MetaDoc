# Agent框架系统文档

## 概述

Agent框架是一个完整的Agent系统，基于已有的Tool系统构建，提供了工作流（Workflow）、Agent配置（AgentConfig）、工具集（ToolCollection）和Agent会话（AgentSession）等核心功能。

## 系统架构

```
Agent框架
├── 工作流（Workflow）
│   ├── 工件节点（ArtifactNode）
│   ├── 控制流节点（ControlFlowNode）
│   └── 执行引擎（WorkflowExecutor）
├── 工具集（ToolCollection）
│   └── 工具集管理器（ToolCollectionManager）
├── Agent配置（AgentConfig）
│   ├── AgentConfig管理器（AgentConfigManager）
│   └── 工具集交集计算
└── Agent会话（AgentSession）
    ├── 会话管理器（AgentSessionManager）
    ├── 消息队列
    ├── 引用素材存储
    └── 公共上下文空间
```

## 已完成功能

### ✅ 核心类型定义

- `Workflow`：工作流定义
- `ToolCollection`：工具集定义
- `AgentConfig`：Agent配置定义
- `AgentSession`：Agent会话定义
- 所有相关的子类型和接口

**文件位置**：`src/types/agent-framework.ts`

### ✅ 管理器实现

1. **工具集管理器**（`tool-collection-manager.ts`）
   - CRUD操作
   - 工具添加/移除
   - 导入/导出
   - 本地存储持久化

2. **工作流管理器**（`workflow-manager.ts`）
   - CRUD操作
   - 工作流验证
   - 执行状态管理
   - 导入/导出

3. **AgentConfig管理器**（`agent-config-manager.ts`）
   - CRUD操作
   - 工具集交集计算
   - 配置验证
   - 导入/导出

4. **Agent会话管理器**（`agent-session-manager.ts`）
   - 会话创建和管理
   - 消息队列操作
   - 引用素材管理
   - 公共上下文操作
   - 执行节点管理
   - 重试和Duplicate功能
   - 序列化/反序列化

### ✅ 工作流执行引擎

- 有向图执行
- 节点输入输出处理
- 控制流支持（部分实现，需要完善）
- 异步执行支持
- 错误处理

**文件位置**：`src/utils/agent-framework/workflow-executor.ts`

### ✅ 文档

- 工作流系统文档：`README_WORKFLOW.md`
- AgentConfig系统文档：`README_AGENT_CONFIG.md`
- Agent会话系统文档：`README_AGENT_SESSION.md`

## 待完成功能

### ⏳ 工作流画布组件

需要基于draw.io创建图形化工作流编辑器：

- 集成draw.io库
- 自定义节点类型（工件节点、控制流节点）
- 节点连接和边编辑
- 节点属性编辑
- 工作流验证和预览

**建议实现位置**：`src/components/agent/workflow/WorkflowCanvas.vue`

### ⏳ 管理界面组件

需要创建以下管理界面：

1. **工具集管理界面**
   - 工具集列表
   - 创建/编辑/删除工具集
   - 工具添加/移除
   - 工具集导入/导出

2. **工作流管理界面**
   - 工作流列表
   - 创建工作流（打开画布）
   - 编辑工作流
   - 工作流导入/导出
   - 工作流验证

3. **AgentConfig管理界面**
   - AgentConfig列表
   - 创建/编辑/删除配置
   - 工具集关联
   - LLM和行为配置
   - 配置导入/导出

**建议实现位置**：

- `src/components/agent/manage/ToolCollectionManager.vue`
- `src/components/agent/manage/WorkflowManager.vue`
- `src/components/agent/manage/AgentConfigManager.vue`

### ⏳ AgentView.vue更新

需要更新`AgentView.vue`以集成新系统：

1. **会话创建**：
   - 从AgentConfig创建会话
   - 显示可用的AgentConfig列表

2. **工具选择**：
   - 从AgentConfig的工具集获取可用工具
   - 显示工具集信息

3. **会话管理**：
   - 支持重试和Duplicate
   - 支持导入/导出
   - 引用素材管理界面
   - 公共上下文查看和编辑

4. **工作流支持**：
   - 显示工作流执行状态
   - 工作流Display组件集成

### ⏳ 工作流Display组件

需要创建工作流的Display组件，用于在工作流执行时显示：

- 工作流结构可视化
- 当前执行节点高亮
- 已完成节点标记
- 节点执行结果展示
- 执行进度显示

**建议实现位置**：`src/components/agent/workflow/WorkflowDisplay.vue`

### ⏳ 控制流节点完善

工作流执行引擎中的控制流节点需要完善实现：

- 条件节点：条件表达式评估
- 循环节点：循环逻辑实现
- 并行节点：并行执行逻辑
- 合并节点：结果合并逻辑
- 异步节点：异步执行逻辑
- 汇总节点：汇总策略实现

### ⏳ LLM决策节点实现

需要实现LLM决策节点的执行逻辑：

- LLM API调用
- 决策结果解析
- 条件分支选择

### ⏳ AgentConfig节点实现

需要实现AgentConfig节点（Sub Agent）的执行逻辑：

- 创建Agent实例
- 执行Agent
- 结果返回

## 使用示例

### 创建完整的Agent系统

```typescript
import {
  toolCollectionManager,
  workflowManager,
  agentConfigManager,
  agentSessionManager
} from '@/utils/agent-framework'

// 1. 创建工具集
const collection = toolCollectionManager.createCollection('数据分析工具集', '数据分析相关工具', [
  'rag-tool',
  'chart-generation-tool'
])

// 2. 创建AgentConfig
const config = agentConfigManager.createConfig('数据分析Agent', '用于数据分析和可视化', [
  collection.id
])

// 3. 创建会话
const session = agentSessionManager.createSession(config.id, '数据分析会话', '分析用户数据')

// 4. 添加引用素材
agentSessionManager.addReference(session, '用户数据.csv', 'file', '/path/to/data.csv')

// 5. 使用会话（需要实现Agent执行逻辑）
```

## 集成指南

### 1. 在AgentView.vue中集成

```vue
<script setup lang="ts">
import { agentConfigManager, agentSessionManager } from '@/utils/agent-framework'

// 获取所有AgentConfig
const configs = agentConfigManager.getAllConfigs()

// 创建会话
const createSession = (configId: string) => {
  const session = agentSessionManager.createSession(configId, '新会话', '')
  // 添加到文档的agentSessions
}
</script>
```

### 2. 在工作流中使用

工作流可以作为Tool使用，需要注册到agentToolManager：

```typescript
// 在workflow-manager.ts中，当工作流创建时自动注册为Tool
// 需要实现workflow-tool.ts来包装工作流为Tool
```

### 3. 在Agent执行中使用

Agent执行时需要：

1. 从AgentConfig获取可用工具
2. 处理消息队列
3. 访问公共上下文
4. 管理引用素材

## 注意事项

1. **存储位置**：
   - Workflow、ToolCollection、AgentConfig存储在localStorage（全局）
   - AgentSession存储在文档metadata中（文档级别）

2. **版本管理**：
   - 所有实体都有版本号字段
   - 导入时检查版本冲突

3. **依赖管理**：
   - 导入时可以内嵌依赖或仅引用
   - 缺失依赖时会显示警告

4. **向后兼容**：
   - AgentSession扩展了原有类型，保持向后兼容
   - 旧的会话可以正常使用

## 相关文件

- 类型定义: `src/types/agent-framework.ts`
- 管理器: `src/utils/agent-framework/*-manager.ts`
- 执行器: `src/utils/agent-framework/workflow-executor.ts`
- 文档: `src/utils/agent-framework/README_*.md`

## 下一步

1. 实现工作流画布组件（基于draw.io）
2. 创建管理界面组件
3. 更新AgentView.vue
4. 完善控制流节点实现
5. 实现LLM决策节点和AgentConfig节点
6. 创建工作流Display组件
