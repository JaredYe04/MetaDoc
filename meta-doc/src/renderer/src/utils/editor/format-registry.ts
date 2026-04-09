/**
 * 格式注册系统 - 支持插件式的文档格式扩展
 */

import type { Component } from 'vue'
import type { DocumentOutlineNode } from '../../../types'
import type { OutlineTextAdapter } from '../outline/outline-adapters'

/**
 * 格式检测函数，返回检测到的格式ID或null
 */
export type FormatDetector = (content: string, filePath?: string) => string | null

/**
 * 文件扩展名到格式ID的映射
 */
export interface ExtensionMapping {
  extensions: string[] // 例如 ['.txt', '.text']
  formatId: string
}

/**
 * 格式配置接口
 */
export interface FormatConfig {
  /** 格式ID，唯一标识符 */
  id: string
  /** 显示名称 */
  label: string
  /** 国际化key */
  labelKey?: string
  /** 描述 */
  description?: string
  /** 国际化key */
  descriptionKey?: string
  /** 文件扩展名列表 */
  extensions: string[]
  /** 默认文件扩展名（用于新建文件） */
  defaultExtension: string
  /** Monaco编辑器语言ID（用于语法高亮） */
  monacoLanguage?: string
  /** 是否支持元信息（meta） */
  supportsMetadata?: boolean
  /** 是否支持大纲（outline） */
  supportsOutline?: boolean
  /** 是否支持AI补全 */
  supportsAiCompletion?: boolean
  /** 默认模板ID */
  defaultTemplateId?: string
  /** 编辑器组件 */
  editorComponent?: Component
  /** 预览组件（用于Home视图） */
  previewComponent?: Component
  /** 内容适配器（用于内容转换） */
  contentAdapter?: {
    /** 转换为Markdown（用于预览、导出等） */
    toMarkdown?: (content: string) => string
    /** 从Markdown转换 */
    fromMarkdown?: (markdown: string) => string
  }
  /** 大纲适配器 */
  outlineAdapter?: OutlineTextAdapter
  /** 格式检测函数 */
  detector?: FormatDetector
}

/**
 * 格式注册表
 */
class FormatRegistry {
  private formats = new Map<string, FormatConfig>()
  private extensionMap = new Map<string, string>() // extension -> formatId

  /**
   * 注册一个文档格式
   */
  register(config: FormatConfig): void {
    if (this.formats.has(config.id)) {
      console.warn(`格式 ${config.id} 已存在，将被覆盖`)
    }

    // 验证必需字段
    if (!config.id || !config.extensions || config.extensions.length === 0) {
      throw new Error(`格式配置无效: ${config.id} 缺少必需字段`)
    }

    this.formats.set(config.id, config)

    // 建立扩展名映射
    for (const ext of config.extensions) {
      const normalizedExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
      // 如果扩展名已存在，记录警告但允许覆盖（后注册的优先）
      if (
        this.extensionMap.has(normalizedExt) &&
        this.extensionMap.get(normalizedExt) !== config.id
      ) {
        console.warn(
          `扩展名 ${normalizedExt} 已映射到 ${this.extensionMap.get(normalizedExt)}，将被重新映射到 ${config.id}`
        )
      }
      this.extensionMap.set(normalizedExt, config.id)
    }
  }

  /**
   * 获取格式配置
   */
  getFormat(formatId: string): FormatConfig | undefined {
    return this.formats.get(formatId)
  }

  /**
   * 获取所有已注册的格式
   */
  getAllFormats(): FormatConfig[] {
    return Array.from(this.formats.values())
  }

  /**
   * 根据文件扩展名获取格式ID
   */
  getFormatByExtension(extension: string): string | null {
    const normalizedExt = extension.startsWith('.')
      ? extension.toLowerCase()
      : `.${extension.toLowerCase()}`
    return this.extensionMap.get(normalizedExt) || null
  }

  /**
   * 获取扩展名映射表（用于传递给 Worker）
   */
  getExtensionMap(): Map<string, string> {
    return new Map(this.extensionMap)
  }

  /**
   * 检测文档格式（仅通过扩展名，不读取文件内容）
   * 注意：此函数不再进行内容检测，只通过文件扩展名判断格式，避免读取文件内容造成开销
   */
  detectFormat(content: string, filePath?: string): string | null {
    // 优先尝试基于文件路径检测（最快，不需要内容检测）
    if (filePath) {
      // 使用简单的字符串操作获取扩展名
      const lastDotIndex = filePath.lastIndexOf('.')
      const lastSlashIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
      if (lastDotIndex > lastSlashIndex) {
        const ext = filePath.substring(lastDotIndex).toLowerCase()
        const formatId = this.getFormatByExtension(ext)
        if (formatId) {
          // 如果通过扩展名找到了格式，直接返回
          return formatId
        }
      }
      // 没有扩展名或扩展名无法确定格式，默认当作纯文本
      return 'txt'
    }

    // 如果没有文件路径，无法通过扩展名检测，默认返回纯文本
    // 不再进行内容检测，避免读取文件内容造成开销
    return 'txt'
  }

  /**
   * 检查格式是否存在
   */
  hasFormat(formatId: string): boolean {
    return this.formats.has(formatId)
  }

  /**
   * 卸载格式（用于动态移除）
   */
  unregister(formatId: string): boolean {
    const format = this.formats.get(formatId)
    if (!format) {
      return false
    }

    // 移除扩展名映射
    for (const ext of format.extensions) {
      const normalizedExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
      if (this.extensionMap.get(normalizedExt) === formatId) {
        this.extensionMap.delete(normalizedExt)
      }
    }

    return this.formats.delete(formatId)
  }

  /**
   * 获取支持元信息的格式列表
   */
  getFormatsWithMetadata(): FormatConfig[] {
    return Array.from(this.formats.values()).filter((f) => f.supportsMetadata !== false)
  }

  /**
   * 获取支持大纲的格式列表
   */
  getFormatsWithOutline(): FormatConfig[] {
    return Array.from(this.formats.values()).filter((f) => f.supportsOutline !== false)
  }
}

// 导出单例
export const formatRegistry = new FormatRegistry()
