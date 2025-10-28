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
  dump2json,
  dump2md, 
  dump2tex,
  load_from_json,
  load_from_md,
  load_from_tex,
  sync
} from '../utils/common-data'
import eventBus from '../utils/event-bus'

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
      // 根据格式加载文档
      switch (format) {
        case 'json':
          load_from_json(content)
          break
        case 'md':
          load_from_md(content)
          break
        case 'tex':
          load_from_tex(content)
          break
        default:
          throw new Error(`不支持的文件格式: ${format}`)
      }

      // 更新文件路径
      if (filePath) {
        current_file_path.value = filePath
      }

      eventBus.emit('open-doc-success')
      eventBus.emit('is-need-save', false)
    } catch (error) {
      console.error('文档加载失败:', error)
      eventBus.emit('show-error', `文档加载失败: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  /**
   * 保存文档
   */
  static async saveDocument(options: SaveOptions = {}): Promise<void> {
    try {
      // 同步数据
      sync()

      // 准备保存数据
      const saveData = {
        json: dump2json(),
        md: dump2md(),
        tex: current_format.value === 'tex' 
          ? dump2tex() 
          : this.convertMarkdownToLatex(current_article.value),
        path: current_file_path.value,
        args: options
      }

      // 发送保存事件
      if (options.saveAs) {
        eventBus.emit('save-as', saveData.args)
      } else {
        eventBus.emit('save', 'manual', saveData.args)
      }

      eventBus.emit('is-need-save', false)
    } catch (error) {
      console.error('文档保存失败:', error)
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
      console.error('文档导出失败:', error)
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
      console.error('新建文档失败:', error)
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
      console.error('关闭文档失败:', error)
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
    console.warn('convertMarkdownToLatex 函数需要实现')
    return markdown
  }
}

// 导出服务实例（可选，如果需要单例模式）
export const documentService = new DocumentService()
