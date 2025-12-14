/**
 * 导出选项的localStorage持久化
 */

import type { ExportOptions } from './types';
import type { DocumentFormat, ExportFormat } from '../../../types';

const STORAGE_PREFIX = 'export-options-';

/**
 * 获取存储键
 */
function getStorageKey(sourceFormat: DocumentFormat, targetFormat: ExportFormat): string {
  return `${STORAGE_PREFIX}${sourceFormat}-${targetFormat}`;
}

/**
 * 保存导出选项
 */
export function saveExportOptions(
  sourceFormat: DocumentFormat,
  targetFormat: ExportFormat,
  options: ExportOptions
): void {
  try {
    const key = getStorageKey(sourceFormat, targetFormat);
    const serialized = JSON.stringify(options);
    localStorage.setItem(key, serialized);
  } catch (error) {
    console.warn('Failed to save export options to localStorage:', error);
  }
}

/**
 * 加载导出选项
 */
export function loadExportOptions(
  sourceFormat: DocumentFormat,
  targetFormat: ExportFormat
): Partial<ExportOptions> | null {
  try {
    const key = getStorageKey(sourceFormat, targetFormat);
    const serialized = localStorage.getItem(key);
    if (!serialized) {
      return null;
    }
    return JSON.parse(serialized) as Partial<ExportOptions>;
  } catch (error) {
    console.warn('Failed to load export options from localStorage:', error);
    return null;
  }
}

/**
 * 清除导出选项
 */
export function clearExportOptions(
  sourceFormat: DocumentFormat,
  targetFormat: ExportFormat
): void {
  try {
    const key = getStorageKey(sourceFormat, targetFormat);
    localStorage.removeItem(key);
  } catch (error) {
    console.warn('Failed to clear export options from localStorage:', error);
  }
}

/**
 * 合并选项：将保存的选项与默认选项合并
 */
export function mergeExportOptions<T extends ExportOptions>(
  defaultOptions: T,
  savedOptions: Partial<T> | null
): T {
  if (!savedOptions) {
    return defaultOptions;
  }
  
  // 深度合并对象
  const merge = (target: any, source: any): any => {
    if (typeof source !== 'object' || source === null || Array.isArray(source)) {
      return source !== undefined ? source : target;
    }
    
    const result = { ...target };
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
          result[key] = merge(target[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }
    return result;
  };
  
  return merge(defaultOptions, savedOptions) as T;
}

