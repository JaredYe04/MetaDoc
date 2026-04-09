---
name: metadoc-agent-tools
description: Standardizes creating and maintaining MetaDoc agent tools. Use when adding a new tool, changing tool spec/instruction/i18n, adding or updating a Display component, or aligning tool–Display message passing in meta-doc.
---

# MetaDoc Agent Tools 创建与维护流程

在 MetaDoc 中新增或修改 Agent 工具时，按本流程执行，保证工具规约、i18n、Display 组件与消息传递一致。

## 何时使用本 Skill

- 新增一个 `*-tool.ts` 或修改现有工具的 spec/instruction/回调
- 新增或修改配套的 Display 组件（如 `*Display.vue`）
- 调整工具的简略/详细提示词（brief/fullSpec）或多语言
- 统一 Tool ↔ Display 的消息传递方式

## 核心路径与角色

| 角色               | 路径                                                         |
| ------------------ | ------------------------------------------------------------ |
| Tool 定义          | `src/renderer/src/utils/agent-tools/*-tool.ts`               |
| Display 组件       | `src/renderer/src/utils/agent-tools/components/*Display.vue` |
| 注册入口           | `src/renderer/src/utils/agent-tools/index.ts`                |
| Tool↔Display 通信 | `tool-display-communication.ts`（emit/on）                   |
| Display 实时状态   | `composables/useToolDisplayRealtime.ts`                      |
| 手册（可选）       | `src/renderer/src/manuals/zh_CN/agent/tools.md`              |

详细类型与事件命名见 [reference.md](reference.md)。

---

## 一、创建/修改 Tool（\*-tool.ts）

### 1.1 配置结构（必守）

- **id**：唯一，如 `'color-processing'`。
- **name / description**：i18n，使用 `ToolLocales`（如 `zh_cn`、`en_us` 的 `name`、`description`）。
- **instruction**：详细说明，支持 i18n（`ToolLocales` 每语言下可带 `instruction`）；内容为 Markdown，含功能、使用场景、输入/输出格式、注意事项。
- **spec**（推荐）：用于上下文优化。
  - **brief**：简略提示词，始终进入 System Prompt，供意图识别与工具选择。
  - **fullSpec**：详细说明，按需注入；与 instruction 内容可一致或更精简。
- **callback**：`(params, signal, onUpdate) => Promise<ToolCallbackResult>`。
- **displayComponent**：对应 `*Display.vue` 组件（可选）。
- **inputSchema / outputSchema**：JSON Schema，便于校验与文档。
- **locales**：与 name/description/instruction 的 i18n 一致。

### 1.2 回调约定

- **进度与中间结果**：通过 `onUpdate(data, progress)` 发送。
  - `data`: `{ content, format, componentName? }`（`ToolCallbackData`）。
  - `progress`: `{ percentage, message? }`（0–100）。
- **返回**：`Promise<ToolCallbackResult>`，即 `{ status, data?, result?, error?, progress? }`。
  - 有 Display 时，`data` 中 `content` 为 Display 所需结构，`componentName` 与 Display 组件名一致。
- **错误**：使用 `tool-utils.ts` 的 `createDetailedError` 等，便于 LLM 重试。
- **可取消**：回调内检查 `signal.aborted`，必要时提前返回。

### 1.3 注册

在 `index.ts` 的 `initializeAgentTools()` 中 `agentToolManager.registerTool(xxxToolConfig)`。

---

## 二、创建/修改 Display 组件（\*Display.vue）

### 2.1 Props 与数据源

- 实现 **ToolDisplayComponentProps**：`data`、`status`、`progress?`、`error?`、`toolConfig`、`invocationId?`、`onUpdate?`、`onCancel?`。
- **实时数据**：使用 `useToolDisplayRealtime(invocationId, data, status, progress)`，得到 `realtimeData`、`realtimeStatus`、`realtimeProgress`。
- **展示用数据**：优先用 realtime，否则用 props；若 payload 带 `content` 包装，用 `parseToolData(data)` 取出再渲染。

### 2.2 主题与 i18n

- **主题**：用 `themeState` 或现有主题 composable，保证与应用主题一致（如背景、文字色）。
- **文案**：全部用 `$t('agent.display.<toolName>.<key>')`，不在模板里写死中文/英文。key 放在 `agent.display.<toolName>` 下（与项目 i18n 文件一致）。

### 2.3 消息传递（与 Tool 一致）

- Tool 侧：仅通过 `onUpdate` 传入的 `data` 经 `tool-display-communication` 转发（`tool-update:{invocationId}` / `tool-complete` / `tool-failed`）。
- Display 侧：只通过 `invocationId` 订阅上述事件，用 `useToolDisplayRealtime` 消费；不在此处直接调用 Tool 或 agent 接口。
- 交互回传：如需把用户操作反馈给会话，使用 props 的 `onUpdate(data)`，由上层与 Agent 约定用法。

---

## 三、i18n 规约

- **Tool 名称/描述/instruction**：在 `*-tool.ts` 的 `ToolLocales` 中为每种语言提供 `name`、`description`，以及可选的 `instruction`。
- **Display 文案**：在全局 i18n 资源中增加 `agent.display.<toolName>.*`（如 `agent.display.color.title`、`agent.display.edit.appliedEdits`）。与 `ColorDisplay.vue`、`EditDisplay.vue`、`TodoListDisplay.vue` 等现有用法保持一致。
- 使用 `i18n-helper.ts` 的 `getLocalizedText` / `getLocalizedInstruction` 时，与上述 key 约定一致。

---

## 四、清单：新增一个完整 Tool

按顺序打勾，避免遗漏：

1. **[ ]** 在 `utils/agent-tools/` 下新增 `*-tool.ts`，实现 `AgentToolConfig`（id、name、description、instruction、spec.brief/fullSpec、callback、displayComponent、inputSchema/outputSchema、locales）。
2. **[ ]** 在 `utils/agent-tools/components/` 下新增 `*Display.vue`，实现 `ToolDisplayComponentProps`，使用 `useToolDisplayRealtime` 与 `parseToolData`，主题与 `$t('agent.display.<toolName>.*')`。
3. **[ ]** 在全局 i18n 中补充 `agent.display.<toolName>` 下所有展示用 key。
4. **[ ]** 在 `index.ts` 的 `initializeAgentTools()` 中注册该 Tool。
5. **[ ]** （可选）若影响“工具集”或对用户可见的能力说明，更新 `manuals/zh_CN/agent/tools.md`。

---

## 五、清单：仅修改现有 Tool

1. **[ ]** 改 spec（brief/fullSpec）或 instruction 时，同步检查各语言 `ToolLocales` 与 `locales`。
2. **[ ]** 改回调的入参/出参或 `onUpdate` 的 `content` 结构时，同步改对应 Display 的解析与展示逻辑，以及 `parseToolData` 若需兼容。
3. **[ ]** 改 Display 时，确保仍只通过 `invocationId` + `useToolDisplayRealtime` 与既有事件协议通信；新增文案一律走 `agent.display.<toolName>.*`。

---

## 六、参考实现

- **轻量 Tool + Display**：`color-tool.ts` + `ColorDisplay.vue`（spec、i18n、onUpdate、Display 状态）。
- **复杂 Tool + 多阶段 UI**：`edit-tool.ts` + `EditDisplay.vue`，`todolist-tool.ts` + `TodoListDisplay.vue`。
- **通信与类型**：`tool-display-communication.ts`，`types/agent-tool.ts`，`composables/useToolDisplayRealtime.ts`。

更多字段说明、事件名、序列化与快照见 [reference.md](reference.md)。
