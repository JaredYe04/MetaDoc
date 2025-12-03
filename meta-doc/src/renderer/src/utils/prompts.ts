import { buildSchemaPrompt, DOCUMENT_TITLE_SCHEMA } from './schemas';
import { CONTENT_SCHEMA } from '../constants/document';
import { i18n } from '../i18n.js';
import { extractOutlineTreeFromMarkdownLight, generateLightMarkdownFromOutlineTree } from './document/outline';
import { extractOutlineTreeFromLatexLight } from './latex-utils';
import type { DocumentOutlineNode } from '../../../types';

// 语言到提示词配置的映射（使用动态导入）
let promptsMapCache: Record<string, any> | null = null;

/**
 * 动态加载提示词配置
 */
async function loadPromptsMap(): Promise<Record<string, any>> {
  if (promptsMapCache) {
    return promptsMapCache;
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
    ]);

    promptsMapCache = {
      'zh_CN': zh_CN_prompts.default || zh_CN_prompts,
      'en_US': en_US_prompts.default || en_US_prompts,
      'ja_JP': ja_JP_prompts.default || ja_JP_prompts,
      'ko_KR': ko_KR_prompts.default || ko_KR_prompts,
      'de_DE': de_DE_prompts.default || de_DE_prompts,
      'fr_FR': fr_FR_prompts.default || fr_FR_prompts,
    };

    return promptsMapCache;
  } catch (error) {
    console.error('Failed to load prompts:', error);
    // 返回默认的中文配置
    return {
      'zh_CN': { suggestionPresets: [], presets: [] },
      'en_US': { suggestionPresets: [], presets: [] },
      'ja_JP': { suggestionPresets: [], presets: [] },
      'ko_KR': { suggestionPresets: [], presets: [] },
      'de_DE': { suggestionPresets: [], presets: [] },
      'fr_FR': { suggestionPresets: [], presets: [] },
    };
  }
}

/**
 * 获取当前语言的提示词配置（同步版本，使用缓存）
 */
function getCurrentLocalePrompts() {
  const currentLocale = getCurrentLocale();
  
  // 如果缓存未加载，返回空数组（会在首次使用时异步加载）
  if (!promptsMapCache) {
    // 异步加载，但不阻塞
    loadPromptsMap().catch(console.error);
    return { suggestionPresets: [], presets: [] };
  }
  
  return promptsMapCache[currentLocale] || promptsMapCache['zh_CN'] || { suggestionPresets: [], presets: [] };
}

// 预加载提示词配置
if (typeof window !== 'undefined') {
  loadPromptsMap();
}

/**
 * 获取当前语言代码（用于判断是否为中文）
 */
export function getCurrentLocale(): string {
  const locale = (i18n.global.locale as any).value || i18n.global.locale || 'zh_CN';
  return String(locale);
}

/**
 * 判断当前语言是否为中文
 */
export function isChineseLocale(): boolean {
  const locale = getCurrentLocale();
  return locale === 'zh_CN' || locale.startsWith('zh');
}

/**
 * 从配置中获取提示词模板并替换占位符
 */
function getPromptTemplate(key: string, replacements: Record<string, string> = {}): string {
  const prompts = getCurrentLocalePrompts();
  let template = prompts.prompts?.[key] || '';
  
  // 替换占位符
  Object.keys(replacements).forEach(placeholder => {
    const value = replacements[placeholder];
    template = template.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), value);
  });
  
  return template;
}

export const generateTitlePrompt = (treeJson: string, useLight = true): string => {
  // 如果传入的是JSON字符串，尝试转换为精简版
  let outlineText = treeJson;
  if (useLight && treeJson.trim().startsWith('{')) {
    try {
      const tree = JSON.parse(treeJson) as DocumentOutlineNode;
      outlineText = generateLightMarkdownFromOutlineTree(tree);
    } catch {
      // 如果解析失败，使用原始值
      outlineText = treeJson;
    }
  }
  
  const template = getPromptTemplate('generateTitlePrompt', { treeJson: outlineText });
  return template || `你是一个文笔出色的编辑，以下是一篇文章的大纲结构，请自动判断文章在讲什么，并生成一个标题。

**输出要求：**
- 请直接输出标题，建议从第一行开始就是标题
- 标题长度应在15字以内
- 优先输出标题内容，避免添加不必要的前缀或解释

文章大纲：
${outlineText}`;
};

export const generateDescriptionPrompt = (treeJson: string, useLight = true): string => {
  // 如果传入的是JSON字符串，尝试转换为精简版
  let outlineText = treeJson;
  if (useLight && treeJson.trim().startsWith('{')) {
    try {
      const tree = JSON.parse(treeJson) as DocumentOutlineNode;
      outlineText = generateLightMarkdownFromOutlineTree(tree);
    } catch {
      outlineText = treeJson;
    }
  }
  
  const template = getPromptTemplate('generateDescriptionPrompt', { treeJson: outlineText });
  return template || `你是一个文笔出色的编辑，以下是一篇文章的大纲结构，请自动判断文章在讲什么，并生成一篇文章摘要。

**输出要求：**
- 请直接输出摘要内容，建议从第一行开始就是摘要
- 摘要长度应在200字以内
- 优先输出摘要内容，避免添加不必要的前缀或解释

文章大纲：
${outlineText}`;
};

export const generateKeywordsPrompt = (treeJson: string, useLight = true): string => {
  // 如果传入的是JSON字符串，尝试转换为精简版
  let outlineText = treeJson;
  if (useLight && treeJson.trim().startsWith('{')) {
    try {
      const tree = JSON.parse(treeJson) as DocumentOutlineNode;
      outlineText = generateLightMarkdownFromOutlineTree(tree);
    } catch {
      outlineText = treeJson;
    }
  }
  
  const template = getPromptTemplate('generateKeywordsPrompt', { treeJson: outlineText });
  return template || `你是一个专业的文档编辑助手，以下是一篇文档的大纲结构：
${outlineText}

请根据全文内容生成 5-8 个高质量的关键词。

**输出要求：**
- 请直接输出一个 JSON 数组，例如 ["人工智能","文字处理"]
- 建议从第一行开始就是JSON数组，避免添加不必要的解释或前缀
- 如果确实需要说明，请保持简洁，优先输出JSON数组`;
};

export const sectionChangePrompt = (
  tree: string,
  section: string,
  title: string,
  userPrompt: string,
  contextMode: number,
  article: string,
  language: 'markdown' | 'latex' = 'markdown',
  useLight = true,
): string => {
  // 对于mode1，如果tree是JSON格式，转换为精简版
  let treeText = tree;
  if (contextMode === 1 && useLight && tree.trim().startsWith('{')) {
    try {
      const treeObj = JSON.parse(tree) as DocumentOutlineNode;
      treeText = generateLightMarkdownFromOutlineTree(treeObj);
    } catch {
      treeText = tree;
    }
  }
  const prompts = getCurrentLocalePrompts();
  const sectionPrompt = prompts.prompts?.sectionChangePrompt;
  
  // 根据语言类型添加格式要求
  const formatRequirement = language === 'latex' 
    ? '请使用规范的LaTeX语法输出，注意不要输出\\documentclass、\\begin{document}、\\end{document}等命令，只输出章节内容部分。记住：禁止复述提示词，禁止说"根据您的要求"、"我将为您"、"好的"、"明白了"等，输出必须从第一行开始就是正文内容。'
    : '请使用Markdown格式输出。记住：禁止复述提示词，禁止说"根据您的要求"、"我将为您"、"好的"、"明白了"等，输出必须从第一行开始就是修改后的章节内容，没有任何其他文字。';
  
  if (sectionPrompt && typeof sectionPrompt === 'object') {
    let prompt = sectionPrompt.base || '你是一个文笔出色的AI文本编辑助手，';
    switch (contextMode) {
      case 0:
        prompt += (sectionPrompt.mode0 || '').replace('{title}', title).replace('{userPrompt}', userPrompt);
        break;
      case 1:
        prompt += (!section
          ? (sectionPrompt.mode1_empty || '').replace('{tree}', treeText).replace('{title}', title).replace('{userPrompt}', userPrompt)
          : (sectionPrompt.mode1_hasContent || '').replace('{tree}', treeText).replace('{title}', title).replace('{section}', section).replace('{userPrompt}', userPrompt));
        break;
      case 2:
        prompt += (!section
          ? (sectionPrompt.mode2_empty || '').replace('{article}', article).replace('{title}', title).replace('{userPrompt}', userPrompt)
          : (sectionPrompt.mode2_hasContent || '').replace('{article}', article).replace('{title}', title).replace('{section}', section).replace('{userPrompt}', userPrompt));
        break;
      default:
        break;
    }
    prompt += sectionPrompt.ending || formatRequirement;
    return prompt;
  }
  
  // 回退到原始实现
  let prompt = '你是一个文笔出色的AI文本编辑助手，';
  switch (contextMode) {
    case 0:
      prompt += `现在用户有生成内容的需求，请根据用户的提示词进行文字编写。"。当前需要处理的章节标题是："${title}"，用户提示词如下："${userPrompt}"。`;
      break;
    case 1:
      prompt += `现在用户有一篇文章，其中有一个章节需要你修改或生成。以下是文章的大纲结构：\n${treeText}\n\n当前需要处理的章节标题是："${title}"，`;
      prompt += !section
        ? '章节内容为空，需要你根据用户提示词来生成这一节。'
        : `需要修改的原本章节内容是："${section}"，`;
      prompt += `用户提示词如下："${userPrompt}"。`;
      break;
    case 2:
      prompt += `现在用户有一篇文章，其中有一个章节需要你修改或生成。以下是原本的全部文章内容："${article}"。当前需要处理的章节标题是："${title}"，`;
      prompt += !section
        ? '章节内容为空，需要你来生成这一节。'
        : `需要修改的原本章节内容是："${section}"，`;
      prompt += `用户提示词如下："${userPrompt}"。`;
      break;
    default:
      break;
  }
  prompt += formatRequirement;
  prompt += '\n\n**输出要求：**\n- 请直接输出修改或生成的内容，建议从第一行开始就是正文\n- 建议避免复述提示词或添加不必要的解释\n- 如果确实需要说明，请保持简洁，优先输出正文内容';
  return prompt;
};

export const outlineChangePrompt = (
  fullTreeJson: string,
  nodeTreeJson: string,
  userPrompt: string,
  useLight = true,
): string => {
  // 转换全文大纲为精简版
  let fullTreeText = fullTreeJson;
  if (useLight && fullTreeJson.trim().startsWith('{')) {
    try {
      const tree = JSON.parse(fullTreeJson) as DocumentOutlineNode;
      fullTreeText = generateLightMarkdownFromOutlineTree(tree);
    } catch {
      fullTreeText = fullTreeJson;
    }
  }
  
  // nodeTreeJson保持原样，因为可能需要节点信息
  const template = getPromptTemplate('outlineChangePrompt', { fullTreeJson: fullTreeText, nodeTreeJson, userPrompt });
  return template || `你是一个文笔出色的编辑，现在有一篇文章大纲，全文大纲如下：

${fullTreeText}

当前章节是："${nodeTreeJson}"，以下是用户的需求："${userPrompt}"，请根据用户需求，结合本章节在全文的上下文结构，尝试生成本章节的大纲（Markdown格式）一个标题占一行，如果有多层结构，使用分级标题。

**输出要求：**
- 请直接输出本章节的子大纲（Markdown格式），而不是全文大纲
- 建议从第一行开始就是标题，优先输出大纲内容
- 如果确实需要说明，请保持简洁，优先输出大纲`;
};

export const generateArticlePrompt = (mood: string[], userPrompt: string): string => {
  const normalizedMood =
    Array.isArray(mood) && mood.length ? mood : ['平和'];
  const template = getPromptTemplate('generateArticlePrompt', { userPrompt, mood: normalizedMood.toString() });
  return template || `你是一个文笔出色的编辑，现在用户需要你为他写一篇文章，以下是用户的需求："${userPrompt}"，除此之外，你应当使用${normalizedMood.toString()}的情绪与口吻来撰写文章。

**输出要求：**
- 请直接输出文章内容，建议从第一行开始就是正文
- 优先输出文章内容本身，避免添加不必要的前缀或解释
- 如果确实需要说明，请保持简洁，优先输出正文`;
};

/**
 * 生成 LaTeX 文档的提示词
 */
export const generateLatexPrompt = (mood: string[], userPrompt: string): string => {
  const basePrompt = generateArticlePrompt(mood, userPrompt);
  const template = getPromptTemplate('latexPrompt', { basePrompt });
  return template || `${basePrompt}\n请使用规范的 LaTeX 语法输出完整文档，包括必要的章节结构，禁止输出额外解释。`;
};

/**
 * 生成 Markdown 文档的提示词
 */
export const generateMarkdownPrompt = (mood: string[], userPrompt: string): string => {
  const basePrompt = generateArticlePrompt(mood, userPrompt);
  const template = getPromptTemplate('markdownPrompt', { basePrompt });
  return template || basePrompt;
};

export const wholeArticleContextPrompt = (content: string): string => {
  const template = getPromptTemplate('wholeArticleContextPrompt', { content });
  return template || `你是一个文笔出色的编辑，现在我手上有一篇文档，内容如下：：：【文章开始】"${content}"【文章结束】；；；你需要理解文档意思，并根据我的提示词来进一步生成内容。

**输出要求：**
- 请直接输出生成的内容，建议从第一行开始就是正文
- 优先输出生成的内容本身，避免添加不必要的前缀或解释
- 如果确实需要说明，请保持简洁，优先输出正文`;
};

export interface SuggestionPreset {
  label: string;
  prompt: string;
}

/**
 * 获取当前语言的预设提示词（用于快速开始界面的建议按钮）
 */
export function getSuggestionPresets(): SuggestionPreset[] {
  const prompts = getCurrentLocalePrompts();
  return prompts.suggestionPresets || [];
}

/**
 * 导出为计算属性，保持向后兼容
 * 注意：由于需要动态加载，这里返回一个函数调用结果
 * 调用者应该使用 getSuggestionPresets() 函数而不是直接使用常量
 */
export const suggestionPresets: SuggestionPreset[] = getSuggestionPresets();

export const explainWordPrompt = (word: string, contexts?: string[]): string => {
  let contextText = '';
  if (contexts && contexts.length > 0) {
    contextText = `\n\n以下是在文档中出现的上下文片段，请结合这些上下文给出更符合文章语境的解释：\n${contexts.map((ctx, idx) => `${idx + 1}. ${ctx}`).join('\n')}`;
  }
  
  // 先获取模板，然后替换占位符
  const prompts = getCurrentLocalePrompts();
  const template = prompts.prompts?.explainWordPrompt;
  
  if (template) {
    // 替换 {word} 和 {contexts} 占位符
    let result = template.replace(/{word}/g, word);
    result = result.replace(/{contexts}/g, contextText);
    return result;
  }
  
  // 回退逻辑
  return `请用一句话解释"${word}"这个词的意思。${contextText ? `结合以下文档中的上下文，给出更符合文章语境的解释：${contexts?.map((ctx, idx) => `${idx + 1}. ${ctx}`).join('\n')}` : ''}\n\n**输出要求：请直接输出释义句子本身，建议从第一行开始直接输出。优先输出释义内容，避免添加格式说明、标题、标签等不必要的内容。**`;
};

export const generateGraphPrompt = (
  engine: string,
  type: string,
  prompt: string,
  specialPrompt?: string,
): string => {
  const specialPromptText = specialPrompt ? `另外，需要注意：${specialPrompt}` : '';
  const template = getPromptTemplate('generateGraphPrompt', { engine, type, prompt, specialPrompt: specialPromptText });
  return template || `你现在需要使用代码来画出一个图表，你需要使用${engine}的图形语言，图表类型是：${type}，用户的提示词是：${prompt}，请根据用户的提示词来生成图表。

**输出要求：**
- 请输出代码，代码要用代码框\`\`\`${engine}\`\`\`包裹，并且代码框要包含图形语言的名称${specialPromptText}
- 建议从第一行开始就是代码框，优先输出代码内容
- 如果确实需要说明，请保持简洁，优先输出代码`;
};

export const expandTreeNodePrompt = (
  treeJson: string,
  nodeJson: string,
  schema: string,
  userPrompt = '',
): string => {
  const userPromptText = userPrompt ? `除此之外，用户提示词如下，可供部分参考：${userPrompt}。` : '';
  const template = getPromptTemplate('expandTreeNodePrompt', { treeJson, nodeJson, schema, userPrompt: userPromptText });
  return template || `你是一个文笔出色的编辑，以下是一篇文章大纲的树形json结构，请判断文章的大致大纲结构:${treeJson}接下来，你要扩展其中的一个节点，为节点添加若干个子章节节点，需要扩展的节点如下：${nodeJson}，请根据节点的标题和文本内容，自动生成若干个子章节节点，以JSON列表的方式返回,类似于[{...},{...}]节点的格式与原节点相同，需要遵循如下规范:${schema}。${userPromptText}

**输出要求：**
- 请返回JSON格式的节点列表
- 建议从第一行开始就是JSON数组，优先输出JSON内容
- 如果确实需要说明，请保持简洁，优先输出JSON数组`;
};

export const generateContentPrompt = (
  treeJson: string,
  nodeJson: string,
  userPrompt = '',
): string => {
  const userPromptText = userPrompt ? `除此之外，用户提示词如下，可供部分参考：${userPrompt}。` : '';
  const template = getPromptTemplate('generateContentPrompt', { treeJson, nodeJson, userPrompt: userPromptText });
  const baseInstruction = template || `你是一个文笔出色的编辑，以下是一篇文章大纲的树形json结构，请判断文章的大致大纲结构:${treeJson}${userPromptText}接下来，你要根据全文的结构，为以下的章节撰写内容，注意不要泛泛而谈，内容要丰富翔实：${nodeJson}。

**重要：你必须严格按照 JSON 格式输出，格式如下：**
{"content":"你的章节内容"}

**输出要求：**
- 请直接输出 JSON 对象，格式为 {"content":"..."}，建议从第一行开始就是JSON对象
- 优先输出JSON对象，避免在 JSON 前后添加不必要的文字
- 如果确实需要说明，请保持简洁，优先输出JSON对象`;
  return buildSchemaPrompt(CONTENT_SCHEMA, baseInstruction);
};

export const generateParentNodeContentPrompt = (
  treeJson: string,
  nodeJson: string,
  userPrompt = '',
): string => {
  const userPromptText = userPrompt ? `除此之外，用户提示词如下，可供部分参考：${userPrompt}。` : '';
  const template = getPromptTemplate('generateParentNodeContentPrompt', { treeJson, nodeJson, userPrompt: userPromptText });
  const baseInstruction = template || `你是一个文笔出色的编辑，以下是一篇文章大纲的树形json结构，请判断文章的大致大纲结构:${treeJson}接下来，你要根据全文的结构，为以下的章节撰写内容。由于这个章节已经有子章节介绍详细内容，因此你只需要写一些总体性、引导性的文字即可，不需要太多：${nodeJson}${userPromptText}。

**重要：你必须严格按照 JSON 格式输出，格式如下：**
{"content":"你的章节内容"}

**输出要求：**
- 请直接输出 JSON 对象，格式为 {"content":"..."}，建议从第一行开始就是JSON对象
- 优先输出JSON对象，避免在 JSON 前后添加不必要的文字
- 如果确实需要说明，请保持简洁，优先输出JSON对象`;
  return buildSchemaPrompt(CONTENT_SCHEMA, baseInstruction);
};

export const updateTitlePrompt = (conversationSummary: string): string => {
  const prompts = getCurrentLocalePrompts();
  const template = prompts.prompts?.updateTitlePrompt;
  const instruction = template
    ? template.replace('{conversationSummary}', conversationSummary)
    : `请根据以下对话内容，总结一个简洁且信息量充足的标题。标题应该准确反映对话的核心主题，长度控制在4-20个字符之间。

对话内容如下：
${conversationSummary}

**输出要求：**
- 请严格按照 JSON Schema 格式输出，优先输出 JSON 对象
- 建议从第一行开始就是JSON对象，避免添加不必要的解释
- 如果确实需要说明，请保持简洁，优先输出JSON对象`;
  return buildSchemaPrompt(DOCUMENT_TITLE_SCHEMA, instruction);
};

export const ragQueryReferencePrompt = (queryResults: unknown): string => {
  const queryResultsStr = JSON.stringify(queryResults);
  const template = getPromptTemplate('ragQueryReferencePrompt', { queryResults: queryResultsStr });
  return template || `本系统接入了RAG检索系统，以下是知识库的检索结果，由于内容可能与用户需求有偏差，所以请自行仔细甄别是否采纳：[检索内容开始]${queryResultsStr}[检索内容结束]

**输出要求：**
- 请直接输出实际需要的内容，建议从第一行开始就是正文
- 优先输出内容本身，避免添加不必要的前缀或解释
- 如果确实需要说明，请保持简洁，优先输出正文`;
};

export const suggestionCompletionPrompt = (
  preContext: string,
  postContext: string, // 保留参数以保持兼容性，但不再使用
  currentLine: string = '',
  documentType: string = 'Markdown'
) => {
  const prompts = getCurrentLocalePrompts();
  const suggestionPrompt = prompts.prompts?.suggestionCompletionPrompt;
  
  // 构建优化的system提示（包含文档类型和当前行信息）
  const systemContent = 
    `你是一个AI智能写作助手，专门用于${documentType}文档的自动补全。\n\n**补全功能的目的：**\n- 你的任务是像Transformer模型预测下一个词一样，推断在[CURRENT_POS]位置（即当前光标位置）之后最适合接续的文本内容\n- [CURRENT_POS]就是当前光标的位置，你需要预测光标之后应该出现什么内容\n- 补全的内容应该与光标之前的上下文自然连贯，就像用户继续输入一样\n- 补全内容应该保持与当前行的风格、格式和语境一致\n\n**绝对禁止：**\n- 禁止复述提示词，禁止说"根据您的要求"、"我将为您"、"好的"、"明白了"等\n- 禁止添加任何解释、说明、前缀或后缀\n- 如果当前上下文无需补全，或难以补全，请直接输出空字符串\n- 只输出需要补全的文字本身，不要任何其他内容\n- 如果有需要插入空格或换行也请补全`;
  // 构建优化的user提示（只使用preContext，不使用postContext，避免大模型幻觉）
  // 强调[CURRENT_POS]是光标位置，需要预测光标之后的内容
  const userContent = currentLine 
    ? `请根据光标之前的上下文，预测在光标位置[CURRENT_POS]之后最适合接续的文本内容。\n\n当前行内容：${currentLine}\n\n光标之前的上下文：\n${preContext}[CURRENT_POS]`
    : `请根据光标之前的上下文，预测在光标位置[CURRENT_POS]之后最适合接续的文本内容。\n\n光标之前的上下文：\n${preContext}[CURRENT_POS]`;
  
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
      const beforeContextPattern = /(\n\n(?:光标之前的上下文|Context before the cursor|Kontext vor dem Cursor|Contexte avant le curseur|カーソルの前のコンテキスト|커서 이전의 컨텍스트)：\n)/
      if (beforeContextPattern.test(userPrompt)) {
        userPrompt = userPrompt.replace(
          beforeContextPattern,
          `\n\n当前行内容：${currentLine}$1`
        )
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
        content: systemPrompt,
      },
      {
        role: 'user',
        content: userPrompt,
      },
    ];
  }
  
  // 回退到原始实现（使用优化的内容）
  return [
    {
      role: 'system',
      content: systemContent,
    },
    {
      role: 'user',
      content: userContent,
    },
  ];
};

export interface PresetOption {
  value: string;
}

/**
 * 获取当前语言的预设模板（用于快速开始界面的输入框自动补全）
 */
export function getPresets(): PresetOption[] {
  const prompts = getCurrentLocalePrompts();
  return prompts.presets || [];
}

/**
 * 导出为计算属性，保持向后兼容
 * 注意：由于需要动态加载，这里返回一个函数调用结果
 * 调用者应该使用 getPresets() 函数而不是直接使用常量
 */
export const presets: PresetOption[] = getPresets();
