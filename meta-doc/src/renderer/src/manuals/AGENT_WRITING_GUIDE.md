# MetaDoc 用户手册编写提示词

> **用途**：供 AI Agent 参考此文档进行用户手册的编写、修改和完善工作  
> **最后更新**：2026-02-20

---

## 📚 必读文档（按优先级）

### 1. 详细编写规范
**`WRITING_GUIDE.md`** - 完整的文档编写规范
- 文档格式要求
- Demo 组件嵌入规范
- 图表使用规范
- 内部链接格式
- 文档结构要求

### 2. 实现总结与当前状态
**`IMPLEMENTATION_SUMMARY.md`** - 实现总结和当前进度
- Demo 模式实现状态（✅ 已完全实现）
- 文档完善进度统计
- 技术实现细节
- 待完成工作清单

### 3. 文档索引结构
**`docs/USER_MANUAL_INDEX.md`** - 完整的文档索引结构
- 所有需要编写的文档列表
- 文档分类和层级
- 功能点要求

### 4. 待办事项清单
**`docs/MIGRATION_TODO_LIST.md`** - 迁移和待办事项
- 当前待完成的任务
- 文档完善优先级

### 5. 标杆文档（必读）
**`zh_CN/quick-start/guide.md`** - 快速开始指南
- ✅ 已完善的标杆文档
- ✅ 包含 Mermaid 流程图
- ✅ 包含 Demo 组件嵌入示例
- ✅ 内容完整、格式规范
- **强烈建议**：编写新文档前先仔细阅读此文档，理解其结构和风格

---

## 🎯 核心原则（快速参考）

### Demo 组件嵌入

- **原则**：文档提到哪个界面控件，就嵌入哪个组件
- **语法**：`<ComponentName mode="demo" />`
- **示例**：
  - 介绍「顶部菜单栏」→ `<LeftMenu mode="demo" />`
  - 介绍「标签页栏」→ `<MainTabs mode="demo" />`
  - 介绍「快速开始向导」→ `<QuickStartPanel mode="demo" />`
- **禁止**：不要在用户可见文档中写「Demo 模式：仅展示…」等说明文字

### Mermaid 图表

- **用途**：流程说明、结构图、关系图
- **风格**：黑白灰色调，极简风格
- **注意**：用户手册中的 Mermaid 图表会自动适配主题（亮色/暗色），无需手动设置样式

### 内部链接

- **格式**：`[[articleId|显示文本]]`
- **示例**：`[[core.file-operations|文件操作]]`

---

## ✅ 编写检查清单

编写完文档后，必须检查：

- [ ] 已阅读 `WRITING_GUIDE.md` 了解详细规范
- [ ] 已阅读 `zh_CN/quick-start/guide.md` 标杆文档
- [ ] 已对照 `docs/USER_MANUAL_INDEX.md` 确认功能点覆盖完整
- [ ] 已添加 Mermaid 图表（流程、结构、关系图等）
- [ ] 已嵌入 Demo 组件（文档提到哪个控件就展示哪个组件）
- [ ] 所有链接格式正确（使用 `[[文档ID|文本]]` 格式）
- [ ] 已在 `index.json` 中注册（如为新文档）
- [ ] 已更新 `IMPLEMENTATION_SUMMARY.md` 中的进度统计

---

## 📖 快速开始

1. **阅读标杆文档**：`zh_CN/quick-start/guide.md`
2. **阅读编写规范**：`WRITING_GUIDE.md`
3. **查看索引结构**：`docs/USER_MANUAL_INDEX.md`
4. **查看当前状态**：`IMPLEMENTATION_SUMMARY.md`
5. **开始编写**：参考标杆文档的结构和风格

---

## 🔗 相关资源位置

- **编写规范**：`manuals/WRITING_GUIDE.md`
- **实现总结**：`manuals/IMPLEMENTATION_SUMMARY.md`
- **文档索引**：`docs/USER_MANUAL_INDEX.md`
- **待办清单**：`docs/MIGRATION_TODO_LIST.md`
- **标杆文档**：`manuals/zh_CN/quick-start/guide.md`
- **文档索引配置**：`manuals/index.json`
- **组件注册**：`manuals/demo-registry-components.ts`
- **占位符处理**：`manuals/demo-mode.ts`
- **样式适配**：`components/manual/ManualContent.vue`

---

**最后更新**：2026-02-20  
**维护者**：MetaDoc 团队
