/**
 * 标题格式化测试用例
 * 用于测试 cleanTitleMarkers 函数在各种情况下的行为
 */

import { testFramework, type TestFunction } from '../testing/test-framework'
import { cleanTitleMarkers } from './title-format'

// ============ 测试用例定义 ============

/**
 * 测试用例1: Markdown 标题清除 - 一级标题
 */
const testMarkdownH1: TestFunction = {
  id: 'title-format.markdown-h1',
  name: 'Markdown 一级标题清除 (# Title)',
  description: '测试清除 Markdown 一级标题标记',
  module: '标题格式化',
  fn: (title: string) => {
    const result = cleanTitleMarkers(title)
    return {
      input: title,
      output: result,
      expected: 'Title',
      passed: result === 'Title'
    }
  },
  params: [
    {
      name: 'title',
      type: 'string',
      defaultValue: '# Title',
      description: '包含 Markdown 一级标题标记的标题'
    }
  ]
}

/**
 * 测试用例2: Markdown 标题清除 - 二级标题
 */
const testMarkdownH2: TestFunction = {
  id: 'title-format.markdown-h2',
  name: 'Markdown 二级标题清除 (## Title)',
  description: '测试清除 Markdown 二级标题标记',
  module: '标题格式化',
  fn: (title: string) => {
    const result = cleanTitleMarkers(title)
    return {
      input: title,
      output: result,
      expected: 'Title',
      passed: result === 'Title'
    }
  },
  params: [
    {
      name: 'title',
      type: 'string',
      defaultValue: '## Title',
      description: '包含 Markdown 二级标题标记的标题'
    }
  ]
}

/**
 * 测试用例3: Markdown 标题清除 - 三级标题
 */
const testMarkdownH3: TestFunction = {
  id: 'title-format.markdown-h3',
  name: 'Markdown 三级标题清除 (### Title)',
  description: '测试清除 Markdown 三级标题标记',
  module: '标题格式化',
  fn: (title: string) => {
    const result = cleanTitleMarkers(title)
    return {
      input: title,
      output: result,
      expected: 'Title',
      passed: result === 'Title'
    }
  },
  params: [
    {
      name: 'title',
      type: 'string',
      defaultValue: '### Title',
      description: '包含 Markdown 三级标题标记的标题'
    }
  ]
}

/**
 * 测试用例4: LaTeX section 命令清除
 */
const testLatexSection: TestFunction = {
  id: 'title-format.latex-section',
  name: 'LaTeX section 命令清除 (\\section{Title})',
  description: '测试清除 LaTeX \\section{} 命令',
  module: '标题格式化',
  fn: (title: string) => {
    const result = cleanTitleMarkers(title)
    return {
      input: title,
      output: result,
      expected: 'Title',
      passed: result === 'Title'
    }
  },
  params: [
    {
      name: 'title',
      type: 'string',
      defaultValue: '\\section{Title}',
      description: '包含 LaTeX \\section{} 命令的标题'
    }
  ]
}

/**
 * 测试用例5: LaTeX subsection 命令清除
 */
const testLatexSubsection: TestFunction = {
  id: 'title-format.latex-subsection',
  name: 'LaTeX subsection 命令清除 (\\subsection{Title})',
  description: '测试清除 LaTeX \\subsection{} 命令',
  module: '标题格式化',
  fn: (title: string) => {
    const result = cleanTitleMarkers(title)
    return {
      input: title,
      output: result,
      expected: 'Title',
      passed: result === 'Title'
    }
  },
  params: [
    {
      name: 'title',
      type: 'string',
      defaultValue: '\\subsection{Title}',
      description: '包含 LaTeX \\subsection{} 命令的标题'
    }
  ]
}

/**
 * 测试用例6: LaTeX section* 命令清除（带星号）
 */
const testLatexSectionStar: TestFunction = {
  id: 'title-format.latex-section-star',
  name: 'LaTeX section* 命令清除 (\\section*{Title})',
  description: '测试清除 LaTeX \\section*{} 命令（不编号的章节）',
  module: '标题格式化',
  fn: (title: string) => {
    const result = cleanTitleMarkers(title)
    return {
      input: title,
      output: result,
      expected: 'Title',
      passed: result === 'Title'
    }
  },
  params: [
    {
      name: 'title',
      type: 'string',
      defaultValue: '\\section*{Title}',
      description: '包含 LaTeX \\section*{} 命令的标题'
    }
  ]
}

/**
 * 测试用例7: LaTeX 嵌套大括号处理
 */
const testLatexNestedBraces: TestFunction = {
  id: 'title-format.latex-nested-braces',
  name: 'LaTeX 嵌套大括号处理 (\\section{Title {with} nested})',
  description: '测试处理 LaTeX 命令中的嵌套大括号',
  module: '标题格式化',
  fn: (title: string) => {
    const result = cleanTitleMarkers(title)
    return {
      input: title,
      output: result,
      expected: 'Title {with} nested',
      passed: result === 'Title {with} nested'
    }
  },
  params: [
    {
      name: 'title',
      type: 'string',
      defaultValue: '\\section{Title {with} nested}',
      description: '包含嵌套大括号的 LaTeX 命令'
    }
  ]
}

/**
 * 测试用例8: LaTeX 转义字符处理
 */
const testLatexEscapedChars: TestFunction = {
  id: 'title-format.latex-escaped-chars',
  name: 'LaTeX 转义字符处理 (\\section{Title \\{with\\} escaped})',
  description: '测试处理 LaTeX 命令中的转义字符',
  module: '标题格式化',
  fn: (title: string) => {
    const result = cleanTitleMarkers(title)
    return {
      input: title,
      output: result,
      expected: 'Title \\{with\\} escaped',
      passed: result === 'Title \\{with\\} escaped'
    }
  },
  params: [
    {
      name: 'title',
      type: 'string',
      defaultValue: '\\section{Title \\{with\\} escaped}',
      description: '包含转义字符的 LaTeX 命令'
    }
  ]
}

/**
 * 测试用例9: 不误匹配其他 LaTeX 命令 - textbf
 */
const testLatexNoMatchTextbf: TestFunction = {
  id: 'title-format.latex-no-match-textbf',
  name: '不误匹配其他命令 - \\textbf{}',
  description: '测试确保不会误清除 \\textbf{} 命令',
  module: '标题格式化',
  fn: (title: string) => {
    const result = cleanTitleMarkers(title)
    return {
      input: title,
      output: result,
      expected: title, // 应该保持不变
      passed: result === title
    }
  },
  params: [
    {
      name: 'title',
      type: 'string',
      defaultValue: '\\textbf{Bold Text}',
      description: '包含 \\textbf{} 命令的文本（不应该被清除）'
    }
  ]
}

/**
 * 测试用例10: 不误匹配其他 LaTeX 命令 - textit
 */
const testLatexNoMatchTextit: TestFunction = {
  id: 'title-format.latex-no-match-textit',
  name: '不误匹配其他命令 - \\textit{}',
  description: '测试确保不会误清除 \\textit{} 命令',
  module: '标题格式化',
  fn: (title: string) => {
    const result = cleanTitleMarkers(title)
    return {
      input: title,
      output: result,
      expected: title, // 应该保持不变
      passed: result === title
    }
  },
  params: [
    {
      name: 'title',
      type: 'string',
      defaultValue: '\\textit{Italic Text}',
      description: '包含 \\textit{} 命令的文本（不应该被清除）'
    }
  ]
}

/**
 * 测试用例11: 不误匹配代码中的 # 符号
 */
const testMarkdownNoMatchCodeHash: TestFunction = {
  id: 'title-format.markdown-no-match-code-hash',
  name: '不误匹配代码中的 # 符号',
  description: '测试确保不会误清除代码中的 # 符号（后面没有空格）',
  module: '标题格式化',
  fn: (title: string) => {
    const result = cleanTitleMarkers(title)
    return {
      input: title,
      output: result,
      expected: title, // 应该保持不变
      passed: result === title
    }
  },
  params: [
    {
      name: 'title',
      type: 'string',
      defaultValue: 'Code #include <stdio.h>',
      description: '包含 # 符号但后面没有空格的文本（不应该被清除）'
    }
  ]
}

/**
 * 测试用例12: 空字符串处理
 */
const testEmptyString: TestFunction = {
  id: 'title-format.empty-string',
  name: '空字符串处理',
  description: '测试空字符串的处理',
  module: '标题格式化',
  fn: (title: string) => {
    const result = cleanTitleMarkers(title)
    return {
      input: title,
      output: result,
      expected: '',
      passed: result === ''
    }
  },
  params: [
    {
      name: 'title',
      type: 'string',
      defaultValue: '',
      description: '空字符串'
    }
  ]
}

/**
 * 测试用例13: 普通文本（无标记）
 */
const testPlainText: TestFunction = {
  id: 'title-format.plain-text',
  name: '普通文本（无标记）',
  description: '测试普通文本（不包含任何标记）的处理',
  module: '标题格式化',
  fn: (title: string) => {
    const result = cleanTitleMarkers(title)
    return {
      input: title,
      output: result,
      expected: title, // 应该保持不变
      passed: result === title
    }
  },
  params: [
    {
      name: 'title',
      type: 'string',
      defaultValue: 'Plain Title Text',
      description: '不包含任何标记的普通文本'
    }
  ]
}

/**
 * 测试用例14: LaTeX chapter 命令清除
 */
const testLatexChapter: TestFunction = {
  id: 'title-format.latex-chapter',
  name: 'LaTeX chapter 命令清除 (\\chapter{Title})',
  description: '测试清除 LaTeX \\chapter{} 命令',
  module: '标题格式化',
  fn: (title: string) => {
    const result = cleanTitleMarkers(title)
    return {
      input: title,
      output: result,
      expected: 'Title',
      passed: result === 'Title'
    }
  },
  params: [
    {
      name: 'title',
      type: 'string',
      defaultValue: '\\chapter{Title}',
      description: '包含 LaTeX \\chapter{} 命令的标题'
    }
  ]
}

/**
 * 测试用例15: LaTeX paragraph 命令清除
 */
const testLatexParagraph: TestFunction = {
  id: 'title-format.latex-paragraph',
  name: 'LaTeX paragraph 命令清除 (\\paragraph{Title})',
  description: '测试清除 LaTeX \\paragraph{} 命令',
  module: '标题格式化',
  fn: (title: string) => {
    const result = cleanTitleMarkers(title)
    return {
      input: title,
      output: result,
      expected: 'Title',
      passed: result === 'Title'
    }
  },
  params: [
    {
      name: 'title',
      type: 'string',
      defaultValue: '\\paragraph{Title}',
      description: '包含 LaTeX \\paragraph{} 命令的标题'
    }
  ]
}

/**
 * 测试用例16: LaTeX title 命令清除
 */
const testLatexTitle: TestFunction = {
  id: 'title-format.latex-title',
  name: 'LaTeX title 命令清除 (\\title{Title})',
  description: '测试清除 LaTeX \\title{} 命令',
  module: '标题格式化',
  fn: (title: string) => {
    const result = cleanTitleMarkers(title)
    return {
      input: title,
      output: result,
      expected: 'Title',
      passed: result === 'Title'
    }
  },
  params: [
    {
      name: 'title',
      type: 'string',
      defaultValue: '\\title{Title}',
      description: '包含 LaTeX \\title{} 命令的标题'
    }
  ]
}

/**
 * 测试用例17: 混合情况 - Markdown 和 LaTeX 同时存在
 */
const testMixedMarkers: TestFunction = {
  id: 'title-format.mixed-markers',
  name: '混合标记处理 (先 Markdown 后 LaTeX)',
  description: '测试同时包含 Markdown 和 LaTeX 标记的情况（应该先清除 Markdown，再清除 LaTeX）',
  module: '标题格式化',
  fn: (title: string) => {
    const result = cleanTitleMarkers(title)
    return {
      input: title,
      output: result,
      expected: 'Title',
      passed: result === 'Title'
    }
  },
  params: [
    {
      name: 'title',
      type: 'string',
      defaultValue: '# \\section{Title}',
      description: '同时包含 Markdown 和 LaTeX 标记的标题'
    }
  ]
}

/**
 * 测试用例18: 复杂嵌套情况
 */
const testComplexNested: TestFunction = {
  id: 'title-format.complex-nested',
  name: '复杂嵌套大括号处理',
  description: '测试处理多层嵌套的大括号',
  module: '标题格式化',
  fn: (title: string) => {
    const result = cleanTitleMarkers(title)
    return {
      input: title,
      output: result,
      expected: 'Title {with {deep} nesting}',
      passed: result === 'Title {with {deep} nesting}'
    }
  },
  params: [
    {
      name: 'title',
      type: 'string',
      defaultValue: '\\section{Title {with {deep} nesting}}',
      description: '包含多层嵌套大括号的 LaTeX 命令'
    }
  ]
}

/**
 * 测试用例19: 带前后空格的标题
 */
const testWithSpaces: TestFunction = {
  id: 'title-format.with-spaces',
  name: '带前后空格的标题处理',
  description: '测试带前后空格的标题（应该被 trim）',
  module: '标题格式化',
  fn: (title: string) => {
    const result = cleanTitleMarkers(title)
    return {
      input: title,
      output: result,
      expected: 'Title',
      passed: result === 'Title'
    }
  },
  params: [
    {
      name: 'title',
      type: 'string',
      defaultValue: '  # Title  ',
      description: '带前后空格的 Markdown 标题'
    }
  ]
}

/**
 * 测试用例20: 不误匹配 - 标题中包含 # 但不在开头
 */
const testHashInMiddle: TestFunction = {
  id: 'title-format.hash-in-middle',
  name: '标题中间包含 # 符号',
  description: '测试标题中间包含 # 符号的情况（不应该被清除）',
  module: '标题格式化',
  fn: (title: string) => {
    const result = cleanTitleMarkers(title)
    return {
      input: title,
      output: result,
      expected: title, // 应该保持不变
      passed: result === title
    }
  },
  params: [
    {
      name: 'title',
      type: 'string',
      defaultValue: 'Title #123 in middle',
      description: '标题中间包含 # 符号的文本'
    }
  ]
}

// ============ 注册所有测试函数 ============

/**
 * 注册所有标题格式化测试用例
 */
export function registerTitleFormatTests() {
  testFramework.register(testMarkdownH1)
  testFramework.register(testMarkdownH2)
  testFramework.register(testMarkdownH3)
  testFramework.register(testLatexSection)
  testFramework.register(testLatexSubsection)
  testFramework.register(testLatexSectionStar)
  testFramework.register(testLatexNestedBraces)
  testFramework.register(testLatexEscapedChars)
  testFramework.register(testLatexNoMatchTextbf)
  testFramework.register(testLatexNoMatchTextit)
  testFramework.register(testMarkdownNoMatchCodeHash)
  testFramework.register(testEmptyString)
  testFramework.register(testPlainText)
  testFramework.register(testLatexChapter)
  testFramework.register(testLatexParagraph)
  testFramework.register(testLatexTitle)
  testFramework.register(testMixedMarkers)
  testFramework.register(testComplexNested)
  testFramework.register(testWithSpaces)
  testFramework.register(testHashInMiddle)
}
