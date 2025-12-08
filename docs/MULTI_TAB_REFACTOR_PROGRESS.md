# MetaDoc 多标签重构进展（截至 2025-11-09）

## 重构目标速览
- **多标签工作流**：允许同时打开多份 Markdown / LaTeX 文档，支持跨标签切换、关闭、脏状态提示。
- **独立编辑器实例**：Markdown（Vditor）与 LaTeX（Monaco）各自按标签实例化，互不干扰。
- **全局事件去中心化**：将原先依赖 `common-data` 的单例状态迁移到 `workspace` store，按当前激活标签驱动工具栏 / AI / 文件操作。
- **界面体验**：解决底部菜单遮挡、分栏尺寸异常、Tab 视觉不明显等 UI/UX 问题。

## 当前架构概况

### 1. `workspace` Store（`src/renderer/src/stores/workspace.ts`）
- **核心职责**：集中管理标签 (`WorkspaceTab`) 与文档快照 (`WorkspaceDocument`)。
- **快照 + 脏状态**：引入 `savedMarkdown/savedTex/savedMeta/...`，通过 `computeDocumentDirty` 精确计算脏态，避免切换标签时误报。
- **双向同步**：
  - 激活标签时调用 `applyDocumentForActiveTab`，将快照写回旧版全局状态（保持与遗留逻辑兼容）。
  - 编辑器更新内容时只调用 `workspace.updateDocument*`，再由 store 负责更新脏态 & 触发 `eventBus` 的 `is-need-save`。
- **Tab 元信息刷新**：监听 `current_article_meta_data` / `current_file_path` / `current_format`，实时更新标签标题、副标题、图标等。

### 2. Tab 组件（`WorkspaceTabs.vue`）
- **视图重构**：标签标题显示为 `文件名 - 标题`，活动标签加深背景、加粗文字，并在有未保存改动时显示红点。
- **交互逻辑**：关闭标签时若文档脏，会弹出 i18n 确认框；`legacy` 标签只读不能关闭。

### 3. 编辑器载体
- **`MarkdownEditor.vue`**：使用 `ResizableContainer` 对编辑器 / 元信息分栏重写拖拽逻辑，比例与鼠标移动保持一致；卸载遗留脏态计算，统一走 `workspace`。
- **`LaTeXEditor.vue`**：
  - 完整改写三列布局（Monaco+Console / PDF 预览 / 元信息），两侧拖拽条分别锁定固定边，彻底解决宽度异常与重叠。
  - 引入 `ResizeObserver` + `clamp` 工具，防止 `ResizeObserver` 死循环（避免 `ResizeObserver loop completed` 报错）。
  - 监听 `props.active`，在标签非激活时暂停 PDF/Monaco 同步，解决切换冻结问题。
  - 元信息区与 AI 菜单与 `workspace` 绑定，确保每个标签保持独立状态。

### 4. 周边视图联动
- **`Outline.vue` / `Visualize.vue`**：顶部集成 `WorkspaceTabs`，根据 `activeTabId` 重新拉取 outline / 可视化数据，保持与编辑视图一致。
- **`Main.vue` 布局**：采用 `el-container` 将 `BottomMenu` 放入 `el-footer`，避免遮挡主内容。

### 5. IPC / 事件流调整（进行中）
- `eventBus` 仍承担保存、AI 请求等广播，但已有能力根据 `activeTabId` 提供上下文。
- 后续需要将主进程 `open/save/export` 流程统一通过 `workspace` tab 传参（TODO#2）。

## 已完成特性列表
- [x] 多标签数据层（store + Tab 组件）及脏态管理。
- [x] Markdown / LaTeX 编辑器按标签实例化与状态绑定。
- [x] 大纲 / 可视化 / 主界面适配多标签切换。
- [x] Tab 样式增强、底部菜单定位修复、分栏拖拽稳定。
- [x] CLI 启动携带文件时自动打开（当没有已有实例时）。

## 进行中 / 待完成
- [ ] **TODO#2**：重构保存 / 打开 / 导出管线，使其完全依赖 `workspace` 的当前标签上下文，并同步调整 `eventBus` 与主进程通信协议。
- [ ] **TODO#3**：文件树视图、AI Chat 本地化等后续功能，需要与新的 tab/文档模型对齐。
- [ ] 多窗口（设置、AI 工具等）对当前标签的感知与同步。

## 关键文件速览
| 模块 | 作用 | 备注 |
| --- | --- | --- |
| `stores/workspace.ts` | 多标签状态中心、脏态计算、激活标签切换 | 与遗留 `common-data` 共存，逐步替换 |
| `components/workspace/WorkspaceTabs.vue` | Tab UI + 交互 | 负责渲染标题、脏点、关闭确认 |
| `views/MarkdownEditor.vue` | Markdown 编辑器 | 侧栏拖拽 & 状态同步 |
| `views/LaTeXEditor.vue` | LaTeX 编辑器 | 三列布局、Monaco/PDF 管理、Console 拖拽 |
| `views/Main.vue` | 主框架 | 底部菜单位置修复 |
| `views/Outline.vue` / `views/Visualize.vue` | 辅助视图 | 通过 `workspace` 同步内容 |

## 开发注意事项
- **避免直接操作 `common-data`**：新功能尽量使用 `workspace` 的 API，必要时通过 `applyDocumentForActiveTab` 与遗留逻辑同步。
- **切换标签前务必调用 `workspace.persistActiveDocument()`**，以免失去最新内容。
- 编辑器侧的异步操作（AI 补全、PDF 渲染）需判断 `props.active`，防止切换时的资源竞争。
- 样式采用 `flex` / `min-width` 组合，确保三列在极限宽度下仍然可用。

---
如需了解更详细的实现细节，可在对应文件中查找 `// TODO#2` 等标记，或查看 `REFACTOR_SUMMARY.md` 获取历史阶段总结。

