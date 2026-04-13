/**
 * Steam ISteamApps::GetCurrentGameLanguage() 返回值（小写）与 MetaDoc 界面 locale 的映射。
 * 与 scripts/generate-steam-loc-vdf.mjs 中 Steam 语言键对齐；未映射语种返回 null（保持应用内原设置）。
 */

/** Steam API 语言键 → MetaDoc locale（与 i18n.js LOCALE_IMPORTS 键一致） */
export const STEAM_GAME_LANG_TO_METADOC_LOCALE: Record<string, string> = {
  english: 'en_US',
  schinese: 'zh_CN',
  tchinese: 'zh_TW',
  japanese: 'ja_JP',
  koreana: 'ko_KR',
  german: 'de_DE',
  french: 'fr_FR',
  spanish: 'es_ES',
  /** Steam 巴西葡语 */
  brazilian: 'pt_BR',
  /** 欧洲葡语：界面仅有 pt_BR，归入巴西葡语资源 */
  portuguese: 'pt_BR',
  russian: 'ru_RU'
}

/** 按钮与 Steam 冲突弹窗展示用（各语言自称） */
export const METADOC_LOCALE_NATIVE_LABEL: Record<string, string> = {
  zh_CN: '简体中文',
  zh_TW: '繁體中文',
  en_US: 'English',
  ja_JP: '日本語',
  ko_KR: '한국어',
  de_DE: 'Deutsch',
  fr_FR: 'Français',
  es_ES: 'Español',
  pt_BR: 'Português',
  ru_RU: 'Русский'
}

const SUPPORTED = new Set(Object.keys(METADOC_LOCALE_NATIVE_LABEL))

export function mapSteamGameLanguageToMetaDocLocale(steamRaw: string | undefined | null): string | null {
  if (!steamRaw || typeof steamRaw !== 'string') return null
  const key = steamRaw.trim().toLowerCase()
  const mapped = STEAM_GAME_LANG_TO_METADOC_LOCALE[key]
  if (!mapped || !SUPPORTED.has(mapped)) return null
  return mapped
}

export function isSupportedMetaDocLocale(code: string): boolean {
  return SUPPORTED.has(code)
}
