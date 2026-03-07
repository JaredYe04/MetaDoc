import { createI18n } from 'vue-i18n'

import en_US from './locales/en_us.json'
import zh_CN from './locales/zh_cn.json'
import zh_TW from './locales/zh_tw.json'
import ja_JP from './locales/ja_JP.json'
import ko_KR from './locales/ko_KR.json'
import de_DE from './locales/de_DE.json'
import fr_FR from './locales/fr_FR.json'
import es_ES from './locales/es_ES.json'
import pt_BR from './locales/pt_BR.json'
import ru_RU from './locales/ru_RU.json'

const savedLang = localStorage.getItem('lang') || 'zh_CN'

export const i18n = createI18n({
  locale: savedLang,
  fallbackLocale: 'zh_CN',
  messages: { en_US, zh_CN, zh_TW, ja_JP, ko_KR, de_DE, fr_FR, es_ES, pt_BR, ru_RU },
  // 禁用插值解析，避免解析代码块中的大括号
  // 注意：这会影响所有消息，但我们可以通过直接访问messages来获取原始内容
  legacy: false,
  // 使用composition API模式
  globalInjection: true
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
