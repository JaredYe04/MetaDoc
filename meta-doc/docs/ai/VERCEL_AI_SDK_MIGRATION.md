# 迁移至 Vercel AI SDK 方案

在**不破坏现有 `createAiTask` 统一任务管理**的前提下，将底层 LLM 调用与 Agent 工具解析/执行逐步迁移到 [Vercel AI SDK](https://github.com/vercel/ai)，实现统一的多厂商管理与原生 tool calling 支持。

---

## 1. 目标与约束

### 1.1 目标

- **底层 LLM 调用**：用 AI SDK 的 `generateText` / `streamText` 替代当前手写的 `llm-api.js` + 多分支 + 各 adapter 的 URL/payload/SDK 调用。
- **工具调用**：用 SDK 原生 **tool calling**（结构化 tool_calls）替代从助理回复文本中解析 `<tool_call>…</tool_call>` 的整套逻辑，减少解析器维护与流式拼接/去重问题。
- **配置与厂商**：通过 AI SDK 的 provider 体系（如 `@ai-sdk/openai`、`@ai-sdk/google`）统一管理 API Key、baseURL、model，与现有 settings 或 customLlmConfig 做一层映射即可。

### 1.2 必须保留

- **createAiTask 作为唯一任务入口**：handle、status、cancel、done Promise、多窗口注册（含子窗口 `register-ai-task` / `start-task`）保持不变。
- **startAiTask 的三种分支**：`answer`、`chat`、`tool` 仍由 startAiTask 根据 type 分发；仅 `answer` / `chat` 的内部实现改为调用 AI SDK，`tool` 仍为现有 `ToolRunner.runTool`。
- **现有 Agent 引擎形态**：ReAct / AutoGPT / PlanExecute / SimpleChat 等仍由 agent-engine-executor 驱动；差异在于「一次 LLM 调用」改为通过 createAiTask → 内部 AI SDK 调用，且工具由 SDK 返回的 tool_calls 驱动，而非从 markdown 里解析。

---

## 2. 迁移阶段总览

| 阶段 | 内容 | 产出 |
|------|------|------|
| **Phase 0** | 依赖与适配层骨架 | 安装 `ai`、`@ai-sdk/openai`、`@ai-sdk/google` 等；新增 `llm-ai-sdk` 桥接模块，不替换现有调用。 |
| **Phase 1** | 配置与 Model 映射 | 从现有 LlmConfig / settings 构造 AI SDK 的 `model`（provider + modelId），供后续所有调用使用。 |
| **Phase 2** | 纯对话/补全走 AI SDK | answerQuestion / continueConversation 内部改为调用 `generateText` / `streamText`，结果仍写回 ref，并保留 recordLlmRequest。 |
| **Phase 3** | Agent 对话 + 原生 tool calling | Agent 的 callChatViaTask 改为使用 `streamText` + `tools`；onToolCallsDetected 改为消费 SDK 返回的 tool_calls，再入队现有 ToolCallQueue。 |
| **Phase 4** | 下线旧实现与解析器 | 移除 llm-api 中与 adapter 的分支、adapter 中重复逻辑；将 tool-call-parsers 仅保留为兜底或兼容旧会话。 |

---

## 3. Phase 0：依赖与桥接骨架

### 3.1 依赖

```bash
pnpm add ai @ai-sdk/openai @ai-sdk/google
# 如需其他厂商再按需添加：@ai-sdk/anthropic、@ai-sdk/ollama 等
```

- 使用 **Vercel AI SDK** 的 [Unified Provider 架构](https://github.com/vercel/ai#unified-provider-architecture)：同一套 `generateText` / `streamText`，通过 `model: openai('gpt-4')` 或 `model: google('gemini-2.5-flash')` 等切换厂商。

### 3.2 新增桥接模块（建议路径）

- `renderer/src/utils/llm-ai-sdk/`（或 `llm-vercel-ai/`）：
  - `model-from-config.ts`：根据当前 `LlmConfig`（或 settings + selectedLlm）返回 AI SDK 的 `LanguageModel`（下一阶段实现）。
  - `stream-chat.ts` / `generate-chat.ts`：封装 `streamText` / `generateText`，入参为消息数组 + 可选 options（temperature、maxTokens、signal），出参为流式 delta 或完整文本 + usage，便于在现有 `answerQuestion` / `continueConversation` 中 drop-in 替换内部实现。

本阶段仅实现「空壳」或仅支持单一 provider（如 OpenAI），不改变 llm-api.js 的对外行为。

---

## 4. Phase 1：配置与 Model 映射

### 4.1 从 LlmConfig 到 AI SDK model

- 现有 `LlmConfig` 含：type、apiUrl、apiKey、selectedModel、enableMaxTokens、maxTokens 等。
- AI SDK 侧：
  - OpenAI 兼容：`openai(modelId, { baseURL: apiUrl, apiKey })`。
  - Google：`google(modelId, { apiKey })`（或从 apiUrl 取 endpoint，视 SDK 文档而定）。
  - Ollama：`ollama(modelId, { baseURL: apiUrl })`。
  - 千问等：若 SDK 有对应 provider 则映射；否则可暂时保留「自定义 OpenAI 兼容」用 `openai(selectedModel, { baseURL: apiUrl, apiKey })`。

在 `model-from-config.ts` 中实现：

- 输入：当前使用的 `LlmConfig`（来自 getLlmAdapter().getConfig() 或 Agent 的 getLlmConfig(engine)）。
- 输出：`LanguageModel` 实例，供 `generateText` / `streamText` 的 `model` 参数使用。

这样后续所有调用处只需「拿 config → 拿 model → 调 AI SDK」，不再关心 URL/headers/payload 分支。

### 4.2 统一配置入口（可选但推荐）

- 将「全局 LLM 配置」和「Agent 自定义 LLM 配置」收敛到同一套结构（例如都产出 `LlmConfig`），由 `model-from-config.ts` 唯一消费，避免 Agent 的 LlmAdapter 与 adapter-factory 双份配置逻辑长期存在。

---

## 5. Phase 2：对话/补全走 AI SDK

### 5.1 替换点

- **llm-api.js**：
  - `answerQuestion` → 内部改为调用桥接模块的「补全」封装（基于 `generateText` 或 `streamText`，单条 prompt）。
  - `continueConversation` → 内部改为调用「对话」封装：将 `sanitizeMessages` + `finalizeMessagesForAPI` 后的消息转为 AI SDK 的 `CoreMessage[]`，然后 `streamText`（或 `generateText`）写回 ref。
- **流式**：SDK 的 `streamText` 返回的 async iterable 用于逐 chunk 更新 ref，并在结束时取 usage 调用 `recordLlmRequest`。
- **Abort**：`signal` 传入 SDK 的 `abortSignal`，与现有 cancel 行为一致。

### 5.2 消息格式

- 当前为 OpenAI 风格（role、content、tool_calls、tool_call_id、name）。
- AI SDK 的 [Message 类型](https://sdk.vercel.ai/docs/reference/ai-sdk-core/message) 支持 system/user/assistant/tool，以及 assistant 上的 tool_calls。需在桥接层做一次「现有消息 → CoreMessage」的转换，保证 tool 轮次与 SDK 一致（若有历史 tool 消息）。

### 5.3 保留

- `createAiTask` 的入参和返回不变；`startAiTask` 里对 `answer` / `chat` 仍调用 `answerQuestion` / `continueConversation`，只是二者内部实现改为 AI SDK。
- RAG 注入（如 `ragQueryInjectionConversation`）仍在调用 AI SDK 前完成，逻辑不变。
- `processThinkTag` 仍可在拿到完整文本或每段 delta 后应用，再写 ref（若仍需隐藏 think 块）。

---

## 6. Phase 3：Agent 对话 + 原生 tool calling

### 6.1 当前 Agent 工具流程回顾

- 引擎构建 `contextMessages` + `toolPrompt`，调用 `LlmAdapter.callChatViaTask`。
- `callChatViaTask` 内部：createAiTask(chat) → startAiTask → continueConversation；同时 watch(resultRef)，在流中检测 `<tool_call>…</tool_call>`，解析后 `onToolCallsDetected(toolCalls)`，引擎把 toolCalls 入队 `ToolCallQueue`，队列通过 createAiTask(tool) 执行 `ToolRunner.runTool`。

### 6.2 目标流程（用 AI SDK）

- 仍通过 **createAiTask(chat)** 触发一次「Agent 对话」任务；但任务内部不再调用 `continueConversation`，而是：
  1. 用 `model-from-config` 得到 `model`。
  2. 把当前「可用工具」列表转成 AI SDK 的 `tools` 定义（description + parameters，可用 Zod 或 JSON Schema）。
  3. 调用 `streamText({ model, messages, tools, maxTokens, temperature, abortSignal })`。
  4. 消费流：**文本 delta** 照常写入 resultRef（并更新 reactiveMessage.markdown）；**tool_calls** 从 SDK 的 `streamText` 结果中直接读取（如 `fullStream?.toolCalls` 或按 SDK 文档的 part 类型），无需再解析 `<tool_call>` 文本。
  5. 每当有一批完整 tool_calls，调用现有 `onToolCallsDetected`，传入 `{ id, tool_id: name, parameters }` 形状，引擎仍把其加入 `ToolCallQueue`，执行逻辑不变（createAiTask(tool) + ToolRunner.runTool）。
  6. 若 SDK 支持「自动执行 tool 并继续」，可评估是否采用；若仍希望与现有队列、UI、会话顺序一致，可继续采用「SDK 只负责返回 tool_calls，执行与多轮由我们控制」的方式。

### 6.3 工具定义映射

- 现有 `getAvailableTools()` 返回的 id、name、description、schema、brief、fullSpec，可映射为 AI SDK 的 tool：
  - `description`：brief 或 description + 可选 fullSpec 摘要。
  - `parameters`：由现有 `inputSchema`（JSON Schema）转为 Zod 或直接使用 SDK 支持的 JSON Schema。
- Subagent 同样映射为一个 tool，参数为 `prompt` 等。

### 6.4 与 createAiTask 的衔接

- **任务边界**：一次「Agent 回合」仍然对应一个 createAiTask(chat) 的 handle；该任务内部可能多次「流式 chunk + 若干次 tool_calls」。
- **取消**：signal 传给 streamText，取消时 abort 该次 LLM 调用；createAiTask 的 cancel 逻辑不变。
- **onTaskCreated**：在 startAiTask 中创建 chat 任务后即回调，便于上层保存 handle 做取消，与现在一致。

---

## 7. Phase 4：清理与兜底

### 7.1 可移除或收缩的代码

- **llm-api.js**：删除按 type 分支的 ollama/gemini/qwen/OpenAI 多段实现，统一改为调用 AI SDK 桥接层；保留 `validateApi`、`sanitizeMessages`（若 AI SDK 入口仍需要统一消息格式）、`finalizeMessagesForAPI` 的收敛版本（若仍需要）。
- **llm-adapters/**：仅保留「从 settings/customConfig 生成 LlmConfig」的职责（或合并到 Phase 1 的 model-from-config），删除各 adapter 的 buildPayload、buildHeaders、convertResponse、extractStreamDelta 等实现；或保留为「仅用于生成 config」，不再参与实际 HTTP/SDK 调用。
- **agent-framework/llm-adapter.ts**：`callChatViaTask` 改为调用 AI SDK 的 streamText + tools，不再调用 createAiTask 时传入的 continueConversation；getLlmConfig 可保留，用于生成传给 model-from-config 的 config。watch 逻辑改为基于 SDK 的 tool call parts，不再用 `parseToolCallsFromContent` 解析文本。

### 7.2 工具解析器保留策略

- **tool-call-parsers.ts** / **tool-call-processor.ts**：建议保留为「兜底」或「兼容旧会话」：
  - 若某次调用未使用 tools（或 SDK 未返回 tool_calls），仍可从 assistant 文本中解析 `<tool_call>` 并触发 onToolCallsDetected；
  - 或仅用于历史消息的展示/回放。  
  可加开关：例如「当使用 AI SDK 且返回了 tool_calls 时，不再做文本解析」。

---

## 8. 实施顺序与风险

### 8.1 建议顺序

1. Phase 0 + Phase 1：先打通「配置 → model → 一次 streamText」在独立用例（如设置页测试对话）中验证。
2. Phase 2：在 answerQuestion / continueConversation 内切换为 AI SDK，全量回归文档问答、普通对话、多窗口。
3. Phase 3：在单个引擎（如 SimpleChat 或 AutoGPT）上接入 streamText + tools，验证工具入队与执行与现有一致，再推广到 ReAct、PlanExecute。
4. Phase 4：逐步删除旧分支与 adapter 实现，保留兜底解析与配置加载。

### 8.2 风险与缓解

- **厂商覆盖**：若某厂商（如千问、自建）AI SDK 无官方 provider，可继续用「OpenAI 兼容」baseURL 方式，或自写一个小 provider 封装 fetch，仍通过 AI SDK 的 model 接口接入。
- **流式与 usage**：确认 AI SDK 在 stream 结束时提供 usage，以便继续 `recordLlmRequest`。
- **Electron/主进程**：若 LLM 调用必须在主进程，需确认 AI SDK 在 Node 环境下的用法与在 renderer 中一致，或通过 IPC 把「模型 + 消息」交给主进程执行后把流/结果回传。

---

## 9. 参考

- [Vercel AI SDK - GitHub](https://github.com/vercel/ai)
- [AI SDK - generateText](https://sdk.vercel.ai/docs/reference/ai-sdk-core/generate-text)
- [AI SDK - streamText](https://sdk.vercel.ai/docs/reference/ai-sdk-core/stream-text)
- [AI SDK - Tools and Tool Calling](https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling)
- 本仓库 [LLM_AND_AGENT_ARCHITECTURE.md](./LLM_AND_AGENT_ARCHITECTURE.md)：当前链路与文件索引。

---

## 10. 实施状态（简要）

- **Phase 0–2**：已完成；answer/chat 已走 AI SDK，model-from-config 支持多厂商。
- **Phase 3（已完成）**：
  - **统一工具格式**：`llm-ai-sdk/tools-to-ai-sdk.ts` 将引擎 `getAvailableTools()` 的返回转为 AI SDK `tools`（`toAISDKTools`），所有引擎共用，无需各引擎单独改格式。
  - **streamChatWithTools**：`llm-ai-sdk/stream-chat-with-tools.ts` 使用 `streamText` + `tools`，消费 `fullStream`，推送文本 delta 并在 `tool-input-available` 时回调 `onToolCall`。
  - **llm-api.js**：新增 `continueConversationWithTools(conversation, ref, meta, signal, customLlmConfig)`，当 `meta.tools` 与 `meta.onToolCallsDetected` 存在时由 `startAiTask` 调用。
  - **ai_tasks.ts**：chat 分支中若 `task.meta.tools?.length && task.meta.onToolCallsDetected` 则调用 `continueConversationWithTools`，否则仍调用 `continueConversation`。
  - **llm-adapter.ts**：`callChatViaTask` 增加可选参数 `tools`；当 `tools` 与 `onToolCallsDetected` 同时提供时，将二者传入 createAiTask 的 meta，走原生 tools 路径；watch 与流式结束兜底仅在「未使用原生 tools」时解析 `<tool_call>` 文本。
  - **agent-engine-executor**：所有带 `onToolCallsDetected` 的 `callChatViaTask` 调用均增加 `tools: this.getAvailableTools()`。
- **Phase 4（部分完成）**：
  - **callChatViaTask**：当使用原生 tools 时已不再依赖 watch/文本解析做工具检测；文本解析与兜底仅在不传 `tools` 时保留，作为兜底或兼容旧会话。
  - **llm-adapters 收缩**：尚未进行；当前仍保留各 adapter 的 config 构建，实际请求已由 AI SDK 统一完成，后续可逐步将 adapter 收为「仅生成 LlmConfig」。
