/**
 * 文档大纲相关工具函数
 * 从 md-utils.js 中提取并优化
 */
import type { DocumentOutlineNode } from '../../../../types'

const CHUNK_SIZE = 500

/**
 * 从 Markdown 文本中提取大纲树
 */
export function extractOutlineTreeFromMarkdown(
  md: string, 
  bypassText = false
): DocumentOutlineNode {
  const lines = md.split('\n')
  
  // 虚拟根节点，title_level 为 0，表示最低级别
  const root: DocumentOutlineNode = {
    title: '',
    title_level: 0,
    path: 'dummy',
    text: '',
    children: []
  }

  // 栈初始化，起始只有根节点
  const stack: DocumentOutlineNode[] = [root]

  // 遍历每一行
  for (const line of lines) {
    // 匹配标题行：匹配1个或多个 '#' 后跟空格，再匹配标题文本
    const match = line.match(/^(#+)\s+(.*)/)
    
    if (match) {
      const hashes = match[1]
      const title = match[2]
      const level = hashes.length // 标题等级

      const newNode: DocumentOutlineNode = {
        title: title,
        title_level: level,
        path: '',
        text: '',
        children: []
      }

      // 如果当前栈顶节点的 title_level >= 当前标题等级，则不断弹出，直到找到父节点
      while (stack.length > 0 && stack[stack.length - 1].title_level >= level) {
        stack.pop()
      }

      // 此时栈顶的节点即为新节点的父节点
      stack[stack.length - 1].children.push(newNode)
      // 将新节点入栈
      stack.push(newNode)
    } else {
      // 非标题行，追加到当前节点的 text 中
      if (!bypassText) {
        stack[stack.length - 1].text += line + '\n'
      }
    }
  }

  // 根据大纲树生成路径（采用简单的广度优先遍历）
  generateOutlinePaths(root)

  return root
}

/**
 * 为大纲树生成路径编号
 */
function generateOutlinePaths(root: DocumentOutlineNode): void {
  // 为根节点的子节点分配编号
  for (let i = 0; i < root.children.length; i++) {
    root.children[i].path = `${i + 1}`
  }

  // 广度优先遍历，为每个节点的子节点分配编号
  const queue: DocumentOutlineNode[] = [...root.children]
  
  while (queue.length > 0) {
    const node = queue.shift()!
    
    for (let i = 0; i < node.children.length; i++) {
      node.children[i].path = node.path + '.' + (i + 1)
      queue.push(node.children[i])
    }
  }
}

/**
 * 从大纲树生成 Markdown 文本
 */
export function generateMarkdownFromOutlineTree(outlineTree: DocumentOutlineNode): string {
  let md = ''

  // 深度优先遍历生成 Markdown
  function dfs(node: DocumentOutlineNode): void {
    // 如果老文档，node.title_level不存在，则根据path里面出现的"."的个数来判断
    if (node.title_level === undefined || node.title_level === null) {
      // 如果是无.，则是1级标题，如果类似于"1.1"，则是2级标题
      node.title_level = node.path.split('.').length
    }

    if (node.title && node.title_level > 0) {
      md += '#'.repeat(node.title_level) + ' ' + node.title + '\n'
      md += node.text
      
      // 保证末尾有换行符
      if (node.text === '' || node.text[node.text.length - 1] !== '\n') {
        md += '\n'
      }
    } else {
      // 如果是虚拟根节点，也可以输出其 text（如果有的话）
      if (node.text) {
        md += node.text + '\n'
      }
    }

    // 遍历子节点
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        dfs(child)
      }
    }
  }

  dfs(outlineTree)
  return md
}

/**
 * 搜索大纲树中的指定节点
 */
export function searchNode(path: string, node: DocumentOutlineNode): DocumentOutlineNode | null {
  if (node.path === path) {
    return node
  }
  
  if (node.children) {
    for (const child of node.children) {
      const result = searchNode(path, child)
      if (result) {
        return result
      }
    }
  }
  
  return null
}

/**
 * 搜索指定节点的父节点
 */
export function searchParentNode(path: string, node: DocumentOutlineNode): DocumentOutlineNode | null {
  if (node.children) {
    for (const child of node.children) {
      if (child.path === path) {
        return node
      }
      
      const result = searchParentNode(path, child)
      if (result) {
        return result
      }
    }
  }
  
  return null
}

/**
 * 统计大纲树节点数量
 */
export function countNodes(node: DocumentOutlineNode): number {
  let count = 1
  
  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child)
    }
  }
  
  return count
}

/**
 * 调整大纲树的标题层级
 */
export function adjustTitleLevel(
  outlineTree: DocumentOutlineNode, 
  firstLevel: number
): DocumentOutlineNode {
  function dfs(node: DocumentOutlineNode, level: number): void {
    node.title_level = level
    
    for (const child of node.children) {
      dfs(child, level + 1)
    }
  }

  // 深拷贝一份大纲树
  const node = JSON.parse(JSON.stringify(outlineTree)) as DocumentOutlineNode
  
  if (node.path === 'dummy') {
    for (const child of node.children) {
      dfs(child, firstLevel)
    }
  } else {
    dfs(node, firstLevel)
  }
  
  return node
}

/**
 * 移除大纲树中的文本内容
 */
export function removeTextFromOutline(outlineTree: DocumentOutlineNode): DocumentOutlineNode {
  const newOutlineTree = JSON.parse(JSON.stringify(outlineTree)) as DocumentOutlineNode
  
  function dfs(node: DocumentOutlineNode): void {
    node.text = ''
    
    for (const child of node.children) {
      dfs(child)
    }
  }
  
  dfs(newOutlineTree)
  return newOutlineTree
}

/**
 * 创建默认的大纲树
 */
export function createDefaultOutlineTree(): DocumentOutlineNode {
  return {
    path: 'dummy',
    title: '',
    text: '',
    title_level: 0,
    children: []
  }
}
