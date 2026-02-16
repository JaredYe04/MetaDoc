# AgentEngine 实现总结

## 已完成的工作

### 1. ✅ 类型定义 (`agent-framework.ts`)

- 添加了完整的 AgentEngine 类型定义
- 包含引擎类型、LLM配置模式、拦截器等类型
- 更新了 EntityType 以包含 agent-engine

### 2. ✅ AgentEngine 管理器 (`agent-engine-manager.ts`)

- 实现了完整的 CRUD 操作
- 自动初始化 5 个内置引擎：
  - AutoGPT 引擎（默认）
  - ReAct 引擎
  - Plan-Execute 引擎
  - Simple Chat 引擎
  - Workflow 引擎
- 支持导入/导出功能
- 本地存储持久化

### 3. ✅ LLM API 适配器 (`llm-adapter.ts`)

- 支持全局 LLM 配置（使用 MetaDoc 设置）
- 支持自定义 LLM 配置（OpenAI 兼容 API）
- 支持对话模式和补全模式
- 支持流式和非流式请求
- 支持所有 MetaDoc 支持的 LLM 类型（OpenAI、Ollama、DeepSeek、MetaDoc 等）

### 4. ✅ 工具执行器 (`tool-runner.ts`)

- 统一的工具调用入口
- 支持普通工具和 Workflow 工具
- 工具参数验证
- 结果包装为 Observation 格式

### 5. ✅ 上下文管理器 (`ai-context-manager.ts`)

- 构建 LLM 消息列表
- 管理系统提示词、历史消息、引用素材
- 支持消息的添加和格式化

### 6. ✅ AgentEngine 执行器 (`agent-engine-executor.ts`)

- 实现了基类 `BaseEngineExecutor`
- **AutoGPT 引擎**：计划→执行→反思循环，自主决策
- **ReAct 引擎**：推理+行动模式，Observation驱动，显式思考过程
- **PlanExecute 引擎**：先生成计划，再逐项执行
- **SimpleChat 引擎**：轻量对话，无工具调用
- **Workflow 引擎**：专为执行Workflow工具而设计
- 支持工具调用解析和执行
- 支持迭代循环（计划→执行→反思）
- 工厂模式创建不同引擎

### 7. ✅ 管理界面 (`AgentEngineManager.vue`)

- 卡片式管理界面
- 创建/编辑/删除引擎
- 支持 LLM 配置模式切换
- 支持引擎类型选择
- 支持引擎配置选项

### 8. ✅ AgentView 整合

- 在会话列表下方添加了引擎选择器（浮动样式）
- 添加了引擎管理菜单项
- 整合了 AgentEngine 执行逻辑
- 实现了完整的推理流程

### 9. ✅ 国际化支持

- 添加了所有 AgentEngine 相关的中文翻译

## 核心架构

### AgentEngine 执行流程

```
用户消息
  ↓
AgentView.handleComposerSubmit()
  ↓
executeAgentEngine()
  ↓
AgentEngineExecutorFactory.create()
  ↓
AutoGPTEngineExecutor.execute()
  ├─ 构建上下文（AIContextManager）
  ├─ 调用 LLM（LlmAdapter）
  ├─ 解析工具调用（parseToolCalls）
  ├─ 执行工具（ToolRunner）
  └─ 迭代循环直到完成
```

### 工具调用格式

AgentEngine 期望 LLM 返回 JSON 格式的工具调用：

```json
{
  "tool_calls": [
    {
      "tool_id": "tool_name",
      "parameters": {
        "param1": "value1"
      }
    }
  ]
}
```

如果没有 tool_calls，则视为普通文本回复。

## 当前状态

✅ **已完成并可用的功能：**

- AgentEngine 配置管理（完整）
- AgentEngine 选择器（UI完整）
- AutoGPT 引擎执行（基础版本）
- 工具调用和执行（完整）
- LLM API 适配（完整）

✅ **已完成的功能：**

- ✅ ReAct 引擎：推理+行动模式，Observation驱动，支持Thought->Action->Observation循环
- ✅ PlanExecute 引擎：先生成计划，再逐项执行，支持JSON格式的计划生成
- ✅ SimpleChat 引擎：轻量对话，无工具调用，适合简单对话任务
- ✅ Workflow 引擎：专为执行Workflow工具而设计，自动识别Workflow工具

⚠️ **可选优化功能：**

- 引擎拦截器系统的实际使用
- 更完善的工具调用解析（支持function_call格式）
- 错误处理和重试机制
- 流式响应支持（当前为非流式）

## 使用说明

### 1. 选择引擎

在 AgentView 左侧会话列表下方，有一个下拉选择器，可以选择不同的 AgentEngine。

### 2. 管理引擎

点击设置按钮 → Agent引擎管理，可以：

- 创建自定义引擎
- 编辑引擎配置
- 配置 LLM（全局或自定义）
- 配置引擎参数

### 3. 执行 Agent

在会话中输入消息，AgentEngine 会自动：

1. 分析用户需求
2. 规划执行步骤
3. 调用工具
4. 观察结果
5. 继续执行或返回结果

## 技术细节

### LLM 配置模式

**全局模式：**

- 使用 MetaDoc 设置中的 LLM 配置
- 自动适配所有支持的 LLM 类型

**自定义模式：**

- 需要配置 baseUrl、apiKey、model
- 支持 OpenAI 兼容的 API

### 工具调用解析

使用 `extractOuterJsonString` 函数从 LLM 响应中提取 JSON，然后解析 tool_calls。

### 上下文构建

AIContextManager 负责：

1. 系统提示词（来自 AgentConfig）
2. 引用素材（来自 Session）
3. 历史消息（最近 N 条）
4. 工具提示（可用工具列表）

## 已知限制

1. **工具调用解析**：当前使用简单的 JSON 提取，可能无法处理复杂的响应格式
2. **引擎实现**：除了 AutoGPT，其他引擎当前都使用 AutoGPT 的实现
3. **拦截器**：类型定义完成，但实际拦截逻辑还未实现
4. **流式响应**：当前使用非流式，可能导致响应较慢

## 后续改进建议

1. 实现专门的 ReAct、PlanExecute 等引擎
2. 完善工具调用解析，支持 function_call 格式
3. 实现拦截器系统
4. 添加流式响应支持
5. 添加错误重试机制
6. 优化上下文管理，支持更智能的消息压缩
