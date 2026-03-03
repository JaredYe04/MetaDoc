# Draw.io 集成指南

## 概述

工作流画布需要集成 draw.io（mxgraph）来实现完整的图形编辑功能。本文档说明如何集成 draw.io 到 WorkflowCanvas 组件中。

## 方案选择

### 方案1：使用 mxgraph 库（推荐）

mxgraph 是 draw.io 的底层库，可以直接集成到 Vue 组件中。

**安装依赖：**

```bash
npm install mxgraph
```

**使用示例：**

```typescript
import { mxGraph, mxGraphModel, mxEditor, mxUtils, mxConstants } from 'mxgraph'

// 在组件中初始化
const graph = new mxGraph(container)
```

### 方案2：使用 draw.io 在线编辑器（通过 iframe）

可以直接嵌入 draw.io 的在线编辑器：

```html
<iframe src="https://app.diagrams.net/?embed=1&ui=atlas&spin=1&proto=json" />
```

### 方案3：使用 @drawio/core（官方SDK）

Draw.io 提供了官方 SDK：

```bash
npm install @drawio/core
```

## 推荐实现步骤

1. **安装依赖**

   ```bash
   npm install mxgraph
   ```

2. **创建 mxgraph 封装组件**
   - 封装 mxGraph 实例
   - 实现节点拖拽、连接等功能
   - 将工作流节点映射为 mxgraph 图形

3. **集成到 WorkflowCanvas.vue**
   - 替换现有的简化实现
   - 添加工具栏和属性面板
   - 实现工作流的图形编辑

4. **数据同步**
   - 将工作流定义转换为 mxgraph 图形
   - 将 mxgraph 图形转换回工作流定义

## 当前状态

WorkflowCanvas 组件目前提供了一个简化的基础实现，支持：

- 基本的节点显示
- 节点选择
- 节点属性编辑

完整的 draw.io 集成需要：

- 安装并配置 mxgraph
- 实现图形编辑功能
- 实现节点连接和布局
- 实现工作流验证的可视化反馈

## 参考资料

- [mxgraph 官方文档](https://jgraph.github.io/mxgraph/docs/manual.html)
- [draw.io 集成指南](https://www.diagrams.net/doc/faq/supported-url-parameters)
- [mxgraph TypeScript 类型定义](https://github.com/jgraph/mxgraph)

## 注意事项

1. mxgraph 是一个大型库，需要考虑打包大小
2. 需要处理主题适配（明暗模式）
3. 需要处理国际化（中文支持）
4. 需要实现节点和边的自定义图形（工具节点、控制流节点等）
