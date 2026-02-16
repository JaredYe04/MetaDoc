import { BaseExportAdapter } from './base-adapter'
import type { MarkdownExportOptions, ExportOptionField } from './types'

/**
 * Markdown -> Markdown 导出适配器
 */
export class MdToMdAdapter extends BaseExportAdapter<'md', 'md', MarkdownExportOptions> {
  sourceFormat: 'md' = 'md'
  targetFormat: 'md' = 'md'
  id = 'md-to-md'
  name = 'Markdown to Markdown'
  nameKey = 'export.adapters.mdToMd.name'

  getDefaultOptions(): MarkdownExportOptions {
    return {
      includeMetadata: true,
      imageProcessing: 'original' // 默认保留原始链接
    }
  }

  getOptionFields(): ExportOptionField[] {
    return [
      {
        key: 'includeMetadata',
        label: '包含元数据',
        labelKey: 'export.options.includeMetadata.label',
        type: 'boolean',
        default: true,
        description: '是否在导出的Markdown中包含文档元数据',
        descriptionKey: 'export.options.includeMetadata.description'
      },
      {
        key: 'imageProcessing',
        label: '图片处理方式',
        labelKey: 'export.options.imageProcessing.label',
        type: 'select',
        default: 'original',
        description: '选择图片的处理方式：保留原始链接、Base64嵌入或保存到文件夹',
        descriptionKey: 'export.options.imageProcessing.description',
        options: [
          {
            label: '保留原始链接',
            value: 'original',
            labelKey: 'export.options.imageProcessing.original'
          },
          {
            label: 'Base64嵌入',
            value: 'base64',
            labelKey: 'export.options.imageProcessing.base64'
          },
          {
            label: '保存到文件夹',
            value: 'folder',
            labelKey: 'export.options.imageProcessing.folder'
          }
        ]
      }
    ]
  }

  async prepareExportData(
    data: { md: string; json: string; tex: string },
    options: MarkdownExportOptions,
    context?: any
  ): Promise<{
    md: string
    json: string
    tex: string
    html?: string
    imageUrls?: string[]
  }> {
    return { ...data }
  }

  async executeExport(
    preparedData: {
      md: string
      json: string
      tex: string
      html?: string
      imageUrls?: string[]
    },
    targetPath: string,
    options: MarkdownExportOptions,
    context?: any
  ): Promise<void> {
    throw new Error('executeExport should be called in main process')
  }
}
