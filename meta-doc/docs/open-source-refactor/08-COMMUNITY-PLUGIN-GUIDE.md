# 社区插件开发指南

MetaDoc 插件是在渲染进程运行的 ES 模块，通过 `MetaDocHost` 扩展 UI 与行为。内置插件位于 `plugins/builtin/`；社区插件遵循相同 API，由独立包或用户目录加载（**磁盘加载器尚未合入主分支**，下文标注「当前」与「规划」）。

---

## 快速开始

参考官方示例：[`plugins/examples/hello-world.ts`](../../src/renderer/src/plugins/examples/hello-world.ts)

```typescript
import { createMetaDocPlugin } from '../../host-api'

export default createMetaDocPlugin(
  {
    id: 'com.example.hello',
    name: 'Hello Plugin',
    version: '1.0.0',
    entry: './index',
    permissions: ['settings.read']
  },
  ({ host }) => {
    console.info('[Plugin] host version:', host.version)
  }
)
```

---

## 项目结构（推荐）

```
my-metadoc-plugin/
├── package.json
├── metadoc-plugin.json      # 可选：与 npm 包并列的清单
├── src/
│   └── index.ts
└── dist/
    └── index.js             # 构建产物
```

### `package.json` 要点

```json
{
  "name": "my-metadoc-plugin",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "peerDependencies": {
    "vue": "^3.5.0"
  }
}
```

插件 `activate` 中注册的 `component` 须为 Vue 3 组件；与 MetaDoc 共用同一份 Vue（由 Host 提供运行时）。

---

## 清单字段

详见 [05-PLUGIN-MANIFEST.md](./05-PLUGIN-MANIFEST.md)。

- **ID**：全局唯一，使用反向域名
- **permissions**：如实声明；未来版本可能强制校验
- **activationEvents**：
  - AI 类：`['onLlmEnabled']` — 仅在用户开启 LLM 后加载
  - 非 AI：`['onStartup']`（规划）— 核心启动后加载

---

## 使用 Host API

完整接口：[04-HOST-API-SPEC.md](./04-HOST-API-SPEC.md)

### 注册文档视图

推荐 `host.views.registerView`（详见 [09-VIEW-API.md](./09-VIEW-API.md)）：

```typescript
import MyView from './MyView.vue'

host.views.registerView({
  id: 'my-extension',
  component: MyView,
  label: () => 'headMenu.myExtension',
  order: 70,
  showInViewMenu: true,
  requiresLlm: false,
  renderMode: 'component'
})
```

兼容写法（仍可用）：

```typescript
host.ui.registerDocumentView({
  view: 'my-extension',
  component: MyView,
  label: 'My Extension'
})
```

`id` / `view` 为任意字符串，存入 `WorkspaceDocument.lastView`（`DocumentView` 类型已扩展为 `CoreDocumentView | string`）。

视图内请使用 `useDocumentViewContext(tabId)` 读写文档，勿直接 import `stores/workspace`。

### 读取 / 修改文档

```typescript
const doc = host.documents.getActiveDocument()
if (doc) {
  host.documents.updateContent(doc.tabId, doc.content + '\n<!-- appended -->')
}
```

### 调用 LLM（需权限）

```typescript
if (!host.llm) {
  console.warn('AI runtime not loaded')
  return
}
const available = await host.llm.isAvailable()
if (!available) return

const task = host.llm.createTask(/* ... */)
```

### 清理

```typescript
export default createMetaDocPlugin(manifest, activate, async () => {
  // 清除定时器、取消订阅等
})
```

`register*` 方法返回的 dispose 函数应在 `deactivate` 中调用（或由框架统一收集）。

---

## 加载方式

### 当前：内置 / 开发调试

1. 将插件放到 `src/renderer/src/plugins/builtin/` 或 `plugins/examples/`
2. 在 `builtin-manifests.ts` 临时加入 loader（**仅开发**）
3. 或于控制台手动：

```typescript
import { activatePlugin } from './core/plugin-loader'
import plugin from './plugins/examples/hello-world'
await activatePlugin(plugin.default)
```

### 规划：用户插件目录

预期约定（实现前请勿依赖路径细节）：

| 平台 | 目录 |
|------|------|
| Windows | `%APPDATA%/MetaDoc/plugins/<id>/` |
| macOS | `~/Library/Application Support/MetaDoc/plugins/<id>/` |
| Linux | `~/.config/MetaDoc/plugins/<id>/` |

每个插件目录包含：

- `metadoc-plugin.json` — 清单
- `dist/index.js` — 入口

主进程或渲染进程启动时扫描目录，`import()` 入口并 `activatePlugin`。

---

## 与 AI 运行时的关系

| 插件类型 | 加载时机 |
|----------|----------|
| 依赖 `llm.*` | 须在 `activationEvents` 含 `onLlmEnabled`；检查 `host.llm` |
| 纯 UI / 文档 | 可请求 `onStartup`（待加载器支持） |

见 [07-LAZY-LOADING.md](./07-LAZY-LOADING.md)。

---

## 开发约束

1. **仅通过 Host 访问** — 避免 `import` `stores/workspace` 等内部模块，以免破坏封装与 semver
2. **动态 import 重型依赖** — 减小 `llmEnabled: false` 时的影响
3. **新 UI 使用 shadcn-vue** — 与主应用一致；见根 `AGENTS.md`
4. **i18n** — 菜单 `label` 可用 `() => t('key')` 若插件自带 vue-i18n 实例；或硬编码英文/中文由作者维护
5. **勿使用 `metadoc.builtin.*` ID**

---

## 发布 checklist

- [ ] 清单 `id` / `version` 唯一且 semver
- [ ] `permissions` 最小化
- [ ] 实现 `deactivate`
- [ ] 在无 LLM 环境下测试不崩溃
- [ ] README 说明依赖的 MetaDoc / Host API 版本
- [ ] 不包含 API Key 或 Steam 专用逻辑

---

## 故障排查

| 现象 | 可能原因 |
|------|----------|
| `host.llm` 为 `undefined` | 用户未开启 `llmEnabled` 或 AI 运行时未加载 |
| 注册的视图不显示 | `isAiRuntimeLoaded()` 为 false，或 `view` 切换事件未触发 |
| 左侧菜单无项 | `LeftMenu` 尚未完全消费 `pluginRegistry.leftMenuItems`（见 HANDOFF） |
| 重复 `activate` | 同 ID 插件已激活；`activatePlugin` 会跳过 |

---

## 相关文件

- API：[`host-api/index.ts`](../../src/renderer/src/host-api/index.ts)
- 加载器：[`core/plugin-loader.ts`](../../src/renderer/src/core/plugin-loader.ts)
- 内置参考：[`plugins/builtin/`](../../src/renderer/src/plugins/builtin/)
