# Agent配置（AgentConfig）系统文档

## 概述

AgentConfig是Agent框架中用于定义不同场景下Agent预设配置的实体。每个AgentConfig对应一套或多套工具集，决定了Agent在不同场景下可以使用哪些工具。

## 核心概念

### 1. AgentConfig结构

```typescript
interface AgentConfig {
  id: string // 唯一标识
  name: LocalizedText // 名称（支持i18n）
  description: LocalizedText // 描述（支持i18n）
  version: string // 版本号
  toolCollectionIds: string[] // 工具集ID列表（取交集）
  llmConfig?: {
    // LLM配置
    model?: string
    temperature?: number
    maxTokens?: number
    systemPrompt?: string
  }
  behavior?: {
    // Agent行为配置
    allowToolCalls?: boolean
    allowWorkflowCalls?: boolean
    maxToolCalls?: number
    enableThoughts?: boolean
  }
  scenario?: string // 场景类型
}
```

### 2. 工具集交集

AgentConfig可以关联多个工具集，可用的工具取所有工具集的交集：

- 如果AgentConfig关联工具集A和工具集B
- 工具集A包含：`[tool1, tool2, tool3]`
- 工具集B包含：`[tool2, tool3, tool4]`
- 则AgentConfig可用工具为：`[tool2, tool3]`

### 3. 场景类型

预定义的场景类型：

- `outline`：大纲场景
- `editor`：编辑器场景
- `analysis`：文档阅读分析场景
- `visualization`：可视化场景
- `custom`：自定义场景

## 使用方式

### 创建AgentConfig

```typescript
import { agentConfigManager } from '@/utils/agent-framework'

const config = agentConfigManager.createConfig(
  '数据分析Agent',
  '专门用于数据分析和可视化的Agent配置',
  ['data-analysis-collection', 'visualization-collection']
)
```

### 配置LLM

```typescript
agentConfigManager.updateConfig(config.id, {
  llmConfig: {
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 2000,
    systemPrompt: '你是一个专业的数据分析师...'
  }
})
```

### 配置行为

```typescript
agentConfigManager.updateConfig(config.id, {
  behavior: {
    allowToolCalls: true,
    allowWorkflowCalls: true,
    maxToolCalls: 10,
    enableThoughts: true
  },
  scenario: 'analysis'
})
```

### 获取可用工具

```typescript
const availableToolIds = agentConfigManager.getAvailableToolIds(config.id)
```

### 验证配置

```typescript
const validation = agentConfigManager.validateConfig(config)
if (!validation.valid) {
  console.error('配置验证失败:', validation.errors)
}
if (validation.warnings.length > 0) {
  console.warn('配置警告:', validation.warnings)
}
```

## 工具集管理

### 创建工具集

```typescript
import { toolCollectionManager } from '@/utils/agent-framework'

const collection = toolCollectionManager.createCollection(
  '数据分析工具集',
  '包含数据分析相关的工具',
  ['rag-tool', 'chart-generation-tool', 'data-analysis-tool']
)
```

### 添加工具到工具集

```typescript
toolCollectionManager.addToolToCollection(collection.id, 'new-tool-id')
```

### 从工具集移除工具

```typescript
toolCollectionManager.removeToolFromCollection(collection.id, 'tool-id')
```

## 场景示例

### 数据分析Agent

```typescript
// 1. 创建工具集
const analysisCollection = toolCollectionManager.createCollection(
  '数据分析工具集',
  '数据分析相关工具',
  ['rag-tool', 'chart-generation-tool', 'data-analysis-tool']
)

// 2. 创建AgentConfig
const analysisAgent = agentConfigManager.createConfig('数据分析Agent', '用于数据分析和可视化', [
  analysisCollection.id
])

// 3. 配置
agentConfigManager.updateConfig(analysisAgent.id, {
  llmConfig: {
    systemPrompt: '你是一个专业的数据分析师，擅长数据分析和可视化。'
  },
  behavior: {
    allowToolCalls: true,
    maxToolCalls: 15
  },
  scenario: 'analysis'
})
```

### 写作Agent

```typescript
// 1. 创建工具集
const writingCollection = toolCollectionManager.createCollection('写作工具集', '写作相关工具', [
  'chart-generation-tool',
  'diff-tool',
  'grep-tool',
  'rag-tool'
])

// 2. 创建AgentConfig
const writingAgent = agentConfigManager.createConfig('写作Agent', '用于文档写作和编辑', [
  writingCollection.id
])

// 3. 配置
agentConfigManager.updateConfig(writingAgent.id, {
  llmConfig: {
    systemPrompt: '你是一个专业的文档编辑助手，擅长文档写作和优化。'
  },
  behavior: {
    allowToolCalls: true,
    allowWorkflowCalls: true,
    enableThoughts: true
  },
  scenario: 'editor'
})
```

## 序列化与反序列化

### 导出AgentConfig

```typescript
// 导出配置（包含依赖的工具集）
const entity = agentConfigManager.exportConfig('config-id', true)
```

### 导入AgentConfig

```typescript
// 导入配置
const config = agentConfigManager.importConfig(entity, true)
```

## 最佳实践

1. **工具集设计**：

   - 按功能领域组织工具集
   - 保持工具集大小适中
   - 使用清晰的命名和描述

2. **AgentConfig设计**：

   - 为不同场景创建专门的配置
   - 合理配置LLM参数
   - 设置适当的行为限制

3. **工具集交集**：

   - 谨慎使用多个工具集
   - 确保交集不为空
   - 定期检查工具集的有效性

4. **版本管理**：
   - 更新配置时更新版本号
   - 记录变更历史
   - 保持向后兼容

## 相关文件

- 类型定义: `src/types/agent-framework.ts`
- AgentConfig管理器: `src/utils/agent-framework/agent-config-manager.ts`
- 工具集管理器: `src/utils/agent-framework/tool-collection-manager.ts`
