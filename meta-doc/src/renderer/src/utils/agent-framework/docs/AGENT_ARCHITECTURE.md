# MetaDoc Agent 系统架构说明

本文档描述 Agent 模块的整体架构，重点说明工具调用的解析、入队、执行与进度回传，便于排查问题和扩展。

## 一、模块总览

```
agent-framework/
├── tool-call-parsers.ts      # 多种格式的工具调用解析（<tool_call>、DSML、JSON 等）
├── tool-call-processor.ts    # 对外 parseToolCalls()，内部使用 parsers
├── tool-call-queue.ts        # 工具调用队列：同一批次并发，多批次串行
├── tool-runner.ts            # 单次工具执行入口，调用 agentToolManager.invokeTool
├── agent-engine-executor.ts  # 各引擎执行器（AutoGPT/ReAct/SimpleChat/PlanExecute）
├── ai-context-manager.ts     # 会话消息、addToolMessage/completeToolMessage
├── llm-adapter.ts            # LLM 调用，含 onToolCallsDetected 检测
├── subagent-runner.ts        # 运行 Subagent 子会话
└── agent-config-manager.ts   # 引擎与工具配置

agent-tools/
├── tool-display-communication.ts  # tool-update / tool-complete 事件
├── composables/useToolDisplayRealtime.ts  # Display 组件订阅实时数据
└── components/*Display.vue   # 各工具对应的展示组件
```

## 二、工具调用从解析到执行的完整流程

### 1. 解析（tool-call-parsers.ts / tool-call-processor.ts）

- **入口**：`parseToolCalls(content, options)`（在 `tool-call-processor.ts`）。
- **实现**：`ToolCallParserManager` 按优先级依次尝试多种解析器：
  - StandardToolCallParser（`<tool_call>...</tool_call>`、DSML 等）
  - XMLToolCallParser
  - DeepSeekDSMLParser
  - SubagentsBatchParser（`{"subagents": [...]}`）
  - ActionParamsParser（`{"action","params"}`）
  - OpenAIFunctionCallParser
- **输出**：`ParsedToolCall[]`（`id`, `tool_id`, `parameters`, `isValid` 等）。

### 2. 检测与入队（agent-engine-executor.ts）

- 流式 LLM 输出时，`LlmAdapter.callChatViaTask` 内部会检测「完整」的 tool_call 片段。
- 检测到后调用 **`onToolCallsDetected`**（由 `createToolCallsDetectedHandler(assistantMessage)` 生成）：
  - 将解析出的 `tool_calls` 合并到当前 `assistantMessage.tool_calls`；
  - 若当前没有工具调用队列则 **创建** `ToolCallQueue(session, signal, onTaskComplete, onQueueComplete)`；
  - 对本次解析出的每个 tool call 执行 **`currentToolCallQueue.addTask(toolCall)`**。

### 3. 队列执行（tool-call-queue.ts，信号量 + 全并发）

- **并发策略**：**不再按批执行**。每解析到一个任务就 **信号量 +1** 并 **立即异步执行** 该任务（不等待）；任务结束时 **信号量 -1**。同一轮对话中所有工具调用 **并发执行**，不会出现「先解析到的先跑完一批再跑下一批」导致的后续任务被延后或遗漏（例如 AI 输出 `[{任务1},{任务2},{任务3}]` 时解析器可能先产出任务1，再产出任务2、3，若按批处理则任务2、3 会等任务1 所在批次结束才执行）。
- **addTask**：构造 task，push 到 `queue`（仅用于统计/日志），**inFlight++**，然后 **runTask(task)** 不 await（fire-and-forget），在 runTask 的 Promise 上 **.finally(() => { inFlight--; tryResolveComplete(); })**
- **完成条件**：**inputComplete** 已设置（AI 输出结束）且 **inFlight === 0**（信号量归零）。**waitForComplete()** 等待该条件，满足时 resolve 并调用 **onQueueComplete**。
- **runTask(task)** 核心逻辑：
  1. **dummy-tool**：直接写一条失败 tool 消息并返回。
  2. **Subagent**：不经过 ToolRunner；先 `AIContextManager.addToolMessage(..., 'running', ..., task.tool_call_id, toolConfigSub)`，再 **`runSubagent(task.tool_id, params, session, this.signal)`**，最后 `completeToolMessage`。
  3. **普通工具**：
     - 先 `addToolMessage(..., 'running', ..., task.tool_call_id, toolConfig, task.parameters)`（这里会带上 `invocationId: tool_call_id`）；
     - 再 **`createAiTask(..., ai_types.tool, ..., { toolId, parameters, tool_call_id, session, stream: false })`**，并 **`await done`**；
     - `startAiTask(handle)` 里会执行 **`ToolRunner.runTool(toolId, parameters, controller.signal, session, toolCallId)`**；
     - `ToolRunner.runTool` 内部调用 **`agentToolManager.invokeTool(toolId, params, undefined, toolCallId)`**（第三个参数为状态回调，当前未传；第四个为 invocationId，用于 Display 实时事件）。
- **完成**：通过 **`AIContextManager.completeToolMessage(session, runningMsg.id, observation, params)`** 把之前插入的 running 消息替换为完成状态（**原地替换** `session.messages[index] = completed`，以触发 Vue 响应式更新）。

### 4. 小结：解析之后发生了什么？

| 步骤 | 说明 |
|------|------|
| 解析出工具 | `tool-call-parsers` / `parseToolCalls` 得到 `ParsedToolCall[]`（可能随流式输出多次、逐段解析） |
| 入队 | 在 `onToolCallsDetected` 中合并到 `assistantMessage.tool_calls` 并 **addTask()**：信号量 +1，**立即异步** 执行该任务 |
| 执行时机 | **全并发**：每解析到一个就启动一个，不按批、不等待前一批；只有 **inputComplete 且 inFlight===0** 才进入下一轮 |
| 进度/结果 | 先插入 running 的 tool 消息（带 `tool_call_id`/`invocationId`），工具内部若调用 `onUpdate` 则通过 eventBus 发 `tool-update:{invocationId}`；完成时 `completeToolMessage` 替换该条消息 |

## 三、工具执行与实时进度回传

### 1. invocationId 的传递链

- 队列里每个任务有 **`task.tool_call_id`**（即解析时的 `parsed.id` 或生成的任务 id）。
- **addToolMessage** 时传入 `tool_call_id`，消息上会带 **`invocationId: tool_call_id`**（与 `tool_call_id` 一致）。
- **createAiTask** 的 meta 里带 **`tool_call_id`**；**startAiTask** 里取 `tool_call_id` 传给 **ToolRunner.runTool(..., toolCallId)**；**invokeTool** 的第四个参数为 **invocationId**，若传入则用该值，否则内部生成。
- 因此，同一次调用的「running 消息」与「实际执行」共用同一个 **invocationId**，Display 组件用该 id 订阅事件即可对齐。

### 2. 实时更新的两条路径

- **路径 A：工具内 onUpdate**  
  - 工具回调签名为 `(params, signal, onUpdate)`。  
  - 若工具在执行过程中调用 **`onUpdate(data, progress)`**，`AgentToolManager.invokeTool` 内部会 **`emitToolUpdate(resolvedInvocationId, data, progress)`**。  
  - Display 组件通过 **`useToolDisplayRealtime(invocationId, initialData, initialStatus)`** 订阅 **`tool-update:{invocationId}`**，即可实时刷新 UI。

- **路径 B：完成时一次性更新**  
  - 工具只返回最终结果、不调用 onUpdate 时，不会发 tool-update。  
  - 结束时 **`completeToolMessage`** 会 **替换** 同一条 tool 消息（同一 `messageId`），所以最终状态和结果会在「完成」时一次性反映到会话消息里，Vue 会因 `session.messages[index]` 被替换而更新视图。

### 3. 为何「只有切出会话再切回来才看到进度」？

可能原因包括：

1. **未传或未用 invocationId**  
   - 若某条 tool 消息没有设置 **`invocationId`**（例如未走 addToolMessage 或漏传 `tool_call_id`），Display 不会订阅到对应 `tool-update`，只能依赖 **completeToolMessage** 的替换。  
   - 切出再切回时重新从持久化会话加载，会拿到已完成的整条消息，因此能看到最终结果。

2. **工具未调用 onUpdate**  
   - 只有工具实现里在适当时机调用 **`onUpdate(data)`** 时，才会触发 **tool-update**。  
   - 若工具从不调用 onUpdate，则只有「完成」时的那一次 **completeToolMessage** 会更新 UI；若当时视图未正确响应（见下），就会表现为“只有切回来才看到”。

3. **响应式与引用**  
   - **completeToolMessage** 使用 **`session.messages[index] = completed`** 做原地替换。  
   - 若列表或消息在别处被拷贝、或子组件依赖的是旧引用，可能不会触发更新；切回时重新用持久化数据渲染，拿到的是新对象，所以会显示。

**建议**：

- 确保所有「running」tool 消息都带 **`tool_call_id`**，并统一写成 **`invocationId`** 传给 Display。
- 需要「执行中」进度条或中间状态的工具，应在执行过程中调用 **`onUpdate(data, progress)`**。
- 若仍出现不刷新，可对消息列表项使用 **`:key="message.id + message.status"`** 等，强制在状态变化时重新挂载。

## 四、Subagent 与 SubagentDisplay

- Subagent 在 **tool-call-queue** 的 **runTask** 里直接调用 **runSubagent**，不经过 ToolRunner，也不会发 **tool-update**。
- **runSubagent** 内部只做：创建临时 session → 执行引擎 → 返回 **subagentMessages + resultText**；执行期间没有向父会话的 tool 消息推送中间状态。
- 因此 **SubagentDisplay** 只能拿到「初始 running + 最终 complete」的那一条消息，无法像主会话的 **AgentMessageRenderer** 那样流式显示子会话内容。

**改进方向**：在 **runSubagent** 中增加可选参数 **parentInvocationId**（即父 tool 消息的 `tool_call_id`），在子会话执行过程中定期或在新消息时 **emitToolUpdate(parentInvocationId, { subagentMessages, result })**，这样 **useToolDisplayRealtime** 就能在 SubagentDisplay 中流式展示子会话。

## 五、终止（Stop）与 Abort 传递

- 用户点击「终止」会触发 **stopAgentGeneration**：对当前会话取消所有通过 **origin_key** 匹配到的 AI 任务，并取消 **aiTaskHandles** 中记录的 handle。
- **ToolCallQueue** 构造时接收 **signal**（来自同一 AbortController），在 **start()** 循环里会检查 **`this.signal?.aborted`** 并 break，因此队列会停。
- **问题**：  
  - 队列内通过 **createAiTask** 创建的是 **工具型 AI 任务**，其 **origin_key** 形如 `tool-${tool_id}-${tool_call_id}-${Date.now()}`，**不以 `agent-${session.id}-` 开头**，因此 **stopAgentGeneration** 里按 session 前缀过滤时 **不会** 取消这些任务。  
  - 工具内部若再调 **createAiTask**（如 todolist、chart-generation），这些子任务的 handle 也没有被收集，终止时不会被取消。

**改进方向**：  
- 将 **onTaskCreated** 传入 **ToolCallQueue**，在队列中每次 **createAiTask(..., ai_types.tool, ...)** 后调用 **onTaskCreated(handle)**，把工具任务的 handle 纳入 **aiTaskHandles**，这样点击终止时会 **cancelAiTask(handle)**，工具任务会被取消。  
- 工具回调已接收 **signal**；若工具内部使用 **createAiTask**，应在 **signal.aborted** 时调用 **cancelAiTask** 取消内部任务，以彻底断开执行链。

## 六、Todolist 工具被多次调用的可能原因

- 模型可能把「更新任务状态」「标记完成」理解为需要多次调用 todolist；或没有明确「只在任务真正完成时标记一次」的约束。
- **fullSpec / 系统提示** 中若未强调「仅在创建计划时调用一次、在某一子任务完成时再调用一次标记完成」，容易导致重复调用。

**改进方向**：  
- 在 todolist 的 **fullSpec** 和系统提示中明确写清：  
  - 仅在需要 **创建/更新任务列表** 或 **标记某个任务已完成** 时调用；  
  - **不要** 为同一目的重复调用，也不要用来「轮询」状态。  
- 可在提示中加一条：建议一轮对话中对 todolist 的调用次数保持最少（例如创建一次、每个任务完成时各标记一次）。

---

以上为当前 Agent 系统与工具调用链的架构与行为说明，以及已知问题的原因与改进方向。实现具体修复时可按上述模块与数据流对照修改。
