# 大纲功能技术参考 (JeredYe 实现)

**文档类型**: 技术参考  
**作者**: JeredYe (基于 Element Plus)  
**创建日期**: 2026-02-25  
**状态**: 需要迁移到 shadcn-vue

---

## 功能概述

JeredYe 在 main 分支实现的大纲功能，包含以下核心能力：

1. **交互式大纲树** - 可视化文档结构
2. **AI 辅助编辑** - 生成/扩展/缩减/润色内容
3. **批量 AI 操作** - 多节点批量处理
4. **行内编辑** - 展开节点直接编辑
5. **拖拽重组** - 可视化调整文档结构

---

## 组件架构

```
Outline.vue (主视图)
├── OutlineAiToolbar (AI 工具栏)
│   ├── generateChildren (生成子章节)
│   ├── generateContent (生成内容)
│   ├── generateChildrenChildren (批量生成子节点)
│   └── generateChildrenContent (批量生成内容)
├── vue-tree (第三方树组件)
│   ├── DetailedOutlineNode (行内编辑面板)
│   │   ├── 内容预览 (Vditor)
│   │   ├── AI 操作 (扩展/缩减/润色)
│   │   └── 接受/拒绝按钮
│   └── tree-node (标准节点)
│       └── OutlineNodeActionButton (节点操作按钮)
├── StreamingJsonTree (AI 响应预览)
└── Dialogs (格式化标题、编辑章节)
```

---

## 数据模型

### DocumentOutlineNode

```typescript
interface DocumentOutlineNode {
  path: string // 节点路径: 'dummy' (根), '1', '1.1', '1.2.1'
  title: string // 标题文本
  text: string // 章节内容
  title_level: number // 标题级别: 0=根, 1=H1, 2=H2...
  children: DocumentOutlineNode[]
}
```

### 路径约定

- **根节点**: `dummy` (虚拟，不显示)
- **顶层**: `1`, `2`, `3`...
- **嵌套**: `1.1`, `1.2.3`...

---

## 核心文件

### 组件文件

| 文件                          | 用途             | 当前 UI 框架 |
| ----------------------------- | ---------------- | ------------ |
| `Outline.vue`                 | 主视图           | 混合         |
| `OutlineAiToolbar.vue`        | AI 工具选择      | Element Plus |
| `OutlineNodeActionButton.vue` | 节点操作按钮     | Element Plus |
| `DetailedOutlineNode.vue`     | 行内编辑面板     | 混合         |
| `StreamingJsonTree.vue`       | AI JSON 响应显示 | 新增         |

### 工具文件

| 文件                         | 用途          | 说明     |
| ---------------------------- | ------------- | -------- |
| `utils/document/outline.ts`  | 大纲提取/生成 | 框架无关 |
| `utils/outline-helpers.ts`   | 树操作辅助    | 框架无关 |
| `utils/outline-normalize.ts` | 标题规范化    | 框架无关 |
| `utils/outline-ai-utils.ts`  | AI 操作逻辑   | 框架无关 |

### Store 集成

```typescript
// stores/workspace.ts
interface WorkspaceDocument {
  outline: DocumentOutlineNode // 当前大纲树
  savedOutline: DocumentOutlineNode // 保存状态
  // ...
}

// 关键函数
function updateDocumentOutline(tabId: string, outline: DocumentOutlineNode): void
function withAutoOutlineSyncSuppressed<T>(fn: () => T): T
```

---

## AI 操作类型

### 单节点操作

| 操作               | 功能         | 参数                                     |
| ------------------ | ------------ | ---------------------------------------- |
| `generateChildren` | 生成子章节   | node, userPrompt, temperature, wordCount |
| `generateContent`  | 生成章节内容 | node, userPrompt, temperature, wordCount |
| `expandContent`    | 扩展现有内容 | node, userPrompt, temperature            |
| `abridgeContent`   | 缩减内容     | node, userPrompt, wordCount              |
| `polishContent`    | 润色内容     | node, userPrompt                         |

### 批量操作

| 操作                       | 功能                         |
| -------------------------- | ---------------------------- |
| `generateChildrenChildren` | 为所有叶子节点批量生成子节点 |
| `generateChildrenContent`  | 为所有子节点批量生成内容     |

---

## 数据流

### 文档 → 大纲 (提取)

```
用户编辑文档
    ↓
updateDocumentMarkdown() [workspace.ts]
    ↓
extractOutlineTreeFromMarkdown() [document/outline.ts]
    ↓
updateDocumentOutline() [workspace.ts]
    ↓
Outline.vue 响应式更新
    ↓
vue-tree 重新渲染
```

### 大纲 → 文档 (生成)

```
用户修改大纲
    ↓
commitOutline() [Outline.vue]
    ↓
adapter.toText() [outline-adapters.ts]
    ↓
withAutoOutlineSyncSuppressed()
    ↓
updateDocumentMarkdown()
    ↓
编辑器更新
```

---

## 组件间通信

### Provide/Inject 模式

```typescript
// Outline.vue 中提供
provide('outlineSelectedAiTool', selectedAiTool)
provide('outlineToggleAiTool', toggleAiTool)
provide('outlineFormatTitle', openFormatTitleDialog)
provide('outlineHandleNodeButtonClick', handleNodeButtonClick)

// 子组件中注入
const selectedAiTool = inject('outlineSelectedAiTool')
const toggleAiTool = inject('outlineToggleAiTool')
```

---

## 拖拽实现

### 事件处理

```vue
<div
  draggable="true"
  @dragstart.stop="onNodeDragStart(node)"
  @dragover.prevent="onNodeDragOver($event, node)"
  @dragleave="onNodeDragLeave(node)"
  @drop.stop="onNodeDrop(node, $event)"
  @dragend.stop="onNodeDragEnd"
></div>
```

### 放置模式

- `before` - 在目标前放置（同级）
- `after` - 在目标后放置（同级）
- `child` - 作为子节点放置

---

## 关键修复 (bfb8425 合并)

### 1. 双向同步修复

**问题**: 从模板创建文档时不显示大纲

**解决**: 移除视图感知限制

```typescript
// 之前
if (currentView === 'editor') extractOutline()

// 之后
if (!suppressAutoOutlineSync) extractOutline()
```

### 2. 循环预防

```typescript
// 当大纲生成文档时
withAutoOutlineSyncSuppressed(() => {
  updateDocumentMarkdown(tabId, generatedMarkdown)
  // 防止重新提取大纲
})
```

---

## 测试要点

### 功能测试

- [ ] 大纲从 Markdown 正确提取
- [ ] 大纲正确生成 Markdown
- [ ] AI 生成子章节正常
- [ ] AI 生成内容正常
- [ ] 接受/拒绝 AI 生成内容正常
- [ ] 批量操作正常
- [ ] 节点拖拽重组正常
- [ ] 行内编辑正常

### 边缘情况

- [ ] 空文档
- [ ] 深层嵌套 (5+ 级)
- [ ] 特殊字符标题
- [ ] LaTeX 文档

---

## 迁移注意事项

当迁移到 shadcn-vue 时：

1. **保持功能逻辑不变** - 逻辑在 `outline-ai-utils.ts` 中，与 UI 框架无关
2. **保持数据流不变** - provide/inject 模式可以继续使用
3. **保持事件绑定** - 确保点击事件正确绑定到 shadcn-vue 组件
4. **图标系统** - 继续使用 `themeState.currentTheme.XXXIcon` 路径
5. **测试验证** - 迁移后必须验证所有 AI 功能正常

---

**文档结束**

_本文档描述 JeredYe 的功能实现，UI 框架为 Element Plus，需要迁移到 shadcn-vue。_
