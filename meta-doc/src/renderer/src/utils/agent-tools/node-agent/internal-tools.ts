/**
 * NodeAgent 内部工具
 * 用于读取和修改节点内容
 */

import type { DocumentOutlineNode } from '@/types'
import type { AgentToolConfig, ToolCallback } from '../../../types/agent-tool'
import type { AgentSession } from '../../../types/agent-framework'
import { createRendererLogger } from '../../logger'

const logger = createRendererLogger('NodeAgentInternalTools')

/**
 * 创建读取节点内容工具
 * @param getNodeContext 获取节点上下文的函数
 */
export function createReadNodeContentTool(
  getNodeContext: (session: AgentSession) => { nodePath: string; nodeContent: string } | null
): AgentToolConfig {
  return {
    id: 'read-node-content',
    name: {
      zh_cn: '读取节点内容',
      en_us: 'Read Node Content'
    },
    description: {
      zh_cn: '读取当前节点的内容',
      en_us: 'Read the content of the current node'
    },
    origin: 'internal',
    spec: {
      name: 'read-node-content',
      brief: 'Read the content of the current node being processed',
      fullSpec: `# Read Node Content Tool

## Description
Reads the current content of the node being processed by the NodeAgent.

## Parameters
None (automatically uses the current node context)

## Returns
The current content of the node as a string.

## Usage
This tool is automatically available when processing a node. Simply call it to read the current content.`
    },
    instruction: `
# 读取节点内容工具

## 功能
读取当前正在处理的节点的内容。

## 使用方法
直接调用此工具，无需参数。工具会自动使用当前节点的上下文。

## 返回
返回当前节点的文本内容（字符串）。

## 注意事项
- 此工具只能在NodeAgent处理节点时使用
- 返回的内容是节点当前的文本内容，不包括子节点
`,
    callback: async (params, signal, onUpdate) => {
      // 从session中获取节点信息
      const session = params._session as AgentSession | undefined
      if (!session) {
        return {
          status: 'failed',
          error: '缺少session信息'
        }
      }

      const nodeContext = getNodeContext(session)
      if (!nodeContext) {
        return {
          status: 'failed',
          error: '无法获取节点上下文'
        }
      }

      logger.debug(`读取节点内容: ${nodeContext.nodePath}`)

      return {
        status: 'succeeded',
        data: {
          nodePath: nodeContext.nodePath,
          content: nodeContext.nodeContent || ''
        },
        result: {
          nodePath: nodeContext.nodePath,
          content: nodeContext.nodeContent || ''
        }
      }
    },
    tags: ['node-agent', 'internal'],
    enabled: true,
    editable: false
  }
}

/**
 * 创建更新节点内容工具
 * @param updateNodeContent 更新节点内容的函数
 */
export function createUpdateNodeContentTool(
  updateNodeContent: (session: AgentSession, content: string) => Promise<{ nodePath: string; success: boolean }>
): AgentToolConfig {
  return {
    id: 'update-node-content',
    name: {
      zh_cn: '更新节点内容',
      en_us: 'Update Node Content'
    },
    description: {
      zh_cn: '更新当前节点的内容',
      en_us: 'Update the content of the current node'
    },
    origin: 'internal',
    spec: {
      name: 'update-node-content',
      brief: 'Update the content of the current node being processed',
      fullSpec: `# Update Node Content Tool

## Description
Updates the content of the current node being processed by the NodeAgent.

## Parameters
\`\`\`json
{
  "content": "string"  // Required: The new content for the node
}
\`\`\`

## Returns
The updated content and node path.

## Usage
Call this tool with the new content you want to set for the current node.

## Notes
- This tool only updates the text content (node.text), not the children
- The content should match the document format (Markdown or LaTeX)
- Do not include child node titles in the content
`,
      schema: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The new content for the current node'
          }
        },
        required: ['content']
      }
    },
    instruction: `
# 更新节点内容工具

## 功能
更新当前正在处理的节点的内容。

## 参数
\`\`\`json
{
  "content": "string"  // 必需：节点的新内容
}
\`\`\`

## 使用方法
调用此工具并传入新的内容。内容应该符合文档格式（Markdown或LaTeX）。

## 注意事项
- 此工具只更新节点的文本内容（node.text），不修改子节点
- 内容中不应包含子节点的标题
- 内容应该与文档格式匹配
- 如果节点是父节点，内容应该是概述、过渡或背景信息，而不是子节点的详细内容
`,
    callback: async (params, signal, onUpdate) => {
      const session = params._session as AgentSession | undefined
      if (!session) {
        return {
          status: 'failed',
          error: '缺少session信息'
        }
      }

      const content = params.content as string
      if (content === undefined) {
        return {
          status: 'failed',
          error: '缺少内容参数'
        }
      }

      try {
        const result = await updateNodeContent(session, content)
        
        logger.debug(`更新节点内容: ${result.nodePath}`, { 
          contentLength: content.length,
          success: result.success
        })

        // 通知更新
        onUpdate({
          content: {
            stage: 'content-updated',
            nodePath: result.nodePath,
            contentLength: content.length
          },
          format: 'json'
        })

        return {
          status: result.success ? 'succeeded' : 'failed',
          data: {
            nodePath: result.nodePath,
            content
          },
          result: {
            nodePath: result.nodePath,
            content
          }
        }
      } catch (error) {
        logger.error('更新节点内容失败:', error)
        return {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error)
        }
      }
    },
    tags: ['node-agent', 'internal'],
    enabled: true,
    editable: false
  }
}

