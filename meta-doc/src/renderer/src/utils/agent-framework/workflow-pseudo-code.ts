/**
 * 工作流伪代码生成器和解析器
 * 将工作流转换为轻量级的伪代码，支持双向转换
 */

import type { Workflow, ArtifactNode, ControlFlowNode, WorkflowEdge } from '../../../types/agent-framework'
import { createRendererLogger } from '../logger'

// 懒加载logger，避免初始化顺序问题
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('WorkflowPseudoCode')
  }
  return loggerInstance
}

/**
 * 伪代码语法示例：
 * 
 * workflow "工作流名称" {
 *   entry: node1
 *   exit: node2, node3
 * 
 *   node1: tool "工具ID" {
 *     label: "节点标签"
 *     position: (100, 200)
 *   }
 * 
 *   node2: condition {
 *     label: "条件判断"
 *     condition: "value > 0"
 *   }
 * 
 *   node1 -> node2 {
 *     label: "连接标签"
 *     condition: "value > 0"
 *   }
 * 
 *   if (node2.condition) {
 *     node2 -> node3
 *   } else {
 *     node2 -> node4
 *   }
 * 
 *   loop (node5) {
 *     condition: "i < 10"
 *     maxIterations: 100
 *   }
 * 
 *   parallel (node6, node7, node8) {
 *     // 并行执行
 *   }
 * 
 *   async node9 {
 *     // 异步执行
 *   }
 * 
 *   merge (node6, node7, node8) -> node10 {
 *     strategy: "all"
 *   }
 * 
 *   aggregate (node11, node12) -> node13 {
 *     strategy: "merge"
 *   }
 * }
 */

export interface PseudoCodeParseResult {
  workflow: Workflow | null
  errors: string[]
  warnings: string[]
}

/**
 * 将工作流转换为伪代码
 */
export function workflowToPseudoCode(workflow: Workflow): string {
  const lines: string[] = []
  
  // 工作流头部
  const workflowName = typeof workflow.name === 'string' 
    ? workflow.name 
    : workflow.name['zh_cn']?.name || workflow.name['en_us']?.name || 'Unnamed Workflow'
  
  lines.push(`workflow "${workflowName}" {`)
  lines.push(`  id: "${workflow.id}"`)
  
  // 入口和出口节点
  if (workflow.entryNodeId) {
    lines.push(`  entry: ${workflow.entryNodeId}`)
  }
  if (workflow.exitNodeIds && workflow.exitNodeIds.length > 0) {
    lines.push(`  exit: ${workflow.exitNodeIds.join(', ')}`)
  }
  
  lines.push('')
  
  // 变量定义
  if (workflow.variables && workflow.variables.length > 0) {
    lines.push('  // 工作流变量')
    workflow.variables.forEach(variable => {
      const defaultValue = variable.defaultValue !== undefined 
        ? ` = ${JSON.stringify(variable.defaultValue)}`
        : ''
      lines.push(`  var ${variable.name}: ${variable.type}${defaultValue}`)
    })
    lines.push('')
  }
  
  // 节点定义
  const allNodes = [...workflow.artifactNodes, ...workflow.controlFlowNodes]
  
  // 工件节点
  workflow.artifactNodes.forEach(node => {
    lines.push(`  ${node.id}: ${node.type} "${node.artifactId || ''}" {`)
    if (node.label) {
      lines.push(`    label: "${escapeString(node.label)}"`)
    }
    if (node.position) {
      lines.push(`    position: (${node.position.x}, ${node.position.y})`)
    }
    lines.push('  }')
    lines.push('')
  })
  
  // 控制流节点
  workflow.controlFlowNodes.forEach(node => {
    lines.push(`  ${node.id}: ${node.type} {`)
    if (node.label) {
      lines.push(`    label: "${escapeString(node.label)}"`)
    }
    if (node.position) {
      lines.push(`    position: (${node.position.x}, ${node.position.y})`)
    }
    
    // 根据类型添加特定配置
    if (node.type === 'condition' && node.config.condition) {
      lines.push(`    condition: "${escapeString(node.config.condition)}"`)
    } else if (node.type === 'loop') {
      if (node.config.loopCondition) {
        lines.push(`    condition: "${escapeString(node.config.loopCondition)}"`)
      }
      if (node.config.maxIterations) {
        lines.push(`    maxIterations: ${node.config.maxIterations}`)
      }
    } else if (node.type === 'parallel' && node.config.parallelCount) {
      lines.push(`    parallelCount: ${node.config.parallelCount}`)
    } else if (node.type === 'aggregate' && node.config.aggregateStrategy) {
      lines.push(`    strategy: "${node.config.aggregateStrategy}"`)
    }
    
    lines.push('  }')
    lines.push('')
  })
  
  // 边定义
  if (workflow.edges && workflow.edges.length > 0) {
    lines.push('  // 连接')
    workflow.edges.forEach(edge => {
      const conditions: string[] = []
      if (edge.label) {
        conditions.push(`label: "${escapeString(edge.label)}"`)
      }
      if (edge.condition) {
        conditions.push(`condition: "${escapeString(edge.condition)}"`)
      }
      if (edge.sourceField) {
        conditions.push(`sourceField: "${escapeString(edge.sourceField)}"`)
      }
      if (edge.targetField) {
        conditions.push(`targetField: "${escapeString(edge.targetField)}"`)
      }
      
      const conditionStr = conditions.length > 0 
        ? ` { ${conditions.join(', ')} }`
        : ''
      
      lines.push(`  ${edge.source} -> ${edge.target}${conditionStr}`)
    })
    lines.push('')
  }
  
  lines.push('}')
  
  return lines.join('\n')
}

/**
 * 将伪代码解析为工作流
 */
export function pseudoCodeToWorkflow(code: string): PseudoCodeParseResult {
  const errors: string[] = []
  const warnings: string[] = []
  
  try {
    // 简单的解析实现（可以使用更复杂的解析器，如 PEG.js）
    const workflow: Partial<Workflow> = {
      entityType: 'workflow',
      id: '',
      name: { 'zh_cn': { name: '新工作流' }, 'en_us': { name: 'New Workflow' } },
      description: { 'zh_cn': { description: '' }, 'en_us': { description: '' } },
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      artifactNodes: [],
      controlFlowNodes: [],
      edges: [],
      entryNodeId: '',
      exitNodeIds: [],
      enabled: true
    }
    
    // 解析工作流名称
    const workflowMatch = code.match(/workflow\s+"([^"]+)"/)
    if (workflowMatch) {
      const workflowName = workflowMatch[1]
      workflow.name = {
        'zh_cn': { name: workflowName },
        'en_us': { name: workflowName }
      }
    }
    
    // 解析ID
    const idMatch = code.match(/id:\s*"([^"]+)"/)
    if (idMatch) {
      workflow.id = idMatch[1]
    } else {
      workflow.id = `workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }
    
    // 解析入口节点
    const entryMatch = code.match(/entry:\s*(\w+)/)
    if (entryMatch) {
      workflow.entryNodeId = entryMatch[1]
    }
    
    // 解析出口节点
    const exitMatch = code.match(/exit:\s*([\w,\s]+)/)
    if (exitMatch) {
      workflow.exitNodeIds = exitMatch[1].split(',').map(s => s.trim())
    }
    
    // 解析节点
    const nodePattern = /(\w+):\s*(\w+)\s*(?:"([^"]+)")?\s*\{([^}]+)\}/g
    let nodeMatch
    while ((nodeMatch = nodePattern.exec(code)) !== null) {
      const nodeId = nodeMatch[1]
      const nodeType = nodeMatch[2]
      const artifactId = nodeMatch[3] || ''
      const nodeBody = nodeMatch[4]
      
      const labelMatch = nodeBody.match(/label:\s*"([^"]+)"/)
      const positionMatch = nodeBody.match(/position:\s*\((\d+),\s*(\d+)\)/)
      
      const label = labelMatch ? unescapeString(labelMatch[1]) : nodeType
      const position = positionMatch 
        ? { x: parseInt(positionMatch[1]), y: parseInt(positionMatch[2]) }
        : undefined
      
      // 判断是工件节点还是控制流节点
      const artifactTypes = ['tool', 'workflow', 'llm-decision', 'agent-config']
      if (artifactTypes.includes(nodeType)) {
        workflow.artifactNodes!.push({
          id: nodeId,
          type: nodeType as ArtifactNode['type'],
          artifactId: artifactId,
          label,
          position
        })
      } else {
        const config: any = {}
        
        // 解析条件
        const conditionMatch = nodeBody.match(/condition:\s*"([^"]+)"/)
        if (conditionMatch) {
          config.condition = unescapeString(conditionMatch[1])
        }
        
        // 解析循环配置
        const maxIterMatch = nodeBody.match(/maxIterations:\s*(\d+)/)
        if (maxIterMatch) {
          config.maxIterations = parseInt(maxIterMatch[1])
        }
        
        // 解析并行配置
        const parallelCountMatch = nodeBody.match(/parallelCount:\s*(\d+)/)
        if (parallelCountMatch) {
          config.parallelCount = parseInt(parallelCountMatch[1])
        }
        
        // 解析聚合策略
        const strategyMatch = nodeBody.match(/strategy:\s*"(\w+)"/)
        if (strategyMatch) {
          config.aggregateStrategy = strategyMatch[1]
        }
        
        workflow.controlFlowNodes!.push({
          id: nodeId,
          type: nodeType as ControlFlowNode['type'],
          label,
          position,
          config
        })
      }
    }
    
    // 解析边
    const edgePattern = /(\w+)\s*->\s*(\w+)(?:\s*\{([^}]+)\})?/g
    let edgeMatch
    while ((edgeMatch = edgePattern.exec(code)) !== null) {
      const source = edgeMatch[1]
      const target = edgeMatch[2]
      const edgeBody = edgeMatch[3] || ''
      
      const edgeId = `edge-${workflow.edges!.length + 1}`
      const edge: WorkflowEdge = {
        id: edgeId,
        source,
        target
      }
      
      const labelMatch = edgeBody.match(/label:\s*"([^"]+)"/)
      if (labelMatch) {
        edge.label = unescapeString(labelMatch[1])
      }
      
      const conditionMatch = edgeBody.match(/condition:\s*"([^"]+)"/)
      if (conditionMatch) {
        edge.condition = unescapeString(conditionMatch[1])
      }
      
      const sourceFieldMatch = edgeBody.match(/sourceField:\s*"([^"]+)"/)
      if (sourceFieldMatch) {
        edge.sourceField = unescapeString(sourceFieldMatch[1])
      }
      
      const targetFieldMatch = edgeBody.match(/targetField:\s*"([^"]+)"/)
      if (targetFieldMatch) {
        edge.targetField = unescapeString(targetFieldMatch[1])
      }
      
      workflow.edges!.push(edge)
    }
    
    return {
      workflow: workflow as Workflow,
      errors,
      warnings
    }
  } catch (error) {
    errors.push(`解析失败: ${error instanceof Error ? error.message : String(error)}`)
    return {
      workflow: null,
      errors,
      warnings
    }
  }
}

/**
 * 转义字符串中的特殊字符
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

/**
 * 反转义字符串
 */
function unescapeString(str: string): string {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

