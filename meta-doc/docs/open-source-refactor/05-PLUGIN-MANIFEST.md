# 插件清单（Plugin Manifest）规范

类型定义见 [`host-api/index.ts`](../../src/renderer/src/host-api/index.ts) 中的 `PluginManifest` 与 `PluginPermission`。

---

## 必填字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 全局唯一 ID，建议反向域名：`metadoc.builtin.agent`、`com.acme.my-plugin` |
| `name` | `string` | 显示名称 |
| `version` | `string` | 语义化版本，如 `1.0.0` |
| `entry` | `string` | 入口模块路径（相对插件包根目录；内置插件为逻辑路径） |

---

## 可选字段

### `permissions`

插件声明需要的 Host 能力。**社区插件**在激活时强制执行；内置插件为受信代码。

| 权限 | 含义 |
|------|------|
| `documents.read` | 读取 `DocumentHost`（含订阅） |
| `documents.write` | `updateContent` |
| `outline.read` | 读取大纲 |
| `outline.write` | 更新大纲 |
| `llm.completion` | `createTask` 且 `type === 'answer'` |
| `llm.chat` | `createTask` 且 `type` 为 `chat` / `tool` |
| `settings.read` | `SettingsHost.get` / `isLlmEnabled` |
| `settings.write` | `SettingsHost.set` |
| `main.rag` | 主进程 RAG / 知识库 IPC（预留，尚无 Host 面） |
| `main.terminal` | 终端执行工具（预留，尚无 Host 面） |

`ui`、`editor`、`events` 默认可用，便于注册贡献点；敏感读写须经上表权限。

内置插件权限对照见 [06-BUILTIN-PLUGIN-MATRIX.md](./06-BUILTIN-PLUGIN-MATRIX.md)。

### `activationEvents`

控制**何时应加载**插件（约定事件名；由加载器解释）。

| 事件 | 当前行为 |
|------|----------|
| `onLlmEnabled` | 所有内置 AI 插件均声明此项；实际由 `loadAiRuntime()` 批量加载，等价于 `llmEnabled === true` |
| （未声明） | 若将来支持非 AI 插件，可在 `bootstrapCore` 后即时 `activate` |

未来扩展示例：`onStartup`、`onDocumentOpen:md`、`onCommand:my.command`。

---

## MetaDocPlugin 结构

```typescript
interface MetaDocPlugin {
  manifest: PluginManifest
  activate(ctx: PluginContext): void | Promise<void>
  deactivate?(): void | Promise<void>
}
```

### `activate(ctx)`

- `ctx.host` — `MetaDocHost` 单例
- `ctx.manifest` — 本插件清单副本

应在此注册 UI / 事件监听，并保存 dispose 函数；若需清理，实现 `deactivate`。

### `deactivate()`

`unloadAiRuntime()` → `deactivateAllPlugins()` 时调用。应撤销副作用（定时器、全局监听等）。通过 `register*` 返回的 dispose 会在插件卸载时由加载器统一执行（若已接入 disposer 映射）。

---

## 内置插件 ID 命名

- 前缀：`metadoc.builtin.`
- 示例：`metadoc.builtin.completion`

社区插件**不得**使用 `metadoc.builtin.*` 命名空间。

---

## 清单示例

### 仅设置只读

```typescript
{
  id: 'metadoc.examples.hello-world',
  name: 'Hello World Plugin',
  version: '1.0.0',
  entry: './hello-world',
  permissions: ['settings.read']
}
```

### AI 功能插件

```typescript
{
  id: 'metadoc.builtin.proofread',
  name: 'Proofread',
  version: '1.0.0',
  entry: './proofread',
  permissions: ['documents.read', 'documents.write', 'llm.chat'],
  activationEvents: ['onLlmEnabled']
}
```

---

## 注册方式

### 内置

1. 在 `plugins/builtin/<name>.ts` 实现并 `export default createMetaDocPlugin(...)`。
2. 将动态 import 加入 [`builtin-manifests.ts`](../../src/renderer/src/plugins/builtin-manifests.ts)：

```typescript
export const builtinPluginLoaders = [
  () => import('./builtin/completion'),
  // ...
]
```

3. 由 [`ai-runtime/loader.ts`](../../src/renderer/src/ai-runtime/loader.ts) 在 `loadAiRuntime()` 内调用 `loadBuiltinPlugins(builtinPluginLoaders)`。

### 社区（规划中）

外部插件预期形态：

```json
{
  "id": "com.example.plugin",
  "name": "Example",
  "version": "1.0.0",
  "entry": "dist/index.js",
  "permissions": ["documents.read"],
  "activationEvents": ["onStartup"]
}
```

加载路径与用户目录约定见 [08-COMMUNITY-PLUGIN-GUIDE.md](./08-COMMUNITY-PLUGIN-GUIDE.md)。

---

## 版本与兼容性

- Host API 版本：`host.version`（当前 `1.0.0`）
- 插件应检查 `host.version` 主版本；不兼容时拒绝 `activate` 并提示用户
- 清单 `version` 独立于 Host API，遵循 semver

---

## 反模式

- 在 `manifest` 中省略 `permissions` 却直接 `import` 内部 utils 绕过 Host — 不利于审计与后续沙箱
- 在 `activate` 中同步加载超大依赖 — 应动态 `import()`（与 `loadAiRuntime` 策略一致）
- 复用 `metadoc.builtin.*` ID — 与内置插件冲突
