export type SteamInitResult = {
  available: boolean
  initialized: boolean
  reason?: string
}

export function initSteam(): SteamInitResult {
  return { available: false, initialized: false, reason: 'steam_disabled' }
}

export function shutdownSteam(): void {}

export function getGreenworksOrNull(): null {
  return null
}

export function applySteamLanguageOnStartup(): void {}
