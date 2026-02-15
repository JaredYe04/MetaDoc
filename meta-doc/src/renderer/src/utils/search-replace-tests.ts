/**
 * 查找替换功能单元测试
 * 测试正则表达式替换中的捕获组引用（$1, $2等）以及各种查找替换场景
 */

import { testFramework, type TestFunction } from './test-framework'

/**
 * 模拟的替换文本计算函数
 * 这个函数复制了适配器中的 computeReplacementText 逻辑
 */
function computeReplacementText(
  matchText: string,
  replacement: string,
  useRegex: boolean,
  preserveCase: boolean,
  groups?: string[]
): string {
  let result = replacement

  if (useRegex && groups && groups.length > 0) {
    // 处理 $1, $2, $3... 等捕获组引用
    // 同时也支持 $$ 表示字面量 $
    result = result.replace(/\$(\d+)|(\$\$)/g, (fullMatch, indexStr, literalDollar) => {
      // 如果是 $$，返回单个 $
      if (literalDollar) {
        return '$'
      }
      // 如果是 $1, $2 等，返回对应的捕获组
      const index = Number(indexStr)
      if (Number.isNaN(index) || index < 0 || index >= groups.length) {
        return fullMatch // 如果索引无效，返回原始字符串
      }
      return groups[index] ?? ''
    })
  }

  if (preserveCase) {
    result = adjustCase(matchText, result)
  }

  return result
}

/**
 * 调整大小写以匹配源文本
 */
function adjustCase(source: string, target: string): string {
  if (!source) return target
  if (source === source.toUpperCase()) {
    return target.toUpperCase()
  }
  if (source === source.toLowerCase()) {
    return target.toLowerCase()
  }
  if (source[0] === source[0].toUpperCase() && source.slice(1) === source.slice(1).toLowerCase()) {
    return target.charAt(0).toUpperCase() + target.slice(1)
  }
  return target
}

/**
 * 执行正则表达式匹配并返回捕获组
 */
function executeRegexMatch(
  pattern: string,
  text: string,
  matchCase: boolean
): RegExpExecArray | null {
  const flags = matchCase ? 'g' : 'gi'
  const regex = new RegExp(pattern, flags)
  regex.lastIndex = 0
  return regex.exec(text)
}

// ============ 测试用例定义 ============

/**
 * 测试用例1: 基本正则捕获组替换 - 单个捕获组 $1
 */
const testRegexCaptureGroup1: TestFunction = {
  id: 'search-replace.regex-capture-1',
  name: '正则捕获组替换 - $1',
  description: '测试使用 $1 引用第一个捕获组进行替换',
  module: '查找替换',
  fn: (pattern: string, text: string, replacement: string, matchCase: boolean) => {
    const match = executeRegexMatch(pattern, text, matchCase)
    if (!match) {
      return {
        input: { pattern, text, replacement },
        output: null,
        expected: 'No match found',
        passed: false,
        error: '未找到匹配项'
      }
    }
    const result = computeReplacementText(match[0], replacement, true, false, match)
    const expected = '456-123'
    return {
      input: { pattern, text, replacement },
      output: result,
      expected,
      passed: result === expected,
      groups: match,
      matchText: match[0]
    }
  },
  params: [
    {
      name: 'pattern',
      type: 'string',
      defaultValue: '(\\d+)-(\\d+)',
      description: '正则表达式模式（包含捕获组）'
    },
    {
      name: 'text',
      type: 'string',
      defaultValue: '123-456',
      description: '要匹配的文本'
    },
    {
      name: 'replacement',
      type: 'string',
      defaultValue: '$2-$1',
      description: '替换文本（使用 $2-$1 交换捕获组）'
    },
    {
      name: 'matchCase',
      type: 'boolean',
      defaultValue: false,
      description: '是否区分大小写'
    }
  ]
}

/**
 * 测试用例2: 多个捕获组替换 - $1, $2, $3
 */
const testRegexCaptureGroupMultiple: TestFunction = {
  id: 'search-replace.regex-capture-multiple',
  name: '正则捕获组替换 - 多个捕获组',
  description: '测试使用 $1, $2, $3 引用多个捕获组进行替换',
  module: '查找替换',
  fn: (pattern: string, text: string, replacement: string) => {
    const match = executeRegexMatch(pattern, text, false)
    if (!match) {
      return {
        input: { pattern, text, replacement },
        output: null,
        expected: 'No match found',
        passed: false,
        error: '未找到匹配项'
      }
    }
    const result = computeReplacementText(match[0], replacement, true, false, match)
    const expected = '2024年12月25日'
    return {
      input: { pattern, text, replacement },
      output: result,
      expected,
      passed: result === expected,
      groups: match,
      matchText: match[0]
    }
  },
  params: [
    {
      name: 'pattern',
      type: 'string',
      defaultValue: '(\\d{4})-(\\d{2})-(\\d{2})',
      description: '正则表达式模式（日期格式）'
    },
    {
      name: 'text',
      type: 'string',
      defaultValue: '2024-12-25',
      description: '要匹配的日期文本'
    },
    {
      name: 'replacement',
      type: 'string',
      defaultValue: '$1年$2月$3日',
      description: '替换文本（重新排列日期格式）'
    }
  ]
}

/**
 * 测试用例3: 字面量美元符号 - $$
 */
const testLiteralDollar: TestFunction = {
  id: 'search-replace.literal-dollar',
  name: '字面量美元符号 - $$',
  description: '测试使用 $$ 表示字面量 $ 符号',
  module: '查找替换',
  fn: (pattern: string, text: string, replacement: string) => {
    const match = executeRegexMatch(pattern, text, false)
    if (!match) {
      return {
        input: { pattern, text, replacement },
        output: null,
        expected: 'No match found',
        passed: false,
        error: '未找到匹配项'
      }
    }
    const result = computeReplacementText(match[0], replacement, true, false, match)
    const expected = 'Price: $100'
    return {
      input: { pattern, text, replacement },
      output: result,
      expected,
      passed: result === expected,
      groups: match,
      matchText: match[0],
      note: '$$ 应该被转换为单个 $ 符号'
    }
  },
  params: [
    {
      name: 'pattern',
      type: 'string',
      defaultValue: '(\\d+)',
      description: '正则表达式模式（匹配数字）'
    },
    {
      name: 'text',
      type: 'string',
      defaultValue: '100',
      description: '要匹配的文本'
    },
    {
      name: 'replacement',
      type: 'string',
      defaultValue: 'Price: $$$1',
      description: '替换文本（使用 $$ 表示字面量 $，$1 引用捕获组）'
    }
  ]
}

/**
 * 测试用例4: 无效捕获组索引
 */
const testInvalidCaptureGroup: TestFunction = {
  id: 'search-replace.invalid-capture-group',
  name: '无效捕获组索引',
  description: '测试当使用无效的捕获组索引（如 $99）时的行为',
  module: '查找替换',
  fn: (pattern: string, text: string, replacement: string) => {
    const match = executeRegexMatch(pattern, text, false)
    if (!match) {
      return {
        input: { pattern, text, replacement },
        output: null,
        expected: 'No match found',
        passed: false,
        error: '未找到匹配项'
      }
    }
    const result = computeReplacementText(match[0], replacement, true, false, match)
    // 无效索引应该返回原始字符串
    const expected = 'Hello $99 World'
    return {
      input: { pattern, text, replacement },
      output: result,
      expected,
      passed: result === expected,
      groups: match,
      matchText: match[0],
      note: '无效的捕获组索引（$99）应该保持原样'
    }
  },
  params: [
    {
      name: 'pattern',
      type: 'string',
      defaultValue: '(\\w+)',
      description: '正则表达式模式（匹配单词）'
    },
    {
      name: 'text',
      type: 'string',
      defaultValue: 'Hello',
      description: '要匹配的文本'
    },
    {
      name: 'replacement',
      type: 'string',
      defaultValue: '$1 $99 World',
      description: '替换文本（包含无效的捕获组索引 $99）'
    }
  ]
}

/**
 * 测试用例5: 保留大小写 - preserveCase
 */
const testPreserveCase: TestFunction = {
  id: 'search-replace.preserve-case',
  name: '保留大小写',
  description: '测试 preserveCase 功能，替换文本应该匹配源文本的大小写',
  module: '查找替换',
  fn: (matchText: string, replacement: string) => {
    const result = computeReplacementText(matchText, replacement, false, true)
    return {
      input: { matchText, replacement },
      output: result,
      expected: 'HELLO',
      passed: result === 'HELLO',
      note: '替换文本应该匹配源文本的大小写（全大写）'
    }
  },
  params: [
    {
      name: 'matchText',
      type: 'string',
      defaultValue: 'WORLD',
      description: '匹配的文本（全大写）'
    },
    {
      name: 'replacement',
      type: 'string',
      defaultValue: 'hello',
      description: '替换文本（小写，但应该转换为大写）'
    }
  ]
}

/**
 * 测试用例6: 保留大小写 - 首字母大写
 */
const testPreserveCaseTitleCase: TestFunction = {
  id: 'search-replace.preserve-case-title',
  name: '保留大小写 - 首字母大写',
  description: '测试 preserveCase 功能，当源文本是首字母大写时',
  module: '查找替换',
  fn: (matchText: string, replacement: string) => {
    const result = computeReplacementText(matchText, replacement, false, true)
    return {
      input: { matchText, replacement },
      output: result,
      expected: 'Hello',
      passed: result === 'Hello',
      note: '替换文本应该匹配源文本的大小写（首字母大写）'
    }
  },
  params: [
    {
      name: 'matchText',
      type: 'string',
      defaultValue: 'World',
      description: '匹配的文本（首字母大写）'
    },
    {
      name: 'replacement',
      type: 'string',
      defaultValue: 'hello',
      description: '替换文本（小写，但应该转换为首字母大写）'
    }
  ]
}

/**
 * 测试用例7: 正则替换 + 保留大小写组合
 */
const testRegexWithPreserveCase: TestFunction = {
  id: 'search-replace.regex-preserve-case',
  name: '正则替换 + 保留大小写',
  description: '测试正则捕获组替换和保留大小写功能的组合',
  module: '查找替换',
  fn: (pattern: string, text: string, replacement: string) => {
    const match = executeRegexMatch(pattern, text, false)
    if (!match) {
      return {
        input: { pattern, text, replacement },
        output: null,
        expected: 'No match found',
        passed: false,
        error: '未找到匹配项'
      }
    }
    const result = computeReplacementText(match[0], replacement, true, true, match)
    return {
      input: { pattern, text, replacement },
      output: result,
      expected: 'HELLO',
      passed: result === 'HELLO',
      groups: match,
      matchText: match[0],
      note: '替换文本应该先进行捕获组替换，然后匹配源文本的大小写'
    }
  },
  params: [
    {
      name: 'pattern',
      type: 'string',
      defaultValue: '(\\w+)',
      description: '正则表达式模式'
    },
    {
      name: 'text',
      type: 'string',
      defaultValue: 'WORLD',
      description: '要匹配的文本（全大写）'
    },
    {
      name: 'replacement',
      type: 'string',
      defaultValue: 'hello',
      description: '替换文本（应该转换为大写）'
    }
  ]
}

/**
 * 测试用例8: 复杂正则表达式 - 邮箱格式转换
 */
const testComplexRegexEmail: TestFunction = {
  id: 'search-replace.complex-regex-email',
  name: '复杂正则 - 邮箱格式转换',
  description: '测试使用正则表达式转换邮箱格式',
  module: '查找替换',
  fn: (pattern: string, text: string, replacement: string) => {
    const match = executeRegexMatch(pattern, text, false)
    if (!match) {
      return {
        input: { pattern, text, replacement },
        output: null,
        expected: 'No match found',
        passed: false,
        error: '未找到匹配项'
      }
    }
    const result = computeReplacementText(match[0], replacement, true, false, match)
    const expected = 'user (at) example.com'
    return {
      input: { pattern, text, replacement },
      output: result,
      expected,
      passed: result === expected,
      groups: match,
      matchText: match[0]
    }
  },
  params: [
    {
      name: 'pattern',
      type: 'string',
      defaultValue: '(\\w+)@(\\w+\\.\\w+)',
      description: '正则表达式模式（邮箱格式）'
    },
    {
      name: 'text',
      type: 'string',
      defaultValue: 'user@example.com',
      description: '要匹配的邮箱文本'
    },
    {
      name: 'replacement',
      type: 'string',
      defaultValue: '$1 (at) $2',
      description: '替换文本（转换邮箱格式）'
    }
  ]
}

/**
 * 测试用例9: 嵌套捕获组
 */
const testNestedCaptureGroups: TestFunction = {
  id: 'search-replace.nested-capture',
  name: '嵌套捕获组',
  description: '测试嵌套的捕获组替换',
  module: '查找替换',
  fn: (pattern: string, text: string, replacement: string) => {
    const match = executeRegexMatch(pattern, text, false)
    if (!match) {
      return {
        input: { pattern, text, replacement },
        output: null,
        expected: 'No match found',
        passed: false,
        error: '未找到匹配项'
      }
    }
    const result = computeReplacementText(match[0], replacement, true, false, match)
    const expected = 'First: Hello, Second: World'
    return {
      input: { pattern, text, replacement },
      output: result,
      expected,
      passed: result === expected,
      groups: match,
      matchText: match[0]
    }
  },
  params: [
    {
      name: 'pattern',
      type: 'string',
      defaultValue: '((\\w+) (\\w+))',
      description: '正则表达式模式（嵌套捕获组）'
    },
    {
      name: 'text',
      type: 'string',
      defaultValue: 'Hello World',
      description: '要匹配的文本'
    },
    {
      name: 'replacement',
      type: 'string',
      defaultValue: 'First: $2, Second: $3',
      description: '替换文本（使用嵌套的捕获组）'
    }
  ]
}

/**
 * 测试用例10: 空捕获组
 */
const testEmptyCaptureGroup: TestFunction = {
  id: 'search-replace.empty-capture',
  name: '空捕获组处理',
  description: '测试当捕获组为空时的行为',
  module: '查找替换',
  fn: (pattern: string, text: string, replacement: string) => {
    const match = executeRegexMatch(pattern, text, false)
    if (!match) {
      return {
        input: { pattern, text, replacement },
        output: null,
        expected: 'No match found',
        passed: false,
        error: '未找到匹配项'
      }
    }
    const result = computeReplacementText(match[0], replacement, true, false, match)
    // 使用可选捕获组，当匹配 "World" 时，第一个捕获组为空，第二个捕获组为 "World"
    const expected = 'Prefix: , Suffix: World'
    return {
      input: { pattern, text, replacement },
      output: result,
      expected,
      passed: result === expected,
      groups: match,
      matchText: match[0],
      note: '空的捕获组应该返回空字符串。注意：match[1] 可能是 undefined，应该被处理为空字符串'
    }
  },
  params: [
    {
      name: 'pattern',
      type: 'string',
      defaultValue: '(\\d*)(\\w+)',
      description: '正则表达式模式（第一个捕获组匹配数字，可能为空；第二个捕获组匹配单词）'
    },
    {
      name: 'text',
      type: 'string',
      defaultValue: 'World',
      description: '要匹配的文本（不包含数字，所以第一个捕获组为空）'
    },
    {
      name: 'replacement',
      type: 'string',
      defaultValue: 'Prefix: $1, Suffix: $2',
      description: '替换文本（第一个捕获组为空，第二个捕获组为 "World"）'
    }
  ]
}

/**
 * 测试用例11: 多个 $ 符号混合使用
 */
const testMixedDollarSigns: TestFunction = {
  id: 'search-replace.mixed-dollar',
  name: '混合使用 $ 符号',
  description: '测试同时使用捕获组引用和字面量 $ 符号',
  module: '查找替换',
  fn: (pattern: string, text: string, replacement: string) => {
    const match = executeRegexMatch(pattern, text, false)
    if (!match) {
      return {
        input: { pattern, text, replacement },
        output: null,
        expected: 'No match found',
        passed: false,
        error: '未找到匹配项'
      }
    }
    const result = computeReplacementText(match[0], replacement, true, false, match)
    const expected = 'Price: $100, Tax: $10'
    return {
      input: { pattern, text, replacement },
      output: result,
      expected,
      passed: result === expected,
      groups: match,
      matchText: match[0]
    }
  },
  params: [
    {
      name: 'pattern',
      type: 'string',
      defaultValue: '(\\d+)-(\\d+)',
      description: '正则表达式模式（价格-税费）'
    },
    {
      name: 'text',
      type: 'string',
      defaultValue: '100-10',
      description: '要匹配的文本'
    },
    {
      name: 'replacement',
      type: 'string',
      defaultValue: 'Price: $$100, Tax: $$10',
      description: '替换文本（混合使用 $ 符号）'
    }
  ]
}

/**
 * 测试用例12: 非正则模式下的普通替换
 */
const testNonRegexReplacement: TestFunction = {
  id: 'search-replace.non-regex',
  name: '非正则模式替换',
  description: '测试不使用正则表达式时的普通文本替换',
  module: '查找替换',
  fn: (matchText: string, replacement: string) => {
    const result = computeReplacementText(matchText, replacement, false, false)
    return {
      input: { matchText, replacement },
      output: result,
      expected: replacement,
      passed: result === replacement,
      note: '非正则模式下，$1, $2 等应该作为普通文本处理'
    }
  },
  params: [
    {
      name: 'matchText',
      type: 'string',
      defaultValue: 'Hello',
      description: '匹配的文本'
    },
    {
      name: 'replacement',
      type: 'string',
      defaultValue: '$1 World',
      description: '替换文本（$1 应该作为普通文本）'
    }
  ]
}

/**
 * 测试用例13: 边界情况 - 空字符串
 */
const testEmptyString: TestFunction = {
  id: 'search-replace.empty-string',
  name: '空字符串处理',
  description: '测试空字符串的替换',
  module: '查找替换',
  fn: (matchText: string, replacement: string) => {
    const result = computeReplacementText(matchText, replacement, false, false)
    return {
      input: { matchText, replacement },
      output: result,
      expected: replacement,
      passed: result === replacement,
      note: '空字符串应该正常替换'
    }
  },
  params: [
    {
      name: 'matchText',
      type: 'string',
      defaultValue: '',
      description: '匹配的文本（空字符串）'
    },
    {
      name: 'replacement',
      type: 'string',
      defaultValue: 'Replaced',
      description: '替换文本'
    }
  ]
}

/**
 * 测试用例14: 边界情况 - 非常大的捕获组索引
 */
const testLargeCaptureGroupIndex: TestFunction = {
  id: 'search-replace.large-index',
  name: '大捕获组索引',
  description: '测试使用非常大的捕获组索引（超出范围）',
  module: '查找替换',
  fn: (pattern: string, text: string, replacement: string) => {
    const match = executeRegexMatch(pattern, text, false)
    if (!match) {
      return {
        input: { pattern, text, replacement },
        output: null,
        expected: 'No match found',
        passed: false,
        error: '未找到匹配项'
      }
    }
    const result = computeReplacementText(match[0], replacement, true, false, match)
    // $1 应该被替换为 "Hello"（有效索引），$999999 应该保持原样（超出范围）
    const expected = 'Hello and $999999'
    return {
      input: { pattern, text, replacement },
      output: result,
      expected,
      passed: result === expected,
      groups: match,
      matchText: match[0],
      note: '有效的捕获组索引（$1）应该被替换，超出范围的索引（$999999）应该保持原样'
    }
  },
  params: [
    {
      name: 'pattern',
      type: 'string',
      defaultValue: '(\\w+)',
      description: '正则表达式模式'
    },
    {
      name: 'text',
      type: 'string',
      defaultValue: 'Hello',
      description: '要匹配的文本'
    },
    {
      name: 'replacement',
      type: 'string',
      defaultValue: '$1 and $999999',
      description: '替换文本（包含有效索引 $1 和超出范围的索引 $999999）'
    }
  ]
}

/**
 * 测试用例15: 实际场景 - 电话号码格式转换
 */
const testPhoneNumberFormat: TestFunction = {
  id: 'search-replace.phone-format',
  name: '实际场景 - 电话号码格式转换',
  description: '测试使用正则表达式转换电话号码格式',
  module: '查找替换',
  fn: (pattern: string, text: string, replacement: string) => {
    const match = executeRegexMatch(pattern, text, false)
    if (!match) {
      return {
        input: { pattern, text, replacement },
        output: null,
        expected: 'No match found',
        passed: false,
        error: '未找到匹配项'
      }
    }
    const result = computeReplacementText(match[0], replacement, true, false, match)
    const expected = '(010) 1234-5678'
    return {
      input: { pattern, text, replacement },
      output: result,
      expected,
      passed: result === expected,
      groups: match,
      matchText: match[0]
    }
  },
  params: [
    {
      name: 'pattern',
      type: 'string',
      defaultValue: '(\\d{3})(\\d{4})(\\d{4})',
      description: '正则表达式模式（11位电话号码）'
    },
    {
      name: 'text',
      type: 'string',
      defaultValue: '01012345678',
      description: '要匹配的电话号码'
    },
    {
      name: 'replacement',
      type: 'string',
      defaultValue: '($1) $2-$3',
      description: '替换文本（格式化电话号码）'
    }
  ]
}

// ============ 注册所有测试函数 ============

/**
 * 注册所有查找替换测试用例
 */
export function registerSearchReplaceTests() {
  testFramework.register(testRegexCaptureGroup1)
  testFramework.register(testRegexCaptureGroupMultiple)
  testFramework.register(testLiteralDollar)
  testFramework.register(testInvalidCaptureGroup)
  testFramework.register(testPreserveCase)
  testFramework.register(testPreserveCaseTitleCase)
  testFramework.register(testRegexWithPreserveCase)
  testFramework.register(testComplexRegexEmail)
  testFramework.register(testNestedCaptureGroups)
  testFramework.register(testEmptyCaptureGroup)
  testFramework.register(testMixedDollarSigns)
  testFramework.register(testNonRegexReplacement)
  testFramework.register(testEmptyString)
  testFramework.register(testLargeCaptureGroupIndex)
  testFramework.register(testPhoneNumberFormat)
}
