import { createI18n } from 'vue-i18n'

/** 仅同步加载回退语言，其余语言按需 dynamic import */
import zh_CN from './locales/zh_cn.json'

const FALLBACK_LOCALE = 'zh_CN'

/** 与 SelectItem / localStorage 一致的下划线 locale key → 懒加载函数 */
const LOCALE_IMPORTS = {
  zh_CN: () => Promise.resolve({ default: zh_CN }),
  en_US: () => import('./locales/en_us.json'),
  zh_TW: () => import('./locales/zh_tw.json'),
  ja_JP: () => import('./locales/ja_JP.json'),
  ko_KR: () => import('./locales/ko_KR.json'),
  de_DE: () => import('./locales/de_DE.json'),
  fr_FR: () => import('./locales/fr_FR.json'),
  es_ES: () => import('./locales/es_ES.json'),
  es_419: () => import('./locales/es_419.json'),
  pt_BR: () => import('./locales/pt_BR.json'),
  pt_PT: () => import('./locales/pt_PT.json'),
  ru_RU: () => import('./locales/ru_RU.json')
}

export function normalizeLocaleCode(raw) {
  if (!raw || typeof raw !== 'string') return FALLBACK_LOCALE
  return raw.replace(/-/g, '_')
}

const storedRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('lang') : null
const normalizedStored = normalizeLocaleCode(storedRaw || FALLBACK_LOCALE)
const initialLocale = LOCALE_IMPORTS[normalizedStored] ? normalizedStored : FALLBACK_LOCALE

export const i18n = createI18n({
  locale: initialLocale,
  fallbackLocale: FALLBACK_LOCALE,
  messages: { [FALLBACK_LOCALE]: zh_CN },
  legacy: false,
  globalInjection: true
})

const loadedLocales = new Set([FALLBACK_LOCALE])

/**
 * 将指定语言的 JSON 合并进 i18n（幂等）
 */
export async function ensureLocaleLoaded(localeCode) {
  const key = normalizeLocaleCode(localeCode)
  const canonical = LOCALE_IMPORTS[key] ? key : FALLBACK_LOCALE
  if (loadedLocales.has(canonical)) return
  const loader = LOCALE_IMPORTS[canonical]
  if (!loader) return
  const mod = await loader()
  const messages = mod.default ?? mod
  i18n.global.mergeLocaleMessage(canonical, messages)
  loadedLocales.add(canonical)
}

/** 首屏挂载前调用：保证当前界面语言已加载（非 zh_CN 时需 await） */
export async function preloadInitialLocales() {
  if (initialLocale === FALLBACK_LOCALE) return
  await ensureLocaleLoaded(initialLocale)
}

/**
 * 切换界面语言：加载包（若未加载）并设置 locale + localStorage
 */
export async function setI18nLocale(localeCode) {
  const key = normalizeLocaleCode(localeCode)
  const canonical = LOCALE_IMPORTS[key] ? key : FALLBACK_LOCALE
  await ensureLocaleLoaded(canonical)
  i18n.global.locale.value = canonical
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('lang', canonical)
  }
}

export const getLocale = () => {
  let locale = i18n.global.locale.value || FALLBACK_LOCALE

  if (typeof locale === 'string') {
    locale = locale.replace(/-/g, '_')
  }

  if (!locale || locale === FALLBACK_LOCALE) {
    const savedLang = typeof localStorage !== 'undefined' ? localStorage.getItem('lang') : null
    if (savedLang) {
      locale = normalizeLocaleCode(savedLang)
    }
  }

  return locale || FALLBACK_LOCALE
}
