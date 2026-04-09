/**
 * 模糊文本匹配（滑动窗口 + 多指标相似度），供 grep 工具与工作区搜索复用
 */

export interface FuzzyLineMatch {
  line: number
  column: number
  match: string
  preContext: string
  postContext: string
  context: string
  similarity: number
}

function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length
  const n = str2.length
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) {
    dp[i][0] = i
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + 1)
      }
    }
  }

  return dp[m][n]
}

function similarityByEditDistance(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length)
  if (maxLen === 0) return 1.0
  const distance = levenshteinDistance(str1, str2)
  return 1 - distance / maxLen
}

function jaccardSimilarity(str1: string, str2: string): number {
  const set1 = new Set(str1.split(''))
  const set2 = new Set(str2.split(''))
  const intersection = new Set([...set1].filter((x) => set2.has(x)))
  const union = new Set([...set1, ...set2])
  if (union.size === 0) return 1.0
  return intersection.size / union.size
}

function longestCommonSubstring(str1: string, str2: string): number {
  const m = str1.length
  const n = str2.length
  let maxLen = 0
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
        maxLen = Math.max(maxLen, dp[i][j])
      } else {
        dp[i][j] = 0
      }
    }
  }
  return maxLen
}

function similarityByLCS(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length)
  if (maxLen === 0) return 1.0
  const lcsLen = longestCommonSubstring(str1, str2)
  return lcsLen / maxLen
}

export function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0
  if (str1.toLowerCase() === str2.toLowerCase()) return 0.99

  const editSim = similarityByEditDistance(str1, str2)
  const jaccardSim = jaccardSimilarity(str1, str2)
  const lcsSim = similarityByLCS(str1, str2)

  const contains1 = str1.includes(str2)
  const contains2 = str2.includes(str1)
  let containsBonus = 0
  if (contains1 || contains2) {
    const shorterLen = Math.min(str1.length, str2.length)
    const longerLen = Math.max(str1.length, str2.length)
    containsBonus = (shorterLen / longerLen) * 0.3
  }

  let prefixSim = 0
  const minLen = Math.min(str1.length, str2.length)
  if (minLen > 0) {
    let prefixMatch = 0
    for (let i = 0; i < minLen; i++) {
      if (str1[i] === str2[i]) {
        prefixMatch++
      } else {
        break
      }
    }
    prefixSim = (prefixMatch / minLen) * 0.2
  }

  const combinedSim = editSim * 0.4 + jaccardSim * 0.2 + lcsSim * 0.3 + containsBonus
  return Math.min(1.0, combinedSim + prefixSim)
}

/**
 * 在整段文本中按行做滑动窗口模糊匹配（与 agent grep 工具算法一致）
 */
export function findFuzzyMatchesInText(
  text: string,
  pattern: string,
  similarityThreshold: number = 0.6,
  contextLines: number = 3
): FuzzyLineMatch[] {
  const matches: FuzzyLineMatch[] = []
  const lines = text.split(/\r?\n/)
  const patternLen = pattern.length
  const minWindowLen = Math.max(1, Math.floor(patternLen * 0.5))
  const maxWindowLen = Math.ceil(patternLen * 1.5)

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
    if (line.length < minWindowLen) continue

    let bestMatch: { start: number; length: number; similarity: number } | null = null

    for (
      let windowLen = minWindowLen;
      windowLen <= Math.min(maxWindowLen, line.length);
      windowLen++
    ) {
      const stepSize = windowLen > 10 ? 2 : 1
      for (let start = 0; start <= line.length - windowLen; start += stepSize) {
        const window = line.substring(start, start + windowLen)
        const similarity = calculateSimilarity(pattern, window)
        if (similarity >= similarityThreshold) {
          if (!bestMatch || similarity > bestMatch.similarity) {
            bestMatch = { start, length: windowLen, similarity }
          }
        }
      }
    }

    if (bestMatch) {
      const startLine = Math.max(0, lineIndex - contextLines)
      const endLine = Math.min(lines.length - 1, lineIndex + contextLines)
      const preContext = lines.slice(startLine, lineIndex).join('\n')
      const postContext = lines.slice(lineIndex + 1, endLine + 1).join('\n')
      const context = lines.slice(startLine, endLine + 1).join('\n')

      matches.push({
        line: lineIndex + 1,
        column: bestMatch.start + 1,
        match: line.substring(bestMatch.start, bestMatch.start + bestMatch.length),
        preContext,
        postContext,
        context,
        similarity: bestMatch.similarity
      })
    }
  }

  matches.sort((a, b) => b.similarity - a.similarity)
  return matches
}
