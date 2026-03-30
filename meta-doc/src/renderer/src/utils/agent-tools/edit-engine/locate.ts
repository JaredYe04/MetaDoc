import { collapseWhitespace, normalizeNewlines } from './normalize'
import type { EditTarget, LocatedSpan } from './types'
import { EditEngineError } from './types'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 非重叠字面量查找所有起点 */
function findAllLiteral(haystack: string, needle: string): number[] {
  if (needle.length === 0) return []
  const idxs: number[] = []
  let i = 0
  while (i <= haystack.length - needle.length) {
    const j = haystack.indexOf(needle, i)
    if (j === -1) break
    idxs.push(j)
    i = j + 1
  }
  return idxs
}

/** 将字符串按空白拆成 token，构造「token 间允许 \\s+」的正则 */
function tokensToFlexibleRegExp(s: string): RegExp {
  const parts = collapseWhitespace(s)
    .split(' ')
    .filter((p: string) => p.length > 0)
  if (parts.length === 0) return /^$/m
  const body = parts.map((p) => escapeRegExp(p)).join('\\s+')
  return new RegExp(body, 'ms')
}

function allRegexMatches(text: string, re: RegExp): { index: number; length: number }[] {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`
  const r = new RegExp(re.source, flags)
  const out: { index: number; length: number }[] = []
  let m: RegExpExecArray | null
  r.lastIndex = 0
  while ((m = r.exec(text)) !== null) {
    out.push({ index: m.index, length: m[0].length })
    if (m[0].length === 0) r.lastIndex++
  }
  return out
}

function buildFullNeedle(target: EditTarget): string {
  return (target.context_before ?? '') + target.anchor + (target.context_after ?? '')
}

function spanFromExactMatch(
  matchStart: number,
  fullNeedleLen: number,
  beforeLen: number,
  anchorLen: number
): LocatedSpan {
  const fullStart = matchStart
  const fullEnd = matchStart + fullNeedleLen
  const anchorStart = matchStart + beforeLen
  const anchorEnd = anchorStart + anchorLen
  return { anchorStart, anchorEnd, fullStart, fullEnd, strategy: 'exact' }
}

/**
 * 定位 anchor 在 file 中的 [anchorStart, anchorEnd) 及整段匹配 [fullStart, fullEnd)
 */
export function locateTarget(file: string, target: EditTarget): LocatedSpan {
  const text = normalizeNewlines(file)
  const before = target.context_before ?? ''
  const anchor = target.anchor
  const after = target.context_after ?? ''

  if (text.length === 0 && anchor === '' && before === '' && after === '') {
    return { anchorStart: 0, anchorEnd: 0, fullStart: 0, fullEnd: 0, strategy: 'exact' }
  }

  const fullNeedle = buildFullNeedle(target)

  // 非空文件 + 空 anchor：须至少一侧 context，且整段 needle 非空，仅做精确匹配（避免模糊歧义）
  if (anchor === '' && text.length > 0) {
    if (before.length === 0 && after.length === 0) {
      throw new EditEngineError(
        '非空文件使用空 anchor 时，必须提供 context_before 或 context_after 以唯一界定插入点',
        'INVALID_EDIT'
      )
    }
    if (fullNeedle.length === 0) {
      throw new EditEngineError('空 anchor 且 before/after 均为空时无法定位', 'INVALID_EDIT')
    }
    const hits = findAllLiteral(text, fullNeedle)
    if (hits.length === 1) {
      const matchStart = hits[0]
      return spanFromExactMatch(matchStart, fullNeedle.length, before.length, 0)
    }
    if (hits.length > 1) {
      throw new EditEngineError('AMBIGUOUS_MATCH', 'AMBIGUOUS_MATCH')
    }
    throw new EditEngineError('TARGET_NOT_FOUND', 'TARGET_NOT_FOUND')
  }

  // —— 1) 整段精确 ——
  if (fullNeedle.length > 0) {
    const hits = findAllLiteral(text, fullNeedle)
    if (hits.length === 1) {
      const matchStart = hits[0]
      return spanFromExactMatch(matchStart, fullNeedle.length, before.length, anchor.length)
    }
    if (hits.length > 1) {
      throw new EditEngineError('AMBIGUOUS_MATCH', 'AMBIGUOUS_MATCH')
    }
  } else {
    throw new EditEngineError('anchor 与上下文均为空', 'INVALID_EDIT')
  }

  // —— 2) 整段模糊：在匹配块内再找 anchor（模糊）；空 anchor 不走模糊 ——
  if (anchor.length > 0) {
    const flexFull = tokensToFlexibleRegExp(fullNeedle)
    const fullMatches = allRegexMatches(text, flexFull)
    if (fullMatches.length > 1) {
      throw new EditEngineError('AMBIGUOUS_MATCH', 'AMBIGUOUS_MATCH')
    }
    if (fullMatches.length === 1) {
      const { index, length } = fullMatches[0]
      const fullStart = index
      const fullEnd = index + length
      const block = text.slice(index, index + length)
      const flexA = tokensToFlexibleRegExp(anchor)
      const am = allRegexMatches(block, flexA)
      if (am.length === 1) {
        const a0 = am[0]
        return {
          anchorStart: index + a0.index,
          anchorEnd: index + a0.index + a0.length,
          fullStart,
          fullEnd,
          strategy: 'fuzzy'
        }
      }
    }
  }

  // —— 3) 无上下文：仅 anchor ——
  if (before === '' && after === '') {
    const lit = findAllLiteral(text, anchor)
    if (lit.length === 1) {
      const s = lit[0]
      const e = s + anchor.length
      return { anchorStart: s, anchorEnd: e, fullStart: s, fullEnd: e, strategy: 'exact' }
    }
    if (lit.length > 1) {
      throw new EditEngineError('AMBIGUOUS_MATCH', 'AMBIGUOUS_MATCH')
    }
    const flexA = tokensToFlexibleRegExp(anchor)
    const am = allRegexMatches(text, flexA)
    if (am.length === 1) {
      const s = am[0].index
      const e = s + am[0].length
      return { anchorStart: s, anchorEnd: e, fullStart: s, fullEnd: e, strategy: 'fuzzy' }
    }
    if (am.length > 1) {
      throw new EditEngineError('AMBIGUOUS_MATCH', 'AMBIGUOUS_MATCH')
    }
  }

  throw new EditEngineError('TARGET_NOT_FOUND', 'TARGET_NOT_FOUND')
}
