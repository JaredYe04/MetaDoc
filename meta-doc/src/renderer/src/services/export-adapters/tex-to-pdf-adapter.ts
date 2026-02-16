import { BaseExportAdapter } from './base-adapter'
import type { PdfExportOptions, ExportOptionField } from './types'
import type { DocumentFormat, ExportFormat } from '../../../../types'

/**
 * LaTeX -> PDF 导出适配器
 * 注意：这个适配器使用LaTeX编译，与MD->PDF的HTML转换方式不同
 */
export class TexToPdfAdapter extends BaseExportAdapter<'tex', 'pdf', PdfExportOptions> {
  sourceFormat: 'tex' = 'tex'
  targetFormat: 'pdf' = 'pdf'
  id = 'tex-to-pdf'
  name = 'LaTeX to PDF'
  nameKey = 'export.adapters.texToPdf.name'
  description = 'Export LaTeX document to PDF format (via compilation)'
  descriptionKey = 'export.adapters.texToPdf.description'

  getDefaultOptions(): PdfExportOptions {
    return {
      margins: {
        top: 1, // LaTeX默认边距通常较大
        bottom: 1,
        left: 1,
        right: 1
      },
      pageSize: 'A4',
      printBackground: true,
      colorMode: 'color' // LaTeX编译的PDF可以是彩色或灰度
    }
  }

  getOptionFields(): ExportOptionField[] {
    return [
      {
        key: 'pageSize',
        label: '纸张大小',
        labelKey: 'export.options.pageSize.label',
        type: 'select',
        default: 'A4',
        description: '选择PDF的纸张大小（需要在LaTeX文档类中配置）',
        descriptionKey: 'export.options.pageSize.descriptionTex',
        options: [
          { label: 'A4', value: 'A4', labelKey: 'export.options.pageSize.a4' },
          { label: 'A3', value: 'A3', labelKey: 'export.options.pageSize.a3' },
          { label: 'A5', value: 'A5', labelKey: 'export.options.pageSize.a5' },
          { label: 'B5', value: 'B5', labelKey: 'export.options.pageSize.b5' },
          { label: 'Letter', value: 'Letter', labelKey: 'export.options.pageSize.letter' },
          { label: 'Legal', value: 'Legal', labelKey: 'export.options.pageSize.legal' }
        ]
      },
      {
        key: 'colorMode',
        label: '颜色模式',
        labelKey: 'export.options.colorMode.label',
        type: 'select',
        default: 'color',
        description: 'PDF的颜色模式（彩色或灰度）',
        descriptionKey: 'export.options.colorMode.description',
        options: [
          { label: '彩色', value: 'color', labelKey: 'export.options.colorMode.color' },
          { label: '灰度', value: 'grayscale', labelKey: 'export.options.colorMode.grayscale' }
        ]
      },
      {
        key: 'margins',
        label: '页边距',
        labelKey: 'export.options.margins.label',
        type: 'object',
        default: { top: 1, bottom: 1, left: 1, right: 1 },
        description: 'PDF页边距设置（注意：LaTeX边距需要在文档中配置）',
        descriptionKey: 'export.options.margins.descriptionTex',
        fields: [
          {
            key: 'margins.top',
            label: '上边距（英寸）',
            labelKey: 'export.options.marginTop.label',
            type: 'number',
            default: 1,
            min: 0,
            max: 5,
            step: 0.1,
            description: 'PDF上边距，单位：英寸（注意：LaTeX边距需要在文档中配置）',
            descriptionKey: 'export.options.marginTop.descriptionTex'
          },
          {
            key: 'margins.bottom',
            label: '下边距（英寸）',
            labelKey: 'export.options.marginBottom.label',
            type: 'number',
            default: 1,
            min: 0,
            max: 5,
            step: 0.1,
            description: 'PDF下边距，单位：英寸',
            descriptionKey: 'export.options.marginBottom.description'
          },
          {
            key: 'margins.left',
            label: '左边距（英寸）',
            labelKey: 'export.options.marginLeft.label',
            type: 'number',
            default: 1,
            min: 0,
            max: 5,
            step: 0.1,
            description: 'PDF左边距，单位：英寸',
            descriptionKey: 'export.options.marginLeft.description'
          },
          {
            key: 'margins.right',
            label: '右边距（英寸）',
            labelKey: 'export.options.marginRight.label',
            type: 'number',
            default: 1,
            min: 0,
            max: 5,
            step: 0.1,
            description: 'PDF右边距，单位：英寸',
            descriptionKey: 'export.options.marginRight.description'
          }
        ]
      }
    ]
  }

  validateOptions(options: Partial<PdfExportOptions>): { valid: boolean; error?: string } {
    if (options.margins) {
      const margins = options.margins
      if (margins.top < 0 || margins.bottom < 0 || margins.left < 0 || margins.right < 0) {
        return { valid: false, error: '边距不能为负数' }
      }
      if (margins.top > 5 || margins.bottom > 5 || margins.left > 5 || margins.right > 5) {
        return { valid: false, error: '边距不能超过5英寸' }
      }
    }
    return { valid: true }
  }

  async prepareExportData(
    data: { md: string; json: string; tex: string },
    options: PdfExportOptions,
    context?: any
  ): Promise<{
    md: string
    json: string
    tex: string
    html?: string
    imageUrls?: string[]
  }> {
    // LaTeX导出PDF不需要HTML，只需要tex内容
    return {
      ...data
    }
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
    options: PdfExportOptions,
    context?: any
  ): Promise<void> {
    throw new Error('executeExport should be called in main process')
  }
}
