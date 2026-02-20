# 用户手册编写规范

## 📋 文档编写规范

本文档定义了MetaDoc用户手册的编写规范，确保所有文档风格统一、内容完整、易于维护。

**最后更新**: 2026-02-20  
**版本**: 1.2.0

---

## 🧩 嵌入 Vue 组件（Demo 模式 / 沙箱）- ✅ 已完全实现

用户手册支持在 Markdown 中**直接嵌入项目内真实 Vue 组件**，使用 `mode="demo"` 在沙箱中展示。**原则：文档中提到了哪些界面控件，就展示哪些组件**，让用户边看文档边对照真实 UI 操作。

**技术实现状态（2026-02-20）**：
- ✅ 占位符预处理：`manuals/demo-mode.ts` 将组件标签替换为占位符 div
- ✅ 后渲染注入：Vditor 渲染完成后，`ManualContent.vue` 将占位符替换为真实组件
- ✅ 样式适配：组件容器自适应大小并居中显示，样式在手册层统一处理
- ✅ 交互阻断：通过事件拦截和 CSS 防止触发业务逻辑
- ✅ Mermaid 主题适配：用户手册中的 Mermaid 图表自动适配主题（仅在手册中生效）

### 语法

在文档中写入**自闭合标签**，组件名需**大写开头**，属性与普通 HTML 一致：

```markdown
<ComponentName mode="demo" />
<LeftMenu mode="demo" />
<MainTabs mode="demo" />
<QuickStartPanel mode="demo" />
```

- **mode**：必须为 `demo`（或省略，系统会自动补全为 demo）。
- **其他属性**：按组件 props 传入（如有需要）。

### 约束与原则

#### 核心原则：文档描述到哪个控件，就嵌入哪个组件

**重要**：根据文档内容选择合适的组件，不要只使用菜单组件。文档中提到哪个具体的界面元素，就展示哪个对应的组件。

#### 组件选择规范

**1. 菜单组件使用规范（重要）**

- ❌ **禁止使用完整菜单组件**：不要使用 `<LeftMenu mode="demo" />` 或 `<ViewMenu mode="demo" />` 展示完整菜单
- ✅ **必须使用特定菜单项组件**：
  - **顶部菜单项**：使用 `<MenuItemsDemo mode="demo" :items='[{"id": "file", "items": ["new", "open", "save"]}]' />` 只展示文档中提到的特定菜单项
  - **侧边栏菜单项**：使用 `<ViewMenuItemsDemo mode="demo" :items='["editor", "outline"]' />` 只展示文档中提到的特定视图菜单项
- **示例**：
  - 如果文档介绍"文件菜单的新建功能"，使用 `<MenuItemsDemo mode="demo" :items='[{"id": "file", "items": ["new"]}]' />`
  - 如果文档介绍"设置菜单"，使用 `<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />`
  - 如果文档介绍"编辑器视图和大纲视图"，使用 `<ViewMenuItemsDemo mode="demo" :items='["editor", "outline"]' />`

**2. 功能相关组件选择**

根据文档描述的具体功能选择合适的组件：

- **标签页功能**：使用 `<MainTabs mode="demo" />` 展示标签页栏
- **快速开始向导**：
  - 格式选择：`<QuickStartPanel mode="demo" />`
  - Markdown向导：`<QuickStartMarkdown mode="demo" />`
  - LaTeX向导：`<QuickStartLatex mode="demo" />`
- **编辑器功能**：
  - **查找替换**：使用 `<SearchReplaceMenu mode="demo" :position='{"top": 100, "left": 200}' :adapter='null' />` 展示查找替换菜单
  - **段落优化**：使用 `<SectionOptimizer mode="demo" title="示例" :position='{"top": 100, "left": 200}' path="1" :tree='{}' language="markdown" :adapter='null' />` 展示段落优化器
  - **标题菜单**：使用 `<TitleMenu mode="demo" title="示例标题" :position='{"top": 100, "left": 200}' path="1" :tree='{}' />` 展示标题菜单
- **LaTeX编辑器功能**：
  - **PDF预览**：使用 `<PdfPreviewPanel mode="demo" pdfUrl="" />` 展示PDF预览面板
  - **控制台输出**：使用 `<ConsoleTerminal mode="demo" consoleKey="demo" :history='[]' />` 展示控制台输出
- **文档元信息**：使用 `<MetaInfoPanel mode="demo" :meta='{"title": "", "author": "", "description": "", "keywords": []}' :outlineJson='""' />` 展示元信息面板

**3. 组件选择示例**

根据文档内容选择合适的组件：

- ✅ **介绍Markdown编辑器**：可以展示 `TitleMenu` 或 `SectionOptimizer`（如果提到段落优化功能）
- ✅ **介绍LaTeX编辑器**：可以展示 `PdfPreviewPanel` 或 `ConsoleTerminal`（如果提到PDF预览或编译输出）
- ✅ **介绍查找替换功能**：展示 `SearchReplaceMenu`
- ✅ **介绍元信息功能**：展示 `MetaInfoPanel`
- ✅ **介绍标签页操作**：展示 `MainTabs`
- ✅ **介绍快速开始**：展示 `QuickStartPanel`、`QuickStartMarkdown` 或 `QuickStartLatex`
- ❌ **不要**：无论什么内容都只展示菜单组件

#### 技术约束

- **真实组件**：必须使用项目内真实组件，不得为手册单独维护 Mock 副本。
- **组件改造**：需支持可选 prop `mode?: 'normal' | 'demo'`，默认 `'normal'`；所有副作用（事件处理、API调用等）仅在 `mode === 'normal'` 时执行。
- **注册**：新组件需在 `manuals/demo-registry-components.ts` 中注册后才能在文档中使用。
- **禁止说明性文字**：**禁止在用户可见的文档中写**「Demo 模式：仅展示外观与交互…」「不会改变本手册页面布局」等说明性废话，不要展示给用户。组件应该自然地嵌入文档中，让用户看到真实的UI界面。

#### 已支持的 Demo 组件列表

当前已支持以下组件在文档中使用（demo 模式下不触发真实导航/文件操作/事件）：

##### 1. 菜单组件

**MenuItemsDemo** - 顶部菜单项展示组件

基于代码实现 (`components/manual/MenuItemsDemo.vue`)：
- **Props**：
  - `items`: `Array<{id: string, items?: string[]}>` - 菜单项配置数组
    - `id`: 菜单标识，支持 `'file'`, `'ai-assistant'`, `'settings'`
    - `items`: 子菜单项数组，支持 `'new'`, `'open'`, `'save'`, `'save-as'`, `'save-all'`, `'close'`, `'export'`, `'ai-chat'`, `'proofread'`, `'formula-recognition'`
  - `collapsed`: `boolean` - 是否折叠，默认为 `true`
  - `mode`: `'normal' | 'demo'` - 模式，默认为 `'demo'`

**使用示例**：
```markdown
<MenuItemsDemo mode="demo" :items='[{"id": "file", "items": ["new", "open", "save"]}]' />
<MenuItemsDemo mode="demo" :items='[{"id": "ai-assistant", "items": ["ai-chat", "proofread"]}]' />
<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />
```

**ViewMenuItemsDemo** - 侧边栏视图菜单项展示组件

基于代码实现 (`components/manual/ViewMenuItemsDemo.vue`)：
- **Props**：
  - `items`: `string[]` - 视图项数组，支持 `'home'`, `'editor'`, `'outline'`, `'agent'`
  - `collapsed`: `boolean` - 是否折叠，默认为 `false`
  - `mode`: `'normal' | 'demo'` - 模式，默认为 `'demo'`

**使用示例**：
```markdown
<ViewMenuItemsDemo mode="demo" :items='["editor", "outline"]' />
<ViewMenuItemsDemo mode="demo" :items='["home", "agent"]' />
```

##### 2. 标签页组件

**MainTabs** - 标签页栏展示组件

- **Props**：
  - `mode`: `'normal' | 'demo'` - 模式，默认为 `'demo'`

**使用示例**：
```markdown
<MainTabs mode="demo" />
```

##### 3. 快速开始组件

**QuickStartPanel** - 快速开始格式选择面板

基于代码实现 (`components/home/QuickStartPanel.vue`)：
- **Props**：
  - `mode`: `'normal' | 'demo'` - 模式，默认为 `'demo'`

**使用示例**：
```markdown
<QuickStartPanel mode="demo" />
```

**QuickStartMarkdown** - Markdown快速开始向导

基于代码实现 (`components/home/QuickStartMarkdown.vue`)：
- **Props**：
  - `mode`: `'normal' | 'demo'` - 模式，默认为 `'demo'`

**使用示例**：
```markdown
<QuickStartMarkdown mode="demo" />
```

**QuickStartLatex** - LaTeX快速开始向导

基于代码实现 (`components/home/QuickStartLatex.vue`)：
- **Props**：
  - `mode`: `'normal' | 'demo'` - 模式，默认为 `'demo'`

**使用示例**：
```markdown
<QuickStartLatex mode="demo" />
```

##### 4. 编辑器组件

**SearchReplaceMenu** - 查找替换菜单

- **Props**：
  - `position`: `{top: number, left: number}` - 菜单位置
  - `adapter`: 编辑器适配器实例，demo模式下可为 `null`
  - `mode`: `'normal' | 'demo'` - 模式，默认为 `'demo'`

**使用示例**：
```markdown
<SearchReplaceMenu mode="demo" :position='{"top": 100, "left": 200}' :adapter='null' />
```

**TitleMenu** - 标题菜单

- **Props**：
  - `title`: `string` - 标题文本
  - `position`: `{top: number, left: number}` - 菜单位置
  - `path`: `string` - 文档路径
  - `tree`: `object` - 文档大纲树
  - `mode`: `'normal' | 'demo'` - 模式，默认为 `'demo'`

**使用示例**：
```markdown
<TitleMenu mode="demo" title="示例标题" :position='{"top": 100, "left": 200}' path="1" :tree='{}' />
```

**SectionOptimizer** - 段落优化器

- **Props**：
  - `title`: `string` - 段落标题
  - `position`: `{top: number, left: number}` - 菜单位置
  - `path`: `string` - 文档路径
  - `tree`: `object` - 文档大纲树
  - `language`: `string` - 语言，如 `'markdown'`, `'latex'`
  - `adapter`: 编辑器适配器实例，demo模式下可为 `null`
  - `mode`: `'normal' | 'demo'` - 模式，默认为 `'demo'`

**使用示例**：
```markdown
<SectionOptimizer mode="demo" title="示例" :position='{"top": 100, "left": 200}' path="1" :tree='{}' language="markdown" :adapter='null' />
```

##### 5. LaTeX组件

**PdfPreviewPanel** - PDF预览面板

- **Props**：
  - `pdfUrl`: `string` - PDF文件URL，demo模式下可为空字符串
  - `mode`: `'normal' | 'demo'` - 模式，默认为 `'demo'`

**使用示例**：
```markdown
<PdfPreviewPanel mode="demo" pdfUrl="" />
```

**ConsoleTerminal** - 控制台终端

- **Props**：
  - `consoleKey`: `string` - 控制台标识符
  - `history`: `Array<{content: string, type: 'out' | 'warn' | 'error'}>` - 历史记录
  - `mode`: `'normal' | 'demo'` - 模式，默认为 `'demo'`

**使用示例**：
```markdown
<ConsoleTerminal mode="demo" consoleKey="demo" :history='[{"content": "编译完成", "type": "out"}]' />
```

##### 6. 元信息组件

**MetaInfoPanel** - 文档元信息面板

- **Props**：
  - `meta`: `{title: string, author: string, description: string, keywords: string[]}` - 元信息对象
  - `outlineJson`: `string` - 大纲JSON字符串
  - `mode`: `'normal' | 'demo'` - 模式，默认为 `'demo'`

**使用示例**：
```markdown
<MetaInfoPanel mode="demo" :meta='{"title": "示例", "author": "作者", "description": "描述", "keywords": ["关键词1"]}' :outlineJson='""' />
```

##### 7. 其他组件

**ResizableDivider** - 可调整大小的分隔条

- **Props**：
  - `mode`: `'normal' | 'demo'` - 模式，默认为 `'demo'`

**使用示例**：
```markdown
<ResizableDivider mode="demo" />
```

**注意**：如需使用其他组件，需要先修改组件代码支持 `mode="demo"`，然后在 `demo-registry-components.ts` 中注册。

### 示例（正确）

```markdown
1. **文件菜单**：提供新建、打开、保存等文件操作。

<MenuItemsDemo mode="demo" :items='[{"id": "file", "items": ["new", "open", "save"]}]' />

2. **侧边栏视图切换**：提供编辑器、大纲等视图切换。

<ViewMenuItemsDemo mode="demo" :items='["editor", "outline"]' />

3. **标签页栏**：显示当前打开的文档标签，支持切换和关闭操作。

<MainTabs mode="demo" />

4. **查找替换功能**：在编辑器中按 Ctrl+F 打开查找对话框。

<SearchReplaceMenu mode="demo" :position='{"top": 100, "left": 200}' :adapter='null' />

5. **LaTeX PDF预览**：编译后可以在右侧面板查看PDF预览。

<PdfPreviewPanel mode="demo" pdfUrl="" />
```

### 示例（错误）

```markdown
❌ 错误示例1：使用完整菜单组件
<LeftMenu mode="demo" />
<ViewMenu mode="demo" />

❌ 错误示例2：无论什么内容都只展示菜单
介绍PDF预览功能时，只展示了菜单组件，没有展示PdfPreviewPanel

❌ 错误示例3：添加说明性废话
<MenuItemsDemo mode="demo" :items='[{"id": "file"}]' />
（Demo 模式：仅展示外观，不会触发真实操作）
```

### 图表与 Demo 结合

- **流程图**：在流程说明处使用 Mermaid / PlantUML 图表，展示操作流程、系统架构等。
- **界面展示**：在需要展示「对应界面长什么样」的地方嵌入所述的真实组件（使用 `mode="demo"`）。
- **互补使用**：图表和 Demo 组件可同篇使用，互不替代：
  - 图表用于说明流程、结构、关系
  - Demo 组件用于展示实际的界面元素
  - 例如：用流程图说明"如何打开设置"，然后用 MenuItemsDemo 展示设置菜单项的实际样子

**示例**：

```markdown
## 打开设置

打开设置的流程如下：

```mermaid
graph LR
    A[点击菜单] --> B[选择设置]
    B --> C[打开设置页面]
```

您可以通过顶部菜单栏访问设置：

<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />
```

---

## 📁 文档结构

### 目录组织

```
manuals/
├── index.json              # 文档索引（所有语言共享）
├── WRITING_GUIDE.md        # 本文档
├── zh_CN/                  # 中文简体文档
│   ├── quick-start/
│   ├── core/
│   ├── markdown/
│   ├── latex/
│   ├── ai/
│   ├── agent/
│   ├── knowledge-base/
│   ├── settings/
│   └── charts/
├── en_US/                  # 英文文档
│   └── (相同的目录结构)
└── (其他语言...)
```

### 文件命名规范

- 使用小写字母和连字符：`file-operations.md`
- 文件名应该与 `index.json` 中的 `file` 字段一致
- 每个文档对应一个独立的 `.md` 文件

---

## 📝 文档格式规范

### Markdown格式要求

1. **使用标准Markdown语法**
2. **代码块必须指定语言**：```` ```typescript ````
3. **使用相对路径引用图片**：`![描述](./images/image.png)`
4. **使用标题层级**：一级标题（#）作为文档标题，二级标题（##）作为主要章节

### 文档头部元信息

每个文档开头应该包含元信息注释（可选，用于文档生成工具）：

```markdown
---
title: 文档标题
id: article.id
tags: [标签1, 标签2]
difficulty: 1-3
estimatedTime: 10
---
```

---

## 🔗 文档间链接规范

### 超链接格式

文档内部可以使用特殊格式的链接来跳转到其他文档词条：

```markdown
[[文档ID|显示文本]]

例如：
- [[markdown.basics|Markdown语法教程]]
- [[latex.editor|LaTeX编辑器]]
- [[core.file-operations|文件操作]]
```

### 相关文档链接

每个文档应该在末尾包含"相关文档"章节：

```markdown
## 相关文档

- [[markdown.basics|Markdown语法]]
- [[markdown.features|Markdown编辑器功能]]
- [[core.editor-basics|编辑器基础操作]]
```

---

## 📊 文档内容结构

### 标准文档结构

每个文档应该包含以下部分（根据实际情况调整）：

```markdown
# 文档标题

## 概述

简要介绍本功能/模块的作用和用途。

## 功能特性

列出主要功能点。

## 使用方法

### 子功能1

详细说明如何使用。

### 子功能2

详细说明如何使用。

## 示例

提供实际使用示例。

## 注意事项

列出需要注意的事项。

## 相关文档

- [[其他文档ID|其他文档标题]]
```

---

## 🎯 内容编写要求

### 1. 清晰性

- 使用简洁明了的语言
- 避免过于技术化的术语（除非必要）
- 提供足够的上下文信息

### 2. 完整性

- 覆盖所有主要功能点
- 提供使用示例
- 说明常见问题和解决方案

### 3. 准确性

- 确保所有信息与当前版本一致
- 代码示例必须可以运行
- 截图和说明要与实际界面一致

### 4. 可维护性

- 使用统一的格式和风格
- 保持文档结构一致
- 及时更新过时信息

---

## 🔍 索引和标签

### 文档索引（index.json）

每个文档在 `index.json` 中都有对应的条目：

```json
{
  "id": "article.id",
  "title": {
    "zh_CN": "中文标题",
    "en_US": "English Title"
  },
  "tags": ["标签1", "标签2"],
  "difficulty": 1,
  "estimatedTime": 10,
  "prerequisites": ["prerequisite.article.id"],
  "relatedArticles": ["related.article.id"],
  "file": "category/article.md"
}
```

### 标签使用规范

- **基础**: 适合初学者的内容
- **高级**: 需要一定基础的内容
- **功能名**: 如 "Markdown", "LaTeX", "AI", "Agent"
- **操作类型**: 如 "编辑", "导出", "配置"

---

## 📈 进度跟踪

### 当前状态（2026-02-20 更新）

#### ✅ Demo 模式实现完成

- ✅ **组件注入机制**：实现了在 Markdown 中嵌入真实 Vue 组件的完整流程
  - 占位符预处理：`demo-mode.ts` 将组件标签替换为占位符 div
  - 后渲染注入：Vditor 渲染完成后，将占位符替换为真实组件
  - 样式适配：在 `ManualContent.vue` 中统一处理，组件自适应大小并居中显示
  - 交互阻断：通过事件拦截和 CSS 防止触发业务逻辑
- ✅ **Mermaid 主题适配**：用户手册中的 Mermaid 图表自动适配亮色/暗色主题
- ✅ **标杆文档**：`quick-start/guide.md` 已完善，包含图表和 Demo 组件，可作为编写参考

#### 🚧 文档完善进行中

- 所有文档初稿已完成，但需要按照标杆文档的标准进行完善：
  - 添加 Mermaid/PlantUML 图表（流程、结构、关系图）
  - 嵌入 Demo 组件（文档提到哪个控件就展示哪个组件，使用MenuItemsDemo和ViewMenuItemsDemo只显示相关菜单项）
  - 完善内容结构和功能说明

**当前进度（2026-02-21更新）**：
- ✅ **已完善文档**：64篇（包含图表和Demo组件）
- ✅ **新增组件**：MenuItemsDemo、ViewMenuItemsDemo、SearchReplaceMenu、SectionOptimizer、TitleMenu、PdfPreviewPanel、ConsoleTerminal、MetaInfoPanel
- ✅ **新增文档**：agent/references.md、agent/engine.md
- ✅ **所有文档已按新规范完善完成**

#### 📋 待完成

**严格按照 `USER_MANUAL_INDEX.md` 的结构，需要编写以下文档：**

- [x] 一、快速开始（1篇）
- [x] 二、编辑器（12篇：Markdown 4篇、LaTeX 5篇、纯文本 1篇、通用功能 2篇）
- [x] 三、文件操作（3篇）
- [x] 四、AI功能（11篇：AI对话、AI校对、AI补全、AI助手、Agent工具、Agent框架6篇）
- [x] 五、大纲视图（2篇）
- [x] 六、系统设置（12篇：基础、LLM 3篇、知识库 2篇、主题 2篇、图片 2篇、日志、关于）
- [x] 七、知识库（1篇）
- [x] 八、工作目录（1篇）
- [x] 九、快捷键（2篇）
- [x] 十、视图切换（1篇）
- [x] 十一、多标签页管理（1篇）
- [x] 十二、语言设置（1篇）
- [x] 十三、用户功能（2篇）
- [x] 十四、统计和监控（2篇）
- [x] 十六、段落优化（1篇）
- [x] 十七、PDF预览（1篇）
- [x] 十八、控制台输出（1篇）
- [x] 十九、菜单配置（1篇）
- [x] 二十、调试工具（1篇）
- [x] 二十一、多窗口管理（1篇）
- [x] 二十二、文档格式（1篇）
- [x] 二十三、AI任务队列（1篇）
- [x] 二十四、主页功能（1篇）
- [x] 图表功能（4篇）

### 文档完成度统计

**严格按照 `USER_MANUAL_INDEX.md` 的结构统计：**

| 类别 | 总数 | 已完成 | 进度 |
|------|------|--------|------|
| 一、快速开始 | 1 | 1 | 100% ✅ |
| 二、编辑器 | 12 | 12 | 100% ✅ |
| &nbsp;&nbsp;2.1 Markdown编辑器 | 4 | 4 | 100% ✅ |
| &nbsp;&nbsp;2.2 LaTeX编辑器 | 5 | 5 | 100% ✅ |
| &nbsp;&nbsp;2.3 纯文本编辑器 | 1 | 1 | 100% ✅ |
| &nbsp;&nbsp;2.4 编辑器通用功能 | 2 | 2 | 100% ✅ |
| 三、文件操作 | 3 | 3 | 100% ✅ |
| 四、AI功能 | 11 | 11 | 100% ✅ |
| &nbsp;&nbsp;4.1 AI对话 | 1 | 1 | 100% ✅ |
| &nbsp;&nbsp;4.2 AI校对 | 1 | 1 | 100% ✅ |
| &nbsp;&nbsp;4.3 AI补全 | 1 | 1 | 100% ✅ |
| &nbsp;&nbsp;4.4 AI助手功能 | 1 | 1 | 100% ✅ |
| &nbsp;&nbsp;4.5 Agent工具 | 1 | 1 | 100% ✅ |
| &nbsp;&nbsp;4.6 Agent框架 | 5 | 5 | 100% ✅ |
| 五、大纲视图 | 2 | 2 | 100% ✅ |
| 六、系统设置 | 12 | 12 | 100% ✅ |
| &nbsp;&nbsp;6.1 基础设置 | 1 | 1 | 100% ✅ |
| &nbsp;&nbsp;6.2 LLM设置 | 3 | 3 | 100% ✅ |
| &nbsp;&nbsp;6.3 知识库设置 | 2 | 2 | 100% ✅ |
| &nbsp;&nbsp;6.4 主题设置 | 2 | 2 | 100% ✅ |
| &nbsp;&nbsp;6.5 图片设置 | 2 | 2 | 100% ✅ |
| &nbsp;&nbsp;6.6 日志设置 | 1 | 1 | 100% ✅ |
| &nbsp;&nbsp;6.7 关于 | 1 | 1 | 100% ✅ |
| 七、知识库 | 3 | 3 | 100% ✅ |
| 八、工作目录 | 1 | 1 | 100% ✅ |
| 九、快捷键 | 2 | 2 | 100% ✅ |
| 十、视图切换 | 1 | 1 | 100% ✅ |
| 十一、多标签页管理 | 1 | 1 | 100% ✅ |
| 十二、语言设置 | 1 | 1 | 100% ✅ |
| 十三、用户功能 | 2 | 2 | 100% ✅ |
| 十四、统计和监控 | 2 | 2 | 100% ✅ |
| 十五、段落优化 | 1 | 1 | 100% ✅ |
| 十六、PDF预览 | 1 | 1 | 100% ✅ |
| 十七、控制台输出 | 1 | 1 | 100% ✅ |
| 十八、菜单配置 | 1 | 1 | 100% ✅ |
| 十九、调试工具 | 1 | 1 | 100% ✅ |
| 二十、多窗口管理 | 1 | 1 | 100% ✅ |
| 二十一、文档格式 | 1 | 1 | 100% ✅ |
| 二十二、AI任务队列 | 1 | 1 | 100% ✅ |
| 二十三、主页功能 | 1 | 1 | 100% ✅ |
| 二十四、图表功能 | 4 | 4 | 100% ✅ |
| **总计** | **60+** | **60** | **100%** ✅ |

**已完成文档**（按新规范完善，包含图表和Demo组件）：
- ✅ `quick-start/guide.md` - 快速开始指南
- ✅ `core/file-operations.md` - 文件操作
- ✅ `core/editor-basics.md` - 编辑器基础操作
- ✅ `core/editor-settings.md` - 编辑器设置
- ✅ `core/multi-tab.md` - 多标签页管理
- ✅ `core/multi-window.md` - 多窗口管理
- ✅ `core/export.md` - 导出功能
- ✅ `core/document-metadata.md` - 文档元信息
- ✅ `markdown/editor.md` - Markdown编辑器使用指南
- ✅ `markdown/basics.md` - Markdown语法
- ✅ `markdown/advanced.md` - Markdown高级功能
- ✅ `markdown/features.md` - Markdown编辑器功能
- ✅ `latex/editor.md` - LaTeX编辑器使用指南
- ✅ `latex/basics.md` - LaTeX语法
- ✅ `latex/compilation.md` - LaTeX编译与预览
- ✅ `latex/pdf-preview.md` - PDF预览功能
- ✅ `latex/console.md` - 控制台输出
- ✅ `editor/plain-text.md` - 纯文本编辑器
- ✅ `ai/chat.md` - AI对话功能
- ✅ `ai/proofread.md` - AI校对功能
- ✅ `ai/completion.md` - AI自动补全
- ✅ `ai/assistants.md` - AI助手功能
- ✅ `ai/llm-config.md` - LLM配置
- ✅ `ai/task-queue.md` - AI任务队列
- ✅ `agent/introduction.md` - Agent框架概述
- ✅ `agent/session.md` - Agent会话管理
- ✅ `agent/config.md` - Agent配置管理
- ✅ `agent/tools.md` - 工具集管理
- ✅ `agent/workflow.md` - 工作流管理
- ✅ `outline/basics.md` - 大纲视图功能
- ✅ `outline/ai-features.md` - 大纲AI功能
- ✅ `knowledge-base/management.md` - 知识库管理
- ✅ `knowledge-base/config.md` - 知识库配置
- ✅ `knowledge-base/usage.md` - 知识库使用
- ✅ `settings/basic.md` - 基础设置
- ✅ `settings/theme.md` - 主题配置
- ✅ `settings/theme-custom.md` - 自定义主题管理
- ✅ `settings/llm.md` - LLM配置
- ✅ `settings/llm-management.md` - LLM配置管理
- ✅ `settings/llm-types.md` - LLM类型配置
- ✅ `settings/language.md` - 多语言支持
- ✅ `settings/menu.md` - 菜单配置
- ✅ `settings/image.md` - 图片上传配置
- ✅ `settings/image-upload.md` - 上传服务设置
- ✅ `settings/logging.md` - 日志配置
- ✅ `settings/about.md` - 关于信息
- ✅ `charts/introduction.md` - 图表功能介绍
- ✅ `charts/mermaid.md` - Mermaid图表
- ✅ `charts/plantuml.md` - PlantUML图表
- ✅ `charts/echarts.md` - ECharts图表
- ✅ `statistics/llm.md` - LLM统计
- ✅ `statistics/proofread.md` - 校对工具统计
- ✅ `user/profile.md` - 用户资料
- ✅ `user/feedback.md` - 用户反馈
- ✅ `shortcuts/global.md` - 全局快捷键
- ✅ `shortcuts/editor.md` - 编辑器快捷键
- ✅ `home/features.md` - 主页功能
- ✅ `workspace/management.md` - 工作目录管理
- ✅ `views/types.md` - 视图类型
- ✅ `features/paragraph-optimization.md` - 段落优化功能
- ✅ `formats/supported.md` - 支持的格式
- ✅ `development/debug.md` - 调试工具

**所有文档已完成编写并完善！** ✅

**重要提醒**：
- 所有文档必须严格按照 `USER_MANUAL_INDEX.md` 的结构和内容要求编写
- 不得随意更改或简化文档结构
- 每个文档必须包含索引中列出的所有功能点

---

## 🔄 更新流程

### 编写新文档

1. 在 `index.json` 中添加文档条目
2. 创建对应的 `.md` 文件
3. 按照规范编写内容
4. 添加相关文档链接
5. **更新进度**：文档编写完成后，必须更新 `IMPLEMENTATION_SUMMARY.md` 中的进度统计

### 更新现有文档

1. 修改对应的 `.md` 文件
2. 如果修改了文档结构，更新 `index.json`
3. **更新进度**：如有需要，更新 `IMPLEMENTATION_SUMMARY.md` 中的进度统计

### 多语言支持

- 每个语言版本应该有独立的文件
- 保持不同语言版本的结构一致
- 翻译时注意保持技术术语的准确性

---

## 📚 参考资源

### 内部参考

- `USER_MANUAL_INDEX.md`: 完整的文档索引结构
- `index.json`: 文档索引配置
- 现有文档示例（Markdown和LaTeX相关文档）

### 外部参考

- [Markdown语法指南](https://www.markdownguide.org/)
- [技术文档编写最佳实践](https://developers.google.com/tech-writing)

---

## 💡 编写技巧

### 1. 使用示例

每个功能点都应该有实际的使用示例：

```markdown
### 创建新文档

使用快捷键 `Ctrl+N` 或点击菜单栏的"文件" -> "新建"来创建新文档。

**示例：**

1. 按下 `Ctrl+N`
2. 选择文档格式（Markdown/LaTeX）
3. 开始编辑
```

### 2. 截图和图表

- 使用清晰的截图说明界面操作
- **图表使用**：可以适度使用PlantUML和Mermaid图表辅助说明
  - 使用对应的代码块格式：```` ```plantuml ```` 或 ```` ```mermaid ````
  - 图表要求：
    - 使用正交连接线（orthogonal lines）
    - 保持极简风格：黑白灰色调，Tailwind风格
    - 避免使用过多颜色和装饰
  - 适用场景：流程说明、结构图、关系图等
- 图片放在文档同目录的 `images/` 文件夹中

**图表示例**：

```mermaid
graph LR
    A[新建文档] --> B[选择格式]
    B --> C[开始编辑]
    C --> D[保存文档]
    style A fill:#f3f4f6,stroke:#374151
    style B fill:#f3f4f6,stroke:#374151
    style C fill:#f3f4f6,stroke:#374151
    style D fill:#f3f4f6,stroke:#374151
```

### 3. 代码示例

代码示例必须：

- 可以实际运行
- 包含必要的注释
- 说明预期结果

```markdown
```typescript
// 示例代码
const example = "Hello, World!"
console.log(example)
```
```

### 4. 常见问题

在文档末尾添加"常见问题"章节：

```markdown
## 常见问题

### Q: 如何...？
A: 可以通过...来解决。

### Q: 为什么...？
A: 这是因为...
```

---

## ✅ 检查清单

编写完文档后，请检查：

- [ ] 文档结构符合规范
- [ ] 所有链接格式正确（使用 `[[文档ID|文本]]` 格式）
- [ ] 代码示例可以运行
- [ ] 截图和说明准确
- [ ] 已添加相关文档链接
- [ ] 已在 `index.json` 中注册
- [ ] **已更新 `IMPLEMENTATION_SUMMARY.md` 中的进度统计**

---

## 📞 反馈和问题

如有问题或建议，请：

1. 在文档中添加注释
2. 更新本文档的"注意事项"部分
3. 联系项目维护者

---

**最后更新**: 2026-02-20  
**版本**: 1.2.0  
**维护者**: MetaDoc团队

---

## 📘 相关文档

- **`AGENT_WRITING_GUIDE.md`** - AI Agent 编写提示词（供新的 agent 参考）
- **`IMPLEMENTATION_SUMMARY.md`** - 实现总结和当前状态
- **`USER_MANUAL_INDEX.md`** - 完整的文档索引结构
- **标杆文档**：`zh_CN/quick-start/guide.md` - 快速开始指南（已完善，可作为编写参考）
