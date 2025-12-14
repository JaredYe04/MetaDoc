import { BaseExportAdapter } from './base-adapter';
import type { BaseExportOptions, ExportOptionField } from './types';

/**
 * LaTeX -> LaTeX 导出适配器
 */
export class TexToTexAdapter extends BaseExportAdapter<'tex', 'tex', BaseExportOptions> {
  sourceFormat: 'tex' = 'tex';
  targetFormat: 'tex' = 'tex';
  id = 'tex-to-tex';
  name = 'LaTeX to LaTeX';
  nameKey = 'export.adapters.texToTex.name';
  
  getDefaultOptions(): BaseExportOptions {
    return {};
  }
  
  getOptionFields(): ExportOptionField[] {
    return []; // LaTeX到LaTeX不需要选项
  }
  
  async prepareExportData(
    data: { md: string; json: string; tex: string },
    options: BaseExportOptions,
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
    options: BaseExportOptions,
    context?: any
  ): Promise<void> {
    throw new Error('executeExport should be called in main process');
  }
}

