import type { SectionOptimizerAdapter, SectionInfo } from '../types'
import { extractOutlineTreeFromMarkdown } from '../../../utils/md-utils'
import { searchNode } from '../../../utils/outline-helpers'
import { useWorkspace } from '../../../stores/workspace'
import { useActiveDocument } from '../../../composables/useActiveDocument'
// @ts-ignore - vue3-markdown-it 没有类型定义
import MarkdownItEditor from 'vue3-markdown-it'

export class MarkdownSectionAdapter implements SectionOptimizerAdapter {
  private workspace = useWorkspace()
  private getActiveDocument = useActiveDocument()
  private tabId: string
  
  private get activeDocument() {
    return this.getActiveDocument.activeDocument.value
  }

  constructor(tabId: string) {
    this.tabId = tabId
  }

  async getSectionAtCursor(cursorPosition: { line: number; column: number }): Promise<SectionInfo | null> {
    console.log('[MarkdownSectionAdapter] ========== getSectionAtCursor 开始 ==========')
    console.log('[MarkdownSectionAdapter] 光标位置:', cursorPosition)
    
    const outline = this.getOutlineTree()
    if (!outline) {
      console.log('[MarkdownSectionAdapter] 大纲树为空，返回 null')
      return null
    }

    const markdown = this.getFullText()
    const lines = markdown.split('\n')
    console.log('[MarkdownSectionAdapter] 文档总行数:', lines.length)
    
    // 从光标位置向上查找最近的标题（不管级别）
    let currentLine = cursorPosition.line
    let foundTitle: string | null = null
    let foundPath: string | null = null

    console.log('[MarkdownSectionAdapter] 开始向上查找标题，从第', currentLine, '行开始')
    
    // 向上查找最近的标题（不管级别）
    let titleLine = -1
    let titleLevel = 6
    for (let i = currentLine; i >= 0; i--) {
      const line = lines[i]
      const match = line.match(/^(#{1,6})\s+(.+)$/)
      if (match) {
        foundTitle = match[2].trim()
        titleLine = i
        titleLevel = match[1].length
        console.log('[MarkdownSectionAdapter] ✓ 找到标题:', {
          行号: titleLine,
          级别: titleLevel,
          标题: foundTitle,
          原始行: line.trim()
        })
        break
      }
    }
    
    if (!foundTitle || titleLine === -1) {
      console.log('[MarkdownSectionAdapter] ✗ 未找到标题')
    }
    
    // 如果找到了标题，通过位置精确定位节点
    if (foundTitle && titleLine >= 0) {
      console.log('[MarkdownSectionAdapter] 开始收集所有节点及其位置...')
      
      // 收集所有节点及其在文档中的位置
      const allNodes: Array<{ node: any; titleLine: number; title: string; level: number }> = []
      const dfs = (node: any) => {
        if (node.title || node.text) {
          const nodeTitle = node.title || node.text?.split('\n')[0]?.replace(/^#+\s*/, '') || ''
          // 在文档中查找该标题的位置
          for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(/^(#{1,6})\s+(.+)$/)
            if (match) {
              const lineTitle = match[2].trim()
              const lineLevel = match[1].length
              // 精确匹配标题
              if (lineTitle === nodeTitle) {
                allNodes.push({ node, titleLine: i, title: nodeTitle, level: lineLevel })
                break
              }
            }
          }
        }
        if (node.children) {
          node.children.forEach(dfs)
        }
      }
      dfs(outline)
      
      console.log('[MarkdownSectionAdapter] 收集到', allNodes.length, '个节点:')
      allNodes.forEach((n, idx) => {
        console.log(`  [${idx}] 行号:${n.titleLine}, 级别:${n.level}, 标题:"${n.title}", 路径:${n.node.path}`)
      })
      
      // 找到标题行最接近光标位置的节点（且标题行在光标之前或相同）
      // 优先选择标题行最接近且不超过光标行的节点
      const candidateNodes = allNodes.filter(n => 
        n.titleLine <= currentLine && 
        n.title === foundTitle &&
        n.level === titleLevel
      )
      
      console.log('[MarkdownSectionAdapter] 精确匹配候选节点 (行号<=', currentLine, ', 标题="', foundTitle, '", 级别=', titleLevel, '):', candidateNodes.length, '个')
      candidateNodes.forEach((n, idx) => {
        console.log(`  [${idx}] 行号:${n.titleLine}, 级别:${n.level}, 标题:"${n.title}", 路径:${n.node.path}`)
      })
      
      if (candidateNodes.length > 0) {
        // 选择标题行最接近光标位置的节点
        const bestNode = candidateNodes.reduce((best, current) => {
          return current.titleLine > best.titleLine ? current : best
        })
        foundPath = bestNode.node.path
        console.log('[MarkdownSectionAdapter] ✓ 精确匹配成功，选择节点:', {
          行号: bestNode.titleLine,
          标题: bestNode.title,
          路径: foundPath
        })
      } else {
        console.log('[MarkdownSectionAdapter] ✗ 精确匹配失败，尝试模糊匹配...')
        // 如果精确匹配失败，尝试模糊匹配
        const fuzzyMatch = allNodes.find(n => {
          const nodeTitle = n.node.title || n.node.text?.split('\n')[0]?.replace(/^#+\s*/, '') || ''
          return n.titleLine <= currentLine && 
                 (nodeTitle === foundTitle || nodeTitle.includes(foundTitle) || foundTitle.includes(nodeTitle))
        })
        if (fuzzyMatch) {
          foundPath = fuzzyMatch.node.path
          console.log('[MarkdownSectionAdapter] ✓ 模糊匹配成功:', {
            行号: fuzzyMatch.titleLine,
            标题: fuzzyMatch.title,
            路径: foundPath
          })
        } else {
          console.log('[MarkdownSectionAdapter] ✗ 模糊匹配也失败')
        }
      }
    }

    // 如果找不到标题，尝试定位到第一段，如果第一段也没有就定位到全文
    if (!foundTitle || titleLine === -1) {
      // 查找第一个标题
      let firstTitleLine = -1
      let firstTitle = null
      let firstTitleLevel = 6
      let firstPath = null
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const match = line.match(/^(#{1,6})\s+(.+)$/)
        if (match) {
          firstTitle = match[2].trim()
          firstTitleLine = i
          firstTitleLevel = match[1].length
          
          // 通过位置查找对应的路径
          const allNodes: Array<{ node: any; titleLine: number; title: string; level: number }> = []
          const dfs = (node: any) => {
            if (node.title || node.text) {
              const nodeTitle = node.title || node.text?.split('\n')[0]?.replace(/^#+\s*/, '') || ''
              for (let j = 0; j < lines.length; j++) {
                const match = lines[j].match(/^(#{1,6})\s+(.+)$/)
                if (match && match[2].trim() === nodeTitle && j === firstTitleLine) {
                  allNodes.push({ node, titleLine: j, title: nodeTitle, level: match[1].length })
                  break
                }
              }
            }
            if (node.children) {
              node.children.forEach(dfs)
            }
          }
          dfs(outline)
          
          const matched = allNodes.find(n => n.titleLine === firstTitleLine && n.title === firstTitle)
          if (matched) {
            firstPath = matched.node.path
          }
          break
        }
      }
      
      if (firstTitle && firstTitleLine >= 0) {
        // 找到第一段，使用第一段
        foundTitle = firstTitle
        foundPath = firstPath
        titleLine = firstTitleLine
        titleLevel = firstTitleLevel
      } else {
        // 没有找到任何章节，返回全文
        return {
          title: '全文',
          path: 'full-document',
          range: {
            start: { line: 0, column: 0 },
            end: { line: lines.length - 1, column: lines[lines.length - 1]?.length || 0 }
          },
          content: markdown
        }
      }
    }
    
    // 如果找到了标题但没找到路径，尝试通过标题行号查找
    if (foundTitle && titleLine >= 0 && !foundPath) {
      const allNodes: Array<{ node: any; titleLine: number; title: string; level: number }> = []
      const dfs = (node: any) => {
        if (node.title || node.text) {
          const nodeTitle = node.title || node.text?.split('\n')[0]?.replace(/^#+\s*/, '') || ''
          for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(/^(#{1,6})\s+(.+)$/)
            if (match && match[2].trim() === nodeTitle) {
              allNodes.push({ node, titleLine: i, title: nodeTitle, level: match[1].length })
              break
            }
          }
        }
        if (node.children) {
          node.children.forEach(dfs)
        }
      }
      dfs(outline)
      
      const matched = allNodes.find(n => n.titleLine === titleLine && n.title === foundTitle && n.level === titleLevel)
      if (matched) {
        foundPath = matched.node.path
      }
    }

    // 查找章节内容范围
    let endLine = lines.length - 1

    console.log('[MarkdownSectionAdapter] 查找章节结束位置，从第', titleLine + 1, '行开始，标题级别:', titleLevel)
    
    // 向下查找下一个同级或更高级的标题
    for (let i = titleLine + 1; i < lines.length; i++) {
      const line = lines[i]
      const match = line.match(/^(#{1,6})\s+/)
      if (match) {
        const level = match[1].length
        console.log(`  [${i}] 行找到标题，级别:${level}, 内容:${line.trim().substring(0, 50)}`)
        if (level <= titleLevel) {
          endLine = i - 1
          console.log('[MarkdownSectionAdapter] ✓ 找到结束位置，行号:', endLine)
          break
        }
      }
    }
    
    if (endLine === lines.length - 1) {
      console.log('[MarkdownSectionAdapter] 未找到结束位置，使用文档末尾')
    }

    // 优先使用节点中的text，如果没有则从源码提取
    const node = foundPath ? searchNode(foundPath, outline) : null
    console.log('[MarkdownSectionAdapter] 查找节点，路径:', foundPath, '节点存在:', !!node)
    
    if (node) {
      console.log('[MarkdownSectionAdapter] 节点信息:', {
        标题: node.title,
        文本长度: node.text?.length || 0,
        文本前100字符: node.text?.substring(0, 100) || ''
      })
    }
    
    let finalContent = ''
    
    // 先从源码提取内容作为后备
    const contentLines = titleLine >= 0 ? lines.slice(titleLine + 1, endLine + 1) : []
    const extractedContent = contentLines.join('\n').trim()
    console.log('[MarkdownSectionAdapter] 从源码提取的内容，行数:', contentLines.length, '字符数:', extractedContent.length)
    
    if (node?.text) {
      console.log('[MarkdownSectionAdapter] 使用节点文本提取内容...')
      // 节点的text可能包含标题，需要去掉标题部分
      const nodeLines = node.text.split('\n')
      console.log('[MarkdownSectionAdapter] 节点文本行数:', nodeLines.length)
      
      // 查找第一个标题行
      let titleIndex = -1
      for (let i = 0; i < nodeLines.length; i++) {
        const match = nodeLines[i].match(/^(#{1,6})\s+(.+)$/)
        if (match) {
          const nodeTitle = match[2].trim()
          console.log(`  [${i}] 行是标题: "${nodeTitle}"`)
          if (nodeTitle === foundTitle || nodeTitle.includes(foundTitle) || foundTitle.includes(nodeTitle)) {
            titleIndex = i
            console.log('[MarkdownSectionAdapter] ✓ 找到标题行索引:', titleIndex)
            break
          }
        }
      }
      
      if (titleIndex >= 0) {
        // 去掉标题行及其之前的内容
        finalContent = nodeLines.slice(titleIndex + 1).join('\n').trim()
        console.log('[MarkdownSectionAdapter] 去掉标题行后，内容长度:', finalContent.length)
      } else {
        // 如果没有找到标题行，尝试去掉第一行（可能是标题）
        if (nodeLines.length > 0 && nodeLines[0].match(/^(#{1,6})\s+/)) {
          finalContent = nodeLines.slice(1).join('\n').trim()
          console.log('[MarkdownSectionAdapter] 去掉第一行（标题）后，内容长度:', finalContent.length)
        } else {
          // 直接使用整个text
          finalContent = node.text.trim()
          console.log('[MarkdownSectionAdapter] 直接使用整个文本，内容长度:', finalContent.length)
        }
      }
      // 如果提取的内容为空，使用从全文提取的内容
      if (!finalContent) {
        console.log('[MarkdownSectionAdapter] 节点内容为空，使用从源码提取的内容')
        finalContent = extractedContent
      }
    } else {
      // 如果节点没有text，使用从源码提取的内容
      console.log('[MarkdownSectionAdapter] 节点不存在或没有text，使用从源码提取的内容')
      finalContent = extractedContent
    }

    const result = {
      title: foundTitle,
      path: foundPath,
      range: {
        start: { line: titleLine, column: 0 },
        end: { line: endLine, column: lines[endLine]?.length || 0 }
      },
      content: finalContent
    }
    
    console.log('[MarkdownSectionAdapter] ========== 最终结果 ==========')
    console.log('[MarkdownSectionAdapter] 标题:', result.title)
    console.log('[MarkdownSectionAdapter] 路径:', result.path)
    console.log('[MarkdownSectionAdapter] 范围:', result.range)
    console.log('[MarkdownSectionAdapter] 内容长度:', result.content.length)
    console.log('[MarkdownSectionAdapter] 内容前200字符:', result.content.substring(0, 200))
    console.log('[MarkdownSectionAdapter] ========== getSectionAtCursor 结束 ==========')
    
    return result
  }

  getSectionContent(sectionInfo: SectionInfo): string {
    return sectionInfo.content
  }

  getOutlineTree(): any {
    const doc = this.activeDocument
    return doc?.outline || null
  }

  getFullText(): string {
    const doc = this.activeDocument
    return doc?.markdown || ''
  }

  async applyContent(sectionInfo: SectionInfo, newContent: string, append: boolean): Promise<void> {
    const outline = this.getOutlineTree()
    if (!outline) return

    const node = searchNode(sectionInfo.path, outline)
    if (node) {
      if (append) {
        node.text = (node.text || '') + newContent
      } else {
        node.text = newContent
      }
      this.workspace.updateDocumentOutline(this.tabId, outline)
      
      // 同步到markdown
      const { generateMarkdownFromOutlineTree } = await import('../../../utils/md-utils')
      const markdown = generateMarkdownFromOutlineTree(outline)
      this.workspace.updateDocumentMarkdown(this.tabId, markdown)
    }
  }

  renderContent(content: string): any {
    return MarkdownItEditor
  }
}

