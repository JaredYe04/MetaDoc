# Host API 规范

**源码（单一事实来源）：** [`src/renderer/src/host-api/index.ts`](../../src/renderer/src/host-api/index.ts)

**运行时实现：** [`src/renderer/src/core/host-runtime.ts`](../../src/renderer/src/core/host-runtime.ts)

当前版本常量：`HOST_API_VERSION = '1.0.0'`

---

## MetaDocHost

插件通过 `PluginContext.host` 访问的根对象。

```typescript
interface MetaDocHost {
  readonly version: typeof HOST_API_VERSION
  documents: DocumentHost
  outline: OutlineHost
  editor: EditorHost
  views: ViewHost
  ui: UIHost
  events: EventHost
  settings: SettingsHost
  llm?: LlmHost  // 仅 AI 运行时加载后存在
}
```

获取单例：`import { getHost } from '../core/host-runtime'`

---

## DocumentHost

读写当前工作区文档快照。

| 方法 | 说明 |
|------|------|
| `getActiveTabId()` | 当前活动标签 ID，无则 `null` |
| `getDocument(tabId)` | `DocumentSnapshot \| null` |
| `getActiveDocument()` | 活动标签文档 |
| `updateContent(tabId, content)` | 按格式写入 md / tex |
| `onActiveTabChanged(cb)` | 订阅活动标签变化，返回 dispose |
| `onContentChanged(cb)` | 订阅文档内容更新 |

```typescript
interface DocumentSnapshot {
  tabId: string
  format: string
  content: string
  outline?: unknown
  meta?: Record<string, unknown>
}
```

---

## OutlineHost

| 方法 | 说明 |
|------|------|
| `getOutline(tabId)` | 大纲树数据 |
| `updateOutline(tabId, outline)` | 写回大纲 |

---

## EditorHost

向编辑器注册叠加层（如 AI 补全 Ghost）。

| 方法 | 说明 |
|------|------|
| `registerOverlay(reg)` | 注册 `EditorOverlayRegistration`，返回 dispose |
| `getOverlays(format?)` | 按格式过滤叠加层列表 |

```typescript
interface EditorOverlayRegistration {
  id: string
  component: Component
  formats?: string[]  // 如 ['md', 'tex', 'txt']
}
```

---

## ViewHost

文档标签内的**视图实现**注册（MVC 中的 V 层）。完整说明见 [09-VIEW-API.md](./09-VIEW-API.md)。

| 方法 | 说明 |
|------|------|
| `registerView(reg)` | 注册 `DocumentViewRegistration`，返回 dispose |
| `unregisterView(id)` | 按 ID 移除 |
| `getView(id)` | 查询单条注册 |
| `getAllViews()` | 按 `order` 排序的全部视图 |

`ui.registerDocumentView` **已废弃为兼容入口**，内部转发至 `views.registerView`。

视图组件应使用 `useDocumentViewContext(tabId)` 访问文档数据；参考实现：`Outline.vue`、`Visualize.vue`。

---

## UIHost

向壳层注册 UI 贡献点。注册项存入 `pluginRegistry`（`host-runtime.ts`），由 `Main.vue`、`WorkspaceDocumentViews.vue` 等消费。

| 方法 | 贡献类型 |
|------|----------|
| `registerContextMenuItem` | 选区 / 编辑器右键菜单 |
| `registerLeftMenuItem` | 左侧菜单项 |
| `registerDocumentView` | **兼容别名** → `views.registerView` |
| `registerSettingsSection` | 设置页分区 |
| `registerShellOverlay` | 全局浮层（任务队列、错误对话框等） |

### ContextMenuItemContribution

```typescript
interface ContextMenuItemContribution {
  id: string
  label: string | (() => string)
  group?: string
  order?: number
  when?: () => boolean
  onClick: (ctx: { tabId: string }) => void | Promise<void>
}
```

### LeftMenuItemContribution

```typescript
interface LeftMenuItemContribution {
  id: string
  label: string | (() => string)
  icon?: Component
  parentId?: string   // 如 'ai-assistant'
  order?: number
  when?: () => boolean
  onClick: () => void | Promise<void>
}
```

### DocumentViewContribution

```typescript
interface DocumentViewContribution {
  view: DocumentView   // workspace store 中的视图枚举扩展
  component: Component
  label?: string
}
```

### SettingsSectionContribution

```typescript
interface SettingsSectionContribution {
  id: string
  label: string
  component: Component
  order?: number
}
```

### ShellOverlayContribution

```typescript
interface ShellOverlayContribution {
  id: string
  component: Component
  position: 'main' | 'app'  // main: Main.vue 工作区；app: App.vue 根级
}
```

---

## EventHost

基于 `utils/event-bus.js`（mitt）的薄封装。

| 方法 | 说明 |
|------|------|
| `on(event, handler)` | 订阅，返回 dispose |
| `emit(event, ...args)` | 发布 |

常用事件（约定，非 Host API 强制枚举）：

- `ai-runtime-ready` / `ai-runtime-unloaded`
- `ai-runtime-toggle`
- `switch-document-view`
- `ai-chat`, `open-knowledge-base`
- 各 AI 工具窗：`ocr`, `data-analysis`, …

---

## SettingsHost

| 方法 | 说明 |
|------|------|
| `get<T>(key)` | 异步读取设置 |
| `set(key, value)` | 异步写入 |
| `isLlmEnabled()` | `getSetting('llmEnabled') === true` |

---

## LlmHost

**仅在** `loadAiRuntime()` 成功后通过 `attachLlmHost()` 挂载。

| 成员 | 说明 |
|------|------|
| `isAvailable()` | 是否已配置且启用 LLM（`AIService.isLLMAvailable()`） |
| `createTask` | 与 `utils/ai_tasks.createAiTask` 相同签名 |

插件应使用 `host.llm?.isAvailable()` 而非直接 import AIService，以便在运行时卸载后行为一致。

---

## 插件类型

```typescript
interface PluginManifest {
  id: string
  name: string
  version: string
  entry: string
  permissions?: PluginPermission[]
  activationEvents?: string[]
}

interface PluginContext {
  host: MetaDocHost
  manifest: PluginManifest
}

interface MetaDocPlugin {
  manifest: PluginManifest
  activate(ctx: PluginContext): void | Promise<void>
  deactivate?(): void | Promise<void>
}
```

辅助工厂：

```typescript
createMetaDocPlugin(manifest, activate, deactivate?): MetaDocPlugin
```

---

## PluginPermission

```typescript
type PluginPermission =
  | 'documents.read'
  | 'documents.write'
  | 'outline.read'
  | 'outline.write'
  | 'llm.completion'
  | 'llm.chat'
  | 'settings.read'
  | 'settings.write'
  | 'main.rag'
  | 'main.terminal'
```

> **注意：** 社区插件在 `activate` 时通过 `createSandboxedHost` **强制**校验 `permissions`；内置插件为受信代码，使用完整 Host。见 [`sandboxed-host.ts`](../../src/renderer/src/core/sandboxed-host.ts)。

---

## 生命周期

```
getHost()                    // bootstrapCore 时创建，llm 初始为 undefined
loadAiRuntime()
  → attachLlmHost(llm)
  → loadBuiltinPlugins(...)
unloadAiRuntime()
  → deactivateAllPlugins()
  → clearPluginContributions()
  → attachLlmHost(undefined)
```

`deactivatePlugin` 会调用插件的 `deactivate` 并清理注册表中的 dispose 回调。

---

## 示例

```typescript
import { createMetaDocPlugin } from '../../host-api'
import MyPanel from './MyPanel.vue'

export default createMetaDocPlugin(
  {
    id: 'com.example.my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    entry: './index',
    permissions: ['documents.read', 'llm.chat'],
    activationEvents: ['onLlmEnabled']
  },
  ({ host }) => {
    host.ui.registerDocumentView({
      view: 'my-view',
      component: MyPanel,
      label: 'My View'
    })
    host.events.on('some-event', (payload) => {
      const doc = host.documents.getActiveDocument()
      // ...
    })
  }
)
```

完整最小示例：[`plugins/examples/hello-world.ts`](../../src/renderer/src/plugins/examples/hello-world.ts)
