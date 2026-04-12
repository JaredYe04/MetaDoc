# AI Schema Task 使用说明

## 概述

`ai-schema-task` 是一个可复用的工具函数，用于根据 JSON Schema 和用户提示词，通过 AI 生成符合规范的 JSON 数据。该函数封装了 AI Task 的创建、流式输出、JSON 提取等流程，让调用方只需关注 Schema 定义和提示词即可。

## 功能特性

- ✅ **Schema 驱动**：通过 JSON Schema 约束 AI 输出格式
- ✅ **流式输出**：实时展示 AI 生成过程（通过 ref 回调）
- ✅ **自动提取**：自动使用 `extractOuterJsonString` 提取 JSON 数据
- ✅ **类型安全**：支持 TypeScript 泛型，返回类型化的数据
- ✅ **Chat 模式**：使用 chat 模式的 AI Task，支持多轮对话扩展

## 基本用法

### 1. 导入函数和类型

```typescript
import { ref } from 'vue'
import { generateWithSchema, type SchemaDefinition } from '@/utils/ai-schema-task'
```

### 2. 定义 Schema

首先需要定义一个符合 `SchemaDefinition` 接口的 Schema：

```typescript
interface MyResult {
  title: string
  description: string
  tags: string[]
}

const MY_SCHEMA: SchemaDefinition<MyResult> = {
  name: 'my_schema_v1',
  description: '生成包含标题、描述和标签的数据',
  schema: {
    type: 'object',
    required: ['title', 'description'],
    properties: {
      title: {
        type: 'string',
        description: '标题',
        maxLength: 100
      },
      description: {
        type: 'string',
        description: '描述'
      },
      tags: {
        type: 'array',
        description: '标签列表',
        items: {
          type: 'string'
        },
        maxItems: 10
      }
    }
  },
  example: '{"title":"示例标题","description":"示例描述","tags":["标签1","标签2"]}'
}
```

### 3. 调用函数

```typescript
// 创建用于实时展示输出的 ref
const outputRef = ref('')

try {
  // 调用函数生成数据
  const result = await generateWithSchema<MyResult>(
    MY_SCHEMA,
    '请为"人工智能技术讨论"生成标题、描述和标签',
    outputRef
  )

  // 使用生成的结果
  console.log('标题:', result.title)
  console.log('描述:', result.description)
  console.log('标签:', result.tags)

  // outputRef.value 包含完整的 AI 输出文本
  console.log('完整输出:', outputRef.value)
} catch (error) {
  console.error('生成失败:', error)
}
```

## 高级用法

### 自定义任务名称

```typescript
const result = await generateWithSchema(MY_SCHEMA, '请生成数据', outputRef, {
  taskName: '自定义任务名称'
})
```

### 自定义 LLM 配置

```typescript
const result = await generateWithSchema(MY_SCHEMA, '请生成数据', outputRef, {
  customLlmConfig: {
    baseUrl: 'https://api.example.com',
    model: 'gpt-4',
    apiKey: 'your-api-key'
  }
})
```

### 调整温度参数

```typescript
const result = await generateWithSchema(MY_SCHEMA, '请生成数据', outputRef, {
  temperature: 0.7 // 控制输出的随机性
})
```

### 限制最大 Token 数

```typescript
const result = await generateWithSchema(MY_SCHEMA, '请生成数据', outputRef, {
  maxTokens: 1000
})
```

### 禁用流式输出

```typescript
const result = await generateWithSchema(MY_SCHEMA, '请生成数据', outputRef, {
  stream: false // 禁用流式输出，等待完整结果
})
```

## 完整示例

### 示例 1：生成文档标题和关键词

```typescript
import { ref } from 'vue'
import { generateWithSchema } from '@/utils/ai-schema-task'
import { DOCUMENT_TITLE_SCHEMA, type DocumentTitleSchemaResult } from '@/utils/schemas'

const outputRef = ref('')

async function generateTitle() {
  try {
    const result = await generateWithSchema<DocumentTitleSchemaResult>(
      DOCUMENT_TITLE_SCHEMA,
      '请为关于"项目进度讨论"的对话生成标题和关键词',
      outputRef
    )

    console.log('生成的标题:', result.title)
    console.log('关键词:', result.keywords)

    // 实时输出会显示在 outputRef.value 中
    // 可以在 UI 中绑定这个 ref 来展示实时输出
  } catch (error) {
    console.error('生成失败:', error)
  }
}
```

### 示例 2：在 Vue 组件中使用

```vue
<template>
  <div>
    <button @click="generateData">生成数据</button>
    <div v-if="isGenerating">
      <p>正在生成...</p>
      <pre>{{ outputText }}</pre>
    </div>
    <div v-if="result">
      <h3>{{ result.title }}</h3>
      <p>{{ result.description }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { generateWithSchema } from '@/utils/ai-schema-task'
import type { SchemaDefinition } from '@/utils/ai-schema-task'

interface MyResult {
  title: string
  description: string
}

const MY_SCHEMA: SchemaDefinition<MyResult> = {
  name: 'my_schema',
  description: '生成数据',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' }
    }
  }
}

const outputText = ref('')
const result = ref<MyResult | null>(null)
const isGenerating = ref(false)

async function generateData() {
  isGenerating.value = true
  outputText.value = ''
  result.value = null

  try {
    const data = await generateWithSchema<MyResult>(MY_SCHEMA, '请生成标题和描述', outputText)
    result.value = data
  } catch (error) {
    console.error('生成失败:', error)
  } finally {
    isGenerating.value = false
  }
}
</script>
```

## API 参考

### `generateWithSchema<T>`

执行基于 Schema 的 AI Task。

**参数：**

- `schema: SchemaDefinition<T>` - JSON Schema 定义
- `userPrompt: string` - 用户提示词
- `outputRef: Ref<string>` - 用于实时展示输出的 ref
- `options?: SchemaTaskOptions` - 可选配置项

**返回：**

- `Promise<T>` - 解析后符合 Schema 的数据

**抛出：**

- `Error` - 当无法提取或解析 JSON 时抛出错误

### `SchemaTaskOptions`

配置选项接口：

```typescript
interface SchemaTaskOptions {
  taskName?: string // 任务名称（默认：`生成 ${schema.name}`）
  customLlmConfig?: any // 自定义 LLM 配置
  temperature?: number // 温度参数
  maxTokens?: number // 最大 token 数
  stream?: boolean // 是否启用流式输出（默认：true）
}
```

### `SchemaDefinition<T>`

Schema 定义接口（来自 `schemas.ts`）：

```typescript
interface SchemaDefinition<T = unknown> {
  name: string // Schema 名称
  description: string // Schema 描述
  schema: Record<string, unknown> // JSON Schema 对象
  example?: string // 示例输出（可选）
}
```

## 工作原理

1. **清空输出**：函数开始执行时，会自动清空 `outputRef.value`
2. **构建提示词**：使用 `buildSchemaPrompt` 将 Schema 和用户提示词组合
3. **创建 AI Task**：使用 `createAiTask` 创建 chat 模式的 AI 任务
4. **流式输出**：AI 的输出会实时更新到 `outputRef.value`
5. **提取 JSON**：任务完成后，使用 `extractOuterJsonString` 提取 JSON 字符串
6. **解析返回**：解析 JSON 并返回类型化的数据

## 注意事项

1. **ref 清空**：函数会在开始执行前自动清空 `outputRef.value`，无需手动清空
2. **错误处理**：建议使用 try-catch 捕获可能的错误
3. **流式输出**：默认启用流式输出，可以通过 `stream: false` 禁用
4. **JSON 提取**：函数会自动使用 `extractOuterJsonString` 提取 JSON，即使 AI 输出中包含其他文本也能正确提取
5. **类型安全**：使用 TypeScript 泛型可以获得类型提示和类型检查

## 常见问题

### Q: 如果 AI 输出的 JSON 格式不正确怎么办？

A: 函数会自动使用 `extractOuterJsonString` 提取 JSON 部分，即使输出中包含其他文本也能正确提取。如果仍然无法提取，会抛出包含错误信息的异常。

### Q: 如何取消正在执行的任务？

A: 可以通过 `createAiTask` 返回的 `handle` 调用 `cancelAiTask(handle)` 来取消任务。但 `generateWithSchema` 目前不直接返回 handle，如需取消功能，可以修改函数或直接使用 `createAiTask`。

### Q: 可以在非 Vue 组件中使用吗？

A: 可以，但需要确保 `outputRef` 是一个 Vue 的 `Ref<string>` 对象。可以使用 `ref('')` 创建。

### Q: 如何查看任务执行状态？

A: 任务会自动添加到任务队列中，可以通过任务队列 UI 查看执行状态。任务名称可以通过 `options.taskName` 自定义。

## 相关文件

- `meta-doc/src/renderer/src/utils/ai-schema-task.ts` - 函数实现
- `meta-doc/src/renderer/src/utils/schemas.ts` - Schema 定义和工具函数
- `meta-doc/src/renderer/src/utils/ai_tasks.ts` - AI Task 核心实现
- `meta-doc/src/renderer/src/utils/regex-utils.js` - JSON 提取工具
