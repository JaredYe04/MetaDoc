/**
 * Steam 库「属性 → 语言」决定的启动语言：在 initSteam() 之后读取 greenworks.getCurrentGameLanguage()，
 * 与 electron-store 中已保存的界面语言对齐；非首次启动且不一致时交由渲染进程弹窗选择。
 */
import { appStore } from '../app-store'
import { getGreenworksOrNull } from './steam-state'
import { isLikelySteamLaunch } from '../windows/user-file-associations-win'
import { setLocale, getLocale } from '../i18n'
import { createMainLogger } from '../logger'
import { mapSteamGameLanguageToMetaDocLocale, isSupportedMetaDocLocale } from '../../common/steam-game-language'

const logger = createMainLogger('SteamStartupLocale')

export type SteamLocalePending = { steamLocale: string; appLocale: string }

let pendingConflict: SteamLocalePending | null = null

/**
 * 与 renderer prepareFirstRunWizardOnStartup 一致：在冷启动主进程侧消费「下次重置向导」并完成 firstRun 迁移。
 */
function shouldShowFirstRunWizardMain(): boolean {
  const store = appStore
  const resetNext = store.get('resetFirstRunWizardOnNextLaunch')
  if (resetNext === true) {
    store.set('firstRunWizardCompleted', false)
    store.set('editorModePromptShown', false)
    store.set('resetFirstRunWizardOnNextLaunch', false)
  }

  let completed = store.get('firstRunWizardCompleted') as boolean | undefined | null
  if (completed === undefined || completed === null) {
    const editorPromptDone = store.get('editorModePromptShown')
    if (editorPromptDone === true) {
      store.set('firstRunWizardCompleted', true)
      completed = true
    } else {
      completed = false
    }
  }

  return !completed
}

export function getPendingSteamLocaleConflict(): SteamLocalePending | null {
  return pendingConflict ? { ...pendingConflict } : null
}

export function resolveSteamLocaleConflictChoice(locale: string): { ok: true } | { ok: false; error: string } {
  if (!pendingConflict) {
    return { ok: false, error: 'no_pending_conflict' }
  }
  const choice = locale.replace(/-/g, '_')
  if (
    choice !== pendingConflict.steamLocale &&
    choice !== pendingConflict.appLocale
  ) {
    return { ok: false, error: 'invalid_locale_choice' }
  }
  if (!isSupportedMetaDocLocale(choice)) {
    return { ok: false, error: 'unsupported_locale' }
  }
  setLocale(choice, { persist: true, notifyRenderer: true })
  pendingConflict = null
  return { ok: true }
}

/**
 * 须在 initSteam() 之后、createWindow() 之前调用（且建议在 isLikelySteamLaunch() 为真时才有意义）。
 */
export function applySteamLanguageOnStartup(): void {
  pendingConflict = null

  if (!isLikelySteamLaunch()) {
    return
  }

  const gw = getGreenworksOrNull()
  if (!gw || typeof gw.getCurrentGameLanguage !== 'function') {
    return
  }

  let steamRaw: string
  try {
    steamRaw = gw.getCurrentGameLanguage()
  } catch (e) {
    logger.warn('getCurrentGameLanguage failed', e)
    return
  }

  const steamMapped = mapSteamGameLanguageToMetaDocLocale(steamRaw)
  if (!steamMapped) {
    return
  }

  const firstRun = shouldShowFirstRunWizardMain()
  const appLocale = getLocale()

  if (firstRun) {
    if (steamMapped !== appLocale) {
      setLocale(steamMapped, { persist: true, notifyRenderer: false })
    }
    return
  }

  if (steamMapped === appLocale) {
    return
  }

  pendingConflict = { steamLocale: steamMapped, appLocale }
}
