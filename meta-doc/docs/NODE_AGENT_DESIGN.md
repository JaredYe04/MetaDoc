# NodeAgent 系统设计文档

## 概述

NodeAgent 系统是一个基于大纲节点的智能写作系统，将每个大纲节点视为一个独立的微型Agent。系统采用后序遍历执行策略，确保子节点内容生成完成后，父节点可以根据子节点内容智能决策是否需要生成内容。

## 核心概念

### 1. NodeAgent（节点智能体）

每个大纲节点都是一个独立的Agent，具有以下特性：

- **独立性**：每个节点拥有独立的Agent Session
- **工具调用能力**：每个NodeAgent可以调用工具（如`outline-optimize`扩写工具）
- **上下文感知**：可以看到全局上下文（大纲结构、用户提示词）和节点级上下文（子节点内容）

### 2. 后序遍历执行策略

**执行顺序**：从叶子节点开始，向上遍历到根节点

**优势**：
- 子节点先于父节点处理
- 父节点可以看到所有子节点的完整内容
- 避免内容重复，提高内容质量

**执行流程**：
```
1. 处理所有子节点（递归）
2. 处理当前节点（子节点已完成）
   - 查看子节点内容
   - 决定是否需要生成内容
   - 可以调用工具（如outline-optimize）生成子节点
   - 生成节点内容或留空
```

### 3. 上下文管理

#### 全局上下文（所有节点共享）
- 大纲结构（不含正文内容）
- 用户提示词
- 文档格式（Markdown/LaTeX）
- 系统提示词

#### 节点级上下文（每个节点独立）
- 当前节点的子节点内容（已处理完成）
- 父节点信息
- 当前节点的元数据（path、title、level等）

## 系统架构

### 组件结构

```
NodeAgent Tool (node-agent-tool.ts)
├── 工具回调函数 (nodeAgentToolCallback)
├── 后序遍历函数 (postOrderTraverse)
├── 系统提示词构建 (buildNodeAgentSystemPrompt)
├── 用户提示词构建 (buildNodeAgentUserPrompt)
└── 内容提取 (extractContentFromSession)

NodeAgent Display (NodeAgentDisplay.vue)
├── 实时状态显示
├── 活动节点高亮
├── 已完成节点列表
└── 生成内容预览

Outline.vue 集成
├── NodeAgent触发按钮
├── 节点执行状态高亮
└── 提示词输入框
```

### 工具关系

```
NodeAgent Tool
├── 可以调用 outline-optimize（扩写工具）
│   ├── generateChildren（生成子节点）
│   ├── generateContent（生成内容）
│   ├── generateChildrenChildren（批量生成子节点）
│   └── generateChildrenContent（批量生成内容）
└── 可以调用 outline-reorder（大纲优化工具）
    └── 调整子节点顺序
```

## 工具系统重构

### 工具重命名

| 原名称 | 新名称 | ID | 功能 |
|--------|--------|-----|------|
| 大纲优化工具 | **扩写工具** | `outline-optimize` | 快速生成大纲和内容（不保证质量） |
| - | **大纲优化工具** | `outline-reorder` | 调整节点顺序（保持内容不变） |
| - | **节点智能体** | `node-agent` | 智能生成内容（考虑子节点关系） |

### 工具功能划分

#### 1. 扩写工具（outline-optimize）

**定位**：快速生成工具，主要用于快速产出初稿

**特点**：
- ⚠️ 不保证内容质量
- 支持并发处理，效率高
- 适用于需要快速生成大量内容的场景

**操作**：
- `generateChildren`：生成子节点
- `generateContent`：生成内容
- `generateChildrenChildren`：批量生成子节点的子节点
- `generateChildrenContent`：批量生成子节点的内容

#### 2. 大纲优化工具（outline-reorder）

**定位**：结构优化工具，专门用于调整节点顺序

**特点**：
- 只调整顺序，不修改内容
- 根据AI返回的JSON重新排列
- 自动重新生成路径

**输入**：
```json
{
  "nodePath": "1",
  "newOrderJson": "[{\"path\": \"1.2\", \"title\": \"...\"}, ...]"
}
```

#### 3. 节点智能体（node-agent）

**定位**：智能生成工具，保证内容质量

**特点**：
- 考虑子节点关系
- 避免内容重复
- 支持工具调用
- 后序遍历执行

**执行流程**：
1. 后序遍历所有节点
2. 每个节点创建独立的Agent Session
3. NodeAgent可以看到子节点内容
4. 智能决策是否生成内容或调用工具

## 技术实现

### 后序遍历实现

```typescript
async function postOrderTraverse(
  node: DocumentOutlineNode,
  outlineTree: DocumentOutlineNode,
  globalUserPrompt: string,
  docFormat: 'md' | 'tex',
  signal?: AbortSignal,
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void,
  activeNodePaths: Set<string> = new Set(),
  executedNodes: Map<string, { content?: string; children?: DocumentOutlineNode[] }> = new Map()
): Promise<void> {
  // 1. 先递归处理所有子节点
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      await postOrderTraverse(...)
    }
  }

  // 2. 处理当前节点（子节点已完成）
  // - 创建独立Agent Session
  // - 执行任务
  // - 提取生成内容
}
```

### Agent Session创建

每个节点创建一个独立的Agent Session：

```typescript
const nodeSession: AgentSession = {
  entityType: 'agent-session',
  id: `node-agent-${node.path}-${Date.now()}`,
  agentId: defaultAgentConfig.id,
  engineId: defaultAgentConfig.engineId,
  messages: [],
  // ...
  metadata: {
    nodePath: node.path,
    nodeTitle: node.title,
    parentPath: parentPath
  }
}
```

### 系统提示词结构

```
# NodeAgent系统提示词

## 当前节点信息
- 路径、标题、层级

## 全局上下文
- 用户提示词、文档格式

## 子节点内容（已处理完成）
- 列出所有子节点的内容和标题

## 执行原则
- 后序遍历原则
- 内容生成建议
- 工具调用说明

## 输出格式
- 直接输出文本内容
- 或调用工具
```

## UI/UX设计

### Outline.vue 集成

#### 1. 节点操作菜单

在节点操作菜单中添加：
- **NodeAgent**按钮：触发节点智能体
- 显示节点执行状态（执行中/已完成/失败）
- 高亮显示正在执行的节点

#### 2. 状态显示

- **活动节点**：黄色高亮，闪烁动画
- **已完成节点**：绿色标记
- **失败节点**：红色标记
- **父节点**：如果有子节点在执行，也高亮显示

#### 3. 提示词输入

- 全局提示词输入框
- 节点级提示词输入框（可选）

### NodeAgent Display组件

显示内容：
- 当前执行节点信息
- 活动节点列表（高亮）
- 已完成节点列表
- 生成内容预览
- 错误信息

## 使用场景

### 场景1：完整文章生成

```
1. 使用 outline-optimize 为根节点生成主要章节
2. 使用 node-agent 从根节点开始，智能生成所有内容
   - 后序遍历：先处理子节点
   - 每个节点查看子节点内容，决定是否需要生成
   - 如需扩写，调用 outline-optimize
```

### 场景2：已有大纲补充内容

```
1. 使用 node-agent 从指定节点开始
2. 智能生成内容，避免与子节点重复
```

### 场景3：调整结构

```
1. 使用 outline-reorder 调整节点顺序
2. 使用 node-agent 重新生成内容（根据新顺序）
```

## 最佳实践

### 1. 工具选择

- **需要快速生成**：使用`outline-optimize`扩写工具
- **需要保证质量**：使用`node-agent`节点智能体
- **需要调整顺序**：使用`outline-reorder`大纲优化工具

### 2. 执行顺序

推荐流程：
```
1. 使用 outline-optimize 快速生成大纲结构
2. 使用 outline-reorder 优化节点顺序（如需要）
3. 使用 node-agent 智能生成内容
```

### 3. 提示词编写

- **全局提示词**：描述整体写作目标和风格
- **节点级提示词**：针对特定节点的特殊要求

## 扩展性设计

### 1. 工具扩展

NodeAgent可以调用任何已注册的工具：
- 扩写工具（outline-optimize）
- 大纲优化工具（outline-reorder）
- 其他工具（根据需求）

### 2. 引擎扩展

支持不同的Agent引擎：
- SimpleChat：轻量对话
- AutoGPT：自主决策
- ReAct：推理+行动
- PlanExecute：计划执行

### 3. 上下文扩展

可以扩展上下文内容：
- 引用文档
- 知识库内容
- 历史对话记录

## 测试策略

### 1. 单元测试

- 后序遍历函数测试
- 系统提示词构建测试
- 内容提取测试

### 2. 集成测试

- NodeAgent Tool完整流程测试
- 与Outline.vue集成测试
- 工具调用测试

### 3. 性能测试

- 大量节点执行性能
- 并发处理性能
- 内存使用测试

## 维护指南

### 1. 日志记录

- 使用`createRendererLogger('NodeAgentTool')`记录日志
- 记录每个节点的执行状态
- 记录工具调用情况

### 2. 错误处理

- 节点执行失败不影响其他节点
- 提供详细的错误信息
- 支持取消操作

### 3. 状态管理

- 使用`activeNodePaths`跟踪活动节点
- 使用`executedNodes`记录已完成节点
- 使用`workspace.lockUI()`防止并发操作

## 后续优化方向

1. **并行执行**：支持同级节点并行处理
2. **缓存机制**：缓存已生成的节点内容
3. **增量更新**：只重新生成修改的节点
4. **模板支持**：支持节点级内容模板
5. **质量评估**：自动评估生成内容的质量

## 相关文件

- `meta-doc/src/renderer/src/utils/agent-tools/node-agent-tool.ts`：NodeAgent Tool实现
- `meta-doc/src/renderer/src/utils/agent-tools/components/NodeAgentDisplay.vue`：Display组件
- `meta-doc/src/renderer/src/utils/agent-tools/outline-optimize-tool.ts`：扩写工具（已重命名）
- `meta-doc/src/renderer/src/utils/agent-tools/outline-reorder-tool.ts`：大纲优化工具
- `meta-doc/src/renderer/src/views/Outline.vue`：Outline视图（集成NodeAgent）

## 版本历史

- **v1.0.0** (2025-01-XX): 初始版本
  - NodeAgent Tool实现
  - 后序遍历执行策略
  - 工具系统重构

