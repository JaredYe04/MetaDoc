/**
 * 文件监听服务
 * 用于监听文件系统变化，实现类似 VSCode 的文件自动同步功能
 */

import * as chokidar from 'chokidar'
import * as fs from 'fs'
import * as path from 'path'
import { createMainLogger } from '../logger'
import { WebContents } from 'electron'
import { isPlainTextFormat, detectFileFormatFromPath } from './supported-formats'

const logger = createMainLogger('FileWatcherService')

export interface FileWatcherInfo {
  filePath: string
  watcher: chokidar.FSWatcher
  lastModified: number
  lastContent: string
  webContents: WebContents
  tabId?: string
}

/**
 * 根据文件路径判断文件格式
 */
function detectFileFormat(filePath: string): string {
  return detectFileFormatFromPath(filePath)
}

/**
 * 移除 Markdown 文件中的 meta-info
 */
function removeMetaInfoFromMarkdown(content: string): string {
  if (!content || typeof content !== 'string') {
    return content || ''
  }
  // 移除 Markdown 中的元信息标记（<!--meta-info: ... -->）
  return content.replace(/<!--meta-info:\s*[^>]*-->/g, '').trim()
}

/**
 * 移除 LaTeX 文件中的 meta-info
 */
function removeMetaInfoFromLatex(content: string): string {
  if (!content || typeof content !== 'string') {
    return content || ''
  }
  let result = content
  // 移除警告行
  result = result.replace(/% 请勿手动修改此行及下面的 META-INFO.*\n?/g, '')
  // 移除 META-INFO 行
  result = result.replace(/%META-INFO:\s*[^\n]*\n?/g, '')
  return result.trim()
}

/**
 * 根据文件格式移除 meta-info
 * 纯文本格式（txt, json等）不包含元信息，直接返回原内容
 */
function removeMetaInfo(content: string, filePath: string): string {
  if (!content || typeof content !== 'string') {
    return content || ''
  }

  const ext = path.extname(filePath).toLowerCase()

  // 纯文本格式不包含元信息，直接返回
  if (isPlainTextFormat(ext)) {
    return content
  }

  const format = detectFileFormat(filePath)
  if (format === 'tex') {
    return removeMetaInfoFromLatex(content)
  } else {
    return removeMetaInfoFromMarkdown(content)
  }
}

class FileWatcherService {
  private watchers = new Map<string, FileWatcherInfo>()
  private isEnabled = true
  // 正在保存的文件列表（用于忽略自己保存触发的文件变化）
  private savingFiles = new Set<string>()
  // 文件变化的防抖处理（避免频繁触发）
  private changeDebounceTimers = new Map<string, NodeJS.Timeout>()

  /**
   * 启动文件监听
   * @param filePath 文件路径
   * @param webContents 用于发送 IPC 消息的 WebContents
   * @param tabId 可选的标签页 ID
   */
  watchFile(filePath: string, webContents: WebContents, tabId?: string): void {
    if (!this.isEnabled) {
      logger.debug('文件监听已禁用，跳过监听', { filePath })
      return
    }

    // 规范化文件路径
    const normalizedPath = path.normalize(filePath)

    // 如果已经在监听，先停止旧的监听
    if (this.watchers.has(normalizedPath)) {
      this.unwatchFile(normalizedPath)
    }

    // 检查文件是否存在
    if (!fs.existsSync(normalizedPath)) {
      logger.warn('文件不存在，无法监听', { filePath: normalizedPath })
      return
    }

    try {
      // 读取文件的初始内容和修改时间
      const stats = fs.statSync(normalizedPath)
      const rawInitialContent = fs.readFileSync(normalizedPath, 'utf-8')
      // 保存原始内容（包含 meta-info），但后续比较时会移除 meta-info
      const initialContent = rawInitialContent

      // 创建文件监听器
      const watcher = chokidar.watch(normalizedPath, {
        persistent: true,
        ignoreInitial: true, // 忽略初始事件
        awaitWriteFinish: {
          stabilityThreshold: 200, // 等待文件写入稳定后再触发（200ms）
          pollInterval: 100 // 轮询间隔
        }
      })

      // 监听文件变化
      watcher.on('change', async (changedPath) => {
        await this.handleFileChange(changedPath, normalizedPath, webContents, tabId)
      })

      // 监听文件删除
      watcher.on('unlink', (deletedPath) => {
        logger.info('文件被删除', { filePath: deletedPath })
        this.unwatchFile(normalizedPath)
        webContents.send('file-deleted', { filePath: deletedPath, tabId })
      })

      // 监听错误
      watcher.on('error', (error) => {
        logger.error('文件监听错误', { filePath: normalizedPath, error })
      })

      // 保存监听器信息
      this.watchers.set(normalizedPath, {
        filePath: normalizedPath,
        watcher,
        lastModified: stats.mtimeMs,
        lastContent: initialContent,
        webContents,
        tabId
      })

      logger.info('开始监听文件', { filePath: normalizedPath, tabId })
    } catch (error) {
      logger.error('启动文件监听失败', { filePath: normalizedPath, error })
    }
  }

  /**
   * 停止文件监听
   * @param filePath 文件路径
   */
  unwatchFile(filePath: string): void {
    const normalizedPath = path.normalize(filePath)
    const info = this.watchers.get(normalizedPath)

    if (info) {
      try {
        info.watcher.close()
        this.watchers.delete(normalizedPath)
        logger.info('停止监听文件', { filePath: normalizedPath })
      } catch (error) {
        logger.error('停止文件监听失败', { filePath: normalizedPath, error })
      }
    }
  }

  /**
   * 停止所有文件监听
   */
  unwatchAll(): void {
    for (const [filePath] of this.watchers) {
      this.unwatchFile(filePath)
    }
  }

  /**
   * 标记文件正在保存（用于忽略自己保存触发的文件变化）
   * @param filePath 文件路径
   * @param timeout 忽略超时时间（毫秒），默认 2 秒
   */
  markFileAsSaving(filePath: string, timeout: number = 2000): void {
    const normalizedPath = path.normalize(filePath)
    this.savingFiles.add(normalizedPath)

    // 设置超时，自动移除标记
    setTimeout(() => {
      this.savingFiles.delete(normalizedPath)
      logger.debug('移除文件保存标记', { filePath: normalizedPath })
    }, timeout)

    logger.debug('标记文件正在保存', { filePath: normalizedPath, timeout })
  }

  /**
   * 处理文件变化（使用防抖和增量更新）
   */
  private async handleFileChange(
    changedPath: string,
    normalizedPath: string,
    webContents: WebContents,
    tabId?: string
  ): Promise<void> {
    const info = this.watchers.get(normalizedPath)
    if (!info) {
      return
    }

    // 检查是否正在保存（如果是，忽略此次变化）
    if (this.savingFiles.has(normalizedPath)) {
      logger.debug('文件正在保存中，忽略文件变化', { filePath: normalizedPath })
      // 更新监听器信息，但不发送通知
      try {
        if (fs.existsSync(normalizedPath)) {
          const stats = fs.statSync(normalizedPath)
          const newContent = fs.readFileSync(normalizedPath, 'utf-8')
          info.lastModified = stats.mtimeMs
          info.lastContent = newContent
        }
      } catch (error) {
        // 忽略更新错误
      }
      return
    }

    // 清除之前的防抖定时器
    const existingTimer = this.changeDebounceTimers.get(normalizedPath)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // 设置防抖定时器（500ms）
    const debounceTimer = setTimeout(async () => {
      this.changeDebounceTimers.delete(normalizedPath)
      await this.processFileChange(normalizedPath, webContents, tabId)
    }, 500)

    this.changeDebounceTimers.set(normalizedPath, debounceTimer)
  }

  /**
   * 实际处理文件变化（在防抖后执行）
   */
  private async processFileChange(
    normalizedPath: string,
    webContents: WebContents,
    tabId?: string
  ): Promise<void> {
    const info = this.watchers.get(normalizedPath)
    if (!info) {
      return
    }

    try {
      // 检查文件是否仍然存在
      if (!fs.existsSync(normalizedPath)) {
        logger.warn('文件在变化后不存在', { filePath: normalizedPath })
        return
      }

      // 读取文件的新内容和修改时间
      const stats = fs.statSync(normalizedPath)
      const rawContent = fs.readFileSync(normalizedPath, 'utf-8')

      // 移除 meta-info（meta-info 是 MetaDoc 注入的，不应该参与比较和冲突检测）
      const newContent = removeMetaInfo(rawContent, normalizedPath)
      const lastContentWithoutMeta = removeMetaInfo(info.lastContent, normalizedPath)

      // 检查是否是真正的变化（避免重复触发，使用移除 meta-info 后的内容比较）
      if (stats.mtimeMs === info.lastModified && newContent === lastContentWithoutMeta) {
        logger.debug('文件内容未实际变化（已排除 meta-info），忽略', { filePath: normalizedPath })
        return
      }

      // 计算增量变化（使用移除 meta-info 后的内容）
      const diff = this.computeDiff(lastContentWithoutMeta, newContent)

      // 更新监听器信息（保存原始内容，但比较时使用移除 meta-info 后的版本）
      info.lastModified = stats.mtimeMs
      info.lastContent = rawContent // 保存原始内容

      // 发送文件变化通知到渲染进程（发送移除 meta-info 后的内容）
      webContents.send('file-changed', {
        filePath: normalizedPath,
        tabId,
        content: newContent, // 移除 meta-info 后的内容
        modifiedTime: stats.mtimeMs,
        diff // 增量变化信息
      })

      logger.info('检测到文件变化', {
        filePath: normalizedPath,
        tabId,
        size: newContent.length,
        diffSize: diff ? diff.length : 0,
        modifiedTime: new Date(stats.mtimeMs).toISOString()
      })
    } catch (error) {
      logger.error('处理文件变化失败', { filePath: normalizedPath, error })
    }
  }

  /**
   * 计算两个文本之间的差异（简化版本，用于增量更新）
   * 返回差异信息，格式：{ type: 'insert' | 'delete' | 'replace', start: number, end: number, newText: string }
   */
  private computeDiff(
    oldText: string,
    newText: string
  ): Array<{
    type: 'insert' | 'delete' | 'replace'
    start: number
    end: number
    newText: string
  }> | null {
    // 如果内容完全相同，返回 null
    if (oldText === newText) {
      return null
    }

    // 如果新内容为空，返回删除操作
    if (newText.length === 0) {
      return [
        {
          type: 'delete',
          start: 0,
          end: oldText.length - 1,
          newText: ''
        }
      ]
    }

    // 如果旧内容为空，返回插入操作
    if (oldText.length === 0) {
      return [
        {
          type: 'insert',
          start: 0,
          end: 0,
          newText: newText
        }
      ]
    }

    // 简单的差异检测：找到第一个不同的位置和最后一个不同的位置
    let start = 0
    let end = Math.min(oldText.length, newText.length) - 1

    // 从前往后找第一个不同的位置
    while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) {
      start++
    }

    // 从后往前找最后一个不同的位置
    let oldEnd = oldText.length - 1
    let newEnd = newText.length - 1
    while (oldEnd >= start && newEnd >= start && oldText[oldEnd] === newText[newEnd]) {
      oldEnd--
      newEnd--
    }

    // 如果 start > end，说明内容相同
    if (start > oldEnd && start > newEnd) {
      return null
    }

    // 构建差异信息
    const diffs: Array<{
      type: 'insert' | 'delete' | 'replace'
      start: number
      end: number
      newText: string
    }> = []

    const oldChanged = oldText.substring(start, oldEnd + 1)
    const newChanged = newText.substring(start, newEnd + 1)

    if (oldChanged.length === 0) {
      // 纯插入
      diffs.push({
        type: 'insert',
        start,
        end: start,
        newText: newChanged
      })
    } else if (newChanged.length === 0) {
      // 纯删除
      diffs.push({
        type: 'delete',
        start,
        end: oldEnd,
        newText: ''
      })
    } else {
      // 替换
      diffs.push({
        type: 'replace',
        start,
        end: oldEnd,
        newText: newChanged
      })
    }

    return diffs.length > 0 ? diffs : null
  }

  /**
   * 检查文件是否正在被监听
   */
  isWatching(filePath: string): boolean {
    const normalizedPath = path.normalize(filePath)
    return this.watchers.has(normalizedPath)
  }

  /**
   * 获取所有正在监听的文件路径
   */
  getWatchedFiles(): string[] {
    return Array.from(this.watchers.keys())
  }

  /**
   * 启用/禁用文件监听
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled
    if (!enabled) {
      this.unwatchAll()
    }
    logger.info('文件监听服务状态变更', { enabled })
  }

  /**
   * 更新标签页 ID（当标签页 ID 变化时）
   */
  updateTabId(filePath: string, tabId: string): void {
    const normalizedPath = path.normalize(filePath)
    const info = this.watchers.get(normalizedPath)
    if (info) {
      info.tabId = tabId
      logger.debug('更新文件监听的标签页 ID', { filePath: normalizedPath, tabId })
    }
  }
}

// 导出单例
export const fileWatcherService = new FileWatcherService()
