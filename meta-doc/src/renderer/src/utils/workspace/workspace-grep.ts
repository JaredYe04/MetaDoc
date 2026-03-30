import messageBridge from '../../bridge/message-bridge'
import { formatRegistry } from '../format-registry'
import { createRendererLogger } from '../logger'
import { findFuzzyMatchesInText, type FuzzyLineMatch } from '../fuzzy-text-search'
import { searchInText as searchInTextCore, type TextSearchMatch } from '../text-search-utils'

const logger = createRendererLogger('WorkspaceGrep')

export interface WorkspaceGrepMatch {
  filePath: string
  line: number
  column: number
  match: string
  /**
   * 当前行的完整文本（用于在 UI 中单行展示并高亮匹配内容）
   */
  lineText?: string
  preContext: string
  postContext: string
  context: string
  /** 模糊搜索时的相似度（0–1） */
  similarity?: number
}

export interface WorkspaceGrepOptions {
  pattern: string
  isRegex?: boolean
  /** 与 agent grep 一致的模糊搜索（不可与 isRegex 同时使用） */
  fuzzy?: boolean
  similarityThreshold?: number
  matchCase?: boolean
  wholeWord?: boolean
  contextLines?: number
  maxMatchesPerFile?: number
  maxFiles?: number
  signal?: AbortSignal | null
  /**
   * 可选：每完成一个文件的搜索就回调一批结果，用于增量展示
   */
  onBatch?: (batch: WorkspaceGrepMatch[]) => void
  /**
   * 将工作区搜索限定在这些路径内（每项为文件或文件夹的绝对路径，或相对于各工作区根的路径）。
   * 文件夹会递归搜索子内容（仍遵守 .git / node_modules / .metadoc 排除规则）。
   * 未设置或空数组表示搜索整个工作区（与原先行为一致）。
   */
  withinPaths?: string[]
}

/**
 * 获取所有支持的文档扩展名（如 .md / .tex 等）
 */
function getSupportedExtensions(): Set<string> {
  const map = formatRegistry.getExtensionMap()
  const exts = new Set<string>()
  for (const ext of map.keys()) {
    if (!ext) continue
    const normalized = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
    exts.add(normalized)
  }
  return exts
}

/**
 * 判断文件是否为支持的文档类型
 */
function isSupportedFile(path: string, supportedExts: Set<string>): boolean {
  const idx = path.lastIndexOf('.')
  if (idx === -1) return false
  const ext = path.slice(idx).toLowerCase()
  return supportedExts.has(ext)
}

function normalizePathSlashes(p: string): string {
  return p.replace(/\\/g, '/')
}

function toComparablePath(p: string): string {
  return normalizePathSlashes(p).replace(/\/+/g, '/').toLowerCase()
}

function isAbsoluteFsPath(p: string): boolean {
  const s = p.trim()
  if (!s) return false
  if (s.startsWith('/') || s.startsWith('\\')) return true
  return /^[A-Za-z]:[\\/]/.test(s)
}

/** 按工作区根路径风格拼接相对路径 */
function joinPathSegments(base: string, rel: string): string {
  const b = base.replace(/[/\\]+$/, '')
  const r = rel.replace(/^[/\\]+/, '')
  const useBackslash = /\\/.test(b) && !/\//.test(b)
  const sep = useBackslash ? '\\' : '/'
  return b + sep + r
}

function isDescendantOrEqualWorkspacePath(workspaceRoots: string[], candidate: string): boolean {
  const c = toComparablePath(candidate).replace(/\/$/, '')
  if (!c) return false
  return workspaceRoots.some((root) => {
    const r = toComparablePath(root).replace(/\/$/, '')
    return c === r || c.startsWith(r + '/')
  })
}

async function tryReadDirectory(
  dirPath: string
): Promise<Array<{ name: string; path: string; isDirectory: boolean }> | null> {
  if (!messageBridge.getIpc()) return null
  try {
    return (await messageBridge.invoke('read-directory', dirPath)) as Array<{
      name: string
      path: string
      isDirectory: boolean
    }>
  } catch {
    return null
  }
}

/**
 * 将 withinPaths 解析为 BFS 起始目录与需直接搜索的单文件
 */
async function resolveWithinPathsToSeeds(
  workspaceRoots: string[],
  withinPaths: string[],
  supportedExts: Set<string>
): Promise<{ directorySeeds: string[]; fileSeeds: string[] }> {
  const directorySeeds = new Set<string>()
  const fileSeeds = new Set<string>()

  for (const raw of withinPaths) {
    const trimmed = typeof raw === 'string' ? raw.trim() : ''
    if (!trimmed) continue

    const candidates: string[] = isAbsoluteFsPath(trimmed)
      ? [trimmed]
      : workspaceRoots.map((root) => joinPathSegments(root, trimmed))

    let handled = false
    for (const candidate of candidates) {
      if (!isDescendantOrEqualWorkspacePath(workspaceRoots, candidate)) continue

      const dirEntries = await tryReadDirectory(candidate)
      if (dirEntries !== null) {
        directorySeeds.add(candidate)
        handled = true
        break
      }
      if (isSupportedFile(candidate, supportedExts)) {
        fileSeeds.add(candidate)
        handled = true
        break
      }
    }
    if (!handled) {
      logger.warn('withinPaths 项无法解析为工作区内的目录或可搜索文件，已跳过', { raw: trimmed })
    }
  }

  return {
    directorySeeds: [...directorySeeds],
    fileSeeds: [...fileSeeds]
  }
}

/**
 * 无磁盘工作区根、仅搜索已打开标签页时，按 withinPaths 过滤 tab.path
 */
export function tabPathMatchesWithinPaths(
  tabPath: string,
  withinPaths: string[] | undefined,
  workspaceRoots: string[]
): boolean {
  if (!withinPaths || withinPaths.length === 0) return true
  const filters = withinPaths.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean)
  if (filters.length === 0) return true

  const tabC = toComparablePath(tabPath).replace(/\/$/, '')

  for (const raw of filters) {
    if (workspaceRoots.length > 0) {
      const candidates: string[] = isAbsoluteFsPath(raw)
        ? [raw.trim()]
        : workspaceRoots.map((root) => joinPathSegments(root, raw.trim()))
      for (const cand of candidates) {
        if (!isDescendantOrEqualWorkspacePath(workspaceRoots, cand)) continue
        const c = toComparablePath(cand).replace(/\/$/, '')
        if (tabC === c || tabC.startsWith(c + '/')) return true
      }
    } else {
      if (isAbsoluteFsPath(raw)) {
        const c = toComparablePath(raw.trim()).replace(/\/$/, '')
        if (tabC === c || tabC.startsWith(c + '/')) return true
      } else {
        const rel = toComparablePath(raw.trim()).replace(/^\/+/, '')
        if (
          rel &&
          (tabC === rel ||
            tabC.endsWith('/' + rel) ||
            tabC.includes('/' + rel + '/') ||
            tabC.endsWith(rel))
        ) {
          return true
        }
      }
    }
  }
  return false
}

/**
 * 在已加载的文本上执行与 workspace / agent grep 一致的搜索，并带上上下文行
 */
function workspaceMatchesFromContent(
  content: string,
  filePath: string,
  options: WorkspaceGrepOptions
): WorkspaceGrepMatch[] {
  const contextLines = options.contextLines ?? 3
  const fuzzy = options.fuzzy === true && options.isRegex !== true
  const similarityThreshold =
    typeof options.similarityThreshold === 'number' && !Number.isNaN(options.similarityThreshold)
      ? Math.min(1, Math.max(0, options.similarityThreshold))
      : 0.6

  let limited: TextSearchMatch[] | FuzzyLineMatch[]
  if (fuzzy) {
    const fuzzyMatches = findFuzzyMatchesInText(
      content,
      options.pattern,
      similarityThreshold,
      contextLines
    )
    limited =
      options.maxMatchesPerFile && options.maxMatchesPerFile > 0
        ? fuzzyMatches.slice(0, options.maxMatchesPerFile)
        : fuzzyMatches
  } else {
    const textMatches = searchInTextCore(content, options.pattern, {
      useRegex: options.isRegex === true,
      matchCase: options.matchCase === true,
      wholeWord: options.wholeWord === true
    })
    limited =
      options.maxMatchesPerFile && options.maxMatchesPerFile > 0
        ? textMatches.slice(0, options.maxMatchesPerFile)
        : textMatches
  }

  const lines = content.split(/\r?\n/)

  return limited.map((m) => {
    const lineIndex = m.line - 1
    const startLine = Math.max(0, lineIndex - contextLines)
    const endLine = Math.min(lines.length - 1, lineIndex + contextLines)

    const preContext = lines.slice(startLine, lineIndex).join('\n')
    const postContext = lines.slice(lineIndex + 1, endLine + 1).join('\n')
    const context = lines.slice(startLine, endLine + 1).join('\n')
    const lineText = lines[lineIndex] ?? ''

    return {
      filePath,
      line: m.line,
      column: m.column,
      match: m.match,
      lineText,
      preContext,
      postContext,
      context,
      ...('similarity' in m && typeof (m as FuzzyLineMatch).similarity === 'number'
        ? { similarity: (m as FuzzyLineMatch).similarity }
        : {})
    }
  })
}

/**
 * 在单个文件中执行 grep
 */
async function grepInFile(
  filePath: string,
  options: WorkspaceGrepOptions
): Promise<WorkspaceGrepMatch[]> {
  const ipc = messageBridge.getIpc()
  if (!ipc) {
    logger.warn('IPC renderer 未初始化，无法执行工作区 grep')
    return []
  }

  try {
    const content = (await messageBridge.invoke('read-file-content', filePath)) as string | null
    if (content == null) return []
    // 只搜索文本文件：跳过含 null 或大量非可打印字符的内容（视为二进制）
    if (content.includes('\0')) return []
    if (content.length > 100) {
      let controlCount = 0
      for (let i = 0; i < content.length; i++) {
        const c = content.charCodeAt(i)
        if (c === 0 || (c < 32 && c !== 9 && c !== 10 && c !== 13)) controlCount++
      }
      if (controlCount / content.length > 0.3) return []
    }

    return workspaceMatchesFromContent(content, filePath, options)
  } catch (error) {
    logger.warn('grepInFile 失败', { filePath, error })
    return []
  }
}

/**
 * 在给定文件内容中执行 grep（用于未保存的脏文件等内存内容）
 */
export function grepInContent(
  filePath: string,
  content: string,
  options: WorkspaceGrepOptions
): WorkspaceGrepMatch[] {
  if (content.includes('\0')) return []
  if (content.length > 100) {
    let controlCount = 0
    for (let i = 0; i < content.length; i++) {
      const c = content.charCodeAt(i)
      if (c === 0 || (c < 32 && c !== 9 && c !== 10 && c !== 13)) controlCount++
    }
    if (controlCount / content.length > 0.3) return []
  }

  return workspaceMatchesFromContent(content, filePath, options)
}

/**
 * 在多个工作区根目录下执行 grep（递归搜索）
 */
export async function grepInWorkspaces(
  roots: string[],
  options: WorkspaceGrepOptions
): Promise<WorkspaceGrepMatch[]> {
  const ipc = messageBridge.getIpc()
  if (!ipc) {
    logger.warn('IPC renderer 未初始化，无法执行工作区 grep')
    return []
  }

  const supportedExts = getSupportedExtensions()
  const maxFiles = options.maxFiles && options.maxFiles > 0 ? options.maxFiles : 2000
  const queue: string[] = []
  const results: WorkspaceGrepMatch[] = []

  const withinFiltered =
    options.withinPaths && options.withinPaths.length > 0
      ? options.withinPaths.filter((x) => typeof x === 'string' && x.trim().length > 0)
      : []

  if (withinFiltered.length > 0) {
    const { directorySeeds, fileSeeds } = await resolveWithinPathsToSeeds(
      roots,
      withinFiltered,
      supportedExts
    )

    for (const filePath of fileSeeds) {
      if (options.signal?.aborted) break
      if (results.length >= maxFiles) {
        logger.info('达到最大文件数限制，提前结束工作区 grep', { maxFiles })
        return results
      }
      const fileMatches = await grepInFile(filePath, options)
      if (fileMatches.length > 0) {
        results.push(...fileMatches)
        if (options.onBatch) {
          try {
            options.onBatch(fileMatches)
          } catch (callbackError) {
            logger.warn('onBatch 回调执行失败', { error: callbackError })
          }
        }
      }
    }

    for (const dir of directorySeeds) {
      if (dir && !queue.includes(dir)) queue.push(dir)
    }

    if (queue.length === 0 && fileSeeds.length === 0) {
      logger.info('withinPaths 未解析出任何可搜索目录或文件')
      return []
    }
  } else {
    for (const root of roots) {
      if (root && !queue.includes(root)) {
        queue.push(root)
      }
    }
  }

  while (queue.length > 0) {
    if (options.signal?.aborted) {
      logger.info('工作区 grep 已被取消')
      break
    }

    const dirPath = queue.shift()!

    let entries: Array<{ name: string; path: string; isDirectory: boolean }> = []
    try {
      entries = (await messageBridge.invoke('read-directory', dirPath)) as Array<{
        name: string
        path: string
        isDirectory: boolean
      }>
    } catch (error) {
      logger.warn('读取目录失败，跳过', { dirPath, error })
      continue
    }

    for (const entry of entries) {
      if (options.signal?.aborted) break

      // 跳过 .metadoc 目录（将来可以在其中存储 AI 数据）
      if (entry.isDirectory) {
        if (entry.name === '.metadoc' || entry.name === '.git' || entry.name === 'node_modules') {
          continue
        }
        queue.push(entry.path)
        continue
      }

      if (!isSupportedFile(entry.path, supportedExts)) continue
      if (results.length >= maxFiles) {
        logger.info('达到最大文件数限制，提前结束工作区 grep', { maxFiles })
        return results
      }

      const fileMatches = await grepInFile(entry.path, options)
      if (fileMatches.length > 0) {
        results.push(...fileMatches)
        if (options.onBatch) {
          try {
            options.onBatch(fileMatches)
          } catch (callbackError) {
            logger.warn('onBatch 回调执行失败', { error: callbackError })
          }
        }
      }
    }
  }

  return results
}
