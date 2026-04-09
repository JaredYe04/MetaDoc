/**
 * 工作区文件树逻辑单元测试（Vitest）
 *
 * 覆盖与 UI 修复对应的全部场景：
 * - 路径规范化、ENOENT/不存在错误判断（含 IPC 序列化对象）
 * - 根目录：新建文件/文件夹（add/addDir）、删除文件/文件夹（unlink/unlinkDir）
 * - 子目录（已展开）：新建/删除文件与文件夹、删除整个子目录
 * - 多级展开：内层 add、unlinkDir 内层目录
 * - 重命名：文件/文件夹（unlink+add、add+unlink、unlinkDir+addDir、addDir+unlinkDir）
 * - .metadoc 与点号文件：目录均展示；文件为支持格式或点号开头则加入（sidecar `.x.md.meta` / `.x.tex.meta` 除外）；change 不改结构、已存在不重复添加
 * - 父节点未在 nodeMap 时返回 false（由调用方刷新回退）
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  normalizePathForCompare,
  isPathNotExistError,
  isDocumentSidecarMetaFileName,
  sortFileNodes,
  registerNode,
  unregisterNode,
  unregisterNodeRecursive,
  applyFsEvent,
  type FileNode,
  type NodeMap,
  type DirectoryChangedPayload,
  type ApplyFsEventOptions
} from './workspace-tree-logic'

function makeRoot(path: string, name?: string): FileNode {
  const node: FileNode = {
    name: name ?? path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? 'root',
    path,
    type: 'workspaceRoot',
    isWorkspaceRoot: true,
    children: []
  }
  return node
}

function makeDir(path: string, name?: string): FileNode {
  const n = name ?? path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? ''
  return { name: n, path, type: 'directory', children: [] }
}

function makeFile(path: string, name?: string): FileNode {
  const n = name ?? path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? ''
  return { name: n, path, type: 'file' }
}

/** 支持 .md .txt .tex */
const defaultFormatOptions: ApplyFsEventOptions = {
  isSupportedFormat: (ext) => ['.md', '.txt', '.tex'].includes(ext.toLowerCase())
}

describe('workspace-tree-logic', () => {
  describe('normalizePathForCompare', () => {
    it('统一反斜杠为正斜杠', () => {
      expect(normalizePathForCompare('C:\\a\\b')).toBe('C:/a/b')
    })
    it('去掉末尾斜杠', () => {
      expect(normalizePathForCompare('C:/a/b/')).toBe('C:/a/b')
      expect(normalizePathForCompare('/foo/')).toBe('/foo')
    })
    it('空串与空处理', () => {
      expect(normalizePathForCompare('')).toBe('')
    })
    it('多斜杠合并', () => {
      expect(normalizePathForCompare('C:/a//b')).toBe('C:/a/b')
    })
    it('Windows 与 Unix 路径同一化', () => {
      expect(normalizePathForCompare('C:\\Users\\x\\doc')).toBe('C:/Users/x/doc')
      expect(normalizePathForCompare('C:/Users/x/doc')).toBe('C:/Users/x/doc')
    })
  })

  describe('isDocumentSidecarMetaFileName', () => {
    it('识别 .文档.md.meta / .文档.tex.meta（与 getSidecarPath 一致）', () => {
      expect(isDocumentSidecarMetaFileName('.note.md.meta')).toBe(true)
      expect(isDocumentSidecarMetaFileName('.a.b.tex.meta')).toBe(true)
      expect(isDocumentSidecarMetaFileName('.chap.ltx.meta')).toBe(true)
    })
    it('普通点号文件与裸 .meta 不匹配', () => {
      expect(isDocumentSidecarMetaFileName('.env')).toBe(false)
      expect(isDocumentSidecarMetaFileName('note.md.meta')).toBe(false)
      expect(isDocumentSidecarMetaFileName('.readme.meta')).toBe(false)
    })
  })

  describe('isPathNotExistError', () => {
    it('ENOENT code', () => {
      expect(isPathNotExistError({ code: 'ENOENT' })).toBe(true)
    })
    it('message 包含「不存在」', () => {
      expect(isPathNotExistError(new Error('目录不存在: x'))).toBe(true)
    })
    it('message 包含 not found', () => {
      expect(isPathNotExistError(new Error('file not found'))).toBe(true)
    })
    it('IPC 序列化后的普通对象（仅有 message）', () => {
      expect(isPathNotExistError({ message: '目录不存在: D:\\repos\\fixtures\\123' })).toBe(true)
      expect(isPathNotExistError({ message: 'file not found' })).toBe(true)
    })
    it('非不存在类错误', () => {
      expect(isPathNotExistError(new Error('permission denied'))).toBe(false)
      expect(isPathNotExistError(new Error('unknown'))).toBe(false)
    })
  })

  describe('sortFileNodes', () => {
    it('目录在前文件在后', () => {
      const nodes: FileNode[] = [makeFile('/a/f.md'), makeDir('/a/b'), makeFile('/a/a.txt')]
      sortFileNodes(nodes)
      expect(nodes[0]!.type).toBe('directory')
      expect(nodes[1]!.name).toBe('a.txt')
      expect(nodes[2]!.name).toBe('f.md')
    })
    it('同类型按名称排序', () => {
      const nodes: FileNode[] = [makeDir('/a/z'), makeDir('/a/a'), makeDir('/a/m')]
      sortFileNodes(nodes)
      expect(nodes.map((n) => n.name)).toEqual(['a', 'm', 'z'])
    })
  })

  describe('registerNode / unregisterNode', () => {
    it('注册后可通过 normalize 的 key 找到', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('C:/ws')
      registerNode(nodeMap, root, null)
      expect(nodeMap.get(normalizePathForCompare('C:/ws'))).toBe(root)
      expect(nodeMap.get(normalizePathForCompare('C:\\ws'))).toBe(root)
    })
    it('反注册后移除', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('C:/ws')
      registerNode(nodeMap, root, null)
      unregisterNode(nodeMap, root)
      expect(nodeMap.has(normalizePathForCompare('C:/ws'))).toBe(false)
    })
    it('递归反注册子节点', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('C:/ws')
      const child = makeDir('C:/ws/sub')
      root.children = [child]
      child.parent = root
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, child, root)
      unregisterNodeRecursive(nodeMap, root)
      expect(nodeMap.size).toBe(0)
    })
  })

  describe('applyFsEvent - 根目录下 add / addDir', () => {
    let nodeMap: NodeMap
    let root: FileNode

    beforeEach(() => {
      nodeMap = new Map()
      root = makeRoot('C:/workspace', 'workspace')
      root.children = []
      registerNode(nodeMap, root, null)
    })

    it('add 文件：在根下新增一个文件节点', () => {
      const payload: DirectoryChangedPayload = {
        directoryPath: 'C:/workspace',
        parentPath: 'C:/workspace',
        eventType: 'add',
        filePath: 'C:/workspace/new.md'
      }
      const applied = applyFsEvent(nodeMap, payload, defaultFormatOptions)
      expect(applied).toBe(true)
      expect(root.children).toHaveLength(1)
      expect(root.children![0]!.name).toBe('new.md')
      expect(root.children![0]!.type).toBe('file')
      expect(nodeMap.get(normalizePathForCompare('C:/workspace/new.md'))).toBe(root.children![0])
    })

    it('addDir：在根下新增一个目录节点', () => {
      const payload: DirectoryChangedPayload = {
        directoryPath: 'C:/workspace',
        parentPath: 'C:/workspace',
        eventType: 'addDir',
        filePath: 'C:/workspace/newFolder'
      }
      applyFsEvent(nodeMap, payload, defaultFormatOptions)
      expect(root.children).toHaveLength(1)
      expect(root.children![0]!.type).toBe('directory')
      expect(root.children![0]!.name).toBe('newFolder')
    })

    it('add 不支持格式的文件：不添加', () => {
      const payload: DirectoryChangedPayload = {
        directoryPath: 'C:/workspace',
        parentPath: 'C:/workspace',
        eventType: 'add',
        filePath: 'C:/workspace/script.js'
      }
      applyFsEvent(nodeMap, payload, defaultFormatOptions)
      expect(root.children).toHaveLength(0)
    })

    it('addDir .metadoc：加入树（与资源管理器展示一致）', () => {
      const payload: DirectoryChangedPayload = {
        directoryPath: 'C:/workspace',
        parentPath: 'C:/workspace',
        eventType: 'addDir',
        filePath: 'C:/workspace/.metadoc'
      }
      applyFsEvent(nodeMap, payload, defaultFormatOptions)
      expect(root.children).toHaveLength(1)
      expect(root.children![0]!.name).toBe('.metadoc')
      expect(root.children![0]!.type).toBe('directory')
    })

    it('add 点号文件 .env：非支持扩展名也可加入', () => {
      const payload: DirectoryChangedPayload = {
        directoryPath: 'C:/workspace',
        parentPath: 'C:/workspace',
        eventType: 'add',
        filePath: 'C:/workspace/.env'
      }
      applyFsEvent(nodeMap, payload, defaultFormatOptions)
      expect(root.children).toHaveLength(1)
      expect(root.children![0]!.name).toBe('.env')
      expect(root.children![0]!.type).toBe('file')
    })

    it('add 文档 sidecar .note.md.meta：不加入树（否则与点号文件规则冲突）', () => {
      const payload: DirectoryChangedPayload = {
        directoryPath: 'C:/workspace',
        parentPath: 'C:/workspace',
        eventType: 'add',
        filePath: 'C:/workspace/.note.md.meta'
      }
      const applied = applyFsEvent(nodeMap, payload, defaultFormatOptions)
      expect(applied).toBe(true)
      expect(root.children).toHaveLength(0)
    })

    it('add .metadoc 下非点号文件：扩展名未注册也可加入（如 sessions-index.json）', () => {
      const md = makeDir('C:/workspace/.metadoc', '.metadoc')
      root.children = [md]
      md.parent = root
      registerNode(nodeMap, md, root)
      const payload: DirectoryChangedPayload = {
        directoryPath: 'C:/workspace/.metadoc',
        parentPath: 'C:/workspace/.metadoc',
        eventType: 'add',
        filePath: 'C:/workspace/.metadoc/sessions-index.json'
      }
      applyFsEvent(nodeMap, payload, defaultFormatOptions)
      expect(md.children).toHaveLength(1)
      expect(md.children![0]!.name).toBe('sessions-index.json')
    })

    it('parentPath 与 directoryPath 用反斜杠时仍能找到父节点', () => {
      const payload: DirectoryChangedPayload = {
        directoryPath: 'C:\\workspace',
        parentPath: 'C:\\workspace',
        eventType: 'add',
        filePath: 'C:\\workspace\\a.txt'
      }
      const applied = applyFsEvent(nodeMap, payload, defaultFormatOptions)
      expect(applied).toBe(true)
      expect(root.children).toHaveLength(1)
    })
  })

  describe('applyFsEvent - 根目录下 unlink / unlinkDir', () => {
    let nodeMap: NodeMap
    let root: FileNode

    beforeEach(() => {
      nodeMap = new Map()
      root = makeRoot('C:/workspace', 'workspace')
      const f = makeFile('C:/workspace/a.md')
      const d = makeDir('C:/workspace/sub')
      root.children = [d, f]
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, f, root)
      registerNode(nodeMap, d, root)
    })

    it('unlink 文件：从根 children 移除并反注册', () => {
      const payload: DirectoryChangedPayload = {
        directoryPath: 'C:/workspace',
        parentPath: 'C:/workspace',
        eventType: 'unlink',
        filePath: 'C:/workspace/a.md'
      }
      applyFsEvent(nodeMap, payload, defaultFormatOptions)
      expect(root.children).toHaveLength(1)
      expect(root.children![0]!.name).toBe('sub')
      expect(nodeMap.has(normalizePathForCompare('C:/workspace/a.md'))).toBe(false)
    })

    it('unlinkDir 目录：从根 children 移除并反注册', () => {
      const payload: DirectoryChangedPayload = {
        directoryPath: 'C:/workspace',
        parentPath: 'C:/workspace',
        eventType: 'unlinkDir',
        filePath: 'C:/workspace/sub'
      }
      applyFsEvent(nodeMap, payload, defaultFormatOptions)
      expect(root.children).toHaveLength(1)
      expect(root.children![0]!.name).toBe('a.md')
      expect(nodeMap.has(normalizePathForCompare('C:/workspace/sub'))).toBe(false)
    })

    it('unlinkDir 时路径带空格等差异：用名称匹配仍能移除', () => {
      const payload: DirectoryChangedPayload = {
        directoryPath: 'C:/workspace',
        parentPath: 'C:/workspace',
        eventType: 'unlinkDir',
        filePath: 'C:/workspace/ 新建文件夹'
      }
      const folder = makeDir('C:/workspace/ 新建文件夹', ' 新建文件夹')
      root.children!.push(folder)
      registerNode(nodeMap, folder, root)
      applyFsEvent(nodeMap, payload, defaultFormatOptions)
      const names = root.children!.map((c) => c.name)
      expect(names).not.toContain(' 新建文件夹')
    })
  })

  describe('applyFsEvent - 子目录（已展开）下的 add / unlink', () => {
    let nodeMap: NodeMap
    let root: FileNode
    let sub: FileNode

    beforeEach(() => {
      nodeMap = new Map()
      root = makeRoot('C:/workspace', 'workspace')
      sub = makeDir('C:/workspace/sub', 'sub')
      root.children = [sub]
      sub.parent = root
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, sub, root)
    })

    it('在子目录下 add 文件', () => {
      const payload: DirectoryChangedPayload = {
        directoryPath: 'C:/workspace',
        parentPath: 'C:/workspace/sub',
        eventType: 'add',
        filePath: 'C:/workspace/sub/child.md'
      }
      applyFsEvent(nodeMap, payload, defaultFormatOptions)
      expect(sub.children).toHaveLength(1)
      expect(sub.children![0]!.name).toBe('child.md')
      expect(nodeMap.get(normalizePathForCompare('C:/workspace/sub/child.md'))).toBeDefined()
    })

    it('在子目录下 addDir', () => {
      const payload: DirectoryChangedPayload = {
        directoryPath: 'C:/workspace',
        parentPath: 'C:/workspace/sub',
        eventType: 'addDir',
        filePath: 'C:/workspace/sub/inner'
      }
      applyFsEvent(nodeMap, payload, defaultFormatOptions)
      expect(sub.children).toHaveLength(1)
      expect(sub.children![0]!.name).toBe('inner')
    })

    it('在子目录下 unlink 文件', () => {
      const f = makeFile('C:/workspace/sub/x.txt')
      sub.children = [f]
      f.parent = sub
      registerNode(nodeMap, f, sub)
      const payload: DirectoryChangedPayload = {
        directoryPath: 'C:/workspace',
        parentPath: 'C:/workspace/sub',
        eventType: 'unlink',
        filePath: 'C:/workspace/sub/x.txt'
      }
      applyFsEvent(nodeMap, payload, defaultFormatOptions)
      expect(sub.children).toHaveLength(0)
    })
  })

  describe('applyFsEvent - 多级展开（子目录的子目录）', () => {
    let nodeMap: NodeMap
    let root: FileNode
    let sub: FileNode
    let inner: FileNode

    beforeEach(() => {
      nodeMap = new Map()
      root = makeRoot('C:/workspace', 'workspace')
      sub = makeDir('C:/workspace/sub', 'sub')
      inner = makeDir('C:/workspace/sub/inner', 'inner')
      root.children = [sub]
      sub.parent = root
      sub.children = [inner]
      inner.parent = sub
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, sub, root)
      registerNode(nodeMap, inner, sub)
    })

    it('在 inner 下 add 文件会更新 inner.children', () => {
      const payload: DirectoryChangedPayload = {
        directoryPath: 'C:/workspace',
        parentPath: 'C:/workspace/sub/inner',
        eventType: 'add',
        filePath: 'C:/workspace/sub/inner/deep.md'
      }
      applyFsEvent(nodeMap, payload, defaultFormatOptions)
      expect(inner.children).toHaveLength(1)
      expect(inner.children![0]!.name).toBe('deep.md')
    })

    it('在 inner 下 unlinkDir 会移除 inner 节点', () => {
      const payload: DirectoryChangedPayload = {
        directoryPath: 'C:/workspace/sub',
        parentPath: 'C:/workspace/sub',
        eventType: 'unlinkDir',
        filePath: 'C:/workspace/sub/inner'
      }
      applyFsEvent(nodeMap, payload, defaultFormatOptions)
      expect(sub.children).toHaveLength(0)
      expect(nodeMap.has(normalizePathForCompare('C:/workspace/sub/inner'))).toBe(false)
    })
  })

  describe('applyFsEvent - 父节点未在 nodeMap（未展开）', () => {
    it('parentPath 对应目录未注册时返回 false', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('C:/workspace', 'workspace')
      registerNode(nodeMap, root, null)
      const payload: DirectoryChangedPayload = {
        directoryPath: 'C:/workspace',
        parentPath: 'C:/workspace/collapsedSub',
        eventType: 'add',
        filePath: 'C:/workspace/collapsedSub/file.md'
      }
      const applied = applyFsEvent(nodeMap, payload, defaultFormatOptions)
      expect(applied).toBe(false)
      expect(root.children).toHaveLength(0)
    })
  })

  describe('applyFsEvent - 重命名（先 unlink 再 add）', () => {
    it('先 unlink 旧路径再 add 新路径后树正确', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('C:/workspace', 'workspace')
      const oldFile = makeFile('C:/workspace/old.md', 'old.md')
      root.children = [oldFile]
      oldFile.parent = root
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, oldFile, root)

      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'C:/workspace',
          parentPath: 'C:/workspace',
          eventType: 'unlink',
          filePath: 'C:/workspace/old.md'
        },
        defaultFormatOptions
      )
      expect(root.children).toHaveLength(0)

      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'C:/workspace',
          parentPath: 'C:/workspace',
          eventType: 'add',
          filePath: 'C:/workspace/renamed.md'
        },
        defaultFormatOptions
      )
      expect(root.children).toHaveLength(1)
      expect(root.children![0]!.name).toBe('renamed.md')
    })
  })

  describe('applyFsEvent - add 已存在的路径', () => {
    it('add 已存在文件不重复添加', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('C:/workspace', 'workspace')
      const f = makeFile('C:/workspace/exist.md', 'exist.md')
      root.children = [f]
      f.parent = root
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, f, root)

      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'C:/workspace',
          parentPath: 'C:/workspace',
          eventType: 'add',
          filePath: 'C:/workspace/exist.md'
        },
        defaultFormatOptions
      )
      expect(root.children).toHaveLength(1)
    })

    it('addDir 已存在目录不重复添加', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('C:/workspace', 'workspace')
      const d = makeDir('C:/workspace/sub', 'sub')
      root.children = [d]
      d.parent = root
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, d, root)

      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'C:/workspace',
          parentPath: 'C:/workspace',
          eventType: 'addDir',
          filePath: 'C:/workspace/sub'
        },
        defaultFormatOptions
      )
      expect(root.children).toHaveLength(1)
    })
  })

  describe('applyFsEvent - change 事件', () => {
    it('change 不修改树结构', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('C:/workspace', 'workspace')
      root.children = []
      registerNode(nodeMap, root, null)
      const payload: DirectoryChangedPayload = {
        directoryPath: 'C:/workspace',
        parentPath: 'C:/workspace',
        eventType: 'change',
        filePath: 'C:/workspace/a.md'
      }
      applyFsEvent(nodeMap, payload, defaultFormatOptions)
      expect(root.children).toHaveLength(0)
    })
  })

  describe('applyFsEvent - 重命名（文件/文件夹）', () => {
    it('文件重命名：先 unlink 再 add，树中只剩新文件', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('C:/workspace', 'workspace')
      const oldFile = makeFile('C:/workspace/旧名.md', '旧名.md')
      root.children = [oldFile]
      oldFile.parent = root
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, oldFile, root)

      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'C:/workspace',
          parentPath: 'C:/workspace',
          eventType: 'unlink',
          filePath: 'C:/workspace/旧名.md'
        },
        defaultFormatOptions
      )
      expect(root.children).toHaveLength(0)
      expect(nodeMap.has(normalizePathForCompare('C:/workspace/旧名.md'))).toBe(false)

      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'C:/workspace',
          parentPath: 'C:/workspace',
          eventType: 'add',
          filePath: 'C:/workspace/新名.md'
        },
        defaultFormatOptions
      )
      expect(root.children).toHaveLength(1)
      expect(root.children![0]!.name).toBe('新名.md')
      expect(root.children![0]!.path).toBe('C:/workspace/新名.md')
      expect(nodeMap.has(normalizePathForCompare('C:/workspace/新名.md'))).toBe(true)
    })

    it('目录重命名：先 unlinkDir 再 addDir，树中只剩新目录', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('C:/workspace', 'workspace')
      const oldDir = makeDir('C:/workspace/新建文件夹', '新建文件夹')
      root.children = [oldDir]
      oldDir.parent = root
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, oldDir, root)

      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'C:/workspace',
          parentPath: 'C:/workspace',
          eventType: 'unlinkDir',
          filePath: 'C:/workspace/新建文件夹'
        },
        defaultFormatOptions
      )
      expect(root.children).toHaveLength(0)
      expect(nodeMap.has(normalizePathForCompare('C:/workspace/新建文件夹'))).toBe(false)

      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'C:/workspace',
          parentPath: 'C:/workspace',
          eventType: 'addDir',
          filePath: 'C:/workspace/123123123'
        },
        defaultFormatOptions
      )
      expect(root.children).toHaveLength(1)
      expect(root.children![0]!.name).toBe('123123123')
      expect(root.children![0]!.path).toBe('C:/workspace/123123123')
      expect(nodeMap.has(normalizePathForCompare('C:/workspace/123123123'))).toBe(true)
    })

    it('目录重命名：先 addDir 再 unlinkDir（Windows 可能顺序），树中仍只剩新目录', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('C:/workspace', 'workspace')
      const oldDir = makeDir('C:/workspace/新建文件夹', '新建文件夹')
      root.children = [oldDir]
      oldDir.parent = root
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, oldDir, root)

      // 先收到新目录的 addDir（Windows 上有时只收到这个）
      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'C:/workspace',
          parentPath: 'C:/workspace',
          eventType: 'addDir',
          filePath: 'C:/workspace/123123123'
        },
        defaultFormatOptions
      )
      expect(root.children).toHaveLength(2)
      expect(nodeMap.has(normalizePathForCompare('C:/workspace/新建文件夹'))).toBe(true)
      expect(nodeMap.has(normalizePathForCompare('C:/workspace/123123123'))).toBe(true)

      // 再收到旧目录的 unlinkDir
      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'C:/workspace',
          parentPath: 'C:/workspace',
          eventType: 'unlinkDir',
          filePath: 'C:/workspace/新建文件夹'
        },
        defaultFormatOptions
      )
      expect(root.children).toHaveLength(1)
      expect(root.children![0]!.name).toBe('123123123')
      expect(nodeMap.has(normalizePathForCompare('C:/workspace/新建文件夹'))).toBe(false)
      expect(nodeMap.has(normalizePathForCompare('C:/workspace/123123123'))).toBe(true)
    })

    it('文件重命名：先 add 再 unlink，树中只剩新文件', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('C:/workspace', 'workspace')
      const oldFile = makeFile('C:/workspace/old.txt', 'old.txt')
      root.children = [oldFile]
      oldFile.parent = root
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, oldFile, root)

      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'C:/workspace',
          parentPath: 'C:/workspace',
          eventType: 'add',
          filePath: 'C:/workspace/new.txt'
        },
        defaultFormatOptions
      )
      expect(root.children).toHaveLength(2)

      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'C:/workspace',
          parentPath: 'C:/workspace',
          eventType: 'unlink',
          filePath: 'C:/workspace/old.txt'
        },
        defaultFormatOptions
      )
      expect(root.children).toHaveLength(1)
      expect(root.children![0]!.name).toBe('new.txt')
      expect(nodeMap.has(normalizePathForCompare('C:/workspace/old.txt'))).toBe(false)
    })
  })

  describe('applyFsEvent - 删除整个子目录（含其内文件）', () => {
    it('先 unlink 子目录内文件，再 unlinkDir 子目录，父节点下该子目录被移除', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('C:/workspace', 'workspace')
      const sub = makeDir('C:/workspace/123', '123')
      const fileInSub = makeFile('C:/workspace/123/新建 文本文档.txt', '新建 文本文档.txt')
      sub.children = [fileInSub]
      fileInSub.parent = sub
      root.children = [sub]
      sub.parent = root
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, sub, root)
      registerNode(nodeMap, fileInSub, sub)

      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'C:/workspace/123',
          parentPath: 'C:/workspace/123',
          eventType: 'unlink',
          filePath: 'C:/workspace/123/新建 文本文档.txt'
        },
        defaultFormatOptions
      )
      expect(sub.children).toHaveLength(0)
      expect(nodeMap.has(normalizePathForCompare('C:/workspace/123/新建 文本文档.txt'))).toBe(false)

      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'C:/workspace',
          parentPath: 'C:/workspace',
          eventType: 'unlinkDir',
          filePath: 'C:/workspace/123'
        },
        defaultFormatOptions
      )
      expect(root.children).toHaveLength(0)
      expect(nodeMap.has(normalizePathForCompare('C:/workspace/123'))).toBe(false)
    })

    it('直接 unlinkDir 子目录（未先 unlink 其内文件），父节点下该子目录仍被移除', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('C:/workspace', 'workspace')
      const sub = makeDir('C:/workspace/123', '123')
      sub.children = []
      root.children = [sub]
      sub.parent = root
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, sub, root)

      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'C:/workspace',
          parentPath: 'C:/workspace',
          eventType: 'unlinkDir',
          filePath: 'C:/workspace/123'
        },
        defaultFormatOptions
      )
      expect(root.children).toHaveLength(0)
      expect(nodeMap.has(normalizePathForCompare('C:/workspace/123'))).toBe(false)
    })
  })

  describe('applyFsEvent - 在已展开空子目录下 add 文件', () => {
    it('父为已展开空子目录时 add 文件，该子目录 children 含新文件', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('C:/workspace', 'workspace')
      const sub = makeDir('C:/workspace/123', '123')
      sub.children = []
      root.children = [sub]
      sub.parent = root
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, sub, root)

      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'C:/workspace/123',
          parentPath: 'C:/workspace/123',
          eventType: 'add',
          filePath: 'C:/workspace/123/新建 文本文档.txt'
        },
        defaultFormatOptions
      )
      expect(sub.children).toHaveLength(1)
      expect(sub.children![0]!.name).toBe('新建 文本文档.txt')
      expect(nodeMap.has(normalizePathForCompare('C:/workspace/123/新建 文本文档.txt'))).toBe(true)
    })
  })

  // ---------- 完整场景清单：与 UI 修复一一对应，确保所有情况均纳入 Vitest ----------
  describe('完整场景清单（所有修复情况均列入测试）', () => {
    it('1. 根目录新建文件夹：addDir 后根下出现新目录节点且 nodeMap 可查', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('D:/ws', 'ws')
      registerNode(nodeMap, root, null)
      const ok = applyFsEvent(
        nodeMap,
        {
          directoryPath: 'D:/ws',
          parentPath: 'D:/ws',
          eventType: 'addDir',
          filePath: 'D:/ws/新建文件夹'
        },
        defaultFormatOptions
      )
      expect(ok).toBe(true)
      expect(root.children).toHaveLength(1)
      expect(root.children![0]!.name).toBe('新建文件夹')
      expect(root.children![0]!.type).toBe('directory')
      expect(nodeMap.get(normalizePathForCompare('D:/ws/新建文件夹'))).toBe(root.children![0])
    })

    it('2. 根目录新建文件：add 后根下出现新文件节点', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('D:/ws', 'ws')
      registerNode(nodeMap, root, null)
      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'D:/ws',
          parentPath: 'D:/ws',
          eventType: 'add',
          filePath: 'D:/ws/readme.md'
        },
        defaultFormatOptions
      )
      expect(root.children).toHaveLength(1)
      expect(root.children![0]!.name).toBe('readme.md')
      expect(root.children![0]!.type).toBe('file')
    })

    it('3. 根目录删除文件夹：unlinkDir 后该目录从根下移除且 nodeMap 清除', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('D:/ws', 'ws')
      const folder = makeDir('D:/ws/123', '123')
      root.children = [folder]
      folder.parent = root
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, folder, root)
      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'D:/ws',
          parentPath: 'D:/ws',
          eventType: 'unlinkDir',
          filePath: 'D:/ws/123'
        },
        defaultFormatOptions
      )
      expect(root.children).toHaveLength(0)
      expect(nodeMap.has(normalizePathForCompare('D:/ws/123'))).toBe(false)
    })

    it('4. 根目录删除文件：unlink 后该文件从根下移除', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('D:/ws', 'ws')
      const f = makeFile('D:/ws/a.txt', 'a.txt')
      root.children = [f]
      f.parent = root
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, f, root)
      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'D:/ws',
          parentPath: 'D:/ws',
          eventType: 'unlink',
          filePath: 'D:/ws/a.txt'
        },
        defaultFormatOptions
      )
      expect(root.children).toHaveLength(0)
      expect(nodeMap.has(normalizePathForCompare('D:/ws/a.txt'))).toBe(false)
    })

    it('5. 已展开子目录下新建文件：add 后子目录 children 含新文件', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('D:/ws', 'ws')
      const sub = makeDir('D:/ws/sub', 'sub')
      root.children = [sub]
      sub.parent = root
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, sub, root)
      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'D:/ws',
          parentPath: 'D:/ws/sub',
          eventType: 'add',
          filePath: 'D:/ws/sub/child.md'
        },
        defaultFormatOptions
      )
      expect(sub.children).toHaveLength(1)
      expect(sub.children![0]!.name).toBe('child.md')
    })

    it('6. 已展开子目录下新建文件夹：addDir 后子目录 children 含新目录', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('D:/ws', 'ws')
      const sub = makeDir('D:/ws/sub', 'sub')
      root.children = [sub]
      sub.parent = root
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, sub, root)
      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'D:/ws',
          parentPath: 'D:/ws/sub',
          eventType: 'addDir',
          filePath: 'D:/ws/sub/inner'
        },
        defaultFormatOptions
      )
      expect(sub.children).toHaveLength(1)
      expect(sub.children![0]!.name).toBe('inner')
    })

    it('7. 已展开子目录下删除文件：unlink 后子目录 children 移除该文件', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('D:/ws', 'ws')
      const sub = makeDir('D:/ws/sub', 'sub')
      const f = makeFile('D:/ws/sub/x.txt', 'x.txt')
      sub.children = [f]
      f.parent = sub
      root.children = [sub]
      sub.parent = root
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, sub, root)
      registerNode(nodeMap, f, sub)
      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'D:/ws',
          parentPath: 'D:/ws/sub',
          eventType: 'unlink',
          filePath: 'D:/ws/sub/x.txt'
        },
        defaultFormatOptions
      )
      expect(sub.children).toHaveLength(0)
    })

    it('8. 已展开子目录被整体删除：unlinkDir 后父节点 children 移除该子目录', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('D:/ws', 'ws')
      const sub = makeDir('D:/ws/sub', 'sub')
      root.children = [sub]
      sub.parent = root
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, sub, root)
      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'D:/ws',
          parentPath: 'D:/ws',
          eventType: 'unlinkDir',
          filePath: 'D:/ws/sub'
        },
        defaultFormatOptions
      )
      expect(root.children).toHaveLength(0)
      expect(nodeMap.has(normalizePathForCompare('D:/ws/sub'))).toBe(false)
    })

    it('9. 重命名文件夹（仅收到 addDir 时）：先 addDir 新名再 unlinkDir 旧名，树中仅剩新名', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('D:/ws', 'ws')
      const oldDir = makeDir('D:/ws/旧文件夹', '旧文件夹')
      root.children = [oldDir]
      oldDir.parent = root
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, oldDir, root)
      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'D:/ws',
          parentPath: 'D:/ws',
          eventType: 'addDir',
          filePath: 'D:/ws/新文件夹'
        },
        defaultFormatOptions
      )
      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'D:/ws',
          parentPath: 'D:/ws',
          eventType: 'unlinkDir',
          filePath: 'D:/ws/旧文件夹'
        },
        defaultFormatOptions
      )
      expect(root.children).toHaveLength(1)
      expect(root.children![0]!.name).toBe('新文件夹')
    })

    it('10. 已展开空子目录下新建文件：add 后空子目录出现新文件（刷新前即可见）', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('D:/ws', 'ws')
      const emptySub = makeDir('D:/ws/空目录', '空目录')
      emptySub.children = []
      root.children = [emptySub]
      emptySub.parent = root
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, emptySub, root)
      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'D:/ws/空目录',
          parentPath: 'D:/ws/空目录',
          eventType: 'add',
          filePath: 'D:/ws/空目录/新文件.txt'
        },
        defaultFormatOptions
      )
      expect(emptySub.children).toHaveLength(1)
      expect(emptySub.children![0]!.name).toBe('新文件.txt')
    })

    it('11. 父节点未在 nodeMap（未展开）：applyFsEvent 返回 false，由调用方刷新回退', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('D:/ws', 'ws')
      registerNode(nodeMap, root, null)
      const ok = applyFsEvent(
        nodeMap,
        {
          directoryPath: 'D:/ws',
          parentPath: 'D:/ws/未展开子目录',
          eventType: 'add',
          filePath: 'D:/ws/未展开子目录/file.md'
        },
        defaultFormatOptions
      )
      expect(ok).toBe(false)
      expect(root.children).toHaveLength(0)
    })

    it('12. 删除整个子目录：先 unlink 其内文件再 unlinkDir 子目录，根下该子目录消失', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('D:/ws', 'ws')
      const sub = makeDir('D:/ws/待删', '待删')
      const f = makeFile('D:/ws/待删/a.md', 'a.md')
      sub.children = [f]
      f.parent = sub
      root.children = [sub]
      sub.parent = root
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, sub, root)
      registerNode(nodeMap, f, sub)
      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'D:/ws/待删',
          parentPath: 'D:/ws/待删',
          eventType: 'unlink',
          filePath: 'D:/ws/待删/a.md'
        },
        defaultFormatOptions
      )
      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'D:/ws',
          parentPath: 'D:/ws',
          eventType: 'unlinkDir',
          filePath: 'D:/ws/待删'
        },
        defaultFormatOptions
      )
      expect(root.children).toHaveLength(0)
      expect(nodeMap.has(normalizePathForCompare('D:/ws/待删'))).toBe(false)
    })

    it('13. 直接 unlinkDir 空子目录：根下该子目录节点消失', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('D:/ws', 'ws')
      const sub = makeDir('D:/ws/空子目录', '空子目录')
      sub.children = []
      root.children = [sub]
      sub.parent = root
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, sub, root)
      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'D:/ws',
          parentPath: 'D:/ws',
          eventType: 'unlinkDir',
          filePath: 'D:/ws/空子目录'
        },
        defaultFormatOptions
      )
      expect(root.children).toHaveLength(0)
    })

    it('14. 多级展开：内层目录下 add 文件，内层 unlinkDir 后从父 children 移除', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('D:/ws', 'ws')
      const sub = makeDir('D:/ws/sub', 'sub')
      const inner = makeDir('D:/ws/sub/inner', 'inner')
      root.children = [sub]
      sub.children = [inner]
      sub.parent = root
      inner.parent = sub
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, sub, root)
      registerNode(nodeMap, inner, sub)
      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'D:/ws',
          parentPath: 'D:/ws/sub/inner',
          eventType: 'add',
          filePath: 'D:/ws/sub/inner/deep.md'
        },
        defaultFormatOptions
      )
      expect(inner.children).toHaveLength(1)
      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'D:/ws/sub',
          parentPath: 'D:/ws/sub',
          eventType: 'unlinkDir',
          filePath: 'D:/ws/sub/inner'
        },
        defaultFormatOptions
      )
      expect(sub.children).toHaveLength(0)
      expect(nodeMap.has(normalizePathForCompare('D:/ws/sub/inner'))).toBe(false)
    })

    it('15. .metadoc 目录：addDir 加入树', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('D:/ws', 'ws')
      registerNode(nodeMap, root, null)
      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'D:/ws',
          parentPath: 'D:/ws',
          eventType: 'addDir',
          filePath: 'D:/ws/.metadoc'
        },
        defaultFormatOptions
      )
      expect(root.children).toHaveLength(1)
      expect(root.children![0]!.name).toBe('.metadoc')
    })

    it('16. 不支持格式的文件：add 不加入树', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('D:/ws', 'ws')
      registerNode(nodeMap, root, null)
      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'D:/ws',
          parentPath: 'D:/ws',
          eventType: 'add',
          filePath: 'D:/ws/script.js'
        },
        defaultFormatOptions
      )
      expect(root.children).toHaveLength(0)
    })

    it('17. change 事件：不改变树结构', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('D:/ws', 'ws')
      root.children = []
      registerNode(nodeMap, root, null)
      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'D:/ws',
          parentPath: 'D:/ws',
          eventType: 'change',
          filePath: 'D:/ws/any.md'
        },
        defaultFormatOptions
      )
      expect(root.children).toHaveLength(0)
    })

    it('18. ENOENT/路径不存在错误：isPathNotExistError 可识别（含 IPC 序列化对象）', () => {
      expect(isPathNotExistError({ code: 'ENOENT' })).toBe(true)
      expect(isPathNotExistError({ message: '目录不存在: D:\\repos\\fixtures\\123' })).toBe(true)
      expect(isPathNotExistError(new Error('file not found'))).toBe(true)
      expect(isPathNotExistError(new Error('permission denied'))).toBe(false)
    })

    it('19. unlinkDir 路径与 nodeMap key 不一致时仍能按名称匹配移除', () => {
      const nodeMap: NodeMap = new Map()
      const root = makeRoot('C:/workspace', 'workspace')
      const folder = makeDir('C:/workspace/ 新建文件夹', ' 新建文件夹')
      root.children = [folder]
      folder.parent = root
      registerNode(nodeMap, root, null)
      registerNode(nodeMap, folder, root)
      applyFsEvent(
        nodeMap,
        {
          directoryPath: 'C:/workspace',
          parentPath: 'C:/workspace',
          eventType: 'unlinkDir',
          filePath: 'C:/workspace/ 新建文件夹'
        },
        defaultFormatOptions
      )
      expect(root.children!.map((c) => c.name)).not.toContain(' 新建文件夹')
    })
  })
})
