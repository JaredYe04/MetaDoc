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
import eventBus from '../utils/event-bus'
import { createRendererLogger } from '../utils/logger'
import { useWorkspace } from '../stores/workspace'
import { useDocumentStore } from '../stores/document'
import { DEFAULT_ARTICLE_META, DEFAULT_OUTLINE_TREE } from '../constants/document'

const logger = createRendererLogger('DocumentService')
const workspace = useWorkspace()
const documentStore = useDocumentStore()

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
    const doc = workspace.activeDocument.value
    if (!doc) {
      const meta = JSON.parse(JSON.stringify(DEFAULT_ARTICLE_META)) as ArticleMetaData
      const outline = JSON.parse(JSON.stringify(DEFAULT_OUTLINE_TREE)) as DocumentOutlineNode
      return {
        filePath: '',
        format: 'md',
        article: '',
        texArticle: '',
        metaData: meta,
        outlineTree: outline
      }
    }
    const meta = JSON.parse(JSON.stringify(doc.meta)) as ArticleMetaData
    const outline = JSON.parse(JSON.stringify(doc.outline)) as DocumentOutlineNode
    return {
      filePath: doc.path,
      format: doc.format as DocumentFormat,
      article: doc.markdown,
      texArticle: doc.tex,
      metaData: meta,
      outlineTree: outline
    }
  }

  /**
   * 加载文档
   */
  static async loadDocument(
    content: string,
    format: DocumentFormat,
    filePath?: string
  ): Promise<void> {
    try {
      eventBus.emit('workspace-open-document', {
        content,
        format,
        path: filePath ?? ''
      })
    } catch (error) {
      logger.error('文档加载失败:', error)
      eventBus.emit(
        'show-error',
        `文档加载失败: ${error instanceof Error ? error.message : String(error)}`
      )
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
      eventBus.emit(
        'show-error',
        `文档保存失败: ${error instanceof Error ? error.message : String(error)}`
      )
      throw error
    }
  }

  /**
   * 导出文档
   */
  static async exportDocument(options: ExportOptions): Promise<void> {
    try {
      // 同步数据
      documentStore.syncDocument()

      // 发送导出事件
      eventBus.emit('export', options)
    } catch (error) {
      logger.error('文档导出失败:', error)
      eventBus.emit(
        'show-error',
        `文档导出失败: ${error instanceof Error ? error.message : String(error)}`
      )
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
      eventBus.emit(
        'show-error',
        `新建文档失败: ${error instanceof Error ? error.message : String(error)}`
      )
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
      eventBus.emit(
        'show-error',
        `关闭文档失败: ${error instanceof Error ? error.message : String(error)}`
      )
      throw error
    }
  }

  /**
   * 检查文档是否需要保存
   */
  static needsSaving(): boolean {
    const doc = workspace.activeDocument.value
    return Boolean(doc?.dirty)
  }

  /**
   * 获取文档统计信息
   */
  static getDocumentStats(): {
    characterCount: number
    wordCount: number
    lineCount: number
  } {
    const content = workspace.activeDocument.value?.markdown ?? ''
    return {
      characterCount: content.length,
      wordCount: content.split(/\s+/).filter((word) => word.length > 0).length,
      lineCount: content.split('\n').length
    }
  }

  /**
   * 同步文档数据
   */
  static syncDocument(): void {
    logger.warn('DocumentService.syncDocument 已弃用；当前 workspace 会自动同步文档状态。')
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
