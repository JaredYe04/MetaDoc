# MetaDoc 架构迁移指南

本文档说明当前架构状态、已完成的工作、剩余任务，以及如何继续完成迁移工作。

---

## 一、架构概述

### 1.1 目标架构

为了支持未来迁移到 Web/SaaS，我们引入了两层抽象：

1. **运行时服务器地址抽象**：统一管理本地 Express 服务地址（原 `localhost:52521`）
2. **IPC 消息桥抽象**：统一管理渲染进程与主进程的通信（原 `ipcRenderer` / `ipcMain`）

### 1.2 核心模块

#### 主进程（Main Process）

- **`src/main/runtime-server-config.ts`**：运行时服务器配置

  - `getRuntimeServerPort()`：获取端口（默认 52521，可通过 `RUNTIME_SERVER_PORT` 环境变量覆盖）
  - `getRuntimeServerHost()`：获取主机（默认 127.0.0.1，可通过 `RUNTIME_SERVER_HOST` 环境变量覆盖）
  - `getRuntimeServerBaseUrl()`：获取完整 base URL（如 `http://127.0.0.1:52521`）

- **`src/main/bridge/ipc-bridge.ts`**：主进程 IPC 桥
  - `registerHandle(channel, handler)`：注册 invoke 处理器（对应 `ipcMain.handle`）
  - `registerOn(channel, handler)`：注册事件监听器（对应 `ipcMain.on`）
  - `registerOnce(channel, handler)`：注册一次性监听器（对应 `ipcMain.once`）
  - `removeListener(channel, handler)`：移除监听器（对应 `ipcMain.removeListener`）

#### 渲染进程（Renderer Process）

- **`src/renderer/src/config/runtime-server.ts`**：运行时服务器地址获取

  - `getRuntimeServerBaseUrl()`：异步获取 base URL（通过 IPC，带缓存）
  - `getRuntimeServerBaseUrlSync()`：同步获取已缓存的 base URL（需先调用过异步版本）
  - `setRuntimeServerBaseUrl(url)`：手动设置缓存（用于测试）

- **`src/renderer/src/bridge/message-bridge.ts`**：渲染进程消息桥
  - `getIpc()`：获取底层 IPC 实例（`window.electron.ipcRenderer` 或 `localIpcRenderer`）
  - `invoke(channel, ...args)`：调用主进程 handle（返回 Promise）
  - `send(channel, ...args)`：向主进程发送消息（无返回值）
  - `on(channel, listener)`：监听主进程消息
  - `once(channel, listener)`：监听主进程消息（仅一次）
  - `removeListener(channel, listener)`：移除监听器

---

## 二、已完成的工作

### 2.1 Phase 1：运行时服务器地址统一 ✅

**主进程：**

- ✅ 创建 `runtime-server-config.ts`
- ✅ `express-server.ts` 使用配置
- ✅ `index.ts` 使用配置
- ✅ `main-calls.ts` 添加 `get-runtime-server-base-url` IPC handle
- ✅ `main-calls.ts`、`utils/svg-to-pdf.ts`、`utils/image-export-service.ts`、`export/export-manager.ts` 中所有硬编码的 `localhost:52521` 已替换

**渲染进程：**

- ✅ 创建 `config/runtime-server.ts`
- ✅ `App.vue` 在 `onMounted` 中初始化缓存
- ✅ 以下文件已迁移：
  - `views/GraphWindow.vue`
  - `views/MarkdownEditor.vue`
  - `views/FomulaRecognition.vue`
  - `views/KnowledgeBase.vue`
  - `views/setting/SettingLlmSection.vue`
  - `utils/vditor-cdn.js`
  - `utils/md-utils.js`
  - `utils/math-renderer.js`
  - `utils/monaco-worker-config.ts`
  - `utils/image-upload-service.ts`
  - `utils/chart-pre-renderer.js`
  - `utils/svg-to-pdf-utils.js`
  - `utils/agent-tools/chart-generation-tool.ts`
  - `utils/llm-adapters/adapter-factory.ts`
  - `utils/agent-framework/llm-adapter.ts`
  - `services/image-processor.ts`
  - `services/export-manager.ts`
  - `services/export-manager.obsolete.ts`

### 2.2 Phase 2：渲染进程 IPC 消息桥 ✅

**已迁移的文件：**

- ✅ `utils/event-bus.js`：所有 `ipcRenderer.send/on/invoke/removeListener` → `messageBridge.send/on/invoke/removeListener`
- ✅ `utils/settings.js`：所有 `ipcRenderer.invoke` → `messageBridge.invoke`
- ✅ `config/runtime-server.ts`：通过 `messageBridge.invoke` 获取 baseUrl
- ✅ `components/WorkspaceExplorer.vue`：`getIpcRenderer()` → `messageBridge.getIpc()`
- ✅ `stores/workspace.ts`：文件监听相关改为 `messageBridge.send/invoke`
- ✅ `utils/svg-to-pdf-utils.js`：改为使用 `messageBridge.invoke`

### 2.3 Phase 3：主进程 IPC 桥 ✅

**已迁移的文件：**

- ✅ `main/main-calls.ts`：所有 `ipcMain.handle/on/once/removeListener` → `ipcBridge.registerHandle/registerOn/registerOnce/removeListener`
- ✅ `main/index.ts`：所有 `ipcMain.on/once/removeListener` → `ipcBridge.registerOn/registerOnce/removeListener`
- ✅ `main/drag-manager.ts`：所有 `ipcMain.handle/on` → `ipcBridge.registerHandle/registerOn`

---

## 三、剩余工作

当前「待迁移」文件与进度以 **`docs/MIGRATION_TODO_LIST.md`** 为准（按 P0～P3 分类，含完成状态）。渲染进程仍有少量文件直接使用 `ipcRenderer`，需逐步改为通过 `messageBridge` 调用。

---

## 四、迁移步骤与模式

### 4.1 运行时服务器地址迁移

#### 模式 1：异步上下文（推荐）

**原代码：**

```javascript
const uploadUrl = 'http://localhost:52521/api/image/upload'
const response = await fetch(uploadUrl, { ... })
```

**迁移后：**

```javascript
const baseUrl = await import('../config/runtime-server').then(m => m.getRuntimeServerBaseUrl())
const uploadUrl = `${baseUrl}/api/image/upload`
const response = await fetch(uploadUrl, { ... })
```

**或使用动态导入（更简洁）：**

```javascript
const baseUrl = await import('../config/runtime-server').then(m => m.getRuntimeServerBaseUrl())
const response = await fetch(`${baseUrl}/api/image/upload`, { ... })
```

#### 模式 2：同步上下文（需确保缓存已初始化）

**原代码：**

```javascript
const imageUrl = `http://localhost:52521/images/${fileName}`
if (url.startsWith('http://localhost:52521/images/')) { ... }
```

**迁移后：**

```javascript
import { getRuntimeServerBaseUrlSync } from '../config/runtime-server'
const imagesPrefix = getRuntimeServerBaseUrlSync() + '/images/'
const imageUrl = `${imagesPrefix}${fileName}`
if (url.startsWith(imagesPrefix)) { ... }
```

**注意：** 同步版本依赖缓存，需确保 `App.vue` 的 `onMounted` 已执行（或手动调用一次 `getRuntimeServerBaseUrl()`）。

#### 模式 3：字符串替换与正则

**原代码：**

```javascript
const fileName = url.replace('http://localhost:52521/images/', '')
markdown.replace(/http:\/\/localhost:52521\/images\/([^\s\)]+)/g, ...)
```

**迁移后：**

```javascript
import { getRuntimeServerBaseUrlSync } from '../config/runtime-server'
const imagesPrefix = getRuntimeServerBaseUrlSync() + '/images/'
const imagesPrefixEscaped = imagesPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const fileName = url.replace(imagesPrefix, '')
markdown.replace(new RegExp(imagesPrefixEscaped + '([^\\s\\)]+)', 'g'), ...)
```

### 4.2 IPC 消息桥迁移

#### 模式 1：直接替换（最简单）

**原代码：**

```javascript
let ipcRenderer = null
if (window && window.electron) {
  ipcRenderer = window.electron.ipcRenderer
} else {
  ipcRenderer = localIpcRenderer
}
await ipcRenderer.invoke('some-channel', arg)
ipcRenderer.send('some-channel', arg)
ipcRenderer.on('some-channel', handler)
```

**迁移后：**

```javascript
import messageBridge from '../bridge/message-bridge'
await messageBridge.invoke('some-channel', arg)
messageBridge.send('some-channel', arg)
messageBridge.on('some-channel', handler)
```

#### 模式 2：需要 IPC 实例的场景

**原代码：**

```javascript
const getIpcRenderer = () => {
  if (window && window.electron) {
    return window.electron.ipcRenderer
  }
  return localIpcRenderer
}
const ipcRenderer = getIpcRenderer()
if (ipcRenderer?.invoke) { ... }
```

**迁移后：**

```javascript
import messageBridge from '../bridge/message-bridge'
const getIpcRenderer = () => messageBridge.getIpc()
const ipcRenderer = getIpcRenderer()
if (ipcRenderer?.invoke) { ... }
```

#### 模式 3：异步获取 IPC

**原代码：**

```javascript
async function someFunction() {
  let ipcRenderer = null
  if (window && window.electron) {
    ipcRenderer = window.electron.ipcRenderer
  } else {
    const { localIpcRenderer } = await import('./web-adapter/local-ipc-renderer')
    ipcRenderer = localIpcRenderer
  }
  await ipcRenderer.invoke('channel', arg)
}
```

**迁移后：**

```javascript
import messageBridge from '../bridge/message-bridge'
async function someFunction() {
  await messageBridge.invoke('channel', arg)
}
```

#### 模式 4：移除监听器

**原代码：**

```javascript
ipcRenderer.removeListener('channel', handler)
ipcRenderer.removeAllListeners('channel')
```

**迁移后：**

```javascript
import messageBridge from '../bridge/message-bridge'
messageBridge.removeListener('channel', handler)
// 注意：messageBridge 不提供 removeAllListeners，如需此功能可扩展
```

### 4.3 常见迁移场景

#### 场景 1：Vue 组件中的 IPC 调用

**原代码：**

```vue
<script setup>
let ipcRenderer = null
if (window && window.electron) {
  ipcRenderer = window.electron.ipcRenderer
} else {
  ipcRenderer = localIpcRenderer
}

const handleSave = async () => {
  await ipcRenderer.invoke('save-file', data)
}
</script>
```

**迁移后：**

```vue
<script setup>
import messageBridge from '../bridge/message-bridge'

const handleSave = async () => {
  await messageBridge.invoke('save-file', data)
}
</script>
```

#### 场景 2：工具函数中的 IPC

**原代码：**

```javascript
export async function getFileContent(path) {
  const ipcRenderer = window.electron?.ipcRenderer || localIpcRenderer
  return await ipcRenderer.invoke('read-file-content', path)
}
```

**迁移后：**

```javascript
import messageBridge from '../bridge/message-bridge'

export async function getFileContent(path) {
  return await messageBridge.invoke('read-file-content', path)
}
```

#### 场景 3：类方法中的 IPC

**原代码：**

```typescript
class SomeService {
  private ipcRenderer: any

  constructor() {
    this.ipcRenderer = window.electron?.ipcRenderer || localIpcRenderer
  }

  async doSomething() {
    return await this.ipcRenderer.invoke('channel', arg)
  }
}
```

**迁移后：**

```typescript
import messageBridge from '../bridge/message-bridge'

class SomeService {
  async doSomething() {
    return await messageBridge.invoke('channel', arg)
  }
}
```

---

## 五、迁移检查清单

### 5.1 运行时服务器地址检查

- [ ] 搜索 `localhost:52521` 或 `52521`，确保所有硬编码已替换
- [ ] 搜索 `http://localhost:52521`，确保所有 URL 拼接使用 `getRuntimeServerBaseUrl()` 或 `getRuntimeServerBaseUrlSync()`
- [ ] 检查正则表达式中的硬编码 URL，确保使用动态构建的正则
- [ ] 检查注释和文档中的示例 URL，更新为“运行时服务器”等描述性文字

### 5.2 IPC 消息桥检查

- [ ] 搜索 `window.electron.ipcRenderer`，确保已改为 `messageBridge.getIpc()` 或直接使用 `messageBridge.invoke/send/on`
- [ ] 搜索 `localIpcRenderer`，确保导入已移除，改为使用 `messageBridge`
- [ ] 搜索 `ipcRenderer.invoke`，确保已改为 `messageBridge.invoke`
- [ ] 搜索 `ipcRenderer.send`，确保已改为 `messageBridge.send`
- [ ] 搜索 `ipcRenderer.on`，确保已改为 `messageBridge.on`
- [ ] 搜索 `ipcRenderer.once`，确保已改为 `messageBridge.once`
- [ ] 搜索 `ipcRenderer.removeListener`，确保已改为 `messageBridge.removeListener`

### 5.3 代码质量检查

- [ ] 确保所有导入路径正确（相对路径 `../bridge/message-bridge` 或 `../config/runtime-server`）
- [ ] 确保异步函数中正确使用 `await`
- [ ] 确保同步函数中使用 `getRuntimeServerBaseUrlSync()` 前缓存已初始化
- [ ] 运行 TypeScript/ESLint 检查，修复类型错误和 lint 错误
- [ ] 测试相关功能，确保迁移后功能正常

---

## 六、自动化迁移脚本（参考）

可以使用以下脚本辅助查找需要迁移的代码：

### 6.1 查找硬编码的 52521

```bash
# 在项目根目录执行
grep -r "52521" src/renderer --include="*.ts" --include="*.js" --include="*.vue" | grep -v "node_modules" | grep -v ".git"
```

### 6.2 查找直接使用 ipcRenderer 的文件

```bash
# 查找所有使用 ipcRenderer 的文件
grep -r "ipcRenderer" src/renderer --include="*.ts" --include="*.js" --include="*.vue" | grep -v "node_modules" | grep -v ".git" | cut -d: -f1 | sort -u
```

### 6.3 查找直接使用 window.electron 的文件

```bash
# 查找所有直接访问 window.electron 的文件
grep -r "window\.electron" src/renderer --include="*.ts" --include="*.js" --include="*.vue" | grep -v "node_modules" | grep -v ".git" | cut -d: -f1 | sort -u
```

---

## 七、注意事项

### 7.1 运行时服务器地址

1. **缓存初始化**：`getRuntimeServerBaseUrlSync()` 依赖缓存，需确保 `App.vue` 的 `onMounted` 已执行，或在首次使用前调用一次 `getRuntimeServerBaseUrl()`。
2. **正则表达式转义**：使用 `getRuntimeServerBaseUrlSync()` 构建正则时，需转义特殊字符：
   ```javascript
   const prefixEscaped = baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
   ```
3. **环境变量**：主进程可通过 `RUNTIME_SERVER_PORT` 和 `RUNTIME_SERVER_HOST` 环境变量覆盖默认值。

### 7.2 IPC 消息桥

1. **类型安全**：`messageBridge.getIpc()` 可能返回 `null`，使用前需检查。
2. **错误处理**：`messageBridge.invoke` 失败时会 reject Promise，需使用 try-catch 或 `.catch()`。
3. **向后兼容**：`messageBridge` 内部仍使用 `ipcRenderer`，当前行为与直接使用 `ipcRenderer` 一致。

### 7.3 迁移顺序建议

1. **先迁移高频使用的工具函数**（如 `settings.js`、`event-bus.js`），这些被多处引用。
2. **再迁移视图组件**，按使用频率从高到低。
3. **最后迁移工具类和服务**，确保依赖的模块已迁移。

### 7.4 测试建议

- 迁移每个文件后，运行相关功能测试。
- 特别注意文件操作、窗口管理、设置保存等核心功能。
- 检查控制台是否有 IPC 相关错误。

---

## 八、未来迁移到 Web/SaaS

当需要迁移到 Web 时，只需修改以下文件：

### 8.1 运行时服务器地址

**主进程：**

- 修改 `src/main/runtime-server-config.ts` 中的 `getRuntimeServerBaseUrl()`，返回远程 API 地址（如 `https://api.example.com`）

**渲染进程：**

- 修改 `src/renderer/src/config/runtime-server.ts` 中的 `getRuntimeServerBaseUrl()`，改为从配置或环境变量读取远程地址

### 8.2 IPC 消息桥

**主进程：**

- 修改 `src/main/bridge/ipc-bridge.ts`，将 `registerHandle/registerOn` 改为注册 HTTP 路由或 WebSocket 处理器

**渲染进程：**

- 修改 `src/renderer/src/bridge/message-bridge.ts`，将 `invoke/send/on` 改为使用 `fetch` 或 WebSocket

所有业务代码无需修改，只需替换桥的实现即可。

---

## 九、参考示例

### 9.1 已迁移文件的参考

- **`utils/event-bus.js`**：完整的 IPC 迁移示例
- **`utils/settings.js`**：简单的 invoke 调用迁移
- **`components/WorkspaceExplorer.vue`**：Vue 组件中的 IPC 迁移
- **`stores/workspace.ts`**：Store 中的异步 IPC 调用迁移
- **`views/GraphWindow.vue`**：运行时服务器地址迁移示例

### 9.2 常见问题

**Q: 为什么有些地方用 `getRuntimeServerBaseUrl()`，有些用 `getRuntimeServerBaseUrlSync()`？**  
A: 异步版本通过 IPC 获取，更可靠；同步版本依赖缓存，需确保缓存已初始化。在异步函数中优先使用异步版本。

**Q: `messageBridge.getIpc()` 返回 null 怎么办？**  
A: 检查是否在非 Electron 环境，或检查 `messageBridge.invoke/send/on` 的错误处理。

**Q: 迁移后功能不工作怎么办？**  
A: 检查导入路径、确保异步函数使用 `await`、检查控制台错误信息。

---

## 十、进度跟踪

### 已完成 ✅

- Phase 1：运行时服务器地址统一（主进程 + 渲染进程核心文件）
- Phase 2：渲染进程 IPC 桥（核心工具函数）
- Phase 3：主进程 IPC 桥

### 进行中 🚧

- 渲染进程 IPC 迁移（约 1000+ 处，按文件逐个迁移）

### 待开始 ⏳

- 全面测试与验证
- 文档更新

---

**最后更新：** 2026-02-20  
**维护者：** 开发团队
