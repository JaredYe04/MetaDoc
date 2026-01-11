# 文件格式硬编码分析报告

## 概述

本报告详细梳理了项目中所有硬编码 `'md' | 'tex'` 格式判断的地方，为后续支持更多文件格式的重构提供参考。

## 一、类型定义层面的硬编码

### 1.1 核心类型定义

#### `meta-doc/src/types/index.ts`
- **第37行**: `export type DocumentFormat = 'md' | 'tex' | 'json';`
  - 虽然包含 `'json'`，但实际使用中主要硬编码 `'md'` 和 `'tex'`

#### `meta-doc/src/renderer/src/stores/workspace.ts`
- **第26行**: `export type WorkspaceTabFormat = 'md' | 'tex';`
  - 标签页格式类型，硬编码两种格式

#### `meta-doc/src/renderer/src/services/document-loader.ts`
- **第13行**: `export type LoadedDocumentFormat = 'md' | 'tex';`
  - 文档加载格式类型

#### `meta-doc/src/renderer/src/utils/outline-adapters.ts`
- **第8行**: `export type OutlineTextAdapterFormat = 'md' | 'tex';`
  - 大纲适配器格式类型

### 1.2 数据结构定义

#### `meta-doc/src/renderer/src/stores/workspace.ts`
- **第49行**: `format: WorkspaceTabFormat;` (WorkspaceDocument接口)
- **第50-51行**: `markdown: string; tex: string;`
  - 文档数据结构中硬编码了 `markdown` 和 `tex` 两个字段

## 二、常量配置层面的硬编码

### 2.1 支持的格式列表

#### `meta-doc/src/renderer/src/constants/supported-formats.ts`
- **第4-25行**: `SUPPORTED_FORMATS` 数组
  - 目前只包含 `md` 和 `tex` 两种格式
  - 这是格式配置的集中定义点，但代码中很多地方没有使用这个常量

### 2.2 文件扩展名判断

#### `meta-doc/src/renderer/src/components/WorkspaceExplorer.vue`
- **第517行**: `if (ext === 'md' || ext === 'tex')`
- **第611行**: `if (ext === 'md' || ext === 'tex')`
- **第669行**: `const format = filePath.endsWith('.tex') ? 'tex' : 'md'`
- **第1251-1252行**: 默认文件名后缀硬编码 `.md`

#### `meta-doc/src/renderer/src/components/WorkspaceTreeNode.vue`
- **第202行**: `if (ext === 'tex')`

#### `meta-doc/src/main/utils/directory-watcher-service.ts`
- **第72行**: `if (ext !== '.md' && ext !== '.tex')`

#### `meta-doc/src/main/main-calls.ts`
- **第562行**: `if (ext !== '.md' && ext !== '.tex')`
- **第2512行**: `extensions: ['md', 'tex', 'json']`
- **第2513行**: `extensions: ['md']`
- **第2514行**: `extensions: ['tex']`

## 三、业务逻辑层面的硬编码

### 3.1 文档创建和初始化

#### `meta-doc/src/renderer/src/stores/workspace.ts`
- **第236行**: `createDocumentSnapshotFromTemplate('md', '')`
- **第310行**: `createDocumentSnapshotFromTemplate('md', '')`
- **第380行**: `createDocumentSnapshotFromTemplate('md', '')`
- **第485-523行**: `detectDocumentFormat()` 函数
  - 返回类型硬编码为 `'tex' | 'md'`
  - 检测逻辑只针对这两种格式
- **第1110-1111行**: 内容转换逻辑硬编码 `formatId === 'md'` 和 `formatId === 'tex'`

#### `meta-doc/src/renderer/src/views/Main.vue`
- **第144行**: `format: 'md' | 'tex'`
- **第281-284行**: switch case 只处理 `'md'` 和 `'tex'`
- **第596行**: `format: 'md' | 'tex'`
- **第682行**: `workspace.initializeDocumentFromTemplate(newTab.id, 'md', 'blank')`
- **第697行**: `doc.format = 'md'`
- **第699行**: `tab.format = 'md'`
- **第703行**: `workspace.initializeDocumentFromTemplate(targetTabId, 'md', 'blank')`
- **第708行**: `if (doc.format === 'md')`
- **第719行**: `else if (doc.format === 'tex')`
- **第801行**: `workspace.initializeDocumentFromTemplate(newTab.id, 'md', 'blank')`
- **第921行**: `if (format === 'tex')`
- **第950行**: `if (format === 'tex')`

#### `meta-doc/src/renderer/src/services/document-loader.ts`
- **第114行**: `format: 'md'`
- **第155行**: `format: 'tex'`
- **第183行**: `format: 'md'`
- **第195行**: `format: 'md'`
- **第208行**: `format: 'md'` (createEmptyDocument)

#### `meta-doc/src/renderer/src/components/home/QuickStartPanel.vue`
- **第19行**: `@click="selectQuickStartFormat('md')"`
- **第28行**: `@click="selectQuickStartFormat('tex')"`
- **第62行**: `option.id as 'md' | 'tex'`
- **第228行**: `const selectedFormat = ref<'md' | 'tex' | null>(null)`
- **第380行**: `if (selectedFormat.value === 'tex')`
- **第423行**: `if (selectedFormat.value === 'tex')`
- **第440行**: `function prepareDocument(format: 'md' | 'tex')`
- **第455行**: `if (format === 'tex')`
- **第468行**: `function selectFormat(format: 'md' | 'tex')`
- **第493行**: `const selectQuickStartFormat = (format: 'md' | 'tex')`
- **第498行**: `const newStage = format === 'md' ? 'markdown' : 'latex'`
- **第533行**: `if (selectedFormat.value !== 'tex')`

#### `meta-doc/src/renderer/src/components/home/QuickStartMarkdown.vue`
- **第497行**: `initializeDocumentFromTemplate(tabId, 'md')`

#### `meta-doc/src/renderer/src/components/home/QuickStartLatex.vue`
- **第525行**: `initializeDocumentFromTemplate(tabId, 'tex')`

### 3.2 文档内容处理

#### `meta-doc/src/renderer/src/stores/workspace.ts`
- **第236行**: `if (doc.format === 'md')`
- **第240行**: `else if (doc.format === 'tex')`
- **第582行**: `if (detectedFormat === 'tex' && doc.format !== 'tex')`
- **第586行**: `else if (detectedFormat === 'md' && doc.format !== 'md' && normalized.trim().length > 0)`
- **第596行**: `if (!suppressAutoOutlineSync && doc.format === 'md' && normalized.trim().length > 0)`
- **第655行**: `if (detectedFormat === 'tex' && doc.format !== 'tex')`
- **第659行**: `else if (detectedFormat === 'md' && doc.format !== 'md' && normalized.trim().length > 0)`
- **第669行**: `if (!suppressAutoOutlineSync && doc.format === 'tex' && normalized.trim().length > 0)`
- **第869行**: `const markdownDiff = doc.format === 'md' && doc.markdown !== doc.savedMarkdown;`
- **第870行**: `const texDiff = doc.format === 'tex' && doc.tex !== doc.savedTex;`
- **第1314行**: `const currentContent = doc.format === 'tex' ? (doc.tex ?? '') : (doc.markdown ?? '');`
- **第1315行**: `const savedContent = doc.format === 'tex' ? (doc.savedTex ?? '') : (doc.markdown ?? '');`
- **第1340行**: `if (doc.format === 'tex')`
- **第1353行**: `if (doc.format === 'tex')`
- **第1403行**: `if (doc.format === 'tex')`
- **第1431行**: `if (doc.format === 'tex')`
- **第1494行**: `const content = doc.format === 'tex' ? doc.tex : doc.markdown`

#### `meta-doc/src/renderer/src/utils/event-bus.js`
- **第102行**: `const content = doc.format === 'tex' ? doc.tex ?? '' : doc.markdown ?? '';`
- **第123行**: `doc.format === 'tex' ? convertLatexToMarkdown(doc.tex ?? '') : doc.markdown ?? '';`

#### `meta-doc/src/renderer/src/services/document-save.ts`
- **第39行**: `const content = doc.format === 'tex' ? doc.tex ?? '' : doc.markdown ?? '';`

### 3.3 编辑器组件选择

#### `meta-doc/src/renderer/src/components/workspace/WorkspaceTabPane.vue`
- **第31行**: `return props.tab.format === 'tex' ? LaTeXEditor : MarkdownEditor;`
- **第36行**: `return props.tab.format === 'tex'`

### 3.4 大纲处理

#### `meta-doc/src/renderer/src/views/Outline.vue`
- **第418行**: `const format = doc?.format ?? 'md';`
- **第420行**: `if (format === 'tex')`
- **第480行**: `const docFormat = (activeDocument.value?.format ?? 'md') as 'md' | 'tex'`
- **第554行**: `const docFormat = (activeDocument.value?.format ?? 'md') as 'md' | 'tex'`
- **第610行**: `const docFormat = (activeDocument.value?.format ?? 'md') as 'md' | 'tex'`
- **第1695行**: `const docFormat = (activeDocument.value?.format ?? 'md') as 'md' | 'tex'`

#### `meta-doc/src/renderer/src/utils/outline-adapters.ts`
- **第70行**: `if (format === 'tex') return new LatexOutlineAdapter();`

### 3.5 导出功能

#### `meta-doc/src/main/export/export-manager.ts`
- **第2990行**: `md: { name: t('main.dialogs.filters.markdown'), extensions: ['md'] },`
- **第2991行**: `tex: { name: t('main.dialogs.filters.latex'), extensions: ['tex'] },`

#### `meta-doc/src/renderer/src/services/export-manager.ts`
- **第127行**: `if (sourceFormat === 'md')`
- **第135行**: `if (targetFormat === 'html' || targetFormat === 'md' || targetFormat === 'tex')`
- **第158行**: `else if (targetFormat === 'tex')`
- **第164行**: `else if (sourceFormat === 'tex')`
- **第165行**: `if (targetFormat === 'tex' || targetFormat === 'pdf')`

### 3.6 文件保存

#### `meta-doc/src/main/main-calls.ts`
- **第2448-2456行**: switch case 只处理 `'md'`, `'json'`, `'tex'`
- **第2540-2550行**: `getSaveFilterByFormat()` 函数只处理 `'md'`, `'tex'`, `'json'`
- **第2588行**: `const format = data.format || 'md';`
- **第2591行**: `if (format === 'md')`
- **第2593行**: `else if (format === 'tex')`
- **第2602行**: `if (format === 'md')`
- **第2610行**: `else if (format === 'tex')`
- **第2664行**: `const format = data.format || (data.args?.format as DocumentFormat) || 'md';`

### 3.7 AI相关功能

#### `meta-doc/src/renderer/src/utils/agent-framework/ai-context-manager.ts`
- **第282行**: `const docFormat = publicCtx.document.format || 'md'`
- **第283行**: `prompt += \`**文档格式: ${docFormat === 'tex' ? 'LaTeX' : 'Markdown'}**\n\n\``
- **第291行**: `formatType: docFormat === 'tex' ? 'LaTeX' : 'Markdown'`
- **第295行**: `if (docFormat === 'tex')`
- **第342行**: `const docFormat = activeDoc.format === 'tex' ? 'tex' : 'md'`
- **第343行**: `const formatName = docFormat === 'tex' ? 'LaTeX' : 'Markdown'`
- **第346行**: `const content = docFormat === 'tex' ? activeDoc.tex : activeDoc.markdown`
- **第402行**: `const formatDisplay = ref.format === 'tex' ? 'LaTeX' : (ref.format === 'md' ? 'Markdown' : ref.format)`
- **第418行**: `const codeBlockLang = ref.format === 'tex' ? 'latex' : (ref.format === 'md' ? 'markdown' : 'text')`

#### `meta-doc/src/renderer/src/utils/agent-tools/edit-tool.ts`
- **第585行**: `currentFormat = isLatex ? 'tex' : 'md'`
- **第587行**: `currentFormat = 'tex'`
- **第590行**: `currentFormat = 'md'`
- **第593行**: `const currentContent = currentFormat === 'md' ? doc.markdown : doc.tex`
- **第694行**: `if (currentFormat === 'md')`

#### `meta-doc/src/renderer/src/utils/agent-tools/metadata-tool.ts`
- **第503行**: `const hasContent = docInfo.format === 'tex'`
- **第508行**: `const formatName = docInfo.format === 'tex' ? 'LaTeX' : 'Markdown'`

#### `meta-doc/src/renderer/src/utils/agent-tools/outline-optimize-tool.ts`
- **第98行**: `function extractChaptersFromText(text: string, docFormat: 'md' | 'tex' = 'md')`
- **第184行**: `if (docFormat === 'tex')`
- **第225行**: `docFormat: 'md' | 'tex' = 'md'`
- **第228行**: `const formatInstruction = docFormat === 'tex'`

#### `meta-doc/src/renderer/src/utils/agent-tools/proofread-tool.ts`
- **第488行**: `const format = doc.format === 'tex' ? 'latex' : (doc.format === 'md' ? 'markdown' : 'text')`
- **第523行**: `const content = doc.format === 'md' ? doc.markdown : doc.tex`
- **第524行**: `const format = doc.format === 'tex' ? 'latex' : (doc.format === 'md' ? 'markdown' : 'text')`
- **第759行**: `if (format === 'latex' && doc.format === 'tex')`
- **第762行**: `else if ((format === 'markdown' || format === 'text') && doc.format === 'md')`
- **第767行**: `if (doc.format === 'tex')`

#### `meta-doc/src/renderer/src/utils/agent-tools/grep-tool.ts`
- **第694行**: `documentText = doc.format === 'md' ? doc.markdown : doc.tex`
- **第696行**: `language = doc.format === 'md' ? 'markdown' : (doc.format === 'tex' ? 'latex' : 'plaintext')`
- **第773行**: `if (doc.format === 'md')`
- **第775行**: `else if (doc.format === 'tex')`

#### `meta-doc/src/renderer/src/utils/agent-tools/outline-tree-tool.ts`
- **第102行**: `if (doc.format === 'md')`
- **第105行**: `else if (doc.format === 'tex')`

#### `meta-doc/src/renderer/src/utils/agent-tools/title-format-tool.ts`
- **第234行**: `if (format === 'tex')`

#### `meta-doc/src/renderer/src/views/AgentView.vue`
- **第695行**: `const docFormat = doc.format || 'md';`
- **第700行**: `format: docFormat as 'md' | 'tex'`
- **第783行**: `session.publicContext.document.format = newFormat as 'md' | 'tex';`
- **第902行**: `const docFormat = doc.format || 'md';`
- **第907行**: `format: docFormat as 'md' | 'tex'`

### 3.8 其他功能模块

#### `meta-doc/src/renderer/src/components/LeftMenu.vue`
- **第796行**: `:source-format="(activeDocument?.format ?? 'md') as DocumentFormat"`
- **第1050行**: `const format = (activeDocument.value?.format ?? 'md') as DocumentFormat`
- **第1161行**: `const sourceFormat = (activeDocument.value?.format ?? 'md') as DocumentFormat`

#### `meta-doc/src/renderer/src/components/BottomMenu.vue`
- **第126行**: `if (doc.format === 'tex')`
- **第155行**: `if (doc.format === 'tex')`
- **第163行**: `if (!doc) return 'md'`

#### `meta-doc/src/renderer/src/views/Visualize.vue`
- **第159行**: `const format = doc.format === 'tex' ? 'latex' : 'markdown';`
- **第167行**: `if (doc.format === 'tex')`

#### `meta-doc/src/renderer/src/views/ProofreadView.vue`
- **第145行**: `const content = activeDocument.value.format === 'tex'`
- **第158行**: `format: activeDocument.value.format === 'tex' ? 'latex' : 'markdown'`
- **第192行**: `const content = activeDocument.value.format === 'tex'`
- **第206行**: `if (activeDocument.value.format === 'tex')`
- **第248行**: `const content = activeDocument.value.format === 'tex'`
- **第270行**: `if (activeDocument.value.format === 'tex')`

#### `meta-doc/src/renderer/src/views/Home.vue`
- **第101行**: `if (doc.format === 'tex')`

#### `meta-doc/src/renderer/src/views/GlobalHome.vue`
- **第300行**: `if (doc.format === 'tex')`

#### `meta-doc/src/renderer/src/components/AISuggestion.vue`
- **第304行**: `if (currentFormat.value === 'md')`
- **第341行**: `const { preContext, postContext } = currentFormat.value === 'md'`
- **第347行**: `if (currentFormat.value === 'md')`
- **第357行**: `else if (currentFormat.value === 'tex')`
- **第392行**: `if (currentFormat.value === 'md')`
- **第395行**: `else if (currentFormat.value === 'tex')`
- **第427行**: `if (currentFormat.value === 'md')`
- **第431行**: `else if (currentFormat.value === 'tex')`
- **第452行**: `if (currentFormat.value === 'md' && suggestionEl instanceof HTMLElement)`
- **第456行**: `else if (currentFormat.value === 'tex')`
- **第488行**: `if (currentFormat.value === 'md' && suggestionEl instanceof HTMLElement)`
- **第577行**: `if (currentFormat.value === 'tex')`
- **第618行**: `else if (currentFormat.value === 'md')`

#### `meta-doc/src/renderer/src/components/AISuggestionGhost.vue`
- **第1022行**: `if (props.format === 'tex')`
- **第1024行**: `else if (props.format === 'md')`
- **第1033行**: `if (props.format === 'tex')`
- **第1036行**: `else if (props.format === 'md')`
- **第1046行**: `if (props.format === 'tex')`
- **第1070行**: `else if (props.format === 'md')`
- **第1114行**: `if (props.format === 'md')`
- **第1119行**: `else if (props.format === 'tex')`
- **第1173行**: `if (props.format === 'md')`

#### `meta-doc/src/renderer/src/components/agent/ReferenceManager.vue`
- **第349行**: `const docFormat = activeDoc.format === 'tex' ? 'tex' : 'md'`
- **第350行**: `const formatName = docFormat === 'tex' ? 'LaTeX' : 'Markdown'`
- **第353行**: `const content = docFormat === 'tex' ? activeDoc.tex : activeDoc.markdown`

#### `meta-doc/src/renderer/src/utils/word-count-adapter.ts`
- **第314行**: `if (format === 'tex')`

#### `meta-doc/src/renderer/src/utils/title-extractor.ts`
- **第80行**: `if (format === 'md')`
- **第82行**: `else if (format === 'tex')`

#### `meta-doc/src/renderer/src/utils/meta-info-remover.ts`
- **第48行**: `if (format === 'tex')`

#### `meta-doc/src/main/utils/file-watcher-service.ts`
- **第26行**: `function detectFileFormat(filePath: string): 'md' | 'tex'`
- **第28行**: `return ext === '.tex' ? 'tex' : 'md';`
- **第62行**: `if (format === 'tex')`

#### `meta-doc/src/renderer/src/stores/document.ts`
- **第107行**: `if (currentFormat.value === 'tex')`
- **第126行**: `currentFormat.value = 'md'`
- **第148行**: `if (currentFormat.value === 'md')`
- **第156行**: `else if (currentFormat.value === 'tex')`

#### `meta-doc/src/renderer/src/services/document-serializer.ts`
- **第60行**: `const isTex = doc.format === 'tex';`

#### `meta-doc/src/renderer/src/utils/outline-ai-utils.ts`
- **第211行**: `const formatInstruction = docFormat === 'tex'`
- **第300行**: `const formatInstruction = docFormat === 'tex'`

## 四、统计汇总

### 4.1 按文件类型统计

- **类型定义文件**: 5个文件，约10处硬编码
- **常量配置文件**: 1个文件，1处配置（但未充分利用）
- **Store文件**: 2个文件，约50+处硬编码
- **组件文件**: 15+个文件，约100+处硬编码
- **工具函数文件**: 20+个文件，约80+处硬编码
- **主进程文件**: 3个文件，约30+处硬编码

### 4.2 按功能模块统计

- **文档创建/初始化**: 约30处
- **文档内容处理**: 约40处
- **编辑器选择**: 约5处
- **大纲处理**: 约15处
- **导出功能**: 约10处
- **文件保存**: 约15处
- **AI相关功能**: 约50处
- **其他功能**: 约40处

### 4.3 硬编码模式分类

1. **类型联合字面量**: `'md' | 'tex'` (约10处)
2. **三元运算符**: `format === 'tex' ? ... : ...` (约60处)
3. **if-else判断**: `if (format === 'md') ... else if (format === 'tex')` (约80处)
4. **switch-case**: `case 'md': ... case 'tex':` (约10处)
5. **默认值**: `format || 'md'` (约20处)
6. **文件扩展名判断**: `ext === 'md' || ext === 'tex'` (约15处)

## 五、重构规划

### 5.1 重构目标

1. **可扩展性**: 支持未来添加新格式（如 `.rst`, `.org`, `.txt` 等）
2. **可维护性**: 集中管理格式配置，减少重复代码
3. **类型安全**: 使用类型系统确保格式处理的一致性
4. **向后兼容**: 保持现有功能不变

### 5.2 重构策略

#### 阶段一：建立格式注册机制（核心基础设施）

1. **扩展格式配置系统**
   - 修改 `supported-formats.ts`，使其成为格式注册中心
   - 定义格式接口，包含：
     - 格式ID
     - 文件扩展名
     - 编辑器组件
     - 内容适配器
     - 大纲适配器
     - 导出适配器
     - 检测函数

2. **创建格式管理器**
   - 新建 `format-manager.ts` 或 `format-registry.ts`
   - 提供格式注册、查询、验证等功能
   - 提供格式检测的统一接口

3. **重构类型定义**
   - 将 `WorkspaceTabFormat` 改为从格式注册表动态生成
   - 使用 `keyof` 或联合类型从配置推导
   - 保持向后兼容的类型别名

#### 阶段二：重构数据结构（数据层）

1. **文档内容存储重构**
   - 将 `markdown` 和 `tex` 字段改为统一的 `content` 字段
   - 或使用 `Record<FormatId, string>` 存储多格式内容
   - 保持向后兼容的getter/setter

2. **格式检测函数重构**
   - 将 `detectDocumentFormat()` 改为可扩展的检测器链
   - 每个格式提供自己的检测函数
   - 支持优先级和置信度

#### 阶段三：重构业务逻辑（应用层）

1. **编辑器组件选择**
   - 使用格式配置中的编辑器组件映射
   - 动态加载编辑器组件

2. **内容处理逻辑**
   - 使用策略模式，为每种格式提供处理策略
   - 统一内容获取接口：`getDocumentContent(doc, format)`
   - 统一内容设置接口：`setDocumentContent(doc, format, content)`

3. **大纲处理**
   - 扩展 `OutlineTextAdapter` 接口
   - 使用格式注册表中的适配器

4. **导出功能**
   - 使用格式配置中的导出适配器映射
   - 支持格式间的转换矩阵配置

#### 阶段四：重构工具函数（工具层）

1. **AI工具重构**
   - 统一格式名称获取：`getFormatDisplayName(format)`
   - 统一内容获取：使用统一的文档内容接口

2. **文件操作重构**
   - 统一文件扩展名判断：`isSupportedFormat(ext)`
   - 统一格式检测：`detectFormatFromPath(path)`

#### 阶段五：清理和优化

1. **移除硬编码**
   - 逐步替换所有硬编码的格式判断
   - 使用格式管理器提供的统一接口

2. **测试覆盖**
   - 为格式管理器添加单元测试
   - 为格式检测添加测试用例
   - 为格式转换添加集成测试

3. **文档更新**
   - 更新开发文档，说明如何添加新格式
   - 更新API文档

### 5.3 实施建议

1. **优先级排序**
   - **高优先级**: 类型定义、格式注册机制、核心数据结构
   - **中优先级**: 编辑器选择、内容处理、大纲处理
   - **低优先级**: AI工具、辅助功能

2. **渐进式重构**
   - 先建立基础设施（格式注册机制）
   - 然后逐步迁移各个模块
   - 保持每个阶段都可以独立测试和验证

3. **向后兼容**
   - 保留旧的类型别名（标记为deprecated）
   - 提供迁移工具或脚本
   - 在过渡期同时支持新旧两种方式

4. **测试策略**
   - 每个阶段完成后进行回归测试
   - 确保现有功能不受影响
   - 为新格式支持添加测试用例

### 5.4 预期收益

1. **可扩展性提升**: 添加新格式只需在配置中注册，无需修改大量业务代码
2. **代码质量提升**: 减少重复代码，提高可维护性
3. **类型安全**: 利用TypeScript类型系统，减少运行时错误
4. **开发效率**: 新格式支持开发时间从数天缩短到数小时

## 六、风险评估

### 6.1 技术风险

- **类型系统复杂性**: TypeScript类型推导可能变得复杂
- **性能影响**: 动态组件加载可能影响启动性能
- **兼容性问题**: 现有数据格式可能需要迁移

### 6.2 缓解措施

- 使用类型工具和辅助类型简化类型定义
- 使用代码分割和懒加载优化性能
- 提供数据迁移脚本和兼容层

## 七、后续工作

1. 根据本报告制定详细的重构实施计划
2. 创建格式注册机制的详细设计文档
3. 开始阶段一的重构工作
4. 建立格式扩展的开发指南

---

**报告生成时间**: 2024年
**分析范围**: meta-doc项目全部代码
**硬编码统计**: 约200+处硬编码点








