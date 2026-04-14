/**
 * 工作区文件树纯逻辑（可单测）
 * 与 WorkspaceExplorer 中增量更新、路径规范化、错误判断等保持一致，供 Vitest 覆盖。
 */

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory' | 'workspaceRoot'
  children?: FileNode[]
  parent?: FileNode
  isWorkspaceRoot?: boolean
}

export type DirectoryChangedPayload = {
  directoryPath: string
  parentPath?: string
  eventType: string
  filePath: string
}

export type NodeMap = Map<string, FileNode>

/** 路径规范化：统一分隔符并去掉末尾斜杠 */
export function normalizePathForCompare(p: string): string {
  return (p || '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
}

/** 是否在 `.metadoc/` 之下（工作区元数据目录，资源管理器展示其内全部文件） */
export function isPathUnderMetadoc(filePath: string): boolean {
  const n = normalizePathForCompare(filePath)
  return n.includes('/.metadoc/') || n.endsWith('/.metadoc')
}

/** 是否为「路径/目录不存在」类错误（含 IPC 序列化后的普通对象） */
export function isPathNotExistError(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  if (code === 'ENOENT') return true
  const msg =
    err != null && typeof err === 'object' && 'message' in err
      ? String((err as { message?: unknown }).message)
      : err instanceof Error
        ? err.message
        : String(err)
  return msg.includes('不存在') || msg.includes('not found') || msg.includes('ENOENT')
}

/** 目录在前、文件在后，同类型按名称排序 */
export function sortFileNodes(nodes: FileNode[]): void {
  nodes.sort((a, b) => {
    const aDir = a.type === 'directory' || a.type === 'workspaceRoot'
    const bDir = b.type === 'directory' || b.type === 'workspaceRoot'
    if (aDir !== bDir) return aDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function basename(filePath: string): string {
  const parts = (filePath || '').replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1]! : ''
}

function extname(filePath: string): string {
  const m = (filePath || '').match(/\.[^.\\/]*$/)
  return m ? m[0] : ''
}

export function registerNode(nodeMap: NodeMap, node: FileNode, parent: FileNode | null): void {
  node.parent = parent ?? undefined
  nodeMap.set(normalizePathForCompare(node.path), node)
}

export function unregisterNode(nodeMap: NodeMap, node: FileNode): void {
  nodeMap.delete(normalizePathForCompare(node.path))
}

export function unregisterNodeRecursive(nodeMap: NodeMap, node: FileNode): void {
  if (node.children) {
    for (const c of node.children) {
      unregisterNodeRecursive(nodeMap, c)
    }
  }
  unregisterNode(nodeMap, node)
}

export interface ApplyFsEventOptions {
  isSupportedFormat: (ext: string) => boolean
}

/**
 * 应用单次文件系统事件到内存树（add/addDir/unlink/unlinkDir）。
 * 返回是否已应用；若 parent 不在 nodeMap 中则返回 false（由调用方做整目录刷新回退）。
 */
export function applyFsEvent(
  nodeMap: NodeMap,
  payload: DirectoryChangedPayload,
  options: ApplyFsEventOptions
): boolean {
  const parentPath = payload.parentPath ?? payload.directoryPath
  const { eventType, filePath } = payload
  const normFilePath = normalizePathForCompare(filePath)
  const name = basename(filePath)

  const parent = nodeMap.get(normalizePathForCompare(parentPath))
  if (!parent || (parent.type !== 'directory' && parent.type !== 'workspaceRoot')) {
    return false
  }

  const children = parent.children ?? []

  if (eventType === 'add') {
    const ext = extname(filePath)
    const isDotfile = name.startsWith('.')
    const underMeta = isPathUnderMetadoc(filePath)
    if (!options.isSupportedFormat(ext) && !isDotfile && !underMeta) return true
    if (nodeMap.has(normFilePath)) return true
    const newNode: FileNode = { name, path: filePath, type: 'file' }
    registerNode(nodeMap, newNode, parent)
    const next = [...children, newNode]
    sortFileNodes(next)
    parent.children = next
    return true
  }
  if (eventType === 'addDir') {
    if (nodeMap.has(normFilePath)) return true
    const newNode: FileNode = {
      name,
      path: filePath,
      type: 'directory',
      children: undefined
    }
    registerNode(nodeMap, newNode, parent)
    const next = [...children, newNode]
    sortFileNodes(next)
    parent.children = next
    return true
  }
  if (eventType === 'unlink' || eventType === 'unlinkDir') {
    let node = nodeMap.get(normFilePath)
    if (!node && parent.children) {
      const sameName = parent.children.find((c) => c.name === name)
      if (sameName) {
        node = sameName
        unregisterNodeRecursive(nodeMap, node)
        parent.children = parent.children.filter((c) => c !== node)
      }
    } else if (node) {
      unregisterNodeRecursive(nodeMap, node)
      if (node.parent) {
        const next = (node.parent.children ?? []).filter(
          (c) => normalizePathForCompare(c.path) !== normFilePath
        )
        node.parent.children = next.length ? next : []
      }
    }
    return true
  }
  return true
}

/**
 * 增量添加节点到树（用于程序化创建，不检查格式、不依赖文件系统事件）
 */
export function addNodeToTree(
  nodeMap: NodeMap,
  parentPath: string,
  filePath: string,
  type: 'file' | 'directory'
): boolean {
  const normFilePath = normalizePathForCompare(filePath)
  const name = basename(filePath)

  const parent = nodeMap.get(normalizePathForCompare(parentPath))
  if (!parent || (parent.type !== 'directory' && parent.type !== 'workspaceRoot')) {
    return false
  }
  if (nodeMap.has(normFilePath)) return true

  const children = parent.children ?? []
  const newNode: FileNode =
    type === 'directory'
      ? { name, path: filePath, type: 'directory', children: undefined }
      : { name, path: filePath, type: 'file' }
  registerNode(nodeMap, newNode, parent)
  const next = [...children, newNode]
  sortFileNodes(next)
  parent.children = next
  return true
}
