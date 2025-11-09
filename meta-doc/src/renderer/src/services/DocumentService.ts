/**
 * 文档服务层
 * 统一管理文档的加载、保存、导出等操作
 */
import type { 
  DocumentFormat, 
  ExportFormat, 
  ArticleMetaData, 
  DocumentOutlineNode,
  SaveOptions,
  ExportOptions
} from '../../../types'
import { 
  current_file_path,
  current_article,
  current_tex_article,
  current_article_meta_data,
  current_outline_tree,
  current_format,
  sync
} from '../utils/common-data'
import eventBus from '../utils/event-bus'
import { createRendererLogger } from '../utils/logger';
const logger = createRendererLogger('DocumentService');

/** 文档数据接口 */
export interface DocumentData {
  filePath: string
  format: DocumentFormat
  article: string
  texArticle?: string
  metaData: ArticleMetaData
  outlineTree: DocumentOutlineNode
}

/** 文档服务类 */
export class DocumentService {
  /**
   * 获取当前文档数据
   */
  static getCurrentDocument(): DocumentData {
    return {
      filePath: current_file_path.value,
      format: current_format.value as DocumentFormat,
      article: current_article.value,
      texArticle: current_tex_article.value,
      metaData: current_article_meta_data.value,
      outlineTree: current_outline_tree.value
    }
  }

  /**
   * 加载文档
   */
  static async loadDocument(content: string, format: DocumentFormat, filePath?: string): Promise<void> {
    try {
      eventBus.emit('workspace-open-document', {
        content,
        format,
        path: filePath ?? '',
      })
    } catch (error) {
      logger.error('文档加载失败:', error)
      eventBus.emit('show-error', `文档加载失败: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  /**
   * 保存文档
   */
  static async saveDocument(options: SaveOptions = {}): Promise<void> {
    try {
      // 发送保存事件
      if (options.saveAs) {
        eventBus.emit('save-as', options)
      } else {
        eventBus.emit('save', {
          mode: 'manual',
          args: options
        })
      }

      eventBus.emit('is-need-save', false)
    } catch (error) {
      logger.error('文档保存失败:', error)
      eventBus.emit('show-error', `文档保存失败: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  /**
   * 导出文档
   */
  static async exportDocument(options: ExportOptions): Promise<void> {
    try {
      // 同步数据
      sync()

      // 发送导出事件
      eventBus.emit('export', options)
    } catch (error) {
      logger.error('文档导出失败:', error)
      eventBus.emit('show-error', `文档导出失败: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  /**
   * 新建文档
   */
  static async createNewDocument(): Promise<void> {
    try {
      eventBus.emit('new-doc')
      eventBus.emit('is-need-save', false)
    } catch (error) {
      logger.error('新建文档失败:', error)
      eventBus.emit('show-error', `新建文档失败: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  /**
   * 关闭文档
   */
  static async closeDocument(): Promise<void> {
    try {
      eventBus.emit('close-doc')
      eventBus.emit('is-need-save', false)
    } catch (error) {
      logger.error('关闭文档失败:', error)
      eventBus.emit('show-error', `关闭文档失败: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  /**
   * 检查文档是否需要保存
   */
  static needsSaving(): boolean {
    // 这里可以实现更复杂的逻辑来检查文档是否被修改
    return current_file_path.value !== '' || current_article.value.trim() !== ''
  }

  /**
   * 获取文档统计信息
   */
  static getDocumentStats(): {
    characterCount: number
    wordCount: number
    lineCount: number
  } {
    const content = current_article.value
    return {
      characterCount: content.length,
      wordCount: content.split(/\s+/).filter(word => word.length > 0).length,
      lineCount: content.split('\n').length
    }
  }

  /**
   * 同步文档数据
   */
  static syncDocument(): void {
    sync()
  }

  /**
   * 转换 Markdown 到 LaTeX
   * @private
   */
  private static convertMarkdownToLatex(markdown: string): string {
    // 这里应该导入实际的转换函数
    // 为了保持向后兼容，暂时返回原内容
    logger.warn('convertMarkdownToLatex 函数需要实现')
    return markdown
  }
}

// 导出服务实例（可选，如果需要单例模式）
export const documentService = new DocumentService()
