/**
 * 刷新服务
 * 负责管理目录刷新逻辑，支持 diff refresh
 */

import type { URI } from './fs-models'
import { URIUtils } from './fs-models'
import { createRendererLogger } from '../logger'

const logger = createRendererLogger('RefreshService')

/**
 * 刷新服务
 */
export class RefreshService {
  private ipcRenderer: any
  private refreshDebounceTimers: Map<URI, NodeJS.Timeout> = new Map()
  private readonly DEBOUNCE_DELAY = 300 // 防抖延迟（毫秒）

  constructor(ipcRenderer: any) {
    this.ipcRenderer = ipcRenderer
  }

  /**
   * 刷新目录（带防抖）
   */
  async refreshDirectory(dirURI: URI, onRefresh: (dirURI: URI) => Promise<void>): Promise<void> {
    // 清除之前的定时器
    const existingTimer = this.refreshDebounceTimers.get(dirURI)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // 设置新的防抖定时器
    const timer = setTimeout(async () => {
      try {
        await onRefresh(dirURI)
      } catch (err) {
        logger.error('刷新目录失败:', { dirURI, error: err })
      } finally {
        this.refreshDebounceTimers.delete(dirURI)
      }
    }, this.DEBOUNCE_DELAY)

    this.refreshDebounceTimers.set(dirURI, timer)
  }

  /**
   * 立即刷新目录（不使用防抖）
   */
  async refreshDirectoryImmediate(
    dirURI: URI,
    onRefresh: (dirURI: URI) => Promise<void>
  ): Promise<void> {
    // 清除防抖定时器
    const existingTimer = this.refreshDebounceTimers.get(dirURI)
    if (existingTimer) {
      clearTimeout(existingTimer)
      this.refreshDebounceTimers.delete(dirURI)
    }

    // 立即执行刷新
    await onRefresh(dirURI)
  }

  /**
   * 取消所有待执行的刷新
   */
  cancelAll(): void {
    for (const timer of this.refreshDebounceTimers.values()) {
      clearTimeout(timer)
    }
    this.refreshDebounceTimers.clear()
  }

  /**
   * 处理目录变化事件（来自文件系统监听）
   */
  async handleDirectoryChange(
    dirPath: string,
    eventType: string,
    filePath: string,
    expandedURIs: Set<URI>,
    onRefresh: (dirURI: URI) => Promise<void>
  ): Promise<void> {
    const dirURI = URIUtils.pathToURI(dirPath)

    // 只刷新已展开的目录
    if (!expandedURIs.has(dirURI)) {
      return
    }

    logger.debug('目录变化', { dirPath, eventType, filePath })

    // 使用防抖刷新
    await this.refreshDirectory(dirURI, onRefresh)
  }
}
