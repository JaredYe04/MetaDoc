/**
 * 标题格式化工具：清理 Markdown / LaTeX 标题标记
 * 供 outline、单元测试等复用
 */

/**
 * 清理标题中的 Markdown 和 LaTeX 标记
 * - Markdown: # Title, ## Title 等（行首 # + 空格）
 * - LaTeX: \section{Title}, \subsection{Title} 等，支持嵌套大括号与转义
 */
export function cleanTitleMarkers(title: string): string {
  if (!title || typeof title !== 'string') {
    return title
  }

  let cleaned = title.trim()

  // 1. 移除 Markdown 标题标记（#、##、### 等）
  // 确保：行首 + 一个或多个# + 至少一个空格
  cleaned = cleaned.replace(/^#+\s+/, '')

  // 2. 移除 LaTeX 标题命令标记
  const extractBracedContent = (
    str: string,
    startPos: number
  ): { content: string; endPos: number } | null => {
    if (str[startPos] !== '{') return null

    let depth = 0
    let i = startPos
    let content = ''

    while (i < str.length) {
      const char = str[i]

      if (char === '\\' && i + 1 < str.length) {
        const nextChar = str[i + 1]
        if (nextChar === '{' || nextChar === '}' || nextChar === '\\') {
          if (depth >= 1) {
            content += char + nextChar
          }
          i += 2
          continue
        }
      }

      if (char === '{') {
        depth++
        if (depth > 1) {
          content += char
        }
      } else if (char === '}') {
        depth--
        if (depth === 0) {
          return { content, endPos: i }
        } else {
          content += char
        }
      } else {
        if (depth >= 1) {
          content += char
        }
      }
      i++
    }

    return null
  }

  const latexTitleCommands = [
    'part',
    'chapter',
    'section',
    'subsection',
    'subsubsection',
    'paragraph',
    'subparagraph',
    'title'
  ]

  for (const cmd of latexTitleCommands) {
    const cmdPattern = new RegExp(`^\\\\${cmd}\\*?`, 'i')
    const match = cleaned.match(cmdPattern)

    if (match) {
      const afterCmd = cleaned.substring(match[0].length).trim()
      if (afterCmd.startsWith('{')) {
        const result = extractBracedContent(afterCmd, 0)
        if (result) {
          cleaned = result.content
          break
        }
      }
    }
  }

  return cleaned.trim()
}
