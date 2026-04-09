/**
 * 文本过滤工具
 * 用于过滤无意义文本和meta-info标记
 */

/**
 * 过滤文本内容，移除meta-info标记和无意义文本
 * @param content 原始文本内容
 * @returns 过滤后的文本内容
 */
export function filterTextContent(content: string): string {
  if (!content || typeof content !== 'string') {
    return ''
  }

  // 第一步：移除meta-info标记
  let filtered = removeMetaInfo(content)

  // 第二步：移除无意义的文本块
  filtered = removeMeaninglessBlocks(filtered)

  // 第三步：清理多余的连续换行符（最多保留2个连续的\n）
  filtered = normalizeLineBreaks(filtered)

  return filtered.trim()
}

/**
 * 规范化换行符，将3个或更多连续的换行符替换为2个换行符
 * @param content 原始文本内容
 * @returns 规范化后的文本内容
 */
function normalizeLineBreaks(content: string): string {
  if (!content || typeof content !== 'string') {
    return ''
  }

  // 将3个或更多连续的换行符替换为2个换行符（段落分隔）
  // 这样既保留了段落分隔，又去除了多余的空行
  return content.replace(/\n{3,}/g, '\n\n')
}

/**
 * 移除meta-info标记
 * @param content 原始文本内容
 * @returns 移除meta-info后的文本
 */
function removeMetaInfo(content: string): string {
  let result = content

  // 移除 Markdown 中的元信息标记（<!--meta-info: ... -->）
  result = result.replace(/<!--meta-info:[^>]*-->/g, '')

  // 移除 LaTeX 中的元信息标记（%META-INFO: ... 和警告行）
  result = result.replace(/% 请勿手动修改此行及下面的 META-INFO.*\n?/g, '')
  result = result.replace(/%META-INFO:[^\n]*\n?/g, '')

  return result
}

/**
 * 移除无意义的文本块
 * @param content 原始文本内容
 * @returns 移除无意义文本块后的内容
 */
function removeMeaninglessBlocks(content: string): string {
  if (!content || content.trim().length === 0) {
    return ''
  }

  // 按行分割，逐行检查
  const lines = content.split('\n')
  const filteredLines: string[] = []

  for (const line of lines) {
    const trimmedLine = line.trim()

    // 跳过空行
    if (trimmedLine.length === 0) {
      filteredLines.push(line) // 保留空行以维持格式
      continue
    }

    // 检查是否为无意义文本
    if (!isMeaningless(trimmedLine)) {
      filteredLines.push(line)
    }
  }

  return filteredLines.join('\n')
}

/**
 * 检测字符串是否为无意义文本
 * 综合判断，避免误过滤用户故意上传的特殊内容
 * @param str 待检测的字符串
 * @returns 是否为无意义文本
 */
function isMeaningless(str: string): boolean {
  if (!str || str.length === 0) {
    return true
  }

  const clean = str.replace(/\s+/g, '')
  if (clean.length === 0) {
    return true
  }

  // 1. Base64/Hash检测（放宽标准）
  // 只检测长度较长且完全符合Base64/Hash格式的字符串
  // 避免误判包含Base64字符但实际有意义的文本
  if (clean.length >= 32 && /^[A-Za-z0-9+/=]{32,}$/.test(clean)) {
    // 进一步检查：如果包含大量连续相同字符，更可能是无意义的hash
    const charFrequency: Record<string, number> = {}
    for (const char of clean) {
      charFrequency[char] = (charFrequency[char] || 0) + 1
    }
    const maxFrequency = Math.max(...Object.values(charFrequency))
    const maxFrequencyRatio = maxFrequency / clean.length

    // 如果某个字符占比超过50%，可能是无意义的hash（放宽阈值）
    if (maxFrequencyRatio > 0.5) {
      return true
    }
  }

  // 2. 非字母数字字符比例检测（放宽阈值，避免误判）
  // 对于包含中文的文本，非字母数字字符比例会较高，这是正常的
  const hasChinese = /[\u4e00-\u9fa5]/.test(str)
  const nonAlphaNumRatio = (clean.match(/[^A-Za-z0-9\u4e00-\u9fa5]/g)?.length || 0) / clean.length

  // 如果有中文，放宽阈值到0.8；否则使用0.7（进一步放宽）
  const threshold = hasChinese ? 0.8 : 0.7
  if (nonAlphaNumRatio > threshold && clean.length > 20) {
    // 进一步检查：如果主要是标点符号，可能是无意义的
    const punctuationRatio = (clean.match(/[^\w\s\u4e00-\u9fa5]/g)?.length || 0) / clean.length
    if (punctuationRatio > 0.7) {
      return true
    }
  }

  return false
}
