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
  onUpdate(
    {
      content: {
        stage: 'searching',
        question,
        results: []
      },
      format: 'json'
    },
    {
      percentage: 10,
      message: '正在检索知识库...'
    }
  )

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
      scoreThreshold =
        typeof params.scoreThreshold === 'number'
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
      scoreThreshold = (await getSetting('knowledgeBaseScoreThreshold')) || 0.5
    }

    // 更新进度
    onUpdate(
      {
        content: {
          stage: 'searching',
          question,
          scoreThreshold,
          results: []
        },
        format: 'json'
      },
      {
        percentage: 30,
        message: '正在计算相似度...'
      }
    )

    // 执行检索
    const results = await queryKnowledgeBase(question, scoreThreshold as number)

    // 检查是否被取消
    if (signal.aborted) {
      return {
        status: 'cancelled'
      }
    }

    // 更新进度和结果
    onUpdate(
      {
        content: {
          stage: 'completed',
          question,
          scoreThreshold,
          results,
          resultCount: results.length
        },
        format: 'json',
        componentName: 'RAGToolDisplay'
      },
      {
        percentage: 90,
        message: `找到 ${results.length} 条相关结果`
      }
    )

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
        ['{"question": "要检索的问题"}', '确保知识库已启用并且有文档上传'],
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

const RAG_TOOL_NAME = 'RAG Knowledge Base Retrieval'
const RAG_TOOL_DESCRIPTION =
  'Retrieve relevant document chunks from the knowledge base to enhance AI response accuracy'
const RAG_INSTRUCTION = `# RAG Knowledge Base Retrieval Tool

## Description
Retrieve relevant document chunks from the user's knowledge base based on query questions. Uses a hybrid scoring mechanism combining vector similarity search and keyword matching to return the most relevant content.

## Usage Scenarios
- When user questions need to reference uploaded document content
- When answers need to be based on knowledge base content
- When searching for information in specific documents

## Input Parameters
\`\`\`json
{
  "question": "string",  // Required, question or keyword to retrieve
  "scoreThreshold": 0.5  // Optional, similarity threshold (0-1) for filtering low-relevance results. If not provided, will use default value from settings
}
\`\`\`

**Parameter Description:**
- \`question\`: Required parameter, question or keyword to retrieve
- \`scoreThreshold\`: Optional parameter, similarity threshold (number between 0-1)
  - Higher values return more relevant results but may have fewer results
  - Lower values return more results but may include less relevant content
  - If not provided, will use default threshold configured in settings (default 0.5)

## Output Format
Returns JSON array of retrieval results, each containing:
- \`text\`: Document chunk text
- \`score\`: Similarity score (0-1)
- \`metadata\`: Document metadata (if available)

## Notes
1. Documents must be uploaded to the knowledge base first
2. Knowledge base feature must be enabled in settings
3. Similarity threshold can be specified via \`scoreThreshold\` parameter when calling, or configured as default value in settings (default 0.5)
4. If retrieval results are empty, it means no relevant documents were found, should inform the user
5. Retrieval results should be highly relevant to user questions, if relevance is low, should clearly inform the user
6. Flexibly adjust \`scoreThreshold\` based on query needs:
   - For high-precision results, set higher threshold (e.g., 0.7-0.9)
   - For more results, set lower threshold (e.g., 0.3-0.5)

## Differences from Other Tools
- This is the only knowledge base retrieval tool
- Mainly for document content retrieval, does not involve other functions
- Should not call this tool if user questions do not need to reference documents`

export const ragToolConfig: AgentToolConfig = {
  id: 'rag-retrieval',
  name: RAG_TOOL_NAME,
  description: RAG_TOOL_DESCRIPTION,
  origin: 'internal',
  spec: {
    name: 'rag-retrieval',
    brief:
      'Retrieve relevant document chunks from the knowledge base using vector similarity search and keyword matching.',
    fullSpec: `# RAG Knowledge Base Retrieval Tool

## Description
Retrieve relevant document chunks from the user's knowledge base based on query questions. Uses a hybrid scoring mechanism combining vector similarity search and keyword matching to return the most relevant content.

## Usage Scenarios
- When user questions need to reference uploaded document content
- When answers need to be based on knowledge base content
- When searching for information in specific documents

## Input Parameters
\`\`\`json
{
  "question": "string",  // Required, question or keyword to retrieve
  "scoreThreshold": 0.5  // Optional, similarity threshold (0-1) for filtering low-relevance results. If not provided, will use default value from settings
}
\`\`\`

**Parameter Description:**
- \`question\`: Required parameter, question or keyword to retrieve
- \`scoreThreshold\`: Optional parameter, similarity threshold (number between 0-1)
  - Higher values return more relevant results but may have fewer results
  - Lower values return more results but may include less relevant content
  - If not provided, will use default threshold configured in settings (default 0.5)

## Output Format
Returns JSON array of retrieval results, each containing:
- \`text\`: Document chunk text
- \`score\`: Similarity score (0-1)
- \`metadata\`: Document metadata (if available)

## Notes
1. Documents must be uploaded to the knowledge base first
2. Knowledge base feature must be enabled in settings
3. Similarity threshold can be specified via \`scoreThreshold\` parameter when calling, or configured as default value in settings (default 0.5)
4. If retrieval results are empty, it means no relevant documents were found, should inform the user
5. Retrieval results should be highly relevant to user questions, if relevance is low, should clearly inform the user
6. Flexibly adjust \`scoreThreshold\` based on query needs:
   - For high-precision results, set higher threshold (e.g., 0.7-0.9)
   - For more results, set lower threshold (e.g., 0.3-0.5)

## Differences from Other Tools
- This is the only knowledge base retrieval tool
- Mainly for document content retrieval, does not involve other functions
- Should not call this tool if user questions do not need to reference documents`
  },
  instruction: RAG_INSTRUCTION,
  callback: ragToolCallback,
  displayComponent: RAGToolDisplay,
  tags: ['rag', 'retrieval', 'knowledge-base', 'internal'],
  enabled: true,
  editable: false
}
