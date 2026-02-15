/**
 * Agent Tool i18n辅助函数
 * 支持所有语言，并回退到en_us
 */

import { i18n } from '../../i18n'
import type { ToolLocales } from '../../types/agent-tool'

/**
 * 支持的语言列表（按优先级排序）
 */
const SUPPORTED_LOCALES = ['zh_cn', 'en_us', 'de_DE', 'fr_FR', 'ja_JP', 'ko_KR'] as const

/**
 * 获取当前语言代码（标准化格式）
 */
function getCurrentLocale(): string {
  const locale = i18n.global.locale.value || 'zh_CN'
  // 标准化格式：zh_CN -> zh_cn, en_US -> en_us
  return locale.replace('-', '_').toLowerCase()
}

/**
 * 获取本地化文本
 * @param text 文本或ToolLocales对象
 * @returns 本地化后的字符串
 */
export function getLocalizedText(text: string | ToolLocales): string {
  if (typeof text === 'string') {
    return text
  }

  if (typeof text !== 'object' || text === null) {
    return ''
  }

  const currentLocale = getCurrentLocale()
  const locales = text as ToolLocales

  // 1. 尝试当前语言
  if (locales[currentLocale]) {
    return locales[currentLocale].name || locales[currentLocale].description || ''
  }

  // 2. 尝试标准化后的当前语言（zh_CN -> zh_cn）
  const normalizedLocale = currentLocale.toLowerCase()
  if (locales[normalizedLocale]) {
    return locales[normalizedLocale].name || locales[normalizedLocale].description || ''
  }

  // 3. 回退到en_us
  if (locales['en_us']) {
    return locales['en_us'].name || locales['en_us'].description || ''
  }

  // 4. 回退到en_US
  if (locales['en_US']) {
    return locales['en_US'].name || locales['en_US'].description || ''
  }

  // 5. 尝试其他支持的语言
  for (const locale of SUPPORTED_LOCALES) {
    if (locales[locale]) {
      return locales[locale].name || locales[locale].description || ''
    }
  }

  // 6. 返回第一个可用的值
  const values = Object.values(locales)
  if (values.length > 0) {
    const first = values[0]
    if (typeof first === 'object' && first !== null) {
      return first.name || first.description || ''
    }
  }

  return ''
}

/**
 * 获取本地化的instruction（Markdown格式）
 */
export function getLocalizedInstruction(instruction: string | ToolLocales): string {
  if (typeof instruction === 'string') {
    return instruction
  }

  if (typeof instruction !== 'object' || instruction === null) {
    return ''
  }

  const currentLocale = getCurrentLocale()
  const locales = instruction as ToolLocales

  // 1. 尝试当前语言
  if (locales[currentLocale]?.instruction) {
    return locales[currentLocale].instruction
  }

  // 2. 尝试标准化后的当前语言
  const normalizedLocale = currentLocale.toLowerCase()
  if (locales[normalizedLocale]?.instruction) {
    return locales[normalizedLocale].instruction
  }

  // 3. 回退到en_us
  if (locales['en_us']?.instruction) {
    return locales['en_us'].instruction
  }

  // 4. 回退到en_US
  if (locales['en_US']?.instruction) {
    return locales['en_US'].instruction
  }

  // 5. 尝试其他支持的语言
  for (const locale of SUPPORTED_LOCALES) {
    if (locales[locale]?.instruction) {
      return locales[locale].instruction
    }
  }

  // 6. 返回第一个可用的值
  const values = Object.values(locales)
  for (const value of values) {
    if (typeof value === 'object' && value !== null && value.instruction) {
      return value.instruction
    }
  }

  return ''
}
