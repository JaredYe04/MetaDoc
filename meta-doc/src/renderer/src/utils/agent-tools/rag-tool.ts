/**
 * RAG检索Tool
 * 将RAG检索功能封装为Agent Tool
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress
} from '../../types/agent-tool'
import { queryKnowledgeBase } from '../rag_utils'
import { getSetting } from '../settings'
import RAGToolDisplay from './components/RAGToolDisplay.vue'
import { createDetailedError } from './tool-utils'

/**
 * RAG Tool回调函数
 */
const ragToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const question = params.question as string
  if (!question || typeof question !== 'string') {
    return {
      status: 'failed',
      error: createDetailedError(
        '缺少必需参数: question（要检索的问题或关键词）',
        [
          '{"question": "什么是机器学习？"}',
          '{"question": "API使用方法", "scoreThreshold": 0.7}',
          '{"question": "文档中的配置说明", "scoreThreshold": 0.5}'
        ],
        [
          'question参数是要在知识库中搜索的问题或关键词',
          '可以设置scoreThreshold参数（0-1）控制返回结果的相关性阈值',
          'scoreThreshold值越大，结果越精确但可能更少；值越小，结果越多但可能包含低相关性内容',
          '如果不设置scoreThreshold，将使用系统默认值（0.5）',
          '确保知识库功能已在设置中启用'
        ]
      )
    }
  }

  // 更新状态：开始检索
  onUpdate({
    content: {
      stage: 'searching',
      question,
      results: []
    },
    format: 'json'
  }, {
    percentage: 10,
    message: '正在检索知识库...'
  })

  try {
    // 检查是否启用知识库
    const enabledRag = await getSetting('enableKnowledgeBase')
    if (!enabledRag) {
      return {
        status: 'failed',
        error: createDetailedError(
          '知识库未启用，请在设置中启用知识库功能',
          [
            '使用前需要：1. 在设置中启用知识库功能 2. 上传文档到知识库',
            '启用后可以使用：{"question": "要检索的问题"}'
          ],
          [
            'RAG工具需要先启用知识库功能才能使用',
            '在设置中找到"启用知识库"选项并开启',
            '然后上传文档到知识库，即可使用RAG检索功能'
          ]
        )
      }
    }

    // 获取相似度阈值：优先使用参数传入的值，否则使用设置中的值
    let scoreThreshold: number
    if (params.scoreThreshold !== undefined && params.scoreThreshold !== null) {
      // 从参数中获取
      scoreThreshold = typeof params.scoreThreshold === 'number' 
        ? params.scoreThreshold 
        : parseFloat(String(params.scoreThreshold))
      
      // 验证阈值范围（0-1）
      if (isNaN(scoreThreshold) || scoreThreshold < 0 || scoreThreshold > 1) {
        return {
          status: 'failed',
          error: createDetailedError(
            '相似度阈值必须是0到1之间的数字',
            [
              '{"question": "问题", "scoreThreshold": 0.5}  // 正确：0.5在0-1之间',
              '{"question": "问题", "scoreThreshold": 0.7}  // 正确：0.7在0-1之间'
            ],
            [
              'scoreThreshold必须是0到1之间的数字',
              '推荐值：0.3-0.5（获取更多结果）或0.7-0.9（高精度结果）',
              '如果不设置，将使用系统默认值0.5'
            ]
          )
        }
      }
    } else {
      // 从设置中获取
      scoreThreshold = await getSetting('knowledgeBaseScoreThreshold') || 0.5
    }

    // 更新进度
    onUpdate({
      content: {
        stage: 'searching',
        question,
        scoreThreshold,
        results: []
      },
      format: 'json'
    }, {
      percentage: 30,
      message: '正在计算相似度...'
    })

    // 执行检索
    const results = await queryKnowledgeBase(question, scoreThreshold as number)

    // 检查是否被取消
    if (signal.aborted) {
      return {
        status: 'cancelled'
      }
    }

    // 更新进度和结果
    onUpdate({
      content: {
        stage: 'completed',
        question,
        scoreThreshold,
        results,
        resultCount: results.length
      },
      format: 'json',
      componentName: 'RAGToolDisplay'
    }, {
      percentage: 90,
      message: `找到 ${results.length} 条相关结果`
    })

    // 返回最终结果
    return {
      status: 'succeeded',
      data: {
        content: {
          stage: 'completed',
          question,
          results,
          resultCount: results.length
        },
        format: 'json',
        componentName: 'RAGToolDisplay'
      },
      result: results
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      status: 'failed',
      error: createDetailedError(
        `RAG检索失败: ${errorMessage}`,
        [
          '{"question": "要检索的问题"}',
          '确保知识库已启用并且有文档上传'
        ],
        [
          '检查知识库功能是否已启用',
          '确保知识库中已有上传的文档',
          '检查网络连接和知识库服务是否正常',
          '可以尝试降低scoreThreshold获取更多结果'
        ]
      )
    }
  }
}

/**
 * RAG Tool配置
 */
export const ragToolConfig: AgentToolConfig = {
  id: 'rag-retrieval',
  name: {
    'zh_cn': { name: 'RAG知识库检索' },
    'en_us': { name: 'RAG Knowledge Base Retrieval' },
    'de_DE': { name: 'RAG-Wissensdatenbank-Abruf' },
    'fr_FR': { name: 'Récupération de base de connaissances RAG' },
    'ja_JP': { name: 'RAG知識ベース検索' },
    'ko_KR': { name: 'RAG 지식 베이스 검색' }
  } as any,
  description: {
    'zh_cn': { description: '从知识库中检索与问题相关的文档片段，用于增强AI回答的准确性' },
    'en_us': { description: 'Retrieve relevant document chunks from the knowledge base to enhance AI response accuracy' },
    'de_DE': { description: 'Ruft relevante Dokumentfragmente aus der Wissensdatenbank ab, um die Genauigkeit der KI-Antworten zu verbessern' },
    'fr_FR': { description: 'Récupère des fragments de documents pertinents de la base de connaissances pour améliorer la précision des réponses IA' },
    'ja_JP': { description: '知識ベースから関連する文書チャンクを検索し、AI回答の精度を向上' },
    'ko_KR': { description: '지식 베이스에서 관련 문서 청크를 검색하여 AI 응답 정확도 향상' }
  } as any,
  origin: 'internal',
  instruction: `# RAG知识库检索工具

## 功能描述
从用户的知识库中检索与查询问题相关的文档片段。使用向量相似度搜索和关键词匹配的混合评分机制，返回最相关的内容。

## 使用场景
- 当用户的问题需要参考已上传的文档内容时
- 当需要基于知识库内容进行回答时
- 当需要查找特定文档中的信息时

## 输入参数
\`\`\`json
{
  "question": "string",  // 必需，要检索的问题或关键词
  "scoreThreshold": 0.5  // 可选，相似度阈值（0-1），用于过滤低相关性结果。如果不提供，将使用设置中的默认值
}
\`\`\`

**参数说明：**
- \`question\`: 必需参数，要检索的问题或关键词
- \`scoreThreshold\`: 可选参数，相似度阈值（0-1之间的数字）
  - 值越大，返回的结果相关性越高，但可能结果更少
  - 值越小，返回的结果更多，但可能包含相关性较低的内容
  - 如果不提供此参数，将使用设置中配置的默认阈值（默认0.5）

## 输出格式
返回JSON格式的检索结果数组，每个结果包含：
- \`text\`: 文档片段文本
- \`score\`: 相似度评分（0-1）
- \`metadata\`: 文档元数据（如果有）

## 注意事项
1. 需要先在知识库中上传文档
2. 需要在设置中启用知识库功能
3. 相似度阈值可以在调用时通过\`scoreThreshold\`参数指定，也可以在设置中配置默认值（默认0.5）
4. 如果检索结果为空，说明没有找到相关文档，应该告知用户
5. 检索结果应该与用户问题高度相关，如果相关性低，应该明确告知用户
6. 根据查询需求灵活调整\`scoreThreshold\`：
   - 需要高精度结果时，可以设置较高的阈值（如0.7-0.9）
   - 需要更多结果时，可以设置较低的阈值（如0.3-0.5）

## 与其他Tool的区别
- 这是唯一的知识库检索工具
- 主要用于文档内容检索，不涉及其他功能
- 如果用户问题不需要参考文档，不应该调用此工具`,
  callback: ragToolCallback,
  displayComponent: RAGToolDisplay,
  tags: ['rag', 'retrieval', 'knowledge-base', 'internal'],
  enabled: true,
  editable: false,
  locales: {
    'zh_cn': {
      name: 'RAG知识库检索',
      description: '从知识库中检索与问题相关的文档片段，用于增强AI回答的准确性'
    },
    'en_us': {
      name: 'RAG Knowledge Base Retrieval',
      description: 'Retrieve relevant document chunks from the knowledge base to enhance AI response accuracy'
    }
  }
}

