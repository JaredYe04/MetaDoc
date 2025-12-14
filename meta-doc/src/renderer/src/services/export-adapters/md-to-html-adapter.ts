import { BaseExportAdapter } from './base-adapter';
import type { HtmlExportOptions, ExportOptionField } from './types';

/**
 * Markdown -> HTML 导出适配器
 */
export class MdToHtmlAdapter extends BaseExportAdapter<'md', 'html', HtmlExportOptions> {
  sourceFormat: 'md' = 'md';
  targetFormat: 'html' = 'html';
  id = 'md-to-html';
  name = 'Markdown to HTML';
  nameKey = 'export.adapters.mdToHtml.name';
  
  getDefaultOptions(): HtmlExportOptions {
    return {
      inlineStyles: true,
      imageProcessing: 'original', // 默认保留原始链接
    };
  }
  
  getOptionFields(): ExportOptionField[] {
    return [
      {
        key: 'inlineStyles',
        label: '内联CSS',
        labelKey: 'export.options.inlineStyles.label',
        type: 'boolean',
        default: true,
        description: '是否将CSS样式内联到HTML中',
        descriptionKey: 'export.options.inlineStyles.description',
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
          { label: '保留原始链接', value: 'original', labelKey: 'export.options.imageProcessing.original' },
          { label: 'Base64嵌入', value: 'base64', labelKey: 'export.options.imageProcessing.base64' },
          { label: '保存到文件夹', value: 'folder', labelKey: 'export.options.imageProcessing.folder' },
        ],
      },
    ];
  }
  
  async prepareExportData(
    data: { md: string; json: string; tex: string },
    options: HtmlExportOptions,
    context?: any
  ): Promise<{
    md: string;
    json: string;
    tex: string;
    html?: string;
    imageUrls?: string[];
  }> {
    return { ...data };
  }
  
  async executeExport(
    preparedData: {
      md: string;
      json: string;
      tex: string;
      html?: string;
      imageUrls?: string[];
    },
    targetPath: string,
    options: HtmlExportOptions,
    context?: any
  ): Promise<void> {
    throw new Error('executeExport should be called in main process');
  }
}

