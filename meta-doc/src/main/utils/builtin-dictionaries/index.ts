/**
 * 内置拼写检查词典
 * 合并所有领域的词典
 */

import { TECH_DICTIONARY } from './tech'
import { AI_DICTIONARY } from './ai'
import { ACADEMIC_DICTIONARY } from './academic'
import { PROTOCOL_DICTIONARY } from './protocol'
import { MISC_DICTIONARY } from './misc'
import { LANGUAGE_DICTIONARY } from './languages'
import { DATABASE_DICTIONARY } from './database'
import { INFRA_DICTIONARY } from './infra'
import { MATH_DICTIONARY } from './math'
import { PHYSICS_DICTIONARY } from './physics'
import { CHEMISTRY_DICTIONARY } from './chemistry'
import { BIOLOGY_DICTIONARY } from './biology'
import { ECONOMICS_DICTIONARY } from './economics'
/**
 * 合并所有内置词典
 */
const BUILTIN_DICTIONARY = [
  ...TECH_DICTIONARY,
  ...AI_DICTIONARY,
  ...ACADEMIC_DICTIONARY,
  ...PROTOCOL_DICTIONARY,
  ...MISC_DICTIONARY,
  ...LANGUAGE_DICTIONARY,
  ...DATABASE_DICTIONARY,
  ...INFRA_DICTIONARY,
  ...MATH_DICTIONARY,
  ...PHYSICS_DICTIONARY,
  ...CHEMISTRY_DICTIONARY,
  ...BIOLOGY_DICTIONARY,
  ...ECONOMICS_DICTIONARY
]

/**
 * 获取内置词典（返回 Set 以便合并）
 */
export function getBuiltinDictionary(): Set<string> {
  return new Set(BUILTIN_DICTIONARY.map((word) => word.toLowerCase()))
}

/**
 * 导出所有词典数组（用于调试或统计）
 */
export {
  TECH_DICTIONARY,
  AI_DICTIONARY,
  ACADEMIC_DICTIONARY,
  PROTOCOL_DICTIONARY,
  MISC_DICTIONARY,
  BUILTIN_DICTIONARY
}
