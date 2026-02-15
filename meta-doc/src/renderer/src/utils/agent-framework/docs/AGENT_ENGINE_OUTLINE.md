AgentEngine（智能体引擎）系统设计说明（自然语言版 — 修正版）

AgentEngine 是 MetaDoc Agent 框架的底层执行核心。
它定义了 “一个 Agent 应该如何行动”，而不是“Agent 做什么”。

它负责：

以特定的智能体范式推进任务（默认 AutoGPT 范式）

管理工具调用（tool calling）

统一处理 LLM 的上下文生成与行为规范

决定 Agent 如何一步步执行任务

1. AgentEngine 的定位

AgentEngine 类似于一个「通用的智能体执行底盘」，所有 Agent 实例都基于此运行。

务必牢记：

AgentConfig 决定 Agent 的身份/角色
Workflow 决定工具的调用逻辑（作为 Tool 存在）
AgentEngine 决定 Agent 的行为方式与执行策略

因此：

AgentConfig = 定义 Agent 的能力范围

Workflow = 复杂 Tool 的封装方式

AgentEngine = 执行策略的选择（ReAct? AutoGPT? Plan&Execute?）

三者明确解耦。

2. Workflow 的定位（关键修正）

Workflow 不是 Agent、不是执行器，也不是思考主体。

Workflow 只是：

✔ 一种将多个 Tool/Workflow 组合 → 封装成一个新的 Tool 的方式
✔ 本质上是一次更复杂的 Tool 调用
✔ 用户可以图形化定义“这个 Tool 如何执行”

因此：

Workflow 是 Tool

Workflow 的节点执行由 Workflow Executor 执行

但 Workflow 本身永远不参与 Agent 的内部推理逻辑

工作流 不会 决定下一步如何行动，这个职责属于 AgentEngine

这点非常重要，避免 “Workflow = Agent” 的误解。

3. 默认引擎：AutoGPT 范式（MetaDoc 版本）

MetaDoc 的默认 AgentEngine 是 AutoGPT 范式，包含以下循环：

理解目标（Goal Identification）

规划步骤（Planning）

执行计划（Execution）

观察反馈（Observation）

反思并修正（Reflection）

更新长期/短期记忆（Memory Update）

返回步骤 1

相比传统 AutoGPT，我们会做：

更细粒度的 tool calling 控制

更稳定的中间态管理

与 Workflow tool 的无缝结合

对上下文、变量、referenceStore 更丰富的管理

即 这是一个可控、低随机性、高一致性的 AutoGPT 引擎。

4. AgentEngine 的核心组件

AgentEngine 由以下几个部分组成，每部分都是可替换、可配置的模块。

4.1 推理策略（Reasoning Strategy）

AgentEngine 支持的执行范式：

引擎类型 描述
AutoGPTEngine（默认） 计划→执行→反思循环，自主决策，适合多数智能任务
ReActEngine 推理+行动模式，Observation 驱动
PlanExecuteEngine 先生成计划，再逐项执行
SimpleChatEngine 轻量对话，适合无工具任务
WorkflowEngine 专为执行 Workflow 这个 tool 而设计

引擎类型决定 “Agent 每一步怎么走”。

4.2 工具执行器（ToolRunner）

所有工具调用必须统一经过 ToolRunner，包括：

匹配 tool_call / function_call 格式

注入工具使用说明、输入输出格式

拦截、验证、过滤调用

触发 Tool 的回调函数

触发 WorkflowExecutor（如果 Tool 是 Workflow）

将 Tool 的输出包装为 Observation 传回 LLM

更新 Agent 内部上下文

ToolRunner 是“唯一合法的工具执行入口”。

4.3 上下文管理器（AIContextManager）

包含：

历史消息

短期记忆（工作记忆）

referenceStore（引用材料）

工作流变量（若执行 Workflow Tool）

工具输出记录

Agent 的 system prompt （来自 AgentConfig）

引擎内部提示词（Reasoning Prompt）

它负责统一组织 Agent 的上下文，让 AgentEngine 始终以一致格式向模型提问。

4.4 引擎拦截器（Engine Interceptors）

类似 Web 服务器的中间件，可插拔：

输入清洗拦截器（清理 LLM 输出）

安全 & 审查拦截器（检测违规内容）

Token 控制拦截器（强制减少 token）

工具调用限制（禁止连续调用某些 tool）

workflow-error-recovery 拦截器

debug & logging 拦截器

每个拦截器都可以在：

beforeLLMCall

afterLLMCall

beforeToolCall

afterToolCall

beforeFinish

这些阶段介入执行。

5. 各概念的清晰区分（非常重要）

MetaDoc Agent 框架中，几个概念很容易混淆，因此需要明确。

概念 本质 作用 是否用于推理？
AgentConfig 配置 决定“Agent 是谁，有哪些工具” ❌ 不执行
AgentEngine 引擎 决定“如何执行” ✔ 核心推理点
Agent 实例 执行体 AgentConfig + Engine 联合执行 ✔
Workflow Tool 一次复杂工具调用 ❌ 不是 Agent
WorkflowExecutor 工具执行器 执行 Workflow Tool ❌ 不参与推理 6. AgentEngine 的执行流程（AutoGPT 范式）

下面是默认引擎的完整自然语言流程描述，可作为后端实现参考：

接受用户消息

合并 AgentConfig（角色）与 Engine（执行策略）

引擎决定下一步行为：

是否需要规划？

是否要调用 tool？

是否需要反思？

调用 LLM 获取下一步 Action

如果 LLM 选择 Tool → 调用 ToolRunner

ToolRunner 执行 tool 或 Workflow tool

将结果作为 Observation 返回给引擎

引擎进行反思（Reflection）

根据反思结果决定下一步：

继续执行？

重新规划？

修改策略？

结束并返回最终内容

注意：Workflow 在这里只是作为 tool 执行，不参与 AutoGPT 的决策逻辑。

7. AgentEngine 提示词（系统层 Prompt）

AgentEngine 会有 自己的内部提示词模板（不属于 AgentConfig）用于：

规范工具调用的格式

强制 ReAct/AutoGPT 风格的输出

指示 LLM 如何组织 Observation

强制工具调用必须使用 function_call

强制遵守输入输出 JSON Schema

强制执行规划–执行–反思循环

但 AgentEngine 不定义 Persona 或应用层行为
Persona 永远来自 AgentConfig。

8. AgentEngine 应如何与 Workflow Tool 交互？

简单来说：Workflow = Tool。

Workflow 的输入/输出由 Tool schema 定义

Engine 对 Workflow 不做特殊处理

当 Engine 判定 LLM 要调用 workflow-tool 时：

委托给 ToolRunner

ToolRunner 调用 WorkflowExecutor 执行节点

WorkflowExecutor 返回 JSON 输出

ToolRunner 生成 Observation

Observation 注入 Engine 内部上下文

引擎继续执行下一轮循环（计划/反思/执行）

Workflow 不负责推理。
Engine 不负责执行节点。
ToolRunner 是桥梁。

9. 为什么必须引入 AgentEngine？

因为 MetaDoc 的需求比普通 LLM agent 更复杂：

需要用户可选不同执行范式

需要渲染 Workflow 作为 Tool

需要插件化 Tool/MCP 支持

需要记录工具调用与进度

需要前端显示中间推理状态

需要可视化的工具调用回放

需要 RAG / Chart / Diff / Edit 等复杂组合工具

需要安全与审查拦截

需要 referenceStore

需要保证执行一致性（减少随机性）

所以必须有一个独立的、可配置的、可扩展的 AgentEngine。
