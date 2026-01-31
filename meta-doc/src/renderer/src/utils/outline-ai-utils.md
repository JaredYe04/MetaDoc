# Outline AI Utils 文档

## 概述

`outline-ai-utils.ts` 是一个统一的大纲AI生成工具函数库，提供文档大纲节点的生成、内容生成等功能。该库使用对话模式（chat）与AI交互，以提高AI理解准确性，并支持多种文档格式（Markdown和LaTeX）。

## 核心特性

- ✅ **统一接口**：提供统一的大纲节点生成和内容生成接口
- ✅ **智能解析**：支持JSON格式和自然语言文本的自动解析和转换
- ✅ **Fallback机制**：当JSON解析失败时，自动尝试自然语言转换
- ✅ **流式输出**：支持实时显示AI生成内容的流式输出
- ✅ **多格式支持**：支持Markdown和LaTeX两种文档格式
- ✅ **批量处理**：提供批量生成子节点和内容的函数

## 主要功能模块

### 1. 清理工具函数

#### `cleanTitleMarkers(title: string): string`

清理标题中的Markdown和LaTeX标记。

**功能**：
- 移除Markdown标题标记（`#`、`##`、`###`等）
- 移除LaTeX标题命令标记（`\section{}`、`\subsection{}`等）
- 保留纯文本标题内容

**参数**：
- `title: string` - 需要清理的标题文本

**返回**：
- `string` - 清理后的标题文本

**示例**：
```typescript
cleanTitleMarkers('# 章节标题')  // 返回: '章节标题'
cleanTitleMarkers('\\section{章节标题}')  // 返回: '章节标题'
```

#### `cleanNodeTitleMarkers(node: DocumentOutlineNode): void`

递归清理节点及其所有子节点的标题标记。

**功能**：
- 递归遍历节点树
- 清理每个节点的标题标记
- 原地修改节点对象

**参数**：
- `node: DocumentOutlineNode` - 需要清理的节点（会被修改）

**示例**：
```typescript
const node = {
  title: '# 章节1',
  children: [
    { title: '## 子章节1', children: [] }
  ]
}
cleanNodeTitleMarkers(node)
// node.title 变为 '章节1'
// node.children[0].title 变为 '子章节1'
```

#### `cleanRawContent(raw: string): string`

清理原始内容，去除可能的说明文字和格式标记。

**功能**：
- 去除代码块标记（```json、```markdown等）
- 去除常见的AI说明文字（如"请严格按照格式输出"等）
- 保留实际内容

**参数**：
- `raw: string` - 原始内容文本

**返回**：
- `string` - 清理后的内容文本

**示例**：
```typescript
const raw = '请严格按照格式输出\n\n这是实际内容'
cleanRawContent(raw)  // 返回: '这是实际内容'
```

---

### 2. 节点生成函数

#### `generateChildNodes(...)`

生成节点的子节点（使用对话模式，支持fallback到自然语言转换）。

**功能**：
- 使用AI生成子节点列表
- 支持JSON格式和自然语言文本的自动解析
- 当JSON解析失败时，自动尝试自然语言转换（fallback）
- 支持流式输出显示

**参数**：
- `node: DocumentOutlineNode` - 目标节点
- `outlineTree: DocumentOutlineNode` - 完整的大纲树
- `userPrompt: string` - 用户提示词，用于指导AI生成
- `signal?: AbortSignal` - 可选的取消信号
- `docFormat: 'md' | 'tex' = 'md'` - 文档格式，默认为Markdown
- `rawContentRef?: Ref<string>` - 可选的原始内容ref，用于实时显示流式输出
- `onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void` - 可选的更新回调
- `enableFallback: boolean = true` - 是否启用fallback逻辑，默认为true

**返回**：
- `Promise<DocumentOutlineNode[]>` - 生成的子节点数组

**工作流程**：
1. 构建AI提示词，包含大纲树结构、目标节点信息和用户提示
2. 调用AI生成内容（流式输出）
3. 尝试提取和解析JSON格式的子节点
4. 如果JSON解析失败且启用了fallback：
   - 先尝试从文本中直接提取章节（使用正则匹配）
   - 如果提取失败，使用AI将自然语言转换为JSON格式
5. 清理所有子节点标题中的Markdown/LaTeX标记
6. 返回生成的子节点数组

**示例**：
```typescript
const newChildren = await generateChildNodes(
  currentNode,
  outlineTree,
  '生成3-5个关于人工智能的子章节',
  undefined, // signal
  'md', // docFormat
  rawContentRef, // 用于显示流式输出
  onUpdate, // 进度回调
  true // 启用fallback
)
```

---

### 3. 内容生成函数

#### `generateNodeContent(...)`

生成节点内容（使用对话模式）。

**功能**：
- 使用AI生成节点的正文内容
- 根据节点是否有子节点，使用不同的提示词策略
- 支持流式输出显示
- 自动清理AI返回的说明文字

**参数**：
- `node: DocumentOutlineNode` - 目标节点
- `outlineTree: DocumentOutlineNode` - 完整的大纲树
- `userPrompt: string` - 用户提示词
- `signal?: AbortSignal` - 可选的取消信号
- `docFormat: 'md' | 'tex' = 'md'` - 文档格式，默认为Markdown
- `rawContentRef?: Ref<string>` - 可选的原始内容ref，用于实时显示流式输出
- `onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void` - 可选的更新回调

**返回**：
- `Promise<string>` - 生成的内容文本

**提示词策略**：
- 如果节点有子节点：使用 `generateParentNodeContentPrompt`（生成父节点内容，需要考虑子节点结构）
- 如果节点没有子节点：使用 `generateContentPrompt`（生成普通节点内容）

**示例**：
```typescript
const content = await generateNodeContent(
  currentNode,
  outlineTree,
  '生成详细的内容，要求专业、准确，包含具体案例',
  undefined, // signal
  'md', // docFormat
  rawContentRef, // 用于显示流式输出
  onUpdate // 进度回调
)
```

---

### 4. 批量生成函数

#### `generateChildrenChildren(...)`

批量生成子节点的子节点（递归遍历所有叶子节点，为每个叶子节点生成子节点）。

**功能**：
- 递归遍历指定节点的所有子节点
- 为每个叶子节点（没有子节点的节点）生成子节点
- 支持并发处理，提高效率
- 支持进度回调，可以实时显示每个节点的生成进度

**参数**：
- `rootNode: DocumentOutlineNode` - 根节点（从这个节点开始遍历）
- `outlineTree: DocumentOutlineNode` - 完整的大纲树
- `userPrompt: string` - 用户提示词
- `docFormat: 'md' | 'tex' = 'md'` - 文档格式，默认为Markdown
- `signal?: AbortSignal` - 可选的取消信号
- `onNodeProgress?: (node: DocumentOutlineNode, rawContentRef: Ref<string>) => void` - 每个节点生成进度的回调
- `onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void` - 可选的更新回调

**返回**：
- `Promise<void>`

**工作流程**：
1. 递归遍历 `rootNode` 的所有子节点
2. 对于每个叶子节点（没有子节点的节点）：
   - 调用 `generateChildNodes` 生成子节点
   - 将生成的子节点添加到当前节点
3. 如果某个节点生成失败，记录错误但继续处理其他节点（不中断整个流程）

**使用场景**：
- 为文档的所有章节批量生成子章节
- 快速扩展文档结构

**示例**：
```typescript
await generateChildrenChildren(
  rootNode,
  outlineTree,
  '为每个章节生成2-3个子章节',
  'md',
  undefined, // signal
  (node, rawContentRef) => {
    // 显示每个节点的生成进度
    console.log(`正在为 ${node.title} 生成子节点`)
    parallelChildrenRefs.push(rawContentRef)
  },
  onUpdate
)
```

---

#### `generateChildrenContent(...)`

批量生成子节点的内容（递归遍历所有子节点，为每个节点生成内容）。

**功能**：
- 递归遍历指定节点的所有子节点
- 为每个非根节点生成正文内容
- 支持并发处理，提高效率
- 支持进度回调，可以实时显示每个节点的生成进度

**参数**：
- `rootNode: DocumentOutlineNode` - 根节点（从这个节点开始遍历）
- `outlineTree: DocumentOutlineNode` - 完整的大纲树
- `userPrompt: string` - 用户提示词
- `docFormat: 'md' | 'tex' = 'md'` - 文档格式，默认为Markdown
- `signal?: AbortSignal` - 可选的取消信号
- `onNodeProgress?: (node: DocumentOutlineNode, rawContentRef: Ref<string>) => void` - 每个节点生成进度的回调
- `onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void` - 可选的更新回调

**返回**：
- `Promise<void>`

**工作流程**：
1. 递归遍历 `rootNode` 的所有子节点
2. 对于每个非根节点（`path !== 'dummy'`）：
   - 调用 `generateNodeContent` 生成内容
   - 将生成的内容设置到节点的 `text` 字段
3. 如果某个节点生成失败，记录错误但继续处理其他节点（不中断整个流程）

**使用场景**：
- 为文档的所有章节批量生成内容
- 快速填充文档内容

**示例**：
```typescript
await generateChildrenContent(
  rootNode,
  outlineTree,
  '为每个章节生成详细内容，要求专业、准确',
  'md',
  undefined, // signal
  (node, rawContentRef) => {
    // 显示每个节点的生成进度
    console.log(`正在为 ${node.title} 生成内容`)
    parallelChildrenRefs.push(rawContentRef)
  },
  onUpdate
)
```

---

## 内部辅助函数

### `extractChaptersFromText(text: string, docFormat: 'md' | 'tex'): DocumentOutlineNode[] | null`

从自然语言文本中提取章节列表（内部函数，不对外导出）。

**功能**：
- 支持多种格式的章节提取：
  - Markdown标题格式（`## 标题`、`### 标题`）
  - 中文编号格式（`第一章 标题`、`第一节 标题`）
  - 编号列表（`1. 标题`、`一、标题`）
  - 无序列表（`- 标题`、`* 标题`）
  - LaTeX格式（`\section{标题}`、`\subsection{标题}`）
  - 纯文本标题（排除说明文字）

**使用场景**：
- 当AI返回自然语言文本时，尝试直接提取章节信息
- 作为fallback机制的一部分

---

### `convertTextToJsonChapters(...)`

使用AI将自然语言文本转换为符合schema规范的JSON格式章节列表（内部函数，不对外导出）。

**功能**：
- 使用AI将自然语言描述转换为符合大纲schema的JSON格式
- 验证生成的节点是否符合schema规范
- 支持流式输出

**使用场景**：
- 当直接提取章节失败时，使用AI进行转换
- 作为fallback机制的最后一步

---

## 使用示例

### 示例1：为单个节点生成子节点

```typescript
import { generateChildNodes } from './outline-ai-utils'

const node = {
  title: '人工智能',
  path: '1',
  title_level: 1,
  text: '',
  children: []
}

const newChildren = await generateChildNodes(
  node,
  outlineTree,
  '生成3-5个关于人工智能的子章节，包括基础理论、应用场景、发展趋势等',
  undefined, // signal
  'md', // docFormat
  undefined, // rawContentRef
  undefined, // onUpdate
  true // enableFallback
)

// newChildren 包含生成的子节点数组
node.children.push(...newChildren)
```

### 示例2：为单个节点生成内容

```typescript
import { generateNodeContent } from './outline-ai-utils'

const content = await generateNodeContent(
  node,
  outlineTree,
  '生成详细的内容，要求专业、准确，包含具体案例和数据',
  undefined, // signal
  'md', // docFormat
  rawContentRef, // 用于显示流式输出
  onUpdate // 进度回调
)

node.text = content
```

### 示例3：批量生成子节点的子节点

```typescript
import { generateChildrenChildren } from './outline-ai-utils'

const parallelChildrenRefs: Ref<string>[] = []

await generateChildrenChildren(
  rootNode,
  outlineTree,
  '为每个章节生成2-3个子章节，要求结构清晰、逻辑合理',
  'md',
  undefined, // signal
  (node, rawContentRef) => {
    // 收集每个节点的原始内容ref，用于UI显示
    parallelChildrenRefs.push(rawContentRef)
  },
  onUpdate
)
```

### 示例4：批量生成子节点的内容

```typescript
import { generateChildrenContent } from './outline-ai-utils'

const parallelChildrenRefs: Ref<string>[] = []

await generateChildrenContent(
  rootNode,
  outlineTree,
  '为每个章节生成详细内容，要求专业、准确，包含具体案例和数据',
  'md',
  undefined, // signal
  (node, rawContentRef) => {
    // 收集每个节点的原始内容ref，用于UI显示
    parallelChildrenRefs.push(rawContentRef)
  },
  onUpdate
)
```

---

## 注意事项

### 1. 文档格式支持

- **Markdown格式**：生成的标题使用 `#`、`##` 等Markdown标记
- **LaTeX格式**：生成的标题使用 `\section{}`、`\subsection{}` 等LaTeX命令

函数会根据 `docFormat` 参数自动调整提示词和输出格式。

### 2. Fallback机制

`generateChildNodes` 函数支持fallback机制：
1. 首先尝试解析JSON格式
2. 如果JSON解析失败，尝试从文本中直接提取章节（使用正则匹配）
3. 如果直接提取失败，使用AI将自然语言转换为JSON格式

可以通过 `enableFallback` 参数控制是否启用fallback。

### 3. 错误处理

- 批量生成函数（`generateChildrenChildren`、`generateChildrenContent`）在某个节点生成失败时，会记录错误但继续处理其他节点，不会中断整个流程
- 单个生成函数（`generateChildNodes`、`generateNodeContent`）在失败时会抛出错误，需要调用者处理

### 4. 流式输出

所有生成函数都支持流式输出：
- 通过 `rawContentRef` 参数可以实时获取AI生成的内容
- 通过 `onUpdate` 回调可以获取生成进度和状态信息

### 5. 取消操作

所有生成函数都支持通过 `AbortSignal` 取消操作：
```typescript
const controller = new AbortController()

// 启动生成任务
const promise = generateChildNodes(node, outlineTree, prompt, controller.signal)

// 取消任务
controller.abort()
```

### 6. 性能考虑

- 批量生成函数使用并发处理，可以同时为多个节点生成内容，提高效率
- 建议在批量操作时使用批量生成函数，而不是循环调用单个生成函数

---

## 相关文件

- `outline-optimize-tool.ts` - 大纲优化工具，使用本库的函数
- `Outline.vue` - 大纲视图组件，使用本库的函数
- `document/outline.ts` - 大纲树相关工具函数
- `prompts.ts` - AI提示词模板

---

---

### 7. 内容优化函数

#### `expandContent(...)` - 扩写节点内容

对现有节点内容进行扩写，使其更加丰富翔实。

**函数签名：**
```typescript
export async function expandContent(
  node: DocumentOutlineNode,
  outlineTree: DocumentOutlineNode,
  userPrompt: string,
  signal?: AbortSignal,
  docFormat: 'md' | 'tex' = 'md',
  rawContentRef?: Ref<string>,
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void,
  temperature?: number,
  wordCount?: number
): Promise<string>
```

**参数说明：**
- `node`: 要扩写的节点（必须包含text内容）
- `outlineTree`: 完整的大纲树
- `userPrompt`: 用户提示词，用于指导扩写方向
- `signal`: 可选的取消信号
- `docFormat`: 文档格式（'md' 或 'tex'）
- `rawContentRef`: 可选的用于实时显示原始内容的ref
- `onUpdate`: 可选的更新回调
- `temperature`: 可选的AI温度参数（0-2），控制AI的创造性
- `wordCount`: 可选的目标字数（通过提示词控制，而非max_tokens）

**功能特点：**
- 保持原有内容的主题和核心观点不变
- 增加细节描述、案例分析、数据支撑等
- 支持通过提示词控制目标字数
- 支持温度参数控制AI创造性
- 支持流式输出显示

**使用示例：**
```typescript
const expandedContent = await expandContent(
  node,
  outlineTree,
  '请添加更多技术细节和实际案例',
  undefined,
  'md',
  rawContentRef,
  undefined,
  1.2, // 温度参数
  1000 // 目标字数
)
```

#### `abridgeContent(...)` - 略写节点内容

对现有节点内容进行略写，使其更加简洁精炼。

**函数签名：**
```typescript
export async function abridgeContent(
  node: DocumentOutlineNode,
  outlineTree: DocumentOutlineNode,
  userPrompt: string,
  signal?: AbortSignal,
  docFormat: 'md' | 'tex' = 'md',
  rawContentRef?: Ref<string>,
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void,
  temperature?: number,
  wordCount?: number
): Promise<string>
```

**参数说明：**
- 与 `expandContent` 相同

**功能特点：**
- 保留核心观点和关键信息
- 删除冗余描述和重复内容
- 支持通过提示词控制目标字数
- 确保略写后的内容仍然完整和连贯

**使用示例：**
```typescript
const abridgedContent = await abridgeContent(
  node,
  outlineTree,
  '精简为摘要形式，保留核心观点',
  undefined,
  'md',
  rawContentRef,
  undefined,
  0.8, // 较低温度，更保守
  300 // 目标字数
)
```

#### `polishContent(...)` - 润色节点内容

对现有节点内容进行润色，提升其表达质量和可读性。

**函数签名：**
```typescript
export async function polishContent(
  node: DocumentOutlineNode,
  outlineTree: DocumentOutlineNode,
  userPrompt: string,
  signal?: AbortSignal,
  docFormat: 'md' | 'tex' = 'md',
  rawContentRef?: Ref<string>,
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void,
  temperature?: number
): Promise<string>
```

**参数说明：**
- 与 `expandContent` 类似，但不支持 `wordCount` 参数（润色不改变内容长度）

**功能特点：**
- 保持原有内容的主题和核心观点不变
- 优化语言表达，使其更加流畅自然
- 修正语法错误和表达不当之处
- 不改变内容的长度和结构

**使用示例：**
```typescript
const polishedContent = await polishContent(
  node,
  outlineTree,
  '使用学术写作风格，提升专业性',
  undefined,
  'md',
  rawContentRef,
  undefined,
  0.9 // 中等温度
)
```

---

## 更新日志

### 最新版本
- ✅ 统一了所有AI大纲优化逻辑到本文件
- ✅ 添加了fallback机制，支持自然语言转换
- ✅ 添加了批量生成函数，提高批量操作效率
- ✅ 支持流式输出和进度回调
- ✅ 新增内容优化函数：`expandContent`、`abridgeContent`、`polishContent`
- ✅ 支持温度参数和字数控制（通过提示词）
- ✅ 所有生成函数支持温度参数，提供更细粒度的控制

