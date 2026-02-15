# 工作区文件系统操作重构

## 概述

本次重构参考 VS Code 的设计模式，将文件系统操作从 UI 行为抽象为「文件系统事务（File System Transactions）」，实现了统一的建模和规范的操作方式。

## 核心架构

### 1. 统一模型层 (`fs-models.ts`)

- **URI 作为唯一身份标识**：所有文件/文件夹使用 URI（`file://` 协议）作为唯一标识
- **FSNode**：统一的文件系统节点模型
- **Selection**：支持跨目录、批量选择
- **ClipboardPayload**：剪贴板存储操作意图（copy/cut），而非文件本身

### 2. 操作计划生成器 (`fs-planner.ts`)

- **FSPlanner**：将用户操作意图转换为可执行的操作计划
- 支持冲突检测和解决（skip/overwrite/rename）
- 递归展开目录操作
- 规范化删除目标（去除子节点，如果父节点在列表中）

### 3. 操作执行器 (`fs-executor.ts`)

- **FSExecutor**：串行执行操作计划
- 提供进度回调
- 错误处理和回滚支持（基础）
- 支持取消操作

### 4. 剪贴板服务 (`clipboard-service.ts`)

- **ClipboardService**：单例模式管理剪贴板状态
- 存储操作意图（copy/cut）和源 URI 列表
- 粘贴后自动清理（如果是 cut 操作）

### 5. 刷新服务 (`refresh-service.ts`)

- **RefreshService**：管理目录刷新逻辑
- 支持防抖（避免频繁刷新）
- 只刷新已展开的目录（diff refresh）

### 6. 树节点模型 (`tree-node.ts`)

- **TreeNode**：UI 展示用的树节点模型
- 基于 FSNode，包含 UI 相关状态

## 使用方式

### 在组件中使用

```typescript
import { useWorkspaceOperations } from '../composables/useWorkspaceOperations'

const ipcRenderer = getIpcRenderer()
const operations = useWorkspaceOperations(ipcRenderer)

// 复制
operations.copy([uri1, uri2])

// 剪切
operations.cut([uri1, uri2])

// 粘贴
const pastedURIs = await operations.paste(targetDirURI)

// 删除
await operations.deleteItems([uri1, uri2])

// 重命名
const newURI = await operations.rename(oldURI, 'newName')
```

## 关键改进

1. **统一建模**：所有操作都通过 Planner → Executor 流程，逻辑清晰
2. **批量操作**：支持跨目录、混合文件/文件夹的批量操作
3. **冲突处理**：在计划生成阶段处理冲突，而非执行时
4. **错误处理**：统一的错误处理和用户反馈
5. **性能优化**：防抖刷新、只刷新已展开目录

## 兼容性

为了保持向后兼容，WorkspaceExplorer 组件中保留了旧的 `selectedPaths`（Set<string>）接口，但内部使用新的 `selection`（Selection）模型。新旧模型通过 computed 属性自动转换。

## 未来扩展

- 支持撤销/重做（Undo/Redo）
- 操作进度条显示
- 批量操作取消功能
- 更细粒度的错误处理和回滚
