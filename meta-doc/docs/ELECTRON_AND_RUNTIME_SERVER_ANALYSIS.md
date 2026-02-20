# MetaDoc：Electron 与运行时服务器（52521）分析报告

本文档分析整个项目中**与 Electron 提供的服务**（如 ipcMain、ipcRenderer 等）以及**本地 Express 服务器地址 localhost:52521** 相关的使用情况，并给出**中间层封装**与**运行时服务器地址统一配置**的改造建议，便于未来迁移到 Web/SaaS 时只需改少数几处。

---

## 一、Electron 相关使用分析

### 1.1 主进程（Main Process）

| 文件 | 使用方式 | 说明 |
|------|----------|------|
| `src/main/index.ts` | `ipcMain.on` / `ipcMain.once` / `IpcMainEvent` | 关闭窗口流程、广播、is-need-save 等 |
| `src/main/main-calls.ts` | `ipcMain.on` / `ipcMain.handle` | **绝大部分 IPC 通道注册**（保存、打开、设置、文件、数据库、窗口等） |
| `src/main/drag-manager.ts` | `ipcMain.handle` / `ipcMain.on` | 拖拽相关 IPC |
| `src/main/logger.ts` | `app`, `BrowserWindow`, `shell` | 日志、打开路径 |
| `src/main/window-manager.ts` | `BrowserWindow`, `shell` | 窗口管理 |
| `src/main/window-pool.ts` | `BrowserWindow` | 窗口池 |
| `src/main/file-registry.ts` | `BrowserWindow` | 文件与窗口关联 |
| `src/main/express-server.ts` | `BrowserWindow` | 聚焦等 |
| `src/main/export/export-manager.ts` | `BrowserWindow`, `dialog` | 导出、对话框 |
| `src/main/drag-manager.ts` | `ipcMain`, `IpcMainEvent`, `IpcMainInvokeEvent` | 同上 |
| `src/main/utils/*.ts` | `app`, `BrowserWindow`, `WebContents` 等 | 路径、拼写、LaTeX、文件监听、数据库等 |

**主进程 IPC 通道概览（仅列举部分，完整列表见 main-calls.ts）：**

- **invoke（handle）**：`claim-file-open`, `find-window-with-file`, `release-file-claim`, `confirm-file-open`, `convert-pdf-to-markdown`, `read-file-content`, `read-directory`, `show-open-dialog`, `show-item-in-folder`, `check-path-exists`, `create-file`, `create-directory`, `get-setting`, `set-setting`, `get-recent-docs`, `get-image-path`, `get-reference-dir-size`, `open-reference-dir`, `clear-reference-dir`, `get-all-window-types`, `save-file-dialog`, `read-file-for-upload`, `write-file-content`, `save-json-file`, `perform-export`, `cancel-export-task`, `db-query`, `db-execute`, `get-all-windows`, `transfer-file-ownership`, `mark-file-closing`, `check-window-can-close`, 以及大量文件/窗口/设置/数据库相关 handle。
- **send/on（事件）**：`watch-file`, `unwatch-file`, `watch-directory`, `unwatch-directory`, `request-close-tab`, `close-tab-response`, `save-tab`, `discard-tab`, `close-all-tabs`, `request-unsaved-tabs-info`, `tab-info-response`, `file-exists-in-window-response`, `send-broadcast`, `receive-broadcast`, `shell-open`, `os-theme-changed`, `open-doc`, `open-link`, `quit`, `setting`, `ai-chat`, `graph`, `system-notification`, `open-log-file`, `update-window-title` 等。

### 1.2 预加载脚本（Preload）

| 文件 | 使用方式 | 说明 |
|------|----------|------|
| `src/preload/index.js` | `contextBridge.exposeInMainWorld('electron', electronAPI)` | 暴露 `window.electron`（含 ipcRenderer）；同时暴露 `ipcRenderer` |

渲染进程通过 `window.electron.ipcRenderer` 或 `window.ipcRenderer` 使用 IPC。

### 1.3 渲染进程（Renderer）— 直接使用 ipcRenderer 的文件

| 文件 | 使用方式 |
|------|----------|
| `src/renderer/src/views/Main.vue` | 多处 `getIpcRenderer()` / `ipcRenderer.invoke` / `ipcRenderer.send`（claim-file-open, read-file-content, watch-file, request-close-tab 等） |
| `src/renderer/src/views/App.vue` | 获取 `ipcRenderer` 引用 |
| `src/renderer/src/views/GlobalHome.vue` | 模块级 `ipcRenderer` |
| `src/renderer/src/views/GraphWindow.vue` | `ipcRenderer.invoke`（save-file-dialog, read-file-content, write-file-content, read-file-for-upload） |
| `src/renderer/src/views/MarkdownEditor.vue` | 通过 uploadUrl 等间接用 52521，未直接写 ipcRenderer（见第二节） |
| `src/renderer/src/views/FomulaRecognition.vue` | `ipcRenderer.invoke`（save-image-file, convert-svg-to-pdf） |
| `src/renderer/src/views/setting/SettingBasicSection.vue` | `ipcRenderer.invoke`（get-reference-dir-size, open-reference-dir, clear-reference-dir） |
| `src/renderer/src/views/setting/SettingDebugSection.vue` | `ipcRenderer.invoke`（get-all-window-types, save-json-file） |
| `src/renderer/src/views/KnowledgeBase.vue` | baseUrl 用 52521（见第二节） |
| `src/renderer/src/views/SettingLlmSection.vue` | fetch 到 52521 API（见第二节） |
| `src/renderer/src/views/DataAnalysisWindow.vue` | `ipcRenderer.invoke`（read-file-content, file-exists, convert-excel-to-text, save-reference-file） |
| `src/renderer/src/views/OcrWindow.vue` | `ipcRenderer.invoke`（read-file-for-upload, save-reference-file, read-clipboard-image, ocr-recognize-file） |
| `src/renderer/src/views/Home.vue` | `ipcRenderer.invoke('get-file-stats')` |
| `src/renderer/src/components/WorkspaceExplorer.vue` | `getIpcRenderer()` / `ipcRenderer.invoke`（show-open-dialog, read-directory, watch-directory, show-item-in-folder, check-path-exists, create-file, create-directory） |
| `src/renderer/src/components/MainTabs.vue` | `ipcRenderer.invoke` / `ipcRenderer.send`（get-all-windows, show-item-in-folder, create-window-with-tab, transfer-tab-to-window, window-minimize/maximize, close-window, get-window-id, mark-file-closing, check-window-can-close） |
| `src/renderer/src/components/agent/AgentToolResultCard.vue` | `ipcRenderer.invoke('save-json-file')` |
| `src/renderer/src/utils/event-bus.js` | **集中使用**：`ipcRenderer.send` / `ipcRenderer.on` / `ipcRenderer.invoke`（大量 UI 与主进程通信） |
| `src/renderer/src/utils/settings.js` | `ipcRenderer.invoke`（get-setting, set-setting, update-recent-docs, get-recent-docs, remove-recent-doc, get-image-path） |
| `src/renderer/src/utils/db/tool-sessions-db.ts` | `ipcRenderer.invoke('db-query', 'db-execute')` |
| `src/renderer/src/stores/workspace.ts` | `ipcRenderer.send`（unwatch-file, watch-file, update-file-watcher-tab-id）/ `ipcRenderer.invoke`（mark-file-closing, release-file-claim） |
| `src/renderer/src/utils/agent-tools/components/AutoTestResultDisplay.vue` | `ipcRenderer.invoke('save-json-file')` |

**已有适配层（可复用）：**

- `src/renderer/src/utils/web-adapter/local-ipc-renderer.ts`：无 Electron 时的"本地" invoke/send/on，基于 mitt。
- `src/renderer/src/utils/web-adapter/local-ipc-main.ts`：无 Electron 时的"主进程" handle/emit。
- 部分页面通过 `window.electron?.ipcRenderer ?? localIpcRenderer` 获取通信对象，但**未统一**，且主进程侧没有对应"桥"层。

---

## 二、localhost:52521（运行时服务器）使用分析

### 2.1 主进程

| 文件 | 使用方式 |
|------|----------|
| `src/main/index.ts` | `RUNTIME_API_PORT = 52521`，用于 dev 等配置（如 Vite loadConfig 的 server.port 等）；**未统一用于 Express** |
| `src/main/express-server.ts` | **硬编码** `listen(52521)`、日志字符串 `'http://localhost:52521'`、重试日志 `'端口 52521'` |
| `src/main/main-calls.ts` | 硬编码 `port: 52521`、`http://localhost:52521/images/...` 多处 |
| `src/main/utils/svg-to-pdf.ts` | 注释与返回值中 `http://localhost:52521/images/...` |
| `src/main/utils/image-export-service.ts` | `http://localhost:52521/images/` 的 startsWith/replace |
| `src/main/export/export-manager.ts` | 大量 `http://localhost:52521/images/` 判断与替换、`url-upload` 等 |

### 2.2 渲染进程

| 文件 | 使用方式 |
|------|----------|
| `src/renderer/src/views/GraphWindow.vue` | `http://localhost:52521/images/` 判断、`fetch('http://localhost:52521/api/image/upload?keepName=1')`、拼接 `http://localhost:52521/images/${...}` |
| `src/renderer/src/views/MarkdownEditor.vue` | `uploadUrl = 'http://localhost:52521/api/image/upload'` 及带 targetDir 的 URL |
| `src/renderer/src/views/FomulaRecognition.vue` | fetch 上传、`http://localhost:52521/images/...` 拼接 |
| `src/renderer/src/views/setting/SettingLlmSection.vue` | `fetch('http://localhost:52521/api/llm/...')` |
| `src/renderer/src/views/KnowledgeBase.vue` | `baseUrl = 'http://localhost:52521/api/knowledge'` |
| `src/renderer/src/utils/md-utils.js` | **大量**：`http://localhost:52521/images/` 的 startsWith、replace、正则、注释 |
| `src/renderer/src/utils/math-renderer.js` | fetch 上传、`http://localhost:52521/images/...` 拼接 |
| `src/renderer/src/utils/vditor-cdn.js` | `localVditorCDN = 'http://localhost:52521/vditor'` |
| `src/renderer/src/utils/monaco-worker-config.ts` | `http://localhost:52521/monaco/...` worker 路径 |
| `src/renderer/src/utils/llm-adapters/adapter-factory.ts` | `config.apiUrl = 'http://localhost:52521/api/llm'` |
| `src/renderer/src/utils/agent-framework/llm-adapter.ts` | `apiUrl: 'http://localhost:52521/api/llm'` |
| `src/renderer/src/utils/image-upload-service.ts` | `http://localhost:52521/api/image/upload`、`url-upload` |
| `src/renderer/src/utils/chart-pre-renderer.js` | HEAD 请求、upload、`http://localhost:52521/images/...` |
| `src/renderer/src/utils/agent-tools/chart-generation-tool.ts` | 判断/拼接 `http://localhost:52521/images/`、注释中的示例 URL |
| `src/renderer/src/utils/svg-to-pdf-utils.js` | 注释与返回 `http://localhost:52521/images/...` |
| `src/renderer/src/services/image-processor.ts` | localhost:52521 的 startsWith、注释 |
| `src/renderer/src/services/export-manager.ts` | `http://localhost:52521/images/` 判断、正则、拼接 |
| `src/renderer/src/services/export-manager.obsolete.ts` | 同上 |

### 2.3 文档与其它

- `src/renderer/src/manuals/zh_CN/settings/image-upload.md`、`docs/*.md` 等文档中也有多处 `52521` 或 `http://localhost:52521` 的说明，后续可改为"由配置决定"的表述。

---

## 三、改造建议

### 3.1 IPC 中间层（消息桥）

**目标**：业务代码只依赖"消息桥"接口（invoke / send / on / removeListener），不直接依赖 `ipcMain` / `ipcRenderer`。当前实现仍可走 Electron IPC，未来可替换为 Web Worker、WebSocket、HTTP 等，只改桥的实现。

**渲染进程侧：**

1. **新建统一桥模块**（例如 `src/renderer/src/bridge/message-bridge.ts`）：
   - 提供：`invoke(channel, ...args)`、`send(channel, ...args)`、`on(channel, handler)`、`once(channel, handler)`、`removeListener(channel, handler)`。
   - 实现：若存在 `window.electron?.ipcRenderer`，则委托给 `ipcRenderer`；否则委托给已有的 `localIpcRenderer`。
   - 业务代码（Main.vue、event-bus.js、WorkspaceExplorer.vue、stores/workspace.ts、settings.js、各 Vue 组件等）**仅**从该桥模块获取调用，不再直接访问 `window.electron.ipcRenderer` 或写死 `localIpcRenderer`。

2. **类型与通道名**（可选但推荐）：
   - 在桥模块或单独 types 文件中维护"通道名常量"和 TS 类型，避免拼写错误；invoke 的 channel 与主进程 handle 一一对应。

**主进程侧：**

1. **新建主进程桥模块**（例如 `src/main/bridge/ipc-bridge.ts`）：
   - 提供：`registerInvoke(channel, handler)`、`registerOn(channel, handler)` 等。
   - 当前实现：内部调用 `ipcMain.handle` / `ipcMain.on`。
   - 将 `main-calls.ts`、`index.ts`、`drag-manager.ts` 中**直接**的 `ipcMain.handle` / `ipcMain.on` 改为通过该桥注册；业务逻辑保持不变，仅"注册方式"经桥一层。

2. **Preload**：
   - 可保持不变，仍暴露 `electron.ipcRenderer`；渲染进程侧统一通过上面的 message-bridge 访问，不再在各处写 `window.electron.ipcRenderer`。

这样，未来若要改为 Web：
- 渲染进程：换掉 message-bridge 的实现（例如用 fetch + 路由或 WebSocket）。
- 主进程：将"主进程桥"的实现从 ipcMain 改为 HTTP 服务端或其它通道，业务注册的 handler 不变。

### 3.2 运行时服务器地址（52521）统一配置

**目标**：全项目只有一个"运行时服务器 baseUrl"来源；所有 `http://localhost:52521` 的拼接与判断都基于该配置，避免写死端口和字符串操作。

**主进程：**

1. **单一配置源**：
   - 在 `src/main` 下（例如 `runtime-server-config.ts`）定义：
     - `RUNTIME_SERVER_PORT`（默认 52521），
     - `getRuntimeServerBaseUrl(): string`（如 `http://127.0.0.1:${RUNTIME_SERVER_PORT}` 或从环境变量读 host）。
   - `express-server.ts` 的 `listen` 使用 `RUNTIME_SERVER_PORT`，日志中的地址使用 `getRuntimeServerBaseUrl()`。
   - `index.ts` 中若有 RUNTIME_API_PORT，改为从同一配置读取（或废弃，统一用 RUNTIME_SERVER_PORT）。

2. **暴露给渲染进程**：
   - 方式 A：通过 IPC 增加 `get-runtime-server-base-url`，渲染进程启动时或需要时 invoke 一次并缓存。  
   推荐方式 A，与现有 IPC 桥一致，且便于测试/多环境。

**渲染进程：**

1. **统一获取 baseUrl**：
   - 新建 `src/renderer/src/config/runtime-server.ts`（或类似）：
     - 提供 `getRuntimeServerBaseUrl(): Promise<string>`（内部 invoke `get-runtime-server-base-url` 并缓存），
     - 以及同步的 `getRuntimeServerBaseUrlSync(): string`（若已在 preload 注入则可同步返回）。
   - 所有需要请求本地 API 或拼接图片/静态资源 URL 的地方，**不再写死** `http://localhost:52521`，改为：
     - `(await getRuntimeServerBaseUrl()) + '/api/image/upload'`
     - `baseUrl + '/images/' + fileName`
     等。

2. **字符串判断与替换**：
   - 凡是用 `url.startsWith('http://localhost:52521/')`、`url.replace('http://localhost:52521/images/', '')` 等逻辑的地方，改为：
     - 使用"运行时 baseUrl"做前缀比较或替换（例如 `url.startsWith(baseUrl + '/images/')`，`url.replace(baseUrl + '/images/', '')`）。
   - 若某处只在渲染进程运行且 baseUrl 可异步获取，可约定"图片/API 基地址"在应用启动时解析并缓存，后续统一用缓存值做字符串操作。

**涉及文件（按第二节列表）**：主进程的 `express-server.ts`、`main-calls.ts`、`utils/svg-to-pdf.ts`、`utils/image-export-service.ts`、`export/export-manager.ts`；渲染进程的 `GraphWindow.vue`、`MarkdownEditor.vue`、`FomulaRecognition.vue`、`SettingLlmSection.vue`、`KnowledgeBase.vue`、`md-utils.js`、`math-renderer.js`、`vditor-cdn.js`、`monaco-worker-config.ts`、`llm-adapters`、`image-upload-service.ts`、`chart-pre-renderer.js`、`chart-generation-tool.ts`、`svg-to-pdf-utils.js`、`image-processor.ts`、`export-manager.ts` 等，均改为从"运行时 baseUrl"读取再拼接或判断。

**文档**：`manuals`、`docs` 中涉及 52521 的说明可改为"本地运行时服务地址（默认 localhost:52521）"等表述，避免写死端口。

---

## 四、实施优先级建议

1. **高**：运行时服务器地址统一（主进程配置 + 渲染进程 getRuntimeServerBaseUrl + 替换所有硬编码）。改动面大但逻辑简单，且能立刻消除"写死 52521"的问题。
2. **高**：渲染进程 IPC 桥（message-bridge.ts + 逐步把 event-bus.js、Main.vue、WorkspaceExplorer、stores、settings 等改为只通过桥调用）。
3. **中**：主进程 IPC 桥（registerInvoke/registerOn + 将 main-calls、index、drag-manager 的注册迁入）。
4. **低**：通道名常量与类型、preload 注入 baseUrl 等优化。

完成上述步骤后，未来迁移到 Web/SaaS 时：
- **IPC**：只需替换"消息桥"和"主进程桥"的实现，业务侧调用方式不变。
- **运行时服务**：只需改 `RUNTIME_SERVER_PORT` / 环境变量或 `getRuntimeServerBaseUrl()` 的实现（例如指向远程 API 根地址），所有拼接与判断自动生效。

---

## 五、涉及文件清单汇总（便于批量替换）

**Electron IPC（渲染进程需改为通过 message-bridge）：**  
Main.vue, App.vue, GlobalHome.vue, GraphWindow.vue, FomulaRecognition.vue, SettingBasicSection.vue, SettingDebugSection.vue, DataAnalysisWindow.vue, OcrWindow.vue, Home.vue, WorkspaceExplorer.vue, MainTabs.vue, AgentToolResultCard.vue, event-bus.js, settings.js, tool-sessions-db.ts, workspace.ts, AutoTestResultDisplay.vue

**Electron IPC（主进程需改为通过桥注册）：**  
index.ts, main-calls.ts, drag-manager.ts

**localhost:52521 / 52521（需改为 baseUrl 或配置）：**  
见第二节表格；另包括 main-calls.ts、express-server.ts、main/utils 与 main/export、renderer 的 views/utils/services 中列出的所有文件。

以上为全项目范围内与 Electron 及 52521 相关的分析与改造建议，后续可按"运行时服务器统一 → 渲染进程 IPC 桥 → 主进程 IPC 桥"的顺序分步实施。

---

## 六、实施状态（2026-02-20）

### 已完成 ✅

**Phase 1：运行时服务器地址统一**
- ✅ 主进程：`runtime-server-config.ts`、`express-server.ts`、`index.ts`、`main-calls.ts`、`utils/*`、`export/*`
- ✅ 渲染进程：核心文件（~20 个）已迁移

**Phase 2：渲染进程 IPC 桥**
- ✅ `message-bridge.ts` 已创建
- ✅ 核心文件已迁移：`event-bus.js`、`settings.js`、`runtime-server.ts`、`WorkspaceExplorer.vue`、`workspace.ts`、`svg-to-pdf-utils.js`

**Phase 3：主进程 IPC 桥**
- ✅ `ipc-bridge.ts` 已创建
- ✅ `main-calls.ts`、`index.ts`、`drag-manager.ts` 已迁移

### 进行中 🚧

**渲染进程 IPC 迁移**
- ⏳ 约 80+ 个文件待迁移（约 1000+ 处 IPC 调用）

### 相关文档

- ✅ `docs/MIGRATION_GUIDE.md`：详细迁移指南（架构说明、迁移模式、示例代码）
- ✅ `docs/MIGRATION_TODO_LIST.md`：待办清单（按优先级组织的文件列表）

**下一步：** 按优先级逐个迁移渲染进程 IPC（参考 `MIGRATION_TODO_LIST.md`）
