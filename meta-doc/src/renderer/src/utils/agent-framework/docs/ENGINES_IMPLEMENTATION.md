# AgentEngine 引擎实现详解

## 已实现的引擎类型

### 1. ✅ AutoGPT 引擎（默认）

**执行范式：** 计划→执行→反思循环

**特点：**
- 自主决策，适合多数智能任务
- 支持多轮迭代
- 支持工具调用
- 自动反思和修正

**执行流程：**
1. 分析用户需求
2. 规划执行步骤
3. 执行工具调用
4. 观察结果
5. 反思并决定下一步
6. 循环直到完成

### 2. ✅ ReAct 引擎

**执行范式：** 推理+行动模式，Observation驱动

**特点：**
- 显式的思考过程（Thought）
- 清晰的行动标识（Action）
- 观察驱动（Observation）
- 适合需要详细推理步骤的任务

**执行流程：**
1. **Thought**: 推理当前情况
2. **Action**: 选择行动（工具调用或finish）
3. **Action Input**: 工具参数
4. **Observation**: 等待工具执行结果
5. 根据观察继续推理或完成任务

**输出格式：**
```
Thought: [思考过程]
Action: [工具名称 或 finish]
Action Input: {"参数": "值"}
Observation: [工具执行结果]
Final Answer: [最终答案]
```

### 3. ✅ PlanExecute 引擎

**执行范式：** 先生成计划，再逐项执行

**特点：**
- 先制定完整计划
- 按计划逐步执行
- 支持计划中包含工具调用
- 适合需要结构化执行的任务

**执行流程：**
1. **规划阶段**：生成JSON格式的执行计划
   ```json
   {
     "steps": [
       {
         "description": "步骤描述",
         "tool_id": "工具ID（可选）",
         "parameters": {"参数": "值"}
       }
     ]
   }
   ```
2. **执行阶段**：按计划逐项执行
3. **总结阶段**：生成最终总结

### 4. ✅ SimpleChat 引擎

**执行范式：** 轻量对话，无工具调用

**特点：**
- 最简单的引擎
- 不包含工具提示
- 直接LLM对话
- 适合纯对话任务

**执行流程：**
1. 构建上下文（不包含工具）
2. 调用LLM生成回复
3. 返回结果

### 5. ✅ Workflow 引擎

**执行范式：** 专为执行Workflow工具而设计

**特点：**
- 自动识别Workflow工具
- 智能选择Workflow
- 执行后生成友好总结
- 适合复杂工作流场景

**执行流程：**
1. 分析需求
2. 从可用工具中筛选Workflow工具
3. 选择合适的Workflow
4. 执行Workflow
5. 根据结果生成总结

## 引擎对比

| 引擎 | 工具支持 | 迭代循环 | 适合场景 | 复杂度 |
|------|---------|---------|---------|--------|
| AutoGPT | ✅ | ✅ | 通用智能任务 | 高 |
| ReAct | ✅ | ✅ | 需要推理过程的任务 | 中 |
| PlanExecute | ✅ | ❌ | 结构化执行任务 | 中 |
| SimpleChat | ❌ | ❌ | 纯对话任务 | 低 |
| Workflow | ✅ (仅Workflow) | ❌ | Workflow执行 | 低 |

## 引擎选择指南

### 选择 AutoGPT 引擎，如果：
- 需要自主决策和反思
- 任务复杂度高，需要多轮迭代
- 需要灵活的工具调用组合

### 选择 ReAct 引擎，如果：
- 需要显式的推理过程
- 需要观察驱动的问题解决
- 适合需要展示思考过程的场景

### 选择 PlanExecute 引擎，如果：
- 需要先制定完整计划
- 任务可以分解为清晰的步骤
- 需要结构化执行流程

### 选择 SimpleChat 引擎，如果：
- 纯对话任务，不需要工具
- 追求快速响应
- 简单问答场景

### 选择 Workflow 引擎，如果：
- 主要使用Workflow工具
- 需要执行复杂的工作流
- 需要工作流执行后的智能总结

## 技术细节

### 工具调用格式

所有支持工具的引擎都使用统一的工具调用格式：

**JSON格式：**
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

**ReAct格式：**
```
Action: tool_name
Action Input: {"param1": "value1"}
```

### 上下文管理

所有引擎都使用 `AIContextManager` 管理上下文：
- 系统提示词（来自AgentConfig）
- 历史消息（最近N条）
- 引用素材
- 工具提示（根据引擎类型）

### LLM调用

所有引擎都使用 `LlmAdapter` 进行LLM调用：
- 支持全局LLM配置
- 支持自定义LLM配置
- 自动适配不同LLM类型
- 统一的错误处理

## 扩展指南

如需添加新的引擎类型：

1. **在类型定义中添加引擎类型** (`agent-framework.ts`)
   ```typescript
   export type EngineType = 'autogpt' | 'react' | 'plan-execute' | 'simple-chat' | 'workflow' | 'your-new-engine'
   ```

2. **实现引擎执行器类** (继承 `BaseEngineExecutor`)
   ```typescript
   export class YourNewEngineExecutor extends BaseEngineExecutor {
     async execute(userMessage: string): Promise<void> {
       // 实现你的引擎逻辑
     }
   }
   ```

3. **在工厂方法中注册**
   ```typescript
   case 'your-new-engine':
     return new YourNewEngineExecutor(engine, session, agentConfig, options)
   ```

4. **在管理器中初始化默认引擎** (可选)
   ```typescript
   this.createBuiltInEngine(
     'default-your-engine',
     'Your Engine',
     'Description',
     'your-new-engine',
     {}
   )
   ```

## 注意事项

1. **工具调用解析**：当前使用简单的JSON提取，可能需要根据LLM实际输出格式调整
2. **错误处理**：所有引擎都有基本的错误处理，但可以进一步完善
3. **流式响应**：当前使用非流式，可能影响响应速度
4. **迭代次数**：各引擎都有最大迭代次数限制，避免无限循环

