import type { DocumentFormat, ExportFormat } from '../../../types';

/**
 * 导出选项的基础接口
 * 每个适配器可以定义自己的选项类型
 */
export interface BaseExportOptions {
  [key: string]: any;
}

/**
 * PDF导出选项
 */
export interface PdfExportOptions extends BaseExportOptions {
  // 页边距（英寸）
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  // 纸张大小
  pageSize: 'A4' | 'A3' | 'Letter' | 'Legal' | 'A5' | 'B5';
  // 是否打印背景
  printBackground: boolean;
  // 是否彩色（对于LaTeX编译的PDF）
  colorMode?: 'color' | 'grayscale';
}

/**
 * DOCX导出选项
 */
export interface DocxExportOptions extends BaseExportOptions {
  // 是否启用格式绑定（样式映射）
  enableStyleMapping: boolean;
  // 样式映射配置
  styleMapping?: {
    // 正文样式
    normal: {
      fontFamily: string;
      fontSize: number; // pt
      lineHeight: number;
    };
    // 标题样式
    heading1: {
      fontFamily: string;
      fontSize: number; // pt
      lineHeight: number;
    };
    heading2: {
      fontFamily: string;
      fontSize: number; // pt
      lineHeight: number;
    };
    heading3: {
      fontFamily: string;
      fontSize: number; // pt
      lineHeight: number;
    };
    heading4: {
      fontFamily: string;
      fontSize: number; // pt
      lineHeight: number;
    };
  };
  // 是否生成封面
  generateCover?: boolean;
  // 是否生成目录
  generateToc?: boolean;
  // 是否处理公式
  processFormula?: boolean;
  // 是否显示页码
  showPageNumbers?: boolean;
  // 是否显示页眉
  showHeader?: boolean;
}

/**
 * HTML导出选项
 */
export interface HtmlExportOptions extends BaseExportOptions {
  // 是否内联CSS
  inlineStyles: boolean;
  // 图片处理方式：original（保留原始链接）、base64（Base64嵌入）、folder（保存到文件夹）
  imageProcessing: 'original' | 'base64' | 'folder';
}

/**
 * Markdown导出选项
 */
export interface MarkdownExportOptions extends BaseExportOptions {
  // 是否保留元数据
  includeMetadata: boolean;
  // 图片处理方式：original（保留原始链接）、base64（Base64嵌入）、folder（保存到文件夹）
  imageProcessing: 'original' | 'base64' | 'folder';
}

/**
 * LaTeX导出选项
 */
export interface LatexExportOptions extends BaseExportOptions {
  // 文档类
  documentClass: string;
  // 是否包含包
  includePackages: boolean;
  // 图片处理方式：original（保留原始链接）、folder（保存到文件夹）
  imageProcessing: 'original' | 'folder';
  // 是否生成封面
  generateCover?: boolean;
  // 是否生成目录
  generateToc?: boolean;
  // 是否处理公式
  processFormula?: boolean;
  // 是否显示页码
  showPageNumbers?: boolean;
  // 是否显示页眉
  showHeader?: boolean;
}

/**
 * 导出选项的联合类型
 */
export type ExportOptions = 
  | PdfExportOptions 
  | DocxExportOptions 
  | HtmlExportOptions 
  | MarkdownExportOptions 
  | LatexExportOptions
  | BaseExportOptions;

/**
 * 导出选项字段定义
 * 用于动态生成UI
 */
export interface ExportOptionField {
  key: string;
  label: string;
  labelKey?: string; // i18n key
  type: 'number' | 'string' | 'boolean' | 'select' | 'object' | 'font' | 'fontSize';
  default: any;
  description?: string;
  descriptionKey?: string; // i18n key
  // 对于select类型
  options?: Array<{ label: string; value: any; labelKey?: string }>;
  // 对于number类型
  min?: number;
  max?: number;
  step?: number;
  // 对于object类型，定义子字段
  fields?: ExportOptionField[];
  // 是否显示（基于其他字段的值）
  showWhen?: (options: any) => boolean;
  // 所属的 tab 分组（用于UI分组显示）
  tab?: string;
}

/**
 * 导出适配器接口
 */
export interface ExportAdapter<
  TSourceFormat extends DocumentFormat = DocumentFormat,
  TTargetFormat extends ExportFormat = ExportFormat,
  TOptions extends ExportOptions = ExportOptions
> {
  /** 源格式 */
  sourceFormat: TSourceFormat;
  /** 目标格式 */
  targetFormat: TTargetFormat;
  /** 适配器唯一标识 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 显示名称的i18n key */
  nameKey?: string;
  /** 描述 */
  description?: string;
  /** 描述的i18n key */
  descriptionKey?: string;
  
  /** 获取默认导出选项 */
  getDefaultOptions(): TOptions;
  
  /** 获取导出选项字段定义（用于生成UI） */
  getOptionFields(): ExportOptionField[];
  
  /** 验证导出选项 */
  validateOptions(options: Partial<TOptions>): { valid: boolean; error?: string };
  
  /** 准备导出数据（在renderer进程中执行） */
  prepareExportData(
    data: {
      md: string;
      json: string;
      tex: string;
    },
    options: TOptions,
    context?: any
  ): Promise<{
    md: string;
    json: string;
    tex: string;
    html?: string;
    imageUrls?: string[];
  }>;
  
  /** 执行导出（在main进程中执行） */
  executeExport(
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
}

/**
 * 导出适配器注册表
 */
export class ExportAdapterRegistry {
  private adapters = new Map<string, ExportAdapter>();
  
  /**
   * 注册适配器
   */
  register(adapter: ExportAdapter): void {
    const key = this.getAdapterKey(adapter.sourceFormat, adapter.targetFormat);
    this.adapters.set(key, adapter);
  }
  
  /**
   * 获取适配器
   */
  get(sourceFormat: DocumentFormat, targetFormat: ExportFormat): ExportAdapter | undefined {
    const key = this.getAdapterKey(sourceFormat, targetFormat);
    return this.adapters.get(key);
  }
  
  /**
   * 获取所有适配器
   */
  getAll(): ExportAdapter[] {
    return Array.from(this.adapters.values());
  }
  
  /**
   * 获取指定源格式的所有适配器
   */
  getBySourceFormat(sourceFormat: DocumentFormat): ExportAdapter[] {
    return this.getAll().filter(a => a.sourceFormat === sourceFormat);
  }
  
  /**
   * 获取适配器键
   */
  private getAdapterKey(sourceFormat: DocumentFormat, targetFormat: ExportFormat): string {
    return `${sourceFormat}->${targetFormat}`;
  }
}

// 全局适配器注册表实例
export const exportAdapterRegistry = new ExportAdapterRegistry();

