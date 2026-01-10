/**
 * 元信息Tool
 * 访问、修改文档元信息，调用AI工具生成元信息
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress,
  ToolLocales
} from '../../types/agent-tool'
import type { ArticleMetaData, AIDialogMessage } from '@/types'
import { useWorkspace } from '../../stores/workspace'
import { createRendererLogger } from '../logger'
import { i18n } from '../../i18n'
import { createAiTask, cancelAiTask, ai_types } from '../ai_tasks'
import { getSetting } from '../settings'
import { ref } from 'vue'
import { 
  generateTitlePrompt, 
  generateDescriptionPrompt, 
  generateKeywordsPrompt 
} from '../prompts'
import { extractOuterJsonString } from '../regex-utils'
import { removeTextFromOutline } from '../document/outline'
import { parseJsonWithClean, createDetailedError, retryLLMCall } from './tool-utils'
import MetadataDisplay from './components/MetadataDisplay.vue'
import { getActiveDocumentInfoViaBroadcast } from './document-broadcast-helper'
import { getWindowType } from '../event-bus'

const logger = createRendererLogger('MetadataTool')
const workspace = useWorkspace()

/**
 * 清理和规范化字符串值
 */
function normalizeStringValue(value: string | string[]): string {
  return Array.isArray(value) ? value.join(' ') : String(value || '').trim()
}

/**
 * 清理和规范化关键词数组
 */
function sanitizeKeywords(keywords: string[] | string | undefined): string[] {
  if (!keywords) return []
  
  const arr = Array.isArray(keywords) ? keywords : [keywords]
  const unique = new Set<string>()
  
  arr.forEach((item) => {
    const trimmed = String(item).trim()
    if (trimmed) {
      unique.add(trimmed)
    }
  })
  
  return Array.from(unique)
}

/**
 * 解析关键词结果
 */
function parseKeywordsResult(raw: string): string[] {
  if (!raw || raw.trim().length === 0) {
    return []
  }

  // 首先尝试提取JSON字符串
  let jsonString = extractOuterJsonString(raw)
  
  // 如果没有找到JSON，尝试清理整个字符串
  if (!jsonString) {
    // 移除代码块标记
    const cleaned = raw
      .replace(/```json\n?/gi, '')
      .replace(/```\n?/g, '')
      .trim()
    
    // 尝试提取数组部分
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
    if (arrayMatch) {
      jsonString = arrayMatch[0]
    } else {
      // 尝试提取对象中的keywords字段
      const objMatch = cleaned.match(/\{[^}]*"keywords"\s*:\s*\[[^\]]*\][^}]*\}/)
      if (objMatch) {
        jsonString = objMatch[0]
      } else {
        jsonString = cleaned
      }
    }
  }
  
  if (!jsonString) {
    return []
  }
  
  try {
    // 尝试解析为数组
    const parseResult = parseJsonWithClean<string[]>(jsonString)
    if (parseResult.success && Array.isArray(parseResult.data)) {
      return sanitizeKeywords(parseResult.data)
    }
    
    // 尝试解析为对象
    const objParse = parseJsonWithClean<{ keywords?: unknown[] }>(jsonString)
    if (objParse.success && objParse.data && typeof objParse.data === 'object') {
      if (Array.isArray(objParse.data.keywords)) {
        return sanitizeKeywords(objParse.data.keywords as string[])
      }
      // 尝试其他可能的字段名
      const possibleFields = ['keyword', 'tags', 'keyWords', 'key_words']
      for (const field of possibleFields) {
        if (Array.isArray((objParse.data as any)[field])) {
          return sanitizeKeywords((objParse.data as any)[field] as string[])
        }
      }
    }
    
    return []
  } catch (error) {
    logger.warn('解析关键词JSON失败:', error)
    return []
  }
}

/**
 * 使用LLM生成标题（带自动重试）
 */
async function generateTitleWithLLM(
  outlineJson: string,
  signal?: AbortSignal,
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void
): Promise<string> {
  return await retryLLMCall(async () => {
  const prompt = generateTitlePrompt(outlineJson)
  logger.debug(`[generateTitleWithLLM] 开始生成标题，outlineJson长度=${outlineJson.length}, prompt长度=${prompt.length}`)
  const target = ref('')
  const originKey = `meta-title-${Date.now()}-${Math.random().toString(36).slice(2)}`
  // 参照 MetaInfoPanel.vue 的实现，只设置 stream: true，不设置 temperature 和 enableKnowledgeBase
  const messages: AIDialogMessage[] = [{
    role: 'user',
    content: prompt,
  }]
  const { handle, done } = createAiTask(
    '生成标题',
    messages,
    target,
    'chat',
    originKey,
    { stream: true }
  )
  logger.debug(`[generateTitleWithLLM] 任务已创建，handle=${handle}, originKey=${originKey}`)

  // 立即通过 onUpdate 传递流式输出信息（在 await done 之前）
  if (onUpdate) {
    onUpdate({
      content: {
        stage: 'generating-title-streaming',
        titleTargetRef: target,
        titleDonePromise: done
      },
      format: 'json'
    }, {
      percentage: 30,
      message: '正在生成标题（流式输出）...'
    })
  }

  if (signal) {
    signal.addEventListener('abort', () => {
      cancelAiTask(handle, false, false)
    })
  }

  try {
    await done
    // 等待一小段时间，确保结果已同步（对于非主窗口的任务）
    await new Promise(resolve => setTimeout(resolve, 50))
  } catch (error) {
    // 如果任务被取消或出错，检查是否是因为取消
    if (signal?.aborted) {
      throw new Error('操作已取消')
    }
    // 重新抛出原始错误
    throw error
  }

  if (signal?.aborted) {
    throw new Error('操作已取消')
  }

  const rawOutput = target.value.trim()
  logger.debug(`[generateTitleWithLLM] 任务完成，target.value长度=${target.value.length}, rawOutput长度=${rawOutput.length}`)
  if (!rawOutput || rawOutput.length === 0) {
    logger.warn('LLM返回空结果，可能是API错误、请求被取消或模型返回空内容', {
      targetValue: target.value,
      targetValueLength: target.value.length,
      rawOutputLength: rawOutput.length
    })
    throw new Error('AI返回内容为空，无法生成标题。请检查API配置或重试。')
  }

  // 尝试提取JSON（如果LLM返回的是JSON格式）
  const jsonMatch = extractOuterJsonString(rawOutput)
  if (jsonMatch) {
    try {
      const parseResult = parseJsonWithClean<{ title?: string; content?: string }>(jsonMatch)
      if (parseResult.success) {
        const extracted = parseResult.data?.title || parseResult.data?.content
        if (extracted && typeof extracted === 'string' && extracted.trim().length > 0) {
          return extracted.trim()
        }
      }
    } catch (error) {
      logger.warn('解析JSON失败，使用原始输出:', error)
    }
  }

  // 如果不是JSON，直接返回清理后的文本
  // 移除可能的代码块标记和多余内容
  const cleaned = rawOutput
    .replace(/```json\n?/gi, '')
    .replace(/```\n?/g, '')
    .replace(/^["']|["']$/g, '')  // 移除首尾引号
    .trim()

  if (!cleaned || cleaned.length === 0) {
    throw new Error('AI返回内容为空，无法生成标题')
  }

  return cleaned
  }, {
    maxRetries: 3,
    retryDelay: 3000,
    onRetry: (attempt, error) => {
      logger.warn(`[generateTitleWithLLM] LLM返回空，正在重试 (${attempt}/3)...`, error)
    }
  })
}

/**
 * 使用LLM生成描述（带自动重试）
 */
async function generateDescriptionWithLLM(
  outlineJson: string,
  signal?: AbortSignal,
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void
): Promise<string> {
  return await retryLLMCall(async () => {
  const prompt = generateDescriptionPrompt(outlineJson)
  logger.debug(`[generateDescriptionWithLLM] 开始生成描述，outlineJson长度=${outlineJson.length}, prompt长度=${prompt.length}`)
  const target = ref('')
  const originKey = `meta-description-${Date.now()}-${Math.random().toString(36).slice(2)}`
  // 参照 MetaInfoPanel.vue 的实现，只设置 stream: true，不设置 temperature 和 enableKnowledgeBase
  const messages: AIDialogMessage[] = [{
    role: 'user',
    content: prompt,
  }]
  const { handle, done } = createAiTask(
    '生成描述',
    messages,
    target,
    'chat',
    originKey,
    { stream: true }
  )
  logger.debug(`[generateDescriptionWithLLM] 任务已创建，handle=${handle}, originKey=${originKey}`)

  // 立即通过 onUpdate 传递流式输出信息（在 await done 之前）
  if (onUpdate) {
    onUpdate({
      content: {
        stage: 'generating-description-streaming',
        descriptionTargetRef: target,
        descriptionDonePromise: done
      },
      format: 'json'
    }, {
      percentage: 30,
      message: '正在生成描述（流式输出）...'
    })
  }

  if (signal) {
    signal.addEventListener('abort', () => {
      cancelAiTask(handle, false, false)
    })
  }

  try {
    await done
    // 等待一小段时间，确保结果已同步（对于非主窗口的任务）
    await new Promise(resolve => setTimeout(resolve, 50))
  } catch (error) {
    // 如果任务被取消或出错，检查是否是因为取消
    if (signal?.aborted) {
      throw new Error('操作已取消')
    }
    // 重新抛出原始错误
    throw error
  }

  if (signal?.aborted) {
    throw new Error('操作已取消')
  }

  const rawOutput = target.value.trim()
  logger.debug(`[generateDescriptionWithLLM] 任务完成，target.value长度=${target.value.length}, rawOutput长度=${rawOutput.length}`)
  if (!rawOutput || rawOutput.length === 0) {
    logger.warn('LLM返回空结果，可能是API错误、请求被取消或模型返回空内容', {
      targetValue: target.value,
      targetValueLength: target.value.length,
      rawOutputLength: rawOutput.length
    })
    throw new Error('AI返回内容为空，无法生成描述。请检查API配置或重试。')
  }

  // 尝试提取JSON（如果LLM返回的是JSON格式）
  const jsonMatch = extractOuterJsonString(rawOutput)
  if (jsonMatch) {
    try {
      const parseResult = parseJsonWithClean<{ description?: string; content?: string }>(jsonMatch)
      if (parseResult.success) {
        const extracted = parseResult.data?.description || parseResult.data?.content
        if (extracted && typeof extracted === 'string' && extracted.trim().length > 0) {
          return extracted.trim()
        }
      }
    } catch (error) {
      logger.warn('解析JSON失败，使用原始输出:', error)
    }
  }

  // 如果不是JSON，直接返回清理后的文本
  // 移除可能的代码块标记和多余内容
  const cleaned = rawOutput
    .replace(/```json\n?/gi, '')
    .replace(/```\n?/g, '')
    .replace(/^["']|["']$/g, '')  // 移除首尾引号
    .trim()

  if (!cleaned || cleaned.length === 0) {
    throw new Error('AI返回内容为空，无法生成描述')
  }

  return cleaned
  }, {
    maxRetries: 3,
    retryDelay: 3000,
    onRetry: (attempt, error) => {
      logger.warn(`[generateDescriptionWithLLM] LLM返回空，正在重试 (${attempt}/3)...`, error)
    }
  })
}

/**
 * 使用LLM生成关键词（带自动重试）
 */
async function generateKeywordsWithLLM(
  outlineJson: string,
  signal?: AbortSignal,
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void
): Promise<string[]> {
  return await retryLLMCall(async () => {
  const prompt = generateKeywordsPrompt(outlineJson)
  logger.debug(`[generateKeywordsWithLLM] 开始生成关键词，outlineJson长度=${outlineJson.length}, prompt长度=${prompt.length}`)
  const target = ref('')
  const originKey = `meta-keywords-${Date.now()}-${Math.random().toString(36).slice(2)}`
  // 参照 MetaInfoPanel.vue 的实现，只设置 stream: true，不设置 temperature 和 enableKnowledgeBase
  const messages: AIDialogMessage[] = [{
    role: 'user',
    content: prompt,
  }]
  const { handle, done } = createAiTask(
    '生成关键词',
    messages,
    target,
    'chat',
    originKey,
    { stream: true }
  )
  logger.debug(`[generateKeywordsWithLLM] 任务已创建，handle=${handle}, originKey=${originKey}`)

  // 立即通过 onUpdate 传递流式输出信息（在 await done 之前）
  if (onUpdate) {
    onUpdate({
      content: {
        stage: 'generating-keywords-streaming',
        keywordsTargetRef: target,
        keywordsDonePromise: done
      },
      format: 'json'
    }, {
      percentage: 30,
      message: '正在生成关键词（流式输出）...'
    })
  }

  if (signal) {
    signal.addEventListener('abort', () => {
      cancelAiTask(handle, false, false)
    })
  }

  try {
    await done
    // 等待一小段时间，确保结果已同步（对于非主窗口的任务）
    await new Promise(resolve => setTimeout(resolve, 50))
  } catch (error) {
    // 如果任务被取消或出错，检查是否是因为取消
    if (signal?.aborted) {
      throw new Error('操作已取消')
    }
    // 重新抛出原始错误
    throw error
  }

  if (signal?.aborted) {
    throw new Error('操作已取消')
  }

  const rawOutput = target.value.trim()
  logger.debug(`[generateKeywordsWithLLM] 任务完成，target.value长度=${target.value.length}, rawOutput长度=${rawOutput.length}`)
  if (!rawOutput || rawOutput.length === 0) {
    logger.warn('LLM返回空结果，返回空关键词数组')
      throw new Error('AI返回内容为空，无法生成关键词。请检查API配置或重试。')
  }

  const keywords = parseKeywordsResult(rawOutput)
  
  // 如果解析失败，尝试更宽松的解析方式
  if (keywords.length === 0) {
    logger.warn('标准解析失败，尝试更宽松的解析方式')
    
    // 尝试从文本中提取关键词（用逗号、分号、换行符分隔）
    const lines = rawOutput.split(/[,\n;，；]/).map(line => line.trim()).filter(line => line.length > 0)
    if (lines.length > 0) {
      // 如果提取到了一些文本，尝试作为关键词
      const extracted = lines.slice(0, 10) // 最多取10个
      logger.info('从文本中提取到关键词:', extracted)
      return sanitizeKeywords(extracted)
    }
    
      // 如果还是失败，记录原始输出并抛出错误（让重试机制处理）
    logger.warn('无法解析关键词，原始输出:', rawOutput.substring(0, 200))
      throw new Error('AI返回内容无法解析为关键词。请检查API配置或重试。')
  }

  return keywords
  }, {
    maxRetries: 3,
    retryDelay: 3000,
    checkEmpty: (result) => Array.isArray(result) && result.length === 0,
    onRetry: (attempt, error) => {
      logger.warn(`[generateKeywordsWithLLM] LLM返回空，正在重试 (${attempt}/3)...`, error)
    }
  })
}

/**
 * 元信息Tool回调函数
 */
const metadataToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const operation = params.operation as 'get' | 'set' | 'generate'
  const field = params.field as 'title' | 'description' | 'keywords' | 'author' | 'all' | undefined
  const value = params.value as string | string[] | undefined
  const tabId = params.tabId as string | undefined

  if (!operation) {
    return {
      status: 'failed',
      error: createDetailedError(
        '缺少必需参数: operation（操作类型）',
        [
          '{"operation": "get", "field": "title"}  // 获取标题',
          '{"operation": "set", "field": "title", "value": "新标题"}  // 设置标题',
          '{"operation": "generate", "field": "all"}  // 生成所有元信息'
        ],
        [
          '支持的操作：get（获取）、set（设置）、generate（生成）',
          'get操作需要field参数指定要获取的字段：title、description、keywords、author、all',
          'set操作需要field和value参数',
          'generate操作可以调用AI生成元信息，需要field参数'
        ]
      )
    }
  }

  const validOperations = ['get', 'set', 'generate']
  if (!validOperations.includes(operation)) {
    return {
      status: 'failed',
      error: createDetailedError(
        `无效的操作: ${operation}`,
        [
          '{"operation": "get", "field": "title"}  // 获取操作',
          '{"operation": "set", "field": "title", "value": "新标题"}  // 设置操作',
          '{"operation": "generate", "field": "all"}  // 生成操作'
        ],
        [
          '支持的操作类型：get（获取）、set（设置）、generate（生成）',
          'get：获取文档元信息',
          'set：设置文档元信息',
          'generate：使用AI生成文档元信息'
        ]
      )
    }
  }

  try {
    onUpdate({
      content: {
        stage: 'loading',
        operation
      },
      format: 'json'
    }, {
      percentage: 10,
      message: i18n.global.t('agent.tool.metadata.progress.loading', '正在加载文档...')
    })

    // 获取文档（支持跨窗口）
    const windowType = getWindowType()
    let doc: any = null
    let targetTabId: string | null = null

    if (windowType === 'setting') {
      // 在设置窗口中，通过广播获取文档信息
      const docInfo = await getActiveDocumentInfoViaBroadcast()
      if (!docInfo) {
        return {
          status: 'failed',
          error: createDetailedError(
            '没有活动的文档标签页',
            [
              '请先打开一个文档，然后再执行元信息操作',
              '或者指定tabId参数：{"operation": "get", "field": "title", "tabId": "文档ID"}'
            ],
            [
              'metadata工具需要有一个活动的文档才能操作',
              '可以通过tabId参数指定要操作的文档',
              '支持在文档内容和元数据中进行操作'
            ]
          )
        }
      }
      // 检查文档是否有内容（根据格式检查对应的内容字段）
      const hasContent = docInfo.format === 'tex' 
        ? Boolean(docInfo.tex && docInfo.tex.trim().length > 0)
        : Boolean(docInfo.markdown && docInfo.markdown.trim().length > 0)
      
      if (!hasContent) {
        const formatName = docInfo.format === 'tex' ? 'LaTeX' : 'Markdown'
        return {
          status: 'failed',
          error: createDetailedError(
            `文档内容为空，无法进行${formatName}格式的元信息操作`,
            [
              '请确保文档有内容后再执行元信息操作',
              'generate操作可以根据文档内容生成元信息，需要文档有内容'
            ],
            [
              '文档必须包含内容才能进行元信息操作',
              'generate操作需要文档内容才能生成准确的元信息',
              '确保文档已保存并有实际内容'
            ]
          )
        }
      }
      
      // 构造一个类似workspace文档的对象
      doc = {
        id: docInfo.id,
        tabId: docInfo.tabId,
        path: docInfo.path,
        format: docInfo.format,
        meta: docInfo.meta,
        outline: docInfo.outline,
        markdown: docInfo.markdown,
        tex: docInfo.tex
      }
      targetTabId = docInfo.tabId
    } else {
      // 在主窗口中，直接使用workspace
      targetTabId = tabId || workspace.activeTabId.value
      if (!targetTabId) {
        return {
          status: 'failed',
          error: createDetailedError(
            '没有活动的文档标签页',
            [
              '请先打开一个文档，然后再执行元信息操作',
              '或者指定tabId参数：{"operation": "get", "field": "title", "tabId": "文档ID"}'
            ],
            [
              'metadata工具需要有一个活动的文档才能操作',
              '可以通过tabId参数指定要操作的文档'
            ]
          )
        }
      }
      doc = workspace.ensureDocument(targetTabId)
      if (!doc) {
        return {
          status: 'failed',
          error: createDetailedError(
            '文档不存在',
            [
              '请确认文档已正确打开',
              '检查tabId参数是否正确：{"operation": "get", "field": "title", "tabId": "正确的文档ID"}'
            ],
            [
              '确保文档已正确打开或tabId有效',
              '可以通过tabId参数指定要操作的文档'
            ]
          )
        }
      }
    }

    const currentMeta = doc.meta

    if (operation === 'get') {
      // 获取元信息
      onUpdate({
        content: {
          stage: 'completed',
          operation: 'get',
          metadata: currentMeta
        },
        format: 'json'
      }, {
        percentage: 100,
        message: i18n.global.t('agent.tool.metadata.progress.completed', '获取元信息完成')
      })

      return {
        status: 'succeeded',
        data: {
          content: {
            stage: 'completed',
            operation: 'get',
            metadata: currentMeta
          },
          format: 'json'
        },
        result: {
          operation: 'get',
          metadata: currentMeta
        }
      }

    } else if (operation === 'set') {
      // 设置元信息
      if (!field) {
        return {
          status: 'failed',
          error: i18n.global.t('agent.tool.metadata.error.missingField', 'set操作需要field参数')
        }
      }

      if (value === undefined) {
        return {
          status: 'failed',
          error: i18n.global.t('agent.tool.metadata.error.missingValue', 'set操作需要value参数')
        }
      }

      onUpdate({
        content: {
          stage: 'updating',
          operation: 'set',
          field,
          value
        },
        format: 'json'
      }, {
        percentage: 50,
        message: i18n.global.t('agent.tool.metadata.progress.updating', '正在更新元信息...')
      })

      // 更新元信息
      const updateMeta = (meta: ArticleMetaData) => {
        if (field === 'title') {
          meta.title = normalizeStringValue(value as string)
        } else if (field === 'description') {
          meta.description = normalizeStringValue(value as string)
        } else if (field === 'author') {
          meta.author = normalizeStringValue(value as string)
        } else if (field === 'keywords') {
          meta.keywords = sanitizeKeywords(value as string[] | string)
        } else if (field === 'all') {
          // 更新所有字段
          if (typeof value === 'object' && !Array.isArray(value)) {
            const metaObj = value as Partial<ArticleMetaData>
            if (metaObj.title !== undefined) meta.title = normalizeStringValue(metaObj.title)
            if (metaObj.description !== undefined) meta.description = normalizeStringValue(metaObj.description)
            if (metaObj.author !== undefined) meta.author = normalizeStringValue(metaObj.author)
            if (metaObj.keywords !== undefined) meta.keywords = sanitizeKeywords(metaObj.keywords)
          } else {
            return {
              status: 'failed',
              error: i18n.global.t('agent.tool.metadata.error.invalidValue', 'all字段需要对象类型的value')
            }
          }
        }
      }

      // 更新元信息
      let updatedMeta: ArticleMetaData
      if (windowType === 'setting') {
        // 在设置窗口中，通过广播通知主窗口更新
        // 注意：这里我们只能更新本地doc对象，实际更新需要在主窗口完成
        updateMeta(doc.meta)
        // 重新获取文档信息（通过广播）
        const updatedDocInfo = await getActiveDocumentInfoViaBroadcast()
        updatedMeta = updatedDocInfo ? updatedDocInfo.meta : JSON.parse(JSON.stringify(doc.meta))
      } else {
        // 在主窗口中，直接更新
        workspace.updateDocumentMeta(targetTabId, updateMeta)
        // 重新获取文档以确保获取最新的元信息（深拷贝避免引用问题）
        const updatedDoc = workspace.ensureDocument(targetTabId)
        updatedMeta = JSON.parse(JSON.stringify(updatedDoc.meta))
      }

      onUpdate({
        content: {
          stage: 'completed',
          operation: 'set',
          field,
          metadata: updatedMeta
        },
        format: 'json'
      }, {
        percentage: 100,
        message: i18n.global.t('agent.tool.metadata.progress.completed', '更新元信息完成')
      })

      return {
        status: 'succeeded',
        data: {
          content: {
            stage: 'completed',
            operation: 'set',
            field,
            metadata: updatedMeta
          },
          format: 'json'
        },
        result: {
          operation: 'set',
          field,
          metadata: updatedMeta
        }
      }

    } else if (operation === 'generate') {
      // 生成元信息
      if (!field) {
        return {
          status: 'failed',
          error: i18n.global.t('agent.tool.metadata.error.missingField', 'generate操作需要field参数')
        }
      }

      // 获取大纲树JSON（用于生成）
      // 检查outline是否存在，如果不存在则使用默认大纲
      if (!doc.outline) {
        logger.warn('文档大纲为空，使用默认大纲')
        return {
          status: 'failed',
          error: i18n.global.t('agent.tool.metadata.error.noOutline', '文档大纲为空，无法生成元信息')
        }
      }
      const outlineTree = doc.outline
      const outlineJson = JSON.stringify(removeTextFromOutline(outlineTree))

      onUpdate({
        content: {
          stage: 'generating',
          operation: 'generate',
          field
        },
        format: 'json'
      }, {
        percentage: 30,
        message: i18n.global.t('agent.tool.metadata.progress.generating', `正在生成${field}...`)
      })

      let generatedValue: string | string[] | { title: string; description: string; keywords: string[] }
      let updatedMeta: ArticleMetaData

      if (field === 'title') {
        generatedValue = await generateTitleWithLLM(outlineJson, signal, onUpdate)
        if (windowType === 'setting') {
          // 在设置窗口中，更新本地doc对象
          doc.meta.title = normalizeStringValue(generatedValue as string)
          const updatedDocInfo = await getActiveDocumentInfoViaBroadcast()
          updatedMeta = updatedDocInfo ? updatedDocInfo.meta : JSON.parse(JSON.stringify(doc.meta))
        } else {
          workspace.updateDocumentMeta(targetTabId, (meta) => {
            meta.title = normalizeStringValue(generatedValue as string)
          })
          updatedMeta = JSON.parse(JSON.stringify(workspace.ensureDocument(targetTabId).meta))
        }

      } else if (field === 'description') {
        generatedValue = await generateDescriptionWithLLM(outlineJson, signal, onUpdate)
        if (windowType === 'setting') {
          // 在设置窗口中，更新本地doc对象
          doc.meta.description = normalizeStringValue(generatedValue as string)
          const updatedDocInfo = await getActiveDocumentInfoViaBroadcast()
          updatedMeta = updatedDocInfo ? updatedDocInfo.meta : JSON.parse(JSON.stringify(doc.meta))
        } else {
          workspace.updateDocumentMeta(targetTabId, (meta) => {
            meta.description = normalizeStringValue(generatedValue as string)
          })
          updatedMeta = JSON.parse(JSON.stringify(workspace.ensureDocument(targetTabId).meta))
        }

      } else if (field === 'keywords') {
        generatedValue = await generateKeywordsWithLLM(outlineJson, signal, onUpdate)
        if (windowType === 'setting') {
          // 在设置窗口中，更新本地doc对象
          doc.meta.keywords = sanitizeKeywords(generatedValue as string[])
          const updatedDocInfo = await getActiveDocumentInfoViaBroadcast()
          updatedMeta = updatedDocInfo ? updatedDocInfo.meta : JSON.parse(JSON.stringify(doc.meta))
        } else {
          workspace.updateDocumentMeta(targetTabId, (meta) => {
            meta.keywords = sanitizeKeywords(generatedValue as string[])
          })
          updatedMeta = JSON.parse(JSON.stringify(workspace.ensureDocument(targetTabId).meta))
        }

      } else if (field === 'all') {
        // 生成所有字段
        onUpdate({
          content: {
            stage: 'generating',
            operation: 'generate',
            field: 'all',
            currentField: 'title'
          },
          format: 'json'
        }, {
          percentage: 30,
          message: i18n.global.t('agent.tool.metadata.progress.generatingTitle', '正在生成标题...')
        })

        const title = await generateTitleWithLLM(outlineJson, signal, onUpdate)

        onUpdate({
          content: {
            stage: 'generating',
            operation: 'generate',
            field: 'all',
            currentField: 'description'
          },
          format: 'json'
        }, {
          percentage: 50,
          message: i18n.global.t('agent.tool.metadata.progress.generatingDescription', '正在生成描述...')
        })

        const description = await generateDescriptionWithLLM(outlineJson, signal, onUpdate)

        onUpdate({
          content: {
            stage: 'generating',
            operation: 'generate',
            field: 'all',
            currentField: 'keywords'
          },
          format: 'json'
        }, {
          percentage: 70,
          message: i18n.global.t('agent.tool.metadata.progress.generatingKeywords', '正在生成关键词...')
        })

        const keywords = await generateKeywordsWithLLM(outlineJson, signal, onUpdate)

        // 更新所有字段
        if (windowType === 'setting') {
          // 在设置窗口中，更新本地doc对象
          doc.meta.title = normalizeStringValue(title)
          doc.meta.description = normalizeStringValue(description)
          doc.meta.keywords = sanitizeKeywords(keywords)
          const updatedDocInfo = await getActiveDocumentInfoViaBroadcast()
          updatedMeta = updatedDocInfo ? updatedDocInfo.meta : JSON.parse(JSON.stringify(doc.meta))
        } else {
          workspace.updateDocumentMeta(targetTabId, (meta) => {
            meta.title = normalizeStringValue(title)
            meta.description = normalizeStringValue(description)
            meta.keywords = sanitizeKeywords(keywords)
          })
          updatedMeta = JSON.parse(JSON.stringify(workspace.ensureDocument(targetTabId).meta))
        }
        generatedValue = { title, description, keywords } as any

      } else {
        return {
          status: 'failed',
          error: i18n.global.t('agent.tool.metadata.error.invalidField', `无效的字段: ${field}`)
        }
      }

      if (signal?.aborted) {
        return {
          status: 'cancelled'
        }
      }

      onUpdate({
        content: {
          stage: 'completed',
          operation: 'generate',
          field,
          generatedValue,
          metadata: updatedMeta
        },
        format: 'json'
      }, {
        percentage: 100,
        message: i18n.global.t('agent.tool.metadata.progress.completed', '生成元信息完成')
      })

      return {
        status: 'succeeded',
        data: {
          content: {
            stage: 'completed',
            operation: 'generate',
            field,
            generatedValue,
            metadata: updatedMeta
          },
          format: 'json'
        },
        result: {
          operation: 'generate',
          field,
          generatedValue,
          metadata: updatedMeta
        }
      }
    }

    return {
      status: 'failed',
      error: '未知的操作类型'
    }
  } catch (error) {
    logger.error('元信息操作失败:', error)
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

const metadataToolLocales: ToolLocales = {
  zh_cn: {
    name: '元信息管理',
    description: '访问、修改文档元信息，调用AI工具生成标题、描述、关键词等'
  },
  en_us: {
    name: 'Metadata Management',
    description: 'Access and modify document metadata, use AI to generate title, description, keywords, etc.'
  },
  de_DE: {
    name: 'Metadatenverwaltung',
    description: 'Zugriff auf und Änderung von Dokumentmetadaten, Verwendung von KI zur Generierung von Titel, Beschreibung, Schlüsselwörtern usw.'
  },
  fr_FR: {
    name: 'Gestion des métadonnées',
    description: 'Accéder et modifier les métadonnées du document, utiliser l\'IA pour générer le titre, la description, les mots-clés, etc.'
  },
  ja_JP: {
    name: 'メタデータ管理',
    description: 'ドキュメントメタデータへのアクセスと変更、AIを使用してタイトル、説明、キーワードなどを生成'
  },
  ko_KR: {
    name: '메타데이터 관리',
    description: '문서 메타데이터 액세스 및 수정, AI를 사용하여 제목, 설명, 키워드 등 생성'
  }
}

export const metadataToolConfig: AgentToolConfig = {
  id: 'metadata',
  name: metadataToolLocales,
  description: metadataToolLocales,
  origin: 'internal',
  spec: {
    name: 'metadata',
    brief: 'Access and modify document metadata. Use AI to automatically generate title, description, keywords, etc.',
    fullSpec: `# Metadata Management Tool

## Description
Access, modify document metadata, or use AI to automatically generate title, description, keywords, and other metadata.

## Usage Scenarios
- View document metadata
- Modify document title, author, description, keywords
- Use AI to automatically generate metadata
- Batch update metadata

## Input Format
\`\`\`json
{
  "operation": "get|set|generate",
  "field": "title|description|keywords|author|all",  // Required for set and generate operations
  "value": "string|string[]|object",  // Required for set operation
  "tabId": "string"  // Optional, document tab ID, default uses current active tab
}
\`\`\`

## Operation Types

### get
Get current document metadata. No field parameter needed.

### set
Set a metadata field or all fields.
- Single field: field specifies field name, value is corresponding value
- All fields: field is "all", value is object containing all fields

### generate
Use AI to generate metadata.
- Single field: field specifies field to generate (title, description, keywords)
- All fields: field is "all", will generate title, description, keywords in sequence

## Output Format
\`\`\`json
{
  "operation": "get|set|generate",
  "field": "string",
  "metadata": {
    "title": "string",
    "author": "string",
    "description": "string",
    "keywords": ["string"]
  },
  "generatedValue": "string|string[]|object"
}
\`\`\`

## Important Notes
- Metadata includes: title, author, description, keywords (array)
- generate operation generates metadata based on document outline tree
- Generated metadata automatically updates to document
- keywords field must be string array
- All string fields automatically trim leading/trailing spaces
- keywords automatically deduplicated`
  },
  instruction: `
# 元信息管理工具

## 功能描述
访问、修改文档元信息，或使用AI自动生成标题、描述、关键词等元信息。

## 使用场景
- 查看文档元信息
- 修改文档标题、作者、描述、关键词
- 使用AI自动生成元信息
- 批量更新元信息

## 输入格式
\`\`\`json
{
  "operation": "get|set|generate",
  "field": "title|description|keywords|author|all",  // set和generate操作需要
  "value": "string|string[]|object",  // set操作需要
  "tabId": "string"  // 可选，文档标签页ID，默认使用当前活动标签页
}
\`\`\`

## 操作类型说明

### get
获取当前文档的元信息。不需要field参数。

### set
设置元信息的某个字段或所有字段。
- 单个字段：field指定字段名，value为对应的值
- 所有字段：field为"all"，value为包含所有字段的对象

### generate
使用AI生成元信息。
- 单个字段：field指定要生成的字段（title、description、keywords）
- 所有字段：field为"all"，会依次生成title、description、keywords

## 输出格式
\`\`\`json
{
  "operation": "get|set|generate",
  "field": "string",  // generate和set操作
  "metadata": {
    "title": "string",
    "author": "string",
    "description": "string",
    "keywords": ["string"]
  },
  "generatedValue": "string|string[]|object"  // generate操作
}
\`\`\`

## 注意事项
- 元信息包括：title（标题）、author（作者）、description（描述）、keywords（关键词数组）
- generate操作会基于文档大纲树生成元信息
- 生成的元信息会自动更新到文档
- keywords字段必须是字符串数组
- 所有字符串字段会自动去除首尾空格
- keywords会自动去重
`,
  callback: metadataToolCallback,
  displayComponent: MetadataDisplay,
  tags: ['metadata', 'document', 'ai'],
  enabled: true,
  editable: false,
  locales: metadataToolLocales,
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['get', 'set', 'generate'],
        description: '操作类型'
      },
      field: {
        type: 'string',
        enum: ['title', 'description', 'keywords', 'author', 'all'],
        description: '字段名（set和generate操作需要）'
      },
      value: {
        description: '字段值（set操作需要）'
      },
      tabId: {
        type: 'string',
        description: '文档标签页ID（可选，默认使用当前活动标签页）'
      }
    },
    required: ['operation']
  },
  outputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        description: '执行的操作类型'
      },
      field: {
        type: 'string',
        description: '操作的字段'
      },
      metadata: {
        type: 'object',
        description: '元信息对象'
      },
      generatedValue: {
        description: '生成的值（generate操作）'
      }
    }
  }
}

