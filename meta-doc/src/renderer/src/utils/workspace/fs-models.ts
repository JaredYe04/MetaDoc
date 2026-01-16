/**
 * 文件系统统一模型
 * 参考 VS Code 的设计，使用 URI 作为唯一身份标识
 */

/**
 * URI 类型（文件系统路径的统一表示）
 * 在 Electron 环境中，我们使用 file:// 协议
 */
export type URI = string

/**
 * 文件系统节点类型
 */
export type FSNodeType = 'file' | 'directory'

/**
 * 文件系统节点接口
 */
export interface FSNode {
  uri: URI
  name: string
  type: FSNodeType
  children?: FSNode[]
}

/**
 * 选择模型（支持跨目录、批量选择）
 */
export interface Selection {
  uris: URI[]
}

/**
 * 剪贴板载荷（存储操作意图，而非文件本身）
 */
export interface ClipboardPayload {
  sources: URI[]
  type: 'copy' | 'cut'
}

/**
 * 文件系统操作类型
 */
export type FSOperationType = 'copy' | 'move' | 'delete' | 'rename' | 'create-file' | 'create-directory'

/**
 * 文件系统操作步骤（最小原子操作）
 */
export interface FSOpStep {
  type: 'copy' | 'move' | 'delete'
  from?: URI
  to?: URI
  target?: URI
}

/**
 * 文件系统操作计划
 */
export interface FSOpPlan {
  steps: FSOpStep[]
  metadata?: {
    description?: string
    totalSize?: number
  }
}

/**
 * 冲突解决策略
 */
export type ConflictResolution = 'skip' | 'overwrite' | 'rename'

/**
 * URI 工具函数
 */
export class URIUtils {
  /**
   * 将文件路径转换为 URI
   */
  static pathToURI(filePath: string): URI {
    // Windows 路径需要特殊处理
    if (/^[A-Za-z]:/.test(filePath)) {
      // Windows 绝对路径：C:\path\to\file -> file:///C:/path/to/file
      return `file:///${filePath.replace(/\\/g, '/')}`
    }
    // Unix 路径：/path/to/file -> file:///path/to/file
    return `file://${filePath}`
  }

  /**
   * 将 URI 转换为文件路径
   */
  static uriToPath(uri: URI): string {
    // 如果不是 URI 格式，直接返回（兼容旧代码）
    if (!uri.startsWith('file://')) {
      return uri
    }
    
    let path: string
    if (uri.startsWith('file:///')) {
      // file:/// 开头的 URI（Windows 或 Unix 都可能是这种格式）
      // Windows: file:///C:/path -> C:/path
      // Unix: file:///path -> /path
      path = uri.slice(8) // 去掉 file:///
    } else if (uri.startsWith('file://')) {
      // file:// 开头的 URI（Unix 格式）
      // file://path -> path
      path = uri.slice(7) // 去掉 file://
    } else {
      return uri
    }
    
    // 解码 URL 编码的字符（处理中文路径等）
    try {
      path = decodeURIComponent(path)
    } catch {
      // 如果解码失败，使用原始路径
    }
    
    // Windows 路径：将正斜杠转换为反斜杠（Node.js fs 和 shell.trashItem 需要）
    // 判断是否为 Windows 路径（以盘符开头，如 C:、D:）
    if (/^[A-Za-z]:/.test(path)) {
      // 使用 path.normalize 在 Node.js 中处理，但这里我们手动转换
      // 注意：保留盘符后的第一个斜杠（C:/ -> C:\）
      path = path.replace(/\//g, '\\')
    }
    
    return path
  }

  /**
   * 获取 URI 的文件名
   */
  static basename(uri: URI): string {
    const path = this.uriToPath(uri)
    const parts = path.split(/[/\\]/).filter(Boolean)
    return parts.length > 0 ? parts[parts.length - 1] : ''
  }

  /**
   * 获取 URI 的目录部分
   */
  static dirname(uri: URI): URI {
    const path = this.uriToPath(uri)
    const parts = path.split(/[/\\]/).filter(Boolean)
    if (parts.length <= 1) {
      return this.pathToURI('/')
    }
    const dirPath = parts.slice(0, -1).join('/')
    return this.pathToURI(dirPath)
  }

  /**
   * 拼接 URI
   */
  static join(baseURI: URI, ...parts: string[]): URI {
    const basePath = this.uriToPath(baseURI)
    const fullPath = [basePath, ...parts].join('/').replace(/\/+/g, '/')
    return this.pathToURI(fullPath)
  }

  /**
   * 判断 URI 是否为目录
   */
  static isDirectoryURI(uri: URI): boolean {
    // 通过 URI 本身无法判断，需要查询文件系统
    // 这里只是类型提示，实际判断需要通过 IPC
    return false
  }

  /**
   * 规范化 URI（统一路径分隔符）
   */
  static normalize(uri: URI): URI {
    const path = this.uriToPath(uri)
    const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/')
    return this.pathToURI(normalized)
  }

  /**
   * 判断一个 URI 是否是另一个 URI 的子路径
   */
  static isSubPath(parentURI: URI, childURI: URI): boolean {
    const parentPath = this.uriToPath(this.normalize(parentURI))
    const childPath = this.uriToPath(this.normalize(childURI))
    return childPath.startsWith(parentPath + '/') || childPath === parentPath
  }
}

