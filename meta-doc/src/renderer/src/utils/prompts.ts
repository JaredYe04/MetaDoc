import { buildSchemaPrompt, DOCUMENT_TITLE_SCHEMA } from './schemas'
import { generateMarkdownFromOutlineTree } from './document/outline'
import type { DocumentOutlineNode } from '../../../types'
import { createRendererLogger } from './logger'
import promptsEn from './locale_prompts/en_US.json'

// Single English prompts config; all prompts are managed in locale_prompts/en_US.json
const promptsConfig = promptsEn as {
  suggestionPresets: Array<{ labelKey: string; prompt: string }>
  presets: Array<{ value: string }>
  prompts: Record<string, unknown>
}

/**
 * Get nested prompt string by dot path (e.g. sectionChangePrompt.base)
 */
function getNestedPrompt(
  promptsObj: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  if (!promptsObj || typeof promptsObj !== 'object') return undefined
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

/**
 * Get prompt template by key with placeholder replacement. English only.
 */
export function getPromptByKey(key: string, replacements: Record<string, string> = {}): string {
  let template = getNestedPrompt(promptsConfig.prompts, key) ?? ''
  template = String(template)
  Object.keys(replacements).forEach((placeholder) => {
    const value = replacements[placeholder]
    template = template.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), value)
  })
  return template
}

function getPromptTemplate(key: string, replacements: Record<string, string> = {}): string {
  const template = getPromptByKey(key, replacements)
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
    treeJson: outlineText || '(no outline yet)'
  })

  if (template) {
    return template
  }

  return `You are an excellent editor. The following is an article outline. Please determine what the article is about and generate a title.

**Language rule:**
- Output the title in the same language as the article outline text.
- If you cannot confidently determine the language, output in English.

**Output requirements:**
- Output the title directly, starting from the first line
- Title should be within 15 words (or similarly short length in non-English languages)
- Avoid unnecessary prefix or explanation

Article outline:
${outlineText}`
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
    treeJson: outlineText || '(no outline yet)'
  })

  if (template) {
    return template
  }

  return `You are an excellent editor. The following is an article outline. Please determine what the article is about and generate a summary.

**Language rule:**
- Output the summary in the same language as the article outline text.
- If you cannot confidently determine the language, output in English.

**Output requirements:**
- Output the summary directly
- Summary should be within 200 words (or similarly concise length in non-English languages)

Article outline:
${outlineText}`
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
    `You are a professional document editing assistant. The following is a document outline:
${outlineText}

Language rule:
- Output the keywords in the same language as the document outline text.
- If you cannot confidently determine the language, output in English.

Please generate 5-8 high-quality keywords. Output a JSON array only, e.g. ["AI", "text processing"]. Start from the first line with the JSON array; avoid explanation or prefix.`
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
    sectionTitle: sectionTitle || '(untitled section)',
    outlineMarkdown: outlineMarkdown || '(no outline)'
  })
  return (
    template ||
    `You are a professional document editing assistant. Generate 5-8 recommended keywords for this section to guide AI writing.

**Section title:** ${sectionTitle || '(untitled section)'}

**Full outline (Markdown):**
${outlineMarkdown || '(no outline)'}

Output strictly according to the given JSON Schema, only the keywords array, no explanation.`
  )
}

/**
 * 新建/编辑素材：根据用户提示生成素材标题（i18n）
 */
export const getNewMaterialTitlePrompt = (userPrompt: string): string => {
  const template = getPromptTemplate('newMaterialGenerateTitlePrompt', {
    userPrompt: userPrompt || '(not provided)'
  })
  return (
    template ||
    `You are a document editing assistant. The user is creating "article material"—a draft paragraph for a document. User prompt or direction:

**User prompt:** ${userPrompt || '(not provided)'}

Generate a concise material title (within 15 characters). Follow the user's requirements strictly. Output the title only, from the first line, no quotes, prefix, or explanation.`
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
    sectionTitle: sectionTitle || '(untitled)',
    userPrompt: userPrompt || '(not provided)',
    outlineMarkdown: outlineMarkdown || '(no outline)'
  })
  return (
    template ||
    `You are a professional document editing assistant. Generate 5-8 recommended keywords for this "article material" (draft paragraph).

**Material title:** ${sectionTitle || '(untitled)'}

**User prompt/direction:** ${userPrompt || '(not provided)'}

**Full outline (Markdown):**
${outlineMarkdown || '(no outline)'}

Output strictly according to the given JSON Schema, only the keywords array, no explanation.`
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
    title: title || '(untitled)',
    userPrompt: userPrompt || '(not provided)',
    keywords: keywords || '(none)'
  })
  return (
    template ||
    `You are an excellent editor. The user is generating the body for "article material"—draft content for a document. Write the body based on the title, prompt, and keywords. Strictly follow all format, style, length, and prohibition rules in the user's prompt.

**Material title:** ${title || '(untitled)'}

**User prompt:** ${userPrompt || '(not provided)'}

**Keywords:** ${keywords || '(none)'}

Output the body only, from the first line, in Markdown.`
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
      ? 'Use standard LaTeX syntax. Do not output \\documentclass, \\begin{document}, \\end{document}; output only the section content. Do not paraphrase the prompt or say "as you requested", "I will", "ok", "understood"; output must start from the first line with the body content.'
      : 'Use Markdown format. Do not paraphrase the prompt or add filler; output must start from the first line with the modified section content, nothing else.'

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

  // Fallback
  let prompt = 'You are an excellent AI text editing assistant. '
  switch (contextMode) {
    case 0:
      prompt += `The user needs to generate content. Write according to the user's prompt. Chapter title: "${title}". User prompt: "${userPrompt}".`
      break
    case 1:
      prompt += `The user has an article with one chapter to modify or generate. Outline:\n${treeText}\n\nChapter title: "${title}". `
      prompt += !section
        ? 'Section is empty; generate it from the user prompt.'
        : `Original section: "${section}". `
      prompt += `User prompt: "${userPrompt}".`
      break
    case 2:
      prompt += `The user has an article with one chapter to modify or generate. Full article: "${article}". Chapter title: "${title}". `
      prompt += !section ? 'Section is empty; generate it.' : `Original section: "${section}". `
      prompt += `User prompt: "${userPrompt}".`
      break
    default:
      break
  }
  prompt += formatRequirement
  prompt +=
    '\n\n**Output:** Directly output the modified or generated content from the first line; avoid repeating the prompt or extra explanation.'
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
    `You are an excellent editor. Full outline:

${fullTreeText}

Current chapter: "${nodeTreeJson}". User requirement: "${userPrompt}". Generate the outline for this chapter in Markdown (one title per line; use heading levels for hierarchy).

**Output:** Output only this chapter's sub-outline in Markdown, not the full outline. Start from the first line with the outline.`
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
    `You are an excellent editor. The user needs you to write an article. User requirement: "${userPrompt}". Use the mood and tone: ${normalizedMood.toString()}.

**Output:** Output the article content directly from the first line; avoid unnecessary prefix or explanation.`
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
    `${basePrompt}\nOutput a complete document in standard LaTeX syntax with necessary section structure; do not output extra explanation.`
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
    `You are an excellent editor. Document content: 【Article Start】"${content}"【Article End】. Understand the document and generate further content according to my prompt.

**Output:** Output the generated content directly from the first line; avoid unnecessary prefix or explanation.`
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
    contentExcerpt: contentExcerpt || '(no content)',
    metaTitle: metaTitle || '(none)',
    metaDescription: metaDescription || '(none)'
  })
  if (template) return template
  return `You are a document editing assistant. The user wants to export the document as a template. Generate a concise "template title" and "template description" from the content and metadata.

**Existing metadata:**
- Title: ${metaTitle || '(none)'}
- Description/Summary: ${metaDescription || '(none)'}

**Document excerpt:**
${contentExcerpt || '(no content)'}

**Output (exactly two lines):**
Title: (one line, within 15 words)
Description: (one or more lines, within 50 words)`
}

export interface SuggestionPreset {
  /** i18n key for the label (e.g. home.suggestion.productIntroduction) */
  labelKey: string
  prompt: string
}

/**
 * Get suggestion presets for quick start. Labels are resolved via i18n in the component.
 */
export function getSuggestionPresets(): SuggestionPreset[] {
  return promptsConfig.suggestionPresets || []
}

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
  const specialPromptText = specialPrompt ? ` Also note: ${specialPrompt}` : ''
  const template = getPromptTemplate('generateGraphPrompt', {
    engine,
    type,
    prompt,
    specialPrompt: specialPromptText
  })
  return (
    template ||
    `You need to draw a chart using code. Use ${engine} graphics language. Chart type: ${type}. User prompt: ${prompt}. Generate the chart accordingly. Output only code, wrapped in \`\`\`${engine}\`\`\` block.${specialPromptText} Start from the first line with the code block.`
  )
}

export const expandTreeNodePrompt = (
  treeJson: string,
  nodeJson: string,
  schema: string,
  userPrompt = ''
): string => {
  const userPromptText = userPrompt ? ` User prompt for reference: ${userPrompt}.` : ''
  const template = getPromptTemplate('expandTreeNodePrompt', {
    treeJson,
    nodeJson,
    schema,
    userPrompt: userPromptText
  })
  return (
    template ||
    `You are an excellent editor. Article outline (tree JSON): ${treeJson}. Expand one node by adding sub-chapter nodes. Node to expand: ${nodeJson}. Generate sub-chapter nodes based on title and content, return as JSON list like [{...},{...}]. Follow schema: ${schema}.${userPromptText} Output only the JSON array from the first line.`
  )
}

export const generateContentPrompt = (
  treeJson: string,
  nodeJson: string,
  userPrompt = ''
): string => {
  const userPromptText = userPrompt ? ` User prompt for reference: ${userPrompt}.` : ''
  const template = getPromptTemplate('generateContentPrompt', {
    treeJson,
    nodeJson,
    userPrompt: userPromptText
  })
  return (
    template ||
    `You are an excellent editor. Article outline (tree JSON): ${treeJson}.${userPromptText} Write content for this chapter based on the full structure; be substantive: ${nodeJson}. Output the chapter content directly from the first line; avoid prefix or explanation.`
  )
}

export const generateParentNodeContentPrompt = (
  treeJson: string,
  nodeJson: string,
  userPrompt = ''
): string => {
  const userPromptText = userPrompt ? ` User prompt for reference: ${userPrompt}.` : ''
  const template = getPromptTemplate('generateParentNodeContentPrompt', {
    treeJson,
    nodeJson,
    userPrompt: userPromptText
  })
  return (
    template ||
    `You are an excellent editor. Article outline (tree JSON): ${treeJson}. Write content for this chapter. Since it already has sub-chapters, write only general, introductory text: ${nodeJson}.${userPromptText} Output the chapter content directly from the first line; avoid prefix or explanation.`
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
  const wordCountText = wordCount ? ` Target length about ${wordCount} words.` : ''
  const userPromptText = userPrompt ? ` User additional requirement: ${userPrompt}.` : ''
  const template = getPromptTemplate('expandContentPrompt', {
    treeJson,
    nodeJson,
    currentContent,
    userPrompt: userPromptText,
    wordCount: wordCountText
  })
  return (
    template ||
    `You are an excellent editor. Article outline: ${treeJson}. Section to process: ${nodeJson}. Current content:\n${currentContent}\n\nExpand the content to make it richer.${wordCountText}${userPromptText} Keep theme and core points; add details and examples; keep style consistent. Output the expanded content directly from the first line.`
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
  const wordCountText = wordCount ? ` Target length about ${wordCount} words.` : ''
  const userPromptText = userPrompt ? ` User additional requirement: ${userPrompt}.` : ''
  const template = getPromptTemplate('abridgeContentPrompt', {
    treeJson,
    nodeJson,
    currentContent,
    userPrompt: userPromptText,
    wordCount: wordCountText
  })
  return (
    template ||
    `You are an excellent editor. Article outline: ${treeJson}. Section to process: ${nodeJson}. Current content:\n${currentContent}\n\nAbridge the content to make it more concise.${wordCountText}${userPromptText} Keep core points and key information; remove redundancy; keep style consistent; ensure the result is still complete. Output the abridged content directly from the first line.`
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
  const userPromptText = userPrompt ? ` User additional requirement: ${userPrompt}.` : ''
  const template = getPromptTemplate('polishContentPrompt', {
    treeJson,
    nodeJson,
    currentContent,
    userPrompt: userPromptText
  })
  return (
    template ||
    `You are an excellent editor. Article outline: ${treeJson}. Section to process: ${nodeJson}. Current content:\n${currentContent}\n\nPolish the content to improve expression and readability.${userPromptText} Keep theme and core points; improve fluency; fix grammar; keep style consistent; do not change length or structure. Output the polished content directly from the first line.`
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
    `This system uses RAG retrieval. Below are knowledge base results; content may not fully match the user's need—use your judgment: [Retrieval Start]${queryResultsStr}[Retrieval End]. Output only the content you actually need, from the first line; avoid prefix or explanation.`
  )
}

export const suggestionCompletionPrompt = (
  preContext: string,
  _postContext: string,
  currentLine: string = '',
  documentType: string = 'Markdown'
) => {
  const systemContent = `You are an AI writing assistant for ${documentType} document auto-completion.\n\n**Purpose:** Predict what text best follows [CURRENT_POS] (cursor). Output should be coherent with context before the cursor and match the current line's style. Do not paraphrase the prompt or add explanation; if no completion is needed, output empty string. Output only the completion text.`
  const userContent = currentLine
    ? `Predict what text best follows the cursor [CURRENT_POS].\n\nCurrent line: ${currentLine}\n\nContext before the cursor:\n${preContext}[CURRENT_POS]`
    : `Predict what text best follows the cursor [CURRENT_POS].\n\nContext before the cursor:\n${preContext}[CURRENT_POS]`

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
    if (/Context before the cursor:\s*\n/i.test(userPrompt)) {
      userPrompt = userPrompt.replace(
        /(Context before the cursor:\s*\n)/i,
        `Current line: ${currentLine}\n\n$1`
      )
    } else {
      userPrompt = userPrompt.replace(
        /(\[CURRENT_POS\])/,
        `\n\nCurrent line: ${currentLine}\n\nContext before the cursor:\n${preContext}$1`
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
 * Get presets for quick start input (English only).
 */
export function getPresets(): PresetOption[] {
  return promptsConfig.presets || []
}

export const presets: PresetOption[] = getPresets()

/**
 * 生成数据分析报告提示词（支持echarts和mermaid图表）
 */
export const generateDataAnalysisReportPrompt = (
  analysisResult: any,
  analysisRequest?: string
): string => {
  const analysisRequestText = analysisRequest
    ? `**User Analysis Request:**\n${analysisRequest}\n\n`
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
