import { BaseExportAdapter } from './base-adapter';
import type { PdfExportOptions, ExportOptionField } from './types';
import type { DocumentFormat, ExportFormat } from '../../../../types';

/**
 * Markdown -> PDF 导出适配器
 */
export class MdToPdfAdapter extends BaseExportAdapter<'md', 'pdf', PdfExportOptions> {
  sourceFormat: 'md' = 'md';
  targetFormat: 'pdf' = 'pdf';
  id = 'md-to-pdf';
  name = 'Markdown to PDF';
  nameKey = 'export.adapters.mdToPdf.name';
  description = 'Export Markdown document to PDF format';
  descriptionKey = 'export.adapters.mdToPdf.description';
  
  getDefaultOptions(): PdfExportOptions {
    return {
      margins: {
        top: 0.5,    // 0.5 英寸 (1.27cm)
        bottom: 0.5, // 0.5 英寸 (1.27cm)
        left: 0.5,   // 0.5 英寸 (1.27cm)
        right: 0.5,  // 0.5 英寸 (1.27cm)
      },
      pageSize: 'A4',
      printBackground: true,
    };
  }
  
  getOptionFields(): ExportOptionField[] {
    return [
      {
        key: 'pageSize',
        label: '纸张大小',
        labelKey: 'export.options.pageSize.label',
        type: 'select',
        default: 'A4',
        description: '选择PDF的纸张大小',
        descriptionKey: 'export.options.pageSize.description',
        options: [
          { label: 'A4', value: 'A4', labelKey: 'export.options.pageSize.a4' },
          { label: 'A3', value: 'A3', labelKey: 'export.options.pageSize.a3' },
          { label: 'A5', value: 'A5', labelKey: 'export.options.pageSize.a5' },
          { label: 'B5', value: 'B5', labelKey: 'export.options.pageSize.b5' },
          { label: 'Letter', value: 'Letter', labelKey: 'export.options.pageSize.letter' },
          { label: 'Legal', value: 'Legal', labelKey: 'export.options.pageSize.legal' },
        ],
      },
      {
        key: 'margins',
        label: '页边距',
        labelKey: 'export.options.margins.label',
        type: 'object',
        default: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
        description: 'PDF页边距设置',
        descriptionKey: 'export.options.margins.description',
        fields: [
          {
            key: 'margins.top',
            label: '上边距（英寸）',
            labelKey: 'export.options.marginTop.label',
            type: 'number',
            default: 0.5,
            min: 0,
            max: 5,
            step: 0.1,
            description: 'PDF上边距，单位：英寸',
            descriptionKey: 'export.options.marginTop.description',
          },
          {
            key: 'margins.bottom',
            label: '下边距（英寸）',
            labelKey: 'export.options.marginBottom.label',
            type: 'number',
            default: 0.5,
            min: 0,
            max: 5,
            step: 0.1,
            description: 'PDF下边距，单位：英寸',
            descriptionKey: 'export.options.marginBottom.description',
          },
          {
            key: 'margins.left',
            label: '左边距（英寸）',
            labelKey: 'export.options.marginLeft.label',
            type: 'number',
            default: 0.5,
            min: 0,
            max: 5,
            step: 0.1,
            description: 'PDF左边距，单位：英寸',
            descriptionKey: 'export.options.marginLeft.description',
          },
          {
            key: 'margins.right',
            label: '右边距（英寸）',
            labelKey: 'export.options.marginRight.label',
            type: 'number',
            default: 0.5,
            min: 0,
            max: 5,
            step: 0.1,
            description: 'PDF右边距，单位：英寸',
            descriptionKey: 'export.options.marginRight.description',
          },
        ],
      },
      {
        key: 'printBackground',
        label: '打印背景',
        labelKey: 'export.options.printBackground.label',
        type: 'boolean',
        default: true,
        description: '是否在PDF中包含背景颜色和图片',
        descriptionKey: 'export.options.printBackground.description',
      },
    ];
  }
  
  validateOptions(options: Partial<PdfExportOptions>): { valid: boolean; error?: string } {
    if (options.margins) {
      const margins = options.margins;
      if (margins.top < 0 || margins.bottom < 0 || margins.left < 0 || margins.right < 0) {
        return { valid: false, error: '边距不能为负数' };
      }
      if (margins.top > 5 || margins.bottom > 5 || margins.left > 5 || margins.right > 5) {
        return { valid: false, error: '边距不能超过5英寸' };
      }
    }
    return { valid: true };
  }
  
  async prepareExportData(
    data: { md: string; json: string; tex: string },
    options: PdfExportOptions,
    context?: any
  ): Promise<{
    md: string;
    json: string;
    tex: string;
    html?: string;
    imageUrls?: string[];
  }> {
    // 这个适配器使用通用的Markdown导出准备逻辑
    // 实际的准备逻辑在重构后的export-manager中处理
    // 这里只返回原始数据，具体的转换由export-manager协调
    return {
      ...data,
      // html 和 imageUrls 会在export-manager中填充
    };
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
    options: PdfExportOptions,
    context?: any
  ): Promise<void> {
    // 这个方法的实际实现在main进程中
    // 这里只是接口定义，实际调用会通过IPC传递到main进程
    throw new Error('executeExport should be called in main process');
  }
}

