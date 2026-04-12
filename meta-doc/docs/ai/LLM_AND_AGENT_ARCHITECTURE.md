# MetaDoc LLM 与 Agent 架构梳理

本文档描述当前 MetaDoc 中 **LLM API 管理/配置**、**多厂商适配** 以及 **Agent 工具调用解析与执行** 的完整链路，便于后续迁移到 Vercel AI SDK 时保持边界清晰。

---

## 1. 整体数据流概览

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  UI / 业务层                                                                     │
│  - 文档问答、对话、Agent 对话、子窗口任务                                          │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  createAiTask (ai_tasks.ts) — 统一 AI 任务入口                                    │
│  - 任务类型: answer | chat | tool                                                 │
│  - 管理 handle、status、cancel、done Promise、多窗口注册                            │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
          ┌─────────────────────────────┼─────────────────────────────┐
          ▼                             ▼                             ▼
   answer 任务                    chat 任务                      tool 任务
   (answerQuestion)              (continueConversation)         (ToolRunner.runTool)
          │                             │
          ▼                             ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  llm-api.js — 统一 LLM 调用层                                                     │
│  - validateApi / getLlmAdapter(customConfig)                                     │
│  - sanitizeMessages / finalizeMessagesForAPI                                     │
│  - 按 type 分支: ollama|manual → fetch; gemini → SDK; qwen → fetch; 其他 → OpenAI  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  llm-adapters/ — 多厂商适配                                                        │
│  - adapter-factory.ts: createAdapterFromSettings / createAdapter(config)         │
│  - base-adapter.ts: 抽象接口 (URL/payload/headers/convertMessages/stream 等)       │
│  - openai-adapter.ts, gemini-adapter.ts, ollama-adapter.ts, qwen-adapter.ts       │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
          ┌─────────────────────────────┴─────────────────────────────┐
          ▼                                                           ▼
   HTTP (llm-http.js)                                         厂商 SDK (如 @google/genai)
   sendNonStreamRequest / sendStreamRequest                    generateContent(Stream) 等
```

**Agent 专用路径**（仍经过 createAiTask，但由 Agent 的 LlmAdapter 封装）：

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  agent-framework/agent-engine-executor.ts                                        │
│  - ReAct / AutoGPT / PlanExecute / SimpleChat 等引擎                              │
│  - 构建 contextMessages、toolPrompt、调用 LlmAdapter.callChatViaTask              │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  agent-framework/llm-adapter.ts (LlmAdapter 类，注意与 llm-adapters 区分)          │
│  - getLlmConfig(engine): 全局 vs 自定义 LLM 配置                                  │
│  - callChatViaTask: 封装 createAiTask + 流式 watch + 工具调用检测与回调            │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
          ┌─────────────────────────────┴─────────────────────────────┐
          ▼                                                           ▼
   createAiTask(..., ai_types.chat)                            watch(resultRef) 中解析
   → startAiTask → continueConversation                         <tool_call> 并 onToolCallsDetected
```

---

## 2. LLM 多厂商适配链路

### 2.1 配置来源

- **全局配置**：`settings.js`（selectedLlm、各厂商 apiKey/apiUrl/model、enableMaxTokens、maxTokens 等）。
- **自定义配置**：任务 meta 中的 `customLlmConfig`（如 Agent 的 engine.customLlmConfig），或直接传入的 `customConfig`。

### 2.2 适配器工厂与类型

**文件**: `renderer/src/utils/llm-adapters/adapter-factory.ts`

- `createAdapterFromSettings(customConfig?)`  
  - 若传入 `customConfig`，则用其构造 `LlmConfig`（type 默认 `openai-compatible`）。  
  - 否则从 `getSetting('selectedLlm')` 及对应 key 读取各厂商配置，拼出 `LlmConfig`。
- `createAdapter(config)`  
  - 根据 `config.type` 懒加载并实例化对应适配器：  
    - `openai` / `openai-official` / `deepseek` → `OpenAiAdapter`  
    - `qwen` → `QwenAdapter`  
    - `gemini` → `GeminiAdapter`  
    - `ollama` → `OllamaAdapter`  
    - `manual` / `metadoc` → `OpenAiAdapter`（兼容 OpenAI 格式）

### 2.3 基类与各适配器职责

**base-adapter.ts**

- 抽象方法：`getCompletionUrl`、`getChatUrl`、`buildCompletionPayload`、`buildChatPayload`、`buildHeaders`。
- 可选 SDK 路径：`generateContentNonStream`、`generateContentStream`、`generateChatNonStream`、`generateChatStream`。
- 默认实现：`convertMessages` 透传；`convertResponse`、`extractStreamDelta`、`extractStreamUsage` 按 OpenAI 形状解析。

**各适配器简要**

| 类型       | 文件               | 说明 |
|------------|--------------------|------|
| OpenAI 兼容 | openai-adapter.ts  | URL 为 apiUrl + /completions 或 /chat/completions；payload 为 model/messages/temperature；流式用 OpenAI SDK 或 fetch。 |
| Gemini     | gemini-adapter.ts  | 使用 @google/genai；convertMessages 转为 Gemini 的 user/model + parts；补全/对话走 generateContent(Stream)。 |
| Ollama     | ollama-adapter.ts  | 自有 URL 与 payload 格式（如 /api/chat、num_predict）；走 llm-http fetch。 |
| Qwen       | qwen-adapter.ts    | DashScope 原生 API；URL/headers/payload 与 OpenAI 不同；走 llm-http fetch。 |

### 2.4 llm-api.js 中的分支逻辑

- **入口**：`answerQuestion` / `continueConversation`，内部 `getLlmAdapter(customConfig)`，再根据 `adapter.getConfig().type` 分支。
- **分支**：  
  - `ollama` / `manual`：用 adapter 的 URL/payload/headers，走 `sendNonStreamRequest` / `sendStreamRequest`（llm-http.js）。  
  - `gemini`：用 adapter 的 `generateContentNonStream` / `generateContentStream`、`generateChatNonStream` / `generateChatStream`（不经过 HTTP 封装）。  
  - `qwen`：用 adapter 的 URL/payload/headers，走 llm-http。  
  - 其余（openai/deepseek/metadoc 等）：用 `OpenAI` SDK（baseURL + apiKey），调用 `completions.create` / `chat.completions.create`。
- **消息处理**：所有对话先 `sanitizeMessages`，再 `finalizeMessagesForAPI`，再按需 `adapter.convertMessages`（Gemini 在 adapter 内部转，其它用 OpenAI 格式）。
- **统计**：`recordLlmRequest(usage, selectedModel, mode)` 在非流/流结束时调用。

---

## 3. 工具调用解析与执行链路

### 3.1 解析入口与解析器

**统一入口**: `agent-framework/tool-call-processor.ts` 的 `parseToolCalls(content, options)`。

- 内部委托给 `toolCallParserManager.parse(content, options)`（`tool-call-parsers.ts`）。
- 支持选项：`loose`（是否要求完整 `</tool_call>`）、`validateToolId`、`toolIdValidator`。

**解析器列表**（ToolCallParserManager，按优先级）：

1. **StandardToolCallParser**  
   - 标签：`<tool_call>...</tool_call>`（及 tool-call、function_call 等变体）。  
   - 内容：JSON 单对象、JSON 数组、或标签名即 tool_id 的 XML 风格（如 `<workspace>{"paths":[]}</workspace>`）。  
   - 内层可含 DSML，委托给 DeepSeekDSMLParser。
2. **XMLToolCallParser**  
   - `<name>tool_id</name><arguments>{...}</arguments>` 或 `<tool_id>{...}</tool_id>`。
3. **DeepSeekDSMLParser**  
   - `<｜DSML｜function_calls>`、`<｜DSML｜invoke name="tool_id">`、`<｜DSML｜parameter>` 等。
4. **SubagentsBatchParser**  
   - `{"subagents": [{ "id"/"task"/"output_file" }]}`，展开为多个 subagent 调用。
5. **ActionParamsParser**  
   - `{"action": "edit", "params": {...}}`，action 作 tool_id，params 标准化（如 file_path→filePath；edit 的 content→V2 `edits`，适用于空文件写入）。
6. **OpenAIFunctionCallParser**  
   - 裸 JSON 的 tool/name/tool_id + arguments，避免与 `<tool_call>` 内 JSON 重复匹配。

解析结果统一为 `ParsedToolCall`：`id`、`tool_id`、`parameters`、`isValid`、`error?`、`rawContent?`。

### 3.2 Agent 侧：何时解析、谁执行

- **流式过程中的检测**（agent-framework/llm-adapter.ts 的 `callChatViaTask`）：  
  - 对 `resultRef` 做 `watch`，当出现完整 `<tool_call>...</tool_call>` 且括号匹配时，用 `parseToolCallsFromContent`（严格）解析，去重后调用 `onToolCallsDetected(toolCalls)`。
- **流结束后的兜底**：  
  - 对未处理内容先用严格解析，失败再用 `parseToolCallsFromContentLoose`（loose: true），再次去重后调用 `onToolCallsDetected`。
- **执行端**（agent-engine-executor.ts）：  
  - `onToolCallsDetected` 由 `createToolCallsDetectedHandler(assistantMessage)` 提供：  
    - 把解析结果合并进 `assistantMessage.tool_calls`，  
    - 将每个 tool call 加入 `ToolCallQueue`（`currentToolCallQueue.addTask(toolCall)`），队列内部通过 `createAiTask(..., ai_types.tool, ...)` 执行工具，结果写回 session messages。
  - 非流式或兜底时，`parseToolCalls` / `parseMarkedToolCalls` 同样产出 list，逻辑与流式一致（入队、等待队列完成）。

### 3.3 工具执行与任务类型

- **ToolCallQueue**：按序/并发把每个 `{ id, tool_id, parameters }` 转为一次 `createAiTask(..., ai_types.tool, meta)`，meta 中含 toolId、parameters、session、tool_call_id。
- **startAiTask** 对 `ai_types.tool`：  
  - 从 meta 取 toolId、parameters、session、tool_call_id，调用 `ToolRunner.runTool(...)`，将 observation 写回 task.meta，结果写入 task.target.value，供队列收集并写回会话。

---

## 4. 关键文件索引

| 层级           | 文件 | 职责 |
|----------------|------|------|
| 任务统一入口   | `renderer/src/utils/ai_tasks.ts` | createAiTask、startAiTask、cancel、done、多窗口注册 |
| 通用 LLM 调用  | `renderer/src/utils/llm-api.js` | validateApi、getLlmAdapter、sanitize/finalize 消息、按 type 分支调用适配器或 OpenAI SDK |
| HTTP 封装     | `renderer/src/utils/llm-http.js` | sendNonStreamRequest、sendStreamRequest、processThinkTag |
| 适配器工厂     | `renderer/src/utils/llm-adapters/adapter-factory.ts` | createAdapterFromSettings、createAdapter |
| 适配器基类     | `renderer/src/utils/llm-adapters/base-adapter.ts` | 抽象接口与默认 convert/extract 实现 |
| 适配器实现     | `renderer/src/utils/llm-adapters/openai-adapter.ts` 等 | 各厂商 URL、payload、headers、可选 SDK 流式 |
| 类型定义       | `renderer/src/utils/llm-adapters/types.ts` | LlmConfig、Message、UnifiedResponse、UsageStats 等 |
| Agent LLM 封装 | `renderer/src/utils/agent-framework/llm-adapter.ts` | getLlmConfig、callChatViaTask、watch+工具解析+onToolCallsDetected |
| 工具解析       | `renderer/src/utils/agent-framework/tool-call-parsers.ts` | 多格式解析器与 ToolCallParserManager |
| 工具解析入口   | `renderer/src/utils/agent-framework/tool-call-processor.ts` | parseToolCalls、ParsedToolCall |
| 引擎执行       | `renderer/src/utils/agent-framework/agent-engine-executor.ts` | ReAct/AutoGPT 等、buildToolCallPrompt、parseMarkedToolCalls、ToolCallQueue、waitForToolCallQueue |

---

## 5. 当前痛点小结

1. **双套 LLM 配置**：全局配置在 adapter-factory + settings，Agent 的 LlmAdapter 又有一套 getGlobalLlmConfig/getCustomLlmConfig，易不同步。  
2. **双套调用路径**：通用对话走 llm-api.js + 适配器；Agent 走 agent-framework/llm-adapter.ts，内部对 Gemini 等再调 createAdapterFromSettings，分支重复。  
3. **消息格式多处维护**：sanitizeMessages、finalizeMessagesForAPI、convertMessages 分散在 llm-api 与多个 adapter，tool_calls 的 arguments 必须为 JSON 字符串等约束散落。  
4. **工具调用解析与协议强耦合**：依赖模型输出 `<tool_call>` 文本块，流式时要自己 watch 拼接、括号匹配、去重，逻辑重且易漏。  
5. **扩展新厂商成本高**：需改 adapter-factory、新 adapter、llm-api 分支、以及 Agent 的 LlmAdapter 中的 type 分支。

---

下一步见 [VERCEL_AI_SDK_MIGRATION.md](./VERCEL_AI_SDK_MIGRATION.md)，在保持 `createAiTask` 统一任务管理的前提下，将底层 LLM 调用与 Agent 工具解析迁移到 Vercel AI SDK。
