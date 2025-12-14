import { BaseExportAdapter } from './base-adapter';
import type { LatexExportOptions, ExportOptionField } from './types';

/**
 * Markdown -> LaTeX 导出适配器
 */
export class MdToTexAdapter extends BaseExportAdapter<'md', 'tex', LatexExportOptions> {
  sourceFormat: 'md' = 'md';
  targetFormat: 'tex' = 'tex';
  id = 'md-to-tex';
  name = 'Markdown to LaTeX';
  nameKey = 'export.adapters.mdToTex.name';
  
  getDefaultOptions(): LatexExportOptions {
    return {
      documentClass: 'article',
      includePackages: true,
      imageProcessing: 'original', // 默认保留原始链接
    };
  }
  
  getOptionFields(): ExportOptionField[] {
    return [
      {
        key: 'documentClass',
        label: '文档类',
        labelKey: 'export.options.documentClass.label',
        type: 'select',
        default: 'article',
        description: 'LaTeX文档类',
        descriptionKey: 'export.options.documentClass.description',
        options: [
          { label: 'article', value: 'article' },
          { label: 'book', value: 'book' },
          { label: 'report', value: 'report' },
        ],
      },
      {
        key: 'includePackages',
        label: '包含常用包',
        labelKey: 'export.options.includePackages.label',
        type: 'boolean',
        default: true,
        description: '是否自动包含常用的LaTeX包',
        descriptionKey: 'export.options.includePackages.description',
      },
      {
        key: 'imageProcessing',
        label: '图片处理方式',
        labelKey: 'export.options.imageProcessing.label',
        type: 'select',
        default: 'original',
        description: '选择图片的处理方式：保留原始链接或保存到文件夹',
        descriptionKey: 'export.options.imageProcessing.description',
        options: [
          { label: '保留原始链接', value: 'original', labelKey: 'export.options.imageProcessing.original' },
          { label: '保存到文件夹', value: 'folder', labelKey: 'export.options.imageProcessing.folder' },
        ],
      },
    ];
  }
  
  async prepareExportData(
    data: { md: string; json: string; tex: string },
    options: LatexExportOptions,
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
    options: LatexExportOptions,
    context?: any
  ): Promise<void> {
    throw new Error('executeExport should be called in main process');
  }
}

