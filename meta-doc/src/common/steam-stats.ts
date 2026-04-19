/**
 * Steam Stats API 名称（须与 Steamworks「统计」配置完全一致，INT 类型）。
 */
export const STAT_SECONDS_PLAYED = 'STAT_SECONDS_PLAYED'
export const STAT_AI_REQUESTS = 'STAT_AI_REQUESTS'
export const STAT_CHARS_TYPED = 'STAT_CHARS_TYPED'
/** 专注模式前台累计秒数（与 Steam 取 max 后写回） */
export const STAT_FOCUS_SECONDS = 'STAT_FOCUS_SECONDS'

/** 写入 userData 的本地累计（与 Steam 取 max 后回写） */
export type SteamLocalStatsFile = {
  secondsPlayed: number
  charsTyped: number
  focusSeconds: number
}

export const STEAM_LOCAL_STATS_FILENAME = 'steam-playback-stats.json'
