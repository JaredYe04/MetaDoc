import { app, BrowserWindow } from 'electron'

import { appStore as store } from './app-store'
import enUS from '../renderer/src/locales/en_us.json'
import zhCN from '../renderer/src/locales/zh_cn.json'
import zhTW from '../renderer/src/locales/zh_tw.json'
import jaJP from '../renderer/src/locales/ja_JP.json'
import koKR from '../renderer/src/locales/ko_KR.json'
import deDE from '../renderer/src/locales/de_DE.json'
import frFR from '../renderer/src/locales/fr_FR.json'
import esES from '../renderer/src/locales/es_ES.json'
import es419 from '../renderer/src/locales/es_419.json'
import ptBR from '../renderer/src/locales/pt_BR.json'
import ptPT from '../renderer/src/locales/pt_PT.json'
import ruRU from '../renderer/src/locales/ru_RU.json'

type LocaleCode =
  | 'en_US'
  | 'zh_CN'
  | 'zh_TW'
  | 'ja_JP'
  | 'ko_KR'
  | 'de_DE'
  | 'fr_FR'
  | 'es_ES'
  | 'es_419'
  | 'pt_BR'
  | 'pt_PT'
  | 'ru_RU'

type Messages = Record<string, any>

const LOCALE_MESSAGES: Record<LocaleCode, Messages> = {
  en_US: enUS,
  zh_CN: zhCN,
  zh_TW: zhTW,
  ja_JP: jaJP,
  ko_KR: koKR,
  de_DE: deDE,
  fr_FR: frFR,
  es_ES: esES,
  es_419: es419,
  pt_BR: ptBR,
  pt_PT: ptPT,
  ru_RU: ruRU
}

const FALLBACK_LOCALE: LocaleCode = 'zh_CN'

let currentLocale: LocaleCode = FALLBACK_LOCALE

interface SetLocaleOptions {
  notifyRenderer?: boolean
  persist?: boolean
}

const getFromStore = (): LocaleCode | undefined => {
  const stored = store.get('lang') as string | undefined
  if (stored && isSupportedLocale(stored)) {
    return stored
  }
  return undefined
}

const isSupportedLocale = (locale: string): locale is LocaleCode => {
  return Object.prototype.hasOwnProperty.call(LOCALE_MESSAGES, locale)
}

const resolveValue = (messages: Messages, key: string): string | undefined => {
  return key.split('.').reduce<any>((acc, part) => {
    if (acc && typeof acc === 'object' && part in acc) {
      return acc[part]
    }
    return undefined
  }, messages)
}

const formatWithVariables = (
  template: string,
  variables?: Record<string, string | number>
): string => {
  if (!variables) return template
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    const value = variables[name]
    return value !== undefined ? String(value) : `{${name}}`
  })
}

export const initI18n = (initialLocale?: string): void => {
  const preferred =
    initialLocale && isSupportedLocale(initialLocale)
      ? (initialLocale as LocaleCode)
      : getFromStore()
  setLocale(preferred ?? FALLBACK_LOCALE, { notifyRenderer: false, persist: false })
}

export const setLocale = (locale: string, options: SetLocaleOptions = {}): void => {
  const { notifyRenderer = true, persist = true } = options
  const normalized = isSupportedLocale(locale) ? locale : FALLBACK_LOCALE

  currentLocale = normalized

  if (persist) {
    store.set('lang', normalized)
  }

  if (notifyRenderer) {
    broadcastLanguage(normalized)
  }

  // 界面语言变更后刷新 HKCU 下 ProgID / ShellNew 显示名（与资源管理器「新建」菜单一致）
  if (process.platform === 'win32' && app.isPackaged) {
    void import('./system-integration/register-shell-metadata').then((m) => {
      void m.queueWindowsUserFileAssociationsWrite()
    })
  }
}

export const getLocale = (): LocaleCode => currentLocale

export const t = (key: string, fallback = key, vars?: Record<string, string | number>): string => {
  const currentMessages = LOCALE_MESSAGES[currentLocale] ?? {}
  const fallbackMessages = LOCALE_MESSAGES[FALLBACK_LOCALE] ?? {}

  let value = resolveValue(currentMessages, key)
  if (typeof value === 'undefined') {
    value = resolveValue(fallbackMessages, key)
  }

  if (typeof value === 'undefined') {
    value = fallback
  }

  if (typeof value !== 'string') {
    return fallback
  }

  return formatWithVariables(value, vars)
}

export const dispatchLanguageToWindow = (
  win: BrowserWindow | null | undefined,
  locale: string = currentLocale
): void => {
  if (!win || win.isDestroyed()) return
  const targetLocale = isSupportedLocale(locale) ? locale : FALLBACK_LOCALE
  win.webContents.send('receive-broadcast', {
    to: 'all',
    eventName: 'lang-changed',
    data: targetLocale
  })
}

export const broadcastLanguage = (locale: string = currentLocale): void => {
  const targetLocale = isSupportedLocale(locale) ? locale : FALLBACK_LOCALE
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      dispatchLanguageToWindow(win, targetLocale)
    }
  })
}
