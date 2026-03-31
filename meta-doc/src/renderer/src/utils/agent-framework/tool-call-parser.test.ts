/**
 * 工具调用解析器单元测试（Vitest）
 * 对应原 unit-tests-register 中的 registerToolCallParserTests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../regex-utils', () => ({
  extractOuterJsonString: (s: string) => s
}))
vi.mock('../logger', () => ({
  createRendererLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {}
  })
}))

import { parseToolCalls } from './tool-call-processor'

function norm(result: ReturnType<typeof parseToolCalls>) {
  if (!result || result.length === 0) return null
  return result.map((r) => ({ tool_id: r.tool_id, parameters: r.parameters }))
}

describe('工具调用解析器 parseToolCalls', () => {
  describe('标准格式', () => {
    it('标准格式-基本', () => {
      const input =
        '<tool_call>{"name": "chart-generation", "arguments": {"prompt": "生成图表", "type": "line"}}</tool_call>'
      const result = norm(parseToolCalls(input))
      expect(result).toEqual([
        { tool_id: 'chart-generation', parameters: { prompt: '生成图表', type: 'line' } }
      ])
    })

    it('标准格式-多参数', () => {
      const input =
        '<tool_call>{"name": "edit", "arguments": {"action": "insert", "content": "新内容", "position": 100}}</tool_call>'
      const result = norm(parseToolCalls(input))
      expect(result).toEqual([
        {
          tool_id: 'edit',
          parameters: { action: 'insert', content: '新内容', position: 100 }
        }
      ])
    })

    it('标准格式-嵌套对象参数', () => {
      const input =
        '<tool_call>{"name": "chart-generation", "arguments": {"prompt": "图表", "options": {"width": 800, "height": 600}}}</tool_call>'
      const result = norm(parseToolCalls(input))
      expect(result).toEqual([
        {
          tool_id: 'chart-generation',
          parameters: { prompt: '图表', options: { width: 800, height: 600 } }
        }
      ])
    })
  })

  describe('标签变体', () => {
    it('toolCall 驼峰', () => {
      const input = '<toolCall>{"name": "outline-tree", "arguments": {}}</toolCall>'
      const result = norm(parseToolCalls(input))
      expect(result).toEqual([{ tool_id: 'outline-tree', parameters: {} }])
    })

    it('function-call', () => {
      const input =
        '<function-call>{"name": "web-search", "arguments": {"query": "搜索"}}</function-call>'
      const result = norm(parseToolCalls(input))
      expect(result).toEqual([{ tool_id: 'web-search', parameters: { query: '搜索' } }])
    })

    it('function_call 下划线', () => {
      const input =
        '<function_call>{"name": "rag-tool", "arguments": {"query": "查询"}}</function_call>'
      const result = norm(parseToolCalls(input))
      expect(result).toEqual([{ tool_id: 'rag-tool', parameters: { query: '查询' } }])
    })
  })

  describe('字段名称变体', () => {
    it('tool_id', () => {
      const input =
        '<tool_call>{"tool_id": "chart-generation", "arguments": {"type": "bar"}}</tool_call>'
      const result = norm(parseToolCalls(input))
      expect(result).toEqual([{ tool_id: 'chart-generation', parameters: { type: 'bar' } }])
    })

    it('toolId 驼峰', () => {
      const input = '<tool_call>{"toolId": "grep", "parameters": {"pattern": ".*"}}</tool_call>'
      const result = norm(parseToolCalls(input))
      expect(result).toEqual([{ tool_id: 'grep', parameters: { pattern: '.*' } }])
    })

    it('tool', () => {
      const input = '<tool_call>{"tool": "edit", "arguments": {"action": "replace"}}</tool_call>'
      const result = norm(parseToolCalls(input))
      expect(result).toEqual([{ tool_id: 'edit', parameters: { action: 'replace' } }])
    })

    it('params', () => {
      const input = '<tool_call>{"name": "grep", "params": {"pattern": "test"}}</tool_call>'
      const result = norm(parseToolCalls(input))
      expect(result).toEqual([{ tool_id: 'grep', parameters: { pattern: 'test' } }])
    })

    it('args', () => {
      const input = '<tool_call>{"name": "edit", "args": {"content": "新内容"}}</tool_call>'
      const result = norm(parseToolCalls(input))
      expect(result).toEqual([{ tool_id: 'edit', parameters: { content: '新内容' } }])
    })
  })

  describe('Subagents 批调用 JSON 格式', () => {
    it('解析 {"subagents": [{ task, output_file }]} 为多个 subagent 工具调用', () => {
      const input = `\n\`\`\`json
{"subagents": [
  {"id": "agent1", "task": "在工作區根目錄下創建名為 '科技趨勢.md' 的文檔", "output_file": "科技趨勢.md"},
  {"id": "agent2", "task": "創建 '健康生活.md'", "output_file": "健康生活.md"}
]}
\`\`\`;;;`
      const result = norm(parseToolCalls(input))
      expect(result).not.toBeNull()
      expect(result!.length).toBe(2)
      expect(result![0].tool_id).toBe('subagent-doc-writer')
      expect(result![0].parameters).toEqual({
        prompt: "在工作區根目錄下創建名為 '科技趨勢.md' 的文檔",
        output_file: '科技趨勢.md'
      })
      expect(result![1].tool_id).toBe('subagent-doc-writer')
      expect(result![1].parameters).toEqual({
        prompt: "創建 '健康生活.md'",
        output_file: '健康生活.md'
      })
    })

    it('裸 JSON 含 subagents 数组（无代码块）', () => {
      const input = '{"subagents": [{"task": "写一个文档", "output_file": "a.md"}]}'
      const result = norm(parseToolCalls(input))
      expect(result).not.toBeNull()
      expect(result!.length).toBe(1)
      expect(result![0].tool_id).toBe('subagent-doc-writer')
      expect(result![0].parameters).toEqual({ prompt: '写一个文档', output_file: 'a.md' })
    })

    it('支持 item 中 tool_id / subagent 指定 subagent', () => {
      const input = '{"subagents": [{"task": "读工作区", "tool_id": "subagent-workspace-reader"}]}'
      const result = norm(parseToolCalls(input))
      expect(result).not.toBeNull()
      expect(result!.length).toBe(1)
      expect(result![0].tool_id).toBe('subagent-workspace-reader')
      expect(result![0].parameters).toEqual({ prompt: '读工作区' })
    })
  })

  describe('Action+Params JSON 格式', () => {
    it('解析 {"action": "edit", "params": { "file_path", "content" }} 并转为 filePath + V2 edits', () => {
      const input = `
\`\`\`json
{
  "action": "edit",
  "params": {
    "file_path": "C:\\\\Users\\\\tange\\\\Documents\\\\metadoc-agent-test\\\\ai_technology.md",
    "content": "# 人工智能技術發展\\n\\n人工智能技術正快速發展。",
    "format": "md"
  }
}
\`\`\`
`
      const result = norm(parseToolCalls(input))
      expect(result).not.toBeNull()
      expect(result!.length).toBe(1)
      expect(result![0].tool_id).toBe('edit')
      expect(result![0].parameters!.filePath).toBe(
        'C:\\Users\\tange\\Documents\\metadoc-agent-test\\ai_technology.md'
      )
      const edits = result![0].parameters!.edits as { type: string; content: string }[]
      expect(Array.isArray(edits)).toBe(true)
      expect(edits[0].type).toBe('insert')
      expect(edits[0].content).toContain('# 人工智能技術發展')
      expect(result![0].parameters!.content).toBeUndefined()
      expect(result![0].parameters!.file_path).toBeUndefined()
    })

    it('裸 JSON action+params（无代码块）', () => {
      const input =
        '{"action": "edit", "params": {"file_path": "a.md", "content": "hello\\nworld"}}'
      const result = norm(parseToolCalls(input))
      expect(result).not.toBeNull()
      expect(result!.length).toBe(1)
      expect(result![0].tool_id).toBe('edit')
      expect(result![0].parameters!.filePath).toBe('a.md')
      const edits = result![0].parameters!.edits as { content: string }[]
      expect(edits[0].content).toBe('hello\nworld')
    })

    it('支持 parameters 替代 params', () => {
      const input = '{"action": "grep", "parameters": {"pattern": "test"}}'
      const result = norm(parseToolCalls(input))
      expect(result).not.toBeNull()
      expect(result!.length).toBe(1)
      expect(result![0].tool_id).toBe('grep')
      expect(result![0].parameters).toEqual({ pattern: 'test' })
    })
  })

  describe('JSON 数组调用 [{}, {}, ...]', () => {
    it('<tool_call> 内 JSON 数组展开为多个工具调用', () => {
      const input = `<tool_call>
[
  {"name": "grep", "arguments": {"pattern": "a"}},
  {"name": "edit", "arguments": {"filePath": "x.md", "edits": [{"id": "e1", "type": "insert", "target": {"anchor": ""}, "content": "hi"}]}}
]
</tool_call>`
      const result = norm(parseToolCalls(input))
      expect(result).not.toBeNull()
      expect(result!.length).toBe(2)
      expect(result![0].tool_id).toBe('grep')
      expect(result![0].parameters).toEqual({ pattern: 'a' })
      expect(result![1].tool_id).toBe('edit')
      expect(result![1].parameters).toHaveProperty('filePath', 'x.md')
    })

    it('裸 JSON 数组（无标签）展开为多个工具调用', () => {
      const input =
        '[{"name": "grep", "arguments": {"pattern": "test"}}, {"name": "edit", "arguments": {"edits": [{"id": "e1", "type": "insert", "target": {"anchor": ""}, "content": ""}]}}]'
      const result = norm(parseToolCalls(input))
      expect(result).not.toBeNull()
      expect(result!.length).toBe(2)
      expect(result![0].tool_id).toBe('grep')
      expect(result![1].tool_id).toBe('edit')
    })

    it('action+params 数组展开', () => {
      const input = `[
  {"action": "edit", "params": {"file_path": "a.md", "content": "x"}},
  {"action": "grep", "params": {"pattern": "p"}}
]`
      const result = norm(parseToolCalls(input))
      expect(result).not.toBeNull()
      expect(result!.length).toBe(2)
      expect(result![0].tool_id).toBe('edit')
      expect(result![0].parameters!.filePath).toBe('a.md')
      expect((result![0].parameters!.edits as { content: string }[])[0].content).toBe('x')
      expect(result![1].tool_id).toBe('grep')
      expect(result![1].parameters).toEqual({ pattern: 'p' })
    })
  })

  describe('无效格式返回 null', () => {
    it('无工具调用标记', () => {
      const result = parseToolCalls('这是一段普通文本，没有工具调用')
      expect(result).toBeNull()
    })

    it('不完整的标记', () => {
      const result = parseToolCalls('<tool_call>{"name": "grep"')
      expect(result).toBeNull()
    })
  })

  describe('无效格式返回 dummy-tool fallback', () => {
    it('缺少工具ID', () => {
      const result = parseToolCalls('<tool_call>{"arguments": {"pattern": "test"}}</tool_call>')
      expect(result).not.toBeNull()
      expect(result!.length).toBeGreaterThan(0)
      expect(result![0].tool_id).toBe('dummy-tool')
      expect(result![0].parameters).toHaveProperty('error')
      expect(String(result![0].parameters?.error)).toMatch(/缺少工具ID|工具ID/i)
    })

    it('参数不是对象', () => {
      const result = parseToolCalls(
        '<tool_call>{"name": "grep", "arguments": "not an object"}</tool_call>'
      )
      expect(result).not.toBeNull()
      expect(result![0].tool_id).toBe('dummy-tool')
      expect(String(result![0].parameters?.error)).toMatch(/参数.*对象|对象类型/i)
    })

    it('工具ID为空字符串', () => {
      const result = parseToolCalls(
        '<tool_call>{"name": "", "arguments": {"pattern": "test"}}</tool_call>'
      )
      expect(result).not.toBeNull()
      expect(result![0].tool_id).toBe('dummy-tool')
    })

    it('JSON 解析失败', () => {
      const result = parseToolCalls(
        '<tool_call>{"name": "grep", "arguments": {invalid json}}</tool_call>'
      )
      expect(result).not.toBeNull()
      expect(result![0].tool_id).toBe('dummy-tool')
    })
  })
})
