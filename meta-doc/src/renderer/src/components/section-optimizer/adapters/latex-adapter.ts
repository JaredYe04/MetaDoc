import type { SectionOptimizerAdapter, SectionInfo } from '../types'
import { extractOutlineTreeFromMarkdown } from '../../../utils/md-utils'
import { convertLatexToMarkdown } from '../../../utils/latex-utils'
import { useWorkspace } from '../../../stores/workspace'
import { useActiveDocument } from '../../../composables/useActiveDocument'
import * as monaco from 'monaco-editor'

export class LaTeXSectionAdapter implements SectionOptimizerAdapter {
  private workspace = useWorkspace()
  private getActiveDocument = useActiveDocument()
  private tabId: string
  private editorId: string | null

  private get activeDocument() {
    return this.getActiveDocument.activeDocument.value
  }

  constructor(tabId: string, editorId: string | null = null) {
    this.tabId = tabId
    this.editorId = editorId
  }

  setEditorId(editorId: string | null) {
    this.editorId = editorId
  }

  private getEditor(): monaco.editor.IStandaloneCodeEditor | null {
    if (!this.editorId) return null
    const editors = (monaco.editor as any).getEditors?.() ?? []
    return (
      editors.find((e: monaco.editor.IStandaloneCodeEditor) => e.getId?.() === this.editorId) ??
      null
    )
  }

  async getSectionAtCursor(cursorPosition: {
    lineNumber: number
    column: number
  }): Promise<SectionInfo | null> {
    const editor = this.getEditor()
    if (!editor) return null

    const model = editor.getModel()
    if (!model) return null

    const tex = this.getFullText()
    const lines = tex.split('\n')
    const currentLine = cursorPosition.lineNumber - 1 // Monaco使用1-based，转换为0-based

    // LaTeX章节命令模式：\section{}, \subsection{}, \subsubsection{}, \chapter{}, \part{}
    const sectionPatterns = [
      /\\part\*?\{(.*?)\}/,
      /\\chapter\*?\{(.*?)\}/,
      /\\section\*?\{(.*?)\}/,
      /\\subsection\*?\{(.*?)\}/,
      /\\subsubsection\*?\{(.*?)\}/,
      /\\paragraph\*?\{(.*?)\}/,
      /\\subparagraph\*?\{(.*?)\}/
    ]

    // 向上查找最近的章节命令
    let foundTitle = null
    let foundLine = -1
    let foundLevel = -1

    for (let i = currentLine; i >= 0; i--) {
      const line = lines[i]
      for (let j = 0; j < sectionPatterns.length; j++) {
        const match = line.match(sectionPatterns[j])
        if (match) {
          foundTitle = match[1].trim()
          foundLine = i
          foundLevel = j
          break
        }
      }
      if (foundTitle) break
    }

    // 如果找不到章节，尝试定位到第一段，如果第一段也没有就定位到全文
    if (!foundTitle || foundLine === -1) {
      // 查找第一个章节命令
      let firstSectionLine = -1
      let firstSectionTitle = null
      let firstSectionLevel = -1

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        for (let j = 0; j < sectionPatterns.length; j++) {
          const match = line.match(sectionPatterns[j])
          if (match) {
            firstSectionTitle = match[1].trim()
            firstSectionLine = i
            firstSectionLevel = j
            break
          }
        }
        if (firstSectionTitle) break
      }

      if (firstSectionTitle && firstSectionLine >= 0) {
        // 找到第一段，使用第一段
        foundTitle = firstSectionTitle
        foundLine = firstSectionLine
        foundLevel = firstSectionLevel
      } else {
        // 没有找到任何章节，返回全文
        const outline = this.getOutlineTree()
        let foundPath = ''
        if (outline) {
          const allNodes: any[] = []
          const dfs = (node: any) => {
            allNodes.push(node)
            if (node.children) {
              node.children.forEach(dfs)
            }
          }
          dfs(outline)
          if (allNodes.length > 0) {
            foundPath = allNodes[0].path || ''
          }
        }

        return {
          title: '全文',
          path: foundPath || 'full-document',
          range: {
            start: { line: 0, column: 0 },
            end: { line: lines.length - 1, column: lines[lines.length - 1]?.length || 0 }
          },
          content: tex,
          titleLine: -1
        }
      }
    }

    // 查找章节内容范围
    let endLine = lines.length - 1

    // 向下查找下一个同级或更高级的章节命令，或 \end{document}
    for (let i = foundLine + 1; i < lines.length; i++) {
      const line = lines[i]

      // 如果遇到 \end{document}，停止查找
      if (line.includes('\\end{document}')) {
        endLine = i - 1
        break
      }

      // 查找下一个同级或更高级的章节命令
      for (let j = 0; j <= foundLevel; j++) {
        if (sectionPatterns[j].test(line)) {
          endLine = i - 1
          break
        }
      }
      if (endLine < lines.length - 1) break
    }

    // 确保 endLine 不会超过 \end{document} 的位置
    for (let i = foundLine + 1; i <= endLine; i++) {
      if (lines[i]?.includes('\\end{document}')) {
        endLine = i - 1
        break
      }
    }

    // 尝试从大纲树获取内容（优先使用）
    const markdown = convertLatexToMarkdown(tex)
    const outline = extractOutlineTreeFromMarkdown(markdown, true)

    // 查找对应的路径和节点
    let foundPath = ''
    let nodeContent = ''
    if (outline) {
      const allNodes: any[] = []
      const dfs = (node: any) => {
        allNodes.push(node)
        if (node.children) {
          node.children.forEach(dfs)
        }
      }
      dfs(outline)

      const node = allNodes.find((n) => {
        const nodeTitle = n.title || n.text?.split('\n')[0]?.replace(/^#+\s*/, '') || ''
        return (
          nodeTitle === foundTitle ||
          nodeTitle.includes(foundTitle) ||
          foundTitle.includes(nodeTitle)
        )
      })
      if (node) {
        foundPath = node.path
        nodeContent = node.text || ''
      }
    }

    // 优先使用节点内容，如果没有则从源码提取
    let content = ''
    if (nodeContent) {
      // 节点的text可能包含标题，需要去掉标题部分
      const nodeLines = nodeContent.split('\n')
      const titleLineIndex = nodeLines.findIndex((l) => l.startsWith('#'))
      let extractedLines = titleLineIndex >= 0 ? nodeLines.slice(titleLineIndex + 1) : nodeLines
      // 过滤掉 \end{document} 行
      extractedLines = extractedLines.filter((line) => !line.includes('\\end{document}'))
      content = extractedLines.join('\n').trim()
    } else {
      // 从源码提取章节内容（不包括标题）
      const contentLines = lines.slice(foundLine + 1, endLine + 1)
      // 过滤掉 \end{document} 行
      const filteredLines = contentLines.filter((line) => !line.includes('\\end{document}'))
      content = filteredLines.join('\n').trim()

      // 如果提取的内容为空，尝试转换整个章节
      if (!content) {
        try {
          const sectionTex = lines.slice(foundLine, endLine + 1).join('\n')
          const sectionMarkdown = convertLatexToMarkdown(sectionTex)
          // 从markdown中提取内容（去掉标题）
          const mdLines = sectionMarkdown.split('\n')
          const titleLineIndex = mdLines.findIndex((l) => l.startsWith('#'))
          if (titleLineIndex >= 0) {
            content = mdLines
              .slice(titleLineIndex + 1)
              .join('\n')
              .trim()
          } else {
            content = sectionMarkdown.trim()
          }
        } catch (e) {
          // 如果转换失败，使用原始内容
          console.warn('LaTeX to Markdown conversion failed:', e)
          content = filteredLines.join('\n').trim()
        }
      }
    }

    return {
      title: foundTitle,
      path: foundPath || `section-${foundLine}`,
      range: {
        start: { line: foundLine + 1, column: 0 }, // 从标题行之后开始，保留标题行
        end: { line: endLine, column: lines[endLine]?.length || 0 }
      },
      content,
      titleLine: foundLine // 保存标题行号，用于applyContent时保留标题
    }
  }

  getSectionContent(sectionInfo: SectionInfo): string {
    return sectionInfo.content
  }

  getOutlineTree(): any {
    const doc = this.activeDocument
    const tex = doc?.tex || ''
    if (!tex) return null

    try {
      const markdown = convertLatexToMarkdown(tex)
      return extractOutlineTreeFromMarkdown(markdown, true)
    } catch (e) {
      console.warn('Failed to get outline tree from LaTeX:', e)
      return null
    }
  }

  getFullText(): string {
    const doc = this.activeDocument
    return doc?.tex || ''
  }

  async applyContent(sectionInfo: SectionInfo, newContent: string, append: boolean): Promise<void> {
    const editor = this.getEditor()
    if (!editor || !sectionInfo.range) return

    const model = editor.getModel()
    if (!model) return

    // 确保range从标题行之后开始（保留标题行）
    // range.start.line已经是标题行之后的行号（在getSectionAtCursor中已设置）
    const startPos = new monaco.Position(
      sectionInfo.range.start.line + 1,
      sectionInfo.range.start.column + 1
    )
    const endPos = new monaco.Position(
      sectionInfo.range.end.line + 1,
      sectionInfo.range.end.column + 1
    )
    const range = new monaco.Range(
      startPos.lineNumber,
      startPos.column,
      endPos.lineNumber,
      endPos.column
    )

    // 将新内容转换为LaTeX（如果需要）
    // 这里简化处理：假设新内容已经是LaTeX格式，或者需要从markdown转换
    let latexContent = newContent

    // 如果内容看起来像markdown，尝试转换
    if (newContent.includes('#') || newContent.includes('**') || newContent.includes('*')) {
      try {
        const { convertMarkdownToLatex } = await import('../../../utils/latex-utils')
        latexContent = await convertMarkdownToLatex(newContent)
        // 移除documentclass等包装，只保留body内容
        latexContent = latexContent
          .replace(/\\documentclass.*?\\begin\{document\}/s, '')
          .replace(/\\end\{document\}.*/s, '')
          .trim()
      } catch (e) {
        console.warn('Failed to convert markdown to LaTeX:', e)
      }
    }

    if (append) {
      // 追加内容
      const currentContent = model.getValueInRange(range)
      latexContent = currentContent + '\n\n' + latexContent
    }

    // 执行编辑（只替换内容部分，不包含标题行）
    editor.executeEdits('section-optimizer', [
      {
        range,
        text: latexContent
      }
    ])

    // 同步到文档
    const newTex = model.getValue()
    this.workspace.updateDocumentTex(this.tabId, newTex)
  }

  renderContent(content: string): any {
    // 返回monaco编辑器配置
    return {
      type: 'monaco',
      language: 'latex',
      content
    }
  }
}
