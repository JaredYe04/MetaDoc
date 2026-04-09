/**
 * AI Schema Task 单元测试
 * 用于测试 generateWithSchema 函数及其相关功能
 */

import { ref } from 'vue'
import { testFramework, type TestFunction } from '../testing/test-framework'
import { buildSchemaPrompt, type SchemaDefinition, parseSchemaJson } from '../common/schemas'
import { extractOuterJsonString } from '../regex-utils'
import { generateWithSchema } from './ai-schema-task'

/**
 * 验证 JSON 数据是否符合 Schema 定义
 */
function validateSchema<T>(
  data: any,
  schema: SchemaDefinition<T>
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!data || typeof data !== 'object') {
    errors.push('数据必须是对象类型')
    return { valid: false, errors }
  }

  const schemaObj = schema.schema as any

  // 检查必需字段
  if (schemaObj.required && Array.isArray(schemaObj.required)) {
    for (const field of schemaObj.required) {
      if (!(field in data) || data[field] === undefined || data[field] === null) {
        errors.push(`缺少必需字段: ${field}`)
      }
    }
  }

  // 检查属性类型
  if (schemaObj.properties) {
    for (const [field, value] of Object.entries(data)) {
      const fieldSchema = (schemaObj.properties as any)[field]
      if (fieldSchema) {
        const expectedType = fieldSchema.type

        // 类型检查
        if (expectedType) {
          const actualType = Array.isArray(value) ? 'array' : typeof value
          if (actualType !== expectedType) {
            errors.push(`字段 ${field} 类型不匹配: 期望 ${expectedType}, 实际 ${actualType}`)
          }
        }

        // 数组项类型检查
        if (expectedType === 'array' && fieldSchema.items) {
          if (!Array.isArray(value)) {
            errors.push(`字段 ${field} 应该是数组类型`)
          } else {
            const itemType = fieldSchema.items.type
            for (let i = 0; i < value.length; i++) {
              const itemActualType = typeof value[i]
              if (itemActualType !== itemType) {
                errors.push(
                  `字段 ${field}[${i}] 类型不匹配: 期望 ${itemType}, 实际 ${itemActualType}`
                )
              }
            }
          }
        }

        // 字符串长度检查
        if (expectedType === 'string' && fieldSchema.maxLength) {
          if (typeof value === 'string' && value.length > fieldSchema.maxLength) {
            errors.push(
              `字段 ${field} 长度超过限制: 最大 ${fieldSchema.maxLength}, 实际 ${value.length}`
            )
          }
        }

        // 数组长度检查
        if (expectedType === 'array' && fieldSchema.maxItems) {
          if (Array.isArray(value) && value.length > fieldSchema.maxItems) {
            errors.push(
              `字段 ${field} 数组长度超过限制: 最大 ${fieldSchema.maxItems}, 实际 ${value.length}`
            )
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

// ============ 测试用例定义 ============

/**
 * 测试用例1: buildSchemaPrompt - 基本功能
 */
const testBuildSchemaPrompt: TestFunction = {
  id: 'ai-schema-task.build-prompt',
  name: '构建 Schema 提示词',
  description: '测试 buildSchemaPrompt 函数是否正确组合 schema 和用户提示词',
  module: 'AI Schema Task',
  fn: (userPrompt: string) => {
    const schema: SchemaDefinition = {
      name: 'test_schema',
      description: '测试 Schema',
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' }
        }
      }
    }

    const result = buildSchemaPrompt(schema, userPrompt)
    const hasSchema = result.includes('"type": "object"')
    const hasUserPrompt = result.includes(userPrompt)
    const hasInstruction = result.includes('请严格输出')

    return {
      input: { userPrompt },
      output: result,
      expected: '包含 schema、用户提示词和指令',
      passed: hasSchema && hasUserPrompt && hasInstruction,
      note: `结果长度: ${result.length} 字符`
    }
  },
  params: [
    {
      name: 'userPrompt',
      type: 'string',
      defaultValue: '请生成一个标题',
      description: '用户提示词'
    }
  ]
}

/**
 * 测试用例2: extractOuterJsonString - 提取简单 JSON 对象
 */
const testExtractSimpleJson: TestFunction = {
  id: 'ai-schema-task.extract-simple-json',
  name: '提取简单 JSON 对象',
  description: '测试从文本中提取简单的 JSON 对象',
  module: 'AI Schema Task',
  fn: (text: string) => {
    const result = extractOuterJsonString(text)
    const expected = '{"title":"测试标题","count":123}'

    return {
      input: { text },
      output: result,
      expected,
      passed: result === expected,
      note: result ? `成功提取 ${result.length} 字符` : '未找到 JSON'
    }
  },
  params: [
    {
      name: 'text',
      type: 'string',
      defaultValue: '这是一些文本 {"title":"测试标题","count":123} 后面还有文本',
      description: '包含 JSON 的文本'
    }
  ]
}

/**
 * 测试用例3: extractOuterJsonString - 提取嵌套 JSON
 */
const testExtractNestedJson: TestFunction = {
  id: 'ai-schema-task.extract-nested-json',
  name: '提取嵌套 JSON 对象',
  description: '测试从文本中提取嵌套的 JSON 对象（提取最外层）',
  module: 'AI Schema Task',
  fn: (text: string) => {
    const result = extractOuterJsonString(text)
    const expected = '{"outer":{"inner":{"value":123}}}'

    return {
      input: { text },
      output: result,
      expected,
      passed: result === expected,
      note: result ? `成功提取嵌套 JSON` : '未找到 JSON'
    }
  },
  params: [
    {
      name: 'text',
      type: 'string',
      defaultValue: '前缀文本 {"outer":{"inner":{"value":123}}} 后缀文本',
      description: '包含嵌套 JSON 的文本'
    }
  ]
}

/**
 * 测试用例4: extractOuterJsonString - 提取 JSON 数组
 */
const testExtractJsonArray: TestFunction = {
  id: 'ai-schema-task.extract-json-array',
  name: '提取 JSON 数组',
  description: '测试从文本中提取 JSON 数组',
  module: 'AI Schema Task',
  fn: (text: string) => {
    const result = extractOuterJsonString(text)
    const expected = '[{"id":1,"name":"项目1"},{"id":2,"name":"项目2"}]'

    return {
      input: { text },
      output: result,
      expected,
      passed: result === expected,
      note: result ? `成功提取数组，包含 ${JSON.parse(result).length} 个元素` : '未找到 JSON'
    }
  },
  params: [
    {
      name: 'text',
      type: 'string',
      defaultValue: '输出结果：[{"id":1,"name":"项目1"},{"id":2,"name":"项目2"}] 完成',
      description: '包含 JSON 数组的文本'
    }
  ]
}

/**
 * 测试用例5: parseSchemaJson - 解析符合 Schema 的 JSON
 */
const testParseSchemaJson: TestFunction = {
  id: 'ai-schema-task.parse-schema-json',
  name: '解析符合 Schema 的 JSON',
  description: '测试 parseSchemaJson 函数解析符合 Schema 的 JSON',
  module: 'AI Schema Task',
  fn: (jsonText: string) => {
    const schema: SchemaDefinition<{ title: string; tags?: string[] }> = {
      name: 'test_schema',
      description: '测试 Schema',
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } }
        }
      }
    }

    try {
      const result = parseSchemaJson(jsonText, schema)
      return {
        input: { jsonText },
        output: result,
        expected: '包含 title 属性的对象',
        passed: typeof result === 'object' && 'title' in result,
        note: `成功解析，title: ${result.title}`
      }
    } catch (error) {
      return {
        input: { jsonText },
        output: null,
        expected: '包含 title 属性的对象',
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  },
  params: [
    {
      name: 'jsonText',
      type: 'string',
      defaultValue: '{"title":"测试标题","tags":["标签1","标签2"]}',
      description: '符合 Schema 的 JSON 文本'
    }
  ]
}

/**
 * 测试用例6: parseSchemaJson - 处理包含额外文本的 JSON
 */
const testParseJsonWithExtraText: TestFunction = {
  id: 'ai-schema-task.parse-json-extra-text',
  name: '解析包含额外文本的 JSON',
  description: '测试从包含额外文本的字符串中提取并解析 JSON',
  module: 'AI Schema Task',
  fn: (text: string) => {
    const schema: SchemaDefinition<{ title: string }> = {
      name: 'test_schema',
      description: '测试 Schema',
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' }
        }
      }
    }

    try {
      const result = parseSchemaJson(text, schema)
      return {
        input: { text },
        output: result,
        expected: '包含 title 属性的对象',
        passed: typeof result === 'object' && 'title' in result,
        note: `成功从包含额外文本的字符串中提取并解析 JSON，title: ${result.title}`
      }
    } catch (error) {
      return {
        input: { text },
        output: null,
        expected: '包含 title 属性的对象',
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  },
  params: [
    {
      name: 'text',
      type: 'string',
      defaultValue: '根据您的要求，我生成了以下结果：{"title":"测试标题"} 希望这符合您的需求。',
      description: '包含 JSON 和其他文本的字符串'
    }
  ]
}

/**
 * 测试用例7: extractOuterJsonString - 处理不完整的 JSON
 */
const testExtractIncompleteJson: TestFunction = {
  id: 'ai-schema-task.extract-incomplete-json',
  name: '处理不完整的 JSON',
  description: '测试当 JSON 不完整时的提取行为',
  module: 'AI Schema Task',
  fn: (text: string) => {
    const result = extractOuterJsonString(text)

    return {
      input: { text },
      output: result,
      expected: 'null（因为 JSON 不完整）',
      passed: result === null,
      note: result ? `意外提取到: ${result}` : '正确返回 null（JSON 不完整）'
    }
  },
  params: [
    {
      name: 'text',
      type: 'string',
      defaultValue: '{"title":"测试标题"',
      description: '不完整的 JSON（缺少闭合括号）'
    }
  ]
}

/**
 * 测试用例8: buildSchemaPrompt - 包含示例的 Schema
 */
const testBuildPromptWithExample: TestFunction = {
  id: 'ai-schema-task.build-prompt-example',
  name: '构建包含示例的 Schema 提示词',
  description: '测试当 Schema 包含示例时的提示词构建',
  module: 'AI Schema Task',
  fn: (userPrompt: string) => {
    const schema: SchemaDefinition = {
      name: 'test_schema',
      description: '测试 Schema',
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' }
        }
      },
      example: '{"title":"示例标题"}'
    }

    const result = buildSchemaPrompt(schema, userPrompt)
    const hasExample = result.includes('示例输出')
    const hasExampleContent = result.includes('示例标题')

    return {
      input: { userPrompt },
      output: result,
      expected: '包含示例输出部分',
      passed: hasExample && hasExampleContent,
      note: `示例部分: ${hasExample ? '已包含' : '未包含'}`
    }
  },
  params: [
    {
      name: 'userPrompt',
      type: 'string',
      defaultValue: '请生成一个标题',
      description: '用户提示词'
    }
  ]
}

/**
 * 测试用例9: extractOuterJsonString - 多个 JSON 对象（提取第一个）
 */
const testExtractFirstJson: TestFunction = {
  id: 'ai-schema-task.extract-first-json',
  name: '提取第一个 JSON 对象',
  description: '测试当文本包含多个 JSON 对象时，提取第一个（最外层）',
  module: 'AI Schema Task',
  fn: (text: string) => {
    const result = extractOuterJsonString(text)
    const expected = '{"first":{"value":1}}'

    return {
      input: { text },
      output: result,
      expected,
      passed: result === expected,
      note: result ? `提取了第一个 JSON: ${result}` : '未找到 JSON'
    }
  },
  params: [
    {
      name: 'text',
      type: 'string',
      defaultValue: '{"first":{"value":1}} 中间文本 {"second":{"value":2}}',
      description: '包含多个 JSON 对象的文本'
    }
  ]
}

/**
 * 测试用例10: 组合测试 - 完整的流程模拟
 */
const testCompleteFlow: TestFunction = {
  id: 'ai-schema-task.complete-flow',
  name: '完整流程模拟',
  description: '模拟完整的 generateWithSchema 流程（不实际调用 AI）',
  module: 'AI Schema Task',
  fn: (userPrompt: string, aiOutput: string) => {
    // 1. 构建 Schema
    const schema: SchemaDefinition<{ title: string; description?: string }> = {
      name: 'test_schema',
      description: '测试 Schema',
      schema: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' }
        }
      }
    }

    // 2. 构建提示词
    const fullPrompt = buildSchemaPrompt(schema, userPrompt)

    // 3. 模拟 AI 输出（使用传入的 aiOutput）
    // 4. 提取 JSON
    const jsonString = extractOuterJsonString(aiOutput)

    if (!jsonString) {
      return {
        input: { userPrompt, aiOutput },
        output: null,
        expected: '成功提取并解析 JSON',
        passed: false,
        error: '未能从 AI 输出中提取 JSON'
      }
    }

    // 5. 解析 JSON
    try {
      const result = parseSchemaJson(jsonString, schema)
      return {
        input: { userPrompt, aiOutput },
        output: {
          promptLength: fullPrompt.length,
          extractedJson: jsonString,
          parsedResult: result
        },
        expected: '成功完成所有步骤',
        passed: typeof result === 'object' && 'title' in result,
        note: `提示词长度: ${fullPrompt.length}, 提取的 JSON: ${jsonString.substring(0, 50)}...`
      }
    } catch (error) {
      return {
        input: { userPrompt, aiOutput },
        output: null,
        expected: '成功完成所有步骤',
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  },
  params: [
    {
      name: 'userPrompt',
      type: 'string',
      defaultValue: '请生成一个标题和描述',
      description: '用户提示词'
    },
    {
      name: 'aiOutput',
      type: 'string',
      defaultValue:
        '根据您的要求，我生成了以下结果：{"title":"测试标题","description":"这是一个测试描述"} 希望这符合您的需求。',
      description: '模拟的 AI 输出（包含 JSON 和其他文本）'
    }
  ]
}

// ============ 全链路测试用例（实际调用 AI） ============

/**
 * 全链路测试1: 简单标题生成
 */
const testFullChainSimpleTitle: TestFunction = {
  id: 'ai-schema-task.full-chain-simple-title',
  name: '全链路测试 - 简单标题生成',
  description: '实际调用 AI 生成简单标题，验证输出是否符合 Schema',
  module: 'AI Schema Task',
  fn: async (userPrompt: string) => {
    const schema: SchemaDefinition<{ title: string }> = {
      name: 'simple_title_schema',
      description: '生成简单标题',
      schema: {
        type: 'object',
        required: ['title'],
        properties: {
          title: {
            type: 'string',
            description: '标题',
            maxLength: 100
          }
        }
      }
    }

    const outputRef = ref('')

    try {
      const result = await generateWithSchema<{ title: string }>(schema, userPrompt, outputRef)

      // 验证结果是否符合 Schema
      const validation = validateSchema(result, schema)

      return {
        input: { userPrompt },
        output: {
          result,
          outputText: outputRef.value.substring(0, 200),
          validation
        },
        expected: '返回符合 Schema 的 JSON 对象',
        passed: validation.valid && typeof result.title === 'string' && result.title.length > 0,
        note: validation.valid
          ? `✅ Schema 验证通过，标题: "${result.title}"`
          : `❌ Schema 验证失败: ${validation.errors.join(', ')}`,
        errors: validation.errors.length > 0 ? validation.errors : undefined
      }
    } catch (error) {
      return {
        input: { userPrompt },
        output: null,
        expected: '返回符合 Schema 的 JSON 对象',
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  },
  params: [
    {
      name: 'userPrompt',
      type: 'string',
      defaultValue: '请为"项目进度讨论"生成一个简洁的标题',
      description: '用户提示词'
    }
  ]
}

/**
 * 全链路测试2: 标题和关键词生成
 */
const testFullChainTitleWithKeywords: TestFunction = {
  id: 'ai-schema-task.full-chain-title-keywords',
  name: '全链路测试 - 标题和关键词生成',
  description: '实际调用 AI 生成标题和关键词，验证输出是否符合 Schema',
  module: 'AI Schema Task',
  fn: async (userPrompt: string) => {
    const schema: SchemaDefinition<{ title: string; keywords?: string[] }> = {
      name: 'title_keywords_schema',
      description: '生成标题和关键词',
      schema: {
        type: 'object',
        required: ['title'],
        properties: {
          title: {
            type: 'string',
            description: '标题',
            maxLength: 50
          },
          keywords: {
            type: 'array',
            description: '关键词列表',
            items: {
              type: 'string',
              maxLength: 20
            },
            maxItems: 5
          }
        }
      },
      example: '{"title":"项目进度讨论","keywords":["项目","进度"]}'
    }

    const outputRef = ref('')

    try {
      const result = await generateWithSchema<{ title: string; keywords?: string[] }>(
        schema,
        userPrompt,
        outputRef
      )

      // 验证结果是否符合 Schema
      const validation = validateSchema(result, schema)

      return {
        input: { userPrompt },
        output: {
          result,
          outputText: outputRef.value.substring(0, 200),
          validation
        },
        expected: '返回包含 title 和可选 keywords 的 JSON 对象',
        passed: validation.valid && typeof result.title === 'string' && result.title.length > 0,
        note: validation.valid
          ? `✅ Schema 验证通过，标题: "${result.title}", 关键词: ${result.keywords?.length || 0} 个`
          : `❌ Schema 验证失败: ${validation.errors.join(', ')}`,
        errors: validation.errors.length > 0 ? validation.errors : undefined
      }
    } catch (error) {
      return {
        input: { userPrompt },
        output: null,
        expected: '返回包含 title 和可选 keywords 的 JSON 对象',
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  },
  params: [
    {
      name: 'userPrompt',
      type: 'string',
      defaultValue: '请为"人工智能技术讨论"生成标题和3-5个关键词',
      description: '用户提示词'
    }
  ]
}

/**
 * 全链路测试3: 复杂对象生成
 */
const testFullChainComplexObject: TestFunction = {
  id: 'ai-schema-task.full-chain-complex-object',
  name: '全链路测试 - 复杂对象生成',
  description: '实际调用 AI 生成包含多个字段的复杂对象，验证输出是否符合 Schema',
  module: 'AI Schema Task',
  fn: async (userPrompt: string) => {
    const schema: SchemaDefinition<{
      title: string
      description: string
      tags: string[]
      priority: number
    }> = {
      name: 'complex_object_schema',
      description: '生成复杂对象',
      schema: {
        type: 'object',
        required: ['title', 'description', 'tags', 'priority'],
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
          },
          priority: {
            type: 'number',
            description: '优先级（1-10）',
            minimum: 1,
            maximum: 10
          }
        }
      }
    }

    const outputRef = ref('')

    try {
      const result = await generateWithSchema<{
        title: string
        description: string
        tags: string[]
        priority: number
      }>(schema, userPrompt, outputRef)

      // 验证结果是否符合 Schema
      const validation = validateSchema(result, schema)

      // 额外的业务逻辑验证
      const businessValidation: string[] = []
      if (result.priority < 1 || result.priority > 10) {
        businessValidation.push(`priority 应该在 1-10 之间，实际: ${result.priority}`)
      }

      const allValid = validation.valid && businessValidation.length === 0

      return {
        input: { userPrompt },
        output: {
          result,
          outputText: outputRef.value.substring(0, 300),
          validation,
          businessValidation
        },
        expected: '返回包含所有必需字段的复杂对象',
        passed:
          allValid &&
          typeof result.title === 'string' &&
          typeof result.description === 'string' &&
          Array.isArray(result.tags) &&
          typeof result.priority === 'number',
        note: allValid
          ? `✅ Schema 验证通过，包含 ${Object.keys(result).length} 个字段`
          : `❌ 验证失败: ${[...validation.errors, ...businessValidation].join(', ')}`,
        errors:
          [...validation.errors, ...businessValidation].length > 0
            ? [...validation.errors, ...businessValidation]
            : undefined
      }
    } catch (error) {
      return {
        input: { userPrompt },
        output: null,
        expected: '返回包含所有必需字段的复杂对象',
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  },
  params: [
    {
      name: 'userPrompt',
      type: 'string',
      defaultValue: '请为"新功能开发任务"生成一个包含标题、描述、标签和优先级的任务对象',
      description: '用户提示词'
    }
  ]
}

/**
 * 全链路测试4: 数组类型生成
 */
const testFullChainArrayType: TestFunction = {
  id: 'ai-schema-task.full-chain-array-type',
  name: '全链路测试 - 数组类型生成',
  description: '实际调用 AI 生成数组类型数据，验证输出是否符合 Schema',
  module: 'AI Schema Task',
  fn: async (userPrompt: string) => {
    const schema: SchemaDefinition<{ items: Array<{ id: number; name: string }> }> = {
      name: 'array_type_schema',
      description: '生成包含数组的对象',
      schema: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            description: '项目列表',
            items: {
              type: 'object',
              required: ['id', 'name'],
              properties: {
                id: {
                  type: 'number',
                  description: '项目ID'
                },
                name: {
                  type: 'string',
                  description: '项目名称'
                }
              }
            },
            minItems: 2,
            maxItems: 5
          }
        }
      }
    }

    const outputRef = ref('')

    try {
      const result = await generateWithSchema<{ items: Array<{ id: number; name: string }> }>(
        schema,
        userPrompt,
        outputRef
      )

      // 验证结果是否符合 Schema
      const validation = validateSchema(result, schema)

      // 额外的数组长度验证
      const arrayValidation: string[] = []
      if (!Array.isArray(result.items)) {
        arrayValidation.push('items 应该是数组类型')
      } else {
        if (result.items.length < 2) {
          arrayValidation.push(`items 数组长度应该至少为 2，实际: ${result.items.length}`)
        }
        if (result.items.length > 5) {
          arrayValidation.push(`items 数组长度应该最多为 5，实际: ${result.items.length}`)
        }
        // 验证数组项结构
        result.items.forEach((item, index) => {
          if (typeof item.id !== 'number') {
            arrayValidation.push(`items[${index}].id 应该是数字类型`)
          }
          if (typeof item.name !== 'string') {
            arrayValidation.push(`items[${index}].name 应该是字符串类型`)
          }
        })
      }

      const allValid = validation.valid && arrayValidation.length === 0

      return {
        input: { userPrompt },
        output: {
          result,
          outputText: outputRef.value.substring(0, 300),
          validation,
          arrayValidation
        },
        expected: '返回包含符合 Schema 的数组对象',
        passed: allValid && Array.isArray(result.items) && result.items.length >= 2,
        note: allValid
          ? `✅ Schema 验证通过，数组包含 ${result.items.length} 个项目`
          : `❌ 验证失败: ${[...validation.errors, ...arrayValidation].join(', ')}`,
        errors:
          [...validation.errors, ...arrayValidation].length > 0
            ? [...validation.errors, ...arrayValidation]
            : undefined
      }
    } catch (error) {
      return {
        input: { userPrompt },
        output: null,
        expected: '返回包含符合 Schema 的数组对象',
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  },
  params: [
    {
      name: 'userPrompt',
      type: 'string',
      defaultValue: '请生成一个包含3个项目的列表，每个项目有id和name字段',
      description: '用户提示词'
    }
  ]
}

/**
 * 全链路测试5: 使用 DOCUMENT_TITLE_SCHEMA
 */
const testFullChainDocumentTitle: TestFunction = {
  id: 'ai-schema-task.full-chain-document-title',
  name: '全链路测试 - 文档标题 Schema',
  description: '使用实际的 DOCUMENT_TITLE_SCHEMA 进行全链路测试',
  module: 'AI Schema Task',
  fn: async (userPrompt: string) => {
    // 导入实际的 DOCUMENT_TITLE_SCHEMA
    const { DOCUMENT_TITLE_SCHEMA } = await import('./schemas')

    const outputRef = ref('')

    try {
      const result = await generateWithSchema(DOCUMENT_TITLE_SCHEMA, userPrompt, outputRef)

      // 验证结果是否符合 Schema
      const validation = validateSchema(result, DOCUMENT_TITLE_SCHEMA)

      return {
        input: { userPrompt },
        output: {
          result,
          outputText: outputRef.value.substring(0, 200),
          validation
        },
        expected: '返回符合 DOCUMENT_TITLE_SCHEMA 的对象',
        passed:
          validation.valid &&
          typeof result.title === 'string' &&
          result.title.length > 0 &&
          (!result.keywords || Array.isArray(result.keywords)),
        note: validation.valid
          ? `✅ Schema 验证通过，标题: "${result.title}", 关键词: ${result.keywords?.length || 0} 个`
          : `❌ Schema 验证失败: ${validation.errors.join(', ')}`,
        errors: validation.errors.length > 0 ? validation.errors : undefined
      }
    } catch (error) {
      return {
        input: { userPrompt },
        output: null,
        expected: '返回符合 DOCUMENT_TITLE_SCHEMA 的对象',
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  },
  params: [
    {
      name: 'userPrompt',
      type: 'string',
      defaultValue: '请为关于"项目进度讨论"的对话生成标题和关键词',
      description: '用户提示词'
    }
  ]
}

// ============ 注册所有测试函数 ============

/**
 * 注册所有 AI Schema Task 测试用例
 */
export function registerAiSchemaTaskTests() {
  // 基础功能测试
  testFramework.register(testBuildSchemaPrompt)
  testFramework.register(testExtractSimpleJson)
  testFramework.register(testExtractNestedJson)
  testFramework.register(testExtractJsonArray)
  testFramework.register(testParseSchemaJson)
  testFramework.register(testParseJsonWithExtraText)
  testFramework.register(testExtractIncompleteJson)
  testFramework.register(testBuildPromptWithExample)
  testFramework.register(testExtractFirstJson)
  testFramework.register(testCompleteFlow)

  // 全链路测试（实际调用 AI）
  testFramework.register(testFullChainSimpleTitle)
  testFramework.register(testFullChainTitleWithKeywords)
  testFramework.register(testFullChainComplexObject)
  testFramework.register(testFullChainArrayType)
  testFramework.register(testFullChainDocumentTitle)
}
