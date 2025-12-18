import { testFramework, type TestFunction } from './test-framework'
import { convertLatexToMarkdown, convertMarkdownToLatex } from './latex-utils'

function normalize(text: string): string {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim()
}

function assertEqual(name: string, actual: string, expected: string) {
  if (normalize(actual) !== normalize(expected)) {
    throw new Error(
      `${name} 不相等\n实际:\n${normalize(actual)}\n预期:\n${normalize(expected)}`
    )
  }
}

function assertIncludes(name: string, actual: string, expectedSnippet: string) {
  if (!normalize(actual).includes(normalize(expectedSnippet))) {
    throw new Error(
      `${name} 未包含预期片段:\n片段:\n${expectedSnippet}\n实际:\n${normalize(actual)}`
    )
  }
}

const testLatexToMarkdown: TestFunction = {
  id: 'latex-utils.latex-to-markdown',
  name: 'LaTeX 转 Markdown',
  module: 'latex-utils',
  description: '覆盖注释、figure、longtable/longtblr、equation、lstlisting、letter',
  fn: async () => {
    const latex = `
% 注释应被移除
\\section{Intro}

\\begin{figure}[H]
  \\centering
  \\includegraphics[width=16cm]{img/da.png}
  \\caption{Workflow}
\\end{figure}

\\begin{longtable}{cl}
\\caption{Notations}\\label{tb:notation} \\\\
\\toprule
Symbol & Definition \\\\
\\midrule
G & Gold \\\\
\\bottomrule
\\end{longtable}

\\begin{equation}
  \\gamma = \\frac{a}{b}
\\end{equation}

\\begin{lstlisting}[language=Python]
print("hi")
\\end{lstlisting}

\\begin{letter}{Test Letter}
Content line
\\end{letter}

\\begin{longtblr}[
caption = {Variable Name},
]{
}
Variable & Code & Definition \\\\
Host & host & Whether host \\\\
\\hline
\\multicolumn{2}{c}{\\tablename\\ \\thetable\\ -- Continued from previous page} \\\\
\\multicolumn{1}{m{3cm}}{\\centering Symbol} & \\multicolumn{1}{m{8cm}}{\\centering Definition} \\\\
\\hline
\\endfirsthead
\\multicolumn{2}{r}{Continued on next page} \\\\
\\end{longtblr}
`

    const md = convertLatexToMarkdown(latex)

    assertIncludes('注释过滤', md, '# Intro')
    assertIncludes('figure 转图片', md, '![Workflow](img/da.png)')
    assertIncludes('longtable 转表格', md, '| Symbol | Definition |')
    assertIncludes('longtblr 转表格', md, '| Variable | Code | Definition |')
    assertIncludes('equation 转 $$ $$', md, '$$ \\gamma = \\frac{a}{b} $$')
    assertIncludes('lstlisting 转代码块', md, '```python')
    assertIncludes('letter 转标题', md, '### Test Letter')

    return { markdown: md }
  }
}

const testMarkdownToLatex: TestFunction = {
  id: 'latex-utils.markdown-to-latex',
  name: 'Markdown 转 LaTeX',
  module: 'latex-utils',
  description: '覆盖 figure、longtable、lstlisting、数学公式',
  fn: async () => {
    const md = `
![cap](img/da.png "cap")

| A | B |
| --- | --- |
| 1 | 2 |

\`\`\`python
print("hi")
\`\`\`

行内 $a+b$ 以及块级：

$$
x^2 + y^2
$$
`

    const latex = await convertMarkdownToLatex(md, 'TestDoc', { includePreamble: false })

    assertIncludes('图片转 figure', latex, '\\begin{figure}')
    assertIncludes('figure caption', latex, '\\caption{cap}')
    assertIncludes('图片路径', latex, '\\includegraphics')
    assertIncludes('表格转 longtable', latex, '\\begin{longtable}')
    assertIncludes('表格内容', latex, '1 & 2')
    assertIncludes('代码转 lstlisting', latex, '\\begin{lstlisting}[language=python]')
    assertIncludes('行内公式保留', latex, '$a+b$')
    assertIncludes('块级公式保留', latex, '$$')

    return { latex }
  }
}

const testTableConversion: TestFunction = {
  id: 'latex-utils.table-conversion',
  name: '表格转换测试',
  module: 'latex-utils',
  description: '测试表格转换，包括数学公式、multicolumn、multirow、大括号内的 & 符号等',
  fn: async () => {
    const latex = `
\\begin{longtable}{cl}
\\caption{Test Table} \\\\
\\toprule
Symbol & Definition \\\\
\\midrule
$\\alpha$ & Alpha symbol \\\\
\\multicolumn{2}{c}{Combined Header} \\\\
A & B \\\\
\\multirow{2}{*}{Multi} & Row 1 \\\\
& Row 2 \\\\
\\multicolumn{1}{c}{\\{A \\& B\\}} & Single cell with braces \\\\
\\end{longtable}
`

    const md = convertLatexToMarkdown(latex)

    // 测试基本表格结构
    assertIncludes('表格基本结构', md, '| Symbol | Definition |')
    assertIncludes('表格标题', md, '**Test Table**')
    
    // 测试数学公式在表格中
    assertIncludes('表格中的数学公式', md, '$\\alpha$')
    
    // 测试 multicolumn（应该提取内容，不包含列数和对齐信息）
    assertIncludes('multicolumn 内容提取', md, 'Combined Header')
    
    // 测试 multirow（应该提取内容）
    assertIncludes('multirow 内容提取', md, 'Multi')
    
    // 测试大括号内的 & 符号（应该被保护，不被分割）
    assertIncludes('大括号内的 & 符号', md, '{A & B}')

    return { markdown: md }
  }
}

const testReferenceHandling: TestFunction = {
  id: 'latex-utils.reference-handling',
  name: '参考文献处理测试',
  module: 'latex-utils',
  description: '测试参考文献处理，不依赖标题文本，通过 <div id="ref-X"/> 检测',
  fn: async () => {
    // 测试 Markdown 转 LaTeX：不依赖标题
    // Markdown 中的引用格式是 [[1](#ref-ref1)]
    const mdWithRefs = `
正文内容，引用[[1](#ref-ref1)]和[[2](#ref-ref2)]。

<div id="ref-ref1"/>

[1] First reference content

<div id="ref-ref2"/>

[2] Second reference content
`

    const latex = await convertMarkdownToLatex(mdWithRefs, 'TestDoc', { includePreamble: false })

    // 测试引用格式转换（Markdown 的 [[1](#ref-ref1)] 应该转换为 LaTeX 的 \cite{ref1}）
    assertIncludes('引用格式转换', latex, '\\cite{ref1}')
    assertIncludes('多个引用', latex, '\\cite{ref2}')
    
    // 测试参考文献列表生成
    assertIncludes('参考文献列表', latex, '\\begin{thebibliography}')
    assertIncludes('参考文献项1', latex, '\\bibitem{ref1}')
    assertIncludes('参考文献项2', latex, '\\bibitem{ref2}')
    assertIncludes('参考文献内容1', latex, 'First reference content')
    assertIncludes('参考文献内容2', latex, 'Second reference content')

    // 测试 LaTeX 转 Markdown：不依赖标题
    const latexWithRefs = `
正文内容，引用\\cite{ref1}和\\cite{ref2}。

\\begin{thebibliography}{99}
\\bibitem{ref1} First reference content
\\bibitem{ref2} Second reference content
\\end{thebibliography}
`

    const md = convertLatexToMarkdown(latexWithRefs)

    // 测试引用格式转换（LaTeX 的 \cite{ref1} 应该转换为 Markdown 的 [[ref1](#ref-ref1)]）
    assertIncludes('LaTeX 引用转 Markdown', md, '[[ref1](#ref-ref1)]')
    assertIncludes('多个 LaTeX 引用', md, '[[ref2](#ref-ref2)]')
    
    // 测试参考文献列表（不包含标题）
    assertIncludes('参考文献锚点1', md, '<div id="ref-ref1"/>')
    assertIncludes('参考文献锚点2', md, '<div id="ref-ref2"/>')
    assertIncludes('参考文献内容1', md, 'First reference content')
    assertIncludes('参考文献内容2', md, 'Second reference content')
    
    // 确保不包含硬编码的标题
    const normalizedMd = normalize(md)
    if (normalizedMd.includes('## References') || normalizedMd.includes('## 参考文献')) {
      throw new Error('不应该包含硬编码的参考文献标题')
    }

    return { markdown: md, latex }
  }
}

const testTableWithComplexContent: TestFunction = {
  id: 'latex-utils.table-complex-content',
  name: '表格复杂内容测试',
  module: 'latex-utils',
  description: '测试表格中包含复杂内容：嵌套大括号、数学公式、特殊字符等',
  fn: async () => {
    const latex = `
\\begin{tabular}{|c|l|}
\\hline
Column 1 & Column 2 \\\\
\\hline
$\\beta = \\frac{a}{b}$ & Math in cell \\\\
\\{Content with \\& symbol\\} & Braces and ampersand \\\\
\\multicolumn{2}{|c|}{Spanning cell with $x^2$} \\\\
\\hline
\\end{tabular}
`

    const md = convertLatexToMarkdown(latex)

    // 测试表格结构
    assertIncludes('表格列', md, '| Column 1 | Column 2 |')
    
    // 测试数学公式在单元格中
    assertIncludes('单元格中的数学公式', md, '$\\beta = \\frac{a}{b}$')
    
    // 测试大括号和 & 符号
    assertIncludes('大括号和 & 符号', md, '{Content with & symbol}')
    
    // 测试 multicolumn 中的数学公式
    assertIncludes('multicolumn 中的数学公式', md, '$x^2$')

    return { markdown: md }
  }
}

const testReferenceWithDifferentTitles: TestFunction = {
  id: 'latex-utils.reference-different-titles',
  name: '不同标题的参考文献测试',
  module: 'latex-utils',
  description: '测试不同语言的参考文献标题（中文、英文等），验证不依赖标题文本',
  fn: async () => {
    // 测试中文标题
    const mdChinese = `
正文内容[[1](#ref-ref1)]。

## 参考文献

<div id="ref-ref1"/>

[1] 第一个参考文献
`

    const latexChinese = await convertMarkdownToLatex(mdChinese, 'TestDoc', { includePreamble: false })
    
    // 应该正确提取参考文献，不依赖标题
    assertIncludes('中文标题参考文献提取', latexChinese, '\\bibitem{ref1}')
    assertIncludes('中文标题参考文献内容', latexChinese, '第一个参考文献')
    // 标题应该被移除（检查 section 或 subsection 命令中不包含"参考文献"）
    const normalizedLatexChinese = normalize(latexChinese)
    if (normalizedLatexChinese.match(/\\section\{[^}]*参考文献[^}]*\}/) || 
        normalizedLatexChinese.match(/\\subsection\{[^}]*参考文献[^}]*\}/)) {
      throw new Error('中文标题应该被移除，不应该出现在 section 或 subsection 命令中')
    }

    // 测试英文标题
    const mdEnglish = `
Content with [[1](#ref-ref1)].

## References

<div id="ref-ref1"/>

[1] First reference
`

    const latexEnglish = await convertMarkdownToLatex(mdEnglish, 'TestDoc', { includePreamble: false })
    
    // 应该正确提取参考文献，不依赖标题
    assertIncludes('英文标题参考文献提取', latexEnglish, '\\bibitem{ref1}')
    assertIncludes('英文标题参考文献内容', latexEnglish, 'First reference')
    // 标题应该被移除（检查 section 或 subsection 命令中不包含"References"）
    const normalizedLatexEnglish = normalize(latexEnglish)
    if (normalizedLatexEnglish.match(/\\section\{[^}]*References[^}]*\}/) || 
        normalizedLatexEnglish.match(/\\subsection\{[^}]*References[^}]*\}/)) {
      throw new Error('英文标题应该被移除，不应该出现在 section 或 subsection 命令中')
    }

    return { 
      latexChinese, 
      latexEnglish,
      message: '不同语言的参考文献标题都能正确处理，且标题被正确移除'
    }
  }
}

export function registerLatexUtilsTests() {
  testFramework.register(testLatexToMarkdown)
  testFramework.register(testMarkdownToLatex)
  testFramework.register(testTableConversion)
  testFramework.register(testReferenceHandling)
  testFramework.register(testTableWithComplexContent)
  testFramework.register(testReferenceWithDifferentTitles)
}

