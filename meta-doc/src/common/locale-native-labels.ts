/** MetaDoc locale → native display name (used by onboarding / language UI). */

export const METADOC_LOCALE_NATIVE_LABEL: Record<string, string> = {
  zh_CN: '简体中文',
  zh_TW: '繁體中文',
  en_US: 'English',
  ja_JP: '日本語',
  ko_KR: '한국어',
  de_DE: 'Deutsch',
  fr_FR: 'Français',
  es_ES: 'Español (España)',
  es_419: 'Español (Latinoamérica)',
  pt_BR: 'Português (BR)',
  pt_PT: 'Português (PT)',
  ru_RU: 'Русский'
}

export function isSupportedMetaDocLocale(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(METADOC_LOCALE_NATIVE_LABEL, code)
}
