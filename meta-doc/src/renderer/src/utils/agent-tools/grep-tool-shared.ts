/**
 * Grep 工具与 GrepDisplay 共用的类型与常量（独立文件，避免 grep-tool ↔ GrepDisplay 循环依赖）
 */

/** 界面详细展示匹配项条数上限；超出部分仅显示索引与位置，不展示匹配正文与上下文 */
export const GREP_DISPLAY_MAX_DETAILED_MATCHES = 10

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
