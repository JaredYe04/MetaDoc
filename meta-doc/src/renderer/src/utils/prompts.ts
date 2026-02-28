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
      en_US_prompts,
      ja_JP_prompts,
      ko_KR_prompts,
      de_DE_prompts,
      fr_FR_prompts
    ] = await Promise.all([
      import('./locale_prompts/zh_CN.json'),
      import('./locale_prompts/en_US.json'),
      import('./locale_prompts/ja_JP.json'),
      import('./locale_prompts/ko_KR.json'),
      import('./locale_prompts/de_DE.json'),
      import('./locale_prompts/fr_FR.json')
    ])

    promptsMapCache = {
      zh_CN: zh_CN_prompts.default || zh_CN_prompts,
      en_US: en_US_prompts.default || en_US_prompts,
      ja_JP: ja_JP_prompts.default || ja_JP_prompts,
      ko_KR: ko_KR_prompts.default || ko_KR_prompts,
      de_DE: de_DE_prompts.default || de_DE_prompts,
      fr_FR: fr_FR_prompts.default || fr_FR_prompts
    }

    return promptsMapCache
  } catch (error) {
    console.error('Failed to load prompts:', error)
    // 返回默认的中文配置
    return {
      zh_CN: { suggestionPresets: [], presets: [] },
      en_US: { suggestionPresets: [], presets: [] },
      ja_JP: { suggestionPresets: [], presets: [] },
      ko_KR: { suggestionPresets: [], presets: [] },
      de_DE: { suggestionPresets: [], presets: [] },
      fr_FR: { suggestionPresets: [], presets: [] }
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
 * 从配置中获取提示词模板并替换占位符
 */
function getPromptTemplate(key: string, replacements: Record<string, string> = {}): string {
  const prompts = getCurrentLocalePrompts()
  let template = prompts.prompts?.[key] || ''

  // 替换占位符
  Object.keys(replacements).forEach((placeholder) => {
    const value = replacements[placeholder]
    template = template.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), value)
  })
  const logger = createRendererLogger('Prompts')
  logger.debug('getPromptTemplate: ' + template)
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
    `你是一个文档编辑助手。用户正在创建一条「素材」，当前用户给出的提示词或方向如下：

**用户提示：** ${userPrompt || '（未填写）'}

请根据上述提示，生成一个简洁的素材标题（15字以内）。

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
    `你是一个专业的文档编辑助手。当前需要为一条「素材」生成「推荐关键词」。

**素材标题：** ${sectionTitle || '（未命名）'}

**用户提示词/方向：** ${userPrompt || '（未填写）'}

**整体大纲（Markdown）：**
${outlineMarkdown || '（暂无大纲）'}

请根据标题与提示的语境，生成 5-8 个推荐关键词。

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
    `你是一个文笔出色的编辑。用户正在为「素材」生成正文。

**素材标题：** ${title || '（未命名）'}

**用户提示词：** ${userPrompt || '（未填写）'}

**关键词：** ${keywords || '（无）'}

请根据标题、提示词与关键词，直接撰写该素材的正文内容。

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
  const prompts = getCurrentLocalePrompts()
  const sectionPrompt = prompts.prompts?.sectionChangePrompt

  // 根据语言类型添加格式要求
  const formatRequirement =
    language === 'latex'
      ? '请使用规范的LaTeX语法输出，注意不要输出\\documentclass、\\begin{document}、\\end{document}等命令，只输出章节内容部分。记住：禁止复述提示词，禁止说"根据您的要求"、"我将为您"、"好的"、"明白了"等，输出必须从第一行开始就是正文内容。'
      : '请使用Markdown格式输出。记住：禁止复述提示词，禁止说"根据您的要求"、"我将为您"、"好的"、"明白了"等，输出必须从第一行开始就是修改后的章节内容，没有任何其他文字。'

  if (sectionPrompt && typeof sectionPrompt === 'object') {
    let prompt = sectionPrompt.base || '你是一个文笔出色的AI文本编辑助手，'
    switch (contextMode) {
      case 0:
        prompt += (sectionPrompt.mode0 || '')
          .replace('{title}', title)
          .replace('{userPrompt}', userPrompt)
        break
      case 1:
        prompt += !section
          ? (sectionPrompt.mode1_empty || '')
              .replace('{tree}', treeText)
              .replace('{title}', title)
              .replace('{userPrompt}', userPrompt)
          : (sectionPrompt.mode1_hasContent || '')
              .replace('{tree}', treeText)
              .replace('{title}', title)
              .replace('{section}', section)
              .replace('{userPrompt}', userPrompt)
        break
      case 2:
        prompt += !section
          ? (sectionPrompt.mode2_empty || '')
              .replace('{article}', article)
              .replace('{title}', title)
              .replace('{userPrompt}', userPrompt)
          : (sectionPrompt.mode2_hasContent || '')
              .replace('{article}', article)
              .replace('{title}', title)
              .replace('{section}', section)
              .replace('{userPrompt}', userPrompt)
        break
      default:
        break
    }
    prompt += sectionPrompt.ending || formatRequirement
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
  let contextText = ''
  if (contexts && contexts.length > 0) {
    contextText = `\n\n以下是在文档中出现的上下文片段，请结合这些上下文给出更符合文章语境的解释：\n${contexts.map((ctx, idx) => `${idx + 1}. ${ctx}`).join('\n')}`
  }

  // 先获取模板，然后替换占位符
  const prompts = getCurrentLocalePrompts()
  const template = prompts.prompts?.explainWordPrompt

  if (template) {
    // 替换 {word} 和 {contexts} 占位符
    let result = template.replace(/{word}/g, word)
    result = result.replace(/{contexts}/g, contextText)
    return result
  }

  // 回退逻辑
  return `请用一句话解释"${word}"这个词的意思。${contextText ? `结合以下文档中的上下文，给出更符合文章语境的解释：${contexts?.map((ctx, idx) => `${idx + 1}. ${ctx}`).join('\n')}` : ''}\n\n**输出要求：请直接输出释义句子本身，建议从第一行开始直接输出。优先输出释义内容，避免添加格式说明、标题、标签等不必要的内容。**`
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
  const prompts = getCurrentLocalePrompts()
  const template = prompts.prompts?.updateTitlePrompt
  const instruction = template
    ? template.replace('{conversationSummary}', conversationSummary)
    : `请根据以下对话内容，总结一个简洁且信息量充足的标题。标题应该准确反映对话的核心主题，长度控制在4-20个字符之间。

对话内容如下：
${conversationSummary}

**输出要求：**
- 请严格按照 JSON Schema 格式输出，优先输出 JSON 对象
- 建议从第一行开始就是JSON对象，避免添加不必要的解释
- 如果确实需要说明，请保持简洁，优先输出JSON对象`
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
  const prompts = getCurrentLocalePrompts()
  const suggestionPrompt = prompts.prompts?.suggestionCompletionPrompt

  // 构建优化的system提示（包含文档类型和当前行信息）
  const systemContent = `你是一个AI智能写作助手，专门用于${documentType}文档的自动补全。\n\n**补全功能的目的：**\n- 你的任务是像Transformer模型预测下一个词一样，推断在[CURRENT_POS]位置（即当前光标位置）之后最适合接续的文本内容\n- [CURRENT_POS]就是当前光标的位置，你需要预测光标之后应该出现什么内容\n- 补全的内容应该与光标之前的上下文自然连贯，就像用户继续输入一样\n- 补全内容应该保持与当前行的风格、格式和语境一致\n\n**绝对禁止：**\n- 禁止复述提示词，禁止说"根据您的要求"、"我将为您"、"好的"、"明白了"等\n- 禁止添加任何解释、说明、前缀或后缀\n- 如果当前上下文无需补全，或难以补全，请直接输出空字符串\n- 只输出需要补全的文字本身，不要任何其他内容\n- 如果有需要插入空格或换行也请补全`
  // 构建优化的user提示（只使用preContext，不使用postContext，避免大模型幻觉）
  // 强调[CURRENT_POS]是光标位置，需要预测光标之后的内容
  const userContent = currentLine
    ? `请根据光标之前的上下文，预测在光标位置[CURRENT_POS]之后最适合接续的文本内容。\n\n当前行内容：${currentLine}\n\n光标之前的上下文：\n${preContext}[CURRENT_POS]`
    : `请根据光标之前的上下文，预测在光标位置[CURRENT_POS]之后最适合接续的文本内容。\n\n光标之前的上下文：\n${preContext}[CURRENT_POS]`

  if (suggestionPrompt && typeof suggestionPrompt === 'object') {
    // 使用locale_prompts中的模板
    let systemPrompt = suggestionPrompt.system || systemContent
    let userPrompt = suggestionPrompt.user || userContent

    // 替换占位符：确保postContext被替换为空字符串（即使模板中没有{postContext}）
    systemPrompt = systemPrompt.replace(/{preContext}/g, preContext).replace(/{postContext}/g, '')
    userPrompt = userPrompt.replace(/{preContext}/g, preContext).replace(/{postContext}/g, '')

    // 如果模板中没有currentLine占位符，但提供了currentLine，需要特殊处理
    // 注意：locale_prompts模板可能不包含currentLine，所以需要手动添加
    if (currentLine && !userPrompt.includes('{currentLine}')) {
      // 如果模板中没有currentLine占位符，在提示中添加当前行信息
      // 尝试在"光标之前的上下文"之前插入当前行信息（支持中英文）
      const beforeContextPattern =
        /(\n\n(?:光标之前的上下文|Context before the cursor|Kontext vor dem Cursor|Contexte avant le curseur|カーソルの前のコンテキスト|커서 이전의 컨텍스트)：\n)/
      if (beforeContextPattern.test(userPrompt)) {
        userPrompt = userPrompt.replace(beforeContextPattern, `\n\n当前行内容：${currentLine}$1`)
      } else {
        // 如果找不到标准模式，在[CURRENT_POS]之前插入
        userPrompt = userPrompt.replace(
          /(\[CURRENT_POS\])/,
          `\n\n当前行内容：${currentLine}\n\n光标之前的上下文：\n$1`
        )
      }
    } else if (userPrompt.includes('{currentLine}')) {
      // 如果模板中有currentLine占位符，替换它
      userPrompt = userPrompt.replace(/{currentLine}/g, currentLine || '')
    }

    return [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: userPrompt
      }
    ]
  }

  // 回退到原始实现（使用优化的内容）
  return [
    {
      role: 'system',
      content: systemContent
    },
    {
      role: 'user',
      content: userContent
    }
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
  const prompts = getCurrentLocalePrompts()
  const template = prompts.prompts?.dataAnalysisReportPrompt

  if (template) {
    const analysisRequestText = analysisRequest
      ? isChineseLocale()
        ? `**用户分析需求：**\n${analysisRequest}\n\n`
        : `**User Analysis Request:**\n${analysisRequest}\n\n`
      : ''

    return template
      .replace(/{analysisResult}/g, JSON.stringify(analysisResult))
      .replace(/{analysisRequest}/g, analysisRequestText)
  }

  // 默认提示词（中文）
  if (isChineseLocale()) {
    return `你是一个专业的数据分析师，请根据以下数据分析结果，生成一份详细的Markdown格式分析报告。

**数据分析结果：**
\`\`\`json
${JSON.stringify(analysisResult)}
\`\`\`

${analysisRequest ? `**用户分析需求：**\n${analysisRequest}\n` : ''}

**报告要求：**

1. **报告结构**：
   - 使用Markdown格式编写
   - 包含标题、摘要、数据概况、关键发现、可视化图表、结论等部分
   - 使用清晰的标题层级（#、##、###）

2. **可视化图表**（重要）：
   - **必须包含多个数据可视化图表**，使用以下两种格式：
     - **ECharts图表**：使用 \`\`\`echarts 代码块，包含完整的ECharts配置（JSON格式）
     - **Mermaid图表**：使用 \`\`\`mermaid 代码块，包含Mermaid语法
   
   - **图表类型建议**：
     - 雷达图：用于多维度数据对比
     - 散点图：用于相关性分析
     - 折线图：用于趋势分析
     - 箱线图：用于分布分析
     - 饼图：用于占比分析
     - 柱状图：用于分类对比
     - 热力图：用于相关性矩阵
   
   - **图表要求**：
     - 每个图表都要有清晰的标题和说明
     - ECharts配置要完整，包含title、tooltip、legend、xAxis、yAxis、series等
     - 图表数据要基于分析结果中的实际数据
     - 至少包含3-5个不同类型的图表

3. **内容要求**：
   - 数据概况：总结数据的基本信息（行数、列数、字段类型等）
   - 关键发现：突出重要的统计发现和模式
   - 异常值分析：识别并分析异常值
   - 数据质量：评估数据质量（缺失值、重复值等）
   - 结论和建议：基于分析结果给出结论和行动建议

4. **格式要求**：
   - 使用Markdown格式
   - 代码块语言标识必须准确：\`\`\`echarts 和 \`\`\`mermaid
   - 图表代码要完整可执行
   - 文字描述要清晰、专业

**输出示例格式：**
\`\`\`markdown
# 数据分析报告

## 摘要
[报告摘要]

## 数据概况
[数据基本信息]

## 关键发现
[重要发现]

## 数据可视化

### 字段分布雷达图
\`\`\`echarts
{
  "title": { "text": "字段分布雷达图" },
  "radar": {
    "indicator": [...]
  },
  "series": [{
    "type": "radar",
    "data": [...]
  }]
}
\`\`\`

### 数值字段相关性散点图
\`\`\`echarts
{
  "title": { "text": "相关性分析" },
  "xAxis": {...},
  "yAxis": {...},
  "series": [{
    "type": "scatter",
    "data": [...]
  }]
}
\`\`\`

### 数据分布流程图
\`\`\`mermaid
graph TD
  A[数据源] --> B[数据清洗]
  B --> C[统计分析]
  C --> D[可视化]
\`\`\`

## 结论和建议
[结论和建议]
\`\`\`

现在请生成完整的分析报告。`
  } else {
    // 英文提示词
    return `You are a professional data analyst. Please generate a detailed Markdown-format analysis report based on the following data analysis results.

**Data Analysis Results:**
\`\`\`json
${JSON.stringify(analysisResult)}
\`\`\`

${analysisRequest ? `**User Analysis Request:**\n${analysisRequest}\n` : ''}

**Report Requirements:**

1. **Report Structure**:
   - Use Markdown format
   - Include title, summary, data overview, key findings, visualizations, conclusions, etc.
   - Use clear heading hierarchy (#, ##, ###)

2. **Visualizations** (Important):
   - **Must include multiple data visualization charts** using:
     - **ECharts charts**: Use \`\`\`echarts code blocks with complete ECharts configuration (JSON format)
     - **Mermaid charts**: Use \`\`\`mermaid code blocks with Mermaid syntax
   
   - **Recommended Chart Types**:
     - Radar chart: For multi-dimensional data comparison
     - Scatter plot: For correlation analysis
     - Line chart: For trend analysis
     - Box plot: For distribution analysis
     - Pie chart: For proportion analysis
     - Bar chart: For category comparison
     - Heatmap: For correlation matrix
   
   - **Chart Requirements**:
     - Each chart should have a clear title and description
     - ECharts configuration should be complete with title, tooltip, legend, xAxis, yAxis, series, etc.
     - Chart data should be based on actual data from analysis results
     - Include at least 3-5 different types of charts

3. **Content Requirements**:
   - Data Overview: Summarize basic data information (row count, column count, field types, etc.)
   - Key Findings: Highlight important statistical findings and patterns
   - Outlier Analysis: Identify and analyze outliers
   - Data Quality: Assess data quality (missing values, duplicates, etc.)
   - Conclusions and Recommendations: Provide conclusions and action recommendations based on analysis results

4. **Format Requirements**:
   - Use Markdown format
   - Code block language identifiers must be accurate: \`\`\`echarts and \`\`\`mermaid
   - Chart code should be complete and executable
   - Text descriptions should be clear and professional

Now please generate the complete analysis report.`
  }
}

/**
 * 生成附件分析提示词
 */
export const generateAttachmentAnalysisPrompt = (
  parsedContent: string,
  fileName: string
): string => {
  const prompts = getCurrentLocalePrompts()
  const template = prompts.prompts?.attachmentAnalysisPrompt

  if (template) {
    return template.replace(/{parsedContent}/g, parsedContent).replace(/{fileName}/g, fileName)
  }

  // 默认提示词
  if (isChineseLocale()) {
    return `你是一个专业的文档分析助手，请分析以下附件内容：

**文件名：** ${fileName}

**附件内容：**
\`\`\`
${parsedContent}
\`\`\`

请对附件内容进行详细分析，包括：
1. **内容概述**：总结附件的主要内容和目的
2. **关键信息**：提取重要的数据、事实或观点
3. **结构分析**：分析文档的结构和组织方式
4. **主题识别**：识别文档的主要主题和子主题
5. **洞察和建议**：基于内容提供有价值的洞察和建议

请使用Markdown格式输出分析结果，确保结构清晰、内容详实。`
  } else {
    return `You are a professional document analysis assistant. Please analyze the following attachment content:

**File Name:** ${fileName}

**Attachment Content:**
\`\`\`
${parsedContent}
\`\`\`

Please provide a detailed analysis of the attachment content, including:
1. **Content Overview**: Summarize the main content and purpose of the attachment
2. **Key Information**: Extract important data, facts, or viewpoints
3. **Structure Analysis**: Analyze the document's structure and organization
4. **Theme Identification**: Identify the main themes and sub-themes
5. **Insights and Recommendations**: Provide valuable insights and recommendations based on the content

Please output the analysis results in Markdown format, ensuring clear structure and detailed content.`
  }
}
