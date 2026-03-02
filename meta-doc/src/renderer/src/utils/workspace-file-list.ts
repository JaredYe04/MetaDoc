/**
 * 工作区文件列表（用于 @ 引用选择器等）
 * 使用 read-directory 递归列出文件，排除 .metadoc、.git、node_modules
 */

import messageBridge from '../bridge/message-bridge'

const EXCLUDE_DIRS = new Set(['.git', 'node_modules', '.metadoc'])

export interface WorkspaceFileItem {
  path: string
  name: string
  isDirectory: boolean
}

/**
 * 获取工作区根目录列表
 */
function getWorkspaceRoots(): string[] {
  try {
    const saved = localStorage.getItem('workspaceFolders')
    if (!saved) return []
    const arr = JSON.parse(saved)
    if (!Array.isArray(arr)) return []
    return arr.filter((p: unknown) => typeof p === 'string' && (p as string).length > 0)
  } catch {
    return []
  }
}

/**
 * 递归列出工作区中的文件（含有限深度和数量）
 * @param options maxDepth 最大深度，maxEntries 最大条目数（仅文件）
 */
export async function listWorkspaceFiles(options: {
  maxDepth?: number
  maxEntries?: number
} = {}): Promise<WorkspaceFileItem[]> {
  const { maxDepth = 3, maxEntries = 500 } = options
  const roots = getWorkspaceRoots()
  if (roots.length === 0) return []

  if (!messageBridge.getIpc()) return []

  const result: WorkspaceFileItem[] = []
  const queue: Array<{ path: string; depth: number }> = roots.map((r) => ({ path: r, depth: 0 }))

  while (queue.length > 0 && result.length < maxEntries) {
    const { path: dirPath, depth } = queue.shift()!
    if (depth >= maxDepth) continue

    try {
      const entries = (await messageBridge.invoke('read-directory', dirPath)) as Array<{
        name: string
        path: string
        isDirectory: boolean
      }>
      for (const e of entries) {
        if (result.length >= maxEntries) break
        if (e.isDirectory) {
          if (!EXCLUDE_DIRS.has(e.name)) {
            queue.push({ path: e.path, depth: depth + 1 })
          }
        } else {
          result.push({
            path: e.path,
            name: e.name,
            isDirectory: false
          })
        }
      }
    } catch {
      // ignore single directory errors
    }
  }

  return result
}

/**
 * 简单模糊匹配：查询串是否出现在 name 或 path 中（不区分大小写）
 */
export function fuzzyMatchFile(query: string, item: WorkspaceFileItem): boolean {
  if (!query.trim()) return true
  const q = query.toLowerCase().trim()
  const name = item.name.toLowerCase()
  const path = item.path.toLowerCase()
  return name.includes(q) || path.includes(q)
}
