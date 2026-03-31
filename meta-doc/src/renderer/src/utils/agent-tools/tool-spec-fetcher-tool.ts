/**
 * Tool Spec Fetcher Tool
 * Allows AI to fetch the full specification of one or more tools
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress
} from '../../types/agent-tool'
import { agentToolManager } from '../agent-tool-manager'
import { agentConfigManager } from '../agent-framework/agent-config-manager'
import { createRendererLogger } from '../logger'
import { createDetailedError } from './tool-utils'

const logger = createRendererLogger('ToolSpecFetcherTool')

/**
 * Tool Spec Fetcher Tool回调函数
 */
const toolSpecFetcherCallback: ToolCallback = async (params, signal, onUpdate) => {
  // 支持单个 toolId 或 toolIds 数组
  let toolIds: string[] = []

  if (params.toolId) {
    // 单个工具ID
    toolIds = [params.toolId as string]
  } else if (params.toolIds && Array.isArray(params.toolIds)) {
    // 工具ID数组
    toolIds = params.toolIds as string[]
  } else {
    return {
      status: 'failed',
      error: createDetailedError(
        'Missing required parameter: toolId or toolIds',
        ['{"toolId": "edit"}', '{"toolIds": ["edit", "chart-generation"]}'],
        ['Use toolId for a single tool', 'Use toolIds (array) for multiple tools']
      )
    }
  }

  if (toolIds.length === 0) {
    return {
      status: 'failed',
      error: 'No tool IDs provided'
    }
  }

  // 更新状态：开始获取
  onUpdate(
    {
      content: {
        stage: 'fetching',
        toolIds,
        specs: []
      },
      format: 'json'
    },
    {
      percentage: 10,
      message: `Fetching specs for ${toolIds.length} tool(s)...`
    }
  )

  try {
    const specs: Array<{ toolId: string; name: string; fullSpec: string | null; error?: string }> =
      []

    for (const toolId of toolIds) {
      try {
        // 1) 尝试从普通工具获取
        let tool = agentToolManager.getTool(toolId)
        let fullSpec: string | null = null
        let toolName: string = toolId

        if (tool && tool.config.enabled) {
          const fallbackName =
            typeof tool.config.name === 'string'
              ? tool.config.name
              : ((tool.config.name as any)?.['en_us']?.name ?? toolId)
          toolName = agentToolManager.getLocalizedToolName(tool.config.id, fallbackName)

          if (tool.config.spec?.fullSpec) {
            fullSpec = tool.config.spec.fullSpec
          } else if (tool.config.instruction) {
            // 回退到instruction
            if (typeof tool.config.instruction === 'string') {
              fullSpec = tool.config.instruction
            } else {
              fullSpec =
                tool.config.instruction['zh_cn']?.instruction ||
                tool.config.instruction['en_us']?.instruction ||
                null
            }
          } else {
            fullSpec = null
          }
        } else {
          // 2) 未在 ToolManager 中找到时，检查是否为 Subagent（Agent 配置，非注册工具）
          const subagentConfig = agentConfigManager.getConfig(toolId)
          if (subagentConfig && (subagentConfig as { isSubagent?: boolean }).isSubagent) {
            toolName =
              typeof subagentConfig.name === 'string'
                ? subagentConfig.name
                : subagentConfig.name['zh_cn']?.name || subagentConfig.name['en_us']?.name || toolId
            const desc =
              typeof subagentConfig.description === 'string'
                ? subagentConfig.description
                : subagentConfig.description['zh_cn']?.description ||
                  subagentConfig.description['en_us']?.description ||
                  ''
            fullSpec = `Subagent: ${toolName}\n\n${desc}\n\nParameters: { "prompt": "给此 Subagent 的指示或要完成的任务描述（必填）" }\n\n调用方式：通过系统提供的工具调用接口调用；同一条回复中可发起多个工具/Subagent 调用，系统会并发执行。`
          } else {
            specs.push({
              toolId,
              name: toolId,
              fullSpec: null,
              error: `Tool not found: ${toolId}`
            })
            continue
          }
        }

        specs.push({
          toolId,
          name: toolName,
          fullSpec
        })
      } catch (error) {
        logger.error(`Error fetching spec for tool ${toolId}:`, error)
        specs.push({
          toolId,
          name: toolId,
          fullSpec: null,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    // 更新状态：完成
    onUpdate(
      {
        content: {
          stage: 'completed',
          toolIds,
          specs
        },
        format: 'json'
      },
      {
        percentage: 100,
        message: `Fetched specs for ${specs.length} tool(s)`
      }
    )

    return {
      status: 'succeeded',
      result: {
        toolIds,
        specs
      }
    }
  } catch (error) {
    logger.error('Tool spec fetcher failed:', error)
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

const TOOL_SPEC_FETCHER_NAME = 'Tool Spec Fetcher'
const TOOL_SPEC_FETCHER_DESCRIPTION = 'Fetch the full specification (fullSpec) of one or more tools'

export const toolSpecFetcherToolConfig: AgentToolConfig = {
  id: 'tool-spec-fetcher',
  name: TOOL_SPEC_FETCHER_NAME,
  description: TOOL_SPEC_FETCHER_DESCRIPTION,
  origin: 'internal',
  spec: {
    name: 'tool-spec-fetcher',
    brief:
      'Fetch the full specification (fullSpec) of one or more tools. Use this when you need detailed information about how to use a specific tool.',
    fullSpec: `# Tool Spec Fetcher

## Description
Fetches the full specification (fullSpec) of one or more tools. This allows you to get detailed usage instructions for tools when needed, without having all tool specs in the context initially.

## Usage Scenarios
- When you need detailed information about how to use a specific tool
- When you want to check the exact parameters and usage of a tool before calling it
- When you need to understand multiple tools' specifications

## Input Format

### Single Tool
\`\`\`json
{
  "toolId": "edit"
}
\`\`\`

### Multiple Tools
\`\`\`json
{
  "toolIds": ["edit", "chart-generation", "data-analysis"]
}
\`\`\`

## Output Format
\`\`\`json
{
  "toolIds": ["edit", "chart-generation"],
  "specs": [
    {
      "toolId": "edit",
      "name": "Document Editing Tool",
      "fullSpec": "# Document Editing Tool\\n\\n## Description\\n..."
    },
    {
      "toolId": "chart-generation",
      "name": "Chart Generation Tool",
      "fullSpec": "# Chart Generation Tool\\n\\n## Description\\n..."
    }
  ]
}
\`\`\`

## Important Notes
1. Use \`toolId\` for a single tool, or \`toolIds\` (array) for multiple tools
2. If a tool is not found, it will be included in the results with an error message
3. If a tool doesn't have a fullSpec, the fullSpec field will be null
4. This tool is useful when you need detailed tool information that isn't in the brief descriptions`
  },
  instruction: `# Tool Spec Fetcher

## Description
Fetches the full specification (fullSpec) of one or more tools. This allows you to get detailed usage instructions for tools when needed, without having all tool specs in the context initially.

## Usage Scenarios
- When you need detailed information about how to use a specific tool
- When you want to check the exact parameters and usage of a tool before calling it
- When you need to understand multiple tools' specifications

## Input Format

### Single Tool
\`\`\`json
{
  "toolId": "edit"
}
\`\`\`

### Multiple Tools
\`\`\`json
{
  "toolIds": ["edit", "chart-generation", "data-analysis"]
}
\`\`\`

## Output Format
\`\`\`json
{
  "toolIds": ["edit", "chart-generation"],
  "specs": [
    {
      "toolId": "edit",
      "name": "Document Editing Tool",
      "fullSpec": "# Document Editing Tool\\n\\n## Description\\n..."
    },
    {
      "toolId": "chart-generation",
      "name": "Chart Generation Tool",
      "fullSpec": "# Chart Generation Tool\\n\\n## Description\\n..."
    }
  ]
}
\`\`\`

## Important Notes
1. Use \`toolId\` for a single tool, or \`toolIds\` (array) for multiple tools
2. If a tool is not found, it will be included in the results with an error message
3. If a tool doesn't have a fullSpec, the fullSpec field will be null
4. This tool is useful when you need detailed tool information that isn't in the brief descriptions`,
  callback: toolSpecFetcherCallback,
  tags: ['meta', 'tool', 'spec'],
  enabled: true,
  editable: false,
  inputSchema: {
    type: 'object',
    properties: {
      toolId: {
        type: 'string',
        description: 'Single tool ID to fetch spec for (use this OR toolIds, not both)'
      },
      toolIds: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'Array of tool IDs to fetch specs for (use this OR toolId, not both)'
      }
    }
    // 不使用 oneOf：部分 OpenAI 兼容网关禁止工具 schema 顶层出现 oneOf
  },
  outputSchema: {
    type: 'object',
    properties: {
      toolIds: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'List of tool IDs that were requested'
      },
      specs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            toolId: {
              type: 'string',
              description: 'Tool ID'
            },
            name: {
              type: 'string',
              description: 'Tool name'
            },
            fullSpec: {
              type: 'string',
              nullable: true,
              description: 'Full specification of the tool, or null if not available'
            },
            error: {
              type: 'string',
              description: 'Error message if tool was not found or spec could not be fetched'
            }
          }
        },
        description: 'List of tool specifications'
      }
    }
  }
}
