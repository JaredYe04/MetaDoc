/**
 * 内置工作流定义
 * 这些工作流是MetaDoc提供的默认工作流，用户无法删除
 */

import type { Workflow } from '../../types/agent-framework'

/**
 * 文章扩写工作流
 * 使用大纲优化工具，在合适的地方添加子章节并生成内容
 */
export const builtinArticleExpansionWorkflow: Workflow = {
  entityType: 'workflow',
  id: 'builtin-article-expansion',
  name: {
    zh_cn: { name: '文章扩写' },
    en_us: { name: 'Article Expansion' }
  } as any,
  description: {
    zh_cn: { description: '调用大纲优化工具，在合适的地方添加子章节并生成内容。' },
    en_us: { description: 'Uses outline optimization to add sub-chapters and generate content.' }
  } as any,
  version: '1.0.0',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  isBuiltIn: true,
  entryNodeId: 'start-node',
  exitNodeIds: ['end-node'],
  artifactNodes: [
    {
      id: 'llm-decision-expand',
      type: 'llm-decision',
      artifactId: '',
      label: 'LLM决策扩写点',
      position: { x: 200, y: 150 },
      config: {
        prompt:
          '分析文章大纲，决定在哪个节点添加子章节或生成内容，并提供操作类型和节点路径。输出JSON格式：{ "operation": "generateChildren" | "generateContent" | "generateChildrenChildren" | "generateChildrenContent", "nodePath": "节点路径", "userPrompt": "用户提示词" }'
      }
    },
    {
      id: 'outline-optimize-node',
      type: 'tool',
      artifactId: 'outline-optimize',
      label: '大纲优化工具',
      position: { x: 400, y: 150 },
      inputs: [
        {
          name: 'operation',
          type: 'string',
          sourceType: 'upstream',
          sourceValue: '',
          upstreamNodeId: 'llm-decision-expand',
          upstreamField: 'operation'
        },
        {
          name: 'nodePath',
          type: 'string',
          sourceType: 'upstream',
          sourceValue: '',
          upstreamNodeId: 'llm-decision-expand',
          upstreamField: 'nodePath'
        },
        {
          name: 'userPrompt',
          type: 'string',
          sourceType: 'upstream',
          sourceValue: '',
          upstreamNodeId: 'llm-decision-expand',
          upstreamField: 'userPrompt'
        }
      ]
    }
  ],
  controlFlowNodes: [
    {
      id: 'start-node',
      type: 'start',
      label: '开始',
      position: { x: 80, y: 150 },
      config: {}
    },
    {
      id: 'end-node',
      type: 'end',
      label: '结束',
      position: { x: 600, y: 150 },
      config: {}
    }
  ],
  edges: [
    {
      id: 'e-start',
      source: 'start-node',
      target: 'llm-decision-expand'
    },
    {
      id: 'e1',
      source: 'llm-decision-expand',
      target: 'outline-optimize-node'
    },
    {
      id: 'e-end',
      source: 'outline-optimize-node',
      target: 'end-node'
    }
  ],
  variables: [],
  tags: ['builtin', 'expansion', 'outline']
}

/**
 * 智能绘图工作流
 * 读取文章，在合适的位置生成图表
 */
export const builtinSmartChartingWorkflow: Workflow = {
  entityType: 'workflow',
  id: 'builtin-smart-charting',
  name: {
    zh_cn: { name: '智能绘图' },
    en_us: { name: 'Smart Charting' }
  } as any,
  description: {
    zh_cn: { description: '阅读文章，在合适的位置使用图表生成工具生成图表，并插入到文档中。' },
    en_us: {
      description:
        'Reads the article and generates charts at appropriate positions using chart generation tool.'
    }
  } as any,
  version: '1.0.0',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  isBuiltIn: true,
  entryNodeId: 'start-node',
  exitNodeIds: ['end-node'],
  artifactNodes: [
    {
      id: 'llm-decision-chart',
      type: 'llm-decision',
      artifactId: '',
      label: 'LLM决策图表类型',
      position: { x: 200, y: 150 },
      config: {
        prompt:
          '阅读文章内容，决定在哪个位置插入图表，图表类型（mermaid/echarts/plantuml/flowchart/mindmap/graphviz），以及图表描述。输出JSON格式：{ "position": { "line": 10, "column": 1 }, "chartType": "mermaid", "prompt": "图表描述", "chartName": "图表名称", "format": "svg" 或 "pdf" }'
      }
    },
    {
      id: 'chart-generation-node',
      type: 'tool',
      artifactId: 'chart-generation',
      label: '图表生成工具',
      position: { x: 400, y: 100 },
      inputs: [
        {
          name: 'chartType',
          type: 'string',
          sourceType: 'upstream',
          sourceValue: '',
          upstreamNodeId: 'llm-decision-chart',
          upstreamField: 'chartType'
        },
        {
          name: 'prompt',
          type: 'string',
          sourceType: 'upstream',
          sourceValue: '',
          upstreamNodeId: 'llm-decision-chart',
          upstreamField: 'prompt'
        },
        {
          name: 'format',
          type: 'string',
          sourceType: 'upstream',
          sourceValue: '',
          upstreamNodeId: 'llm-decision-chart',
          upstreamField: 'format'
        },
        {
          name: 'chartName',
          type: 'string',
          sourceType: 'upstream',
          sourceValue: '',
          upstreamNodeId: 'llm-decision-chart',
          upstreamField: 'chartName'
        }
      ]
    },
    {
      id: 'edit-insert-chart',
      type: 'tool',
      artifactId: 'edit',
      label: '插入图表',
      position: { x: 600, y: 150 },
      inputs: [
        {
          name: 'operations',
          type: 'array',
          sourceType: 'upstream',
          sourceValue: '',
          upstreamNodeId: 'edit-prepare',
          upstreamField: 'operations'
        }
      ]
    },
    {
      id: 'edit-prepare',
      type: 'llm-decision',
      artifactId: '',
      label: '准备插入操作',
      position: { x: 500, y: 200 },
      config: {
        prompt:
          '根据图表生成结果和文档格式（Markdown或LaTeX），准备插入图表的编辑操作。对于Markdown，使用 ![alt](url) 格式；对于LaTeX，如果format是pdf，使用 \\includegraphics[width=0.8\\textwidth]{path} 格式，如果是svg，需要先转换为pdf。输出JSON格式：{ "operations": [{ "type": "insert", "range": { "start": { "line": 10, "column": 1 }, "end": { "line": 10, "column": 1 } }, "content": "插入内容" }] }'
      },
      inputs: [
        {
          name: 'chartResult',
          type: 'object',
          sourceType: 'upstream',
          sourceValue: '',
          upstreamNodeId: 'chart-generation-node',
          upstreamField: ''
        },
        {
          name: 'position',
          type: 'object',
          sourceType: 'upstream',
          sourceValue: '',
          upstreamNodeId: 'llm-decision-chart',
          upstreamField: 'position'
        },
        {
          name: 'documentFormat',
          type: 'string',
          sourceType: 'context',
          sourceValue: '',
          contextKey: 'documentFormat'
        }
      ]
    }
  ],
  controlFlowNodes: [
    {
      id: 'start-node',
      type: 'start',
      label: '开始',
      position: { x: 80, y: 150 },
      config: {}
    },
    {
      id: 'end-node',
      type: 'end',
      label: '结束',
      position: { x: 720, y: 150 },
      config: {}
    }
  ],
  edges: [
    {
      id: 'e-start',
      source: 'start-node',
      target: 'llm-decision-chart'
    },
    {
      id: 'e1',
      source: 'llm-decision-chart',
      target: 'chart-generation-node'
    },
    {
      id: 'e2',
      source: 'chart-generation-node',
      target: 'edit-prepare'
    },
    {
      id: 'e3',
      source: 'edit-prepare',
      target: 'edit-insert-chart'
    },
    {
      id: 'e-end',
      source: 'edit-insert-chart',
      target: 'end-node'
    }
  ],
  variables: [],
  tags: ['builtin', 'charting', 'visualization']
}

/**
 * 文章润色工作流
 * 读取文章，在合适的位置进行文本编辑
 */
export const builtinArticlePolishingWorkflow: Workflow = {
  entityType: 'workflow',
  id: 'builtin-article-polishing',
  name: {
    zh_cn: { name: '文章润色' },
    en_us: { name: 'Article Polishing' }
  } as any,
  description: {
    zh_cn: {
      description:
        '阅读文章，在合适的位置进行文本替换、插入、删除操作。可选择性地使用知识库检索增强润色效果。'
    },
    en_us: {
      description:
        'Reads the article and performs text replacement, insertion, and deletion at appropriate positions. Optionally uses knowledge base retrieval to enhance polishing.'
    }
  } as any,
  version: '1.0.0',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  isBuiltIn: true,
  entryNodeId: 'start-node',
  exitNodeIds: ['end-node'],
  artifactNodes: [
    {
      id: 'llm-decision-polish',
      type: 'llm-decision',
      artifactId: '',
      label: 'LLM决策润色策略',
      position: { x: 200, y: 150 },
      config: {
        prompt:
          '分析文章内容，决定润色策略：是否需要检索知识库，以及在哪些位置进行文本替换、插入或删除。输出JSON格式：{ "useRAG": true/false, "ragQuestion": "检索问题（如果useRAG为true）", "operations": [{ "type": "replace" | "insert" | "delete", "range": { "start": { "line": 10, "column": 1 }, "end": { "line": 10, "column": 20 } }, "content": "新内容（可选）" }] }'
      }
    },
    {
      id: 'rag-query',
      type: 'tool',
      artifactId: 'rag-retrieval',
      label: 'RAG知识库检索',
      position: { x: 400, y: 100 },
      inputs: [
        {
          name: 'question',
          type: 'string',
          sourceType: 'upstream',
          sourceValue: '',
          upstreamNodeId: 'llm-decision-polish',
          upstreamField: 'ragQuestion'
        },
        {
          name: 'scoreThreshold',
          type: 'number',
          sourceType: 'constant',
          sourceValue: 0.5
        }
      ]
    },
    {
      id: 'edit-document',
      type: 'tool',
      artifactId: 'edit',
      label: '编辑文档',
      position: { x: 600, y: 150 },
      inputs: [
        {
          name: 'operations',
          type: 'array',
          sourceType: 'upstream',
          sourceValue: '',
          upstreamNodeId: 'llm-decision-polish',
          upstreamField: 'operations'
        }
      ]
    }
  ],
  controlFlowNodes: [
    {
      id: 'start-node',
      type: 'start',
      label: '开始',
      position: { x: 80, y: 150 },
      config: {}
    },
    {
      id: 'condition-rag',
      type: 'condition',
      label: '是否使用RAG',
      position: { x: 300, y: 150 },
      config: {
        condition:
          '根据 useRAG 字段判断是否需要调用知识库检索，返回 {"result": true} 表示需要使用 RAG'
      }
    },
    {
      id: 'end-node',
      type: 'end',
      label: '结束',
      position: { x: 720, y: 150 },
      config: {}
    }
  ],
  edges: [
    {
      id: 'e-start',
      source: 'start-node',
      target: 'llm-decision-polish'
    },
    {
      id: 'e1',
      source: 'llm-decision-polish',
      target: 'condition-rag'
    },
    {
      id: 'e2',
      source: 'condition-rag',
      target: 'rag-query'
    },
    {
      id: 'e3',
      source: 'condition-rag',
      target: 'edit-document'
    },
    {
      id: 'e4',
      source: 'rag-query',
      target: 'edit-document'
    },
    {
      id: 'e-end',
      source: 'edit-document',
      target: 'end-node'
    }
  ],
  variables: [],
  tags: ['builtin', 'polishing', 'editing']
}

/**
 * 获取所有内置工作流
 */
export function getAllBuiltinWorkflows(): Workflow[] {
  return [
    builtinArticleExpansionWorkflow,
    builtinSmartChartingWorkflow,
    builtinArticlePolishingWorkflow
  ]
}
