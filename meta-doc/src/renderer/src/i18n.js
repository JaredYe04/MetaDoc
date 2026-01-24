import { createI18n } from 'vue-i18n'

import en_US from './locales/en_us.json'
import zh_CN from './locales/zh_cn.json'
import ja_JP from './locales/ja_JP.json'
import ko_KR from './locales/ko_KR.json'
import de_DE from './locales/de_DE.json'
import fr_FR from './locales/fr_FR.json'

const savedLang = localStorage.getItem('lang') || 'zh_CN'

export const i18n = createI18n({
  locale: savedLang,
  fallbackLocale: 'zh_CN',
  messages: { en_US, zh_CN, ja_JP, ko_KR, de_DE, fr_FR }
})

export const getLocale = () => {
  // 获取当前语言，确保格式正确（下划线格式）
  let locale = i18n.global.locale.value || 'zh_CN'
  
  // 标准化格式：将连字符转换为下划线（如 'zh-CN' -> 'zh_CN'）
  if (typeof locale === 'string') {
    locale = locale.replace('-', '_')
  }
  
  // 如果 i18n 中没有值，尝试从 localStorage 获取
  if (!locale || locale === 'zh_CN') {
    const savedLang = localStorage.getItem('lang')
    if (savedLang) {
      locale = savedLang.replace('-', '_')
    }
  }
  
  return locale || 'zh_CN'
}

