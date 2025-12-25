/**
 * 匹配上下文工具
 * 用于生成匹配列表显示的上下文文本
 */

export interface MatchContextResult {
  before: string;      // 匹配前的文本
  match: string;       // 匹配的文本
  after: string;       // 匹配后的文本
  fullText: string;    // 完整的上下文文本（用于显示）
}

/**
 * 生成匹配的上下文文本
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
  // 如果匹配本身就很长，只显示前文+match开头
  const matchLength = matchEndOffset - matchStartOffset;
  const maxMatchDisplayLength = Math.min(matchLength, 30); // 匹配最多显示30个字符
  
  // 前后文只截取最多5个字
  const beforeLength = 5;
  const afterLength = 5;
  
  // 计算总长度（用于检查是否需要省略号）
  const totalLength = beforeLength + maxMatchDisplayLength + afterLength;
  
  // 获取匹配前的文本
  const beforeStart = Math.max(0, matchStartOffset - beforeLength);
  const beforeText = fullText.substring(beforeStart, matchStartOffset);
  
  // 获取匹配的文本（如果太长，只取开头）
  let displayMatch = matchText;
  if (matchLength > maxMatchDisplayLength) {
    displayMatch = matchText.substring(0, maxMatchDisplayLength) + '...';
  }
  
  // 获取匹配后的文本
  const afterEnd = Math.min(fullText.length, matchEndOffset + afterLength);
  const afterText = fullText.substring(matchEndOffset, afterEnd);
  
  // 如果前面有文本，添加省略号
  const beforeDisplay = beforeStart > 0 ? '...' + beforeText : beforeText;
  
  // 如果后面有文本，添加省略号
  const afterDisplay = afterEnd < fullText.length ? afterText + '...' : afterText;
  
  // 组合完整文本
  const fullDisplay = beforeDisplay + displayMatch + afterDisplay;
  
  return {
    before: beforeDisplay,
    match: displayMatch,
    after: afterDisplay,
    fullText: fullDisplay,
  };
}

