import type {
  ExportAdapter,
  ExportOptions,
  ExportOptionField,
  DocumentFormat,
  ExportFormat,
} from './types';

/**
 * 导出适配器基类
 * 提供通用功能
 */
export abstract class BaseExportAdapter<
  TSourceFormat extends DocumentFormat,
  TTargetFormat extends ExportFormat,
  TOptions extends ExportOptions
> implements ExportAdapter<TSourceFormat, TTargetFormat, TOptions> {
  abstract sourceFormat: TSourceFormat;
  abstract targetFormat: TTargetFormat;
  abstract id: string;
  abstract name: string;
  nameKey?: string;
  description?: string;
  descriptionKey?: string;
  
  abstract getDefaultOptions(): TOptions;
  abstract getOptionFields(): ExportOptionField[];
  
  /**
   * 默认验证实现
   */
  validateOptions(options: Partial<TOptions>): { valid: boolean; error?: string } {
    // 子类可以覆盖此方法
    return { valid: true };
  }
  
  abstract prepareExportData(
    data: { md: string; json: string; tex: string },
    options: TOptions,
    context?: any
  ): Promise<{
    md: string;
    json: string;
    tex: string;
    html?: string;
    imageUrls?: string[];
  }>;
  
  abstract executeExport(
    preparedData: {
      md: string;
      json: string;
      tex: string;
      html?: string;
      imageUrls?: string[];
    },
    targetPath: string,
    options: TOptions,
    context?: any
  ): Promise<void>;
  
  /**
   * 合并选项，使用默认值填充缺失的字段
   */
  mergeOptions(userOptions: Partial<TOptions>): TOptions {
    const defaults = this.getDefaultOptions();
    return { ...defaults, ...userOptions } as TOptions;
  }
}

