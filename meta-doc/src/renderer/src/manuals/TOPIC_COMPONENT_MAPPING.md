# 文档主题与 Demo 组件映射指南

# Documentation Topic-to-Component Mapping Guide

> **Purpose**: Guide for matching documentation topics with appropriate demo components  
> **Scope**: 48+ demo-capable Vue components across 69 documentation files  
> **Version**: 1.0

---

## 1. 核心原则 (Core Principles)

### 1.1 正确匹配标准

| 文档类型           | 应使用                                    | 不应使用            | 原因                     |
| ------------------ | ----------------------------------------- | ------------------- | ------------------------ |
| **统计文档**       | `*StatisticsView` / `*StatisticsContent`  | `Setting*Section`   | 统计显示 vs 设置面板     |
| **设置文档**       | `Setting*Section`                         | 主视图组件          | 配置界面 vs 功能界面     |
| **AI功能文档**     | `AIChat` / `ProofreadView` / `AgentView`  | `SettingLlmSection` | AI交互 vs 配置面板       |
| **快捷操作文档**   | `MenuItemsDemo` / `MainTabs` / 快捷键表格 | 功能视图            | 操作演示 vs 功能展示     |
| **工具/Agent文档** | `*Display` 组件                           | 完整视图            | 工具结果展示 vs 完整界面 |

### 1.2 黄金法则

```
功能文档 → 展示功能如何工作的组件
配置文档 → 展示配置界面的组件
统计文档 → 展示数据统计的组件
快捷文档 → 展示操作方式的组件
```

---

## 2. 主题到组件映射表 (Topic-to-Component Mapping)

### 2.1 Settings 主题 (配置主题)

| 文档                         | 推荐组件               | 禁止组件            | 替代方案            |
| ---------------------------- | ---------------------- | ------------------- | ------------------- |
| `settings/theme.md`          | `SettingThemeSection`  | `SettingLlmSection` | -                   |
| `settings/llm.md`            | `SettingLlmSection`    | `LlmStatisticsView` | -                   |
| `settings/basic.md`          | `SettingBasicSection`  | -                   | -                   |
| `settings/about.md`          | `SettingAboutSection`  | -                   | -                   |
| `settings/image.md`          | `SettingImageSection`  | -                   | -                   |
| `settings/logging.md`        | `SettingLoggerSection` | -                   | -                   |
| `settings/debug.md`          | `SettingDebugSection`  | -                   | `ConsoleTerminal`   |
| `settings/language.md`       | `SettingBasicSection`  | -                   | -                   |
| `settings/menu.md`           | `MenuItemsDemo`        | -                   | `ViewMenuItemsDemo` |
| `settings/llm-management.md` | `SettingLlmSection`    | -                   | -                   |
| `settings/llm-types.md`      | `SettingLlmSection`    | -                   | -                   |
| `settings/theme-custom.md`   | `SettingThemeSection`  | -                   | -                   |
| `settings/image-upload.md`   | `SettingImageSection`  | -                   | -                   |

**导航辅助组件**:

- `MenuItemsDemo` - 顶部菜单导航演示
- `ViewMenuItemsDemo` - 侧边栏视图切换演示

### 2.2 Statistics 主题 (统计主题)

| 文档                      | 推荐组件                   | 禁止组件               | 替代方案               |
| ------------------------- | -------------------------- | ---------------------- | ---------------------- |
| `statistics/llm.md`       | `LlmStatisticsView`        | `SettingLlmSection` ❌ | `LlmStatisticsContent` |
| `statistics/proofread.md` | `ProofreadView` (统计模式) | -                      | -                      |

**关键区分**:

- ❌ **WRONG**: `statistics/llm.md` 使用 `SettingLlmSection` (这是配置界面)
- ✅ **RIGHT**: `statistics/llm.md` 使用 `LlmStatisticsView` (这是统计显示)

### 2.3 AI Features 主题 (AI功能主题)

| 文档               | 推荐组件                  | 禁止组件               | 替代方案    |
| ------------------ | ------------------------- | ---------------------- | ----------- |
| `ai/chat.md`       | `AIChat`                  | `SettingLlmSection` ❌ | -           |
| `ai/proofread.md`  | `ProofreadView`           | -                      | -           |
| `ai/completion.md` | `CompletionSettingsPanel` | -                      | `AIChat`    |
| `ai/task-queue.md` | `AITaskQueue`             | -                      | `AgentView` |
| `ai/llm-config.md` | `SettingLlmSection`       | -                      | -           |
| `ai/assistants.md` | `AIChat`                  | -                      | `AgentView` |

**关键区分**:

- ❌ **WRONG**: `ai/chat.md` 使用 `SettingLlmSection` (配置 ≠ 对话界面)
- ✅ **RIGHT**: `ai/chat.md` 使用 `AIChat` (实际对话界面)

### 2.4 Core Features 主题 (核心功能主题)

| 文档                        | 推荐组件                         | 禁止组件 | 替代方案 |
| --------------------------- | -------------------------------- | -------- | -------- |
| `core/multi-tab.md`         | `MainTabs`                       | -        | -        |
| `core/multi-window.md`      | `MainTabs` + 说明                | -        | -        |
| `core/export.md`            | `ExportOptionsDialog`            | -        | -        |
| `core/file-operations.md`   | `MenuItemsDemo`                  | -        | -        |
| `core/editor-basics.md`     | `LaTeXEditor` / `MarkdownEditor` | -        | -        |
| `core/editor-settings.md`   | `SettingBasicSection`            | -        | -        |
| `core/document-metadata.md` | `MetaInfoPanel`                  | -        | -        |

### 2.5 Views 主题 (视图主题)

| 文档                     | 推荐组件                       | 禁止组件 | 替代方案 |
| ------------------------ | ------------------------------ | -------- | -------- |
| `views/types.md`         | 多个视图组件组合               | -        | -        |
| `outline/basics.md`      | `Outline`                      | -        | -        |
| `outline/ai-features.md` | `Outline` + `OutlineAiToolbar` | -        | -        |

**推荐组合**:

```markdown
<LaTeXEditor mode="demo" /> <!-- 编辑器 -->
<Outline mode="demo" /> <!-- 大纲 -->
<AgentView mode="demo" /> <!-- Agent -->
<ProofreadView mode="demo" /> <!-- 校对 -->
<PdfPreviewPanel mode="demo" /> <!-- PDF预览 -->
```

### 2.6 Shortcuts 主题 (快捷键主题)

| 文档                  | 推荐组件                     | 禁止组件 | 替代方案   |
| --------------------- | ---------------------------- | -------- | ---------- |
| `shortcuts/global.md` | `MenuItemsDemo` + `MainTabs` | 完整视图 | 快捷键表格 |
| `shortcuts/editor.md` | 快捷键表格                   | -        | -          |

**关键原则**:

- 快捷键文档应展示**操作方式**，而非**功能结果**
- 使用 `MenuItemsDemo` 展示菜单操作
- 使用 `MainTabs` 展示标签页操作
- 使用 Markdown 表格展示快捷键列表

### 2.7 Agent 主题 (智能体主题)

| 文档                    | 推荐组件                                | 禁止组件 | 替代方案    |
| ----------------------- | --------------------------------------- | -------- | ----------- |
| `agent/introduction.md` | `AgentView`                             | -        | -           |
| `agent/config.md`       | `AgentView` + `AgentSessionManager`     | -        | -           |
| `agent/session.md`      | `AgentSessionManager`                   | -        | `AgentView` |
| `agent/tools.md`        | `*Display` 组件                         | -        | -           |
| `agent/engine.md`       | `AgentView`                             | -        | -           |
| `agent/references.md`   | `ReferenceManager` / `ReferenceDisplay` | -        | -           |

**Agent 工具展示组件**:

```
ChartGenerationDisplay    - 图表生成展示
DiffDisplay               - 差异对比展示
DataAnalysisDisplay       - 数据分析展示
OutlineTreeDisplay        - 大纲树展示
RAGToolDisplay            - RAG工具展示
WebCrawlerDisplay         - 网页抓取展示
GrepDisplay               - 文本搜索展示
AutoTestResultDisplay     - 自动测试结果
ProofreadDisplay          - 校对结果展示
```

### 2.8 Knowledge Base 主题 (知识库主题)

| 文档                           | 推荐组件                      | 禁止组件 | 替代方案         |
| ------------------------------ | ----------------------------- | -------- | ---------------- |
| `knowledge-base/config.md`     | `SettingKnowledgeBaseSection` | -        | -                |
| `knowledge-base/management.md` | `KnowledgeBase`               | -        | -                |
| `knowledge-base/usage.md`      | `KnowledgeBase`               | -        | `RAGToolDisplay` |

### 2.9 LaTeX 主题

| 文档                   | 推荐组件                           | 禁止组件 | 替代方案 |
| ---------------------- | ---------------------------------- | -------- | -------- |
| `latex/editor.md`      | `LaTeXEditor` / `LaTeXEditorDemo`  | -        | -        |
| `latex/basics.md`      | `LaTeXEditor`                      | -        | -        |
| `latex/compilation.md` | `LaTeXCompilerPanel`               | -        | -        |
| `latex/console.md`     | `LaTeXConsole` / `ConsoleTerminal` | -        | -        |
| `latex/pdf-preview.md` | `PdfPreviewPanel`                  | -        | -        |

### 2.10 Charts 主题 (图表主题)

| 文档                     | 推荐组件                 | 禁止组件 | 替代方案 |
| ------------------------ | ------------------------ | -------- | -------- |
| `charts/introduction.md` | `ChartGenerationDisplay` | -        | -        |
| `charts/echarts.md`      | `ChartGenerationDisplay` | -        | -        |
| `charts/mermaid.md`      | `GraphWindow`            | -        | -        |
| `charts/plantuml.md`     | `GraphWindow`            | -        | -        |

### 2.11 User 主题 (用户主题)

| 文档               | 推荐组件           | 禁止组件 | 替代方案          |
| ------------------ | ------------------ | -------- | ----------------- |
| `user/profile.md`  | `UserProfileView`  | -        | `UserProfileCard` |
| `user/feedback.md` | `UserFeedbackView` | -        | -                 |

### 2.12 Workspace 主题 (工作区主题)

| 文档                      | 推荐组件                              | 禁止组件 | 替代方案 |
| ------------------------- | ------------------------------------- | -------- | -------- |
| `workspace/management.md` | `WorkspaceExplorer` / `WorkspaceTabs` | -        | -        |

### 2.13 Features 主题 (功能主题)

| 文档                                 | 推荐组件           | 禁止组件 | 替代方案 |
| ------------------------------------ | ------------------ | -------- | -------- |
| `features/paragraph-optimization.md` | `SectionOptimizer` | -        | -        |

---

## 3. 常见错误匹配 (Common Mismatches)

### 3.1 错误匹配清单

| 错误示例                                  | 问题                  | 正确方案                   |
| ----------------------------------------- | --------------------- | -------------------------- |
| `statistics/llm.md` → `SettingLlmSection` | 统计显示 vs 配置界面  | 使用 `LlmStatisticsView`   |
| `ai/chat.md` → `SettingLlmSection`        | 对话功能 vs LLM配置   | 使用 `AIChat`              |
| `settings/theme.md` → `MainTabs`          | 设置主题 vs 标签页    | 使用 `SettingThemeSection` |
| `shortcuts/global.md` → `AIChat`          | 快捷操作 vs 功能展示  | 使用 `MenuItemsDemo`       |
| `outline/basics.md` → `AgentView`         | 大纲功能 vs Agent功能 | 使用 `Outline`             |

### 3.2 混淆组件对比

#### SettingLlmSection vs LlmStatisticsView

| 特性         | SettingLlmSection                     | LlmStatisticsView         |
| ------------ | ------------------------------------- | ------------------------- |
| **用途**     | 配置LLM参数                           | 查看使用统计              |
| **包含**     | API配置、模型选择、温度设置           | Token使用、请求次数、成本 |
| **适用文档** | `settings/llm.md`, `ai/llm-config.md` | `statistics/llm.md`       |

#### AIChat vs AgentView

| 特性         | AIChat               | AgentView                |
| ------------ | -------------------- | ------------------------ |
| **用途**     | 普通AI对话           | Agent框架交互            |
| **包含**     | 会话列表、消息、引用 | 工作流、工具集、会话管理 |
| **适用文档** | `ai/chat.md`         | `agent/*.md`             |

#### MenuItemsDemo vs ViewMenuItemsDemo

| 特性         | MenuItemsDemo        | ViewMenuItemsDemo        |
| ------------ | -------------------- | ------------------------ |
| **用途**     | 顶部菜单栏           | 侧边栏视图菜单           |
| **包含**     | 文件、编辑、AI等菜单 | 主页、编辑器、大纲等视图 |
| **适用场景** | 文件操作、全局功能   | 视图切换、导航           |

---

## 4. 导航辅助组件使用指南 (Navigation Helpers)

### 4.1 MenuItemsDemo

**用途**: 演示顶部菜单栏的操作

**适用文档**:

- 文件操作相关: `core/file-operations.md`
- 设置相关: `settings/*.md`
- 全局快捷键: `shortcuts/global.md`

**示例**:

```markdown
<MenuItemsDemo mode="demo" :items='[{"id": "file", "items": ["new", "open", "save"]}]' />
<MenuItemsDemo mode="demo" :items='[{"id": "settings"}]' />
```

### 4.2 ViewMenuItemsDemo

**用途**: 演示侧边栏视图切换

**适用文档**:

- 视图相关: `views/types.md`
- 功能导航: `outline/basics.md`
- 主界面介绍: `home/features.md`

**示例**:

```markdown
<ViewMenuItemsDemo mode="demo" :items='["home", "editor", "outline", "agent"]' />
```

### 4.3 MainTabs

**用途**: 演示标签页功能

**适用文档**:

- 多标签页: `core/multi-tab.md`
- 快捷操作: `shortcuts/global.md`

**示例**:

```markdown
<MainTabs mode="demo" />
```

---

## 5. 组件分类速查表 (Component Quick Reference)

### 5.1 Views (主视图组件)

| 组件                  | 用途       | 典型文档                    |
| --------------------- | ---------- | --------------------------- |
| `AIChat`              | AI对话界面 | `ai/chat.md`                |
| `AgentView`           | Agent框架  | `agent/*.md`                |
| `ProofreadView`       | AI校对     | `ai/proofread.md`           |
| `KnowledgeBase`       | 知识库     | `knowledge-base/*.md`       |
| `Outline`             | 大纲视图   | `outline/*.md`              |
| `LaTeXEditor`         | LaTeX编辑  | `latex/*.md`                |
| `OcrWindow`           | OCR识别    | `features/ocr.md`           |
| `GraphWindow`         | 图表绘制   | `charts/mermaid.md`         |
| `DataAnalysisWindow`  | 数据分析   | `features/data-analysis.md` |
| `FormulaRecognition`  | 公式识别   | `features/formula.md`       |
| `AigcDetectionWindow` | AIGC检测   | `features/aigc.md`          |
| `UserProfileView`     | 用户资料   | `user/profile.md`           |
| `UserFeedbackView`    | 用户反馈   | `user/feedback.md`          |
| `LlmStatisticsView`   | LLM统计    | `statistics/llm.md`         |

### 5.2 Settings (设置面板)

| 组件                          | 用途       | 典型文档                   |
| ----------------------------- | ---------- | -------------------------- |
| `SettingThemeSection`         | 主题设置   | `settings/theme.md`        |
| `SettingLlmSection`           | LLM配置    | `settings/llm.md`          |
| `SettingBasicSection`         | 基础设置   | `settings/basic.md`        |
| `SettingAboutSection`         | 关于页面   | `settings/about.md`        |
| `SettingImageSection`         | 图片设置   | `settings/image.md`        |
| `SettingDebugSection`         | 调试工具   | `settings/debug.md`        |
| `SettingLoggerSection`        | 日志设置   | `settings/logging.md`      |
| `SettingKnowledgeBaseSection` | 知识库设置 | `knowledge-base/config.md` |

### 5.3 UI Components (界面组件)

| 组件                | 用途     | 典型文档                             |
| ------------------- | -------- | ------------------------------------ |
| `MainTabs`          | 标签页栏 | `core/multi-tab.md`                  |
| `MenuItemsDemo`     | 顶部菜单 | `shortcuts/global.md`                |
| `ViewMenuItemsDemo` | 视图菜单 | `views/types.md`                     |
| `LeftMenu`          | 左侧菜单 | `views/types.md`                     |
| `TitleMenu`         | 标题菜单 | `outline/basics.md`                  |
| `SectionOptimizer`  | 段落优化 | `features/paragraph-optimization.md` |
| `SearchReplaceMenu` | 查找替换 | `editor/search-replace.md`           |

### 5.4 LaTeX Components

| 组件                 | 用途        | 典型文档               |
| -------------------- | ----------- | ---------------------- |
| `LaTeXEditor`        | LaTeX编辑器 | `latex/editor.md`      |
| `LaTeXEditorDemo`    | 演示编辑器  | `latex/basics.md`      |
| `LaTeXCompilerPanel` | 编译面板    | `latex/compilation.md` |
| `LaTeXConsole`       | 编译控制台  | `latex/console.md`     |
| `PdfPreviewPanel`    | PDF预览     | `latex/pdf-preview.md` |

### 5.5 Agent Tool Displays (Agent工具展示)

| 组件                     | 用途     | 典型文档                    |
| ------------------------ | -------- | --------------------------- |
| `ChartGenerationDisplay` | 图表生成 | `charts/*.md`               |
| `DataAnalysisDisplay`    | 数据分析 | `features/data-analysis.md` |
| `DiffDisplay`            | 差异对比 | `agent/tools.md`            |
| `OutlineTreeDisplay`     | 大纲树   | `outline/basics.md`         |
| `RAGToolDisplay`         | RAG检索  | `knowledge-base/usage.md`   |
| `WebCrawlerDisplay`      | 网页抓取 | `agent/tools.md`            |
| `GrepDisplay`            | 文本搜索 | `agent/tools.md`            |
| `AutoTestResultDisplay`  | 测试结果 | `agent/tools.md`            |
| `ProofreadDisplay`       | 校对结果 | `ai/proofread.md`           |

### 5.6 Agent Management (Agent管理)

| 组件                      | 用途        | 典型文档                |
| ------------------------- | ----------- | ----------------------- |
| `AgentView`               | Agent主界面 | `agent/introduction.md` |
| `AgentSessionManager`     | 会话管理    | `agent/session.md`      |
| `ReferenceManager`        | 引用管理    | `agent/references.md`   |
| `ReferenceDisplay`        | 引用展示    | `agent/references.md`   |
| `CompletionSettingsPanel` | 补全设置    | `ai/completion.md`      |

### 5.7 Dialogs & Panels (对话框和面板)

| 组件                  | 用途       | 典型文档                    |
| --------------------- | ---------- | --------------------------- |
| `PdfPreviewPanel`     | PDF预览    | `latex/pdf-preview.md`      |
| `ConsoleTerminal`     | 控制台     | `settings/debug.md`         |
| `MetaInfoPanel`       | 元信息     | `core/document-metadata.md` |
| `ExportOptionsDialog` | 导出选项   | `core/export.md`            |
| `DialogDemo`          | 对话框演示 | 对话框相关文档              |

---

## 6. 文档审核检查清单 (Documentation Review Checklist)

### 6.1 审核步骤

1. **识别文档类型**: 统计/设置/AI功能/核心功能/视图/快捷键/Agent
2. **选择正确组件**: 参考上方的映射表
3. **避免错误匹配**: 检查"禁止组件"列
4. **验证组件注册**: 确保组件在 `demo-registry-components.ts` 中注册
5. **检查 demo 数量**: 确保满足 `max(ceil((H1+H2+H3)/3), 2)` 要求

### 6.2 常见问题检查

- [ ] 统计文档是否使用了 `Setting*Section`? ❌
- [ ] AI功能文档是否只使用了 `SettingLlmSection`? ❌ (应使用 `AIChat` 等)
- [ ] 快捷键文档是否使用了完整视图组件? ❌ (应使用 `MenuItemsDemo` 等)
- [ ] 设置文档是否使用了统计视图? ❌
- [ ] 所有组件是否都有 `mode="demo"`?
- [ ] 组件是否在注册表中?

### 6.3 Lint 验证

```bash
# 运行 demo 覆盖率检查
npm run lint:demos

# 预期结果: 所有文档 PASS
```

---

## 7. 新增组件注册流程 (New Component Registration)

当需要为新文档添加 demo 支持时:

1. **组件添加 Demo 支持**:

   ```typescript
   const props = defineProps<{
     mode?: 'normal' | 'demo'
   }>()
   const isDemo = computed(() => props.mode === 'demo')
   ```

2. **隔离副作用**:

   ```typescript
   onMounted(() => {
     if (isDemo.value) {
       loadDemoData()
       return // 跳过真实 API 调用
     }
     // 正常初始化...
   })
   ```

3. **注册到 demo-registry-components.ts**:

   ```typescript
   import NewComponent from '../components/path/NewComponent.vue'
   registerDemoComponent('NewComponent', NewComponent)
   ```

4. **在文档中使用**:
   ```markdown
   <NewComponent mode="demo" />
   ```

---

## 8. 映射速查卡 (Quick Reference Card)

```
┌─────────────────────────────────────────────────────────────┐
│  文档类型 → 推荐组件类型                                      │
├─────────────────────────────────────────────────────────────┤
│  statistics/*      →  *StatisticsView                        │
│  settings/*        →  Setting*Section                        │
│  ai/chat.md        →  AIChat                                 │
│  ai/proofread.md   →  ProofreadView                          │
│  ai/completion.md  →  CompletionSettingsPanel                │
│  agent/*.md        →  AgentView / *Display                   │
│  core/multi-tab.md →  MainTabs                               │
│  shortcuts/*.md    →  MenuItemsDemo / 表格                   │
│  outline/*.md      →  Outline                                │
│  latex/*.md        →  LaTeX*                                 │
│  knowledge-base/*  →  KnowledgeBase / SettingKnowledgeBase   │
│  charts/*.md       →  ChartGenerationDisplay / GraphWindow   │
└─────────────────────────────────────────────────────────────┘
```

---

**Last Updated**: 2026-02-24  
**Maintainer**: Documentation Team  
**Related**: [DEMO_COVERAGE_POLICY.md](./DEMO_COVERAGE_POLICY.md), [WRITING_GUIDE.md](./WRITING_GUIDE.md)
