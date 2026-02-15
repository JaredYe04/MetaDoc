/**
 * 目录处理 Worker - 在后台线程中处理目录内容，避免阻塞主线程
 */

import * as Comlink from 'comlink'

export interface DirectoryEntry {
  name: string
  path: string
  isDirectory: boolean
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory' | 'workspaceRoot'
  children?: FileNode[]
  isWorkspaceRoot?: boolean
}

export interface ProcessDirectoryParams {
  entries: DirectoryEntry[]
  extensionMap: Record<string, string> // extension -> formatId (作为普通对象传递)
}

export interface TraverseNodesParams {
  rootNodes: FileNode[] // 根节点数组（已序列化的普通对象）
}

/**
 * 从文件路径获取扩展名
 */
function extname(filePath: string): string {
  const lastDotIndex = filePath.lastIndexOf('.')
  const lastSlashIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  if (lastDotIndex > lastSlashIndex) {
    return filePath.substring(lastDotIndex).toLowerCase()
  }
  return ''
}

/**
 * 处理目录内容
 * 在 Worker 线程中执行，不会阻塞主线程
 */
function processDirectoryContent(params: ProcessDirectoryParams): FileNode[] {
  const { entries, extensionMap } = params

  const dirs: FileNode[] = []
  const files: FileNode[] = []

  // 处理所有条目
  for (const entry of entries) {
    if (entry.isDirectory) {
      dirs.push({
        name: entry.name,
        path: entry.path,
        type: 'directory',
        children: undefined // 懒加载：不在这里加载子目录
      })
    } else {
      // 只显示支持的文档格式文件
      const fileExt = extname(entry.path)
      const formatId = extensionMap[fileExt]
      if (formatId) {
        files.push({
          name: entry.name,
          path: entry.path,
          type: 'file'
        })
      }
    }
  }

  // 排序：目录在前，文件在后
  dirs.sort((a, b) => a.name.localeCompare(b.name))
  files.sort((a, b) => a.name.localeCompare(b.name))

  return [...dirs, ...files]
}

/**
 * 遍历所有节点（包括子节点）
 * 在 Worker 线程中执行，不会阻塞主线程
 */
function traverseAllNodes(params: TraverseNodesParams): FileNode[] {
  const { rootNodes } = params
  const allNodes: FileNode[] = []

  // 递归遍历函数
  const traverse = (nodes: FileNode[]): void => {
    for (const node of nodes) {
      allNodes.push(node)
      if (node.children && node.children.length > 0) {
        traverse(node.children)
      }
    }
  }

  // 遍历所有根节点
  for (const rootNode of rootNodes) {
    allNodes.push(rootNode)
    if (rootNode.children && rootNode.children.length > 0) {
      traverse(rootNode.children)
    }
  }

  return allNodes
}

// 导出 Worker API
const workerApi = {
  processDirectoryContent,
  traverseAllNodes
}

// 使用 Comlink 暴露 API
Comlink.expose(workerApi)

export type DirectoryProcessorWorker = typeof workerApi
