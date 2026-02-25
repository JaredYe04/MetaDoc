# MetaDoc Agent Tools 规约参考

本文档补充 SKILL.md 中的类型、事件名、i18n 键与序列化约定，供实现与排查时查阅。

## 类型与接口（types/agent-tool.ts）

### ToolSpec（简略/详细提示词）

- **brief**：简短说明，永远进入 System Prompt，用于意图识别和工具选择。
- **fullSpec**：完整说明，按需注入，包含使用说明、参数说明等。
- 若提供 `spec`，框架会优先使用；否则用 `instruction`。

### AgentToolConfig 关键字段

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 唯一标识 |
| name | LocalizedText | 名称，支持 ToolLocales |
| description | LocalizedText | 描述，支持 ToolLocales |
| instruction | string \| ToolLocales | 详细说明，支持 i18n |
| spec | ToolSpec? | brief + fullSpec，可选 |
| callback | ToolCallback | 执行函数 |
| displayComponent | Component \| string? | Display 组件 |
| inputSchema / outputSchema | object? | JSON Schema |
| locales | ToolLocales? | i18n 映射 |

### ToolCallbackData（onUpdate 数据）

- **content**：任意可序列化对象，Display 用 `parseToolData` 解析后渲染。
- **format**：`'text' | 'json' | 'markdown' | 'xml' | 'html' | 'custom'`。
- **componentName**（可选）：指定显示组件名，与 Display 对应。

### ToolCallbackResult（回调返回值）

- **status**：`'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'`。
- **data**：ToolCallbackData，供 Display 与快照使用。
- **result**：最终结果（成功时）。
- **error**：错误信息（失败时）。
- **progress**：可选进度。

### ToolDisplayComponentProps（Display 组件 Props）

- **data**：当前回调数据。
- **status**：当前执行状态。
- **progress**：当前进度。
- **error**：错误信息。
- **toolConfig**：工具配置。
- **invocationId**：执行 ID，用于 eventBus 订阅。
- **onUpdate** / **onCancel**：交互回调。

---

## 消息传递（tool-display-communication.ts）

### 事件前缀与命名

- **更新**：`tool-update:{invocationId}`，payload：`{ invocationId, data, progress?, timestamp }`。
- **完成**：`tool-complete:{invocationId}`，payload：`{ invocationId, status, data?, error?, progress?, timestamp }`。
- **失败**：`tool-failed:{invocationId}`，payload：`{ invocationId, error, timestamp }`。

### 使用方式

- Tool 侧不直接 emit；由 `AgentToolManager` 在调用 callback 时，根据 callback 内 `onUpdate` 的调用和返回结果转发上述事件。
- Display 侧：通过 `useToolDisplayRealtime(invocationId, data, status, progress)` 内部订阅上述事件，得到 `realtimeData`、`realtimeStatus`、`realtimeProgress`。

---

## i18n 键约定

### Tool 名称/描述/instruction

- 在 `*-tool.ts` 中用 `ToolLocales` 对象，key 为 `zh_cn`、`en_us` 等，每语言下可有 `name`、`description`、`instruction`。
- 使用 `i18n-helper.ts` 的 `getLocalizedText(text)`、`getLocalizedInstruction(instruction)` 取当前语言文案。

### Display 组件文案

- 键命名空间：`agent.display.<toolName>.<key>`。
- 示例：`agent.display.color.title`、`agent.display.color.processing`、`agent.display.edit.appliedEdits`、`agent.display.todoList.totalTasks`。
- 在 Vue 中统一使用 `$t('agent.display.<toolName>.<key>')`，不在模板写死多语言字符串。

---

## Display 组件实现要点

1. **数据来源**：`displayData = computed(() => parseToolData(realtimeData ?? props.data))`，优先 realtime。
2. **状态**：`effectiveStatus = computed(() => realtimeStatus !== 'running' ? realtimeStatus : props.status)`。
3. **主题**：使用 `themeState` 或项目约定主题 composable，样式用 `v-bind('themeState.currentTheme.xxx')` 或等效方式。
4. **可序列化**：Display 渲染所需数据全部来自 props/event payload，不依赖不可序列化的外部状态，以便快照与历史回放一致。

---

## 序列化与快照

- 工具结果通过 `ToolRunner.serializeToOpenAIFormat()` 等做统一序列化；Tool 返回的 `data`/`result` 须为可 JSON 序列化结构。
- 快照/反序列化见 README 与 `tool-serialization.ts`；新增 Tool 时保持返回结构可序列化即可。

---

## 相关文件速查

| 用途 | 路径 |
|------|------|
| 类型定义 | `src/renderer/src/types/agent-tool.ts` |
| Tool↔Display 通信 | `src/renderer/src/utils/agent-tools/tool-display-communication.ts` |
| Display 实时状态 | `src/renderer/src/utils/agent-tools/composables/useToolDisplayRealtime.ts` |
| i18n 辅助 | `src/renderer/src/utils/agent-tools/i18n-helper.ts` |
| 工具函数/错误 | `src/renderer/src/utils/agent-tools/tool-utils.ts` |
| 详细步骤与示例 | `src/renderer/src/utils/agent-tools/README.md`、`AGENTS.md` |
