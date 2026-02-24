/**
 * AI Schema Task 单元测试（Vitest）
 * 对应原 unit-tests-register 中的 registerAiSchemaTaskTests
 * 仅测试 buildSchemaPrompt、parseSchemaJson 及 extractOuterJsonString 相关逻辑；
 * generateWithSchema 依赖 Vue 与 AI 调用，请在应用内运行。
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('./regex-utils', () => ({
  extractOuterJsonString: (s: string) => {
    const startIdx = s.search(/[\[{]/)
    if (startIdx === -1) return null
    const openChar = s[startIdx]
    const closeChar = openChar === '{' ? '}' : ']'
    let depth = 0
    for (let i = startIdx; i < s.length; i++) {
      const char = s[i]
      if (char === openChar) depth++
      else if (char === closeChar) {
        depth--
        if (depth === 0) return s.slice(startIdx, i + 1)
      }
    }
    return null
  }
}))

import { buildSchemaPrompt, parseSchemaJson, type SchemaDefinition } from './schemas'

describe('AI Schema Task', () => {
  describe('buildSchemaPrompt', () => {
    it('构建 Schema 提示词包含 schema 与用户提示词', () => {
      const schema: SchemaDefinition = {
        name: 'test_schema',
        description: '测试 Schema',
        schema: { type: 'object', properties: { title: { type: 'string' } } }
      }
      const userPrompt = '请生成一个标题'
      const result = buildSchemaPrompt(schema, userPrompt)
      expect(result).toContain('"type": "object"')
      expect(result).toContain(userPrompt)
      expect(result).toMatch(/请严格输出|严格输出/)
    })

    it('包含示例时提示词中有示例输出', () => {
      const schema: SchemaDefinition = {
        name: 'test_schema',
        description: '测试 Schema',
        schema: { type: 'object', properties: { title: { type: 'string' } } },
        example: '{"title":"示例标题"}'
      }
      const result = buildSchemaPrompt(schema, '请生成标题')
      expect(result).toContain('示例输出')
      expect(result).toContain('示例标题')
    })
  })

  describe('parseSchemaJson', () => {
    it('解析符合 Schema 的 JSON', () => {
      const schema: SchemaDefinition<{ title: string; tags?: string[] }> = {
        name: 'test_schema',
        description: '测试',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } }
          }
        }
      }
      const jsonText = '{"title":"测试标题","tags":["标签1","标签2"]}'
      const result = parseSchemaJson(jsonText, schema)
      expect(result).toEqual({ title: '测试标题', tags: ['标签1', '标签2'] })
    })

    it('从包含额外文本的字符串中提取并解析 JSON', () => {
      const schema: SchemaDefinition<{ title: string }> = {
        name: 'test_schema',
        description: '测试',
        schema: { type: 'object', properties: { title: { type: 'string' } } }
      }
      const text =
        '根据您的要求，我生成了以下结果：{"title":"测试标题"} 希望这符合您的需求。'
      const result = parseSchemaJson(text, schema)
      expect(result).toEqual({ title: '测试标题' })
    })

    it('无有效 JSON 时抛出', () => {
      const schema: SchemaDefinition<{ title: string }> = {
        name: 'test_schema',
        description: '测试',
        schema: { type: 'object', properties: { title: { type: 'string' } } }
      }
      expect(() => parseSchemaJson('没有 JSON 的纯文本', schema)).toThrow()
    })
  })

  describe('extractOuterJsonString 行为（通过 parseSchemaJson）', () => {
    it('提取简单 JSON 对象', () => {
      const schema: SchemaDefinition<Record<string, unknown>> = {
        name: 'any',
        description: '',
        schema: { type: 'object' }
      }
      const text = '这是一些文本 {"title":"测试标题","count":123} 后面还有文本'
      const result = parseSchemaJson(text, schema)
      expect(result).toEqual({ title: '测试标题', count: 123 })
    })

    it('提取嵌套 JSON', () => {
      const schema: SchemaDefinition<Record<string, unknown>> = {
        name: 'any',
        description: '',
        schema: { type: 'object' }
      }
      const text = '前缀 {"outer":{"inner":{"value":123}}} 后缀'
      const result = parseSchemaJson(text, schema)
      expect(result).toEqual({ outer: { inner: { value: 123 } } })
    })

    it('提取 JSON 数组', () => {
      const text = '输出结果：[{"id":1,"name":"项目1"},{"id":2,"name":"项目2"}] 完成'
      const result = parseSchemaJson(text)
      expect(result).toEqual([
        { id: 1, name: '项目1' },
        { id: 2, name: '项目2' }
      ])
    })

    it('不完整 JSON 时抛出', () => {
      const schema: SchemaDefinition<{ title: string }> = {
        name: 'test',
        description: '',
        schema: { type: 'object', properties: { title: { type: 'string' } } }
      }
      expect(() => parseSchemaJson('{"title":"测试标题"', schema)).toThrow()
    })
  })
})
