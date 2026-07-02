# View API（文档视图层）

**源码：** [`src/renderer/src/view-api/`](../../src/renderer/src/view-api/)

View API 是 MetaDoc **MVC 分层**中的 **V（View）层**契约：核心维护 **M**（`DocumentHost` / `OutlineHost`）与 **C**（视图注册表、切换、`viewMenuConfig`），具体视图实现（内置大纲、可视化、插件校对等）通过注册表挂载。

与通用 Host API 的关系见 [04-HOST-API-SPEC.md](./04-HOST-API-SPEC.md) 中的 `ViewHost` 章节。

---

## 分层示意

| 层 | 职责 | 主要模块 |
|----|------|----------|
| Model | 文档快照、大纲读写 | `host.documents`, `host.outline` |
| Controller | 视图注册、切换、菜单偏好 | `view-api/registry`, `view-api/controller`, `viewMenuConfig` |
| View | Vue 组件实现 | `Outline.vue`, `Visualize.vue`, 插件视图 |

---

## 注册文档视图

推荐通过 `host.views.registerView`（`ui.registerDocumentView` 为兼容别名）：

```typescript
host.views.registerView({
  id: 'my-view',
  component: MyView,
  label: () => 'headMenu.myView',
  iconImage: () => themeState.currentTheme.SomeIcon,
  order: 45,
  requiresLlm: false,
  showInViewMenu: true,
  when: (ctx) => !ctx.isPlainTextFormat && ctx.hasActiveDocument,
  renderMode: 'component'
})
```

### 字段说明

| 字段 | 说明 |
|------|------|
| `id` | 视图 ID，写入 `WorkspaceDocument.lastView` |
| `component` | Vue 3 组件，须接受 `tab-id` prop |
| `label` | 菜单文案或 i18n 键 |
| `iconImage` | ViewMenu 图标 URL |
| `order` | 排序权重 |
| `isCore` | `home` / `editor`：不可在配置中隐藏 |
| `requiresLlm` | 全局 LLM 关闭时不注册到菜单、不参与 AI 卸载后保留 |
| `showInViewMenu` | 是否出现在左侧 ViewMenu |
| `when` | 按 tab/格式/runtime 过滤 |
| `renderMode` | `component`（默认）或 `editor-slot`（编辑器由 `WorkspaceTabPane` 注入 slot） |

切换视图：

```typescript
host.events.emit('switch-document-view', { tabId, view: 'outline' })
```

监听器在 `bootstrap` 时由 `installViewSwitchListener()` 安装。

---

## 视图侧数据访问（最佳实践）

**官方参考实现：**

- [`Outline.vue`](../../src/renderer/src/views/Outline.vue)
- [`Visualize.vue`](../../src/renderer/src/views/Visualize.vue)

视图组件应使用 `useDocumentViewContext(tabId)`，**不要**直接 `import { useWorkspace }` 读写文档（除仍依赖 workspace 的 Tab/路由级操作外）。

```typescript
import { useDocumentViewContext } from '../view-api'

const props = defineProps<{ tabId?: string }>()
const {
  effectiveTabId,
  activeDocument,
  content,
  outline,
  updateContent,
  updateOutline,
  updateMarkdown,
  updateTex,
  lockUI,
  unlockUI
} = useDocumentViewContext(() => props.tabId)
```

### 禁止事项（插件 / 社区视图）

- 不要直接调用 `workspace.updateDocumentMarkdown` 等 store 方法 — 使用 context 或 `host.documents` / `host.outline`
- 不要在视图内硬编码 ViewMenu 项 — 通过 `registerView` + `showInViewMenu`
- 不要假设 AI 运行时始终加载 — 使用 `requiresLlm` 与 `settings.llmEnabled`

---

## ViewMenu 用户配置

- 设置键：`viewMenuConfig`（`{ id, visible }[]` + 顺序）
- 在 ViewMenu 空白处右键 →「视图菜单配置」
- `home` / `editor` 为核心项，始终显示；`outline` / `visualize` / 插件视图默认显示，可隐藏与排序

消费方：[`ViewMenu.vue`](../../src/renderer/src/components/ViewMenu.vue)

渲染方：[`WorkspaceDocumentViews.vue`](../../src/renderer/src/components/workspace/WorkspaceDocumentViews.vue) 遍历 `getRegisteredViewsForRender()`

---

## 内置视图插件（onStartup）

| 插件 ID | 视图 ID |
|---------|---------|
| `metadoc.builtin.core-views` | `home`, `editor`, `outline`, `visualize` |

AI 视图（`onLlmEnabled`）：`proofread`, `agent` 等 — 见 [06-BUILTIN-PLUGIN-MATRIX.md](./06-BUILTIN-PLUGIN-MATRIX.md)

---

## 测试

- [`view-api/registry.test.ts`](../../src/renderer/src/view-api/registry.test.ts)
- [`view-api/controller.test.ts`](../../src/renderer/src/view-api/controller.test.ts)
