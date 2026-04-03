/**
 * Grep 工具与 GrepDisplay 共用的类型与常量（独立文件，避免 grep-tool ↔ GrepDisplay 循环依赖）
 */

/** 界面列表最多展示的匹配条数；超出部分不列入列表以节约上下文，总数见 totalMatches */
export const GREP_DISPLAY_MAX_DETAILED_MATCHES = 50

/** 匹配结果 */
export interface GrepMatch {
  line: number
  column: number
  match: string
  filePath?: string
  preContext: string
  postContext: string
  context: string
  similarity?: number
  groups?: string[]
  contentOmitted?: boolean
  metadataScope?: boolean
}

/** Grep 结果 */
export interface GrepResult {
  matches: GrepMatch[]
  totalMatches: number
  searchPattern: string
  isRegex: boolean
  isFuzzy: boolean
  similarityThreshold?: number
  scope: string[]
  originalContent?: string
  language?: string
  replacedCount?: number
  replacementText?: string
  replacedContent?: string
  displayMatchDetailLimit?: number
}
