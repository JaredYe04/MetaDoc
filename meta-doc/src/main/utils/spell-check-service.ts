/**
 * 拼写检查服务（主进程）
 * 使用 cspell-lib 进行拼写检查，因为 cspell-lib 需要 Node.js 环境
 * 
 * 字典架构（三层结构）：
 * 1. 内置词典（Builtin Dictionary）：代码中硬编码的单词集合，包含多个领域（tech, ai, academic等）
 * 2. 自定义词典（Custom Dictionary）：用户手动添加的单词，存储在用户数据目录
 * 3. cspell 配置字典（Config Dictionaries）：从 npm 包加载的多语言字典（en, fr-fr, es-es, de-de, ru-ru等）
 * 
 * 多语言支持：
 * - 自动启用所有配置文件中定义的语言字典
 * - 支持多语言混合文档的拼写检查
 * - 根据文档格式（markdown/latex）自动添加格式特定的字典
 */

import { createMainLogger } from '../logger'
import { loadCustomDictionary } from './spell-check-dictionary'
import { getBuiltinDictionary } from './builtin-dictionaries'
import path from 'path'
import { app } from 'electron'
import pathService from './path-service'
import { SpellCheckFileOptions } from 'cspell-lib'
import { Document } from 'node_modules/cspell-lib/dist/lib/Document'
import fs from 'fs'

const logger = createMainLogger('SpellCheckService')

/**
 * 将 i18n 语言代码转换为 cspell 语言代码
 */
function i18nLocaleToCSpellLocale(i18nLocale: string): string {
  const localeMap: Record<string, string> = {
    'zh_CN': 'zh-CN',
    'zh_cn': 'zh-CN',
    'en_US': 'en-US',
    'en_us': 'en-US',
    'ja_JP': 'ja-JP',
    'ja_jp': 'ja-JP',
    'ko_KR': 'ko-KR',
    'ko_kr': 'ko-KR',
    'de_DE': 'de-DE',
    'de_de': 'de-DE',
    'fr_FR': 'fr-FR',
    'fr_fr': 'fr-FR'
  }
  
  const normalized = i18nLocale.replace('-', '_')
  return localeMap[normalized] || 'en-US'
}

/**
 * 从配置文件中获取所有可用的语言
 * 读取 cspell.json 配置文件，提取所有定义的语言代码
 * @returns 所有可用语言的数组（如 ['en', 'fr', 'fr_FR', 'es', 'es_ES', 'de', 'de_DE', 'ru', 'ru_RU', 'markdown', 'latex']）
 */
function getAllAvailableLanguages(): string[] {
  try {
    const configPath = getCSpellConfigPath()
    if (!fs.existsSync(configPath)) {
      logger.warn('[getAllAvailableLanguages] 配置文件不存在，使用默认语言')
      return ['en', 'markdown', 'latex']
    }
    
    const configContent = fs.readFileSync(configPath, 'utf-8')
    const config = JSON.parse(configContent)
    
    // 从 language 字段获取语言列表（如果存在）
    if (config.language) {
      if (typeof config.language === 'string') {
        // 如果是字符串，按逗号分割
        return config.language.split(',').map((lang: string) => lang.trim()).filter(Boolean)
      } else if (Array.isArray(config.language)) {
        // 如果是数组，直接返回
        return config.language.map((lang: string) => lang.trim()).filter(Boolean)
      }
    }
    
    // 如果 language 字段不存在，从 dictionaries 中提取语言代码
    // 注意：dictionaries 可能包含格式特定的字典（如 markdown, latex）
    if (config.dictionaries && Array.isArray(config.dictionaries)) {
      return config.dictionaries.filter(Boolean)
    }
    
    // 默认返回英语和格式语言
    return ['en', 'markdown', 'latex']
  } catch (error) {
    logger.warn('[getAllAvailableLanguages] 获取语言配置失败，使用默认配置:', error)
    return ['en-US', 'markdown', 'latex']
  }
}

/**
 * 获取多语言配置
 * 为了支持多语言混合文档，启用所有可用的字典
 * - 从配置文件中读取所有可用语言
 * - 根据文档格式添加格式特定的语言（markdown 或 latex）
 * - 确保所有语言的单词都能被正确检查
 * 
 * @param format 文档格式（'text' | 'markdown' | 'latex'）
 * @returns cspell 语言配置字符串（如 'en,fr,fr_FR,es,es_ES,de,de_DE,ru,ru_RU,markdown,latex'）
 */
function getMultiLanguageConfig(format: 'text' | 'markdown' | 'latex' = 'text'): string {
  try {
    // 获取所有可用语言（从配置文件中读取）
    const allLanguages = getAllAvailableLanguages()
    
    // 构建语言列表（去重）
    const languages = new Set<string>()
    
    // 添加所有配置文件中定义的语言
    for (const lang of allLanguages) {
      if (lang && lang.trim()) {
        languages.add(lang.trim())
      }
    }
    
    // 确保包含英语（如果配置中没有）
    if (!languages.has('en-US') && !languages.has('en')) {
      languages.add('en')
    }
    
    // 根据文档格式添加格式特定的语言
    if (format === 'markdown') {
      languages.add('markdown')
    } else if (format === 'latex') {
      languages.add('latex')
    }
    
    // 返回逗号分隔的语言配置字符串
    const languageConfig = Array.from(languages).join(',')
    logger.debug('[getMultiLanguageConfig] 生成的语言配置:', languageConfig, '格式:', format)
    return languageConfig
  } catch (error) {
    logger.warn('[getMultiLanguageConfig] 获取语言配置失败，使用默认配置:', error)
    // 即使出错，也尝试包含格式语言
    if (format === 'markdown') {
      return 'en,markdown'
    } else if (format === 'latex') {
      return 'en,latex'
    }
    return 'en'
  }
}

/**
 * 拼写检查参数
 */
export interface SpellCheckParams {
  text: string
  format: 'text' | 'markdown' | 'latex'
  locale?: string // 用户选择的语言代码（可选，默认从系统获取）
}

/**
 * 拼写检查结果
 */
export interface SpellCheckIssue {
  offset: number
  length: number
  text: string
  suggestions?: string[]
}

export interface SpellCheckResult {
  issues: SpellCheckIssue[]
}

/**
 * 检查单词是否应该被忽略（基于命名规则）
 * @param word 要检查的单词
 * @returns 如果应该忽略返回 true，否则返回 false
 */
function shouldIgnoreWord(word: string): boolean {
  if (!word || word.length === 0) {
    return false
  }
  
  // 规则1: ALL_CAPS (length >= 2) → bypass
  // 全部大写，长度 >= 2
  if (word.length >= 2 && /^[A-Z0-9_]+$/.test(word) && /[A-Z]/.test(word)) {
    return true
  }
  
  // 规则2: PascalCase 且长度 > 3 → 优先忽略
  // 首字母大写，且包含至少一个小写字母，整体符合驼峰命名
  if (word.length > 3 && /^[A-Z][a-z0-9]+([A-Z][a-z0-9]*)*$/.test(word)) {
    return true
  }
  
  // 规则3: CamelCase → 忽略
  // 首字母小写，但包含大写字母，整体符合驼峰命名
  if (/^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/.test(word)) {
    return true
  }
  
  return false
}

/**
 * 从文本中提取单词（基于 offset 和 length）
 * 尝试提取完整的单词边界
 */
function extractWordAt(text: string, offset: number, length: number): string {
  if (offset < 0 || offset >= text.length) {
    return ''
  }
  
  // 单词边界字符（非字母数字的字符）
  const wordBoundary = /[^a-zA-Z0-9]/
  
  // 找到单词的开始位置
  let start = offset
  while (start > 0 && !wordBoundary.test(text[start - 1])) {
    start--
  }
  
  // 找到单词的结束位置
  let end = offset + length
  while (end < text.length && !wordBoundary.test(text[end])) {
    end++
  }
  
  return text.substring(start, end)
}

/**
 * 预处理文本，跳过不需要检查的内容
 * - Markdown: 跳过图片链接、代码框、公式
 * - LaTeX: 只检查标题和文本，跳过控制字符、连接、代码框等
 */
function preprocessText(text: string, format: 'text' | 'markdown' | 'latex'): string {
  if (format === 'markdown') {
    // 移除代码块（```...``` 或 ```language...```）
    text = text.replace(/```[\s\S]*?```/g, '')
    
    // 移除行内代码（`...`）
    text = text.replace(/`[^`]+`/g, '')
    
    // 移除图片链接（![alt](url) 或 ![alt](url "title")）
    text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    
    // 移除链接（但保留链接文本，因为链接文本可能需要检查）
    // 这里我们只移除 URL 部分，保留链接文本
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    
    // 移除 HTML 标签
    text = text.replace(/<[^>]+>/g, '')
    
    // 移除数学公式（$...$ 或 $$...$$）
    text = text.replace(/\$\$[\s\S]*?\$\$/g, '')
    text = text.replace(/\$[^$\n]+\$/g, '')
  } else if (format === 'latex') {
    // LaTeX: 只检查标题和文本内容，跳过控制字符、命令、环境等
    
    // 移除注释（% 开头的行）
    text = text.replace(/%.*$/gm, '')
    
    // 移除 LaTeX 命令（\command{...} 或 \command[...]{...}）
    // 但保留一些常见文本命令的内容，如 \textbf{text} 中的 text
    text = text.replace(/\\(?:textbf|textit|emph|textsc|textsl|texttt)\{([^}]+)\}/g, '$1')
    
    // 移除其他 LaTeX 命令（\command 或 \command{...}）
    text = text.replace(/\\[a-zA-Z@]+(\[[^\]]*\])?(\{[^}]*\})*/g, '')
    
    // 移除环境（\begin{env}...\end{env}）
    text = text.replace(/\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\}/g, '')
    
    // 移除代码环境（verbatim, lstlisting 等）
    text = text.replace(/\\begin\{(?:verbatim|lstlisting|minted|code)\}[\s\S]*?\\end\{(?:verbatim|lstlisting|minted|code)\}/g, '')
    
    // 移除数学公式（$...$ 或 $$...$$ 或 \[...\] 或 \(...\)）
    text = text.replace(/\$\$[\s\S]*?\$\$/g, '')
    text = text.replace(/\$[^$\n]+\$/g, '')
    text = text.replace(/\\\[[\s\S]*?\\\]/g, '')
    text = text.replace(/\\\([\s\S]*?\\\)/g, '')
    
    // 移除标签和引用（\label{...}, \ref{...}, \cite{...} 等）
    text = text.replace(/\\[a-zA-Z@]+\{[^}]+\}/g, '')
    
    // 移除特殊字符和连接符（保留普通文本）
    text = text.replace(/[{}%$&_^#~\\]/g, ' ')
  }
  
  return text
}

/**
 * 获取 cspell.json 配置文件路径
 * 配置文件已迁移到 resources 目录，与其他资源文件一起管理
 */
function getCSpellConfigPath(): string {
  // 使用 pathService 获取 resources 目录路径（开发环境和打包环境都能正确处理）
  const resourcesPath = pathService.getResourcesPath()
  return path.join(resourcesPath, 'cspell.json')
}

/**
 * 将词典 Set 写入临时 .txt 文件
 * @param words 单词集合
 * @param name 词典名称
 * @returns 词典文件路径
 */
function writeDictionaryFile(words: Set<string>, name: string): string {
  const userDataPath = app.getPath('userData')
  const dictDir = path.join(userDataPath, 'spell-check-dictionaries')
  
  // 确保目录存在
  if (!fs.existsSync(dictDir)) {
    fs.mkdirSync(dictDir, { recursive: true })
  }
  
  const dictPath = path.join(dictDir, `${name}.txt`)
  const wordsArray = Array.from(words).sort()
  fs.writeFileSync(dictPath, wordsArray.join('\n'), 'utf8')
  
  logger.debug(`[writeDictionaryFile] 已写入词典文件: ${dictPath}, 包含 ${wordsArray.length} 个单词`)
  // 验证文件是否真的写入成功
  if (fs.existsSync(dictPath)) {
    const fileStats = fs.statSync(dictPath)
    const fileContent = fs.readFileSync(dictPath, 'utf8')
    const lineCount = fileContent.split('\n').filter(line => line.trim()).length
    logger.debug(`[writeDictionaryFile] 验证词典文件: 文件大小 ${fileStats.size} 字节, 实际行数 ${lineCount}`)
    if (wordsArray.length > 0) {
      logger.debug(`[writeDictionaryFile] 词典文件前5个单词: ${wordsArray.slice(0, 5).join(', ')}`)
    }
  } else {
    logger.warn(`[writeDictionaryFile] 警告: 词典文件写入后不存在: ${dictPath}`)
  }
  return dictPath
}

/**
 * 加载并合并 cspell 配置
 * 这会自动加载 cspell.json 中定义的所有字典，并合并动态词典配置
 * 
 * 配置合并逻辑：
 * 1. 从 resources/cspell.json 加载基础配置（包含多语言字典定义）
 * 2. 添加动态词典（内置词典和自定义词典）
 * 3. 确保所有 dictionaryDefinitions 中的字典都被添加到 dictionaries 数组
 * 4. 移除 overrides 中的 language 字段，避免覆盖全局的多语言配置
 * 
 * @param cspellLib cspell-lib 模块
 * @param builtinDictPath 内置词典文件路径
 * @param customDictPath 自定义词典文件路径
 * @returns 合并后的配置对象（包含所有字典定义和启用的字典列表）
 */
async function loadCSpellConfig(
  cspellLib: any,
  builtinDictPath: string,
  customDictPath: string
): Promise<any> {
  try {
    const configPath = getCSpellConfigPath()
    logger.debug('[loadCSpellConfig] 加载配置文件:', configPath)
    
    // 检查文件是否存在
    if (!fs.existsSync(configPath)) {
      logger.warn('[loadCSpellConfig] 配置文件不存在:', configPath)
      // 即使配置文件不存在，也创建包含动态词典的基础配置
      return {
        version: '0.2',
        dictionaryDefinitions: [
          {
            name: 'metadoc-builtin',
            path: builtinDictPath,
            addWords: true
          },
          {
            name: 'metadoc-custom',
            path: customDictPath,
            addWords: true
          }
        ],
        dictionaries: [
          'metadoc-builtin',
          'metadoc-custom'
        ]
      }
    }
    
    // 加载主配置文件
    // 注意：直接读取 JSON 文件，而不是使用 loadConfig，因为 loadConfig 会错误解析 npm 包路径
    // loadConfig 会将 @cspell/dict-xxx 解析为错误的绝对路径，我们需要保留原始的 npm 包路径
    let baseConfig: any = {}
    try {
      const configContent = fs.readFileSync(configPath, 'utf-8')
      baseConfig = JSON.parse(configContent)
      logger.debug('[loadCSpellConfig] 从 JSON 文件加载配置成功，字典数量:', baseConfig?.dictionaries?.length || 0)
    } catch (parseError) {
      logger.warn('[loadCSpellConfig] 直接读取 JSON 文件失败，尝试使用 loadConfig:', parseError)
    }
    
    // 创建动态词典配置
    const dynamicConfig = {
      dictionaryDefinitions: [
        {
          name: 'metadoc-builtin',
          path: builtinDictPath,
          addWords: true
        },
        {
          name: 'metadoc-custom',
          path: customDictPath,
          addWords: true
        }
      ],
      dictionaries: [
        'metadoc-builtin',
        'metadoc-custom'
      ]
    }
    
    // 合并配置
    // 确保所有字典都被启用，支持多语言混合文档
    const mergedConfig = {
      ...baseConfig,
      dictionaryDefinitions: [
        ...(baseConfig.dictionaryDefinitions || []),
        ...dynamicConfig.dictionaryDefinitions
      ],
      dictionaries: [
        ...(baseConfig.dictionaries || []),
        ...dynamicConfig.dictionaries
      ]
    }
    
    // 确保所有字典定义中的字典都被添加到 dictionaries 数组
    // 这样可以确保所有配置的字典都被启用（包括所有语言字典）
    if (mergedConfig.dictionaryDefinitions && Array.isArray(mergedConfig.dictionaryDefinitions)) {
      const allDictNames = new Set(mergedConfig.dictionaries || [])
      for (const dictDef of mergedConfig.dictionaryDefinitions) {
        if (dictDef.name && !allDictNames.has(dictDef.name)) {
          allDictNames.add(dictDef.name)
          logger.debug('[loadCSpellConfig] 添加字典到启用列表:', dictDef.name)
        }
      }
      mergedConfig.dictionaries = Array.from(allDictNames)
      logger.debug('[loadCSpellConfig] 最终启用的字典列表（共', allDictNames.size, '个）:', Array.from(allDictNames).slice(0, 20).join(', '), allDictNames.size > 20 ? '...' : '')
      
      // 验证语言字典是否都在列表中
      const languageDicts = ['fr-fr', 'es-es', 'de-de', 'ru-ru']
      const missingLanguageDicts = languageDicts.filter(dict => !allDictNames.has(dict))
      if (missingLanguageDicts.length > 0) {
        logger.warn('[loadCSpellConfig] 警告: 以下语言字典未在启用列表中:', missingLanguageDicts)
      } else {
        logger.debug('[loadCSpellConfig] 所有语言字典都已启用')
      }
    }
    
    logger.debug('[loadCSpellConfig] 配置合并完成，总字典数量:', mergedConfig.dictionaries?.length || 0)
    logger.debug('[loadCSpellConfig] 字典列表:', mergedConfig.dictionaries)
    logger.debug('[loadCSpellConfig] 词典定义数量:', mergedConfig.dictionaryDefinitions?.length || 0)
    
    // 详细检查词典定义，确保路径正确
    if (mergedConfig.dictionaryDefinitions && Array.isArray(mergedConfig.dictionaryDefinitions)) {
      logger.debug('[loadCSpellConfig] 词典定义详情:')
      for (const dictDef of mergedConfig.dictionaryDefinitions) {
        if (dictDef.path && dictDef.path.endsWith('.txt')) {
          // 检查 .txt 词典文件是否存在
          const dictPath = dictDef.path
          if (fs.existsSync(dictPath)) {
            const fileStats = fs.statSync(dictPath)
            logger.debug(`[loadCSpellConfig]   - ${dictDef.name}: 路径存在, ${fileStats.size} 字节`)
          } else {
            logger.warn(`[loadCSpellConfig]   - ${dictDef.name}: 路径不存在: ${dictPath}`)
          }
        } else {
          logger.debug(`[loadCSpellConfig]   - ${dictDef.name}: ${dictDef.path || 'N/A'}`)
        }
      }
    }
    
    return mergedConfig
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.warn('[loadCSpellConfig] 加载配置文件失败:', errorMessage)
    // 配置加载失败时，仍然返回包含动态词典的基础配置
    return {
      version: '0.2',
      dictionaryDefinitions: [
        {
          name: 'metadoc-builtin',
          path: builtinDictPath,
          addWords: true
        },
        {
          name: 'metadoc-custom',
          path: customDictPath,
          addWords: true
        }
      ],
      dictionaries: [
        'metadoc-builtin',
        'metadoc-custom'
      ]
    }
  }
}

/**
 * 执行拼写检查
 */
export async function performSpellCheck(params: SpellCheckParams): Promise<SpellCheckResult> {
  const { text, format, locale } = params
  
  logger.info('[performSpellCheck] 开始拼写检查，文本长度:', text.length, '格式:', format)
  
  if (!text || text.trim().length === 0) {
    logger.warn('[performSpellCheck] 文本为空，返回空结果')
    return { issues: [] }
  }
  
  try {
    // 注释：由于现在 cspell 已支持 latex 和 markdown 格式，字典会自动处理这些格式，
    // 不再需要手动预处理文本（代码块、公式等会被 cspell 自动识别和跳过）
    // const processedText = preprocessText(text, format)
    // logger.debug('[performSpellCheck] 预处理后文本长度:', processedText.length)
    
    // 直接使用原始文本，让 cspell 的格式特定字典来处理
    const processedText = text
    
    if (!processedText || processedText.trim().length === 0) {
      logger.info('[performSpellCheck] 文本为空，返回空结果')
      return { issues: [] }
    }
    
    // 加载内置词典和用户自定义词典
    const builtinWords = getBuiltinDictionary()
    const customWords = loadCustomDictionary()
    
    logger.debug('[performSpellCheck] 加载词典完成，内置词典:', builtinWords.size, '个单词，用户自定义词典:', customWords.size, '个单词')
    
    // 生成临时词典文件
    const builtinDictPath = writeDictionaryFile(builtinWords, 'metadoc-builtin')
    const customDictPath = writeDictionaryFile(customWords, 'metadoc-custom')
    
    // 动态导入 cspell-lib（ESM 模块，必须使用 ESM 动态导入）
    // 注意：cspell-lib 是纯 ESM 模块，不能使用 require()
    const cspellLib = await import('cspell-lib')
    const { spellCheckDocument } = cspellLib
    
    // 加载并合并 cspell 配置（这会自动加载所有字典，包括 latex 和 markdown，并合并动态词典）
    const mergedConfig = await loadCSpellConfig(cspellLib, builtinDictPath, customDictPath)
    
    // 获取多语言配置（启用所有可用语言，支持多语言混合文档）
    const languageConfig = getMultiLanguageConfig(format)
    logger.debug('[performSpellCheck] 使用语言配置:', languageConfig, '格式:', format)
    logger.debug('[performSpellCheck] 启用的字典:', mergedConfig.dictionaries)
    
    // 确定文件扩展名和 languageId
    // 使用格式特定的 languageId 可以让 cspell 自动选择相应的字典
    const fileExtension = format === 'latex' ? '.tex' : format === 'markdown' ? '.md' : '.txt'
    const languageId = format === 'latex' ? 'latex' : format === 'markdown' ? 'markdown' : 'plaintext'
    
    // 将多语言配置添加到合并后的配置中
    // 关键：为了确保所有语言的字典都被使用，我们需要：
    // 1. 设置 language 字段为所有可用语言（cspell 会使用这些语言的所有字典）
    // 2. 确保 dictionaries 数组包含所有语言字典（明确启用所有字典）
    // 3. 完全禁用 languageSettings，避免限制字典使用
    // 4. 设置 allowCompoundWords 和 caseSensitive 等选项
    const finalConfig = {
      ...mergedConfig,
      language: languageConfig, // 多语言配置：启用所有可用语言，支持多语言混合文档
      suggestionsTimeout: 2000,
      // 完全禁用 languageSettings，避免限制字典使用
      // 对于多语言混合文档，我们需要所有字典都可用，而不是根据 languageId 限制
      languageSettings: [],
      // 确保所有字典都被使用
      allowCompoundWords: true,
      caseSensitive: false
    }
    
    // 调用 cspell-lib 进行拼写检查
    let result: any
    try {
      // 使用合并后的配置对象（包含 dictionaryDefinitions 和 dictionaries）
      // 注意：不再使用 words 参数，因为词典已通过 dictionaryDefinitions 配置
      logger.debug('[performSpellCheck] 准备调用 spellCheckDocument')
      logger.debug('[performSpellCheck] 配置中的字典:', mergedConfig.dictionaries)
      logger.debug('[performSpellCheck] 配置中的词典定义数量:', mergedConfig.dictionaryDefinitions?.length || 0)
      logger.debug('[performSpellCheck] 配置中的 language 字段（多语言）:', finalConfig.language)
      logger.debug('[performSpellCheck] document.languageId (格式):', languageId)
      
      result = await spellCheckDocument(
        {
          uri: `file:///temp${fileExtension}`,
          text: processedText, // 使用原始文本，cspell 会根据格式自动处理
          languageId: languageId, // 使用格式特定的 languageId，cspell 会自动选择相应字典
          // 注意：不设置 locale，让配置中的 language 字段生效
          // language 字段支持多语言（逗号分隔），cspell 会使用所有指定的语言进行检查
        } as Document,
        {
          noConfigSearch: true
        } as SpellCheckFileOptions,
        finalConfig // 使用包含 language 字段的最终配置
      )
      
      // 检查结果中使用的配置（用于调试）
      if (result?.settingsUsed) {
        logger.debug('[performSpellCheck] cspell 实际使用的字典:', result.settingsUsed.dictionaries)
        logger.debug('[performSpellCheck] cspell 实际使用的词典定义数量:', result.settingsUsed.dictionaryDefinitions?.length || 0)
        logger.debug('[performSpellCheck] cspell 实际使用的 language 字段:', result.settingsUsed.language)
        logger.debug('[performSpellCheck] cspell 实际使用的 locale 字段:', result.settingsUsed.locale)
        
        // 检查是否所有预期的字典都被使用
        if (result.settingsUsed.dictionaries && Array.isArray(result.settingsUsed.dictionaries)) {
          const expectedDicts = ['metadoc-builtin', 'metadoc-custom', 'fr-fr', 'es-es', 'de-de', 'ru-ru']
          const missingDicts = expectedDicts.filter((dict: string) => !result.settingsUsed.dictionaries.includes(dict))
          if (missingDicts.length > 0) {
            logger.warn('[performSpellCheck] 警告: 以下预期字典未在 cspell 实际使用的配置中:', missingDicts)
            logger.debug('[performSpellCheck] 实际使用的字典列表:', result.settingsUsed.dictionaries.join(', '))
          } else {
            logger.debug('[performSpellCheck] 所有预期字典都在使用中')
          }
          
          // 检查语言字典是否被使用
          const languageDicts = ['fr-fr', 'es-es', 'de-de', 'ru-ru']
          const usedLanguageDicts = languageDicts.filter((dict: string) => result.settingsUsed.dictionaries.includes(dict))
          logger.debug('[performSpellCheck] 实际使用的语言字典:', usedLanguageDicts.join(', '))
        }
      }
    } catch (configError) {
      const errorMessage = configError instanceof Error ? configError.message : String(configError)
      logger.warn('[performSpellCheck] 拼写检查失败:', errorMessage)
      throw configError
    }
    
    // 检查 result 是否有效
    if (!result) {
      logger.warn('[performSpellCheck] cspell 返回空结果')
      return { issues: [] }
    }
    
    // 转换结果格式
    // 注意：由于不再预处理文本，processedText === text，offset 可以直接使用，无需映射
    const issues: SpellCheckIssue[] = []
    if (result.issues && Array.isArray(result.issues) && result.issues.length > 0) {
      logger.debug(`[performSpellCheck] cspell 返回 ${result.issues.length} 个原始错误`)
      
      // 收集所有错误单词用于调试
      const errorWords = new Set<string>()
      const errorWordsWithSuggestions = new Map<string, number>() // 单词 -> 建议数量
      for (const issue of result.issues) {
        if (issue?.text) {
          const word = issue.text.toLowerCase()
          errorWords.add(word)
          const suggestionCount = issue.suggestions && Array.isArray(issue.suggestions) ? issue.suggestions.length : 0
          errorWordsWithSuggestions.set(word, suggestionCount)
        }
      }
      logger.debug(`[performSpellCheck] cspell 检测到的错误单词（前20个）:`, Array.from(errorWords).slice(0, 20).join(', '))
      
      // 统计有建议和无建议的单词数量
      const wordsWithSuggestions = Array.from(errorWordsWithSuggestions.entries()).filter(([_, count]) => count > 0).length
      const wordsWithoutSuggestions = Array.from(errorWordsWithSuggestions.entries()).filter(([_, count]) => count === 0).length
      logger.debug(`[performSpellCheck] 错误单词统计: 有建议 ${wordsWithSuggestions} 个, 无建议 ${wordsWithoutSuggestions} 个`)
      
      // 由于不再预处理，文本没有变化，offset 可以直接使用
      const needsMapping = false // processedText === text，无需映射
      
      for (const issue of result.issues) {
        // 验证 issue 对象
        if (!issue || typeof issue !== 'object') {
          logger.warn('[performSpellCheck] 跳过无效的 issue 对象:', issue)
          continue
        }
        
        let originalOffset = issue.offset ?? 0
        let originalLength = issue.length ?? (issue.text?.length ?? 0)
        let errorText = issue.text || ''
        
        // 如果预处理改变了文本，尝试映射 offset
        // 使用错误文本在原始文本中查找对应位置
        if (needsMapping) {
          errorText = issue.text || processedText.substring(originalOffset, originalOffset + originalLength)
          if (errorText && errorText.trim().length > 0) {
            // 首先在预处理 offset 附近搜索（更可能找到正确位置）
            const searchRadius = Math.min(500, text.length)
            const searchStart = Math.max(0, originalOffset - searchRadius)
            const searchEnd = Math.min(text.length, originalOffset + searchRadius + errorText.length)
            const searchArea = text.substring(searchStart, searchEnd)
            let foundIndex = searchArea.indexOf(errorText)
            
            if (foundIndex !== -1) {
              originalOffset = searchStart + foundIndex
            } else {
              // 如果附近找不到，在整个文本中搜索（作为备选）
              foundIndex = text.indexOf(errorText)
              if (foundIndex !== -1) {
                originalOffset = foundIndex
              } else {
                // 如果完全找不到，记录警告但保留原始 offset
                logger.warn('[performSpellCheck] 无法在原始文本中找到错误文本:', errorText)
              }
            }
          }
        }
        
        // 如果还没有获取错误文本，从原始文本中提取
        if (!errorText) {
          errorText = text.substring(originalOffset, originalOffset + originalLength)
        }
        
        // 检查是否应该忽略（基于命名规则）
        if (errorText && shouldIgnoreWord(errorText)) {
          logger.debug(`[performSpellCheck] 忽略符合命名规则的单词: "${errorText}"`)
          continue
        }
        
        // 如果错误文本只是部分单词，尝试提取完整单词并再次检查
        const fullWord = extractWordAt(text, originalOffset, originalLength)
        if (fullWord && fullWord !== errorText && shouldIgnoreWord(fullWord)) {
          logger.debug(`[performSpellCheck] 忽略符合命名规则的完整单词: "${fullWord}"`)
          continue
        }
        
        // 获取建议列表
        const suggestions = issue.suggestions && Array.isArray(issue.suggestions) ? issue.suggestions : []
        
        // 关键修复：跳过无建议的 issue
        // 原因：
        // 1. 如果单词在字典中，cspell 不应该报告它为错误
        // 2. 如果单词不在字典中，cspell 应该提供建议
        // 3. 无建议 + 被标记为错误 = 很可能是配置问题，字典未正确使用
        // 在这种情况下，跳过这些错误，避免误报
        if (suggestions.length === 0) {
          logger.debug(`[performSpellCheck] 跳过单词 "${errorText}"，因为无建议（可能是字典未正确使用）`)
          continue
        }
        
        // 如果建议列表包含单词本身，说明 cspell 认为单词是正确的（可能是误报）
        // 这种情况应该跳过
        if (suggestions.length > 0 && suggestions.some((s: string) => s.toLowerCase() === errorText.toLowerCase())) {
          logger.debug(`[performSpellCheck] 跳过单词 "${errorText}"，因为建议列表包含它本身（可能是误报）`)
          continue
        }
        
        // 如果单词在自定义词典或内置词典中，应该跳过
        // 注意：这里我们只检查自定义和内置词典，因为 cspell 应该已经检查了语言字典
        const wordLower = errorText.toLowerCase()
        if (builtinWords.has(wordLower) || customWords.has(wordLower)) {
          logger.debug(`[performSpellCheck] 跳过单词 "${errorText}"，因为它在自定义或内置词典中`)
          continue
        }
        issues.push({
          offset: originalOffset,
          length: originalLength,
          text: errorText,
          suggestions: suggestions.length > 0 ? suggestions : undefined
        })
      }
      
      logger.debug(`[performSpellCheck] 过滤后剩余 ${issues.length} 个问题（原始 ${result.issues.length} 个）`)
      if (issues.length > 0) {
        const finalErrorWords = issues.map(i => i.text.toLowerCase()).slice(0, 20)
        logger.debug(`[performSpellCheck] 最终错误单词（前20个）:`, finalErrorWords.join(', '))
      }
    }
    
    logger.info('[performSpellCheck] ✅ 拼写检查完成，发现', issues.length, '个问题')
    return { issues }
    
  } catch (error) {
    logger.error('[performSpellCheck] 拼写检查失败:', error)
    throw new Error(`拼写检查失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

