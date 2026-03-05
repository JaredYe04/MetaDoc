import MarkdownIt from 'markdown-it'
import footnote from 'markdown-it-footnote'
import taskLists from 'markdown-it-task-lists'
import { extractOutlineTreeFromMarkdown, generateMarkdownFromOutlineTree } from './md-utils'
import { markdownToLatex, latexToMarkdown } from '../../../converter'

const md = new MarkdownIt({
  html: false,
  breaks: false,
  linkify: true
})
  .use(footnote)
  .use(taskLists, { enabled: true })

/**
 * 转换Markdown正文内容为LaTeX格式（仅正文，不包含documentclass、包等）
 * 内部使用 AST 转换库 src/converter
 * @param {string} markdown - Markdown内容
 * @returns {Promise<string>} LaTeX正文内容
 */
export async function convertMarkdownBodyToLatex(markdown) {
  return Promise.resolve(markdownToLatex(markdown ?? ''))
}

export async function convertMarkdownToLatex(markdown, title = 'Generated Document', options = {}) {
  const body = markdownToLatex(markdown ?? '')

  // 提取选项，设置默认值
  const documentClass = options.documentClass || 'article'
  const includePackages = options.includePackages !== false // 默认 true
  const generateCover = options.generateCover === true
  const generateToc = options.generateToc === true
  const showPageNumbers = options.showPageNumbers !== false // 默认 true
  const showHeader = options.showHeader !== false // 默认 true
  const meta = options.meta || {} // 文档元信息

  // 生成封面
  let coverContent = ''
  if (generateCover) {
    const coverTitle = meta.title || title
    const coverAuthor = meta.author || ''
    const coverDescription = meta.description || ''
    const coverKeywords = meta.keywords || []
    coverContent = `\\begin{titlepage}
\\centering
\\vspace*{2cm}
{\\Huge\\bfseries ${escapeLatex(coverTitle)}\\par}
\\vspace{1.5cm}
${coverAuthor ? `{\\Large ${escapeLatex(coverAuthor)}\\par}` : ''}
\\vspace{2cm}
${coverDescription ? `{\\large ${escapeLatex(coverDescription)}\\par}` : ''}
\\vspace{1cm}
${coverKeywords.length > 0 ? `{\\normalsize 关键词：${escapeLatex(coverKeywords.join('、'))}\\par}` : ''}
\\vfill
\\end{titlepage}
\\newpage
`
  }

  // 生成目录
  let tocContent = ''
  if (generateToc) {
    tocContent = `\\tableofcontents
\\newpage
`
  }

  // 构建包列表
  const packages = includePackages
    ? `
\\usepackage{fontspec}
\\usepackage{xeCJK}
\\usepackage{graphicx}
\\usepackage[export]{adjustbox}
\\usepackage{hyperref}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{ulem}
\\usepackage{geometry}
\\usepackage{color}
\\usepackage{fancyhdr}
\\usepackage{lastpage}
\\usepackage{float}
\\usepackage{placeins}
\\usepackage{amsthm}
\\usepackage{amsfonts}
\\usepackage{mathrsfs}`
    : ''

  // 构建页眉页脚
  let headerFooter = ''
  if (showHeader || showPageNumbers) {
    headerFooter = `\\pagestyle{fancy}
\\fancyhf{}`
    if (showHeader) {
      headerFooter += `
\\lhead{${escapeLatex(title)}}
\\rhead{Page \\thepage\\,of\\,\\pageref{LastPage}}`
    }
    if (showPageNumbers) {
      headerFooter += `
\\cfoot{\\thepage}`
    }
  } else {
    headerFooter = `\\pagestyle{plain}`
  }

  const latex = `
\\documentclass{${documentClass}}${packages}

% 英文正文字体
\\setmainfont{Times New Roman} % 英文正文
\\setsansfont{Arial}           % 英文无衬线体
\\setmonofont{Consolas}        % 英文等宽字体

% 中文字体
\\setCJKmainfont{SimSun}       % 中文正文
\\setCJKsansfont{Microsoft YaHei} % 中文无衬线体
\\setCJKmonofont{FangSong}     % 中文等宽字体（可选）

\\geometry{margin=1in}
${headerFooter}
\\begin{document}
${coverContent}${tocContent}${body}
\\label{LastPage}
\\end{document}
  `.trim()
  return latex
}

async function convertTokensToLatex(tokens) {
  const blocks = splitTokensIntoBlocks(tokens)
  let latex = ''

  for (const block of blocks) {
    latex += (await convertBlockToLatex(block)) + '\n\n'
  }

  return latex.trim()
}

async function convertBlockToLatex(tokens) {
  let latex = ''
  const stack = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    switch (token.type) {
      case 'heading_open': {
        const level = parseInt(token.tag.slice(1))
        const cmd =
          ['section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph', 'textbf'][
            level - 1
          ] || 'textbf'
        latex += `\\${cmd}{`
        stack.push('heading')
        break
      }

      case 'heading_close':
        if (stack.pop() === 'heading') latex += '}\n\n'
        break

      case 'paragraph_open':
        latex += '\n\n'
        break
      case 'paragraph_close':
        latex += '\n\n'
        break
      case 'text': {
        // 检测文本是否包含 LaTeX 环境或命令
        // 如果包含，则不转义，直接输出（因为已经是 LaTeX 代码）
        const content = token.content || ''
        // 检测常见的 LaTeX 环境开始标记
        const hasLatexEnv =
          /\\begin\{[^}]+\}/.test(content) ||
          /\\end\{[^}]+\}/.test(content) ||
          /\\[a-zA-Z@]+\*?(\[[^\]]*\])?\{/.test(content)

        if (hasLatexEnv) {
          // 包含 LaTeX 代码，直接输出不转义
          latex += content
        } else {
          // 普通文本，需要转义
          latex += escapeLatex(content)
        }
        break
      }

      case 'em_open':
        latex += '\\emph{'
        stack.push('em')
        break
      case 'em_close':
        if (stack.pop() === 'em') latex += '}'
        break

      case 'strong_open':
        latex += '\\textbf{'
        stack.push('strong')
        break
      case 'strong_close':
        if (stack.pop() === 'strong') latex += '}'
        break

      case 's_open':
        latex += '\\sout{'
        stack.push('s')
        break
      case 's_close':
        if (stack.pop() === 's') latex += '}'
        break

      case 'bullet_list_open':
        latex += '\\begin{itemize}\n'
        stack.push('list')
        break
      case 'bullet_list_close':
        if (stack.pop() === 'list') latex += '\\end{itemize}\n'
        break

      case 'ordered_list_open':
        latex += '\\begin{enumerate}\n'
        stack.push('olist')
        break
      case 'ordered_list_close':
        if (stack.pop() === 'olist') latex += '\\end{enumerate}\n'
        break

      case 'list_item_open':
        latex += '\\item '
        break
      case 'list_item_close':
        latex += '\n'
        break

      case 'code_inline':
        latex += `\\texttt{${escapeLatex(token.content)}}`
        break

      case 'fence':
      case 'code_block': {
        // // 如果代码块语言是 latex，直接输出内容（不包装在 verbatim 中）
        // // 这样可以保留 figure 环境等 LaTeX 代码
        // const language = (token.info || '').trim().toLowerCase();
        // if (language === 'latex') {
        //     // 直接输出 LaTeX 代码，不转义
        //     latex += token.content;
        // } else {
        //     // 其他语言的代码块，使用 verbatim 环境
        //     latex += `\\begin{verbatim}\n${token.content}\\end{verbatim}\n\n`;
        // }
        latex += `\\begin{verbatim}\n${token.content}\\end{verbatim}\n\n`
        //不管是什么语言，都使用 verbatim 环境，避免转义问题，因为代码框的代码只应该用于阅读，不应该用于编译
        break
      }

      case 'blockquote_open':
        latex += '\\begin{quote}\n'
        stack.push('quote')
        break
      case 'blockquote_close':
        if (stack.pop() === 'quote') latex += '\\end{quote}\n'
        break

      case 'hr':
        latex += '\n\\hrulefill\n'
        break

      case 'link_open': {
        const href = token.attrs?.find(([k]) => k === 'href')?.[1] || ''
        latex += `\\href{${href}}{`
        stack.push('link')
        break
      }
      case 'link_close':
        if (stack.pop() === 'link') latex += '}'
        break

      case 'image': {
        let src = token.attrs.find(([k]) => k === 'src')?.[1] || ''
        const alt = escapeLatex(token.content || '')

        try {
          src = decodeURIComponent(src)
        } catch (e) {
          // 如果 decode 失败，保持原样
        }

        // 检测是否为 SVG 文件
        const isSvg = src.toLowerCase().endsWith('.svg')

        // 路径处理：统一转换为正斜杠
        let normalizedPath = src.replace(/\\/g, '/')

        if (isSvg) {
          // SVG 文件需要转换为 PDF
          try {
            const { convertSvgToPdf } = await import('./svg-to-pdf-utils.js')
            // 使用统一的 SVG 转 PDF 工具函数
            normalizedPath = await convertSvgToPdf(normalizedPath, { returnUrl: false })
          } catch (error) {
            // 转换失败，使用原始 SVG 路径（可能会失败，但至少可以尝试）
            console.warn('SVG 转 PDF 失败，使用原始路径:', error)
          }

          // 路径处理：使用 \detokenize 避免转义问题，保留下划线等字符
          // 注意：\detokenize 的参数不应该被转义，因为 \detokenize 会处理所有特殊字符
          // 只需要统一路径分隔符即可
          normalizedPath = normalizedPath.replace(/\\/g, '/')

          // 对于 PDF（转换后的 SVG），使用标准的 includegraphics
          // 使用 [H] 强制图片在当前位置，不允许浮动
          latex += `
\\begin{figure}[H]
  \\centering
  \\includegraphics[width=0.8\\textwidth]{\\detokenize{${normalizedPath}}}
  \\caption{${alt}}
\\end{figure}
`
        } else {
          // 其他图片格式：需要转义所有特殊字符（包括下划线）
          normalizedPath = normalizedPath.replace(/([#%&{}_])/g, '\\$1')

          // 使用 [H] 强制图片在当前位置，不允许浮动
          latex += `
\\begin{figure}[H]
  \\centering
  \\includegraphics[width=0.8\\textwidth]{${normalizedPath}}
  \\caption{${alt}}
\\end{figure}
`
        }
        break
      }

      case 'footnote_ref': {
        const id = token.meta.id + 1
        latex += `\\footnote{[fn${id}]}`
        break
      }

      case 'footnote_block_open':
        latex += '\n% Footnotes\n'
        break

      case 'footnote_open': {
        const id = token.meta.id + 1
        latex += `\\footnotetext[${id}]{`
        stack.push('footnote')
        break
      }

      case 'footnote_close':
        if (stack.pop() === 'footnote') latex += '}\n'
        break
      case 'inline': {
        // 检查 inline 中是否只有图片（块级图片的情况）
        const inlineChildren = token.children || []
        const hasOnlyImage = inlineChildren.length === 1 && inlineChildren[0].type === 'image'

        if (hasOnlyImage) {
          // 如果是块级图片（整个 inline 只包含一个图片），直接处理图片
          const imageToken = inlineChildren[0]
          let src = imageToken.attrs.find(([k]) => k === 'src')?.[1] || ''
          const alt = escapeLatex(imageToken.content || '')

          try {
            src = decodeURIComponent(src)
          } catch (e) {
            // 如果 decode 失败，保持原样
          }

          // 检测是否为 SVG 文件
          const isSvg = src.toLowerCase().endsWith('.svg')

          // 路径处理：统一转换为正斜杠
          let normalizedPath = src.replace(/\\/g, '/')

          if (isSvg) {
            // SVG 文件需要转换为 PDF
            try {
              const { convertSvgToPdf } = await import('./svg-to-pdf-utils.js')
              normalizedPath = await convertSvgToPdf(normalizedPath, { returnUrl: false })
            } catch (error) {
              console.warn('SVG 转 PDF 失败，使用原始路径:', error)
            }

            // 路径处理：使用 \detokenize 避免转义问题，保留下划线等字符
            // 注意：\detokenize 的参数不应该被转义，因为 \detokenize 会处理所有特殊字符
            // 只需要统一路径分隔符即可
            normalizedPath = normalizedPath.replace(/\\/g, '/')

            // 使用 [H] 强制图片在当前位置，不允许浮动
            latex += `
\\begin{figure}[H]
  \\centering
  \\includegraphics[width=0.8\\textwidth]{\\detokenize{${normalizedPath}}}
  \\caption{${alt}}
\\end{figure}
`
          } else {
            normalizedPath = normalizedPath.replace(/([#%&{}_])/g, '\\$1')

            // 使用 [H] 强制图片在当前位置，不允许浮动
            latex += `
\\begin{figure}[H]
  \\centering
  \\includegraphics[width=0.8\\textwidth]{${normalizedPath}}
  \\caption{${alt}}
\\end{figure}
`
          }
        } else {
          // 如果不是块级图片，正常处理 inline 内容
          latex += await convertTokensToLatex(inlineChildren)
        }
        break
      }

      case 'emoji':
        latex += convertEmojiToLatex(token.markup)
        break
      case 'table_open': {
        const { latex: tableLatex, offset } = convertMarkdownTableTokensToLatex(tokens, i)
        latex += tableLatex
        i = offset
        break
      }

      default:
        break
    }
  }

  return latex
}
function splitTokensIntoBlocks(tokens) {
  const blocks = []
  let currentBlock = []

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]

    // 如果是 heading_open，则从这里开始新的一段
    if (token.type === 'heading_open' && currentBlock.length > 0) {
      blocks.push(currentBlock)
      currentBlock = []
    }

    // 检查是否是段落，如果是段落且只包含一个图片，则将其作为独立块
    if (token.type === 'paragraph_open') {
      // 查找对应的 paragraph_close
      let paragraphEnd = -1
      let depth = 1
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type === 'paragraph_open') depth++
        if (tokens[j].type === 'paragraph_close') {
          depth--
          if (depth === 0) {
            paragraphEnd = j
            break
          }
        }
        // 如果遇到其他块级元素，说明段落提前结束
        if (
          tokens[j].type === 'heading_open' ||
          tokens[j].type === 'fence' ||
          tokens[j].type === 'code_block'
        ) {
          break
        }
      }

      if (paragraphEnd >= 0) {
        // 检查段落中是否只有图片（没有其他文本内容）
        let hasImage = false
        let hasOtherContent = false

        for (let j = i + 1; j < paragraphEnd; j++) {
          const t = tokens[j]
          if (t.type === 'image') {
            hasImage = true
          } else if (t.type === 'inline' && t.children) {
            // 检查 inline 中的内容
            for (const child of t.children) {
              if (child.type === 'image') {
                hasImage = true
              } else if (
                child.type === 'text' &&
                child.content &&
                child.content.trim().length > 0
              ) {
                hasOtherContent = true
              } else if (
                child.type !== 'image' &&
                child.type !== 'softbreak' &&
                child.type !== 'hardbreak'
              ) {
                // 有其他非图片内容
                hasOtherContent = true
              }
            }
          } else if (t.type !== 'paragraph_open' && t.type !== 'paragraph_close') {
            hasOtherContent = true
          }
        }

        // 如果段落中只有图片（没有其他内容），将其作为独立块
        if (hasImage && !hasOtherContent) {
          // 如果当前块不为空，先保存当前块
          if (currentBlock.length > 0) {
            blocks.push(currentBlock)
            currentBlock = []
          }
          // 将整个段落（包含图片）作为独立块
          const imageBlock = []
          for (let j = i; j <= paragraphEnd; j++) {
            imageBlock.push(tokens[j])
          }
          blocks.push(imageBlock)
          // 跳过已处理的 tokens
          i = paragraphEnd
          continue
        }
      }
    }

    currentBlock.push(token)
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock)
  }

  return blocks
}
// LaTeX 特殊字符转义
// 注意：转义顺序很重要，必须按正确顺序处理
// Missing endcsname 错误通常由未转义的 # 字符引起
function escapeLatex(str) {
  if (!str) return ''

  let result = String(str)

  // 转义顺序很重要：
  // 1. 先转义反斜杠（必须最先处理）
  result = result.replace(/\\/g, '\\textbackslash{}')

  // 2. 转义所有特殊字符（按 LaTeX 规则）
  // 注意：大括号必须转义，否则会导致命令参数解析错误
  result = result
    .replace(/([{}])/g, '\\$1') // 大括号（必须转义，避免命令参数错误）
    .replace(/#/g, '\\#') // 井号（这是导致 Missing endcsname 的主要原因）
    .replace(/\$/g, '\\$') // 美元符号
    .replace(/&/g, '\\&') // 和号
    .replace(/%/g, '\\%') // 百分号
    .replace(/_/g, '\\_') // 下划线
    .replace(/~/g, '\\textasciitilde{}') // 波浪号
    .replace(/\^/g, '\\^{}') // 插入符号

  return result
}

// Emoji 转 LaTeX 表示（可以改成 unicode 或 TikZ 绘图）
function convertEmojiToLatex(emojiName) {
  const emojiMap = {
    smile: '\\smiley{}',
    heart: '\\heartsuit{}',
    check: '\\checkmark{}',
    x: '$\\times$'
  }
  return emojiMap[emojiName] || ''
}

// 主处理函数
function convertMarkdownTableTokensToLatex(tokens, startIndex) {
  let latex = ''
  let i = startIndex

  let rows = []
  let alignSpec = []
  let currentRow = []
  let collectingRow = false
  let inHeader = false

  while (i < tokens.length) {
    const token = tokens[i]

    switch (token.type) {
      case 'thead_open':
        inHeader = true
        break

      case 'thead_close':
        inHeader = false
        break

      case 'tr_open':
        currentRow = []
        collectingRow = true
        break

      case 'tr_close':
        if (collectingRow) {
          rows.push({ cells: currentRow, isHeader: inHeader })
          currentRow = []
          collectingRow = false
        }
        break

      case 'th_open':
      case 'td_open': {
        const nextToken = tokens[i + 1]
        let content = ''

        if (nextToken?.type === 'inline') {
          content = escapeLatex(nextToken.content || '')
        }

        currentRow.push(content)
        break
      }

      case 'table_close': {
        // 渲染表格
        const columnCount = Math.max(...rows.map((r) => r.cells.length))
        if (columnCount === 0) return { latex: '', offset: i }

        const defaultAlign = '|c'.repeat(columnCount) + '|'
        latex += `\\begin{tabular}{${defaultAlign}}\n\\hline\n`

        for (let row of rows) {
          latex += row.cells.join(' & ') + ' \\\\ \\hline\n'
        }

        latex += '\\end{tabular}\n\n'
        return { latex, offset: i }
      }
    }

    i++
  }

  return { latex: '', offset: i }
}

/**
 * 从 LaTeX 中提取纯文本内容（用于分词等用途）
 * 移除所有 LaTeX 命令、环境，只保留实际文本内容
 */
export function extractPlainTextFromLatex(latex) {
  if (!latex) return ''

  const sanitized = sanitizeLatexInput(latex)
  let lines = sanitized.split('\n')
  let text = ''

  let inVerbatim = false
  let inItemize = false
  let inEnumerate = false
  let inQuote = false
  let inTable = false

  // 辅助函数：提取大括号中的内容（处理嵌套）
  const extractBraceContent = (str, startIdx = 0) => {
    if (str[startIdx] !== '{') return ''
    let depth = 0
    let i = startIdx
    while (i < str.length) {
      if (str[i] === '{') depth++
      else if (str[i] === '}') {
        depth--
        if (depth === 0) {
          return str.substring(startIdx + 1, i)
        }
      }
      i++
    }
    return ''
  }

  // 辅助函数：移除 LaTeX 命令，保留文本内容
  const removeLatexCommands = (str) => {
    let result = str
    // 移除命令及其参数：\command{content} -> content
    result = result.replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '$2')
    // 移除简单命令：\command -> ''
    result = result.replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?/g, '')
    // 移除单独的 { }（但保留内容）
    result = result.replace(/\{([^{}]*)\}/g, '$1')
    return result.trim()
  }

  for (let rawLine of lines) {
    const line = rawLine.trim()

    if (!line) {
      text += '\n'
      continue
    }

    // 跳过 verbatim 环境（代码块）
    if (line.startsWith('\\begin{verbatim}')) {
      inVerbatim = true
      continue
    }
    if (line.startsWith('\\end{verbatim}')) {
      inVerbatim = false
      continue
    }
    if (inVerbatim) {
      continue
    }

    // 跳过 figure 环境
    if (line.startsWith('\\begin{figure') || line.startsWith('\\end{figure}')) {
      continue
    }
    if (line.startsWith('\\caption{')) {
      // 提取 caption 中的文本
      const captionMatch = line.match(/\\caption\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/)
      if (captionMatch) {
        text += removeLatexCommands(captionMatch[1]) + '\n'
      }
      continue
    }
    if (line.startsWith('\\includegraphics')) {
      continue
    }

    // 处理列表环境
    if (line.startsWith('\\begin{itemize}')) {
      inItemize = true
      continue
    }
    if (line.startsWith('\\end{itemize}')) {
      inItemize = false
      text += '\n'
      continue
    }
    if (line.startsWith('\\begin{enumerate}')) {
      inEnumerate = true
      continue
    }
    if (line.startsWith('\\end{enumerate}')) {
      inEnumerate = false
      text += '\n'
      continue
    }

    // 处理 blockquote
    if (line.startsWith('\\begin{quote}')) {
      inQuote = true
      continue
    }
    if (line.startsWith('\\end{quote}')) {
      inQuote = false
      text += '\n'
      continue
    }
    if (inQuote) {
      // quote 环境中的文本直接提取
      const quoteText = removeLatexCommands(line)
      if (quoteText) {
        text += quoteText + '\n'
      }
      continue
    }

    // 处理表格
    if (line.startsWith('\\begin{tabular}')) {
      inTable = true
      continue
    }
    if (line.startsWith('\\end{tabular}')) {
      inTable = false
      text += '\n'
      continue
    }
    if (inTable) {
      // 从表格行中提取文本
      const cells = line
        .replace(/\\\\.*/, '')
        .split('&')
        .map((cell) => cell.trim())
      const cellTexts = cells.map((cell) => removeLatexCommands(cell)).filter((c) => c)
      if (cellTexts.length > 0) {
        text += cellTexts.join(' ') + '\n'
      }
      continue
    }

    // 提取标题文本（section, subsection 等）
    const headingMatch = line.match(
      /^\\(section|subsection|subsubsection|paragraph|subparagraph)\*?\{(.+)\}/
    )
    if (headingMatch) {
      const title = removeLatexCommands(headingMatch[2])
      if (title) {
        text += title + '\n'
      }
      continue
    }

    // 提取 item 文本
    if (line.startsWith('\\item')) {
      const itemText = line.replace(/^\\item(\[[^\]]*\])?\s*/, '')
      const cleanedText = removeLatexCommands(itemText)
      if (cleanedText) {
        text += cleanedText + '\n'
      }
      continue
    }

    // 提取链接文本
    const linkMatch = line.match(
      /\\href\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/
    )
    if (linkMatch) {
      const linkText = removeLatexCommands(linkMatch[2])
      if (linkText) {
        text += linkText + '\n'
      }
      continue
    }

    // 跳过纯命令行（如 \centering, \newline 等）
    if (line.startsWith('\\') && IGNORED_INLINE_COMMAND_REGEX.test(line)) {
      continue
    }

    // 处理普通文本行（可能包含 LaTeX 命令的文本）
    // 先尝试移除 LaTeX 命令，保留文本内容
    let plainText = removeLatexCommands(line)

    // 如果移除命令后还有内容，添加
    if (plainText) {
      // 进一步清理：移除多余的空白字符
      plainText = plainText.replace(/\s+/g, ' ').trim()
      if (plainText && plainText.length > 0) {
        text += plainText + '\n'
      }
    } else if (!line.startsWith('\\')) {
      // 如果整行都不是命令开头，说明是纯文本，直接用 transformInlineLatex 处理
      const transformedText = transformInlineLatex(line)
      if (transformedText && transformedText.trim()) {
        text += transformedText.trim() + '\n'
      }
    }
  }

  // 最终清理：移除多余的换行，保留合理的段落分隔
  // 先按行处理，移除每行内的多余空格，然后处理换行
  lines = text.split('\n')
  const cleanedLines = lines
    .map((line) => line.replace(/\s+/g, ' ').trim()) // 合并每行内的多余空格
    .filter((line) => line.length > 0) // 移除空行

  return cleanedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n') // 合并多个换行（但不应有这种情况，因为已经移除了空行）
    .trim()
}

/**
 * LaTeX 正文 → Markdown
 * 内部使用 AST 转换库 src/converter
 * @param {string} latex - LaTeX 内容（可含 \\begin{document}...\\end{document}）
 * @returns {string} Markdown 字符串
 */
export function convertLatexToMarkdown(latex) {
  return latexToMarkdown(latex ?? '')
}

// 路径反转义
function decodeLatexPath(path) {
  return path.replace(/\\([#%&{}_])/g, '$1').replace(/\\/g, '/')
}

export function extractOutlineTreeFromLatex(latex, bypassText = false) {
  const md = convertLatexToMarkdown(latex) // 需要写/引入一个 LaTeX→Markdown 转换器
  const outline = extractOutlineTreeFromMarkdown(md, bypassText)
  return outline
}

export function generateLatexFromOutlineTree(outline_tree, title = 'Generated Document') {
  // 先生成 Markdown
  const md = generateMarkdownFromOutlineTree(outline_tree)
  // 再用你现有的转换方法转 LaTeX
  return convertMarkdownToLatex(md, title)
}

const PREAMBLE_COMMAND_REGEX =
  /^\\(documentclass|usepackage|set(?:main|sans|mono|CJK(?:main|sans|mono))font|geometry|pagestyle|fancyhf|lhead|rhead|cfoot|title|author|date|thanks|linespread|hypersetup|renewcommand|setcounter|addtolength|footnotesize|scriptsize|fontsize|clearpage|newpage|thispagestyle|maketitle)\b/i
const LABEL_COMMAND_REGEX = /^\\label\{.*\}$/
const BEGIN_DOC = '\\begin{document}'
const END_DOC = '\\end{document}'
const IGNORED_INLINE_COMMAND_REGEX =
  /^\\(setlength|noindent|centering|raggedright|raggedleft|hspace|vspace|newline|bigskip|smallskip)\b/i
// 控制命令：这些命令不产生可见内容，应该被忽略
const CONTROL_COMMAND_REGEX =
  /^\\(tableofcontents|listoffigures|listoftables|cleardoublepage|clearpage|newpage|thispagestyle|pagestyle|pagenumbering|setcounter|addtocounter|markboth|markright|phantomsection)\b/i

function sanitizeLatexInput(latex) {
  if (!latex) return ''
  const normalized = latex.replace(/\r\n/g, '\n')
  const startIdx = normalized.indexOf(BEGIN_DOC)
  const endIdx = normalized.lastIndexOf(END_DOC)
  let body = normalized

  if (startIdx !== -1) {
    const contentStart = startIdx + BEGIN_DOC.length
    body = normalized.slice(contentStart, endIdx !== -1 ? endIdx : undefined)
  }

  const lines = body.split('\n')
  const filtered = []

  for (let rawLine of lines) {
    const trimmed = rawLine.trim()
    if (!trimmed) {
      filtered.push('')
      continue
    }

    if (PREAMBLE_COMMAND_REGEX.test(trimmed)) {
      continue
    }
    if (LABEL_COMMAND_REGEX.test(trimmed)) {
      continue
    }
    // 过滤控制命令（不产生可见内容的命令）
    if (CONTROL_COMMAND_REGEX.test(trimmed)) {
      continue
    }
    if (trimmed === BEGIN_DOC || trimmed === END_DOC) {
      continue
    }

    filtered.push(rawLine)
  }

  return filtered.join('\n')
}

function transformInlineLatex(line) {
  if (!line) return ''
  let text = line

  // 先移除控制命令（不产生可见内容的命令）
  text = text
    .replace(/\\tableofcontents\b/g, '')
    .replace(/\\listoffigures\b/g, '')
    .replace(/\\listoftables\b/g, '')
    .replace(/\\cleardoublepage\b/g, '')
    .replace(/\\clearpage\b/g, '')
    .replace(/\\newpage\b/g, '')
    .replace(/\\thispagestyle\{[^}]*\}\b/g, '')
    .replace(/\\pagestyle\{[^}]*\}\b/g, '')
    .replace(/\\pagenumbering\{[^}]*\}\b/g, '')
    .replace(/\\setcounter\{[^}]*\}\{[^}]*\}\b/g, '')
    .replace(/\\addtocounter\{[^}]*\}\{[^}]*\}\b/g, '')
    .replace(/\\markboth\{[^}]*\}\{[^}]*\}\b/g, '')
    .replace(/\\markright\{[^}]*\}\b/g, '')
    .replace(/\\phantomsection\b/g, '')

  text = text
    .replace(/\\textbf\{([^{}]*)\}/g, '**$1**')
    .replace(/\\textit\{([^{}]*)\}/g, '*$1*')
    .replace(/\\emph\{([^{}]*)\}/g, '*$1*')
    .replace(/\\sout\{([^{}]*)\}/g, '~~$1~~')
    .replace(/\\uline\{([^{}]*)\}/g, '<u>$1</u>')
    .replace(/\\texttt\{([^{}]*)\}/g, '`$1`')
    .replace(/\\begin\{center\}|\s*\\end\{center\}/g, '')
    .replace(/\\%/g, '%')

  text = text
    .replace(/\\smiley\{\}/g, ':smile:')
    .replace(/\\heartsuit\{\}/g, ':heart:')
    .replace(/\\checkmark\{\}/g, ':check:')
    .replace(/\$\\times\$/g, ':x:')

  text = text.replace(/~+/g, ' ')

  return text.trimEnd()
}
