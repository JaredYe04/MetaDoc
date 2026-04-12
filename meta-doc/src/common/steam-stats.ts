/**
 * Steam Stats API 名称（须与 Steamworks「统计」配置完全一致，INT 类型）。
 */
export const STAT_SECONDS_PLAYED = 'STAT_SECONDS_PLAYED'
export const STAT_AI_REQUESTS = 'STAT_AI_REQUESTS'
export const STAT_CHARS_TYPED = 'STAT_CHARS_TYPED'

/** 写入 userData 的本地累计（与 Steam 取 max 后回写） */
export type SteamLocalStatsFile = {
  secondsPlayed: number
  charsTyped: number
}

export const STEAM_LOCAL_STATS_FILENAME = 'steam-playback-stats.json'
