/**
 * 字号本地化工具
 * 根据系统语言环境显示本地化的字号名称（如中文的"初号"、"一号"等）
 * 参考 Word、WPS 等软件的标准实现
 */

import { useI18n } from 'vue-i18n';

/**
 * 字号选项接口
 */
export interface FontSizeOption {
  value: number; // pt 值
  label: string; // 显示标签（本地化）
  pt: number; // pt 值（用于排序）
}

/**
 * 中文字号映射表（pt -> 中文号数）
 * 这是中文排版的标准字号体系，与 Word、WPS 等软件一致
 */
const chineseFontSizeMap: Array<{ pt: number; nameKey: string }> = [
  { pt: 42, nameKey: 'fontSize.chuhao' }, // 初号
  { pt: 36, nameKey: 'fontSize.xiaochu' }, // 小初
  { pt: 26, nameKey: 'fontSize.yihao' }, // 一号
  { pt: 24, nameKey: 'fontSize.xiaoyi' }, // 小一
  { pt: 22, nameKey: 'fontSize.erhao' }, // 二号
  { pt: 18, nameKey: 'fontSize.xiaoer' }, // 小二
  { pt: 16, nameKey: 'fontSize.sanhao' }, // 三号
  { pt: 15, nameKey: 'fontSize.xiaosan' }, // 小三
  { pt: 14, nameKey: 'fontSize.sihao' }, // 四号
  { pt: 12, nameKey: 'fontSize.xiaosi' }, // 小四
  { pt: 10.5, nameKey: 'fontSize.wuhao' }, // 五号
  { pt: 9, nameKey: 'fontSize.xiaowu' }, // 小五
  { pt: 7.5, nameKey: 'fontSize.liuhao' }, // 六号
  { pt: 6.5, nameKey: 'fontSize.xiaoliu' }, // 小六
  { pt: 5.5, nameKey: 'fontSize.qihao' }, // 七号
  { pt: 5, nameKey: 'fontSize.bahao' }, // 八号
];

/**
 * 获取字号选项列表（包含中文字号和数字字号，按实际大小排序）
 * @param locale 语言代码（可选，默认使用当前语言）
 * @returns 字号选项列表
 */
export function getFontSizeOptions(locale?: string): FontSizeOption[] {
  // 如果没有指定 locale，尝试从 i18n 获取
  let currentLocale = locale;
  let t: ((key: string, fallback?: string) => string) | null = null;
  
  if (!currentLocale) {
    try {
      const { locale: i18nLocale, t: i18nT } = useI18n();
      currentLocale = String(i18nLocale.value || 'zh_CN').replace('-', '_');
      t = i18nT;
    } catch {
      currentLocale = 'zh_CN';
    }
  }
  
  // 标准化 locale
  currentLocale = currentLocale.replace('-', '_');
  
  // 生成数字字号选项（6pt 到 72pt，步长 0.5）
  const numericOptions: FontSizeOption[] = [];
  for (let pt = 6; pt <= 72; pt += 0.5) {
    numericOptions.push({
      value: pt,
      label: `${pt}pt`,
      pt: pt,
    });
  }
  
  // 如果是中文环境，添加中文字号选项
  if (currentLocale.startsWith('zh') && t) {
    try {
      const chineseOptions: FontSizeOption[] = chineseFontSizeMap.map(item => ({
        value: item.pt,
        label: `${t(item.nameKey, item.nameKey)} (${item.pt}pt)`, // 使用 i18n 翻译，并显示 pt 值
        pt: item.pt,
      }));
      
      // 合并中文字号和数字字号，去除重复的 pt 值
      const allOptions: FontSizeOption[] = [];
      const usedPts = new Set<number>();
      
      // 先添加中文字号
      for (const chineseOption of chineseOptions) {
        allOptions.push(chineseOption);
        usedPts.add(chineseOption.pt);
      }
      
      // 再添加数字字号（排除已有中文字号的 pt 值）
      for (const numericOption of numericOptions) {
        // 检查是否已经有对应的中文字号（允许 0.1pt 的误差）
        const hasChinese = Array.from(usedPts).some(pt => Math.abs(pt - numericOption.pt) < 0.1);
        if (!hasChinese) {
          allOptions.push(numericOption);
        }
      }
      
      // 按 pt 值从大到小排序
      allOptions.sort((a, b) => b.pt - a.pt);
      return allOptions;
    } catch (error) {
      // 如果 i18n 翻译失败，使用备用方法
      console.warn('字号 i18n 翻译失败，使用备用方法:', error);
    }
  }
  
  // 其他语言环境或翻译失败：只使用数字字号，按从大到小排序
  numericOptions.sort((a, b) => b.pt - a.pt);
  return numericOptions;
}

/**
 * 获取字号选项（备用方法，不使用 i18n）
 */
function getFontSizeOptionsFallback(): FontSizeOption[] {
  const options: FontSizeOption[] = [];
  for (let pt = 6; pt <= 72; pt += 0.5) {
    options.push({
      value: pt,
      label: `${pt}pt`,
      pt: pt,
    });
  }
  options.sort((a, b) => b.pt - a.pt);
  return options;
}

/**
 * 获取最接近的中文字号名称
 * @param pt 磅值
 * @returns 中文字号名称，如果没有匹配则返回 null
 */
function getChineseFontSizeName(pt: number, locale?: string): string | null {
  // 精确匹配（允许 0.1pt 的误差）
  const exactMatch = chineseFontSizeMap.find(item => Math.abs(item.pt - pt) < 0.1);
  if (exactMatch) {
    try {
      const { t } = useI18n();
      return t(exactMatch.nameKey, exactMatch.nameKey);
    } catch {
      return exactMatch.nameKey;
    }
  }
  
  return null;
}

/**
 * 获取本地化的字号显示文本
 * @param pt 磅值
 * @param locale 语言代码（可选，默认使用当前语言）
 * @returns 本地化的字号显示文本，如 "五号 (10.5pt)" 或 "10.5pt"
 */
export function getLocalizedFontSize(pt: number, locale?: string): string {
  if (pt <= 0) return `${pt}pt`;
  
  // 如果没有指定 locale，尝试从 i18n 获取
  let currentLocale = locale;
  if (!currentLocale) {
    try {
      const { locale: i18nLocale } = useI18n();
      currentLocale = String(i18nLocale.value || 'zh_CN').replace('-', '_');
    } catch {
      currentLocale = 'zh_CN';
    }
  }
  
  // 标准化 locale
  currentLocale = currentLocale.replace('-', '_');
  
  // 中文环境：显示号数 + pt
  if (currentLocale.startsWith('zh')) {
    const chineseName = getChineseFontSizeName(pt);
    if (chineseName) {
      return `${chineseName} (${pt}pt)`;
    }
    // 如果没有匹配的中文号数，只显示 pt
    return `${pt}pt`;
  }
  
  // 其他语言环境：只显示 pt
  return `${pt}pt`;
}

/**
 * 从本地化字号文本中提取 pt 值
 * @param localizedText 本地化的字号文本，如 "五号 (10.5pt)" 或 "10.5pt"
 * @returns pt 值
 */
export function parseFontSizeFromLocalized(localizedText: string): number {
  // 尝试提取括号中的 pt 值
  const match = localizedText.match(/\((\d+(?:\.\d+)?)pt\)/);
  if (match) {
    return parseFloat(match[1]);
  }
  
  // 尝试直接提取 pt 值
  const ptMatch = localizedText.match(/(\d+(?:\.\d+)?)pt/);
  if (ptMatch) {
    return parseFloat(ptMatch[1]);
  }
  
  // 如果都没有，尝试提取数字
  const numMatch = localizedText.match(/(\d+(?:\.\d+)?)/);
  if (numMatch) {
    return parseFloat(numMatch[1]);
  }
  
  return 0;
}

