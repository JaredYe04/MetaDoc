/**
 * 公式转换配置
 * 用于控制公式转换的行为和日志输出
 * 
 * 使用方法：
 * 1. 通过环境变量配置（推荐）：
 *    - FORMULA_CONVERTER_TYPE: 'mathml2omml' | 'custom' (默认: 'mathml2omml')
 *    - FORMULA_VERBOSE_LOGGING: 'true' | 'false' | '1' | '0' (默认: 'false')
 * 
 * 2. 通过代码配置：
 *    ```typescript
 *    import { updateFormulaConversionConfig } from './utils/formula-conversion-config';
 *    updateFormulaConversionConfig({ 
 *      converterType: 'custom',
 *      enableVerboseLogging: true 
 *    });
 *    ```
 * 
 * 示例（在 .env 文件中）：
 *    FORMULA_CONVERTER_TYPE=custom
 *    FORMULA_VERBOSE_LOGGING=true
 */

/**
 * 公式转换器类型
 */
export type FormulaConverterType = 'mathml2omml' | 'custom';

/**
 * 公式转换配置
 */
export interface FormulaConversionConfig {
  /**
   * 使用的转换器类型
   * - 'mathml2omml': 使用 mathml2omml 库（稳定版本）
   * - 'custom': 使用我们自己的 mml2omml-converter（开发中）
   */
  converterType: FormulaConverterType;

  /**
   * 是否启用详细日志
   * 当为 true 时，会输出各个阶段的详细日志（提取、去重、转换、替换等）
   */
  enableVerboseLogging: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: FormulaConversionConfig = {
  converterType: 'mathml2omml', // 默认使用稳定的 mathml2omml 库
  enableVerboseLogging: false, // 默认关闭详细日志
};

/**
 * 当前配置（可以通过环境变量或设置修改）
 */
let currentConfig: FormulaConversionConfig = { ...DEFAULT_CONFIG };

/**
 * 从环境变量加载配置
 */
function loadConfigFromEnv(): FormulaConversionConfig {
  const config = { ...DEFAULT_CONFIG };

  // 从环境变量读取转换器类型
  const converterTypeEnv = process.env.FORMULA_CONVERTER_TYPE;
  if (converterTypeEnv === 'custom' || converterTypeEnv === 'mathml2omml') {
    config.converterType = converterTypeEnv as FormulaConverterType;
  }

  // 从环境变量读取日志开关
  const verboseLoggingEnv = process.env.FORMULA_VERBOSE_LOGGING;
  if (verboseLoggingEnv === 'true' || verboseLoggingEnv === '1') {
    config.enableVerboseLogging = true;
  }

  return config;
}

// 初始化时从环境变量加载配置
currentConfig = loadConfigFromEnv();

/**
 * 获取当前配置
 */
export function getFormulaConversionConfig(): FormulaConversionConfig {
  return { ...currentConfig };
}

/**
 * 更新配置
 * @param config 新的配置（部分更新）
 */
export function updateFormulaConversionConfig(config: Partial<FormulaConversionConfig>): void {
  currentConfig = { ...currentConfig, ...config };
}

/**
 * 重置为默认配置
 */
export function resetFormulaConversionConfig(): void {
  currentConfig = { ...DEFAULT_CONFIG };
}

/**
 * 检查是否应该输出详细日志
 */
export function shouldLogVerbose(): boolean {
  return currentConfig.enableVerboseLogging;
}

/**
 * 检查是否使用自定义转换器
 */
export function shouldUseCustomConverter(): boolean {
  return currentConfig.converterType === 'custom';
}

