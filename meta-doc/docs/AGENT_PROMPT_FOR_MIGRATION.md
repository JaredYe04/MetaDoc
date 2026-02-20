# Agent 提示词：继续完成 MetaDoc 架构迁移

**使用方式**：将下方「任务说明」整段复制给另一个 Agent，让其按文档继续完成迁移工作。

---

## 任务说明（复制给 Agent）

```
请继续完成 MetaDoc 项目的架构迁移工作。当前项目已引入“运行时服务器地址抽象”和“IPC 消息桥抽象”，但渲染进程中仍有大量代码未迁移。

【必读文档】
1. docs/MIGRATION_GUIDE.md — 架构说明、迁移模式、示例代码、检查清单
2. docs/MIGRATION_TODO_LIST.md — 待迁移文件列表（按优先级 P0→P3）、迁移模板、查找命令
3. docs/ELECTRON_AND_RUNTIME_SERVER_ANALYSIS.md — 原始分析与当前实施状态

【你的任务】
1. 渲染进程 IPC 迁移：将“直接使用 ipcRenderer / window.electron.ipcRenderer / localIpcRenderer”的代码，改为通过“消息桥”调用。
   - 统一入口：src/renderer/src/bridge/message-bridge.ts
   - 用法：import messageBridge from '../bridge/message-bridge'（路径按文件位置调整）
   - 替换规则：
     - ipcRenderer.invoke(channel, ...args) → messageBridge.invoke(channel, ...args)
     - ipcRenderer.send(channel, ...args) → messageBridge.send(channel, ...args)
     - ipcRenderer.on(channel, handler) → messageBridge.on(channel, handler)
     - ipcRenderer.once(channel, handler) → messageBridge.once(channel, handler)
     - ipcRenderer.removeListener(channel, handler) → messageBridge.removeListener(channel, handler)
   - 若代码需要“IPC 实例”（例如传给 useWorkspaceOperations(ipc)），则：const ipc = messageBridge.getIpc()
   - 删除对 localIpcRenderer 的导入，以及“if (window.electron) ipcRenderer = ... else ipcRenderer = localIpcRenderer”这类分支，改为使用 messageBridge。

2. 运行时服务器地址：若在渲染进程中仍发现硬编码的 localhost:52521 或 52521，改为从配置获取。
   - 异步：const baseUrl = await import('../config/runtime-server').then(m => m.getRuntimeServerBaseUrl())
   - 同步（仅当缓存已初始化时）：import { getRuntimeServerBaseUrlSync } from '../config/runtime-server'，再用 getRuntimeServerBaseUrlSync() + '/images/' 等拼接。
   - 路径按文件所在目录调整（如 ../../config/runtime-server）。

3. 迁移顺序与范围：
   - 优先处理 MIGRATION_TODO_LIST.md 中的 P0、P1 文件；每次可只处理一批（例如 5～10 个文件），避免单次改动过大。
   - 每改一个文件，确保：导入路径正确、无新增 lint 报错、未破坏已有调用（如 invoke 的 channel 名不变）。

4. 自检：
   - 迁移后，该文件中不应再出现 ipcRenderer、window.electron.ipcRenderer、localIpcRenderer 的直接使用（除非只是传给 messageBridge.getIpc() 的返回值）。
   - 若文件中有 52521 或 http://localhost:52521 的字符串，应改为使用 getRuntimeServerBaseUrl() / getRuntimeServerBaseUrlSync()。

5. 输出要求：
   - 列出你本次修改的文件路径及每个文件内做了哪些替换（例如：“Main.vue：ipcRenderer.invoke → messageBridge.invoke，共 3 处；删除 localIpcRenderer 导入”）。
   - 若某处无法按上述规则迁移（例如依赖未暴露的 API），请单独说明并保留原逻辑，不要猜测修改。
```

---

## 可选：更简短的任务说明（适合快速委托）

```
参考项目中的 docs/MIGRATION_GUIDE.md 和 docs/MIGRATION_TODO_LIST.md，继续完成渲染进程的 IPC 迁移：

1. 将所有直接使用 ipcRenderer / window.electron.ipcRenderer / localIpcRenderer 的代码，改为通过 src/renderer/src/bridge/message-bridge.ts 的 messageBridge（invoke/send/on/once/removeListener 或 getIpc()）。
2. 将渲染进程中残留的 localhost:52521 或 52521 硬编码，改为使用 config/runtime-server 的 getRuntimeServerBaseUrl 或 getRuntimeServerBaseUrlSync。
3. 按 MIGRATION_TODO_LIST.md 的优先级（先 P0 再 P1）选择文件，每次可处理一批文件。
4. 修改后列出变更文件及每文件的替换摘要；遇到无法按文档迁移的地方请单独说明。
```

---

## 可选：单文件迁移说明（针对指定文件）

若你只想让 Agent 迁移某一个文件，可以使用：

```
请只迁移以下文件中的 IPC 与运行时服务器地址，其余文件不要动。

文件路径：src/renderer/src/views/Main.vue

要求：
1. 将所有 ipcRenderer.invoke/send/on/once/removeListener 改为通过 messageBridge 调用（见 src/renderer/src/bridge/message-bridge.ts）。
2. 若有 localhost:52521 或 52521 的硬编码，改为使用 getRuntimeServerBaseUrl 或 getRuntimeServerBaseUrlSync（见 src/renderer/src/config/runtime-server.ts）。
3. 具体替换模式与示例见 docs/MIGRATION_GUIDE.md 第四节。
4. 修改完成后，简要列出该文件内做了哪些替换。
```

---

## 文档与代码位置速查

| 用途 | 路径或说明 |
|------|------------|
| 迁移指南（模式与示例） | `docs/MIGRATION_GUIDE.md` |
| 待办清单（文件列表与模板） | `docs/MIGRATION_TODO_LIST.md` |
| 分析与实施状态 | `docs/ELECTRON_AND_RUNTIME_SERVER_ANALYSIS.md` |
| 消息桥（渲染进程） | `src/renderer/src/bridge/message-bridge.ts` |
| 运行时服务器地址 | `src/renderer/src/config/runtime-server.ts` |
| 已迁移示例参考 | `src/renderer/src/utils/event-bus.js`、`src/renderer/src/utils/settings.js` |

---

**最后更新：** 2026-02-20
