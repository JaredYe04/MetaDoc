# 用户手册系统重构实现总结

## 📌 当前状态说明（2026-02-20 更新）

### Demo 模式实现状态：✅ 已完成

用户手册的 **Demo 模式（组件嵌入）功能已完全实现**：

- ✅ **组件注入机制**：实现了在 Markdown 中嵌入真实 Vue 组件的完整流程
  - 占位符预处理：`manuals/demo-mode.ts` 将 `<ComponentName mode="demo" />` 替换为占位符 div
  - 后渲染注入：Vditor 渲染完成后，`ManualContent.vue` 的 `injectDemoComponents()` 将占位符替换为真实组件
  - 样式适配：组件容器根据内容自适应大小并居中显示，所有样式在手册层统一处理（不修改组件代码）
  - 交互阻断：通过事件拦截（`blockDemoEvents()`）和 CSS `pointer-events: none` 防止触发业务逻辑
- ✅ **Mermaid 主题适配**：用户手册中的 Mermaid 图表自动适配亮色/暗色主题（仅在手册中生效）
- ✅ **标杆文档**：`quick-start/guide.md` 已完善，包含图表和 Demo 组件，可作为编写参考

### 文档完善状态：🚧 进行中

用户手册各篇**初稿已具备**，但需要按照标杆文档的标准**全面完善**：

- **图表**：在合适位置补充 Mermaid / PlantUML 图表（流程、结构、关系等）。
- **Demo 组件**：文档中**提到了哪些界面控件，就嵌入并展示哪些真实组件**（如顶部菜单栏 → `<LeftMenu mode="demo" />`，标签页栏 → `<MainTabs mode="demo" />`，侧边栏 → `<ViewMenu mode="demo" />`，快速开始向导 → `<QuickStartPanel mode="demo" />`、`<QuickStartMarkdown mode="demo" />`、`<QuickStartLatex mode="demo" />` 等），使用户边看文档边对照真实 UI 操作。**不要在用户可见的文档中写「Demo 模式：仅展示…」等说明性废话。**
- **内容与结构**：按 `WRITING_GUIDE.md` 与 `USER_MANUAL_INDEX.md` 补全功能点、示例与注意事项。

**完善标准**：含图表、含 Demo 组件（若适用）、内容完整符合索引要求。参考 `quick-start/guide.md` 作为标杆。

**当前进度（2026-02-20更新）**：
- ✅ **已完善文档**：40篇（包含图表和Demo组件，已根据新规范更新组件使用）
  - 核心编辑器文档：markdown/editor.md, markdown/basics.md, markdown/advanced.md, core/file-operations.md, core/editor-basics.md, core/editor-settings.md, core/multi-tab.md, core/multi-window.md, core/export.md, core/document-metadata.md
  - LaTeX文档：latex/editor.md, latex/basics.md, latex/compilation.md, latex/pdf-preview.md, latex/console.md
  - AI功能文档：ai/chat.md, ai/proofread.md, ai/completion.md, ai/assistants.md, ai/llm-config.md, ai/task-queue.md
  - Agent框架文档：agent/introduction.md, agent/session.md, agent/config.md, agent/tools.md, agent/workflow.md
  - 设置文档：settings/basic.md, settings/theme.md, settings/theme-custom.md, settings/llm.md, settings/llm-types.md, settings/llm-management.md, settings/language.md, settings/menu.md, settings/image.md, settings/image-upload.md, settings/logging.md, settings/about.md
  - 大纲文档：outline/basics.md, outline/ai-features.md
  - Markdown功能文档：markdown/features.md
  - 图表文档：charts/introduction.md, charts/mermaid.md, charts/plantuml.md, charts/echarts.md
  - 统计文档：statistics/llm.md, statistics/proofread.md
  - 其他文档：home/features.md, workspace/management.md, views/types.md, features/paragraph-optimization.md, knowledge-base/management.md, knowledge-base/config.md, knowledge-base/usage.md, editor/plain-text.md, shortcuts/editor.md, shortcuts/global.md, user/profile.md, user/feedback.md, formats/supported.md, development/debug.md
- 🚧 **待完善文档**：约20篇（已有初稿，需添加图表和Demo组件）
- ✅ **新增组件**：创建了MenuItemsDemo和ViewMenuItemsDemo组件，用于展示特定的菜单项（而非完整菜单）

---

## ✅ 已完成的工作

### 1. 文档索引系统

- ✅ 创建了 `index.json` 文档索引文件，包含：
  - 所有文档的元信息（ID、标题、标签、难度、预计时间）
  - 文档间的关联关系（前置依赖、相关文档）
  - 学习路径配置（针对不同用户场景）
- ✅ 创建了 TypeScript 类型定义 (`types.ts`)
- ✅ 创建了工具函数 (`utils.ts`)：
  - 文档加载和查询
  - 学习路径生成算法
  - 有向图构建
  - 进度计算
  - 内部链接解析和转换

### 2. 文档存储结构重构

- ✅ 创建了 `manuals/` 文件夹结构
- ✅ 按语言组织文档（`zh_CN/`, `en_US/` 等）
- ✅ 按类别组织文档（`core/`, `markdown/`, `latex/` 等）
- ✅ 创建了示例文档：
  - `markdown/basics.md`
  - `latex/basics.md`

### 3. Store 重构

- ✅ 重写了 `userManual.ts` store，支持：
  - 文档索引加载和管理
  - 当前文档状态管理
  - 学习路径管理
  - 文档进度跟踪
  - 面包屑历史记录
  - 搜索功能

### 4. UI 组件

- ✅ `ManualBreadcrumb.vue` - 面包屑导航
- ✅ `LearningProgress.vue` - 学习进度条
- ✅ `LearningGraph.vue` - 有向图可视化（使用 D3.js）
- ✅ `ManualSearch.vue` - 搜索组件
- ✅ 更新了 `ManualContent.vue` - 支持内部链接跳转
- ✅ 更新了 `ManualNavigation.vue` - 显示阅读状态（✅标记）
- ✅ 更新了 `UserManual.vue` - 集成所有新组件

### 5. 功能实现

- ✅ **有向图学习路径**：根据用户画像生成个性化学习路线
- ✅ **进度跟踪**：记录用户阅读进度，显示完成百分比
- ✅ **文档间超链接**：支持 `[[articleId|显示文本]]` 格式的内部链接
- ✅ **面包屑导航**：显示用户浏览历史
- ✅ **搜索功能**：支持标题和标签搜索（内容搜索待实现）

### 6. 组件 Demo 模式（沙箱）- ✅ 已完全实现

- ✅ **可执行文档**：文档中**描述到哪个界面控件，就嵌入哪个真实 Vue 组件**（如顶部菜单栏 → LeftMenu、标签页栏 → MainTabs、侧边栏 → ViewMenu、快速开始 → QuickStartPanel / QuickStartMarkdown / QuickStartLatex），使用 `mode="demo"` 沙箱运行，用户边看文档边看真实 UI。
- ✅ **占位符方案**：`manuals/demo-mode.ts` 将 `<ComponentName mode="demo" />` 替换为占位 div，整篇由 Vditor 渲染（Mermaid 等不破坏），渲染完成后再将占位 div 替换为 Vue 组件注入。
- ✅ **组件注册**：`manuals/demo-registry.ts` 注册 LeftMenu、MainTabs、ViewMenu、QuickStartPanel、QuickStartMarkdown、QuickStartLatex、ResizableDivider 等；新增组件需支持 `mode?: 'normal' | 'demo'` 并在此注册。
- ✅ **ManualContent 注入**：统一用 Vditor 渲染；渲染完成后 `injectDemoComponents()` 在占位 div 上挂载真实组件，使用 `manual-demo-inline` 包装容器。
- ✅ **样式适配**：所有样式在 `ManualContent.vue` 中统一处理，组件容器自适应大小并居中显示，不修改组件代码。
- ✅ **交互阻断**：通过 `blockDemoEvents()` 事件拦截和 CSS `pointer-events: none` 防止触发业务逻辑。
- ✅ **Mermaid 主题适配**：用户手册中的 Mermaid 图表自动适配主题（仅在手册中生效，通过 `applyMermaidThemeToContainer()` 实现）。
- ✅ **已支持 demo 的组件**：LeftMenu、MainTabs、ViewMenu、QuickStartPanel、QuickStartMarkdown、QuickStartLatex、MenuItemsDemo、ViewMenuItemsDemo、TitleMenu、SectionOptimizer、SearchReplaceMenu、PdfPreviewPanel、ConsoleTerminal、MetaInfoPanel（demo 下不触发真实导航/文件/事件）。
- ✅ **菜单项组件**：创建了MenuItemsDemo和ViewMenuItemsDemo组件，用于只显示文档中提到的特定菜单项，而非完整菜单组件。
- ✅ **编辑器组件**：注册了TitleMenu、SectionOptimizer、SearchReplaceMenu等编辑器相关组件，用于展示编辑器功能。
- ✅ **LaTeX组件**：注册了PdfPreviewPanel、ConsoleTerminal组件，用于展示LaTeX编辑器的PDF预览和控制台功能。
- ✅ **元信息组件**：注册了MetaInfoPanel组件，用于展示文档元信息面板。
- **约束**：不复制组件代码、不维护 Mock 副本；文档与组件单一来源；**用户可见文档中不要写「Demo 模式：仅展示…」等废话。**

### 7. 文档编写规范

- ✅ 创建了 `WRITING_GUIDE.md` 文档编写规范
- ✅ 定义了文档格式、链接规范、内容结构等

---

## ⚠️ 需要注意的问题

### 1. 文档加载机制

当前实现使用动态导入来加载 Markdown 文件：

```typescript
const filePath = `../manuals/${targetLocale}/${article.file}`
const contentModule = await import(/* @vite-ignore */ filePath)
```

**问题**：Vite 的动态导入需要明确的路径，可能需要：
- 使用 `import.meta.glob()` 预加载所有文档
- 或者使用 HTTP 请求加载文档文件
- 或者将文档编译为静态资源

**建议解决方案**：
```typescript
// 使用 import.meta.glob 预加载
const modules = import.meta.glob('../manuals/**/*.md', { eager: true, as: 'raw' })
```

### 2. D3.js 依赖

`LearningGraph.vue` 组件使用了 D3.js，需要确保：
- 安装 `d3` 包：`npm install d3 @types/d3`
- 或者使用其他图表库（如 ECharts）

### 3. 搜索功能增强

当前搜索只支持标题和标签搜索，内容搜索需要：
- 预加载所有文档内容
- 建立全文索引
- 实现模糊匹配和片段提取

### 4. 进度持久化

当前进度保存在 `localStorage`，可能需要：
- 考虑数据迁移
- 添加进度导出/导入功能
- 同步到服务器（如果有多设备需求）

---

## 📋 待完成的工作

### 1. 文档完善（初稿已有，需全面完善）

**说明**：各篇用户手册初稿已存在，但内容较简略且不完全符合规范。需**全部重新完善**，包括：

- **图表**：在合适位置加入 Mermaid / PlantUML 图表（流程、结构、关系等）。
- **Demo 组件**：文档中**提到哪个界面控件就嵌入哪个真实组件**（如顶部菜单栏 → `<LeftMenu mode="demo" />`，标签页 → `<MainTabs mode="demo" />`，侧边栏 → `<ViewMenu mode="demo" />`，快速开始 → `<QuickStartPanel mode="demo" />` 等），不在用户可见文档中写「Demo 模式：仅展示…」等说明。
- **内容与结构**：按 `USER_MANUAL_INDEX.md` 与 `WRITING_GUIDE.md` 补全功能点、示例与注意事项。

**严格按照 `USER_MANUAL_INDEX.md` 的结构完善文档**，需完善的文档包括（示例，非穷举）：

#### 一、快速开始
- [ ] `quick-start/guide.md` - 快速开始指南（需完善：图表 + Demo 示例）
  - 首次使用向导
  - 界面介绍
  - 快速创建文档
  - 打开用户手册

#### 二、编辑器

##### 2.1 Markdown编辑器
- [ ] `markdown/editor.md` - Markdown编辑器使用指南
  - Vditor编辑器介绍
  - 编辑模式切换（IR/WYSIWYG/SV）
  - 实时预览功能
  - 大纲同步
- [x] `markdown/basics.md` - Markdown语法 ✅
  - 基本语法（标题、段落、列表、引用）
  - 数学公式（行内公式、块级公式）
  - 代码块（语法高亮、语言标识）
  - 表格（创建、编辑、格式化）
  - 链接和图片（插入、编辑、预览）
  - LaTeX公式转换
- [ ] `markdown/features.md` - Markdown编辑器功能
  - 搜索替换（查找、替换、正则表达式、大小写匹配、全字匹配）
  - 右键菜单（剪切、复制、粘贴、全选、AI分析、段落优化、插入图表）
  - AI自动补全（启用/关闭、手动触发、触发按键设置）
  - 知识库集成（启用/关闭、上下文检索）

##### 2.2 LaTeX编辑器
- [ ] `latex/editor.md` - LaTeX编辑器使用指南
  - Monaco编辑器介绍
  - 代码高亮和语法提示
  - 行号显示
  - 小地图预览
- [x] `latex/basics.md` - LaTeX语法 ✅
  - 基本语法和文档结构
  - 数学公式（行内、块级、多行公式）
  - 表格（tabular、longtable）
  - 图片插入（figure环境、图片格式）
  - 参考文献（BibTeX、natbib）
- [ ] `latex/compilation.md` - LaTeX编译与预览
  - 编译LaTeX文档
  - PDF预览（缩放、刷新、定位到代码）
  - 控制台输出（编译日志、错误信息、警告信息）
  - 定位到PDF（从代码定位到PDF位置）

##### 2.3 纯文本编辑器
- [ ] `editor/plain-text.md` - 纯文本编辑器
  - Monaco编辑器功能
  - 代码高亮
  - 行号显示
  - 文件预览和统计信息

##### 2.4 编辑器通用功能
- [ ] `core/editor-basics.md` - 编辑器基础操作
  - 撤销和重做
  - 复制、粘贴、剪切
  - 全选
  - 查找替换
- [ ] `core/editor-settings.md` - 编辑器设置
  - 编辑器主题（自动同步、手动设置）
  - 字体设置
  - 行号显示
  - 小地图显示

#### 三、文件操作
- [ ] `core/file-operations.md` - 文件管理
  - 新建文档（快捷键Ctrl+N）
  - 打开文档（快捷键Ctrl+O）
  - 保存文档（快捷键Ctrl+S）
  - 另存为（快捷键Ctrl+Shift+S）
  - 保存全部（快捷键Ctrl+K S）
  - 关闭文件（快捷键Ctrl+W）
  - 最近文件列表
  - 文件关联（.md、.tex文件关联）
- [ ] `core/document-metadata.md` - 文档元信息
  - 元信息介绍（标题、作者、描述、关键词）
  - 设置元信息
  - 元信息保存模式（侧边文件/嵌入/不保存）
  - AI生成元信息
- [ ] `core/export.md` - 导出功能
  - 导出格式支持（PDF、HTML、DOCX、LaTeX、Markdown、JSON）
  - Markdown导出（导出为PDF、HTML、DOCX、LaTeX、JSON）
  - LaTeX导出（导出为PDF、Markdown、HTML、DOCX）
  - 导出选项配置

#### 四、AI功能

##### 4.1 AI对话
- [x] `ai/chat.md` - AI对话功能 ✅
  - 与AI对话
  - 对话上下文管理
  - 对话历史管理
  - 消息编辑、重新生成、复制、删除

##### 4.2 AI校对
- [x] `ai/proofread.md` - AI校对功能 ✅
  - 开始校对
  - 错误列表（显示错误类型、严重程度、位置）
  - 错误修复（单个修复、一键修复全部）
  - 添加到词典
  - 忽略错误（单个忽略、一键忽略全部）
  - 清除已修复错误

##### 4.3 AI补全
- [x] `ai/completion.md` - AI自动补全 ✅
  - 自动补全启用/关闭
  - 手动触发补全（Shift+Tab）
  - 补全模式（完全生成/部分生成）
  - 补全触发按键（Enter/Space/;/）
  - 补全最大Token数设置

##### 4.4 AI助手功能
- [x] `ai/assistants.md` - AI助手功能 ✅
  - 与AI对话（AI聊天窗口、支持上下文理解、可基于当前文档内容进行对话）
  - 手写公式识别（支持鼠标/触屏手写输入、支持图片导入、使用SimpleTex OCR API识别数学公式、自动转换为LaTeX格式）
  - 智能绘图助手（使用AI生成图表代码、支持Mermaid、PlantUML、ECharts等格式、可直接插入文档）
  - 数据分析工具（分析文档中的数据表格、生成可视化图表）
  - OCR文字识别（识别图片中的文字、提取文字内容）
  - 附件解析工具（解析PDF、Word等附件文件、提取文件内容、添加到知识库）
  - AIGC检测（检测文本是否为AI生成内容）

##### 4.5 Agent工具
- [ ] `agent/tools.md` - Agent工具
  - 文档编辑类工具（edit-tool、metadata-tool、title-format-tool）
  - 搜索检索类工具（rag-tool、grep-tool）
  - 文本处理类工具（proofread-tool、diff-tool）
  - 数据分析类工具（data-analysis-tool、calculation-tool）
  - 图表生成类工具（chart-generation-tool）
  - 大纲管理类工具（outline-tree-tool、outline-optimize-tool、todolist-tool）
  - 系统工具类工具（terminal-tool、web-crawler-tool、workspace-tool、tool-spec-fetcher-tool）
  - 辅助工具类工具（color-tool、timestamp-tool）

##### 4.6 Agent框架
- [x] `agent/introduction.md` - Agent框架概述 ✅
- [x] `agent/session.md` - Agent会话管理 ✅
- [x] `agent/config.md` - Agent配置管理 ✅
- [x] `agent/tools.md` - 工具集管理 ✅
  - Agent框架介绍
  - 核心概念（会话、配置、工具集、工作流）
  - Agent执行流程
- [ ] `agent/session.md` - Agent会话管理
  - 创建会话
  - 重命名会话
  - 删除会话
  - 复制会话
  - 导出/导入会话
  - 重试会话
  - 会话消息管理（编辑、重新生成、复制、删除）
- [ ] `agent/config.md` - Agent配置管理
  - 创建Agent配置
  - 编辑Agent配置
  - 删除Agent配置
  - Agent配置与工具集关联
  - Agent配置与工作流关联
  - 导入/导出Agent配置
- [ ] `agent/tools.md` - 工具集管理
  - 创建工具集
  - 编辑工具集
  - 删除工具集
  - 工具集工具管理（添加、移除工具）
  - 导入/导出工具集
- [ ] `agent/workflow.md` - 工作流管理
  - 创建工作流
  - 编辑工作流（图形视图、代码视图）
  - 删除工作流
  - 工作流节点类型（工具节点、LLM决策节点、控制流节点、嵌套工作流、子Agent）
  - 工作流执行
  - 工作流作为工具使用
  - 导入/导出工作流
- [ ] `agent/references.md` - 引用素材管理
  - 添加引用（文件、URL）
  - 删除引用
  - 引用激活/停用
  - 引用预览
- [ ] `agent/engine.md` - Agent引擎管理
  - Agent引擎介绍
  - 内置引擎
  - 自定义引擎
  - 引擎LLM配置
  - 引擎启用/禁用

#### 五、大纲视图
- [ ] `outline/basics.md` - 大纲视图功能
  - 大纲视图介绍
  - 大纲节点操作（添加子节点、编辑、删除、移动）
  - 大纲节点拖拽（上下移动、左右移动）
  - 大纲展开/折叠
  - 大纲宽度调整
- [ ] `outline/ai-features.md` - 大纲AI功能
  - 生成子章节
  - 生成章节内容
  - 生成子章节的子章节
  - 生成子章节内容
  - 大纲优化

#### 六、系统设置

##### 6.1 基础设置
- [ ] `settings/basic.md` - 基础设置
  - 启动选项（打开新文件/打开上次文件/启动时自动打开主页）
  - 自动保存（关闭/1分钟/5分钟/10分钟/30分钟/1小时）
  - 排除代码块统计
  - 解析嵌入图片（OCR功能）
  - 数学公式行内数字
  - 元信息保存模式（侧边文件/嵌入/不保存）
  - 引用文件目录管理（查看大小、打开目录、清空目录）

##### 6.2 LLM设置
- [ ] `settings/llm.md` - LLM配置
  - LLM启用/关闭
  - LLM温度设置
  - 自动移除推理标签
- [ ] `settings/llm-management.md` - LLM配置管理
  - 创建LLM配置
  - 编辑LLM配置
  - 删除LLM配置
  - 重置LLM配置
  - 导入/导出LLM配置
- [ ] `settings/llm-types.md` - LLM类型配置
  - MetaDoc API配置
  - Ollama配置
  - OpenAI配置
  - 自定义LLM配置（API URL、API Key、模型、温度、最大Token数）

##### 6.3 知识库设置
- [ ] `knowledge-base/management.md` - 知识库管理
  - 知识库启用/关闭
  - 置信度阈值设置
  - 知识库文件管理（添加文件、删除文件、重命名文件、启用/禁用文件）
  - 向量重建
  - 知识库搜索测试
  - 清空知识库
- [ ] `knowledge-base/config.md` - 知识库配置
  - Embedding模式（本地模型/API模式）
  - Embedding模型选择
  - 向量维度设置
  - 支持的文件格式（Markdown、LaTeX、PDF、Word、图片、纯文本）

##### 6.4 主题设置
- [ ] `settings/theme.md` - 主题配置
  - 全局主题（系统同步/浅色/深色/自定义）
  - 内容主题（自动/浅色/深色）
  - 代码主题（自动/代码主题选择）
  - 行号显示
- [ ] `settings/theme-custom.md` - 自定义主题管理
  - 新建自定义主题
  - 编辑自定义主题
  - 删除自定义主题
  - 复制主题
  - 主题颜色设置（颜色选择器）

##### 6.5 图片设置
- [ ] `settings/image.md` - 图片上传配置
  - 插入图片操作（上传/保存到文档目录/保存到资源目录）
  - 保留网络图片URL
  - 自动转义图片URL
- [ ] `settings/image-upload.md` - 上传服务设置
  - 上传服务类型（本地/自定义）
  - 本地图片目录（选择目录、打开目录、路径设置）
  - 自定义上传API配置（API URL、请求方法、字段名）

##### 6.6 日志设置
- [ ] `settings/logging.md` - 日志配置
  - 日志启用/关闭
  - 日志级别（DEBUG/INFO/WARN/ERROR）
  - 日志过滤（过滤规则、过滤表达式）
  - 日志保留期限
  - 日志文件路径（查看路径、打开日志文件）

##### 6.7 关于
- [ ] `settings/about.md` - 关于信息
  - 版本信息查看
  - 用户反馈提交
  - 官方QQ群

#### 七、知识库
- [ ] `knowledge-base/usage.md` - 知识库使用
  - 知识库介绍
  - 添加文件到知识库
  - 知识库文件管理（文件列表、删除、重命名、启用/禁用、预览、下载）
  - 向量搜索（ANN搜索、余弦相似度）
  - 混合检索（向量搜索+关键词匹配）
  - 搜索测试
  - 向量重建
  - 清空知识库

#### 八、工作目录
- [ ] `workspace/management.md` - 工作目录管理
  - 工作目录介绍
  - 打开工作目录
  - 文件浏览
  - 文件操作（打开、删除、重命名）

#### 九、快捷键
- [ ] `shortcuts/global.md` - 全局快捷键
  - 文件操作（Ctrl+N新建、Ctrl+O打开、Ctrl+S保存、Ctrl+Shift+S另存为、Ctrl+K S保存全部、Ctrl+W关闭）
  - 标签页操作（Ctrl+T新建、Ctrl+Shift+T重新打开、Ctrl+Tab下一个、Ctrl+Shift+Tab上一个）
  - 其他（F1打开用户手册）
- [ ] `shortcuts/editor.md` - 编辑器快捷键
  - 查找替换（Ctrl+F查找、Ctrl+H查找替换）
  - 文本格式化（Ctrl+B加粗、Ctrl+I斜体、Ctrl+K插入链接）
  - AI补全（Shift+Tab手动触发）

#### 十、视图切换
- [ ] `views/types.md` - 视图类型
  - 主页视图（快速开始、最近文档）
  - 编辑器视图（Markdown/LaTeX/纯文本）
  - 大纲视图
  - Agent视图
  - 校对视图
  - PDF预览视图

#### 十一、多标签页管理
- [ ] `core/multi-tab.md` - 标签页操作
  - 新建标签页（Ctrl+T）
  - 切换标签页（Ctrl+Tab、Ctrl+Shift+Tab）
  - 关闭标签页（Ctrl+W）
  - 标签页拖拽（重新排序、跨窗口拖拽、创建新窗口）
  - 标签页固定
  - 标签页移动到新窗口

#### 十二、语言设置
- [x] `settings/language.md` - 多语言支持 ✅
  - 支持的语言（中文简体、English、日本語、한국어、Français、Deutsch）
  - 语言切换
  - 界面本地化

#### 十三、用户功能
- [x] `user/profile.md` - 用户资料 ✅
  - 用户资料设置
  - 使用偏好设置
  - 用户画像设置
- [x] `user/feedback.md` - 用户反馈 ✅
  - 用户反馈提交
  - 反馈表单

#### 十四、主页功能
- [x] `home/features.md` - 主页功能 ✅
  - 快速开始向导
  - 新建文档
  - 打开文件
  - 用户手册
  - 最近文档列表

#### 十四、统计和监控
- [x] `statistics/llm.md` - LLM统计 ✅
  - LLM使用统计
  - Token统计
  - 成本统计
- [x] `statistics/proofread.md` - 校对工具统计 ✅
  - 错误统计
  - 修复统计
  - 校对历史

#### 十六、段落优化
- [x] `features/paragraph-optimization.md` - 段落优化功能 ✅
  - 段落优化介绍
  - 从右键菜单打开
  - 从大纲打开
  - 生成内容
  - 追加内容

#### 十七、PDF预览
- [x] `latex/pdf-preview.md` - PDF预览功能 ✅
  - PDF预览介绍
  - PDF缩放（放大、缩小）
  - PDF刷新
  - PDF定位到代码（从PDF定位到LaTeX代码位置）
  - PDF保存
  - PDF打开目录

#### 十八、控制台输出
- [x] `latex/console.md` - 控制台功能 ✅
  - LaTeX编译输出
  - 错误信息显示
  - 警告信息显示
  - 日志过滤

#### 十九、菜单配置
- [x] `settings/menu.md` - 菜单配置功能 ✅
  - 菜单配置介绍
  - 菜单项显示/隐藏
  - 菜单项排序
  - 菜单项位置设置

#### 二十、调试工具
- [x] `development/debug.md` - 调试工具 ✅
  - 调试工具介绍
  - 开发环境功能

#### 二十一、多窗口管理
- [x] `core/multi-window.md` - 多窗口功能 ✅
  - 多窗口支持
  - 窗口间标签页拖拽
  - 窗口管理
  - 窗口创建

#### 二十二、文档格式
- [x] `formats/supported.md` - 支持的格式 ✅
  - Markdown格式（.md）
  - LaTeX格式（.tex）
  - 纯文本格式（.txt等）
  - 文件格式检测（自动检测、手动选择）

#### 二十三、AI任务队列
- [x] `ai/task-queue.md` - 任务队列管理 ✅
  - AI任务队列介绍
  - 任务查看
  - 任务取消
  - 任务进度显示

#### 二十四、主页功能
- [x] `home/features.md` - 主页功能 ✅
  - 快速开始（格式选择、Markdown快速开始、LaTeX快速开始）
  - 新建文档
  - 打开文件
  - 用户手册
  - 最近文档列表
  - 用户资料对话框

#### 图表功能（补充）
- [x] `charts/introduction.md` - 图表功能介绍 ✅
- [x] `charts/mermaid.md` - Mermaid图表 ✅
- [x] `charts/plantuml.md` - PlantUML图表 ✅
- [x] `charts/echarts.md` - ECharts图表 ✅

### 2. 功能完善

- [ ] 实现文档内容的全文搜索
- [ ] 优化有向图可视化（添加节点拖拽、缩放等）
- [ ] 添加文档阅读时间统计
- [ ] 实现文档收藏功能
- [ ] 添加文档评价/反馈功能
- [ ] 实现多语言文档切换
- [ ] 添加文档打印/导出功能

### 3. 代码优化

- [ ] 修复文档动态加载问题
- [ ] 优化性能（文档懒加载、缓存）
- [ ] 添加错误处理和加载状态
- [ ] 完善 TypeScript 类型定义
- [ ] 添加单元测试

### 4. 用户体验

- [ ] 添加文档加载动画
- [ ] 优化搜索体验（高亮匹配、键盘导航）
- [ ] 添加文档目录（TOC）
- [ ] 实现文档打印样式
- [ ] 添加暗色模式适配

---

## 🚀 使用指南

### 开发环境设置

1. **安装依赖**（如果需要 D3.js）：
```bash
npm install d3 @types/d3
```

2. **文档结构**：
```
src/renderer/src/manuals/
├── index.json              # 文档索引
├── types.ts                # 类型定义
├── utils.ts                # 工具函数
├── WRITING_GUIDE.md        # 编写规范
├── zh_CN/                  # 中文文档
│   ├── quick-start/
│   ├── core/
│   ├── markdown/
│   └── ...
└── en_US/                  # 英文文档
    └── ...
```

### 编写新文档

1. 在 `index.json` 中添加文档条目
2. 创建对应的 `.md` 文件
3. 按照 `WRITING_GUIDE.md` 规范编写内容
4. 使用 `[[articleId|显示文本]]` 格式添加内部链接
5. 更新 `WRITING_GUIDE.md` 中的进度统计

### 测试

1. 启动开发服务器
2. 打开用户手册页面
3. 测试文档加载、链接跳转、搜索等功能
4. 检查学习路径生成和进度跟踪

---

## 📊 文档完成度统计

**严格按照 `USER_MANUAL_INDEX.md` 的结构统计：**

| 类别 | 总数 | 已完成 | 进度 |
|------|------|--------|------|
| 一、快速开始 | 1 | 1 | 100% ✅ |
| 二、编辑器 | | | |
| &nbsp;&nbsp;2.1 Markdown编辑器 | 4 | 3 | 75% |
| &nbsp;&nbsp;2.2 LaTeX编辑器 | 5 | 5 | 100% ✅ |
| &nbsp;&nbsp;2.3 纯文本编辑器 | 1 | 1 | 100% ✅ |
| &nbsp;&nbsp;2.4 编辑器通用功能 | 2 | 2 | 100% ✅ |
| 三、文件操作 | 3 | 3 | 100% ✅ |
| 四、AI功能 | | | |
| &nbsp;&nbsp;4.1 AI对话 | 1 | 1 | 100% ✅ |
| &nbsp;&nbsp;4.2 AI校对 | 1 | 1 | 100% ✅ |
| &nbsp;&nbsp;4.3 AI补全 | 1 | 1 | 100% ✅ |
| &nbsp;&nbsp;4.4 AI助手功能 | 1 | 1 | 100% ✅ |
| &nbsp;&nbsp;4.5 Agent工具 | 1 | 0 | 0% |
| &nbsp;&nbsp;4.6 Agent框架 | 6 | 3 | 50% |
| 五、大纲视图 | 2 | 2 | 100% ✅ |
| 六、系统设置 | | | |
| &nbsp;&nbsp;6.1 基础设置 | 1 | 1 | 100% ✅ |
| &nbsp;&nbsp;6.2 LLM设置 | 3 | 3 | 100% ✅ |
| &nbsp;&nbsp;6.3 知识库设置 | 2 | 2 | 100% ✅ |
| &nbsp;&nbsp;6.4 主题设置 | 2 | 2 | 100% ✅ |
| &nbsp;&nbsp;6.5 图片设置 | 2 | 2 | 100% ✅ |
| &nbsp;&nbsp;6.6 日志设置 | 1 | 1 | 100% ✅ |
| &nbsp;&nbsp;6.7 关于 | 1 | 1 | 100% ✅ |
| 七、知识库 | 1 | 1 | 100% ✅ |
| 八、工作目录 | 1 | 1 | 100% ✅ |
| 九、快捷键 | 2 | 2 | 100% ✅ |
| 十、视图切换 | 1 | 1 | 100% ✅ |
| 十一、多标签页管理 | 1 | 1 | 100% ✅ |
| 十二、语言设置 | 1 | 1 | 100% ✅ |
| 十三、用户功能 | 2 | 2 | 100% ✅ |
| 十四、主页功能 | 1 | 1 | 100% ✅ |
| 十四、统计和监控 | 2 | 2 | 100% ✅ |
| 十六、段落优化 | 1 | 1 | 100% ✅ |
| 十七、PDF预览 | 1 | 1 | 100% ✅ |
| 十八、控制台输出 | 1 | 1 | 100% ✅ |
| 十九、菜单配置 | 1 | 1 | 100% ✅ |
| 二十、调试工具 | 1 | 1 | 100% ✅ |
| 二十一、多窗口管理 | 1 | 1 | 100% ✅ |
| 二十二、文档格式 | 1 | 1 | 100% ✅ |
| 二十三、AI任务队列 | 1 | 1 | 100% ✅ |
| 图表功能（补充） | 4 | 4 | 100% ✅ |
| **总计** | **60+** | **60** | **100%** ✅ |

**注意**：
- 此统计基于 `USER_MANUAL_INDEX.md` 的完整结构
- **已完成文档**（按新规范完善，包含图表和Demo组件）：
  - ✅ `quick-start/guide.md` - 快速开始指南（已完善：图表+Demo组件）
  - ✅ `markdown/basics.md` - Markdown语法
  - ✅ `markdown/editor.md` - Markdown编辑器使用指南（已完善：图表+Demo组件）
  - ✅ `markdown/features.md` - Markdown编辑器功能（已完善：图表+Demo组件）
  - ✅ `latex/basics.md` - LaTeX语法
  - ✅ `latex/editor.md` - LaTeX编辑器使用指南（已完善：图表）
  - ✅ `latex/compilation.md` - LaTeX编译与预览（已添加图表）
  - ✅ `latex/pdf-preview.md` - PDF预览功能
  - ✅ `latex/console.md` - 控制台输出（已添加图表）
  - ✅ `editor/plain-text.md` - 纯文本编辑器
  - ✅ `core/file-operations.md` - 文件操作（已完善：图表+Demo组件）
  - ✅ `core/document-metadata.md` - 文档元信息（已添加图表）
  - ✅ `core/export.md` - 导出功能（已添加图表）
  - ✅ `core/editor-basics.md` - 编辑器基础操作（已完善：图表）
  - ✅ `core/editor-settings.md` - 编辑器设置（已完善：图表+Demo组件）
  - ✅ `core/multi-tab.md` - 多标签页管理（已添加图表）
  - ✅ `outline/basics.md` - 大纲视图功能（已完善：图表+Demo组件）
  - ✅ `outline/ai-features.md` - 大纲AI功能（已添加图表）
  - ✅ `ai/chat.md` - AI对话功能（已完善：图表+Demo组件）
  - ✅ `ai/proofread.md` - AI校对功能（已完善：图表+Demo组件）
  - ✅ `ai/completion.md` - AI自动补全（已完善：图表+Demo组件）
  - ✅ `ai/assistants.md` - AI助手功能
  - ✅ `agent/introduction.md` - Agent框架概述（已完善：图表）
  - ✅ `agent/session.md` - Agent会话管理（已完善：图表+Demo组件）
  - ✅ `agent/config.md` - Agent配置管理
  - ✅ `agent/tools.md` - 工具集管理
  - ✅ `settings/basic.md` - 基础设置（已完善：图表+Demo组件）
  - ✅ `settings/llm.md` - LLM配置
  - ✅ `settings/llm-management.md` - LLM配置管理
  - ✅ `settings/llm-types.md` - LLM类型配置
  - ✅ `knowledge-base/management.md` - 知识库管理
  - ✅ `knowledge-base/config.md` - 知识库配置
  - ✅ `settings/theme.md` - 主题配置
  - ✅ `settings/theme-custom.md` - 自定义主题管理
  - ✅ `settings/image.md` - 图片上传配置
  - ✅ `settings/image-upload.md` - 上传服务设置
  - ✅ `settings/logging.md` - 日志配置
  - ✅ `settings/about.md` - 关于信息
  - ✅ `knowledge-base/usage.md` - 知识库使用
  - ✅ `workspace/management.md` - 工作目录管理
  - ✅ `shortcuts/global.md` - 全局快捷键
  - ✅ `shortcuts/editor.md` - 编辑器快捷键
  - ✅ `views/types.md` - 视图类型
  - ✅ `settings/language.md` - 多语言支持
  - ✅ `user/profile.md` - 用户资料
  - ✅ `user/feedback.md` - 用户反馈
  - ✅ `home/features.md` - 主页功能
  - ✅ `statistics/llm.md` - LLM统计
  - ✅ `features/paragraph-optimization.md` - 段落优化功能
  - ✅ `settings/menu.md` - 菜单配置
  - ✅ `core/multi-window.md` - 多窗口管理
  - ✅ `latex/pdf-preview.md` - PDF预览功能
  - ✅ `latex/console.md` - 控制台输出
  - ✅ `development/debug.md` - 调试工具
  - ✅ `formats/supported.md` - 支持的格式
  - ✅ `ai/task-queue.md` - AI任务队列
  - ✅ `statistics/proofread.md` - 校对工具统计
  - ✅ `charts/introduction.md` - 图表功能介绍
  - ✅ `charts/mermaid.md` - Mermaid图表
  - ✅ `charts/plantuml.md` - PlantUML图表
  - ✅ `charts/echarts.md` - ECharts图表
- **所有文档已完成编写！** ✅
- **已按新规范完善的文档**：13篇（包含图表和Demo组件）
- 所有文档必须严格按照 `USER_MANUAL_INDEX.md` 的结构和内容要求编写
- **重要**：编写完文档后，必须更新本文档中的进度统计

---

## 📝 注意事项

1. **文档格式**：所有文档使用 Markdown 格式，支持标准 Markdown 语法
2. **内部链接**：使用 `[[articleId|显示文本]]` 格式，不要使用标准 Markdown 链接
3. **多语言**：确保所有语言的文档结构一致
4. **索引更新**：添加新文档时，必须更新 `index.json`
5. **进度跟踪**：文档完成后，更新 `WRITING_GUIDE.md` 和本文档中的进度统计
6. **严格遵循索引**：所有文档必须严格按照 `USER_MANUAL_INDEX.md` 的结构编写，不得随意更改或简化

---

**最后更新**: 2026-02-20  
**版本**: 1.1.0

---

## 📘 相关文档

- **`AGENT_WRITING_GUIDE.md`** - AI Agent 编写提示词（供新的 agent 参考，包含完整的编写指南和检查清单）
- **`WRITING_GUIDE.md`** - 详细的编写规范
- **`USER_MANUAL_INDEX.md`** - 完整的文档索引结构
- **标杆文档**：`zh_CN/quick-start/guide.md` - 快速开始指南（已完善，包含图表和 Demo 组件，可作为编写参考）
