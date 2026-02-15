/**
 * 拼写检查词典管理服务
 * 管理用户添加的自定义单词
 */

import { app } from 'electron'
import { join } from 'path'
import fs from 'fs'
import { createMainLogger } from '../logger'

const logger = createMainLogger('SpellCheckDictionary')

// 词典文件路径
function getDictionaryPath(): string {
  const userDataPath = app.getPath('userData')
  return join(userDataPath, 'spell-check-dictionary.json')
}

/**
 * 加载用户自定义词典
 */
export function loadCustomDictionary(): Set<string> {
  try {
    const dictPath = getDictionaryPath()
    if (fs.existsSync(dictPath)) {
      const content = fs.readFileSync(dictPath, 'utf-8')
      const words = JSON.parse(content) as string[]
      logger.info('[loadCustomDictionary] 加载自定义词典，包含', words.length, '个单词')
      return new Set(words.map((w) => w.toLowerCase()))
    }
  } catch (error) {
    logger.warn('[loadCustomDictionary] 加载自定义词典失败:', error)
  }
  return new Set<string>()
}

/**
 * 添加单词到自定义词典
 */
export function addWordToDictionary(word: string): void {
  try {
    const dictPath = getDictionaryPath()
    const words = loadCustomDictionary()

    // 添加新单词（转换为小写）
    const wordLower = word.toLowerCase().trim()
    if (wordLower && wordLower.length > 0) {
      words.add(wordLower)

      // 保存到文件
      const wordsArray = Array.from(words).sort()
      fs.writeFileSync(dictPath, JSON.stringify(wordsArray, null, 2), 'utf-8')

      logger.info('[addWordToDictionary] 已添加单词到词典:', wordLower)
    }
  } catch (error) {
    logger.error('[addWordToDictionary] 添加单词失败:', error)
    throw error
  }
}

/**
 * 批量添加单词到自定义词典
 */
export function addWordsToDictionary(words: string[]): void {
  try {
    const dictPath = getDictionaryPath()
    const existingWords = loadCustomDictionary()

    // 添加所有新单词
    for (const word of words) {
      const wordLower = word.toLowerCase().trim()
      if (wordLower && wordLower.length > 0) {
        existingWords.add(wordLower)
      }
    }

    // 保存到文件
    const wordsArray = Array.from(existingWords).sort()
    fs.writeFileSync(dictPath, JSON.stringify(wordsArray, null, 2), 'utf-8')

    logger.info('[addWordsToDictionary] 已批量添加', words.length, '个单词到词典')
  } catch (error) {
    logger.error('[addWordsToDictionary] 批量添加单词失败:', error)
    throw error
  }
}

/**
 * 检查单词是否在自定义词典中
 */
export function isWordInDictionary(word: string): boolean {
  const words = loadCustomDictionary()
  return words.has(word.toLowerCase().trim())
}
