import { buildSchemaPrompt, DOCUMENT_TITLE_SCHEMA } from './schemas'
import { i18n } from '../i18n.js'
import { generateMarkdownFromOutlineTree } from './document/outline'
import type { DocumentOutlineNode } from '../../../types'
import { createRendererLogger } from './logger'

// 语言到提示词配置的映射（使用动态导入）
let promptsMapCache: Record<string, any> | null = null

/**
 * 动态加载提示词配置
 */
async function loadPromptsMap(): Promise<Record<string, any>> {
  if (promptsMapCache) {
    return promptsMapCache
  }

  try {
    const [
      zh_CN_prompts,
      zh_TW_prompts,
      en_US_prompts,
      ja_JP_prompts,
      ko_KR_prompts,
      de_DE_prompts,
      fr_FR_prompts,
      es_ES_prompts,
      pt_BR_prompts,
      ru_RU_prompts
    ] = await Promise.all([
      import('./locale_prompts/zh_CN.json'),
      import('./locale_prompts/zh_TW.json'),
      import('./locale_prompts/en_US.json'),
      import('./locale_prompts/ja_JP.json'),
      import('./locale_prompts/ko_KR.json'),
      import('./locale_prompts/de_DE.json'),
      import('./locale_prompts/fr_FR.json'),
      import('./locale_prompts/es_ES.json'),
      import('./locale_prompts/pt_BR.json'),
      import('./locale_prompts/ru_RU.json')
    ])

    promptsMapCache = {
      zh_CN: zh_CN_prompts.default || zh_CN_prompts,
      zh_TW: zh_TW_prompts.default || zh_TW_prompts,
      en_US: en_US_prompts.default || en_US_prompts,
      ja_JP: ja_JP_prompts.default || ja_JP_prompts,
      ko_KR: ko_KR_prompts.default || ko_KR_prompts,
      de_DE: de_DE_prompts.default || de_DE_prompts,
      fr_FR: fr_FR_prompts.default || fr_FR_prompts,
      es_ES: es_ES_prompts.default || es_ES_prompts,
      pt_BR: pt_BR_prompts.default || pt_BR_prompts,
      ru_RU: ru_RU_prompts.default || ru_RU_prompts
    }

    return promptsMapCache
  } catch (error) {
    console.error('Failed to load prompts:', error)
    // 返回默认的中文配置
    return {
      zh_CN: { suggestionPresets: [], presets: [] },
      zh_TW: { suggestionPresets: [], presets: [] },
      en_US: { suggestionPresets: [], presets: [] },
      ja_JP: { suggestionPresets: [], presets: [] },
      ko_KR: { suggestionPresets: [], presets: [] },
      de_DE: { suggestionPresets: [], presets: [] },
      fr_FR: { suggestionPresets: [], presets: [] },
      es_ES: { suggestionPresets: [], presets: [] },
      pt_BR: { suggestionPresets: [], presets: [] },
      ru_RU: { suggestionPresets: [], presets: [] }
    }
  }
}

/**
 * 获取当前语言的提示词配置（同步版本，使用缓存）
 */
export function getCurrentLocalePrompts() {
  const currentLocale = getCurrentLocale()

  // 如果缓存未加载，返回空数组（会在首次使用时异步加载）
  if (!promptsMapCache) {
    // 异步加载，但不阻塞
    loadPromptsMap().catch(console.error)
    return { suggestionPresets: [], presets: [] }
  }

  return (
    promptsMapCache[currentLocale] ||
    promptsMapCache['zh_CN'] || { suggestionPresets: [], presets: [] }
  )
}

// 预加载提示词配置
if (typeof window !== 'undefined') {
  loadPromptsMap()
}

/**
 * 获取当前语言代码（用于判断是否为中文）
 */
export function getCurrentLocale(): string {
  const locale = (i18n.global.locale as any).value || i18n.global.locale || 'zh_CN'
  return String(locale)
}

/**
 * 判断当前语言是否为中文
 */
export function isChineseLocale(): boolean {
  const locale = getCurrentLocale()
  return locale === 'zh_CN' || locale.startsWith('zh')
}

/**
 * 从配置中获取提示词模板并替换占位符（内部用）
 */
function getPromptTemplate(key: string, replacements: Record<string, string> = {}): string {
  const template = getPromptByKey(key, replacements)
  const logger = createRendererLogger('Prompts')
  logger.debug('getPromptTemplate: ' + template)
  return template
}

/**
 * 按 key 获取提示词模板，支持占位符替换；若当前语言无该 key 则回退到 zh_CN。
 * 供 Agent/Subagent/工具等从 locale_prompts 统一读取 prompt 使用。
 */
/**
 * 从 prompts 对象中按点号路径取值（支持嵌套，如 sectionChangePrompt.base）
 */
function getNestedPrompt(promptsObj: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!promptsObj || typeof promptsObj !== 'object') return undefined
  // 支持扁平 key（如 "agent.toolCallSpec.prompt" 作为整段 key 名）
  const direct = promptsObj[key]
  if (direct !== undefined && typeof direct === 'string') return direct
  const parts = key.split('.')
  let current: unknown = promptsObj
  for (const p of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[p]
  }
  if (typeof current !== 'string') return undefined
  return current
}

export function getPromptByKey(
  key: string,
  replacements: Record<string, string> = {}
): string {
  const current = getCurrentLocalePrompts()
  let template = getNestedPrompt(
    current.prompts as Record<string, unknown> | undefined,
    key
  )
  if (template == null || String(template).trim() === '') {
    const zh = promptsMapCache?.['zh_CN']
    template =
      getNestedPrompt(zh?.prompts as Record<string, unknown> | undefined, key) ?? ''
  }
  template = String(template ?? '')
  Object.keys(replacements).forEach((placeholder) => {
    const value = replacements[placeholder]
    template = template.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), value)
  })
  return template
}

export const generateTitlePrompt = (treeJson: string): string => {
  // 如果传入的是JSON字符串，转换为完整版Markdown
  let outlineText = treeJson
  if (treeJson.trim().startsWith('{')) {
    try {
      const tree = JSON.parse(treeJson) as DocumentOutlineNode
      outlineText = generateMarkdownFromOutlineTree(tree)
    } catch {
      outlineText = treeJson
    }
  }

  const template = getPromptTemplate('generateTitlePrompt', {
    treeJson: outlineText || '（暂无大纲结构）'
  })

  if (template) {
    return template
  }

  return `你是一个文笔出色的编辑，以下是一篇文章的大纲结构，请自动判断文章在讲什么，并生成一个标题。

**输出要求：**
- 请直接输出标题，建议从第一行开始就是标题
- 标题长度应在15字以内
- 优先输出标题内容，避免添加不必要的前缀或解释

文章大纲：
${outlineText}` //fallback
}

export const generateDescriptionPrompt = (treeJson: string): string => {
  // 如果传入的是JSON字符串，转换为完整版Markdown
  let outlineText = treeJson
  if (treeJson.trim().startsWith('{')) {
    try {
      const tree = JSON.parse(treeJson) as DocumentOutlineNode
      outlineText = generateMarkdownFromOutlineTree(tree)
    } catch {
      outlineText = treeJson
    }
  }
  const template = getPromptTemplate('generateDescriptionPrompt', {
    treeJson: outlineText || '（暂无大纲结构）'
  })

  if (template) {
    return template
  }

  return `你是一个文笔出色的编辑，以下是一篇文章的大纲结构，请自动判断文章在讲什么，并生成一篇文章摘要。

**输出要求：**
- 请直接输出摘要内容，类似于“本文主要介绍了...”
- 摘要长度应在200字以内

文章大纲：
${outlineText}` //fallback
}

export const generateKeywordsPrompt = (treeJson: string): string => {
  // 如果传入的是JSON字符串，转换为完整版Markdown
  let outlineText = treeJson
  if (treeJson.trim().startsWith('{')) {
    try {
      const tree = JSON.parse(treeJson) as DocumentOutlineNode
      outlineText = generateMarkdownFromOutlineTree(tree)
    } catch {
      outlineText = treeJson
    }
  }

  const template = getPromptTemplate('generateKeywordsPrompt', { treeJson: outlineText })
  return (
    template ||
    `你是一个专业的文档编辑助手，以下是一篇文档的大纲结构：
${outlineText}

请根据全文内容生成 5-8 个高质量的关键词。

**输出要求：**
- 请直接输出一个 JSON 数组，例如 ["人工智能","文字处理"]
- 建议从第一行开始就是JSON数组，避免添加不必要的解释或前缀
- 如果确实需要说明，请保持简洁，优先输出JSON数组`
  )
}

/**
 * 根据本节标题与整体大纲生成推荐关键词的提示词（用于大纲 AI 配置）
 */
export const generateOutlineSectionKeywordsPrompt = (
  sectionTitle: string,
  outlineMarkdown: string
): string => {
  const template = getPromptTemplate('generateOutlineSectionKeywordsPrompt', {
    sectionTitle: sectionTitle || '（未命名章节）',
    outlineMarkdown: outlineMarkdown || '（暂无大纲）'
  })
  return (
    template ||
    `你是一个专业的文档编辑助手。当前需要为大纲中的某一节生成「推荐关键词」，用于指导 AI 撰写该节内容。

**本节标题：** ${sectionTitle || '（未命名章节）'}

**整体大纲（Markdown）：**
${outlineMarkdown || '（暂无大纲）'}

请根据本节标题与整体大纲的语境，生成 5-8 个推荐关键词。例如：
- 若标题偏向技术/算法（如「xxx算法介绍」），可推荐：严谨、学术风、计算机、逻辑清晰 等；
- 若标题偏向文学/赏析（如「xxx文学赏析」），可推荐：抒情、发散、创意、文采 等。

**输出要求：** 请严格输出符合给定 JSON Schema 的结果，仅包含 keywords 数组，不要添加解释。`
  )
}

/**
 * 新建/编辑素材：根据用户提示生成素材标题（i18n）
 */
export const getNewMaterialTitlePrompt = (userPrompt: string): string => {
  const template = getPromptTemplate('newMaterialGenerateTitlePrompt', {
    userPrompt: userPrompt || '（未填写）'
  })
  return (
    template ||
    `你是一个文档编辑助手。用户正在创建一条「文章素材」——即一段可直接插入到文档中的文章段落草稿（尚未决定是否正式加入文章）。当前用户给出的提示词或方向如下：

**用户提示：** ${userPrompt || '（未填写）'}

请根据上述提示，生成一个简洁的素材标题（15字以内）。须严格遵循用户在提示词中的要求。

**输出要求：** 直接输出标题本身，从第一行开始，不要添加引号、前缀或解释。`
  )
}

/**
 * 新建/编辑素材：根据标题与提示生成推荐关键词（i18n）
 */
export const getNewMaterialKeywordsPrompt = (
  sectionTitle: string,
  userPrompt: string,
  outlineMarkdown: string
): string => {
  const template = getPromptTemplate('newMaterialGenerateKeywordsPrompt', {
    sectionTitle: sectionTitle || '（未命名）',
    userPrompt: userPrompt || '（未填写）',
    outlineMarkdown: outlineMarkdown || '（暂无大纲）'
  })
  return (
    template ||
    `你是一个专业的文档编辑助手。当前需要为一条「文章素材」生成「推荐关键词」。文章素材即可直接插入文档的文章段落草稿。

**素材标题：** ${sectionTitle || '（未命名）'}

**用户提示词/方向：** ${userPrompt || '（未填写）'}

**整体大纲（Markdown）：**
${outlineMarkdown || '（暂无大纲）'}

请根据标题与提示的语境，生成 5-8 个推荐关键词。须符合用户在提示词中的规约。

**输出要求：** 请严格输出符合给定 JSON Schema 的结果，仅包含 keywords 数组，不要添加解释。`
  )
}

/**
 * 新建/编辑素材：根据标题、提示与关键词生成正文（i18n）
 */
export const getNewMaterialContentPrompt = (
  title: string,
  userPrompt: string,
  keywords: string
): string => {
  const template = getPromptTemplate('newMaterialGenerateContentPrompt', {
    title: title || '（未命名）',
    userPrompt: userPrompt || '（未填写）',
    keywords: keywords || '（无）'
  })
  return (
    template ||
    `你是一个文笔出色的编辑。用户正在为「文章素材」生成正文。文章素材即可直接插入到文档中的段落草稿（尚未决定是否正式加入文章），本质就是一段可复用的文档内容。

**素材标题：** ${title || '（未命名）'}

**用户提示词：** ${userPrompt || '（未填写）'}

**关键词：** ${keywords || '（无）'}

请根据标题、提示词与关键词，直接撰写该素材的正文内容。必须严格遵守用户在提示词中提出的格式、风格、长度、禁止事项等一切规约，不得无视或偏离。

**输出要求：** 直接输出正文，从第一行开始就是内容，使用 Markdown 格式。`
  )
}

export const sectionChangePrompt = (
  tree: string,
  section: string,
  title: string,
  userPrompt: string,
  contextMode: number,
  article: string,
  language: 'markdown' | 'latex' = 'markdown'
): string => {
  // 对于mode1，如果tree是JSON格式，转换为完整版Markdown
  let treeText = tree
  if (contextMode === 1 && tree.trim().startsWith('{')) {
    try {
      const treeObj = JSON.parse(tree) as DocumentOutlineNode
      treeText = generateMarkdownFromOutlineTree(treeObj)
    } catch {
      treeText = tree
    }
  }
  const formatRequirement =
    language === 'latex'
      ? '请使用规范的LaTeX语法输出，注意不要输出\\documentclass、\\begin{document}、\\end{document}等命令，只输出章节内容部分。记住：禁止复述提示词，禁止说"根据您的要求"、"我将为您"、"好的"、"明白了"等，输出必须从第一行开始就是正文内容。'
      : '请使用Markdown格式输出。记住：禁止复述提示词，禁止说"根据您的要求"、"我将为您"、"好的"、"明白了"等，输出必须从第一行开始就是修改后的章节内容，没有任何其他文字。'

  const base = getPromptByKey('sectionChangePrompt.base')
  const ending = getPromptByKey('sectionChangePrompt.ending') || formatRequirement
  if (base) {
    let prompt = base
    switch (contextMode) {
      case 0:
        prompt += getPromptByKey('sectionChangePrompt.mode0', { title, userPrompt })
        break
      case 1:
        prompt += !section
          ? getPromptByKey('sectionChangePrompt.mode1_empty', { tree: treeText, title, userPrompt })
          : getPromptByKey('sectionChangePrompt.mode1_hasContent', {
              tree: treeText,
              title,
              section,
              userPrompt
            })
        break
      case 2:
        prompt += !section
          ? getPromptByKey('sectionChangePrompt.mode2_empty', { article, title, userPrompt })
          : getPromptByKey('sectionChangePrompt.mode2_hasContent', {
              article,
              title,
              section,
              userPrompt
            })
        break
      default:
        break
    }
    prompt += ending
    return prompt
  }

  // 回退到原始实现
  let prompt = '你是一个文笔出色的AI文本编辑助手，'
  switch (contextMode) {
    case 0:
      prompt += `现在用户有生成内容的需求，请根据用户的提示词进行文字编写。"。当前需要处理的章节标题是："${title}"，用户提示词如下："${userPrompt}"。`
      break
    case 1:
      prompt += `现在用户有一篇文章，其中有一个章节需要你修改或生成。以下是文章的大纲结构：\n${treeText}\n\n当前需要处理的章节标题是："${title}"，`
      prompt += !section
        ? '章节内容为空，需要你根据用户提示词来生成这一节。'
        : `需要修改的原本章节内容是："${section}"，`
      prompt += `用户提示词如下："${userPrompt}"。`
      break
    case 2:
      prompt += `现在用户有一篇文章，其中有一个章节需要你修改或生成。以下是原本的全部文章内容："${article}"。当前需要处理的章节标题是："${title}"，`
      prompt += !section
        ? '章节内容为空，需要你来生成这一节。'
        : `需要修改的原本章节内容是："${section}"，`
      prompt += `用户提示词如下："${userPrompt}"。`
      break
    default:
      break
  }
  prompt += formatRequirement
  prompt +=
    '\n\n**输出要求：**\n- 请直接输出修改或生成的内容，建议从第一行开始就是正文\n- 建议避免复述提示词或添加不必要的解释\n- 如果确实需要说明，请保持简洁，优先输出正文内容'
  return prompt
}

export const outlineChangePrompt = (
  fullTreeJson: string,
  nodeTreeJson: string,
  userPrompt: string
): string => {
  // 转换全文大纲为完整版Markdown
  let fullTreeText = fullTreeJson
  if (fullTreeJson.trim().startsWith('{')) {
    try {
      const tree = JSON.parse(fullTreeJson) as DocumentOutlineNode
      fullTreeText = generateMarkdownFromOutlineTree(tree)
    } catch {
      fullTreeText = fullTreeJson
    }
  }

  // nodeTreeJson保持原样，因为可能需要节点信息
  const template = getPromptTemplate('outlineChangePrompt', {
    fullTreeJson: fullTreeText,
    nodeTreeJson,
    userPrompt
  })
  return (
    template ||
    `你是一个文笔出色的编辑，现在有一篇文章大纲，全文大纲如下：

${fullTreeText}

当前章节是："${nodeTreeJson}"，以下是用户的需求："${userPrompt}"，请根据用户需求，结合本章节在全文的上下文结构，尝试生成本章节的大纲（Markdown格式）一个标题占一行，如果有多层结构，使用分级标题。

**输出要求：**
- 请直接输出本章节的子大纲（Markdown格式），而不是全文大纲
- 建议从第一行开始就是标题，优先输出大纲内容
- 如果确实需要说明，请保持简洁，优先输出大纲`
  )
}

export const generateArticlePrompt = (mood: string[], userPrompt: string): string => {
  const normalizedMood = Array.isArray(mood) && mood.length ? mood : ['平和']
  const template = getPromptTemplate('generateArticlePrompt', {
    userPrompt,
    mood: normalizedMood.toString()
  })
  return (
    template ||
    `你是一个文笔出色的编辑，现在用户需要你为他写一篇文章，以下是用户的需求："${userPrompt}"，除此之外，你应当使用${normalizedMood.toString()}的情绪与口吻来撰写文章。

**输出要求：**
- 请直接输出文章内容，建议从第一行开始就是正文
- 优先输出文章内容本身，避免添加不必要的前缀或解释
- 如果确实需要说明，请保持简洁，优先输出正文`
  )
}

/**
 * 生成 LaTeX 文档的提示词
 */
export const generateLatexPrompt = (mood: string[], userPrompt: string): string => {
  const basePrompt = generateArticlePrompt(mood, userPrompt)
  const template = getPromptTemplate('latexPrompt', { basePrompt })
  return (
    template ||
    `${basePrompt}\n请使用规范的 LaTeX 语法输出完整文档，包括必要的章节结构，禁止输出额外解释。`
  )
}

/**
 * 生成 Markdown 文档的提示词
 */
export const generateMarkdownPrompt = (mood: string[], userPrompt: string): string => {
  const basePrompt = generateArticlePrompt(mood, userPrompt)
  const template = getPromptTemplate('markdownPrompt', { basePrompt })
  return template || basePrompt
}

export const wholeArticleContextPrompt = (content: string): string => {
  const template = getPromptTemplate('wholeArticleContextPrompt', { content })
  return (
    template ||
    `你是一个文笔出色的编辑，现在我手上有一篇文档，内容如下：：：【文章开始】"${content}"【文章结束】；；；你需要理解文档意思，并根据我的提示词来进一步生成内容。

**输出要求：**
- 请直接输出生成的内容，建议从第一行开始就是正文
- 优先输出生成的内容本身，避免添加不必要的前缀或解释
- 如果确实需要说明，请保持简洁，优先输出正文`
  )
}

/**
 * 导出为模板时，根据文档内容与元信息生成模板标题与描述（用于「AI生成」按钮）
 * 输出格式要求：第一行「标题：xxx」，第二行起「描述：xxx」
 */
export const generateTemplateTitleDescriptionPrompt = (
  contentExcerpt: string,
  metaTitle: string,
  metaDescription: string
): string => {
  const template = getPromptTemplate('generateTemplateTitleDescriptionPrompt', {
    contentExcerpt: contentExcerpt || '（无正文）',
    metaTitle: metaTitle || '（无）',
    metaDescription: metaDescription || '（无）'
  })
  if (template) return template
  return `你是一个文档编辑助手。用户要将当前文档导出为「文档模板」，需要你根据文档内容和现有元信息，生成简洁的「模板标题」和「模板描述」。

**现有元信息：**
- 标题：${metaTitle || '（无）'}
- 描述/摘要：${metaDescription || '（无）'}

**文档内容摘要（前文）：**
${contentExcerpt || '（无正文）'}

**输出要求（必须严格按以下格式，仅输出两行）：**
标题：（一行，15字以内，概括文档用途或类型）
描述：（一行或数行，50字以内，说明该模板的适用场景）`
}

export interface SuggestionPreset {
  label: string
  prompt: string
}

/**
 * 获取当前语言的预设提示词（用于快速开始界面的建议按钮）
 */
export function getSuggestionPresets(): SuggestionPreset[] {
  const prompts = getCurrentLocalePrompts()
  return prompts.suggestionPresets || []
}

/**
 * 导出为计算属性，保持向后兼容
 * 注意：由于需要动态加载，这里返回一个函数调用结果
 * 调用者应该使用 getSuggestionPresets() 函数而不是直接使用常量
 */
export const suggestionPresets: SuggestionPreset[] = getSuggestionPresets()

export const explainWordPrompt = (word: string, contexts?: string[]): string => {
  const contextText =
    contexts && contexts.length > 0
      ? `\n\n以下是在文档中出现的上下文片段，请结合这些上下文给出更符合文章语境的解释：\n${contexts.map((ctx, idx) => `${idx + 1}. ${ctx}`).join('\n')}`
      : ''
  return getPromptByKey('explainWordPrompt', { word, contexts: contextText })
}

export const generateGraphPrompt = (
  engine: string,
  type: string,
  prompt: string,
  specialPrompt?: string
): string => {
  const specialPromptText = specialPrompt ? `另外，需要注意：${specialPrompt}` : ''
  const template = getPromptTemplate('generateGraphPrompt', {
    engine,
    type,
    prompt,
    specialPrompt: specialPromptText
  })
  return (
    template ||
    `你现在需要使用代码来画出一个图表，你需要使用${engine}的图形语言，图表类型是：${type}，用户的提示词是：${prompt}，请根据用户的提示词来生成图表。

**输出要求：**
- 请输出代码，代码要用代码框\`\`\`${engine}\`\`\`包裹，并且代码框要包含图形语言的名称${specialPromptText}
- 建议从第一行开始就是代码框，优先输出代码内容
- 如果确实需要说明，请保持简洁，优先输出代码`
  )
}

export const expandTreeNodePrompt = (
  treeJson: string,
  nodeJson: string,
  schema: string,
  userPrompt = ''
): string => {
  const userPromptText = userPrompt ? `除此之外，用户提示词如下，可供部分参考：${userPrompt}。` : ''
  const template = getPromptTemplate('expandTreeNodePrompt', {
    treeJson,
    nodeJson,
    schema,
    userPrompt: userPromptText
  })
  return (
    template ||
    `你是一个文笔出色的编辑，以下是一篇文章大纲的树形json结构，请判断文章的大致大纲结构:${treeJson}接下来，你要扩展其中的一个节点，为节点添加若干个子章节节点，需要扩展的节点如下：${nodeJson}，请根据节点的标题和文本内容，自动生成若干个子章节节点，以JSON列表的方式返回,类似于[{...},{...}]节点的格式与原节点相同，需要遵循如下规范:${schema}。${userPromptText}

**输出要求：**
- 请返回JSON格式的节点列表
- 建议从第一行开始就是JSON数组，优先输出JSON内容
- 如果确实需要说明，请保持简洁，优先输出JSON数组`
  )
}

export const generateContentPrompt = (
  treeJson: string,
  nodeJson: string,
  userPrompt = ''
): string => {
  const userPromptText = userPrompt ? `除此之外，用户提示词如下，可供部分参考：${userPrompt}。` : ''
  const template = getPromptTemplate('generateContentPrompt', {
    treeJson,
    nodeJson,
    userPrompt: userPromptText
  })
  return (
    template ||
    `你是一个文笔出色的编辑，以下是一篇文章大纲的树形json结构，请判断文章的大致大纲结构:${treeJson}${userPromptText}接下来，你要根据全文的结构，为以下的章节撰写内容，注意不要泛泛而谈，内容要丰富翔实：${nodeJson}。

**输出要求：**
- 请直接输出章节内容，建议从第一行开始就是正文
- 优先输出正文内容，避免添加不必要的前缀或解释
- 如果确实需要说明，请保持简洁，优先输出正文内容`
  )
}

export const generateParentNodeContentPrompt = (
  treeJson: string,
  nodeJson: string,
  userPrompt = ''
): string => {
  const userPromptText = userPrompt ? `除此之外，用户提示词如下，可供部分参考：${userPrompt}。` : ''
  const template = getPromptTemplate('generateParentNodeContentPrompt', {
    treeJson,
    nodeJson,
    userPrompt: userPromptText
  })
  return (
    template ||
    `你是一个文笔出色的编辑，以下是一篇文章大纲的树形json结构，请判断文章的大致大纲结构:${treeJson}接下来，你要根据全文的结构，为以下的章节撰写内容。由于这个章节已经有子章节介绍详细内容，因此你只需要写一些总体性、引导性的文字即可，不需要太多：${nodeJson}${userPromptText}。

**输出要求：**
- 请直接输出章节内容，建议从第一行开始就是正文
- 优先输出正文内容，避免添加不必要的前缀或解释
- 如果确实需要说明，请保持简洁，优先输出正文内容`
  )
}

/**
 * 扩写内容提示词
 */
export const expandContentPrompt = (
  treeJson: string,
  nodeJson: string,
  currentContent: string,
  userPrompt = '',
  wordCount?: number
): string => {
  const wordCountText = wordCount ? `目标字数约为${wordCount}字。` : ''
  const userPromptText = userPrompt ? `用户额外要求：${userPrompt}。` : ''
  const template = getPromptTemplate('expandContentPrompt', {
    treeJson,
    nodeJson,
    currentContent,
    userPrompt: userPromptText,
    wordCount: wordCountText
  })
  return (
    template ||
    `你是一个文笔出色的编辑，以下是一篇文章大纲的树形json结构：${treeJson}。当前需要处理的章节是：${nodeJson}。

当前章节的现有内容如下：
${currentContent}

请对以上内容进行扩写，使其更加丰富翔实。${wordCountText}${userPromptText}扩写时请注意：
1. 保持原有内容的主题和核心观点不变
2. 增加细节描述、案例分析、数据支撑等
3. 保持文章风格和语气一致
4. 扩写后的内容应该更加深入和全面

**输出要求：**
- 请直接输出扩写后的完整内容，建议从第一行开始就是正文
- 优先输出正文内容，避免添加不必要的前缀或解释
- 如果确实需要说明，请保持简洁，优先输出正文内容`
  )
}

/**
 * 略写内容提示词
 */
export const abridgeContentPrompt = (
  treeJson: string,
  nodeJson: string,
  currentContent: string,
  userPrompt = '',
  wordCount?: number
): string => {
  const wordCountText = wordCount ? `目标字数约为${wordCount}字。` : ''
  const userPromptText = userPrompt ? `用户额外要求：${userPrompt}。` : ''
  const template = getPromptTemplate('abridgeContentPrompt', {
    treeJson,
    nodeJson,
    currentContent,
    userPrompt: userPromptText,
    wordCount: wordCountText
  })
  return (
    template ||
    `你是一个文笔出色的编辑，以下是一篇文章大纲的树形json结构：${treeJson}。当前需要处理的章节是：${nodeJson}。

当前章节的现有内容如下：
${currentContent}

请对以上内容进行略写，使其更加简洁精炼。${wordCountText}${userPromptText}略写时请注意：
1. 保留核心观点和关键信息
2. 删除冗余描述和重复内容
3. 保持文章风格和语气一致
4. 确保略写后的内容仍然完整和连贯

**输出要求：**
- 请直接输出略写后的完整内容，建议从第一行开始就是正文
- 优先输出正文内容，避免添加不必要的前缀或解释
- 如果确实需要说明，请保持简洁，优先输出正文内容`
  )
}

/**
 * OCR修复提示词
 */
export const generateOcrFixPrompt = (ocrText: string): string => {
  const template = getPromptTemplate('ocrFixPrompt', { ocrText })

  if (template) {
    return template
  }

  // Fallback
  return `你是一个专业的文本修复助手。以下是通过OCR（光学字符识别）技术从图片中识别出的文本内容。由于OCR识别可能存在错误，文本中可能包含错别字、格式混乱、标点符号错误等问题。

**原始OCR识别文本：**
${ocrText}

**修复要求：**
1. 修正所有错别字和识别错误
2. 整理混乱的格式（如多余的空格、换行等）
3. 修正标点符号错误
4. 保持文本的原始语义和结构
5. 如果文本包含特殊格式（如列表、表格等），请尽量保持原有格式
6. 不要添加原文中没有的内容，只修复识别错误

**输出要求：**
- 请直接输出修复后的完整文本，建议从第一行开始就是修复后的内容
- 优先输出修复后的文本内容，避免添加不必要的前缀或解释
- 如果确实需要说明，请保持简洁，优先输出修复后的文本`
}

export const polishContentPrompt = (
  treeJson: string,
  nodeJson: string,
  currentContent: string,
  userPrompt = ''
): string => {
  const userPromptText = userPrompt ? `用户额外要求：${userPrompt}。` : ''
  const template = getPromptTemplate('polishContentPrompt', {
    treeJson,
    nodeJson,
    currentContent,
    userPrompt: userPromptText
  })
  return (
    template ||
    `你是一个文笔出色的编辑，以下是一篇文章大纲的树形json结构：${treeJson}。当前需要处理的章节是：${nodeJson}。

当前章节的现有内容如下：
${currentContent}

请对以上内容进行润色，提升其表达质量和可读性。${userPromptText}润色时请注意：
1. 保持原有内容的主题和核心观点不变
2. 优化语言表达，使其更加流畅自然
3. 修正语法错误和表达不当之处
4. 保持文章风格和语气一致
5. 不改变内容的长度和结构

**输出要求：**
- 请直接输出润色后的完整内容，建议从第一行开始就是正文
- 优先输出正文内容，避免添加不必要的前缀或解释
- 如果确实需要说明，请保持简洁，优先输出正文内容`
  )
}

export const updateTitlePrompt = (conversationSummary: string): string => {
  const instruction = getPromptByKey('updateTitlePrompt', {
    conversationSummary
  })
  return buildSchemaPrompt(DOCUMENT_TITLE_SCHEMA, instruction)
}

export const ragQueryReferencePrompt = (queryResults: unknown): string => {
  const queryResultsStr = JSON.stringify(queryResults)
  const template = getPromptTemplate('ragQueryReferencePrompt', { queryResults: queryResultsStr })
  return (
    template ||
    `本系统接入了RAG检索系统，以下是知识库的检索结果，由于内容可能与用户需求有偏差，所以请自行仔细甄别是否采纳：[检索内容开始]${queryResultsStr}[检索内容结束]

**输出要求：**
- 请直接输出实际需要的内容，建议从第一行开始就是正文
- 优先输出内容本身，避免添加不必要的前缀或解释
- 如果确实需要说明，请保持简洁，优先输出正文`
  )
}

export const suggestionCompletionPrompt = (
  preContext: string,
  postContext: string, // 保留参数以保持兼容性，但不再使用
  currentLine: string = '',
  documentType: string = 'Markdown'
) => {
  const systemContent = `你是一个AI智能写作助手，专门用于${documentType}文档的自动补全。\n\n**补全功能的目的：**\n- 你的任务是像Transformer模型预测下一个词一样，推断在[CURRENT_POS]位置（即当前光标位置）之后最适合接续的文本内容\n- [CURRENT_POS]就是当前光标的位置，你需要预测光标之后应该出现什么内容\n- 补全的内容应该与光标之前的上下文自然连贯，就像用户继续输入一样\n- 补全内容应该保持与当前行的风格、格式和语境一致\n\n**绝对禁止：**\n- 禁止复述提示词，禁止说"根据您的要求"、"我将为您"、"好的"、"明白了"等\n- 禁止添加任何解释、说明、前缀或后缀\n- 如果当前上下文无需补全，或难以补全，请直接输出空字符串\n- 只输出需要补全的文字本身，不要任何其他内容\n- 如果有需要插入空格或换行也请补全`
  const userContent = currentLine
    ? `请根据光标之前的上下文，预测在光标位置[CURRENT_POS]之后最适合接续的文本内容。\n\n当前行内容：${currentLine}\n\n光标之前的上下文：\n${preContext}[CURRENT_POS]`
    : `请根据光标之前的上下文，预测在光标位置[CURRENT_POS]之后最适合接续的文本内容。\n\n光标之前的上下文：\n${preContext}[CURRENT_POS]`

  const systemTemplate = getPromptByKey('suggestionCompletionPrompt.system')
  const userTemplate = getPromptByKey('suggestionCompletionPrompt.user', {
    preContext,
    postContext: ''
  })
  let systemPrompt = systemTemplate || systemContent
  let userPrompt = userTemplate || userContent

  systemPrompt = systemPrompt.replace(/{preContext}/g, preContext).replace(/{postContext}/g, '')
  userPrompt = userPrompt.replace(/{preContext}/g, preContext).replace(/{postContext}/g, '')

  if (currentLine && !userPrompt.includes('{currentLine}')) {
    const beforeContextPattern =
      /(\n\n(?:光标之前的上下文|Context before the cursor|Kontext vor dem Cursor|Contexte avant le curseur|カーソルの前のコンテキスト|커서 이전의 컨텍스트)：\n)/
    if (beforeContextPattern.test(userPrompt)) {
      userPrompt = userPrompt.replace(beforeContextPattern, `\n\n当前行内容：${currentLine}$1`)
    } else {
      userPrompt = userPrompt.replace(
        /(\[CURRENT_POS\])/,
        `\n\n当前行内容：${currentLine}\n\n光标之前的上下文：\n$1`
      )
    }
  } else if (userPrompt.includes('{currentLine}')) {
    userPrompt = userPrompt.replace(/{currentLine}/g, currentLine || '')
  }

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]
}

export interface PresetOption {
  value: string
}

/**
 * 获取当前语言的预设模板（用于快速开始界面的输入框自动补全）
 */
export function getPresets(): PresetOption[] {
  const prompts = getCurrentLocalePrompts()
  return prompts.presets || []
}

/**
 * 导出为计算属性，保持向后兼容
 * 注意：由于需要动态加载，这里返回一个函数调用结果
 * 调用者应该使用 getPresets() 函数而不是直接使用常量
 */
export const presets: PresetOption[] = getPresets()

/**
 * 生成数据分析报告提示词（支持echarts和mermaid图表）
 */
export const generateDataAnalysisReportPrompt = (
  analysisResult: any,
  analysisRequest?: string
): string => {
  const analysisRequestText = analysisRequest
    ? isChineseLocale()
      ? `**用户分析需求：**\n${analysisRequest}\n\n`
      : `**User Analysis Request:**\n${analysisRequest}\n\n`
    : ''
  return getPromptByKey('dataAnalysisReportPrompt', {
    analysisResult: JSON.stringify(analysisResult),
    analysisRequest: analysisRequestText
  })
}

/**
 * 生成附件分析提示词
 */
export const generateAttachmentAnalysisPrompt = (
  parsedContent: string,
  fileName: string
): string => {
  return getPromptByKey('attachmentAnalysisPrompt', {
    parsedContent,
    fileName
  })
}
