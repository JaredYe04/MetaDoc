# 多 Tab 会话模式与单会话遗留逻辑说明

## 背景

应用已从「单会话」（无 Tab，不同 AI 工具用独立 Electron 窗口）重构为「多 Tab 会话」：同一窗口内可开多个 Tab（多个编辑器等）。以下为与 Tab 相关的注意点和单会话遗留逻辑梳理，便于排查隐患。

---

## 已修复的 Bug（与单会话遗留相关）

- **打开文档时未初始化 Tab 标题被改错**  
  从「最近文档」或「打开文档」打开文件时，未初始化的「新文档」Tab 的标题会被错误地改成刚打开的文件名（如 `aaa.md`）。原因有两处：
  1. **替换逻辑（已删）**：`Main.vue` 原先会「替换」当前空 Tab，导致该 Tab 被写成打开的文件；已改为**始终在新 Tab 中打开文件**，不再替换。
  2. **`update-current-path` 竞态**：主进程在 `openDoc()` 里会连续发送 `open-doc-success` 和 `update-current-path`。若渲染端先处理 `update-current-path`，此时新 Tab 尚未由 `workspace-open-document` 创建，`getDocument()` 拿到的是当前（未初始化）Tab，旧逻辑会往该 Tab 写入 path 并 `markDocumentSaved`，从而把标题改成文件名。  
  **修复**：在 `event-bus.js` 的 `update-current-path` 处理中，**仅当已有某个 Tab 正在使用该 path 时才做同步**；若尚无任何 Tab 使用该 path，直接 return，不更新当前 Tab，由 `workspace-open-document` 负责创建新 Tab 并设置 path。

---

## 单会话遗留 / 需注意的逻辑

以下逻辑仍带有「当前只有一个文档/窗口」的假设，在多 Tab 下若使用不当可能出问题，建议在改相关功能时留意。

### 1. 主进程「当前路径」事件：`update-current-path`

- **位置**：主进程在打开/保存文件后发送 `update-current-path`；渲染端在 `event-bus.js` 中监听。
- **现状**：event-bus 已按 Tab 做了防护：先查是否已有 Tab 使用该路径；若没有，仅当**当前活动 Tab 为新建文档（无 path）**时才更新 path。多 Tab 下行为基本正确。
- **风险**：主进程本身没有 Tab 概念，只发「当前路径」。若将来主进程在其它场景也发该事件，需确保不会误更新非当前 Tab。

### 2. 保存 / 同步只认「当前 Tab」

- **位置**：`event-bus.js` 中 `save`、`getDocument()`、`resolveTargetTabId(targetTabId)` 等。
- **现状**：无 `targetTabId` 时用 `activeTabId.value`，即只对「当前活动 Tab」操作；保存、同步内容、sync-active-editor 等已支持传入 `tabId` 时按指定 Tab 处理。
- **风险**：任何只调 `getDocument()` 且未传 `tabId` 的逻辑，都只作用在当前 Tab；若 UI 或后台任务需「对指定 Tab」操作，必须显式传 `tabId`。

### 3. 依赖 `activeDocument` / `activeTab` 的视图

- **位置**：如 `Home.vue`、`Outline.vue`、`ProofreadView.vue`、`ViewMenu.vue`、`BottomMenu.vue`、`LeftMenu.vue`、各 agent-tool 等，大量使用 `activeDocument.value` / `activeTab`。
- **现状**：这些视图本身是「当前 Tab 的内容/元数据」的展示，用 `activeDocument` 符合「当前选中的 Tab」语义，多 Tab 下是正确的。
- **风险**：若某处误以为「全局唯一文档」或把 `activeDocument` 当持久化单例用，在 Tab 切换或多开时可能出错；新增功能时应对「当前 Tab」与「指定 Tab」区分清楚。

### 4. 主进程 `open-doc-success` 的 payload

- **位置**：主进程 `main-calls.ts` 的 `openDoc()` 在读取文件后发送 `open-doc-success`，payload 含 `content, format, path, fileName`，**无 `tabId`**。
- **现状**：渲染端用该事件触发 `workspace-open-document`，由 `Main.vue` 的 `handleWorkspaceOpenDocument` 创建/激活 Tab 并写入内容，再发出带 `tabId` 的 `open-doc-success`。主进程不关心 Tab，由渲染端统一按 Tab 处理。
- **风险**：若主进程将来在其它路径也发 `open-doc-success`，需保证渲染端仍能正确对应到「新开 Tab」或「指定 Tab」，避免和当前 Tab 混淆。

### 5. 保存成功后的「重新打开」：`open-doc`

- **位置**：`event-bus.js` 中，`save-success` 若为「另存为」且带新 path，会 `eventBus.emit('open-doc', data.path)` 重新打开。
- **现状**：会走主进程 `openDoc(path)`，再发 `open-doc-success` → `workspace-open-document`，最终在渲染端**新开一个 Tab** 打开新路径文件。
- **风险**：若期望是「当前 Tab 切换到新路径」而不是「再开一个 Tab」，需要改此处逻辑或区分「另存为并切换当前 Tab」与「另存为并在新 Tab 打开」。

### 6. Agent / 设置等请求「当前文档」的广播

- **位置**：`workspace.ts` 中 `request-active-document-info`、`request-document-content` 等，用 `activeDocument.value` 响应。
- **现状**：语义是「当前活动 Tab 的文档」，多 Tab 下合理。
- **风险**：若有功能需要「指定 Tab」的文档（例如按 tabId 查），需要扩展事件或 API，不能只依赖「当前活动文档」。

---

## 建议

- 新增与「文档/保存/打开」相关的功能时，明确是「当前 Tab」还是「指定 Tab」，并优先使用带 `tabId` 的 API（如 `ensureDocument(tabId)`、保存时传 `tabId`）。
- 主进程新增「打开/保存/路径」相关事件时，考虑是否要带 `tabId` 或由渲染端根据当前焦点 Tab 解释。
- 本次修复（打开文档始终新开 Tab、不替换未初始化 Tab）已解决「新文档 Tab 标题被误改为打开文件名」的问题；若产品希望「仅一个空 Tab 时用该 Tab 打开文件」，可在 `Main.vue` 的 `handleWorkspaceOpenDocument` 中恢复「仅当仅有一个未初始化 Tab 时替换」的分支，并确保只更新该 Tab、且不重复创建新 Tab。
