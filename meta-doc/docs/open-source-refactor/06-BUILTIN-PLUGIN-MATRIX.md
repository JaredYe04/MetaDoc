# 内置插件矩阵

内置插件由 [`builtin-manifests.ts`](../../src/renderer/src/plugins/builtin-manifests.ts) 注册，在 `loadAiRuntime()` 时按数组顺序 `activate`。

**前提：** 用户设置 `llmEnabled === true` 且 AI 运行时已加载。

---

## 总览表

| 插件 ID | 名称 | 权限 | 主要贡献点 | 关联视图 / 组件 |
|---------|------|------|------------|-----------------|
| `metadoc.builtin.completion` | AI Auto Completion | `documents.read`, `documents.write`, `llm.completion` | `editor.registerOverlay` | `AISuggestionGhost.vue` |
| `metadoc.builtin.section-optimizer` | Section Optimizer | `documents.read`, `documents.write`, `llm.chat` | `ui.registerContextMenuItem` | 事件 `section-optimizer` |
| `metadoc.builtin.translate-selection` | Translate Selection | `documents.read`, `documents.write`, `llm.chat` | `ui.registerContextMenuItem` | 事件 `translate-selection` |
| `metadoc.builtin.outline-ai` | Outline AI | `outline.read`, `outline.write`, `llm.chat` | `events.emit('outline-ai-plugin-ready')` | 大纲 AI 由既有模块监听 |
| `metadoc.builtin.ai-chat` | AI Chat | `documents.read`, `llm.chat` | `ui.registerLeftMenuItem` | 事件 `ai-chat` → `AIChat` |
| `metadoc.builtin.agent` | Agent | `documents.read`, `documents.write`, `llm.chat`, `main.terminal` | `registerDocumentView` + 左侧菜单 | `AgentView.vue` |
| `metadoc.builtin.knowledge-rag` | Knowledge Base | `main.rag`, `llm.chat` | `ui.registerLeftMenuItem` | 事件 `open-knowledge-base` → `KnowledgeBase` |
| `metadoc.builtin.proofread` | Proofread | `documents.read`, `documents.write`, `llm.chat` | `registerDocumentView` | `ProofreadView.vue` |
| `metadoc.builtin.tool-windows` | AI Tool Windows | `llm.chat` | 多个 `registerLeftMenuItem`（`parentId: ai-assistant`） | OCR、公式、绘图等工具窗 |
| `metadoc.builtin.shell-overlays` | AI Shell Overlays | `llm.completion`, `llm.chat` | `registerShellOverlay`（`position: main`） | `AITaskQueue`, `LlmApiErrorDialog` |

所有内置 AI 插件均声明 `activationEvents: ['onLlmEnabled']`。

---

## 按 UI 贡献类型

### 文档视图（`registerDocumentView`）

| view 键 | 插件 | 组件 |
|---------|------|------|
| `agent` | agent | `AgentView.vue` |
| `proofread` | proofread | `ProofreadView.vue` |

渲染：`WorkspaceDocumentViews.vue` 在 `isAiRuntimeLoaded()` 为真时遍历 `pluginRegistry.documentViews`。

切换视图：`host.events.emit('switch-document-view', { tabId, view })`。

### 编辑器叠加层（`registerOverlay`）

| overlay id | 插件 | formats |
|------------|------|---------|
| `ai-suggestion-ghost` | completion | `md`, `tex`, `txt` |

### 左侧菜单（`registerLeftMenuItem`）

| item id | 插件 | parentId | 行为 |
|---------|------|----------|------|
| `ai-chat` | ai-chat | `ai-assistant` | `emit('ai-chat')` |
| `agent` | agent | — | 切换到 agent 视图 |
| `knowledge-base` | knowledge-rag | — | `emit('open-knowledge-base')` |
| `fomula-recognition` 等 | tool-windows | `ai-assistant` | 各工具窗事件 |

> **集成状态：** 插件已向 `pluginRegistry.leftMenuItems` 注册；`LeftMenu.vue` 仍含静态 `ai-assistant` 子菜单，**完整动态合并待办**（见 [HANDOFF.md](./HANDOFF.md)）。

### 右键菜单（`registerContextMenuItem`）

| item id | 插件 | group |
|---------|------|-------|
| `section-optimizer` | section-optimizer | `ai` |
| `translate-selection` | translate-selection | `ai` |

> **集成状态：** `pluginRegistry.contextMenuItems` 尚未由选区菜单统一消费，待接入选区上下文菜单管线。

### Shell 浮层（`registerShellOverlay`）

| overlay id | 插件 | position | 消费方 |
|------------|------|----------|--------|
| `ai-task-queue` | shell-overlays | `main` | `Main.vue`（`aiRuntimeReady` 时） |
| `llm-api-error-dialog` | shell-overlays | `main` | 同上 |

---

## tool-windows 事件映射

| 菜单 id | eventBus 事件 |
|---------|---------------|
| `fomula-recognition` | `fomula-recognition` |
| `smart-drawing-assistant` | `smart-drawing-assistant` |
| `data-analysis` | `data-analysis` |
| `ocr` | `ocr` |
| `attachment` | `attachment` |
| `aigc-detection` | `aigc-detection` |

对应路由 / 辅助窗口见 `router/router.js` 的 `pages` 映射。

---

## 加载顺序

```text
completion → section-optimizer → translate-selection → outline-ai
→ ai-chat → agent → knowledge-rag → proofread → tool-windows → shell-overlays
```

顺序一般无硬依赖；`shell-overlays` 置后以确保任务队列在其它 AI 入口注册之后挂载。

---

## 与旧架构对照

| 旧位置（重构前） | 新插件 |
|------------------|--------|
| `App.vue` 全局 AI 组件 | `shell-overlays`（部分） |
| `LeftMenu.vue` 硬编码 AI 项 | 各 builtin 的 `registerLeftMenuItem` |
| 编辑器内联补全挂载 | `completion` + `registerOverlay` |
| Agent / 校对视图直接 import | `agent` / `proofread` + `registerDocumentView` |

---

## 添加新内置 AI 功能 checklist

1. 新建 `plugins/builtin/<feature>.ts`
2. 声明 `permissions` 与 `activationEvents: ['onLlmEnabled']`
3. 在 `activate` 中仅通过 `host.*` 注册
4. 追加至 `builtin-manifests.ts`
5. 更新本矩阵与 [HANDOFF.md](./HANDOFF.md)（若涉及 UI 消费方改动）
