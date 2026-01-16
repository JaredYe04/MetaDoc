/**
 * 剪贴板服务
 * 管理文件系统操作的剪贴板状态（复制/剪切意图）
 */

import type { ClipboardPayload, URI } from './fs-models'

/**
 * 剪贴板服务（单例）
 */
export class ClipboardService {
  private static instance: ClipboardService | null = null
  private payload: ClipboardPayload | null = null

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): ClipboardService {
    if (!ClipboardService.instance) {
      ClipboardService.instance = new ClipboardService()
    }
    return ClipboardService.instance
  }

  /**
   * 设置剪贴板内容（复制）
   */
  setCopy(uris: URI[]): void {
    if (uris.length === 0) {
      this.clear()
      return
    }
    this.payload = {
      sources: uris,
      type: 'copy'
    }
  }

  /**
   * 设置剪贴板内容（剪切）
   */
  setCut(uris: URI[]): void {
    if (uris.length === 0) {
      this.clear()
      return
    }
    this.payload = {
      sources: uris,
      type: 'cut'
    }
  }

  /**
   * 获取剪贴板内容
   */
  getPayload(): ClipboardPayload | null {
    return this.payload
  }

  /**
   * 检查剪贴板是否有内容
   */
  hasContent(): boolean {
    return this.payload !== null && this.payload.sources.length > 0
  }

  /**
   * 获取剪贴板操作类型
   */
  getOperationType(): 'copy' | 'cut' | null {
    return this.payload?.type || null
  }

  /**
   * 获取剪贴板源 URI 列表
   */
  getSources(): URI[] {
    return this.payload?.sources || []
  }

  /**
   * 清空剪贴板
   */
  clear(): void {
    this.payload = null
  }

  /**
   * 执行粘贴后，如果是剪切操作，清空剪贴板
   */
  onPasteComplete(wasCut: boolean): void {
    if (wasCut) {
      this.clear()
    }
  }
}

