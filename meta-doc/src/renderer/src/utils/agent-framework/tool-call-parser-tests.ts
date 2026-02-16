/**
 * 工具调用解析器单元测试
 * 测试所有可能的工具调用格式及其变种
 * 每个测试用例都是独立的 TestFunction
 */

import { testFramework, type TestFunction } from '../test-framework'
import { parseToolCalls, type ParsedToolCall } from './tool-call-processor'

/**
 * 标准化的工具调用结果（用于比对）
 */
interface StandardToolCall {
  tool_id: string
  parameters: Record<string, unknown>
}

/**
 * 深度比较两个对象是否相等
 */
function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true
  if (obj1 == null || obj2 == null) return false
  if (typeof obj1 !== typeof obj2) return false

  if (typeof obj1 === 'object') {
    if (Array.isArray(obj1) !== Array.isArray(obj2)) return false

    if (Array.isArray(obj1)) {
      if (obj1.length !== obj2.length) return false
      for (let i = 0; i < obj1.length; i++) {
        if (!deepEqual(obj1[i], obj2[i])) return false
      }
      return true
    }

    const keys1 = Object.keys(obj1).sort()
    const keys2 = Object.keys(obj2).sort()
    if (keys1.length !== keys2.length) return false

    for (const key of keys1) {
      if (!keys2.includes(key)) return false
      if (!deepEqual(obj1[key], obj2[key])) return false
    }
    return true
  }

  return false
}

/**
 * 将解析结果转换为标准格式
 */
function normalizeResult(result: ParsedToolCall[] | null): StandardToolCall[] | null {
  if (!result || result.length === 0) return null

  return result.map((item) => ({
    tool_id: item.tool_id,
    parameters: item.parameters
  }))
}

/**
 * 创建测试函数的辅助函数
 */
function createTestFunction(
  id: string,
  name: string,
  description: string,
  input: string,
  expected: StandardToolCall | StandardToolCall[] | null
): TestFunction {
  return {
    id,
    name,
    description,
    module: '工具调用解析器',
    fn: (inputText: string) => {
      try {
        const parsed = parseToolCalls(inputText)
        const normalized = normalizeResult(parsed)

        // 处理预期结果
        let expectedNormalized: StandardToolCall[] | null = null
        if (expected === null) {
          expectedNormalized = null
        } else if (Array.isArray(expected)) {
          expectedNormalized = expected
        } else {
          expectedNormalized = [expected]
        }

        // 比较结果
        const passed = deepEqual(normalized, expectedNormalized)

        return {
          input: inputText,
          output: normalized,
          expected: expectedNormalized,
          passed,
          error: passed ? undefined : '解析结果不匹配'
        }
      } catch (error) {
        return {
          input: inputText,
          output: null,
          expected: Array.isArray(expected) ? expected : expected ? [expected] : null,
          passed: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    },
    params: [
      {
        name: 'inputText',
        type: 'string',
        defaultValue: input,
        description: '工具调用输入文本'
      }
    ]
  }
}

/**
 * 创建dummy-tool测试函数的辅助函数
 * 用于测试无效格式时返回dummy-tool的fallback机制
 */
function createDummyToolTestFunction(
  id: string,
  name: string,
  description: string,
  input: string,
  expectedErrorPattern?: string | RegExp
): TestFunction {
  return {
    id,
    name,
    description,
    module: '工具调用解析器',
    fn: (inputText: string) => {
      try {
        const parsed = parseToolCalls(inputText)
        const normalized = normalizeResult(parsed)

        // 验证是否返回了dummy-tool
        const hasDummyTool =
          normalized && normalized.length > 0 && normalized[0].tool_id === 'dummy-tool'

        if (!hasDummyTool) {
          return {
            input: inputText,
            output: normalized,
            expected: [
              {
                tool_id: 'dummy-tool',
                parameters: { error: expectedErrorPattern || '错误信息', rawContent: '原始内容' }
              }
            ],
            passed: false,
            error: `未返回dummy-tool作为fallback。实际返回: ${JSON.stringify(normalized)}`
          }
        }

        // 验证dummy-tool的参数结构
        const dummyToolParams = normalized[0].parameters
        const hasError = dummyToolParams && typeof dummyToolParams.error === 'string'
        const hasRawContent = dummyToolParams && typeof dummyToolParams.rawContent === 'string'

        if (!hasError) {
          return {
            input: inputText,
            output: normalized,
            expected: [
              { tool_id: 'dummy-tool', parameters: { error: '错误信息', rawContent: '原始内容' } }
            ],
            passed: false,
            error: 'dummy-tool的参数中缺少error字段'
          }
        }

        // 如果提供了错误模式，验证错误信息是否包含预期关键词
        if (expectedErrorPattern) {
          const errorMessage = dummyToolParams.error as string
          const pattern =
            typeof expectedErrorPattern === 'string'
              ? new RegExp(expectedErrorPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
              : expectedErrorPattern

          if (!pattern.test(errorMessage)) {
            return {
              input: inputText,
              output: normalized,
              expected: [
                {
                  tool_id: 'dummy-tool',
                  parameters: { error: expectedErrorPattern, rawContent: '原始内容' }
                }
              ],
              passed: false,
              error: `错误信息不匹配。实际: "${errorMessage}", 预期应包含: "${expectedErrorPattern}"`
            }
          }
        }

        return {
          input: inputText,
          output: normalized,
          expected: [{ tool_id: 'dummy-tool', parameters: normalized[0].parameters }],
          passed: true
        }
      } catch (error) {
        return {
          input: inputText,
          output: null,
          expected: [{ tool_id: 'dummy-tool', parameters: {} }],
          passed: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    },
    params: [
      {
        name: 'inputText',
        type: 'string',
        defaultValue: input,
        description: '工具调用输入文本'
      }
    ]
  }
}

// ========== 标准格式 ==========

/**
 * 测试用例1: 标准格式-基本
 */
const testStandardBasic: TestFunction = createTestFunction(
  'tool-call-parser.standard-basic',
  '标准格式-基本',
  '测试标准格式的基本工具调用',
  '<tool_call>{"name": "chart-generation", "arguments": {"prompt": "生成图表", "type": "line"}}</tool_call>',
  {
    tool_id: 'chart-generation',
    parameters: { prompt: '生成图表', type: 'line' }
  }
)

/**
 * 测试用例2: 标准格式-多参数
 */
const testStandardMultiParams: TestFunction = createTestFunction(
  'tool-call-parser.standard-multi-params',
  '标准格式-多参数',
  '测试标准格式的多参数工具调用',
  '<tool_call>{"name": "edit", "arguments": {"action": "insert", "content": "新内容", "position": 100}}</tool_call>',
  {
    tool_id: 'edit',
    parameters: { action: 'insert', content: '新内容', position: 100 }
  }
)

/**
 * 测试用例3: 标准格式-嵌套对象参数
 */
const testStandardNestedParams: TestFunction = createTestFunction(
  'tool-call-parser.standard-nested-params',
  '标准格式-嵌套对象参数',
  '测试标准格式的嵌套对象参数',
  '<tool_call>{"name": "chart-generation", "arguments": {"prompt": "图表", "options": {"width": 800, "height": 600}}}</tool_call>',
  {
    tool_id: 'chart-generation',
    parameters: { prompt: '图表', options: { width: 800, height: 600 } }
  }
)

// ========== 标签变体 ==========

/**
 * 测试用例4: 标签变体-tool-call
 */
const testTagVariantToolCall: TestFunction = createTestFunction(
  'tool-call-parser.tag-variant-tool-call',
  '标签变体-tool-call',
  '测试 <tool-call> 标签变体',
  '<tool-call>{"name": "grep", "arguments": {"pattern": "test"}}</tool-call>',
  {
    tool_id: 'grep',
    parameters: { pattern: 'test' }
  }
)

/**
 * 测试用例5: 标签变体-toolCall
 */
const testTagVariantToolCallCamel: TestFunction = createTestFunction(
  'tool-call-parser.tag-variant-tool-call-camel',
  '标签变体-toolCall',
  '测试 <toolCall> 标签变体（驼峰命名）',
  '<toolCall>{"name": "outline-tree", "arguments": {}}</toolCall>',
  {
    tool_id: 'outline-tree',
    parameters: {}
  }
)

/**
 * 测试用例6: 标签变体-function-call
 */
const testTagVariantFunctionCall: TestFunction = createTestFunction(
  'tool-call-parser.tag-variant-function-call',
  '标签变体-function-call',
  '测试 <function-call> 标签变体',
  '<function-call>{"name": "web-search", "arguments": {"query": "搜索"}}</function-call>',
  {
    tool_id: 'web-search',
    parameters: { query: '搜索' }
  }
)

/**
 * 测试用例7: 标签变体-function_call
 */
const testTagVariantFunctionCallUnderscore: TestFunction = createTestFunction(
  'tool-call-parser.tag-variant-function-call-underscore',
  '标签变体-function_call',
  '测试 <function_call> 标签变体（下划线命名）',
  '<function_call>{"name": "rag-tool", "arguments": {"query": "查询"}}</function_call>',
  {
    tool_id: 'rag-tool',
    parameters: { query: '查询' }
  }
)

// ========== 字段名称变体 ==========

/**
 * 测试用例8: 字段变体-tool_id
 */
const testFieldVariantToolId: TestFunction = createTestFunction(
  'tool-call-parser.field-variant-tool-id',
  '字段变体-tool_id',
  '测试使用 tool_id 字段',
  '<tool_call>{"tool_id": "chart-generation", "arguments": {"type": "bar"}}</tool_call>',
  {
    tool_id: 'chart-generation',
    parameters: { type: 'bar' }
  }
)

/**
 * 测试用例9: 字段变体-toolId
 */
const testFieldVariantToolIdCamel: TestFunction = createTestFunction(
  'tool-call-parser.field-variant-tool-id-camel',
  '字段变体-toolId',
  '测试使用 toolId 字段（驼峰命名）',
  '<tool_call>{"toolId": "grep", "parameters": {"pattern": ".*"}}</tool_call>',
  {
    tool_id: 'grep',
    parameters: { pattern: '.*' }
  }
)

/**
 * 测试用例10: 字段变体-tool
 */
const testFieldVariantTool: TestFunction = createTestFunction(
  'tool-call-parser.field-variant-tool',
  '字段变体-tool',
  '测试使用 tool 字段',
  '<tool_call>{"tool": "edit", "arguments": {"action": "replace"}}</tool_call>',
  {
    tool_id: 'edit',
    parameters: { action: 'replace' }
  }
)

/**
 * 测试用例11: 字段变体-function
 */
const testFieldVariantFunction: TestFunction = createTestFunction(
  'tool-call-parser.field-variant-function',
  '字段变体-function',
  '测试使用 function 字段',
  '<tool_call>{"function": "web-search", "arguments": {"query": "test"}}</tool_call>',
  {
    tool_id: 'web-search',
    parameters: { query: 'test' }
  }
)

/**
 * 测试用例12: 字段变体-parameters
 */
const testFieldVariantParameters: TestFunction = createTestFunction(
  'tool-call-parser.field-variant-parameters',
  '字段变体-parameters',
  '测试使用 parameters 字段',
  '<tool_call>{"name": "chart-generation", "parameters": {"type": "pie"}}</tool_call>',
  {
    tool_id: 'chart-generation',
    parameters: { type: 'pie' }
  }
)

/**
 * 测试用例13: 字段变体-params
 */
const testFieldVariantParams: TestFunction = createTestFunction(
  'tool-call-parser.field-variant-params',
  '字段变体-params',
  '测试使用 params 字段',
  '<tool_call>{"name": "grep", "params": {"pattern": "test"}}</tool_call>',
  {
    tool_id: 'grep',
    parameters: { pattern: 'test' }
  }
)

/**
 * 测试用例14: 字段变体-args
 */
const testFieldVariantArgs: TestFunction = createTestFunction(
  'tool-call-parser.field-variant-args',
  '字段变体-args',
  '测试使用 args 字段',
  '<tool_call>{"name": "edit", "args": {"content": "新内容"}}</tool_call>',
  {
    tool_id: 'edit',
    parameters: { content: '新内容' }
  }
)

// ========== 代码块格式 ==========

/**
 * 测试用例15: 代码块格式-json
 */
const testCodeBlockJson: TestFunction = createTestFunction(
  'tool-call-parser.code-block-json',
  '代码块格式-json',
  '测试代码块中的JSON格式（```json ... ```）',
  '<tool_call>\n```json\n{"name": "chart-generation", "arguments": {"type": "line"}}\n```\n</tool_call>',
  {
    tool_id: 'chart-generation',
    parameters: { type: 'line' }
  }
)

/**
 * 测试用例16: 代码块格式-无语言标识
 */
const testCodeBlockNoLang: TestFunction = createTestFunction(
  'tool-call-parser.code-block-no-lang',
  '代码块格式-无语言标识',
  '测试代码块格式（``` ... ```，无语言标识）',
  '<tool_call>\n```\n{"name": "grep", "arguments": {"pattern": "test"}}\n```\n</tool_call>',
  {
    tool_id: 'grep',
    parameters: { pattern: 'test' }
  }
)

// ========== 宽松JSON格式 ==========

/**
 * 测试用例17: 宽松JSON-单引号
 */
const testLooseJsonSingleQuote: TestFunction = createTestFunction(
  'tool-call-parser.loose-json-single-quote',
  '宽松JSON-单引号',
  '测试单引号JSON格式',
  "<tool_call>{'name': 'chart-generation', 'arguments': {'type': 'bar'}}</tool_call>",
  {
    tool_id: 'chart-generation',
    parameters: { type: 'bar' }
  }
)

/**
 * 测试用例18: 宽松JSON-尾随逗号
 */
const testLooseJsonTrailingComma: TestFunction = createTestFunction(
  'tool-call-parser.loose-json-trailing-comma',
  '宽松JSON-尾随逗号',
  '测试尾随逗号的JSON格式',
  '<tool_call>{"name": "grep", "arguments": {"pattern": "test",}}</tool_call>',
  {
    tool_id: 'grep',
    parameters: { pattern: 'test' }
  }
)

/**
 * 测试用例19: 宽松JSON-单行注释
 */
const testLooseJsonSingleLineComment: TestFunction = createTestFunction(
  'tool-call-parser.loose-json-single-line-comment',
  '宽松JSON-单行注释',
  '测试包含单行注释的JSON格式',
  '<tool_call>{"name": "edit", // 这是注释\n"arguments": {"action": "insert"}}</tool_call>',
  {
    tool_id: 'edit',
    parameters: { action: 'insert' }
  }
)

/**
 * 测试用例20: 宽松JSON-多行注释
 */
const testLooseJsonMultiLineComment: TestFunction = createTestFunction(
  'tool-call-parser.loose-json-multi-line-comment',
  '宽松JSON-多行注释',
  '测试包含多行注释的JSON格式',
  '<tool_call>{"name": "chart-generation", /* 多行注释 */ "arguments": {"type": "pie"}}</tool_call>',
  {
    tool_id: 'chart-generation',
    parameters: { type: 'pie' }
  }
)

// ========== 数组格式 ==========

/**
 * 测试用例21: 数组格式-单个工具
 */
const testArrayFormat: TestFunction = createTestFunction(
  'tool-call-parser.array-format',
  '数组格式-单个工具',
  '测试数组格式的工具调用',
  '<tool_call>[{"name": "grep", "arguments": {"pattern": "test"}}]</tool_call>',
  {
    tool_id: 'grep',
    parameters: { pattern: 'test' }
  }
)

// ========== 多行格式 ==========

/**
 * 测试用例22: 多行格式
 */
const testMultilineFormat: TestFunction = createTestFunction(
  'tool-call-parser.multiline-format',
  '多行格式',
  '测试多行JSON格式的工具调用',
  `<tool_call>
{
  "name": "chart-generation",
  "arguments": {
    "prompt": "生成一个复杂的图表",
    "type": "line",
    "options": {
      "width": 800,
      "height": 600
    }
  }
}
</tool_call>`,
  {
    tool_id: 'chart-generation',
    parameters: {
      prompt: '生成一个复杂的图表',
      type: 'line',
      options: {
        width: 800,
        height: 600
      }
    }
  }
)

// ========== DSML格式 ==========

/**
 * 测试用例23: DSML格式-基本
 */
const testDSMLBasic: TestFunction = createTestFunction(
  'tool-call-parser.dsml-basic',
  'DSML格式-基本',
  '测试DSML格式的基本工具调用',
  '<｜DSML｜invoke name="chart-generation">\n<｜DSML｜parameter name="prompt" string="true">生成图表</｜DSML｜parameter>\n<｜DSML｜parameter name="type" string="true">line</｜DSML｜parameter>\n</｜DSML｜invoke>',
  {
    tool_id: 'chart-generation',
    parameters: {
      prompt: '生成图表',
      type: 'line'
    }
  }
)

/**
 * 测试用例24: DSML格式-function_calls包裹
 */
const testDSMLFunctionCalls: TestFunction = createTestFunction(
  'tool-call-parser.dsml-function-calls',
  'DSML格式-function_calls包裹',
  '测试被function_calls包裹的DSML格式',
  '<｜DSML｜function_calls>\n<｜DSML｜invoke name="grep">\n<｜DSML｜parameter name="pattern" string="true">test</｜DSML｜parameter>\n</｜DSML｜invoke>\n</｜DSML｜function_calls>',
  {
    tool_id: 'grep',
    parameters: {
      pattern: 'test'
    }
  }
)

/**
 * 测试用例25: DSML格式-嵌套在tool_call中
 */
const testDSMLNestedInToolCall: TestFunction = createTestFunction(
  'tool-call-parser.dsml-nested-in-tool-call',
  'DSML格式-嵌套在tool_call中',
  '测试嵌套在tool_call标签中的DSML格式',
  '<tool_call>\n<｜DSML｜invoke name="chart-generation">\n<｜DSML｜parameter name="prompt" string="true">生成一个可信软件工程技术栈和工作流程的PlantUML活动图，包含以下内容：1. 需求获取阶段：非正式规范、半正式规范、正式规范 2. 开发阶段：SOFL三步形式化规范技术、混合规范（GUI+半正式+正式）、基于规范的增量实现 3. 验证阶段：基于规范的检查、基于测试的形式验证、人机结对编程中的监控和预测 4. 人工智能支持：LLM在规范精化、代码生成、代码审查、测试、形式验证中的应用 5. 最终目标：可信软件交付。请展示这些阶段之间的流程关系。</｜DSML｜parameter>\n<｜DSML｜parameter name="chartType" string="true">plantuml</｜DSML｜parameter>\n<｜DSML｜parameter name="format" string="true">svg</｜DSML｜parameter>\n</｜DSML｜invoke>\n</tool_call>',
  {
    tool_id: 'chart-generation',
    parameters: {
      prompt:
        '生成一个可信软件工程技术栈和工作流程的PlantUML活动图，包含以下内容：1. 需求获取阶段：非正式规范、半正式规范、正式规范 2. 开发阶段：SOFL三步形式化规范技术、混合规范（GUI+半正式+正式）、基于规范的增量实现 3. 验证阶段：基于规范的检查、基于测试的形式验证、人机结对编程中的监控和预测 4. 人工智能支持：LLM在规范精化、代码生成、代码审查、测试、形式验证中的应用 5. 最终目标：可信软件交付。请展示这些阶段之间的流程关系。',
      chartType: 'plantuml',
      format: 'svg'
    }
  }
)

/**
 * 测试用例26: DSML格式-自闭合参数
 */
const testDSMLSelfClosing: TestFunction = createTestFunction(
  'tool-call-parser.dsml-self-closing',
  'DSML格式-自闭合参数',
  '测试DSML格式的自闭合参数',
  '<｜DSML｜invoke name="edit">\n<｜DSML｜parameter name="action" string="true" />\n</｜DSML｜invoke>',
  {
    tool_id: 'edit',
    parameters: {
      action: 'true'
    }
  }
)

/**
 * 测试用例27: DSML格式-无string属性
 */
const testDSMLNoStringAttr: TestFunction = createTestFunction(
  'tool-call-parser.dsml-no-string-attr',
  'DSML格式-无string属性',
  '测试DSML格式的无string属性参数',
  '<｜DSML｜invoke name="grep">\n<｜DSML｜parameter name="pattern">test</｜DSML｜parameter>\n</｜DSML｜invoke>',
  {
    tool_id: 'grep',
    parameters: {
      pattern: 'test'
    }
  }
)

/**
 * 测试用例28: DSML格式-string=false
 */
const testDSMLStringFalse: TestFunction = createTestFunction(
  'tool-call-parser.dsml-string-false',
  'DSML格式-string=false',
  '测试DSML格式的string=false参数（应解析为数字）',
  '<｜DSML｜invoke name="chart-generation">\n<｜DSML｜parameter name="width" string="false">800</｜DSML｜parameter>\n</｜DSML｜invoke>',
  {
    tool_id: 'chart-generation',
    parameters: {
      width: 800
    }
  }
)

/**
 * 测试用例28.1: DSML格式-call标签包裹
 */
const testDSMLCallTag: TestFunction = createTestFunction(
  'tool-call-parser.dsml-call-tag',
  'DSML格式-call标签包裹',
  '测试DSML格式的call标签包裹（应正确解析并清除结尾标签）',
  '<｜DSML｜call>\n<｜DSML｜invoke name="chart-generation">\n<｜DSML｜parameter name="prompt" string="true">生成图表</｜DSML｜parameter>\n<｜DSML｜parameter name="type" string="true">line</｜DSML｜parameter>\n</｜DSML｜invoke>\n</｜DSML｜call>',
  {
    tool_id: 'chart-generation',
    parameters: {
      prompt: '生成图表',
      type: 'line'
    }
  }
)

/**
 * 测试用例28.2: DSML格式-call标签包裹function_calls
 */
const testDSMLCallWithFunctionCalls: TestFunction = createTestFunction(
  'tool-call-parser.dsml-call-with-function-calls',
  'DSML格式-call标签包裹function_calls',
  '测试DSML格式的call标签包裹function_calls（应正确解析并清除结尾标签）',
  '<｜DSML｜call>\n<｜DSML｜function_calls>\n<｜DSML｜invoke name="grep">\n<｜DSML｜parameter name="pattern" string="true">test</｜DSML｜parameter>\n</｜DSML｜invoke>\n</｜DSML｜function_calls>\n</｜DSML｜call>',
  {
    tool_id: 'grep',
    parameters: {
      pattern: 'test'
    }
  }
)

/**
 * 测试用例28.3: DSML格式-call标签嵌套在tool_call中
 */
const testDSMLCallNestedInToolCall: TestFunction = createTestFunction(
  'tool-call-parser.dsml-call-nested-in-tool-call',
  'DSML格式-call标签嵌套在tool_call中',
  '测试DSML格式的call标签嵌套在tool_call中（应正确解析并清除结尾标签）',
  '<tool_call>\n<｜DSML｜call>\n<｜DSML｜invoke name="chart-generation">\n<｜DSML｜parameter name="prompt" string="true">生成图表</｜DSML｜parameter>\n<｜DSML｜parameter name="type" string="true">line</｜DSML｜parameter>\n</｜DSML｜invoke>\n</｜DSML｜call>\n</tool_call>',
  {
    tool_id: 'chart-generation',
    parameters: {
      prompt: '生成图表',
      type: 'line'
    }
  }
)

// ========== XML格式 ==========

/**
 * 测试用例29: XML格式-基本
 */
const testXMLBasic: TestFunction = createTestFunction(
  'tool-call-parser.xml-basic',
  'XML格式-基本',
  '测试XML格式的基本工具调用',
  '<name>web-crawler</name>\n<arguments>\n{\n  "url": "https://example.com",\n  "method": "GET"\n}\n</arguments>',
  {
    tool_id: 'web-crawler',
    parameters: { url: 'https://example.com', method: 'GET' }
  }
)

/**
 * 测试用例30: XML格式-多参数
 */
const testXMLMultiParams: TestFunction = createTestFunction(
  'tool-call-parser.xml-multi-params',
  'XML格式-多参数',
  '测试XML格式的多参数工具调用',
  '<name>web-crawler</name>\n<arguments>\n{\n  "url": "https://weather.com/zh-CN/weather/today/l/31.23,121.47",\n  "method": "GET",\n  "timeout": 10000,\n  "useCurl": true\n}\n</arguments>',
  {
    tool_id: 'web-crawler',
    parameters: {
      url: 'https://weather.com/zh-CN/weather/today/l/31.23,121.47',
      method: 'GET',
      timeout: 10000,
      useCurl: true
    }
  }
)

/**
 * 测试用例31: XML格式-嵌套对象参数
 */
const testXMLNestedParams: TestFunction = createTestFunction(
  'tool-call-parser.xml-nested-params',
  'XML格式-嵌套对象参数',
  '测试XML格式的嵌套对象参数',
  '<name>chart-generation</name>\n<arguments>\n{\n  "prompt": "生成图表",\n  "options": {\n    "width": 800,\n    "height": 600\n  }\n}\n</arguments>',
  {
    tool_id: 'chart-generation',
    parameters: {
      prompt: '生成图表',
      options: { width: 800, height: 600 }
    }
  }
)

/**
 * 测试用例32: XML格式-空参数
 */
const testXMLEmptyParams: TestFunction = createTestFunction(
  'tool-call-parser.xml-empty-params',
  'XML格式-空参数',
  '测试XML格式的空参数工具调用',
  '<name>outline-tree</name>\n<arguments>\n{}\n</arguments>',
  {
    tool_id: 'outline-tree',
    parameters: {}
  }
)

/**
 * 测试用例33: XML格式-单行格式
 */
const testXMLSingleLine: TestFunction = createTestFunction(
  'tool-call-parser.xml-single-line',
  'XML格式-单行格式',
  '测试XML格式的单行格式工具调用',
  '<name>grep</name><arguments>{"pattern": "test", "caseSensitive": false}</arguments>',
  {
    tool_id: 'grep',
    parameters: { pattern: 'test', caseSensitive: false }
  }
)

// ========== 纯XML格式（标签名即工具ID）==========

/**
 * 测试用例34: 纯XML格式-基本
 */
const testPureXMLBasic: TestFunction = createTestFunction(
  'tool-call-parser.pure-xml-basic',
  '纯XML格式-基本',
  '测试纯XML格式的基本工具调用（标签名即工具ID）',
  '<web-crawler>\n{"url": "https://example.com", "method": "GET", "timeout": 10000}\n</web-crawler>',
  {
    tool_id: 'web-crawler',
    parameters: { url: 'https://example.com', method: 'GET', timeout: 10000 }
  }
)

/**
 * 测试用例35: 纯XML格式-多参数
 */
const testPureXMLMultiParams: TestFunction = createTestFunction(
  'tool-call-parser.pure-xml-multi-params',
  '纯XML格式-多参数',
  '测试纯XML格式的多参数工具调用',
  '<web-crawler>\n{"url": "https://wttr.in/上海?format=3", "method": "GET", "timeout": 10000}\n</web-crawler>',
  {
    tool_id: 'web-crawler',
    parameters: { url: 'https://wttr.in/上海?format=3', method: 'GET', timeout: 10000 }
  }
)

/**
 * 测试用例36: 纯XML格式-包含useCurl
 */
const testPureXMLWithUseCurl: TestFunction = createTestFunction(
  'tool-call-parser.pure-xml-with-use-curl',
  '纯XML格式-包含useCurl',
  '测试纯XML格式包含useCurl参数的工具调用',
  '<web-crawler>\n{"url": "https://arxiv.org/list/cs/new", "method": "GET", "timeout": 30000, "useCurl": true}\n</web-crawler>',
  {
    tool_id: 'web-crawler',
    parameters: {
      url: 'https://arxiv.org/list/cs/new',
      method: 'GET',
      timeout: 30000,
      useCurl: true
    }
  }
)

/**
 * 测试用例37: 纯XML格式-单行格式
 */
const testPureXMLSingleLine: TestFunction = createTestFunction(
  'tool-call-parser.pure-xml-single-line',
  '纯XML格式-单行格式',
  '测试纯XML格式的单行格式工具调用',
  '<grep>{"pattern": "test", "caseSensitive": false}</grep>',
  {
    tool_id: 'grep',
    parameters: { pattern: 'test', caseSensitive: false }
  }
)

/**
 * 测试用例38: 纯XML格式-嵌套对象参数
 */
const testPureXMLNestedParams: TestFunction = createTestFunction(
  'tool-call-parser.pure-xml-nested-params',
  '纯XML格式-嵌套对象参数',
  '测试纯XML格式的嵌套对象参数',
  '<chart-generation>\n{"prompt": "生成图表", "options": {"width": 800, "height": 600}}\n</chart-generation>',
  {
    tool_id: 'chart-generation',
    parameters: { prompt: '生成图表', options: { width: 800, height: 600 } }
  }
)

// ========== OpenAI格式 ==========

/**
 * 测试用例39: OpenAI格式-基本
 */
const testOpenAIBasic: TestFunction = createTestFunction(
  'tool-call-parser.openai-basic',
  'OpenAI格式-基本',
  '测试OpenAI格式的基本工具调用',
  '{"tool": "chart-generation", "arguments": {"type": "bar"}}',
  {
    tool_id: 'chart-generation',
    parameters: { type: 'bar' }
  }
)

/**
 * 测试用例40: OpenAI格式-字段变体
 */
const testOpenAIFieldVariant: TestFunction = createTestFunction(
  'tool-call-parser.openai-field-variant',
  'OpenAI格式-字段变体',
  '测试OpenAI格式的字段变体',
  '{"tool": "grep", "params": {"pattern": "test"}}',
  {
    tool_id: 'grep',
    parameters: { pattern: 'test' }
  }
)

// ========== 多个工具调用 ==========

/**
 * 测试用例41: 多个工具调用
 */
const testMultipleToolCalls: TestFunction = createTestFunction(
  'tool-call-parser.multiple-tool-calls',
  '多个工具调用',
  '测试连续多个工具调用',
  '<tool_call>{"name": "grep", "arguments": {"pattern": "test"}}</tool_call>\n<tool_call>{"name": "edit", "arguments": {"action": "insert"}}</tool_call>',
  [
    {
      tool_id: 'grep',
      parameters: { pattern: 'test' }
    },
    {
      tool_id: 'edit',
      parameters: { action: 'insert' }
    }
  ]
)

// ========== 边界情况 ==========

/**
 * 测试用例42: 空参数对象
 */
const testEmptyParams: TestFunction = createTestFunction(
  'tool-call-parser.empty-params',
  '空参数对象',
  '测试空参数对象的工具调用',
  '<tool_call>{"name": "outline-tree", "arguments": {}}</tool_call>',
  {
    tool_id: 'outline-tree',
    parameters: {}
  }
)

/**
 * 测试用例43: 无参数字段
 */
const testNoParamsField: TestFunction = createTestFunction(
  'tool-call-parser.no-params-field',
  '无参数字段',
  '测试没有参数字段的工具调用',
  '<tool_call>{"name": "outline-tree"}</tool_call>',
  {
    tool_id: 'outline-tree',
    parameters: {}
  }
)

/**
 * 测试用例44: 参数值为null
 */
const testParamValueNull: TestFunction = createTestFunction(
  'tool-call-parser.param-value-null',
  '参数值为null',
  '测试参数值为null的工具调用',
  '<tool_call>{"name": "edit", "arguments": {"content": null}}</tool_call>',
  {
    tool_id: 'edit',
    parameters: { content: null }
  }
)

/**
 * 测试用例45: 参数值为布尔值
 */
const testParamValueBoolean: TestFunction = createTestFunction(
  'tool-call-parser.param-value-boolean',
  '参数值为布尔值',
  '测试参数值为布尔值的工具调用',
  '<tool_call>{"name": "grep", "arguments": {"caseSensitive": true, "wholeWord": false}}</tool_call>',
  {
    tool_id: 'grep',
    parameters: { caseSensitive: true, wholeWord: false }
  }
)

/**
 * 测试用例46: 参数值为数字
 */
const testParamValueNumber: TestFunction = createTestFunction(
  'tool-call-parser.param-value-number',
  '参数值为数字',
  '测试参数值为数字的工具调用',
  '<tool_call>{"name": "chart-generation", "arguments": {"width": 800, "height": 600, "ratio": 0.618}}</tool_call>',
  {
    tool_id: 'chart-generation',
    parameters: { width: 800, height: 600, ratio: 0.618 }
  }
)

/**
 * 测试用例47: 参数值为数组
 */
const testParamValueArray: TestFunction = createTestFunction(
  'tool-call-parser.param-value-array',
  '参数值为数组',
  '测试参数值为数组的工具调用',
  '<tool_call>{"name": "edit", "arguments": {"lines": [1, 2, 3]}}</tool_call>',
  {
    tool_id: 'edit',
    parameters: { lines: [1, 2, 3] }
  }
)

/**
 * 测试用例48: 参数值为嵌套数组
 */
const testParamValueNestedArray: TestFunction = createTestFunction(
  'tool-call-parser.param-value-nested-array',
  '参数值为嵌套数组',
  '测试参数值为嵌套数组的工具调用',
  '<tool_call>{"name": "chart-generation", "arguments": {"data": [[1, 2], [3, 4]]}}</tool_call>',
  {
    tool_id: 'chart-generation',
    parameters: {
      data: [
        [1, 2],
        [3, 4]
      ]
    }
  }
)

// ========== 无效格式（应该返回null或无效结果）==========

/**
 * 测试用例44: 无效格式-无工具调用标记
 */
const testInvalidNoMarkers: TestFunction = createTestFunction(
  'tool-call-parser.invalid-no-markers',
  '无效格式-无工具调用标记',
  '测试没有工具调用标记的文本（应返回null）',
  '这是一段普通文本，没有工具调用',
  null
)

/**
 * 测试用例45: 无效格式-不完整的标记
 */
const testInvalidIncomplete: TestFunction = createTestFunction(
  'tool-call-parser.invalid-incomplete',
  '无效格式-不完整的标记',
  '测试不完整的工具调用标记（应返回null）',
  '<tool_call>{"name": "grep"',
  null
)

/**
 * 测试用例46: 无效格式-缺少工具ID
 */
const testInvalidMissingToolId: TestFunction = createDummyToolTestFunction(
  'tool-call-parser.invalid-missing-tool-id',
  '无效格式-缺少工具ID',
  '测试缺少工具ID的工具调用（应返回dummy-tool作为fallback）',
  '<tool_call>{"arguments": {"pattern": "test"}}</tool_call>',
  '缺少工具ID'
)

/**
 * 测试用例47: 无效格式-参数不是对象类型
 */
const testInvalidParamsNotObject: TestFunction = createDummyToolTestFunction(
  'tool-call-parser.invalid-params-not-object',
  '无效格式-参数不是对象类型',
  '测试参数不是对象类型的工具调用（应返回dummy-tool）',
  '<tool_call>{"name": "grep", "arguments": "not an object"}</tool_call>',
  '参数必须是对象类型'
)

/**
 * 测试用例48: 无效格式-参数是数组
 */
const testInvalidParamsIsArray: TestFunction = createDummyToolTestFunction(
  'tool-call-parser.invalid-params-is-array',
  '无效格式-参数是数组',
  '测试参数是数组的工具调用（应返回dummy-tool）',
  '<tool_call>{"name": "grep", "arguments": ["param1", "param2"]}</tool_call>',
  '参数必须是对象类型'
)

/**
 * 测试用例49: 无效格式-JSON解析失败
 */
const testInvalidJsonParseError: TestFunction = createDummyToolTestFunction(
  'tool-call-parser.invalid-json-parse-error',
  '无效格式-JSON解析失败',
  '测试JSON解析失败的工具调用（应返回dummy-tool）',
  '<tool_call>{"name": "grep", "arguments": {invalid json}}</tool_call>',
  'JSON解析失败'
)

/**
 * 测试用例50: 无效格式-未找到有效的JSON字符串
 */
const testInvalidNoJsonString: TestFunction = createDummyToolTestFunction(
  'tool-call-parser.invalid-no-json-string',
  '无效格式-未找到有效的JSON字符串',
  '测试没有有效JSON字符串的工具调用（应返回dummy-tool）',
  '<tool_call>这不是JSON格式的文本</tool_call>',
  'JSON解析失败'
)

/**
 * 测试用例51: 无效格式-工具ID为空字符串
 */
const testInvalidEmptyToolId: TestFunction = createDummyToolTestFunction(
  'tool-call-parser.invalid-empty-tool-id',
  '无效格式-工具ID为空字符串',
  '测试工具ID为空字符串的工具调用（应返回dummy-tool）',
  '<tool_call>{"name": "", "arguments": {"pattern": "test"}}</tool_call>',
  '缺少工具ID'
)

/**
 * 测试用例52: 无效格式-工具ID为null
 */
const testInvalidNullToolId: TestFunction = createDummyToolTestFunction(
  'tool-call-parser.invalid-null-tool-id',
  '无效格式-工具ID为null',
  '测试工具ID为null的工具调用（应返回dummy-tool）',
  '<tool_call>{"name": null, "arguments": {"pattern": "test"}}</tool_call>',
  '缺少工具ID'
)

/**
 * 测试用例53: 无效格式-工具ID为数字
 */
const testInvalidNumberToolId: TestFunction = createDummyToolTestFunction(
  'tool-call-parser.invalid-number-tool-id',
  '无效格式-工具ID为数字',
  '测试工具ID为数字的工具调用（应返回dummy-tool）',
  '<tool_call>{"name": 123, "arguments": {"pattern": "test"}}</tool_call>',
  '缺少工具ID'
)

/**
 * 测试用例54: 无效格式-工具ID为对象
 */
const testInvalidObjectToolId: TestFunction = createDummyToolTestFunction(
  'tool-call-parser.invalid-object-tool-id',
  '无效格式-工具ID为对象',
  '测试工具ID为对象的工具调用（应返回dummy-tool）',
  '<tool_call>{"name": {"id": "grep"}, "arguments": {"pattern": "test"}}</tool_call>',
  '缺少工具ID'
)

/**
 * 测试用例55: 无效格式-XML缺少name标签
 */
const testInvalidXMLMissingName: TestFunction = createDummyToolTestFunction(
  'tool-call-parser.invalid-xml-missing-name',
  '无效格式-XML缺少name标签',
  '测试XML格式缺少name标签的工具调用（应返回dummy-tool）',
  '<arguments>{"url": "https://example.com"}</arguments>',
  'XML格式中缺少name标签'
)

/**
 * 测试用例56: 无效格式-XML缺少arguments标签
 */
const testInvalidXMLMissingArguments: TestFunction = createDummyToolTestFunction(
  'tool-call-parser.invalid-xml-missing-arguments',
  '无效格式-XML缺少arguments标签',
  '测试XML格式缺少arguments标签的工具调用（应返回dummy-tool）',
  '<name>web-crawler</name>',
  'XML格式中缺少arguments标签'
)

/**
 * 测试用例57: 无效格式-XML name标签为空
 */
const testInvalidXMLEmptyName: TestFunction = createDummyToolTestFunction(
  'tool-call-parser.invalid-xml-empty-name',
  '无效格式-XML name标签为空',
  '测试XML格式name标签为空的工具调用（应返回dummy-tool）',
  '<name></name>\n<arguments>{"url": "https://example.com"}</arguments>',
  'XML格式中缺少工具ID'
)

/**
 * 测试用例58: 无效格式-XML arguments中JSON解析失败
 */
const testInvalidXMLJsonParseError: TestFunction = createDummyToolTestFunction(
  'tool-call-parser.invalid-xml-json-parse-error',
  '无效格式-XML arguments中JSON解析失败',
  '测试XML格式arguments中JSON解析失败的工具调用（应返回dummy-tool）',
  '<name>web-crawler</name>\n<arguments>{invalid json}</arguments>',
  'XML格式中arguments的JSON解析失败'
)

/**
 * 测试用例59: 无效格式-纯XML JSON解析失败
 */
const testInvalidPureXMLJsonParseError: TestFunction = createDummyToolTestFunction(
  'tool-call-parser.invalid-pure-xml-json-parse-error',
  '无效格式-纯XML JSON解析失败',
  '测试纯XML格式中JSON解析失败的工具调用（应返回dummy-tool）',
  '<web-crawler>{invalid json}</web-crawler>',
  '纯XML格式中JSON解析失败'
)

/**
 * 测试用例60: 无效格式-纯XML内容不是对象
 */
const testInvalidPureXMLNotObject: TestFunction = createDummyToolTestFunction(
  'tool-call-parser.invalid-pure-xml-not-object',
  '无效格式-纯XML内容不是对象',
  '测试纯XML格式内容不是JSON对象的工具调用（应返回dummy-tool）',
  '<web-crawler>"not an object"</web-crawler>',
  '纯XML格式中内容必须是JSON对象'
)

// ============ 注册所有测试函数 ============

/**
 * 注册所有工具调用解析器测试用例
 */
export function registerToolCallParserTests() {
  // 标准格式
  testFramework.register(testStandardBasic)
  testFramework.register(testStandardMultiParams)
  testFramework.register(testStandardNestedParams)

  // 标签变体
  testFramework.register(testTagVariantToolCall)
  testFramework.register(testTagVariantToolCallCamel)
  testFramework.register(testTagVariantFunctionCall)
  testFramework.register(testTagVariantFunctionCallUnderscore)

  // 字段名称变体
  testFramework.register(testFieldVariantToolId)
  testFramework.register(testFieldVariantToolIdCamel)
  testFramework.register(testFieldVariantTool)
  testFramework.register(testFieldVariantFunction)
  testFramework.register(testFieldVariantParameters)
  testFramework.register(testFieldVariantParams)
  testFramework.register(testFieldVariantArgs)

  // 代码块格式
  testFramework.register(testCodeBlockJson)
  testFramework.register(testCodeBlockNoLang)

  // 宽松JSON格式
  testFramework.register(testLooseJsonSingleQuote)
  testFramework.register(testLooseJsonTrailingComma)
  testFramework.register(testLooseJsonSingleLineComment)
  testFramework.register(testLooseJsonMultiLineComment)

  // 数组格式
  testFramework.register(testArrayFormat)

  // 多行格式
  testFramework.register(testMultilineFormat)

  // DSML格式
  testFramework.register(testDSMLBasic)
  testFramework.register(testDSMLFunctionCalls)
  testFramework.register(testDSMLNestedInToolCall)
  testFramework.register(testDSMLSelfClosing)
  testFramework.register(testDSMLNoStringAttr)
  testFramework.register(testDSMLStringFalse)
  testFramework.register(testDSMLCallTag)
  testFramework.register(testDSMLCallWithFunctionCalls)
  testFramework.register(testDSMLCallNestedInToolCall)

  // XML格式
  testFramework.register(testXMLBasic)
  testFramework.register(testXMLMultiParams)
  testFramework.register(testXMLNestedParams)
  testFramework.register(testXMLEmptyParams)
  testFramework.register(testXMLSingleLine)

  // 纯XML格式（标签名即工具ID）
  testFramework.register(testPureXMLBasic)
  testFramework.register(testPureXMLMultiParams)
  testFramework.register(testPureXMLWithUseCurl)
  testFramework.register(testPureXMLSingleLine)
  testFramework.register(testPureXMLNestedParams)

  // OpenAI格式
  testFramework.register(testOpenAIBasic)
  testFramework.register(testOpenAIFieldVariant)

  // 多个工具调用
  testFramework.register(testMultipleToolCalls)

  // 边界情况
  testFramework.register(testEmptyParams)
  testFramework.register(testNoParamsField)
  testFramework.register(testParamValueNull)
  testFramework.register(testParamValueBoolean)
  testFramework.register(testParamValueNumber)
  testFramework.register(testParamValueArray)
  testFramework.register(testParamValueNestedArray)

  // 无效格式（返回null）
  testFramework.register(testInvalidNoMarkers)
  testFramework.register(testInvalidIncomplete)

  // 无效格式（返回dummy-tool作为fallback）
  testFramework.register(testInvalidMissingToolId)
  testFramework.register(testInvalidParamsNotObject)
  testFramework.register(testInvalidParamsIsArray)
  testFramework.register(testInvalidJsonParseError)
  testFramework.register(testInvalidNoJsonString)
  testFramework.register(testInvalidEmptyToolId)
  testFramework.register(testInvalidNullToolId)
  testFramework.register(testInvalidNumberToolId)
  testFramework.register(testInvalidObjectToolId)
  testFramework.register(testInvalidXMLMissingName)
  testFramework.register(testInvalidXMLMissingArguments)
  testFramework.register(testInvalidXMLEmptyName)
  testFramework.register(testInvalidXMLJsonParseError)
  testFramework.register(testInvalidPureXMLJsonParseError)
  testFramework.register(testInvalidPureXMLNotObject)
}
