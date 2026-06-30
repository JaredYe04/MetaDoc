/**
 * 最近文档首次出现文件时尝试解锁 Steam 成就（与 main-calls 解耦，便于无 Steam 构建剔除实现）。
 */
export async function tryUnlockFirstDocSteamAchievements(dataPath: string): Promise<void> {
  const { tryUnlockSteamAchievement } = await import('./steam-achievement-manager')
  const { getGreenworksOrNull } = await import('./steam-state')
  const gw = getGreenworksOrNull()
  if (!gw) return
  const lower = (dataPath || '').toLowerCase()
  if (/\.(md|markdown|mdown)$/.test(lower)) {
    tryUnlockSteamAchievement(gw, 'ACH_FIRST_MD')
  } else if (/\.(tex|latex)$/.test(lower)) {
    tryUnlockSteamAchievement(gw, 'ACH_FIRST_TEX')
  }
}
