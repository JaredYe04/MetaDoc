/**
 * 匹配上下文工具
 * 用于生成匹配列表显示的上下文文本
 */

export interface MatchContextResult {
  before: string // 匹配前的文本
  match: string // 匹配的文本
  after: string // 匹配后的文本
  fullText: string // 完整的上下文文本（用于显示）
}

/**
 * 生成匹配的上下文文本
 * 确保匹配词显示在中间，根据可用宽度动态调整左右上下文
 * @param fullText 完整文本
 * @param matchText 匹配的文本
 * @param matchStartOffset 匹配在文本中的起始偏移量
 * @param matchEndOffset 匹配在文本中的结束偏移量
 * @param maxLength 最大显示长度（默认80）
 * @returns 上下文结果
 */
export function generateMatchContext(
  fullText: string,
  matchText: string,
  matchStartOffset: number,
  matchEndOffset: number,
  maxLength: number = 80
): MatchContextResult {
  const matchLength = matchEndOffset - matchStartOffset

  // 匹配文本最多显示长度（如果匹配本身很长，需要截断）
  const maxMatchDisplayLength = Math.min(matchLength, Math.floor(maxLength * 0.4)) // 匹配最多占40%的显示空间

  // 计算可用于上下文的长度（减去匹配文本的长度）
  const availableContextLength = maxLength - maxMatchDisplayLength

  // 确保匹配词在中间：前后各分配一半的上下文空间
  // 但如果一边的文本不够，可以动态调整
  let beforeLength = Math.floor(availableContextLength / 2)
  let afterLength = Math.floor(availableContextLength / 2)

  // 找到匹配位置所在行的行首（最后一个换行符之后的位置）
  let lineStart = 0
  for (let i = matchStartOffset - 1; i >= 0; i--) {
    const char = fullText[i]
    if (char === '\n' || char === '\r') {
      lineStart = i + 1
      // 处理 \r\n 的情况
      if (char === '\n' && i > 0 && fullText[i - 1] === '\r') {
        lineStart = i
      }
      break
    }
  }

  // 获取匹配前的可用文本长度（只计算当前行内的文本）
  const availableBeforeInLine = matchStartOffset - lineStart
  const availableAfter = fullText.length - matchEndOffset

  // 如果当前行内的文本不够，将剩余空间分配给后面
  if (availableBeforeInLine < beforeLength) {
    const extra = beforeLength - availableBeforeInLine
    beforeLength = availableBeforeInLine
    afterLength = Math.min(availableAfter, afterLength + extra)
  }

  // 如果后面的文本不够，将剩余空间分配给前面（但不超过行首）
  if (availableAfter < afterLength) {
    const extra = afterLength - availableAfter
    afterLength = availableAfter
    beforeLength = Math.min(availableBeforeInLine, beforeLength + extra)
  }

  // 获取匹配前的文本（只从行首开始）
  const beforeStart = Math.max(lineStart, matchStartOffset - beforeLength)
  const beforeText = fullText.substring(beforeStart, matchStartOffset)

  // 获取匹配的文本（如果太长，只取开头）
  let displayMatch = matchText
  if (matchLength > maxMatchDisplayLength) {
    displayMatch = matchText.substring(0, maxMatchDisplayLength) + '...'
  }

  // 获取匹配后的文本
  const afterEnd = Math.min(fullText.length, matchEndOffset + afterLength)
  const afterText = fullText.substring(matchEndOffset, afterEnd)

  // 如果前面有文本（且不是行首），添加省略号
  const beforeDisplay = beforeStart > lineStart ? '...' + beforeText : beforeText

  // 如果后面有文本，添加省略号
  const afterDisplay = afterEnd < fullText.length ? afterText + '...' : afterText

  // 组合完整文本
  const fullDisplay = beforeDisplay + displayMatch + afterDisplay

  return {
    before: beforeDisplay,
    match: displayMatch,
    after: afterDisplay,
    fullText: fullDisplay
  }
}
