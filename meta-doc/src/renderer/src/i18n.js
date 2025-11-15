import { createI18n } from 'vue-i18n'

import en_US from './locales/en_US.json'
import zh_CN from './locales/zh_CN.json'
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

